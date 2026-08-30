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
const fixtureCodePrefix = "PRIVATE_CODE_";
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

function runBrowserPhase(label, source, timeout = 120_000) {
  process.stdout.write(`[open-ena browser smoke] ${label} ... `);
  // Standard ENA identity-bearing downloads now have an explicit confirmation
  // gate. The smoke is an approved test actor, so accept that dialog before
  // waiting for the download event instead of letting Playwright auto-dismiss it.
  const instrumentedSource = source.replace(
    /^async \(page\) => \{/u,
    'async (page) => { page.on("dialog", (dialog) => void dialog.accept());',
  );
  const output = runCli(["--raw", "run-code", instrumentedSource], label, timeout).trim();
  const result = output ? JSON.parse(output) : null;
  process.stdout.write("PASS\n");
  return result;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
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
      if (response.status >= 200 && response.status < 500) return;
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

  const trajectoryModel = runBrowserPhase("rebuild the same fixture as Separate trajectory", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByRole("tab", { name: "Windows" }).click();
    const modelType = page.getByRole("combobox", { name: "Model type" });
    await modelType.selectOption("SeparateTrajectory");
    assert(await modelType.inputValue() === "SeparateTrajectory", "Separate trajectory selection did not bind");
    const rebuild = page.getByRole("button", { name: /Rebuild model/ });
    assert(await rebuild.isEnabled(), "Trajectory rebuild is disabled");
    await rebuild.click();
    await page.locator(".ena-stale-banner").waitFor({ state: "hidden", timeout: 30000 });
    await page.getByRole("button", { name: "Download Model" }).click({ trial: true, timeout: 30000 });
    return { modelType: await modelType.inputValue() };
  }`);

  const trajectoryIndependent = runBrowserPhase("run selected-period trajectory Mann-Whitney", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "Stats & Export", exact: true }).click();
    const designs = page.locator("[data-ena-inference-design=true]");
    await designs.getByRole("radio", { name: /Independent groups · Mann–Whitney U/ }).check();
    const identity = page.locator(".ena-inference-identity").first();
    const identityOptions = await identity.locator(".ena-inference-check-grid label").allTextContents();
    assert(
      JSON.stringify(identityOptions.map((label) => label.trim())) === JSON.stringify(["Name"]),
      "Stats identity choices reintroduced the comparison-group namespace",
    );
    const selectedIdentity = await identity.getByRole("checkbox").evaluateAll((nodes) => nodes
      .filter((node) => node.checked && !node.parentElement.classList.contains("ena-inference-confirmation"))
      .map((node) => node.parentElement.textContent.trim()));
    assert(
      JSON.stringify(selectedIdentity) === JSON.stringify(["Name"]),
      "Trajectory identity did not exclude the comparison-group namespace while retaining the person field",
    );
    await identity.getByRole("checkbox", { name: /I confirm this composite identity/ }).check();
    const timeField = page.getByRole("combobox", { name: "Time field" });
    const timeOptions = await timeField.locator("option").allTextContents();
    assert(
      JSON.stringify(timeOptions.map((label) => label.trim())) === JSON.stringify(["Lesson"]),
      "Stats time choices were not kept distinct from group and repeated-entity fields",
    );
    await timeField.selectOption("Lesson");
    const period = page.getByRole("combobox", { name: "Selected period" });
    await period.selectOption(${JSON.stringify(fixturePeriods[1])});
    const ledgerTable = page.locator(".ena-inference-ledger table");
    const ledgerValue = async (label) => {
      const row = ledgerTable.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
      return Number(await row.getByRole("cell").textContent());
    };
    assert(await ledgerValue("Candidate entities") === 17, "Selected-period preview candidate count is not entity-scoped");
    assert(await ledgerValue("Available in Primary") === 7, "Selected-period preview mixed Primary periods");
    assert(await ledgerValue("Available in Secondary") === 7, "Selected-period preview mixed Secondary periods");
    assert(await ledgerValue("Included entities") === 14, "Selected-period preview included points outside the chosen period");
    assert(await page.getByRole("heading", { name: "Inferential comparison results" }).count() === 0, "Endpoint inference stayed visible after the trajectory binding changed");
    const run = page.getByRole("button", { name: "Run inferential comparison" });
    assert(await run.isEnabled(), "Selected-period independent run is disabled");
    await run.click();
    const caption = page.locator("table caption").filter({ hasText: "Independent groups at one selected period · Mann–Whitney U" });
    await caption.waitFor({ timeout: 30000 });
    const resultRows = await caption.locator("..").locator("tbody tr").evaluateAll((rows) => (
      rows.map((row) => [...row.cells].map((cell) => cell.textContent.trim()))
    ));
    assert(resultRows.length === 2, "Selected-period result does not contain two axes");
    assert(resultRows.every((cells) => cells[2] === "7" && cells[6] === "7"), "Selected-period result rows did not preserve the 7+7 cohort");
    const bundlePromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export result bundle/ }).click();
    const bundleDownload = await bundlePromise;
    const bundleStream = await bundleDownload.createReadStream();
    let bundleText = "";
    for await (const chunk of bundleStream) bundleText += chunk.toString("utf8");
    const inference = JSON.parse(bundleText).inference;
    assert(inference?.kind === "trajectory-independent-period", "Selected-period bundle lost the trajectory-independent discriminant");
    assert(inference.request.period === ${JSON.stringify(fixturePeriods[1])}, "Selected-period inference scope drifted from the chosen period");
    assert(inference.rows.length === 2 && inference.rows.every((row) => row.nPrimary === 7 && row.nSecondary === 7), "Selected-period bundle mixed points from other periods");
    return { period: await period.inputValue(), rows: 2, primaryAvailable: 7, secondaryAvailable: 7 };
  }`);

  const paired = runBrowserPhase("run paired-period Wilcoxon signed-rank", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const designs = page.locator("[data-ena-inference-design=true]");
    await designs.getByRole("radio", { name: /Paired periods · Wilcoxon signed-rank/ }).check();
    await page.getByRole("heading", { name: "Inferential comparison results" }).waitFor({ state: "detached", timeout: 10000 });
    await page.getByRole("combobox", { name: "One comparison group", exact: true }).selectOption(${JSON.stringify(fixtureGroups[0])});
    await page.getByRole("combobox", { name: "Earlier period" }).selectOption(${JSON.stringify(fixturePeriods[0])});
    await page.getByRole("combobox", { name: "Later period" }).selectOption(${JSON.stringify(fixturePeriods[1])});
    const ledgerTable = page.locator(".ena-inference-ledger table");
    const ledgerValue = async (label) => {
      const row = ledgerTable.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
      return Number(await row.getByRole("cell").textContent());
    };
    assert(await ledgerValue("Candidate entities") === 9, "Pairwise candidate ledger is incorrect");
    assert(await ledgerValue("Available in earlier slot") === 8, "Pairwise earlier availability is incorrect");
    assert(await ledgerValue("Available in later slot") === 7, "Pairwise later availability is incorrect");
    assert(await ledgerValue("Matched entities") === 7, "Pairwise-complete match count is incorrect");
    assert(await ledgerValue("Earlier-only entities") === 1, "Pairwise earlier-only count is incorrect");
    assert(await ledgerValue("Later-only entities") === 0, "Pairwise later-only count is incorrect");
    assert(await ledgerValue("Missing A/B pairs") === 2, "Pairwise missing count is incorrect");
    const run = page.getByRole("button", { name: "Run inferential comparison" });
    assert(await run.isEnabled(), "Paired-period run is disabled");
    await run.click();
    const caption = page.locator("table caption").filter({ hasText: "Paired periods · Wilcoxon signed-rank" });
    await caption.waitFor({ timeout: 30000 });
    const table = caption.locator("..");
    assert(await table.locator("tbody tr").count() === 2, "Paired result does not contain two axes");
    const directions = await table.locator("tbody tr td:nth-child(2)").allTextContents();
    assert(
      directions.every((value) => value === ${JSON.stringify(`${fixturePeriods[0]} → ${fixturePeriods[1]}`)}),
      "Paired direction is not later minus earlier",
    );
    const resultRows = await table.locator("tbody tr").evaluateAll((rows) => rows.map((row) => ({
      matched: Number(row.cells[2]?.textContent),
      missing: Number(row.cells[3]?.textContent),
    })));
    assert(resultRows.every((row) => row.matched === 7 && row.missing === 2), "Paired result did not preserve the pairwise-complete ledger");
    return { rows: 2, direction: directions[0], matched: 7, missing: 2 };
  }`);

  const repeated = runBrowserPhase("run Friedman and all-pairs Wilcoxon follow-ups", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const deepFreeze = (value, seen = new WeakSet()) => {
      if (!value || typeof value !== "object" || seen.has(value)) return value;
      seen.add(value);
      for (const nested of Object.values(value)) deepFreeze(nested, seen);
      return Object.freeze(value);
    };
    const designs = page.locator("[data-ena-inference-design=true]");
    const repeatedDesign = designs.getByRole("radio", { name: /Repeated periods · Friedman/ });
    assert(await repeatedDesign.isEnabled(), "Repeated design is disabled with three ordered Lesson periods");
    await repeatedDesign.check();
    await page.getByRole("heading", { name: "Inferential comparison results" }).waitFor({ state: "detached", timeout: 10000 });
    await page.getByRole("combobox", { name: "One comparison group", exact: true }).selectOption(${JSON.stringify(fixtureGroups[0])});
    const periods = page.locator(".ena-inference-periods");
    for (const period of ${JSON.stringify(fixturePeriods)}) {
      await periods.getByRole("checkbox", { name: period, exact: true }).check();
    }
    const ledgerTable = page.locator(".ena-inference-ledger table");
    const ledgerValue = async (label) => {
      const row = ledgerTable.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
      return Number(await row.getByRole("cell").textContent());
    };
    assert(await ledgerValue("Candidate entities") === 9, "Repeated candidate ledger is incorrect");
    assert(await ledgerValue("Available at period: " + ${JSON.stringify(fixturePeriods[0])}) === 8, "Repeated baseline availability is incorrect");
    assert(await ledgerValue("Available at period: " + ${JSON.stringify(fixturePeriods[1])}) === 7, "Repeated middle availability is incorrect");
    assert(await ledgerValue("Available at period: " + ${JSON.stringify(fixturePeriods[2])}) === 7, "Repeated final availability is incorrect");
    assert(await ledgerValue("All-period complete entities") === 6, "Repeated all-period complete cohort is incorrect");
    assert(await ledgerValue("Missing any selected period") === 3, "Repeated missing-any ledger is incorrect");
    const run = page.getByRole("button", { name: "Run inferential comparison" });
    assert(await run.isEnabled(), "Repeated-period run is disabled");
    await run.click();
    const friedman = page.locator("table caption").filter({ hasText: "Repeated periods · Friedman omnibus" });
    const followup = page.locator("table caption").filter({ hasText: "All selected-period pairs" });
    await friedman.waitFor({ timeout: 30000 });
    await followup.waitFor({ timeout: 30000 });
    assert(await friedman.locator("..").locator("tbody tr").count() === 2, "Friedman family does not contain two axes");
    assert(await followup.locator("..").locator("tbody tr").count() === 6, "All axes × period-pair follow-ups were not generated");
    const resultText = await page.locator(".ena-inference-results").textContent();
    assert(resultText && resultText.includes("Holm-adjusted p") && resultText.includes("Raw p"), "Repeated results do not retain raw and Holm p-values");

    const bundlePromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export result bundle/ }).click();
    const bundleDownload = await bundlePromise;
    const bundleStream = await bundleDownload.createReadStream();
    let bundleText = "";
    for await (const chunk of bundleStream) bundleText += chunk.toString("utf8");
    const bundle = JSON.parse(bundleText);
    assert(bundle.schemaVersion === 2, "Repeated result bundle is not schema v2");
    // JSON downloads are mutable by construction. Freeze the captured value in
    // the smoke itself so every later consumer comparison uses one immutable
    // test baseline; coordinator immutability is covered by the unit contract.
    const inference = deepFreeze(bundle.inference);
    assert(Object.isFrozen(inference) && Object.isFrozen(inference.binding), "Captured inference test baseline is not deeply frozen");
    assert(inference?.kind === "trajectory-repeated-periods", "Repeated bundle inference differs from Stats");
    assert(inference.status === "available", "Repeated fixture did not produce an available omnibus family");
    assert(inference.omnibusRows.length === 2 && inference.followupRows.length === 6, "Repeated bundle does not contain all eight planned rows");
    const plannedRows = [...inference.omnibusRows, ...inference.followupRows];
    assert(plannedRows.every((row) => row.status === "available"), "A planned repeated row is unavailable in the smoke fixture");
    assert(new Set(plannedRows.map((row) => row.memberId)).size === 8, "Repeated planned member IDs are not unique");
    assert(inference.families.length === 2, "Repeated bundle does not contain separate omnibus/post-hoc families");
    assert(inference.families.find((family) => family.role === "omnibus")?.familySizePlanned === 2, "Omnibus family size is not two axes");
    assert(inference.families.find((family) => family.role === "posthoc")?.familySizePlanned === 6, "Post-hoc family size is not axes × all period pairs");
    assert(inference.ledger.completeBlockCount === 6 && inference.ledger.missingAnySelectedPeriodCount === 3, "Repeated frozen baseline lost its all-period cohort ledger");
    const inferenceText = JSON.stringify(inference);
    assert(!inferenceText.includes(${JSON.stringify(fixtureEntityPrefix)}), "Repeated bundle inference leaked participant identity values");
    assert(!/entity-\\d{6}/u.test(inferenceText), "Repeated bundle inference leaked opaque entity tokens");
    const inferencePanelText = await page.locator(".ena-inference-panel").textContent();
    assert(!inferencePanelText.includes(${JSON.stringify(fixtureEntityPrefix)}), "Inference DOM leaked participant identity values");
    assert(!/entity-\\d{6}/u.test(await page.locator("body").textContent()), "Page DOM leaked an opaque inference entity token");
    return {
      omnibusRows: 2,
      followupRows: 6,
      complete: 6,
      missingAny: 3,
      inference,
    };
  }`);

  const repeatedBaseline = deepFreeze(repeated.inference);

  const consumers = runBrowserPhase("prove presentation independence and aggregate consumer parity", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const equal = (actual, expected, message) => {
      if (!Object.is(actual, expected)) throw new Error(message + ": expected " + expected + ", received " + actual);
    };
    const deepFreeze = (value, seen = new WeakSet()) => {
      if (!value || typeof value !== "object" || seen.has(value)) return value;
      seen.add(value);
      for (const nested of Object.values(value)) deepFreeze(nested, seen);
      return Object.freeze(value);
    };
    const baseline = deepFreeze(${JSON.stringify(repeatedBaseline)});
    assert(Object.isFrozen(baseline) && Object.isFrozen(baseline.binding) && Object.isFrozen(baseline.omnibusRows), "Consumer baseline is not deeply frozen");
    const baselineRows = [
      ...baseline.omnibusRows.map((row) => ({ ...row, rowRole: "omnibus", familyRole: "omnibus" })),
      ...baseline.followupRows.map((row) => ({ ...row, rowRole: "posthoc", familyRole: "posthoc" })),
    ];
    assert(baselineRows.length === 8, "Frozen consumer baseline does not have eight planned rows");
    const baselineByMember = new Map(baselineRows.map((row) => [row.memberId, row]));
    const parseCsv = (text) => {
      const records = [];
      let record = [];
      let field = "";
      let quoted = false;
      for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quoted) {
          if (character === "\\\"" && text[index + 1] === "\\\"") {
            field += "\\\"";
            index += 1;
          } else if (character === "\\\"") quoted = false;
          else field += character;
        } else if (character === "\\\"") quoted = true;
        else if (character === ",") {
          record.push(field);
          field = "";
        } else if (character === "\\n") {
          if (field.endsWith("\\r")) field = field.slice(0, -1);
          record.push(field);
          records.push(record);
          record = [];
          field = "";
        } else field += character;
      }
      if (field || record.length) {
        record.push(field);
        records.push(record);
      }
      const [headers, ...rows] = records.filter((entry) => entry.some((value) => value !== ""));
      return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
    };
    const csvNumber = (record, key) => record[key] === "" ? null : Number(record[key]);
    const assertCsvParity = (csvRows) => {
      equal(csvRows.length, 8, "Inference CSV planned row count");
      for (const exported of csvRows) {
        const row = baselineByMember.get(exported.memberId);
        assert(row, "Inference CSV has an unknown member ID");
        for (const key of ["test", "axis", "status", "familyId", "memberId", "resolvedPMethod", "effectDirection"]) {
          equal(exported[key], row[key], "Inference CSV " + key + " mismatch for " + row.memberId);
        }
        equal(exported.inferenceKind, baseline.kind, "Inference CSV discriminant mismatch");
        equal(exported.rowRole, row.rowRole, "Inference CSV row role mismatch");
        equal(exported.familyRole, row.familyRole, "Inference CSV family role mismatch");
        for (const key of ["axisIndex", "familySizePlanned", "pRaw", "pHolm"]) {
          equal(csvNumber(exported, key), row[key], "Inference CSV " + key + " mismatch for " + row.memberId);
        }
        if (row.test === "friedman") {
          for (const key of ["nComplete", "nMissingCompleteBlocks", "nPeriods", "q", "degreesFreedom", "kendallsW"]) {
            equal(csvNumber(exported, key), row[key], "Inference CSV Friedman " + key + " mismatch");
          }
        } else {
          for (const key of [
            "earlierPeriodIndex", "laterPeriodIndex", "nMatched", "nMissing", "nPositive", "nNegative",
            "nZero", "nNonzero", "nRanked", "wPositive", "wNegative", "t", "rankBiserialLaterVsEarlier",
          ]) {
            equal(csvNumber(exported, key), row[key], "Inference CSV Wilcoxon " + key + " mismatch");
          }
          equal(exported.differenceDirection, "later-minus-earlier", "Inference CSV Wilcoxon direction mismatch");
          equal(exported.earlierPeriod, baseline.scope.periods[row.earlierPeriodIndex], "Inference CSV earlier period mismatch");
          equal(exported.laterPeriod, baseline.scope.periods[row.laterPeriodIndex], "Inference CSV later period mismatch");
        }
      }
    };
    const assertLocalAggregatePrivacy = (value, label) => {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      assert(!text.includes(${JSON.stringify(fixtureEntityPrefix)}), label + " leaked participant identity values");
      assert(!/entity-\\d{6}/u.test(text), label + " leaked opaque entity tokens");
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        for (const [key, nested] of Object.entries(node)) {
          assert(![
            "entityToken", "entityTokens", "entityValues", "pairedDifferences", "entityPeriodCoordinates",
            "participantCoordinates", "participantPeriods", "rawRows", "sourceRows",
          ].includes(key), label + " contains forbidden individual-evidence key " + key);
          visit(nested);
        }
      };
      if (typeof value !== "string") visit(value);
    };
    const uiNumber = (value, digits = 4) => {
      if (value === null || !Number.isFinite(value)) return "—";
      if (value !== 0 && Math.abs(value) < 0.0001) return value.toExponential(3);
      return Number(value.toFixed(digits)).toString();
    };
    const assertStatsTableParity = async () => {
      const friedmanCaption = page.locator("table caption").filter({ hasText: "Repeated periods · Friedman omnibus" });
      const friedmanRows = await friedmanCaption.locator("..").locator("tbody tr").evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent.trim())));
      equal(friedmanRows.length, 2, "Stats Friedman row count");
      for (const [index, cells] of friedmanRows.entries()) {
        const row = baseline.omnibusRows[index];
        equal(cells[0], row.axis, "Stats Friedman axis mismatch");
        equal(cells[1], String(row.nPeriods), "Stats Friedman period count mismatch");
        equal(cells[2], String(row.nComplete), "Stats Friedman complete count mismatch");
        equal(cells[3], uiNumber(row.q), "Stats Friedman Q mismatch");
        equal(cells[4], uiNumber(row.degreesFreedom, 0), "Stats Friedman df mismatch");
        equal(cells[5], uiNumber(row.pHolm, 6), "Stats Friedman Holm p mismatch");
        equal(cells[6], uiNumber(row.pRaw, 6), "Stats Friedman raw p mismatch");
        equal(cells[7], uiNumber(row.kendallsW), "Stats Friedman Kendall W mismatch");
        assert(cells[8].includes(row.resolvedPMethod), "Stats Friedman resolved method mismatch");
      }
      const followupCaption = page.locator("table caption").filter({ hasText: "All selected-period pairs" });
      const followupRows = await followupCaption.locator("..").locator("tbody tr").evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent.trim())));
      equal(followupRows.length, 6, "Stats Wilcoxon follow-up row count");
      for (const [index, cells] of followupRows.entries()) {
        const row = baseline.followupRows[index];
        equal(cells[0], row.axis, "Stats follow-up axis mismatch");
        equal(cells[1], baseline.scope.periods[row.earlierPeriodIndex] + " → " + baseline.scope.periods[row.laterPeriodIndex], "Stats follow-up direction mismatch");
        equal(cells[2], String(row.nMatched), "Stats follow-up cohort mismatch");
        equal(cells[3], String(row.nZero), "Stats follow-up zero count mismatch");
        equal(cells[4], row.nNonzero + " / " + row.nRanked, "Stats follow-up ranked count mismatch");
        equal(cells[5], uiNumber(row.wPositive, 2), "Stats follow-up W+ mismatch");
        equal(cells[6], uiNumber(row.wNegative, 2), "Stats follow-up W- mismatch");
        equal(cells[7], uiNumber(row.t, 2), "Stats follow-up T mismatch");
        equal(cells[8], uiNumber(row.pHolm, 6), "Stats follow-up Holm p mismatch");
        equal(cells[9], uiNumber(row.pRaw, 6), "Stats follow-up raw p mismatch");
        equal(cells[10], uiNumber(row.rankBiserialLaterVsEarlier), "Stats follow-up effect mismatch");
        assert(cells[11].includes(row.resolvedPMethod), "Stats follow-up resolved method mismatch");
      }
    };
    const markdownTable = (text, header) => {
      const lines = text.split(/\\r?\\n/u);
      const headerIndex = lines.indexOf(header);
      assert(headerIndex >= 0, "Methods table header is missing: " + header);
      const rows = [];
      for (let index = headerIndex + 2; index < lines.length && lines[index].startsWith("|"); index += 1) {
        rows.push(lines[index].slice(1, -1).split("|").map((cell) => cell.trim().replaceAll(String.fromCharCode(96), "")));
      }
      return rows;
    };
    const assertMethodsParity = (methodsText) => {
      const friedmanRows = markdownTable(
        methodsText,
        "| Axis | Complete n | Missing complete blocks | Period count | Q | df | Raw p | Holm-adjusted p | Kendall’s W | Resolved p method |",
      );
      equal(friedmanRows.length, 2, "Methods Friedman row count");
      for (const [index, cells] of friedmanRows.entries()) {
        const row = baseline.omnibusRows[index];
        const expected = [
          row.axis, String(row.nComplete), String(row.nMissingCompleteBlocks), String(row.nPeriods),
          String(row.q), String(row.degreesFreedom), String(row.pRaw), String(row.pHolm),
          String(row.kendallsW), row.resolvedPMethod,
        ];
        equal(JSON.stringify(cells), JSON.stringify(expected), "Methods Friedman row mismatch");
      }
      const followupRows = markdownTable(
        methodsText,
        "| Axis | Earlier → later | Matched | Missing | Positive | Negative | Zero | Nonzero/ranked | Median difference | IQR difference | W+ | W− | T | Raw p | Holm-adjusted p | Paired rank-biserial later vs earlier | Resolved p method |",
      );
      equal(followupRows.length, 6, "Methods Wilcoxon row count");
      for (const [index, cells] of followupRows.entries()) {
        const row = baseline.followupRows[index];
        const expected = [
          row.axis,
          baseline.scope.periods[row.earlierPeriodIndex] + " → " + baseline.scope.periods[row.laterPeriodIndex],
          String(row.nMatched), String(row.nMissing), String(row.nPositive), String(row.nNegative),
          String(row.nZero), row.nNonzero + "/" + row.nRanked, String(row.medianDifference),
          String(row.iqrDifference), String(row.wPositive), String(row.wNegative), String(row.t),
          String(row.pRaw), String(row.pHolm), String(row.rankBiserialLaterVsEarlier), row.resolvedPMethod,
        ];
        equal(JSON.stringify(cells), JSON.stringify(expected), "Methods Wilcoxon row mismatch");
      }
      const familyRows = markdownTable(
        methodsText,
        "| Family role | Family ID | Planned size | Member IDs |",
      );
      equal(familyRows.length, 2, "Methods family row count");
      for (const [index, cells] of familyRows.entries()) {
        const family = baseline.families[index];
        equal(cells[0], family.role, "Methods family role mismatch");
        equal(cells[1], family.familyId, "Methods family ID mismatch");
        equal(cells[2], String(family.familySizePlanned), "Methods planned family size mismatch");
        equal(cells[3], family.memberIds.join(", "), "Methods family membership mismatch");
      }
      for (const period of baseline.scope.periods) assert(methodsText.includes(period), "Methods omitted selected period scope");
      assert(methodsText.includes(baseline.scope.group), "Methods omitted aggregate comparison group scope");
      assertLocalAggregatePrivacy(methodsText, "Methods report");
    };
    const assertAiRoleProjection = (request) => {
      equal(request.schemaVersion, "open-ena-ai-interpretation-request-v2", "AI schema version");
      equal(request.evidence.kind, baseline.kind, "AI inference discriminant");
      equal(request.binding.datasetHash, baseline.binding.dataset.normalizedUtf8TextSha256, "AI strict dataset binding");
      assert(/^fnv1a32-[0-9a-f]{8}$/u.test(request.binding.evidenceKey), "AI evidence key is not a strict local binding");
      const evidenceText = JSON.stringify(request.evidence);
      const evidenceScalarStrings = [];
      const evidenceKeys = [];
      const collectEvidenceShape = (value) => {
        if (typeof value === "string") {
          evidenceScalarStrings.push(value);
          return;
        }
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          for (const item of value) collectEvidenceShape(item);
          return;
        }
        for (const [key, nested] of Object.entries(value)) {
          evidenceKeys.push(key);
          collectEvidenceShape(nested);
        }
      };
      collectEvidenceShape(request.evidence);
      for (const forbiddenKey of [
        // Role-projected containers such as groups and axes are part of
        // the strict v2 evidence schema. Reject only fields that could carry
        // local labels, identity mappings, or binding fingerprints.
        "group", "groupName", "period", "periodName", "axis", "axisName",
        "codes", "codeLabel", "codeLabels",
        "repeatedEntityColumns", "timeColumn", "datasetHash", "analyzedAt", "evidenceKey",
        "familyId", "memberId", "configuration",
      ]) {
        assert(!evidenceKeys.includes(forbiddenKey), "AI evidence retained forbidden local key: " + forbiddenKey);
      }
      for (const privateValue of [
        ...baseline.binding.axes,
        ...baseline.request.repeatedEntityColumns,
        baseline.request.timeColumn,
      ]) {
        assert(!evidenceScalarStrings.includes(privateValue), "AI evidence retained a real label value: " + privateValue);
      }
      for (const privateFragment of [
        ...${JSON.stringify(fixtureGroups)}, ...${JSON.stringify(fixturePeriods)},
        ${JSON.stringify(fixtureEntityPrefix)}, ${JSON.stringify(fixtureCodePrefix)},
        baseline.analyzedAt,
        baseline.binding.dataset.normalizedUtf8TextSha256,
        request.binding.evidenceKey,
        ...baseline.families.flatMap((family) => [family.familyId, ...family.memberIds]),
      ]) {
        assert(
          !evidenceScalarStrings.some((value) => value.includes(privateFragment)),
          "AI evidence leaked a dataset-linked value: " + privateFragment,
        );
      }
      assert(!/[0-9a-f]{64}/iu.test(evidenceText), "AI evidence contains a dataset-linked hash");
      assert(!/entity-\\d{6}/u.test(evidenceText), "AI evidence leaked an opaque entity token");
      equal(request.evidence.inferenceOmissions.length, 0, "AI unexpectedly omitted an available planned member");
      equal(request.evidence.inference.length, 8, "AI does not contain all eight role-projected planned rows");
      const aiById = new Map(request.evidence.inference.map((member) => [member.id, member]));
      for (const row of baseline.omnibusRows) {
        const member = aiById.get("omnibus-axis-" + (row.axisIndex + 1));
        assert(member, "AI omitted a Friedman axis role");
        for (const key of [
          "test", "status", "pRaw", "pHolm", "resolvedPMethod", "tieGroupCount", "tiedObservationCount",
          "nComplete", "nMissingCompleteBlocks", "nPeriods", "q", "degreesFreedom", "kendallsW",
        ]) equal(member[key], row[key], "AI Friedman " + key + " mismatch");
        equal(member.axisRole, "axis-" + (row.axisIndex + 1), "AI Friedman axis role mismatch");
        equal(member.familyRole, "omnibus-family", "AI Friedman family role mismatch");
        equal(member.groupRole, "group-1", "AI Friedman real group was not role-projected");
        equal(JSON.stringify(member.selectedPeriodIndices), "[0,1,2]", "AI Friedman period roles mismatch");
      }
      for (const row of baseline.followupRows) {
        const earlier = row.earlierPeriodIndex;
        const later = row.laterPeriodIndex;
        const member = aiById.get("posthoc-axis-" + (row.axisIndex + 1) + "-period-" + (earlier + 1) + "-period-" + (later + 1));
        assert(member, "AI omitted a Wilcoxon axis/period role");
        for (const key of [
          "test", "status", "pRaw", "pHolm", "resolvedPMethod", "tieGroupCount", "tiedObservationCount",
          "earlierPeriodIndex", "laterPeriodIndex", "differenceDirection", "nMatched", "nMissing", "nPositive",
          "nNegative", "nZero", "nNonzero", "nRanked", "wPositive", "wNegative", "t", "rankBiserialLaterVsEarlier",
        ]) equal(member[key], row[key], "AI Wilcoxon " + key + " mismatch");
        equal(member.axisRole, "axis-" + (row.axisIndex + 1), "AI Wilcoxon axis role mismatch");
        equal(member.familyRole, "posthoc-family", "AI Wilcoxon family role mismatch");
        equal(member.groupRole, "group-1", "AI Wilcoxon real group was not role-projected");
      }
      equal(request.evidence.scope.groupRole, "group-1", "AI repeated scope real group was not role-projected");
      equal(JSON.stringify(request.evidence.scope.selectedPeriodIndices), "[0,1,2]", "AI repeated scope period roles mismatch");
      equal(request.evidence.scope.cohortPolicy, "all-period-complete", "AI repeated cohort policy mismatch");
    };
    await assertStatsTableParity();
    const beforeResult = await page.locator(".ena-inference-results").textContent();
    const beforeProvenance = await page.locator("[data-ena-inference-provenance=true]").textContent();
    const rail = page.getByRole("navigation", { name: "Analysis modes" });
    await rail.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
    const baselineAiText = await page.locator("[data-ena-ai-payload-preview] pre").textContent();
    assert(baselineAiText, "AI preview is missing for the confirmed repeated inference");
    const baselineAiRequest = JSON.parse(baselineAiText);
    assertAiRoleProjection(baselineAiRequest);
    assert(await page.getByRole("button", { name: "Generate AI interpretation" }).isDisabled(), "AI Generate is enabled without consent");
    await rail.getByRole("button", { name: "Plot Tools", exact: true }).click();
    const longitudinal = page.getByTestId("open-ena-longitudinal-controls");
    await longitudinal.getByRole("radio", { name: "Complete cohort" }).check();
    await page.getByRole("button", { name: "Flip X", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const codeLabels = page.getByRole("checkbox", { name: "Code labels", exact: true });
    if (await codeLabels.isChecked()) await codeLabels.uncheck();

    const inferenceCsvButton = longitudinal.getByRole("button", { name: /Export inferential comparison CSV/ });
    assert(await inferenceCsvButton.isEnabled(), "Inference CSV was invalidated by presentation controls");
    const csvPromise = page.waitForEvent("download");
    await inferenceCsvButton.click();
    const csvDownload = await csvPromise;
    const csvStream = await csvDownload.createReadStream();
    let csv = "";
    for await (const chunk of csvStream) csv += chunk.toString("utf8");
    const csvRows = parseCsv(csv);
    assertCsvParity(csvRows);
    assertLocalAggregatePrivacy(csv, "Inference CSV");
    assertLocalAggregatePrivacy(csvRows, "Parsed inference CSV");

    const longitudinalJsonPromise = page.waitForEvent("download");
    await longitudinal.getByRole("button", { name: /Export longitudinal JSON/ }).click();
    const longitudinalDownload = await longitudinalJsonPromise;
    const longitudinalStream = await longitudinalDownload.createReadStream();
    let longitudinalText = "";
    for await (const chunk of longitudinalStream) longitudinalText += chunk.toString("utf8");
    const longitudinalJson = JSON.parse(longitudinalText);
    assert(longitudinalJson.schemaVersion === 2, "Longitudinal JSON is not schema v2");
    equal(JSON.stringify(longitudinalJson.inference), JSON.stringify(baseline), "Longitudinal JSON inference differs from the frozen bundle baseline");
    equal(JSON.stringify(longitudinalJson.inferenceDiagnostics.families), JSON.stringify(baseline.families), "Longitudinal JSON family audit differs from the frozen baseline");
    equal(longitudinalJson.inferenceDiagnostics.ledger.completeBlockCount, 6, "Longitudinal JSON complete cohort mismatch");
    equal(longitudinalJson.inferenceDiagnostics.ledger.missingAnySelectedPeriodCount, 3, "Longitudinal JSON missing cohort mismatch");
    for (const flag of [
      "entityTokensIncluded",
      "entityValuesIncluded",
      "pairedDifferencesIncluded",
      "entityPeriodCoordinatesIncluded",
    ]) {
      assert(longitudinalJson.privacy?.[flag] === false, "Longitudinal privacy flag " + flag + " is not false");
    }
    assert(longitudinalJson.privacy?.rawSourceRowsIncluded === false, "Longitudinal raw-row privacy flag is not false");
    assertLocalAggregatePrivacy(longitudinalJson, "Longitudinal JSON");

    await rail.getByRole("button", { name: "Stats & Export", exact: true }).click();
    await page.locator("table caption").filter({ hasText: "Repeated periods · Friedman omnibus" }).waitFor();
    const afterResult = await page.locator(".ena-inference-results").textContent();
    const afterProvenance = await page.locator("[data-ena-inference-provenance=true]").textContent();
    assert(afterResult === beforeResult, "Plot cohort/flip/label controls changed inference values");
    assert(afterProvenance === beforeProvenance, "Plot controls changed inference provenance");

    const methodsPreview = await page.locator(".ena-methods-preview pre").textContent();
    assert(
      methodsPreview && methodsPreview.includes("Friedman") && methodsPreview.includes("Wilcoxon") && methodsPreview.includes("Holm"),
      "Methods preview does not consume the repeated inference",
    );
    const methodsPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Methods report/ }).click();
    const methodsDownload = await methodsPromise;
    const methodsStream = await methodsDownload.createReadStream();
    let methodsText = "";
    for await (const chunk of methodsStream) methodsText += chunk.toString("utf8");
    equal(methodsPreview, methodsText, "Methods preview and downloaded report differ");
    assertMethodsParity(methodsText);

    const bundlePromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export result bundle/ }).click();
    const bundleDownload = await bundlePromise;
    const bundleStream = await bundleDownload.createReadStream();
    let bundleText = "";
    for await (const chunk of bundleStream) bundleText += chunk.toString("utf8");
    const bundle = JSON.parse(bundleText);
    assert(bundle.schemaVersion === 2, "Repeated result bundle is not schema v2");
    equal(JSON.stringify(bundle.inference), JSON.stringify(baseline), "Post-presentation bundle differs from the frozen inference baseline");
    assertLocalAggregatePrivacy(bundle.inference, "Result bundle inference");

    return {
      csvRows: csvRows.length,
      longitudinalPrivacy: longitudinalJson.privacy,
      methodsDownloaded: true,
      methodsRows: 8,
      aiSchema: baselineAiRequest.schemaVersion,
      aiMembers: baselineAiRequest.evidence.inference.length,
      bundleSchema: bundle.schemaVersion,
      parityBaselineMembers: baselineRows.length,
    };
  }`, 180_000);

  const accessibility = runBrowserPhase("check narrow layouts, keyboard tabs, and result focus target", `async (page) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
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
      assert(tableWraps.length >= 3, "Inference ledger/result table wrappers are missing at " + width + "px");
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
      await page.getByRole("button", { name: locale.sample, exact: true }).click();
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
    endpoint,
    trajectoryModel,
    trajectoryIndependent,
    paired,
    repeated: {
      omnibusRows: repeated.omnibusRows,
      followupRows: repeated.followupRows,
    },
    consumers,
    accessibility,
    locales: {
      en: { resultRows: endpoint.rows, caption: "Independent endpoint groups" },
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
