import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Locale } from "../lib/i18n";
import { getOpenEnaCopy, openEnaLocalizedLocales } from "../lib/open-ena-i18n";

const projectRoot = process.cwd();
const workspacePath = join(projectRoot, "components/open-ena/OpenEnaWorkspace.tsx");
const aiComponentPath = join(projectRoot, "components/open-ena/OpenEnaAiInterpretation.tsx");
const typesPath = join(projectRoot, "lib/open-ena/types.ts");
const globalStylesPath = join(projectRoot, "app/globals.css");

const workspace = readFileSync(workspacePath, "utf8");
const aiComponent = existsSync(aiComponentPath) ? readFileSync(aiComponentPath, "utf8") : "";
const types = readFileSync(typesPath, "utf8");
const globalStyles = readFileSync(globalStylesPath, "utf8");

type AiInterpretationCopy = Record<string, string>;

function aiCopy(locale: Locale) {
  const copy = getOpenEnaCopy(locale) as ReturnType<typeof getOpenEnaCopy> & {
    aiInterpretation?: AiInterpretationCopy;
  };
  assert.ok(
    copy.aiInterpretation,
    `Open ENA ${locale} copy must define a dedicated aiInterpretation dictionary`,
  );
  return copy.aiInterpretation;
}

function sourceBlock(source: string, marker: RegExp, label: string) {
  const match = marker.exec(source);
  assert.ok(match, `${label} must be declared`);
  const openingBrace = source.indexOf("{", match.index + match[0].length);
  assert.notEqual(openingBrace, -1, `${label} must have a function body`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace, index + 1);
    }
  }
  assert.fail(`${label} must have a complete function body`);
}

function workspaceStatsPanel() {
  const start = workspace.indexOf("function renderStatsPanel()");
  const end = workspace.indexOf("function renderSourceEvidence()", start);
  assert.notEqual(start, -1, "OpenEnaWorkspace must retain renderStatsPanel");
  assert.notEqual(end, -1, "renderStatsPanel must remain scoped before renderSourceEvidence");
  return workspace.slice(start, end);
}

function workspaceAiPanel() {
  return sourceBlock(workspace, /function renderAiPanel\(\)/, "renderAiPanel");
}

