import assert from "node:assert/strict";
import test from "node:test";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { bindResultV3, validateBoundResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { scientificResultHashPayloadV3 } from "../lib/open-ena/model-v3/result-binding";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import type { ENASet } from "jena-js";
import { buildReferenceV2, fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const observation = (rows: number) => ({ processedRows: rows, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" as const });

const invalidSetContracts: readonly [string, (set: ENASet) => void, RegExp][] = [
  ["ordered function network type", (set) => { set.functionParams.networkType = "ordered"; }, /function.*param/i],
  ["filtered Unit tokens in function parameters", (set) => { set.functionParams.unitsUsed = [String(set.points[0].ENA_UNIT)]; }, /function.*param/i],
  ["arbitrary Unit token in function parameters", (set) => { Object.assign(set.functionParams, { unit: set.points[0].ENA_UNIT }); }, /function.*param/i],
  ["disabled includeMeta", (set) => { set.functionParams.includeMeta = false; }, /function.*param/i],
  ["unknown function parameter", (set) => { Object.assign(set.functionParams, { extra: 42 }); }, /function.*param/i],
  ["duplicate Code node", (set) => { set.rotation.nodes![1].code = set.rotation.nodes![0].code; }, /node.*Code|Code.*node/i],
  ["reordered Code nodes", (set) => { set.rotation.nodes!.reverse(); }, /node.*Code|Code.*node/i],
  ["matched negative connection matrix and count", (set) => { set.connectionMatrix[0][0] = -1; set.connectionCounts[0][set.codeColumns[0]] = -1; }, /nonnegative/i],
  ["negative sphere-normalized network", (set) => { set.lineWeights[0][set.codeColumns[0]] = -1; }, /nonnegative/i],
  ["negative Code carried on a count table", (set) => { set.connectionCounts[0][set.codes[0]] = -1; }, /nonnegative/i],
  ["negative Code carried on a normalized table", (set) => { set.lineWeights[0][set.codes[0]] = -1; }, /nonnegative/i],
  ["negative raw Code", (set) => { set.rawRows = [{ [set.codes[0]]: -1 }]; }, /nonnegative/i],
  ["negative raw cooccurrence", (set) => { set.rowConnectionCounts = [{ [set.codeColumns[0]]: -1 }]; }, /nonnegative/i],
];

for (const boundary of ["direct binder", "rehashed unknown result"] as const) {
  for (const [label, mutate, error] of invalidSetContracts) {
    test(`${boundary} rejects ${label}`, async () => {
      const { plan, compiled } = await bindingFixtureV3();
      const runtime = structuredClone(runStandardPlanV3(plan));
      if (boundary === "direct binder") {
        mutate(runtime.set);
        await assert.rejects(() => bindResultV3(plan, runtime, observation(5), compiled.diagnostics), error);
      } else {
        const changed = structuredClone(await bindResultV3(plan, runtime, observation(5), compiled.diagnostics));
        // Only the two explicit window extents differ in the serializable set type.
        mutate(changed.set as unknown as ENASet);
        Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(changed)) });
        await assert.rejects(() => validateBoundResultV3(changed, plan), error);
      }
    });
  }
  for (const rotation of ["svd", "means"] as const) {
    for (const malformed of ["scaled column", "duplicate unit column"] as const) {
      test(`${boundary} rejects ${rotation} ${malformed} in the full orthonormal basis`, async () => {
        const { plan, compiled } = await bindingFixtureV3(undefined, (draft) => {
          if (rotation === "means") draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
        });
        const runtime = structuredClone(runStandardPlanV3(plan));
        const mutate = (set: ENASet) => {
          if (malformed === "scaled column") set.rotation.rotationMatrix[0][0] = 999;
          else for (const row of set.rotation.rotationMatrix) row[1] = row[0];
        };
        if (boundary === "direct binder") {
          mutate(runtime.set);
          await assert.rejects(() => bindResultV3(plan, runtime, observation(5), compiled.diagnostics), /orthonormal/i);
        } else {
          const changed = structuredClone(await bindResultV3(plan, runtime, observation(5), compiled.diagnostics));
          mutate(changed.set as unknown as ENASet);
          Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(changed)) });
          await assert.rejects(() => validateBoundResultV3(changed, plan), /orthonormal/i);
        }
      });
    }
  }
}

