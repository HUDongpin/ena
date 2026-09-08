#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServedBrowserV3 } from "./helpers/open-ena-served-browser-v3.mjs";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = resolve(
  process.env.OPEN_ENA_A11Y_PERF_SMOKE_ARTIFACT_DIR
    ?? join(projectRoot, "output", "playwright", "open-ena-a11y-perf-smoke"),
);
const summaryPath = join(artifactDirectory, "summary.json");
const distName = ".next";
const distDirectory = join(projectRoot, distName);
const username = "open_ena_a11y_perf_smoke_researcher";
const password = "open_ena_a11y_perf_smoke_password_2026";
const sessionSecret = "open_ena_a11y_perf_smoke_session_secret_0123456789abcdef";
const accountId = "open-ena-a11y-perf-smoke-account";
const budgets = Object.freeze({
  transferBytesLt: 800000,
  decodedBytesLt: 2200000,
  largestLongTaskMsLt: 1500,
  allThreeReadyMsLt: 5000,
});

function redact(value) {
  return String(value ?? "")
    .replaceAll(username, "[redacted-username]")
    .replaceAll(password, "[redacted-password]")
    .replaceAll(sessionSecret, "[redacted-session-secret]")
    .replaceAll(accountId, "[redacted-account-id]");
}

function findPlotlyChunkNames() {
  const chunksDirectory = join(distDirectory, "static", "chunks");
  const candidates = readdirSync(chunksDirectory)
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({
      name,
      path: join(chunksDirectory, name),
    }))
    .filter(({ path }) => {
      const source = readFileSync(path, "utf8");
      return source.includes("scatter3d") && source.includes("isosurface") && source.includes("streamtube");
    })
    .sort((left, right) => statSync(right.path).size - statSync(left.path).size);
  if (candidates.length === 0) throw new Error("The production build has no identifiable Plotly GL3D chunk.");
  return candidates.map(({ name }) => name);
}

async function loginAndLoad(page, baseUrl) {
  const authenticationCache = await page.context().newCDPSession(page);
  await authenticationCache.send("Network.enable");
  await authenticationCache.send("Network.setCacheDisabled", { cacheDisabled: true });
  const policy = { ...page.__task38Phase, policy: "authentication-disabled-then-measurement-browser-default", disabledAt: new Date().toISOString() };
  (runtime.receipt.browser.contextCachePolicies ??= []).push(policy);
  let authenticationDetached = false;
  runtime.lifecycle.addCleanup(`authentication cache session ${policy.phase} ${policy.repetition}`, async () => { if (!authenticationDetached) { await authenticationCache.detach(); authenticationDetached = true; } });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__task38WorkerResponses = [];
    window.__task38WorkerRequests = [];
    window.__task38ReadinessSamples = [];
    // Read-only simultaneous readiness: never manufactures Ready or result data.
    window.__task38ReadyPlots = () => {
      const roots = [...document.querySelectorAll('[data-ena-plot-role][data-ena-plot-status]')];
      const states = roots.map(plot => ({ role: plot.getAttribute("data-ena-plot-role"), status: plot.getAttribute("data-ena-plot-status"), ready: plot.getAttribute("data-ena-plot-ready"), busy: (plot.querySelector('[data-ena-interactive-camera="true"]') ?? plot).getAttribute("aria-busy") }));
      window.__task38ReadinessSamples.push({ at: performance.now(), states });
      if (window.__task38ReadinessSamples.length > 40) window.__task38ReadinessSamples.shift();
      if (states.some(state => state.status === "error")) throw new Error("A 3D role reported an explicit render error");
      if (roots.length > 3) throw new Error("Unexpected extra 3D plot roles");
      if (roots.length !== 3 || new Set(states.map(state => state.role)).size !== 3 || !["comparison", "primary", "secondary"].every(role => states.some(state => state.role === role))) return null;
      if (!states.every(state => state.status === "ready" && state.ready === "true" && state.busy === "false")) return null;
      if (document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") !== "current") return null;
      return roots;
    };
    window.Worker = class extends NativeWorker {
      postMessage(message, ...args) { if (message?.kind === "run-open-ena-plan-v3") window.__task38WorkerRequests.push(structuredClone(message)); return super.postMessage(message, ...args); }
      constructor(...args) { super(...args); this.addEventListener("message", event => {
        if (event.data?.kind === "result-v3") window.__task38WorkerResponses.push(structuredClone(event.data));
      }); }
    };
  });
  await page.goto(`${baseUrl}/en/open-ena`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Account name" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sign in" }).click();
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await runtime.drainAssetReads(`authenticated ${policy.phase} ${policy.repetition} assets before measurement policy`);
  await authenticationCache.send("Network.setCacheDisabled", { cacheDisabled: false });
  policy.restoredAt = new Date().toISOString(); policy.measurementCacheDisabled = false;
  policy.beforeSample = await page.evaluate(expectedNames => {
    const loadedPlotly = performance.getEntriesByType("resource").filter(entry => expectedNames.includes(new URL(entry.name).pathname.split("/").at(-1)));
    performance.mark("task38-cache-default-before-sample");
    return { mark: performance.now(), loadedPlotlyScripts: loadedPlotly.map(entry => new URL(entry.name).pathname) };
  }, page.__task38PlotlyChunkNames);
  assert.deepEqual(policy.beforeSample.loadedPlotlyScripts, [], "authentication must not warm the measured Plotly chunk");
  await authenticationCache.detach(); authenticationDetached = true;
  assert.equal(new URL(page.url()).pathname, "/en/open-ena");
  await rail.getByRole("button", { name: "Data", exact: true }).click();
  const controls = page.locator('[data-ena-workbench-region="controls"]');
  const sample = page.getByTestId("open-ena-persistent-analysis-panel").getByRole("button", { name: "Load sample", exact: true });
  await sample.waitFor({ state: "visible", timeout: 30_000 });
  policy.sampleClick = await page.evaluate(() => performance.now());
  assert.ok(policy.sampleClick >= policy.beforeSample.mark);
  await sample.click();
  const download = page.getByRole("button", { name: "Download Model", exact: true });
  await download.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction((button) => button && !button.disabled, await download.elementHandle(), { timeout: 60_000 });
  return rail;
}

async function waitForPlotTerminal(page, plot, role) {
  assert.equal(await plot.count(), 1, `${role} must have one unambiguous interactive region`);
  await plot.waitFor({ state: "visible", timeout: 60_000 });
  const plotHandle = await plot.elementHandle();
  await page.waitForFunction(
    (element) => ["ready", "error"].includes(element?.getAttribute("data-ena-plot-status")),
    plotHandle,
    { timeout: 60_000 },
  );
  assert.equal(await plot.getAttribute("data-ena-plot-status"), "ready", `${role} 3D plot failed to initialize`);
  await plot.locator('[data-ena-plotly-root="true"]').waitFor({ state: "visible", timeout: 60_000 });
}

async function waitForThreePlots(page) {
  for (const role of ["comparison", "primary", "secondary"]) {
    const plot = page.locator(`[data-ena-plot-role="${role}"][data-ena-plot-status]`);
    await waitForPlotTerminal(page, plot, role);
  }
  const ready = await page.waitForFunction(() => Boolean(window.__task38ReadyPlots()), null, { timeout: 60000 });
  await ready.dispose();
}

async function readScientificIdentity(page) {
  const snapshot = await page.waitForFunction(() => {
    const roots = window.__task38ReadyPlots();
    if (!roots) return null;
    const payload = roots.map((plot) => {
      const root = plot.querySelector('[data-ena-plotly-root="true"]');
      if (!root || !Array.isArray(root.data) || root.data.length === 0) throw new Error("plot data is unavailable");
      return {
        role: plot.getAttribute("data-ena-plot-role"),
        traces: root.data.map((trace) => ({ name: trace.name, x: trace.x, y: trace.y, z: trace.z, meta: trace.meta })),
        ranges: ["x", "y", "z"].map((axis) => (
          (plot.querySelector('[data-ena-interactive-camera="true"]') ?? plot)
            .getAttribute(`data-ena-${axis}-range`)
        )),
      };
    });
    // Capture immutable bytes in this synchronous readiness turn. Hash only after polling succeeds.
    return {
      serialized: JSON.stringify(payload),
      roles: payload.map((plot) => plot.role),
      traceCounts: payload.map((plot) => plot.traces.length),
    };
  }, null, { timeout: 60000 });
  try {
    const { serialized, roles, traceCounts } = await snapshot.jsonValue();
    return { resultIdentity: createHash("sha256").update(serialized, "utf8").digest("hex"), roles, traceCounts };
  }
  finally { await snapshot.dispose(); }
}

async function captureSliderScreen(page, screen, names) {
  const controls = page.locator('[data-ena-workbench-region="controls"]');
  const sliders = names.map((name) => controls.getByRole("slider", { name, exact: true }));
  for (const slider of sliders) await slider.waitFor({ state: "visible", timeout: 30_000 });
  const values = [];
  for (const slider of sliders) {
    const value = await slider.evaluate((element) => {
      const label = element.labels?.[0];
      if (!label) throw new Error("slider has no associated visible label");
      const output = element.closest(".ena-range-field")?.querySelector(`output[for="${CSS.escape(element.id)}"]`);
      return {
        id: element.id,
        accessibleName: label.textContent?.replace(/\s+/gu, " ").trim() ?? "",
        labelText: label.textContent?.replace(/\s+/gu, " ").trim() ?? "",
        valueText: element.getAttribute("aria-valuetext") ?? "",
        value: element.value,
        outputText: output?.textContent?.replace(/\s+/gu, " ").trim() ?? null,
      };
    });
    assert.ok(value.accessibleName && value.labelText && value.valueText, `${screen} slider is not fully labelled`);
    values.push(value);
  }
  assert.equal(new Set(values.map((value) => value.id)).size, names.length, `${screen} slider ids are not unique`);
  return { screen, sliders: values };
}

