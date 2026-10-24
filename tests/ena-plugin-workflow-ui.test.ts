import assert from "node:assert/strict";
import test from "node:test";
import { locales } from "@/lib/i18n";
import { emptyProposalDraft, proposalPayload, validateProposalDraft, verifiedForEmail, workflowAttempt, workflowWriteIsAmbiguous } from "@/components/plugin-lab/workflow-client";
import { getPluginWorkflowCopy, pluginWorkflowError, pluginWorkflowNextStep, pluginWorkflowDate } from "@/lib/plugin-lab/workflow-i18n";
import { parsePluginProposalSubmission } from "@/lib/plugin-lab/proposal";

function minimalDraft() {
  return { ...emptyProposalDraft(), title: "Compare lessons", researchQuestion: "How do discussion networks change across lessons?", proposedChange: "Show two selected lessons in the same coordinate space.", email: "researcher@example.org", dataSafetyConfirmed: true, privacyConsent: true };
}

test("minimal private idea validates and is accepted by the v2 domain without extra details", () => {
  const draft = minimalDraft();
  assert.deepEqual(validateProposalDraft(draft, "en"), {});
  const submission = parsePluginProposalSubmission(proposalPayload(draft));
  assert.equal(submission.schemaVersion, 2);
  assert.equal(submission.visibility, "private");
  assert.equal(submission.track, "unsure");
  assert.equal(submission.currentGap, "");
  assert.equal(submission.privateDetails, "");
  assert.equal(submission.publicSummary, "");
});

test("public opt-in requires a summary without losing the researcher's private draft", () => {
  const draft = { ...minimalDraft(), visibility: "public-after-review" as const, privateDetails: "Additional context about my planned method." };
  assert.equal(validateProposalDraft(draft, "en").publicSummary, getPluginWorkflowCopy("en").requiredError);
  assert.equal(draft.privateDetails, "Additional context about my planned method.");
  const complete = { ...draft, publicSummary: "Compare discussion networks across lessons." };
  assert.deepEqual(validateProposalDraft(complete, "en"), {});
  assert.equal(parsePluginProposalSubmission(proposalPayload(complete)).visibility, "public-after-review");
});

test("inline validation identifies consent and reference-link mistakes before a request", () => {
  const missing = validateProposalDraft(emptyProposalDraft(), "en");
  assert.deepEqual(Object.keys(missing), ["title", "researchQuestion", "proposedChange", "email", "dataSafetyConfirmed", "privacyConsent"]);
  for (const referenceLinks of ["http://example.org", "https://name:password@example.org", "https://example.org\nhttps://example.org/", "not a URL", Array.from({ length: 9 }, (_, index) => `https://example.org/${index}`).join("\n")]) {
    assert.ok(validateProposalDraft({ ...minimalDraft(), referenceLinks }, "en").referenceLinks, referenceLinks);
  }
  assert.equal(validateProposalDraft({ ...minimalDraft(), referenceLinks: "https://example.org/paper\nhttps://example.org/code" }, "en").referenceLinks, undefined);
  assert.ok(validateProposalDraft({ ...minimalDraft(), privateDetails: "password: synthetic-not-a-secret" }, "en").privateDetails);
});

test("verification must match the contact email and remain unexpired", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const session = { email: "Researcher@example.org", expiresAt: "2026-10-24T13:00:00Z" };
  assert.equal(verifiedForEmail(session, " researcher@example.org ", now), true);
  assert.equal(verifiedForEmail(session, "other@example.org", now), false);
  assert.equal(verifiedForEmail(session, session.email, Date.parse(session.expiresAt)), false);
  assert.equal(verifiedForEmail({ ...session, expiresAt: "invalid" }, session.email, now), false);
  assert.equal(verifiedForEmail(null, session.email, now), false);
});

test("retry identity survives an uncertain response and rejects a changed payload", () => {
  let keys = 0;
  const key = () => `key-${++keys}`;
  const body = JSON.stringify(proposalPayload(minimalDraft()));
  const first = workflowAttempt(null, body, key);
  first.ambiguous = true;
  assert.equal(workflowAttempt(first, body, key), first);
  assert.equal(keys, 1);
  const changed = JSON.stringify(proposalPayload({ ...minimalDraft(), title: "Different idea" }));
  assert.throws(() => workflowAttempt(first, changed, key), /ambiguous-submission/u);
  assert.equal(keys, 1);
  // A request known not to have stored may be edited; unchanged retries still reuse its identity.
  const rejected = { ...first, ambiguous: false };
  assert.equal(workflowAttempt(rejected, body, key), rejected);
  assert.equal(workflowAttempt(rejected, changed, key).key, "key-2");
  assert.equal(workflowWriteIsAmbiguous(503), true);
  assert.equal(workflowWriteIsAmbiguous(409, "submission-conflict"), true);
  assert.equal(workflowWriteIsAmbiguous(401, "verification-required"), false);
});

test("all workflow locales have complete copy and explicit English fallback for unreviewed languages", () => {
  const english = getPluginWorkflowCopy("en");
  for (const locale of locales) {
    const copy = getPluginWorkflowCopy(locale);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(english).sort());
    assert.equal(copy.fallback, !["en", "zh-hans", "zh-hant"].includes(locale));
    if (copy.fallback) { assert.ok(copy.fallbackNotice); assert.equal(copy.sendCode, english.sendCode); }
    else if (locale !== "en") {
      for (const field of ["yourIdea", "sendCode", "verifyEmail", "pendingSubmission", "replyTitle", "researcherMessage", "deliveryFailed", "closedText"] as const) assert.notEqual(copy[field], english[field]);
    }
    for (const code of ["invalid-email", "invalid-code", "verification-required", "invalid-proposal", "intake-closed", "service-unavailable", "submission-conflict", "reply-conflict"]) assert.ok(pluginWorkflowError(code, locale));
  }
});

test("status guidance names the researcher's action and dates are human-readable", () => {
  assert.match(pluginWorkflowNextStep("needs-information", "en"), /reply below/u);
  assert.match(pluginWorkflowNextStep("selected", "en"), /does not mean.*scientifically verified/u);
  assert.match(pluginWorkflowNextStep("under-review", "zh-hans"), /无需/u);
  const display = pluginWorkflowDate("2026-10-24T12:00:00.000Z", "en");
  assert.match(display, /24 Oct 2026/u);
  assert.doesNotMatch(display, /T12:00:00.000Z/u);
});
