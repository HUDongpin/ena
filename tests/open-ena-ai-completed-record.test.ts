import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as panel from "../components/open-ena/OpenEnaAiInterpretation";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import type { SavedOpenEnaAiInterpretation } from "../lib/open-ena/cloud-workspace-extras";

const request = interpretationRequest();
const record: SavedOpenEnaAiInterpretation = {
  request, localScientificIdentity: "synthetic-science", auditReceipt: null,
  response: { schemaVersion: "open-ena-ai-interpretation-response-v2", promptVersion: request.promptVersion,
    binding: request.binding, provider: "deepseek", model: "synthetic-test", generatedAt: "2026-10-24T04:00:00.000Z",
    interpretation: { observedPatterns: [{ statement: "Synthetic retained record", evidenceRefs: ["axis-1"] }],
      contextualQuestions: ["Review context?"], limitations: ["Synthetic only"] } },
};
function status(overrides: Record<string, unknown> = {}) {
  const fn = (panel as unknown as Record<string, unknown>).openEnaAiCompletedRecordStatus;
  assert.equal(typeof fn, "function", "completed record state must be derived independently from request and consent");
  return (fn as (input: unknown) => { state: string; languageMismatch: boolean; scienceChanged: boolean })({
    record, historical: false, request, localScientificIdentity: record.localScientificIdentity, locale: "en", ...overrides,
  });
}

test("a completed record remains current for identical scientific evidence", () => {
  assert.deepEqual(status({ request: structuredClone(request) }), { state: "current", languageMismatch: false, scienceChanged: false });
});
test("science and statistical evidence changes label the completed record stale", () => {
  assert.equal(status({ localScientificIdentity: "changed-parameters" }).state, "stale");
  assert.equal(status({ request: null, localScientificIdentity: null }).state, "stale");
  const changed = structuredClone(request); changed.binding.evidenceKey = "fnv1a32-00000000";
  assert.equal(status({ request: changed }).scienceChanged, true);
  assert.equal(record.response.interpretation.observedPatterns[0].statement, "Synthetic retained record");
});
test("language changes are distinct from scientific changes in every supported locale", () => {
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    assert.deepEqual(status({ locale, request: { ...request, locale } }), {
      state: "current", scienceChanged: false, languageMismatch: locale !== "en",
    });
  }
});
test("restored records remain historical even with exactly matching evidence", () => {
  assert.equal(status({ historical: true }).state, "historical");
  assert.equal(status({ historical: true, request: null, localScientificIdentity: null }).scienceChanged, false, "absence of current review does not prove the restored science changed");
  assert.equal(status({ historical: true, localScientificIdentity: "changed" }).state, "historical");
});
test("completed record status, clearing and rate-limit wait have localized text", () => {
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    const copy = getOpenEnaCopy(locale).aiInterpretation as unknown as Record<string, string>;
    for (const key of ["clear", "recordCurrent", "recordHistorical", "recordScienceChanged", "recordLanguageMismatch", "originalLanguage", "retryAfter"]) {
      assert.ok(copy[key]?.trim(), `${locale}.${key} must be localized`);
      if (locale !== "en") assert.notEqual(copy[key], (getOpenEnaCopy("en").aiInterpretation as unknown as Record<string, string>)[key]);
    }
  }
});
test("Retry-After accepts seconds and HTTP dates without retrying early", () => {
  const fn = (panel as unknown as Record<string, unknown>).openEnaAiRetryAfter;
  assert.equal(typeof fn, "function");
  const retryAfter = fn as (value: string | null, now: number) => number;
  const now = Date.parse("2026-10-24T04:00:00.000Z");
  assert.equal(retryAfter("12", now), now + 12_000);
  assert.equal(retryAfter("Sat, 24 Oct 2026 04:01:00 GMT", now), now + 60_000);
  for (const value of [null, "invalid", "-1", "0", "Fri, 23 Oct 2026 04:00:00 GMT"]) assert.equal(retryAfter(value, now), 0);
});

test("retained audit provenance falls back to the completed response rather than the current provider configuration", () => {
  const html = renderToStaticMarkup(createElement(panel.default, {
    request: null, localScientificIdentity: null, disabled: true, disabledReason: "No current review",
    copy: getOpenEnaCopy("en").aiInterpretation, providerDescriptor: { provider: "different-provider", model: "different-current-model" },
    savedInterpretation: { ...record, auditReceipt: { id: "synthetic-receipt", durable: "true", status: "settled",
      recordedAt: "2026-10-24T04:00:00.000Z", operationId: "", requestSha256: "", consentPolicyVersion: "", provider: "", model: "" } },
  }));
  assert.match(html, /Model: synthetic-test/);
  assert.doesNotMatch(html, /different-current-model/);
});
