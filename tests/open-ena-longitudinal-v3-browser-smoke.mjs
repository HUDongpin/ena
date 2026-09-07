#!/usr/bin/env node

import assert from "node:assert/strict";
import { createServedBrowserV3, literalGit } from "./helpers/open-ena-served-browser-v3.mjs";
import { nativeFixtureIdentitiesV3 } from "./helpers/open-ena-native-browser-fixture-v3.mjs";
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
import { classifyChromiumCanvasReadbackDiagnostic } from "./support/open-ena-browser-warning-classifier.mjs";

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
  isometric: "Default 3D Camera",
  xy: "X-Y plane",
  xz: "X-Z plane",
  yz: "Y-Z plane",
  yx: "Y-X plane",
  zx: "Z-X plane",
  zy: "Z-Y plane",
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
// Plotly's live camera orthogonalizes the declared up vector against the
// eye-to-center vector. Compare that exact orientation, including roll, rather
// than requiring the nonorthogonal declarative vector to survive normalization.
for (const expected of Object.values(expectedCameraStates)) {
  const eye = [expected.eye.x - expected.center.x, expected.eye.y - expected.center.y, expected.eye.z - expected.center.z];
  const up = [expected.up.x, expected.up.y, expected.up.z];
  const factor = up.reduce((sum, value, i) => sum + value * eye[i], 0) / eye.reduce((sum, value) => sum + value * value, 0);
  const perpendicular = up.map((value, i) => value - factor * eye[i]);
  const length = Math.hypot(...perpendicular);
  expected.up = { x: perpendicular[0] / length, y: perpendicular[1] / length, z: perpendicular[2] / length };
}
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

