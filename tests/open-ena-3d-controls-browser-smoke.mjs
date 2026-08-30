#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createSafePlaywrightCliError } from "./support/safe-playwright-cli-error.mjs";

const smokeSourcePath = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(smokeSourcePath), "..");
const tsconfigPath = join(projectRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const artifactDirectory = resolve(
  process.env.OPEN_ENA_3D_CONTROLS_SMOKE_ARTIFACT_DIR
    || join(projectRoot, "output", "playwright", "open-ena-3d-controls-smoke"),
);
const summaryPath = join(artifactDirectory, "summary.json");
const serverLogPath = join(artifactDirectory, "next-server.log");
const failureScreenshotPath = join(artifactDirectory, "failure.png");
const dataViewScreenshotPath = join(artifactDirectory, "data-view-desktop.png");
const comparisonFullscreenScreenshotPath = join(artifactDirectory, "fullscreen-comparison.png");
const primaryFullscreenScreenshotPath = join(artifactDirectory, "fullscreen-primary.png");
const secondaryFullscreenScreenshotPath = join(artifactDirectory, "fullscreen-secondary-fallback.png");
const mobileScreenshotPath = join(artifactDirectory, "mobile-390x844.png");
const ownedEvidencePaths = Object.freeze([
  summaryPath,
  failureScreenshotPath,
  serverLogPath,
  dataViewScreenshotPath,
  comparisonFullscreenScreenshotPath,
  primaryFullscreenScreenshotPath,
  secondaryFullscreenScreenshotPath,
  mobileScreenshotPath,
]);
const username = "open_ena_3d_controls_smoke_researcher";
const password = "open_ena_3d_controls_smoke_password_2026";
const sessionSecret = "open_ena_3d_controls_smoke_session_secret_0123456789abcdef";
const sessionName = "open-ena-3d-controls-smoke-" + process.pid;
const smokeBrowser = process.env.OPEN_ENA_3D_CONTROLS_SMOKE_BROWSER || "chromium";
const ownedDistDirName = ".next-3d-controls-smoke-" + process.pid;
const ownedDistDirectory = join(projectRoot, ownedDistDirName);
const fixtureContract = Object.freeze({
  modelType: "EndPoint",
  codes: ["CODE_A", "CODE_B", "CODE_C", "CODE_D", "CODE_E"],
  groups: ["SYNTHETIC_BASELINE", "SYNTHETIC_SCAFFOLDED"],
});

assert.ok(
  ["chromium", "chrome", "msedge"].includes(smokeBrowser),
  "OPEN_ENA_3D_CONTROLS_SMOKE_BROWSER must name chromium, chrome, or msedge.",
);
assert.ok(ownedDistDirName.startsWith(".next-3d-controls-smoke-"));

const bundledPlaywrightWrapper = join(
  homedir(),
  ".codex",
  "skills",
  "playwright",
  "scripts",
  "playwright_cli.sh",
);
const playwrightCli = existsSync(bundledPlaywrightWrapper)
  ? { command: bundledPlaywrightWrapper, prefix: [], source: "bundled skill wrapper" }
  : {
      command: "npx",
      prefix: ["--yes", "--package", "@playwright/cli@0.1.18", "playwright-cli"],
      source: "pinned npx fallback",
    };

mkdirSync(artifactDirectory, { recursive: true });

function removeOwnedEvidenceFiles() {
  const allowedNames = new Set([
    "summary.json",
    "failure.png",
    "next-server.log",
    "data-view-desktop.png",
    "fullscreen-comparison.png",
    "fullscreen-primary.png",
    "fullscreen-secondary-fallback.png",
    "mobile-390x844.png",
  ]);
  for (const evidencePath of ownedEvidencePaths) {
    assert.equal(dirname(evidencePath), artifactDirectory);
    assert.equal(allowedNames.has(basename(evidencePath)), true);
    rmSync(evidencePath, { force: true });
  }
}

removeOwnedEvidenceFiles();

function redact(value) {
  return String(value ?? "")
    .replaceAll(username, "[redacted-username]")
    .replaceAll(password, "[redacted-password]")
    .replaceAll(sessionSecret, "[redacted-session-secret]");
}

function classifyChromiumAngleReadPixelsDiagnostic(input) {
  if (!input || typeof input !== "object") return null;
  const { browser, currentHref, currentOrigin, warning } = input;
  if (!["chromium", "chrome", "msedge"].includes(browser)) return null;
  if (!warning || typeof warning !== "object" || typeof warning.text !== "string") return null;
  if (typeof currentOrigin !== "string" || typeof currentHref !== "string") return null;
  if (!currentHref.startsWith(currentOrigin + "/")) return null;
  const match = warning.text.match(/^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels( \(this message will no longer repeat\))?$/u);
  if (!match) return null;
  const sourceUrl = typeof warning.location?.url === "string" ? warning.location.url : "";
  if (sourceUrl !== currentHref) return null;
  if (warning.location?.lineNumber !== 0 || warning.location?.columnNumber !== 0) return null;
  return {
    normalizedPattern: "[.WebGL-0x<hex>]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels{optional-repeat-suppression}",
    repeatSuppression: Boolean(match[1]),
    sourcePath: sourceUrl.slice(currentOrigin.length),
    reportedLineNumber: warning.location.lineNumber,
    reportedColumnNumber: warning.location.columnNumber,
  };
}

let playwrightWorkingDirectory = null;

function ensurePlaywrightWorkingDirectory() {
  if (!playwrightWorkingDirectory) {
    playwrightWorkingDirectory = mkdtempSync(join(tmpdir(), "open-ena-3d-controls-playwright-"));
  }
  return playwrightWorkingDirectory;
}

function removePlaywrightWorkingDirectory() {
  if (!playwrightWorkingDirectory) return;
  assert.equal(dirname(playwrightWorkingDirectory), tmpdir());
  assert.equal(basename(playwrightWorkingDirectory).startsWith("open-ena-3d-controls-playwright-"), true);
  rmSync(playwrightWorkingDirectory, { recursive: true, force: true });
  playwrightWorkingDirectory = null;
}

function runCli(args, label, timeout = 120_000) {
  try {
    return execFileSync(
      playwrightCli.command,
      [...playwrightCli.prefix, "--session", sessionName, ...args],
      {
        cwd: ensurePlaywrightWorkingDirectory(),
        encoding: "utf8",
        env: process.env,
        maxBuffer: 32 * 1024 * 1024,
        timeout,
      },
    );
  } catch (caught) {
    throw createSafePlaywrightCliError({ caught, label, redact });
  }
}

function browserSource(task, args, helpers = []) {
  const helperDeclarations = helpers.map((helper) => helper.toString()).join("\n");
  return "async (page) => { " + helperDeclarations + "; const task = " + task.toString()
    + "; return await task(page, " + JSON.stringify(args) + "); }";
}

function runBrowserPhase(label, task, args = {}, timeout = 180_000, helpers = []) {
  process.stdout.write("[3D controls smoke] " + label + " ... ");
  const output = runCli(
    ["--raw", "run-code", browserSource(task, args, helpers)],
    label,
    timeout,
  ).trim();
  const result = output ? JSON.parse(output) : null;
  process.stdout.write("PASS\n");
  return result;
}

async function findOpenPort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port === null) reject(new Error("Could not allocate a loopback port."));
        else resolvePort(port);
      });
    });
  });
}

async function waitForServer(url, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch (caught) {
      lastError = caught;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Open ENA did not become ready at " + url + ".", { cause: lastError });
}

function readServerLogTail() {
  if (!existsSync(serverLogPath)) return "";
  return redact(readFileSync(serverLogPath, "utf8")).slice(-12_000);
}

function sanitizeFinalServerLog() {
  assert.equal(dirname(serverLogPath), artifactDirectory);
  if (!existsSync(serverLogPath)) return false;
  const sanitizedBytes = redact(readFileSync(serverLogPath, "utf8"));
  writeFileSync(serverLogPath, sanitizedBytes, "utf8");
  const finalBytes = readFileSync(serverLogPath, "utf8");
  assert.equal(finalBytes.includes(username), false);
  assert.equal(finalBytes.includes(password), false);
  assert.equal(finalBytes.includes(sessionSecret), false);
  return true;
}

function removeUnsafeServerLog() {
  assert.equal(dirname(serverLogPath), artifactDirectory);
  rmSync(serverLogPath, { force: true });
}

async function stopOwnedServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const waitForExit = (timeout) => new Promise((resolveExit) => {
    if (server.exitCode !== null || server.signalCode !== null) {
      resolveExit(true);
      return;
    }
    const timer = setTimeout(() => {
      server.off("exit", onExit);
      resolveExit(false);
    }, timeout);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    server.once("exit", onExit);
  });
  const signalServer = (signal) => {
    try {
      if (process.platform === "win32") return server.kill(signal);
      process.kill(-server.pid, signal);
      return true;
    } catch {
      return server.kill(signal);
    }
  };
  signalServer("SIGTERM");
  if (await waitForExit(5_000)) return;
  signalServer("SIGKILL");
  if (!await waitForExit(5_000)) {
    throw new Error("The smoke-owned Next.js server did not exit after SIGKILL.");
  }
}

