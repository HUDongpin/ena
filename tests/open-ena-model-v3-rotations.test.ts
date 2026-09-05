import assert from "node:assert/strict";
import test from "node:test";
import { accumulateData, ena, sphereNorm, type Row } from "jena-js";
import * as analysis from "../lib/open-ena/analyze";
import { canonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3, type StandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import * as adapter from "../lib/open-ena/model-v3/standard-adapter";
import type { InternalStandardRunResultV3, StandardEnaDraftV3, StandardMeansBindingV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const HASH = "a".repeat(64);
const MODELS = ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const;

function draft(model: StandardEnaDraftV3["model"] = "EndPoint", means = false, center = true): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group",
    codes: ["A", "B", "C"], weighting: "frequency", model, windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    rotation: means
      ? { type: "means", centerAlignToOrigin: center, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } }
      : { type: "svd", centerAlignToOrigin: center },
  };
}

function dataset(rows: Row[]): ParsedDataset {
  return { name: "rotations.csv", source: "upload", sizeBytes: 2048, headers: Object.keys(rows[0]), rows };
}

function endpointSource(): ParsedDataset {
  return dataset([
    { unit: "z-control", horizon: "h1", time: 1, group: "Control", A: 1, B: 2, C: 1 },
    { unit: "a-treatment", horizon: "h1", time: 1, group: "Treatment", A: 2, B: 1, C: 3 },
    { unit: "z-control", horizon: "h1", time: 1, group: "Control", A: 1, B: 2, C: 1 },
    { unit: "y-control", horizon: "h2", time: 2, group: "Control", A: 1, B: 3, C: 1 },
    { unit: "b-treatment", horizon: "h2", time: 2, group: "Treatment", A: 3, B: 1, C: 2 },
    { unit: "m-other", horizon: "h3", time: 3, group: "Other", A: 1, B: 1, C: 4 },
  ]);
}

function trajectorySource(): ParsedDataset {
  const rows = [
    ["u1", "z-first", 1, 1, 2, 1], ["u1", "m-second", 2, 3, 1, 2], ["u1", "a-third", 3, 1, 1, 4],
    ["u2", "z-first", 1, 2, 3, 1], ["u2", "a-third", 3, 1, 2, 3], ["u3", "m-second", 2, 4, 1, 2],
  ].map(([unit, horizon, time, A, B, C]): Row => ({ unit, horizon, time, group: unit === "u1" ? "Control" : "Treatment", A, B, C }));
  return dataset([rows[2], rows[4], rows[1], rows[5], rows[3], rows[0]]);
}

async function planFor(input = draft(), source = endpointSource()): Promise<StandardExecutionPlanV3> {
  const compiled = await compileStandardDraftV3(source, HASH, input);
  assert.equal(compiled.status, "ready", compiled.diagnostics.map((entry) => entry.id).join(", "));
  if (compiled.status !== "ready") throw new Error("Expected a ready plan");
  return buildStandardExecutionPlanV3({ dataset: source, datasetSha256: HASH, compileResult: compiled, reference: null });
}

function bindingFor(plan: StandardExecutionPlanV3): StandardMeansBindingV3 {
  const fn = Reflect.get(adapter, "buildMeansBindingV3");
  assert.equal(typeof fn, "function", "Task 12 must export buildMeansBindingV3");
  return fn(plan);
}

function run(plan: StandardExecutionPlanV3): InternalStandardRunResultV3 {
  const fn = Reflect.get(analysis, "runStandardPlanV3");
  assert.equal(typeof fn, "function", "Task 12 must export the internal runStandardPlanV3");
  return fn(plan);
}

function tokenFor(plan: StandardExecutionPlanV3, name: string): string {
  const entry = plan.identityDictionary.units.find((unit) => unit.fields[0].value.value === name);
  assert.ok(entry);
  return entry.token;
}

