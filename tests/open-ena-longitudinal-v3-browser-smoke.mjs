#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createSafePlaywrightCliError } from "./support/safe-playwright-cli-error.mjs";

const smokeSourcePath = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(smokeSourcePath), "..");
const tsconfigPath = join(projectRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const artifactDirectory = resolve(
  process.env.OPEN_ENA_LONGITUDINAL_SMOKE_ARTIFACT_DIR
    || join(projectRoot, "output", "playwright", "open-ena-longitudinal-v3-smoke"),
);
const downloadDirectory = join(artifactDirectory, "downloads");
const serverLogPath = join(artifactDirectory, "next-server.log");
const failureScreenshotPath = join(artifactDirectory, "failure.png");
const username = process.env.OPEN_ENA_LONGITUDINAL_SMOKE_USERNAME
  || "open_ena_longitudinal_smoke_researcher";
const password = process.env.OPEN_ENA_LONGITUDINAL_SMOKE_PASSWORD
  || "open_ena_longitudinal_smoke_password_2026";
const sessionSecret = "open_ena_longitudinal_smoke_session_secret_0123456789abcdef";
const sessionName = "open-ena-longitudinal-v3-smoke-" + process.pid;
const smokeBrowser = process.env.OPEN_ENA_LONGITUDINAL_SMOKE_BROWSER || "chromium";
const externalBaseUrl = process.env.OPEN_ENA_LONGITUDINAL_SMOKE_BASE_URL?.replace(/\/+$/u, "") || null;
const ownedDistDirName = ".next-longitudinal-smoke-" + process.pid;
const ownedDistDirectory = join(projectRoot, ownedDistDirName);
const cameraPresets = ["isometric", "xy", "xz", "yz", "yx", "zx", "zy"];
const expectedCameraLabels = {
  isometric: "ISOMETRIC",
  xy: "XY",
  xz: "XZ",
  yz: "YZ",
  yx: "YX",
  zx: "ZX",
  zy: "ZY",
};
const expectedCameraStates = {
  isometric: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 1.45 / 1.5, y: 1.45 / 1.5, z: 1.25 / 1.5 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "perspective" },
  },
  xy: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: 2.5 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "orthographic" },
  },
  xz: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 2.5, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "orthographic" },
  },
  yz: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 2.5, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "orthographic" },
  },
  yx: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: -2.5 },
    up: { x: 1, y: 0, z: 0 },
    projection: { type: "orthographic" },
  },
  zx: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 2.5, z: 0 },
    up: { x: 1, y: 0, z: 0 },
    projection: { type: "orthographic" },
  },
  zy: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: -2.5, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "orthographic" },
  },
};
const twoDimensionalProjections = ["xy", "xz", "yz", "yx", "zx", "zy"];
const viewportMatrix = [
  { width: 1440, height: 1000, name: "desktop" },
  { width: 1024, height: 768, name: "tablet" },
  { width: 390, height: 844, name: "mobile" },
];
const expectedCodeLabels = ["TE", "EX", "IN", "RE", "SP", "TP"];

assert.ok(
  ["chromium", "chrome", "firefox", "webkit", "msedge"].includes(smokeBrowser),
  "OPEN_ENA_LONGITUDINAL_SMOKE_BROWSER must name chromium, chrome, firefox, webkit, or msedge.",
);
assert.ok(ownedDistDirName.startsWith(".next-longitudinal-smoke-"));

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

mkdirSync(downloadDirectory, { recursive: true });

function redact(value) {
  return String(value ?? "")
    .replaceAll(username, "[redacted-username]")
    .replaceAll(password, "[redacted-password]")
    .replaceAll(sessionSecret, "[redacted-session-secret]");
}

