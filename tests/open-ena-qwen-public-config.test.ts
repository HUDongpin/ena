import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getOpenEnaAiProviderDescriptor, OPEN_ENA_AI_PROVIDER_CONSENT_HEADER, openEnaAiProviderConsentKey } from "../lib/open-ena/ai-provider";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import OpenEnaAiInterpretation from "../components/open-ena/OpenEnaAiInterpretation";
import { openEnaAiFailureRecovery } from "../components/open-ena/OpenEnaAiInterpretation";
import { createOpenEnaAiOperationStore, openEnaAiOperationScope } from "../lib/open-ena/ai-operation-storage";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";

const qwen = getOpenEnaAiProviderDescriptor({ OPEN_ENA_AI_PROVIDER: "qwen" });
function panel(locale: "en" | "zh-hans" | "zh-hant", historical = false) {
  const request = interpretationRequest(locale);
  return renderToStaticMarkup(createElement(OpenEnaAiInterpretation, {
    locale, request, copy: getOpenEnaCopy(locale).aiInterpretation, disabled: false, disabledReason: "", providerDescriptor: qwen,
    ...(historical ? { savedInterpretation: { request, localScientificIdentity: "historical-science", auditReceipt: null,
      response: { schemaVersion: "open-ena-ai-interpretation-response-v2" as const, promptVersion: request.promptVersion, binding: request.binding,
        provider: "deepseek" as const, model: "historical-deepseek-model", generatedAt: "2026-10-24T04:00:00.000Z",
        interpretation: { observedPatterns: [{ statement: "Retained earlier interpretation", evidenceRefs: ["axis-1"] }], contextualQuestions: [], limitations: ["Historical synthetic record"] } } } } : {}),
  }));
}

test("Qwen public descriptor binds the fixed model and Beijing endpoint region", () => {
  assert.deepEqual(getOpenEnaAiProviderDescriptor({ OPEN_ENA_AI_PROVIDER: "qwen" }), {
    provider: "qwen", displayName: "Alibaba Cloud Model Studio · Qwen", model: "qwen3.7-plus-2026-05-26", processingRegion: "cn-beijing",
  });
});
test("legacy deployments retain DeepSeek only when the provider is not explicitly changed", () => {
  assert.deepEqual(getOpenEnaAiProviderDescriptor({}), { provider: "deepseek", displayName: "DeepSeek", model: "deepseek-flash", processingRegion: "provider-managed" });
});
test("unknown providers and mismatched models fail closed without reflecting configuration values", () => {
  for (const environment of [
    { OPEN_ENA_AI_PROVIDER: "unknown-private-value" },
    { OPEN_ENA_AI_PROVIDER: "qwen", OPEN_ENA_AI_MODEL: "deepseek-flash" },
    { OPEN_ENA_AI_PROVIDER: "deepseek", OPEN_ENA_AI_MODEL: "qwen3.7-plus-2026-05-26" },
  ]) assert.throws(() => getOpenEnaAiProviderDescriptor(environment), { message: "Invalid Open ENA AI provider configuration." });
});

test("current Qwen consent discloses model, Beijing access, aggregate scope and retention in all three languages", () => {
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    const html = panel(locale);
    assert.match(html, /Alibaba Cloud Model Studio|阿里云百炼|阿里雲百煉/u);
    assert.match(html, /qwen3\.7-plus-2026-05-26/u); assert.match(html, /cn-beijing/u);
    assert.match(html, /Beijing|北京/u); assert.doesNotMatch(html, /DeepSeek/u);
    assert.match(html, /not guaranteed|不保證|不保证/u);
    assert.match(html, /raw source rows|原始資料列|原始数据行/u);
    assert.match(html, /without authorization|未經授權|未经授权/u);
    assert.match(html, /help\.aliyun\.com\/zh\/model-studio\/beijing-access-information/u);
    assert.match(html, /help\.aliyun\.com\/zh\/model-studio\/privacy-notice/u);
    assert.match(html, /data-ena-ai-consent="explicit"/u);
  }
});

test("historical DeepSeek provenance remains visible beside the current Qwen disclosure", () => {
  const html = panel("en", true);
  assert.match(html, /qwen3\.7-plus-2026-05-26/u);
  assert.match(html, /<dd>deepseek<\/dd>/u);
  assert.match(html, /<dd>historical-deepseek-model<\/dd>/u);
  assert.match(html, /Retained earlier interpretation/u);
});

