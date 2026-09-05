import assert from "node:assert/strict";
import test from "node:test";
import { ena } from "jena-js";
import type { ENASet, Row } from "jena-js";

import { canonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import type { StandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import * as adapter from "../lib/open-ena/model-v3/standard-adapter";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const MODELS = ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const;
const EXTENTS = [[1, 0], [5, 0], [2, 2], [Infinity, 0], [2, Infinity], [Infinity, Infinity]] as const;
const CODES = ["A", "B", "C"] as const;
const EDGES = [["A", "B"], ["A", "C"], ["B", "C"]] as const;
const DATASET_SHA256 = "a".repeat(64);

function extent(value: number) {
  return value === Infinity ? { kind: "infinity" as const } : { kind: "finite" as const, value };
}

function draft(
  model: StandardEnaDraftV3["model"],
  windowType: StandardEnaDraftV3["windowType"],
  weighting: StandardEnaDraftV3["weighting"],
  backward = 2,
  forward = 2,
): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group",
    codes: [...CODES], weighting, model, windowType,
    movingStanza: {
      backward: extent(backward), forward: extent(forward),
      rowOrder: { kind: "columns", keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }] },
    },
    horizonOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
}

function dataset(weighting: StandardEnaDraftV3["weighting"]): ParsedDataset {
  // Individual later Horizons keep the target fit nondegenerate even when
  // Binary both-Infinity saturates every edge in the shared Horizons.
  const patterns = [[1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 0], [0, 1, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 0]];
  const ordered = patterns.map((values, index): Row => ({
    unit: `u${index % 4 + 1}`, horizon: index < 8 ? (index < 4 ? "h1" : "h2") : `h3-u${index % 4 + 1}`, time: Math.floor(index / 4) + 1,
    turn: index % 4 + 1, group: index % 2 === 0 ? 1 : "1",
    ...Object.fromEntries(CODES.map((code, codeIndex) => [code, values[codeIndex] * (weighting === "frequency" ? codeIndex + 2 : 1)])),
    // Source columns that resemble internal fields must never override runtime tokens.
    __open_ena_unit_token: "hostile-source-unit", __open_ena_horizon_token: "hostile-source-horizon",
    __open_ena_code_v3_000: 999,
  }));
  return {
    name: "six-combinations.csv", source: "upload", sizeBytes: 2048,
    headers: Object.keys(ordered[0]),
    // Explicit row ordering must recover the scientific order within each Horizon.
    rows: [ordered[2], ordered[0], ordered[3], ordered[1], ordered[6], ordered[4], ordered[7], ordered[5], ...ordered.slice(8)],
  };
}

async function planFor(input: StandardEnaDraftV3, source = dataset(input.weighting)): Promise<StandardExecutionPlanV3> {
  const compileResult = await compileStandardDraftV3(source, DATASET_SHA256, input);
  assert.equal(compileResult.status, "ready", compileResult.diagnostics.map((entry) => entry.id).join(", "));
  if (compileResult.status !== "ready") throw new Error("Expected a ready Standard plan");
  return buildStandardExecutionPlanV3({ dataset: source, datasetSha256: DATASET_SHA256, compileResult, reference: null });
}

type Counts = Record<string, number[]>;

/**
 * Independent direct enumeration of source-row/code pairs. rENA 0.3.1 removes
 * pairs wholly inside its leading context prefix and wholly inside the forward
 * tail. The leading prefix uses the REQUESTED forward extent even when clipped;
 * an infinite forward extent leaves that prefix empty. The literal rENA anchors
 * in standard-window-v3.test.ts cover these otherwise surprising cases.
 * This oracle never calls jENA window, matrix, or aggregation helpers.
 */