let runtime = null;
async function runBrowserPhase(label, task, args = {}, timeout = 180_000) {
  process.stdout.write("[longitudinal V3 smoke] " + label + " ... ");
  const result = await runtime.stage(label, () => task(runtime.page, args), timeout);
  writeFileSync(join(artifactDirectory, label.replace(/[^a-z0-9]+/giu, "-") + ".json"), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write("PASS\n");
  return result;
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
  const git = (args) => literalGit(projectRoot, args);
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
  assert.ok(statSync(zipPath).size > 0);
  const memberNames = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }).trim().split("\n");
  assert.ok(memberNames.every(safeArchiveMember));
  assert.equal(new Set(memberNames).size, memberNames.length);
  execFileSync("unzip", ["-t", zipPath], { encoding: "utf8", timeout: 30_000 });
  const extracted = join(downloadDirectory, "extracted-" + kind);
  mkdirSync(extracted, { recursive: true });
  execFileSync("unzip", ["-qq", zipPath, "-d", extracted], { encoding: "utf8", timeout: 30_000 });
  const manifest = JSON.parse(readFileSync(join(extracted, "manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.kind, "open-ena-native-trajectory-export-manifest");
  assert.equal(manifest.executable, false);
  assert.equal(manifest.disclosure, participantLevelIncluded ? "participant-opt-in" : "aggregate");
  const required = ["analysis.json", "plot-specification.json", "trajectory-inference.csv", ...(participantLevelIncluded ? ["participants.json"] : [])];
  assert.deepEqual(manifest.files.map(file => file.filename).sort(), required.sort());
  assert.deepEqual(memberNames.sort(), [...required, "manifest.json"].sort());
  for (const member of manifest.files) {
    assert.ok(safeArchiveMember(member.filename));
    assert.equal(member.mimeType, member.filename.endsWith('.csv') ? "text/csv" : "application/json");
    const bytes = readFileSync(join(extracted, member.filename));
    assert.equal(bytes.byteLength, member.byteLength);
    assert.equal(sha256(bytes), member.sha256);
  }
  const analysis = JSON.parse(readFileSync(join(extracted, "analysis.json"), "utf8"));
  const plot = JSON.parse(readFileSync(join(extracted, "plot-specification.json"), "utf8"));
  assert.deepEqual(analysis.binding, manifest.binding);
  assert.deepEqual(plot.binding, manifest.binding);
  assert.equal(plot.purpose, "aggregate-path-comparison-complete-cohort");
  assert.equal(plot.participantTracesIncluded, false);
  assert.deepEqual(plot.meanNetworkEdges, []);
  assert.deepEqual(plot.uncertaintyGeometry, []);
  assert.deepEqual(plot.glyph, { symbol: "square", size: 7 });
  const inferenceRequestKinds = analysis.ranks.map(rank => rank.kind);
  assert.deepEqual(inferenceRequestKinds, ["trajectory-independent-period", "trajectory-paired-periods", "trajectory-repeated-periods"]);
  assert.deepEqual(manifest.requestFamilies, [...inferenceRequestKinds, "path-comparison"]);
  const path = analysis.pathComparison;
  assert.equal(path.repetitions, 500); assert.equal(path.seed, 2026);
  assert.equal(path.cohortPolicy, "all-period-complete");
  assert.equal(path.identityConfirmed, true); assert.equal(path.independentGroupsConfirmed, true);
  assert.equal(path.axes.length, 3); assert.equal(new Set(path.axes).size, 3);
  assert.ok(path.tests.length > 0);
  assert.equal(path.tests.length, 5 * path.periods.length + 4 * (path.periods.length - 1));
  assert.match(path.scientificContextSha256, /^[a-f0-9]{64}$/u);
  assert.match(path.permutationPlanSha256, /^[a-f0-9]{64}$/u);
  for (const test of path.tests) {
    assert.equal(test.permutationCount, 500);
    assert.ok(Number.isFinite(test.observed) && Number.isFinite(test.pValue) && Number.isFinite(test.holmAdjustedPValue));
    assert.ok(test.pValue >= 0 && test.pValue <= test.holmAdjustedPValue && test.holmAdjustedPValue <= 1);
  }
  const inferenceCsv = readFileSync(join(extracted, "trajectory-inference.csv"), "utf8");
  for (const family of manifest.requestFamilies) assert.ok(inferenceCsv.includes(family));
  const forbiddenKeys = new Set(["entities", "identityDictionary", "unitSequences", "participantPeriods", "unitOrder", "rawInput", "set", "sourceRows", "traces", "sourceMetadata"]);
  const noParticipantFacts = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!forbiddenKeys.has(key), `aggregate ${kind} leaked identity-bearing ${key}`);
      noParticipantFacts(item);
    }
  };
  noParticipantFacts(analysis); noParticipantFacts(plot);
  let participants = null;
  if (participantLevelIncluded) {
    participants = JSON.parse(readFileSync(join(extracted, "participants.json"), "utf8"));
    assert.equal(participants.disclosure, "participant-opt-in");
    assert.ok(participants.entities.length > 0 && participants.entities.every(entity => entity.identity && entity.steps.length > 0));
    assert.deepEqual(participants.binding, manifest.binding);
  }
  return { extracted, manifest, analysis, plot, participants, zipSha256: sha256(readFileSync(zipPath)) };
}
function verifyStandaloneDownloads(downloads, aggregate) {
  for (const name of [...aggregate.manifest.files.map(file => file.filename), "manifest.json"]) {
    const standaloneBytes = readFileSync(downloads[name]);
    assert.deepEqual(standaloneBytes, readFileSync(join(aggregate.extracted, name)), `${name} differs from genuine ZIP`);
  }
}
// Preservation map: native Worker binding replaces legacy path-task receipts;
// separately collected real rank designs replace an all-families legacy table;
// complete-cohort native ZIP replaces Plotly/V2 serialization; native SVG
// replaces Plotly 2D. Camera math and full fullscreen isolation checks remain.
async function nativeScience(page) {
  return page.evaluate(() => {
    const audit = window.__openEnaNativeAudit;
    const response = audit?.responses.at(-1), result = response?.result;
    const request = audit?.requests.find(value => value.id === response?.id);
    if (request?.kind !== "run-open-ena-plan-v3" || response?.kind !== "result-v3"
      || request.plan.header.executionPlanSha256 !== response.executionPlanSha256
      || result.binding.executionPlanSha256 !== response.executionPlanSha256
      || result.binding.datasetSha256 !== request.plan.header.datasetSha256
      || document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") !== "current") throw new Error("native scientific request/result binding is not current");
    const science = JSON.stringify({ binding: result.binding, configuration: result.configuration, set: result.set, executionProvenance: result.executionProvenance });
    if (window.__nativeLongitudinalScience && window.__nativeLongitudinalScience !== science) throw new Error("display action changed bound fitted coordinates, configuration or provenance");
    window.__nativeLongitudinalScience ??= science;
    return { resultHashes: [result.binding.scientificResultSha256], binding: result.binding, taskRequestCount: audit.requests.length, responseCount: audit.responses.length };
  });
}
function nativeCameraControl(page) {
  const controls = page.getByRole("group", { name: "Camera position", exact: true });
  return {
    async selectOption(value) { await page.locator(`.ena-camera-fieldset input[value="${value}"]`).check(); },
    async isVisible() { return page.locator('.ena-camera-fieldset').isVisible(); },
    async selection() { return page.locator('.ena-camera-fieldset input:checked').evaluate(input => ({ value: input.value, label: input.parentElement.textContent.trim() })); },
  };
}
function nativeProjectionControl(page) {
  return { async selectOption(projection) {
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
    await page.locator('.ena-visual-toolbar').getByRole("button", { name: projection === "3d" ? "3D ENA" : "2D ENA", exact: true }).click();
    if (projection === "3d") {
      await page.locator('[data-ena-plotly-root=true]').waitFor();
      await page.waitForFunction(() => Boolean(document.querySelector('[data-ena-plotly-root=true]')?._fullLayout?.scene));
    } else {
      const axes = await page.evaluate(() => window.__openEnaNativeAudit.responses.at(-1).result.executionProvenance.projection.fullAxes.slice(0, 3));
      for (const [index, letter] of [...projection].entries()) await page.getByRole("combobox", { name: `Axis ${index + 1}`, exact: true }).selectOption(axes["xyz".indexOf(letter)]);
      await page.locator('svg.open-ena-main-svg').waitFor();
    }
  } };
}
async function nativeSvgAudit(page) {
  return page.locator('svg.open-ena-main-svg').evaluate(svg => ({
    codeLabels: [...svg.querySelectorAll('[data-ena-code]')].map(node => node.getAttribute('data-ena-code')),
    centroids: [...svg.querySelectorAll('[data-ena-trajectory-centroid] rect')].map(node => ({ x: node.getAttribute('x'), y: node.getAttribute('y'), width: node.getAttribute('width'), height: node.getAttribute('height') })),
    points: [...svg.querySelectorAll('[data-ena-unit-point]')].map(node => [node.getAttribute('cx'), node.getAttribute('cy'), node.getAttribute('transform')]),
    paths: [...svg.querySelectorAll('[data-ena-trajectory-path]')].map(node => ({ from: Number(node.getAttribute('data-from-ordinal')), to: Number(node.getAttribute('data-to-ordinal')), geometry: ['x1','y1','x2','y2'].map(key => node.getAttribute(key)) })),
    arrows: svg.querySelectorAll('[data-ena-trajectory-direction]').length,
    networkEdges: svg.querySelectorAll('[data-ena-edge]').length,
    viewBox: svg.getAttribute('viewBox'),
  }));
}
async function saveNativeDownload(page, button, destination, approve = false) {
  if (approve) page.once("dialog", dialog => void dialog.accept());
  const pending = page.waitForEvent("download", { timeout: 120_000 });
  await button.click();
  const download = await pending;
  assert.equal(await download.failure(), null);
  await download.saveAs(destination);
  assert.ok(statSync(destination).size > 0);
  return { path: destination, suggestedFilename: download.suggestedFilename(), ...artifactEvidence(destination) };
}
async function exerciseNativeTwoDActions(page) {
  await nativeProjectionControl(page).selectOption("xy");
  const before = await nativeSvgAudit(page);
  await page.getByRole("button", { name: "Plot Settings", exact: true }).click();
  const zoom = page.getByRole("group", { name: "Plot zoom", exact: true });
  await zoom.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoomIn = await nativeSvgAudit(page);
  assert.notDeepEqual(zoomIn.centroids, before.centroids, "native 2D Zoom in must change actual projected geometry");
  await zoom.getByRole("button", { name: "Zoom out", exact: true }).click();
  const zoomOut = await nativeSvgAudit(page);
  assert.deepEqual(zoomOut.centroids, before.centroids, "native 2D inverse zoom must restore actual SVG centroids");
  await zoom.getByRole("button", { name: "Zoom in", exact: true }).click();
  await zoom.getByRole("button", { name: /^Fit plot/ }).click();
  const recenter = await nativeSvgAudit(page);
  assert.deepEqual(recenter, before, "native 2D Fit plot must restore all SVG geometry");
  await page.getByRole("button", { name: "Close Plot Settings", exact: true }).click();
  const png = await saveNativeDownload(page, page.locator('.ena-visual-toolbar').getByRole("button", { name: "Export PNG", exact: true }), join(artifactDirectory, "native-2d-plot.png"), true);
  assert.deepEqual([...readFileSync(png.path).subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  const svg = await saveNativeDownload(page, page.locator('.ena-visual-toolbar').getByRole("button", { name: "Export SVG", exact: true }), join(artifactDirectory, "native-2d-plot.svg"), true);
  assert.match(readFileSync(svg.path, "utf8"), /<svg/u);
  await nativeScience(page);
  return { before, zoomIn, zoomOut, recenter, png, svg };
}
async function authenticateAndRunTrajectory(page, args) {
  page.__openEnaLongitudinalConsoleErrors = [];
  page.__openEnaLongitudinalConsoleWarnings = [];
  page.__openEnaLongitudinalPageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") page.__openEnaLongitudinalConsoleErrors.push(message.text());
    if (message.type() === "warning") page.__openEnaLongitudinalConsoleWarnings.push({ text: message.text(), location: message.location() });
  });
  page.on("pageerror", error => page.__openEnaLongitudinalPageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__openEnaLongitudinalSmokeTaskAudit = { aiPostCount: 0 };
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const url = new URL(typeof input === "string" ? input : input.url ?? input.href, location.href);
      if (url.pathname === "/api/open-ena/ai-interpretation" && String(init?.method ?? "GET").toUpperCase() === "POST") window.__openEnaLongitudinalSmokeTaskAudit.aiPostCount++;
      return originalFetch.call(this, input, init);
    };
  });
  await page.goto(args.baseUrl + "/en/open-ena", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await runtime.drainAssetReads("initial required static assets before Sign in");
  await page.getByRole("textbox", { name: "Account name" }).fill(args.username);
  await page.getByRole("textbox", { name: "Password" }).fill(args.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.waitFor({ timeout: 30_000 });
  const trajectorySampleButton = page.getByRole("button", { name: "Load trajectory sample", exact: true });
  let dataPanelVisible = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await rail.getByRole("button", { name: "Data", exact: true }).click();
    dataPanelVisible = await trajectorySampleButton.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
    if (dataPanelVisible) break;
  }
  assert.ok(dataPanelVisible, "native trajectory sample panel must be reachable after login");
  await trajectorySampleButton.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current", null, { timeout: 120_000 });
  const identities = await nativeFixtureIdentitiesV3(page);
  const science = await nativeScience(page);
  assert.equal(science.taskRequestCount, 1);
  assert.equal(science.responseCount, 1);
  assert.equal(identities.configuration.analysis.model.type, "SeparateTrajectory");
  const fitted = await page.evaluate(() => {
    const result = window.__openEnaNativeAudit.responses.at(-1).result;
    return { sequences: result.executionProvenance.ordering.resolvedHorizonOrder.unitSequences, points: result.set.points, dictionary: result.executionProvenance.identityDictionary };
  });
  assert.ok(fitted.sequences.length > 1 && fitted.sequences.every(s => s.steps.length > 0));
  const longest = [...fitted.sequences].sort((a,b) => b.steps.length-a.steps.length)[0];
  const orderedHorizons = longest.steps.map(step => {
    const horizon = fitted.dictionary.horizons.find(h => h.token === step.horizonToken);
    assert.ok(horizon, "fitted Horizon key must resolve by full native typed identity");
    return horizon;
  });
  assert.ok(orderedHorizons.length >= 3);
  for (const sequence of fitted.sequences) {
    assert.deepEqual(sequence.steps.map(step => step.trajectoryOrdinal), sequence.steps.map((_, i) => i));
    const indexes = sequence.steps.map(step => orderedHorizons.findIndex(h => h.token === step.horizonToken));
    assert.ok(indexes.every((index, i) => index >= 0 && (i === 0 || index > indexes[i-1])), "per-Unit fitted order must agree with selected request precedence");
  }
  await rail.getByRole("button", { name: /^Stats/ }).click();
  const groupControls = page.getByTestId("open-ena-ona-descriptive-group-controls");
  const groupSelects = groupControls.getByRole("combobox");
  assert.equal(await groupSelects.count(), 2);
  await groupSelects.nth(0).selectOption(identities.dictionary.groups[0].token);
  await groupSelects.nth(1).selectOption(identities.dictionary.groups[1].token);
  await page.getByRole("checkbox", { name: "I confirm these fitted Units identify the same entities across periods.", exact: true }).check();
  const designs = [{ design: "independent", kind: "independent-period", count: 1, method: "mann-whitney-u" }, { design: "paired", kind: "paired-periods", count: 2, method: "wilcoxon-signed-rank" }, { design: "repeated", kind: "repeated-periods", count: orderedHorizons.length, method: "friedman" }];
  const rankDownloads = [];
  for (const design of designs) {
    for (const horizon of orderedHorizons) await page.getByRole("checkbox", { name: horizon.displayLabel, exact: true }).uncheck();
    await page.getByRole("combobox", { name: /^Trajectory inference design/ }).selectOption(design.design);
    for (const horizon of orderedHorizons.slice(0, design.count)) await page.getByRole("checkbox", { name: horizon.displayLabel, exact: true }).check();
    await page.getByRole("button", { name: "Run confirmed inference", exact: true }).click();
    const exportButton = page.getByRole("button", { name: "Export native statistics", exact: true });
    await exportButton.waitFor();
    const descriptor = await saveNativeDownload(page, exportButton, join(downloadDirectory, `rank-${design.design}.json`));
    const value = JSON.parse(readFileSync(descriptor.path, "utf8"));
    assert.equal(value.kind, "open-ena-native-post-model-statistics");
    assert.deepEqual(value.binding, science.binding);
    assert.equal(value.inference.kind, `trajectory-${design.kind}`);
    const rows = value.inference.rows ?? value.inference.omnibusRows;
    assert.ok(rows.length > 0 && rows.every(row => row.test === design.method));
    assert.ok(value.inference.ledger, "rank design must retain genuine inclusion ledger");
    if (design.design === "repeated") assert.ok(value.inference.followupRows.length > 0);
    assert.equal(value.controls.request.kind, `trajectory-${design.kind}`);
    rankDownloads.push({ ...descriptor, kind: design.kind, inference: value.inference, controls: value.controls });
  }
  const pathPanel = page.getByTestId("open-ena-native-trajectory-analysis");
  assert.equal(await pathPanel.getByRole("button", { name: "Run whole-path comparison", exact: true }).isEnabled(), false);
  await pathPanel.getByRole("checkbox", { name: "I confirm that the entity histories in these two Groups are independent.", exact: true }).check();
  await pathPanel.getByRole("button", { name: "Run whole-path comparison", exact: true }).click();
  await pathPanel.getByText("Whole-path comparison current", { exact: true }).waitFor({ timeout: 120_000 });
  const pathRows = await pathPanel.getByTestId("open-ena-native-trajectory-path-statistics").locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent.trim())));
  // 3 coordinate, 2 centroid distance metrics per period, plus 4 step/cumulative per noninitial period.
  assert.equal(pathRows.length, orderedHorizons.length * 5 + (orderedHorizons.length - 1) * 4);
  for (const row of pathRows) {
    assert.equal(Number(row[6]), 500);
    assert.ok([row[3], row[4], row[5]].every(value => value !== "—" && Number.isFinite(Number(value))));
    assert.ok(Number(row[4]) >= 0 && Number(row[4]) <= Number(row[5]) && Number(row[5]) <= 1);
  }
  await nativeProjectionControl(page).selectOption("3d");
  const plot = page.locator('[data-ena-plotly-root=true]');
  const plotAudit = await plot.evaluate(root => {
    const traces = root.data;
    const allowed = new Set(["axis", "axis-label", "axis-arrowhead", "unit-points", "group-mean", "trajectory-path", "direction-arrow", "code-node"]);
    const centroidTraces = traces.filter(trace => trace.meta?.role === "group-mean");
    const paths = traces.filter(trace => trace.meta?.role === "trajectory-path");
    return { displayedCodes: traces.filter(t => t.meta?.role === "code-node").flatMap(t => t.text ?? []), centroidSquares: centroidTraces.length > 0 && centroidTraces.every(t => t.marker?.symbol === "square" && t.marker?.size === 7), blackTrajectories: paths.length > 0 && paths.every(t => t.line?.color === "black"), lineOnlyTrajectories: paths.every(t => t.mode === "lines" && t.marker === undefined), directionArrowTraceCount: traces.filter(t => t.meta?.role === "direction-arrow").length, participantTraceCount: traces.filter(t => t.meta?.role === "unit-points").length, networkEdgeTraceCount: traces.filter(t => t.meta?.role === "network-edge").length, errorBarTraceCount: traces.filter(t => Object.keys(t).some(k => k.startsWith("error_"))).length, unknownTraceRoles: traces.map(t => t.meta?.role).filter(role => !allowed.has(role)) };
  });
  plotAudit.codesPresent = identities.codes.every(code => plotAudit.displayedCodes.includes(code.displayLabel));
  assert.ok(plotAudit.codesPresent && plotAudit.centroidSquares && plotAudit.blackTrajectories && plotAudit.lineOnlyTrajectories);
  assert.ok(plotAudit.directionArrowTraceCount > 0 && plotAudit.participantTraceCount > 0);
  assert.equal(plotAudit.networkEdgeTraceCount, 0);
  assert.ok(plotAudit.errorBarTraceCount === 0 && plotAudit.unknownTraceRoles.length === 0);
  await nativeScience(page);
  return { ...plotAudit, ...science, expectedCodes: identities.codes.map(code => code.displayLabel), orderedHorizons, fitted, rankDownloads, pathRows };
}
async function exerciseNonPlotRailPanels(page, args) {
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await page.evaluate(() => {
    const aiRoot = document.querySelector('.ena-ai-interpretation');
    const consent = document.querySelector('[data-ena-ai-consent="explicit"] input[type="checkbox"]');
    window.__openEnaAiLifecycleAudit = { aiRoot, consent, plot: document.querySelector('[data-ena-plotly-root=true]'), baselineAiPostCount: window.__openEnaLongitudinalSmokeTaskAudit.aiPostCount };
    if (!aiRoot || !consent) throw new Error("persistent native AI consent baseline missing");
  });
  const panelAudits = {};
  const trajectoryPresenterScreenshotPath = join(artifactDirectory, "trajectory-presenter-after-model-navigation.png");
  for (const name of ["AI-assisted interpretation", "Model", "AI-assisted interpretation", "Data", "Stats & Export", "Plot Tools"]) {
    await rail.getByRole("button", { name, exact: true }).click();
    if (name === "AI-assisted interpretation") {
      const consent = page.locator('[data-ena-ai-consent="explicit"] input[type="checkbox"]');
      if (await consent.isEnabled()) await consent.check();
    }
    const aiVisible = await page.getByTestId("open-ena-persistent-ai-lifecycle").isVisible();
    const analysisVisible = await page.getByTestId("open-ena-persistent-analysis-panel").isVisible();
    assert.equal(aiVisible, name === "AI-assisted interpretation");
    assert.equal(analysisVisible, name !== "AI-assisted interpretation");
    if (name === "Data") assert.ok(await page.getByRole("button", { name: "Load trajectory sample", exact: true }).isVisible());
    if (name === "Stats & Export") assert.ok(await page.getByTestId("open-ena-native-trajectory-analysis").isVisible());
    if (name === "Model") await page.screenshot({ path: trajectoryPresenterScreenshotPath });
    const audit = await page.evaluate(() => {
      const baseline = window.__openEnaAiLifecycleAudit;
      const currentAiRoot = document.querySelector('.ena-ai-interpretation');
      const currentConsent = document.querySelector('[data-ena-ai-consent="explicit"] input[type="checkbox"]');
      return { aiSame: currentAiRoot === baseline.aiRoot, consentSame: currentConsent === baseline.consent, consentChecked: currentConsent.checked, consentEnabled: !currentConsent.disabled, plotSame: document.querySelector('[data-ena-plotly-root=true]') === baseline.plot, aiPostCount: window.__openEnaLongitudinalSmokeTaskAudit.aiPostCount, baselineAiPostCount: baseline.baselineAiPostCount, mode: document.querySelector('.ena-rail-button[aria-current=step]')?.getAttribute('aria-label') };
    });
    assert.ok(audit.aiSame && audit.consentSame && audit.plotSame, name + " replaced native mounted state");
    assert.equal(audit.mode, name);
    assert.equal(audit.aiPostCount, audit.baselineAiPostCount);
    assert.equal(audit.consentChecked, audit.consentEnabled);
    const science = await nativeScience(page);
    assert.equal(science.taskRequestCount, args.expectedTaskRequestCount);
    panelAudits[name] = audit;
  }
  return { panelAudits, trajectoryPresenterScreenshotPath };
}