function removeOwnedDistDirectory() {
  assert.equal(dirname(ownedDistDirectory), projectRoot);
  assert.ok(basename(ownedDistDirectory).startsWith(".next-3d-controls-smoke-"));
  if (existsSync(ownedDistDirectory)) rmSync(ownedDistDirectory, { recursive: true, force: true });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactEvidence(path) {
  const absolutePath = resolve(path);
  const relativePath = relative(artifactDirectory, absolutePath);
  assert.ok(
    relativePath.length > 0
      && relativePath !== ".."
      && !relativePath.startsWith(".." + sep)
      && !isAbsolute(relativePath),
    "evidence file must be contained by the artifact directory",
  );
  assert.ok(existsSync(absolutePath), "evidence file is missing: " + basename(absolutePath));
  return {
    file: relativePath.split(sep).join("/"),
    bytes: statSync(absolutePath).size,
    sha256: sha256(readFileSync(absolutePath)),
  };
}

function assertArtifactInventoryBeforeSummary() {
  const expectedFiles = [
    "data-view-desktop.png",
    "fullscreen-comparison.png",
    "fullscreen-primary.png",
    "fullscreen-secondary-fallback.png",
    "mobile-390x844.png",
    "next-server.log",
  ].sort();
  const actualFiles = readdirSync(artifactDirectory, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actualFiles, expectedFiles, "artifact directory contains an unknown or missing pre-summary entry");
  return {
    beforeSummaryFiles: actualFiles,
    finalExpectedFiles: [...expectedFiles, "summary.json"].sort(),
  };
}

function readGitEvidence() {
  const git = (args) => execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  return Object.freeze({
    gitHead: git(["rev-parse", "HEAD"]),
    gitTree: git(["rev-parse", "HEAD^{tree}"]),
    clean: status === "",
  });
}

const sourceEvidenceBefore = readGitEvidence();
assert.equal(sourceEvidenceBefore.clean, true, "3D controls browser evidence requires a clean source worktree");
const smokeSourceSha256 = sha256(readFileSync(smokeSourcePath));

function buildEndpointFixtureCsv() {
  const patterns = [
    [1, 1, 0, 0, 0],
    [1, 0, 1, 0, 0],
    [1, 0, 0, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 1, 0, 0, 1],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 0, 1],
    [0, 0, 0, 1, 1],
  ];
  const rows = ["Group,Name,Conversation,CODE_A,CODE_B,CODE_C,CODE_D,CODE_E"];
  for (const [groupIndex, group] of fixtureContract.groups.entries()) {
    for (let unitIndex = 0; unitIndex < 8; unitIndex += 1) {
      for (let utteranceIndex = 0; utteranceIndex < 3; utteranceIndex += 1) {
        const pattern = patterns[(unitIndex * 3 + utteranceIndex + groupIndex * 4) % patterns.length];
        rows.push([
          group,
          "SYNTHETIC_UNIT_" + (unitIndex + 1),
          "SYNTHETIC_CONVERSATION_" + (unitIndex + 1),
          ...pattern,
        ].join(","));
      }
    }
  }
  return rows.join("\n") + "\n";
}

function classifyBrowserMessages(phaseMessages, context) {
  const consoleErrors = phaseMessages.flatMap((phase) => phase.consoleErrors ?? []);
  const pageErrors = phaseMessages.flatMap((phase) => phase.pageErrors ?? []);
  const warnings = phaseMessages.flatMap((phase) => phase.consoleWarnings ?? []);
  const canvasPattern = /^Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true\. See: https:\/\/html\.spec\.whatwg\.org\/multipage\/canvas\.html#concept-canvas-will-read-frequently$/u;
  const chunkPathPattern = /^\/_next\/static\/(?:chunks\/[a-z0-9]{2,}-[a-z0-9]{3,}-[a-z0-9]{3,}|immutable\/chunks\/[a-z0-9]{8,})\.js$/u;
  const platformDiagnostics = { canvas2dReadback: [], angleReadPixels: [] };
  const unknownWarnings = [];
  for (const warning of warnings) {
    const sourceUrl = typeof warning.location?.url === "string" ? warning.location.url : "";
    const sourcePath = sourceUrl.startsWith(context.currentOrigin + "/")
      ? sourceUrl.slice(context.currentOrigin.length).split(/[?#]/u)[0]
      : null;
    if (
      ["chromium", "chrome", "msedge"].includes(context.browser)
      && canvasPattern.test(warning.text)
      && sourcePath
      && chunkPathPattern.test(sourcePath)
      && Number.isInteger(warning.location?.lineNumber)
      && warning.location.lineNumber >= 0
      && Number.isInteger(warning.location?.columnNumber)
      && warning.location.columnNumber >= 0
    ) {
      platformDiagnostics.canvas2dReadback.push({
        normalizedPattern: "Canvas2D exact willReadFrequently advisory",
        sourcePath,
        reportedLineNumber: warning.location.lineNumber,
        reportedColumnNumber: warning.location.columnNumber,
      });
      continue;
    }
    const angle = classifyChromiumAngleReadPixelsDiagnostic({
      browser: context.browser,
      currentHref: context.currentHref,
      currentOrigin: context.currentOrigin,
      warning,
    });
    if (angle) platformDiagnostics.angleReadPixels.push(angle);
    else unknownWarnings.push({
      text: warning.text,
      location: {
        sourcePath,
        lineNumber: warning.location?.lineNumber ?? null,
        columnNumber: warning.location?.columnNumber ?? null,
      },
    });
  }
  return {
    consoleErrors,
    pageErrors,
    unknownWarnings,
    consoleWarningsTotal: warnings.length,
    unknownConsoleWarnings: unknownWarnings.length,
    classifiedPlatformWarnings:
      platformDiagnostics.canvas2dReadback.length + platformDiagnostics.angleReadPixels.length,
    platformDiagnostics,
  };
}

let ownedServer = null;
let ownsDistDirectory = false;
let browserSessionAttempted = false;
let cleanupPromise = null;

function cleanupOwnedResources() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const cleanupErrors = [];
    if (browserSessionAttempted) {
      try {
        runCli(["close"], "close browser session", 30_000);
      } catch (caught) {
        cleanupErrors.push(caught);
      }
    }
    try {
      await stopOwnedServer(ownedServer);
    } catch (caught) {
      cleanupErrors.push(caught);
    } finally {
      if (ownsDistDirectory) {
        try {
          writeFileSync(tsconfigPath, originalTsconfig, "utf8");
        } catch (caught) {
          cleanupErrors.push(caught);
        }
        try {
          removeOwnedDistDirectory();
        } catch (caught) {
          cleanupErrors.push(caught);
        }
      }
      try {
        removePlaywrightWorkingDirectory();
      } catch (caught) {
        cleanupErrors.push(caught);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new Error(
        "3D controls cleanup failed: "
          + cleanupErrors.map((error) => redact(error instanceof Error ? error.message : error)).join(" | "),
      );
    }
  })();
  return cleanupPromise;
}

async function handleSignal(signal) {
  const exitCode = signal === "SIGINT" ? 130 : 143;
  let cleanupFailure = null;
  try {
    await cleanupOwnedResources();
  } catch (caught) {
    cleanupFailure = caught;
  }
  let sanitizationFailure = null;
  if (cleanupFailure) {
    try {
      removeUnsafeServerLog();
    } catch {
      // The signal exit remains non-zero; never print raw log bytes.
    }
  } else {
    try {
      sanitizeFinalServerLog();
    } catch (sanitizationError) {
      try {
        removeUnsafeServerLog();
      } catch {
        // The signal exit remains non-zero; never print raw log bytes.
      }
      sanitizationFailure = sanitizationError;
    }
  }
  if (cleanupFailure) {
    process.stderr.write("[3D controls smoke] cleanup after " + signal + " failed: "
      + redact(cleanupFailure) + "\n");
  }
  if (sanitizationFailure) {
    process.stderr.write("[3D controls smoke] server log sanitization after " + signal + " failed: "
      + redact(sanitizationFailure) + "\n");
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void handleSignal("SIGINT"));
process.once("SIGTERM", () => void handleSignal("SIGTERM"));

function assertBrowser(condition, message) {
  if (!condition) throw new Error(message);
}

function beginBrowserMessageCapture(page) {
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push({
      text: message.text(),
      location: message.location(),
    });
  };
  const onPageError = (error) => pageErrors.push(error.message);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    finish() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      return { consoleErrors, consoleWarnings, pageErrors };
    },
  };
}

async function waitForThreePlots(page) {
  const testIds = [
    "open-ena-3d-comparison-plot",
    "open-ena-3d-primary-plot",
    "open-ena-3d-secondary-plot",
  ];
  for (const testId of testIds) {
    const panel = page.getByTestId(testId);
    await panel.waitFor({ state: "visible", timeout: 60_000 });
    await panel.locator('[data-ena-interactive-camera="true"][aria-busy="false"]')
      .waitFor({ state: "visible", timeout: 60_000 });
    await panel.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 });
  }
}

async function readScientificState(page) {
  return await page.evaluate(async () => {
    const plotTestIds = [
      "open-ena-3d-comparison-plot",
      "open-ena-3d-primary-plot",
      "open-ena-3d-secondary-plot",
    ];
    const canonicalNumber = (value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return Math.round(value * 1e12) / 1e12;
    };
    const canonicalVector = (value) => ({
      x: canonicalNumber(value?.x),
      y: canonicalNumber(value?.y),
      z: canonicalNumber(value?.z),
    });
    const canonicalCamera = (value) => ({
      center: canonicalVector(value?.center),
      eye: canonicalVector(value?.eye),
      up: canonicalVector(value?.up),
      projection: { type: value?.projection?.type ?? null },
    });
    const canonicalAspectRatio = (value) => {
      const candidate = Array.isArray(value)
        ? { x: value[0], y: value[1], z: value[2] }
        : value;
      return canonicalVector(candidate);
    };
    const plotPayload = plotTestIds.map((testId) => {
      const panel = document.querySelector('[data-testid="' + testId + '"]');
      const region = panel?.querySelector('[data-ena-interactive-camera="true"]');
      const root = panel?.querySelector('[data-ena-plotly-root="true"]');
      const traces = Array.isArray(root?.data) ? root.data : [];
      if (!panel || !region || traces.length === 0) {
        throw new Error("3D result identity cannot be read for " + testId);
      }
      return {
        testId,
        role: panel.getAttribute("data-ena-plot-role"),
        traces: traces.map((trace) => ({
          name: trace.name,
          x: trace.x,
          y: trace.y,
          z: trace.z,
          meta: trace.meta,
        })),
        ranges: [
          region.getAttribute("data-ena-x-range"),
          region.getAttribute("data-ena-y-range"),
          region.getAttribute("data-ena-z-range"),
        ],
      };
    });
    const encoded = new TextEncoder().encode(JSON.stringify(plotPayload));
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const resultIdentity = Array.from(new Uint8Array(digest), (value) => (
      value.toString(16).padStart(2, "0")
    )).join("");
    const axisState = ["x", "y", "z"].map((axis) => (
      document.querySelector('[data-testid="open-ena-3d-axis-' + axis + '"]')?.value ?? null
    ));
    const cameraState = plotTestIds.map((testId) => document
      .querySelector('[data-testid="' + testId + '"] [data-ena-interactive-camera="true"]')
      ?.getAttribute("data-ena-camera-state") ?? null);
    const aspectRatioState = plotTestIds.map((testId) => document
      .querySelector('[data-testid="' + testId + '"] [data-ena-interactive-camera="true"]')
      ?.getAttribute("data-ena-aspect-ratio-state") ?? null);
    const rangeState = plotPayload.map((plot) => plot.ranges);
    const runtimeCameraState = plotTestIds.map((testId) => {
      const root = document.querySelector(
        '[data-testid="' + testId + '"] [data-ena-plotly-root="true"]',
      );
      const scene = root?._fullLayout?.scene?._scene;
      if (typeof scene?.getCamera !== "function") {
        throw new Error("Plotly live camera is unavailable for " + testId);
      }
      return canonicalCamera(scene.getCamera());
    });
    const runtimeAspectRatioState = plotTestIds.map((testId) => {
      const root = document.querySelector(
        '[data-testid="' + testId + '"] [data-ena-plotly-root="true"]',
      );
      const glplot = root?._fullLayout?.scene?._scene?.glplot;
      if (typeof glplot?.getAspectratio !== "function") {
        throw new Error("Plotly live aspect ratio is unavailable for " + testId);
      }
      return canonicalAspectRatio(glplot.getAspectratio());
    });
    const vectorIsFinite = (vector) => [vector.x, vector.y, vector.z].every((value) => value !== null);
    for (const camera of runtimeCameraState) {
      if (![camera.center, camera.eye, camera.up].every(vectorIsFinite)) {
        throw new Error("runtime camera contains a non-finite vector");
      }
      if (!["perspective", "orthographic"].includes(camera.projection.type)) {
        throw new Error("runtime camera projection is invalid");
      }
    }
    for (const aspectRatio of runtimeAspectRatioState) {
      if (!vectorIsFinite(aspectRatio)) {
        throw new Error("runtime aspect ratio contains a non-finite vector");
      }
    }
    return {
      analysisRunCount: window.__openEna3dControlsAudit?.analysisRunCount ?? -1,
      resultIdentity,
      axisState,
      cameraState,
      aspectRatioState,
      rangeState,
      runtimeCameraState,
      runtimeAspectRatioState,
    };
  });
}

