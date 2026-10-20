import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createConnection } from "node:net";
import test from "node:test";

const root = resolve(".");
const artifactRoot = process.env.OPEN_ENA_LIFECYCLE_TEST_ARTIFACT_ROOT ?? tmpdir();
async function within<T>(promise: Promise<T>, milliseconds: number) { let timer: ReturnType<typeof setTimeout>; try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("fault probe exceeded bound")), milliseconds); })]); } finally { clearTimeout(timer!); } }
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, ms = 12000) { const end = Date.now() + ms; while (!predicate()) { assert.ok(Date.now() < end, "fault fixture readiness deadline"); await pause(25); } }
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function closed(port: number) { return new Promise<boolean>(resolve => { const socket = createConnection({ host: "127.0.0.1", port }); socket.once("error", () => resolve(true)); socket.once("connect", () => { socket.destroy(); resolve(false); }); }); }

for (const signal of ["SIGTERM", "SIGINT", "build-deadline"] as const) test(`actual smoke preserves receipt and reaps build descendants on ${signal}`, async () => {
  const dir = mkdtempSync(join(artifactRoot, "task37-q1-build-fault-")); mkdirSync(join(dir, "bin"));
  // The extensionless npm fixture must remain CommonJS even when TMPDIR
  // is nested inside this ES module repository.
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }));
  const pidFile = join(dir, "pids.json");
  // Publish readiness atomically: existence must imply complete PID JSON.
  writeFileSync(join(dir, "bin/npm"), `#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process'); if(process.argv[2]==='--version'){console.log('fault-fixture-only');}else{const child=cp.spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});child.once('message',()=>{const pending=process.env.FAULT_PIDS+'.tmp';fs.writeFileSync(pending,JSON.stringify([process.pid,child.pid]));fs.renameSync(pending,process.env.FAULT_PIDS);});setInterval(()=>{},1000);}`, { mode: 0o755 });
  const child = spawn(process.execPath, [join(root, "tests/open-ena-models-v3-browser-smoke.mjs")], { cwd: root, env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, FAULT_PIDS: pidFile, OPEN_ENA_MODELS_V3_ARTIFACT_ROOT: dir, ...(signal === "build-deadline" ? { OPEN_ENA_MODELS_V3_BUILD_TIMEOUT_MS: "500" } : {}) }, stdio: "ignore" });
  const exited = new Promise(resolve => child.once("exit", (code, sig) => resolve({ code, signal: sig })));
  let pids: number[] = [];
  try {
    await until(() => existsSync(pidFile)); pids = JSON.parse(readFileSync(pidFile, "utf8"));
    assert.match(execFileSync("ps", ["-p", String(pids[0]), "-o", "ppid="], { encoding: "utf8" }), new RegExp(String(child.pid)));
    if (signal === "SIGTERM" || signal === "SIGINT") child.kill(signal); const result: any = await within(exited, 15000);
    const outputDir = readdirSync(dir).find(name => name.startsWith("task37-models-v3-"))!;
    const receiptPath = join(dir, outputDir, "receipt.json"); assert.ok(existsSync(receiptPath), "interruption must preserve receipt");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")); assert.equal(receipt.status, "fail"); assert.match(receipt.failure, new RegExp(signal.endsWith("deadline") ? "deadline" : signal)); assert.equal(result.code, signal === "SIGTERM" ? 143 : signal === "SIGINT" ? 130 : 124);
    await until(() => pids.every(pid => !alive(pid)), 5000); assert.ok(receipt.cleanup.processes.some((entry: any) => entry.forced));
    assert.ok(existsSync(join(dir, outputDir, "build.log")));
    writeFileSync(join(dir, "probe-result.json"), JSON.stringify({ kind: "owned fault fixture, not served acceptance", signal, result, pids, noSurvivors: true, receiptPath }, null, 2));
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL"); }
});