test("orthonormal validation rejects unadmitted cubic work before dot-product traversal", async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const runtime = structuredClone(runStandardPlanV3(plan));
  const unadmitted = structuredClone(plan);
  Object.assign(unadmitted.header.resourceEstimate, { estimatedRotationWorkUnits: 0 });
  Object.assign(runtime, { executionPlanHeader: unadmitted.header });
  let reads = 0;
  runtime.set.rotation.rotationMatrix = runtime.set.rotation.rotationMatrix.map((row) => new Proxy(row, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/u.test(key)) reads += 1;
      return Reflect.get(target, key, receiver);
    },
  }));
  await assert.rejects(() => bindResultV3(unadmitted, runtime, observation(5), compiled.diagnostics), /orthonormal.*work/i);
  assert.equal(reads, 9, "only the admitted 3×3 finite-shape pass may read matrix cells before the work rejection");
});

for (const weighting of ["binary", "frequency"] as const) {
  for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    for (const rotation of (model === "EndPoint" ? ["svd", "means"] : ["svd"]) as readonly ("svd" | "means")[]) {
      test(`${weighting}/${model}/${rotation} strict binding preserves signed geometry and the complete basis`, async () => {
        const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
          draft.weighting = weighting; draft.model = model;
          if (weighting === "binary") {
            const patterns = [[1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1], [1, 1, 0]];
            data.rows = data.rows.map((row, index) => ({ ...row, A: patterns[index][0], B: patterns[index][1], C: patterns[index][2] }));
          }
          if (model !== "EndPoint") data.rows = data.rows.flatMap((row) => [{ ...row, horizon: "first", time: 1 }, { ...row, horizon: "second", time: 2, A: row.C, C: row.A }]);
          if (rotation === "means") draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
        });
        const runtime = runStandardPlanV3(plan);
        const before = structuredClone(runtime);
        const bound = await bindResultV3(plan, runtime, observation(plan.rows.length), compiled.diagnostics);
        await validateBoundResultV3(bound, plan);
        assert.deepEqual(runtime, before, "binding never rewrites runtime science");
        assert.deepEqual(bound.set.connectionMatrix, runtime.set.connectionMatrix);
        assert.deepEqual(bound.set.rotation.rotationMatrix, runtime.set.rotation.rotationMatrix);
        assert.deepEqual(bound.set.rotation.nodes!.map((node) => node.code), bound.set.codes);
        assert.deepEqual(Object.keys(bound.set.functionParams).sort(), ["includeMeta", "model", "weightBy", "window", "windowSizeBack", "windowSizeForward"]);
        assert.equal(bound.set.functionParams.includeMeta, true);
        assert.ok(runtime.set.pointsForProjection.some((row) => runtime.set.codeColumns.some((column) => Number(row[column]) < 0)), "centered geometry may remain negative");
      });
    }
  }
}

for (const weighting of ["binary", "frequency"] as const) {
  for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    test(`${weighting}/${model} retains fixed Reference geometry under strict result validation`, async () => {
      const configureWeighting = (draft: StandardEnaDraftV3, data: ParsedDataset) => {
        draft.weighting = weighting;
        if (weighting === "binary") {
          const patterns = [[1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1], [1, 1, 0]];
          data.rows = data.rows.map((row, index) => ({ ...row, A: patterns[index][0], B: patterns[index][1], C: patterns[index][2] }));
        }
      };
      const source = await bindingFixtureV3(undefined, configureWeighting);
      const reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Strict source", currentPlan: source.plan });
      const { plan, compiled } = await bindingFixtureV3("c".repeat(64), (draft, data) => {
        configureWeighting(draft, data);
        draft.model = model;
        draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 };
        if (model !== "EndPoint") data.rows = data.rows.flatMap((row) => [{ ...row, horizon: "first", time: 1 }, { ...row, horizon: "second", time: 2, A: row.C, C: row.A }]);
      }, reference);
      const runtime = runStandardPlanV3(plan);
      const result = await bindResultV3(plan, runtime, observation(plan.rows.length), compiled.diagnostics);
      await validateBoundResultV3(result, plan);
      assert.deepEqual(result.set.rotation.rotationMatrix, plan.reference!.rotationSet.rotationMatrix);
      assert.deepEqual(result.set.rotation.centerVector, plan.reference!.rotationSet.centerVector);
      assert.deepEqual(result.set.rotation.nodes!.map((node) => node.code), result.set.codes);
      assert.deepEqual(result.set.connectionMatrix, runtime.set.connectionMatrix);
    });
  }
}

async function api() {
  const path = "../lib/open-ena/model-v3/result-binding";
  const result = await import(path).catch(() => ({}));
  assert.equal(typeof result.bindResultV3, "function", "Task 15 must provide the asynchronous scientific result binder");
  return result;
}

