import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function commandExitStatus(error) {
  return error && typeof error === "object" && typeof error.status === "number"
    ? error.status
    : null;
}

function recoveryError(reason, rootDirectory) {
  return new Error(
    `${reason} Temporary PostgreSQL directory preserved for recovery at <tmpdir>/${basename(rootDirectory)}.`,
  );
}

function redactedFailureDetail(error, rootDirectory) {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.replaceAll(rootDirectory, `<tmpdir>/${basename(rootDirectory)}`);
}

function validateOwnedPaths(rootDirectory, dataDirectory, rootPrefix) {
  if (
    typeof rootDirectory !== "string"
    || dirname(rootDirectory) !== tmpdir()
    || !basename(rootDirectory).startsWith(rootPrefix)
  ) {
    throw new TypeError("Refusing to clean an unowned PostgreSQL temporary root.");
  }
  const relativeData = relative(rootDirectory, dataDirectory);
  if (
    resolve(dataDirectory) !== resolve(join(rootDirectory, "data"))
    || relativeData === ""
    || relativeData === ".."
    || relativeData.startsWith(`..${sep}`)
  ) {
    throw new TypeError("Refusing to clean an unowned PostgreSQL data directory.");
  }
}

function readPostmasterPid(dataDirectory) {
  const pidPath = join(dataDirectory, "postmaster.pid");
  if (!existsSync(pidPath)) return null;
  const firstLine = readFileSync(pidPath, "utf8").split(/\r?\n/u, 1)[0]?.trim() ?? "";
  if (!/^[1-9]\d*$/u.test(firstLine)) {
    throw new TypeError("The owned PostgreSQL postmaster.pid is invalid.");
  }
  const pid = Number(firstLine);
  if (!Number.isSafeInteger(pid)) {
    throw new TypeError("The owned PostgreSQL postmaster PID is outside the safe integer range.");
  }
  return pid;
}

function processIsAlive(pid, killProcess) {
  try {
    killProcess(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ESRCH") return false;
    throw error;
  }
}

function processOwnsDataDirectory(pid, dataDirectory, runCommand) {
  const command = String(runCommand(
    "ps",
    ["-p", String(pid), "-o", "command="],
    { encoding: "utf8", timeout: 5_000 },
  )).trim();
  return command.length > 0 && command.includes(dataDirectory);
}

function pgCtlReportsRunning(dataDirectory, runCommand) {
  try {
    runCommand(
      "pg_ctl",
      ["--pgdata", dataDirectory, "status"],
      { stdio: "ignore", timeout: 5_000 },
    );
    return true;
  } catch (error) {
    if (commandExitStatus(error) === 3) return false;
    throw error;
  }
}

async function waitForProcessExit(pid, killProcess, pollIntervalMs, shutdownTimeoutMs) {
  const deadline = Date.now() + shutdownTimeoutMs;
  while (processIsAlive(pid, killProcess) && Date.now() < deadline) {
    await delay(pollIntervalMs);
  }
  return !processIsAlive(pid, killProcess);
}

function signalOwnedProcess(pid, signal, dataDirectory, runCommand, killProcess, rootDirectory) {
  if (!processIsAlive(pid, killProcess)) return;
  if (!processOwnsDataDirectory(pid, dataDirectory, runCommand)) {
    throw recoveryError(
      `Refusing to send ${signal} because postmaster PID ${pid} is not bound to the owned data directory.`,
      rootDirectory,
    );
  }
  try {
    killProcess(pid, signal);
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ESRCH")) throw error;
  }
}

export async function cleanupOwnedEphemeralPostgres({
  rootDirectory,
  dataDirectory,
  rootPrefix,
  startAttempted,
  runCommand = execFileSync,
  killProcess = process.kill.bind(process),
  pollIntervalMs = 50,
  shutdownTimeoutMs = 5_000,
}) {
  validateOwnedPaths(rootDirectory, dataDirectory, rootPrefix);
  if (!existsSync(rootDirectory)) return { forcedTermination: false };
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new TypeError("PostgreSQL cleanup poll interval must be a positive integer.");
  }
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < pollIntervalMs) {
    throw new TypeError("PostgreSQL cleanup timeout must cover at least one poll interval.");
  }

  try {
    const pidPath = join(dataDirectory, "postmaster.pid");
    if (!startAttempted && !existsSync(pidPath)) {
      rmSync(rootDirectory, { recursive: true, force: true });
      return { forcedTermination: false };
    }

    let pid = null;
    let reportsRunning = false;
    // A timed-out pg_ctl start can return before postmaster.pid is visible.
    // Probe a few times before deciding there is no process to stop.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      pid = readPostmasterPid(dataDirectory);
      reportsRunning = pgCtlReportsRunning(dataDirectory, runCommand);
      if (pid !== null || reportsRunning) break;
      if (attempt < 3) await delay(pollIntervalMs);
    }

    if (reportsRunning && pid === null) {
      throw recoveryError(
        "PostgreSQL reports running but no exact owned postmaster PID is available.",
        rootDirectory,
      );
    }

    let alive = pid !== null && processIsAlive(pid, killProcess);
    if (alive && !processOwnsDataDirectory(pid, dataDirectory, runCommand)) {
      throw recoveryError(
        `Refusing to stop postmaster PID ${pid} because it is not bound to the owned data directory.`,
        rootDirectory,
      );
    }

    let forcedTermination = false;
    if (reportsRunning || alive) {
      try {
        runCommand(
          "pg_ctl",
          ["--pgdata", dataDirectory, "--wait", "--mode", "fast", "stop"],
          { stdio: "ignore", timeout: 60_000 },
        );
      } catch {
        // A verified exact postmaster PID is the bounded fallback below.
      }

      alive = pid !== null && processIsAlive(pid, killProcess);
      if (alive && !await waitForProcessExit(pid, killProcess, pollIntervalMs, shutdownTimeoutMs)) {
        forcedTermination = true;
        signalOwnedProcess(pid, "SIGTERM", dataDirectory, runCommand, killProcess, rootDirectory);
        if (!await waitForProcessExit(pid, killProcess, pollIntervalMs, shutdownTimeoutMs)) {
          signalOwnedProcess(pid, "SIGKILL", dataDirectory, runCommand, killProcess, rootDirectory);
          if (!await waitForProcessExit(pid, killProcess, pollIntervalMs, shutdownTimeoutMs)) {
            throw recoveryError(
              `The exact owned postmaster PID ${pid} remained alive after SIGKILL.`,
              rootDirectory,
            );
          }
        }
      }
    }

    if (pid !== null && processIsAlive(pid, killProcess)) {
      throw recoveryError(
        `The exact owned postmaster PID ${pid} is still alive after shutdown.`,
        rootDirectory,
      );
    }
    if (pgCtlReportsRunning(dataDirectory, runCommand)) {
      throw recoveryError("PostgreSQL still reports running after shutdown.", rootDirectory);
    }

    rmSync(rootDirectory, { recursive: true, force: true });
    return { forcedTermination };
  } catch (error) {
    if (error instanceof Error && error.message.includes("preserved for recovery")) throw error;
    throw recoveryError(
      `Could not safely confirm PostgreSQL shutdown: ${redactedFailureDetail(error, rootDirectory)}.`,
      rootDirectory,
    );
  }
}
