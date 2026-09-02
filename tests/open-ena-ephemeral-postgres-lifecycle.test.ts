import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

type CommandError = Error & { status?: number };

function commandError(status: number) {
  return Object.assign(new Error(`synthetic command failure ${status}`), { status });
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function waitForExit(child: ChildProcess) {
  const deadline = Date.now() + 3_000;
  while (child.pid && processAlive(child.pid) && Date.now() < deadline) await delay(20);
  assert.equal(child.pid ? processAlive(child.pid) : false, false, "owned placeholder process did not exit");
}

async function createFixture({ ownsDataDirectory = true } = {}) {
  const rootDirectory = mkdtempSync(join(tmpdir(), "oe3dpg-test-"));
  const dataDirectory = join(rootDirectory, "data");
  mkdirSync(dataDirectory);
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)", ownsDataDirectory ? dataDirectory : "not-the-owned-data-directory"],
    { stdio: "ignore" },
  );
  assert.ok(child.pid);
  writeFileSync(join(dataDirectory, "postmaster.pid"), `${child.pid}\n`, "utf8");
  await delay(30);
  assert.equal(processAlive(child.pid), true);
  return { rootDirectory, dataDirectory, child };
}

function lifecycleRunner(child: ChildProcess, { failStop = false } = {}) {
  return (command: string, args: readonly string[], options: Record<string, unknown>) => {
    if (command === "ps") return execFileSync(command, [...args], options);
    assert.equal(command, "pg_ctl");
    if (args.includes("status")) {
      if (child.pid && processAlive(child.pid)) return "";
      throw commandError(3);
    }
    if (args.includes("stop")) {
      if (failStop) throw commandError(1);
      if (child.pid && processAlive(child.pid)) process.kill(child.pid, "SIGTERM");
      return "";
    }
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
}

async function loadLifecycle() {
  return import("./support/owned-ephemeral-postgres.mjs");
}

test("partial PostgreSQL startup is discovered, stopped, verified, and then removed", async () => {
  const fixture = await createFixture();
  try {
    const { cleanupOwnedEphemeralPostgres } = await loadLifecycle();
    const result = await cleanupOwnedEphemeralPostgres({
      rootDirectory: fixture.rootDirectory,
      dataDirectory: fixture.dataDirectory,
      rootPrefix: "oe3dpg-test-",
      startAttempted: true,
      runCommand: lifecycleRunner(fixture.child),
      pollIntervalMs: 10,
      shutdownTimeoutMs: 1_000,
    });
    await waitForExit(fixture.child);
    assert.equal(result.forcedTermination, false);
    assert.equal(existsSync(fixture.rootDirectory), false);
  } finally {
    if (fixture.child.pid && processAlive(fixture.child.pid)) process.kill(fixture.child.pid, "SIGKILL");
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("failed pg_ctl stop terminates only the exact owned postmaster before removal", async () => {
  const fixture = await createFixture();
  try {
    const { cleanupOwnedEphemeralPostgres } = await loadLifecycle();
    const result = await cleanupOwnedEphemeralPostgres({
      rootDirectory: fixture.rootDirectory,
      dataDirectory: fixture.dataDirectory,
      rootPrefix: "oe3dpg-test-",
      startAttempted: true,
      runCommand: lifecycleRunner(fixture.child, { failStop: true }),
      pollIntervalMs: 10,
      shutdownTimeoutMs: 1_000,
    });
    await waitForExit(fixture.child);
    assert.equal(result.forcedTermination, true);
    assert.equal(existsSync(fixture.rootDirectory), false);
  } finally {
    if (fixture.child.pid && processAlive(fixture.child.pid)) process.kill(fixture.child.pid, "SIGKILL");
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test("an unowned live PID is never killed and preserves a redacted recovery directory", async () => {
  const fixture = await createFixture({ ownsDataDirectory: false });
  try {
    const { cleanupOwnedEphemeralPostgres } = await loadLifecycle();
    await assert.rejects(
      cleanupOwnedEphemeralPostgres({
        rootDirectory: fixture.rootDirectory,
        dataDirectory: fixture.dataDirectory,
        rootPrefix: "oe3dpg-test-",
        startAttempted: true,
        runCommand: lifecycleRunner(fixture.child),
        pollIntervalMs: 10,
        shutdownTimeoutMs: 100,
      }),
      (error: CommandError) => {
        assert.match(error.message, /preserved for recovery/u);
        assert.match(error.message, new RegExp(`<tmpdir>/${basename(fixture.rootDirectory)}`));
        assert.equal(error.message.includes(fixture.rootDirectory), false);
        return true;
      },
    );
    assert.equal(processAlive(fixture.child.pid!), true);
    assert.equal(existsSync(fixture.rootDirectory), true);
  } finally {
    if (fixture.child.pid && processAlive(fixture.child.pid)) process.kill(fixture.child.pid, "SIGKILL");
    await waitForExit(fixture.child);
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});