async function readCodeColorTrigger(trigger, attribute) {
  return trigger.evaluate((element, key) => {
    if (element.hasAttribute(key)) return element.getAttribute(key);
    if (key === "data-ena-code-color-trigger") return element.ariaLabel?.replace(/^Choose color for /, "");
    if (key === "data-ena-code-color-primary") {
      const rgb = getComputedStyle(element.querySelector("span")).backgroundColor.match(/\d+/g);
      return rgb ? "#" + rgb.slice(0, 3).map(x => Number(x).toString(16).padStart(2, "0")).join("") : null;
    }
    return null;
  }, attribute);
}

async function auditCodeColorPresets(page, codes) {
  const desktopViewport = page.viewportSize();
  assert.deepEqual(desktopViewport, { width: 1440, height: 900 }, "color-preset audit requires the explicit desktop viewport");

  const triggers = codes.getByRole("button", { name: /^Choose color for / });
  const triggerCount = await triggers.count();
  assert.ok(triggerCount >= 2, "Codes must expose a distinct alternate Choose color for control");
  const trigger = triggers.first();
  const code = await readCodeColorTrigger(trigger, "data-ena-code-color-trigger");
  const originalPrimary = await readCodeColorTrigger(trigger, "data-ena-code-color-primary");
  assert.ok(code, "the first code-color trigger has no code identity");
  assert.match(originalPrimary ?? "", /^#[0-9a-f]{6}$/u, "the first code-color trigger has no valid primary color");

  const renderedCode = await page.evaluate(source => {
    const response = window.__task38WorkerResponses.at(-1);
    const request = window.__task38WorkerRequests.find(entry => entry.id === response?.id);
    const result = response?.result;
    if (!request || response.executionPlanSha256 !== request.plan.header.executionPlanSha256 || response.executionPlanSha256 !== result.binding.executionPlanSha256) throw new Error("native color mapping lacks current request/result binding");
    const labels = result.executionProvenance.labels.codes;
    if (new Set(labels.map(entry => entry.column)).size !== labels.length || new Set(labels.map(entry => entry.sourceColumn)).size !== labels.length) throw new Error("native Code mapping must be bijective");
    const matches = labels.filter(entry => entry.sourceColumn === source);
    if (matches.length !== 1) throw new Error("actual native result has no unique typed Code mapping");
    return matches[0].column;
  }, code);
  const readNodeColors = async () => await page.locator("[data-ena-code]").evaluateAll((nodes, expectedCode) => (
    nodes
      .filter((node) => node.getAttribute("data-ena-code") === expectedCode)
      .map((node) => ({
        fill: node.getAttribute("fill"),
        computedFill: getComputedStyle(node).fill,
      }))
  ), renderedCode);
  const originalNodeColors = await readNodeColors();
  assert.ok(originalNodeColors.length > 0, `no rendered code node was found for ${code}`);

  const dialogName = `Code color for ${code}`;
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  const preset1Name = "Preset 1: Primary #cc423a, Complementary #56bd7c";
  const preset2Name = "Preset 2: Primary #218ebf, Complementary #ef691b";
  const committedPrimary = "#218ebf";
  const committedComplementary = "#ef691b";
  const repairMessage = "Enter a six-digit hexadecimal color such as #cc423a.";
  let desktopGeometry = null;
  let mobileGeometry = null;
  let workerPosts = null;
  let alternateTriggerBlocked = false;
  const continuity = {};
  const fallback = {
    forced: false,
    modal: null,
    position: null,
    viewportCovered: false,
    forwardWrap: false,
    reverseWrap: false,
    escape: {
      draftPrimary: null,
      draftComplementary: null,
      primaryRollback: false,
      complementaryRollback: null,
      nodesRollback: false,
      bodyOverflowRestored: false,
      focusReturned: false,
    },
    backdrop: {
      draftPrimary: null,
      draftComplementary: null,
      primaryRollback: false,
      complementaryRollback: null,
      nodesRollback: false,
      bodyOverflowRestored: false,
      focusReturned: false,
    },
    commit: {
      primary: null,
      complementary: null,
      nodesUpdated: false,
      bodyOverflowRestored: false,
      focusReturned: false,
    },
    restore: {
      primary: null,
      complementary: null,
      nodesRestored: false,
      bodyOverflowRestored: false,
      focusReturned: false,
      workerPosts: null,
      showModal: false,
    },
  };

  const assertSingleDialog = async () => {
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await page.getByRole("dialog").count(), 1, "exactly one runtime dialog must be mounted");
    assert.equal(await dialog.count(), 1, `${dialogName} must be the only runtime dialog`);
  };
  const openDialog = async () => {
    await trigger.click();
    await assertSingleDialog();
  };
  const waitForDialogClosed = async () => {
    await dialog.waitFor({ state: "detached", timeout: 10_000 });
    assert.equal(await page.getByRole("dialog").count(), 0, "the code-color dialog did not unmount");
  };

  try {
    await page.evaluate(() => {
      if (window.__openEnaCodeColorPresetSmoke) throw new Error("code-color worker audit was already installed");
      const originalPostMessage = Worker.prototype.postMessage;
      window.__openEnaCodeColorPresetSmoke = { originalPostMessage, workerPosts: 0 };
      Worker.prototype.postMessage = function codeColorPresetSmokePostMessage(...args) {
        window.__openEnaCodeColorPresetSmoke.workerPosts += 1;
        return originalPostMessage.apply(this, args);
      };
    });
    await trigger.focus();
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true,
      "the code-color trigger could not receive focus before opening");
    await openDialog();
    assert.equal(await dialog.getAttribute("aria-modal"), "true");

    const presets = dialog.locator("[data-ena-code-color-preset]");
    assert.equal(await presets.count(), 6, "the dialog must expose six paired Color Presets");
    const sheet = dialog.locator(".ena-code-color-sheet");
    const preset1Circles = presets.first().locator("span");
    desktopGeometry = await page.evaluate(([sheetElement, firstCircle, secondCircle]) => {
      const rectangle = (element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        sheet: rectangle(sheetElement),
        preset1Circles: [rectangle(firstCircle), rectangle(secondCircle)],
      };
    }, [await sheet.elementHandle(), await preset1Circles.nth(0).elementHandle(), await preset1Circles.nth(1).elementHandle()]);
    assert.ok(desktopGeometry.sheet.width >= 347 && desktopGeometry.sheet.width <= 349,
      `desktop color sheet width was ${desktopGeometry.sheet.width}px`);
    assert.deepEqual(
      desktopGeometry.preset1Circles.map(({ width, height }) => ({ width, height })),
      [{ width: 40, height: 40 }, { width: 34, height: 34 }],
      "Preset 1 circles lost their exact 40px/34px geometry",
    );

    const alternate = triggers.nth(1);
    const alternateCode = await readCodeColorTrigger(alternate, "data-ena-code-color-trigger");
    assert.ok(alternateCode && alternateCode !== code, "the alternate trigger must identify a distinct code");
    await alternate.click({ timeout: 500 }).catch(() => {});
    assert.equal(await page.getByRole("dialog", { name: dialogName, exact: true }).count(), 1,
      "an attempted second code trigger replaced the original exact dialog");
    assert.equal(await page.getByRole("dialog", { name: `Code color for ${alternateCode}`, exact: true }).count(), 0,
      "the native modal switched to another code target");
    assert.equal(await readCodeColorTrigger(trigger, "data-ena-code-color-trigger"), code,
      "the original trigger changed its code identity while its dialog was open");
    assert.equal(await dialog.isVisible(), true,
      "the original trigger stopped owning the open dialog");
    alternateTriggerBlocked = true;

    await dialog.getByRole("button", { name: preset2Name, exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await waitForDialogClosed();
    assert.equal(await readCodeColorTrigger(trigger, "data-ena-code-color-primary"), originalPrimary,
      "Cancel changed the trigger's committed primary color");
    assert.deepEqual(await readNodeColors(), originalNodeColors, "Cancel changed rendered node colors");

    await openDialog();
    await dialog.getByRole("button", { name: preset2Name, exact: true }).click();
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await waitForDialogClosed();
    await page.waitForFunction(([element, expectedColor]) => {
      const rgb = getComputedStyle(element.querySelector("span")).backgroundColor.match(/\d+/g);
      const color = rgb ? "#" + rgb.slice(0, 3).map(x => Number(x).toString(16).padStart(2, "0")).join("") : null;
      return color === expectedColor;
    }, [await trigger.elementHandle(), committedPrimary]);
    assert.equal(await readCodeColorTrigger(trigger, "data-ena-code-color-primary"), committedPrimary);
    const committedNodeColors = await readNodeColors();
    assert.ok(committedNodeColors.length > 0, `the committed color has no rendered ${code} node`);
    assert.ok(committedNodeColors.every(({ fill, computedFill }) => (
      fill?.toLowerCase() === committedPrimary && computedFill === "rgb(33, 142, 191)"
    )), "the committed Preset 2 color did not reach every matching node fill");
    workerPosts = await page.evaluate(() => window.__openEnaCodeColorPresetSmoke.workerPosts);
    assert.equal(workerPosts, 0, "changing a display color posted analytic work to a Worker");

    await openDialog();
    const primaryHex = dialog.locator('[data-ena-code-color-hex="primary"]');
    const complementaryHex = dialog.locator('[data-ena-code-color-hex="complementary"]');
    const plane = dialog.locator('[data-ena-code-color-plane="true"]');
    const hue = dialog.locator('[data-ena-code-color-hue="true"]');
    const saturationAxis = dialog.locator('[data-ena-code-color-axis="saturation"]');
    const brightnessAxis = dialog.locator('[data-ena-code-color-axis="brightness"]');
    const planeBox = await plane.boundingBox();
    assert.ok(planeBox, "the saturation/brightness plane has no browser geometry");
    await hue.fill("180");
    await page.mouse.click(planeBox.x + planeBox.width * 0.72, planeBox.y + planeBox.height * 0.25);
    await saturationAxis.focus();
    await saturationAxis.press("ArrowLeft");
    await brightnessAxis.focus();
    await brightnessAxis.press("ArrowDown");
    continuity.planeKeyboardHex = await primaryHex.inputValue();
    assert.match(continuity.planeKeyboardHex, /^#[0-9a-f]{6}$/u,
      "hue, plane, and S/V keyboard edits did not retain a strict primary hex color");

    await primaryHex.fill("#0000ff");
    assert.equal(await saturationAxis.getAttribute("aria-valuenow"), "100");
    assert.equal(await brightnessAxis.getAttribute("aria-valuenow"), "100");
    await brightnessAxis.focus();
    await brightnessAxis.press("Home");
    continuity.blackHex = await primaryHex.inputValue();
    continuity.blackSaturation = await saturationAxis.getAttribute("aria-valuenow");
    continuity.blackBrightness = await brightnessAxis.getAttribute("aria-valuenow");
    continuity.blackMarkerLeft = await plane.locator(".ena-code-color-plane-picker").evaluate((marker) => marker.style.left);
    assert.equal(continuity.blackHex, "#000000");
    assert.equal(continuity.blackSaturation, "100", "black discarded the remembered saturation");
    assert.equal(continuity.blackBrightness, "0");
    assert.equal(continuity.blackMarkerLeft, "100%", "the saturation marker left the right edge at black");
    await brightnessAxis.press("ArrowUp");
    await page.waitForFunction((input) => input.value !== "#000000", await primaryHex.elementHandle());
    continuity.blueAfterBlack = await primaryHex.evaluate((input) => {
      const value = input.value;
      return {
        value,
        rgb: [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)),
      };
    });
    assert.match(continuity.blueAfterBlack.value, /^#[0-9a-f]{6}$/u);
    assert.ok(
      continuity.blueAfterBlack.rgb[2] > continuity.blueAfterBlack.rgb[0]
        && continuity.blueAfterBlack.rgb[2] > continuity.blueAfterBlack.rgb[1],
      "ArrowUp from black produced an achromatic color instead of remembered blue",
    );

    await hue.focus();
    await hue.press("End");
    await page.waitForFunction((input) => input.value === "360", await hue.elementHandle());
    continuity.hueEndValue = await hue.inputValue();
    assert.equal(continuity.hueEndValue, "360", "the hue End value wrapped during rerender");

    const primaryBeforeComplementary = await primaryHex.inputValue();
    await dialog.getByRole("button", { name: `Choose color for ${code}: Complementary`, exact: true }).click();
    continuity.primaryAfterComplementaryActivation = await primaryHex.inputValue();
    assert.equal(continuity.primaryAfterComplementaryActivation, primaryBeforeComplementary,
      "activating Complementary changed the Primary draft");
    await complementaryHex.fill("#abcdef");
    continuity.primaryAfterComplementaryEdit = await primaryHex.inputValue();
    assert.equal(continuity.primaryAfterComplementaryEdit, primaryBeforeComplementary,
      "editing Complementary changed the Primary draft");
    await primaryHex.fill("#123");
    const confirm = dialog.getByRole("button", { name: "OK", exact: true });
    assert.equal(await confirm.isDisabled(), true, "OK remained enabled for an invalid Primary hex value");
    await dialog.getByText(repairMessage, { exact: true }).waitFor({ state: "visible" });
    continuity.invalidDescription = await primaryHex.evaluate((input) => (
      (input.getAttribute("aria-describedby") ?? "")
        .split(/\s+/u)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
    ));
    assert.equal(await primaryHex.getAttribute("aria-invalid"), "true");
    assert.ok(continuity.invalidDescription.includes(repairMessage),
      "the invalid Primary input is not accessibly described by its repair message");

    await page.keyboard.press("Escape");
    await waitForDialogClosed();
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true,
      "Escape did not return focus to the original code-color trigger");
    assert.equal(await readCodeColorTrigger(trigger, "data-ena-code-color-primary"), committedPrimary,
      "Escape changed the committed Primary color");
    assert.deepEqual(await readNodeColors(), committedNodeColors,
      "Escape changed the rendered committed node colors");
    continuity.escapeNodeColorsPreserved = true;

    await openDialog();
    continuity.complementaryAfterEscape = await complementaryHex.inputValue();
    assert.equal(continuity.complementaryAfterEscape, committedComplementary,
      "Escape retained the uncommitted Complementary draft");
    assert.notEqual(continuity.complementaryAfterEscape, "#abcdef");
    await dialog.getByRole("button", { name: preset1Name, exact: true }).click();
    continuity.backdropDraftPrimary = await primaryHex.inputValue();
    continuity.backdropDraftComplementary = await complementaryHex.inputValue();
    assert.equal(continuity.backdropDraftPrimary, "#cc423a",
      "the backdrop audit did not create a different valid Primary draft");
    assert.equal(continuity.backdropDraftComplementary, "#56bd7c",
      "the backdrop audit did not create a different valid Complementary draft");
    await page.mouse.click(2, 2);
    await waitForDialogClosed();
    assert.equal(await readCodeColorTrigger(trigger, "data-ena-code-color-primary"), committedPrimary,
      "backdrop dismissal changed the committed Primary color");
    assert.deepEqual(await readNodeColors(), committedNodeColors,
      "backdrop dismissal changed the rendered committed node colors");
    continuity.backdropNodeColorsPreserved = true;

    await page.setViewportSize({ width: 390, height: 844 });
    await openDialog();
    continuity.complementaryAfterBackdrop = await complementaryHex.inputValue();
    assert.equal(continuity.complementaryAfterBackdrop, committedComplementary,
      "backdrop dismissal committed the draft Complementary color");
    assert.notEqual(continuity.complementaryAfterBackdrop, "#56bd7c");
    mobileGeometry = await dialog.locator(".ena-code-color-sheet").evaluate((sheetElement) => {
      const grid = sheetElement.querySelector(".ena-code-color-dialog-grid");
      if (!grid) throw new Error("the mobile code-color grid is unavailable");
      const box = sheetElement.getBoundingClientRect();
      const gridColumns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/u).filter(Boolean);
      return {
        viewport: { width: innerWidth, height: innerHeight },
        sheet: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
        gridColumns,
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        },
      };
    });
    assert.equal(mobileGeometry.gridColumns.length, 1, "mobile Color Presets did not collapse to one grid column");
    assert.ok(
      mobileGeometry.sheet.left >= 0 && mobileGeometry.sheet.right <= 390
        && mobileGeometry.sheet.top >= 0 && mobileGeometry.sheet.bottom <= 844,
      "mobile Color Presets sheet escaped the viewport",
    );
    assert.equal(mobileGeometry.document.noHorizontalOverflow, true, "mobile Color Presets caused document overflow");
    await page.keyboard.press("Escape");
    await waitForDialogClosed();
    workerPosts = await page.evaluate(() => window.__openEnaCodeColorPresetSmoke.workerPosts);
    assert.equal(workerPosts, 0, "the complete color transaction posted analytic work to a Worker");
    assert.equal(alternateTriggerBlocked, true,
      "the alternate trigger was not proven blocked by the original modal target");

    await page.setViewportSize(desktopViewport);
    const bodyOverflowBeforeFallback = await page.evaluate(() => document.body.style.overflow);
    try {
      await page.evaluate(() => {
        const audit = window.__openEnaCodeColorPresetSmoke;
        if (!audit) throw new Error("the code-color audit state is unavailable");
        audit.originalShowModal = HTMLDialogElement.prototype.showModal;
        HTMLDialogElement.prototype.showModal = function forceOpenEnaCodeColorFallback() {
          throw new Error("forced code-color dialog fallback");
        };
      });

      await openDialog();
      assert.equal(await dialog.getAttribute("data-ena-dialog-fallback"), "true");
      assert.equal(await dialog.evaluate((element) => element.open), true);
      assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
      fallback.forced = true;
      fallback.modal = await dialog.getAttribute("aria-modal");
      assert.equal(fallback.modal, "true", "forced fallback dialog lost aria-modal=true");
      const fallbackViewport = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          position: getComputedStyle(element).position,
          viewportCovered: Math.abs(rect.left) <= 1
            && Math.abs(rect.top) <= 1
            && Math.abs(rect.width - innerWidth) <= 1
            && Math.abs(rect.height - innerHeight) <= 1
            && Math.abs(rect.right - innerWidth) <= 1
            && Math.abs(rect.bottom - innerHeight) <= 1,
        };
      });
      fallback.position = fallbackViewport.position;
      fallback.viewportCovered = fallbackViewport.viewportCovered;
      assert.equal(fallback.position, "fixed", "forced fallback dialog is not fixed to the viewport");
      assert.equal(fallback.viewportCovered, true, "forced fallback dialog does not cover the viewport");

      const fallbackConfirm = dialog.getByRole("button", { name: "OK", exact: true });
      assert.equal(await fallbackConfirm.isDisabled(), false, "fallback OK must be enabled for a valid committed pair");
      const fallbackFocusable = dialog.locator([
        "button:not([disabled])",
        "input:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(","));
      assert.ok(await fallbackFocusable.count() >= 4, "fallback dialog has too few enabled focus targets");
      const firstFallbackFocusable = fallbackFocusable.first();
      const lastFallbackFocusable = fallbackFocusable.last();

      await lastFallbackFocusable.focus();
      assert.equal(await lastFallbackFocusable.evaluate((last) => document.activeElement === last), true);
      await lastFallbackFocusable.press("Tab");
      fallback.forwardWrap = await firstFallbackFocusable.evaluate((first) => document.activeElement === first);
      assert.equal(fallback.forwardWrap, true, "fallback Tab did not wrap last focusable to first");

      await firstFallbackFocusable.focus();
      assert.equal(await firstFallbackFocusable.evaluate((first) => document.activeElement === first), true);
      await firstFallbackFocusable.press("Shift+Tab");
      fallback.reverseWrap = await lastFallbackFocusable.evaluate((last) => document.activeElement === last);
      assert.equal(fallback.reverseWrap, true, "fallback Shift+Tab did not wrap first focusable to last");

      await dialog.getByRole("button", { name: preset1Name, exact: true }).click();
      fallback.escape.draftPrimary = await primaryHex.inputValue();
      fallback.escape.draftComplementary = await complementaryHex.inputValue();
      assert.deepEqual(
        [fallback.escape.draftPrimary, fallback.escape.draftComplementary],
        ["#cc423a", "#56bd7c"],
        "fallback Escape audit did not create a changed valid draft",
      );
      await page.keyboard.press("Escape");
      await waitForDialogClosed();
      fallback.escape.primaryRollback = await readCodeColorTrigger(trigger, "data-ena-code-color-primary") === committedPrimary;
      assert.equal(fallback.escape.primaryRollback, true, "fallback Escape committed the Primary draft");
      assert.deepEqual(await readNodeColors(), committedNodeColors,
        "fallback Escape changed rendered committed node colors");
      fallback.escape.nodesRollback = true;
      fallback.escape.bodyOverflowRestored = await page.evaluate((expected) => document.body.style.overflow === expected, bodyOverflowBeforeFallback);
      fallback.escape.focusReturned = await trigger.evaluate((element) => document.activeElement === element);
      assert.equal(fallback.escape.bodyOverflowRestored, true, "fallback Escape did not restore body overflow");
      assert.equal(fallback.escape.focusReturned, true, "fallback Escape did not return focus to the trigger");

      await openDialog();
      assert.equal(await dialog.getAttribute("data-ena-dialog-fallback"), "true");
      fallback.escape.complementaryRollback = await complementaryHex.inputValue();
      assert.equal(fallback.escape.complementaryRollback, committedComplementary,
        "fallback Escape committed the Complementary draft");
      await dialog.getByRole("button", { name: preset1Name, exact: true }).click();
      fallback.backdrop.draftPrimary = await primaryHex.inputValue();
      fallback.backdrop.draftComplementary = await complementaryHex.inputValue();
      assert.deepEqual(
        [fallback.backdrop.draftPrimary, fallback.backdrop.draftComplementary],
        ["#cc423a", "#56bd7c"],
        "fallback backdrop audit did not create a changed valid draft",
      );
      await page.mouse.click(2, 2);
      await waitForDialogClosed();
      fallback.backdrop.primaryRollback = await readCodeColorTrigger(trigger, "data-ena-code-color-primary") === committedPrimary;
      assert.equal(fallback.backdrop.primaryRollback, true, "fallback backdrop committed the Primary draft");
      assert.deepEqual(await readNodeColors(), committedNodeColors,
        "fallback backdrop changed rendered committed node colors");
      fallback.backdrop.nodesRollback = true;
      fallback.backdrop.bodyOverflowRestored = await page.evaluate((expected) => document.body.style.overflow === expected, bodyOverflowBeforeFallback);
      fallback.backdrop.focusReturned = await trigger.evaluate((element) => document.activeElement === element);
      assert.equal(fallback.backdrop.bodyOverflowRestored, true, "fallback backdrop did not restore body overflow");
      assert.equal(fallback.backdrop.focusReturned, true, "fallback backdrop did not return focus to the trigger");

      await openDialog();
      fallback.backdrop.complementaryRollback = await complementaryHex.inputValue();
      assert.equal(fallback.backdrop.complementaryRollback, committedComplementary,
        "fallback backdrop committed the Complementary draft");
      await dialog.getByRole("button", { name: preset1Name, exact: true }).click();
      await fallbackConfirm.click();
      await waitForDialogClosed();
      fallback.commit.primary = await readCodeColorTrigger(trigger, "data-ena-code-color-primary");
      assert.equal(fallback.commit.primary, "#cc423a", "fallback OK did not commit Preset 1 Primary");
      const fallbackPreset1NodeColors = await readNodeColors();
      assert.ok(fallbackPreset1NodeColors.length > 0 && fallbackPreset1NodeColors.every(({ fill, computedFill }) => (
        fill?.toLowerCase() === "#cc423a" && computedFill === "rgb(204, 66, 58)"
      )), "fallback OK did not update every matching node to Preset 1");
      fallback.commit.nodesUpdated = true;
      fallback.commit.bodyOverflowRestored = await page.evaluate((expected) => document.body.style.overflow === expected, bodyOverflowBeforeFallback);
      fallback.commit.focusReturned = await trigger.evaluate((element) => document.activeElement === element);
      assert.equal(fallback.commit.bodyOverflowRestored, true, "fallback OK did not restore body overflow");
      assert.equal(fallback.commit.focusReturned, true, "fallback OK did not return focus to the trigger");

      await openDialog();
      fallback.commit.complementary = await complementaryHex.inputValue();
      assert.equal(fallback.commit.complementary, "#56bd7c", "fallback OK did not persist Preset 1 Complementary");
      await dialog.getByRole("button", { name: preset2Name, exact: true }).click();
      await fallbackConfirm.click();
      await waitForDialogClosed();
      fallback.restore.primary = await readCodeColorTrigger(trigger, "data-ena-code-color-primary");
      assert.equal(fallback.restore.primary, committedPrimary, "fallback restore did not recommit Preset 2 Primary");
      assert.deepEqual(await readNodeColors(), committedNodeColors,
        "fallback restore did not restore every matching node to Preset 2");
      fallback.restore.nodesRestored = true;

      await openDialog();
      fallback.restore.complementary = await complementaryHex.inputValue();
      assert.equal(fallback.restore.complementary, committedComplementary,
        "fallback restore did not persist Preset 2 Complementary");
      await page.keyboard.press("Escape");
      await waitForDialogClosed();
      fallback.restore.bodyOverflowRestored = await page.evaluate((expected) => document.body.style.overflow === expected, bodyOverflowBeforeFallback);
      fallback.restore.focusReturned = await trigger.evaluate((element) => document.activeElement === element);
      fallback.restore.workerPosts = await page.evaluate(() => window.__openEnaCodeColorPresetSmoke.workerPosts);
      assert.equal(fallback.restore.bodyOverflowRestored, true, "fallback restore left body scrolling locked");
      assert.equal(fallback.restore.focusReturned, true, "fallback restore did not return focus to the trigger");
      assert.equal(fallback.restore.workerPosts, 0, "fallback transactions posted analytic work to a Worker");
    } finally {
      fallback.restore.showModal = await page.evaluate(() => {
        const audit = window.__openEnaCodeColorPresetSmoke;
        if (!audit?.originalShowModal) return false;
        HTMLDialogElement.prototype.showModal = audit.originalShowModal;
        const restored = HTMLDialogElement.prototype.showModal === audit.originalShowModal;
        delete audit.originalShowModal;
        return restored;
      });
    }
    assert.equal(fallback.restore.showModal, true, "fallback audit did not restore HTMLDialogElement.showModal");

    return {
      code,
      triggerCount,
      original: { primary: originalPrimary, nodeColors: originalNodeColors },
      committed: { primary: committedPrimary, nodeColors: committedNodeColors },
      desktopGeometry,
      mobileGeometry,
      workerPosts,
      alternateTriggerBlocked,
      continuity,
      fallback,
    };
  } finally {
    try {
      await page.evaluate(() => {
        const audit = window.__openEnaCodeColorPresetSmoke;
        if (audit?.originalShowModal) HTMLDialogElement.prototype.showModal = audit.originalShowModal;
        if (audit?.originalPostMessage) Worker.prototype.postMessage = audit.originalPostMessage;
        delete window.__openEnaCodeColorPresetSmoke;
      });
    } finally {
      try {
        if (await page.getByRole("dialog").count()) {
          await page.keyboard.press("Escape").catch(() => {});
          await page.getByRole("dialog").waitFor({ state: "detached", timeout: 2_000 }).catch(() => {});
        }
      } finally {
        await page.setViewportSize(desktopViewport);
      }
    }
  }
}