function close(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

function mean(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }

test("Means binding contains each typed Endpoint Unit once with the explicit contrast direction", async () => {
  const plan = await planFor(draft("EndPoint", true));
  const binding = bindingFor(plan);
  assert.deepEqual(binding, {
    groupColumn: "group",
    negative: { level: { type: "string", value: "Control" }, unitTokens: [tokenFor(plan, "y-control"), tokenFor(plan, "z-control")].sort() },
    positive: { level: { type: "string", value: "Treatment" }, unitTokens: [tokenFor(plan, "a-treatment"), tokenFor(plan, "b-treatment")].sort() },
    direction: "positive-minus-negative",
  });
});

for (const center of [true, false]) {
  test(`Endpoint Means uses actual connectionCounts masks and positive MR1 (center=${center})`, async () => {
    const plan = await planFor(draft("EndPoint", true, center));
    const before = canonicalJsonV3(plan);
    const binding = bindingFor(plan);
    const result = run(plan);
    assert.deepEqual(result.meansBinding, binding);
    const pointsFor = (tokens: readonly string[]) => result.set.points.filter((row) => tokens.includes(String(row.ENA_UNIT)));
    const negative = pointsFor(binding.negative.unitTokens);
    const positive = pointsFor(binding.positive.unitTokens);
    assert.equal(negative.length, 2);
    assert.equal(positive.length, 2);
    assert.ok(mean(positive.map((row) => Number(row.MR1))) > mean(negative.map((row) => Number(row.MR1))));
    assert.equal(result.set.rotation.rotationColumns[0], "MR1");
    assert.equal(result.projection.runtimeFirstAxis, "MR1");
    assert.equal(result.projection.centerAlignToOrigin, center);
    assert.equal(result.set.points.length, 5, "the third level projects without contributing to MR1");
    // Independently compute the contrast direction from normalized endpoints.
    const vectors = new Map(result.set.lineWeights.map((row) => [String(row.ENA_UNIT), result.set.codeColumns.map((column) => Number(row[column]))]));
    const difference = result.set.codeColumns.map((_, index) => mean(binding.positive.unitTokens.map((token) => vectors.get(token)![index])) - mean(binding.negative.unitTokens.map((token) => vectors.get(token)![index])));
    const norm = Math.hypot(...difference);
    result.set.rotation.rotationMatrix.forEach((row, index) => close(row[0], difference[index] / norm));
    assert.equal(canonicalJsonV3(plan), before);
  });
}

test("Means distinguishes numeric and string Group levels", async () => {
  const source = endpointSource();
  source.rows = source.rows.map((row) => ({ ...row, group: row.group === "Control" ? 1 : row.group === "Treatment" ? "1" : true }));
  const input = draft("EndPoint", true);
  input.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "number", value: 1 }, positiveLevel: { type: "string", value: "1" } };
  const plan = await planFor(input, source);
  const binding = bindingFor(plan);
  assert.equal(binding.negative.unitTokens.length, 2);
  assert.equal(binding.positive.unitTokens.length, 2);
  assert.deepEqual(binding.negative.level, { type: "number", value: 1 });
  assert.deepEqual(binding.positive.level, { type: "string", value: "1" });
  assert.equal(run(plan).set.points.length, 5);
});

for (const model of MODELS.slice(1)) {
  test(`${model} rejects direct Means without fallback at compiler and runner`, async () => {
    const compiled = await compileStandardDraftV3(trajectorySource(), HASH, draft(model, true));
    assert.equal(compiled.status, "invalid");
    assert.ok(compiled.diagnostics.some((entry) => entry.id === "STANDARD_MEANS_REQUIRES_ENDPOINT"));
    const plan = await planFor(draft(model), trajectorySource());
    const endpoint = await planFor(draft("EndPoint", true));
    const invalid = { ...plan, configuration: { ...plan.configuration, analysis: { ...plan.configuration.analysis, rotation: endpoint.configuration.analysis.rotation } } } as StandardExecutionPlanV3;
    assert.throws(() => bindingFor(invalid), /Means.*EndPoint/i);
    assert.throws(() => run(invalid), /Means.*EndPoint/i);
  });
}