async function exerciseCamerasAndProjections(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const plot = page.locator('[data-testid="open-ena-interactive-3d-plot"] [data-ena-plotly-root="true"]');
  const cameraSelect = nativeCameraControl(page);
  const projectionSelect = nativeProjectionControl(page);
  const sceneInteraction = plot.locator("#scene");
  const cameraDragFractions = [
    { from: { x: 0.5, y: 0.5 }, to: { x: 0.75, y: 0.7 } },
    { from: { x: 0.5, y: 0.5 }, to: { x: 0.25, y: 0.3 } },
  ];
  const resultLabel = args.expectedResultHash;
  
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
  const readScientificInvariants = async () => await nativeScience(page);
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
    await assertScientificInvariants("camera preset " + preset);
    const cameraSelection = {
      visible: await cameraSelect.isVisible(),
      ...await cameraSelect.selection(),
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
    projectionStates[projection] = await nativeSvgAudit(page);
    assertBrowser(projectionStates[projection].codeLabels.length === args.expectedCodes.length, "2D omitted fitted Code labels");
    assertBrowser(projectionStates[projection].centroids.every(value => value.width === "7" && value.height === "7"), "2D centroid glyph changed");
    assertBrowser(projectionStates[projection].networkEdges === 0, "2D trajectory contains mean-network edges");
    await assertScientificInvariants("2D projection " + projection);
  }
  // Remove an interior observed Horizon using actual display controls. No
  // connector may jump across its absence; fitted coordinates remain bound.
  const hiddenHorizon = args.orderedHorizons[1];
  const horizonFilter = page.getByRole("checkbox", { name: `Display ${hiddenHorizon.displayLabel}`, exact: true });
  const beforeFilter = await nativeSvgAudit(page);
  await horizonFilter.uncheck();
  const filteredSvg = await nativeSvgAudit(page);
  assertBrowser(filteredSvg.centroids.length < beforeFilter.centroids.length, "Horizon display filter did not remove actual centroid geometry");
  assertBrowser(filteredSvg.paths.every(path => path.to === path.from + 1), "native SVG connected across an absent fitted step");
  await assertScientificInvariants("absent Horizon display filter");
  await horizonFilter.check();
  assertBrowser(JSON.stringify(await nativeSvgAudit(page)) === JSON.stringify(beforeFilter), "restoring Horizon filter changed original SVG geometry");
  await projectionSelect.selectOption("3d");
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-testid=open-ena-interactive-3d-plot] [data-ena-plotly-root=true]");
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
  const plot = page.locator('[data-testid="open-ena-interactive-3d-plot"] [data-ena-plotly-root="true"]');
  const cameraSelect = nativeCameraControl(page);
  const projectionSelect = nativeProjectionControl(page);
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
      '.open-ena-3d-plot-actions [data-ena-plot-action]',
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
  const readRanges = async () => nativeSvgAudit(page);
  const readScientificInvariants = async () => await nativeScience(page);
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

  const repaintCodeColor = async (color) => {
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    const code = args.expectedCodes[0];
    await rail.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByRole("tab", { name: /^Codes(,|$)/ }).click();
    await page.getByRole("button", { name: `Choose color for ${code}`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
    const input = dialog.getByRole("textbox", { name: "Primary", exact: true });
    const original = await input.inputValue();
    await input.fill(color);
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
    await waitForActionsReady();
    assertBrowser(await plot.evaluate((root, hex) => root.data.filter(trace => trace.meta?.role === "code-node").some(trace => trace.marker?.color === hex || trace.marker?.color?.includes?.(hex)), color), "real Code color change did not reach rendered spec");
    return original;
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
  await plot.evaluate(root => {
    window.__nativeCameraActionAudit = [];
    root.on("plotly_relayout", update => window.__nativeCameraActionAudit.push({ at: performance.now(), update: structuredClone(update), live: structuredClone(root._fullLayout.scene._scene.getCamera()), declarative: structuredClone(root._fullLayout.scene.camera) }));
  });
  await zoomIn.click();
  const perspectiveZoomIn = await waitForValue(
    readCamera,
    (camera) => cameraDistance(camera) < perspectiveBaselineDistance - 1e-6,
    "perspective Zoom In",
  ).catch(async error => {
    const cameraFailure = await page.evaluate(() => ({ events: window.__nativeCameraActionAudit, status: document.querySelector('.open-ena-3d-plot-actions [role=status]')?.textContent, controls: [...document.querySelectorAll('.open-ena-3d-plot-actions button')].map(button => ({ action: button.dataset.enaPlotAction, disabled: button.disabled })) }));
    writeFileSync(join(artifactDirectory, "perspective-zoom-failure.json"), JSON.stringify({ baseline: perspectiveBaseline, ...cameraFailure, science: await nativeScience(page) }, null, 2));
    throw error;
  });
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
  const originalCodeColor = await repaintCodeColor("#9d5dbb");
  const perspectiveColorRepaint = await readCamera();
  assertBrowser(cameraApproximatelyEqual(perspectiveColorRepaint, perspectiveZoomIn), "same-fit Code color repaint reset perspective camera");
  await repaintCodeColor(originalCodeColor);
  assertBrowser(cameraApproximatelyEqual(await readCamera(), perspectiveZoomIn), "restoring Code color reset perspective camera");
  await assertScientificInvariants("perspective Code color repaint");
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
  const orthographicCameraBeforeRepaint = await readCamera();
  await repaintCodeColor("#218ebf");
  const orthographicColorRepaint = await readAspectRatio();
  assertBrowser(aspectApproximatelyEqual(orthographicColorRepaint, orthographicZoomIn), "same-fit Code color repaint reset orthographic aspect");
  assertBrowser(cameraApproximatelyEqual(await readCamera(), orthographicCameraBeforeRepaint), "same-fit Code color repaint changed orthographic camera");
  await repaintCodeColor(originalCodeColor);
  assertBrowser(aspectApproximatelyEqual(await readAspectRatio(), orthographicZoomIn), "restoring Code color reset orthographic aspect");
  await assertScientificInvariants("orthographic Code color repaint");
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

  writeFileSync(join(artifactDirectory, "camera-actions-and-color-repaints.json"), JSON.stringify({ perspectiveBaseline, perspectiveZoomIn, perspectiveColorRepaint, perspectiveZoomOut, perspectiveRecenter, orthographicBaseline, orthographicZoomIn, orthographicColorRepaint, orthographicZoomOut, orthographicRecenter, science: await nativeScience(page) }, null, 2));
  const twoD = await exerciseNativeTwoDActions(page);
  await assertScientificInvariants("2D recenter");
  await projectionSelect.selectOption("3d");
  await cameraSelect.selectOption("isometric");
  await waitForActionsReady();
  const copyPath = args.artifactDirectory + "/trajectory-plot-copy.png";
  let copyEvidence = null;
  await page.evaluate(() => {
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    window.__openEnaTrajectoryCopyAudit = {
      originalAnchorClick,
      hadOwnClipboard: Object.prototype.hasOwnProperty.call(navigator, "clipboard"),
      clipboardDescriptor: Object.getOwnPropertyDescriptor(navigator, "clipboard"),
      hadOwnClipboardItem: Object.prototype.hasOwnProperty.call(window, "ClipboardItem"),
      clipboardItemDescriptor: Object.getOwnPropertyDescriptor(window, "ClipboardItem"),
      copyAnchorClickCount: 0,
      copyAnchorHref: null,
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: undefined });
    HTMLAnchorElement.prototype.click = function copyAnchorClick() {
      if (this.download === "open-ena-3d-comparison.png") {
        window.__openEnaTrajectoryCopyAudit.copyAnchorClickCount += 1;
        window.__openEnaTrajectoryCopyAudit.copyAnchorHref = this.href;
      }
      return originalAnchorClick.call(this);
    };
  });
  try {
    // Plotly.toImage performs an asynchronous WebGL readback before the
    // fallback anchor click. CI Chromium can legitimately take >30s on a
    // cold GPU/runner, so do not let Playwright's default timeout race it.
    const copyDownloadPromise = page.waitForEvent("download", { timeout: 120_000 });
    page.once("dialog", dialog => void dialog.accept());
    await copyImage.click();
    const download = await copyDownloadPromise;
    assertBrowser(await download.failure() === null, "trajectory Copy download failed");
    const suggestedFilename = download.suggestedFilename();
    assertBrowser(
      suggestedFilename === "open-ena-3d-comparison.png",
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
      document.querySelector('.open-ena-interactive-3d-figure [role="status"]')?.textContent?.trim()
        === "Image downloaded"
    ), null, { timeout: 15_000 });
    const status = await page.locator('.open-ena-interactive-3d-figure [role="status"]').textContent();
    const copyRuntimeAudit = await page.evaluate(() => ({
      copyAnchorClickCount:
        window.__openEnaTrajectoryCopyAudit?.copyAnchorClickCount ?? -1,
      copyAnchorHref:
        window.__openEnaTrajectoryCopyAudit?.copyAnchorHref ?? null,
      realPlotlyRoot: Boolean(
        document.querySelector('[data-testid="open-ena-interactive-3d-plot"] [data-ena-plotly-root="true"]')?._fullLayout,
      ),
    }));
    assertBrowser(
      copyRuntimeAudit.copyAnchorClickCount === 1,
      "trajectory Copy did not click exactly one PNG download anchor",
    );
    assertBrowser(copyRuntimeAudit.copyAnchorHref?.startsWith("blob:") === true, "trajectory Copy did not publish a Blob URL");
    assertBrowser(copyRuntimeAudit.realPlotlyRoot, "trajectory Copy did not use the mounted Plotly root");
    copyEvidence = {
      copyPath,
      suggestedFilename,
      bytes: pngByteLength,
      pngSignature,
      status: status?.trim() ?? "",
      copyAnchorClickCount: copyRuntimeAudit.copyAnchorClickCount,
      copyAnchorHrefScheme: copyRuntimeAudit.copyAnchorHref?.split(":", 1)[0] ?? null,
      realPlotlyRoot: copyRuntimeAudit.realPlotlyRoot,
    };
    await assertScientificInvariants("Copy image download");
  } finally {
    await page.evaluate(() => {
      const audit = window.__openEnaTrajectoryCopyAudit;
      if (!audit) return;
      HTMLAnchorElement.prototype.click = audit.originalAnchorClick;
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
      colorRepaint: perspectiveColorRepaint,
      zoomIn: perspectiveZoomIn,
      zoomOut: perspectiveZoomOut,
      beforeRecenter: perspectiveBeforeRecenter,
      recenter: perspectiveRecenter,
    },
    orthographic: {
      baseline: orthographicBaseline,
      colorRepaint: orthographicColorRepaint,
      zoomIn: orthographicZoomIn,
      zoomOut: orthographicZoomOut,
      beforeRecenter: orthographicBeforeRecenter,
      recenter: orthographicRecenter,
    },
    twoD,
    copy: copyEvidence,
    restoredIsometric,
  };
}

async function exercisePendingImageActions(page) {
  const shell = page.locator('.open-ena-interactive-3d-figure');
  const copy = shell.locator('[data-ena-plot-action="copy-image"]');
  const fullscreen = shell.locator('[data-ena-plot-action="fullscreen"]');
  await page.evaluate(() => {
    const figure = document.querySelector(".open-ena-interactive-3d-figure");
    const audit = { figure, fullscreen: Object.getOwnPropertyDescriptor(figure, "requestFullscreen"), canvas: HTMLCanvasElement.prototype.toDataURL, generationCalls: 0, clipboard: Object.getOwnPropertyDescriptor(navigator, "clipboard"), calls: 0, downloads: 0, pngs: [], resolve: null, reject: null, originalClick: HTMLAnchorElement.prototype.click };
    window.__nativePendingImage = audit;
    Object.defineProperty(figure, "requestFullscreen", { configurable: true, value: async () => { throw new Error("forced fallback during genuinely pending image action"); } });
    HTMLCanvasElement.prototype.toDataURL = function(...args) { audit.generationCalls++; return audit.canvas.apply(this, args); };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async items => {
      audit.calls++;
      const blob = await items[0].getType("image/png");
      audit.pngs.push({ type: blob.type, bytes: blob.size, signature: [...new Uint8Array(await blob.arrayBuffer()).subarray(0,8)] });
      await new Promise((resolve, reject) => { audit.resolve = resolve; audit.reject = reject; });
    } } });
    HTMLAnchorElement.prototype.click = function() { if (this.download.endsWith('.png')) audit.downloads++; return audit.originalClick.call(this); };
  });
  const read = () => page.evaluate(() => {
    const audit = window.__nativePendingImage;
    return { calls: audit.calls, generationCalls: audit.generationCalls, downloads: audit.downloads, pngs: audit.pngs, pending: Boolean(audit.resolve), actions: [...document.querySelectorAll('.open-ena-3d-plot-actions [data-ena-plot-action]')].map(button => ({ action: button.dataset.enaPlotAction, disabled: button.disabled, focused: document.activeElement === button })) };
  });
  try {
    page.once("dialog", dialog => void dialog.dismiss());
    await copy.click();
    await page.waitForTimeout(200);
    assert.equal((await read()).calls, 0, "denied identity approval produced clipboard output");
    assert.equal((await read()).generationCalls, 0, "denied identity approval started image serialization");
    assert.equal((await read()).downloads, 0, "denied identity approval produced a PNG download");
    // Start actual toImage outside fallback, approve identity, then hold the actual ClipboardItem PNG write.
    page.once("dialog", dialog => void dialog.accept());
    await copy.click();
    await page.waitForFunction(() => Boolean(window.__nativePendingImage.resolve), null, { timeout: 120_000 });
    await fullscreen.click();
    await page.waitForFunction(() => document.querySelector('.open-ena-interactive-3d-figure')?.getAttribute('data-fallback-fullscreen') === 'true');
    const pending = await read();
    assert.equal(pending.calls, 1);
    assert.deepEqual(pending.pngs[0].signature, [137,80,78,71,13,10,26,10]);
    assert.equal(pending.pngs[0].type, "image/png"); assert.ok(pending.pngs[0].bytes > 8);
    assert.equal(pending.actions.filter(a => a.action !== "fullscreen" && a.disabled).length, 4);
    assert.equal(pending.actions.find(a => a.action === "fullscreen").disabled, false);
    await page.keyboard.press("Tab");
    assert.ok(await shell.evaluate(figure => figure.contains(document.activeElement)), "pending fallback Tab escaped dialog");
    await page.keyboard.press("Shift+Tab");
    assert.ok(await shell.evaluate(figure => figure.contains(document.activeElement)), "pending fallback Shift+Tab escaped dialog");
    // Exit stays available during the genuinely pending write.
    await fullscreen.click();
    await page.evaluate(() => window.__nativePendingImage.reject(new Error("intentional isolated clipboard write rejection")));
    await page.waitForFunction(() => [...document.querySelectorAll('.open-ena-3d-plot-actions button')].every(button => !button.disabled));
    const rejected = await read();
    assert.equal(rejected.downloads, 0, "supported clipboard rejection silently fell back to a download");
    const errorStatus = await shell.locator('[role=status]').innerText();
    assert.ok(errorStatus.length > 0 && !/copied|downloaded/iu.test(errorStatus), "rejected real PNG write must retain actual error status");
    await page.evaluate(() => { window.__nativePendingImage.resolve = null; window.__nativePendingImage.reject = null; });
    page.once("dialog", dialog => void dialog.accept());
    await copy.click();
    await page.waitForFunction(() => Boolean(window.__nativePendingImage.resolve), null, { timeout: 120_000 });
    await page.evaluate(() => window.__nativePendingImage.resolve());
    await page.waitForFunction(() => [...document.querySelectorAll('.open-ena-3d-plot-actions button')].every(button => !button.disabled));
    const recoveryStatus = await shell.locator('[role=status]').innerText();
    assert.match(recoveryStatus, /copied/iu);
    await nativeScience(page);
    return { pending, rejected, errorStatus, recovered: await read(), recoveryStatus };
  } finally {
    await page.evaluate(() => {
      const audit = window.__nativePendingImage;
      audit.resolve?.();
      HTMLCanvasElement.prototype.toDataURL = audit.canvas;
      if (audit.fullscreen) Object.defineProperty(audit.figure, "requestFullscreen", audit.fullscreen); else delete audit.figure.requestFullscreen;
      HTMLAnchorElement.prototype.click = audit.originalClick;
      if (audit.clipboard) Object.defineProperty(navigator, "clipboard", audit.clipboard); else delete navigator.clipboard;
      delete window.__nativePendingImage;
    });
  }
}

