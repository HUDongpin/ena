#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = resolve(
  process.env.OPEN_ENA_SMOKE_ARTIFACT_DIR
    || join(projectRoot, "output", "playwright", "open-ena-inference-smoke"),
);
const serverLogPath = join(artifactDirectory, "next-server.log");
const username = "open_ena_smoke_researcher";
const password = "open_ena_smoke_password_2026";
const sessionSecret = "open_ena_smoke_session_secret_0123456789abcdef";
const sessionName = `open-ena-inference-smoke-${process.pid}`;
const fixtureGroups = ["PRIVATE_GROUP_ALPHA", "PRIVATE_GROUP_BETA"];
const fixturePeriods = [
  "PRIVATE_PERIOD_BASELINE",
  "PRIVATE_PERIOD_MIDDLE",
  "PRIVATE_PERIOD_FINAL",
];
const fixtureEntityPrefix = "PRIVATE_ENTITY_";
const smokeBrowser = process.env.OPEN_ENA_SMOKE_BROWSER || "chrome";
assert.ok(
  ["chromium", "chrome", "firefox", "webkit", "msedge"].includes(smokeBrowser),
  "OPEN_ENA_SMOKE_BROWSER must name a supported Playwright browser.",
);
const bundledPlaywrightWrapper = join(
  homedir(),
  ".codex",
  "skills",
  "playwright",
  "scripts",
  "playwright_cli.sh",
);
const playwrightCli = existsSync(bundledPlaywrightWrapper)
  ? { command: bundledPlaywrightWrapper, prefix: [], version: "0.1.18", source: "bundled skill wrapper" }
  : {
      command: "npx",
      prefix: ["--yes", "--package", "@playwright/cli@0.1.18", "playwright-cli"],
      version: "0.1.18",
      source: "pinned npx fallback",
    };

mkdirSync(artifactDirectory, { recursive: true });

function verifyPlaywrightCliVersion() {
  // Prefer the skill's bundled wrapper. Because that wrapper intentionally
  // follows its installed CLI package, fail closed if it does not resolve to
  // the reviewed version; only a missing wrapper uses the pinned npx fallback.
  let reported;
  try {
    reported = execFileSync(
      playwrightCli.command,
      [...playwrightCli.prefix, "--version"],
      {
        cwd: artifactDirectory,
        encoding: "utf8",
        env: process.env,
        timeout: 120_000,
      },
    ).trim();
  } catch (caught) {
    throw new Error(
      "The pinned Playwright CLI could not be resolved. This smoke requires npx and @playwright/cli@0.1.18.",
      { cause: caught },
    );
  }
  assert.equal(
    reported,
    playwrightCli.version,
    `Playwright CLI version drifted through ${playwrightCli.source}: expected ${playwrightCli.version}, received ${reported || "no version"}.`,
  );
}

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
        maxBuffer: 24 * 1024 * 1024,
        timeout,
      },
    );
  } catch (caught) {
    const stdout = caught && typeof caught === "object" && "stdout" in caught
      ? redact(caught.stdout)
      : "";
    const stderr = caught && typeof caught === "object" && "stderr" in caught
      ? redact(caught.stderr)
      : "";
    const details = `${stdout}\n${stderr}`.trim().slice(-8_000);
    throw new Error(`Playwright CLI failed during ${label}.${details ? `\n${details}` : ""}`);
  }
}

let dialogHandlerInstalled = false;