test("Means rejects missing, overlapping, and Unit-unstable membership", async () => {
  const plan = await planFor(draft("EndPoint", true));
  const rotation = plan.configuration.analysis.rotation;
  assert.equal(rotation.type, "means");
  if (rotation.type !== "means") return;
  for (const positiveLevel of [{ type: "string", value: "absent" }, rotation.contrast.negativeLevel] as const) {
    const invalid = { ...plan, configuration: { ...plan.configuration, analysis: { model: { type: "EndPoint" }, rotation: { ...rotation, contrast: { ...rotation.contrast, positiveLevel } } } } } as StandardExecutionPlanV3;
    assert.throws(() => bindingFor(invalid), /nonempty|overlap|distinct|level/i);
  }
  const repeatedToken = tokenFor(plan, "z-control");
  const repeatedIndex = plan.rows.findLastIndex((row) => row.unitToken === repeatedToken);
  const otherGroup = plan.rows.find((row) => row.unitToken === tokenFor(plan, "a-treatment"))!.groupToken;
  const unstable = { ...plan, rows: plan.rows.map((row, index) => index === repeatedIndex ? { ...row, groupToken: otherGroup } : row) };
  assert.throws(() => bindingFor(unstable), /stable|multiple|overlap/i);
});

test("a single-Unit Means level permits description and blocks variance-based group inference", async () => {
  const source = endpointSource();
  source.rows = source.rows.filter((row) => row.unit !== "y-control");
  const result = run(await planFor(draft("EndPoint", true), source));
  assert.equal(result.meansBinding!.negative.unitTokens.length, 1);
  assert.ok(result.diagnostics.some((entry) => entry.id === "STANDARD_MEANS_LEVEL_EMPTY" && entry.severity === "warning" && entry.fieldPath === "rotation.negativeLevel" && entry.blocks.includes("group-inference")));
  assert.ok(result.diagnostics.every((entry) => !entry.blocks.includes("build-model")));
});

for (const model of MODELS) {
  for (const center of [true, false]) {
    test(`${model} SVD preserves finite full basis, population centering and variance (center=${center})`, async () => {
      const source = model === "EndPoint" ? endpointSource() : trajectorySource();
      const result = run(await planFor(draft(model, false, center), source));
      assert.equal(result.set.modelType, model);
      assert.equal(result.projection.type, "svd");
      assert.equal(result.projection.centerAlignToOrigin, center);
      assert.equal(result.projection.runtimeFirstAxis, "SVD1");
      assert.equal(result.projection.fullAxes.length, 3);
      close(Object.values(result.set.variance).reduce((sum, value) => sum + value, 0), 1);
      const basis = result.set.rotation.rotationMatrix;
      for (let left = 0; left < 3; left++) for (let right = 0; right < 3; right++) close(basis.reduce((sum, row) => sum + row[left] * row[right], 0), left === right ? 1 : 0);
      result.set.codeColumns.forEach((column, index) => close(result.projection.centerVector[index], mean(result.set.lineWeights.map((row) => Number(row[column])))));
      for (const row of [...result.set.points, ...result.set.rotation.nodes!, ...result.set.centroids!]) {
        for (const axis of result.projection.fullAxes.slice(0, 3)) assert.ok(Number.isFinite(row[axis]));
      }
    });
  }
}