function expectedCounts(
  source: ParsedDataset,
  input: StandardEnaDraftV3,
  backward: number,
  forward: number,
  scientificSequence?: readonly string[],
): Counts {
  const steps: Counts = {};
  // These fixtures use numeric time. Source-confirmed tests pass their known
  // intended sequence explicitly; Horizon names never define scientific order.
  const horizonTimes = new Map(source.rows.map((row) => [String(row.horizon), Number(row.time)]));
  const horizons = scientificSequence ?? [...horizonTimes.keys()].sort((a, b) => horizonTimes.get(a)! - horizonTimes.get(b)!);
  function add(row: Row, values: number[]) {
    const key = `${row.unit}/${row.horizon}`;
    const previous = steps[key] ?? [0, 0, 0];
    steps[key] = previous.map((value, edgeIndex) => value + values[edgeIndex]);
  }
  function weighted(values: number[]) {
    return input.weighting === "binary" ? values.map((value) => value > 0 ? 1 : 0) : values;
  }
  for (const horizon of horizons) {
    const rows = source.rows.filter((row) => row.horizon === horizon).sort((a, b) => Number(a.turn) - Number(b.turn));
    if (input.windowType === "Conversation") {
      for (const unit of new Set(rows.map((row) => row.unit))) {
        const unitRows = rows.filter((row) => row.unit === unit);
        add(unitRows[0], weighted(EDGES.map(([a, b]) => {
          let sum = 0;
          for (const left of unitRows) for (const right of unitRows) sum += Number(left[a]) * Number(right[b]);
          return sum;
        })));
      }
      continue;
    }
    rows.forEach((row, current) => {
      const members = rows.map((_, index) => index).filter((index) => current - backward < index && index <= current + forward);
      const last = members[members.length - 1];
      const values = EDGES.map(([a, b]) => {
        let sum = 0;
        for (const left of members) for (const right of members) {
          const leadingContextOnly = backward > 1 && current > 0 && left < last - forward && right < last - forward;
          const forwardContextOnly = forward > 0 && left > current && right > current;
          if (!leadingContextOnly && !forwardContextOnly) sum += Number(rows[left][a]) * Number(rows[right][b]);
        }
        return sum;
      });
      add(row, weighted(values));
    });
  }
  if (input.model === "SeparateTrajectory") return steps;
  const output: Counts = {};
  for (const unit of new Set(source.rows.map((row) => String(row.unit)))) {
    let running = [0, 0, 0];
    for (const horizon of horizons) {
      const key = `${unit}/${horizon}`;
      if (!steps[key]) continue;
      running = running.map((value, edgeIndex) => value + steps[key][edgeIndex]);
      if (input.model === "AccumulatedTrajectory") output[key] = [...running];
    }
    if (input.model === "EndPoint") output[unit] = running;
  }
  return output;
}

function actualCounts(set: ENASet, plan: StandardExecutionPlanV3): Counts {
  const units = new Map(plan.identityDictionary.units.map((entry) => [entry.token, entry.fields[0].value.value]));
  const horizons = new Map(plan.identityDictionary.horizons.map((entry) => [entry.token, entry.fields[0].value.value]));
  const output: Counts = {};
  set.connectionCounts.forEach((row, index) => {
    const unit = units.get(String(row.__open_ena_unit_token));
    assert.notEqual(unit, undefined);
    const horizon = horizons.get(String(set.trajectories?.[index].__open_ena_horizon_token));
    const key = set.modelType === "EndPoint" ? String(unit) : `${unit}/${horizon}`;
    assert.ok(!(key in output), `duplicate runtime Unit/Horizon ${key}`);
    output[key] = set.codeColumns.map((code) => Number(row[code]));
  });
  return output;
}

