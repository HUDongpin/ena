import assert from "node:assert/strict";
import test from "node:test";

import type { LongitudinalAnalysisBundleV2, LongitudinalExecutionRequestV2 } from "j-3dena";
import { createOpenEnaLongitudinalPostHandlerV3 } from "../lib/server/open-ena-longitudinal-route";

const DATASET_HASH = "1".repeat(64);
const SPEC_HASH = "2".repeat(64);
const SOURCE_HASH = "3".repeat(64);

function derivedRequest(): LongitudinalExecutionRequestV2 {
  return {
    dataset: {
      sourceResult: {
        sourceKind: "raw-jena",
        hash: SOURCE_HASH,
        result: {
          points: [{
            participantLabel: { canonical: "opaque-participant:participant-1-abcdef", values: ["participant-1-abcdef"] },
            unit: { canonical: "opaque-unit:unit-1-abcdef", values: ["A", "unit-1-abcdef"] },
            id: { canonical: "opaque-point:unit-1-abcdef:step-1-abcdef", values: ["A", 1, "unit-1-abcdef"] },
          }],
          accumulation: { rowCounts: { rowKeys: [], values: [] } },
        },
      },
    },
    pathTask: {
      datasetHash: DATASET_HASH,
      specHash: SPEC_HASH,
      runId: "route-v3-run",
      runSpec: { sourceResultHash: SOURCE_HASH },
    },
    bootstrapTask: { repetitions: 500 },
    inferenceTask: {
      requests: [{ kind: "path-comparison", repetitions: 500 }],
    },
    execution: { target: "persistent-compute-service" },
  } as unknown as LongitudinalExecutionRequestV2;
}

function bundleFor(request: LongitudinalExecutionRequestV2): LongitudinalAnalysisBundleV2 {
  return {
    identity: {
      datasetHash: request.pathTask.datasetHash,
      specHash: request.pathTask.specHash,
      sourceResultHash: request.pathTask.runSpec.sourceResultHash,
      runId: request.pathTask.runId,
    },
    execution: { target: "persistent-compute-service" },
  } as unknown as LongitudinalAnalysisBundleV2;
}

function post(request: LongitudinalExecutionRequestV2): Request {
  return new Request("http://localhost/api/open-ena/longitudinal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: 2, request }),
  });
}

test("persistent route accepts only opaque fixed-fit payloads and preserves requested repetition plans", async () => {
  let observed: LongitudinalExecutionRequestV2 | null = null;
  const handler = createOpenEnaLongitudinalPostHandlerV3({
    validateRequest: () => {},
    verify: () => {},
    execute: async (request) => {
      observed = structuredClone(request);
      return bundleFor(request);
    },
  });
  const response = await handler(post(derivedRequest()));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-open-ena-compute"), "persistent-derived-v2");
  if (!observed) assert.fail("The route did not submit a scientific request.");
  const submitted = observed as unknown as LongitudinalExecutionRequestV2;
  assert.equal(submitted.bootstrapTask?.repetitions, 500);
  assert.equal(submitted.inferenceTask?.requests[0]?.kind, "path-comparison");
  assert.equal((submitted.inferenceTask?.requests[0] as { repetitions: number }).repetitions, 500);
});

test("persistent route rejects raw participant identities before scientific execution", async () => {
  let executed = false;
  const request = derivedRequest();
  const result = request.dataset.sourceResult!.result as { points: Array<{ participantLabel: { canonical: string; values: string[] } }> };
  result.points[0]!.participantLabel = { canonical: "raw-participant:Alice", values: ["Alice"] };
  const handler = createOpenEnaLongitudinalPostHandlerV3({
    validateRequest: () => {},
    verify: () => {},
    execute: async (candidate) => { executed = true; return bundleFor(candidate); },
  });
  const response = await handler(post(request));
  assert.equal(response.status, 400);
  assert.equal(executed, false);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "PRIVACY_BOUNDARY_VIOLATION");
});

test("persistent route returns a hard deadline error without lowering repetitions", async () => {
  const handler = createOpenEnaLongitudinalPostHandlerV3({
    validateRequest: () => {},
    verify: () => {},
    deadlineMilliseconds: 5,
    execute: async () => new Promise<LongitudinalAnalysisBundleV2>(() => {}),
  });
  const response = await handler(post(derivedRequest()));
  assert.equal(response.status, 408);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "REMOTE_DEADLINE_EXCEEDED");
  assert.match(body.error.message, /Repetitions were not reduced/);
});

test("persistent route rejects unversioned or extra wrapper fields", async () => {
  const handler = createOpenEnaLongitudinalPostHandlerV3({
    validateRequest: () => {},
    verify: () => {},
    execute: async (candidate) => bundleFor(candidate),
  });
  const response = await handler(new Request("http://localhost/api/open-ena/longitudinal", {
    method: "POST",
    body: JSON.stringify({ schemaVersion: 2, request: derivedRequest(), rawRows: [] }),
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "INVALID_REQUEST");
});
