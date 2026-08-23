import assert from "node:assert/strict";
import test from "node:test";

import type { LongitudinalAnalysisBundleV2, LongitudinalExecutionRequestV2 } from "j-3dena";

import {
  createOpenEnaLongitudinalWorkerHostV3,
  type OpenEnaLongitudinalWorkerRequestV3,
  type OpenEnaLongitudinalWorkerResponseV3,
} from "../lib/open-ena/longitudinal-v3.worker";
import {
  OpenEnaLongitudinalExecutionClientErrorV3,
  clearOpenEnaLongitudinalExecutionCacheV3,
  estimateOpenEnaLongitudinalExecutionV3,
  executeOpenEnaLongitudinalPreparedV3,
} from "../lib/open-ena/longitudinal-v3-client";

function fakeRequest(points = 20, repetitions = 500): LongitudinalExecutionRequestV2 {
  return {
    dataset: {
      schemaVersion: "3dena.analysis-execution-dataset.v2",
      receipt: {
        schemaVersion: "3dena.dataset-receipt.v1",
        sha256: "1".repeat(64),
        byteLength: 10,
        format: "csv",
        sheet: null,
        rows: points,
        columns: 5,
        schema: { schemaVersion: "3dena.dataset-schema.v1", headers: ["id"], columns: [{ name: "id", inferredType: "string", roles: ["unit"] }] },
        limits: { schemaVersion: "3dena.dataset-limits.v1", maxFileBytes: 100, maxWorksheets: 1, maxRows: 1_000_000, maxColumns: 100, maxCells: 1_000_000 },
        warnings: [],
        activationIdentity: "fixture",
      },
      specHash: "2".repeat(64),
      buildId: "fixture-build",
      sourceResult: {
        sourceKind: "raw-jena",
        hash: "3".repeat(64),
        result: {
          schemaVersion: "3dena.analysis-result.v1",
          dimensions: ["SVD1", "SVD2", "SVD3", "SVD4"],
          axes: ["SVD1", "SVD2", "SVD3"],
          points: Array.from({ length: points }, (_, index) => ({ index })) as never,
          nodes: [], edges: [], accumulation: {}, variance: [], rotation: {}, summary: {}, diagnostics: [], provenance: {},
        } as never,
      },
    },
    pathTask: {
      schemaVersion: "3dena.trajectory-path-task.v2",
      kind: "trajectory-path-v2",
      datasetHash: "1".repeat(64),
      specHash: "2".repeat(64),
      runId: "fixture-run",
      runSpec: {
        schemaVersion: "3dena.trajectory-run-spec.v2",
        sourceResultHash: "3".repeat(64),
        participantColumns: ["id"],
        timeColumn: "time",
        groupColumn: null,
        orderedPeriods: [0, 1, 2].map((index) => ({
          identity: { components: [{ name: "time", type: "number", value: index }] },
          sourceTimeCanonical: `time-${index}`,
          displayLabel: String(index),
          expected: true,
          value: { type: "numeric-v1", value: index, unit: "period" },
        })),
        selectedDimensions: ["SVD1", "SVD2", "SVD3"],
        cohortPolicy: "available",
        missingValuePolicy: "complete-analytical-rows",
        estimand: { kind: "equal-participant" },
      },
    },
    bootstrapTask: {
      schemaVersion: "3dena.trajectory-bootstrap-task.v2",
      kind: "trajectory-bootstrap-v2",
      datasetHash: "1".repeat(64),
      specHash: "2".repeat(64),
      sourceResultHash: "3".repeat(64),
      runId: "fixture-run",
      repetitions,
      confidenceLevel: 0.95,
      seed: 2026,
      resamplingDesign: "auto",
      explicitStrataField: null,
      interval: "pointwise-percentile-linear-type7",
      rotationPolicy: "fixed-same-fit-projection",
    },
    execution: {
      target: "browser-worker",
      jenaVersion: "0.7.0-ona.0",
      jenaCommit: "4".repeat(40),
      jenaTarballIntegrity: "sha512-fixture",
      sdkVersion: "0.2.0",
      buildId: "fixture",
      seed: 2026,
    },
  };
}