for (const model of MODELS) {
  for (const windowType of ["MovingStanzaWindow", "Conversation"] as const) {
    for (const weighting of ["binary", "frequency"] as const) {
      for (const [backward, forward] of windowType === "Conversation" ? [[Infinity, 0]] : EXTENTS) {
        test(`${model} / ${windowType} / ${weighting} / ${backward},${forward}: maps and executes independently expected Horizon counts`, async () => {
          const input = draft(model, windowType, weighting, backward, forward);
          const source = dataset(weighting);
          const plan = await planFor(input, source);
          assert.equal(typeof adapter.toStandardJenaOptionsV3, "function");
          const snapshot = canonicalJsonV3(plan);
          const options = adapter.toStandardJenaOptionsV3(plan);
          assert.equal(options.model, model);
          assert.equal(options.window, windowType);
          assert.equal(options.weightBy, weighting === "binary" ? "binary" : "sum");
          assert.equal(options.windowSizeBack, backward);
          assert.equal(options.windowSizeForward, forward);
          assert.equal(options.networkType, "standard");
          assert.equal(options.dimensions, 3);
          assert.deepEqual(options.rotation, { method: "svd" });
          assert.equal(options.centerAlignToOrigin, true);
          assert.deepEqual(options.units, ["__open_ena_unit_token"]);
          assert.deepEqual(options.conversation, ["__open_ena_horizon_token"]);
          assert.deepEqual(options.codes, plan.codeDictionary.codes.map((entry) => entry.token));
          assert.deepEqual(options.rows, plan.rows.map((row) => ({
            __open_ena_unit_token: row.unitToken, __open_ena_horizon_token: row.horizonToken, ...row.codeValues,
          })));
          if (windowType === "Conversation") assert.equal(plan.rowOrdering.type, "not-applicable");
          // Test-local execution only: Task 12 owns the production runner.
          const result = { set: ena(options) };
          assert.equal(result.set.modelType, model);
          assert.equal(result.set.functionParams.window, windowType);
          assert.deepEqual(actualCounts(result.set, plan), expectedCounts(source, input, backward, forward));
          assert.equal(canonicalJsonV3(plan), snapshot, "mapping and execution must not mutate the immutable plan");
        });
      }
    }
  }
}

test("Moving windows share context across Units but never cross Horizons", async () => {
  const input = draft("SeparateTrajectory", "MovingStanzaWindow", "frequency", 2, 0);
  const plan = await planFor(input);
  const counts = actualCounts(ena(adapter.toStandardJenaOptionsV3(plan)), plan);
  assert.deepEqual(counts["u2/h1"], [6, 16, 12], "u1's A/B and u2's A/C share h1");
  assert.deepEqual(counts["u1/h2"], [0, 8, 0], "h2 starts fresh without h1's final A/B");
});

test("Conversation aggregates multiple rows by Unit times Horizon", async () => {
  const input = draft("SeparateTrajectory", "Conversation", "frequency");
  const source = dataset("frequency");
  source.rows = source.rows.map((row) => {
    const unit = row.unit === "u3" ? "u1" : row.unit === "u4" ? "u2" : row.unit;
    return { ...row, unit, horizon: row.time === 3 ? `h3-${unit}` : row.horizon };
  });
  const plan = await planFor(input, source);
  const set = ena(adapter.toStandardJenaOptionsV3(plan));
  assert.deepEqual(actualCounts(set, plan), expectedCounts(source, input, Infinity, 0));
  assert.deepEqual(actualCounts(set, plan)["u1/h1"], [12, 8, 24]);
});

test("SVD maps an explicit false center policy", async () => {
  const input = draft("EndPoint", "Conversation", "binary");
  input.rotation = { type: "svd", centerAlignToOrigin: false };
  assert.equal(adapter.toStandardJenaOptionsV3(await planFor(input)).centerAlignToOrigin, false);
});

test("Endpoint Means selectors preserve typed Group levels and contrast direction", async () => {
  const input = draft("EndPoint", "Conversation", "binary");
  input.rotation = {
    type: "means", centerAlignToOrigin: false,
    negativeLevel: { type: "number", value: 1 }, positiveLevel: { type: "string", value: "1" },
  };
  const plan = await planFor(input);
  const options = adapter.toStandardJenaOptionsV3(plan);
  const tokenFor = (name: string) => {
    const entry = plan.identityDictionary.units.find((unit) => unit.fields[0].value.value === name);
    assert.ok(entry);
    return entry.token;
  };
  assert.deepEqual(options.rotation, { method: "mean", params: { groups: [[tokenFor("u2"), tokenFor("u4")].sort(), [tokenFor("u1"), tokenFor("u3")].sort()] } });
  assert.equal(options.centerAlignToOrigin, false);
  const set = ena(options);
  assert.equal(set.rotation.rotationColumns[0], "MR1");
  const meanFor = (names: string[]) => {
    const tokens = names.map(tokenFor);
    const points = set.points.filter((point) => tokens.includes(String(point.ENA_UNIT)));
    assert.equal(points.length, 2);
    return points.reduce((sum, point) => sum + Number(point.MR1), 0) / points.length;
  };
  assert.ok(meanFor(["u2", "u4"]) > meanFor(["u1", "u3"]), "MR1 follows positive-minus-negative");
});

