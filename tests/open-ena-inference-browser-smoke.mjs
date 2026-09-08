#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServedBrowserV3 } from "./helpers/open-ena-served-browser-v3.mjs";
import { prepareNativeFixtureV3, runNativeFixtureV3, nativeFixtureIdentitiesV3 } from "./helpers/open-ena-native-browser-fixture-v3.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = resolve(process.env.OPEN_ENA_SMOKE_ARTIFACT_DIR || join(projectRoot, "output/playwright/open-ena-inference-smoke"));
const username = "open_ena_smoke_researcher";
const password = "open_ena_smoke_password_2026";
const sessionSecret = "open_ena_smoke_session_secret_0123456789abcdef";
const smokeBrowser = process.env.OPEN_ENA_SMOKE_BROWSER || "chromium";
assert.equal(smokeBrowser, "chromium", "The native inference gate uses the owned, pinned Chromium runtime.");
const fixtureGroups = ["PRIVATE_GROUP_ALPHA", "PRIVATE_GROUP_BETA"];
const fixturePeriods = ["PRIVATE_PERIOD_BASELINE", "PRIVATE_PERIOD_MIDDLE", "PRIVATE_PERIOD_FINAL"];
const fixtureEntityPrefix = "PRIVATE_ENTITY_";
const fixtureCodes = ["PRIVATE_CODE_A", "PRIVATE_CODE_B", "PRIVATE_CODE_C", "PRIVATE_CODE_D", "PRIVATE_CODE_E"];
mkdirSync(artifactDirectory, { recursive: true });
const redact = value => String(value ?? "").replaceAll(username, "[redacted-username]").replaceAll(password, "[redacted-password]").replaceAll(sessionSecret, "[redacted-session-secret]");
const sha256 = value => createHash("sha256").update(value).digest("hex");
let runtime, failure;
const summary = { status: "running", fixtures: { units: 17, groups: 2, periods: 3, missingPeriods: true }, stages: {} };
const saveSummary = () => writeFileSync(join(artifactDirectory, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
async function stage(label, action) {
  process.stdout.write(`[native inference smoke] ${label} ...\n`);
  const value = await runtime.stage(label, action);
  summary.stages[label] = value ?? { passed: true }; saveSummary();
  return value;
}
async function download(page, button, name) {
  const pending = page.waitForEvent("download");
  await button.click();
  const item = await pending;
  const path = join(artifactDirectory, name);
  await item.saveAs(path);
  const bytes = readFileSync(path);
  return { path, bytes, sha256: sha256(bytes), suggestedFilename: item.suggestedFilename() };
}
async function downloadJson(page, button, name) {
  const item = await download(page, button, name);
  return { value: JSON.parse(item.bytes.toString("utf8")), sha256: item.sha256 };
}
function assertAggregatePrivacy(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const identity of [fixtureEntityPrefix, ...fixtureGroups, ...fixturePeriods]) assert.ok(!text.includes(identity), `aggregate consumer disclosed ${identity}`);
  assert.ok(!text.includes("participantCanonical"));
}
function assertStatistics(value, binding, kind, method) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, "open-ena-native-post-model-statistics");
  assert.equal(value.executable, false);
  assert.deepEqual(value.binding, binding);
  if (kind === "endpoint-independent") {
    assert.equal(value.inference.scope.design, "independent-endpoint-groups");
    assert.deepEqual(value.context.axes, value.controls.axes);
  } else assert.equal(value.inference.kind, kind);
  const rows = value.inference.rows ?? value.inference.omnibusRows;
  assert.ok(rows.length > 0 && rows.every(row => row.test === method));
  assert.ok(rows.some(row => row.status === "available"));
  for (const row of [...rows, ...(value.inference.followupRows ?? [])]) {
    if (row.status === "available") {
      assert.ok(Number.isFinite(row.pRaw) && Number.isFinite(row.pHolm));
      assert.ok(row.pRaw >= 0 && row.pRaw <= row.pHolm && row.pHolm <= 1);
    } else assert.ok(row.reason, "unavailable statistics must give a reason");
  }
  assert.ok(value.inference.ledger, "native inference must retain the inclusion ledger");
  // Local statistics may label selected Groups/Horizons; per-Unit identity is never needed here.
  assert.ok(!JSON.stringify(value.inference).includes(fixtureEntityPrefix));
  return rows;
}
async function science(page) {
  const identity = await nativeFixtureIdentitiesV3(page);
  const requests = await page.evaluate(() => window.__openEnaNativeAudit.requests.length);
  return { binding: identity.binding, requests };
}
async function chooseGroups(page, identity) {
  const selects = page.getByTestId("open-ena-ona-descriptive-group-controls").getByRole("combobox");
  assert.equal(await selects.count(), 2);
  await selects.nth(0).selectOption(identity.dictionary.groups[0].token);
  await selects.nth(1).selectOption(identity.dictionary.groups[1].token);
}
async function importFixture(page, horizons) {
  await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: "Data", exact: true }).click();
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({ name: "private-native-inference.csv", mimeType: "text/csv", buffer: Buffer.from(buildFixtureCsv()) });
  await prepareNativeFixtureV3(page, { codes: fixtureCodes, units: ["Group", "Name"], horizons, group: "Group", backward: 1 });
}
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

