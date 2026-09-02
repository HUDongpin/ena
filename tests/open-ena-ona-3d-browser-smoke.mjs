#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSafePlaywrightCliError } from "./support/safe-playwright-cli-error.mjs";

const smokeSourcePath = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(smokeSourcePath), "..");
const tsconfigPath = join(projectRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const artifactDirectory = resolve(
  process.env.OPEN_ENA_ONA_3D_SMOKE_ARTIFACT_DIR
    || join(projectRoot, "output", "playwright", "open-ena-ona-3d-smoke"),
);
const summaryPath = join(artifactDirectory, "summary.json");
const serverLogPath = join(artifactDirectory, "next-server.log");
const failureScreenshotPath = join(artifactDirectory, "failure.png");
const desktopScreenshotPath = join(artifactDirectory, "synthetic-desktop-1440.png");
const mobileScreenshotPath = join(artifactDirectory, "synthetic-mobile-390.png");
const username = "open_ena_ona_3d_smoke_researcher";
const password = "open_ena_ona_3d_smoke_password_2026";
const sessionSecret = "open_ena_ona_3d_smoke_session_secret_0123456789abcdef";
const accountId = "open-ena-ona-3d-smoke-account";
const sessionName = "open-ena-ona-3d-smoke-" + process.pid;
const smokeBrowser = process.env.OPEN_ENA_ONA_3D_SMOKE_BROWSER
  || (existsSync("/Applications/Google Chrome.app") ? "chrome" : "chromium");
const privateWorkbookPath = resolve(
  process.env.OPEN_ENA_ONA_3D_PRIVATE_WORKBOOK
    || "/Users/dongpinhu/Desktop/Yu_ena_coded_data_0712.xlsx",
);
const ownedDistDirName = ".next-ona-3d-smoke-" + process.pid;
const ownedDistDirectory = join(projectRoot, ownedDistDirName);
const fixtureContract = Object.freeze({
  analysisFamilyLabel: "Ordered Network Analysis (ONA)",
  rowsPerUnit: 3,
  codes: ["CODE_A", "CODE_B", "CODE_C", "CODE_D", "CODE_E"],
  groups: ["SYNTHETIC_BASELINE", "SYNTHETIC_SCAFFOLDED"],
  unitsPerGroup: 8,
  maskedDirection: "CODE_E ground/source to CODE_A response/target",
});

assert.ok(["chromium", "chrome", "msedge"].includes(smokeBrowser));
assert.ok(ownedDistDirName.startsWith(".next-ona-3d-smoke-"));

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
for (const path of [
  summaryPath,
  serverLogPath,
  failureScreenshotPath,
  desktopScreenshotPath,
  mobileScreenshotPath,
]) {
  assert.equal(dirname(path), artifactDirectory);
  rmSync(path, { force: true });
}

function redact(value) {
  return String(value ?? "")
    .replaceAll(username, "[redacted-username]")
    .replaceAll(password, "[redacted-password]")
    .replaceAll(sessionSecret, "[redacted-session-secret]")
    .replaceAll(accountId, "[redacted-account-id]")
    .replaceAll(privateWorkbookPath, "[redacted-private-workbook]");
}

let playwrightWorkingDirectory = null;
function ensurePlaywrightWorkingDirectory() {
  if (!playwrightWorkingDirectory) {
    playwrightWorkingDirectory = mkdtempSync(join(tmpdir(), "open-ena-ona-3d-playwright-"));
  }
  return playwrightWorkingDirectory;
}

function runCli(args, label, timeout = 120_000) {
  const playwrightCwd = ensurePlaywrightWorkingDirectory();
  const taskNpmCache = join(playwrightCwd, "npm-cache");
  mkdirSync(taskNpmCache, { recursive: true });
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
    key.toLowerCase() !== "npm_config_cache"
  )));
  try {
    return execFileSync(
      playwrightCli.command,
      [...playwrightCli.prefix, "--session", sessionName, ...args],
      {
        cwd: playwrightCwd,
        encoding: "utf8",
        env: {
          ...inheritedEnvironment,
          NPM_CONFIG_CACHE: taskNpmCache,
          npm_config_cache: taskNpmCache,
        },
        maxBuffer: 32 * 1024 * 1024,
        timeout,
      },
    );
  } catch (caught) {
    throw createSafePlaywrightCliError({ caught, label, redact });
  }
}

function browserSource(task, args) {
  return "async (page) => { const task = " + task.toString()
    + "; return await task(page, " + JSON.stringify(args) + "); }";
}