// Overall time includes preparation, so expiry need not reach build readiness.
// Hold this owned npm fixture at --version to exercise that earlier boundary.
test("actual smoke preserves receipt and reaps preparation on overall-deadline", async () => {
  const dir = mkdtempSync(join(artifactRoot, "task37-q1-overall-fault-")); mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }));
  const marker = join(dir, "version-pid.json");
  const unexpected = join(dir, "unexpected-command.json");
  writeFileSync(join(dir, "bin/npm"), `#!${process.execPath}\nconst fs=require('node:fs'); if(process.argv[2]==='--version'){fs.writeFileSync(process.env.FAULT_VERSION_PID,JSON.stringify({pid:process.pid,phase:'npm-version'}));setInterval(()=>{},1000);}else{fs.writeFileSync(process.env.FAULT_UNEXPECTED_COMMAND,JSON.stringify(process.argv));process.exitCode=1;}`, { mode: 0o755 });
  const child = spawn(process.execPath, [join(root, "tests/open-ena-models-v3-browser-smoke.mjs")], { cwd: root, env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, FAULT_VERSION_PID: marker, FAULT_UNEXPECTED_COMMAND: unexpected, OPEN_ENA_MODELS_V3_ARTIFACT_ROOT: dir, OPEN_ENA_MODELS_V3_OVERALL_TIMEOUT_MS: "3000" }, stdio: "ignore" });
  const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  const sibling = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  let pids: number[] = [];
  try {
    // Do not wait for a preparation/build marker: the real deadline can fire
    // before the child executes JS. The receipt must still prove an owned OS
    // process started and was reaped; an empty lifecycle is not a passing case.
    const result: any = await within(exited, 15000);
    const outputDir = readdirSync(dir).find(name => name.startsWith("task37-models-v3-"))!;
    const receiptPath = join(dir, outputDir, "receipt.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(result.code, 124); assert.equal(receipt.status, "fail");
    assert.deepEqual(receipt.lifecycle.reason, { message: "Overall smoke deadline exceeded", exitCode: 124 });
    assert.equal(receipt.deadlines.overall, 3000);
    assert.deepEqual(receipt.lifecycle.processes.map((entry: any) => entry.name), ["npm-version"]);
    const owned = receipt.lifecycle.processes[0];
    assert.ok(Number.isSafeInteger(owned.pid) && owned.pid > 0);
    assert.equal(owned.parentPid, child.pid); assert.equal(owned.processGroupId, owned.pid);
    assert.equal(receipt.cleanup.processes.length, 1); assert.deepEqual(receipt.cleanup.errors, []);
    const cleanup = receipt.cleanup.processes[0];
    assert.equal(cleanup.name, owned.name); assert.equal(cleanup.pid, owned.pid); assert.equal(cleanup.processGroupId, owned.pid);
    assert.equal(cleanup.stopped, true);
    assert.ok(cleanup.membersBeforeSignals.some((entry: any) => entry.pid === owned.pid && entry.parentPid === child.pid && entry.processGroupId === owned.pid), "receipt must prove the owned preparation process started");
    pids = [...new Set<number>([owned.pid, ...cleanup.membersBeforeSignals.map((entry: any) => entry.pid)])];
    await until(() => pids.every(pid => !alive(pid)), 5000);
    const groups = execFileSync("ps", ["-axo", "pgid="], { encoding: "utf8" }).trim().split(/\s+/).map(Number);
    assert.equal(groups.includes(owned.processGroupId), false, "owned process group must be empty");
    assert.equal(alive(sibling.pid!), true, "unregistered sibling must remain untouched");
    if (existsSync(marker)) assert.deepEqual(JSON.parse(readFileSync(marker, "utf8")), { pid: owned.pid, phase: "npm-version" });
    assert.equal(existsSync(unexpected), false); assert.equal(existsSync(join(dir, outputDir, "build.log")), false);
    writeFileSync(join(dir, "probe-result.json"), JSON.stringify({ kind: "owned preparation fault fixture, not served acceptance", result, pids, noSurvivors: true, processGroupEmpty: true, siblingUntouched: true, versionMarkerWritten: existsSync(marker), receiptPath }, null, 2));
  } finally { sibling.kill("SIGTERM"); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL"); }
});

