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

const workspace = readFileSync(workspacePath, "utf8");
const aiComponent = existsSync(aiComponentPath) ? readFileSync(aiComponentPath, "utf8") : "";
const types = readFileSync(typesPath, "utf8");

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

test("Stats & Export owns a dedicated AI interpretation surface without adding a sixth rail mode", () => {
  assert.equal(
    existsSync(aiComponentPath),
    true,
    "components/open-ena/OpenEnaAiInterpretation.tsx must implement the reviewed AI surface",
  );
  assert.match(
    workspace,
    /import OpenEnaAiInterpretation from ["']\.\/OpenEnaAiInterpretation["'];/,
    "the workspace must import the dedicated AI surface",
  );

  const statsPanel = workspaceStatsPanel();
  assert.match(statsPanel, /<OpenEnaAiInterpretation\b/, "Stats & Export must render the AI surface");
  assert.match(
    statsPanel,
    /<OpenEnaAiInterpretation\b[\s\S]*?request=\{[^}]+\}[\s\S]*?disabled=\{[^}]+\}/,
    "the Stats surface must pass a reviewed request preview and an explicit disabled state",
  );

  assert.match(
    types,
    /export type OpenEnaMode\s*=\s*"sets"\s*\|\s*"data"\s*\|\s*"model"\s*\|\s*"plot"\s*\|\s*"stats"\s*;/,
    "AI interpretation belongs inside Stats & Export; OpenEnaMode must remain exactly five modes",
  );
  const iconStart = workspace.indexOf("const modeIcons:");
  const iconEnd = workspace.indexOf("async function sha256Hex", iconStart);
  assert.ok(iconStart >= 0 && iconEnd > iconStart, "the five official rail icons must remain explicit");
  const iconBlock = workspace.slice(iconStart, iconEnd);
  assert.deepEqual(
    [...iconBlock.matchAll(/^\s{2}(sets|data|model|plot|stats):\s*\(/gm)].map((match) => match[1]),
    ["sets", "data", "model", "plot", "stats"],
    "the existing Sets, Data, Model, Plot Tools, and Stats & Export icons must stay unchanged",
  );
  assert.equal((iconBlock.match(/<svg\b/g) ?? []).length, 5, "the rail must still contain five mode icons");
  for (const svgContract of [
    /sets:\s*\([\s\S]*?M4 5\.5h16v5H4zm0 8h16v5H4z[\s\S]*?M7 8h\.01M7 16h\.01/,
    /data:\s*\([\s\S]*?M4 5\.5h16v13H4zM4 10h16M9 5\.5v13/,
    /model:\s*\([\s\S]*?cx="6" cy="7" r="2\.2"[\s\S]*?cx="18" cy="6" r="2\.2"[\s\S]*?cx="12" cy="18" r="2\.2"[\s\S]*?m8 7 7\.8-\.8M7\.4 8\.7l3\.5 7\.4m5\.6-8\.2-3\.4 8\.2/,
    /plot:\s*\([\s\S]*?M4 19\.5V4\.5M4 19\.5h16[\s\S]*?m6\.5 15 4-4 3 2 5-6/,
    /stats:\s*\([\s\S]*?M5 19V11h3v8zm6 0V5h3v14zm6 0V8h3v11z/,
  ]) {
    assert.match(iconBlock, svgContract, "each of the five existing rail SVG designs must remain unchanged");
  }
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
});

test("generation is disabled when there is no current result or the fitted evidence is stale", () => {
  const statsPanel = workspaceStatsPanel();
  assert.match(
    workspace,
    /const\s+resultIsStale\s*=\s*Boolean\([^;]+!sameOpenEnaConfig\(config,\s*resultConfig\)\)/,
    "the existing fitted-result staleness guard must remain authoritative",
  );
  assert.match(
    statsPanel,
    /<OpenEnaAiInterpretation\b[\s\S]*?disabled=\{[^}]*(?:!result|resultIsStale)[^}]*\}/,
    "Stats must disable AI generation for missing or stale fitted evidence",
  );
  assert.match(
    aiComponent,
    /disabled=\{[^}]*(?:disabled|!request)[^}]*\}/,
    "the component's Generate button must fail closed when no reviewed request is available",
  );
  assert.match(
    aiComponent,
    /(?:disabledReason|copy\.noCurrentResult|copy\.staleResult)/,
    "the disabled state must explain whether evidence is absent or stale",
  );
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
    /const\s+requestIdentity\s*=\s*request[\s\S]*?schemaVersion:[\s\S]*?promptVersion:[\s\S]*?locale:[\s\S]*?binding:/,
    "response validity must be bound to the complete reviewed request identity",
  );
  const invalidationEffect = aiComponent.match(
    /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[requestIdentity\]\);/,
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

test("AI output carries permanent limitations and visible provider, model, and provenance", () => {
  assert.match(
    aiComponent,
    /<aside\b[^>]*data-ena-ai-disclosure=["']permanent["'][^>]*>[\s\S]*?copy\.aiGenerated[\s\S]*?copy\.descriptiveOnly[\s\S]*?copy\.notStatisticalInference[\s\S]*?<\/aside>/,
    "AI-generated, descriptive-only, and not-statistical-inference disclosures must be permanently rendered",
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
  assert.match(copies.en.notStatisticalInference, /not (?:a )?statistical (?:test|inference)|does not establish statistical/i);
  assert.match(copies["zh-hant"].aiGenerated, /AI.*生成/u);
  assert.match(copies["zh-hant"].descriptiveOnly, /描述性/u);
  assert.match(copies["zh-hant"].notStatisticalInference, /不.*統計(?:推論|檢定)|不能取代.*統計/u);
  assert.match(copies["zh-hans"].aiGenerated, /AI.*生成/u);
  assert.match(copies["zh-hans"].descriptiveOnly, /描述性/u);
  assert.match(copies["zh-hans"].notStatisticalInference, /不.*统计(?:推断|推论|检验)|不能取代.*统计/u);

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
    assert.deepEqual(modeKeys, ["sets", "data", "model", "plot", "stats"], `${locale} must retain exactly five rail modes`);
  }
  assert.deepEqual(getOpenEnaCopy("en").modes, {
    sets: "Sets",
    data: "Data",
    model: "Model",
    plot: "Plot Tools",
    stats: "Stats & Export",
  });
  assert.deepEqual(getOpenEnaCopy("zh-hant").modes, {
    sets: "分析集",
    data: "資料",
    model: "模型",
    plot: "繪圖工具",
    stats: "統計與匯出",
  });
  assert.deepEqual(getOpenEnaCopy("zh-hans").modes, {
    sets: "分析集",
    data: "数据",
    model: "模型",
    plot: "绘图工具",
    stats: "统计与导出",
  });
});
