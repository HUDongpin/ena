// #74 consumerKey includes result.createdAt, so a rebuild drops the previous
// inference panel and does not reuse binding.analyzedAt.
// Not referenced by package.json or .github/workflows/open-ena-ci.yml.
// Run: node tests/open-ena-consumer-key-created-at-browser.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const READY_HEADER = "Current native Stats result is ready for aggregate review.";
const CLEARED_HEADER = "Run and review a current native Stats result first.";
const INFERENCE_PANEL = "Researcher-requested post-model inference";

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace';
import { exportDraftV3 } from './lib/open-ena/model-artifact-exports-v3';
import { runStandardPlanV3 } from './lib/open-ena/analyze';
import { bindResultV3 } from './lib/open-ena/model-v3/result-binding';
import { compileStandardDraftV3 } from './lib/open-ena/model-v3/compiler';
import { migrateCanonicalConfigurationToDraftV3 } from './lib/open-ena/model-v3/migration';
import { parsedDatasetFromSourceProofV3 } from './lib/open-ena/model-v3/execution-plan';
const groups = ['Control', 'Treatment', 'Other'];
const horizons = ['h1', 'h2', 'h3'];
const rows = [];
for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
  const group = groups[groupIndex];
  for (let unit = 1; unit <= 3; unit += 1) {
    for (let horizonIndex = 0; horizonIndex < horizons.length; horizonIndex += 1) {
      rows.push({
        unit: group + unit,
        horizon: horizons[horizonIndex],
        group,
        A: 1 + (unit + horizonIndex + groupIndex) % 3,
        B: 1 + (horizonIndex + unit * 2 + groupIndex) % 4,
        C: 1 + (horizonIndex * 2 + unit + groupIndex * 3) % 5,
      });
    }
  }
}
const data = { name: 'retention.xlsx', source: 'upload', sizeBytes: 4096, headers: ['unit', 'horizon', 'group', 'A', 'B', 'C'], rows };
const order = { kind: 'columns', keys: [{ column: 'unit', direction: 'ascending', comparator: { type: 'text', locale: 'en-US', sensitivity: 'variant', numeric: false } }] };
const horizonOrder = { kind: 'columns', keys: [{ column: 'horizon', direction: 'ascending', comparator: { type: 'text', locale: 'en-US', sensitivity: 'variant', numeric: false } }] };
const modelType = window.__openEnaRetentionModel || 'EndPoint';
const standard = { unitColumns: ['unit'], horizonColumns: ['horizon'], groupColumn: 'group', codes: ['A', 'B', 'C'], weighting: 'frequency', model: modelType, windowType: 'Conversation', movingStanza: { backward: { kind: 'finite', value: 1 }, forward: { kind: 'finite', value: 0 }, rowOrder: order }, horizonOrder, rotation: { type: 'svd', centerAlignToOrigin: true } };
const drafts = { schemaVersion: 3, activeFamily: 'standard', standard, ona: { unitColumns: ['unit'], horizonColumns: ['horizon'], groupColumn: 'group', codes: ['C', 'B', 'A'], backward: { kind: 'finite', value: 1 }, rowOrder: order, directionalMask: { schemaVersion: 1, codeOrder: ['C', 'B', 'A'], enabled: [[true, false, true], [true, true, false], [false, true, true]] } } };
window.jobs = [];
window.missingReferenceDraft = async () => new TextDecoder().decode((await exportDraftV3({ ...standard, model: 'EndPoint', rotation: { type: 'reference', referenceId: 'missing-reference', expectedContentSha256: 'd'.repeat(64) } })).bytes);
const worker = (plan, options) => new Promise((resolve) => { window.jobs.push({ plan, signal: options.signal, resolve }); });
window.resolveRun = async (index) => {
  const job = window.jobs[index], plan = job.plan;
  const result = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 240, peakBytesObservedOrBounded: 20480, observationMethod: 'exact-counters-and-conservative-byte-bound' }, (await compileStandardDraftV3(parsedDatasetFromSourceProofV3(plan.sourceProof), plan.header.datasetSha256, migrateCanonicalConfigurationToDraftV3(plan.configuration).standard)).diagnostics);
  job.result = result;
  job.resolve({ result, sourceWitness: null });
};
createRoot(document.getElementById('root')).render(<OpenEnaWorkspace locale="en" initialSource={{ dataset: data, datasetSha256: 'c'.repeat(64), drafts }} worker={worker} />);
`;

const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: process.cwd(),
    sourcefile: "open-ena-consumer-key-created-at-browser.tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});
const script = bundle.outputFiles[0].text;
const mark = await readFile("public/ena-mark.svg", "utf8");

function syntheticResponse(body) {
  const evidenceId = body?.evidence?.descriptive?.axes?.[0]?.id;
  if (typeof evidenceId !== "string" || !body?.binding) {
    throw new Error("Synthetic AI response requires the posted v2 binding and an evidence id.");
  }
  return {
    schemaVersion: "open-ena-ai-interpretation-response-v2",
    promptVersion: "open-ena-aggregate-inference-review-v2",
    binding: body.binding,
    provider: "deepseek",
    model: "synthetic-review",
    generatedAt: "2026-09-27T06:00:00.000Z",
    interpretation: {
      observedPatterns: [{
        statement: "Synthetic aggregate pattern for workspace retention.",
        evidenceRefs: [evidenceId],
      }],
      contextualQuestions: ["Which aggregate comparison should be checked next?"],
      limitations: ["This synthetic response only exercises workspace retention."],
    },
  };
}

async function openWorkspace(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(90_000);
  const errors = [];
  const postedAnalyzedAts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.addInitScript(() => { window.__openEnaRetentionModel = "EndPoint"; });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/open-ena/ai-interpretation") {
      const body = route.request().postDataJSON();
      postedAnalyzedAts.push(body?.binding?.analyzedAt ?? null);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticResponse(body)),
      });
    }
    if (url.hostname !== "localhost") return route.abort();
    if (url.pathname === "/ena-mark.svg") return route.fulfill({ contentType: "image/svg+xml", body: mark });
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><div id=\"root\"></div>" });
  });
  await page.goto("http://localhost:31974/");
  await page.addScriptTag({ content: script });
  await page.getByTestId("open-ena-workspace-v3").waitFor();
  return { page, errors, postedAnalyzedAts };
}

async function buildModel(page) {
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const run = page.getByTestId("open-ena-run-model");
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-run-model]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  const jobsBefore = await page.evaluate(() => window.jobs.length);
  await run.click();
  await page.waitForFunction((count) => window.jobs.length === count, jobsBefore + 1);
  await page.evaluate((index) => window.resolveRun(index), jobsBefore);
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "current");
  return jobIdentity(page, jobsBefore);
}

async function jobIdentity(page, index) {
  return page.evaluate((jobIndex) => ({
    hash: window.jobs[jobIndex].result.binding.scientificResultSha256,
    createdAt: window.jobs[jobIndex].result.createdAt,
  }), index);
}

async function runInferenceAndGenerate(page) {
  await page.getByRole("button", { name: "Stats & Export", exact: true }).click();
  const infer = page.getByTestId("open-ena-persistent-analysis-panel").getByRole("button", { name: "Run confirmed inference", exact: true });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("[data-testid=open-ena-persistent-analysis-panel] button")]
      .find((candidate) => candidate.textContent === "Run confirmed inference");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await infer.click();
  await page.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  const lifecycle = page.getByTestId("open-ena-persistent-ai-lifecycle");
  await lifecycle.locator(".ena-ai-consent input").waitFor();
  await page.waitForFunction(() => {
    const box = document.querySelector("[data-testid=open-ena-persistent-ai-lifecycle] .ena-ai-consent input");
    return box instanceof HTMLInputElement && !box.disabled;
  });
  await lifecycle.locator(".ena-ai-consent input").check();
  await lifecycle.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
  await lifecycle.locator(".ena-ai-result").waitFor();
}

async function rebuild(page) {
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-run-model]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  const before = await page.evaluate(() => window.jobs.length);
  await page.getByTestId("open-ena-run-model").click();
  await page.waitForFunction((count) => window.jobs.length === count, before + 1);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await page.evaluate((index) => window.resolveRun(index), before);
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "current");
  await page.waitForTimeout(800);
  return jobIdentity(page, before);
}

async function centerAlign(page) {
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("tab", { name: /Windows,/ }).click();
  return page.getByTestId("open-ena-model-v3-windows-panel").getByRole("checkbox", {
    name: "Align target-fitted center to the origin",
  });
}

async function readAuthority(page) {
  await page.getByRole("button", { name: "Stats & Export", exact: true }).click();
  const analysis = page.getByTestId("open-ena-persistent-analysis-panel");
  const lifecycle = page.getByTestId("open-ena-persistent-ai-lifecycle");
  const inferencePanelCount = await analysis.getByRole("region", { name: INFERENCE_PANEL }).count();
  const ai = await lifecycle.evaluate((root, readyHeader) => {
    const header = [...root.querySelectorAll("header p")]
      .map((node) => node.textContent ?? "")
      .find((text) => text === readyHeader || text.startsWith("Run and review")) ?? "";
    const consent = root.querySelector(".ena-ai-consent input");
    const payloadAnalyzedAts = [...root.querySelectorAll("[data-ena-ai-payload-preview] pre")].map((node) => {
      try {
        return JSON.parse(node.textContent ?? "null")?.binding?.analyzedAt ?? null;
      } catch {
        return "unparsable";
      }
    });
    return {
      header,
      interpretation: root.querySelector(".ena-ai-result li p")?.textContent ?? "",
      consent: consent instanceof HTMLInputElement ? consent.checked : false,
      payloadAnalyzedAts,
    };
  }, READY_HEADER);
  return {
    activeInference: inferencePanelCount === 0 ? null : "resurrected",
    inferencePanelCount,
    ...ai,
  };
}

function assertCleared(label, observed, createdAt) {
  assert.deepEqual(observed, {
    activeInference: null,
    inferencePanelCount: 0,
    header: CLEARED_HEADER,
    interpretation: "",
    consent: false,
    payloadAnalyzedAts: observed.payloadAnalyzedAts.map(() => createdAt),
  }, `#74 ${label}: activeInference must be null and every AI request binding.analyzedAt must equal the new result.createdAt ${createdAt}`);
}