test("scientific adapter parameters cannot override the canonical plan", async () => {
  const plan = await planFor(draft("EndPoint", "MovingStanzaWindow", "binary"));
  const overrides = [
    { networkType: "ordered" }, { model: "AccumulatedTrajectory" }, { window: { type: "Conversation" } },
    { weightBy: "sum" }, { displayDimensions: 2 }, { unitTokenColumn: "unit" },
    { horizonTokenColumn: "horizon" }, { codeTokens: ["A", "B", "C"] }, { mask: [[0]] },
  ];
  for (const override of overrides) {
    const tampered = { ...plan, adapterParameters: { ...plan.adapterParameters, ...override } } as StandardExecutionPlanV3;
    assert.throws(() => adapter.toStandardJenaOptionsV3(tampered), /adapter parameters.*canonical/i);
  }
});

test("Reference mapping reports the missing validated artifact without SVD fallback", async () => {
  const plan = await planFor(draft("EndPoint", "Conversation", "binary"));
  const referencePlan: StandardExecutionPlanV3 = {
    ...plan,
    configuration: { ...plan.configuration, analysis: {
      model: { type: "EndPoint" }, rotation: { type: "reference", referenceId: "missing", expectedContentSha256: "b".repeat(64) },
    } },
  };
  assert.throws(() => adapter.toStandardJenaOptionsV3(referencePlan), /Reference.*validated.*artifact/i);
});

const REVERSED_SEQUENCE = ["h2", "h1", "h3-u1", "h3-u2", "h3-u3", "h3-u4"];
const TRAJECTORY_WINDOWS = [
  { window: "MovingStanzaWindow", backward: 1, forward: 0 },
  { window: "MovingStanzaWindow", backward: 2, forward: 2 },
  { window: "Conversation", backward: Infinity, forward: 0 },
] as const;

function reverseScientificTime(source: ParsedDataset): ParsedDataset {
  return { ...source, rows: source.rows.map((row) => ({ ...row, time: row.time === 1 ? 2 : row.time === 2 ? 1 : row.time })) };
}

function actualPaths(set: ENASet, plan: StandardExecutionPlanV3): Record<string, string[]> {
  const units = new Map(plan.identityDictionary.units.map((entry) => [entry.token, String(entry.fields[0].value.value)]));
  const horizons = new Map(plan.identityDictionary.horizons.map((entry) => [entry.token, String(entry.fields[0].value.value)]));
  const paths: Record<string, string[]> = {};
  for (const row of set.trajectories ?? []) {
    const unit = units.get(String(row.__open_ena_unit_token));
    const horizon = horizons.get(String(row.__open_ena_horizon_token));
    assert.ok(unit && horizon);
    (paths[unit] ??= []).push(horizon);
  }
  return paths;
}

function assertScheduledPermutation(plan: StandardExecutionPlanV3): void {
  const scheduled = adapter.scheduleStandardExecutionRowsV3(plan);
  assert.notEqual(scheduled, plan.rows, "the scheduling array is detached from the plan");
  assert.ok(Object.isFrozen(scheduled));
  const originalRows = new Map(plan.rows.map((row) => [row.sourceRowIndex, row]));
  for (const row of scheduled) assert.equal(row, originalRows.get(row.sourceRowIndex), "retain immutable execution-row identity for provenance");
  assert.deepEqual(scheduled.map((row) => row.sourceRowIndex).sort((a, b) => a - b),
    Array.from({ length: plan.rows.length }, (_, index) => index));
  const emittedHorizons = new Set<string>();
  let previous: string | undefined;
  for (const row of scheduled) {
    if (row.horizonToken !== previous) {
      assert.ok(!emittedHorizons.has(row.horizonToken), "a Horizon must remain one unsplit bucket");
      emittedHorizons.add(row.horizonToken);
      previous = row.horizonToken;
    }
  }
  for (const horizon of emittedHorizons) {
    assert.deepEqual(scheduled.filter((row) => row.horizonToken === horizon),
      plan.rows.filter((row) => row.horizonToken === horizon), "preserve every within-Horizon row and its relative order");
  }
}