test("AI remains the fifth rail mode with native Stats evidence and explicit navigation", () => {

  const markup = shell();
  const names = [...markup.matchAll(/class="ena-rail-button"[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names, ["Data", "Model", "Plot Tools", "Stats &amp; Export", "AI-assisted interpretation"]);
  assert.match(markup, /data-ena-ai-source="stats-results"/);
  assert.match(markup, />Open Stats<\/button>/);
  assert.match(v3, /buildAiInterpretationReviewV3\(result, currentPlan, selection\)/);
  assert.doesNotMatch(moduleV3("components/open-ena/model-v3/OpenEnaNativeStatsPanelV3.tsx"), /<OpenEnaAiInterpretation/);

});

test("AI guidance remains provider-neutral with the established readable typography", () => {

  assert.match(shell(), /class="ena-panel-kicker">AI<\/p>/);
  assert.doesNotMatch(shell(), /AI · OpenRouter/);
  assert.match(aiComponent, /<p className="ena-panel-kicker">AI<\/p>/);
  assert.match(globalStyles, /\.ena-ai-stats-source-summary p\s*\{[\s\S]*?font-size:\s*calc\(0\.65rem \+ var\(--ena-font-step, 1px\) \+ 1px\);/);
  assert.match(globalStyles, /\.ena-ai-disabled-reason\s*\{[\s\S]*?font-size:/);

});

test("the researcher must review the aggregate payload and give explicit consent before generation", () => {
  assert.match(aiComponent, /data-ena-ai-payload-preview=["']reviewed-aggregate["']/);
  assert.match(
    aiComponent,
    /<details\b[\s\S]*?<summary\b[\s\S]*?<pre\b[\s\S]*?JSON\.stringify\(request,\s*null,\s*2\)/,
    "the exact aggregate request must be inspectable as formatted JSON before it is sent",
  );
  assert.match(
    aiComponent,
    /<input\b(?=[^>]*type=["']checkbox["'])(?=[^>]*checked=\{consentGranted\})(?=[^>]*onChange=\{[^}]+\})[^>]*>/,
    "consent must be a controlled checkbox, never implicit in opening the panel",
  );
  assert.match(aiComponent, /data-ena-ai-consent=["']explicit["']/);
  assert.match(
    aiComponent,
    /disabled=\{[^}]*(?:!consentGranted|consentGranted\s*===\s*false)[^}]*\}/,
    "the generate control must remain disabled until the reviewed payload is explicitly accepted",
  );
});

test("the only AI network request is a POST inside the explicit Generate handler", () => {
  const fetchCalls = [...aiComponent.matchAll(/\bfetch\s*\(/g)];
  assert.equal(fetchCalls.length, 1, "the AI surface must contain exactly one auditable fetch call");

  const handler = sourceBlock(
    aiComponent,
    /(?:async function\s+handleGenerateInterpretation\s*\([^)]*\)|const\s+handleGenerateInterpretation\s*=\s*async\s*\([^)]*\)\s*=>)/,
    "the explicit handleGenerateInterpretation handler",
  );
  assert.match(handler, /fetch\(\s*["']\/api\/open-ena\/ai-interpretation["']/);
  assert.match(handler, /method:\s*["']POST["']/);
  assert.match(handler, /body:\s*JSON\.stringify\(request\)/);
  assert.match(handler, /signal:\s*[^,}\n]*\.signal/);
  assert.match(
    aiComponent,
    /onClick=\{handleGenerateInterpretation\}/,
    "only the researcher's explicit button activation may invoke the POST handler",
  );
  assert.equal(
    handler.includes(fetchCalls[0][0]),
    true,
    "the sole fetch must be owned by handleGenerateInterpretation",
  );
  const effectBodies = [...aiComponent.matchAll(
    /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\);/g,
  )].map((match) => match[1]);
  for (const effectBody of effectBodies) {
    assert.doesNotMatch(
      effectBody,
      /fetch\s*\(|handleGenerateInterpretation\s*\(/,
      "mounting, changing tabs, or changing evidence must never automatically send AI data",
    );
  }
  assert.doesNotMatch(
    aiComponent,
    /https?:\/\/(?:openrouter|api\.openai|api\.anthropic|generativelanguage)\./i,
    "the browser must call only the owned server route, never an external provider directly",
  );
  assert.match(aiComponent, /\[OPEN_ENA_AI_CONSENT_HEADER\]:\s*OPEN_ENA_AI_CONSENT_VALUE/);
  assert.match(aiComponent, /\[OPEN_ENA_AI_OPERATION_HEADER\]:\s*operationId/);
  assert.match(aiComponent, /operationId\s*=\s*`aiop-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(aiComponent, /sessionStorage\.setItem\(requestedOperationStorageKey,\s*operationId\)/);
  assert.match(aiComponent, /if\s*\(response\.status\s*===\s*409\)\s*clearOperation\(\)/);
});

test("AI generation requires the exact current native review and full local scientific identity", () => {

  assert.match(v3, /disabled=\{!activeAiReview \|\| !current\}/);
  assert.match(v3, /localScientificIdentity=\{activeAiReview \? canonicalJsonV3\(\{ binding: activeAiReview.binding, context: activeAiReview.context, configuration: activeAiReview.configuration \}\)/);
  assert.match(aiComponent, /localScientificIdentity/);
  assert.match(aiComponent, /disabled=\{[^}]*(?:disabled|!request)[^}]*\}/);
  assert.doesNotMatch(v3, /buildOpenEnaAiInterpretationRequest\(/);

});

test("one-period native inference eligibility is independent from drawing multi-step trajectories", () => {

  assert.match(v3, /inferenceDesign === "independent" \? endpointControls && periods\[0\]/);
  assert.match(v3, /buildAiInterpretationReviewV3\(result, currentPlan, selection\)/);
  assert.match(v3, /workspaceCopy\.ai\.wireLimitations/);
  assert.match(moduleV3("lib/open-ena/ai-interpretation.ts"), /wireLimitations:/);
  assert.match(moduleV3("lib/open-ena/trajectory-presentation-v3.ts"), /steps/);
  assert.doesNotMatch(v3, /hasUsableLongitudinalView/);

});

test("the UI supports cancellation, a visible error, and an explicit retry", () => {
  assert.match(aiComponent, /useRef<AbortController\s*\|\s*null>/);
  assert.match(aiComponent, /new AbortController\(\)/);
  assert.match(
    aiComponent,
    /function\s+handleCancelInterpretation\s*\([^)]*\)\s*\{[\s\S]*?\.abort\(\)/,
    "Cancel must abort the in-flight server request",
  );
  assert.match(aiComponent, /onClick=\{handleCancelInterpretation\}/);
  assert.match(aiComponent, /if\s*\(!response\.ok\)/, "non-2xx responses must enter the error path");
  assert.match(aiComponent, /catch\s*\([^)]*\)\s*\{[\s\S]*?set[A-Za-z]*Error\(/);
  assert.match(
    aiComponent,
    /role=["']alert["'][\s\S]*?onClick=\{handleGenerateInterpretation\}/,
    "an error must stay visible beside an explicit Retry action",
  );
  assert.match(aiComponent, /copy\.cancel/);
  assert.match(aiComponent, /copy\.retry/);
});

test("changing the evidence binding aborts work, revokes consent, and makes old output unrenderable", () => {
  assert.match(
    aiComponent,
    /const\s+requestIdentity\s*=\s*request[\s\S]*?schemaVersion:[\s\S]*?promptVersion:[\s\S]*?locale:[\s\S]*?binding:[\s\S]*?evidence:/,
    "response validity must be bound to the complete reviewed request, including its exact sanitized evidence",
  );
  const invalidationEffect = aiComponent.match(
    /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*requestIdentity[^\]]*\]\);/,
  );
  assert.ok(invalidationEffect, "a complete request-identity change must have one explicit invalidation effect");
  assert.match(invalidationEffect[1], /\.abort\(\)/, "changing evidence must cancel an in-flight request");
  assert.match(invalidationEffect[1], /set[A-Za-z]*Response\(null\)/, "changing evidence must clear the old response");
  assert.match(invalidationEffect[1], /setConsentedRequestIdentity\(null\)/, "consent must be renewed for the new preview");
  assert.doesNotMatch(invalidationEffect[1], /fetch\s*\(/, "the invalidation effect must never start a replacement request");
  assert.match(
    aiComponent,
    /const\s+consentGranted\s*=\s*requestIdentity\s*!==\s*null\s*&&\s*consentedRequestIdentity\s*===\s*requestIdentity/,
    "consent must synchronously belong to the exact request being generated",
  );
  assert.match(
    aiComponent,
    /const\s+currentResponse\s*=\s*aiResponse\s*&&\s*aiResponseRequestIdentity\s*===\s*requestIdentity\s*\?\s*aiResponse\s*:\s*null/,
    "even before effects flush, a response bound to old evidence must not render",
  );
  assert.match(
    aiComponent,
    /currentRequestIdentityRef\.current\s*!==\s*requestedIdentity/,
    "a late response for an old request identity must be discarded",
  );
});

test("a deferred A generation cannot settle over a newer A generation after A to B to A", async () => {
  const module = await import("../components/open-ena/OpenEnaAiInterpretation") as Record<string, unknown>;
  type ExecuteGeneration = <T>(input: {
    task: () => Promise<T>;
    isStaleGeneration: () => boolean;
    onSuccess: (value: T) => void;
    onError: (message: string) => void;
    onSettled: () => void;
    fallbackError: string;
  }) => Promise<void>;
  const execute = module.executeOpenEnaAiGeneration as ExecuteGeneration | undefined;
  assert.equal(typeof execute, "function", "the async settlement guard must be executable without a DOM harness");

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  async function runStaleSettlement(mode: "success" | "error") {
    let activeController: AbortController | null = null;
    let currentIdentity = "";
    let status: "idle" | "loading" = "idle";
    let response = "";
    let error = "";
    let dispatchCount = 0;

    function launch(identity: string, pending: ReturnType<typeof deferred<string>>) {
      const controller = new AbortController();
      activeController = controller;
      currentIdentity = identity;
      status = "loading";
      dispatchCount += 1;
      return {
        controller,
        completion: execute!({
          task: () => pending.promise,
          isStaleGeneration: () => (
            activeController !== controller
            || controller.signal.aborted
            || currentIdentity !== identity
          ),
          onSuccess: (value) => { response = value; },
          onError: (message) => { error = message; },
          onSettled: () => {
            activeController = null;
            status = "idle";
          },
          fallbackError: "safe fallback",
        }),
      };
    }

    const oldA = deferred<string>();
    const first = launch("A", oldA);
    first.controller.abort();
    currentIdentity = "B";
    activeController = null;
    const newA = deferred<string>();
    const second = launch("A", newA);

    if (mode === "success") oldA.resolve("STALE_A_RESPONSE");
    else oldA.reject(new Error("STALE_A_PRIVATE_ERROR"));
    await first.completion;

    assert.equal(dispatchCount, 2, "settling A1 must never trigger a third dispatch");
    assert.equal(status, "loading", "A2 must remain loading after A1 settles");
    assert.equal(activeController, second.controller, "A1 must not clear A2's controller");
    assert.equal(response, "", "A1 must not publish a stale response");
    assert.equal(error, "", "A1 must not publish a stale error");

    newA.resolve("CURRENT_A_RESPONSE");
    await second.completion;
    assert.equal(response, "CURRENT_A_RESPONSE");
    assert.equal(error, "");
    assert.equal(status, "idle");
    assert.equal(activeController, null);
  }

  await runStaleSettlement("success");
  await runStaleSettlement("error");

  const handler = sourceBlock(
    aiComponent,
    /async function\s+handleGenerateInterpretation\s*\([^)]*\)/,
    "the explicit handleGenerateInterpretation handler",
  );
  assert.match(
    handler,
    /abortControllerRef\.current\s*!==\s*controller[\s\S]*?controller\.signal\.aborted[\s\S]*?currentRequestIdentityRef\.current\s*!==\s*requestedIdentity/,
    "the component must bind every settlement to both the controller token and request identity",
  );
});

test("AI output carries permanent limitations and visible provider, model, and provenance", () => {
  assert.match(
    aiComponent,
    /<aside\b[^>]*data-ena-ai-disclosure=["']permanent["'][^>]*>[\s\S]*?copy\.aiGenerated[\s\S]*?copy\.descriptiveOnly[\s\S]*?copy\.notStatisticalInference[\s\S]*?<\/aside>/,
    "AI-generated, aggregate-evidence, and no-recomputation disclosures must be permanently rendered",
  );
  assert.match(aiComponent, /<dl\b[^>]*data-ena-ai-provenance=["']true["']/);
  for (const value of [
    "currentResponse.provider",
    "currentResponse.model",
    "currentResponse.generatedAt",
    "currentResponse.promptVersion",
    "currentResponse.binding.evidenceKey",
  ]) {
    assert.ok(aiComponent.includes(`{${value}}`), `the result provenance must visibly render ${value}`);
  }
});

test("provider output is rendered as React text and never injected as HTML", () => {
  assert.doesNotMatch(aiComponent, /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/);
  assert.match(
    aiComponent,
    /observedPatterns\.map\([^=]*=>\s*\([\s\S]*?\{observation\.statement\}[\s\S]*?\)\)/,
    "observed patterns must be ordinary escaped React text nodes",
  );
  assert.match(
    aiComponent,
    /contextualQuestions\.map\([^=]*=>\s*\([\s\S]*?\{question\}[\s\S]*?\)\)/,
    "contextual questions must be ordinary escaped React text nodes",
  );
  assert.match(
    aiComponent,
    /limitations\.map\([^=]*=>\s*\([\s\S]*?\{limitation\}[\s\S]*?\)\)/,
    "limitations must be ordinary escaped React text nodes",
  );
});

test("en, zh-Hant, and zh-Hans provide complete AI UI, disclosure, and truthful privacy copy", () => {
  assert.deepEqual(
    openEnaLocalizedLocales,
    ["en", "zh-hant", "zh-hans"],
    "the three reviewed Open ENA locales must remain en, zh-Hant, and zh-Hans",
  );
  const requiredKeys = [
    "title",
    "description",
    "statsSourceLabel",
    "statsReady",
    "statsRequired",
    "openStats",
    "previewTitle",
    "previewHint",
    "consentLabel",
    "generate",
    "generating",
    "cancel",
    "retry",
    "errorTitle",
    "noCurrentResult",
    "staleResult",
    "aggregatePrivacyGate",
    "aiGenerated",
    "descriptiveOnly",
    "notStatisticalInference",
    "privacyLocal",
    "privacyExternal",
    "provider",
    "model",
    "provenance",
  ] as const;
  const copies = {
    en: aiCopy("en"),
    "zh-hant": aiCopy("zh-hant"),
    "zh-hans": aiCopy("zh-hans"),
  };

  for (const [locale, copy] of Object.entries(copies)) {
    for (const key of requiredKeys) {
      assert.equal(typeof copy[key], "string", `${locale} aiInterpretation.${key} must be a string`);
      assert.ok(copy[key].trim().length > 0, `${locale} aiInterpretation.${key} must not be blank`);
    }
  }

  assert.match(copies.en.aiGenerated, /AI[- ]generated/i);
  assert.match(copies.en.descriptiveOnly, /descriptive/i);
  assert.match(copies.en.notStatisticalInference, /does not recompute statistical tests/i);
  assert.match(copies.en.notStatisticalInference, /does not replace researcher judgment/i);
  assert.match(copies["zh-hant"].aiGenerated, /AI.*生成/u);
  assert.match(copies["zh-hant"].descriptiveOnly, /描述性/u);
  assert.match(copies["zh-hant"].notStatisticalInference, /不會重新計算統計檢定/u);
  assert.match(copies["zh-hant"].notStatisticalInference, /不能取代研究者判斷/u);
  assert.match(copies["zh-hans"].aiGenerated, /AI.*生成/u);
  assert.match(copies["zh-hans"].descriptiveOnly, /描述性/u);
  assert.match(copies["zh-hans"].notStatisticalInference, /不会重新计算统计检验/u);
  assert.match(copies["zh-hans"].notStatisticalInference, /不能取代研究者判断/u);

  assert.match(copies.en.privacyLocal, /ENA.*(?:locally|in (?:this|your) browser)|(?:locally|in (?:this|your) browser).*ENA/i);
  assert.match(copies.en.privacyLocal, /raw (?:source )?(?:rows|data).*(?:not|never).*(?:sent|uploaded)|(?:not|never).*(?:send|upload).*raw/i);
  assert.match(copies.en.privacyExternal, /optional/i);
  assert.match(copies.en.privacyExternal, /reviewed aggregate/i);
  assert.match(copies.en.privacyExternal, /external AI provider/i);
  assert.match(copies.en.privacyExternal, /consent|generate|request/i);

  for (const locale of ["zh-hant", "zh-hans"] as const) {
    assert.match(copies[locale].privacyLocal, /瀏覽器|浏览器/u);
    assert.match(copies[locale].privacyLocal, /原始.*(?:不會|不会).*(?:傳送|发送|上傳|上传)|(?:不會|不会).*(?:傳送|发送|上傳|上传).*原始/u);
    assert.match(copies[locale].privacyExternal, /可選|可选/u);
    assert.match(copies[locale].privacyExternal, /審閱|审阅/u);
    assert.match(copies[locale].privacyExternal, /彙總|汇总|聚合/u);
    assert.match(copies[locale].privacyExternal, /外部.*AI/u);
    assert.match(copies[locale].privacyExternal, /同意|生成|請求|请求/u);
  }

  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const modeKeys = Object.keys(getOpenEnaCopy(locale).modes);
    assert.deepEqual(modeKeys, ["data", "model", "plot", "stats", "ai"], `${locale} must expose AI after Stats`);
  }
  assert.deepEqual(getOpenEnaCopy("en").modes, {
    data: "Data",
    model: "Model",
    plot: "Plot Tools",
    stats: "Stats & Export",
    ai: "AI",
  });
  assert.deepEqual(getOpenEnaCopy("zh-hant").modes, {
    data: "資料",
    model: "模型",
    plot: "繪圖工具",
    stats: "統計與匯出",
    ai: "AI 解讀",
  });
  assert.deepEqual(getOpenEnaCopy("zh-hans").modes, {
    data: "数据",
    model: "模型",
    plot: "绘图工具",
    stats: "统计与导出",
    ai: "AI 解读",
  });
});
