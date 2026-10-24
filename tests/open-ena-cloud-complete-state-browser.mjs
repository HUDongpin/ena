import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const evidenceDir = process.env.OPEN_ENA_CLOUD_BROWSER_EVIDENCE ?? "output/cloud-complete-state-20261024/browser";
// Reuse the native analysis fixture from the existing retention gate. Only the
// mounting seam changes: both pages still render the production workspace.
const retention = await readFile("tests/open-ena-ai-interpretation-retention-browser.mjs", "utf8");
const entryStart = retention.indexOf("const entry = `") + "const entry = `".length;
const entryEnd = retention.indexOf("\n`;", entryStart);
assert.ok(entryStart > 20 && entryEnd > entryStart);
let entry = retention.slice(entryStart, entryEnd).replace("import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace';", "import OpenEnaWorkspaceSession from './components/open-ena/OpenEnaWorkspaceSession';");
entry = `
import { restoreOpenEnaCloudWorkspace } from './lib/open-ena/cloud-workspace';
import { buildAnalysisBundleV3 } from './lib/open-ena/analysis-bundle-v3';
import { captureAnalysisSetV3, serializeAnalysisSetV3 } from './lib/open-ena/sets-bound-v3';
import { sha256CanonicalJsonV3 } from './lib/open-ena/model-v3/canonical-json';
` + entry.replace(/createRoot\(document.getElementById\('root'\)\)\.render\([\s\S]*$/u, `
const root = createRoot(document.getElementById('root'));
window.cloudBridge = { current: null };
window.cloudChanges = 0;
window.localOnlyWork = false;
let serial = 0;
const changed = () => { window.cloudChanges += 1; };
const local = (value) => { window.localOnlyWork = value; };
function mount(restored) {
  root.render(<OpenEnaWorkspaceSession key={++serial} initialLocale="en" operationOwnerKey={operationOwnerKey}
    initialSource={restored ? undefined : { dataset: data, datasetSha256: 'c'.repeat(64), drafts }}
    initialCloudWorkspace={restored} cloudBridge={window.cloudBridge} onCloudChange={changed}
    onLocalOnlyWorkChange={local} worker={worker} />);
}
window.cloudSave = async () => JSON.stringify(await window.cloudBridge.current.capture());
window.cloudOpen = async (text) => { const restored = await restoreOpenEnaCloudWorkspace(text); mount(restored); };
window.exportHistorical = async () => JSON.stringify(await buildAnalysisBundleV3(window.jobs[0].result), null, 2) + '\\n';
window.withSecondSet = async (text) => {
  const snapshot = JSON.parse(text);
  const second = await captureAnalysisSetV3(window.jobs[0].result, window.jobs[0].plan, { id: 'second-comparison', name: 'Retained second comparison' });
  snapshot.analysisSets.push(serializeAnalysisSetV3(second));
  snapshot.setComparison = { primaryId: snapshot.analysisSets[0].id, secondaryId: second.id, axes: second.geometry.dimensions.slice(0, 2) };
  delete snapshot.integritySha256;
  snapshot.integritySha256 = await sha256CanonicalJsonV3(snapshot);
  return JSON.stringify(snapshot);
};
mount(null);
`);
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd(), sourcefile: "cloud-complete-state.tsx" },
  bundle: true, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
