import assert from "node:assert/strict";
import test from "node:test";
import type { ENASet } from "jena-js";
import { runStandardPlanV3, standardRuntimeDiagnosticsV3 } from "../lib/open-ena/analyze";
import { bindResultV3, scientificResultHashPayloadV3, validateBoundResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { buildReferenceV2, fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";

const observed = (rows: number) => ({ processedRows: rows, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" as const });
const mutations: readonly [string, (set: ENASet) => void][] = [
  ["Code field on counts", (set) => { set.connectionCounts[0][set.codes[0]] = 123; }],
  ["Code field on points", (set) => { set.points[0][set.codes[0]] = 123; }],
  ["projected point", (set) => { set.points[0][set.rotation.rotationColumns[0]] = Number(set.points[0][set.rotation.rotationColumns[0]]) + 123; }],
  ["line weight", (set) => { set.lineWeights[0][set.codeColumns[0]] = Number(set.lineWeights[0][set.codeColumns[0]]) + 123; }],
  ["projection input", (set) => { set.pointsForProjection[0][set.codeColumns[0]] = Number(set.pointsForProjection[0][set.codeColumns[0]]) + 123; }],
  ["centroid", (set) => { set.centroids![0][set.rotation.rotationColumns[0]] = Number(set.centroids![0][set.rotation.rotationColumns[0]]) + 123; }],
  ["node", (set) => { set.rotation.nodes![0][set.rotation.rotationColumns[0]] = Number(set.rotation.nodes![0][set.rotation.rotationColumns[0]]) + 123; }],
  ["source aggregate", (set) => { set.connectionMatrix[0] = set.connectionMatrix[0].map((value) => value * 2); set.codeColumns.forEach((edge, index) => { set.connectionCounts[0][edge] = set.connectionMatrix[0][index]; }); }],
];

for (const scenario of ["svd", "means", "reference", "reference SeparateTrajectory", "reference AccumulatedTrajectory"] as const) {
  const rotation = scenario.startsWith("reference") ? "reference" : scenario;
  for (const boundary of ["direct binding", "rehash import"] as const) {
    for (const [label, mutate] of mutations) {
      test(`${scenario} ${boundary} rejects inconsistent ${label}`, async () => {
        const source = await bindingFixtureV3(undefined, (draft) => {
          if (rotation === "means") draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
        });
        const reference = rotation === "reference" ? await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Fixed closure source", currentPlan: source.plan }) : undefined;
        const { plan, compiled } = reference ? await bindingFixtureV3("b".repeat(64), (draft, data) => {
          draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 };
          if (scenario === "reference SeparateTrajectory") draft.model = "SeparateTrajectory";
          if (scenario === "reference AccumulatedTrajectory") draft.model = "AccumulatedTrajectory";
          if (draft.model !== "EndPoint") data.rows.push(...data.rows.map((row) => ({ ...row, horizon: "last", time: 4, A: Number(row.A) + 1 })));
        }, reference) : source;
        const runtime = structuredClone(runStandardPlanV3(plan));
        if (boundary === "direct binding") {
          mutate(runtime.set);
          await assert.rejects(() => bindResultV3(plan, runtime, observed(plan.rows.length), compiled.diagnostics), /scientific|deriv|source|fields|geometry|reference/i);
        } else {
          const changed = structuredClone(await bindResultV3(plan, runtime, observed(plan.rows.length), compiled.diagnostics));
          mutate(changed.set as unknown as ENASet);
          Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(changed)) });
          await assert.rejects(() => validateBoundResultV3(changed, plan), /scientific|deriv|source|fields|geometry|reference/i);
        }
      });
    }
  }
}

for (const boundary of ["direct binding", "rehash import"] as const) {
  test(`${boundary} rejects a reversed orthonormal Means contrast`, async () => {
    const { plan, compiled } = await bindingFixtureV3(undefined, (draft) => {
      draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
    });
    const runtime = structuredClone(runStandardPlanV3(plan));
    const reverse = (set: ENASet) => {
      for (const row of set.rotation.rotationMatrix) row[0] *= -1;
      for (const rows of [set.points, set.centroids!, set.rotation.nodes!]) for (const row of rows) row.MR1 = -Number(row.MR1);
    };
    if (boundary === "direct binding") {
      reverse(runtime.set);
      await assert.rejects(() => bindResultV3(plan, runtime, observed(5), compiled.diagnostics), /Means|MR1|contrast/i);
    } else {
      const changed = structuredClone(await bindResultV3(plan, runtime, observed(5), compiled.diagnostics));
      reverse(changed.set as unknown as ENASet);
      Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(changed)) });
      await assert.rejects(() => validateBoundResultV3(changed, plan), /Means|MR1|contrast/i);
    }
  });

  test(`${boundary} compares tiny source counts relatively without an absolute tolerance floor`, async () => {
    const { plan, compiled } = await bindingFixtureV3(undefined, (_draft, data) => {
      data.rows = data.rows.map((row) => ({ ...row, A: Number(row.A) * 1e-100, B: Number(row.B) * 1e-100, C: Number(row.C) * 1e-100 }));
    });
    const runtime = structuredClone(runStandardPlanV3(plan));
    const forge = (set: ENASet) => {
      set.connectionMatrix.forEach((row, index) => row.forEach((value, edge) => {
        set.connectionMatrix[index][edge] = value * 1e100;
        set.connectionCounts[index][set.codeColumns[edge]] = value * 1e100;
      }));
    };
    if (boundary === "direct binding") {
      forge(runtime.set);
      await assert.rejects(() => bindResultV3(plan, runtime, observed(5), compiled.diagnostics), /source.*aggregate|source.*count/i);
    } else {
      const changed = structuredClone(await bindResultV3(plan, runtime, observed(5), compiled.diagnostics));
      forge(changed.set as unknown as ENASet);
      Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(changed)) });
      await assert.rejects(() => validateBoundResultV3(changed, plan), /source.*aggregate|source.*count/i);
    }
  });
}

