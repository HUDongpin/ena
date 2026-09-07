#!/usr/bin/env node

import assert from "node:assert/strict";
import { createServedBrowserV3, literalGit } from "./helpers/open-ena-served-browser-v3.mjs";
import { prepareNativeFixtureV3, runNativeFixtureV3, nativeFixtureIdentitiesV3 } from "./helpers/open-ena-native-browser-fixture-v3.mjs";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSafePlaywrightCliError } from "./support/safe-playwright-cli-error.mjs";

const smokePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(smokePath), "..");
const artifactDirectory = resolve(
  process.env.OPEN_ENA_NODE_DRAG_SMOKE_ARTIFACT_DIR
    || join(projectRoot, "output", "playwright", "open-ena-node-drag-smoke"),
);
const summaryPath = join(artifactDirectory, "summary.json");
const screenshotPath = join(artifactDirectory, "ona-3d-after-drag.png");
const serverLogPath = join(artifactDirectory, "next-server.log");
const originalTsconfig = readFileSync(join(projectRoot, "tsconfig.json"), "utf8");
const username = "open_ena_node_drag_smoke_researcher";
const password = "open_ena_node_drag_smoke_password_2026";
const sessionSecret = "open_ena_node_drag_smoke_session_secret_0123456789abcdef";
const sessionName = `open-ena-node-drag-smoke-${process.pid}`;
const ownedDistDirName = `.next-node-drag-smoke-${process.pid}`;
const ownedDistDirectory = join(projectRoot, ownedDistDirName);
const browserName = process.env.OPEN_ENA_NODE_DRAG_SMOKE_BROWSER
  || "chromium";

assert.ok(["chromium", "chrome", "msedge"].includes(browserName));
assert.equal(dirname(ownedDistDirectory), projectRoot);
assert.ok(basename(ownedDistDirectory).startsWith(".next-node-drag-smoke-"));
mkdirSync(artifactDirectory, { recursive: true });
for (const ownedPath of [summaryPath, screenshotPath, serverLogPath]) {
  assert.equal(dirname(ownedPath), artifactDirectory);
  rmSync(ownedPath, { force: true });
}

const playwrightWrapper = join(
  homedir(),
  ".codex",
  "skills",
  "playwright",
  "scripts",
  "playwright_cli.sh",
);
const playwrightCli = existsSync(playwrightWrapper)
  ? { command: playwrightWrapper, prefix: [] }
  : {
      command: "npx",
      prefix: ["--yes", "--package", "@playwright/cli@0.1.18", "playwright-cli"],
    };
let playwrightWorkingDirectory = null;
let ownedServer = null;
let browserOpened = false;
let ownsDistDirectory = false;

function redact(value) {
  return String(value ?? "")
    .replaceAll(username, "[redacted-username]")
    .replaceAll(password, "[redacted-password]")
    .replaceAll(sessionSecret, "[redacted-session-secret]");
}

function ensurePlaywrightWorkingDirectory() {
  if (!playwrightWorkingDirectory) {
    playwrightWorkingDirectory = mkdtempSync(join(tmpdir(), "open-ena-node-drag-playwright-"));
  }
  return playwrightWorkingDirectory;
}

let runtime = null;
async function runCli(args, label, timeout = 300000) {
  if (args[0] === "--version") return "Playwright module 1.62.1 (owned foreground Chromium)";
  if (!runtime) throw new Error("Owned production runtime is unavailable");
  if (args[0] === "open") { await runtime.page.goto(args[1], { waitUntil: "domcontentloaded" }); return ""; }
  if (args[0] === "close") { await runtime.close(primaryFailure); return ""; }
  if (args[0] === "screenshot") { await runtime.page.screenshot({ path: args.at(-1), fullPage: true }); return ""; }
  if (args[0] === "console") return `Errors: ${runtime.receipt.consoleErrors.length}\nWarnings: ${runtime.receipt.consoleWarnings.length}\n${runtime.receipt.consoleErrors.join("\n")}`;
  if (args[0] === "--raw" && args[1] === "run-code") {
    const action = new Function(`return (${args[2]});`)();
    return JSON.stringify(await runtime.stage(label, () => action(runtime.page), timeout));
  }
  throw new Error("Unsupported owned browser operation");
}