function runCli(args, label, timeout = 120_000) {
  try {
    return execFileSync(
      playwrightCli.command,
      [...playwrightCli.prefix, "--session", sessionName, ...args],
      {
        cwd: artifactDirectory,
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

function browserSource(task, args, helpers = []) {
  const helperDeclarations = helpers.map((helper) => helper.toString()).join("\n");
  return "async (page) => { " + helperDeclarations + "; const task = " + task.toString()
    + "; return await task(page, " + JSON.stringify(args) + "); }";
}

function runBrowserPhase(label, task, args = {}, timeout = 180_000, helpers = []) {
  process.stdout.write("[longitudinal V3 smoke] " + label + " ... ");
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
  assert.ok(basename(ownedDistDirectory).startsWith(".next-longitudinal-smoke-"));
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
  const portableFile = relativePath.split(sep).join("/");
  return {
    file: portableFile,
    bytes: statSync(absolutePath).size,
    sha256: sha256(readFileSync(absolutePath)),
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
assert.equal(
  sourceEvidenceBefore.clean,
  true,
  "longitudinal browser evidence requires a clean source worktree",
);
const smokeSourceSha256 = sha256(readFileSync(smokeSourcePath));

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
    return Object.is(value, -0) ? "-0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  assert.equal(typeof value, "object");
  assert.notEqual(value, undefined);
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) => {
    assert.notEqual(value[key], undefined);
    return JSON.stringify(key) + ":" + canonicalJson(value[key]);
  }).join(",") + "}";
}

function hashAnalysisValueV1(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function safeArchiveMember(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.startsWith("/")
    && !path.includes("\\")
    && !path.split("/").includes("..");
}

function extractAndVerifyBundle(zipPath, kind, participantLevelIncluded) {
  assert.ok(existsSync(zipPath), kind + " ZIP is missing");
  assert.ok(statSync(zipPath).size > 0, kind + " ZIP is empty");
  execFileSync("unzip", ["-t", zipPath], { encoding: "utf8", timeout: 30_000 });
  const extracted = join(downloadDirectory, "extracted-" + kind);
  if (existsSync(extracted)) rmSync(extracted, { recursive: true, force: true });
  mkdirSync(extracted, { recursive: true });
  execFileSync("unzip", ["-qq", "-o", zipPath, "-d", extracted], {
    encoding: "utf8",
    timeout: 30_000,
  });
  const manifestPath = join(extracted, "provenance-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, "3dena.longitudinal-provenance-manifest.v2");
  assert.equal(manifest.participantLevelIncluded, participantLevelIncluded);
  assert.ok(Array.isArray(manifest.members) && manifest.members.length >= 5);
  for (const requiredMember of [
    "analysis.json",
    "trajectory-path.csv",
    "trajectory-metadata.csv",
    "trajectory-inference.csv",
    "plotly-spec.json",
  ]) {
    assert.equal(
      manifest.members.some((member) => member.path === requiredMember),
      true,
      kind + " ZIP omitted required contract member " + requiredMember,
    );
  }
  assert.equal(
    manifest.members.some((member) => member.path === "trajectory-bootstrap.csv"),
    false,
    kind + " trajectory ZIP still contains a bootstrap CSV",
  );
  assert.equal(manifest.contentSetHash, hashAnalysisValueV1(manifest.members));
  const expectedFiles = [
    ...manifest.members.map((member) => member.path),
    "provenance-manifest.json",
  ].sort();
  assert.ok(expectedFiles.every(safeArchiveMember), kind + " ZIP contains an unsafe member path");
  assert.deepEqual(readdirSync(extracted).sort(), expectedFiles);
  for (const member of manifest.members) {
    assert.ok(safeArchiveMember(member.path));
    const memberBytes = readFileSync(join(extracted, member.path));
    assert.equal(memberBytes.byteLength, member.byteLength, kind + ":" + member.path + " length");
    assert.equal(sha256(memberBytes), member.sha256, kind + ":" + member.path + " SHA-256");
  }
  assert.equal(
    manifest.members.some((member) => member.path === "trajectory-participants.csv"),
    participantLevelIncluded,
  );
  const analysis = JSON.parse(readFileSync(join(extracted, "analysis.json"), "utf8"));
  const plotly = JSON.parse(readFileSync(join(extracted, "plotly-spec.json"), "utf8"));
  assert.equal(analysis.identity.resultHash, manifest.resultHash);
  assert.equal(plotly.resultHash, manifest.resultHash);
  assert.equal(analysis.privacy.participantLevelIncluded, false);
  assert.equal(
    plotly.data.filter((trace) => trace.meta?.role === "network-edge").length,
    0,
    kind + " trajectory Plotly export contains ENA mean-network edges",
  );
  assert.equal(
    plotly.data.filter((trace) => trace.meta?.role === "network-node").length,
    1,
    kind + " trajectory Plotly export omitted fitted code references",
  );
  const participantTraceCount = plotly.data.filter((trace) => trace.meta?.role === "participant").length;
  const individualPathTraceCount = plotly.data.filter((trace) => trace.meta?.role === "individual-path").length;
  if (participantLevelIncluded) {
    assert.ok(participantTraceCount > 0, kind + " opt-in Plotly export omitted participant points");
    assert.match(manifest.privacyWarning ?? "", /privacy|re-identification/iu);
  } else {
    assert.equal(participantTraceCount, 0, kind + " aggregate Plotly export leaked participant points");
    assert.equal(individualPathTraceCount, 0, kind + " aggregate Plotly export leaked individual paths");
    assert.equal(JSON.stringify(plotly).includes("participantCanonical"), false);
  }
  return {
    extracted,
    manifest,
    analysis,
    plotly,
    participantTraceCount,
    individualPathTraceCount,
    zipSha256: sha256(readFileSync(zipPath)),
  };
}

function verifyStandaloneDownloads(downloads, aggregate) {
  const mapping = [
    ["path", "trajectory-path.csv"],
    ["metadata", "trajectory-metadata.csv"],
    ["inference", "trajectory-inference.csv"],
    ["analysis", "analysis.json"],
    ["plotly", "plotly-spec.json"],
  ];
  for (const [kind, member] of mapping) {
    const path = downloads[kind];
    assert.ok(path && existsSync(path), "standalone " + kind + " download is missing");
    const standaloneBytes = readFileSync(path);
    const bundleBytes = readFileSync(join(aggregate.extracted, member));
    assert.equal(sha256(standaloneBytes), sha256(bundleBytes), kind + " differs from aggregate ZIP");
  }
}

let ownedServer = null;
let ownsDistDirectory = false;
let browserSessionAttempted = false;
let cleanupPromise = null;

function cleanupOwnedResources() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    let browserCleanupError = null;
    if (browserSessionAttempted) {
      try {
        runCli(["close"], "close browser session", 30_000);
      } catch (caught) {
        browserCleanupError = caught;
      }
    }
    await stopOwnedServer(ownedServer);
    if (ownsDistDirectory) {
      // Next appends the custom dist directory to tsconfig.json during build.
      // This smoke owns that temporary build, so it must restore the exact
      // pre-run config before deleting the matching dist directory.
      writeFileSync(tsconfigPath, originalTsconfig, "utf8");
      removeOwnedDistDirectory();
    }
    if (browserCleanupError) throw browserCleanupError;
  })();
  return cleanupPromise;
}

async function handleSignal(signal) {
  const exitCode = signal === "SIGINT" ? 130 : 143;
  try {
    await cleanupOwnedResources();
  } catch (caught) {
    process.stderr.write("[longitudinal V3 smoke] cleanup after " + signal + " failed: "
      + redact(caught) + "\n");
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void handleSignal("SIGINT"));
process.once("SIGTERM", () => void handleSignal("SIGTERM"));

async function authenticateAndRunTrajectory(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const installTaskRequestAudit = () => {
    if (window.__openEnaLongitudinalSmokeTaskAudit) return;
    const audit = {
      taskRequestCount: 0,
      workerRunCount: 0,
      remotePostCount: 0,
      aiPostCount: 0,
      bootstrapTaskCount: 0,
      networkOverlayTaskCount: 0,
    };
    Object.defineProperty(window, "__openEnaLongitudinalSmokeTaskAudit", {
      configurable: true,
      value: audit,
    });
    const originalWorkerPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function auditedWorkerPostMessage(message, ...rest) {
      if (message?.kind === "run" && message?.request?.pathTask) {
        audit.workerRunCount += 1;
        audit.taskRequestCount += 1;
        if (Object.hasOwn(message.request, "bootstrapTask")) audit.bootstrapTaskCount += 1;
        if (Object.hasOwn(message.request, "networkOverlayTask")) audit.networkOverlayTaskCount += 1;
      }
      return originalWorkerPostMessage.call(this, message, ...rest);
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = String(init?.method || (typeof input === "object" && input && "method" in input
        ? input.method
        : "GET")).toUpperCase();
      const pathname = new URL(url, window.location.href).pathname;
      if (method === "POST" && pathname === "/api/open-ena/ai-interpretation") {
        audit.aiPostCount += 1;
      }
      if (method === "POST" && pathname === "/api/open-ena/longitudinal") {
        audit.remotePostCount += 1;
        audit.taskRequestCount += 1;
        try {
          const payload = typeof init?.body === "string" ? JSON.parse(init.body) : null;
          if (payload?.request && Object.hasOwn(payload.request, "bootstrapTask")) {
            audit.bootstrapTaskCount += 1;
          }
          if (payload?.request && Object.hasOwn(payload.request, "networkOverlayTask")) {
            audit.networkOverlayTaskCount += 1;
          }
        } catch {
          // Route validation remains authoritative for malformed request bodies.
        }
      }
      return await originalFetch(input, init);
    };
  };
  await page.addInitScript(installTaskRequestAudit);
  await page.evaluate(installTaskRequestAudit);
  page.__openEnaLongitudinalConsoleErrors = [];
  page.__openEnaLongitudinalConsoleWarnings = [];
  page.__openEnaLongitudinalPageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") page.__openEnaLongitudinalConsoleErrors.push(message.text());
    if (message.type() === "warning") {
      page.__openEnaLongitudinalConsoleWarnings.push({
        text: message.text(),
        location: message.location(),
      });
    }
  });
  page.on("pageerror", (error) => {
    page.__openEnaLongitudinalPageErrors.push(error.message);
  });

  await page.getByRole("textbox", { name: "Account name" }).fill(args.username);
  await page.getByRole("textbox", { name: "Password" }).fill(args.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.waitFor({ timeout: 30_000 });
  const dataButton = rail.getByRole("button", { name: "Data", exact: true });
  const trajectorySampleButton = page.getByRole("button", {
    name: "Load 2D trajectory sample",
    exact: true,
  });
  let dataPanelVisible = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dataButton.click();
    dataPanelVisible = await trajectorySampleButton
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (dataPanelVisible) break;
  }
  assertBrowser(dataPanelVisible, "the trajectory sample panel did not remain active after authentication");
  await trajectorySampleButton.click();
  const workbench = page.getByTestId("open-ena-longitudinal-v3-workbench");
  await workbench.waitFor({ timeout: 60_000 });
  assertBrowser(
    await page.getByTestId("open-ena-center-surface").count() === 0,
    "the first post-fit screen fell through to the generic ENA presenter",
  );

  const plotTools = rail.getByRole("button", { name: "Plot Tools", exact: true });
  await plotTools.click();
  await workbench.locator('[data-trajectory-step="1"]').waitFor({ timeout: 30_000 });
  const identity = workbench.getByRole("checkbox", {
    name: /same raw ID represents the same physical entity/u,
  });
  if (!await identity.isChecked()) await identity.check();
  const ciUiCount = await workbench.getByText(/Bootstrap|confidence interval|confidence level|resampling design/iu).count()
    + await workbench.getByTestId("open-ena-longitudinal-v3-bootstrap").count()
    + await workbench.getByRole("button", { name: "Bootstrap CSV", exact: true }).count();
  assertBrowser(ciUiCount === 0, "trajectory CI/bootstrap UI is still visible");

  await workbench.getByRole("button", { name: "Run trajectory analysis", exact: true }).click();
  const continueLocal = workbench.getByRole("button", { name: "Continue locally", exact: true });
  const remoteConfirmationVisible = await continueLocal
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (remoteConfirmationVisible) {
    await continueLocal.click();
  }
  await workbench.locator("[data-state=complete]").waitFor({ timeout: 120_000 });
  const postRunCiUiCount = await workbench.getByText(/Bootstrap|confidence interval|confidence level|resampling design/iu).count()
    + await workbench.getByTestId("open-ena-longitudinal-v3-bootstrap").count()
    + await workbench.getByRole("button", { name: "Bootstrap CSV", exact: true }).count();
  assertBrowser(postRunCiUiCount === 0, "trajectory CI/bootstrap UI is still visible after execution");
  const plot = page.getByTestId("open-ena-longitudinal-v3-plot");
  await plot.waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-testid=open-ena-longitudinal-v3-plot]");
    return Boolean(root && root._fullLayout && Array.isArray(root.data) && root.data.length > 0);
  }, null, { timeout: 30_000 });

  const plotAudit = await plot.evaluate((root, codes) => {
    const traces = Array.isArray(root.data) ? root.data : [];
    const allowedRoles = new Set([
      "participant", "individual-path", "centroid", "trajectory-path",
      "direction-arrow", "network-node", "axis-shaft",
      "axis-arrowhead",
    ]);
    const codeTrace = traces.find((trace) => trace.meta?.role === "network-node");
    const displayedCodes = Array.isArray(codeTrace?.text) ? codeTrace.text.map(String) : [];
    const centroidTraces = traces.filter((trace) => trace.meta?.role === "centroid");
    const trajectoryTraces = traces.filter((trace) => trace.meta?.role === "trajectory-path");
    const resultHashes = [...new Set(traces.map((trace) => trace.meta?.resultHash).filter(Boolean))];
    return {
      displayedCodes,
      codesPresent: codes.every((code) => displayedCodes.includes(code)),
      centroidSquares: centroidTraces.length > 0
        && centroidTraces.every((trace) => trace.marker?.symbol === "square" && trace.marker?.size === 7),
      blackTrajectories: trajectoryTraces.length > 0
        && trajectoryTraces.every((trace) => ["black", "#000", "#000000", "rgb(0, 0, 0)"].includes(trace.line?.color)),
      lineOnlyTrajectories: trajectoryTraces.length > 0
        && trajectoryTraces.every((trace) => trace.mode === "lines" && trace.marker === undefined),
      participantTraceCount: traces.filter((trace) => trace.meta?.role === "participant").length,
      directionArrowTraceCount: traces.filter((trace) => trace.meta?.role === "direction-arrow").length,
      networkEdgeTraceCount: traces.filter((trace) => trace.meta?.role === "network-edge").length,
      uncertaintyTraceCount: traces.filter((trace) => trace.meta?.role === "uncertainty").length,
      errorBarTraceCount: traces.filter((trace) => (
        trace.error_x !== undefined || trace.error_y !== undefined || trace.error_z !== undefined
        || Object.keys(trace).some((key) => key.startsWith("error_"))
      )).length,
      unknownTraceRoles: traces
        .map((trace) => trace.meta?.role)
        .filter((role) => typeof role !== "string" || !allowedRoles.has(role)),
      resultHashes,
      taskRequestCount: window.__openEnaLongitudinalSmokeTaskAudit?.taskRequestCount ?? 0,
    };
  }, args.expectedCodes);
  assertBrowser(plotAudit.codesPresent, "the trajectory plot omitted fitted ENA code labels");
  assertBrowser(plotAudit.centroidSquares, "trajectory centroids are not 7px square markers");
  assertBrowser(plotAudit.blackTrajectories, "trajectory path lines are not black");
  assertBrowser(plotAudit.lineOnlyTrajectories, "trajectory paths still duplicate centroid square markers");
  assertBrowser(plotAudit.participantTraceCount > 0, "trajectory plot omitted participant-period/time-point points");
  assertBrowser(plotAudit.directionArrowTraceCount > 0, "trajectory plot omitted direction arrows");
  assertBrowser(plotAudit.networkEdgeTraceCount === 0, "trajectory plot still contains ENA mean-network edges");
  assertBrowser(plotAudit.uncertaintyTraceCount === 0, "trajectory analysis still plots CI geometry");
  assertBrowser(plotAudit.errorBarTraceCount === 0, "trajectory analysis still plots XYZ/error-bar geometry");
  assertBrowser(plotAudit.unknownTraceRoles.length === 0, "trajectory plot contains an unsupported rectangle/box trace role");
  assertBrowser(plotAudit.resultHashes.length === 1, "plot traces do not share one immutable result hash");
  assertBrowser(plotAudit.taskRequestCount === 1, "the trajectory analysis did not submit exactly one scientific task");
  const bootstrapTaskCount = await page.evaluate(() => (
    window.__openEnaLongitudinalSmokeTaskAudit?.bootstrapTaskCount ?? -1
  ));
  assertBrowser(bootstrapTaskCount === 0, "trajectory scientific request still contains bootstrapTask");
  plotAudit.bootstrapTaskCount = bootstrapTaskCount;
  const networkOverlayTaskCount = await page.evaluate(() => (
    window.__openEnaLongitudinalSmokeTaskAudit?.networkOverlayTaskCount ?? -1
  ));
  assertBrowser(networkOverlayTaskCount === 0, "trajectory scientific request still contains networkOverlayTask");
  plotAudit.networkOverlayTaskCount = networkOverlayTaskCount;
  return plotAudit;
}