test("owned prepared binding captures the plan before awaiting and does not trust its public receiver", async () => {
  const module = await import("../lib/open-ena/model-v3/result-binding");
  const prepare = Reflect.get(module, "prepareStandardResultBindingV3");
  assert.equal(typeof prepare, "function", "worker binding must own the single real readiness oracle");
  const { plan } = await bindingFixtureV3();
  const callerPlan = structuredClone(plan);
  const preparedPromise = prepare(callerPlan);
  Object.assign(callerPlan.rows[0].codeValues, { [plan.codeDictionary.codes[0].token]: 999 });
  const prepared = await preparedPromise;
  const runtime = structuredClone(runStandardPlanV3(plan));
  const promise = prepared.bind.call({ compiled: { diagnostics: [], sourceEvidence: { targetVectors: [[999]] } } }, runtime, observed(5));
  runtime.set.points[0].SVD1 = 999;
  const result = await promise;
  await validateBoundResultV3(result, plan);
  assert.notEqual(result.set.points[0].SVD1, 999);
});

for (const boundary of ["direct binding", "rehash import"] as const) test(`Reference ${boundary} rejects a coherently declared false target rank`, async () => {
  const { plan: source } = await bindingFixtureV3();
  const reference = await buildReferenceV2(await fitReferenceSourceV3(source), { displayName: "Rank source", currentPlan: source });
  const { plan, compiled } = await bindingFixtureV3("b".repeat(64), (draft) => { draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; }, reference);
  const runtime = structuredClone(runStandardPlanV3(plan));
  assert.ok(runtime.projection.rank > 0);
  if (boundary === "rehash import") {
    const forged = structuredClone(await bindResultV3(plan, runtime, observed(5), compiled.diagnostics));
    Object.assign(forged.executionProvenance.projection, { rank: 0, targetProjectionRank: 0 });
    Object.assign(forged.executionProvenance, { diagnostics: [...compiled.diagnostics, ...standardRuntimeDiagnosticsV3("reference", 0, null)] });
    Object.assign(forged.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(forged)) });
    await assert.rejects(() => validateBoundResultV3(forged, plan), /target rank|fixed projection/i);
    return;
  }
  Object.assign(runtime.projection, { rank: 0, targetProjectionRank: 0 });
  Object.assign(runtime, { diagnostics: standardRuntimeDiagnosticsV3("reference", 0, null) });
  await assert.rejects(() => bindResultV3(plan, runtime, observed(5), compiled.diagnostics), /target rank|fixed projection/i);
});

for (const boundary of ["direct binding", "rehash import"] as const) {
  for (const mutation of ["center", "variance", "eigenvalue", "cross-axis"] as const) {
    test(`${boundary} rejects coherent false ${mutation} declarations`, async () => {
      const { plan, compiled } = await bindingFixtureV3();
      const runtime = structuredClone(runStandardPlanV3(plan));
      const forged = boundary === "direct binding" ? runtime : structuredClone(await bindResultV3(plan, runtime, observed(5), compiled.diagnostics));
      const set = forged.set as unknown as ENASet;
      const projection = "projection" in forged ? forged.projection : forged.executionProvenance.projection;
      if (mutation === "center") {
        set.rotation.centerVector[0] += 0.2;
        Object.assign(projection.centerVector, { 0: set.rotation.centerVector[0] });
      } else if (mutation === "variance") {
        const axis = set.rotation.rotationColumns[0];
        set.variance[axis] /= 2;
        Object.assign(projection.variance, { 0: set.variance[axis] });
      } else if (mutation === "eigenvalue") {
        set.rotation.eigenvalues[0] *= 2;
      } else {
        // Still orthonormal, with correct diagonal energies, but no longer a
        // covariance eigenbasis. Reject the off-diagonal residual itself.
        for (const row of set.rotation.rotationMatrix) {
          const [left, right] = row;
          row[0] = (left + right) / Math.sqrt(2);
          row[1] = (right - left) / Math.sqrt(2);
        }
        for (let axis = 0; axis < set.rotation.rotationColumns.length; axis += 1) {
          set.rotation.eigenvalues[axis] = set.pointsForProjection.reduce((sum, row) => sum + set.codeColumns.reduce((dot, key, edge) => dot + Number(row[key]) * set.rotation.rotationMatrix[edge][axis], 0) ** 2, 0) / (set.pointsForProjection.length - 1);
        }
      }
      if ("binding" in forged) {
        Object.assign(forged.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(forged)) });
        await assert.rejects(() => validateBoundResultV3(forged, plan), /scientific|variance|eigenvalue|covariance/i);
      } else await assert.rejects(() => bindResultV3(plan, forged, observed(5), compiled.diagnostics), /scientific|variance|eigenvalue|covariance/i);
    });
  }
}