async function readThreeDGroupDisplayState(page) {
  return await page.evaluate(() => {
    const root = document.querySelector(
      '[data-testid="open-ena-3d-comparison-plot"] [data-ena-plotly-root="true"]',
    );
    const traces = Array.isArray(root?.data) ? root.data : [];
    if (traces.length === 0) throw new Error("3D group-display traces are unavailable");
    const byGroup = (role) => traces
      .filter((trace) => trace.meta?.role === role)
      .map((trace) => ({
        groupName: trace.meta?.groupName ?? null,
        markerSymbol: trace.marker?.symbol ?? trace.meta?.markerSymbol ?? null,
        pointCount: Array.isArray(trace.x) ? trace.x.length : 0,
        sampleSize: Number.isFinite(trace.meta?.sampleSize) ? trace.meta.sampleSize : null,
      }))
      .sort((left, right) => String(left.groupName).localeCompare(String(right.groupName)));
    return {
      unitTraces: byGroup("unit-points"),
      meanTraces: byGroup("group-mean"),
      confidenceTraces: byGroup("confidence-interval"),
      outlierTraceCount: traces.filter((trace) => String(trace.meta?.role ?? "").includes("outlier")).length,
    };
  });
}

async function readTwoDGroupDisplayState(page) {
  return await page.evaluate(() => {
    const plot = document.querySelector('[data-testid="open-ena-group-comparison-plot"]');
    if (!plot) throw new Error("2D group-display plot is unavailable");
    const count = (selector) => plot.querySelectorAll(selector).length;
    const guide = (selector) => {
      const element = plot.querySelector(selector);
      return {
        count: count(selector),
        sampleSize: element ? Number(element.getAttribute("data-ena-sample-size")) : null,
      };
    };
    const primaryOutlier = guide('[data-ena-outlier-guide][data-ena-group-role="primary"]');
    const secondaryOutlier = guide('[data-ena-outlier-guide][data-ena-group-role="secondary"]');
    return {
      points: {
        total: Number(plot.getAttribute("data-ena-points-total")),
        hidden: Number(plot.getAttribute("data-ena-points-hidden")),
        shown: Number(plot.getAttribute("data-ena-points-shown")),
        primary: count('[data-ena-unit-point="true"][data-ena-group-role="primary"]'),
        secondary: count('[data-ena-unit-point="true"][data-ena-group-role="secondary"]'),
      },
      means: {
        primary: count('[data-ena-mean-marker][data-ena-group-role="primary"]'),
        secondary: count('[data-ena-mean-marker][data-ena-group-role="secondary"]'),
      },
      confidence: {
        primary: guide('[data-ena-uncertainty-guide][data-ena-confidence-level="0.95"][data-ena-group-role="primary"]'),
        secondary: guide('[data-ena-uncertainty-guide][data-ena-confidence-level="0.95"][data-ena-group-role="secondary"]'),
      },
      outlier: {
        primary: {
          ...primaryOutlier,
          confidenceInterval: plot.querySelector(
            '[data-ena-outlier-guide][data-ena-group-role="primary"]',
          )?.getAttribute("data-ena-confidence-interval") ?? null,
        },
        secondary: secondaryOutlier,
      },
    };
  });
}

function assertScientificState(actual, expected, label) {
  for (const key of [
    "analysisRunCount",
    "resultIdentity",
    "axisState",
    "cameraState",
    "aspectRatioState",
    "rangeState",
    "runtimeCameraState",
    "runtimeAspectRatioState",
  ]) {
    assertBrowser(
      JSON.stringify(actual[key]) === JSON.stringify(expected[key]),
      label + " changed " + key,
    );
  }
}

async function readPanelMetrics(panel) {
  return await panel.evaluate((target) => {
    const rectangle = (element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, left: box.left, top: box.top };
    };
    const plotRoot = target.querySelector('[data-ena-plotly-root="true"]');
    const canvases = [...target.querySelectorAll("canvas")].map((canvas) => ({
      ...rectangle(canvas),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
    }));
    return {
      target: rectangle(target),
      plotRoot: plotRoot ? rectangle(plotRoot) : null,
      canvases,
      actions: target.querySelectorAll('[data-ena-plot-action]').length,
      header: target.querySelector("h3")?.textContent?.trim() ?? "",
    };
  });
}

