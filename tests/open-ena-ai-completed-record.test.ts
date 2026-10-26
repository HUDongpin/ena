import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as panel from "../components/open-ena/OpenEnaAiInterpretation";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import { openEnaAiLocalScientificIdentityV3 } from "../lib/open-ena/workspace-consumer-authority-v3";
import { captureSavedOpenEnaAiInterpretation, type SavedOpenEnaAiInterpretation } from "../lib/open-ena/cloud-workspace-extras";

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
test("known workspace invalidation labels a restored record without granting current authority", () => {
  assert.deepEqual(status({ historical: true, request: null, localScientificIdentity: null, historicalEvidenceInvalidated: true }), {
    state: "historical", scienceChanged: true, languageMismatch: false,
  });
  assert.equal(status({ historical: true, historicalEvidenceInvalidated: true }).scienceChanged, true,
    "known edits remain visible while a matching old preview is still present");
  assert.equal(status({ historicalEvidenceInvalidated: true }).scienceChanged, false,
    "a new successful live record is judged against its own evidence, not the restoration baseline");
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
  const provenance = /<dl class="ena-ai-provenance"[^>]*>([\s\S]*?)<\/dl>/u.exec(html)?.[0];
  assert.ok(provenance, "the retained record must expose its own provenance");
  assert.match(provenance, /Model: synthetic-test/);
  assert.doesNotMatch(provenance, /different-current-model/);
});

const originalNativeScience = {
  binding: { scientificResultSha256: "a".repeat(64), datasetSha256: "b".repeat(64) },
  configuration: { analysisFamily: "standard", analysis: { model: { type: "EndPoint" } } },
  context: { axes: ["SVD1", "SVD2"], primaryGroup: { type: "string", value: "Primary" }, secondaryGroup: { type: "string", value: "Secondary" } },
};
const nativeRecord = { ...record, localScientificIdentity: openEnaAiLocalScientificIdentityV3(originalNativeScience)! };
const currentNativeResult = { binding: originalNativeScience.binding, configuration: originalNativeScience.configuration, createdAt: record.request.binding.analyzedAt };
function savedWorkspaceChanged(overrides: Record<string, unknown> = {}) {
  const fn = (panel as unknown as Record<string, unknown>).openEnaAiSavedWorkspaceEvidenceChanged;
  assert.equal(typeof fn, "function", "historical mismatch must be derived from the AI record's original native provenance");
  return (fn as (input: unknown) => boolean)({ record: nativeRecord, result: currentNativeResult,
    comparisonContext: originalNativeScience.context, ...overrides });
}
test("saved comparison mismatch is detected from original typed controls after the mount baseline resets", () => {
  assert.equal(savedWorkspaceChanged(), false);
  assert.equal(savedWorkspaceChanged({ comparisonContext: { ...originalNativeScience.context,
    primaryGroup: { type: "string", value: "Other" } } }), true);
  assert.equal(savedWorkspaceChanged({ comparisonContext: { ...originalNativeScience.context, axes: ["SVD1", "SVD3"] } }), true);
  assert.equal(savedWorkspaceChanged({ comparisonContext: null }), true);
});
test("a rebuilt current result is compared with the original AI binding, configuration and analysis timestamp", () => {
  assert.equal(savedWorkspaceChanged({ result: { ...currentNativeResult, binding: { ...currentNativeResult.binding, scientificResultSha256: "c".repeat(64) } } }), true);
  assert.equal(savedWorkspaceChanged({ result: { ...currentNativeResult, configuration: { ...currentNativeResult.configuration, changed: true } } }), true);
  assert.equal(savedWorkspaceChanged({ result: { ...currentNativeResult, createdAt: "2026-10-24T12:00:00.000Z" } }), true);
  assert.equal(savedWorkspaceChanged({ result: null }), true);
});
test("saved provenance comparison ignores presentation and missing live authority, and tolerates opaque older identities", () => {
  assert.equal(savedWorkspaceChanged({ comparisonContext: { ...originalNativeScience.context, plotZoom: 2, showPoints: false } }), false);
  for (const identity of ["legacy-opaque-identity", "{}", "null", "[]"]) {
    assert.equal(savedWorkspaceChanged({ record: { ...nativeRecord, localScientificIdentity: identity } }), false,
      "unknown provenance cannot prove a change or grant currentness");
  }
});
test("trajectory selection compares original periods and design without restoring identity confirmation", () => {
  const trajectory = { ...originalNativeScience, context: {
    axes: ["SVD1", "SVD2"], identityConfirmed: true, frameIndexHorizons: ["h1", "h2"], unitSequences: [], scientificContextSha256: "d".repeat(64),
    request: { kind: "trajectory-paired-periods", group: { type: "string", value: "Primary" },
      earlierPeriod: [{ column: "horizon", value: { type: "string", value: "h1" } }],
      laterPeriod: [{ column: "horizon", value: { type: "string", value: "h2" } }], cohortPolicy: "pairwise-complete" },
  } };
  const saved = { ...record, localScientificIdentity: openEnaAiLocalScientificIdentityV3(trajectory)! };
  const comparisonContext = { axes: trajectory.context.axes, request: trajectory.context.request, identityConfirmed: false };
  assert.equal(savedWorkspaceChanged({ record: saved, comparisonContext }), false);
  assert.equal(savedWorkspaceChanged({ record: saved, comparisonContext: { ...comparisonContext,
    request: { ...comparisonContext.request, laterPeriod: [{ column: "horizon", value: { type: "string", value: "h3" } }] } } }), true);
});

test("an admitted opaque historical identity cannot crash the workspace provenance comparison", () => {
  const identity = '{"binding":{"legacyNumber":1e400},"configuration":{},"context":{"axes":["SVD1","SVD2"],"primaryGroup":"a","secondaryGroup":"b"}}';
  const admitted = captureSavedOpenEnaAiInterpretation({ ...record, localScientificIdentity: identity });
  assert.equal(admitted.localScientificIdentity, identity);
  assert.equal(savedWorkspaceChanged({ record: admitted }), false,
    "noncanonical historical provenance remains readable but cannot establish a scientific mismatch");
  assert.equal(savedWorkspaceChanged({ record: admitted, result: null }), false,
    "missing current science does not make noncanonical historical provenance trustworthy");
});