test("a bound scientific result matches only its complete execution identity and survives JSON round trip", async () => {
  const mod = await api();
  const { plan, compiled } = await bindingFixtureV3();
  const result = await mod.bindResultV3(plan, runStandardPlanV3(plan), {
    processedRows: 5, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, compiled.diagnostics);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.kind, "open-ena-bound-result");
  await mod.validateBoundResultV3(result, plan);
  assert.equal(await mod.resultMatchesPlanV3(result, plan), true);
  assert.equal(await mod.resultMatchesPlanV3(JSON.parse(JSON.stringify(result)), plan), true);
  assert.ok(Object.isFrozen(result.configuration));
  assert.equal(result.set.functionParams.windowSizeBack, "Infinity");
  assert.equal(JSON.stringify(result.set).includes("__open_ena_"), false);
  const groupLabels = new Map(plan.identityDictionary.groups.map((entry) => [entry.token, entry.displayLabel]));
  assert.deepEqual(result.set.points.map((row: Record<string, unknown>) => row.Group), plan.rows.map((row) => groupLabels.get(row.groupToken!)));
  assert.equal(result.executionProvenance.unitGroups.length, 5);
  const other = await bindingFixtureV3("b".repeat(64));
  assert.equal(await mod.resultMatchesPlanV3(result, other.plan), false);
  for (const field of ["datasetSha256", "datasetHashKind", "headerSha256", "configurationSha256", "executionPlanSha256", "runtimeVersion", "algorithmBuildSha", "validationContractVersion", "runtimePolicyVersion", "executionContractVersion", "referenceId", "referenceContentSha256", "scientificResultSha256"]) {
    const changed = structuredClone(result);
    changed.binding[field] = "changed";
    assert.equal(await mod.resultMatchesPlanV3(changed, plan), false, field);
  }
  const changed = structuredClone(result);
  changed.set.points[0].SVD1 += 1;
  await assert.rejects(() => mod.validateBoundResultV3(changed, plan), /SHA|content/i);
  const time = structuredClone(result);
  time.createdAt = "2030-01-01T00:00:00.000Z";
  assert.equal(await mod.resultMatchesPlanV3(time, plan), true, "presentation timestamp does not change scientific hash");
});

test("unknown result admission rejects oversized matrices before their entries are traversed", async () => {
  const mod = await api();
  const { plan, compiled } = await bindingFixtureV3();
  const result = await mod.bindResultV3(plan, runStandardPlanV3(plan), { processedRows: 5, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
  const malformed = structuredClone(result);
  let traversed = 0;
  const matrix = new Proxy(new Array(100001), { ownKeys(target) { traversed += 1; return Reflect.ownKeys(target); } });
  Object.defineProperty(matrix, 0, { enumerable: true, get() { traversed += 1; throw new Error("must not traverse"); } });
  malformed.set.connectionMatrix = matrix;
  await assert.rejects(() => mod.validateBoundResultV3(malformed, plan), /admission|cardinality|resource|length/i);
  assert.equal(traversed, 0);
});

test("result admission accepts more than 256 identity fields using the real source-byte count", async () => {
  const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
    const fields = Array.from({ length: 300 }, (_, index) => `identity_${index}`);
    draft.unitColumns = fields;
    data.headers.push(...fields);
    data.rows = data.rows.map((row) => ({ ...row, ...Object.fromEntries(fields.map((field) => [field, String(row.unit)])) }));
    const csv = [data.headers.join(","), ...data.rows.map((row) => data.headers.map((header) => String(row[header])).join(","))].join("\n");
    data.sizeBytes = new TextEncoder().encode(csv).byteLength;
  });
  const result = await bindResultV3(plan, runStandardPlanV3(plan), observation(plan.rows.length), compiled.diagnostics);
  await validateBoundResultV3(result, plan);
  assert.equal(result.configuration.units.columns.length, 300);
});

test("result arrays reject changed accepted lengths before own-key or scientific entry traversal", async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const original = await bindResultV3(plan, runStandardPlanV3(plan), observation(5), compiled.diagnostics);
  const changed = structuredClone(original);
  let lengths = 0;
  let traversed = 0;
  changed.set.connectionMatrix = new Proxy([...changed.set.connectionMatrix, [1, 2, 3]], {
    getOwnPropertyDescriptor(target, key) {
      if (key === "length") return { ...Object.getOwnPropertyDescriptor(target, key)!, value: ++lengths === 1 ? 5 : 6 };
      traversed += 1;
      return Object.getOwnPropertyDescriptor(target, key);
    },
    ownKeys(target) { traversed += 1; return Reflect.ownKeys(target); },
  });
  await assert.rejects(() => validateBoundResultV3(changed, plan), /length.*changed|changed.*length/i);
  assert.equal(traversed, 0);
});

