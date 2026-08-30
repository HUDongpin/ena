#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = resolve(
  process.env.OPEN_ENA_A11Y_PERF_SMOKE_ARTIFACT_DIR
    ?? join(projectRoot, "output", "playwright", "open-ena-a11y-perf-smoke"),
);
const summaryPath = join(artifactDirectory, "summary.json");
const distName = `.next-open-ena-a11y-perf-smoke-${process.pid}`;
const distDirectory = join(projectRoot, distName);
const tsconfigPath = join(projectRoot, "tsconfig.json");
const originalTsconfigText = readFileSync(tsconfigPath, "utf8");
const originalTsconfig = JSON.parse(originalTsconfigText);
const username = "open_ena_a11y_perf_smoke_researcher";
const password = "open_ena_a11y_perf_smoke_password_2026";
const sessionSecret = "open_ena_a11y_perf_smoke_session_secret_0123456789abcdef";
const accountId = "open-ena-a11y-perf-smoke-account";
const env = {
  ...process.env,
  NEXT_DIST_DIR: distName,
  OPEN_ENA_USERNAME: username,
  OPEN_ENA_PASSWORD: password,
  OPEN_ENA_SESSION_SECRET: sessionSecret,
  OPEN_ENA_ACCOUNT_ID: accountId,
  OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS: "1",
};
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