test("provider disclosure participates in existing consent invalidation and the page uses shared selection", () => {
  const source = readFileSync("components/open-ena/OpenEnaAiInterpretation.tsx", "utf8");
  assert.match(source, /requestIdentity = [^\n]*providerIdentity/u);
  assert.match(source, /providerIdentity = [^\n]*providerDescriptor/u);
  const page = readFileSync("app/[locale]/open-ena/page.tsx", "utf8");
  assert.match(page, /getOpenEnaAiProviderDescriptor\(process\.env\)/u);
  assert.doesNotMatch(page, /provider:\s*"DeepSeek"|server\/deepseek-client/u);
});

test("production example pairs Qwen with its pinned model and dedicated key", () => {
  const source = readFileSync(".env.example", "utf8");
  assert.match(source, /^OPEN_ENA_AI_PROVIDER=qwen$/mu);
  assert.match(source, /^OPEN_ENA_AI_MODEL=qwen3\.7-plus-2026-05-26$/mu);
  assert.match(source, /^OPEN_ENA_QWEN_API_KEY=$/mu);
  assert.doesNotMatch(source, /^DASHSCOPE_API_KEY=/mu);
});

test("the consent header binds provider, model, region and disclosure policy", () => {
  const key = openEnaAiProviderConsentKey(qwen);
  assert.equal(OPEN_ENA_AI_PROVIDER_CONSENT_HEADER, "x-open-ena-ai-provider-consent");
  assert.equal(key, "provider-v1:qwen:qwen3.7-plus-2026-05-26:cn-beijing");
  for (const changed of [{ ...qwen, provider: "deepseek" }, { ...qwen, model: "different-model" }, { ...qwen, processingRegion: "different-region" }]) assert.notEqual(openEnaAiProviderConsentKey(changed), key);
  assert.match(readFileSync("components/open-ena/OpenEnaAiInterpretation.tsx", "utf8"), /\[OPEN_ENA_AI_PROVIDER_CONSENT_HEADER\]: providerIdentity/u);
});

test("Qwen operations cannot adopt persisted DeepSeek IDs and never delete those records", () => {
  const request = interpretationRequest(), owner = "a".repeat(64), consentKey = openEnaAiProviderConsentKey(qwen);
  const legacy = openEnaAiOperationScope(request, owner), current = openEnaAiOperationScope(request, owner, consentKey);
  assert.match(legacy.key, /^open-ena-ai-operation-v4:/u); assert.notEqual(current.key, legacy.key); assert.deepEqual(current.legacyKeys, []);
  const oldId = "aiop-11111111-1111-4111-8111-111111111111", newId = "aiop-22222222-2222-4222-8222-222222222222";
  const values = new Map([[legacy.key, oldId], ...legacy.legacyKeys.map(key => [key, oldId] as [string, string])]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createOpenEnaAiOperationStore(() => storage);
  assert.equal(store.read(current), null); store.set(current, newId); store.markSettledRetry(current, newId);
  const remounted = createOpenEnaAiOperationStore(() => storage);
  assert.equal(remounted.read(current), newId); assert.equal(remounted.hasSettledRetry(current, newId), true);
  remounted.close(current, newId);
  for (const key of [legacy.key, ...legacy.legacyKeys]) assert.equal(values.get(key), oldId);
  assert.equal(remounted.read(legacy), oldId);
});

test("memory-only retry ownership is isolated by provider disclosure", () => {
  const request = interpretationRequest(), owner = "b".repeat(64);
  const legacy = openEnaAiOperationScope(request, owner), current = openEnaAiOperationScope(request, owner, openEnaAiProviderConsentKey(qwen));
  const store = createOpenEnaAiOperationStore(() => { throw new Error("storage restricted"); });
  const id = "aiop-33333333-3333-4333-8333-333333333333";
  store.set(legacy, id); assert.equal(store.read(current), null); assert.equal(store.read(legacy), id);
});

test("provider consent failures require refreshing and reviewing instead of blind retry", () => {
  assert.equal(openEnaAiFailureRecovery(428, undefined, "provider-consent-required"), "local-only");
  assert.equal(openEnaAiFailureRecovery(409, undefined, "provider-consent-changed"), "local-only");
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    const message = getOpenEnaCopy(locale).aiInterpretation.providerConsentChanged;
    assert.match(message, /provider|供應商|供应商/u); assert.match(message, /[Rr]eload|重新載入|重新加载/u);
  }
});