for (const mode of ["services-signal", "stage-deadline", "overall-deadline", "overall-preparation-deadline", "cleanup-failure"] as const) test(`owned lifecycle fixture: ${mode}`, async () => {
  const dir = mkdtempSync(join(artifactRoot, "task37-q1-services-fault-"));
  const child = spawn(process.execPath, [join(root, "tests/helpers/open-ena-models-v3-lifecycle-fault.mjs"), mode, dir], { stdio: "ignore" });
  const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  let pids: number[] = [];
  const sibling = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  const overall = mode === "overall-deadline" || mode === "overall-preparation-deadline";
  try {
    // Only the signal/stage/explicit-cleanup probes require both services ready.
    // Overall expiry may happen during either service's preparation instead.
    if (!overall) {
      await until(() => existsSync(join(dir, "ready.json")));
      pids = JSON.parse(readFileSync(join(dir, "ready.json"), "utf8")).pids;
    }
    if (mode === "services-signal") child.kill("SIGTERM");
    const exit: any = await within(exited, 15000);
    assert.notEqual(exit.code, 0); const receiptText = readFileSync(join(dir, "receipt.json"), "utf8"); const receipt = JSON.parse(receiptText);
    assert.equal(receipt.status, "fail"); assert.equal(receipt.idempotentCleanup, true);
    const registered = receipt.lifecycle.processes;
    assert.ok(registered.length > 0 && registered.length <= 2, "at least one owned service process must have started");
    assert.deepEqual(registered.map((entry: any) => entry.name), ["database-fixture", "server-fixture"].slice(0, registered.length));
    if (overall) {
      assert.equal(exit.code, 124);
      assert.deepEqual(receipt.lifecycle.reason, { message: "Overall smoke deadline exceeded", exitCode: 124 });
    } else assert.equal(registered.length, 2);
    assert.equal(receipt.cleanup.processes.length, registered.length);
    const ports: number[] = [];
    for (const entry of registered) {
      assert.ok(Number.isSafeInteger(entry.pid) && entry.pid > 0); assert.equal(entry.parentPid, child.pid); assert.equal(entry.processGroupId, entry.pid);
      const cleanup = receipt.cleanup.processes.find((value: any) => value.pid === entry.pid);
      assert.equal(cleanup?.name, entry.name); assert.equal(cleanup?.processGroupId, entry.processGroupId); assert.equal(cleanup?.stopped, true);
      assert.ok(cleanup.membersBeforeSignals.some((value: any) => value.pid === entry.pid && value.parentPid === child.pid), "receipt must record the started service before signaling");
      pids.push(entry.pid, ...cleanup.membersBeforeSignals.map((value: any) => value.pid));
      const servicePath = join(dir, `${entry.name}.json`);
      if (existsSync(servicePath)) {
        const service = JSON.parse(readFileSync(servicePath, "utf8")); pids.push(...service.pids); ports.push(service.port);
      } else assert.equal(overall, true, "other probes require both ready service markers");
    }
    if (mode === "overall-preparation-deadline") {
      assert.equal(registered.length, 1, "delayed preparation must expire before the second service starts");
      assert.equal(ports.length, 0); assert.equal(existsSync(join(dir, "ready.json")), false);
      for (const name of ["database-fixture", "server-fixture"]) assert.equal(existsSync(join(dir, `${name}.json`)), false, "delayed service must not reach readiness");
    }
    pids = [...new Set(pids)];
    assert.equal(alive(sibling.pid!), true, "unregistered sibling must remain untouched"); await until(() => pids.every(pid => !alive(pid)), 5000);
    const groups = execFileSync("ps", ["-axo", "pgid="], { encoding: "utf8" }).trim().split(/\s+/).map(Number);
    for (const entry of registered) assert.equal(groups.includes(entry.processGroupId), false, "every owned service group must be empty");
    for (const port of ports) assert.equal(await closed(port), true);
    assert.equal(receipt.secretRedacted, true);
    if (mode === "cleanup-failure") assert.deepEqual(receipt.cleanup.errors.map((entry: any) => entry.name).sort(), ["hanging-resource", "throwing-resource"], "only the two injected close failures are expected");
    else assert.deepEqual(receipt.cleanup.errors, []);
    writeFileSync(join(dir, "probe-result.json"), JSON.stringify({ kind: "owned TCP service fixtures, not real browser/database acceptance", mode, exit, pids, ports, registeredProcesses: registered.length, fullyReady: existsSync(join(dir, "ready.json")), noSurvivors: true, groupsEmpty: true, portsClosed: true, siblingUntouched: true }, null, 2));
  } finally { sibling.kill("SIGTERM"); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL"); }
});
