#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

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

let ephemeralPostgresRoot = null;
let ephemeralPostgresData = null;
let ephemeralPostgresRunning = false;

async function startEphemeralPostgres() {
  // TCP is the only connection path used by the smoke. Disable the Unix socket
  // so a deliberately isolated, deeply nested TMPDIR cannot exceed its small
  // platform path limit.
  ephemeralPostgresRoot = mkdtempSync(join(tmpdir(), "oeapg-"));
  ephemeralPostgresData = join(ephemeralPostgresRoot, "data");
  const postgresLog = join(ephemeralPostgresRoot, "postgres.log");
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
    "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,
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
      assert.ok(basename(ephemeralPostgresRoot).startsWith("oeapg-"));
      rmSync(ephemeralPostgresRoot, { recursive: true, force: true });
      ephemeralPostgresRoot = null;
    }
  }
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

function startServer(port, authDatabaseUrl) {
  const loopbackOrigin = `http://127.0.0.1:${port}`;
  const serverEnvironment = {
    ...env,
    // The smoke owns a random loopback port; bind production Origin checks
    // to that exact origin for the login and authenticated workbench calls.
    OPEN_ENA_PUBLIC_ORIGIN: loopbackOrigin,
    OPEN_ENA_ALLOWED_ORIGINS: loopbackOrigin,
    OPEN_ENA_AUTH_DATABASE_URL: authDatabaseUrl,
  };
  execFileSync("npm", ["run", "build"], {
    cwd: projectRoot,
    env: serverEnvironment,
    stdio: "inherit",
    timeout: 600_000,
  });
  return spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env: serverEnvironment,
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

async function auditCodeColorPresets(page, codes) {
  const desktopViewport = page.viewportSize();
  assert.deepEqual(desktopViewport, { width: 1440, height: 900 }, "color-preset audit requires the explicit desktop viewport");

  const triggers = codes.getByRole("button", { name: /^Choose color for / });
  const triggerCount = await triggers.count();
  assert.ok(triggerCount >= 2, "Codes must expose a distinct alternate Choose color for control");
  const trigger = triggers.first();
  const code = await trigger.getAttribute("data-ena-code-color-trigger");
  const originalPrimary = await trigger.getAttribute("data-ena-code-color-primary");
  assert.ok(code, "the first code-color trigger has no code identity");
  assert.match(originalPrimary ?? "", /^#[0-9a-f]{6}$/u, "the first code-color trigger has no valid primary color");

  const readNodeColors = async () => await page.locator("[data-ena-code]").evaluateAll((nodes, expectedCode) => (
    nodes
      .filter((node) => node.getAttribute("data-ena-code") === expectedCode)
      .map((node) => ({
        fill: node.getAttribute("fill"),
        computedFill: getComputedStyle(node).fill,
      }))
  ), code);
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
    const alternateCode = await alternate.getAttribute("data-ena-code-color-trigger");
    assert.ok(alternateCode && alternateCode !== code, "the alternate trigger must identify a distinct code");
    await alternate.click({ timeout: 500 }).catch(() => {});
    assert.equal(await page.getByRole("dialog", { name: dialogName, exact: true }).count(), 1,
      "an attempted second code trigger replaced the original exact dialog");
    assert.equal(await page.getByRole("dialog", { name: `Code color for ${alternateCode}`, exact: true }).count(), 0,
      "the native modal switched to another code target");
    assert.equal(await trigger.getAttribute("data-ena-code-color-trigger"), code,
      "the original trigger changed its code identity while its dialog was open");
    assert.equal(await trigger.getAttribute("aria-expanded"), "true",
      "the original trigger stopped owning the open dialog");
    alternateTriggerBlocked = true;

    await dialog.getByRole("button", { name: preset2Name, exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await waitForDialogClosed();
    assert.equal(await trigger.getAttribute("data-ena-code-color-primary"), originalPrimary,
      "Cancel changed the trigger's committed primary color");
    assert.deepEqual(await readNodeColors(), originalNodeColors, "Cancel changed rendered node colors");

    await openDialog();
    await dialog.getByRole("button", { name: preset2Name, exact: true }).click();
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await waitForDialogClosed();
    await page.waitForFunction(
      ([expectedCode, expectedColor]) => document.querySelector(`[data-ena-code-color-trigger="${CSS.escape(expectedCode)}"]`)
        ?.getAttribute("data-ena-code-color-primary") === expectedColor,
      [code, committedPrimary],
      { timeout: 10_000 },
    );
    assert.equal(await trigger.getAttribute("data-ena-code-color-primary"), committedPrimary);
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
    assert.equal(await trigger.getAttribute("data-ena-code-color-primary"), committedPrimary,
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
    assert.equal(await trigger.getAttribute("data-ena-code-color-primary"), committedPrimary,
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
      fallback.escape.primaryRollback = await trigger.getAttribute("data-ena-code-color-primary") === committedPrimary;
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
      fallback.backdrop.primaryRollback = await trigger.getAttribute("data-ena-code-color-primary") === committedPrimary;
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
      fallback.commit.primary = await trigger.getAttribute("data-ena-code-color-primary");
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
      fallback.restore.primary = await trigger.getAttribute("data-ena-code-color-primary");
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
  const tabMetrics = await tablist.getByRole("tab").evaluateAll((tabs) => tabs.map((tab) => ({
    name: tab.querySelector(":scope > span:first-child")?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
    tabHeightPx: tab.getBoundingClientRect().height,
    textColor: getComputedStyle(tab).color,
    activeRuleColor: getComputedStyle(tab, "::before").backgroundColor,
    selected: tab.getAttribute("aria-selected") === "true",
  })));
  assert.deepEqual(tabMetrics.map((tab) => tab.name), tabNames);
  assert.ok(tabMetrics.every((tab) => tab.tabHeightPx >= 33 && tab.tabHeightPx <= 36),
    "official Model tabs do not retain the 34px cadence");
  assert.equal(tabMetrics.find((tab) => tab.selected)?.activeRuleColor, "rgb(137, 207, 240)");

  const openPanel = async (name, panelName) => {
    await tablist.getByRole("tab", { name, exact: true }).click();
    const panel = page.locator(`[data-ena-official-panel="${panelName}"]`);
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
    if (!path || !add) throw new Error("official unit field path is incomplete");
    return {
      fieldPathHeightPx: path.getBoundingClientRect().height,
      addButtonHeightPx: add.getBoundingClientRect().height,
      addButtonBackground: getComputedStyle(add).backgroundColor,
    };
  });
  assert.ok(unitGeometry.fieldPathHeightPx >= 29 && unitGeometry.fieldPathHeightPx <= 31);
  assert.ok(unitGeometry.addButtonHeightPx >= 29 && unitGeometry.addButtonHeightPx <= 31);
  assert.equal(unitGeometry.addButtonBackground, "rgb(137, 207, 240)");
  await unitPath.waitFor({ state: "visible" });

  const removeField = unitEditor.locator(".ena-official-field-remove").last();
  const removeLabel = await removeField.evaluate((button) => button.ariaLabel);
  const removeMatch = removeLabel?.match(/^Remove (.+) from (.+ identity)$/u);
  assert.ok(removeMatch, "Remove .* from .* identity control is unavailable");
  const removedField = removeMatch[1];
  await removeField.click();
  await unitAdd.click();
  const removedFieldCheckbox = unitEditor.getByRole("checkbox", { name: removedField, exact: true });
  assert.equal(await removedFieldCheckbox.isChecked(), false);
  await removedFieldCheckbox.check();
  assert.equal(await removedFieldCheckbox.isChecked(), true);
  await unitAdd.click();

  const createSample = units.getByRole("combobox", { name: "Comparison group", exact: true });
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
  const horizonSwitch = horizons.getByRole("switch", { name: "Horizon method", exact: true });
  assert.equal(await horizonSwitch.isDisabled(), true);
  assert.equal(await horizonSwitch.getAttribute("aria-checked"), "true");
  await horizons.getByText("Open ENA currently supports the Standard horizon method.", { exact: true })
    .waitFor({ state: "visible" });
  assert.ok(await horizons.locator(".ena-official-horizon-column").count() > 0);
  assert.ok(await horizons.locator(".ena-official-icon-button:disabled").count() > 0);
  const horizonsGeometry = await panelGeometry(horizons);

  const windows = await openPanel("Windows", "windows");
  const windowSwitch = windows.getByRole("switch", { name: "Window horizon method", exact: true });
  assert.equal(await windowSwitch.isDisabled(), true);
  assert.equal(await windowSwitch.getAttribute("aria-checked"), "true");
  assert.ok(await windows.locator(".ena-official-setting-row").count() > 0);
  assert.equal(await windows.getByRole("slider").count(), 2);
  const windowsGeometry = await panelGeometry(windows);

  const codes = await openPanel("Codes", "codes");
  const networkSwitch = codes.getByRole("switch", { name: "Network type", exact: true });
  assert.equal(await networkSwitch.getAttribute("aria-checked"), "true");
  await networkSwitch.click();
  assert.equal(await networkSwitch.getAttribute("aria-checked"), "false");
  await networkSwitch.click();
  assert.equal(await networkSwitch.getAttribute("aria-checked"), "true");
  const manageCodes = codes.getByText("Manage Codes", { exact: true });
  await manageCodes.click();
  const codeCheckboxes = codes.locator(".ena-official-manage-codes").getByRole("checkbox");
  assert.ok(await codeCheckboxes.count() > 0);
  await manageCodes.click();
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
  return { tabMetrics, unitGeometry, removedField, initialGroup, alternateGroup, panels, codeColorPresets };
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

async function auditTrajectoryCodeColorCascade(page, rail) {
  const endpointDownload = page.getByRole("button", { name: "Download Model", exact: true });
  await endpointDownload.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction((button) => button && !button.disabled, await endpointDownload.elementHandle(), { timeout: 30_000 });
  await rail.getByRole("button", { name: "Data", exact: true }).click();
  const loadTrajectorySample = page.getByRole("button", { name: "Load 3D trajectory sample", exact: true });
  await loadTrajectorySample.waitFor({ state: "visible", timeout: 30_000 });
  await loadTrajectorySample.click();

  const longitudinalControls = page.locator(".ena-longitudinal-v3-controls");
  await longitudinalControls.waitFor({ state: "visible", timeout: 60_000 });
  const runStatus = rail.locator('.ena-run-status[data-state="result"]');
  await runStatus.waitFor({ state: "visible", timeout: 60_000 });

  await rail.getByRole("button", { name: "Model", exact: true }).click();
  const tablist = longitudinalControls.getByRole("tablist", { name: "Model configuration" });
  await tablist.waitFor({ state: "visible", timeout: 30_000 });
  await tablist.getByRole("tab", { name: "Codes", exact: true }).click();
  const codes = longitudinalControls.locator('[data-ena-official-panel="codes"]');
  await codes.waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await codes.evaluate((element) => element.closest(".ena-longitudinal-v3-controls") !== null), true,
    "trajectory Model / Codes panel escaped the longitudinal-v3 controls cascade");

  const trigger = codes.locator('[data-ena-code-color-trigger]').first();
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  const code = await trigger.getAttribute("data-ena-code-color-trigger");
  const originalPrimary = await trigger.getAttribute("data-ena-code-color-primary");
  assert.ok(code, "trajectory code-color trigger has no code identity");
  assert.match(originalPrimary ?? "", /^#[0-9a-f]{6}$/u);
  assert.equal(await trigger.evaluate((element) => element.closest(".ena-longitudinal-v3-controls") !== null), true,
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
  assert.deepEqual({ width: triggerStyle.width, height: triggerStyle.height }, { width: 28, height: 28 });
  assert.equal(triggerStyle.minHeight, "28px");
  assert.deepEqual(
    [triggerStyle.borderTopWidth, triggerStyle.borderRightWidth, triggerStyle.borderBottomWidth, triggerStyle.borderLeftWidth],
    ["0px", "0px", "0px", "0px"],
  );
  assert.equal(triggerStyle.backgroundColor, "rgba(0, 0, 0, 0)");
  assert.deepEqual(
    [triggerStyle.paddingTop, triggerStyle.paddingRight, triggerStyle.paddingBottom, triggerStyle.paddingLeft],
    ["0px", "0px", "0px", "0px"],
  );

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await dialog.evaluate((element) => element.closest(".ena-longitudinal-v3-controls") !== null), true,
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
  assert.equal(await trigger.getAttribute("data-ena-code-color-primary"), originalPrimary,
    "trajectory cascade audit committed its invalid draft");

  return {
    code,
    endpointDownloadEnabled: true,
    resultCompleted: true,
    longitudinalAncestor: { panel: true, trigger: true, dialog: true },
    trigger: triggerStyle,
    dialog: dialogStyle,
    error: errorStyle,
  };
}

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
  return { modelParity, modelSliders, plotSliders, geometry, scientificIdentity, trajectoryCodeColorCascade, consoleErrors, pageErrors };
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
  try {
    stopEphemeralPostgres();
  } catch (error) {
    process.stderr.write(`[a11y/perf smoke] database cleanup: ${redact(error.stack ?? error)}\n`);
  }
  rmSync(distDirectory, { recursive: true, force: true });
  restoreOwnedTsconfigMutation();
  process.exit(signalName === "SIGINT" ? 130 : 143);
}
process.once("SIGINT", () => void interrupt("SIGINT"));
process.once("SIGTERM", () => void interrupt("SIGTERM"));

try {
  const authDatabaseUrl = await startEphemeralPostgres();
  server = startServer(port, authDatabaseUrl);
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
  stopEphemeralPostgres();
  rmSync(distDirectory, { recursive: true, force: true });
  restoreOwnedTsconfigMutation();
}
