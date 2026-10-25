import assert from "node:assert/strict";
import test from "node:test";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import type { ParsedDataset } from "../lib/open-ena/types";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";

const HASH = "a".repeat(64);
const source: ParsedDataset = {
  name: "zero-endpoints.csv", source: "upload", sizeBytes: 1000,
  headers: ["Group", "Name", "Lesson", "A", "B", "C"],
  rows: [
    { Group: "Experimental", Name: "one", Lesson: 1, A: 1, B: 1, C: 0 },
    { Group: "Experimental", Name: "two", Lesson: 1, A: 1, B: 1, C: 1 },
    { Group: "Experimental", Name: "zero", Lesson: 1, A: 1, B: 0, C: 0 },
    { Group: "Control", Name: "one", Lesson: 1, A: 0, B: 1, C: 1 },
    { Group: "Control", Name: "two", Lesson: 1, A: 1, B: 0, C: 1 },
    { Group: "Control", Name: "zero", Lesson: 1, A: 0, B: 0, C: 0 },
  ],
};

function draft(means = false): StandardEnaDraftV3 {
  return {
    unitColumns: ["Group", "Name"], horizonColumns: ["Group", "Name", "Lesson"],
    groupColumn: "Group", codes: ["A", "B", "C"], weighting: "binary",
    model: "EndPoint", windowType: "Conversation", horizonOrder: null,
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    rotation: means
      ? { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Experimental" }, positiveLevel: { type: "string", value: "Control" } }
      : { type: "svd", centerAlignToOrigin: true },
  };
}

for (const means of [false, true]) {
  test(`mixed zero-network endpoints remain in ${means ? "Means" : "SVD"} fitting and at the origin`, async () => {
    const compiled = await compileStandardDraftV3(source, HASH, draft(means));
    assert.equal(compiled.status, "ready", compiled.diagnostics.map(d => d.summary).join("; "));
    if (compiled.status !== "ready") throw new Error("Expected a ready endpoint plan");
    const plan = await buildStandardExecutionPlanV3({ dataset: source, datasetSha256: HASH, compileResult: compiled, reference: null });
    const result = runStandardPlanV3(plan);
    assert.equal(result.set.points.length, 6);
    assert.equal(result.populations.targetTokens.length, 6);
    assert.ok(result.projection.rank > 0);
    const zeroTokens = plan.identityDictionary.units.filter(unit => unit.fields.some(f => f.column === "Name" && f.value.value === "zero")).map(unit => unit.token);
    assert.equal(zeroTokens.length, 2);
    for (const token of zeroTokens) {
      const point = result.set.points.find(p => p.ENA_UNIT === token)!;
      const weights = result.set.lineWeights.find(p => p.ENA_UNIT === token)!;
      assert.ok(point);
      for (const axis of result.projection.fullAxes.slice(0, 2)) assert.equal(Number(point[axis]), 0);
      for (const column of result.set.codeColumns) assert.equal(Number(weights[column]), 0);
    }
    if (means) {
      assert.equal(result.meansBinding?.negative.unitTokens.length, 3);
      assert.equal(result.meansBinding?.positive.unitTokens.length, 3);
    }
  });
  test(`an entirely zero endpoint population still blocks ${means ? "Means" : "SVD"}`, async () => {
    const empty = { ...source, rows: source.rows.map(row => ({ ...row, A: 0, B: 0, C: 0 })) };
    const compiled = await compileStandardDraftV3(empty, HASH, draft(means));
    assert.equal(compiled.status, "invalid");
  });
}

for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  test(`${model} keeps its existing zero-observation policy`, async () => {
    const input: StandardEnaDraftV3 = { ...draft(), model, horizonOrder: { kind: "columns", keys: [{ column: "Lesson", direction: "ascending", comparator: { type: "number" } }] } };
    const compiled = await compileStandardDraftV3(source, HASH, input);
    assert.equal(compiled.status, "invalid");
    assert.ok(compiled.diagnostics.some(d => d.id === "STANDARD_TARGET_RANK_ZERO"));
  });
}