test("result and plan capture detach caller mutations before the first asynchronous hash", async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const result = await bindResultV3(plan, runStandardPlanV3(plan), observation(5), compiled.diagnostics);
  const candidate = structuredClone(result);
  const callerPlan = structuredClone(plan);
  const promise = validateBoundResultV3(candidate, callerPlan);
  candidate.set.points[0].SVD1 = 999;
  (callerPlan.rows[0].codeValues as Record<string, number>)[plan.codeDictionary.codes[0].token] = 999;
  const accepted = await promise;
  assert.equal(accepted.set.points[0].SVD1, result.set.points[0].SVD1);
});

test("reserved Code names and token-like user strings restore through roles without overwriting axes", async () => {
  const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
    const names = ["ENA_UNIT", "SVD1", "TRAJ_UNIT"];
    const rename = new Map(["A", "B", "C"].map((name, index) => [name, names[index]]));
    draft.codes = names;
    data.headers = data.headers.map((name) => rename.get(name) ?? name);
    data.rows = data.rows.map((row, index) => Object.fromEntries(Object.entries(row).map(([name, value]) => [rename.get(name) ?? name, name === "unit" && index === 0 ? "__open_ena_unit_v3_0" : value])));
  });
  const result = await bindResultV3(plan, runStandardPlanV3(plan), observation(5), compiled.diagnostics);
  await validateBoundResultV3(result, plan);
  assert.ok(Number.isFinite(result.set.points[0].SVD1));
  assert.match(String(result.set.points[0].ENA_UNIT), /__open_ena_unit_v3_0/u);
  assert.deepEqual(result.executionProvenance.labels.codes.map((entry) => entry.sourceColumn), ["ENA_UNIT", "SVD1", "TRAJ_UNIT"]);
  assert.deepEqual(result.set.codes, ["Code 1", "Code 2", "Code 3"]);
});

test("binding records manually countable unique scientific containers including its own copies", async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const runtime = runStandardPlanV3(plan);
  const result = await bindResultV3(plan, runtime, observation(5), compiled.diagnostics);
  //30captured plan Code slots +168runtime slots +84new transformed slots
  // +123detached slots. Shared basis/matrix references count only once.
  //Runtime rowConnectionCounts retains both3Code and3edge values per row.
  assert.equal(result.executionProvenance.resources.observed.numericCellsAllocated, 405);
  assert.equal(runtime.set.rawRows.length, 5, "caller-owned runtime remains intact");
  assert.deepEqual(result.set.rawRows, []);
  assert.deepEqual(result.set.rowConnectionCounts, []);
});

test("complete result metadata bound covers shared roles, typed collisions and escaped large Code labels", async () => {
  const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
    draft.horizonColumns = ["unit"];
    draft.groupColumn = "unit";
    const identities = [1, "1", true, "true", "line\n\"\\\u0000"];
    const codeNames = ["Code\"\\\u0000".repeat(128), "Code\nB".repeat(128), "Code C".repeat(128)];
    const rename = new Map(["A", "B", "C"].map((name, index) => [name, codeNames[index]]));
    draft.codes = codeNames;
    data.headers = data.headers.map((name) => rename.get(name) ?? name);
    data.rows = data.rows.map((row, index) => Object.fromEntries(Object.entries(row).map(([name, value]) => [rename.get(name) ?? name, name === "unit" ? identities[index] : value])));
    const cell = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
    data.sizeBytes = new TextEncoder().encode([data.headers.map(cell).join(","), ...data.rows.map((row) => data.headers.map((header) => cell(row[header])).join(","))].join("\n")).byteLength;
  });
  const result = await bindResultV3(plan, runStandardPlanV3(plan), observation(5), compiled.diagnostics);
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  assert.ok(bytes <= plan.header.resourceEstimate.estimatedExportBytes);
  assert.ok(bytes <= plan.header.resourceEstimate.estimatedPeakBytes);
  assert.ok(plan.header.resourceEstimate.resultIdentityBytes > 0);
  await validateBoundResultV3(result, plan);
  assert.equal(new Set(result.set.points.map((row) => row.ENA_UNIT)).size, 5);
});