async function exerciseNonPlotRailPanels(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  const workbench = page.getByTestId("open-ena-longitudinal-v3-workbench");
  const analysisSlot = page.getByTestId("open-ena-longitudinal-v3-analysis-controls");
  const trajectorySlot = page.getByTestId("open-ena-longitudinal-v3-trajectory-controls");
  await analysisSlot.waitFor({ state: "hidden", timeout: 15_000 });
  await trajectorySlot.waitFor({ state: "visible", timeout: 15_000 });
  assertBrowser(await analysisSlot.count() === 1, "Plot mode unmounted the persistent analysis controls");
  assertBrowser(await trajectorySlot.count() === 1, "Plot mode unmounted the trajectory controls");

  await page.evaluate(() => {
    const mountedWorkbench = document.querySelector('[data-testid="open-ena-longitudinal-v3-workbench"]');
    const plot = document.querySelector('[data-testid="open-ena-longitudinal-v3-plot"]');
    const aiLifecycle = document.querySelector('[data-testid="open-ena-persistent-ai-lifecycle"]');
    const aiRoot = aiLifecycle?.querySelector(".ena-ai-interpretation");
    const consent = aiLifecycle?.querySelector('[data-ena-ai-consent="explicit"] input[type="checkbox"]');
    if (!mountedWorkbench || !plot || !aiLifecycle || !aiRoot || !consent) {
      throw new Error("AI lifecycle baseline is incomplete");
    }
    const token = "ai-lifecycle-" + crypto.randomUUID();
    for (const node of [mountedWorkbench, plot, aiRoot, consent]) {
      node.__openEnaLifecycleToken = token;
    }
    window.__openEnaAiLifecycleAudit = {
      token,
      workbench: mountedWorkbench,
      plot,
      aiRoot,
      consent,
      baselineAiPostCount: window.__openEnaLongitudinalSmokeTaskAudit?.aiPostCount ?? 0,
    };
  });

  const readAiLifecycle = async (transition) => await page.evaluate((label) => {
    const audit = window.__openEnaAiLifecycleAudit;
    const currentWorkbench = document.querySelector('[data-testid="open-ena-longitudinal-v3-workbench"]');
    const currentPlot = document.querySelector('[data-testid="open-ena-longitudinal-v3-plot"]');
    const currentAiLifecycle = document.querySelector('[data-testid="open-ena-persistent-ai-lifecycle"]');
    const currentAiRoot = currentAiLifecycle?.querySelector(".ena-ai-interpretation");
    const currentConsent = currentAiLifecycle?.querySelector('[data-ena-ai-consent="explicit"] input[type="checkbox"]');
    const aiPostCount = window.__openEnaLongitudinalSmokeTaskAudit?.aiPostCount ?? -1;
    return {
      transition: label,
      token: audit?.token ?? null,
      workbenchSame: currentWorkbench === audit.workbench,
      plotSame: currentPlot === audit.plot,
      aiRootSame: currentAiRoot === audit.aiRoot,
      consentSame: currentConsent === audit.consent,
      workbenchToken: currentWorkbench?.__openEnaLifecycleToken ?? null,
      plotToken: currentPlot?.__openEnaLifecycleToken ?? null,
      aiRootToken: currentAiRoot?.__openEnaLifecycleToken ?? null,
      consentToken: currentConsent?.__openEnaLifecycleToken ?? null,
      aiLifecycleCount: document.querySelectorAll('[data-testid="open-ena-persistent-ai-lifecycle"]').length,
      aiRootCount: document.querySelectorAll(".ena-ai-interpretation").length,
      consentCount: document.querySelectorAll('[data-ena-ai-consent="explicit"] input[type="checkbox"]').length,
      consentEnabled: currentConsent ? !currentConsent.disabled : false,
      consentChecked: currentConsent?.checked ?? false,
      aiPostCount,
      baselineAiPostCount: audit?.baselineAiPostCount ?? -1,
      aiPostCountMatches: aiPostCount === audit.baselineAiPostCount,
      taskRequestCount: window.__openEnaLongitudinalSmokeTaskAudit?.taskRequestCount ?? -1,
    };
  }, transition);

  const assertAiLifecycle = (audit, transition, expectedConsentChecked) => {
    assertBrowser(audit.workbenchSame, transition + " remounted the V3 workbench");
    assertBrowser(audit.plotSame, transition + " replaced the Plotly presenter root");
    assertBrowser(audit.aiRootSame, transition + " remounted the AI interpretation root");
    assertBrowser(audit.consentSame, transition + " replaced the AI consent control");
    assertBrowser(audit.aiLifecycleCount === 1, transition + " duplicated the AI lifecycle wrapper");
    assertBrowser(audit.aiRootCount === 1, transition + " duplicated the AI interpretation root");
    assertBrowser(audit.consentCount === 1, transition + " duplicated the AI consent control");
    assertBrowser([
      audit.workbenchToken,
      audit.plotToken,
      audit.aiRootToken,
      audit.consentToken,
    ].every((token) => token === audit.token), transition + " changed a lifecycle mount token");
    assertBrowser(audit.consentChecked === expectedConsentChecked, transition + " lost AI consent state");
    assertBrowser(audit.aiPostCountMatches, transition + " submitted an automatic AI generation request");
    assertBrowser(audit.taskRequestCount === args.expectedTaskRequestCount, transition + " submitted a scientific task");
  };

  const aiLifecycleAudits = {};
  aiLifecycleAudits.plotBaseline = await readAiLifecycle("Plot baseline");
  assertAiLifecycle(aiLifecycleAudits.plotBaseline, "Plot baseline", false);

  await rail.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  const aiLifecycle = page.getByTestId("open-ena-persistent-ai-lifecycle");
  await aiLifecycle.waitFor({ state: "visible", timeout: 15_000 });
  const consentControl = page.locator('[data-ena-ai-consent="explicit"] input[type="checkbox"]');
  const consentEnabled = await consentControl.isEnabled();
  if (consentEnabled) await consentControl.check();
  const expectedConsentChecked = consentEnabled;
  aiLifecycleAudits.plotToAi = await readAiLifecycle("Plot to AI");
  assertAiLifecycle(aiLifecycleAudits.plotToAi, "Plot to AI", expectedConsentChecked);

  await rail.getByRole("button", { name: "Model", exact: true }).click();
  await aiLifecycle.waitFor({ state: "hidden", timeout: 15_000 });
  aiLifecycleAudits.aiToModel = await readAiLifecycle("AI to Model");
  assertAiLifecycle(aiLifecycleAudits.aiToModel, "AI to Model", expectedConsentChecked);

  await rail.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  await aiLifecycle.waitFor({ state: "visible", timeout: 15_000 });
  aiLifecycleAudits.modelToAi = await readAiLifecycle("Model to AI");
  assertAiLifecycle(aiLifecycleAudits.modelToAi, "Model to AI", expectedConsentChecked);

  await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
  await analysisSlot.waitFor({ state: "hidden", timeout: 15_000 });
  await trajectorySlot.waitFor({ state: "visible", timeout: 15_000 });
  aiLifecycleAudits.aiToPlot = await readAiLifecycle("AI to Plot");
  assertAiLifecycle(aiLifecycleAudits.aiToPlot, "AI to Plot", expectedConsentChecked);

  const nonPlotPanelExpectations = [
    { railLabel: "Data", accessibleName: "Data", mode: "data", heading: "Start with coded data" },
    { railLabel: "Model", accessibleName: "Model", mode: "model", heading: "Define the ENA model" },
    { railLabel: "Stats & Export", accessibleName: "Stats & Export", mode: "stats", heading: "Evidence and reproducibility" },
    { railLabel: "AI", accessibleName: "AI-assisted interpretation", mode: "ai", heading: "AI-assisted interpretation" },
  ];
  const panelAudits = {};
  let trajectoryPresenterScreenshotPath = null;
  for (const expectation of nonPlotPanelExpectations) {
    await rail.getByRole("button", { name: expectation.accessibleName, exact: true }).click();
    await analysisSlot.waitFor({ state: "visible", timeout: 15_000 });
    const audit = await page.evaluate((expected) => {
      const controls = document.querySelector('[data-testid="open-ena-longitudinal-v3-analysis-controls"]');
      const plot = document.querySelector('[data-testid="open-ena-longitudinal-v3-plot"]');
      const traces = Array.isArray(plot?.data) ? plot.data : [];
      const resultHashes = [...new Set(traces.map((trace) => trace.meta?.resultHash).filter(Boolean))];
      return {
        mode: expected.mode,
        slotMode: controls?.getAttribute("data-controls-mode") ?? null,
        panelHeading: controls?.querySelector(".ena-panel-heading h2")?.textContent?.trim() ?? "",
        workbenchCount: document.querySelectorAll('[data-testid="open-ena-longitudinal-v3-workbench"]').length,
        genericSurfaceCount: document.querySelectorAll('[data-testid="open-ena-center-surface"]').length,
        ordinaryPresenterCount: document.querySelectorAll([
          '[data-testid="open-ena-center-surface"]',
          '[data-testid="open-ena-group-center-surface"]',
          '[data-testid="open-ena-3d-comparison-plot"]',
          '[data-testid="open-ena-3d-primary-plot"]',
          '[data-testid="open-ena-3d-secondary-plot"]',
        ].join(",")).length,
        bundleResultHash: resultHashes.length === 1 ? resultHashes[0] : null,
        taskRequestCount: window.__openEnaLongitudinalSmokeTaskAudit?.taskRequestCount ?? -1,
      };
    }, expectation);
    assertBrowser(audit.slotMode === expectation.mode, expectation.railLabel + " did not occupy its controls slot");
    assertBrowser(audit.panelHeading.includes(expectation.heading), expectation.railLabel + " target panel is not visible");
    assertBrowser(audit.workbenchCount === 1, expectation.railLabel + " navigation unmounted the trajectory presenter");
    assertBrowser(audit.genericSurfaceCount === 0, expectation.railLabel + " navigation exposed the generic ENA surface");
    assertBrowser(audit.ordinaryPresenterCount === 0, expectation.railLabel + " navigation exposed an ordinary ENA presenter");
    assertBrowser(audit.bundleResultHash === args.expectedResultHash, expectation.railLabel + " navigation changed the trajectory result hash");
    assertBrowser(audit.taskRequestCount === args.expectedTaskRequestCount, expectation.railLabel + " navigation submitted a scientific task");
    panelAudits[expectation.mode] = audit;
    if (expectation.mode === "model") {
      trajectoryPresenterScreenshotPath = args.artifactDirectory + "/trajectory-presenter-after-model-navigation.png";
      await workbench.screenshot({ path: trajectoryPresenterScreenshotPath });
    }
  }

  await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
  await workbench.locator('[data-trajectory-step="1"]').waitFor({ state: "visible", timeout: 15_000 });
  await analysisSlot.waitFor({ state: "hidden", timeout: 15_000 });
  await trajectorySlot.waitFor({ state: "visible", timeout: 15_000 });
  assertBrowser(await analysisSlot.count() === 1, "Plot Tools unmounted the persistent analysis controls");
  assertBrowser(await trajectorySlot.count() === 1, "Plot Tools unmounted the trajectory controls");
  aiLifecycleAudits.finalPlot = await readAiLifecycle("Final Plot");
  assertAiLifecycle(aiLifecycleAudits.finalPlot, "Final Plot", expectedConsentChecked);
  const trajectoryBoundaryAudit = await page.evaluate(() => {
    const plot = document.querySelector('[data-testid="open-ena-longitudinal-v3-plot"]');
    const traces = Array.isArray(plot?.data) ? plot.data : [];
    const resultHashes = [...new Set(traces.map((trace) => trace.meta?.resultHash).filter(Boolean))];
    return {
      workbenchCount: document.querySelectorAll('[data-testid="open-ena-longitudinal-v3-workbench"]').length,
      genericSurfaceCount: document.querySelectorAll('[data-testid="open-ena-center-surface"]').length,
      ordinaryPresenterCount: document.querySelectorAll([
        '[data-testid="open-ena-center-surface"]',
        '[data-testid="open-ena-group-center-surface"]',
        '[data-testid="open-ena-3d-comparison-plot"]',
        '[data-testid="open-ena-3d-primary-plot"]',
        '[data-testid="open-ena-3d-secondary-plot"]',
      ].join(",")).length,
      bundleResultHash: resultHashes.length === 1 ? resultHashes[0] : null,
      taskRequestCount: window.__openEnaLongitudinalSmokeTaskAudit?.taskRequestCount ?? -1,
    };
  });
  assertBrowser(trajectoryBoundaryAudit.workbenchCount === 1, "Plot Tools remounted the trajectory presenter");
  assertBrowser(trajectoryBoundaryAudit.genericSurfaceCount === 0, "Plot Tools exposed the generic ENA surface");
  assertBrowser(trajectoryBoundaryAudit.ordinaryPresenterCount === 0, "Plot Tools exposed an ordinary ENA presenter");
  assertBrowser(trajectoryBoundaryAudit.bundleResultHash === args.expectedResultHash, "Plot Tools changed the trajectory result hash");
  assertBrowser(trajectoryBoundaryAudit.taskRequestCount === args.expectedTaskRequestCount, "Plot Tools submitted a scientific task");
  assertBrowser(Boolean(trajectoryPresenterScreenshotPath), "Model panel screenshot was not captured");
  return {
    ...trajectoryBoundaryAudit,
    panelAudits,
    trajectoryPresenterScreenshotPath,
    aiLifecycleAudit: {
      token: aiLifecycleAudits.plotBaseline.token,
      consentEnabled,
      expectedConsentChecked,
      baselineAiPostCount: aiLifecycleAudits.plotBaseline.baselineAiPostCount,
      finalAiPostCount: aiLifecycleAudits.finalPlot.aiPostCount,
      transitions: aiLifecycleAudits,
    },
  };
}