const script = bundle.outputFiles[0].text;
const mark = await readFile("public/unified-home/logo-open-ena-mark.svg", "utf8");
const styles = await readFile("app/globals.css", "utf8");
const browser = await chromium.launch({ headless: true });
const errors = [];
let aiRequests = 0;
let releaseAi;
async function pageAt(origin) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/open-ena/ai-interpretation") {
      aiRequests += 1;
      if (aiRequests === 1) await new Promise((resolve) => { releaseAi = resolve; });
      const request = route.request().postDataJSON();
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({
        schemaVersion: "open-ena-ai-interpretation-response-v2", promptVersion: request.promptVersion,
        binding: request.binding, provider: "deepseek", model: "synthetic-cloud-storage-check", generatedAt: "2026-10-24T05:00:00.000Z",
        interpretation: { observedPatterns: [{ statement: "Cloud-restored synthetic AI interpretation.", evidenceRefs: [request.evidence.descriptive.axes[0].id] }],
          contextualQuestions: ["Which comparison needs review?"], limitations: ["Synthetic browser storage verification only."] } }),
        headers: { "x-open-ena-ai-receipt-id": "synthetic-receipt", "x-open-ena-ai-receipt-durable": "true",
          "x-open-ena-ai-request-sha256": "d".repeat(64) } });
    }
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname === "/unified-home/logo-open-ena-mark.svg") return route.fulfill({ contentType: "image/svg+xml", body: mark });
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><style>${styles}</style></head><body><div id="root"></div></body></html>` });
  });
  await page.goto(origin);
  await page.addScriptTag({ content: script });
  await page.getByTestId("open-ena-workspace-v3").waitFor();
  return page;
}

try {
  const first = await pageAt("http://localhost:31995/");
  await first.getByRole("button", { name: "Model", exact: true }).click();
  await first.getByTestId("open-ena-run-model").click();
  await first.waitForFunction(() => window.jobs.length === 1);
  await first.evaluate(() => window.resolveRun(0));
  await first.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
  await first.getByRole("button", { name: "Stats & Export", exact: true }).click();
  await first.getByRole("button", { name: "Run confirmed inference", exact: true }).click();
  await first.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  await first.locator(".ena-ai-consent input").check();
  const changesBeforeAi = await first.evaluate(() => window.cloudChanges);
  await first.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
  await first.waitForFunction(() => window.cloudBridge.current.running && window.localOnlyWork);
  assert.match(await first.evaluate(async () => {
    try { await window.cloudSave(); return "unexpectedly saved"; } catch (error) { return error.message; }
  }), /Wait.*AI request/i, "a pending AI request must block saving an incomplete snapshot");
  while (!releaseAi) await new Promise((resolve) => setTimeout(resolve, 5));
  releaseAi();
  await first.locator(".ena-ai-result").waitFor();
  let snapshotText = await first.evaluate(() => window.cloudSave());
  assert.ok(JSON.parse(snapshotText).aiInterpretation, "a completed AI interpretation must enter the cloud snapshot");
  assert.ok(await first.evaluate(() => window.cloudChanges) > changesBeforeAi, "completed AI marks the project dirty");

  await first.getByRole("button", { name: "Plot Tools", exact: true }).click();
  await first.locator("details.ena-artifacts-disclosure > summary").click();
  const changesBeforeSet = await first.evaluate(() => window.cloudChanges);
  await first.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let delay = true;
    crypto.subtle.digest = (...args) => {
      if (!delay) return digest(...args);
      delay = false;
      return new Promise((resolve) => { window.releaseDigest = () => { crypto.subtle.digest = digest; resolve(digest(...args)); }; });
    };
  });
  await first.getByTestId("open-ena-capture-analysis-set").click();
  await first.waitForFunction(() => Boolean(window.releaseDigest));
  assert.equal(await first.evaluate(() => window.cloudBridge.current.running && window.localOnlyWork), true,
    "an unfinished comparison-set capture must block Save and warn before leaving");
  assert.match(await first.evaluate(async () => {
    try { await window.cloudSave(); return "unexpectedly saved"; } catch (error) { return error.message; }
  }), /Wait/i);
  await first.evaluate(() => window.releaseDigest());
  await first.waitForFunction(() => document.querySelectorAll(".ena-artifact-sets > li").length === 1);
  assert.ok(await first.evaluate(() => window.cloudChanges) > changesBeforeSet, "capture marks the project dirty");
  const historicalText = await first.evaluate(() => window.exportHistorical());
  await first.getByRole("button", { name: "Data", exact: true }).click();
  await first.locator(".ena-data-import-details > summary").click();
  await first.locator('.ena-data-import-details input[type="file"]').setInputFiles({ name: "historical.json", mimeType: "application/json", buffer: Buffer.from(historicalText) });
  await first.getByRole("button", { name: "Keep read-only historical result", exact: true }).click();
  await first.getByRole("button", { name: "Review historical configuration", exact: true }).waitFor();
  snapshotText = await first.evaluate(() => window.cloudSave());
  assert.equal(JSON.parse(snapshotText).historicalImports[0], historicalText);
  assert.equal(await first.evaluate(() => window.localOnlyWork), false, "completed extras no longer trigger browser-only loss warning");
  snapshotText = await first.evaluate((text) => window.withSecondSet(text), snapshotText);

  const second = await pageAt("http://127.0.0.1:31995/");
  await second.evaluate((text) => window.cloudOpen(text), snapshotText);
  await second.getByRole("button", { name: "Review historical configuration", exact: true }).waitFor();
  const restoredAnalysisRuns = await second.evaluate(() => window.jobs.length);
  assert.equal(restoredAnalysisRuns, 0, "restoration must not rerun an analysis");
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).waitFor();
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false, "saved records do not restore consent");
  assert.equal(await second.getByRole("button", { name: "Generate AI interpretation", exact: true }).isDisabled(), true);
  assert.equal(aiRequests, 1, "opening the other origin must not dispatch AI");
  const changedEvidenceText = "The source, model, comparison, or statistical evidence has changed. This earlier interpretation is retained for reference and does not describe the current analysis.";
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 0, "restoration without a fresh review does not prove that evidence changed");
  await mkdir(evidenceDir, { recursive: true });
  await second.screenshot({ path: `${evidenceDir}/restored-ai.png`, fullPage: true });
  await second.getByRole("button", { name: "Plot Tools", exact: true }).click();
  await second.locator("details.ena-artifacts-disclosure > summary").click();
  assert.equal(await second.locator(".ena-artifact-sets > li").count(), 2);
  const compare = second.getByTestId("open-ena-compare-analysis-sets");
  assert.equal(await compare.isDisabled(), false); await compare.click();
  await second.screenshot({ path: `${evidenceDir}/restored-comparison.png`, fullPage: true });
  const resaved = JSON.parse(await second.evaluate(() => window.cloudSave()));
  const original = JSON.parse(snapshotText);
  assert.deepEqual(resaved.aiInterpretation, original.aiInterpretation);
  assert.deepEqual(resaved.analysisSets, original.analysisSets);
  assert.deepEqual(resaved.historicalImports, original.historicalImports);
  assert.deepEqual(resaved.setComparison, original.setComparison);
  const changesBeforeRemove = await second.evaluate(() => window.cloudChanges);
  await second.locator(".ena-sets-remove").first().click();
  const afterRemove = JSON.parse(await second.evaluate(() => window.cloudSave()));
  assert.equal(afterRemove.analysisSets.length, 1); assert.equal(afterRemove.setComparison, null);
  assert.ok(await second.evaluate(() => window.cloudChanges) > changesBeforeRemove, "removal marks the project dirty");
  await second.getByRole("button", { name: "Data", exact: true }).click();
  await second.getByRole("button", { name: "Review historical configuration", exact: true }).click();
  await second.getByRole("button", { name: "Keep read-only historical result", exact: true }).click();
  assert.equal(await second.getByRole("button", { name: "Review historical configuration", exact: true }).count(), 1);
  const beforeLanguage = JSON.parse(await second.evaluate(() => window.cloudSave()));
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  for (const locale of ["zh-hans", "zh-hant", "en"]) {
    await second.getByTestId("open-ena-workspace-language").selectOption(locale);
    await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).waitFor();
    assert.equal(await second.locator("[data-ena-ai-record-state=historical]").count(), 1);
    assert.equal(await second.locator("[data-ena-ai-language-mismatch]").count(), locale === "en" ? 0 : 1);
    const afterLanguage = JSON.parse(await second.evaluate(() => window.cloudSave()));
    for (const key of ["dataset", "drafts", "analysis", "statisticsReport", "aiInterpretation", "analysisSets", "setComparison", "historicalImports"]) {
      assert.deepEqual(afterLanguage[key], beforeLanguage[key], `${locale} retains ${key}`);
    }
    assert.equal(aiRequests, 1, "language selection never dispatches AI");
    await second.screenshot({ path: `${evidenceDir}/retained-ai-${locale}.png`, fullPage: true });
  }
  await second.setViewportSize({ width: 390, height: 844 });
  await second.getByTestId("open-ena-workspace-language").scrollIntoViewIfNeeded();
  const languageBox = await second.getByTestId("open-ena-workspace-language").boundingBox();
  assert.ok(languageBox && languageBox.x >= 0 && languageBox.x + languageBox.width <= 390, "language control fits the narrow viewport");
  await second.screenshot({ path: `${evidenceDir}/retained-ai-mobile.png`, fullPage: true });
  await second.setViewportSize({ width: 1440, height: 1100 });
  const historicalBaselineText = JSON.stringify(beforeLanguage);
  await second.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const plotControls = second.locator(".ena-workspace-plot-v3");
  await plotControls.getByRole("checkbox", { name: "Points", exact: true }).uncheck();
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 0,
    "a presentation edit must not label historical scientific evidence changed");
  await second.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const primaryGroup = plotControls.getByRole("combobox", { name: "Primary group", exact: true });
  const currentPrimary = await primaryGroup.inputValue();
  const otherGroup = await primaryGroup.locator("option").evaluateAll((nodes, current) => nodes.find((node) => node.value && node.value !== current).value, currentPrimary);
  await primaryGroup.selectOption(otherGroup);
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 1,
    "changing the scientific comparison must label the restored AI evidence changed");
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false);
  const changedComparisonText = await second.evaluate(() => window.cloudSave());
  assert.equal(JSON.parse(changedComparisonText).resultStatus, "current", "changing comparison leaves the model current");
  assert.deepEqual(JSON.parse(changedComparisonText).aiInterpretation, beforeLanguage.aiInterpretation, "the original record must remain immutable");
  await second.evaluate((text) => window.cloudOpen(text), changedComparisonText);
  await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).waitFor();
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 1,
    "comparison save/reopen must compare against the AI record's original controls, not the new mount baseline");
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false);
  assert.equal(aiRequests, 1);
  await second.evaluate((text) => window.cloudOpen(text), historicalBaselineText);
  await second.getByRole("button", { name: "Stats & Export", exact: true }).click();
  await second.getByRole("button", { name: "Run confirmed inference", exact: true }).click();
  await second.waitForFunction(() => !document.querySelector(".ena-ai-consent input").disabled);
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 1,
    "newly confirmed statistics must label the restored evidence changed without restoring consent");
  assert.equal(await second.locator("[data-ena-ai-record-state=historical]").count(), 1);
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false);
  assert.equal(aiRequests, 1);
  await second.evaluate((text) => window.cloudOpen(text), historicalBaselineText);
  // A successful rebuild clears resultStatus=stale, but the AI record still belongs to its old result.
  await second.getByRole("button", { name: "Model", exact: true }).click();
  await second.getByRole("tab", { name: /Windows,/ }).click();
  await second.getByRole("checkbox", { name: "Align target-fitted center to the origin", exact: true }).uncheck();
  await second.getByTestId("open-ena-run-model").click();
  await second.waitForFunction(() => window.jobs.length === 1);
  await second.evaluate(() => window.resolveRun(0));
  await second.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  const rebuiltText = await second.evaluate(() => window.cloudSave());
  assert.equal(JSON.parse(rebuiltText).resultStatus, "current");
  assert.deepEqual(JSON.parse(rebuiltText).aiInterpretation, beforeLanguage.aiInterpretation);
  await second.evaluate((text) => window.cloudOpen(text), rebuiltText);
  await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).waitFor();
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 1,
    "a successful rebuild/save/reopen must retain the mismatch with the original AI result provenance");
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false);
  assert.equal(aiRequests, 1);
  await second.evaluate((text) => window.cloudOpen(text), historicalBaselineText);
  // Regression: a restored record must gain a changed-evidence explanation after a real model edit.
  await second.getByRole("button", { name: "Model", exact: true }).click();
  await second.getByRole("tab", { name: /Codes,/ }).click();
  await second.getByRole("button", { name: "Exclude all selected Codes", exact: true }).click();
  await second.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "stale");
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 1,
    "a real model edit must add the stale-evidence explanation to a historical record");
  assert.equal(await second.locator("[data-ena-ai-record-state=historical]").count(), 1);
  assert.equal(await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).count(), 1);
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false);
  assert.equal(await second.getByRole("button", { name: "Generate AI interpretation", exact: true }).isDisabled(), true);
  assert.equal(aiRequests, 1, "model editing must not generate AI automatically");
  const changedEvidenceByLocale = {
    "zh-hans": "数据来源、模型、比较或统计证据已改变。此先前解读保留供参考，不代表当前分析。",
    "zh-hant": "資料來源、模型、比較或統計證據已改變。此先前解讀保留供參考，不代表目前分析。",
    en: changedEvidenceText,
  };
  for (const locale of ["zh-hans", "zh-hant", "en"]) {
    await second.getByTestId("open-ena-workspace-language").selectOption(locale);
    assert.equal(await second.getByText(changedEvidenceByLocale[locale], { exact: true }).count(), 1);
    assert.equal(await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).count(), 1);
    assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false);
  }
  await second.screenshot({ path: `${evidenceDir}/historical-ai-after-model-edit.png`, fullPage: true });
  const staleHistoricalText = await second.evaluate(() => window.cloudSave());
  await second.evaluate((text) => window.cloudOpen(text), staleHistoricalText);
  await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).waitFor();
  assert.equal(await second.getByText(changedEvidenceText, { exact: true }).count(), 1,
    "the saved workspace's explicit stale result must preserve the explanation after reopening");
  const changesBeforeClear = await second.evaluate(() => window.cloudChanges);
  const beforeClear = JSON.parse(await second.evaluate(() => window.cloudSave()));
  await second.locator("[data-ena-ai-clear]").click();
  assert.equal(await second.locator(".ena-ai-result").count(), 0, "Clear removes the readable AI record");
  assert.ok(await second.evaluate(() => window.cloudChanges) > changesBeforeClear, "Clear marks cloud state dirty");
  const clearedText = await second.evaluate(() => window.cloudSave());
  const cleared = JSON.parse(clearedText);
  assert.equal(cleared.schemaVersion, 2);
  assert.equal(cleared.aiInterpretation, null, "Clear is persisted as null");
  for (const key of ["dataset", "drafts", "analysis", "statisticsReport", "analysisSets", "setComparison", "historicalImports"]) {
    assert.deepEqual(cleared[key], beforeClear[key], `Clear preserves ${key}`);
  }
  await second.evaluate((text) => window.cloudOpen(text), clearedText);
  await second.getByRole("button", { name: "Generate AI interpretation", exact: true }).waitFor();
  assert.equal(await second.locator(".ena-ai-result").count(), 0, "saving and reopening must not resurrect the cleared record");
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false);
  assert.equal(aiRequests, 1);
  assert.deepEqual(errors, []);
  const receipt = { status: "PASS", sourceOrigin: new URL(first.url()).origin, restoredOrigin: new URL(second.url()).origin,
    syntheticAiRequests: aiRequests, restoredAnalysisRuns, explicitRebuilds: await second.evaluate(() => window.jobs.length),
    comparisonSets: resaved.analysisSets.length, historicalImports: resaved.historicalImports.length,
    aiRoundTrip: true, comparisonRoundTrip: true, originalImportBytesRoundTrip: true, resave: true,
    consentRestored: false, browserOnlyWarningAfterCompletedSave: false, pendingAiSaveBlocked: true, pendingSetSaveBlocked: true, removalPersisted: true, aiClearPersisted: true, localeRetainsAllSavedState: true, historicalModelEditExplained: true, historicalComparisonEditExplained: true, historicalStatisticsEditExplained: true, historicalPresentationUnchanged: true, historicalStaleReopenExplained: true, historicalComparisonReopenExplained: true, historicalRebuildReopenExplained: true };
  await writeFile(`${evidenceDir}/receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
} finally { releaseAi?.(); await browser.close(); }