for (const model of MODELS.slice(1)) {
  test(`${model} fits every observed Unit-Horizon step once, without equal-Unit weighting or imputation`, async () => {
    const source = trajectorySource();
    const plan = await planFor(draft(model), source);
    const result = run(plan);
    assert.equal(result.populations.fit, "observed-unit-horizon-steps");
    assert.deepEqual(result.populations.trajectoryStepCountByUnit, { [tokenFor(plan, "u1")]: 3, [tokenFor(plan, "u2")]: 2, [tokenFor(plan, "u3")]: 1 });
    assert.equal(result.populations.imputedStepCount, 0);
    assert.equal(result.populations.fitTokens.length, 6);
    assert.equal(new Set(result.populations.fitTokens).size, 6);
    assert.deepEqual(result.populations.fitTokens, result.populations.targetTokens);
    assert.equal(result.set.connectionCounts.length, 6);
    const expected = new Map<string, number[]>();
    for (const unit of ["u1", "u2", "u3"]) {
      let running = [0, 0, 0];
      for (const row of source.rows.filter((row) => row.unit === unit).sort((a, b) => Number(a.time) - Number(b.time))) {
        const values = [Number(row.A) * Number(row.B), Number(row.A) * Number(row.C), Number(row.B) * Number(row.C)];
        running = running.map((value, index) => value + values[index]);
        expected.set(`${unit}/${row.horizon}`, model === "AccumulatedTrajectory" ? [...running] : values);
      }
    }
    const unitNames = new Map(plan.identityDictionary.units.map((entry) => [entry.token, entry.fields[0].value.value]));
    const horizonNames = new Map(plan.identityDictionary.horizons.map((entry) => [entry.token, entry.fields[0].value.value]));
    const seen = new Set<string>();
    result.set.connectionCounts.forEach((row, index) => {
      const step = result.set.trajectories![index];
      const key = `${unitNames.get(String(row.__open_ena_unit_token))}/${horizonNames.get(String(step.__open_ena_horizon_token))}`;
      assert.ok(!seen.has(key)); seen.add(key);
      assert.deepEqual(result.set.codeColumns.map((column) => Number(row[column])), expected.get(key));
    });
    assert.equal(seen.size, expected.size);
    const normalized = [...expected.values()].map((row) => row.map((value) => value / Math.hypot(...row)));
    const allStepMean = [0, 1, 2].map((index) => mean(normalized.map((row) => row[index])));
    allStepMean.forEach((value, index) => close(result.projection.centerVector[index], value));
    const equalUnitMean = [0, 1, 2].map((index) => mean([normalized.slice(0, 3), normalized.slice(3, 5), normalized.slice(5)].map((rows) => mean(rows.map((row) => row[index])))));
    assert.ok(allStepMean.some((value, index) => Math.abs(value - equalUnitMean[index]) > 1e-3));
  });
}