for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  for (const { window, backward, forward } of TRAJECTORY_WINDOWS) {
    for (const weighting of ["binary", "frequency"] as const) {
      test(`${model} / ${window} / ${weighting} / ${backward},${forward}: reversed scientific order overrides lexical and source order`, async () => {
        const input = draft(model, window, weighting, backward, forward);
        const source = reverseScientificTime(dataset(weighting));
        const plan = await planFor(input, source);
        const snapshot = canonicalJsonV3(plan);
        const set = ena(adapter.toStandardJenaOptionsV3(plan));
        const counts = actualCounts(set, plan);
        assert.deepEqual(counts, expectedCounts(source, input, backward, forward, REVERSED_SEQUENCE));
        assert.deepEqual(actualPaths(set, plan), {
          u1: ["h2", "h1", "h3-u1"], u2: ["h2", "h1", "h3-u2"],
          u3: ["h2", "h1", "h3-u3"], u4: ["h2", "h1", "h3-u4"],
        });
        if (model === "SeparateTrajectory") {
          assert.deepEqual(counts, expectedCounts(dataset(weighting), input, backward, forward), "Separate networks stay unchanged while paths reorder");
        } else if (forward === 0) {
          const ab = weighting === "binary" ? 1 : 6;
          const ac = weighting === "binary" ? 1 : 8;
          assert.deepEqual(counts["u1/h2"], [0, ac, 0]);
          assert.deepEqual(counts["u1/h1"], [ab, ac, 0]);
        }
        assertScheduledPermutation(plan);
        assert.equal(canonicalJsonV3(plan), snapshot);
      });
    }
  }
}

for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  for (const window of ["MovingStanzaWindow", "Conversation"] as const) {
    test(`${model} / ${window}: unequal observed steps and disjoint equal-time Horizons are scheduled without imputation`, async () => {
      const input = draft(model, window, "frequency", 2, 2);
      const source = reverseScientificTime(dataset("frequency"));
      source.rows = source.rows.filter((row) => !(row.unit === "u2" && row.horizon === "h1") && row.horizon !== "h3-u3");
      const plan = await planFor(input, source);
      const set = ena(adapter.toStandardJenaOptionsV3(plan));
      assert.deepEqual(actualCounts(set, plan), expectedCounts(source, input, 2, 2, REVERSED_SEQUENCE));
      assert.deepEqual(actualPaths(set, plan), {
        u1: ["h2", "h1", "h3-u1"], u2: ["h2", "h3-u2"],
        u3: ["h2", "h1"], u4: ["h2", "h1", "h3-u4"],
      });
      assertScheduledPermutation(plan);
      // h3-u1/u2/u4 are disjoint at equal time. Their stable priority is only
      // a deterministic implementation choice, with no fabricated shared step.
      const scheduled = adapter.scheduleStandardExecutionRowsV3(plan);
      const tail = [...new Set(scheduled.filter((row) => row.horizonOrderTuple?.[0] === 3).map((row) => row.horizonToken))];
      assert.equal(plan.horizonOrdering.type, "trajectory-horizon-order");
      if (plan.horizonOrdering.type !== "trajectory-horizon-order") throw new Error("Expected trajectory order");
      assert.deepEqual(tail, plan.horizonOrdering.implementationHorizonOrder.filter((token) => tail.includes(token)));
    });

    test(`${model} / ${window}: an explicitly confirmed source Horizon sequence survives lexical row materialization`, async () => {
      const input = draft(model, window, "frequency", 2, 2);
      const source = dataset("frequency");
      source.rows = REVERSED_SEQUENCE.flatMap((horizon) => source.rows.filter((row) => row.horizon === horizon));
      input.horizonOrder = {
        kind: "source-order-confirmed",
        confirmation: {
          kind: "explicit-researcher-confirmation", analysisFamily: "standard",
          datasetSha256: DATASET_SHA256, rowCount: source.rows.length, relevantColumns: ["unit", "horizon"],
          confirmedAt: "2026-09-05T00:00:00.000Z", confirmationVersion: 1,
        },
      };
      const plan = await planFor(input, source);
      const set = ena(adapter.toStandardJenaOptionsV3(plan));
      assert.deepEqual(actualCounts(set, plan), expectedCounts(source, input, 2, 2, REVERSED_SEQUENCE));
      assert.deepEqual(actualPaths(set, plan).u1, ["h2", "h1", "h3-u1"]);
      assertScheduledPermutation(plan);
    });
  }
}

