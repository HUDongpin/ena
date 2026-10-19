import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_ENA_AI_MAX_REQUEST_BYTES,
  parseOpenEnaAiInterpretationRequestV2,
} from "../lib/open-ena/ai-interpretation";
import { OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1 } from "../lib/server/open-ena-ai-prompt-evaluation";

function repeatedRequest() {
  const fixture = OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1.find((entry) => (
    entry.designKind === "trajectory-repeated-periods"
  ));
  assert.ok(fixture);
  return structuredClone(fixture.request);
}

function refreshEvidenceKey(request: ReturnType<typeof repeatedRequest>) {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(request.evidence)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  request.binding.evidenceKey = `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  return request;
}

function sparseRepeatedRequest() {
  const request = repeatedRequest();
  if (request.evidence.scope.kind !== "trajectory-repeated-periods") throw new Error("Unexpected fixture scope");
  request.evidence.scope.selectedPeriodIndices = [0, 2, 4];
  request.evidence.scope.periodCount = 5;
  request.evidence.descriptive.trajectory!.periodCount = 5;
  for (const period of request.evidence.descriptive.trajectory!.groupPeriods) {
    period.periodIndex *= 2;
    period.id = `trajectory-${period.groupRole}-period-${period.periodIndex + 1}`;
  }
  for (const member of request.evidence.inference) {
    if (member.test === "friedman") member.selectedPeriodIndices = [0, 2, 4];
    if (member.test === "wilcoxon-signed-rank") {
      member.earlierPeriodIndex *= 2;
      member.laterPeriodIndex *= 2;
      member.id = `posthoc-${member.axisRole}-period-${member.earlierPeriodIndex + 1}-period-${member.laterPeriodIndex + 1}`;
    }
  }
  for (const omission of request.evidence.inferenceOmissions) {
    omission.earlierPeriodIndex! *= 2;
    omission.laterPeriodIndex! *= 2;
    omission.id = `posthoc-${omission.axisRole}-period-${omission.earlierPeriodIndex! + 1}-period-${omission.laterPeriodIndex! + 1}`;
  }
  return refreshEvidenceKey(request);
}

test("AI rejects missing planned members before allocating the repeated-period pair universe", (context) => {
  const request = repeatedRequest();
  assert.equal(request.evidence.scope.kind, "trajectory-repeated-periods");
  if (request.evidence.scope.kind !== "trajectory-repeated-periods") return;
  request.evidence.scope.selectedPeriodIndices = Array.from({ length: 20 }, (_, index) => index);
  request.evidence.scope.periodCount = 20;
  request.evidence.descriptive.trajectory!.periodCount = 20;
  const originalSet = Map.prototype.set;
  let plannedPairAllocations = 0;
  context.mock.method(Map.prototype, "set", function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
    if (typeof key === "string" && key.startsWith("posthoc-axis-")) plannedPairAllocations += 1;
    return originalSet.call(this, key, value);
  });
  assert.throws(() => parseOpenEnaAiInterpretationRequestV2(request), /every planned member exactly once/u);
  assert.equal(plannedPairAllocations, 0, "cardinality rejection must not construct missing pair records");
});

test("all approved design fixtures preserve their exact parsed requests", () => {
  for (const fixture of OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1) {
    assert.deepEqual(parseOpenEnaAiInterpretationRequestV2(structuredClone(fixture.request)), fixture.request);
  }
});

test("an 8,000-period request within the byte limit rejects missing planned members without pair expansion", () => {
  const request = repeatedRequest();
  if (request.evidence.scope.kind !== "trajectory-repeated-periods") throw new Error("Unexpected fixture scope");
  request.evidence.scope.selectedPeriodIndices = Array.from({ length: 8_000 }, (_, index) => index);
  request.evidence.scope.periodCount = 8_000;
  request.evidence.descriptive.trajectory!.periodCount = 8_000;
  request.evidence.inference = [];
  request.evidence.inferenceOmissions = [];
  assert.ok(Buffer.byteLength(JSON.stringify(request)) < OPEN_ENA_AI_MAX_REQUEST_BYTES);
  assert.throws(() => parseOpenEnaAiInterpretationRequestV2(request), /every planned member exactly once/u);
});

test("planned members accept sparse selected periods and either supplied member order", () => {
  const request = sparseRepeatedRequest();
  assert.deepEqual(parseOpenEnaAiInterpretationRequestV2(request), request);
  request.evidence.inference.reverse();
  request.evidence.inferenceOmissions.reverse();
  refreshEvidenceKey(request);
  assert.deepEqual(parseOpenEnaAiInterpretationRequestV2(request), request);
});

const invalidOmissions = [
  ["unselected period", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.earlierPeriodIndex = 1;
    entry.id = "posthoc-axis-1-period-2-period-3";
  }],
  ["reversed periods", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.earlierPeriodIndex = 2;
    entry.laterPeriodIndex = 0;
    entry.id = "posthoc-axis-1-period-3-period-1";
  }],
  ["equal periods", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.laterPeriodIndex = 0;
    entry.id = "posthoc-axis-1-period-1-period-1";
  }],
  ["missing period", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.earlierPeriodIndex = null;
  }],
  ["noncanonical ID", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.id = "posthoc-axis-1-period-01-period-3";
  }],
  ["axis role inconsistent with ID", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.axisRole = "axis-2";
  }],
  ["wrong family", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.familyRole = "comparison-family";
  }],
  ["wrong test", (entry: ReturnType<typeof repeatedRequest>["evidence"]["inferenceOmissions"][number]) => {
    entry.test = "mann-whitney-u";
  }],
] as const;

for (const [label, mutate] of invalidOmissions) {
  test(`planned member membership rejects ${label} despite matching total count`, () => {
    const request = sparseRepeatedRequest();
    mutate(request.evidence.inferenceOmissions[0]);
    assert.throws(() => parseOpenEnaAiInterpretationRequestV2(request), /planned contrast|planned family|every planned member/u);
  });
}

test("planned member IDs remain unique across supplied inference and omission arrays", () => {
  const request = repeatedRequest();
  request.evidence.inferenceOmissions[0].id = request.evidence.inference[2].id;
  assert.throws(() => parseOpenEnaAiInterpretationRequestV2(request), /every planned member exactly once/u);
});

test("non-Wilcoxon omissions cannot carry period-pair roles", () => {
  const request = repeatedRequest();
  const omnibus = request.evidence.inference.shift()!;
  request.evidence.inferenceOmissions.push({
    id: omnibus.id, axisRole: omnibus.axisRole, familyRole: "omnibus-family", test: "friedman",
    earlierPeriodIndex: 0, laterPeriodIndex: 1, reason: "not-available",
  });
  assert.throws(() => parseOpenEnaAiInterpretationRequestV2(request), /cannot carry period-pair roles/u);
});