async function exerciseCamerasAndProjections(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const plot = page.getByTestId("open-ena-longitudinal-v3-plot");
  const cameraSelect = page.getByLabel("3D camera preset");
  const projectionSelect = page.getByLabel("3D / 2D projection");
  const sceneInteraction = plot.locator("#scene");
  const cameraDragFractions = [
    { from: { x: 0.5, y: 0.5 }, to: { x: 0.75, y: 0.7 } },
    { from: { x: 0.5, y: 0.5 }, to: { x: 0.25, y: 0.3 } },
  ];
  const resultLabel = await plot.getAttribute("aria-label");
  const expectedResultLabelFragment = "Result " + args.expectedResultHash.slice(0, 12) + ".";
  const cameraMatches = (actual, expected, epsilon = 1e-7) => {
    const vectorMatches = (left, right) => ["x", "y", "z"].every(
      (key) => Math.abs(Number(left?.[key]) - Number(right?.[key])) <= epsilon,
    );
    return vectorMatches(actual?.center, expected.center)
      && vectorMatches(actual?.eye, expected.eye)
      && vectorMatches(actual?.up, expected.up)
      && actual?.projection?.type === expected.projection.type;
  };
  const readRuntimeCamera = async () => await plot.evaluate((root) => {
    const scene = root?._fullLayout?.scene;
    const runtimeCamera = typeof scene?._scene?.getCamera === "function"
      ? scene._scene.getCamera()
      : scene?.camera;
    return runtimeCamera ? structuredClone(runtimeCamera) : null;
  });
  const waitForRuntimeCamera = async (expected, label) => {
    const deadline = Date.now() + 15_000;
    let lastCamera = null;
    while (Date.now() <= deadline) {
      const current = await readRuntimeCamera();
      if (cameraMatches(current, expected)) return current;
      lastCamera = current;
      await page.waitForTimeout(50);
    }
    throw new Error(label + " did not reach its expected runtime camera: " + JSON.stringify(lastCamera));
  };
  const waitForRuntimeCameraChange = async (previous, timeout = 5_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() <= deadline) {
      const current = await readRuntimeCamera();
      if (JSON.stringify(current) !== JSON.stringify(previous)) return current;
      await page.waitForTimeout(50);
    }
    return null;
  };
  const readScientificInvariants = async () => await plot.evaluate((root) => ({
    resultHashes: [...new Set(
      (Array.isArray(root.data) ? root.data : [])
        .map((trace) => trace.meta?.resultHash)
        .filter(Boolean),
    )],
    taskRequestCount: window.__openEnaLongitudinalSmokeTaskAudit?.taskRequestCount ?? -1,
  }));
  const assertScientificInvariants = async (label) => {
    const current = await readScientificInvariants();
    assertBrowser(
      current.resultHashes.length === 1 && current.resultHashes[0] === args.expectedResultHash,
      label + " changed the immutable result hash",
    );
    assertBrowser(
      current.taskRequestCount === args.expectedTaskRequestCount,
      label + " changed the scientific task request count",
    );
  };

  await cameraSelect.selectOption("isometric");
  await waitForRuntimeCamera(args.expectedCameraStates.isometric, "initial isometric preset");
  const beforeDrag = await readRuntimeCamera();
  let dragVerified = false;
  let afterDrag = beforeDrag;
  const dragAttempts = [];
  if (["chromium", "chrome", "msedge"].includes(args.browser)) {
    await sceneInteraction.waitFor({ state: "visible", timeout: 15_000 });
    // Plotly's root also contains margins and the legend. Drag the dedicated
    // WebGL scene and allow one alternate in-scene gesture if the canvas is
    // replaced during the first post-render pointer sequence.
    await page.waitForTimeout(250);
    for (const gesture of cameraDragFractions) {
      const sceneBox = await sceneInteraction.boundingBox();
      assertBrowser(
        Boolean(sceneBox && sceneBox.width > 100 && sceneBox.height > 100),
        "the 3D scene does not expose a usable mouse-interaction surface",
      );
      const attemptBefore = await readRuntimeCamera();
      await page.mouse.move(
        sceneBox.x + sceneBox.width * gesture.from.x,
        sceneBox.y + sceneBox.height * gesture.from.y,
      );
      await page.mouse.down({ button: "left" });
      await page.mouse.move(
        sceneBox.x + sceneBox.width * gesture.to.x,
        sceneBox.y + sceneBox.height * gesture.to.y,
        { steps: 20 },
      );
      await page.mouse.up({ button: "left" });
      const attemptAfter = await waitForRuntimeCameraChange(attemptBefore);
      const changed = attemptAfter !== null;
      dragAttempts.push({
        from: gesture.from,
        to: gesture.to,
        scene: { width: sceneBox.width, height: sceneBox.height },
        changed,
      });
      if (changed) {
        afterDrag = attemptAfter;
        dragVerified = true;
        break;
      }
      await page.waitForTimeout(250);
    }
    assertBrowser(dragVerified, "mouse drag did not change the live Plotly runtime camera");
    await assertScientificInvariants("mouse camera drag");
  } else {
    await assertScientificInvariants(args.browser + " camera baseline");
  }

  await cameraSelect.selectOption("xy");
  const restoredAfterDrag = await waitForRuntimeCamera(
    args.expectedCameraStates.xy,
    "XY preset after mouse drag",
  );
  assertBrowser(
    cameraMatches(restoredAfterDrag, args.expectedCameraStates.xy),
    "selecting XY did not restore the exact camera preset",
  );
  await assertScientificInvariants("camera preset xy after baseline interaction");

  const cameraStates = {};
  const cameraLabels = {};
  const cameraScreenshots = {};
  for (const preset of args.cameraPresets) {
    await cameraSelect.selectOption(preset);
    cameraStates[preset] = await waitForRuntimeCamera(
      args.expectedCameraStates[preset],
      "camera preset " + preset,
    );
    assertBrowser(
      cameraMatches(cameraStates[preset], args.expectedCameraStates[preset]),
      "camera preset " + preset + " did not restore its expected center, eye, up, and projection",
    );
    assertBrowser(
      cameraStates[preset].projection?.type === (preset === "isometric" ? "perspective" : "orthographic"),
      "camera preset " + preset + " uses the wrong Plotly projection type",
    );
    assertBrowser(
      (await plot.getAttribute("aria-label"))?.includes(expectedResultLabelFragment),
      preset + " changed the result identity",
    );
    await assertScientificInvariants("camera preset " + preset);
    const cameraSelection = {
      visible: await cameraSelect.isVisible(),
      ...await cameraSelect.evaluate((select) => ({
        value: select.value,
        label: select.selectedOptions[0]?.textContent?.trim() ?? "",
      })),
    };
    assertBrowser(cameraSelection.visible, preset + " camera selector is not visible");
    assertBrowser(cameraSelection.value === preset, preset + " camera option is not selected");
    assertBrowser(
      cameraSelection.label === args.expectedCameraLabels[preset],
      preset + " camera option does not expose its expected visible label",
    );
    cameraLabels[preset] = cameraSelection.label;
    const cameraScreenshotPath = args.artifactDirectory + "/camera-" + preset + ".png";
    await plot.screenshot({ path: cameraScreenshotPath });
    cameraScreenshots[preset] = cameraScreenshotPath;
  }
  assertBrowser(
    new Set(Object.values(cameraStates).map((camera) => JSON.stringify(camera))).size === args.cameraPresets.length,
    "the seven camera presets did not produce seven runtime camera orientations",
  );

  const projectionStates = {};
  for (const projection of args.projections) {
    await projectionSelect.selectOption(projection);
    await page.waitForFunction((value) => {
      const selects = [...document.querySelectorAll("select")];
      const select = selects.find((candidate) => candidate.parentElement?.textContent?.includes("3D / 2D projection"));
      const root = document.querySelector("[data-testid=open-ena-longitudinal-v3-plot]");
      return select?.value === value
        && Boolean(root?._fullLayout)
        && Array.isArray(root?.data)
        && root.data.every((trace) => trace.type !== "scatter3d" && trace.type !== "cone");
    }, projection, { timeout: 15_000 });
    projectionStates[projection] = await plot.evaluate((root) => ({
      types: [...new Set(root.data.map((trace) => trace.type))],
      roles: [...new Set(root.data.map((trace) => trace.meta?.role).filter(Boolean))],
      xTitle: root._fullLayout?.xaxis?.title?.text ?? null,
      yTitle: root._fullLayout?.yaxis?.title?.text ?? null,
    }));
    assertBrowser(
      (await plot.getAttribute("aria-label"))?.includes(expectedResultLabelFragment),
      projection + " changed the result identity",
    );
    await assertScientificInvariants("2D projection " + projection);
  }
  await projectionSelect.selectOption("3d");
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-testid=open-ena-longitudinal-v3-plot]");
    return Boolean(root?._fullLayout?.scene);
  }, null, { timeout: 15_000 });
  await cameraSelect.selectOption("isometric");
  await waitForRuntimeCamera(args.expectedCameraStates.isometric, "restored isometric preset");
  await assertScientificInvariants("restoring 3D projection");
  return {
    cameraStates,
    cameraLabels,
    cameraScreenshots,
    projectionStates,
    resultLabel,
    beforeDrag,
    afterDrag,
    restoredAfterDrag,
    dragVerified,
    dragAttempts,
  };
}

