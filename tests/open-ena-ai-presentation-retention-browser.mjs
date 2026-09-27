import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// Component-level retention: a real v2 request is built in the browser, and the
// route returns a synthetic response that echoes that request. No provider call.
const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import Ai from './components/open-ena/OpenEnaAiInterpretation';
      import { getOpenEnaCopy } from './lib/open-ena-i18n';
      import { analyzeDataset } from './lib/open-ena/analyze';
      import { parseCsv } from './lib/open-ena/csv';
      import { buildPairwiseGroupContrast } from './lib/open-ena/contrasts';
      import { runOpenEnaInferenceV2 } from './lib/open-ena/inference-v2';
      import { buildOpenEnaAiInterpretationRequest } from './lib/open-ena/ai-interpretation';
      import { datasetHashKindFor } from './lib/open-ena/types';

      const HASH = 'b'.repeat(64);
      const ANALYZED_AT = '2026-09-27T06:00:00.000Z';
      const LOCAL = 'retention-local-identity';

      function bindResult(result, configuration) {
        return {
          ...result,
          analyzedAt: ANALYZED_AT,
          provenanceBinding: {
            datasetNormalizedUtf8TextSha256: HASH,
            datasetHashKind: 'normalized-utf8-csv-text-sha256',
            configuration: structuredClone(configuration),
          },
        };
      }

      async function endpointRequest(primary, secondary) {
        const rows = ['Group,Lesson,Name,CodeA,CodeB,CodeC'];
        for (let index = 0; index < 3; index += 1) {
          rows.push(primary + ',1,Unit ' + primary + ' ' + (index + 1) + ',1,' + (index % 2) + ',' + ((index + 1) % 2));
          rows.push(secondary + ',1,Unit ' + secondary + ' ' + (index + 1) + ',' + (index % 2) + ',1,' + ((index + 1) % 2));
        }
        const dataset = parseCsv(rows.join('\\n') + '\\n', { name: 'retention.csv', source: 'upload' });
        const config = {
          unitColumns: ['Group', 'Name'],
          conversationColumns: ['Lesson'],
          groupColumn: 'Group',
          codes: ['CodeA', 'CodeB', 'CodeC'],
          model: 'EndPoint',
          window: 'Conversation',
          windowSizeBack: 5,
          windowSizeForward: 0,
          weightBy: 'binary',
          rotation: 'svd',
          referenceRotationId: null,
          centerAlignToOrigin: true,
        };
        const result = bindResult(analyzeDataset(dataset, config), config);
        const axes = result.dimensions.slice(0, 2);
        const contrast = buildPairwiseGroupContrast(result, config, primary, secondary, axes, ANALYZED_AT);
        const currentInference = await runOpenEnaInferenceV2({
          request: { kind: 'endpoint-independent', primaryGroup: primary, secondaryGroup: secondary, axes },
          result,
          currentBinding: {
            datasetNormalizedUtf8TextSha256: HASH,
            datasetHashKind: datasetHashKindFor(dataset),
            configuration: config,
          },
        });
        return buildOpenEnaAiInterpretationRequest({
          locale: 'en',
          result,
          config,
          datasetHash: HASH,
          groupContrast: contrast,
          longitudinalView: null,
          currentInference,
        });
      }

      function spec(request, locale) {
        return { request, localScientificIdentity: LOCAL, locale };
      }

      window.__aiReady = (async () => {
        const base = await endpointRequest('Primary', 'Secondary');
        const evidence = await endpointRequest('Secondary', 'Primary');
        const localeRequest = structuredClone(base);
        localeRequest.locale = 'zh-hant';
        window.__requests = {
          base: spec(base, 'en'),
          equal: spec(structuredClone(base), 'en'),
          locale: spec(localeRequest, 'zh-hant'),
          evidence: spec(evidence, 'en'),
        };
      })().catch((error) => {
        window.__aiError = error instanceof Error ? error.stack || error.message : String(error);
      });

      function Harness() {
        const [current, setCurrent] = useState(null);
        const [serial, setSerial] = useState(0);
        window.renderAi = (name) => {
          const source = window.__requests[name];
          setCurrent({
            request: structuredClone(source.request),
            localScientificIdentity: source.localScientificIdentity,
            locale: source.locale,
          });
          setSerial((value) => value + 1);
        };
        if (!current) return <p data-render-serial={serial}>waiting</p>;
        return (
          <div data-render-serial={serial}>
            <Ai
              request={current.request}
              localScientificIdentity={current.localScientificIdentity}
              copy={getOpenEnaCopy(current.locale).aiInterpretation}
              disabled={false}
              disabledReason=""
            />
          </div>
        );
      }

      createRoot(document.getElementById('root')).render(<Harness />);
    `,
    loader: "tsx",
    resolveDir: process.cwd(),
    sourcefile: "open-ena-ai-presentation-retention-browser.tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});

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
        statement: "Synthetic aggregate pattern for retention.",
        evidenceRefs: [evidenceId],
      }],
      contextualQuestions: ["Which aggregate comparison should be checked next?"],
      limitations: ["This synthetic response only exercises retention."],
    },
  };
}

async function openHarness(browser, fulfill) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let fetches = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/open-ena/ai-interpretation") {
      fetches += 1;
      return fulfill(route, fetches);
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
  });
  await page.goto("http://localhost:31994/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.__requests || window.__aiError);
  const startupError = await page.evaluate(() => window.__aiError ?? "");
  assert.equal(startupError, "", startupError);
  return {
    page,
    errors,
    fetchCount: () => fetches,
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const result = document.querySelector(".ena-ai-result");
    const consent = document.querySelector(".ena-ai-consent input");
    const generate = document.querySelector(".ena-ai-actions button");
    const evidenceKey = [...document.querySelectorAll(".ena-ai-provenance div")].find((row) => row.querySelector("dt")?.textContent === "Evidence key" || row.querySelector("dt")?.textContent === "證據鍵")?.querySelector("dd")?.textContent ?? "";
    return {
      text: result?.innerText ?? "",
      evidenceKey,
      consent: consent instanceof HTMLInputElement ? consent.checked : false,
      generateDisabled: generate instanceof HTMLButtonElement ? generate.disabled : true,
      alert: document.querySelector("[role=alert]")?.innerText ?? "",
    };
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const success = await openHarness(browser, async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(syntheticResponse(route.request().postDataJSON())),
  }));
  await success.page.evaluate(() => window.renderAi("base"));
  await success.page.waitForFunction(() => document.querySelector(".ena-ai-consent input") instanceof HTMLInputElement);
  await success.page.locator(".ena-ai-consent input").check();
  await success.page.locator(".ena-ai-actions button").click();
  await success.page.locator(".ena-ai-result").waitFor();
  const retained = await snapshot(success.page);
  assert.match(retained.text, /Synthetic aggregate pattern for retention/);
  assert.ok(retained.evidenceKey.length > 0);
  assert.equal(retained.consent, true);
  assert.equal(success.fetchCount(), 1);

  await success.page.evaluate(() => window.renderAi("equal"));
  await success.page.waitForFunction(() => document.querySelector("[data-render-serial]")?.getAttribute("data-render-serial") === "2");
  assert.deepEqual(await snapshot(success.page), retained);
  assert.equal(success.fetchCount(), 1, "a structurally equal re-render must not request another interpretation");

  await success.page.evaluate(() => window.renderAi("locale"));
  await success.page.waitForFunction(() => !document.querySelector(".ena-ai-result") && document.querySelector(".ena-ai-consent input")?.checked === false);
  assert.equal(success.fetchCount(), 1, "a locale change clears the interpretation without a new request");
  const localeCleared = await snapshot(success.page);
  assert.equal(localeCleared.text, "");
  assert.equal(localeCleared.evidenceKey, "");
  assert.equal(localeCleared.consent, false);

  await success.page.evaluate(() => window.renderAi("evidence"));
  await success.page.waitForFunction(() => document.querySelector("[data-render-serial]")?.getAttribute("data-render-serial") === "4");
  const evidenceCleared = await snapshot(success.page);
  assert.equal(evidenceCleared.text, "");
  assert.equal(evidenceCleared.consent, false);
  assert.equal(evidenceCleared.generateDisabled, true);
  assert.equal(success.fetchCount(), 1, "an evidence change clears consent and does not fetch");
  assert.deepEqual(success.errors, []);
  await success.page.close();

  const recovery = await openHarness(browser, async (route, count) => {
    if (count === 1) {
      const id = route.request().headers()["x-open-ena-ai-operation-id"];
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic unavailable response" }),
        headers: {
          "x-open-ena-ai-retry": "new-operation",
          "x-open-ena-ai-operation-id": id,
        },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(syntheticResponse(route.request().postDataJSON())),
    });
  });
  await recovery.page.evaluate(() => window.renderAi("base"));
  await recovery.page.locator(".ena-ai-consent input").check();
  await recovery.page.locator(".ena-ai-actions button").click();
  const alert = recovery.page.getByRole("alert");
  await alert.waitFor();
  assert.equal(recovery.fetchCount(), 1, "a failed interpretation must not retry by itself");
  assert.equal(await recovery.page.locator(".ena-ai-result").count(), 0);
  await alert.getByRole("button", { name: "Retry" }).click();
  await recovery.page.locator(".ena-ai-result").waitFor();
  const recovered = await snapshot(recovery.page);
  assert.match(recovered.text, /Synthetic aggregate pattern for retention/);
  assert.equal(recovered.consent, true);
  assert.equal(recovered.alert, "");
  assert.equal(recovery.fetchCount(), 2);
  assert.deepEqual(recovery.errors, []);
  await recovery.page.close();
  console.log("AI presentation retention: equal re-render keeps result and consent; locale and evidence clear them; failure then retry recovers PASS");
} finally {
  await browser.close();
}