function browserSource(task, args, helpers) {
  return `async (page) => {${prepareNativeFixtureV3.toString()}\n${runNativeFixtureV3.toString()}\n${nativeFixtureIdentitiesV3.toString()}\n${helpers.map((helper) => helper.toString()).join("\n")}
    const task = ${task.toString()};
    return await task(page, ${JSON.stringify(args)});
  }`;
}

async function runBrowserTask(label, task, args, helpers, timeout = 300_000) {
  process.stdout.write(`[node-drag smoke] ${label} ... `);
  const output = (await runCli(
    ["--raw", "run-code", browserSource(task, args, helpers)],
    label,
    timeout,
  )).trim();
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

async function waitForServer(url, timeout = 120_000) {
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
  throw new Error(`Open ENA did not become ready at ${url}.`, { cause: lastError });
}

async function stopOwnedServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const waitForExit = (timeout) => new Promise((resolveExit) => {
    if (server.exitCode !== null || server.signalCode !== null) return resolveExit(true);
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
  const signal = (name) => {
    try {
      if (process.platform !== "win32") return process.kill(-server.pid, name);
    } catch {
      // Fall back to the direct child below.
    }
    return server.kill(name);
  };
  signal("SIGTERM");
  if (await waitForExit(5_000)) return;
  signal("SIGKILL");
  if (!await waitForExit(5_000)) throw new Error("The smoke server did not exit.");
}

function removeOwnedDistDirectory() {
  assert.equal(dirname(ownedDistDirectory), projectRoot);
  assert.ok(basename(ownedDistDirectory).startsWith(".next-node-drag-smoke-"));
  rmSync(ownedDistDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

async function cleanup() {
  const failures = [];
  if (browserOpened) {
    try {
      await runCli(["close"], "close browser", 30_000);
    } catch (caught) {
      failures.push(caught);
    }
  }
  try {
    await stopOwnedServer(ownedServer);
  } catch (caught) {
    failures.push(caught);
  }
  try {
    writeFileSync(join(projectRoot, "tsconfig.json"), originalTsconfig, "utf8");
  } catch (caught) {
    failures.push(caught);
  }
  if (ownsDistDirectory) {
    try {
      removeOwnedDistDirectory();
    } catch (caught) {
      failures.push(caught);
    }
  }
  if (playwrightWorkingDirectory) {
    try {
      assert.equal(dirname(playwrightWorkingDirectory), tmpdir());
      rmSync(playwrightWorkingDirectory, { recursive: true, force: true });
      playwrightWorkingDirectory = null;
    } catch (caught) {
      failures.push(caught);
    }
  }
  if (failures.length) {
    throw new Error(failures.map((failure) => redact(failure)).join(" | "));
  }
}

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
  const groups = ["SYNTHETIC_BASELINE", "SYNTHETIC_SCAFFOLDED"];
  const rows = ["Group,Name,Conversation,Turn,CODE_A,CODE_B,CODE_C,CODE_D,CODE_E"];
  for (const [groupIndex, group] of groups.entries()) {
    for (let unitIndex = 0; unitIndex < 6; unitIndex += 1) {
      for (let turnIndex = 0; turnIndex < 4; turnIndex += 1) {
        const pattern = patterns[(unitIndex * 4 + turnIndex + groupIndex * 3) % patterns.length];
        rows.push([
          group,
          `SYNTHETIC_UNIT_${unitIndex + 1}`,
          `SYNTHETIC_CONVERSATION_${unitIndex + 1}`,
          turnIndex + 1,
          ...pattern,
        ].join(","));
      }
    }
  }
  return `${rows.join("\n")}\n`;
}

function assertBrowser(condition, message) {
  if (!condition) throw new Error(message);
}

async function installAuditAndAuthenticate(page, args) {
  await page.addInitScript(() => {
    const audit = {
      analysisRunCount: 0,
      canonicalResult: null,
      visualCopy: 0,
    };
    Object.defineProperty(window, "__openEnaNodeDragAudit", { value: audit, configurable: true });
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function auditedPostMessage(message, ...rest) {
      if (message?.kind === "run-open-ena-plan-v3" && message?.plan) {
        audit.analysisRunCount += 1;
        audit.canonicalResult = JSON.stringify({
          plan: message.plan,
        });
      }
      return originalPostMessage.call(this, message, ...rest);
    };
    class SmokeClipboardItem {
      constructor(items) { this.items = items; }
    }
    Object.defineProperty(window, "ClipboardItem", { value: SmokeClipboardItem, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async () => { audit.visualCopy += 1; },
        writeText: async () => { audit.visualCopy += 1; },
      },
    });
  });
  await page.goto(args.entryUrl, { waitUntil: "domcontentloaded" });
  const account = page.getByRole("textbox", { name: "Account name" });
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await Promise.race([
    account.waitFor({ state: "visible", timeout: 30_000 }),
    rail.waitFor({ state: "visible", timeout: 30_000 }),
  ]);
  if (await account.count()) {
    await account.fill(args.username);
    await page.getByRole("textbox", { name: "Password" }).fill(args.password);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await rail.waitFor({ timeout: 30_000 });
}

async function uploadAndBuildStandard(page, fixtureCsv) {
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.getByRole("button", { name: "Data", exact: true }).click();
  const fileInput = page.locator('input[type=file][accept*=".csv"]');
  await fileInput.waitFor({ state: "attached", timeout: 30_000 });
  await fileInput.evaluate((input, csv) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([csv], "open-ena-node-drag-smoke.csv", { type: "text/csv" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, fixtureCsv);
  await prepareNativeFixtureV3(page);
  await runNativeFixtureV3(page);
  await page.getByTestId("open-ena-group-comparison-plot").waitFor({ timeout: 60_000 });
}

function readAudit(page) {
  return page.evaluate(() => ({
    boundScience: (() => { const response = window.__openEnaNativeAudit.responses.at(-1), request = window.__openEnaNativeAudit.requests.find(item => item.id === response?.id); if (!response || response.executionPlanSha256 !== request?.plan.header.executionPlanSha256) throw new Error("drag audit has no current native binding"); const r = response.result; return JSON.stringify({ binding: r.binding, set: r.set, configuration: r.configuration, executionProvenance: r.executionProvenance }); })(),
    analysisRunCount: window.__openEnaNodeDragAudit?.analysisRunCount ?? -1,
    canonicalResult: window.__openEnaNodeDragAudit?.canonicalResult ?? null,
    visualCopy: window.__openEnaNodeDragAudit?.visualCopy ?? -1,
  }));
}

async function readSvgFamily(page, svgSelector, code, ordered) {
  const identities = await nativeFixtureIdentitiesV3(page);
  const matching = identities.codes.filter(entry => entry.sourceColumn === code);
  assertBrowser(matching.length === 1, "drag Code requires unique source/rendered identity");
  return await page.locator(svgSelector).evaluateAll((roots, input) => roots.map((root) => {
    const r = window.__openEnaNativeAudit.responses.at(-1).result;
    const incidentNames = new Set(r.set.adjacencyKey.filter(edge => edge.source === input.code || edge.target === input.code).map(edge => edge.name));
    const node = root.querySelector(`[data-ena-drag-code="${input.code}"]`);
    const nodeTransform = node?.parentElement?.getAttribute("transform") ?? null;
    const incident = input.ordered
      ? [...root.querySelectorAll(
          `[data-ona-edge-glyph][data-ona-ground="${input.code}"],`
          + `[data-ona-edge-glyph][data-ona-response="${input.code}"]`,
        )].map((path) => path.getAttribute("d"))
      : [...root.querySelectorAll("[data-ena-edge]")].filter(line => incidentNames.has(line.getAttribute("data-ena-edge")))
          .map((line) => ["x1", "y1", "x2", "y2"].map((name) => line.getAttribute(name)).join(","));
    return { nodeTransform, incident };
  }), { code: matching[0].column, ordered });
}

async function dragSvgNode(page, svgSelector, code, delta) {
  const identities = await nativeFixtureIdentitiesV3(page);
  const matching = identities.codes.filter(entry => entry.sourceColumn === code);
  assertBrowser(matching.length === 1, "drag Code requires unique source/rendered identity");
  const node = page.locator(svgSelector).first().locator(`[data-ena-drag-code="${matching[0].column}"]`);
  const hitTarget = node.locator(".ena-node-drag-hit-target");
  const box = await hitTarget.boundingBox();
  assertBrowser(Boolean(box), "SVG node hit target is not visible");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

function assertSvgMove(before, after, label) {
  assertBrowser(before.length === after.length && before.length >= 1, `${label} triptych inventory changed`);
  for (let index = 0; index < before.length; index += 1) {
    assertBrowser(before[index].nodeTransform !== after[index].nodeTransform, `${label} triptych node did not move`);
  }
  assertBrowser(before[0].incident.length > 0, `${label} has no incident edge`);
  assertBrowser(
    JSON.stringify(before[0].incident) !== JSON.stringify(after[0].incident),
    `${label} incident edge did not follow node`,
  );
}

async function clickVisualCopy(page, containerSelector) {
  const before = await readAudit(page);
  const button = page.locator(containerSelector).locator('[data-ena-plot-action="copy-image"]').first();
  const approve = dialog => dialog.accept();
  page.once("dialog", approve);
  try {
    await button.click();
    await page.waitForFunction((count) => (
      (window.__openEnaNodeDragAudit?.visualCopy ?? -1) > count
    ), before.visualCopy);
  } finally { page.off("dialog", approve); }
  return (await readAudit(page)).visualCopy;
}

async function resetNodeLayout(page) {
  const resetLocator = () => page.locator(
    '[data-ena-plot-action="reset-node-layout"][data-ena-node-layout-overrides="1"]',
  ).first();
  if (await resetLocator().count() === 0) {
    await page.getByRole("navigation", { name: "Analysis modes" })
      .getByRole("button", { name: "Plot Tools", exact: true }).click();
    await resetLocator().waitFor({ state: "attached", timeout: 30_000 });
  }
  const reset = resetLocator();
  assertBrowser(await reset.count() === 1 && !await reset.isDisabled(),
    "Reset node layout is not enabled after a drag");
  await reset.scrollIntoViewIfNeeded();
  await reset.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-ena-plot-action="reset-node-layout"]')]
    .some((button) => button.getAttribute("data-ena-node-layout-overrides") === "0" && button.disabled));
  const cleared = page.locator(
    '[data-ena-plot-action="reset-node-layout"][data-ena-node-layout-overrides="0"]',
  ).first();
  assertBrowser(await cleared.count() === 1 && await cleared.isDisabled(),
    "Reset node layout did not clear its overrides");
}

async function selectView(page, dimension) {
  const visualization = page.locator(".ena-visual-toolbar");
  const button = visualization.getByRole("button", {
    name: dimension === "3d" ? /^3D (?:ENA|ONA)/ : /^2D (?:ENA|ONA)/,
  });
  assertBrowser(await button.isEnabled(), `${dimension} view is disabled`);
  await button.click();
}

async function waitForPlotlyTriptych(page, testIds) {
  for (const testId of testIds) {
    const root = page.getByTestId(testId).locator('[data-ena-plotly-root="true"]');
    await root.waitFor({ state: "visible", timeout: 60_000 });
    await page.getByTestId(testId).locator('[data-ena-interactive-camera="true"][aria-busy="false"]')
      .waitFor({ state: "visible", timeout: 60_000 });
  }
  await page.waitForTimeout(400);
}

async function readPlotlyFamily(page, testIds, code) {
  return await page.evaluate(({ testIds: ids, code: selectedCode }) => ids.map((testId) => {
    const root = document.querySelector(
      `[data-testid="${testId}"] [data-ena-plotly-root="true"]`,
    );
    const traces = Array.isArray(root?.data) ? root.data : [];
    const codeTrace = traces.find((trace) => trace.meta?.role === "code-node");
    const pointNumber = codeTrace?.text?.indexOf(selectedCode) ?? -1;
    if (!root || !codeTrace || pointNumber < 0) throw new Error(`code-node trace missing in ${testId}`);
    const r = window.__openEnaNativeAudit.responses.at(-1).result;
    const labels = r.executionProvenance.labels.codes.filter(entry => entry.sourceColumn === selectedCode);
    if (labels.length !== 1) throw new Error("drag Code mapping must be unique");
    const incidents = r.set.adjacencyKey.map((edge, index) => ({ edge, index })).filter(({ edge }) => edge.source === labels[0].column || edge.target === labels[0].column);
    const edgeNames = new Set(incidents.map(({ edge }) => edge.name)), edgeIndices = new Set(incidents.map(({ index }) => index));
    const incident = traces.filter((trace) => (
      trace.meta?.role === "network-edge" && edgeNames.has(trace.meta?.edgeName)
    ) || (
      ["ordered-edge-shaft", "ordered-edge-arrowhead", "ordered-self-loop-shaft", "ordered-self-loop-arrowhead"]
        .includes(trace.meta?.role)
      && (trace.meta?.orderedEdgeIndices?.some(index => edgeIndices.has(index)) || trace.meta?.ground === labels[0].column || trace.meta?.response === labels[0].column)
    )).map((trace) => ({
      role: trace.meta?.role,
      edge: trace.meta?.edgeName ?? `${trace.meta?.ground}->${trace.meta?.response}`,
      x: trace.x,
      y: trace.y,
      z: trace.z,
      u: trace.u,
      v: trace.v,
      w: trace.w,
    }));
    const scene = root._fullLayout?.scene?._scene;
    return {
      node: {
        x: codeTrace.x[pointNumber],
        y: codeTrace.y[pointNumber],
        z: codeTrace.z[pointNumber],
      },
      incident,
      camera: typeof scene?.getCamera === "function" ? scene.getCamera() : null,
    };
  }), { testIds, code });
}

async function dragPlotlyNode(page, testId, code, delta) {
  const root = page.getByTestId(testId).locator('[data-ena-plotly-root="true"]');
  const box = await root.boundingBox();
  assertBrowser(Boolean(box), "Plotly drag root is not visible");
  const start = { x: box.x + box.width * 0.52, y: box.y + box.height * 0.52 };
  await page.mouse.move(start.x, start.y);
  await root.evaluate((element, selectedCode) => {
    const traces = Array.isArray(element.data) ? element.data : [];
    const curveNumber = traces.findIndex((trace) => trace.meta?.role === "code-node");
    const trace = traces[curveNumber];
    const pointNumber = trace?.text?.indexOf(selectedCode) ?? -1;
    if (typeof element.emit !== "function" || !trace || pointNumber < 0) {
      throw new Error("Plotly code-node hover emitter is unavailable");
    }
    element.emit("plotly_hover", {
      points: [{ curveNumber, pointNumber, data: trace, fullData: trace }],
    });
  }, code);
  const identities = await nativeFixtureIdentitiesV3(page);
  const rendered = identities.codes.filter(entry => entry.sourceColumn === code);
  assertBrowser(rendered.length === 1, "Plotly hover Code mapping must be unique");
  await page.waitForFunction(({ element, selectedCode }) => element.getAttribute("data-ena-node-hovered") === selectedCode,
    { element: await root.elementHandle(), selectedCode: rendered[0].column });
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

function assertPlotlyMove(before, after, label) {
  assertBrowser(before.length === 3 && after.length === 3, `${label} triptych is incomplete`);
  for (let index = 0; index < 3; index += 1) {
    assertBrowser(
      JSON.stringify(before[index].node) !== JSON.stringify(after[index].node),
      `${label} triptych node did not move`,
    );
  }
  assertBrowser(after.every((plot) => JSON.stringify(plot.node) === JSON.stringify(after[0].node)),
    `${label} triptych node coordinates are not synchronized`);
  assertBrowser(before[0].incident.length > 0, `${label} has no incident edge`);
  assertBrowser(JSON.stringify(before[0].incident) !== JSON.stringify(after[0].incident),
    `${label} incident edge did not follow node`);
}

async function orbitFromEmptySpace(page, testId) {
  const root = page.getByTestId(testId).locator('[data-ena-plotly-root="true"]');
  const before = (await readPlotlyFamily(page, [testId], "CODE_A"))[0].camera;
  const box = await root.boundingBox();
  assertBrowser(Boolean(box), "Plotly root is unavailable for empty-space camera orbit");
  const start = { x: box.x + box.width * 0.76, y: box.y + box.height * 0.72 };
  await page.mouse.move(start.x, start.y);
  await root.evaluate((element) => {
    if (typeof element.emit === "function") element.emit("plotly_unhover", { points: [] });
  });
  await page.mouse.down();
  await page.mouse.move(start.x - 70, start.y + 35, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const after = (await readPlotlyFamily(page, [testId], "CODE_A"))[0].camera;
  assertBrowser(JSON.stringify(before) !== JSON.stringify(after), "empty-space camera orbit did not move the camera");
  return { before, after };
}

async function recenterPreservesNode(page, testId, expectedNode) {
  const panel = page.getByTestId(testId);
  await panel.locator('[data-ena-plot-action="recenter"]').click();
  await page.waitForTimeout(300);
  const after = (await readPlotlyFamily(page, [testId], "CODE_A"))[0].node;
  assertBrowser(JSON.stringify(after) === JSON.stringify(expectedNode), "Recenter changed the moved node layout");
}

async function switchToOnaAndBuild(page) {
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.getByRole("button", { name: "Model", exact: true }).click();
  await prepareNativeFixtureV3(page, { family: "ona", sourcePreparation: false });
  await page.getByRole("tab", { name: /^Codes(,|$)/ }).click();
  await page.getByRole("button", { name: "Initialize explicit all-enabled mask", exact: true }).click();
  await runNativeFixtureV3(page);
  await selectView(page, "2d");
  await page.getByTestId("open-ena-ordered-result-layout").waitFor({ timeout: 60_000 });
}

async function runNodeDragAcceptance(page, args) {
  await installAuditAndAuthenticate(page, args);
  await uploadAndBuildStandard(page, args.fixtureCsv);
  const code = "CODE_A";
  const families = {};

  const standardCanonical = await readAudit(page);
  const standard2dSelector = '[data-testid="open-ena-group-comparison-plot"],'
    + '[data-testid="open-ena-group-primary-plot"],'
    + '[data-testid="open-ena-group-secondary-plot"]';
  const standard2dBefore = await readSvgFamily(page, standard2dSelector, code, false);
  await dragSvgNode(page, '[data-testid="open-ena-group-comparison-plot"]', code, { x: 58, y: 34 });
  const standard2dAfter = await readSvgFamily(page, standard2dSelector, code, false);
  assertSvgMove(standard2dBefore, standard2dAfter, "standard-2d");
  assertBrowser((await readAudit(page)).canonicalResult === standardCanonical.canonicalResult && (await readAudit(page)).boundScience === standardCanonical.boundScience,
    "standard-2d drag mutated analytical result");
  const standard2dCopy = await clickVisualCopy(page, '[data-testid="open-ena-group-center-surface"]');
  families["standard-2d"] = { before: standard2dBefore, after: standard2dAfter, visualCopy: standard2dCopy };
  await resetNodeLayout(page);
  assertBrowser(JSON.stringify(await readSvgFamily(page, standard2dSelector, code, false))
    === JSON.stringify(standard2dBefore), "standard-2d reset did not restore canonical geometry");

  await selectView(page, "3d");
  const standard3dIds = [
    "open-ena-3d-comparison-plot",
    "open-ena-3d-primary-plot",
    "open-ena-3d-secondary-plot",
  ];
  await waitForPlotlyTriptych(page, standard3dIds);
  const standard3dBefore = await readPlotlyFamily(page, standard3dIds, code);
  await dragPlotlyNode(page, standard3dIds[0], code, { x: 72, y: -44 });
  const standard3dAfter = await readPlotlyFamily(page, standard3dIds, code);
  assertPlotlyMove(standard3dBefore, standard3dAfter, "standard-3d");
  assertBrowser((await readAudit(page)).canonicalResult === standardCanonical.canonicalResult && (await readAudit(page)).boundScience === standardCanonical.boundScience,
    "standard-3d drag mutated analytical result");
  const cameraOrbit = await orbitFromEmptySpace(page, standard3dIds[0]);
  await recenterPreservesNode(page, standard3dIds[0], standard3dAfter[0].node);
  const standard3dCopy = await clickVisualCopy(page, '[data-testid="open-ena-3d-comparison-plot"]');
  families["standard-3d"] = {
    before: standard3dBefore,
    after: standard3dAfter,
    cameraOrbit,
    visualCopy: standard3dCopy,
  };
  await resetNodeLayout(page);
  assertBrowser(JSON.stringify((await readPlotlyFamily(page, standard3dIds, code)).map((plot) => plot.node))
    === JSON.stringify(standard3dBefore.map((plot) => plot.node)),
  "standard-3d reset did not restore canonical geometry");

  await switchToOnaAndBuild(page);
  const onaCanonical = await readAudit(page);
  const ona2dSelector = '[data-testid="open-ena-ordered-plot"]';
  const ona2dBefore = await readSvgFamily(page, ona2dSelector, code, true);
  await dragSvgNode(page, '[data-testid="open-ena-ordered-plot"][data-ona-scope="overall"]', code, { x: 52, y: 31 });
  const ona2dAfter = await readSvgFamily(page, ona2dSelector, code, true);
  assertSvgMove(ona2dBefore, ona2dAfter, "ona-2d");
  assertBrowser((await readAudit(page)).canonicalResult === onaCanonical.canonicalResult && (await readAudit(page)).boundScience === onaCanonical.boundScience,
    "ona-2d drag mutated analytical result");
  families["ona-2d"] = { before: ona2dBefore, after: ona2dAfter, visualCopy: "svg-live-geometry" };
  await resetNodeLayout(page);
  assertBrowser(JSON.stringify(await readSvgFamily(page, ona2dSelector, code, true))
    === JSON.stringify(ona2dBefore), "ona-2d reset did not restore canonical geometry");

  await selectView(page, "3d");
  const ona3dIds = [
    "open-ena-ona-3d-overall-plot",
    "open-ena-ona-3d-primary-plot",
    "open-ena-ona-3d-secondary-plot",
  ];
  await page.getByTestId("open-ena-3d-ordered-result-layout").waitFor({ timeout: 60_000 });
  await waitForPlotlyTriptych(page, ona3dIds);
  const ona3dBefore = await readPlotlyFamily(page, ona3dIds, code);
  await dragPlotlyNode(page, ona3dIds[0], code, { x: 68, y: -38 });
  const ona3dAfter = await readPlotlyFamily(page, ona3dIds, code);
  assertPlotlyMove(ona3dBefore, ona3dAfter, "ona-3d");
  assertBrowser((await readAudit(page)).canonicalResult === onaCanonical.canonicalResult && (await readAudit(page)).boundScience === onaCanonical.boundScience,
    "ona-3d drag mutated analytical result");
  await recenterPreservesNode(page, ona3dIds[0], ona3dAfter[0].node);
  const ona3dCopy = await clickVisualCopy(page, '[data-testid="open-ena-ona-3d-overall-plot"]');
  families["ona-3d"] = { before: ona3dBefore, after: ona3dAfter, visualCopy: ona3dCopy };
  await page.screenshot({ path: args.screenshotPath, fullPage: true });
  await resetNodeLayout(page);
  assertBrowser(JSON.stringify((await readPlotlyFamily(page, ona3dIds, code)).map((plot) => plot.node))
    === JSON.stringify(ona3dBefore.map((plot) => plot.node)),
  "ona-3d reset did not restore canonical geometry");

  const finalAudit = await readAudit(page);
  assertBrowser(finalAudit.analysisRunCount === 2, "node dragging unexpectedly reran analysis");
  assertBrowser(finalAudit.canonicalResult === onaCanonical.canonicalResult, "drag mutated analytical result");
  return { families, finalAudit, currentUrl: page.url() };
}

let acceptance = null;
let primaryFailure = null;
let cleanupFailure = null;
try {
  runtime = await createServedBrowserV3({ root: resolve(projectRoot), directory: artifactDirectory + "-runtime", credentials: { username, password, secret: sessionSecret }, redact, serverLogPath, disableBrowserCache: true });
  const baseUrl = runtime.baseUrl;
  browserOpened = true;
  acceptance = await runBrowserTask(
    "drag standard ENA and ONA nodes in 2D and 3D",
    runNodeDragAcceptance,
    {
      entryUrl: `${baseUrl}/en/open-ena`,
      username,
      password,
      fixtureCsv: buildEndpointFixtureCsv(),
      screenshotPath,
    },
    [
      assertBrowser,
      installAuditAndAuthenticate,
      uploadAndBuildStandard,
      readAudit,
      readSvgFamily,
      dragSvgNode,
      assertSvgMove,
      clickVisualCopy,
      resetNodeLayout,
      selectView,
      waitForPlotlyTriptych,
      readPlotlyFamily,
      dragPlotlyNode,
      assertPlotlyMove,
      orbitFromEmptySpace,
      recenterPreservesNode,
      switchToOnaAndBuild,
    ],
  );
} catch (caught) {
  primaryFailure = caught;
} finally {
  try {
    await cleanup();
  } catch (caught) {
    cleanupFailure = caught;
  }
}

if (primaryFailure || cleanupFailure) {
  const serverLog = existsSync(serverLogPath) ? redact(readFileSync(serverLogPath, "utf8")).slice(-12_000) : "";
  if (serverLog) process.stderr.write(`[node-drag smoke] server log tail:\n${serverLog}\n`);
  if (cleanupFailure) process.stderr.write(`[node-drag smoke] cleanup failed: ${redact(cleanupFailure)}\n`);
  throw primaryFailure ?? cleanupFailure;
}

assert.ok(acceptance);
assert.deepEqual(Object.keys(acceptance.families), ["standard-2d", "standard-3d", "ona-2d", "ona-3d"]);
assert.equal(acceptance.finalAudit.analysisRunCount, 2);
assert.equal(existsSync(screenshotPath), true);
const summary = {
  status: "PASS",
  renderFamilies: Object.keys(acceptance.families),
  analyticalRuns: acceptance.finalAudit.analysisRunCount,
  canonicalResultPreserved: true,
  triptychSynchronization: true,
  incidentGeometryFollowed: true,
  emptySpaceCameraOrbit: true,
  recenterPreservedMovedNodes: true,
  resetRestoredCanonicalLayout: true,
  visualCopy: acceptance.finalAudit.visualCopy,
  screenshot: basename(screenshotPath),
  currentUrl: acceptance.currentUrl,
};
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary)}\n`);