function fakeBundle(request: LongitudinalExecutionRequestV2): LongitudinalAnalysisBundleV2 {
  return {
    schemaVersion: "3dena.longitudinal-analysis-bundle.v2",
    identity: {
      datasetHash: request.pathTask.datasetHash,
      specHash: request.pathTask.specHash,
      sourceResultHash: request.pathTask.runSpec.sourceResultHash,
      resultHash: "5".repeat(64),
      runId: request.pathTask.runId,
      jenaBuildId: "fixture",
    },
    runSpec: request.pathTask.runSpec,
    model: { type: "SeparateTrajectory", fullRotationDimensions: ["SVD1", "SVD2", "SVD3"], selectedDimensions: ["SVD1", "SVD2", "SVD3"] },
    paths: [], inference: [], pathComparisons: [], bootstrap: [], networkOverlays: [], diagnostics: [],
    execution: {
      target: request.execution.target,
      jenaVersion: request.execution.jenaVersion,
      jenaCommit: request.execution.jenaCommit,
      jenaTarballIntegrity: request.execution.jenaTarballIntegrity,
      sdkVersion: request.execution.sdkVersion,
      buildId: request.execution.buildId,
      seed: request.execution.seed,
      permutationPlanHashes: [],
      resamplingPlanHashes: [],
      evidenceStatus: "IMPLEMENTED_UNVERIFIED",
    },
  };
}

test("Worker V3 posts ordered progress and exactly one result for one immutable request", async () => {
  const listeners: Array<(event: { data: OpenEnaLongitudinalWorkerRequestV3 }) => void> = [];
  const responses: OpenEnaLongitudinalWorkerResponseV3[] = [];
  const request = fakeRequest();
  createOpenEnaLongitudinalWorkerHostV3({
    addEventListener: (_type, listener) => listeners.push(listener),
    postMessage: (message) => responses.push(message),
  }, { execute: async (input) => fakeBundle(input) });
  listeners[0]!({ data: { kind: "run", id: "one", request } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(responses.filter((message) => message.kind === "progress").map((message) => message.progress), [0.05, 0.22, 0.96]);
  assert.equal(responses.filter((message) => message.kind === "result").length, 1);
  assert.equal(responses.at(-1)?.kind, "result");
});

test("Worker V3 suppresses a late scientific result after cancellation", async () => {
  const listeners: Array<(event: { data: OpenEnaLongitudinalWorkerRequestV3 }) => void> = [];
  const responses: OpenEnaLongitudinalWorkerResponseV3[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  createOpenEnaLongitudinalWorkerHostV3({
    addEventListener: (_type, listener) => listeners.push(listener),
    postMessage: (message) => responses.push(message),
  }, { execute: async (input) => { await gate; return fakeBundle(input); } });
  listeners[0]!({ data: { kind: "run", id: "cancelled", request: fakeRequest() } });
  listeners[0]!({ data: { kind: "cancel", id: "cancelled" } });
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(responses.some((message) => message.kind === "result"), false);
  assert.equal(responses.at(-1)?.kind, "cancelled");
});

test("router keeps bounded work local and requires explicit confirmation above either budget", () => {
  const local = estimateOpenEnaLongitudinalExecutionV3(fakeRequest(20, 200));
  assert.equal(local.target, "browser-worker");
  assert.equal(local.requiresConfirmation, false);
  const remote = estimateOpenEnaLongitudinalExecutionV3(fakeRequest(500_000, 10_000));
  assert.equal(remote.target, "persistent-compute-service");
  assert.equal(remote.requiresConfirmation, true);
  assert.ok(remote.predictedMilliseconds > 8_000 || remote.predictedMemoryBytes > 128 * 1024 * 1024);
  assert.equal(remote.remotePayload.rawRows, false);
  assert.equal(remote.remotePayload.identities, "opaque-participant-tokens");
});

test("remote route never submits without confirmation and offers explicit local fallback", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = fakeRequest(500_000, 10_000);
  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, { allowRemote: false }),
    (error: unknown) => error instanceof OpenEnaLongitudinalExecutionClientErrorV3
      && error.code === "REMOTE_CONFIRMATION_REQUIRED"
      && error.canContinueLocally,
  );
});

test("scientific request cache ignores no display state and returns the same immutable envelope", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = fakeRequest(20, 200);
  let executions = 0;
  const executor = async (input: LongitudinalExecutionRequestV2) => {
    executions += 1;
    return fakeBundle(input);
  };
  const first = await executeOpenEnaLongitudinalPreparedV3(request, { forceLocal: true, nodeExecutor: executor, resultVerifier: async () => {} });
  const second = await executeOpenEnaLongitudinalPreparedV3(structuredClone(request), { forceLocal: true, nodeExecutor: executor, resultVerifier: async () => {} });
  assert.equal(executions, 1);
  assert.equal(first.bundle.identity.resultHash, second.bundle.identity.resultHash);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
});
