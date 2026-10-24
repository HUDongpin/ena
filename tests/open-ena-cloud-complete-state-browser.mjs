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
let entry = retention.slice(entryStart, entryEnd);
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
  root.render(<OpenEnaWorkspace key={++serial} locale="en" operationOwnerKey={operationOwnerKey}
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
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
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
        schemaVersion: "open-ena-ai-interpretation-response-v2", promptVersion: "open-ena-aggregate-inference-review-v2",
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
  assert.equal(await second.evaluate(() => window.jobs.length), 0, "restoration must not rerun an analysis");
  await second.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  await second.getByText("Cloud-restored synthetic AI interpretation.", { exact: true }).waitFor();
  assert.equal(await second.locator(".ena-ai-consent input").isChecked(), false, "saved records do not restore consent");
  assert.equal(await second.getByRole("button", { name: "Generate AI interpretation", exact: true }).isDisabled(), true);
  assert.equal(aiRequests, 1, "opening the other origin must not dispatch AI");
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
  assert.deepEqual(errors, []);
  const receipt = { status: "PASS", sourceOrigin: new URL(first.url()).origin, restoredOrigin: new URL(second.url()).origin,
    syntheticAiRequests: aiRequests, restoredAnalysisRuns: await second.evaluate(() => window.jobs.length),
    comparisonSets: resaved.analysisSets.length, historicalImports: resaved.historicalImports.length,
    aiRoundTrip: true, comparisonRoundTrip: true, originalImportBytesRoundTrip: true, resave: true,
    consentRestored: false, browserOnlyWarningAfterCompletedSave: false, pendingAiSaveBlocked: true, pendingSetSaveBlocked: true, removalPersisted: true };
  await writeFile(`${evidenceDir}/receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
} finally { releaseAi?.(); await browser.close(); }