async function exerciseStaleImageLease(page) {
  await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("button", { name: "Configure trajectory model", exact: true }).click();
  const model = page.getByRole("combobox", { name: "Model", exact: true });
  assert.equal(await model.inputValue(), "SeparateTrajectory");
  await page.evaluate(() => {
    let proto = HTMLImageElement.prototype, onload;
    while (proto && !onload) { onload = Object.getOwnPropertyDescriptor(proto, "onload"); proto = Object.getPrototypeOf(proto); }
    if (!onload?.set || !onload?.get) throw new Error("native image load descriptor unavailable");
    const audit = { onload, previous: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "onload"), canvas: HTMLCanvasElement.prototype.toDataURL, clipboard: Object.getOwnPropertyDescriptor(navigator, "clipboard"), anchor: HTMLAnchorElement.prototype.click, renderedPngs: [], outputs: 0, release: null, imageLoaded: null };
    window.__nativeStaleImage = audit;
    // Hold delivery of an ACTUAL loaded snapshot image event; retain the real
    // image/event/callback and release it to finish original Plotly PNG rendering.
    Object.defineProperty(HTMLImageElement.prototype, "onload", { configurable: true, get() { return onload.get.call(this); }, set(callback) { onload.set.call(this, typeof callback !== "function" ? callback : function(event) {
      if (!audit.release && this.naturalWidth > 0 && /^(blob:|data:image\/svg)/u.test(this.src)) {
        audit.imageLoaded = { width: this.naturalWidth, height: this.naturalHeight, scheme: this.src.split(':')[0] };
        audit.release = () => callback.call(this, event);
      } else callback.call(this, event);
    }); } });
    HTMLCanvasElement.prototype.toDataURL = function(...args) { const data = audit.canvas.apply(this, args); if (data.startsWith('data:image/png;base64,')) audit.renderedPngs.push({ width: this.width, height: this.height, signature: [...atob(data.split(',')[1]).slice(0,8)].map(char => char.charCodeAt(0)) }); return data; };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async () => { audit.outputs++; }, writeText: async () => { audit.outputs++; } } });
    HTMLAnchorElement.prototype.click = function() { if (this.download.endsWith('.png')) audit.outputs++; return audit.anchor.call(this); };
  });
  try {
    page.once("dialog", dialog => void dialog.accept());
    await page.locator('.open-ena-3d-plot-actions [data-ena-plot-action="copy-image"]').click();
    await page.waitForFunction(() => Boolean(window.__nativeStaleImage.release), null, { timeout: 120_000 });
    await model.selectOption("EndPoint");
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute('data-result-status') === 'stale');
    await page.evaluate(() => window.__nativeStaleImage.release());
    await page.waitForFunction(() => document.querySelector('.open-ena-3d-plot-actions [data-ena-plot-action="copy-image"]')?.disabled === false, null, { timeout: 30000 });
    const audit = await page.evaluate(() => ({ imageLoaded: window.__nativeStaleImage.imageLoaded, renderedPngs: window.__nativeStaleImage.renderedPngs, outputs: window.__nativeStaleImage.outputs, modelRuns: window.__openEnaNativeAudit.requests.length }));
    assert.ok(audit.imageLoaded.width > 0 && audit.renderedPngs.length > 0, "stale lease check must finish genuine image rendering");
    assert.ok(audit.renderedPngs.every(png => JSON.stringify(png.signature) === JSON.stringify([137,80,78,71,13,10,26,10])));
    assert.equal(audit.outputs, 0, "stale model materialized PNG output after awaited rendering");
    assert.equal(audit.modelRuns, 1);
    await model.selectOption("SeparateTrajectory");
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute('data-result-status') === 'current');
    await nativeScience(page);
    return audit;
  } finally {
    await page.evaluate(() => {
      const audit = window.__nativeStaleImage;
      if (audit.previous) Object.defineProperty(HTMLImageElement.prototype, 'onload', audit.previous); else delete HTMLImageElement.prototype.onload;
      HTMLCanvasElement.prototype.toDataURL = audit.canvas;
      HTMLAnchorElement.prototype.click = audit.anchor;
      if (audit.clipboard) Object.defineProperty(navigator, 'clipboard', audit.clipboard); else delete navigator.clipboard;
      delete window.__nativeStaleImage;
    });
  }
}