async function auditOfficialModelTabs(page, rail) {
  await rail.getByRole("button", { name: "Model", exact: true }).click();
  const tablist = page.getByRole("tablist", { name: "Model configuration" });
  await tablist.waitFor({ state: "visible", timeout: 30_000 });
  const tabNames = ["Units", "Horizons", "Windows", "Codes"];
  const headingBottomBorderWidthPx = await tablist.evaluate((element) => {
    const heading = element.parentElement.querySelector("h2");
    return heading ? Number.parseFloat(getComputedStyle(heading).borderBottomWidth) : 0;
  });
  const tabMetrics = await tablist.getByRole("tab").evaluateAll((tabs) => tabs.map((tab) => ({
    name: tab.textContent?.trim().match(/^(Units|Horizons|Windows|Codes)/u)?.[0] ?? "",
    tabHeightPx: tab.getBoundingClientRect().height,
    topInsetPx: tab.getBoundingClientRect().top - tab.parentElement.getBoundingClientRect().top,
    textColor: getComputedStyle(tab).color,
    activeRuleColor: getComputedStyle(tab, "::before").backgroundColor,
    selected: tab.getAttribute("aria-selected") === "true",
  })));
  assert.deepEqual(tabMetrics.map((tab) => tab.name), tabNames);
  assert.ok(tabMetrics.every((tab) => tab.tabHeightPx >= 33 && tab.tabHeightPx <= 36),
    "official Model tabs do not retain the 34px cadence");
  assert.ok(tabMetrics.every((tab) => Math.abs(tab.topInsetPx) < 0.1),
    "official Model tabs retain a gray inset above their active indicator");
  assert.equal(headingBottomBorderWidthPx, 0,
    "the Model heading retains a gray separator above the active indicator");
  assert.equal(tabMetrics.find((tab) => tab.selected)?.activeRuleColor, "rgb(137, 207, 240)");

  const openPanel = async (name, panelName) => {
    await tablist.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) }).click();
    const panel = page.getByTestId(`open-ena-model-v3-${panelName}-panel`);
    await panel.waitFor({ state: "visible", timeout: 30_000 });
    return panel;
  };
  const panelGeometry = async (panel) => await panel.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    overflowContained: element.scrollWidth <= element.clientWidth + 1,
  }));

  const units = await openPanel("Units", "units");
  const unitEditor = units.locator('[data-ena-official-field-path="true"]').first();
  const unitPath = unitEditor.locator(".ena-official-field-path");
  const unitAdd = unitEditor.locator(".ena-official-field-path-add");
  const unitGeometry = await unitEditor.evaluate((editor) => {
    const path = editor.querySelector(".ena-official-field-path");
    const add = editor.querySelector(".ena-official-field-path-add");
    const segments = editor.querySelector(".ena-official-field-path-segments");
    if (!path || !add || !segments) throw new Error("official unit field path is incomplete");
    const pathRect = path.getBoundingClientRect();
    const addRect = add.getBoundingClientRect();
    const segmentsRect = segments.getBoundingClientRect();
    return {
      fieldPathHeightPx: pathRect.height,
      addButtonWidthPx: addRect.width,
      addButtonHeightPx: addRect.height,
      addButtonBackground: getComputedStyle(add).backgroundColor,
      unpaintedBeforeAddPx: addRect.left - segmentsRect.right,
      unpaintedAfterAddPx: pathRect.right - addRect.right,
    };
  });
  assert.ok(unitGeometry.fieldPathHeightPx >= 29 && unitGeometry.fieldPathHeightPx <= 31);
  assert.ok(unitGeometry.addButtonWidthPx >= 39 && unitGeometry.addButtonWidthPx <= 41);
  assert.ok(unitGeometry.addButtonHeightPx >= 29 && unitGeometry.addButtonHeightPx <= 31);
  assert.equal(unitGeometry.addButtonBackground, "rgb(137, 207, 240)");
  assert.equal(unitGeometry.unpaintedBeforeAddPx, 0);
  assert.equal(unitGeometry.unpaintedAfterAddPx, 0);
  await unitPath.waitFor({ state: "visible" });

  const removeField = unitEditor.locator(".ena-official-field-remove").last();
  const removeLabel = await removeField.evaluate((button) => button.ariaLabel);
  const removeMatch = removeLabel?.match(/^Remove (.+) from (.+)$/u);
  assert.ok(removeMatch, "Remove .* from .* identity control is unavailable");
  const removedField = removeMatch[1];
  await removeField.click();
  await unitAdd.click();
  const removedFieldCheckbox = unitEditor.getByRole("checkbox", { name: removedField, exact: true });
  assert.equal(await removedFieldCheckbox.isChecked(), false);
  await removedFieldCheckbox.check();
  assert.equal(await removedFieldCheckbox.isChecked(), true);
  await unitAdd.click();

  const createSample = units.getByRole("combobox", { name: "Create Sample / Group", exact: true });
  const initialGroup = await createSample.inputValue();
  const alternateGroup = await createSample.locator("option").evaluateAll((options, current) => (
    options.map((option) => option.value).find((value) => value && value !== current) ?? null
  ), initialGroup);
  assert.ok(alternateGroup, "Create Sample has no reversible Comparison group choice");
  await createSample.selectOption(alternateGroup);
  assert.equal(await createSample.inputValue(), alternateGroup);
  await createSample.selectOption(initialGroup);
  assert.equal(await createSample.inputValue(), initialGroup);
  const unitsGeometry = await panelGeometry(units);

  const horizons = await openPanel("Horizons", "horizons");
  assert.equal(await horizons.getByRole("switch", { name: "Horizon method", exact: true }).count(), 0);
  assert.equal(await horizons.getByText("Transmodal", { exact: true }).count(), 0);
  await horizons.getByRole("region", { name: "Horizon identity", exact: true }).waitFor();
  const horizonsGeometry = await panelGeometry(horizons);

  const windows = await openPanel("Windows", "windows");
  assert.equal(await windows.getByRole("switch", { name: "Window horizon method", exact: true }).count(), 0);
  assert.equal(await windows.getByRole("combobox", { name: "Model", exact: true }).inputValue(), "EndPoint");
  assert.equal(await windows.getByRole("combobox", { name: "Window", exact: true }).count(), 1);
  const windowsGeometry = await panelGeometry(windows);

  const codes = await openPanel("Codes", "codes");
  const standard = codes.getByRole("radio", { name: /^Standard ENA/ });
  const ordered = codes.getByRole("radio", { name: /^Ordered Network Analysis/ });
  assert.equal(await standard.isChecked(), true);
  await ordered.check();
  assert.equal(await ordered.isChecked(), true);
  await standard.check();
  assert.equal(await standard.isChecked(), true);
  const manageCodes = codes.getByRole("button", { name: "Manage Codes", exact: true });
  await manageCodes.click();
  assert.ok(await codes.getByRole("checkbox", { name: /^Select .+ as a Code$/ }).count() > 0);
  await codes.getByRole("button", { name: "Close Code manager", exact: true }).click();
  await page.getByRole("button", { name: /^(?:Build ENA model|Rebuild model)$/u }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
  const codeColorPresets = await auditCodeColorPresets(page, codes);
  const codesGeometry = await panelGeometry(codes);

  const panels = {
    units: unitsGeometry,
    horizons: horizonsGeometry,
    windows: windowsGeometry,
    codes: codesGeometry,
  };
  assert.ok(Object.values(panels).every((panel) => panel.overflowContained),
    "an official Model panel expanded the workbench horizontally");
  return {
    headingBottomBorderWidthPx,
    tabMetrics,
    unitGeometry,
    removedField,
    initialGroup,
    alternateGroup,
    panels,
    codeColorPresets,
  };
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const rectangle = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const intersects = (left, right, top, bottom) => left < right && top < bottom;
    const contained = (child, parent) => child.left >= parent.left - 1 && child.right <= parent.right + 1
      && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
    const textRect = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()].map((rect) => ({
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      }));
      return rects;
    };
    const tablist = document.querySelector('[role="tablist"][aria-label="Model configuration"]');
    if (!tablist) throw new Error("Model configuration tablist is unavailable");
    const tabContainer = rectangle(tablist);
    const tabs = [...tablist.querySelectorAll('[role="tab"]')].map((tab) => ({
      name: tab.textContent?.trim() ?? "", rect: rectangle(tab), text: textRect(tab),
    }));
    const tabOverlaps = tabs.flatMap((left, index) => tabs.slice(index + 1).filter((right) => (
      left.text.some((leftText) => right.text.some((rightText) => intersects(
        Math.max(leftText.left, rightText.left), Math.min(leftText.right, rightText.right),
        Math.max(leftText.top, rightText.top), Math.min(leftText.bottom, rightText.bottom),
      )))
    )).map((right) => [left.name, right.name]));
    const toolbar = document.querySelector(".ena-visual-toolbar");
    if (!toolbar) throw new Error("visual toolbar is unavailable");
    const toolbarContent = ["2D ENA", "3D ENA", "Download Model", "Export SVG", "Export PNG"].map((name) => {
      const button = [...toolbar.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(name));
      if (!button) throw new Error(`${name} button is unavailable`);
      const buttonRect = rectangle(button);
      return {
        name,
        button: buttonRect,
        text: textRect(button),
        contained: textRect(button).every((rect) => contained(rect, buttonRect)),
        noInternalOverflow: button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1,
      };
    });
    const toolbarOverlaps = toolbarContent.flatMap((left, index) => (
      toolbarContent.slice(index + 1).filter((right) => intersects(
        Math.max(left.button.left, right.button.left), Math.min(left.button.right, right.button.right),
        Math.max(left.button.top, right.button.top), Math.min(left.button.bottom, right.button.bottom),
      )).map((right) => [left.name, right.name])
    ));
    const rail = document.querySelector('[data-ena-workbench-region="rail"]');
    if (!rail) throw new Error("analysis rail is unavailable");
    const railRect = rectangle(rail);
    const controls = document.querySelector('[data-ena-workbench-region="controls"]');
    const plotSurface = document.querySelector(".open-ena-3d-group-contrast");
    if (!controls || !plotSurface) throw new Error("workbench regions are unavailable");
    const controlsRect = rectangle(controls);
    const plotSurfaceRect = rectangle(plotSurface);
    const railLabels = [...rail.querySelectorAll(".ena-rail-button")].map((button) => {
      const label = button.querySelector(":scope > span");
      if (!label) throw new Error("rail label span is unavailable");
      label.scrollIntoView({ block: "nearest", inline: "nearest" });
      const labelRect = rectangle(label);
      const buttonRect = rectangle(button);
      const owner = [...document.querySelectorAll("*")].find((candidate) => {
        const style = getComputedStyle(candidate);
        return candidate.contains(label) && /(auto|scroll|overlay)/u.test(`${style.overflow}${style.overflowY}${style.overflowX}`)
          && candidate.scrollHeight > candidate.clientHeight;
      });
      return {
        label: label.textContent?.trim() ?? "",
        containedByButton: contained(labelRect, buttonRect),
        visibleInRail: intersects(
          Math.max(labelRect.left, railRect.left), Math.min(labelRect.right, railRect.right),
          Math.max(labelRect.top, railRect.top), Math.min(labelRect.bottom, railRect.bottom),
        ),
        scrollOwner: owner?.className?.toString() ?? "document",
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      tabContainer,
      tabs,
      tabOverlaps,
      toolbarContent,
      toolbarOverlaps,
      regions: {
        rail: railRect,
        controls: controlsRect,
        toolbar: rectangle(toolbar),
        plotSurface: plotSurfaceRect,
      },
      railLabels,
    };
  });
}