try {
  runtime = await createServedBrowserV3({ root: projectRoot, directory: join(artifactDirectory, "runtime"), credentials: { username, password, secret: sessionSecret }, redact, serverLogPath: join(artifactDirectory, "next-server.log"), disableBrowserCache: true });
  const baseUrl = runtime.baseUrl;
  const page = runtime.page;
  page.on("dialog", dialog => { void dialog.accept(); }); // The only uploaded identities belong to this synthetic fixture.
  let aiPostCount = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/open-ena/ai-interpretation" && request.method() === "POST") aiPostCount++; });
  await stage("authenticate and prepare typed native Endpoint fixture", async () => {
    const response = await page.goto(baseUrl + "/en/open-ena", { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    await runtime.drainAssetReads("initial assets before authentication");
    await page.getByRole("textbox", { name: "Account name" }).fill(username);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("navigation", { name: "Analysis modes" }).waitFor();
    await importFixture(page, ["Group", "Name", "Lesson"]);
    await runNativeFixtureV3(page);
    const identity = await nativeFixtureIdentitiesV3(page);
    assert.equal(identity.configuration.analysis.model.type, "EndPoint");
    assert.equal(identity.dictionary.units.length, 17, "Group + Name must distinguish reused entity labels across Groups");
    return { binding: identity.binding, units: identity.dictionary.units.length };
  });
  const rail = page.getByRole("navigation", { name: "Analysis modes" });
  const endpointScience = await science(page);
  await stage("explicit Endpoint Mann-Whitney with full-precision native consumers", async () => {
    await rail.getByRole("button", { name: /^Stats/ }).click();
    assert.equal(await page.getByRole("button", { name: "Export native statistics", exact: true }).count(), 0, "inference must not run with model construction");
    await chooseGroups(page, await nativeFixtureIdentitiesV3(page));
    const run = page.getByRole("button", { name: "Run confirmed inference", exact: true });
    await run.focus(); await page.keyboard.press("Enter");
    const exported = page.getByRole("button", { name: "Export native statistics", exact: true });
    await exported.waitFor();
    // Chromium may blur a button while it is disabled for async inference.
    // Keyboard result access is verified independently through the Stats tabpanel.
    const { value, sha256: hash } = await downloadJson(page, exported, "endpoint-statistics.json");
    const rows = assertStatistics(value, endpointScience.binding, "endpoint-independent", "mann-whitney-u");
    assert.equal(rows.length, 2);
    for (const key of ["pRaw", "pHolm"]) {
      const exact = await page.locator(`[data-native-metric="${key}"] span[title]`).evaluateAll(nodes => nodes.map(node => Number(node.title)));
      assert.deepEqual(exact, rows.filter(row => row.status === "available").map(row => row[key]), "comparison cards must preserve exact exported values");
    }
    await page.locator("details > summary").filter({ hasText: /^Native comparison statistics$/ }).click();
    await page.locator("details > summary").filter({ hasText: /^Researcher-requested post-model inference$/ }).click();
    assert.match(await page.locator('section[aria-label="Researcher-requested post-model inference"]').innerText(), /Mann|mann/u);
    const bundle = (await downloadJson(page, page.getByRole("button", { name: "Download Model", exact: true }), "endpoint-model.json")).value;
    assert.equal(bundle.schemaVersion, 3); assert.equal(bundle.kind, "open-ena-analysis-bundle");
    assert.deepEqual(bundle.manifest, endpointScience.binding);
    assert.equal(bundle.statistics.available, false); assert.equal(bundle.statistics.value, null);
    assert.deepEqual(await science(page), endpointScience, "post-model inference and export must not rerun or rebind the model");
    await page.screenshot({ path: join(artifactDirectory, "endpoint-statistics.png") });
    return { binding: value.binding, rows, sha256: hash };
  });
  await stage("keyboard Stats tabs and local table scrolling", async () => {
    const tabs = page.locator('[data-ena-stats-tab]');
    const comparison = tabs.filter({ hasText: /^Comparison$/ });
    await comparison.focus();
    for (const [key, selected] of [["ArrowRight", "goodness"], ["End", "variance"], ["Home", "comparison"]]) {
      await page.keyboard.press(key);
      const active = page.locator(`[data-ena-stats-tab="${selected}"]`);
      assert.equal(await active.getAttribute("aria-selected"), "true");
      assert.ok(await active.evaluate(node => document.activeElement === node));
    }
    assert.equal(await page.locator('[data-ena-stats-tab][tabindex="0"]').count(), 1);
    await page.keyboard.press("Tab");
    assert.ok(await page.locator('[data-ena-stats-panel="comparison"]').evaluate(node => document.activeElement === node), "Tab reaches the focusable result panel");
    const widths = [];
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const box = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(box.scrollWidth <= box.width + 1, `page overflow at ${width}px`);
      const wraps = await page.locator('.ena-result-table-wrap').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).map(node => ({ tabIndex: node.tabIndex, overflowX: getComputedStyle(node).overflowX, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth })));
      assert.ok(wraps.length >= 2);
      assert.ok(wraps.every(node => node.tabIndex === 0 && ["auto", "scroll"].includes(node.overflowX)));
      assert.ok(wraps.some(node => node.scrollWidth > node.clientWidth));
      widths.push({ viewport: width, ...box, wraps });
    }
    await page.screenshot({ path: join(artifactDirectory, "inference-narrow-390.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    return { widths, keyboard: true };
  });
  await stage("aggregate AI preview and explicit consent", async () => {
    await rail.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
    await page.locator('[data-ena-ai-payload-preview] > summary').click();
    const text = await page.locator('[data-ena-ai-payload-preview] pre').innerText();
    assert.match(text, /open-ena-ai-interpretation-request-v2/u);
    assert.match(text, /endpoint-independent/u);
    assert.ok(text.includes(endpointScience.binding.datasetSha256));
    assertAggregatePrivacy(text);
    assert.ok(await page.getByRole("button", { name: "Generate AI interpretation", exact: true }).isDisabled());
    assert.equal(aiPostCount, 0, "smoke must not send a provider request");
    return { aggregate: true, providerRequests: aiPostCount };
  });
  let orderedHorizons, trajectoryScience;
  await stage("configure missing-period native trajectories with explicit source order", async () => {
    await importFixture(page, ["Lesson"]);
    await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("SeparateTrajectory");
    await page.getByRole("tab", { name: /^Horizons(,|$)/ }).click();
    const panel = page.getByRole("tabpanel");
    await panel.getByLabel("Use source order", { exact: true }).check();
    await panel.getByRole("button", { name: "Review source-order statement", exact: true }).click();
    await panel.getByRole("button", { name: "Accept statement", exact: true }).click();
    await runNativeFixtureV3(page);
    const identity = await nativeFixtureIdentitiesV3(page);
    assert.equal(identity.configuration.analysis.model.type, "SeparateTrajectory");
    assert.equal(identity.dictionary.units.length, 17);
    const sequences = await page.evaluate(() => window.__openEnaNativeAudit.responses.at(-1).result.executionProvenance.ordering.resolvedHorizonOrder.unitSequences);
    const longest = [...sequences].sort((a, b) => b.steps.length - a.steps.length)[0];
    orderedHorizons = longest.steps.map(step => identity.dictionary.horizons.find(horizon => horizon.token === step.horizonToken));
    assert.equal(orderedHorizons.length, 3);
    assert.ok(orderedHorizons.every(Boolean));
    assert.ok(sequences.some(sequence => sequence.steps.length < 3), "fixture must exercise missing-period inclusion");
    trajectoryScience = await science(page);
    await rail.getByRole("button", { name: /^Stats/ }).click();
    await chooseGroups(page, identity);
    return { binding: trajectoryScience.binding, sequenceLengths: sequences.map(sequence => sequence.steps.length) };
  });
  await stage("three explicit native trajectory rank designs", async () => {
    const designs = [
      { design: "independent", count: 1, kind: "trajectory-independent-period", method: "mann-whitney-u" },
      { design: "paired", count: 2, kind: "trajectory-paired-periods", method: "wilcoxon-signed-rank" },
      { design: "repeated", count: 3, kind: "trajectory-repeated-periods", method: "friedman" },
    ];
    const outputs = [];
    for (const design of designs) {
      for (const horizon of orderedHorizons) await page.getByRole("checkbox", { name: horizon.displayLabel, exact: true }).uncheck();
      await page.getByRole("combobox", { name: /^Trajectory inference design/ }).selectOption(design.design);
      const run = page.getByRole("button", { name: "Run confirmed inference", exact: true });
      assert.ok(await run.isDisabled(), "empty period selection cannot produce inference");
      await page.getByRole("checkbox", { name: "I confirm these fitted Units identify the same entities across periods.", exact: true }).check();
      for (const horizon of orderedHorizons.slice(0, design.count)) await page.getByRole("checkbox", { name: horizon.displayLabel, exact: true }).check();
      await run.click();
      const exported = page.getByRole("button", { name: "Export native statistics", exact: true });
      await exported.waitFor();
      const { value, sha256: hash } = await downloadJson(page, exported, `trajectory-${design.design}.json`);
      assertStatistics(value, trajectoryScience.binding, design.kind, design.method);
      assert.equal(value.controls.request.kind, design.kind);
      if (design.design === "repeated") assert.ok(value.inference.followupRows.length > 0);
      assert.deepEqual(await science(page), trajectoryScience);
      outputs.push({ kind: design.kind, ledger: value.inference.ledger, sha256: hash });
    }
    return outputs;
  });
  await stage("whole-path permutation and aggregate export integrity", async () => {
    const panel = page.getByTestId("open-ena-native-trajectory-analysis");
    const run = panel.getByRole("button", { name: "Run whole-path comparison", exact: true });
    assert.ok(await run.isDisabled());
    await panel.getByRole("checkbox", { name: "I confirm that the entity histories in these two Groups are independent.", exact: true }).check();
    await run.click();
    await panel.getByText("Whole-path comparison current", { exact: true }).waitFor({ timeout: 120_000 });
    const rows = await panel.getByTestId("open-ena-native-trajectory-path-statistics").locator("tbody tr").evaluateAll(nodes => nodes.map(node => [...node.cells].map(cell => cell.textContent.trim())));
    assert.equal(rows.length, 23);
    for (const row of rows) {
      assert.equal(Number(row[6]), 500);
      assert.ok([row[3], row[4], row[5]].every(value => value !== "—" && Number.isFinite(Number(value))));
      assert.ok(Number(row[4]) >= 0 && Number(row[4]) <= Number(row[5]) && Number(row[5]) <= 1);
    }
    assert.equal(await panel.getByRole("checkbox", { name: "Include participant data in this export", exact: true }).isChecked(), false);
    const zip = await download(page, panel.getByRole("button", { name: "Export trajectory bundle", exact: true }), "trajectory-aggregate.zip");
    assert.equal(zip.bytes.subarray(0, 4).readUInt32LE(), 0x04034b50);
    const analysis = await downloadJson(page, panel.getByRole("button", { name: "Download analysis.json", exact: true }), "trajectory-analysis.json");
    const manifest = (await downloadJson(page, panel.getByRole("button", { name: "Download manifest.json", exact: true }), "trajectory-manifest.json")).value;
    assert.equal(analysis.value.schemaVersion, 3); assert.equal(analysis.value.kind, "open-ena-native-trajectory-analysis");
    assert.deepEqual(analysis.value.binding, trajectoryScience.binding);
    assert.equal(analysis.value.ranks.length, 3);
    assert.equal(analysis.value.pathComparison.tests.length, 23);
    assert.ok(analysis.value.pathComparison.tests.every(test => test.permutationCount === 500));
    assertAggregatePrivacy(analysis.value); assertAggregatePrivacy(manifest);
    assert.equal(manifest.kind, "open-ena-native-trajectory-export-manifest");
    assert.equal(manifest.disclosure, "aggregate");
    assert.deepEqual(new Set(manifest.requestFamilies), new Set(["trajectory-independent-period", "trajectory-paired-periods", "trajectory-repeated-periods", "path-comparison"]));
    assert.ok(!manifest.files.some(file => file.filename === "participants.json"));
    assert.equal(manifest.files.find(file => file.filename === "analysis.json").sha256, analysis.sha256);
    assert.deepEqual(await science(page), trajectoryScience);
    await page.screenshot({ path: join(artifactDirectory, "trajectory-inference.png") });
    return { rows: rows.length, permutations: 500, requestFamilies: manifest.requestFamilies, analysisSha256: analysis.sha256, zipSha256: zip.sha256 };
  });
  await stage("Traditional and Simplified Chinese native inference", async () => {
    const locales = [
      { path: "zh-hant", sample: "載入樣本", stats: "統計與匯出", run: "執行已確認推論", export: "匯出原生統計" },
      { path: "zh-hans", sample: "加载样本", stats: "统计与导出", run: "运行已确认推断", export: "导出原生统计" },
    ];
    const results = [];
    for (const locale of locales) {
      await runtime.drainAssetReads(`assets before ${locale.path} navigation`);
      const response = await page.goto(`${baseUrl}/${locale.path}/open-ena`, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      const localizedDataPanel = page.getByTestId("open-ena-persistent-analysis-panel");
      await localizedDataPanel.getByRole("button", { name: locale.sample, exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current", null, { timeout: 60_000 });
      await page.locator('.ena-rail-modes').getByRole("button", { name: locale.stats, exact: true }).click();
      await chooseGroups(page, await nativeFixtureIdentitiesV3(page));
      await page.getByRole("button", { name: locale.run, exact: true }).click();
      const exported = page.getByRole("button", { name: locale.export, exact: true }); await exported.waitFor();
      const { value, sha256: hash } = await downloadJson(page, exported, `${locale.path}-statistics.json`);
      assertStatistics(value, (await science(page)).binding, "endpoint-independent", "mann-whitney-u");
      for (const label of ["p（原始）", "p（Holm 校正）"]) assert.ok(await page.getByText(label, { exact: true }).count() > 0);
      await page.screenshot({ path: join(artifactDirectory, `${locale.path}-statistics.png`) });
      results.push({ locale: locale.path, rows: value.inference.rows.length, sha256: hash });
    }
    return results;
  });
  await runtime.drainAssetReads("final inference assets");
  assert.deepEqual(runtime.receipt.consoleErrors, []);
  assert.deepEqual(runtime.receipt.consoleWarnings, []);
  assert.deepEqual(runtime.receipt.pageErrors, []);
  assert.equal(aiPostCount, 0);
  summary.status = "pass";
  summary.browserGraphics = runtime.receipt.browser.graphics;
} catch (error) {
  failure = error; summary.status = "fail"; summary.error = redact(error.stack ?? error);
  if (runtime?.page) await runtime.page.screenshot({ path: join(artifactDirectory, "failure.png") }).catch(() => {});
  process.stderr.write(redact(error.stack ?? error) + "\n");
} finally {
  try {
    if (runtime) {
      await runtime.close(failure);
      const serverLog = readFileSync(join(artifactDirectory, "next-server.log"), "utf8");
      assertAggregatePrivacy(serverLog);
      assert.doesNotMatch(serverLog, /entity-\d{6}/u, "server logs must not expose per-entity inference tokens");
    }
  }
  catch (error) { failure ??= error; summary.status = "fail"; summary.cleanupError = redact(error.stack ?? error); }
  saveSummary();
}
if (failure) process.exitCode = 1;
else process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