async function waitForFullscreenCanvas(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-testid="open-ena-interactive-3d-plot"] [data-ena-plotly-root="true"]');
    const canvas = root?._fullLayout?.scene?._scene?.glplot?.canvas;
    if (!root || !(canvas instanceof HTMLCanvasElement)) return false;
    const outer = root.getBoundingClientRect(), inner = canvas.getBoundingClientRect();
    return inner.width >= outer.width * 0.9 && inner.height >= outer.height * 0.9;
  }, null, { timeout: 15000 });
}
async function readFullscreenPlotLayout(page) {
  return await page.locator('[data-testid="open-ena-interactive-3d-plot"] [data-ena-plotly-root="true"]').evaluate((root) => {
    const shell = root.closest(".open-ena-interactive-3d-figure");
    const toolbar = shell?.querySelector(".open-ena-3d-plot-actions") ?? null;
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
    const shellBox = boxFor(shell);
    const plotBox = boxFor(root);
    const toolbarBox = boxFor(toolbar);
    const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
    const buttonBoxes = toolbar
      ? [...toolbar.querySelectorAll("button")]
        .map((button) => ({
          label: button.getAttribute("aria-label") || button.textContent?.trim() || "",
          disabled: button.disabled,
          ...boxFor(button),
        }))
        .filter((box) => box.width > 0 && box.height > 0)
      : [];
    const traces = Array.isArray(root.data) ? root.data : [];
    const svd3Shaft = traces.find((trace) => (
      trace.meta?.role === "axis"
      && (trace.meta?.axis === "z" || trace.meta?.axis === "SVD3" || trace.name === "SVD3")
    ));
    const svd3Label = traces.find(trace => trace.meta?.role === "axis-label" && trace.text?.includes?.("SVD3"));
    const svd3Arrowhead = traces.find((trace) => (
      trace.meta?.role === "axis-arrowhead"
      && (trace.meta?.axis === "z" || trace.meta?.axis === "SVD3" || trace.name === "SVD3 axis arrowhead")
    ));
    const scene = root._fullLayout?.scene;
    const glplot = scene?._scene?.glplot;
    const runtimeCanvas = glplot?.canvas instanceof HTMLCanvasElement
      && root.contains(glplot.canvas)
      ? glplot.canvas
      : null;
    let contextName = null;
    if (runtimeCanvas) {
      try {
        if (runtimeCanvas.getContext("webgl2")) contextName = "webgl2";
        else if (runtimeCanvas.getContext("webgl")) contextName = "webgl";
        else if (runtimeCanvas.getContext("experimental-webgl")) contextName = "experimental-webgl";
      } catch {
        contextName = null;
      }
    }
    const runtimeCanvasBox = boxFor(runtimeCanvas);
    const canvasBox = runtimeCanvas && runtimeCanvasBox && contextName ? {
      ...runtimeCanvasBox,
      pixelWidth: runtimeCanvas.width,
      pixelHeight: runtimeCanvas.height,
      contextName,
    } : null;
    const domain = scene?.domain;
    const zRange = Array.isArray(scene?.zaxis?.range)
      && scene.zaxis.range.length === 2
      && scene.zaxis.range.every(Number.isFinite)
      ? scene.zaxis.range.map(Number)
      : null;
    const shaftCoordinates = [svd3Shaft?.x, svd3Shaft?.y, svd3Shaft?.z];
    const shaftStart = Number(Array.isArray(svd3Shaft?.z) ? svd3Shaft.z[0] : Number.NaN);
    const shaftTip = Number(Array.isArray(svd3Shaft?.z) ? svd3Shaft.z.at(-1) : Number.NaN);
    const arrowTip = Number(Array.isArray(svd3Arrowhead?.z) ? svd3Arrowhead.z[0] : Number.NaN);
    const rangeLow = zRange ? Math.min(...zRange) : Number.NaN;
    const rangeHigh = zRange ? Math.max(...zRange) : Number.NaN;
    const rangeSpan = rangeHigh - rangeLow;
    const plotGlPixelRatio = Number(glplot?.pixelRatio);
    return {
      mode: document.fullscreenElement === shell
        ? "native"
        : shell?.getAttribute("data-fallback-fullscreen") === "true"
          ? "fallback"
          : "none",
      shell: shellBox,
      plot: plotBox,
      toolbar: toolbarBox ? {
        ...toolbarBox,
        position: toolbarStyle?.position ?? null,
        flexDirection: toolbarStyle?.flexDirection ?? null,
        zIndex: toolbarStyle?.zIndex ?? null,
        clientHeight: toolbar.clientHeight,
        scrollHeight: toolbar.scrollHeight,
      } : null,
      buttonBoxes,
      canvas: canvasBox,
      devicePixelRatio: window.devicePixelRatio,
      plotGlPixelRatio,
      webglRuntimeReady: typeof glplot?.getAspectratio === "function"
        && glplot.gl?.canvas === runtimeCanvas,
      legend: boxFor(root.querySelector(".legend")),
      modebar: boxFor(root.querySelector(".modebar")),
      sceneDomain: domain ? { x: [...domain.x], y: [...domain.y] } : null,
      svd3Axis: {
        shaftPresent: Boolean(svd3Shaft),
        arrowheadPresent: Boolean(svd3Arrowhead),
        labelPresent: Boolean(svd3Label),
        finiteNonDegenerate: svd3Shaft?.type === "scatter3d"
          && svd3Shaft?.mode === "lines"
          && svd3Shaft?.visible !== false
          && svd3Arrowhead?.type === "cone"
          && svd3Arrowhead?.visible !== false
          && shaftCoordinates.every((coordinates) => (
            Array.isArray(coordinates)
            && coordinates.length >= 2
            && coordinates.every(Number.isFinite)
          ))
          && Number.isFinite(shaftStart)
          && Number.isFinite(shaftTip)
          && Math.abs(shaftTip - shaftStart) > 0,
        arrowTipContinuesShaft: Number.isFinite(shaftTip)
          && Number.isFinite(arrowTip)
          && arrowTip > shaftTip && shaftTip > shaftStart && [svd3Shaft.x, svd3Shaft.y, svd3Arrowhead.x, svd3Arrowhead.y].every(values => values.every(value => Math.abs(value) < 1e-9)),
        range: zRange,
        rangeHeadroomRatio: Number.isFinite(arrowTip) && rangeSpan > 0
          ? Math.min(arrowTip - rangeLow, rangeHigh - arrowTip) / rangeSpan
          : -1,
      },
    };
  });
}

function assertFullscreenPlotLayout(audit, label, expectedMode) {
  const assertLayout = (condition, message) => {
    if (!condition) throw new Error(label + ": " + message);
  };
  assertLayout(audit.shell && audit.plot && audit.toolbar, "fullscreen geometry is incomplete");
  assertLayout(audit.mode === expectedMode, "entered " + audit.mode + " instead of " + expectedMode);
  assertLayout(audit.buttonBoxes.length === 5, "fullscreen does not expose exactly five plot actions");
  assertLayout(audit.toolbar.position === "absolute", "the action toolbar still consumes a layout row");
  assertLayout(audit.toolbar.flexDirection === "column", "the five actions are not vertically stacked");
  const rightInset = audit.shell.right - audit.toolbar.right;
  const toolbarCenter = (audit.toolbar.top + audit.toolbar.bottom) / 2;
  const shellCenter = (audit.shell.top + audit.shell.bottom) / 2;
  assertLayout(rightInset >= 6 && rightInset <= 22, "the action toolbar is not at the far-right edge");
  assertLayout(Math.abs(toolbarCenter - shellCenter) <= 2, "the action toolbar is not vertically centered");
  assertLayout(
    audit.toolbar.top >= audit.shell.top - 1
      && audit.toolbar.bottom <= audit.shell.bottom + 1
      && audit.toolbar.scrollHeight <= audit.toolbar.clientHeight + 1,
    "the right-middle toolbar is clipped or unexpectedly scrolls at the desktop gate",
  );
  assertLayout(
    audit.buttonBoxes.every((button, index, buttons) => (
      button.left >= audit.shell.left - 1
      && button.right <= audit.shell.right + 1
      && button.top >= audit.toolbar.top - 1
      && button.bottom <= audit.toolbar.bottom + 1
      && button.height >= 43
      && (index === 0 || button.top >= buttons[index - 1].bottom - 1)
      && Math.abs(button.left - buttons[0].left) <= 1
      && Math.abs(button.right - buttons[0].right) <= 1
    )),
    "the five actions are clipped, overlapping, or split across columns",
  );
  assertLayout(
    Math.abs(audit.plot.top - audit.shell.top) <= 2
      && Math.abs(audit.plot.bottom - audit.shell.bottom) <= 2
      && audit.plot.width >= audit.shell.width * 0.96
      && audit.plot.height >= audit.shell.height * 0.96,
    "the Plotly root does not reclaim the former toolbar row",
  );
  assertLayout(
    audit.toolbar.top > audit.plot.top && audit.toolbar.bottom < audit.plot.bottom,
    "the toolbar is not an in-canvas overlay",
  );
  const boxesOverlap = (left, right) => Boolean(
    left && right
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top
  );
  assertLayout(!boxesOverlap(audit.toolbar, audit.legend), "the toolbar covers the Plotly legend");
  assertLayout(!boxesOverlap(audit.toolbar, audit.modebar), "the toolbar covers any visible modebar");
  assertLayout(
    audit.webglRuntimeReady
      && audit.canvas
      && audit.canvas.width >= audit.plot.width * 0.9
      && audit.canvas.height >= audit.plot.height * 0.9
      && audit.devicePixelRatio > 0
      && audit.devicePixelRatio <= 8
      && audit.plotGlPixelRatio >= audit.devicePixelRatio
      && audit.plotGlPixelRatio <= 8
      && audit.canvas.pixelWidth >= audit.canvas.width * audit.plotGlPixelRatio * 0.9
      && audit.canvas.pixelWidth <= audit.canvas.width * audit.plotGlPixelRatio * 1.1
      && audit.canvas.pixelHeight >= audit.canvas.height * audit.plotGlPixelRatio * 0.9
      && audit.canvas.pixelHeight <= audit.canvas.height * audit.plotGlPixelRatio * 1.1,
    "the live Plotly WebGL backing store does not match the reclaimed canvas: "
      + JSON.stringify({
        webglRuntimeReady: audit.webglRuntimeReady,
        canvas: audit.canvas,
        devicePixelRatio: audit.devicePixelRatio,
        plotGlPixelRatio: audit.plotGlPixelRatio,
      }),
  );
  assertLayout(
    JSON.stringify(audit.sceneDomain) === JSON.stringify({ x: [0, 1], y: [0, 1] }),
    "the fullscreen 3D scene does not use the complete Plotly domain",
  );
  assertLayout(
    audit.svd3Axis.shaftPresent && audit.svd3Axis.arrowheadPresent && audit.svd3Axis.labelPresent,
    "the complete SVD3 shaft, arrowhead, and public label are not present",
  );
  assertLayout(
    audit.svd3Axis.finiteNonDegenerate
      && audit.svd3Axis.arrowTipContinuesShaft
      && audit.svd3Axis.rangeHeadroomRatio >= 0.01,
    "the SVD3 axis is degenerate, disconnected, or lacks visible range headroom",
  );
}

