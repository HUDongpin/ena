import { spawn, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function bounded(promise, milliseconds, label) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds); })]).finally(() => clearTimeout(timer));
}

/** One owner for the gate's processes, deadlines and independent cleanup steps. */
export class OwnedSmokeLifecycle {
    constructor({ directory, redact, onUpdate = () => {}, overallMs = 1200000, graceMs = 3000, forceMs = 3000, cleanupMs = 5000 }) {
        if (process.platform === "win32") throw new Error("This owned process-group gate requires POSIX process groups");
        this.directory = directory;
        this.redact = redact;
        this.onUpdate = onUpdate;
        this.graceMs = graceMs;
        this.forceMs = forceMs;
        this.cleanupMs = cleanupMs;
        this.controller = new AbortController();
        this.entries = [];
        this.resources = [];
        this.reason = null;
        this.cleaning = null;
        this.handlers = new Map(["SIGINT", "SIGTERM"].map(signal => [signal, () => this.cancel(`Interrupted by ${signal}`, signal === "SIGINT" ? 130 : 143)]));
        for (const [signal, handler] of this.handlers) process.on(signal, handler);
        this.overallTimer = setTimeout(() => this.cancel("Overall smoke deadline exceeded", 124), overallMs);
    }
    get signal() { return this.controller.signal; }
    cancel(message, exitCode = 1) {
        if (this.reason) return;
        this.reason = { message: this.redact(message), exitCode };
        this.controller.abort(new Error(this.reason.message));
        this.publish();
    }
    publish() {
        try { this.onUpdate(this.snapshot()); }
        catch (error) {
            (this.publicationErrors ??= []).push({ name: "lifecycle receipt", message: this.redact(error.message) });
            this.reason ??= { message: "Lifecycle receipt update failed", exitCode: 1 };
            if (!this.signal.aborted) this.controller.abort(new Error(this.reason.message));
        }
    }
    snapshot() {
        return { reason: this.reason, processes: this.entries.map(entry => ({ name: entry.name, pid: entry.child.pid, parentPid: process.pid, processGroupId: entry.child.pid, exitCode: entry.child.exitCode, signalCode: entry.child.signalCode, log: entry.logName, permissionProbes: entry.permissionProbes, ownership: "spawned detached direct child; dedicated POSIX process group" })) };
    }
    async stage(label, operation, milliseconds) {
        this.signal.throwIfAborted();
        let timer, onAbort;
        const interrupted = new Promise((_, reject) => {
            onAbort = () => reject(this.signal.reason);
            this.signal.addEventListener("abort", onAbort, { once: true });
            timer = setTimeout(() => this.cancel(`${label} deadline exceeded (${milliseconds}ms)`, 124), milliseconds);
        });
        try { return await Promise.race([Promise.resolve().then(() => { this.signal.throwIfAborted(); return operation(); }), interrupted]); }
        finally { clearTimeout(timer); this.signal.removeEventListener("abort", onAbort); }
    }
    spawnOwned(name, command, args, { cwd, env, logName = `${name}.log` } = {}) {
        this.signal.throwIfAborted();
        if (this.cleaning) throw new Error("Cannot start a process during cleanup");
        const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
        const entry = { name, child, logName, output: "", omitted: false, released: false, permissionProbes: [] };
        // Register before any awaited work or readiness checks.
        this.entries.push(entry);
        entry.exited = new Promise(resolve => { child.once("error", error => { entry.spawnError = error; resolve(); }); child.once("exit", resolve); });
        const collect = bytes => { if (entry.omitted) return; entry.output += bytes.toString(); if (entry.output.length > 4 * 1024 * 1024) { entry.output = "[output omitted after 4 MiB bound]\n"; entry.omitted = true; } };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        this.publish();
        return entry;
    }
    writeLog(entry) { writeFileSync(join(this.directory, entry.logName), this.redact(entry.output)); }
    async command(name, command, args, options, milliseconds) {
        const entry = this.spawnOwned(name, command, args, options);
        await this.stage(name, () => entry.exited, milliseconds);
        this.writeLog(entry);
        if (entry.spawnError) throw entry.spawnError;
        if (entry.child.exitCode !== 0) throw new Error(`${name} exited ${entry.child.exitCode ?? entry.child.signalCode}`);
        // A command can exit while leaving descendants in its dedicated group.
        // Release the group only once it is empty; otherwise cleanup still owns it.
        entry.released = !this.groupAlive(entry);
        return { command: [command, ...args], pid: entry.child.pid, parentPid: process.pid, exitCode: entry.child.exitCode, log: entry.logName };
    }
    addCleanup(name, action, milliseconds = this.cleanupMs) { this.resources.push({ name, action, milliseconds }); }
    groupMembers(entry) {
        return execFileSync("ps", ["-axo", "pid=,ppid=,pgid=,stat="], { encoding: "utf8", timeout: 2000 }).trim().split("\n")
            .map(line => line.trim().split(/\s+/)).filter(([, , pgid]) => Number(pgid) === entry.child.pid)
            .map(([pid, parentPid, processGroupId, state]) => ({ pid: Number(pid), parentPid: Number(parentPid), processGroupId: Number(processGroupId), state }));
    }
    permissionProbe(entry, operation) {
        const members = this.groupMembers(entry);
        entry.permissionProbes.push({ operation, at: new Date().toISOString(), members });
        return members.some(member => !member.state.startsWith("Z"));
    }
    groupAlive(entry) {
        if (!entry.child.pid || entry.released) return false;
        try { process.kill(-entry.child.pid, 0); return true; }
        catch (error) {
            if (error.code === "ESRCH") return false;
            // EPERM alone does not establish liveness after termination. Record
            // fresh group membership; a live denied group must still fail cleanup.
            if (error.code === "EPERM") return this.permissionProbe(entry, "liveness");
            throw error;
        }
    }
    async stopGroup(entry) {
        const record = { name: entry.name, pid: entry.child.pid, processGroupId: entry.child.pid, forced: false, stopped: false, permissionProbes: entry.permissionProbes };
        if (!this.groupAlive(entry)) { record.stopped = true; entry.released = true; return record; }
        // Detached spawn creates PGID=child PID. An extant leader must still be
        // our direct child in that group; never signal an identity that changed.
        if (entry.child.exitCode === null && entry.child.signalCode === null && !entry.spawnError) {
            let identity = [];
            try { identity = execFileSync("ps", ["-p", String(entry.child.pid), "-o", "ppid=,pgid="], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s+/).map(Number); }
            catch (error) { if (error.status !== 1) throw error; /* Leader exited; its continuously owned group can still contain descendants. */ }
            if (identity.length && (identity[0] !== process.pid || identity[1] !== entry.child.pid)) throw new Error(`Owned ${entry.name} process identity changed; refusing signal`);
        }
        record.membersBeforeSignals = this.groupMembers(entry);
        const signal = value => { try { process.kill(-entry.child.pid, value); } catch (error) {
            if (error.code === "ESRCH") return;
            if (error.code === "EPERM" && !this.permissionProbe(entry, value)) return;
            throw error;
        } };
        const drained = async timeout => { const end = Date.now() + timeout; while (this.groupAlive(entry) && Date.now() < end) await sleep(25); return !this.groupAlive(entry); };
        signal("SIGTERM");
        if (!await drained(this.graceMs)) { record.forced = true; signal("SIGKILL"); if (!await drained(this.forceMs)) throw new Error(`Owned ${entry.name} group survived force deadline`); }
        await bounded(entry.exited, this.forceMs, `${entry.name} child reap`);
        entry.released = true; record.stopped = true;
        return record;
    }
    cleanup() {
        if (this.cleaning) return this.cleaning;
        clearTimeout(this.overallTimer);
        this.cleaning = this.performCleanup();
        return this.cleaning;
    }
    async performCleanup() {
        const result = { resources: [], processes: [], errors: [...(this.publicationErrors ?? [])] };
        // A failed close cannot skip the remaining resources or owned processes.
        for (const resource of [...this.resources].reverse()) {
            try { await bounded(Promise.resolve().then(resource.action), resource.milliseconds, resource.name); result.resources.push({ name: resource.name, closed: true }); }
            catch (error) { result.errors.push({ name: resource.name, message: this.redact(error.message) }); }
        }
        for (const entry of [...this.entries].reverse()) {
            try { result.processes.push(await this.stopGroup(entry)); }
            catch (error) { result.processes.push({ name: entry.name, pid: entry.child.pid, processGroupId: entry.child.pid, stopped: false }); result.errors.push({ name: entry.name, message: this.redact(error.message) }); }
            try { this.writeLog(entry); } catch (error) { result.errors.push({ name: `${entry.name} log`, message: this.redact(error.message) }); }
        }
        return result;
    }
    dispose() { clearTimeout(this.overallTimer); for (const [signal, handler] of this.handlers) process.off(signal, handler); }
}

export function deadlineFromEnvironment(name, defaultMilliseconds) {
    const raw = process.env[name];
    if (raw === undefined) return defaultMilliseconds;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 50 || value > defaultMilliseconds) throw new Error(`${name} must be between 50 and ${defaultMilliseconds}ms`);
    return value;
}