test("owned synchronous Reference numerical path explicitly omits per-row edge materialization", async () => {
  const { plan } = await bindingFixtureV3(undefined, (_draft, data) => { data.rows = data.rows.flatMap((row) => Array.from({ length: 20 }, () => ({ ...row }))); });
  const full = runStandardPlanV3(plan);
  const model = runStandardPlanV3(plan, { materialization: "model" });
  assert.equal(full.set.rawRows.length, 100);
  assert.deepEqual(model.set.rawRows, []);
  assert.deepEqual(model.set.rowConnectionCounts, []);
  assert.deepEqual(model.set.connectionMatrix, full.set.connectionMatrix);
  assert.deepEqual(model.set.rotation, full.set.rotation);
});

test("binding rejects unknown identity tokens and nonfinite geometry", async () => {
  const mod = await api();
  const { plan, compiled } = await bindingFixtureV3();
  const observed = { processedRows: 5, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" };
  for (const mutate of [
    (run: ReturnType<typeof runStandardPlanV3>) => { run.set.points[0].ENA_UNIT = "unknown"; },
    (run: ReturnType<typeof runStandardPlanV3>) => { run.set.rotation.rotationMatrix[0][0] = NaN; },
    (run: ReturnType<typeof runStandardPlanV3>) => { run.set.connectionCounts[0][run.set.codeColumns[0]] = Infinity; },
  ]) {
    const run = structuredClone(runStandardPlanV3(plan));
    mutate(run);
    await assert.rejects(() => mod.bindResultV3(plan, run, observed, compiled.diagnostics), /token|identity|finite/i);
  }
});

test("a recomputed public hash cannot admit malformed eigenvalues, rank, or diagnostics", async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const result = await bindResultV3(plan, runStandardPlanV3(plan), observation(5), compiled.diagnostics);
  for (const mutate of [
    (changed: any) => { changed.set.rotation.eigenvalues = []; },
    (changed: any) => { changed.set.rotation.eigenvalues[0] = -1; },
    (changed: any) => { changed.executionProvenance.projection.rank = 0; changed.executionProvenance.projection.estimableAxes = []; },
    (changed: any) => { changed.executionProvenance.diagnostics.push({ id: "unknown", severity: "banana", scope: "xxx", fieldPath: "x", message: "x", blocks: [] }); },
  ]) {
    const changed = JSON.parse(JSON.stringify(result));
    mutate(changed);
    changed.binding.scientificResultSha256 = await sha256CanonicalJsonV3(scientificResultHashPayloadV3(changed));
    await assert.rejects(() => validateBoundResultV3(changed, plan), /eigenvalue|rank|diagnostic/i);
  }
});

test("AccumulatedTrajectory population grouping visits tokens linearly", async () => {
  const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
    draft.model = "AccumulatedTrajectory";
    const rows = data.rows;
    data.rows = Array.from({ length: 20 }, (_, index) => [1, 2].map((time) => ({ ...rows[index % rows.length], unit: `unit${index}`, horizon: `h${time}`, time }))).flat();
  });
  const runtime = runStandardPlanV3(plan);
  const original = JSON.parse;
  let calls = 0;
  JSON.parse = (...args: Parameters<typeof JSON.parse>) => { calls += 1; return original(...args); };
  try {
    await bindResultV3(plan, runtime, observation(plan.rows.length), compiled.diagnostics);
    assert.ok(calls <= 5 * plan.rows.length + 10, `token parsing should be linear, saw${calls}calls for${plan.rows.length}rows`);
  } finally { JSON.parse = original; }
});

for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  for (const windowType of ["Conversation", "MovingStanzaWindow"] as const) {
    test(`${model}/${windowType} restores collision-free identities and round trips full science`, async () => {
      const mod = await api();
      const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
        draft.model = model; draft.windowType = windowType;
        draft.movingStanza = { backward: { kind: "infinity" }, forward: { kind: "infinity" }, rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] } };
        data.rows = data.rows.flatMap((row, index) => [{ ...row, time: index }, { ...row, horizon: "later", time: 10 + index, A: Number(row.A) + 1 }]);
        if (model !== "EndPoint") {
          data.headers.push("step");
          data.rows = data.rows.map((row) => ({ ...row, step: row.horizon === "later" ? 2 : 1 }));
          draft.horizonOrder = { kind: "columns", keys: [{ column: "step", direction: "ascending", comparator: { type: "number" } }] };
        }
      });
      const result = await mod.bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
      await mod.validateBoundResultV3(result, plan);
      assert.equal(JSON.stringify(result.set).includes("__open_ena_"), false);
      assert.equal(result.set.points.length, model === "EndPoint" ? 5 : 10);
      assert.equal(result.executionProvenance.populations.imputedStepCount, 0);
    });
  }
}