async function authenticateBuildAndOpen3d(page, args) {
  const browserMessageCapture = beginBrowserMessageCapture(page);

  const installAnalysisAudit = () => {
    if (window.__openEna3dControlsAudit) return;
    const audit = { analysisRunCount: 0, requestedModelTypes: [] };
    Object.defineProperty(window, "__openEna3dControlsAudit", {
      configurable: true,
      value: audit,
    });
    const originalWorkerPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function auditedWorkerPostMessage(message, ...rest) {
      if (message?.kind === "run" && message?.config && !message?.request?.pathTask) {
        audit.analysisRunCount += 1;
        audit.requestedModelTypes.push(message.config.model);
      }
      return originalWorkerPostMessage.call(this, message, ...rest);
    };
  };
  await page.addInitScript(installAnalysisAudit);
  await page.goto(args.entryUrl, { waitUntil: "domcontentloaded" });

  await page.getByRole("textbox", { name: "Account name" }).fill(args.username);
  await page.getByRole("textbox", { name: "Password" }).fill(args.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.waitFor({ timeout: 30_000 });
  assertBrowser(page.url().endsWith("/en/open-ena"), "login did not return to the English workspace");

  const dataButton = rail.getByRole("button", { name: "Data", exact: true });
  const fileInput = page.locator('input[type=file][accept*=".csv"]');
  let dataPanelVisible = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dataButton.click();
    dataPanelVisible = await fileInput.waitFor({ state: "attached", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (dataPanelVisible) break;
  }
  assertBrowser(dataPanelVisible, "the Data panel did not remain active after authentication");
  await fileInput.evaluate((input, csv) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([csv], "open-ena-3d-controls-smoke.csv", { type: "text/csv" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, args.fixtureCsv);
  await page.getByRole("heading", { name: "Define the ENA model" }).waitFor({ timeout: 30_000 });

  const unitFields = await page.getByRole("group", { name: /Unit identity/ })
    .getByRole("checkbox")
    .evaluateAll((nodes) => nodes.filter((node) => node.checked).map((node) => (
      node.parentElement.textContent.trim()
    )));
  assertBrowser(
    JSON.stringify(unitFields) === JSON.stringify(["Group", "Name"]),
    "the synthetic Endpoint unit identity is not ordered Group + Name",
  );
  await page.getByRole("tab", { name: "Windows" }).click();
  const modelType = page.getByRole("combobox", { name: "Model type" });
  await modelType.selectOption(args.modelType);
  assertBrowser(await modelType.inputValue() === args.modelType, "the fixture was not configured as Endpoint");
  const build = page.getByRole("button", { name: /Build ENA model/ });
  assertBrowser(await build.isEnabled(), "the synthetic Endpoint build is disabled");
  await build.click();
  await page.getByRole("button", { name: /Rebuild model/ }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Download Model" }).click({ trial: true, timeout: 30_000 });
  assertBrowser(
    await page.evaluate(() => window.__openEna3dControlsAudit?.analysisRunCount) === 1,
    "the initial Endpoint build did not dispatch exactly one analysis run",
  );

  const visualization = page.getByRole("group", { name: "ENA visualization options" });
  const threeD = visualization.getByRole("button", { name: /3D ENA/ });
  assertBrowser(await threeD.isEnabled(), "3D ENA is disabled for the 5-code Endpoint fixture");
  await threeD.click();
  await page.getByTestId("open-ena-3d-group-contrast").waitFor({ timeout: 60_000 });
  await waitForThreePlots(page);
  await page.waitForTimeout(500);
  for (const testId of [
    "open-ena-3d-comparison-plot",
    "open-ena-3d-primary-plot",
    "open-ena-3d-secondary-plot",
  ]) {
    assertBrowser(
      await page.getByTestId(testId).locator('[data-ena-code-node-count="5"]').count() === 1,
      testId + " does not contain all five fitted code nodes",
    );
  }
  return {
    modelType: await modelType.inputValue(),
    unitFields,
    baseline: await readScientificState(page),
    browserMessages: browserMessageCapture.finish(),
  };
}

async function exerciseGroupDisplayControls(page, args) {
  const browserMessageCapture = beginBrowserMessageCapture(page);
  const baselineGroup = args.groups[0];
  const secondaryGroup = args.groups[1];
  const targetUnitId = baselineGroup + "::SYNTHETIC_UNIT_1";
  const rail = page.getByRole("navigation", { name: "Analysis modes" });

  const analysisRunCount = async () => await page.evaluate(() => (
    window.__openEna3dControlsAudit?.analysisRunCount ?? -1
  ));
  const assertNoRerun = async (checkpoint) => {
    assertBrowser(await analysisRunCount() === args.baseline.analysisRunCount, checkpoint + " reran jENA");
  };
  const openModelUnits = async () => {
    await rail.getByRole("button", { name: "Model", exact: true }).click();
    const unitsTab = page.getByRole("tab", { name: "Units", exact: true });
    await unitsTab.waitFor({ state: "visible", timeout: 30_000 });
    await unitsTab.click();
    const controls = page.getByTestId("open-ena-group-display-controls");
    await controls.waitFor({ state: "visible", timeout: 30_000 });
    return controls;
  };
  const openPlotTools = async () => {
    await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
    await page.getByRole("group", { name: "ENA visualization options" })
      .waitFor({ state: "visible", timeout: 30_000 });
  };
  const selectView = async (view) => {
    await openPlotTools();
    const visualization = page.getByRole("group", { name: "ENA visualization options" });
    await visualization.getByRole("button", { name: view === "2d" ? /2D ENA/ : /3D ENA/ }).click();
    if (view === "3d") {
      await page.getByTestId("open-ena-3d-group-contrast").waitFor({ state: "visible", timeout: 60_000 });
      await waitForThreePlots(page);
      await page.waitForTimeout(250);
    } else {
      await page.getByTestId("open-ena-group-comparison-plot")
        .waitFor({ state: "visible", timeout: 60_000 });
    }
  };
  const openGroupCard = async (controls, groupName) => {
    const card = controls.locator(".ena-group-display-group").filter({ hasText: groupName }).first();
    assertBrowser(await card.count() === 1, "group-display card is missing for " + groupName);
    if (!await card.evaluate((element) => element.open)) await card.locator("summary").first().click();
    return card;
  };
  const readControls = async (groupName) => {
    const controls = await openModelUnits();
    const card = await openGroupCard(controls, groupName);
    const settings = card.getByRole("group", { name: "Display settings for " + groupName });
    const switchState = async (name) => {
      const control = settings.getByRole("switch", { name });
      return { checked: await control.isChecked(), disabled: await control.isDisabled() };
    };
    const units = card.locator(".ena-group-display-units");
    if (!await units.evaluate((element) => element.open)) await units.locator("summary").click();
    const resultIdentity = await controls.evaluate((element) => (
      element.parentElement?.getAttribute("data-ena-group-display-result-key") ?? ""
    ));
    return {
      controls,
      card,
      settings,
      units,
      resultIdentity,
      summary: (await card.locator("summary").first().textContent())?.trim() ?? "",
      showUnitPoints: await switchState("Show unit points for " + groupName),
      showMean: await switchState("Show mean for " + groupName),
      showConfidenceIntervals: await switchState("Show confidence intervals for " + groupName),
      showOutlierIntervals: await switchState("Show outlier intervals for " + groupName),
      includeHiddenPoints: await switchState("Include hidden points for " + groupName),
    };
  };
  const clickSetting = async (state, label) => {
    await state.settings.getByRole("switch", { name: label }).click();
  };
  const assertIdentity = (state, expected, checkpoint) => {
    assertBrowser(Boolean(state.resultIdentity), checkpoint + " did not expose a result identity");
    assertBrowser(state.resultIdentity === expected, checkpoint + " changed resultIdentity");
  };
  const traceByGroup = (state, groupName) => state.unitTraces.find((trace) => trace.groupName === groupName);
  const confidenceSamples = (state, groupName) => [...new Set(state.confidenceTraces
    .filter((trace) => trace.groupName === groupName)
    .map((trace) => trace.sampleSize))];

  const initial3d = await readThreeDGroupDisplayState(page);
  assertBrowser(initial3d.unitTraces.length === 2, "linked 3D did not expose both group unit traces");
  assertBrowser(
    initial3d.unitTraces.every((trace) => trace.markerSymbol === "circle"),
    "both group unit traces must use circle markers",
  );
  assertBrowser(traceByGroup(initial3d, baselineGroup)?.pointCount === 8, "baseline 3D unit count is not 8");
  assertBrowser(traceByGroup(initial3d, secondaryGroup)?.pointCount === 8, "secondary 3D unit count is not 8");
  assertBrowser(initial3d.meanTraces.length === 2, "3D defaults do not show both means");

  const initialControls = await readControls(baselineGroup);
  const resultIdentity = initialControls.resultIdentity;
  assertBrowser(initialControls.summary.includes("8 of 8 unit points visible"), "default group visibility is not 8 of 8");
  assertBrowser(initialControls.showUnitPoints.checked, "Show unit points is off by default");
  assertBrowser(initialControls.showMean.checked, "Show mean is off by default");
  assertBrowser(initialControls.showConfidenceIntervals.checked, "Show confidence intervals is off by default");
  assertBrowser(!initialControls.showOutlierIntervals.checked, "Show outlier intervals is on by default");
  assertBrowser(initialControls.showOutlierIntervals.disabled, "3D outlier control is not disabled");
  assertBrowser(!initialControls.includeHiddenPoints.checked, "Include hidden points is on by default");
  const hideAction = "Hide unit " + targetUnitId + " in " + baselineGroup;
  const showAction = "Show unit " + targetUnitId + " in " + baselineGroup;
  await initialControls.units.getByRole("button", { name: hideAction }).click();
  await initialControls.units.getByRole("button", { name: showAction })
    .waitFor({ state: "visible", timeout: 30_000 });

  const hiddenControls3d = await readControls(baselineGroup);
  assertIdentity(hiddenControls3d, resultIdentity, "hiding a 3D unit");
  assertBrowser(hiddenControls3d.summary.includes("7 of 8 unit points visible"), "hidden group visibility is not 7 of 8");
  await assertNoRerun("hiding a 3D unit");
  await openPlotTools();
  await waitForThreePlots(page);
  const hidden3d = await readThreeDGroupDisplayState(page);
  assertBrowser(hidden3d.unitTraces.every((trace) => trace.markerSymbol === "circle"), "hiding changed a 3D marker shape");
  assertBrowser(traceByGroup(hidden3d, baselineGroup)?.pointCount === 7, "3D did not hide one baseline unit");
  assertBrowser(traceByGroup(hidden3d, secondaryGroup)?.pointCount === 8, "3D hid a secondary unit by mistake");
  assertBrowser(
    JSON.stringify(confidenceSamples(hidden3d, baselineGroup)) === JSON.stringify([7]),
    "Include hidden off did not use seven visible baseline units for 3D CI",
  );

  await selectView("2d");
  const hidden2d = await readTwoDGroupDisplayState(page);
  assertBrowser(hidden2d.points.total === 16 && hidden2d.points.hidden === 1 && hidden2d.points.shown === 15,
    "2D did not preserve the one hidden unit");
  assertBrowser(hidden2d.points.primary === 7 && hidden2d.points.secondary === 8,
    "2D unit visibility did not persist by group");
  assertBrowser(hidden2d.confidence.primary.sampleSize === 7, "2D CI did not use visible-only baseline units");
  const groupDisplayPersistence2d = { hidden2d, persisted: true };

  const controls2d = await readControls(baselineGroup);
  assertIdentity(controls2d, resultIdentity, "switching to 2D");
  assertBrowser(!controls2d.showOutlierIntervals.disabled, "2D outlier control remained disabled");
  assertBrowser(await controls2d.units.getByRole("button", { name: showAction }).count() === 1,
    "2D controls forgot the hidden unit");
  await clickSetting(controls2d, "Show mean for " + baselineGroup);
  const meanOffControls = await readControls(baselineGroup);
  assertBrowser(!meanOffControls.showMean.checked, "Show mean did not turn off");
  assertBrowser(meanOffControls.showConfidenceIntervals.disabled, "Mean off did not disable CI");
  assertBrowser(meanOffControls.showOutlierIntervals.disabled, "Mean off did not disable outlier intervals");
  await openPlotTools();
  const meanOff2d = await readTwoDGroupDisplayState(page);
  assertBrowser(meanOff2d.means.primary === 0 && meanOff2d.means.secondary === 1,
    "Mean off did not suppress only the baseline mean");
  assertBrowser(meanOff2d.confidence.primary.count === 0 && meanOff2d.confidence.secondary.count === 1,
    "Mean off did not suppress only the dependent baseline CI");

  const displayControls2d = await readControls(baselineGroup);
  await clickSetting(displayControls2d, "Show mean for " + baselineGroup);
  await clickSetting(displayControls2d, "Show confidence intervals for " + baselineGroup);
  await clickSetting(displayControls2d, "Show outlier intervals for " + baselineGroup);
  await clickSetting(displayControls2d, "Include hidden points for " + baselineGroup);
  const configured2dControls = await readControls(baselineGroup);
  assertIdentity(configured2dControls, resultIdentity, "configuring 2D group summaries");
  assertBrowser(configured2dControls.showMean.checked, "Show mean did not restore");
  assertBrowser(!configured2dControls.showConfidenceIntervals.checked, "Show confidence intervals did not turn off");
  assertBrowser(configured2dControls.showOutlierIntervals.checked, "Show outlier intervals did not turn on");
  assertBrowser(configured2dControls.includeHiddenPoints.checked, "Include hidden points did not turn on");
  await openPlotTools();
  const configured2d = await readTwoDGroupDisplayState(page);
  assertBrowser(configured2d.points.hidden === 1 && configured2d.points.shown === 15,
    "Include hidden points revealed the hidden unit mark");
  assertBrowser(configured2d.means.primary === 1, "restored baseline mean is missing");
  assertBrowser(configured2d.confidence.primary.count === 0 && configured2d.confidence.secondary.count === 1,
    "per-group CI state was not honored");
  assertBrowser(configured2d.outlier.primary.count === 1 && configured2d.outlier.secondary.count === 0,
    "per-group outlier state was not honored");
  assertBrowser(configured2d.outlier.primary.sampleSize === 8,
    "Include hidden points did not restore the hidden unit to the outlier summary population");
  assertBrowser(configured2d.outlier.primary.confidenceInterval === "false",
    "outlier display was mislabeled as a confidence interval");

  await selectView("3d");
  const configured3d = await readThreeDGroupDisplayState(page);
  assertBrowser(configured3d.unitTraces.every((trace) => trace.markerSymbol === "circle"),
    "2D to 3D persistence changed a group marker shape");
  assertBrowser(traceByGroup(configured3d, baselineGroup)?.pointCount === 7,
    "3D did not preserve the hidden baseline unit");
  assertBrowser(configured3d.meanTraces.some((trace) => trace.groupName === baselineGroup),
    "3D did not preserve the restored baseline mean");
  assertBrowser(configured3d.confidenceTraces.filter((trace) => trace.groupName === baselineGroup).length === 0,
    "3D did not preserve the baseline CI-off state");
  assertBrowser(configured3d.confidenceTraces.filter((trace) => trace.groupName === secondaryGroup).length === 6,
    "3D removed the secondary CI wireframe");
  assertBrowser(configured3d.outlierTraceCount === 0, "3D invented an outlier volume");
  const persistedControls3d = await readControls(baselineGroup);
  assertIdentity(persistedControls3d, resultIdentity, "switching configured controls to 3D");
  assertBrowser(persistedControls3d.showMean.checked, "3D forgot the mean state");
  assertBrowser(!persistedControls3d.showConfidenceIntervals.checked, "3D forgot the CI state");
  assertBrowser(persistedControls3d.showOutlierIntervals.checked && persistedControls3d.showOutlierIntervals.disabled,
    "3D did not preserve and disable the 2D-only outlier state");
  assertBrowser(persistedControls3d.includeHiddenPoints.checked, "3D forgot Include hidden points");
  assertBrowser(await persistedControls3d.units.getByRole("button", { name: showAction }).count() === 1,
    "3D controls forgot the hidden unit");
  const groupDisplayPersistence3d = { configured3d, persisted: true };

  await clickSetting(persistedControls3d, "Show confidence intervals for " + baselineGroup);
  await clickSetting(persistedControls3d, "Include hidden points for " + baselineGroup);
  await persistedControls3d.controls.getByRole("button", { name: "Show all hidden unit points" }).click();
  const revealedControls3d = await readControls(baselineGroup);
  assertBrowser(revealedControls3d.summary.includes("8 of 8 unit points visible"), "Show all did not restore 8 of 8 units");
  assertBrowser(await revealedControls3d.units.getByRole("button", { name: hideAction }).count() === 1,
    "restored unit did not expose its Hide action");
  await selectView("2d");
  const restore2dControls = await readControls(baselineGroup);
  await clickSetting(restore2dControls, "Show outlier intervals for " + baselineGroup);
  const restoredControls = await readControls(baselineGroup);
  assertIdentity(restoredControls, resultIdentity, "restoring default group display");
  assertBrowser(restoredControls.showMean.checked && restoredControls.showConfidenceIntervals.checked,
    "restored Mean/CI defaults are incorrect");
  assertBrowser(!restoredControls.showOutlierIntervals.checked && !restoredControls.includeHiddenPoints.checked,
    "restored Outlier/Include Hidden defaults are incorrect");
  await selectView("3d");
  const restored3d = await readThreeDGroupDisplayState(page);
  assertBrowser(restored3d.unitTraces.every((trace) => trace.markerSymbol === "circle"),
    "restored 3D group traces are not circles");
  assertBrowser(traceByGroup(restored3d, baselineGroup)?.pointCount === 8
    && traceByGroup(restored3d, secondaryGroup)?.pointCount === 8,
    "restored 3D unit counts are not 8 + 8");
  const finalScientificState = await readScientificState(page);
  assertScientificState(finalScientificState, args.baseline, "group-display restoration");
  await assertNoRerun("group-display lifecycle");

  return {
    analysisRunCount: await analysisRunCount(),
    resultIdentity,
    initialUnitTraces: initial3d.unitTraces,
    hidden3d,
    groupDisplayPersistence2d,
    meanOff2d,
    configured2d,
    groupDisplayPersistence3d,
    restored3d,
    finalScientificState,
    browserMessages: browserMessageCapture.finish(),
  };
}

async function exerciseDataView(page, args) {
  const browserMessageCapture = beginBrowserMessageCapture(page);
  const toggle = page.getByTestId("open-ena-data-view-toggle");
  assertBrowser(await toggle.isEnabled(), "Data View is disabled in the active 3D group comparison");
  assertBrowser(await toggle.getAttribute("aria-pressed") === "false", "Data View starts pressed");
  const primaryPanel = page.getByTestId("open-ena-3d-primary-plot");
  const secondaryPanel = page.getByTestId("open-ena-3d-secondary-plot");
  const primaryMountNode = await primaryPanel.elementHandle();
  const secondaryMountNode = await secondaryPanel.elementHandle();
  assertBrowser(Boolean(primaryMountNode && secondaryMountNode), "side-panel mount nodes are unavailable");
  const mountTokens = {
    primary: "smoke-primary-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    secondary: "smoke-secondary-" + Date.now() + "-" + Math.random().toString(36).slice(2),
  };
  await primaryMountNode.evaluate((node, token) => {
    node.setAttribute("data-smoke-mount-token", token);
  }, mountTokens.primary);
  await secondaryMountNode.evaluate((node, token) => {
    node.setAttribute("data-smoke-mount-token", token);
  }, mountTokens.secondary);
  const assertSidePanelsPreserved = async (checkpoint) => {
    const currentPrimaryNode = await primaryPanel.elementHandle();
    const currentSecondaryNode = await secondaryPanel.elementHandle();
    assertBrowser(Boolean(currentPrimaryNode && currentSecondaryNode), checkpoint + " lost a side panel");
    const primarySameNode = await primaryMountNode.evaluate(
      (node, currentNode) => node === currentNode,
      currentPrimaryNode,
    );
    const secondarySameNode = await secondaryMountNode.evaluate(
      (node, currentNode) => node === currentNode,
      currentSecondaryNode,
    );
    assertBrowser(primarySameNode && secondarySameNode, checkpoint + " remounted a side panel");
    assertBrowser(
      await currentPrimaryNode.getAttribute("data-smoke-mount-token") === mountTokens.primary
        && await currentSecondaryNode.getAttribute("data-smoke-mount-token") === mountTokens.secondary,
      checkpoint + " replaced a smoke mount token",
    );
    await currentPrimaryNode.dispose();
    await currentSecondaryNode.dispose();
  };
  const sideStateBefore = await page.evaluate(() => ({
    analysisRunCount: window.__openEna3dControlsAudit?.analysisRunCount ?? -1,
    axisState: ["x", "y", "z"].map((axis) => document
      .querySelector('[data-testid="open-ena-3d-axis-' + axis + '"]')?.value ?? null),
    cameraState: ["open-ena-3d-primary-plot", "open-ena-3d-secondary-plot"].map((testId) => document
      .querySelector('[data-testid="' + testId + '"] [data-ena-interactive-camera="true"]')
      ?.getAttribute("data-ena-camera-state") ?? null),
    aspectRatioState: ["open-ena-3d-primary-plot", "open-ena-3d-secondary-plot"].map((testId) => document
      .querySelector('[data-testid="' + testId + '"] [data-ena-interactive-camera="true"]')
      ?.getAttribute("data-ena-aspect-ratio-state") ?? null),
  }));

  await toggle.click();
  const dataView = page.getByTestId("open-ena-3d-data-view");
  await dataView.waitFor({ state: "visible", timeout: 30_000 });
  assertBrowser(await toggle.getAttribute("aria-pressed") === "true", "mouse did not press Data View");
  assertBrowser((await toggle.textContent()).includes("Comparison Plot"), "Data View did not expose its return action");
  assertBrowser(await page.getByTestId("open-ena-3d-comparison-plot").count() === 0, "Comparison plot remained mounted behind Data View");
  assertBrowser(await page.getByTestId("open-ena-3d-primary-plot").count() === 1, "Primary plot disappeared in Data View");
  assertBrowser(await page.getByTestId("open-ena-3d-secondary-plot").count() === 1, "Secondary plot disappeared in Data View");
  await assertSidePanelsPreserved("during mouse Data View");
  assertBrowser(
    await page.getByRole("group", { name: "ENA visualization options" })
      .getByRole("button", { name: /3D ENA/ }).getAttribute("aria-pressed") === "true",
    "Data View changed the visualization dimension",
  );
  const tableText = await page.getByTestId("open-ena-data-view").textContent();
  const dataViewRowCount = await page.getByTestId("open-ena-data-view").locator("tbody tr").count();
  for (const code of args.codes) {
    assertBrowser(tableText.includes(code), "Data View omitted synthetic code " + code);
  }
  const sideStateDuring = await page.evaluate(() => ({
    analysisRunCount: window.__openEna3dControlsAudit?.analysisRunCount ?? -1,
    axisState: ["x", "y", "z"].map((axis) => document
      .querySelector('[data-testid="open-ena-3d-axis-' + axis + '"]')?.value ?? null),
    cameraState: ["open-ena-3d-primary-plot", "open-ena-3d-secondary-plot"].map((testId) => document
      .querySelector('[data-testid="' + testId + '"] [data-ena-interactive-camera="true"]')
      ?.getAttribute("data-ena-camera-state") ?? null),
    aspectRatioState: ["open-ena-3d-primary-plot", "open-ena-3d-secondary-plot"].map((testId) => document
      .querySelector('[data-testid="' + testId + '"] [data-ena-interactive-camera="true"]')
      ?.getAttribute("data-ena-aspect-ratio-state") ?? null),
  }));
  assertBrowser(
    JSON.stringify(sideStateDuring) === JSON.stringify(sideStateBefore),
    "Data View changed the surviving 3D plots or dispatched analysis",
  );
  await page.getByTestId("open-ena-3d-group-contrast").screenshot({ path: args.dataViewScreenshotPath });
  await toggle.click();
  await waitForThreePlots(page);
  await page.waitForTimeout(250);
  await assertSidePanelsPreserved("after mouse restore");
  const mouseRestored = await readScientificState(page);
  assertScientificState(mouseRestored, args.baseline, "mouse Data View lifecycle");

  await toggle.focus();
  await toggle.press("Enter");
  await dataView.waitFor({ state: "visible", timeout: 30_000 });
  assertBrowser(await toggle.evaluate((element) => document.activeElement === element), "keyboard Data View lost toggle focus");
  await assertSidePanelsPreserved("during keyboard Data View");
  await toggle.press("Enter");
  await waitForThreePlots(page);
  await page.waitForTimeout(250);
  await assertSidePanelsPreserved("after keyboard restore");
  const keyboardRestored = await readScientificState(page);
  assertScientificState(keyboardRestored, args.baseline, "keyboard Data View lifecycle");
  await primaryMountNode.evaluate((node) => node.removeAttribute("data-smoke-mount-token"));
  await secondaryMountNode.evaluate((node) => node.removeAttribute("data-smoke-mount-token"));
  await primaryMountNode.dispose();
  await secondaryMountNode.dispose();
  return {
    dataViewMouseLifecycle: "PASS",
    dataViewKeyboardLifecycle: "PASS",
    sidePanelsPreserved: true,
    rows: dataViewRowCount,
    browserMessages: browserMessageCapture.finish(),
  };
}

async function exerciseFullscreenCards(page, args) {
  const browserMessageCapture = beginBrowserMessageCapture(page);
  const specifications = [
    {
      name: "Comparison",
      testId: "open-ena-3d-comparison-plot",
      screenshotPath: args.comparisonFullscreenScreenshotPath,
      exitMethod: "button",
      forceFallback: false,
    },
    {
      name: "Primary",
      testId: "open-ena-3d-primary-plot",
      screenshotPath: args.primaryFullscreenScreenshotPath,
      exitMethod: "button",
      forceFallback: false,
    },
    {
      name: "Secondary",
      testId: "open-ena-3d-secondary-plot",
      screenshotPath: args.secondaryFullscreenScreenshotPath,
      exitMethod: "escape",
      forceFallback: true,
    },
  ];
  const fullscreenAudits = {};
  let fallbackAudit = null;
  let fallbackModalAudit = null;
  let fallbackRestorationAudit = null;

  for (const specification of specifications) {
    let rejectedExitGuidanceVerified = specification.name === "Primary"
      ? "not-applicable-native-unavailable"
      : null;
    const panel = page.getByTestId(specification.testId);
    const enterButton = panel.getByRole("button", {
      name: specification.name + " Plot: Enter Fullscreen",
      exact: true,
    });
    await enterButton.waitFor({ state: "visible", timeout: 30_000 });
    assertBrowser(await enterButton.isEnabled(), specification.name + " fullscreen is disabled");
    const targetId = await enterButton.getAttribute("aria-controls");
    assertBrowser(Boolean(targetId), specification.name + " fullscreen lacks aria-controls");
    assertBrowser(await panel.getAttribute("id") === targetId, specification.name + " targets the wrong card");
    assertBrowser(await enterButton.getAttribute("aria-pressed") === "false", specification.name + " starts pressed");
    const before = await readPanelMetrics(panel);
    assertBrowser(before.actions === 5, specification.name + " does not expose five plot actions");

    if (specification.forceFallback) {
      await panel.evaluate((target) => {
        const outside = [];
        let current = target;
        while (current !== document.body) {
          const parent = current.parentElement;
          if (!parent) throw new Error("forced fallback target is outside document.body");
          for (const sibling of parent.children) {
            if (sibling !== current) outside.push(sibling);
          }
          current = parent;
        }
        window.__openEnaFallbackSmokeSnapshot = {
          target,
          targetRole: target.getAttribute("role"),
          targetAriaModal: target.getAttribute("aria-modal"),
          targetAriaLabel: target.getAttribute("aria-label"),
          bodyOverflow: document.body.style.overflow,
          outside: outside.map((node) => ({
            node,
            inertAttribute: node.getAttribute("inert"),
            inertProperty: node.inert,
            ariaHidden: node.getAttribute("aria-hidden"),
          })),
        };
        window.__openEnaForcedFullscreenRequestCount = 0;
        Object.defineProperty(target, "requestFullscreen", {
          configurable: true,
          value: () => {
            window.__openEnaForcedFullscreenRequestCount += 1;
            return Promise.reject(new Error("forced rejection"));
          },
        });
        if (typeof document.exitFullscreen !== "function") {
          document.documentElement.setAttribute("data-smoke-patched-exit-fullscreen", "true");
          Object.defineProperty(document, "exitFullscreen", {
            configurable: true,
            value: () => Promise.resolve(),
          });
        }
      });
    }
    await enterButton.click();
    await page.waitForFunction((id) => {
      const target = document.getElementById(id);
      return document.fullscreenElement === target
        || target?.getAttribute("data-fallback-fullscreen") === "true";
    }, targetId, { timeout: 30_000 });
    const mode = await panel.evaluate((target) => (
      document.fullscreenElement === target ? "native" : "fallback"
    ));
    if (specification.forceFallback) {
      assertBrowser(mode === "fallback", "forced rejection did not activate the fixed fallback");
      assertBrowser(
        await page.evaluate(() => window.__openEnaForcedFullscreenRequestCount) === 1,
        "the forced requestFullscreen rejection path was not exercised exactly once",
      );
      fallbackModalAudit = await panel.evaluate((target) => {
        const snapshot = window.__openEnaFallbackSmokeSnapshot;
        const outsideIsolated = snapshot.outside.every(({ node }) => (
          node.getAttribute("inert") !== null
          && node.inert === true
          && node.getAttribute("aria-hidden") === "true"
        ));
        return {
          roleDialog: target.getAttribute("role") === "dialog",
          ariaModal: target.getAttribute("aria-modal") === "true",
          ariaLabel: target.getAttribute("aria-label"),
          bodyScrollLocked: document.body.style.overflow === "hidden",
          outsideNodeCount: snapshot.outside.length,
          outsideIsolated,
          focusInside: target.contains(document.activeElement),
        };
      });
      assertBrowser(fallbackModalAudit.roleDialog, "forced fallback target is not a dialog");
      assertBrowser(fallbackModalAudit.ariaModal, "forced fallback target is not aria-modal");
      assertBrowser(Boolean(fallbackModalAudit.ariaLabel), "forced fallback target lacks an accessible name");
      assertBrowser(fallbackModalAudit.bodyScrollLocked, "forced fallback did not lock body scroll");
      assertBrowser(fallbackModalAudit.outsideNodeCount > 0, "forced fallback found no outside DOM to isolate");
      assertBrowser(fallbackModalAudit.outsideIsolated, "forced fallback did not inert and hide all outside branches");
      assertBrowser(fallbackModalAudit.focusInside, "forced fallback focus did not remain inside its dialog");

      const focusCycle = await panel.evaluate((target) => {
        const focusables = [...target.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
          + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )].filter((element) => (
          element.getAttribute("aria-hidden") !== "true"
          && !element.hasAttribute("hidden")
          && element.getClientRects().length > 0
        ));
        if (focusables.length < 2) throw new Error("forced fallback exposes fewer than two focusable controls");
        focusables[0].focus();
        window.__openEnaFallbackFocusCycle = { target, first: focusables[0], last: focusables.at(-1) };
        return { count: focusables.length };
      });
      await page.keyboard.press("Shift+Tab");
      assertBrowser(
        await page.evaluate(() => document.activeElement === window.__openEnaFallbackFocusCycle.last),
        "Shift+Tab did not wrap fallback focus from first to last",
      );
      await panel.evaluate(() => window.__openEnaFallbackFocusCycle.last.focus());
      await page.keyboard.press("Tab");
      assertBrowser(
        await page.evaluate(() => document.activeElement === window.__openEnaFallbackFocusCycle.first),
        "Tab did not wrap fallback focus from last to first",
      );
      const programmaticFocusContained = await page.evaluate(() => {
        const probe = document.createElement("button");
        probe.type = "button";
        probe.textContent = "outside fallback focus probe";
        document.body.append(probe);
        probe.focus();
        const contained = window.__openEnaFallbackFocusCycle.target.contains(document.activeElement);
        probe.remove();
        return contained;
      });
      assertBrowser(programmaticFocusContained, "programmatic outside focus escaped the fallback dialog");
      fallbackModalAudit = {
        ...fallbackModalAudit,
        focusableCount: focusCycle.count,
        shiftTabWrapped: true,
        tabWrapped: true,
        programmaticFocusContained,
      };
    }
    const exitButton = panel.getByRole("button", {
      name: specification.name + " Plot: Exit Fullscreen",
      exact: true,
    });
    await exitButton.waitFor({ state: "visible", timeout: 30_000 });
    assertBrowser(await exitButton.getAttribute("aria-pressed") === "true", specification.name + " fullscreen did not set aria-pressed");
    assertBrowser(await exitButton.getAttribute("aria-controls") === targetId, specification.name + " exit target changed");
    const activeTargets = await page.evaluate(() => ({
      native: document.fullscreenElement?.id ?? null,
      fallback: [...document.querySelectorAll('[data-fallback-fullscreen="true"]')].map((node) => node.id),
    }));
    assertBrowser(
      (activeTargets.native === targetId ? 1 : 0) + activeTargets.fallback.filter((id) => id === targetId).length === 1,
      specification.name + " is not the sole fullscreen target",
    );
    assertBrowser(activeTargets.fallback.every((id) => id === targetId), "another card remained in fallback fullscreen");

    await page.waitForTimeout(300);
    const fullscreen = await readPanelMetrics(panel);
    const viewport = page.viewportSize();
    assertBrowser(Boolean(viewport), "Playwright did not expose the fullscreen viewport");
    assertBrowser(
      fullscreen.target.width >= viewport.width * 0.96
        && fullscreen.target.height >= viewport.height * 0.96,
      specification.name + " card did not cover 96% of the dynamic viewport",
    );
    assertBrowser(fullscreen.actions === 5, specification.name + " fullscreen lost plot actions");
    assertBrowser(fullscreen.header.includes(specification.name + " Plot"), specification.name + " fullscreen lost its heading");
    assertBrowser(fullscreen.canvases.length > 0, specification.name + " fullscreen has no WebGL canvas");
    assertBrowser(
      fullscreen.plotRoot.width > before.plotRoot.width * 1.05
        || fullscreen.plotRoot.height > before.plotRoot.height * 1.05,
      specification.name + " Plotly region did not resize in fullscreen",
    );
    const beforeCanvas = before.canvases.reduce((largest, candidate) => (
      candidate.width * candidate.height > largest.width * largest.height ? candidate : largest
    ), { width: 0, height: 0 });
    const fullscreenCanvas = fullscreen.canvases.reduce((largest, candidate) => (
      candidate.width * candidate.height > largest.width * largest.height ? candidate : largest
    ), { width: 0, height: 0 });
    assertBrowser(
      fullscreenCanvas.width > beforeCanvas.width * 1.05
        || fullscreenCanvas.height > beforeCanvas.height * 1.05,
      specification.name + " WebGL canvas did not resize in fullscreen",
    );
    await panel.screenshot({ path: specification.screenshotPath });

    if (specification.name === "Primary" && mode === "native") {
      const originalExitFullscreen = await page.evaluateHandle(() => document.exitFullscreen);
      const originalExitDescriptor = await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
        return descriptor
          ? {
              hadOwn: true,
              configurable: descriptor.configurable,
              enumerable: descriptor.enumerable,
              writable: descriptor.writable,
            }
          : { hadOwn: false };
      });
      await page.evaluate(() => {
        Object.defineProperty(document, "exitFullscreen", {
          configurable: true,
          value: () => Promise.reject(new Error("forced native exit rejection")),
        });
      });
      await exitButton.click();
      const exitFailureMessage = "Native fullscreen could not close. Press Escape to exit.";
      await page.waitForFunction(({ id, message }) => {
        const target = document.getElementById(id);
        return document.fullscreenElement === target
          && target?.querySelector(".ena-plot-copy-status")?.textContent === message;
      }, { id: targetId, message: exitFailureMessage }, { timeout: 30_000 });
      assertBrowser(
        await exitButton.getAttribute("aria-pressed") === "true",
        "rejected native exit cleared Primary aria-pressed",
      );
      assertBrowser(
        await panel.locator(".ena-plot-copy-status").textContent() === exitFailureMessage,
        "rejected native exit did not expose exact Escape guidance",
      );
      assertBrowser(
        await exitButton.evaluate((element) => document.activeElement === element),
        "rejected native exit moved focus away from the Exit button",
      );
      await page.evaluate(([original, descriptor]) => {
        if (descriptor.hadOwn) {
          Object.defineProperty(document, "exitFullscreen", {
            configurable: descriptor.configurable,
            enumerable: descriptor.enumerable,
            writable: descriptor.writable,
            value: original,
          });
        } else {
          delete document.exitFullscreen;
        }
      }, [originalExitFullscreen, originalExitDescriptor]);
      assertBrowser(
        await page.evaluate((original) => document.exitFullscreen === original, originalExitFullscreen),
        "native exitFullscreen was not restored after rejection audit",
      );
      await originalExitFullscreen.dispose();
      rejectedExitGuidanceVerified = true;
    }

    if (specification.exitMethod === "button") await exitButton.click();
    else await page.keyboard.press("Escape");
    await page.waitForFunction((id) => {
      const target = document.getElementById(id);
      return document.fullscreenElement !== target
        && target?.getAttribute("data-fallback-fullscreen") !== "true";
    }, targetId, { timeout: 30_000 });
    await page.waitForFunction((id) => (
      document.activeElement?.getAttribute("aria-controls") === id
    ), targetId, { timeout: 30_000 });
    const restoredButton = panel.getByRole("button", {
      name: specification.name + " Plot: Enter Fullscreen",
      exact: true,
    });
    assertBrowser(await restoredButton.getAttribute("aria-pressed") === "false", specification.name + " exit did not clear aria-pressed");
    await page.waitForTimeout(300);
    const restored = await readPanelMetrics(panel);
    assertBrowser(
      Math.abs(restored.plotRoot.width - before.plotRoot.width) <= 16
        && Math.abs(restored.plotRoot.height - before.plotRoot.height) <= 16,
      specification.name + " Plotly region did not resize back after fullscreen",
    );
    if (specification.forceFallback) {
      fallbackRestorationAudit = await page.evaluate(() => {
        const snapshot = window.__openEnaFallbackSmokeSnapshot;
        const bodyOverflowRestored = document.body.style.overflow === snapshot.bodyOverflow;
        const outsideAttributesRestored = snapshot.outside.every((entry) => (
          entry.node.getAttribute("inert") === entry.inertAttribute
          && entry.node.inert === entry.inertProperty
          && entry.node.getAttribute("aria-hidden") === entry.ariaHidden
        ));
        const targetAttributesRestored = snapshot.target.getAttribute("role") === snapshot.targetRole
          && snapshot.target.getAttribute("aria-modal") === snapshot.targetAriaModal
          && snapshot.target.getAttribute("aria-label") === snapshot.targetAriaLabel;
        delete window.__openEnaFallbackSmokeSnapshot;
        delete window.__openEnaFallbackFocusCycle;
        return { bodyOverflowRestored, outsideAttributesRestored, targetAttributesRestored };
      });
      assertBrowser(fallbackRestorationAudit.bodyOverflowRestored, "fallback exit did not restore body overflow");
      assertBrowser(fallbackRestorationAudit.outsideAttributesRestored, "fallback exit did not restore outside attributes exactly");
      assertBrowser(fallbackRestorationAudit.targetAttributesRestored, "fallback exit did not restore target dialog attributes exactly");
      await panel.evaluate((target) => {
        delete target.requestFullscreen;
        if (document.documentElement.getAttribute("data-smoke-patched-exit-fullscreen") === "true") {
          document.documentElement.removeAttribute("data-smoke-patched-exit-fullscreen");
          delete document.exitFullscreen;
        }
        delete window.__openEnaForcedFullscreenRequestCount;
      });
      fallbackAudit = {
        card: specification.name,
        mode,
        forcedRequestRejection: true,
        fallbackModalAudit,
        fallbackRestorationAudit,
      };
    }
    const stateAfter = await readScientificState(page);
    assertScientificState(stateAfter, args.baseline, specification.name + " fullscreen lifecycle");
    fullscreenAudits[specification.name.toLowerCase()] = {
      mode,
      exitMethod: specification.exitMethod,
      targetId,
      before,
      fullscreen,
      restored,
      focusRestored: true,
      resizeVerified: true,
      rejectedExitGuidanceVerified,
    };
  }
  return {
    fullscreenAudits,
    fallbackAudit,
    fallbackModalAudit,
    fallbackRestorationAudit,
    browserMessages: browserMessageCapture.finish(),
  };
}

async function exerciseMobileHitTesting(page, args) {
  const browserMessageCapture = beginBrowserMessageCapture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForThreePlots(page);
  const hitTest = async (locator, label) => {
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(60);
    const result = await locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const x = Math.max(0, Math.min(innerWidth - 1, box.left + box.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, box.top + box.height / 2));
      const hit = document.elementFromPoint(x, y);
      return {
        visible: box.width > 0 && box.height > 0,
        withinViewport: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
        hit: hit === element || element.contains(hit),
      };
    });
    assertBrowser(result.visible, label + " has no mobile geometry");
    assertBrowser(result.withinViewport, label + " is clipped at 390px");
    assertBrowser(result.hit, label + " is obscured at its hit-test center");
    return { label, ...result };
  };
  const controls = [];
  controls.push(await hitTest(page.getByTestId("open-ena-data-view-toggle"), "Data View"));
  for (const [testId, plotName] of [
    ["open-ena-3d-comparison-plot", "Comparison"],
    ["open-ena-3d-primary-plot", "Primary"],
    ["open-ena-3d-secondary-plot", "Secondary"],
  ]) {
    const actions = page.getByTestId(testId).locator('[data-ena-plot-action]');
    assertBrowser(await actions.count() === 5, plotName + " mobile toolbar does not have five actions");
    for (let index = 0; index < 5; index += 1) {
      controls.push(await hitTest(actions.nth(index), plotName + " action " + (index + 1)));
    }
  }
  const viewportAudit = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assertBrowser(
    viewportAudit.scrollWidth <= viewportAudit.clientWidth + 1,
    "the 390px workspace has page-level horizontal overflow",
  );
  await page.screenshot({ path: args.mobileScreenshotPath, fullPage: true });
  const stateAfter = await readScientificState(page);
  assertScientificState(stateAfter, args.baseline, "390px hit testing");
  return {
    mobileAudit: "PASS",
    viewport: { width: 390, height: 844, ...viewportAudit },
    hitTest: controls,
    finalScientificState: stateAfter,
    browserMessages: browserMessageCapture.finish(),
  };
}

