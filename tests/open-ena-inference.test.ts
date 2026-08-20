import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import {
  buildEndpointMannWhitney,
  mannWhitneyU,
  MANN_WHITNEY_EFFECT_DEFINITION,
  MANN_WHITNEY_METHOD,
  MANN_WHITNEY_PROVENANCE,
} from "../lib/open-ena/inference";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

function groupedDataset() {
  return parseCsv(
    [
      "unit,conversation,group,A,B,C",
      "u1,c1,first,1,1,0",
      "u2,c2,first,1,0,1",
      "u3,c3,second,0,1,1",
      "u4,c4,second,1,1,1",
    ].join("\n") + "\n",
    { name: "two-groups.csv", source: "upload" },
  );
}

function groupedConfig() {
  return {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    window: "Conversation",
  } as typeof SAMPLE_CONFIG;
}

test("legacy Mann-Whitney uses exact-first p-values while retaining its diagnostic fields", () => {
  const estimate = mannWhitneyU([1, 2, 2], [2, 3]);

  assert.equal(estimate.status, "estimable");
  assert.equal(estimate.nFirst, 3);
  assert.equal(estimate.nSecond, 2);
  assert.equal(estimate.medianFirst, 2);
  assert.equal(estimate.medianSecond, 2.5);
  assert.equal(estimate.uFirst, 1);
  assert.equal(estimate.uSecond, 5);
  assert.ok(Math.abs((estimate.z ?? 0) - -0.9682458365518543) < 1e-12);
  assert.equal(estimate.pValueTwoSided, 0.6);
  assert.ok(Math.abs((estimate.rankBiserialFirstVsSecond ?? 0) - -2 / 3) < 1e-12);
  assert.equal(estimate.resolvedPMethod, "exact-conditional-rank-permutation");
  assert.deepEqual(estimate.exactTail, {
    extremeAssignmentCount: "6",
    totalAssignmentCount: "10",
    inclusive: true,
    midP: false,
  });
  assert.deepEqual(estimate.warnings, ["small-sample", "discrete-attainable-p", "ties-present"]);
});

test("Mann-Whitney returns not-estimable when either ordered group is empty", () => {
  const estimate = mannWhitneyU([], [1, 2]);

  assert.equal(estimate.status, "not-estimable");
  assert.equal(estimate.reason, "empty-group");
  assert.equal(estimate.nFirst, 0);
  assert.equal(estimate.nSecond, 2);
  assert.equal(estimate.medianFirst, null);
  assert.equal(estimate.medianSecond, 1.5);
  assert.equal(estimate.uFirst, null);
  assert.equal(estimate.pValueTwoSided, null);
  assert.equal(estimate.rankBiserialFirstVsSecond, null);
});

test("Mann-Whitney returns not-estimable when ties leave zero rank variance", () => {
  const estimate = mannWhitneyU([1, 1], [1, 1]);

  assert.equal(estimate.status, "not-estimable");
  assert.equal(estimate.reason, "zero-rank-variance");
  assert.equal(estimate.uFirst, 2);
  assert.equal(estimate.uSecond, 2);
  assert.equal(estimate.z, null);
  assert.equal(estimate.pValueTwoSided, null);
  assert.equal(estimate.rankBiserialFirstVsSecond, 0);
});

test("endpoint inference declares ENA.HK provenance, group order, and visible dimensions", () => {
  const result = analyzeDataset(groupedDataset(), groupedConfig());
  const visibleDimensions = result.dimensions.slice(0, 2);
  const inference = buildEndpointMannWhitney(result, "group", visibleDimensions);

  assert.equal(inference.status, "available");
  assert.equal(inference.provenance, MANN_WHITNEY_PROVENANCE);
  assert.equal(inference.method, MANN_WHITNEY_METHOD);
  assert.equal(inference.effectDefinition, MANN_WHITNEY_EFFECT_DEFINITION);
  assert.doesNotMatch(inference.provenance, /jENA/i);
  assert.match(inference.method, /first declared group/);
  assert.match(inference.method, /auto exact-first/i);
  assert.match(inference.method, /0\.5 continuity correction/);
  assert.deepEqual(inference.groupOrder, ["first", "second"]);
  assert.deepEqual(inference.rows.map((row) => row.dimension), visibleDimensions);
  assert.ok(inference.rows.every((row) => row.nFirst === 2 && row.nSecond === 2));
});

test("endpoint inference fails closed without leaking non-finite selected-group coordinates", () => {
  const result = analyzeDataset(groupedDataset(), groupedConfig());
  const dimension = result.dimensions[0];

  for (const invalidCoordinate of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const invalidResult = {
      ...result,
      set: {
        ...result.set,
        points: result.set.points.map((row, index) => index === 0
          ? { ...row, [dimension]: invalidCoordinate }
          : row),
      },
    };
    assert.throws(
      () => buildEndpointMannWhitney(invalidResult, "group", [dimension]),
      (error: unknown) => error instanceof Error && error.message === "nonfinite-coordinate",
    );
  }
});

test("trajectory results disable endpoint Mann-Whitney inference", () => {
  const result = analyzeDataset(groupedDataset(), {
    ...groupedConfig(),
    model: "SeparateTrajectory",
  });
  const inference = buildEndpointMannWhitney(result, "group", result.dimensions.slice(0, 2));

  assert.equal(inference.status, "disabled");
  assert.equal(inference.reason, "endpoint-only");
  assert.equal(inference.groupOrder, null);
  assert.deepEqual(inference.rows, []);
});

test("ungrouped results disable endpoint Mann-Whitney inference", () => {
  const dataset = parseCsv(
    "unit,conversation,A,B,C\nu1,c1,1,1,0\nu2,c2,0,1,1\n",
    { name: "ungrouped.csv", source: "upload" },
  );
  const config = { ...groupedConfig(), groupColumn: null };
  const result = analyzeDataset(dataset, config);
  const inference = buildEndpointMannWhitney(result, null, result.dimensions.slice(0, 2));

  assert.equal(inference.status, "disabled");
  assert.equal(inference.reason, "comparison-group-required");
});

test("models with more than two groups disable endpoint Mann-Whitney inference", () => {
  const dataset = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g2,0,1,1\nu3,c3,g3,1,0,1\n",
    { name: "three-groups.csv", source: "upload" },
  );
  const result = analyzeDataset(dataset, groupedConfig());
  const inference = buildEndpointMannWhitney(result, "group", result.dimensions.slice(0, 2));

  assert.equal(inference.status, "disabled");
  assert.equal(inference.reason, "exactly-two-groups-required");
});

test("the inference UI discloses exact-first policy, resolved methods, multiplicity, group order, and MR1 circularity", () => {
  const workspace = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /ENA\.HK post-projection inference, not a jENA statistic/);
  assert.match(workspace, /mannWhitney\.method/);
  assert.match(workspace, /row\.resolvedPMethod/);
  assert.doesNotMatch(workspace, /Two-sided normal approximation uses average ranks/);
  assert.match(workspace, /No multiplicity correction is applied/);
  assert.match(workspace, /MR1 is constructed from the same group contrast/);
});