function runBrowserPhase(label, source, timeout = 120_000) {
  process.stdout.write(`[open-ena browser smoke] ${label} ... `);
  // Standard ENA identity-bearing downloads now have an explicit confirmation
  // gate. The smoke is an approved test actor, so accept that dialog before
  // waiting for the download event instead of letting Playwright auto-dismiss it.
  const installDialogHandler = !dialogHandlerInstalled;
  const dialogHandlerSource = ` page.on("dialog", (dialog) => {
    void dialog.accept().catch((error) => {
      if (!/already handled/u.test(String(error))) throw error;
    });
  });`;
  const instrumentedSource = source.replace(
    /^async \(page\) => \{/u,
    `async (page) => {${installDialogHandler ? dialogHandlerSource : ""}`,
  );
  const output = runCli(["--raw", "run-code", instrumentedSource], label, timeout).trim();
  if (installDialogHandler) dialogHandlerInstalled = true;
  const result = output ? JSON.parse(output) : null;
  process.stdout.write("PASS\n");
  return result;
}

async function findOpenPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port === null) reject(new Error("Could not allocate a local smoke-test port."));
        else resolve(port);
      });
    });
  });
}

async function waitForServer(url, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 400) return;
    } catch (caught) {
      lastError = caught;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Open ENA did not become ready at ${url}.`, { cause: lastError });
}

function readServerLogTail() {
  if (!existsSync(serverLogPath)) return "";
  return redact(readFileSync(serverLogPath, "utf8")).slice(-8_000);
}

async function stopOwnedServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const waitForExit = (timeout) => new Promise((resolve) => {
    if (server.exitCode !== null || server.signalCode !== null) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      server.off("exit", onExit);
      resolve(false);
    }, timeout);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
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
    throw new Error("The owned loopback Next.js server did not exit after SIGKILL.");
  }
}

let ownedServer = null;
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
    if (browserCleanupError) throw browserCleanupError;
  })();
  return cleanupPromise;
}

async function handleSignal(signal) {
  const exitCode = signal === "SIGINT" ? 130 : 143;
  try {
    await cleanupOwnedResources();
  } catch (caught) {
    process.stderr.write(`[open-ena browser smoke] cleanup after ${signal} failed: ${redact(caught)}\n`);
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void handleSignal("SIGINT"));
process.once("SIGTERM", () => void handleSignal("SIGTERM"));

function buildFixtureCsv() {
  const patterns = [
    "1,1,0,0,0",
    "1,0,1,0,0",
    "1,0,0,1,0",
    "1,0,0,0,1",
    "0,1,1,0,0",
    "0,1,0,1,0",
    "0,1,0,0,1",
    "0,0,1,1,0",
    "0,0,1,0,1",
    "0,0,0,1,1",
    "1,1,1,0,0",
    "0,1,1,1,0",
    "0,0,1,1,1",
    "1,0,0,1,1",
  ];
  const groups = [
    {
      name: fixtureGroups[0],
      availability: [
        [0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2],
        [0, 1], [0], [2],
      ],
    },
    {
      name: fixtureGroups[1],
      availability: [
        [0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2],
        [1, 2], [1], [0, 2],
      ],
    },
  ];
  const rows = [
    "Group,Name,Lesson,PRIVATE_CODE_A,PRIVATE_CODE_B,PRIVATE_CODE_C,PRIVATE_CODE_D,PRIVATE_CODE_E",
  ];
  for (const [groupIndex, group] of groups.entries()) {
    for (const [entityIndex, availablePeriods] of group.availability.entries()) {
      for (const periodIndex of availablePeriods) {
        rows.push([
          group.name,
          `${fixtureEntityPrefix}${entityIndex + 1}`,
          fixturePeriods[periodIndex],
          patterns[(entityIndex * 3 + periodIndex * 5 + groupIndex * 7) % patterns.length],
        ].join(","));
      }
    }
  }
  return `${rows.join("\n")}\n`;
}

let browserOpened = false;
let primaryFailure = null;
let baseUrl = null;

try {
  verifyPlaywrightCliVersion();
  const port = await findOpenPort();
  baseUrl = `http://127.0.0.1:${port}`;
  const logFd = openSync(serverLogPath, "w");
  const serverEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
    !key.startsWith("OPEN_ENA_SMOKE_")
    && !["OPEN_ENA_USERNAME", "OPEN_ENA_PASSWORD", "OPEN_ENA_SESSION_SECRET"].includes(key)
  )));
  ownedServer = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: {
        ...serverEnvironment,
        OPEN_ENA_USERNAME: username,
        OPEN_ENA_PASSWORD: password,
        OPEN_ENA_SESSION_SECRET: sessionSecret,
        // The smoke owns a random loopback port; bind production Origin checks
        // to that exact origin for authenticated API requests.
        OPEN_ENA_PUBLIC_ORIGIN: baseUrl,
        OPEN_ENA_ALLOWED_ORIGINS: baseUrl,
      },
      stdio: ["ignore", logFd, logFd],
    },
  );
  closeSync(logFd);
  ownedServer.once("error", (error) => {
    process.stderr.write(`[open-ena browser smoke] server error: ${redact(error.message)}\n`);
  });

  await waitForServer(`${baseUrl}/en/open-ena`);
  const openArgs = ["open", `${baseUrl}/en/open-ena`, "--browser", smokeBrowser];
  browserSessionAttempted = true;
  runCli(openArgs, "open browser");
  browserOpened = true;

  const login = runBrowserPhase("authenticate through the Open ENA form", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    await page.getByRole("textbox", { name: "Account name" }).fill(${JSON.stringify(username)});
    await page.getByRole("textbox", { name: "Password" }).fill(${JSON.stringify(password)});
    await page.getByRole("button", { name: "Sign in" }).click();
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.waitFor({ timeout: 30000 });
    assert(page.url().endsWith("/en/open-ena"), "login did not return to the English workspace");
    return { title: await page.title(), authenticated: true };
  }`);

  const fixtureCsv = buildFixtureCsv();
  const endpointModel = runBrowserPhase("upload the composite-identity Lesson fixture and build Endpoint", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "Data", exact: true }).click();
    await page.locator(\`input[type=file][accept*=".csv"]\`).evaluate((input, csv) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], "open-ena-inference-smoke.csv", { type: "text/csv" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, ${JSON.stringify(fixtureCsv)});
    await page.getByRole("heading", { name: "Define the ENA model" }).waitFor({ timeout: 30000 });

    const unitGroup = page.getByRole("group", { name: /Unit identity/ });
    const unitFields = await unitGroup.getByRole("checkbox").evaluateAll((nodes) => nodes
      .filter((node) => node.checked)
      .map((node) => node.parentElement.textContent.trim()));
    assert(JSON.stringify(unitFields) === JSON.stringify(["Group", "Name"]), "Unit identity was not inferred as ordered Group + Name");

    await page.getByRole("tab", { name: "Horizons" }).click();
    const horizonFields = await page.getByRole("group", { name: /Horizon identity/ })
      .getByRole("checkbox")
      .evaluateAll((nodes) => nodes
        .filter((node) => node.checked)
        .map((node) => node.parentElement.textContent.trim()));
    assert(
      JSON.stringify(horizonFields) === JSON.stringify(["Group", "Name", "Lesson"]),
      "Horizon identity was not inferred as Group + Name + Lesson",
    );

    const build = page.getByRole("button", { name: /Build ENA model/ });
    assert(await build.isEnabled(), "Endpoint build was not enabled");
    await build.click();
    await page.getByRole("button", { name: /Rebuild model/ }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Download Model" }).click({ trial: true, timeout: 30000 });
    return { unitFields, horizonFields };
  }`);

  const endpoint = runBrowserPhase("run explicit Endpoint Mann-Whitney and inspect consumers", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "Stats & Export", exact: true }).click();
    const designs = page.locator("[data-ena-inference-design=true]");
    const independent = designs.getByRole("radio", { name: /Independent groups · Mann–Whitney U/ });
    const pairedDesign = designs.getByRole("radio", { name: /Paired periods · Wilcoxon signed-rank/ });
    const repeatedDesign = designs.getByRole("radio", { name: /Repeated periods · Friedman/ });
    assert(await independent.isEnabled(), "Endpoint independent design is disabled");
    assert(await pairedDesign.isDisabled(), "Endpoint paired design is enabled");
    assert(await repeatedDesign.isDisabled(), "Endpoint repeated design is enabled");
    for (const disabledDesign of [pairedDesign, repeatedDesign]) {
      const reasonId = await disabledDesign.getAttribute("aria-describedby");
      assert(reasonId && await page.locator("#" + reasonId).textContent(), "Disabled design lacks an aria-describedby reason");
    }
    const eligibility = page.locator(".ena-inference-eligibility");
    assert(await eligibility.getAttribute("role") === "status", "Eligibility summary role is missing");
    assert(await eligibility.getAttribute("aria-live") === "polite", "Eligibility live region is not polite");
    assert(await page.getByRole("heading", { name: "Inferential comparison results" }).count() === 0, "Endpoint p-values appeared before an explicit run");
    await independent.check();
    assert(await page.getByRole("heading", { name: "Inferential comparison results" }).count() === 0, "Selecting a design ran inference implicitly");
    const run = page.getByRole("button", { name: "Run inferential comparison" });
    assert(await run.isEnabled(), "Endpoint Run inferential comparison is disabled");
    await run.focus();
    await run.press("Enter");

    const caption = page.locator("table caption").filter({ hasText: /^Independent endpoint groups$/ });
    await caption.waitFor({ timeout: 30000 });
    const table = caption.locator("..");
    assert(
      await page.locator("#open-ena-inference-results").evaluate((heading) => (
        document.activeElement !== heading && !heading.parentElement.contains(document.activeElement)
      )),
      "Result refresh forced focus into newly rendered results",
    );
    const headers = await table.locator("thead th").allTextContents();
    assert(headers.some((value) => value.includes("Holm-adjusted p")), "Endpoint table lacks Holm-adjusted p");
    assert(headers.some((value) => value.includes("Raw p")), "Endpoint table lacks raw p");
    assert(await table.locator("tbody tr").count() === 2, "Endpoint result does not contain the two current axes");

    const methods = await page.locator(".ena-methods-preview pre").textContent();
    assert(methods && methods.includes("Mann") && methods.includes("Holm"), "Endpoint Methods is not bound to the inference");
    const contrastSummary = await page.locator(".ena-selected-contrast-summary").textContent();
    assert(contrastSummary && contrastSummary.includes("Selected axes"), "Endpoint contrast axes label is not localized through structured copy");
    assert(!/\son\s/iu.test(contrastSummary), "Endpoint contrast summary leaked the former hard-coded English connector");

    const bundlePromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export result bundle/ }).click();
    const bundleDownload = await bundlePromise;
    const bundleStream = await bundleDownload.createReadStream();
    let bundleText = "";
    for await (const chunk of bundleStream) bundleText += chunk.toString("utf8");
    const bundle = JSON.parse(bundleText);
    assert(bundle.schemaVersion === 2, "Endpoint result bundle is not schema v2");
    assert(bundle.inference && bundle.inference.kind === "endpoint-independent", "Endpoint bundle inference differs from Stats");
    assert(!JSON.stringify(bundle.inference).includes(${JSON.stringify(fixtureEntityPrefix)}), "Endpoint bundle inference leaked entity values");

    await rail.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
    const aiText = await page.locator("[data-ena-ai-payload-preview] pre").textContent();
    assert(aiText && aiText.includes("open-ena-ai-interpretation-request-v2"), "Endpoint AI preview is not schema v2");
    assert(aiText && aiText.includes("endpoint-independent"), "Endpoint AI discriminant is missing");
    assert(aiText && !aiText.includes(${JSON.stringify(fixtureEntityPrefix)}), "Endpoint AI preview leaked entity values");
    assert(
      aiText && !${JSON.stringify(fixtureGroups)}.some((label) => aiText.includes(label)),
      "Endpoint AI preview leaked real group labels",
    );
    assert(await page.getByRole("button", { name: "Generate AI interpretation" }).isDisabled(), "AI generation is enabled without explicit consent");
    return { rows: 2, schemaVersion: bundle.schemaVersion, inferenceKind: bundle.inference.kind };
  }`);

  const accessibility = runBrowserPhase("check narrow layouts, keyboard tabs, and result focus target", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "Stats & Export", exact: true }).click();
    await page.getByRole("heading", { name: "Evidence and reproducibility", exact: true }).waitFor({ state: "visible", timeout: 30000 });
    const widths = {};
    for (const width of [320, 375, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      widths[width] = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert(widths[width].scrollWidth <= widths[width].clientWidth + 1, "Page-level overflow at " + width + "px");
      const tableWraps = await page.locator(".ena-inference-table-wrap").evaluateAll((nodes) => nodes.map((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflowX: getComputedStyle(node).overflowX,
      })));
      assert(tableWraps.length >= 2, "Endpoint inference ledger/result table wrappers are missing at " + width + "px");
      assert(tableWraps.every((wrap) => wrap.overflowX === "auto" || wrap.overflowX === "scroll"), "A table wrapper cannot scroll locally at " + width + "px");
      assert(tableWraps.some((wrap) => wrap.scrollWidth > wrap.clientWidth), "Wide inference results do not overflow their local wrapper at " + width + "px");
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    assert(await page.getByRole("tablist").count() === 1, "Stats renders more than one tablist");
    const tabs = page.getByRole("tablist", { name: "Statistics views" });
    const comparison = tabs.getByRole("tab", { name: "Comparison" });
    const goodness = tabs.getByRole("tab", { name: "Goodness of Fit" });
    const variance = tabs.getByRole("tab", { name: "Variance" });
    await comparison.focus();
    await comparison.press("ArrowRight");
    assert(await goodness.getAttribute("aria-selected") === "true", "ArrowRight did not select Goodness of Fit");
    assert(await goodness.evaluate((element) => document.activeElement === element), "ArrowRight did not move active focus to Goodness of Fit");
    await goodness.press("End");
    assert(await variance.getAttribute("aria-selected") === "true", "End did not select Variance");
    assert(await variance.evaluate((element) => document.activeElement === element), "End did not move active focus to Variance");
    await variance.press("Home");
    assert(await comparison.getAttribute("aria-selected") === "true", "Home did not restore Comparison");
    assert(await comparison.evaluate((element) => document.activeElement === element), "Home did not restore active focus to Comparison");
    const jump = page.getByRole("link", { name: "Jump to inferential results" });
    await jump.focus();
    await jump.press("Enter");
    assert(await page.evaluate(() => location.hash) === "#open-ena-inference-results", "Jump to results did not update the focus target URL");
    const resultHeading = page.locator("#open-ena-inference-results");
    assert(await resultHeading.getAttribute("tabindex") === "-1", "Result heading is not programmatically focusable");
    assert(await resultHeading.evaluate((element) => document.activeElement === element), "Jump to results did not move active focus to the result heading");
    return { widths, keyboard: true, jumpTarget: "#open-ena-inference-results" };
  }`);

  const trajectoryV3 = runBrowserPhase("run current V3 trajectory inference envelope", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByRole("heading", { name: "Define the ENA model", exact: true }).waitFor({ state: "visible", timeout: 30000 });
    const windowsTab = page.getByRole("tab", { name: "Windows", exact: true });
    await windowsTab.waitFor({ state: "visible", timeout: 30000 });
    await windowsTab.click();
    const modelType = page.getByRole("combobox", { name: "Model type" });
    await modelType.waitFor({ state: "visible", timeout: 30000 });
    await modelType.selectOption("SeparateTrajectory");
    const selectedModelType = await modelType.inputValue();
    assert(selectedModelType === "SeparateTrajectory", "Separate trajectory selection did not bind");
    const rebuild = page.getByRole("button", { name: /Rebuild model/ });
    assert(await rebuild.isEnabled(), "Trajectory rebuild is disabled");
    await rebuild.click();

    const workbench = page.getByTestId("open-ena-longitudinal-v3-workbench");
    await workbench.waitFor({ state: "visible", timeout: 30000 });
    await workbench
      .locator('section[data-trajectory-step="10"] .ena-longitudinal-v3-run-status [data-state="ready"]')
      .waitFor({ state: "visible", timeout: 30000 });
    assert(await page.getByTestId("open-ena-center-surface").count() === 0, "Trajectory result fell through to the generic ENA presenter");

    await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
    await workbench.locator('[data-trajectory-step="1"]').waitFor({ state: "visible", timeout: 30000 });
    const identity = workbench.getByRole("checkbox", {
      name: /same raw ID represents the same physical entity/u,
    });
    if (!await identity.isChecked()) await identity.check();
    const runTrajectory = workbench.getByRole("button", { name: "Run trajectory analysis", exact: true });
    assert(await runTrajectory.isEnabled(), "V3 trajectory analysis is disabled");
    await runTrajectory.click();
    const continueLocal = workbench.getByRole("button", { name: "Continue locally", exact: true });
    const confirmationVisible = await continueLocal
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (confirmationVisible) await continueLocal.click();
    await workbench
      .locator('section[data-trajectory-step="10"] .ena-longitudinal-v3-run-status [data-state="complete"]')
      .waitFor({ state: "visible", timeout: 120000 });

    const inferenceSection = workbench.getByTestId("open-ena-longitudinal-v3-inference");
    await inferenceSection.waitFor({ state: "visible", timeout: 30000 });
    const captionText = await inferenceSection.locator("caption").textContent();
    assert(captionText && captionText.includes("Holm adjustment"), "V3 inference table does not declare Holm adjustment");
    const inferenceRows = inferenceSection.locator("tbody tr");
    await inferenceRows.first().waitFor({ timeout: 30000 });
    const inferenceAudit = await inferenceRows.evaluateAll((rows) => ({
      rowCount: rows.length,
      requestKinds: [...new Set(rows.map((row) => row.cells[0]?.textContent?.trim()).filter(Boolean))].sort(),
      tests: [...new Set(rows.map((row) => row.cells[1]?.textContent?.trim()).filter(Boolean))].sort(),
    }));
    for (const requestKind of ["independent-period", "paired-periods", "repeated-periods", "path-comparison"]) {
      assert(inferenceAudit.requestKinds.includes(requestKind), "V3 inference UI omitted " + requestKind);
    }
    for (const testName of ["mann-whitney", "wilcoxon-signed-rank", "friedman"]) {
      assert(inferenceAudit.tests.includes(testName), "V3 inference UI omitted " + testName);
    }

    const analysisPromise = page.waitForEvent("download");
    await workbench.getByRole("button", { name: "Analysis JSON", exact: true }).click();
    const analysisDownload = await analysisPromise;
    const analysisStream = await analysisDownload.createReadStream();
    let analysisText = "";
    for await (const chunk of analysisStream) analysisText += chunk.toString("utf8");
    const analysis = JSON.parse(analysisText);
    assert(analysis.schemaVersion === "3dena.longitudinal-aggregate-export.v2", "V3 analysis JSON has the wrong schema");
    assert(analysis.privacy?.participantLevelIncluded === false, "V3 aggregate analysis enabled participant-level output");
    const analysisKinds = analysis.inference.map((family) => family.request?.kind).filter(Boolean).sort();
    assert(
      JSON.stringify(analysisKinds) === JSON.stringify(["independent-period", "paired-periods", "repeated-periods"]),
      "V3 analysis JSON omitted a coordinate inference family",
    );
    assert(Array.isArray(analysis.pathComparisons) && analysis.pathComparisons.length > 0, "V3 analysis JSON omitted whole-path comparison");
    assert(
      analysis.pathComparisons.every((comparison) => comparison.result.tests.every((test) => (
        test.permutationCount === 500
        && Number.isFinite(test.pValue)
        && Number.isFinite(test.holmAdjustedPValue)
      ))),
      "V3 whole-path permutation evidence is incomplete",
    );
    assert(!analysisText.includes(${JSON.stringify(fixtureEntityPrefix)}), "V3 aggregate analysis leaked participant identity values");
    assert(!analysisText.includes("participantCanonical"), "V3 aggregate analysis leaked participant canonical fields");

    return {
      modelType: selectedModelType,
      inferenceRows: inferenceAudit.rowCount,
      requestKinds: inferenceAudit.requestKinds,
      tests: inferenceAudit.tests,
      schemaVersion: analysis.schemaVersion,
      participantLevelIncluded: analysis.privacy.participantLevelIncluded,
    };
  }`, 180_000);

  const locales = runBrowserPhase("run localized Endpoint inference in Traditional and Simplified Chinese", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const checked = {};
    for (const locale of [
      {
        path: "zh-hant",
        sample: "載入教學範例",
        stats: "統計與匯出",
        independent: /獨立群組 · Mann–Whitney U 檢定/,
        paired: /配對期間 · Wilcoxon signed-rank/,
        repeated: /重複期間 · Friedman 檢定/,
        pairedReason: "配對期間推論需要成功的軌跡模型。",
        ready: "設計與彙總納入帳本已可供檢查；尚未計算任何 p 值。",
        ledgerCaption: "已確認設計的彙總候選、納入與排除數",
        run: "執行推論比較",
        results: "推論比較結果",
        caption: "獨立端點群組",
        holm: "Holm 校正 p（主要）",
        raw: "原始 p（稽核）",
        provenance: "推論來源記錄",
        boundary: "端點模型不會驗證兩個獨立群組是否位於同一共同時間期間。",
        axes: "所選座標軸",
      },
      {
        path: "zh-hans",
        sample: "加载教学示例",
        stats: "统计与导出",
        independent: /独立组 · Mann–Whitney U 检验/,
        paired: /配对时期 · Wilcoxon signed-rank/,
        repeated: /重复时期 · Friedman 检验/,
        pairedReason: "配对时期推断需要成功的轨迹模型。",
        ready: "设计与汇总纳入账本已可检查；尚未计算任何 p 值。",
        ledgerCaption: "已确认设计的汇总候选、纳入与排除数",
        run: "运行推断比较",
        results: "推断比较结果",
        caption: "独立端点组",
        holm: "Holm 校正 p（主要）",
        raw: "原始 p（审计）",
        provenance: "推断来源记录",
        boundary: "端点模型不会验证两个独立组是否处于同一共同时间时期。",
        axes: "所选坐标轴",
      },
    ]) {
      await page.goto(${JSON.stringify(baseUrl)} + "/" + locale.path + "/open-ena");
      const localizedDataPanel = page.getByTestId("open-ena-persistent-analysis-panel");
      await localizedDataPanel.getByRole("button", { name: locale.sample, exact: true }).click();
      await page.getByRole("button", { name: "Download Model" }).click({ trial: true, timeout: 30000 });
      const rail = page.getByRole("navigation", { name: "Analysis modes" });
      await rail.getByRole("button", { name: locale.stats, exact: true }).click();
      const designs = page.locator("[data-ena-inference-design=true]");
      assert(await designs.getByRole("radio", { name: locale.independent }).count() === 1, locale.path + " Mann–Whitney full name is missing");
      const pairedDesign = designs.getByRole("radio", { name: locale.paired });
      assert(await pairedDesign.count() === 1, locale.path + " Wilcoxon signed-rank full name is missing");
      assert(await designs.getByRole("radio", { name: locale.repeated }).count() === 1, locale.path + " Friedman/Wilcoxon full name is missing");
      assert(await pairedDesign.isDisabled(), locale.path + " endpoint paired design is unexpectedly enabled");
      const reasonId = await pairedDesign.getAttribute("aria-describedby");
      assert(reasonId && await page.locator("#" + reasonId).textContent() === locale.pairedReason, locale.path + " localized disabled reason is missing");
      const eligibility = page.locator(".ena-inference-eligibility");
      assert(await eligibility.getAttribute("role") === "status" && await eligibility.getAttribute("aria-live") === "polite", locale.path + " eligibility live region is incomplete");
      await designs.getByRole("radio", { name: locale.independent }).check();
      assert(await eligibility.textContent() === locale.ready, locale.path + " localized eligibility copy is incomplete");
      const ledger = page.locator(".ena-inference-ledger table");
      assert(await ledger.locator("caption").textContent() === locale.ledgerCaption, locale.path + " localized ledger caption is missing");
      assert(await ledger.getByRole("columnheader").count() === 2, locale.path + " ledger headers are incomplete");
      const run = page.getByRole("button", { name: locale.run, exact: true });
      assert(await run.isEnabled(), locale.path + " localized endpoint Run is disabled");
      await run.click();
      await page.getByRole("heading", { name: locale.results, exact: true }).waitFor({ timeout: 30000 });
      const caption = page.locator("table caption").filter({ hasText: new RegExp("^" + locale.caption + "$") });
      await caption.waitFor();
      const resultTable = caption.locator("..");
      const headers = await resultTable.getByRole("columnheader").allTextContents();
      assert(headers.includes(locale.holm) && headers.includes(locale.raw), locale.path + " localized raw/Holm headers are incomplete");
      assert(await resultTable.locator("tbody tr").count() === 2, locale.path + " localized endpoint result rows are incomplete");
      assert(await page.getByRole("heading", { name: locale.provenance, exact: true }).count() === 1, locale.path + " localized provenance is missing");
      assert(await page.getByText(locale.boundary, { exact: true }).count() === 1, locale.path + " endpoint temporal boundary is missing");
      const contrastSummary = await page.locator(".ena-selected-contrast-summary").textContent();
      assert(contrastSummary && contrastSummary.includes(locale.axes), locale.path + " selected axes copy is missing");
      assert(!/\son\s/iu.test(contrastSummary), locale.path + " leaked the former hard-coded English connector");
      checked[locale.path] = { resultRows: 2, caption: locale.caption };
    }
    return checked;
  }`, 180_000);

  const consoleOutput = runCli(["console", "error"], "read browser console");
  assert.match(consoleOutput, /Errors:\s*0/u, "Browser console contains errors.");
  assert.match(consoleOutput, /Warnings:\s*0/u, "Browser console contains warnings.");
  const serverLogAudit = readServerLogTail();
  assert(!serverLogAudit.includes(fixtureEntityPrefix), "Next server log leaked participant identity values.");
  assert.doesNotMatch(serverLogAudit, /entity-\d{6}/u, "Next server log leaked an opaque inference entity token.");

  const summary = {
    status: "PASS",
    login,
    endpointModel,
    endpoint: {
      status: "PASS",
      resultRows: 2,
      schemaVersion: 2,
      inferenceKind: "endpoint-independent",
      browserPhaseReturnCaptured: endpoint !== null,
    },
    accessibility,
    trajectoryV3,
    locales: {
      en: { resultRows: 2, caption: "Independent endpoint groups" },
      ...locales,
    },
    console: { errors: 0, warnings: 0 },
    browser: smokeBrowser,
    artifacts: artifactDirectory,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (caught) {
  primaryFailure = caught;
  if (browserOpened) {
    try {
      runCli(["screenshot"], "capture failure screenshot", 30_000);
    } catch {
      // Preserve the original smoke-test error.
    }
  }
  const serverLog = readServerLogTail();
  if (serverLog) process.stderr.write(`[open-ena browser smoke] server log tail:\n${serverLog}\n`);
} finally {
  try {
    await cleanupOwnedResources();
  } catch (cleanupError) {
    if (primaryFailure) {
      process.stderr.write(`[open-ena browser smoke] cleanup failure: ${redact(cleanupError)}\n`);
    } else {
      primaryFailure = cleanupError;
    }
  }
}

if (primaryFailure) throw primaryFailure;