async function readBrowserRuntimeEvidence(page) {
  const version = page.context().browser()?.version() ?? null;
  const userAgent = await page.evaluate(() => navigator.userAgent);
  if (!version) throw new Error("the Playwright browser runtime did not expose its version");
  if (!userAgent) throw new Error("the browser runtime did not expose its user agent");
  return { version, userAgent };
}

let primaryFailure = null;
let browserOpened = false;
let completedSummary = null;
let baseUrl = null;
let cleanupSucceeded = false;

try {
  execFileSync("npx", ["--version"], { encoding: "utf8", timeout: 30_000 });
  const playwrightCliVersion = runCli(["--version"], "resolve Playwright CLI", 120_000).trim();
  assert.ok(playwrightCliVersion.length > 0, "the Playwright CLI did not expose its version");

  ownsDistDirectory = true;
  const port = await findOpenPort();
  baseUrl = "http://127.0.0.1:" + port;
  removeOwnedDistDirectory();
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
    !key.startsWith("OPEN_ENA_3D_CONTROLS_SMOKE_")
      && ![
        "NEXT_DIST_DIR",
        "OPEN_ENA_USERNAME",
        "OPEN_ENA_PASSWORD",
        "OPEN_ENA_SESSION_SECRET",
      ].includes(key)
  )));
  const ownedEnvironment = {
    ...environment,
    NODE_ENV: "production",
    NEXT_DIST_DIR: ownedDistDirName,
    OPEN_ENA_USERNAME: username,
    OPEN_ENA_PASSWORD: password,
    OPEN_ENA_SESSION_SECRET: sessionSecret,
    OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS: "1",
  };
  const logFd = openSync(serverLogPath, "w");
  try {
    process.stdout.write("[3D controls smoke] build production application ... ");
    execFileSync(
      "npm",
      ["run", "build"],
      {
        cwd: projectRoot,
        env: ownedEnvironment,
        stdio: ["ignore", logFd, logFd],
        timeout: 600_000,
      },
    );
    process.stdout.write("PASS\n");
    ownedServer = spawn(
      "npm",
      ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        cwd: projectRoot,
        detached: process.platform !== "win32",
        env: ownedEnvironment,
        stdio: ["ignore", logFd, logFd],
      },
    );
  } finally {
    closeSync(logFd);
  }
  if (!ownedServer) throw new Error("The smoke-owned production server did not start.");
  ownedServer.once("error", (error) => {
    process.stderr.write("[3D controls smoke] server error: " + redact(error.message) + "\n");
  });
  await waitForServer(baseUrl + "/en/open-ena");

  browserSessionAttempted = true;
  runCli(["open", "about:blank", "--browser", smokeBrowser], "open browser", 120_000);
  browserOpened = true;
  const browserRuntimeEvidence = runBrowserPhase(
    "record browser runtime identity",
    readBrowserRuntimeEvidence,
  );
  const fixtureCsv = buildEndpointFixtureCsv();
  const modelAudit = runBrowserPhase(
    "authenticate, build the synthetic 5-code Endpoint, and open linked 3D",
    authenticateBuildAndOpen3d,
    {
      entryUrl: baseUrl + "/en/open-ena",
      username,
      password,
      fixtureCsv,
      modelType: fixtureContract.modelType,
    },
    180_000,
    [assertBrowser, beginBrowserMessageCapture, waitForThreePlots, readScientificState],
  );
  assert.equal(modelAudit.baseline.analysisRunCount, 1);
  assert.match(modelAudit.baseline.resultIdentity, /^[a-f0-9]{64}$/u);

  const groupDisplayAudit = runBrowserPhase(
    "exercise group/unit visibility and Mean, CI, Outlier, and Include Hidden across 2D/3D",
    exerciseGroupDisplayControls,
    {
      baseline: modelAudit.baseline,
      groups: fixtureContract.groups,
    },
    240_000,
    [
      assertBrowser,
      beginBrowserMessageCapture,
      waitForThreePlots,
      readScientificState,
      readThreeDGroupDisplayState,
      readTwoDGroupDisplayState,
      assertScientificState,
    ],
  );
  assert.equal(groupDisplayAudit.analysisRunCount, 1);
  assert.equal(groupDisplayAudit.finalScientificState.resultIdentity, modelAudit.baseline.resultIdentity);

  const dataViewAudit = runBrowserPhase(
    "exercise 3D Data View by mouse and keyboard without rerunning",
    exerciseDataView,
    {
      baseline: modelAudit.baseline,
      codes: fixtureContract.codes,
      dataViewScreenshotPath,
    },
    180_000,
    [
      assertBrowser,
      beginBrowserMessageCapture,
      waitForThreePlots,
      readScientificState,
      assertScientificState,
    ],
  );
  const fullscreenAudit = runBrowserPhase(
    "exercise three per-card fullscreen controls and forced rejection fallback",
    exerciseFullscreenCards,
    {
      baseline: modelAudit.baseline,
      comparisonFullscreenScreenshotPath,
      primaryFullscreenScreenshotPath,
      secondaryFullscreenScreenshotPath,
    },
    240_000,
    [
      assertBrowser,
      beginBrowserMessageCapture,
      readScientificState,
      assertScientificState,
      readPanelMetrics,
    ],
  );
  assert.equal(fullscreenAudit.fallbackAudit?.forcedRequestRejection, true);
  const mobileAudit = runBrowserPhase(
    "verify 390px Data View and all fifteen plot-action hit targets",
    exerciseMobileHitTesting,
    { baseline: modelAudit.baseline, mobileScreenshotPath },
    180_000,
    [
      assertBrowser,
      beginBrowserMessageCapture,
      waitForThreePlots,
      readScientificState,
      assertScientificState,
    ],
  );
  const browserErrors = classifyBrowserMessages([
    modelAudit.browserMessages,
    groupDisplayAudit.browserMessages,
    dataViewAudit.browserMessages,
    fullscreenAudit.browserMessages,
    mobileAudit.browserMessages,
  ], {
    browser: smokeBrowser,
    currentHref: baseUrl + "/en/open-ena",
    currentOrigin: baseUrl,
  });
  assert.deepEqual(browserErrors.consoleErrors, [], "browser console contains errors");
  assert.deepEqual(browserErrors.unknownWarnings, [], "browser console contains unclassified warnings");
  assert.equal(browserErrors.unknownConsoleWarnings, 0);
  assert.equal(browserErrors.consoleWarningsTotal, browserErrors.classifiedPlatformWarnings);
  assert.deepEqual(browserErrors.pageErrors, [], "browser emitted page errors");
  const cliConsole = runCli(["console", "error"], "read Playwright console summary");
  assert.match(cliConsole, /Errors:\s*0/u, "Playwright reported browser console errors");
  const cliWarningCount = Number(cliConsole.match(/Warnings:\s*(\d+)/u)?.[1] ?? -1);
  assert.equal(
    cliWarningCount,
    browserErrors.platformDiagnostics.canvas2dReadback.length
      + browserErrors.platformDiagnostics.angleReadPixels.length,
    "Playwright reported a warning outside the exact Canvas2D/ANGLE diagnostics",
  );

  const { browserMessages: _groupDisplayBrowserMessages, ...portableGroupDisplayAudit } = groupDisplayAudit;
  const { browserMessages: _dataViewBrowserMessages, ...portableDataViewAudit } = dataViewAudit;
  const { browserMessages: _fullscreenBrowserMessages, ...portableFullscreenAudit } = fullscreenAudit;
  const { browserMessages: _mobileBrowserMessages, ...portableMobileAudit } = mobileAudit;

  completedSummary = {
    status: "PASS",
    browser: smokeBrowser,
    playwrightCliSource: playwrightCli.source,
    playwrightCliVersion,
    runtimeBrowserVersion: browserRuntimeEvidence.version,
    runtimeBrowserUserAgent: browserRuntimeEvidence.userAgent,
    baseUrl,
    serverLifecycle: "owned-production",
    fixture: {
      modelType: fixtureContract.modelType,
      codeCount: fixtureContract.codes.length,
      groupCount: fixtureContract.groups.length,
      rawRowCount: fixtureCsv.trim().split("\n").length - 1,
    },
    baseline: modelAudit.baseline,
    groupDisplay: portableGroupDisplayAudit,
    dataView: portableDataViewAudit,
    fullscreen: portableFullscreenAudit,
    mobile: portableMobileAudit,
    browserMessages: {
      consoleErrors: 0,
      consoleWarningsTotal: browserErrors.consoleWarningsTotal,
      unknownConsoleWarnings: browserErrors.unknownConsoleWarnings,
      classifiedPlatformWarnings: browserErrors.classifiedPlatformWarnings,
      pageErrors: 0,
      platformDiagnostics: browserErrors.platformDiagnostics,
    },
    screenshots: {
      dataView: artifactEvidence(dataViewScreenshotPath),
      comparisonFullscreen: artifactEvidence(comparisonFullscreenScreenshotPath),
      primaryFullscreen: artifactEvidence(primaryFullscreenScreenshotPath),
      secondaryFullscreen: artifactEvidence(secondaryFullscreenScreenshotPath),
      mobile: artifactEvidence(mobileScreenshotPath),
    },
    artifacts: ".",
  };
} catch (caught) {
  primaryFailure = caught;
  if (browserOpened) {
    try {
      runCli(
        ["screenshot", "--filename", failureScreenshotPath],
        "capture failure screenshot",
        30_000,
      );
    } catch {
      // Preserve the primary failure.
    }
  }
  const serverLog = readServerLogTail();
  if (serverLog) process.stderr.write("[3D controls smoke] server log tail:\n" + serverLog + "\n");
} finally {
  try {
    await cleanupOwnedResources();
    cleanupSucceeded = true;
  } catch (cleanupError) {
    try {
      removeUnsafeServerLog();
    } catch (removalError) {
      process.stderr.write("[3D controls smoke] unsafe server log removal after cleanup failure also failed: "
        + redact(removalError) + "\n");
    }
    if (primaryFailure) {
      process.stderr.write("[3D controls smoke] cleanup failure: " + redact(cleanupError) + "\n");
    } else {
      primaryFailure = cleanupError;
    }
  }
}