async function exerciseTrajectoryPlotActions(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const plot = page.getByTestId("open-ena-longitudinal-v3-plot");
  const cameraSelect = page.getByLabel("3D camera preset");
  const projectionSelect = page.getByLabel("3D / 2D projection");
  const zoomIn = page.locator('[data-ena-plot-action="zoom-in"]');
  const zoomOut = page.locator('[data-ena-plot-action="zoom-out"]');
  const recenter = page.locator('[data-ena-plot-action="recenter"]');
  const copyImage = page.locator('[data-ena-plot-action="copy-image"]');
  const approximatelyEqual = (left, right, epsilon = 1e-6) => (
    Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= epsilon * Math.max(1, Math.abs(left), Math.abs(right))
  );
  const vectorApproximatelyEqual = (left, right) => ["x", "y", "z"].every(
    (axis) => approximatelyEqual(Number(left?.[axis]), Number(right?.[axis])),
  );
  const cameraApproximatelyEqual = (left, right) => (
    vectorApproximatelyEqual(left?.eye, right?.eye)
    && vectorApproximatelyEqual(left?.center, right?.center)
    && vectorApproximatelyEqual(left?.up, right?.up)
    && left?.projection?.type === right?.projection?.type
  );
  const cameraDirection = (camera) => {
    const direction = {
      x: Number(camera?.eye?.x) - Number(camera?.center?.x),
      y: Number(camera?.eye?.y) - Number(camera?.center?.y),
      z: Number(camera?.eye?.z) - Number(camera?.center?.z),
    };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    return {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    };
  };
  const cameraOrientationApproximatelyEqual = (left, right) => (
    vectorApproximatelyEqual(cameraDirection(left), cameraDirection(right))
    && vectorApproximatelyEqual(left?.center, right?.center)
    && vectorApproximatelyEqual(left?.up, right?.up)
    && left?.projection?.type === right?.projection?.type
  );
  const aspectApproximatelyEqual = (left, right) => vectorApproximatelyEqual(left, right);
  const rangesApproximatelyEqual = (left, right) => ["x", "y"].every(
    (axis) => approximatelyEqual(Number(left?.[axis]?.[0]), Number(right?.[axis]?.[0]))
      && approximatelyEqual(Number(left?.[axis]?.[1]), Number(right?.[axis]?.[1])),
  );
  const waitForValue = async (reader, predicate, label, timeout = 15_000) => {
    const deadline = Date.now() + timeout;
    let current = null;
    while (Date.now() <= deadline) {
      current = await reader();
      if (predicate(current)) return current;
      await page.waitForTimeout(50);
    }
    throw new Error(label + " did not reach its expected runtime state: " + JSON.stringify(current));
  };
  const waitForActionsReady = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll(
      '.ena-longitudinal-v3-plot-actions [data-ena-plot-action]',
    )].every((button) => !button.disabled), null, { timeout: 15_000 });
  };
  const readCamera = async () => await plot.evaluate((root) => {
    const scene = root?._fullLayout?.scene;
    const camera = typeof scene?._scene?.getCamera === "function"
      ? scene._scene.getCamera()
      : scene?.camera;
    return camera ? structuredClone(camera) : null;
  });
  const cameraDistance = (camera) => Math.hypot(
    Number(camera?.eye?.x) - Number(camera?.center?.x),
    Number(camera?.eye?.y) - Number(camera?.center?.y),
    Number(camera?.eye?.z) - Number(camera?.center?.z),
  );
  const readAspectRatio = async () => await plot.evaluate((root) => {
    const scene = root?._fullLayout?.scene;
    const aspect = scene?._scene?.glplot?.getAspectratio?.() ?? scene?.aspectratio;
    return aspect ? { x: Number(aspect.x), y: Number(aspect.y), z: Number(aspect.z) } : null;
  });
  const readRanges = async () => await plot.evaluate((root) => {
    const x = root?._fullLayout?.xaxis?.range;
    const y = root?._fullLayout?.yaxis?.range;
    return Array.isArray(x) && Array.isArray(y)
      ? { x: [Number(x[0]), Number(x[1])], y: [Number(y[0]), Number(y[1])] }
      : null;
  });
  const readScientificInvariants = async () => await plot.evaluate((root) => ({
    resultHashes: [...new Set(
      (Array.isArray(root.data) ? root.data : [])
        .map((trace) => trace.meta?.resultHash)
        .filter(Boolean),
    )],
    taskRequestCount: window.__openEnaLongitudinalSmokeTaskAudit?.taskRequestCount ?? -1,
  }));
  const assertScientificInvariants = async (label) => {
    const current = await readScientificInvariants();
    assertBrowser(
      current.resultHashes.length === 1 && current.resultHashes[0] === args.expectedResultHash,
      label + " changed the immutable result hash",
    );
    assertBrowser(
      current.taskRequestCount === args.expectedTaskRequestCount,
      label + " changed the scientific task request count",
    );
  };

  await projectionSelect.selectOption("3d");
  await cameraSelect.selectOption("isometric");
  const perspectiveBaseline = await waitForValue(
    readCamera,
    (camera) => camera?.projection?.type === "perspective",
    "isometric perspective baseline",
  );
  await waitForActionsReady();
  const perspectiveBaselineDistance = cameraDistance(perspectiveBaseline);
  await zoomIn.click();
  const perspectiveZoomIn = await waitForValue(
    readCamera,
    (camera) => cameraDistance(camera) < perspectiveBaselineDistance - 1e-6,
    "perspective Zoom In",
  );
  const perspectiveZoomInDistance = cameraDistance(perspectiveZoomIn);
  assertBrowser(
    perspectiveZoomInDistance < perspectiveBaselineDistance,
    "perspective Zoom In did not reduce camera distance",
  );
  assertBrowser(
    cameraOrientationApproximatelyEqual(perspectiveZoomIn, perspectiveBaseline),
    "perspective Zoom In changed orientation, center, up, or projection",
  );
  await assertScientificInvariants("perspective zoom in");
  await zoomOut.click();
  const perspectiveZoomOut = await waitForValue(
    readCamera,
    (camera) => cameraDistance(camera) > perspectiveZoomInDistance + 1e-6,
    "perspective Zoom Out",
  );
  const perspectiveZoomOutDistance = cameraDistance(perspectiveZoomOut);
  assertBrowser(
    perspectiveZoomOutDistance > perspectiveZoomInDistance,
    "perspective Zoom Out did not increase camera distance",
  );
  assertBrowser(
    cameraApproximatelyEqual(perspectiveZoomOut, perspectiveBaseline),
    "perspective Zoom In then Zoom Out did not restore the exact baseline camera",
  );
  await assertScientificInvariants("perspective zoom out");
  await zoomIn.click();
  const perspectiveBeforeRecenter = await waitForValue(
    readCamera,
    (camera) => cameraDistance(camera) < perspectiveZoomOutDistance - 1e-6,
    "perspective pre-Recenter offset",
  );
  assertBrowser(
    cameraOrientationApproximatelyEqual(perspectiveBeforeRecenter, perspectiveBaseline),
    "perspective pre-Recenter zoom changed orientation, center, up, or projection",
  );
  await assertScientificInvariants("perspective pre-recenter zoom in");
  await recenter.click();
  const perspectiveRecenter = await waitForValue(
    readCamera,
    (camera) => approximatelyEqual(cameraDistance(camera), perspectiveBaselineDistance),
    "perspective Recenter",
  );
  const perspectiveRecenterDistance = cameraDistance(perspectiveRecenter);
  assertBrowser(
    approximatelyEqual(perspectiveRecenterDistance, perspectiveBaselineDistance),
    "perspective Recenter did not restore the default distance",
  );
  assertBrowser(
    cameraApproximatelyEqual(perspectiveRecenter, perspectiveBaseline),
    "perspective Recenter did not restore the complete baseline camera",
  );
  await assertScientificInvariants("perspective recenter");

  await cameraSelect.selectOption("xy");
  await waitForValue(
    readCamera,
    (camera) => camera?.projection?.type === "orthographic",
    "XY orthographic baseline",
  );
  await waitForActionsReady();
  const orthographicBaseline = await waitForValue(
    readAspectRatio,
    (aspect) => aspect && [aspect.x, aspect.y, aspect.z].every(Number.isFinite),
    "orthographic aspect baseline",
  );
  await zoomIn.click();
  const orthographicZoomIn = await waitForValue(
    readAspectRatio,
    (aspect) => aspect?.x > orthographicBaseline.x + 1e-6,
    "orthographic Zoom In",
  );
  assertBrowser(
    orthographicZoomIn.x > orthographicBaseline.x,
    "orthographic Zoom In did not expand the runtime aspect ratio",
  );
  await assertScientificInvariants("orthographic zoom in");
  await zoomOut.click();
  const orthographicZoomOut = await waitForValue(
    readAspectRatio,
    (aspect) => aspect?.x < orthographicZoomIn.x - 1e-6,
    "orthographic Zoom Out",
  );
  assertBrowser(
    orthographicZoomOut.x < orthographicZoomIn.x,
    "orthographic Zoom Out did not contract the runtime aspect ratio",
  );
  assertBrowser(
    aspectApproximatelyEqual(orthographicZoomOut, orthographicBaseline),
    "orthographic Zoom In then Zoom Out did not restore the baseline aspect ratio",
  );
  await assertScientificInvariants("orthographic zoom out");
  await zoomIn.click();
  const orthographicBeforeRecenter = await waitForValue(
    readAspectRatio,
    (aspect) => aspect?.x > orthographicZoomOut.x + 1e-6,
    "orthographic pre-Recenter offset",
  );
  await assertScientificInvariants("orthographic pre-recenter zoom in");
  await recenter.click();
  const orthographicRecenter = await waitForValue(
    readAspectRatio,
    (aspect) => aspectApproximatelyEqual(aspect, orthographicBaseline),
    "orthographic Recenter",
  );
  assertBrowser(
    aspectApproximatelyEqual(orthographicRecenter, orthographicBaseline),
    "orthographic Recenter did not restore the first rendered aspect ratio",
  );
  await assertScientificInvariants("orthographic recenter");

  await projectionSelect.selectOption("xy");
  await waitForValue(readRanges, (ranges) => Boolean(ranges), "2D XY range baseline");
  await waitForActionsReady();
  const twoDBaseline = await readRanges();
  assertBrowser(Boolean(twoDBaseline), "2D XY ranges are unavailable");
  const twoDBaselineSpan = Math.abs(twoDBaseline.x[1] - twoDBaseline.x[0]);
  await zoomIn.click();
  const twoDZoomIn = await waitForValue(
    readRanges,
    (ranges) => ranges && Math.abs(ranges.x[1] - ranges.x[0]) < twoDBaselineSpan - 1e-6,
    "2D Zoom In",
  );
  const twoDZoomInSpan = Math.abs(twoDZoomIn.x[1] - twoDZoomIn.x[0]);
  await assertScientificInvariants("2D zoom in");
  await zoomOut.click();
  const twoDZoomOut = await waitForValue(
    readRanges,
    (ranges) => ranges && Math.abs(ranges.x[1] - ranges.x[0]) > twoDZoomInSpan + 1e-6,
    "2D Zoom Out",
  );
  const twoDZoomOutSpan = Math.abs(twoDZoomOut.x[1] - twoDZoomOut.x[0]);
  assertBrowser(twoDZoomOutSpan > twoDZoomInSpan, "2D Zoom Out did not expand the visible range");
  assertBrowser(
    rangesApproximatelyEqual(twoDZoomOut, twoDBaseline),
    "2D Zoom In then Zoom Out did not restore the baseline ranges",
  );
  await assertScientificInvariants("2D zoom out");
  await zoomIn.click();
  const twoDBeforeRecenter = await waitForValue(
    readRanges,
    (ranges) => ranges && Math.abs(ranges.x[1] - ranges.x[0]) < twoDZoomOutSpan - 1e-6,
    "2D pre-Recenter offset",
  );
  await assertScientificInvariants("2D pre-recenter zoom in");
  await recenter.click();
  const twoDRecenter = await waitForValue(
    readRanges,
    (ranges) => rangesApproximatelyEqual(ranges, twoDBaseline),
    "2D Recenter",
  );
  assertBrowser(
    rangesApproximatelyEqual(twoDRecenter, twoDBaseline),
    "2D Recenter did not restore the immutable initial ranges",
  );
  await assertScientificInvariants("2D recenter");

  const copyPath = args.artifactDirectory + "/trajectory-plot-copy.png";
  let copyEvidence = null;
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.__openEnaTrajectoryCopyAudit = {
      originalFetch,
      hadOwnClipboard: Object.prototype.hasOwnProperty.call(navigator, "clipboard"),
      clipboardDescriptor: Object.getOwnPropertyDescriptor(navigator, "clipboard"),
      hadOwnClipboardItem: Object.prototype.hasOwnProperty.call(window, "ClipboardItem"),
      clipboardItemDescriptor: Object.getOwnPropertyDescriptor(window, "ClipboardItem"),
      toImageDataUrlFetchCount: 0,
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: undefined });
    window.fetch = async (...fetchArgs) => {
      const input = fetchArgs[0];
      const url = typeof input === "string" ? input : input?.url;
      if (typeof url === "string" && url.startsWith("data:image/png")) {
        window.__openEnaTrajectoryCopyAudit.toImageDataUrlFetchCount += 1;
      }
      return await originalFetch.apply(window, fetchArgs);
    };
  });
  try {
    const downloadPromise = page.waitForEvent("download");
    await copyImage.click();
    const download = await downloadPromise;
    assertBrowser(await download.failure() === null, "trajectory Copy download failed");
    const suggestedFilename = download.suggestedFilename();
    assertBrowser(
      suggestedFilename === "3dena-longitudinal-trajectory.png",
      "trajectory Copy suggested the wrong filename: " + suggestedFilename,
    );
    await download.saveAs(copyPath);
    const downloadStream = await download.createReadStream();
    assertBrowser(Boolean(downloadStream), "trajectory Copy did not expose PNG bytes");
    let pngByteLength = 0;
    const pngSignature = [];
    for await (const chunk of downloadStream) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      pngByteLength += bytes.byteLength;
      const signatureBytesRemaining = Math.max(0, 8 - pngSignature.length);
      if (signatureBytesRemaining > 0) {
        pngSignature.push(...bytes.subarray(0, signatureBytesRemaining));
      }
    }
    assertBrowser(
      pngByteLength > 8
        && JSON.stringify(pngSignature) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10]),
      "trajectory Copy download is not a non-empty PNG",
    );
    await page.waitForFunction(() => (
      document.querySelector('.ena-longitudinal-v3-plot-shell [role="status"]')?.textContent?.trim()
        === "Image downloaded"
    ), null, { timeout: 15_000 });
    const status = await page.locator('.ena-longitudinal-v3-plot-shell [role="status"]').textContent();
    const copyRuntimeAudit = await page.evaluate(() => ({
      toImageDataUrlFetchCount:
        window.__openEnaTrajectoryCopyAudit?.toImageDataUrlFetchCount ?? -1,
      realPlotlyRoot: Boolean(
        document.querySelector('[data-testid="open-ena-longitudinal-v3-plot"]')?._fullLayout,
      ),
    }));
    assertBrowser(
      copyRuntimeAudit.toImageDataUrlFetchCount === 1,
      "trajectory Copy did not consume exactly one Plotly PNG data URL",
    );
    assertBrowser(copyRuntimeAudit.realPlotlyRoot, "trajectory Copy did not use the mounted Plotly root");
    copyEvidence = {
      copyPath,
      suggestedFilename,
      bytes: pngByteLength,
      pngSignature,
      status: status?.trim() ?? "",
      toImageDataUrlFetchCount: copyRuntimeAudit.toImageDataUrlFetchCount,
      realPlotlyRoot: copyRuntimeAudit.realPlotlyRoot,
    };
    await assertScientificInvariants("Copy image download");
  } finally {
    await page.evaluate(() => {
      const audit = window.__openEnaTrajectoryCopyAudit;
      if (!audit) return;
      window.fetch = audit.originalFetch;
      if (audit.hadOwnClipboard && audit.clipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", audit.clipboardDescriptor);
      } else {
        delete navigator.clipboard;
      }
      if (audit.hadOwnClipboardItem && audit.clipboardItemDescriptor) {
        Object.defineProperty(window, "ClipboardItem", audit.clipboardItemDescriptor);
      } else {
        delete window.ClipboardItem;
      }
      delete window.__openEnaTrajectoryCopyAudit;
    });
  }
  assertBrowser(Boolean(copyEvidence), "trajectory Copy did not produce evidence");

  await projectionSelect.selectOption("3d");
  await cameraSelect.selectOption("isometric");
  const restoredIsometric = await waitForValue(
    readCamera,
    (camera) => cameraApproximatelyEqual(camera, args.expectedCameraState),
    "restored 3D isometric after plot actions",
  );
  await waitForActionsReady();
  await assertScientificInvariants("restored 3D isometric after plot actions");

  return {
    perspective: {
      baseline: perspectiveBaseline,
      zoomIn: perspectiveZoomIn,
      zoomOut: perspectiveZoomOut,
      beforeRecenter: perspectiveBeforeRecenter,
      recenter: perspectiveRecenter,
    },
    orthographic: {
      baseline: orthographicBaseline,
      zoomIn: orthographicZoomIn,
      zoomOut: orthographicZoomOut,
      beforeRecenter: orthographicBeforeRecenter,
      recenter: orthographicRecenter,
    },
    twoD: {
      baseline: twoDBaseline,
      zoomIn: twoDZoomIn,
      zoomOut: twoDZoomOut,
      beforeRecenter: twoDBeforeRecenter,
      recenter: twoDRecenter,
    },
    copy: copyEvidence,
    restoredIsometric,
  };
}