async function auditTrajectoryCodeColorCascade(page, rail) {
  const endpointDownload = page.getByRole("button", { name: "Download Model", exact: true });
  await endpointDownload.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction((button) => button && !button.disabled, await endpointDownload.elementHandle(), { timeout: 30_000 });
  await rail.getByRole("button", { name: "Data", exact: true }).click();
  const loadTrajectorySample = page.getByRole("button", { name: "Load trajectory sample", exact: true });
  await loadTrajectorySample.waitFor({ state: "visible", timeout: 30_000 });
  const beforeTrajectory = await page.evaluate(() => ({ requests: window.__task38WorkerRequests.length, responses: window.__task38WorkerResponses.length, datasetSha256: window.__task38WorkerResponses.at(-1)?.result.binding.datasetSha256, mark: performance.now() }));
  await loadTrajectorySample.click();

  const longitudinalControls = page.getByTestId("open-ena-workspace-v3");
  await longitudinalControls.waitFor({ state: "visible", timeout: 60_000 });
  // The previous Endpoint can still be current while the sample fetch/prepare
  // awaits. Readiness must belong to the newly admitted trajectory response.
  await page.waitForFunction(before => {
    const response = window.__task38WorkerResponses.at(-1);
    const request = window.__task38WorkerRequests.find(value => value.id === response?.id);
    return window.__task38WorkerResponses.length > before.responses
      && window.__task38WorkerRequests.length > before.requests
      && response?.result.configuration.analysis.model.type === "SeparateTrajectory"
      && response.result.binding.datasetSha256 !== before.datasetSha256
      && request?.plan.header.executionPlanSha256 === response.executionPlanSha256
      && response.result.binding.executionPlanSha256 === response.executionPlanSha256
      && document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current";
  }, beforeTrajectory, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__task38WorkerResponses.at(-1)?.result.configuration.analysis.model.type), "SeparateTrajectory");
  const trajectoryTransition = await page.evaluate(before => ({ requestsAdded: window.__task38WorkerRequests.length - before.requests, responsesAdded: window.__task38WorkerResponses.length - before.responses, elapsedMs: performance.now() - before.mark, freshSourceAndBoundPlan: true }), beforeTrajectory);
  assert.equal(trajectoryTransition.requestsAdded, 1); assert.equal(trajectoryTransition.responsesAdded, 1);

  await rail.getByRole("button", { name: "Model", exact: true }).click();
  const tablist = longitudinalControls.getByRole("tablist", { name: "Model configuration" });
  await tablist.waitFor({ state: "visible", timeout: 30_000 });
  await tablist.getByRole("tab", { name: /^Codes(,|$)/ }).click();
  const codes = longitudinalControls.getByTestId("open-ena-model-v3-codes-panel");
  await codes.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await codes.evaluate((element) => element.closest('[data-testid="open-ena-workspace-v3"]') !== null), true,
    "trajectory Model / Codes panel escaped the longitudinal-v3 controls cascade");

  const trigger = codes.getByRole("button", { name: /^Choose color for / }).first();
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  const code = await readCodeColorTrigger(trigger, "data-ena-code-color-trigger");
  const originalPrimary = await readCodeColorTrigger(trigger, "data-ena-code-color-primary");
  assert.ok(code, "trajectory code-color trigger has no code identity");
  assert.match(originalPrimary ?? "", /^#[0-9a-f]{6}$/u);
  assert.equal(await trigger.evaluate((element) => element.closest('[data-testid="open-ena-workspace-v3"]') !== null), true,
    "trajectory code-color trigger escaped the longitudinal-v3 controls cascade");

  const triggerStyle = await trigger.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: box.width,
      height: box.height,
      minHeight: style.minHeight,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      backgroundColor: style.backgroundColor,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
    };
  });
  writeFileSync(join(artifactDirectory, `trajectory-trigger-${screenshotSequence}.json`), JSON.stringify(triggerStyle, null, 2));
  assert.deepEqual({ width: triggerStyle.width, height: triggerStyle.height }, { width: 32, height: 32 });
  assert.equal(triggerStyle.minHeight, "32px");
  // Native Models uses its own 32px bordered button; the shared color sheet
  // must still retain its exact compact geometry inside the trajectory Workspace.
  assert.deepEqual([triggerStyle.borderTopWidth, triggerStyle.borderRightWidth, triggerStyle.borderBottomWidth, triggerStyle.borderLeftWidth], ["2px", "2px", "2px", "2px"]);
  assert.equal(triggerStyle.backgroundColor, "rgb(239, 239, 239)");
  assert.deepEqual([triggerStyle.paddingTop, triggerStyle.paddingRight, triggerStyle.paddingBottom, triggerStyle.paddingLeft], ["0px", "0px", "0px", "0px"]);

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await dialog.evaluate((element) => element.closest('[data-testid="open-ena-workspace-v3"]') !== null), true,
    "trajectory code-color dialog escaped the longitudinal-v3 controls cascade");
  const preset2 = dialog.locator('[data-ena-code-color-preset="2"]');
  await preset2.click();
  assert.equal(await preset2.getAttribute("aria-pressed"), "true");

  const dialogStyle = await dialog.evaluate((root) => {
    const preset = root.querySelector('[data-ena-code-color-preset="2"]');
    const hex = root.querySelector('[data-ena-code-color-hex="primary"]');
    const hue = root.querySelector('[data-ena-code-color-hue="true"]');
    const confirm = root.querySelector(".ena-code-color-confirm");
    const heading = root.querySelector("h3");
    if (!preset || !hex || !hue || !confirm || !heading) throw new Error("trajectory code-color dialog is incomplete");
    const metrics = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: box.width,
        height: box.height,
        minWidth: style.minWidth,
        minHeight: style.minHeight,
        borderTopWidth: style.borderTopWidth,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
        borderRadius: style.borderRadius,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        display: style.display,
        gap: style.gap,
      };
    };
    return {
      preset: metrics(preset),
      hex: metrics(hex),
      hue: metrics(hue),
      confirm: metrics(confirm),
      heading: metrics(heading),
    };
  });

  assert.deepEqual({ width: dialogStyle.preset.width, height: dialogStyle.preset.height }, { width: 75, height: 45 });
  assert.deepEqual(
    [dialogStyle.preset.borderTopWidth, dialogStyle.preset.borderRightWidth, dialogStyle.preset.borderBottomWidth, dialogStyle.preset.borderLeftWidth],
    ["0px", "0px", "0px", "0px"],
  );
  assert.equal(dialogStyle.preset.borderRadius, "35px");
  assert.deepEqual(
    [dialogStyle.preset.paddingTop, dialogStyle.preset.paddingRight, dialogStyle.preset.paddingBottom, dialogStyle.preset.paddingLeft],
    ["0px", "0px", "0px", "0px"],
  );
  assert.equal(dialogStyle.preset.backgroundColor, "rgb(219, 219, 219)");

  assert.equal(dialogStyle.hex.minHeight, "25px");
  assert.equal(dialogStyle.hex.height, 25);
  assert.deepEqual(
    [dialogStyle.hex.paddingTop, dialogStyle.hex.paddingRight, dialogStyle.hex.paddingBottom, dialogStyle.hex.paddingLeft],
    ["3px", "5px", "3px", "5px"],
  );
  assert.equal(dialogStyle.hex.fontSize, "12px");
  assert.equal(dialogStyle.hex.lineHeight, "12px");

  assert.deepEqual({ width: dialogStyle.hue.width, height: dialogStyle.hue.height }, { width: 20, height: 150 });
  assert.deepEqual(
    [dialogStyle.hue.borderTopWidth, dialogStyle.hue.borderRightWidth, dialogStyle.hue.borderBottomWidth, dialogStyle.hue.borderLeftWidth],
    ["0px", "0px", "0px", "0px"],
  );
  assert.deepEqual(
    [dialogStyle.hue.paddingTop, dialogStyle.hue.paddingRight, dialogStyle.hue.paddingBottom, dialogStyle.hue.paddingLeft],
    ["0px", "0px", "0px", "0px"],
  );
  assert.notEqual(dialogStyle.hue.backgroundImage, "none");

  assert.ok(dialogStyle.confirm.width >= 88);
  assert.equal(dialogStyle.confirm.minWidth, "88px");
  assert.equal(dialogStyle.confirm.height, 36);
  assert.deepEqual(
    [dialogStyle.confirm.borderTopWidth, dialogStyle.confirm.borderRightWidth, dialogStyle.confirm.borderBottomWidth, dialogStyle.confirm.borderLeftWidth],
    ["0px", "0px", "0px", "0px"],
  );
  assert.equal(dialogStyle.confirm.borderRadius, "2px");
  assert.equal(dialogStyle.confirm.backgroundColor, "rgb(137, 207, 240)");
  assert.equal(dialogStyle.confirm.fontWeight, "800");
  assert.equal(dialogStyle.heading.display, "block");
  assert.ok(["normal", "0px"].includes(dialogStyle.heading.gap), "trajectory dialog h3 inherited an 8px control gap");

  const primaryHex = dialog.locator('[data-ena-code-color-hex="primary"]');
  await primaryHex.fill("#123");
  const error = dialog.getByText("Enter a six-digit hexadecimal color such as #cc423a.", { exact: true });
  await error.waitFor({ state: "visible" });
  const errorStyle = await error.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, fontSize: style.fontSize, lineHeight: style.lineHeight };
  });
  assert.equal(errorStyle.color, "rgb(163, 38, 38)");
  assert.equal(errorStyle.fontSize, "11px");
  assert.ok(Math.abs(Number.parseFloat(errorStyle.lineHeight) - 14.3) <= 0.2,
    `trajectory dialog error line-height was ${errorStyle.lineHeight}`);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  assert.equal(await readCodeColorTrigger(trigger, "data-ena-code-color-primary"), originalPrimary,
    "trajectory cascade audit committed its invalid draft");

  return {
    code,
    endpointDownloadEnabled: true,
    trajectoryTransition,
    resultCompleted: true,
    longitudinalAncestor: { panel: true, trigger: true, dialog: true },
    trigger: triggerStyle,
    dialog: dialogStyle,
    error: errorStyle,
  };
}