test("Endpoint preserves its existing resolved row order when Horizon time reverses", async () => {
  const input = draft("EndPoint", "MovingStanzaWindow", "frequency");
  const plan = await planFor(input, reverseScientificTime(dataset("frequency")));
  assert.deepEqual(adapter.scheduleStandardExecutionRowsV3(plan), plan.rows);
  assert.deepEqual(adapter.toStandardJenaOptionsV3(plan).rows, plan.rows.map((row) => ({
    __open_ena_unit_token: row.unitToken, __open_ena_horizon_token: row.horizonToken, ...row.codeValues,
  })));
});

test("trajectory scheduling rejects missing, duplicate, uncovered, and cyclic mapping proofs", async () => {
  const plan = await planFor(draft("AccumulatedTrajectory", "MovingStanzaWindow", "frequency"));
  assert.equal(plan.horizonOrdering.type, "trajectory-horizon-order");
  if (plan.horizonOrdering.type !== "trajectory-horizon-order") throw new Error("Expected trajectory order");
  const order = plan.horizonOrdering;
  const first = order.unitSequences[0];
  const malformed: Array<Partial<typeof order>> = [
    { implementationHorizonOrder: order.implementationHorizonOrder.slice(1) },
    { implementationHorizonOrder: [...order.implementationHorizonOrder, order.implementationHorizonOrder[0]] },
    { implementationHorizonOrder: ["unknown", ...order.implementationHorizonOrder.slice(1)] },
    { unitSequences: order.unitSequences.slice(1) },
    { unitSequences: [first, ...order.unitSequences] },
    { unitSequences: [{ ...first, unitToken: "unknown" }, ...order.unitSequences.slice(1)] },
    { unitSequences: [{ ...first, steps: first.steps.slice(1) }, ...order.unitSequences.slice(1)] },
    { unitSequences: [{ ...first, steps: [first.steps[0], first.steps[0], ...first.steps.slice(2)] }, ...order.unitSequences.slice(1)] },
    { unitSequences: [{ ...first, steps: [{ horizonToken: "unknown", trajectoryOrdinal: 0 }, ...first.steps.slice(1)] }, ...order.unitSequences.slice(1)] },
    { unitSequences: [{ ...first, steps: first.steps.map((step) => ({ ...step, trajectoryOrdinal: 9 })) }, ...order.unitSequences.slice(1)] },
  ];
  for (const mutation of malformed) {
    assert.throws(() => adapter.scheduleStandardExecutionRowsV3({ ...plan, horizonOrdering: { ...order, ...mutation } }), /trajectory schedule/i);
  }
  assert.throws(() => adapter.scheduleStandardExecutionRowsV3({ ...plan, horizonOrdering: { type: "not-applicable", reason: "endpoint-model" } }), /trajectory schedule/i);
  assert.throws(() => adapter.scheduleStandardExecutionRowsV3({ ...plan, rows: [plan.rows[0], ...plan.rows.slice(0, -1)] }), /trajectory schedule/i);
  // One Unit reverses the two shared Horizons while the others retain h1→h2.
  // Every membership is present exactly once, but no global schedule exists.
  const cyclic = { ...first, steps: [first.steps[1], first.steps[0], ...first.steps.slice(2)].map((step, trajectoryOrdinal) => ({ ...step, trajectoryOrdinal })) };
  assert.throws(() => adapter.scheduleStandardExecutionRowsV3({
    ...plan, horizonOrdering: { ...order, unitSequences: [cyclic, ...order.unitSequences.slice(1)] },
  }), /trajectory schedule.*cycl/i);
});