async function exerciseFallbackFullscreenAccessibility(page, args) {
  const assertBrowser = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const shellLocator = page.locator(".open-ena-interactive-3d-figure");
  const fullscreenButton = shellLocator.locator('[data-ena-plot-action="fullscreen"]');
  await page.setViewportSize(args.viewport);
  await fullscreenButton.focus();

  const setup = await shellLocator.evaluate((shell) => {
    const opener = document.activeElement;
    const exitButton = shell.querySelector('[data-ena-plot-action="fullscreen"]');
    if (!(opener instanceof HTMLElement) || !(exitButton instanceof HTMLElement)) {
      throw new Error("fallback fullscreen focus anchors are unavailable");
    }
    const outsideNodes = [];
    const shellPath = [];
    let current = shell;
    while (current !== document.body) {
      shellPath.push(current);
      const parent = current.parentElement;
      if (!parent) throw new Error("fallback fullscreen shell is outside document.body");
      for (const sibling of parent.children) {
        if (sibling !== current) outsideNodes.push(sibling);
      }
      current = parent;
    }
    shellPath.push(document.body);
    const outsideSnapshots = outsideNodes.map((node) => ({
      node,
      inertProperty: node.inert,
      hadInertAttribute: node.hasAttribute("inert"),
      inertAttribute: node.getAttribute("inert"),
      ariaHidden: node.getAttribute("aria-hidden"),
    }));
    const hadOwnRequestFullscreen = Object.prototype.hasOwnProperty.call(shell, "requestFullscreen");
    const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(shell, "requestFullscreen");
    const bodyOverflow = document.body.style.overflow;
    window.__openEnaFallbackFullscreenA11yAudit = {
      shell,
      opener,
      exitButton,
      outsideNodes,
      outsideSnapshots,
      shellPath,
      bodyOverflow,
      hadOwnRequestFullscreen,
      requestFullscreenDescriptor,
    };
    Object.defineProperty(shell, "requestFullscreen", {
      configurable: true,
      writable: true,
      value: async () => {
        throw new Error("forced fallback fullscreen for accessibility audit");
      },
    });
    return {
      openerWasFullscreenButton: opener === exitButton,
      outsideNodeCount: outsideNodes.length,
    };
  });
  const readFallbackControlSnapshot = async () => await page.evaluate(() => {
    const audit = window.__openEnaFallbackFullscreenA11yAudit;
    if (!audit) throw new Error("fallback fullscreen audit state is missing");
    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const focusables = [...audit.shell.querySelectorAll(focusableSelector)]
      .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
    const actionFor = (element) => {
      if (element === audit.exitButton) return "fullscreen";
      return element?.getAttribute?.("data-ena-plot-action") ?? null;
    };
    const descriptorFor = (element, index) => ({
      index: index,
      action: actionFor(element),
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      testId: element.getAttribute("data-testid"),
      ariaLabel: element.getAttribute("aria-label"),
      insideShell: audit.shell.contains(element),
      active: document.activeElement === element,
    });
    const controls = [...audit.shell.querySelectorAll(".open-ena-3d-plot-actions button")]
      .map((button) => ({
        action: actionFor(button),
        label: button.getAttribute("aria-label") || button.textContent?.trim() || "",
        disabled: button.disabled,
        ariaDisabled: button.getAttribute("aria-disabled"),
        active: document.activeElement === button,
      }));
    const dataActionControls = controls.filter((control) => control.action !== "fullscreen");
    const focusableDescriptors = focusables.map(descriptorFor);
    const activeIndex = focusables.indexOf(document.activeElement);
    return {
      controls,
      focusableDescriptors,
      currentActiveDescriptor: activeIndex >= 0
        ? descriptorFor(document.activeElement, activeIndex)
        : null,
      entryPending: dataActionControls.some((control) => control.disabled),
    };
  });
  const sameFocusableDescriptor = (left, right) => Boolean(
    left
    && right
    && left.index === right.index
    && left.action === right.action
    && left.tag === right.tag
    && left.role === right.role
    && left.testId === right.testId
    && left.ariaLabel === right.ariaLabel
    && left.insideShell === right.insideShell,
  );
  let evidence = null;
  let requestFullscreenRestored = false;
  try {
    assertBrowser(setup.openerWasFullscreenButton, "Fullscreen trigger was not the saved opener");
    assertBrowser(setup.outsideNodeCount > 0, "fallback fullscreen has no outside-tree siblings to isolate");
    await fullscreenButton.click();
    await page.waitForFunction(() => {
      const audit = window.__openEnaFallbackFullscreenA11yAudit;
      return Boolean(
        audit
        && audit.shell.getAttribute("data-fallback-fullscreen") === "true"
        && audit.shell.getAttribute("role") === "dialog"
        && audit.shell.getAttribute("aria-modal") === "true"
        && audit.shell.getAttribute("aria-label")?.trim().length > 0
        && document.activeElement === audit.exitButton
        && document.fullscreenElement !== audit.shell
      );
    }, null, { timeout: 15_000 });

    const modalState = await page.evaluate(() => {
      const audit = window.__openEnaFallbackFullscreenA11yAudit;
      if (!audit) throw new Error("fallback fullscreen audit state is missing");
      const shellPath = audit.shellPath;
      const shellPathNonInert = shellPath.every((node) => !node.inert && !node.hasAttribute("inert"));
      const outsideTreeIsolated = audit.outsideSnapshots.every((snapshot) => (
        snapshot.node.inert === true
        && snapshot.node.hasAttribute("inert")
        && snapshot.node.getAttribute("aria-hidden") === "true"
      ));
      return {
        fallbackAttribute: audit.shell.getAttribute("data-fallback-fullscreen") === "true",
        dialogRole: audit.shell.getAttribute("role") === "dialog",
        ariaModal: audit.shell.getAttribute("aria-modal") === "true",
        labelled: audit.shell.getAttribute("aria-label")?.trim().length > 0,
        exitFocused: document.activeElement === audit.exitButton,
        nativeFullscreenInactive: document.fullscreenElement !== audit.shell,
        shellPathNonInert,
        outsideTreeIsolated,
        outsideNodeCount: audit.outsideSnapshots.length,
        bodyScrollLocked: document.body.style.overflow === "hidden",
      };
    });
    assertBrowser(modalState.fallbackAttribute, "fallback fullscreen attribute is absent");
    assertBrowser(modalState.dialogRole, "fallback fullscreen is not a dialog");
    assertBrowser(modalState.ariaModal, "fallback fullscreen is not aria-modal");
    assertBrowser(modalState.labelled, "fallback fullscreen dialog has no accessible label");
    assertBrowser(modalState.exitFocused, "fallback fullscreen did not focus Exit fullscreen");
    assertBrowser(modalState.nativeFullscreenInactive, "fallback audit entered native fullscreen");
    assertBrowser(modalState.shellPathNonInert, "fallback fullscreen inerted its own ancestor path");
    assertBrowser(modalState.outsideTreeIsolated, "fallback fullscreen did not isolate every outside-tree sibling");
    assertBrowser(modalState.bodyScrollLocked, "fallback fullscreen did not lock body scroll");

    const entryState = await readFallbackControlSnapshot();
    assertBrowser(entryState.controls.length === 5, "fallback entry did not expose all five plot buttons");
    assertBrowser(
      entryState.currentActiveDescriptor?.action === "fullscreen"
        && entryState.currentActiveDescriptor.active,
      "fallback entry focus left Exit fullscreen",
    );
    assertBrowser(
      entryState.focusableDescriptors.every((descriptor) => descriptor.insideShell),
      "fallback entry focusables escaped the dialog shell",
    );
    let pendingShiftTabDestination = null;
    if (entryState.entryPending) {
      const pendingActions = entryState.controls.filter((control) => control.action !== "fullscreen");
      assertBrowser(pendingActions.length === 4, "fallback pending state omitted a plot action");
      assertBrowser(
        pendingActions.every((control) => control.disabled),
        "fallback pending state did not disable all four plot actions",
      );
      assertBrowser(
        pendingActions.every((control) => !entryState.focusableDescriptors.some((descriptor) => descriptor.action === control.action)),
        "fallback pending focusables included a disabled data action",
      );
      const pendingRuntimeLast = entryState.focusableDescriptors.at(-1);
      assertBrowser(Boolean(pendingRuntimeLast), "fallback pending state has no runtime focusable");
      await page.keyboard.press("Shift+Tab");
      const pendingAfterShiftTab = await readFallbackControlSnapshot();
      pendingShiftTabDestination = pendingAfterShiftTab.currentActiveDescriptor;
      assertBrowser(
        sameFocusableDescriptor(pendingShiftTabDestination, pendingRuntimeLast),
        "Shift+Tab from pending Exit did not reach the runtime last focusable",
      );
      assertBrowser(
        pendingShiftTabDestination?.insideShell,
        "Shift+Tab from pending Exit escaped the dialog shell",
      );
      await page.evaluate(() => {
        const audit = window.__openEnaFallbackFullscreenA11yAudit;
        if (!audit) throw new Error("fallback fullscreen audit state is missing");
        audit.exitButton.focus();
      });
      assertBrowser(
        (await readFallbackControlSnapshot()).currentActiveDescriptor?.action === "fullscreen",
        "fallback pending audit could not refocus Exit fullscreen",
      );
    } else {
      assertBrowser(
        entryState.controls.every((control) => !control.disabled),
        "settled fallback entry exposed a disabled plot action",
      );
    }

    await page.waitForFunction(() => {
      const dataActionButtons = [...document.querySelectorAll(
        '.open-ena-interactive-3d-figure [data-ena-plot-action]:not([data-ena-plot-action=fullscreen])',
      )];
      return dataActionButtons.length === 4 && dataActionButtons.every((button) => !button.disabled);
    }, null, { timeout: 15_000 });
    const settledState = await readFallbackControlSnapshot();
    assertBrowser(settledState.controls.length === 5, "settled fallback omitted a plot button");
    assertBrowser(
      settledState.controls.every((control) => !control.disabled),
      "settled fallback retained a disabled plot button",
    );
    const settledActionControls = settledState.controls.filter((control) => control.action !== null);
    assertBrowser(
      settledActionControls.every((control) => settledState.focusableDescriptors.some((descriptor) => descriptor.action === control.action)),
      "settled fallback omitted an enabled action from the runtime focusables",
    );
    assertBrowser(
      settledState.focusableDescriptors.every((descriptor) => descriptor.insideShell),
      "settled fallback focusables escaped the dialog shell",
    );
    assertBrowser(
      settledState.focusableDescriptors.at(-1)?.action === "fullscreen",
      "Exit fullscreen is not the last runtime focusable",
    );
    assertBrowser(
      settledState.currentActiveDescriptor?.action === "fullscreen",
      "settling Plotly relayout moved focus away from Exit fullscreen",
    );
    await waitForFullscreenCanvas(page).catch(async error => {
      writeFileSync(join(artifactDirectory, "fullscreen-resize-failure.json"), JSON.stringify(await readFullscreenPlotLayout(page), null, 2));
      await shellLocator.screenshot({ path: join(artifactDirectory, "fullscreen-resize-failure.png") });
      throw error;
    });
    const fallbackLayoutAudit = await readFullscreenPlotLayout(page);
    writeFileSync(join(artifactDirectory, "fallback-fullscreen-layout.json"), JSON.stringify(fallbackLayoutAudit, null, 2));
    await shellLocator.screenshot({ path: join(artifactDirectory, "fallback-fullscreen-before-assert.png") });
    assertFullscreenPlotLayout(fallbackLayoutAudit, "fallback fullscreen layout", "fallback");

    const settledRuntimeLast = settledState.focusableDescriptors.at(-2);
    assertBrowser(Boolean(settledRuntimeLast), "settled fallback has no runtime focusable");
    await page.keyboard.press("Shift+Tab");
    const settledAfterShiftTab = await readFallbackControlSnapshot();
    const settledShiftTabDestination = settledAfterShiftTab.currentActiveDescriptor;
    assertBrowser(
      sameFocusableDescriptor(settledShiftTabDestination, settledRuntimeLast),
      "Shift+Tab from Exit fullscreen did not reach the runtime last focusable",
    );
    assertBrowser(
      settledShiftTabDestination?.insideShell,
      "Shift+Tab from Exit fullscreen escaped the dialog shell",
    );

    await page.keyboard.press("Tab");
    const tabToExit = (await readFallbackControlSnapshot()).currentActiveDescriptor?.action === "fullscreen";
    assertBrowser(tabToExit, "Tab from the penultimate focusable did not reach Exit fullscreen");

    const traversal = [];
    for (let step = 0; step < settledState.focusableDescriptors.length; step += 1) {
      await page.keyboard.press("Tab");
      const traversalState = await readFallbackControlSnapshot();
      const descriptor = traversalState.currentActiveDescriptor;
      assertBrowser(descriptor?.insideShell, "Tab traversal escaped the fallback dialog shell");
      traversal.push(descriptor);
    }
    assertBrowser(
      traversal.every((descriptor) => descriptor?.insideShell),
      "Tab traversal recorded an outside-shell focusable",
    );
    assertBrowser(
      traversal.at(-1)?.action === "fullscreen",
      "one complete Tab traversal did not return to Exit fullscreen",
    );

    const backgroundFocusAudit = await page.evaluate(() => {
      const audit = window.__openEnaFallbackFullscreenA11yAudit;
      if (!audit) throw new Error("fallback fullscreen audit state is missing");
      const focusableSelector = [
        "button:not([disabled])",
        "a[href]",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(",");
      const backgroundCandidate = audit.outsideNodes
        .flatMap((node) => [node, ...node.querySelectorAll(focusableSelector)])
        .find((element) => {
          if (!(element instanceof HTMLElement) || !element.matches(focusableSelector)) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
      if (!(backgroundCandidate instanceof HTMLElement)) {
        throw new Error("no visible focusable background candidate exists");
      }
      backgroundCandidate.focus();
      return {
        candidateFound: true,
        focusStayedInDialog: audit.shell.contains(document.activeElement),
      };
    });
    assertBrowser(backgroundFocusAudit.candidateFound, "fallback fullscreen background focus probe is missing");
    assertBrowser(backgroundFocusAudit.focusStayedInDialog, "programmatic focus escaped the fallback dialog");

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const audit = window.__openEnaFallbackFullscreenA11yAudit;
      return Boolean(
        audit
        && audit.shell.getAttribute("data-fallback-fullscreen") === null
        && audit.shell.getAttribute("role") === null
        && audit.shell.getAttribute("aria-modal") === null
        && document.activeElement === audit.opener
        && document.body.style.overflow === audit.bodyOverflow
      );
    }, null, { timeout: 15_000 });

    const restoredState = await page.evaluate(() => {
      const audit = window.__openEnaFallbackFullscreenA11yAudit;
      if (!audit) throw new Error("fallback fullscreen audit state is missing");
      const outsideTreeRestored = audit.outsideSnapshots.every((snapshot) => {
        const inertAttributeRestored = snapshot.hadInertAttribute
          ? snapshot.node.getAttribute("inert") === snapshot.inertAttribute
          : !snapshot.node.hasAttribute("inert");
        return snapshot.node.inert === snapshot.inertProperty
          && inertAttributeRestored
          && snapshot.node.getAttribute("aria-hidden") === snapshot.ariaHidden;
      });
      return {
        fallbackAttributeCleared: audit.shell.getAttribute("data-fallback-fullscreen") === null,
        roleCleared: audit.shell.getAttribute("role") === null,
        ariaModalCleared: audit.shell.getAttribute("aria-modal") === null,
        openerFocused: document.activeElement === audit.opener,
        bodyOverflowRestored: document.body.style.overflow === audit.bodyOverflow,
        outsideTreeRestored,
      };
    });
    assertBrowser(restoredState.fallbackAttributeCleared, "fallback attribute remained after Escape");
    assertBrowser(restoredState.roleCleared, "fallback dialog role remained after Escape");
    assertBrowser(restoredState.ariaModalCleared, "fallback aria-modal remained after Escape");
    assertBrowser(restoredState.openerFocused, "Escape did not restore focus to the Fullscreen opener");
    assertBrowser(restoredState.bodyOverflowRestored, "Escape did not restore body inline overflow exactly");
    assertBrowser(restoredState.outsideTreeRestored, "Escape did not restore outside-tree inert and aria-hidden state");

    evidence = {
      outsideNodeCount: modalState.outsideNodeCount,
      fallbackAttribute: modalState.fallbackAttribute,
      dialogRole: modalState.dialogRole,
      ariaModal: modalState.ariaModal,
      labelled: modalState.labelled,
      exitFocused: modalState.exitFocused,
      nativeFullscreenInactive: modalState.nativeFullscreenInactive,
      shellPathNonInert: modalState.shellPathNonInert,
      outsideTreeIsolated: modalState.outsideTreeIsolated,
      bodyScrollLocked: modalState.bodyScrollLocked,
      layoutAudit: fallbackLayoutAudit,
      entryState,
      settledState,
      pendingShiftTabDestination,
      settledShiftTabDestination,
      tabToExit,
      traversal,
      backgroundFocusContained: backgroundFocusAudit.focusStayedInDialog,
      fallbackAttributeCleared: restoredState.fallbackAttributeCleared,
      roleCleared: restoredState.roleCleared,
      ariaModalCleared: restoredState.ariaModalCleared,
      openerFocused: restoredState.openerFocused,
      bodyOverflowRestored: restoredState.bodyOverflowRestored,
      outsideTreeRestored: restoredState.outsideTreeRestored,
    };
  } finally {
    try {
      if (await shellLocator.getAttribute("data-fallback-fullscreen") === "true") {
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => (
          document.querySelector(".open-ena-interactive-3d-figure")
            ?.getAttribute("data-fallback-fullscreen") === null
        ), null, { timeout: 15_000 });
      }
    } finally {
      requestFullscreenRestored = await page.evaluate(() => {
        const audit = window.__openEnaFallbackFullscreenA11yAudit;
        if (!audit) return false;
        const shell = audit.shell;
        if (audit.hadOwnRequestFullscreen && audit.requestFullscreenDescriptor) {
          Object.defineProperty(shell, "requestFullscreen", audit.requestFullscreenDescriptor);
        } else {
          delete shell.requestFullscreen;
        }
        const restoredDescriptor = Object.getOwnPropertyDescriptor(shell, "requestFullscreen");
        const restored = audit.hadOwnRequestFullscreen
          ? restoredDescriptor?.value === audit.requestFullscreenDescriptor?.value
            && restoredDescriptor?.get === audit.requestFullscreenDescriptor?.get
            && restoredDescriptor?.set === audit.requestFullscreenDescriptor?.set
            && restoredDescriptor?.configurable === audit.requestFullscreenDescriptor?.configurable
            && restoredDescriptor?.enumerable === audit.requestFullscreenDescriptor?.enumerable
            && restoredDescriptor?.writable === audit.requestFullscreenDescriptor?.writable
          : !Object.prototype.hasOwnProperty.call(shell, "requestFullscreen");
        delete window.__openEnaFallbackFullscreenA11yAudit;
        return restored;
      });
    }
  }
  assertBrowser(requestFullscreenRestored, "fallback audit did not restore shell.requestFullscreen exactly");
  assertBrowser(Boolean(evidence), "fallback fullscreen accessibility evidence is missing");
  return {
    ...evidence,
    requestFullscreenRestored,
    requestedViewport: args.viewport,
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
      const shell = document.querySelector(".open-ena-interactive-3d-figure");
      const toolbar = shell?.querySelector(".open-ena-3d-plot-actions") ?? null;
      const plot = shell?.querySelector('[data-testid="open-ena-interactive-3d-plot"] [data-ena-plotly-root="true"]') ?? null;
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
        '[data-testid="open-ena-workspace-v3"] button, '
          + '[data-testid="open-ena-workspace-v3"] input, '
          + '[data-testid="open-ena-workspace-v3"] select',
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
      assertBrowser(overflow.shellBox && overflow.toolbarBox && overflow.plotBox, "mobile native plot geometry is incomplete");
      assertBrowser(overflow.plotBox.bottom <= overflow.shellBox.bottom + 1, "mobile canvas escapes its figure");
    }
    const pagePath = args.artifactDirectory + "/" + viewport.name + "-"
      + viewport.width + "x" + viewport.height + ".png";
    const plotPath = args.artifactDirectory + "/" + viewport.name + "-plot-"
      + viewport.width + "x" + viewport.height + ".png";
    const shellPath = args.artifactDirectory + "/" + viewport.name + "-shell-"
      + viewport.width + "x" + viewport.height + ".png";
    await page.screenshot({ path: pagePath, fullPage: false });
    await page.locator('[data-testid="open-ena-interactive-3d-plot"] [data-ena-plotly-root="true"]').screenshot({ path: plotPath });
    await page.locator(".open-ena-interactive-3d-figure").screenshot({ path: shellPath });
    results[viewport.name] = { ...viewport, ...overflow, pagePath, plotPath, shellPath };
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  const fullscreen = page.locator('.open-ena-3d-plot-actions [data-ena-plot-action="fullscreen"]');
  await fullscreen.click();
  await page.waitForFunction(() => {
    const shell = document.querySelector(".open-ena-interactive-3d-figure");
    return document.fullscreenElement === shell;
  }, null, { timeout: 15_000 });
    const fullscreenBox = await page.locator(".open-ena-interactive-3d-figure").boundingBox();
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
      const root = document.querySelector("[data-testid=open-ena-interactive-3d-plot] [data-ena-plotly-root=true]");
      if (!root) return false;
      const plotBox = root.getBoundingClientRect();
      const glplot = root._fullLayout?.scene?._scene?.glplot;
      const canvas = glplot?.canvas;
      const plotGlPixelRatio = Number(glplot?.pixelRatio);
      return typeof glplot?.getAspectratio === "function"
        && glplot.gl?.canvas === canvas
        && canvas instanceof HTMLCanvasElement
        && root.contains(canvas)
        && Number.isFinite(plotGlPixelRatio)
        && (() => {
        const canvasBox = canvas.getBoundingClientRect();
        return canvasBox.width >= plotBox.width * 0.9
          && canvasBox.height >= plotBox.height * 0.9
          && canvas.width >= canvasBox.width * plotGlPixelRatio * 0.9
          && canvas.height >= canvasBox.height * plotGlPixelRatio * 0.9;
      })();
    }, null, { timeout: 15_000 });
  const fullscreenPlotAudit = await readFullscreenPlotLayout(page);
  writeFileSync(join(artifactDirectory, "native-fullscreen-layout.json"), JSON.stringify(fullscreenPlotAudit, null, 2));
  await page.locator(".open-ena-interactive-3d-figure").screenshot({ path: join(artifactDirectory, "native-fullscreen-before-assert.png") });
  assertFullscreenPlotLayout(fullscreenPlotAudit, "fullscreen layout", "native");
  const fullscreenPath = args.artifactDirectory + "/desktop-fullscreen-1440x1000.png";
  await page.locator(".open-ena-interactive-3d-figure").screenshot({ path: fullscreenPath });
  const exitFullscreen = page.locator('.open-ena-3d-plot-actions [data-ena-plot-action="fullscreen"]');
  await exitFullscreen.click();
  await page.waitForFunction(() => {
    const shell = document.querySelector(".open-ena-interactive-3d-figure");
    return document.fullscreenElement !== shell
      && shell?.getAttribute("data-fallback-fullscreen") !== "true";
  }, null, { timeout: 15_000 });
    return { results, fullscreenBox, fullscreenViewport, fullscreenPlotAudit, fullscreenPath };
}

