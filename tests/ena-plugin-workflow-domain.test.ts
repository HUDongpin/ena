import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginProposalSubmission, parseStoredPluginProposalSubmission } from "@/lib/plugin-lab/proposal";

const simple = {
  schemaVersion: 2,
  email: "Researcher@Example.org",
  title: "Compare changes over time",
  researchQuestion: "How do group discussions develop over time?",
  proposedChange: "Help compare successive periods in one fitted ENA model.",
  dataSafetyConfirmed: "yes",
  privacyConsent: "yes",
};

test("v2 intake needs only the idea, problem, proposed help and contact", () => {
  const value = parsePluginProposalSubmission(simple);
  assert.equal(value.email, "researcher@example.org");
  assert.equal(value.visibility, "private");
  assert.equal(value.track, "unsure");
  assert.equal(value.currentGap, "");
  assert.equal(value.publicSummary, "");
  assert.equal(value.privateDetails, "");
  assert.equal(value.name, null);
  assert.deepEqual(parseStoredPluginProposalSubmission(JSON.parse(JSON.stringify(value))), value);
});

test("v2 public consideration requires an explicit public summary", () => {
  assert.throws(() => parsePluginProposalSubmission({ ...simple, visibility: "public-after-review" }), /publicSummary/u);
  const value = parsePluginProposalSubmission({ ...simple, visibility: "public-after-review", publicSummary: "A tool to compare periods." });
  assert.equal(value.publicSummary, "A tool to compare periods.");
});

test("v2 optional fields remain bounded and reject unsafe content", () => {
  assert.throws(() => parsePluginProposalSubmission({ ...simple, privateDetails: "x".repeat(5001) }), /privateDetails/u);
  assert.throws(() => parsePluginProposalSubmission({ ...simple, privateDetails: "api_key=private" }), /credential/u);
  assert.throws(() => parsePluginProposalSubmission({ ...simple, referenceLinks: "http://example.org" }), /HTTPS/u);
  assert.throws(() => parsePluginProposalSubmission({ ...simple, ownerEmailRef: "forged" }), /unknown/u);
  assert.throws(() => parsePluginProposalSubmission({ ...simple, schemaVersion: 3 }), /schemaVersion/u);
});