async function captureResponsiveEvidence(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const results = {};
  for (const viewport of args.viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => {
      const shell = document.querySelector(".ena-longitudinal-v3-plot-shell");
      const toolbar = shell?.querySelector(".ena-longitudinal-v3-plot-actions") ?? null;
      const plot = shell?.querySelector('[data-testid="open-ena-longitudinal-v3-plot"]') ?? null;
      const boxFor = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      };
      const toolbarRowCount = toolbar
        ? new Set([...toolbar.querySelectorAll("button")]
          .filter((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map((button) => Math.round(button.getBoundingClientRect().top))).size
        : 0;
      const clippedInteractiveControls = [...document.querySelectorAll(
        '[data-testid="open-ena-longitudinal-v3-workbench"] button, '
          + '[data-testid="open-ena-longitudinal-v3-workbench"] input, '
          + '[data-testid="open-ena-longitudinal-v3-workbench"] select',
      )].flatMap((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none"
          || style.visibility === "hidden"
          || rect.width <= 0
          || rect.height <= 0
          || rect.bottom <= 0
          || rect.top >= window.innerHeight
        ) return [];
        if (rect.left >= -1 && rect.right <= window.innerWidth + 1) return [];
        return [{
          label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
          left: rect.left,
          right: rect.right,
        }];
      });
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        clippedInteractiveControls,
        shellBox: boxFor(shell),
        toolbarBox: boxFor(toolbar),
        plotBox: boxFor(plot),
        toolbarRowCount,
      };
    });
    assertBrowser(
      overflow.documentScrollWidth <= overflow.documentClientWidth + 1,
      "document overflow at " + viewport.width + "x" + viewport.height,
    );
    assertBrowser(
      overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1,
      "body overflow at " + viewport.width + "x" + viewport.height,
    );
    assertBrowser(
      overflow.clippedInteractiveControls.length === 0,
      "interactive controls are horizontally clipped at "
        + viewport.width + "x" + viewport.height + ": "
        + JSON.stringify(overflow.clippedInteractiveControls),
    );
    if (viewport.width === 390) {
      assertBrowser(
        overflow.shellBox && overflow.toolbarBox && overflow.plotBox,
        "mobile trajectory shell geometry is incomplete",
      );
      assertBrowser(
        overflow.toolbarRowCount >= 2,
        "the 390px trajectory toolbar did not wrap to at least two rows",
      );
      assertBrowser(
        overflow.toolbarBox.bottom <= overflow.plotBox.top + 1,
        "the 390px trajectory toolbar overlaps or follows the Plotly canvas",
      );
      assertBrowser(
        overflow.plotBox.bottom <= overflow.shellBox.bottom + 1,
        "the 390px Plotly canvas escapes its fixed-height shell",
      );
    }
    const pagePath = args.artifactDirectory + "/" + viewport.name + "-"
      + viewport.width + "x" + viewport.height + ".png";
    const plotPath = args.artifactDirectory + "/" + viewport.name + "-plot-"
      + viewport.width + "x" + viewport.height + ".png";
    const shellPath = args.artifactDirectory + "/" + viewport.name + "-shell-"
      + viewport.width + "x" + viewport.height + ".png";
    await page.screenshot({ path: pagePath, fullPage: false });
    await page.getByTestId("open-ena-longitudinal-v3-plot").screenshot({ path: plotPath });
    await page.locator(".ena-longitudinal-v3-plot-shell").screenshot({ path: shellPath });
    results[viewport.name] = { ...viewport, ...overflow, pagePath, plotPath, shellPath };
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  const fullscreen = page.getByRole("button", { name: "Fullscreen", exact: true });
  await fullscreen.click();
  await page.waitForFunction(() => {
    const shell = document.querySelector(".ena-longitudinal-v3-plot-shell");
    return Boolean(
      document.fullscreenElement === shell
      || shell?.getAttribute("data-fallback-fullscreen") === "true",
    );
    }, null, { timeout: 15_000 });
    const fullscreenBox = await page.locator(".ena-longitudinal-v3-plot-shell").boundingBox();
    const fullscreenViewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    assertBrowser(
      fullscreenBox && fullscreenBox.width >= fullscreenViewport.width * 0.96,
      "fullscreen plot does not fill the available viewport width",
    );
    assertBrowser(
      fullscreenBox && fullscreenBox.height >= fullscreenViewport.height * 0.96,
      "fullscreen plot does not fill the available viewport height",
    );
    await page.waitForFunction(() => {
      const root = document.querySelector("[data-testid=open-ena-longitudinal-v3-plot]");
      if (!root) return false;
      const plotBox = root.getBoundingClientRect();
      const canvasBoxes = [...root.querySelectorAll("canvas")]
        .map((canvas) => canvas.getBoundingClientRect());
      return canvasBoxes.some((canvasBox) => (
        canvasBox.width >= plotBox.width * 0.9
        && canvasBox.height >= plotBox.height * 0.9
      ));
    }, null, { timeout: 15_000 });
    const fullscreenPlotAudit = await page.getByTestId("open-ena-longitudinal-v3-plot").evaluate((root) => {
    const plotBox = root.getBoundingClientRect();
    const shellBox = root.closest(".ena-longitudinal-v3-plot-shell")?.getBoundingClientRect();
    const toolbarBox = root.closest(".ena-longitudinal-v3-plot-shell")
      ?.querySelector(".ena-longitudinal-v3-plot-actions")?.getBoundingClientRect();
      const canvasBox = [...root.querySelectorAll("canvas")]
        .map((canvas) => canvas.getBoundingClientRect())
        .sort((left, right) => right.width * right.height - left.width * left.height)[0];
    const domain = root._fullLayout?.scene?.domain;
    return {
      plot: { width: plotBox.width, height: plotBox.height },
      shell: shellBox ? { width: shellBox.width, height: shellBox.height } : null,
      toolbarHeight: toolbarBox?.height ?? 0,
      canvas: canvasBox ? { width: canvasBox.width, height: canvasBox.height } : null,
      sceneDomain: domain ? { x: [...domain.x], y: [...domain.y] } : null,
    };
  });
  assertBrowser(
    fullscreenPlotAudit.shell
      && fullscreenPlotAudit.plot.width >= fullscreenPlotAudit.shell.width * 0.96
      && fullscreenPlotAudit.plot.height >= fullscreenPlotAudit.shell.height - fullscreenPlotAudit.toolbarHeight - 24,
    "fullscreen Plotly root does not use the available viewport",
  );
  assertBrowser(
    fullscreenPlotAudit.canvas
      && fullscreenPlotAudit.canvas.width >= fullscreenPlotAudit.plot.width * 0.9
      && fullscreenPlotAudit.canvas.height >= fullscreenPlotAudit.plot.height * 0.9,
    "fullscreen WebGL canvas remains materially smaller than the Plotly root",
  );
  assertBrowser(
    JSON.stringify(fullscreenPlotAudit.sceneDomain) === JSON.stringify({ x: [0, 1], y: [0, 1] }),
    "fullscreen 3D scene does not use the complete Plotly domain",
  );
  const fullscreenPath = args.artifactDirectory + "/desktop-fullscreen-1440x1000.png";
  await page.locator(".ena-longitudinal-v3-plot-shell").screenshot({ path: fullscreenPath });
  const exitFullscreen = page.getByRole("button", { name: "Exit fullscreen", exact: true });
  await exitFullscreen.click();
  await page.waitForFunction(() => {
    const shell = document.querySelector(".ena-longitudinal-v3-plot-shell");
    return document.fullscreenElement !== shell
      && shell?.getAttribute("data-fallback-fullscreen") !== "true";
  }, null, { timeout: 15_000 });
    return { results, fullscreenBox, fullscreenViewport, fullscreenPlotAudit, fullscreenPath };
}