async function findOpenPort() {
  return await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : null;
      probe.close((error) => error ? reject(error) : port ? resolvePort(port) : reject(new Error("port allocation failed")));
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
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Open ENA did not become ready at ${url}.`, { cause: lastError });
}

function startServer(port) {
  execFileSync("npm", ["run", "build"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    timeout: 600_000,
  });
  return spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env,
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
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

async function stopServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = (timeout) => new Promise((resolveExit) => {
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
  const signal = (name) => {
    try {
      if (process.platform !== "win32") process.kill(-server.pid, name);
      else server.kill(name);
      return true;
    } catch {
      if (name === "SIGTERM") return server.kill("SIGTERM");
      return server.kill(name);
    }
  };
  signal("SIGTERM");
  if (await exited(5_000)) return;
  signal("SIGKILL");
  // Keep the explicit child fallback: it is needed when npm did not create a process group.
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  if (!await exited(5_000)) throw new Error("The smoke-owned Next.js server did not exit after SIGKILL.");
}

function restoreOwnedTsconfigMutation() {
  const currentText = readFileSync(tsconfigPath, "utf8");
  if (currentText === originalTsconfigText) return;
  const current = JSON.parse(currentText);
  const ownedPrefix = `${distName}/`;
  const currentIncludes = Array.isArray(current?.include) ? current.include : [];
  const sanitized = {
    ...current,
    include: currentIncludes.filter((entry) => typeof entry !== "string" || !entry.startsWith(ownedPrefix)),
  };
  if (JSON.stringify(sanitized) !== JSON.stringify(originalTsconfig)) {
    throw new Error("tsconfig.json changed outside the smoke-owned distDir entries; refusing to overwrite it.");
  }
  writeFileSync(tsconfigPath, originalTsconfigText);
}

async function loginAndLoad(page, baseUrl) {
  await page.goto(`${baseUrl}/en/open-ena`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Account name" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  await rail.waitFor({ timeout: 30_000 });
  assert.equal(new URL(page.url()).pathname, "/en/open-ena");
  await rail.getByRole("button", { name: "Data", exact: true }).click();
  const controls = page.locator('[data-ena-workbench-region="controls"]');
  const sample = controls.getByRole("button", { name: "Load teaching sample", exact: true });
  await sample.waitFor({ state: "visible", timeout: 30_000 });
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
}

async function readScientificIdentity(page) {
  return page.evaluate(async () => {
    const roots = [...document.querySelectorAll('[data-ena-plot-role][data-ena-plot-ready="true"]')];
    if (roots.length !== 3) throw new Error(`expected three ready plot roots, got ${roots.length}`);
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
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      resultIdentity: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""),
      roles: payload.map((plot) => plot.role),
      traceCounts: payload.map((plot) => plot.traces.length),
    };
  });
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
    const toolbarContent = ["2D ENA", "3D ENA", "Download Model"].map((name) => {
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

async function runA11y(page, baseUrl) {
  const rail = await loginAndLoad(page, baseUrl);
  await rail.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("tab", { name: "Horizons", exact: true }).click();
  await page.getByRole("tab", { name: "Windows", exact: true }).click();
  const modelSliders = await captureSliderScreen(page, "Model / Windows", [
    "Backward span (includes current row)",
    "Forward context rows",
  ]);
  await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const plotSliders = await captureSliderScreen(page, "Plot Tools", ["Edge width", "Minimum relative edge", "Unit point size"]);
  const threeD = page.getByRole("button", { name: /^3D ENA/ });
  await threeD.click();
  await waitForThreePlots(page);
  const scientificIdentity = await readScientificIdentity(page);
  await rail.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("tab", { name: "Windows", exact: true }).waitFor({ state: "visible" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  try {
    await page.waitForTimeout(100);
    await page.getByRole("tablist", { name: "Model configuration" }).scrollIntoViewIfNeeded();
    const geometry = await readGeometry(page);
    assert.deepEqual(geometry.tabOverlaps, [], "Horizons/Windows tab text overlaps another tab");
    assert.ok(geometry.tabs.every((tab) => tab.text.every((rect) => rect.left >= geometry.tabContainer.left - 1 && rect.right <= geometry.tabContainer.right + 1)), "model tab text escapes its container");
    assert.ok(geometry.tabContainer.top >= 0 && geometry.tabContainer.bottom <= geometry.viewport.height, "model tabs are not recoverable inside the viewport");
    assert.ok(geometry.toolbarContent.every((item) => item.contained && item.noInternalOverflow), "enlarged toolbar content is clipped");
    assert.deepEqual(geometry.toolbarOverlaps, [], "enlarged toolbar actions overlap each other");
    assert.ok(geometry.regions.rail.right <= geometry.regions.controls.left + 1, "rail overlaps the controls panel");
    assert.ok(geometry.regions.toolbar.bottom <= geometry.regions.plotSurface.top + 1, "toolbar overlaps the 3D result surface");
    assert.ok(geometry.railLabels.every((item) => item.containedByButton && item.visibleInRail), "an enlarged rail label was lost");
    assert.deepEqual(await readScientificIdentity(page), scientificIdentity, "font-size change altered scientific identity");
    return { modelSliders, plotSliders, geometry, scientificIdentity };
  } finally {
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
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
  await page.getByRole("button", { name: /^3D ENA/ }).click();
  const comparison = page.locator('[data-ena-plot-role="comparison"][data-ena-plot-status]');
  await waitForPlotTerminal(page, comparison, "comparison");
  const comparisonReady = await page.evaluate((start) => performance.now() - start, clickStart);
  await waitForThreePlots(page);
  await page.waitForTimeout(0);
  const measurementEnd = await page.evaluate(() => performance.now());
  const result = await page.evaluate(({ start, end, expectedChunkNames }) => {
    const roots = [...document.querySelectorAll('[data-ena-plot-role][data-ena-plot-ready="true"]')];
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
        transferSize: largestNewPlotlyScriptChunk.transferSize,
        decodedBodySize: largestNewPlotlyScriptChunk.decodedBodySize,
      } : null,
    };
  }, { start: clickStart, end: measurementEnd, expectedChunkNames: plotlyChunkNames });
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
  return { viewport, comparisonReady, ...result, scientificIdentity: scientificIdentityBefore };
}

const port = await findOpenPort();
mkdirSync(artifactDirectory, { recursive: true });
rmSync(summaryPath, { force: true });
let server = null;
let browser = null;
let shuttingDown = false;

async function interrupt(signalName) {
  if (shuttingDown) return;
  shuttingDown = true;
  await browser?.close().catch(() => {});
  await stopServer(server).catch((error) => process.stderr.write(`[a11y/perf smoke] cleanup: ${redact(error.stack ?? error)}\n`));
  rmSync(distDirectory, { recursive: true, force: true });
  restoreOwnedTsconfigMutation();
  process.exit(signalName === "SIGINT" ? 130 : 143);
}
process.once("SIGINT", () => void interrupt("SIGINT"));
process.once("SIGTERM", () => void interrupt("SIGTERM"));

try {
  server = startServer(port);
  const plotlyChunkNames = findPlotlyChunkNames();
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl + "/en/open-ena");
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true });
  const runs = [];
  let baselineScientificIdentity = null;
  // Four exact isolated runs: each phase gets its own browser context and page.
  for (let run = 0; run < 4; run += 1) {
    const a11yContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const perfContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const a11y = await runA11y(await a11yContext.newPage(), baseUrl);
      const perf = await runPerformance(
        await perfContext.newPage(),
        baseUrl,
        { width: 1440, height: 900 },
        plotlyChunkNames,
      );
      assert.deepEqual(a11y.scientificIdentity, perf.scientificIdentity, "A11Y and PERF phases produced different scientific identity");
      if (baselineScientificIdentity === null) baselineScientificIdentity = perf.scientificIdentity;
      else assert.deepEqual(perf.scientificIdentity, baselineScientificIdentity, "scientific identity changed across isolated runs");
      runs.push({ run: run + 1, a11y, perf });
    } finally {
      await a11yContext.close();
      await perfContext.close();
    }
  }
  writeFileSync(summaryPath, JSON.stringify({
    schemaVersion: "open-ena.a11y-perf-smoke.v3",
    status: "PASS",
    route: "/en/open-ena",
    runs,
    budgets,
    plotlyChunkNames,
    metricsBoundary: "lab-only-not-production-CWV",
  }, null, 2));
} catch (error) {
  writeFileSync(summaryPath, JSON.stringify({
    schemaVersion: "open-ena.a11y-perf-smoke.v3",
    status: "FAILED",
    error: redact(error?.stack ?? error),
    note: "A browser run was not claimed; inspect the failure and source/deployment state separately.",
  }, null, 2));
  throw error;
} finally {
  shuttingDown = true;
  await browser?.close().catch(() => {});
  await stopServer(server).catch((error) => process.stderr.write(`[a11y/perf smoke] cleanup: ${redact(error.stack ?? error)}\n`));
  rmSync(distDirectory, { recursive: true, force: true });
  restoreOwnedTsconfigMutation();
}
