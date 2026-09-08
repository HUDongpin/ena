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

for (const signal of ["SIGTERM", "SIGINT", "build-deadline", "overall-deadline"] as const) test(`actual smoke preserves receipt and reaps build descendants on ${signal}`, async () => {
  const dir = mkdtempSync(join(artifactRoot, "task37-q1-build-fault-")); mkdirSync(join(dir, "bin"));
  const pidFile = join(dir, "pids.json");
  writeFileSync(join(dir, "bin/npm"), `#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process'); if(process.argv[2]==='--version'){console.log('fault-fixture-only');}else{const child=cp.spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});child.once('message',()=>fs.writeFileSync(process.env.FAULT_PIDS,JSON.stringify([process.pid,child.pid])));setInterval(()=>{},1000);}`, { mode: 0o755 });
  const child = spawn(process.execPath, [join(root, "tests/open-ena-models-v3-browser-smoke.mjs")], { cwd: root, env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, FAULT_PIDS: pidFile, OPEN_ENA_MODELS_V3_ARTIFACT_ROOT: dir, ...(signal === "build-deadline" ? { OPEN_ENA_MODELS_V3_BUILD_TIMEOUT_MS: "500" } : {}), ...(signal === "overall-deadline" ? { OPEN_ENA_MODELS_V3_OVERALL_TIMEOUT_MS: "3000" } : {}) }, stdio: "ignore" });
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

for (const mode of ["services-signal", "stage-deadline", "overall-deadline", "cleanup-failure"] as const) test(`owned lifecycle fixture: ${mode}`, async () => {
  const dir = mkdtempSync(join(artifactRoot, "task37-q1-services-fault-"));
  const child = spawn(process.execPath, [join(root, "tests/helpers/open-ena-models-v3-lifecycle-fault.mjs"), mode, dir], { stdio: "ignore" });
  const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  let pids: number[] = [];
  const sibling = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  try {
    await until(() => existsSync(join(dir, "ready.json"))); const ready = JSON.parse(readFileSync(join(dir, "ready.json"), "utf8")); pids = ready.pids;
    if (mode === "services-signal") child.kill("SIGTERM");
    const exit: any = await within(exited, 15000);
    assert.notEqual(exit.code, 0); const receiptText = readFileSync(join(dir, "receipt.json"), "utf8"); const receipt = JSON.parse(receiptText);
    assert.equal(receipt.status, "fail"); assert.equal(receipt.idempotentCleanup, true); assert.equal(alive(sibling.pid!), true, "unregistered sibling must remain untouched"); await until(() => pids.every(pid => !alive(pid)), 5000);
    for (const port of ready.ports) assert.equal(await closed(port), true);
    assert.equal(receipt.secretRedacted, true); assert.equal(receipt.cleanup.processes.length, 2); assert.ok(receipt.cleanup.processes.every((entry: any) => entry.stopped));
    if (mode === "cleanup-failure") assert.deepEqual(receipt.cleanup.errors.map((entry: any) => entry.name).sort(), ["hanging-resource", "throwing-resource"], "only the two injected close failures are expected");
    else assert.deepEqual(receipt.cleanup.errors, []);
    writeFileSync(join(dir, "probe-result.json"), JSON.stringify({ kind: "owned TCP service fixtures, not real browser/database acceptance", mode, exit, noSurvivors: true, portsClosed: true }, null, 2));
  } finally { sibling.kill("SIGTERM"); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL"); }
});