async function downloadAllArtifacts(page) {
  await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: /^Stats/ }).click();
  const panel = page.getByTestId("open-ena-native-trajectory-analysis");
  const participants = panel.getByRole("checkbox", { name: "Include participant data in this export", exact: true });
  assert.equal(await participants.isChecked(), false);
  const bundle = panel.getByRole("button", { name: "Export trajectory bundle", exact: true });
  const downloads = { aggregate: {}, participant: {} };
  for (const kind of ["aggregate", "participant"]) {
    if (kind === "participant") await participants.check();
    const zip = await saveNativeDownload(page, bundle, join(downloadDirectory, `${kind}.zip`), kind === "participant");
    assert.equal(zip.suggestedFilename, "open-ena-native-trajectory.zip");
    downloads[kind].bundle = zip.path;
    const names = ["analysis.json", "plot-specification.json", "trajectory-inference.csv", "manifest.json", ...(kind === "participant" ? ["participants.json"] : [])];
    for (const name of names) downloads[kind][name] = (await saveNativeDownload(page, panel.getByRole("button", { name: `Download ${name}`, exact: true }), join(downloadDirectory, `${kind}-${name}`), kind === "participant")).path;
  }
  await nativeScience(page);
  return downloads;
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
      || !(
        sourceLine.includes('getContext("2d")')
        || sourceLine.includes('getContext("2d",')
      )
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
      ? classifyChromiumCanvasReadbackDiagnostic({
        browser: args.browser,
        currentOrigin,
        warning,
      })
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
let completedSummary = null;
try {
  assert.equal(externalBaseUrl, null, "longitudinal browser requires an owned local production server");
  runtime = await createServedBrowserV3({ root: projectRoot, directory: join(artifactDirectory, "runtime"), credentials: { username, password, secret: sessionSecret }, redact, serverLogPath, disableBrowserCache: true });
  const plotAudit = await runBrowserPhase("native trajectory model ranks path and rendering", authenticateAndRunTrajectory, { username, password, baseUrl: runtime.baseUrl }, 240_000);
  const scientificArgs = { expectedResultHash: plotAudit.resultHashes[0], expectedTaskRequestCount: plotAudit.taskRequestCount, expectedCodes: plotAudit.expectedCodes, orderedHorizons: plotAudit.orderedHorizons, artifactDirectory };
  const downloads = await runBrowserPhase("all native aggregate and participant downloads", downloadAllArtifacts, {}, 240_000);
  const aggregate = extractAndVerifyBundle(downloads.aggregate.bundle, "aggregate", false);
  const participant = extractAndVerifyBundle(downloads.participant.bundle, "participant", true);
  verifyStandaloneDownloads(downloads.aggregate, aggregate); verifyStandaloneDownloads(downloads.participant, participant);
  assert.deepEqual(aggregate.manifest.binding, plotAudit.binding);
  assert.deepEqual(participant.manifest.binding, plotAudit.binding);
  const expectedPathRows = aggregate.analysis.pathComparison.tests.map(test => [test.metric, test.timeIndex === null ? "—" : String(test.timeIndex), test.distanceSpace ?? "", String(test.observed), String(test.pValue), String(test.holmAdjustedPValue), String(test.permutationCount)]);
  assert.deepEqual(plotAudit.pathRows, expectedPathRows, "native rendered path rows differ from the actual exported path tests");
  for (const standalone of plotAudit.rankDownloads) {
    const savedRank = JSON.parse(readFileSync(standalone.path, "utf8"));
    const bundled = aggregate.analysis.ranks.find(rank => rank.kind === savedRank.inference.kind);
    assert.ok(bundled, "genuine standalone rank is absent from bundle");
    assert.equal(bundled.scientificContextSha256, savedRank.context.scientificContextSha256);
    const compareAllowed = (aggregateValue, sourceValue, label) => {
      if (Array.isArray(aggregateValue)) { assert.ok(Array.isArray(sourceValue), label); assert.equal(aggregateValue.length, sourceValue.length, label); aggregateValue.forEach((value, i) => compareAllowed(value, sourceValue[i], `${label}[${i}]`)); }
      else if (aggregateValue && typeof aggregateValue === "object") { assert.ok(sourceValue && typeof sourceValue === "object", label); for (const [key, value] of Object.entries(aggregateValue)) compareAllowed(value, sourceValue[key], `${label}.${key}`); }
      else assert.deepEqual(aggregateValue, sourceValue, label);
    };
    for (const table of ["rows", "omnibusRows", "followupRows"]) {
      compareAllowed(bundled[table], savedRank.inference[table] ?? [], `${savedRank.inference.kind}.${table}`);
      for (const row of bundled[table]) for (const required of ["test", "axis", "status", "pRaw", "pHolm"]) assert.ok(Object.hasOwn(row, required), `bundle omitted ${required}`);
    }
    compareAllowed(bundled.ledger, savedRank.inference.ledger, `${savedRank.inference.kind}.ledger`);
  }
  for (const member of aggregate.manifest.files) {
    assert.deepEqual(participant.manifest.files.find(candidate => candidate.filename === member.filename), member, "participant opt-in changed aggregate descriptor");
    assert.deepEqual(readFileSync(join(aggregate.extracted, member.filename)), readFileSync(join(participant.extracted, member.filename)));
  }
  await nativeProjectionControl(runtime.page).selectOption("3d");
  const railPanelAudit = await runBrowserPhase("persistent Data Model Stats AI and Plot rail", exerciseNonPlotRailPanels, scientificArgs);
  const displayAudit = await runBrowserPhase("seven cameras manual orbit and six native SVG projections", exerciseCamerasAndProjections, { ...scientificArgs, cameraPresets, expectedCameraLabels, expectedCameraStates, projections: twoDimensionalProjections, browser: smokeBrowser }, 240_000);
  const plotActionAudit = await runBrowserPhase("perspective orthographic native SVG and actual PNG actions", exerciseTrajectoryPlotActions, { ...scientificArgs, expectedCameraState: expectedCameraStates.isometric }, 240_000);
  const pendingImageAudit = await runBrowserPhase("real pending PNG denial clipboard rejection and recovery", exercisePendingImageActions, {}, 240_000);
  const fallbackA11yAudit = await runBrowserPhase("reversible fallback fullscreen keyboard modal", exerciseFallbackFullscreenAccessibility, { viewport: { width: 1440, height: 1000 } });
  const responsiveAudit = await runBrowserPhase("responsive native fullscreen and canvas geometry", captureResponsiveEvidence, { viewports: viewportMatrix, artifactDirectory });
  const staleImageAudit = await runBrowserPhase("stale model suppresses actual awaited PNG output", exerciseStaleImageLease, {}, 180_000);
  const browserErrors = await runBrowserPhase("strict runtime warning classification", readBrowserErrors, { browser: smokeBrowser });
  assert.deepEqual(browserErrors.consoleErrors, []); assert.deepEqual(browserErrors.consoleWarnings, []); assert.deepEqual(browserErrors.pageErrors, []);
  assert.ok(browserErrors.platformDiagnostics.canvas2dReadbackDiagnostics.length <= 1);
  const chromiumAngleReadPixelsDiagnostics = browserErrors.platformDiagnostics.chromiumAngleReadPixelsDiagnostics;
  assert.ok(chromiumAngleReadPixelsDiagnostics.count <= 4);
  assert.ok(chromiumAngleReadPixelsDiagnostics.repeatSuppressionCount <= 1);
  assert.ok(chromiumAngleReadPixelsDiagnostics.sourcePaths.length <= 1);
  const screenshots = Object.fromEntries(readdirSync(artifactDirectory).filter(name => /\.(png|svg)$/u.test(name)).map(name => [name, artifactEvidence(join(artifactDirectory, name))]));
  const browserRuntimeEvidence = await readBrowserRuntimeEvidence(runtime.page);
  await nativeScience(runtime.page);
  completedSummary = { status: "PASS", source: { ...sourceEvidenceBefore, smokeSourceSha256 }, runtimeBrowserVersion: browserRuntimeEvidence.version, runtimeBrowserUserAgent: browserRuntimeEvidence.userAgent, plotAudit, screenshots, downloads, aggregate: { manifest: aggregate.manifest, zipSha256: aggregate.zipSha256 }, participant: { manifest: participant.manifest, zipSha256: participant.zipSha256 }, railPanelAudit, displayAudit, plotActionAudit, pendingImageAudit, fallbackA11yAudit, responsiveAudit, staleImageAudit, browserErrors };
} catch (caught) {
  primaryFailure = caught;
  if (runtime) { try { await runtime.page.screenshot({ path: failureScreenshotPath, fullPage: true }); } catch {} }
} finally {
  if (runtime) { try { await runtime.close(primaryFailure); } catch (cleanupError) { primaryFailure ??= cleanupError; } }
}
const sourceEvidenceAfter = readGitEvidence();
assert.equal(sourceEvidenceAfter.gitHead, sourceEvidenceBefore.gitHead, "Git HEAD changed during browser evidence capture");
assert.equal(sourceEvidenceAfter.gitTree, sourceEvidenceBefore.gitTree, "Git tree changed during browser evidence capture");
assert.equal(sourceEvidenceAfter.clean, true, "source worktree is dirty after browser evidence cleanup");
if (primaryFailure) { writeFileSync(join(artifactDirectory, "failure.json"), JSON.stringify({ status: "FAIL", message: redact(primaryFailure.stack), source: { ...sourceEvidenceBefore, smokeSourceSha256 } }, null, 2)); throw primaryFailure; }
assert.ok(completedSummary);
completedSummary.source.worktreeCleanBefore = sourceEvidenceBefore.clean;
completedSummary.source.worktreeCleanAfter = sourceEvidenceAfter.clean;
writeFileSync(join(artifactDirectory, "summary.json"), JSON.stringify(completedSummary, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: completedSummary.status, evidence: artifactDirectory }) + "\n");