let serverLogReceipt = null;
if (cleanupSucceeded) {
  try {
    const finalServerLogExists = sanitizeFinalServerLog();
    if (finalServerLogExists) serverLogReceipt = artifactEvidence(serverLogPath);
  } catch (sanitizationError) {
    let removalError = null;
    try {
      removeUnsafeServerLog();
    } catch (caught) {
      removalError = caught;
    }
    const custodyFailure = new Error(
      "Final server log sanitization failed"
        + (removalError ? " and the unsafe log could not be removed." : "; the unsafe log was removed.")
        + " " + redact(sanitizationError instanceof Error ? sanitizationError.message : sanitizationError),
    );
    if (primaryFailure) {
      process.stderr.write("[3D controls smoke] " + custodyFailure.message + "\n");
    } else {
      primaryFailure = custodyFailure;
    }
  }
}

if (primaryFailure) throw primaryFailure;
assert.ok(completedSummary, "the 3D controls smoke did not produce a completed evidence summary");
assert.ok(serverLogReceipt, "the completed smoke omitted its sanitized final server log receipt");
completedSummary.serverLog = serverLogReceipt;
const sourceEvidenceAfter = readGitEvidence();
assert.equal(sourceEvidenceAfter.gitHead, sourceEvidenceBefore.gitHead, "Git HEAD changed during browser evidence capture");
assert.equal(sourceEvidenceAfter.gitTree, sourceEvidenceBefore.gitTree, "Git tree changed during browser evidence capture");
assert.equal(sourceEvidenceAfter.clean, true, "source worktree is dirty after browser evidence cleanup");
completedSummary.source = {
  gitHead: sourceEvidenceBefore.gitHead,
  gitTree: sourceEvidenceBefore.gitTree,
  worktreeCleanBefore: sourceEvidenceBefore.clean,
  worktreeCleanAfter: sourceEvidenceAfter.clean,
  smokeSourceSha256,
};
assert.equal(existsSync(failureScreenshotPath), false, "successful smoke retained failure.png");
const artifactInventory = assertArtifactInventoryBeforeSummary();
completedSummary.artifactInventory = artifactInventory;
writeFileSync(
  summaryPath,
  JSON.stringify(completedSummary, null, 2) + "\n",
);
const finalFiles = readdirSync(artifactDirectory, { withFileTypes: true })
  .map((entry) => entry.name)
  .sort();
try {
  assert.deepEqual(finalFiles, artifactInventory.finalExpectedFiles, "final artifact inventory is not the declared seven files");
} catch (inventoryError) {
  rmSync(summaryPath, { force: true });
  throw inventoryError;
}
process.stdout.write(JSON.stringify(completedSummary, null, 2) + "\n");