for (const center of [true, false]) {
  test(`Means coordinate eligibility retains residual variance independently of intrinsic rank (center=${center})`, async () => {
    const source = dataset([
      { unit: "c1", horizon: "h1", time: 1, group: "Control", A: 1, B: 1, C: 1 },
      { unit: "c2", horizon: "h2", time: 2, group: "Control", A: 1, B: 2, C: 3 },
      { unit: "t1", horizon: "h3", time: 3, group: "Treatment", A: 1, B: 1, C: 1.0000001 },
      { unit: "t2", horizon: "h4", time: 4, group: "Treatment", A: 1, B: 2, C: 3.0000001 },
    ]);
    const plan = await planFor(draft("EndPoint", true, center), source);
    const unchangedGeometry = ena(adapter.toStandardJenaOptionsV3(plan));
    const result = run(plan);
    assert.equal(result.projection.rank, 1, "intrinsic independent rank remains governed by the established numerical rank policy");
    close(result.set.variance.MR1, 0.48738256299622296);
    close(result.set.variance.SVD2, 0.5126174370037772);
    assert.ok(result.set.variance.SVD3 < 1e-15, "the completion coordinate has only numerical noise");
    assert.deepEqual(result.projection.estimableAxes, ["MR1", "SVD2"], "Means coordinates are not ordered by intrinsic SVD eigenvalues");
    assert.ok(result.projection.estimableAxes.length > result.projection.rank, "eligible coordinates do not claim independent dimensions");
    assert.deepEqual(result.projection.fullAxes, ["MR1", "SVD2", "SVD3"]);
    assert.deepEqual(result.set.rotation, unchangedGeometry.rotation);
    assert.deepEqual(result.set.points, unchangedGeometry.points);
    assert.deepEqual(result.set.variance, unchangedGeometry.variance);
    assert.deepEqual(result.projection.variance, result.projection.fullAxes.map((axis) => unchangedGeometry.variance[axis]));
  });

  test(`exact rank-one Means excludes residual completion noise without truncating full geometry (center=${center})`, async () => {
    const source = dataset([
      { unit: "c1", horizon: "h1", time: 1, group: "Control", A: 1, B: 1, C: 0 },
      { unit: "c2", horizon: "h2", time: 2, group: "Control", A: 1, B: 1, C: 0 },
      { unit: "t1", horizon: "h3", time: 3, group: "Treatment", A: 0, B: 1, C: 1 },
      { unit: "t2", horizon: "h4", time: 4, group: "Treatment", A: 0, B: 1, C: 1 },
    ]);
    const plan = await planFor(draft("EndPoint", true, center), source);
    const unchangedGeometry = ena(adapter.toStandardJenaOptionsV3(plan));
    const result = run(plan);
    assert.equal(result.projection.rank, 1);
    assert.deepEqual(result.projection.estimableAxes, ["MR1"]);
    close(result.set.variance.MR1, 1);
    assert.ok(result.set.variance.SVD2 < 1e-24 && result.set.variance.SVD3 < 1e-24);
    assert.deepEqual(result.projection.fullAxes, ["MR1", "SVD2", "SVD3"]);
    assert.deepEqual(result.set.rotation, unchangedGeometry.rotation);
    assert.deepEqual(result.set.points, unchangedGeometry.points);
    assert.deepEqual(result.set.variance, unchangedGeometry.variance);
  });

  test(`rank-one SVD exposes one estimable axis while preserving the full reference basis (center=${center})`, async () => {
    const source = dataset([
      { unit: "u1", horizon: "h1", time: 1, group: "Control", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h2", time: 2, group: "Treatment", A: 0, B: 1, C: 1 },
      { unit: "u3", horizon: "h3", time: 3, group: "Treatment", A: 1, B: 1, C: 0 },
    ]);
    const result = run(await planFor(draft("EndPoint", false, center), source));
    assert.equal(result.projection.rank, 1);
    assert.deepEqual(result.projection.estimableAxes, ["SVD1"]);
    assert.ok(!result.projection.estimableAxes.includes("SVD2"));
    assert.deepEqual(result.set.rotation.rotationColumns, ["SVD1", "SVD2", "SVD3"]);
    assert.ok(result.diagnostics.some((entry) => entry.id === "STANDARD_SVD_ONE_DIMENSIONAL" && entry.severity === "warning" && entry.blocks.includes("ai-interpretation")));
  });
}

test("rank-zero and zero-observation runtime targets fail closed; sphere normalization keeps zero at origin", async () => {
  assert.deepEqual(sphereNorm([[0, 0, 0], [3, 4, 0]]), [[0, 0, 0], [0.6, 0.8, 0]]);
  for (const means of [false, true]) for (const center of [true, false]) {
    const plan = await planFor(draft("EndPoint", means, center));
    const constant = Object.fromEntries(plan.codeDictionary.codes.map((code) => [code.token, 1]));
    const rankZero = { ...plan, rows: plan.rows.map((row) => ({ ...row, codeValues: constant })) };
    assert.throws(() => run(rankZero), /rank zero|no co-occurrences/i);
    const zeroUnit = tokenFor(plan, "m-other");
    const zero = Object.fromEntries(plan.codeDictionary.codes.map((code) => [code.token, 0]));
    const zeroObservation = { ...plan, rows: plan.rows.map((row) => row.unitToken === zeroUnit ? { ...row, codeValues: zero } : row) };
    assert.throws(() => run(zeroObservation), /zero.*observation|observation.*zero|zero network/i);
    const source = endpointSource();
    source.rows = source.rows.map((row) => row.unit === "m-other" ? { ...row, A: 0, B: 0, C: 0 } : row);
    const compiled = await compileStandardDraftV3(source, HASH, draft("EndPoint", means, center));
    assert.equal(compiled.status, "invalid");
    assert.ok(compiled.diagnostics.some((entry) => entry.id === "STANDARD_TARGET_RANK_ZERO"));
  }
});

test("Means with identical selected means rejects MR1 even when the unselected level gives target variation", async () => {
  const plan = await planFor(draft("EndPoint", true));
  const otherToken = tokenFor(plan, "m-other");
  const constant = Object.fromEntries(plan.codeDictionary.codes.map((code) => [code.token, 1]));
  const invalid = { ...plan, rows: plan.rows.map((row) => row.unitToken === otherToken ? row : { ...row, codeValues: constant }) };
  assert.throws(() => run(invalid), /identical|zero.*direction|direction.*zero/i);
});

test("Reference remains unconditionally fail-closed and Standard rejects ONA", async () => {
  const plan = await planFor();
  const reference = { ...plan, configuration: { ...plan.configuration, analysis: { model: { type: "EndPoint" }, rotation: { type: "reference", referenceId: "r", expectedContentSha256: "b".repeat(64) } } } } as StandardExecutionPlanV3;
  assert.throws(() => run(reference), /Reference.*fail-closed|Reference.*complete/i);
  const ona = { ...plan, configuration: { ...plan.configuration, analysisFamily: "ona" } } as unknown as StandardExecutionPlanV3;
  assert.throws(() => run(ona), /Standard|standard/i);
});

test("the target matrix used by the internal runner agrees with independently accumulated scheduled rows", async () => {
  const plan = await planFor(draft("AccumulatedTrajectory"), trajectorySource());
  const expected = accumulateData(adapter.toStandardJenaOptionsV3(plan));
  assert.deepEqual(run(plan).set.connectionMatrix, expected.connectionMatrix);
});

test("Means masks are two disjoint boolean arrays in the actual Endpoint count order", async () => {
  const plan = await planFor(draft("EndPoint", true));
  const binding = bindingFor(plan);
  const counts = accumulateData(adapter.toStandardJenaOptionsV3(plan)).connectionCounts;
  const fn = Reflect.get(adapter, "buildMeansMasksV3");
  assert.equal(typeof fn, "function", "Task 12 must bind masks to actual Endpoint rows");
  for (const rows of [counts, [...counts].reverse()]) {
    const [positive, negative] = fn(binding, rows) as [boolean[], boolean[]];
    assert.deepEqual(positive, rows.map((row) => binding.positive.unitTokens.includes(String(row.ENA_UNIT))));
    assert.deepEqual(negative, rows.map((row) => binding.negative.unitTokens.includes(String(row.ENA_UNIT))));
    assert.equal(positive.filter(Boolean).length, 2);
    assert.equal(negative.filter(Boolean).length, 2);
    assert.ok(positive.every((selected, index) => !selected || !negative[index]));
  }
  assert.throws(() => fn(binding, counts.slice(1)), /missing|membership|exactly once/i);
  assert.throws(() => fn(binding, [...counts, counts[0]]), /duplicate|exactly once/i);
});

test("internal provenance retains the exact configuration and plan header without source proof rows", async () => {
  const plan = await planFor();
  const result = run(plan);
  assert.deepEqual(result.configuration, plan.configuration);
  assert.deepEqual(result.executionPlanHeader, plan.header);
  assert.ok(!("sourceProof" in result));
  assert.ok(!("resources" in result));
});

test("full six-axis variance stays normalized over the complete basis while display contains three axes", async () => {
  const patterns = [[1, 2, 3, 4], [4, 1, 2, 3], [3, 4, 1, 2], [2, 3, 4, 1], [4, 3, 2, 1], [1, 4, 2, 3], [2, 1, 4, 3], [3, 2, 1, 4]];
  const source = dataset(patterns.map(([A, B, C, D], index) => ({ unit: `u${index}`, horizon: `h${index}`, time: index, group: index % 2 ? "Control" : "Treatment", A, B, C, D })));
  const input = draft(); input.codes.push("D");
  const result = run(await planFor(input, source));
  assert.equal(result.projection.fullAxes.length, 6);
  assert.equal(result.set.rotation.rotationMatrix.length, 6);
  assert.ok(result.set.rotation.rotationMatrix.every((row) => row.length === 6));
  assert.equal(Object.keys(result.set.variance).length, 6);
  assert.ok(!("SVD4" in result.set.points[0]));
  const centered = result.set.pointsForProjection.map((row) => result.set.codeColumns.map((column) => Number(row[column])));
  const projected = centered.map((row) => result.projection.fullAxes.map((_, axis) => row.reduce((sum, value, edge) => sum + value * result.set.rotation.rotationMatrix[edge][axis], 0)));
  const variances = result.projection.fullAxes.map((_, axis) => {
    const values = projected.map((row) => row[axis]);
    const center = mean(values);
    return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
  });
  const total = variances.reduce((sum, value) => sum + value, 0);
  result.projection.fullAxes.forEach((axis, index) => close(result.set.variance[axis], variances[index] / total));
  assert.ok(result.projection.variance.slice(0, 3).reduce((sum, value) => sum + value, 0) < 0.999);
});