async function downloadAllArtifacts(page, args) {
  const buttons = [
    ["bundle", "Analysis bundle ZIP"],
    ["path", "Path CSV"],
    ["metadata", "Metadata CSV"],
    ["inference", "Inference CSV"],
    ["analysis", "Analysis JSON"],
    ["plotly", "Plotly spec JSON"],
    ["participant", "Participant-level ZIP (opt-in)"],
  ];
  const saved = {};
  for (const [kind, label] of buttons) {
    const button = page.getByRole("button", { name: label, exact: true });
    if (kind === "participant") {
      page.once("dialog", (dialog) => void dialog.accept());
    }
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    const download = await downloadPromise;
    const extension = kind === "bundle" || kind === "participant"
      ? ".zip"
      : kind === "path" || kind === "metadata" || kind === "inference"
        ? ".csv"
        : ".json";
    const destination = args.downloadDirectory + "/" + kind + extension;
    await download.saveAs(destination);
    saved[kind] = destination;
  }
  return saved;
}

async function readBrowserErrors(page, args) {
  const currentHref = page.url();
  const currentOrigin = await page.evaluate(() => window.location.origin);
  const declaredFontPreloads = new Set(await page
    .locator('link[rel="preload"][as="font"][type="font/woff2"]')
    .evaluateAll((links) => links
      .filter((link) => link.hasAttribute("crossorigin"))
      .map((link) => link.href)));
  const strictNextFontPath = /^\/_next\/static\/media\/[a-f0-9]+-s\.p\.[a-z0-9]+\.woff2$/u;
  const strictFirefoxPreloadWarning = /^\[JavaScript Warning: "The resource at “([^”]+)” preloaded with link preload was not used within a few seconds\. Make sure all attributes of the preload tag are set correctly\." \{file: "([^"]+)" line: 0\}\]$/u;
  const strictChromiumCanvasReadbackWarning = /^Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true\. See: https:\/\/html\.spec\.whatwg\.org\/multipage\/canvas\.html#concept-canvas-will-read-frequently$/u;
  const strictChromiumChunkPath = /^\/_next\/static\/(?:chunks\/[a-z0-9]{2,}-[a-z0-9]{3,}-[a-z0-9]{3,}|immutable\/chunks\/[a-z0-9]{8,})\.js$/u;
  const classifyNextFontPreloadDiagnostic = (warning) => {
    const match = warning.match(strictFirefoxPreloadWarning);
    if (!match) return null;
    const resourceHref = match[1];
    const reportingHref = match[2];
    if (!resourceHref.startsWith(currentOrigin + "/")) return null;
    if (reportingHref !== currentHref) return null;
    const resourcePath = resourceHref.slice(currentOrigin.length);
    if (!strictNextFontPath.test(resourcePath)) return null;
    if (!declaredFontPreloads.has(resourceHref)) return null;
    return resourceHref;
  };
  const classifyChromiumCanvasReadbackDiagnostic = (warning) => {
    if (!["chromium", "chrome", "msedge"].includes(args.browser)) return null;
    if (!strictChromiumCanvasReadbackWarning.test(warning.text)) return null;
    const sourceUrl = typeof warning.location?.url === "string" ? warning.location.url : "";
    if (!sourceUrl.startsWith(currentOrigin + "/")) return null;
    const sourcePath = sourceUrl.slice(currentOrigin.length);
    if (!strictChromiumChunkPath.test(sourcePath)) return null;
    if (!Number.isInteger(warning.location?.lineNumber) || warning.location.lineNumber < 0) return null;
    if (!Number.isInteger(warning.location?.columnNumber) || warning.location.columnNumber < 0) return null;
    return {
      warningText: warning.text,
      sourcePath,
      reportedLineNumber: warning.location.lineNumber,
      reportedColumnNumber: warning.location.columnNumber,
    };
  };
  const verifyChromiumCanvasReadbackSource = async (candidate) => await page.evaluate(async (input) => {
    const response = await fetch(input.sourcePath, {
      cache: "force-cache",
      credentials: "same-origin",
    });
    if (!response.ok || !/javascript/iu.test(response.headers.get("content-type") || "")) return null;
    const sourceBytes = await response.arrayBuffer();
    if (sourceBytes.byteLength < 1 || sourceBytes.byteLength > 16 * 1024 * 1024) return null;
    const sourceText = new TextDecoder().decode(sourceBytes);
    // Playwright reports Chromium's source line as a zero-based lineNumber.
    const sourceLine = sourceText.split(/\r?\n/u)[input.reportedLineNumber];
    if (
      !sourceLine
      || !sourceLine.includes("vectorize-text: Unrecognized textAlign:")
      || !sourceLine.includes('getContext("2d")')
      || !sourceLine.includes(".getImageData(0,0,")
    ) return null;
    const digestHex = async (bytes) => [...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes),
    )].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return {
      ...input,
      sourceLineNumber: input.reportedLineNumber + 1,
      chunkBytes: sourceBytes.byteLength,
      chunkSha256: await digestHex(sourceBytes),
      sourceLineSha256: await digestHex(new TextEncoder().encode(sourceLine)),
    };
  }, candidate);
  const normalizeWarning = (warning) => {
    if (typeof warning === "string") return warning;
    const sourceUrl = typeof warning.location?.url === "string" ? warning.location.url : "";
    const sourcePath = sourceUrl.startsWith(currentOrigin + "/")
      ? sourceUrl.slice(currentOrigin.length).split(/[?#]/u)[0]
      : null;
    return {
      text: warning.text,
      location: {
        sourcePath,
        lineNumber: warning.location?.lineNumber ?? null,
        columnNumber: warning.location?.columnNumber ?? null,
      },
    };
  };
  const allWarnings = [...(page.__openEnaLongitudinalConsoleWarnings || [])];
  const consoleWarnings = [];
  const nextFontPreloadDiagnosticUrls = [];
  const canvas2dReadbackDiagnostics = [];
  const canvas2dReadbackCandidates = [];
  const chromiumAngleReadPixelsDiagnostics = [];
  let webglDiagnosticCount = 0;
  for (const warning of allWarnings) {
    const warningText = typeof warning === "string" ? warning : warning.text;
    const isFirefoxWebglDiagnostic = args.browser === "firefox" && (
      warningText.includes("WebGL warning:")
      || warningText.includes("After reporting 32, no further warnings will be reported for this WebGL context")
    );
    const nextFontUrl = args.browser === "firefox"
      ? classifyNextFontPreloadDiagnostic(warningText)
      : null;
    const canvasReadbackDiagnostic = typeof warning === "object" && warning !== null
      ? classifyChromiumCanvasReadbackDiagnostic(warning)
      : null;
    const angleReadPixelsDiagnostic = classifyChromiumAngleReadPixelsDiagnostic({
      browser: args.browser,
      currentHref,
      currentOrigin,
      warning,
    });
    if (isFirefoxWebglDiagnostic) webglDiagnosticCount += 1;
    else if (nextFontUrl) nextFontPreloadDiagnosticUrls.push(nextFontUrl);
    else if (canvasReadbackDiagnostic) {
      canvas2dReadbackCandidates.push({ candidate: canvasReadbackDiagnostic, warning });
    } else if (angleReadPixelsDiagnostic) {
      chromiumAngleReadPixelsDiagnostics.push(angleReadPixelsDiagnostic);
    } else consoleWarnings.push(normalizeWarning(warning));
  }
  for (const { candidate, warning } of canvas2dReadbackCandidates) {
    const verified = await verifyChromiumCanvasReadbackSource(candidate);
    if (verified) canvas2dReadbackDiagnostics.push(verified);
    else consoleWarnings.push(normalizeWarning(warning));
  }
  return {
    consoleErrors: [...(page.__openEnaLongitudinalConsoleErrors || [])],
    consoleWarnings,
    platformDiagnostics: {
      nextFontPreloadDiagnosticUrls: [...new Set(nextFontPreloadDiagnosticUrls)].sort(),
      webglDiagnosticCount,
      canvas2dReadbackDiagnostics,
      chromiumAngleReadPixelsDiagnostics: {
        count: chromiumAngleReadPixelsDiagnostics.length,
        normalizedPattern: chromiumAngleReadPixelsDiagnostics[0]?.normalizedPattern ?? null,
        repeatSuppressionCount: chromiumAngleReadPixelsDiagnostics
          .filter((diagnostic) => diagnostic.repeatSuppression).length,
        sourcePaths: [...new Set(chromiumAngleReadPixelsDiagnostics
          .map((diagnostic) => diagnostic.sourcePath))].sort(),
      },
    },
    pageErrors: [...(page.__openEnaLongitudinalPageErrors || [])],
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
let baseUrl = externalBaseUrl;
let browserOpened = false;
let completedSummary = null;

try {
  execFileSync("npx", ["--version"], { encoding: "utf8", timeout: 30_000 });
  const playwrightCliVersion = runCli(["--version"], "resolve Playwright CLI", 120_000).trim();
  assert.ok(playwrightCliVersion.length > 0, "the Playwright CLI did not expose its version");
  if (!baseUrl) {
    ownsDistDirectory = true;
    const port = await findOpenPort();
    baseUrl = "http://127.0.0.1:" + port;
    removeOwnedDistDirectory();
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
      !key.startsWith("OPEN_ENA_LONGITUDINAL_SMOKE_")
      && !["OPEN_ENA_USERNAME", "OPEN_ENA_PASSWORD", "OPEN_ENA_SESSION_SECRET"].includes(key)
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
      process.stdout.write("[longitudinal V3 smoke] build production application ... ");
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
    if (!ownedServer) {
      throw new Error("The smoke-owned production server did not start.");
    }
    ownedServer.once("error", (error) => {
      process.stderr.write("[longitudinal V3 smoke] server error: " + redact(error.message) + "\n");
    });
    await waitForServer(baseUrl + "/en/open-ena");
  }

  browserSessionAttempted = true;
  runCli(["open", baseUrl + "/en/open-ena", "--browser", smokeBrowser], "open browser", 120_000);
  browserOpened = true;
  const browserRuntimeEvidence = runBrowserPhase(
    "record the actual browser runtime identity",
    readBrowserRuntimeEvidence,
  );

  const plotAudit = runBrowserPhase(
    "authenticate, load the trajectory sample, and run the V2 envelope",
    authenticateAndRunTrajectory,
    {
      username,
      password,
      expectedCodes: expectedCodeLabels,
      artifactDirectory,
    },
    240_000,
  );
  const railPanelAudit = runBrowserPhase(
    "open Data, Model, Stats, and AI inside the mounted trajectory presenter",
    exerciseNonPlotRailPanels,
    {
      expectedResultHash: plotAudit.resultHashes[0],
      expectedTaskRequestCount: plotAudit.taskRequestCount,
      artifactDirectory,
    },
  );
  plotAudit.trajectoryBoundaryAudit = railPanelAudit;
  const displayAudit = runBrowserPhase(
    "exercise seven 3D cameras and six 2D projections without rerunning",
    exerciseCamerasAndProjections,
    {
      cameraPresets,
      expectedCameraLabels,
      expectedCameraStates,
      expectedResultHash: plotAudit.resultHashes[0],
      expectedTaskRequestCount: plotAudit.taskRequestCount,
      projections: twoDimensionalProjections,
      browser: smokeBrowser,
      artifactDirectory,
    },
  );
  const plotActionAudit = runBrowserPhase(
    "exercise perspective, orthographic, 2D, and Copy plot actions",
    exerciseTrajectoryPlotActions,
    {
      expectedResultHash: plotAudit.resultHashes[0],
      expectedTaskRequestCount: plotAudit.taskRequestCount,
      expectedCameraState: expectedCameraStates.isometric,
      artifactDirectory,
    },
    240_000,
  );
  const responsiveAudit = runBrowserPhase(
    "capture desktop, tablet, mobile, and fullscreen overflow evidence",
    captureResponsiveEvidence,
    { viewports: viewportMatrix, artifactDirectory },
  );
  runBrowserPhase(
    "click all seven trajectory downloads",
    downloadAllArtifacts,
    { downloadDirectory },
    240_000,
  );
  const downloads = {
    bundle: join(downloadDirectory, "bundle.zip"),
    path: join(downloadDirectory, "path.csv"),
    metadata: join(downloadDirectory, "metadata.csv"),
    inference: join(downloadDirectory, "inference.csv"),
    analysis: join(downloadDirectory, "analysis.json"),
    plotly: join(downloadDirectory, "plotly.json"),
    participant: join(downloadDirectory, "participant.zip"),
  };
  const browserErrors = runBrowserPhase(
    "collect console and page errors",
    readBrowserErrors,
    { browser: smokeBrowser },
    180_000,
    [classifyChromiumAngleReadPixelsDiagnostic],
  );
  assert.deepEqual(browserErrors.consoleErrors, [], "browser console contains errors");
  assert.deepEqual(browserErrors.consoleWarnings, [], "browser console contains warnings");
  assert.deepEqual(browserErrors.pageErrors, [], "browser emitted page errors");
  assert.ok(
    browserErrors.platformDiagnostics.canvas2dReadbackDiagnostics.length <= 1,
    "Chromium emitted repeated Plotly Canvas2D readback diagnostics",
  );
  const chromiumAngleReadPixelsDiagnostics =
    browserErrors.platformDiagnostics.chromiumAngleReadPixelsDiagnostics;
  assert.ok(
    chromiumAngleReadPixelsDiagnostics.count <= 4,
    "Chromium emitted more ANGLE ReadPixels driver diagnostics than the audited platform pattern allows",
  );
  assert.ok(
    chromiumAngleReadPixelsDiagnostics.repeatSuppressionCount <= 1,
    "Chromium emitted repeated ANGLE terminal suppression diagnostics",
  );
  assert.ok(
    chromiumAngleReadPixelsDiagnostics.sourcePaths.length <= 1,
    "Chromium emitted ANGLE ReadPixels diagnostics from multiple source paths",
  );
  const cliConsole = runCli(["console", "error"], "read Playwright console summary");
  assert.match(cliConsole, /Errors:\s*0/u);
  const cliWarningMatch = cliConsole.match(/Warnings:\s*(\d+)/u);
  assert.ok(cliWarningMatch, "Playwright console summary omitted its warning count");
  const cliWarningCount = Number(cliWarningMatch[1]);
  if (["chromium", "chrome", "msedge"].includes(smokeBrowser)) {
    const classifiedChromiumWarningCount =
      browserErrors.platformDiagnostics.canvas2dReadbackDiagnostics.length
      + browserErrors.platformDiagnostics.chromiumAngleReadPixelsDiagnostics.count;
    assert.equal(
      cliWarningCount,
      classifiedChromiumWarningCount,
      "Chromium emitted an unclassified console warning",
    );
  } else if (smokeBrowser !== "firefox") {
    assert.equal(cliWarningCount, 0, "browser emitted an unclassified console warning");
  }

  assert.equal(Object.keys(downloads).length, 7);
  const aggregate = extractAndVerifyBundle(downloads.bundle, "aggregate", false);
  const participant = extractAndVerifyBundle(downloads.participant, "participant", true);
  assert.equal(aggregate.manifest.resultHash, participant.manifest.resultHash);
  for (const member of aggregate.manifest.members.filter(
    (candidate) => candidate.path !== "plotly-spec.json",
  )) {
    const participantMember = participant.manifest.members.find(
      (candidate) => candidate.path === member.path,
    );
    assert.deepEqual(participantMember, member, "shared member differs: " + member.path);
  }
  assert.equal(aggregate.participantTraceCount, 0);
  assert.ok(participant.participantTraceCount > 0);
  assert.notEqual(
    sha256(readFileSync(join(aggregate.extracted, "plotly-spec.json"))),
    sha256(readFileSync(join(participant.extracted, "plotly-spec.json"))),
    "participant opt-in must produce a distinct privacy-scoped Plotly member",
  );
  verifyStandaloneDownloads(downloads, aggregate);
  const downloadEvidence = Object.fromEntries(
    Object.entries(downloads).map(([kind, path]) => [kind, artifactEvidence(path)]),
  );
  for (const receipt of Object.values(downloadEvidence)) {
    assert.match(receipt.file, /^downloads\//u, "download receipt escaped the downloads directory");
    assert.ok(receipt.bytes > 0, "download receipt has no bytes");
    assert.match(receipt.sha256, /^[a-f0-9]{64}$/u, "download receipt has an invalid SHA-256");
  }

  const serverLog = readServerLogTail();
  assert.doesNotMatch(serverLog, /open_ena_longitudinal_smoke_password/u);
  assert.doesNotMatch(serverLog, /open_ena_longitudinal_smoke_session_secret/u);

  const {
    trajectoryPresenterScreenshotPath,
    ...trajectoryBoundaryAudit
  } = plotAudit.trajectoryBoundaryAudit;
  const portablePlotAudit = {
    ...plotAudit,
    trajectoryBoundaryAudit: {
      ...trajectoryBoundaryAudit,
      trajectoryPresenterScreenshot: artifactEvidence(trajectoryPresenterScreenshotPath),
    },
  };
  const portableViewports = Object.fromEntries(
    Object.entries(responsiveAudit.results).map(([name, evidence]) => {
      const { pagePath, plotPath, shellPath, ...viewportEvidence } = evidence;
      return [name, {
        ...viewportEvidence,
        pageScreenshot: artifactEvidence(pagePath),
        plotScreenshot: artifactEvidence(plotPath),
        shellScreenshot: artifactEvidence(shellPath),
      }];
    }),
  );
  const {
    copy: plotActionCopy,
    ...portablePlotActionAudit
  } = plotActionAudit;
  const {
    copyPath,
    ...portablePlotActionCopy
  } = plotActionCopy;

  completedSummary = {
    status: "PASS",
    browser: smokeBrowser,
    playwrightCliSource: playwrightCli.source,
    playwrightCliVersion,
    runtimeBrowserVersion: browserRuntimeEvidence.version,
    runtimeBrowserUserAgent: browserRuntimeEvidence.userAgent,
    baseUrl,
    serverLifecycle: ownedServer ? "owned" : "external",
    plotAudit: portablePlotAudit,
    cameras: Object.keys(displayAudit.cameraStates),
    cameraStates: displayAudit.cameraStates,
    cameraLabels: displayAudit.cameraLabels,
    cameraInteraction: {
      beforeDrag: displayAudit.beforeDrag,
      afterDrag: displayAudit.afterDrag,
      restoredAfterDrag: displayAudit.restoredAfterDrag,
      dragVerified: displayAudit.dragVerified,
      dragAttempts: displayAudit.dragAttempts,
    },
    cameraScreenshots: Object.fromEntries(
      Object.entries(displayAudit.cameraScreenshots)
        .map(([preset, path]) => [preset, artifactEvidence(path)]),
    ),
    projections: Object.keys(displayAudit.projectionStates),
    plotActions: {
      ...portablePlotActionAudit,
      copy: {
        ...portablePlotActionCopy,
        receipt: artifactEvidence(copyPath),
      },
    },
    viewports: portableViewports,
    fullscreen: {
      box: responsiveAudit.fullscreenBox,
      viewport: responsiveAudit.fullscreenViewport,
      plotAudit: responsiveAudit.fullscreenPlotAudit,
      screenshot: artifactEvidence(responsiveAudit.fullscreenPath),
    },
    downloads: downloadEvidence,
    aggregate: {
      resultHash: aggregate.manifest.resultHash,
      contentSetHash: aggregate.manifest.contentSetHash,
      zipSha256: aggregate.zipSha256,
    },
    participant: {
      participantLevelIncluded: participant.manifest.participantLevelIncluded,
      contentSetHash: participant.manifest.contentSetHash,
      zipSha256: participant.zipSha256,
    },
    browserErrors: {
      consoleErrors: 0,
      consoleWarnings: 0,
      pageErrors: 0,
      platformDiagnostics: browserErrors.platformDiagnostics,
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
  if (serverLog) {
    process.stderr.write("[longitudinal V3 smoke] server log tail:\n" + serverLog + "\n");
  }
} finally {
  try {
    await cleanupOwnedResources();
  } catch (cleanupError) {
    if (primaryFailure) {
      process.stderr.write("[longitudinal V3 smoke] cleanup failure: " + redact(cleanupError) + "\n");
    } else {
      primaryFailure = cleanupError;
    }
  }
}

if (primaryFailure) throw primaryFailure;
assert.ok(completedSummary, "the browser smoke did not produce a completed evidence summary");
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
writeFileSync(
  join(artifactDirectory, "summary.json"),
  JSON.stringify(completedSummary, null, 2) + "\n",
);
process.stdout.write(JSON.stringify(completedSummary, null, 2) + "\n");