async function auditWindowExtentInputs(page) {
  const window = page.getByRole("combobox", { name: "Window", exact: true });
  const original = await window.inputValue();
  await window.selectOption("MovingStanzaWindow");
  const values = [];
  for (const name of ["Backward context", "Forward context"]) {
    const group = page.getByRole("group", { name, exact: true });
    const input = group.getByRole("textbox", { name: "Rows", exact: true });
    await input.waitFor();
    const value = await input.evaluate(element => ({
      accessibleName: element.labels?.[0]?.textContent?.trim(),
      value: element.value,
      interpretation: (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent?.trim()).join(" "),
      invalid: element.getAttribute("aria-invalid"),
    }));
    assert.equal(value.accessibleName, "Rows");
    assert.ok(value.interpretation, `${name} needs an accessible context interpretation`);
    assert.equal(value.invalid, "false");
    values.push({ group: name, ...value });
  }
  await window.selectOption(original);
  await page.getByRole("button", { name: /^(?:Build ENA model|Rebuild model)$/u }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
  return { screen: "Model / Windows", nativeFiniteInputs: values, replacedLegacyControls: ["Backward span (includes current row)", "Forward context rows"] };
}

async function auditModelsV3Accessibility(page, rail) {
  const tab = name => page.getByRole("tab", { name: new RegExp(`^${name}(,|$)`) });
  const button = name => page.getByRole("button", { name, exact: true });
  await rail.getByRole("button", { name: "Model", exact: true }).click();
  await tab("Units").click();
  await tab("Units").focus();
  const navigation = [];
  for (const name of ["Units", "Horizons", "Windows", "Codes"]) {
    if (name !== "Units") await page.keyboard.press("ArrowRight");
    assert.equal(await tab(name).getAttribute("aria-selected"), "true");
    assert.equal(await tab(name).evaluate(node => node === document.activeElement), true);
    const accessibleName = await tab(name).evaluate(node => node.ariaLabel || node.textContent.trim());
    assert.ok(accessibleName.startsWith(name));
    const help = button(`About ${name} settings`);
    await help.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(node => node === document.activeElement, await help.elementHandle());
    navigation.push({ tab: name, accessibleName, selected: true, helpFocusReturned: true });
    await tab(name).focus();
  }
  const hide = button("Hide all code nodes");
  assert.equal(await hide.getAttribute("aria-pressed"), "false");
  await hide.press("Enter");
  assert.equal(await button("Restore all code nodes").getAttribute("aria-pressed"), "true");
  await button("Restore all code nodes").press("Enter");
  assert.equal(await hide.getAttribute("aria-pressed"), "false");
  await button("Exclude all selected Codes").focus();
  await page.keyboard.press("Enter");
  const status = page.getByRole("status", { name: "Model status", exact: true });
  assert.equal(await status.getAttribute("aria-live"), "polite");
  assert.match(await status.innerText(), /incomplete/i);
  const announcement = page.locator(".ena-model-codes-v3-announcement");
  assert.equal(await announcement.getAttribute("aria-live"), "polite");
  assert.match(await announcement.innerText(), /Exclude all selected Codes/);
  const disabledReasons = [];
  for (const name of ["Hide all code nodes", "Exclude all selected Codes"]) {
    const control = button(name);
    assert.equal(await control.isDisabled(), true);
    const describedBy = await control.getAttribute("aria-describedby");
    assert.ok(describedBy, `${name} needs a disabled reason`);
    const description = await control.evaluate(node => (node.getAttribute("aria-describedby") ?? "").split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" "));
    assert.ok(description.length > 10);
    disabledReasons.push({ name, description });
  }
  assert.equal(await button(/^(?:Build ENA model|Rebuild model)$/u).isDisabled(), true);
  await button("Undo Code exclusion").focus();
  await page.keyboard.press("Enter");
  await button(/^(?:Build ENA model|Rebuild model)$/u).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  const zoom = [];
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  try {
    for (const name of ["Units", "Horizons", "Windows", "Codes"]) {
      await tab(name).click();
      const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(metrics.scrollWidth <= metrics.width + 1, `CSS 200 percent zoom overflow: ${name}`);
      const help = button(`About ${name} settings`);
      await help.focus();
      await help.press("Enter");
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await page.waitForFunction(node => node === document.activeElement, await help.elementHandle());
      zoom.push({ tab: name, ...metrics, helpAccessible: true });
    }
    await page.screenshot({ path: join(artifactDirectory, `models-css-zoom-${screenshotSequence++}.png`), fullPage: true });
  } finally {
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  return { navigation, disabledReasons, keyboardUndo: true, politeAnnouncement: true, reducedMotion: true, zoomMechanism: "CSS zoom 2; not native browser zoom", zoom };
}
let screenshotSequence = 0;

async function runA11y(page, baseUrl) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const rail = await loginAndLoad(page, baseUrl);
  const modelParity = await auditOfficialModelTabs(page, rail);
  await rail.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("tab", { name: /^Horizons(,|$)/ }).click();
  await page.getByRole("tab", { name: /^Windows(,|$)/ }).click();
  const modelSliders = await auditWindowExtentInputs(page);
  const modelsV3Accessibility = await auditModelsV3Accessibility(page, rail);
  await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const plotSliders = await captureSliderScreen(page, "Plot Tools", ["Edge scale", "Edge threshold", "Point scale"]);
  const threeD = page.getByRole("button", { name: /^3D ENA/ });
  await threeD.click();
  await waitForThreePlots(page);
  const scientificIdentity = await readScientificIdentity(page);
  await rail.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("tab", { name: /^Windows(,|$)/ }).waitFor({ state: "visible" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator(".ena-visual-toolbar").scrollIntoViewIfNeeded();
  const tabletToolbarGeometry = await readGeometry(page);
  assert.ok(tabletToolbarGeometry.toolbarContent.every(item => item.contained && item.noInternalOverflow), "tablet toolbar action text escapes its button");
  assert.deepEqual(tabletToolbarGeometry.toolbarOverlaps, [], "tablet toolbar actions overlap");
  await page.screenshot({ path: join(artifactDirectory, `tablet-toolbar-${screenshotSequence++}.png`), fullPage: true });
  assert.deepEqual(await readScientificIdentity(page), scientificIdentity, "tablet reflow changed scientific identity");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  let geometry;
  try {
    await page.waitForTimeout(100);
    await page.getByRole("tablist", { name: "Model configuration" }).scrollIntoViewIfNeeded();
    geometry = await readGeometry(page);
    assert.deepEqual(geometry.tabOverlaps, [], "Horizons/Windows tab text overlaps another tab");
    assert.ok(geometry.tabs.every((tab) => tab.text.every((rect) => rect.left >= geometry.tabContainer.left - 1 && rect.right <= geometry.tabContainer.right + 1)), "model tab text escapes its container");
    assert.ok(geometry.tabContainer.top >= 0 && geometry.tabContainer.bottom <= geometry.viewport.height, "model tabs are not recoverable inside the viewport");
    assert.ok(geometry.toolbarContent.every((item) => item.contained && item.noInternalOverflow), "enlarged toolbar content is clipped");
    assert.deepEqual(geometry.toolbarOverlaps, [], "enlarged toolbar actions overlap each other");
    assert.ok(geometry.regions.rail.right <= geometry.regions.controls.left + 1, "rail overlaps the controls panel");
    assert.ok(geometry.regions.toolbar.bottom <= geometry.regions.plotSurface.top + 1, "toolbar overlaps the 3D result surface");
    assert.ok(geometry.railLabels.every((item) => item.containedByButton && item.visibleInRail), "an enlarged rail label was lost");
    assert.deepEqual(await readScientificIdentity(page), scientificIdentity, "font-size change altered scientific identity");
  } finally {
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  const trajectoryCodeColorCascade = await auditTrajectoryCodeColorCascade(page, rail);
  assert.deepEqual(consoleErrors, [], "A11Y color-preset audits emitted console errors");
  assert.deepEqual(pageErrors, [], "A11Y color-preset audits emitted page errors");
  return { modelParity, modelSliders, modelsV3Accessibility, plotSliders, geometry, tabletToolbarGeometry, scientificIdentity, trajectoryCodeColorCascade, consoleErrors, pageErrors };
}

async function runPerformance(page, baseUrl, viewport, plotlyChunkNames) {
  await loginAndLoad(page, baseUrl);
  await page.evaluate(() => {
    performance.clearResourceTimings();
    window.__enaLongTasks = [];
    if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) throw new Error("longtask PerformanceObserver is unavailable");
    window.__enaLongTaskObserver = new PerformanceObserver((list) => {
      window.__enaLongTasks.push(...list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration,
      })));
    });
    window.__enaLongTaskObserver.observe({ type: "longtask", buffered: false });
  });
  const clickStart = await page.evaluate(() => performance.now());
  const cacheDefaultMark = await page.evaluate(() => performance.getEntriesByName("task38-cache-default-before-sample")[0]?.startTime);
  assert.ok(Number.isFinite(cacheDefaultMark) && clickStart > cacheDefaultMark, "3D measurement must follow restored default cache");
  await page.getByRole("button", { name: /^3D ENA/ }).click();
  const comparison = page.locator('[data-ena-plot-role="comparison"][data-ena-plot-status]');
  await waitForPlotTerminal(page, comparison, "comparison");
  const comparisonReady = await page.evaluate((start) => performance.now() - start, clickStart);
  await waitForThreePlots(page);
  await page.waitForTimeout(0);
  const measurement = await page.waitForFunction(({ start, expectedChunkNames }) => {
    const roots = window.__task38ReadyPlots();
    if (!roots) return null;
    const end = performance.now();
    const entries = performance.getEntriesByType("resource");
    const scripts = entries.filter((entry) => entry.startTime >= start
      && (entry.initiatorType === "script" || /\.js(?:\?|$)/u.test(entry.name))
      && expectedChunkNames.includes(new URL(entry.name).pathname.split("/").at(-1)));
    const largestNewPlotlyScriptChunk = scripts.sort((left, right) => (right.decodedBodySize || 0) - (left.decodedBodySize || 0))[0] ?? null;
    return {
      allThreeReady: performance.now() - start,
      largestLongTaskMs: Math.max(
        0,
        ...(window.__enaLongTasks ?? [])
          .filter((entry) => entry.startTime < end && entry.startTime + entry.duration > start)
          .map((entry) => entry.duration),
      ),
      roots: roots.map((root) => ({
        role: root.getAttribute("data-ena-plot-role"),
        ready: root.getAttribute("data-ena-plot-ready"),
        plotlyRoot: Boolean(root.querySelector('[data-ena-plotly-root="true"]')),
      })),
      largestNewPlotlyScriptChunk: largestNewPlotlyScriptChunk ? {
        name: largestNewPlotlyScriptChunk.name,
        startTime: largestNewPlotlyScriptChunk.startTime,
        transferSize: largestNewPlotlyScriptChunk.transferSize,
        decodedBodySize: largestNewPlotlyScriptChunk.decodedBodySize,
      } : null,
    };
  }, { start: clickStart, expectedChunkNames: plotlyChunkNames }, { timeout: 60000 });
  const result = await measurement.jsonValue(); await measurement.dispose();
  assert.equal(result.roots.length, 3, "3D result did not mount exactly three plot roots");
  assert.ok(result.roots.every((root) => root.ready === "true" && root.plotlyRoot), "a 3D plot root is not ready");
  assert.ok(result.largestNewPlotlyScriptChunk?.transferSize > 0, "no new Plotly script chunk transfer was observed");
  assert.ok(result.largestNewPlotlyScriptChunk.decodedBodySize > 0, "no decoded Plotly script chunk was observed");
  assert.ok(result.largestNewPlotlyScriptChunk.transferSize < budgets.transferBytesLt, "Plotly script transfer budget exceeded");
  assert.ok(result.largestNewPlotlyScriptChunk.decodedBodySize < budgets.decodedBytesLt, "Plotly script decoded budget exceeded");
  assert.ok(result.largestLongTaskMs < budgets.largestLongTaskMsLt, "long-task budget exceeded");
  assert.ok(result.allThreeReady < budgets.allThreeReadyMsLt, "all-three-ready budget exceeded");
  const scientificIdentityBefore = await readScientificIdentity(page);
  const scientificIdentityAfter = await readScientificIdentity(page);
  assert.deepEqual(scientificIdentityAfter, scientificIdentityBefore, "3D render changed scientific identity");
  return { viewport, comparisonReady, clickStart, cacheDefaultMark, measurementCachePolicy: "browser-default", ...result, scientificIdentity: scientificIdentityBefore };
}