const failures = [];
const browser = await chromium.launch({ headless: true });
try {
  {
    const session = await openWorkspace(browser);
    const { page } = session;
    try {
      const first = await buildModel(page);
      await runInferenceAndGenerate(page);
      const before = await readAuthority(page);
      assert.equal(before.activeInference, "resurrected", "path A setup must show the confirmed inference panel");
      assert.deepEqual(before.payloadAnalyzedAts, [first.createdAt]);
      const postsBeforeRebuild = session.postedAnalyzedAts.length;
      const rebuilt = await rebuild(page);
      const after = await readAuthority(page);
      const postedAfterRebuild = session.postedAnalyzedAts.slice(postsBeforeRebuild);
      const observation = {
        path: "A",
        first,
        rebuilt,
        before,
        after,
        postedAfterRebuild,
        pageErrors: session.errors,
      };
      console.log(`ISSUE74_OBSERVATION ${JSON.stringify(observation)}`);
      assert.equal(rebuilt.hash, first.hash, "path A rebuild must keep the scientific result hash");
      assert.notEqual(rebuilt.createdAt, first.createdAt, "path A rebuild must mint a new result.createdAt");
      assertCleared("path A identical rebuild while current", {
        ...after,
        payloadAnalyzedAts: [...after.payloadAnalyzedAts, ...postedAfterRebuild],
      }, rebuilt.createdAt);
      assert.deepEqual(session.errors, []);
    } catch (error) {
      failures.push(error);
    } finally {
      await page.close();
    }
  }
  {
    const session = await openWorkspace(browser);
    const { page } = session;
    try {
      const first = await buildModel(page);
      await runInferenceAndGenerate(page);
      const divergentControl = await centerAlign(page);
      await divergentControl.uncheck();
      await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "stale");
      const divergent = await rebuild(page);
      const afterDivergent = await readAuthority(page);
      const restoredControl = await centerAlign(page);
      await restoredControl.check();
      await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "stale");
      const postsBeforeRestore = session.postedAnalyzedAts.length;
      const restored = await rebuild(page);
      const after = await readAuthority(page);
      const postedAfterRestore = session.postedAnalyzedAts.slice(postsBeforeRestore);
      const observation = {
        path: "B",
        first,
        divergent,
        afterDivergent,
        restored,
        after,
        postedAfterRestore,
        pageErrors: session.errors,
      };
      console.log(`ISSUE74_OBSERVATION ${JSON.stringify(observation)}`);
      assert.notEqual(divergent.hash, first.hash, "path B must leave the original hash while stale");
      assert.notEqual(divergent.createdAt, first.createdAt);
      assertCleared("path B rebuild away from the original hash", afterDivergent, divergent.createdAt);
      assert.equal(restored.hash, first.hash, "path B must rebuild back to the original scientific result hash");
      assert.notEqual(restored.createdAt, first.createdAt, "path B return rebuild must mint a new result.createdAt");
      assertCleared("path B rebuild back to the same hash", {
        ...after,
        payloadAnalyzedAts: [...after.payloadAnalyzedAts, ...postedAfterRestore],
      }, restored.createdAt);
      assert.deepEqual(session.errors, []);
    } catch (error) {
      failures.push(error);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  const message = failures.map((error) => error instanceof Error ? error.message : String(error)).join("\n\n");
  throw new Error(message);
}
console.log("#74 consumerKey createdAt browser regressions PASS");
