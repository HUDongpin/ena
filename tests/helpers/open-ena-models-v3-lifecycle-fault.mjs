// Labeled owned TCP fault fixtures only. Never used by the actual served journey.
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { OwnedSmokeLifecycle } from "./open-ena-models-v3-lifecycle.mjs";

if (process.argv[2] === "--service") {
    process.on("SIGTERM", () => {});
    const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    child.once("message", () => {
        const server = createServer(() => {});
        server.listen(0, "127.0.0.1", () => {
            writeFileSync(process.argv[3], JSON.stringify({ pids: [process.pid, child.pid], port: server.address().port }));
            process.stdout.write(process.env.FAULT_SECRET.slice(0, 7));
            setTimeout(() => process.stdout.write(process.env.FAULT_SECRET.slice(7) + "\n"), 20);
        });
    });
} else {
    const [mode, directory] = process.argv.slice(2);
    const secret = randomBytes(24).toString("hex");
    const redact = value => String(value).replaceAll(secret, "[redacted]");
    const receipt = { kind: "owned TCP fault fixtures, not served acceptance", status: "running" };
    const save = () => writeFileSync(join(directory, "receipt.json"), JSON.stringify(receipt, null, 2));
    const owner = new OwnedSmokeLifecycle({ directory, redact, overallMs: mode === "overall-deadline" ? 1200 : 10000, graceMs: 100, forceMs: 2000, cleanupMs: 100, onUpdate: state => { receipt.lifecycle = state; save(); } });
    try {
        for (const name of ["database-fixture", "server-fixture"]) {
            owner.spawnOwned(name, process.execPath, [fileURLToPath(import.meta.url), "--service", join(directory, `${name}.json`)], { env: { ...process.env, FAULT_SECRET: secret } });
            await owner.stage(`${name} readiness`, async () => { while (!existsSync(join(directory, `${name}.json`))) { owner.signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10)); } }, 3000);
        }
        const services = ["database-fixture", "server-fixture"].map(name => JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8")));
        writeFileSync(join(directory, "ready.json"), JSON.stringify({ pids: services.flatMap(value => value.pids), ports: services.map(value => value.port) }));
        if (mode === "cleanup-failure") {
            owner.addCleanup("throwing-resource", () => { throw new Error(`owned close failure ${secret}`); });
            owner.addCleanup("hanging-resource", () => new Promise(() => {}));
            throw new Error("Explicit cleanup failure fixture");
        }
        // The server accepts TCP but never responds: exercise a real hanging readiness request.
        await owner.stage("service readiness", () => fetch(`http://127.0.0.1:${services[1].port}`, { signal: owner.signal }), mode === "stage-deadline" ? 250 : 5000);
    } catch (error) { receipt.status = "fail"; receipt.failure = redact(error.message); process.exitCode = owner.reason?.exitCode ?? 1; }
    finally {
        const cleanup = owner.cleanup(); receipt.idempotentCleanup = cleanup === owner.cleanup(); receipt.cleanup = await cleanup;
        receipt.secretRedacted = !JSON.stringify(receipt).includes(secret) && ["database-fixture", "server-fixture"].every(name => !readFileSync(join(directory, `${name}.log`), "utf8").includes(secret));
        save(); owner.dispose();
    }
}