mkdirSync(artifactDirectory, { recursive: true });
let runtime = null;
let failure = null;
let completedSummary = null;
try {
  runtime = await createServedBrowserV3({ root: projectRoot, directory: join(artifactDirectory, "runtime"), credentials: { username, password, secret: sessionSecret, account: accountId }, redact });
  const { browser, baseUrl } = runtime;
  const plotlyChunkNames = findPlotlyChunkNames();
  const runs = [];
  let baselineScientificIdentity = null;
  // Four exact isolated runs: each phase gets its own browser context and page.
  for (let run = 0; run < 4; run += 1) {
    const a11yContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const perfContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const a11yPage = await a11yContext.newPage(), perfPage = await perfContext.newPage();
      runtime.observePage(a11yPage); runtime.observePage(perfPage);
      a11yPage.__task38Phase = { phase: "a11y", repetition: run + 1 }; perfPage.__task38Phase = { phase: "perf", repetition: run + 1 };
      a11yPage.__task38PlotlyChunkNames = plotlyChunkNames; perfPage.__task38PlotlyChunkNames = plotlyChunkNames;
      const a11y = await runtime.stage(`a11y repetition ${run + 1}`, () => runA11y(a11yPage, baseUrl));
      const perf = await runtime.stage(`perf repetition ${run + 1}`, () => runPerformance(
        perfPage,
        baseUrl,
        { width: 1440, height: 900 },
        plotlyChunkNames,
      ));
      assert.deepEqual(a11y.scientificIdentity, perf.scientificIdentity, "A11Y and PERF phases produced different scientific identity");
      if (baselineScientificIdentity === null) baselineScientificIdentity = perf.scientificIdentity;
      else assert.deepEqual(perf.scientificIdentity, baselineScientificIdentity, "scientific identity changed across isolated runs");
      runs.push({ run: run + 1, a11y, perf });
    } catch (error) {
      for (const context of [a11yContext, perfContext]) for (const page of context.pages()) {
        await page.screenshot({ path: join(artifactDirectory, `failure-${screenshotSequence++}.png`), fullPage: true }).catch(() => {});
        writeFileSync(join(artifactDirectory, `failure-${screenshotSequence++}.txt`), redact(await page.locator("body").innerText().catch(() => "")));
      }
      throw error;
    } finally {
      for (const [label, context] of [["a11y", a11yContext], ["perf", perfContext]]) {
        const page = context.pages()[0];
        const readiness = page ? await page.evaluate(() => window.__task38ReadinessSamples ?? []).catch(() => []) : [];
        writeFileSync(join(artifactDirectory, `readiness-${run}-${label}.json`), JSON.stringify(readiness, null, 2));
        await context.close();
      }
    }
  }
  completedSummary = {
    schemaVersion: "open-ena.a11y-perf-smoke.v3",
    status: "PASS",
    route: "/en/open-ena",
    runs,
    budgets,
    plotlyChunkNames,
    metricsBoundary: "lab-only-not-production-CWV",
  };
} catch (error) {
  failure = error;
} finally {
  try { await runtime?.close(failure); } catch (error) { failure ??= error; }
}
writeFileSync(summaryPath, JSON.stringify(failure ? { ...completedSummary, schemaVersion: "open-ena.a11y-perf-smoke.v3", status: "FAILED", error: redact(failure?.stack ?? failure) } : completedSummary, null, 2));
if (failure) { console.error(redact(failure.stack ?? failure)); process.exitCode = 1; }