function runBrowserPhase(label, task, args = {}, timeout = 240_000) {
  process.stdout.write("[ONA 3D smoke] " + label + " ... ");
  const output = runCli(["--raw", "run-code", browserSource(task, args)], label, timeout).trim();
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

let ephemeralPostgresRoot = null;
let ephemeralPostgresData = null;
let ephemeralPostgresRunning = false;

async function startEphemeralPostgres() {
  ephemeralPostgresRoot = mkdtempSync(join(tmpdir(), "open-ena-ona-3d-postgres-"));
  ephemeralPostgresData = join(ephemeralPostgresRoot, "data");
  const socketDirectory = join(ephemeralPostgresRoot, "socket");
  const postgresLog = join(ephemeralPostgresRoot, "postgres.log");
  mkdirSync(socketDirectory, { recursive: true });
  execFileSync("initdb", [
    "--pgdata", ephemeralPostgresData,
    "--auth", "trust",
    "--username", "postgres",
    "--encoding", "UTF8",
    "--no-locale",
  ], { stdio: "ignore", timeout: 60_000 });
  const port = await findOpenPort();
  execFileSync("pg_ctl", [
    "--pgdata", ephemeralPostgresData,
    "--log", postgresLog,
    "--options", `-h 127.0.0.1 -p ${port} -k ${socketDirectory}`,
    "--wait",
    "start",
  ], { stdio: "ignore", timeout: 60_000 });
  ephemeralPostgresRunning = true;
  execFileSync("psql", [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--username", "postgres",
    "--dbname", "postgres",
    "--file", join(projectRoot, "migrations", "002_open_ena_auth_security.sql"),
  ], { stdio: "ignore", timeout: 60_000 });
  return `postgresql://postgres@127.0.0.1:${port}/postgres`;
}

function stopEphemeralPostgres() {
  try {
    if (ephemeralPostgresRunning && ephemeralPostgresData) {
      execFileSync("pg_ctl", [
        "--pgdata", ephemeralPostgresData,
        "--wait",
        "--mode", "fast",
        "stop",
      ], { stdio: "ignore", timeout: 60_000 });
    }
  } finally {
    ephemeralPostgresRunning = false;
    ephemeralPostgresData = null;
    if (ephemeralPostgresRoot) {
      assert.equal(dirname(ephemeralPostgresRoot), tmpdir());
      assert.ok(basename(ephemeralPostgresRoot).startsWith("open-ena-ona-3d-postgres-"));
      rmSync(ephemeralPostgresRoot, { recursive: true, force: true });
      ephemeralPostgresRoot = null;
    }
  }
}

async function waitForServer(url, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Retry only this smoke-owned loopback server.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("The smoke-owned Open ENA server did not become ready.");
}

async function stopOwnedServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const waitForExit = (timeout) => new Promise((resolveExit) => {
    if (server.exitCode !== null || server.signalCode !== null) return resolveExit(true);
    const timer = setTimeout(() => resolveExit(false), timeout);
    server.once("exit", () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
  const signal = (name) => {
    try {
      if (process.platform !== "win32") process.kill(-server.pid, name);
      else server.kill(name);
    } catch {
      server.kill(name);
    }
  };
  signal("SIGTERM");
  if (await waitForExit(5_000)) return;
  signal("SIGKILL");
  if (!await waitForExit(5_000)) throw new Error("The smoke-owned server did not stop.");
}

function removeOwnedDistDirectory() {
  assert.equal(dirname(ownedDistDirectory), projectRoot);
  assert.ok(basename(ownedDistDirectory).startsWith(".next-ona-3d-smoke-"));
  rmSync(ownedDistDirectory, { recursive: true, force: true });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactEvidence(path) {
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: sha256(readFileSync(path)),
  };
}

function readGitEvidence() {
  const git = (args) => execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
  return {
    head: git(["rev-parse", "HEAD"]),
    tree: git(["rev-parse", "HEAD^{tree}"]),
    clean: git(["status", "--porcelain=v1", "--untracked-files=all"]) === "",
  };
}

function buildOrderedFixtureCsv() {
  const patterns = [
    [[1, 1, 0, 0, 0], [1, 0, 1, 0, 0], [0, 1, 0, 1, 0]],
    [[0, 1, 1, 0, 0], [1, 1, 0, 0, 0], [1, 0, 0, 0, 1]],
    [[1, 0, 0, 1, 0], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]],
    [[0, 0, 1, 0, 1], [1, 0, 1, 0, 0], [0, 1, 1, 0, 0]],
    [[1, 0, 0, 0, 1], [0, 1, 0, 0, 1], [1, 0, 0, 1, 0]],
    [[0, 1, 0, 1, 0], [1, 0, 0, 1, 0], [0, 0, 1, 1, 0]],
    [[1, 1, 0, 0, 0], [0, 1, 1, 0, 0], [1, 0, 1, 0, 0]],
    [[0, 0, 1, 1, 0], [0, 0, 0, 1, 1], [1, 0, 0, 0, 1]],
  ];
  const rows = ["Group,Name,Conversation,Turn,CODE_A,CODE_B,CODE_C,CODE_D,CODE_E"];
  for (const [groupIndex, group] of fixtureContract.groups.entries()) {
    for (let unitIndex = 0; unitIndex < fixtureContract.unitsPerGroup; unitIndex += 1) {
      const unitPatterns = patterns[(unitIndex + groupIndex * 3) % patterns.length];
      for (let turn = 0; turn < fixtureContract.rowsPerUnit; turn += 1) {
        rows.push([
          group,
          "SYNTHETIC_UNIT_" + (unitIndex + 1),
          "SYNTHETIC_HORIZON_" + (unitIndex + 1),
          turn + 1,
          ...unitPatterns[turn],
        ].join(","));
      }
    }
  }
  return rows.join("\n") + "\n";
}

async function runSyntheticLane(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const audit = {
      analysisRunCount: 0,
      requestedAnalysisKinds: [],
      unhandledRejections: [],
      longTasks: [],
    };
    Object.defineProperty(window, "__openEnaOna3dAudit", { configurable: true, value: audit });
    window.addEventListener("unhandledrejection", (event) => {
      audit.unhandledRejections.push(String(event.reason?.message ?? event.reason ?? "unknown"));
    });
    if (typeof PerformanceObserver === "function") {
      try {
        new PerformanceObserver((list) => {
          audit.longTasks.push(...list.getEntries().map((entry) => entry.duration));
        }).observe({ type: "longtask", buffered: true });
      } catch {
        // Long-task timing is unavailable; the empty array remains explicit.
      }
    }
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function auditedPostMessage(message, ...rest) {
      if (message?.kind === "run" && message?.config) {
        audit.analysisRunCount += 1;
        audit.requestedAnalysisKinds.push(message.config.analysisKind ?? "ena");
      }
      return originalPostMessage.call(this, message, ...rest);
    };
  });
  const digestText = async (text) => await page.evaluate(async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }, text);
  const exportAggregate = async () => {
    await page.getByRole("navigation", { name: "Analysis modes" })
      .getByRole("button", { name: /Stats/ }).click();
    await page.evaluate(() => {
      window.__openEnaAggregateExportText = null;
      if (window.__openEnaAggregateExportHookInstalled) return;
      window.__openEnaAggregateExportHookInstalled = true;
      const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob instanceof Blob && blob.type.includes("csv")) {
          void blob.text().then((text) => { window.__openEnaAggregateExportText = text; });
        }
        return originalCreateObjectUrl(blob);
      };
    });
    const exportButton = page.getByRole("button", { name: /Export aggregate directed edges CSV/ });
    await exportButton.click();
    await page.waitForFunction(() => typeof window.__openEnaAggregateExportText === "string");
    return await digestText(await page.evaluate(() => window.__openEnaAggregateExportText));
  };
  const waitForOrderedPlots = async () => {
    for (const testId of [
      "open-ena-ona-3d-overall-plot",
      "open-ena-ona-3d-primary-plot",
      "open-ena-ona-3d-secondary-plot",
    ]) {
      const panel = page.getByTestId(testId);
      await panel.waitFor({ state: "visible", timeout: 60_000 });
      await panel.locator('[data-ena-interactive-camera="true"][aria-busy="false"]')
        .waitFor({ state: "visible", timeout: 60_000 });
      await panel.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 });
    }
  };
  const readScientificDisplay = async () => await page.evaluate(async () => {
    const ids = [
      "open-ena-ona-3d-overall-plot",
      "open-ena-ona-3d-primary-plot",
      "open-ena-ona-3d-secondary-plot",
    ];
    const payload = ids.map((id) => {
      const panel = document.querySelector('[data-testid="' + id + '"]');
      const region = panel?.querySelector('[data-ena-interactive-camera="true"]');
      const root = panel?.querySelector('[data-ena-plotly-root="true"]');
      const traces = Array.isArray(root?.data) ? root.data : [];
      if (!panel || !region || traces.length === 0) throw new Error("missing ordered 3D scene " + id);
      const networkRoles = new Set([
        "ordered-edge-shaft", "ordered-edge-arrowhead",
        "ordered-self-loop-shaft", "ordered-self-loop-arrowhead",
      ]);
      const science = traces.map((trace) => ({
        role: trace.meta?.role ?? null,
        scope: trace.meta?.scope ?? null,
        groupName: trace.meta?.groupName ?? null,
        orderedEdgeIndices: trace.meta?.orderedEdgeIndices ?? null,
        x: trace.meta?.role === "unit-points" || trace.meta?.role === "code-node" ? trace.x : null,
        y: trace.meta?.role === "unit-points" || trace.meta?.role === "code-node" ? trace.y : null,
        z: trace.meta?.role === "unit-points" || trace.meta?.role === "code-node" ? trace.z : null,
      }));
      return {
        id,
        role: panel.getAttribute("data-ena-plot-role"),
        ranges: [
          region.getAttribute("data-ena-x-range"),
          region.getAttribute("data-ena-y-range"),
          region.getAttribute("data-ena-z-range"),
        ],
        camera: region.getAttribute("data-ena-camera-state"),
        aspect: region.getAttribute("data-ena-aspect-ratio-state"),
        codeNodeCount: Number(region.getAttribute("data-ena-code-node-count")),
        codeLabels: traces.find((trace) => trace.meta?.role === "code-node")?.text ?? [],
        unitMarkers: traces.filter((trace) => trace.meta?.role === "unit-points").map((trace) => ({
          group: trace.meta?.groupName,
          symbol: trace.marker?.symbol,
          count: trace.x?.length ?? 0,
        })),
        directedTraceCount: traces.filter((trace) => networkRoles.has(trace.meta?.role)).length,
        arrowheadCount: traces.filter((trace) => trace.meta?.role === "ordered-edge-arrowhead").length,
        selfLoopCount: traces.filter((trace) => trace.meta?.role === "ordered-self-loop-shaft").length,
        traces,
        science,
      };
    });
    const encoded = new TextEncoder().encode(JSON.stringify(payload.map(({ science, role }) => ({ role, science }))));
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const resultIdentity = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return { payload, resultIdentity };
  });
  const readReciprocalLane = async () => await page.evaluate(() => {
    const root = document.querySelector(
      '[data-testid="open-ena-ona-3d-overall-plot"] [data-ena-plotly-root="true"]',
    );
    const traces = Array.isArray(root?.data) ? root.data : [];
    const codeLabels = traces.find((trace) => trace.meta?.role === "code-node")?.text ?? [];
    const codeCount = codeLabels.length;
    const segments = new Map();
    for (const trace of traces.filter((candidate) => candidate.meta?.role === "ordered-edge-shaft")) {
      const edgeIndices = trace.meta?.orderedEdgeIndices ?? [];
      edgeIndices.forEach((edgeIndex, index) => {
        const groundIndex = edgeIndex % codeCount;
        const responseIndex = Math.floor(edgeIndex / codeCount);
        const edge = {
          ground: codeLabels[groundIndex],
          response: codeLabels[responseIndex],
          groundIndex,
          responseIndex,
        };
        const start = [trace.x[index * 3], trace.y[index * 3], trace.z[index * 3]];
        const end = [trace.x[index * 3 + 1], trace.y[index * 3 + 1], trace.z[index * 3 + 1]];
        segments.set(edge.ground + "→" + edge.response, { edge, start, end });
      });
    }
    for (const [key, segment] of segments) {
      const reverse = segments.get(segment.edge.response + "→" + segment.edge.ground);
      if (!reverse) continue;
      const midpoint = segment.start.map((value, index) => (value + segment.end[index]) / 2);
      const reverseMidpoint = reverse.start.map((value, index) => (value + reverse.end[index]) / 2);
      const separation = Math.hypot(...midpoint.map((value, index) => value - reverseMidpoint[index]));
      if (separation > 1e-9) return { reciprocalLane: key, reverse: segment.edge.response + "→" + segment.edge.ground, separation };
    }
    throw new Error("no non-overlapping reciprocal lane was found");
  });
  const assertNoHorizontalOverflow = async (label) => {
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    assertBrowser(metrics.scrollWidth <= metrics.clientWidth + 1, label + " has horizontal overflow");
    return metrics;
  };

  await page.goto(args.entryUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Account name" }).fill(args.username);
  await page.getByRole("textbox", { name: "Password" }).fill(args.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.waitFor({ timeout: 30_000 });
  await rail.getByRole("button", { name: "Data", exact: true }).click();
  const fileInput = page.locator('input[type=file][accept*=".csv"]');
  await fileInput.evaluate((input, csv) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([csv], "synthetic-ordered-ona.csv", { type: "text/csv" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, args.fixtureCsv);
  await page.getByRole("heading", { name: "Define the ENA model" }).waitFor({ timeout: 30_000 });
  const modelTabs = page.getByRole("tablist", { name: "Model configuration" });
  await modelTabs.getByRole("tab", { name: "Codes" }).click();
  const networkSwitch = page.getByRole("switch", { name: "Network type", exact: true });
  assertBrowser(await networkSwitch.getAttribute("aria-checked") === "true",
    "the synthetic model did not start as Standard Network");
  await networkSwitch.click();
  assertBrowser(await networkSwitch.getAttribute("aria-checked") === "false",
    "the synthetic model did not switch to Ordered Network");
  await modelTabs.getByRole("tab", { name: "Windows" }).click();
  await page.getByRole("radio", { name: /Confirmed source-record order/ }).click();
  await page.getByRole("checkbox", { name: /I confirm that source-record order/ }).check();
  await page.getByLabel("Total rows including the current response").fill(String(args.rowsPerUnit));
  await modelTabs.getByRole("tab", { name: "Codes" }).click();
  await page.getByRole("button", { name: "Edit p² directional mask" }).click();
  const maskCell = page.getByRole("checkbox", { name: args.maskedDirection });
  assertBrowser(await maskCell.isChecked(), "the synthetic masked direction did not start enabled");
  await maskCell.uncheck();
  await page.getByRole("button", { name: "Close directional mask editor" }).click();
  const buildButton = page.getByRole("button", { name: "Build ONA model" });
  assertBrowser(await buildButton.isEnabled(), "Build ONA model is disabled");
  await buildButton.click();
  await page.getByRole("button", { name: "Rebuild ONA model" }).waitFor({ timeout: 60_000 });
  await page.getByTestId("open-ena-ordered-result-layout").waitFor({ timeout: 60_000 });
  const twoDPointAudit = await page.evaluate(() => {
    const wrappers = [...document.querySelectorAll('[data-ona-unit-point="true"]')];
    return {
      count: wrappers.length,
      groups: [...new Set(wrappers.map((wrapper) => wrapper.getAttribute("data-ona-group")))],
      allCircles: wrappers.every((wrapper) => {
        const point = wrapper.querySelector("circle");
        return point?.tagName.toLowerCase() === "circle" && !wrapper.querySelector("rect, polygon");
      }),
      literalContract: wrappers.filter((wrapper) => (
        wrapper.getAttribute("data-ona-point-shape") === "circle"
      )).length,
    };
  });
  assertBrowser(twoDPointAudit.count === args.expectedUnits, "2D ONA unit point count is incorrect");
  assertBrowser(twoDPointAudit.allCircles && twoDPointAudit.literalContract === args.expectedUnits,
    '2D ONA violates data-ona-point-shape="circle"');
  assertBrowser(twoDPointAudit.groups.length === 2, "2D ONA did not render both groups as circles");
  const aggregateExportSha256Before = await exportAggregate();
  assertBrowser(await page.evaluate(() => window.__openEnaOna3dAudit.analysisRunCount) === 1,
    "synthetic ONA did not run exactly once");

  const visualizationDiagnostics = await page.locator(".ena-view-toggle").evaluateAll((nodes) => (
    nodes.map((node) => ({
      ariaLabel: node.getAttribute("aria-label"),
      role: node.getAttribute("role"),
      buttons: [...node.querySelectorAll("button")].map((button) => ({
        text: button.textContent?.trim() ?? "",
        ariaLabel: button.getAttribute("aria-label"),
        disabled: button.disabled,
      })),
    }))
  ));
  const visualization = page.getByRole("group", { name: "ENA visualization options" });
  const threeDButton = visualization.getByRole("button", { name: /3D ONA/ });
  const roleDiagnostics = {
    groupCount: await visualization.count(),
    buttonCount: await threeDButton.count(),
  };
  assertBrowser(roleDiagnostics.groupCount === 1 && roleDiagnostics.buttonCount === 1,
    `ONA 3D visualization locator mismatch: ${JSON.stringify({ visualizationDiagnostics, roleDiagnostics })}`);
  assertBrowser(await threeDButton.isEnabled(), "3D ONA is disabled");
  const resourceStart = await page.evaluate(() => performance.now());
  const readyStart = Date.now();
  await threeDButton.click();
  await waitForOrderedPlots();
  const threePlotsReadyMs = Date.now() - readyStart;
  assertBrowser(threePlotsReadyMs < 5_000, "Overall + Primary + Secondary exceeded 5000 ms");
  await page.waitForTimeout(400);
  const initial = await readScientificDisplay();
  assertBrowser(initial.payload.every((plot) => plot.codeNodeCount === 5), "a scene omitted fitted code nodes");
  assertBrowser(initial.payload.every((plot) => plot.directedTraceCount <= 32), "directed trace budget exceeded 32");
  assertBrowser(initial.payload.every((plot) => plot.arrowheadCount > 0), "a scene omitted directed Cone arrowheads");
  assertBrowser(initial.payload.every((plot) => plot.selfLoopCount > 0), "a scene omitted self-loop shafts");
  assertBrowser(initial.payload[0].unitMarkers.length === 2
    && initial.payload[0].unitMarkers.every((marker) => marker.symbol === "circle"),
  "Overall base unit marker.symbol is not circle for both groups");
  assertBrowser(initial.payload[1].unitMarkers.length === 0 && initial.payload[2].unitMarkers.length === 0,
    "Primary or Secondary invented unit points");
  const visibleEdges = initial.payload[0].traces
    .flatMap((trace) => trace.meta?.orderedEdgeIndices ?? [])
    .map((edgeIndex) => {
      const codeCount = initial.payload[0].codeLabels.length;
      return {
        ground: initial.payload[0].codeLabels[edgeIndex % codeCount],
        response: initial.payload[0].codeLabels[Math.floor(edgeIndex / codeCount)],
      };
    });
  assertBrowser(!visibleEdges.some((edge) => edge.ground === "CODE_E" && edge.response === "CODE_A"),
    "the masked CODE_E to CODE_A cell entered the scene");
  assertBrowser(initial.payload.every((plot) => JSON.stringify(plot.ranges) === JSON.stringify(initial.payload[0].ranges)),
    "the ONA scenes do not share the full fitted frame");
  assertBrowser(initial.payload.every((plot) => plot.camera === initial.payload[0].camera
    && plot.aspect === initial.payload[0].aspect), "the ONA scenes do not share camera/aspect ratio");
  const reciprocalLane = await readReciprocalLane();

  const overallPanel = page.getByTestId("open-ena-ona-3d-overall-plot");
  const sidePanels = [
    page.getByTestId("open-ena-ona-3d-primary-plot"),
    page.getByTestId("open-ena-ona-3d-secondary-plot"),
  ];
  const sideHandles = await Promise.all(sidePanels.map((panel) => panel.elementHandle()));
  sideHandles.forEach((handle) => assertBrowser(Boolean(handle), "side panel handle is unavailable"));
  await sideHandles[0].evaluate((node) => node.setAttribute("data-sidePanelsPreserved", "primary"));
  await sideHandles[1].evaluate((node) => node.setAttribute("data-sidePanelsPreserved", "secondary"));
  const dataViewToggle = page.getByTestId("open-ena-data-view-toggle");
  const clickDataViewWithMouse = async () => {
    await dataViewToggle.scrollIntoViewIfNeeded();
    const box = await dataViewToggle.boundingBox();
    assertBrowser(box, "Data View mouse target has no bounding box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  await clickDataViewWithMouse();
  await page.getByTestId("open-ena-ona-3d-data-view").waitFor({ timeout: 30_000 });
  assertBrowser(await page.getByTestId("open-ena-ona-3d-overall-plot").count() === 0,
    "Data View did not replace Overall");
  assertBrowser(await sidePanels[0].getAttribute("data-sidePanelsPreserved") === "primary"
    && await sidePanels[1].getAttribute("data-sidePanelsPreserved") === "secondary",
  "sidePanelsPreserved failed during Data View");
  assertBrowser(await page.getByTestId("open-ena-data-view").locator("tbody tr").count() > 0,
    "ordered audit Data View is empty");
  await clickDataViewWithMouse();
  await waitForOrderedPlots();
  await dataViewToggle.focus();
  await dataViewToggle.press("Enter");
  await page.getByTestId("open-ena-ona-3d-data-view").waitFor({ timeout: 30_000 });
  await dataViewToggle.press("Enter");
  await waitForOrderedPlots();
  assertBrowser(await page.evaluate(() => window.__openEnaOna3dAudit.analysisRunCount) === 1,
    "Data View or 2D/3D switching reran ONA");

  const initialAxes = await Promise.all(["x", "y", "z"].map((axis) => (
    page.getByTestId("open-ena-3d-axis-" + axis).inputValue()
  )));
  await page.getByTestId("open-ena-3d-axis-z").selectOption(initialAxes[0]);
  await waitForOrderedPlots();
  await page.getByTestId("open-ena-3d-axis-z").selectOption(initialAxes[2]);
  await waitForOrderedPlots();
  await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const threshold = page.getByRole("slider", { name: "Minimum relative edge" });
  const pointScale = page.getByRole("slider", { name: "Unit point size" });
  const thresholdInitial = await threshold.inputValue();
  const pointScaleInitial = await pointScale.inputValue();
  await threshold.fill("0.2");
  await pointScale.fill("1.4");
  await threshold.fill(thresholdInitial);
  await pointScale.fill(pointScaleInitial);
  const cameraControl = page.getByTestId("open-ena-3d-camera-position");
  await cameraControl.getByRole("radio", { name: /X-Y plane/ }).check();
  await cameraControl.getByRole("radio", { name: /Default 3D Camera/ }).check();
  await overallPanel.getByRole("button", { name: /Zoom In/ }).click();
  await overallPanel.getByRole("button", { name: /Recenter/ }).click();
  const entryOrigin = await page.evaluate(() => location.origin);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: entryOrigin });
  await overallPanel.locator('button[data-ena-plot-action="copy-image"]').click();
  const fullscreen = overallPanel.locator('button[data-ena-plot-action="fullscreen"]');
  await fullscreen.click();
  await page.waitForTimeout(200);
  const readFullscreenActive = async () => await overallPanel.evaluate((panel) => (
    document.fullscreenElement === panel || panel.getAttribute("data-fallback-fullscreen") === "true"
  ));
  const fullscreenActive = await readFullscreenActive();
  assertBrowser(fullscreenActive, "Overall fullscreen did not enter native or fallback mode");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  if (await readFullscreenActive()) {
    await fullscreen.click();
    await page.waitForTimeout(200);
  }
  assertBrowser(!await readFullscreenActive(), "Overall fullscreen did not exit");
  assertBrowser(await fullscreen.evaluate((button) => document.activeElement === button),
    "Overall fullscreen did not restore focus to its action button");

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(200);
    await assertNoHorizontalOverflow(String(width));
  }
  await page.screenshot({ path: args.mobileScreenshotPath, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const text200Percent = await assertNoHorizontalOverflow("200% text");
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.screenshot({ path: args.desktopScreenshotPath, fullPage: true });

  const final = await readScientificDisplay();
  assertBrowser(final.resultIdentity === initial.resultIdentity, "resultIdentity changed after display controls");
  const aggregateExportSha256After = await exportAggregate();
  assertBrowser(aggregateExportSha256After === aggregateExportSha256Before,
    "aggregateExportSha256 changed after 2D/3D display operations");
  const resourceBudget = await page.evaluate((start) => {
    const scripts = performance.getEntriesByType("resource").filter((entry) => (
      entry.initiatorType === "script" && entry.startTime >= start
    ));
    return {
      transferBytes: scripts.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      decodedBytes: scripts.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
      largestLongTaskMs: Math.max(0, ...window.__openEnaOna3dAudit.longTasks),
    };
  }, resourceStart);
  assertBrowser(resourceBudget.transferBytes < 800_000, "Plotly transfer bytes exceed 800000");
  assertBrowser(resourceBudget.decodedBytes < 2_200_000, "Plotly decoded bytes exceed 2200000");
  assertBrowser(resourceBudget.largestLongTaskMs < 1_500, "largest long task exceeds 1500 ms");
  const runtime = await page.evaluate(() => ({
    analysisRunCount: window.__openEnaOna3dAudit.analysisRunCount,
    requestedAnalysisKinds: window.__openEnaOna3dAudit.requestedAnalysisKinds,
    unhandledRejections: window.__openEnaOna3dAudit.unhandledRejections,
  }));
  assertBrowser(runtime.analysisRunCount === 1, "analysisRunCount === 1 failed");
  assertBrowser(JSON.stringify(runtime.requestedAnalysisKinds) === JSON.stringify(["ona"]),
    "worker did not receive exactly one ONA config");
  assertBrowser(consoleErrors.length === 0, "browser consoleErrors are nonzero");
  assertBrowser(pageErrors.length === 0, "browser pageErrors are nonzero");
  assertBrowser(runtime.unhandledRejections.length === 0, "browser unhandledrejection is nonzero");
  await Promise.all(sideHandles.map((handle) => handle.dispose()));
  return {
    status: "PASS",
    analysisRunCount: runtime.analysisRunCount,
    resultIdentity: initial.resultIdentity,
    aggregateExportSha256: aggregateExportSha256Before,
    twoDPointAudit,
    reciprocalLane,
    traceCounts: initial.payload.map((plot) => ({ role: plot.role, directed: plot.directedTraceCount })),
    threePlotsReadyMs,
    resourceBudget,
    text200Percent,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    unhandledRejections: runtime.unhandledRejections.length,
  };
}

async function runYuPrivateLane(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(args.entryUrl, { waitUntil: "domcontentloaded" });
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.waitFor({ timeout: 30_000 });
  await rail.getByRole("button", { name: "Data", exact: true }).click();
  await page.locator('input[type=file][accept*=".xlsx"]').setInputFiles(args.workbookPath);
  await page.getByRole("heading", { name: "Define the ENA model" }).waitFor({ timeout: 30_000 });
  const modelTabs = page.getByRole("tablist", { name: "Model configuration" });
  await modelTabs.getByRole("tab", { name: "Codes" }).click();
  const networkSwitch = page.getByRole("switch", { name: "Network type", exact: true });
  assertBrowser(await networkSwitch.getAttribute("aria-checked") === "true",
    "the Yu model did not start as Standard Network");
  await networkSwitch.click();
  assertBrowser(await networkSwitch.getAttribute("aria-checked") === "false",
    "the Yu model did not switch to Ordered Network");
  await modelTabs.getByRole("tab", { name: "Units" }).click();
  const unitIdentity = page.locator('[data-ena-official-field-path="true"][aria-label="Unit identity"]');
  const unitIdentityPicker = unitIdentity.getByRole("button", {
    name: "Add or remove Unit identity fields",
    exact: true,
  });
  await unitIdentityPicker.click();
  await unitIdentity.getByRole("checkbox", { name: "Group", exact: true }).check();
  await unitIdentity.getByRole("checkbox", { name: "Name", exact: true }).check();
  await unitIdentity.getByRole("checkbox", { name: "Lesson", exact: true }).uncheck();
  await unitIdentityPicker.click();
  await page.getByLabel("Comparison group").selectOption("Group");
  await modelTabs.getByRole("tab", { name: "Horizons" }).click();
  const horizonIdentity = page.locator('[data-ena-official-field-path="true"][aria-label="Horizon identity"]');
  const horizonIdentityPicker = horizonIdentity.getByRole("button", {
    name: "Add or remove Horizon identity fields",
    exact: true,
  });
  await horizonIdentityPicker.click();
  await horizonIdentity.getByRole("checkbox", { name: "Group", exact: true }).check();
  await horizonIdentity.getByRole("checkbox", { name: "Name", exact: true }).check();
  await horizonIdentity.getByRole("checkbox", { name: "Lesson", exact: true }).uncheck();
  await horizonIdentityPicker.click();
  await modelTabs.getByRole("tab", { name: "Windows" }).click();
  const orderGroup = page.getByRole("group", { name: "Order columns and typed comparators" });
  await orderGroup.getByRole("checkbox", { name: "Lesson", exact: true }).check();
  await orderGroup.getByLabel("Comparator").selectOption("string");
  await page.getByLabel("Total rows including the current response").fill("2");
  const buildButton = page.getByRole("button", { name: "Build ONA model" });
  assertBrowser(await buildButton.isEnabled(), "Yu Build ONA model is disabled");
  await buildButton.click();
  await page.getByRole("button", { name: "Rebuild ONA model" }).waitFor({ timeout: 90_000 });
  const pointAudit = await page.evaluate(() => {
    const points = [...document.querySelectorAll('[data-ona-unit-point="true"]')];
    return {
      count: points.length,
      allCircles: points.every((wrapper) => {
        const point = wrapper.querySelector("circle");
        return wrapper.getAttribute("data-ona-point-shape") === "circle"
          && point?.tagName.toLowerCase() === "circle"
          && !wrapper.querySelector("rect, polygon");
      }),
    };
  });
  assertBrowser(pointAudit.count === 87 && pointAudit.allCircles, "Yu 2D unit points are not 87 circles");
  const visualization = page.getByRole("group", { name: "ENA visualization options" });
  await visualization.getByRole("button", { name: /3D ONA/ }).click();
  for (const id of [
    "open-ena-ona-3d-overall-plot",
    "open-ena-ona-3d-primary-plot",
    "open-ena-ona-3d-secondary-plot",
  ]) {
    const panel = page.getByTestId(id);
    await panel.locator('[data-ena-interactive-camera="true"][aria-busy="false"]')
      .waitFor({ state: "visible", timeout: 90_000 });
  }
  const traceReceipt = await page.evaluate(() => {
    const root = document.querySelector(
      '[data-testid="open-ena-ona-3d-overall-plot"] [data-ena-plotly-root="true"]',
    );
    const region = document.querySelector(
      '[data-testid="open-ena-ona-3d-overall-plot"] [data-ena-interactive-camera="true"]',
    );
    const traces = Array.isArray(root?.data) ? root.data : [];
    return {
      codeNodeCount: Number(region?.getAttribute("data-ena-code-node-count")),
      arrows: traces.filter((trace) => trace.meta?.role === "ordered-edge-arrowhead").length,
      selfLoops: traces.filter((trace) => trace.meta?.role === "ordered-self-loop-shaft").length,
      allUnitSymbolsCircle: traces.filter((trace) => trace.meta?.role === "unit-points")
        .every((trace) => trace.marker?.symbol === "circle"),
    };
  });
  assertBrowser(traceReceipt.codeNodeCount === 7, "Yu ONA does not show seven code nodes");
  assertBrowser(traceReceipt.arrows > 0,
    `Yu ONA directed arrows are missing (visible arrow traces: ${traceReceipt.arrows})`);
  assertBrowser(traceReceipt.allUnitSymbolsCircle, "Yu 3D unit base symbols are not circles");
  await visualization.getByRole("button", { name: /2D ONA/ }).click();
  await visualization.getByRole("button", { name: /3D ONA/ }).click();
  const toggle = page.getByTestId("open-ena-data-view-toggle");
  await toggle.click();
  const auditedRows = await page.getByTestId("open-ena-data-view").locator("tbody tr").count();
  assertBrowser(auditedRows > 0, "Yu ordered audit Data View is empty");
  await toggle.click();
  await rail.getByRole("button", { name: /Stats/ }).click();
  const coverage = page.getByLabel("ONA model coverage");
  const coverageValues = await coverage.locator("li strong").evaluateAll((nodes) => nodes.map((node) => Number(node.textContent)));
  const onaStats = page.getByTestId("open-ena-ona-stats");
  const rawTotal = Number(await onaStats.getByText("Total", { exact: true })
    .locator("xpath=following-sibling::dd").textContent());
  const rawSelfConnections = Number(await onaStats.getByText("Self-connections", { exact: true })
    .locator("xpath=following-sibling::dd").textContent());
  assertBrowser(coverageValues[0] === 87 && coverageValues[1] === 174
    && coverageValues[3] === 7 && coverageValues[4] === 49,
    "Yu aggregate coverage receipt differs");
  assertBrowser(coverageValues[5] === 3 && rawTotal === 811,
    `Yu zero-network or total receipt differs (actual total: ${rawTotal}; actual zero networks: ${coverageValues[5]})`);
  assertBrowser(rawSelfConnections > 0, "Yu authoritative stats contain no self-connections");
  assertBrowser(traceReceipt.selfLoops > 0,
    `Yu ONA self-loops are missing (visible self-loop traces: ${traceReceipt.selfLoops}; raw self-connections: ${rawSelfConnections})`);
  assertBrowser(consoleErrors.length === 0 && pageErrors.length === 0, "Yu private browser lane emitted errors");
  return {
    aggregateOnly: true,
    sourceRows: 174,
    units: 87,
    codeNodeCount: 7,
    directedDimensions: coverageValues[4],
    connectionTotal: rawTotal,
    selfConnections: rawSelfConnections,
    zeroNetworks: 3,
    pointCircles2d: pointAudit.count,
    dataViewAuditedRowsVisible: auditedRows,
    consoleErrors: 0,
    pageErrors: 0,
  };
}

const sourceEvidenceBefore = readGitEvidence();
assert.equal(sourceEvidenceBefore.clean, true, "ONA 3D browser evidence requires a clean source worktree");
const smokeSourceSha256 = sha256(readFileSync(smokeSourcePath));
let ownedServer = null;
let browserOpened = false;
let primaryFailure = null;
let summary = null;
let baseUrl = null;

try {
  execFileSync("npx", ["--version"], { encoding: "utf8", timeout: 30_000 });
  const playwrightCliVersion = runCli(["--version"], "resolve Playwright CLI", 120_000).trim();
  const port = await findOpenPort();
  baseUrl = "http://127.0.0.1:" + port;
  const authDatabaseUrl = await startEphemeralPostgres();
  removeOwnedDistDirectory();
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
    !key.startsWith("OPEN_ENA_ONA_3D_SMOKE_")
      && ![
        "NEXT_DIST_DIR",
        "OPEN_ENA_USERNAME",
        "OPEN_ENA_PASSWORD",
        "OPEN_ENA_SESSION_SECRET",
        "OPEN_ENA_ACCOUNT_ID",
        "OPEN_ENA_AUTH_DATABASE_URL",
      ].includes(key)
  )));
  const ownedEnvironment = {
    ...environment,
    NODE_ENV: "production",
    NEXT_DIST_DIR: ownedDistDirName,
    OPEN_ENA_USERNAME: username,
    OPEN_ENA_PASSWORD: password,
    OPEN_ENA_SESSION_SECRET: sessionSecret,
    OPEN_ENA_ACCOUNT_ID: accountId,
    OPEN_ENA_AUTH_DATABASE_URL: authDatabaseUrl,
    OPEN_ENA_PUBLIC_ORIGIN: baseUrl,
    OPEN_ENA_ALLOWED_ORIGINS: baseUrl,
    OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS: "1",
  };
  const logFd = openSync(serverLogPath, "w");
  try {
    process.stdout.write("[ONA 3D smoke] build production application ... ");
    execFileSync("npm", ["run", "build"], {
      cwd: projectRoot,
      env: ownedEnvironment,
      stdio: ["ignore", logFd, logFd],
      timeout: 600_000,
    });
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
  await waitForServer(baseUrl + "/en/open-ena");
  runCli(["open", "about:blank", "--browser", smokeBrowser], "open browser", 120_000);
  browserOpened = true;
  const fixtureCsv = buildOrderedFixtureCsv();
  const synthetic = runBrowserPhase(
    "run the synthetic directed ONA lifecycle",
    runSyntheticLane,
    {
      entryUrl: baseUrl + "/en/open-ena",
      username,
      password,
      fixtureCsv,
      rowsPerUnit: fixtureContract.rowsPerUnit,
      expectedUnits: fixtureContract.groups.length * fixtureContract.unitsPerGroup,
      maskedDirection: fixtureContract.maskedDirection,
      desktopScreenshotPath,
      mobileScreenshotPath,
    },
    360_000,
  );
  const yu = existsSync(privateWorkbookPath)
    ? runBrowserPhase(
        "run the aggregate-only Yu private lane",
        runYuPrivateLane,
        { entryUrl: baseUrl + "/en/open-ena", workbookPath: privateWorkbookPath },
        300_000,
      )
    : { aggregateOnly: true, status: "NOT_RUN_PRIVATE_WORKBOOK_MISSING" };
  summary = {
    status: "PASS",
    browser: smokeBrowser,
    playwrightCliSource: playwrightCli.source,
    playwrightCliVersion,
    baseUrl,
    fixture: {
      groups: fixtureContract.groups.length,
      codes: fixtureContract.codes.length,
      rowsPerUnit: fixtureContract.rowsPerUnit,
      sourceRows: fixtureCsv.trim().split("\n").length - 1,
    },
    synthetic,
    yuPrivate: yu,
    source: { ...sourceEvidenceBefore, smokeSourceSha256 },
  };
} catch (caught) {
  primaryFailure = caught;
  if (browserOpened) {
    try {
      runCli(["screenshot", "--filename", failureScreenshotPath], "capture failure screenshot", 30_000);
    } catch {
      // Preserve the primary product failure.
    }
  }
  if (existsSync(serverLogPath)) {
    const tail = redact(readFileSync(serverLogPath, "utf8")).slice(-12_000);
    if (tail) process.stderr.write("[ONA 3D smoke] server log tail:\n" + tail + "\n");
  }
} finally {
  try {
    if (browserOpened) runCli(["close"], "close browser", 30_000);
  } catch (caught) {
    if (!primaryFailure) primaryFailure = caught;
  }
  try {
    await stopOwnedServer(ownedServer);
  } catch (caught) {
    if (!primaryFailure) primaryFailure = caught;
  }
  try {
    stopEphemeralPostgres();
  } catch (caught) {
    if (!primaryFailure) primaryFailure = caught;
  }
  writeFileSync(tsconfigPath, originalTsconfig, "utf8");
  removeOwnedDistDirectory();
  if (playwrightWorkingDirectory) {
    rmSync(playwrightWorkingDirectory, { recursive: true, force: true });
    playwrightWorkingDirectory = null;
  }
  if (existsSync(serverLogPath)) {
    writeFileSync(serverLogPath, redact(readFileSync(serverLogPath, "utf8")), "utf8");
  }
}

if (primaryFailure) {
  process.stderr.write("[ONA 3D smoke] FAIL: " + redact(primaryFailure instanceof Error ? primaryFailure.message : primaryFailure) + "\n");
  process.exitCode = 1;
} else {
  const sourceEvidenceAfter = readGitEvidence();
  assert.deepEqual(sourceEvidenceAfter, sourceEvidenceBefore, "browser smoke changed source Git state");
  summary.source.sourceEvidenceAfter = sourceEvidenceAfter;
  summary.evidence = {
    desktop: artifactEvidence(desktopScreenshotPath),
    mobile: artifactEvidence(mobileScreenshotPath),
    serverLog: artifactEvidence(serverLogPath),
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({
    status: summary.status,
    synthetic: summary.synthetic,
    yuPrivate: summary.yuPrivate,
    summary: artifactEvidence(summaryPath),
  }, null, 2) + "\n");
}
