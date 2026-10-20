import assert from "node:assert/strict";
import test from "node:test";
import { MemoryBillableStore } from "../lib/server/open-ena-billable";
import { createOpenEnaLongitudinalPostHandlerV3 } from "../lib/server/open-ena-longitudinal-route";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

const origin = "https://review.invalid";
const limits = { minuteRequests: 1_000, dailyMicroUsd: 1_000_000, monthlyMicroUsd: 1_000_000, globalMonthlyMicroUsd: 1_000_000, providerMonthlyMicroUsd: 1_000_000, maxConcurrency: 2, maxReservationMicroUsd: 10_000, longitudinalMaxReservationMicroUsd: 20_000, alertThresholds: [50, 80, 100] } as const;
function rig() {
  let reserves = 0, dispatches = 0;
  const store = new MemoryBillableStore();
  const reserveDetailed = store.reserveDetailed.bind(store);
  store.reserveDetailed = async (...args) => { reserves++; return reserveDetailed(...args); };
  const handler = createOpenEnaLongitudinalPostHandlerV3({ environment: { OPEN_ENA_PUBLIC_ORIGIN: origin, OPEN_ENA_LONGITUDINAL_COMPUTE_URL: "https://compute.invalid", OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN: "synthetic-request-boundary-token" }, verifyPrincipal: () => ({ principalRef: "synthetic-request-principal" }), billableStore: store, limits, upstreamFetch: async () => { dispatches++; throw new Error("No test request may reach the provider"); } });
  return { handler, assertNoPaidWork: () => { assert.equal(reserves, 0); assert.equal(dispatches, 0); } };
}
function incoming(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/open-ena/longitudinal`, { method: "POST", headers: { origin, ...headers }, body, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
}
function wire(request: unknown) { return JSON.stringify({ schemaVersion: "3dena.open-ena-longitudinal-remote-submit.v3", processingPolicyConfirmed: true, executionAttemptId: "attempt-0123456789abcdef0123456789abcdef", request }); }

for (const path of ["execution", "dataset", "pathTask", "pathTask.runSpec", "pathTask.runSpec.participantColumns"]) {
  test(`malformed nested request ${path} is a client validation failure before reservation`, async () => {
    for (const value of [undefined, null]) {
      const request = await validOpenEnaLongitudinalRequestV3(20, 200);
      request.execution.target = "persistent-compute-service";
      const parts = path.split(".");
      let parent = request as unknown as Record<string, unknown>;
      for (const part of parts.slice(0, -1)) parent = parent[part] as Record<string, unknown>;
      parent[parts.at(-1)!] = value;
      const check = rig();
      const response = await check.handler(incoming(wire(request)));
      assert.equal(response.status, 400, `${path}=${String(value)}`);
      assert.equal((await response.json() as { error: { code: string } }).error.code, "INVALID_LONGITUDINAL_TASK");
      check.assertNoPaidWork();
    }
  });
}

test("default 32 MiB request bound cancels a streamed body and never reserves or dispatches", async () => {
  let chunks = 0, cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  const check = rig();
  const response = await check.handler(incoming(body));
  assert.equal(response.status, 413);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "DERIVED_PAYLOAD_TOO_LARGE");
  assert.equal(cancelled, true); assert.ok(chunks <= 34, `unbounded reads: ${chunks}`); check.assertNoPaidWork();
});

test("declared size, UTF-8, JSON and framing failures stop before paid work", async () => {
  for (const [body, headers, status, code] of [
    ["{}", { "content-length": String(32 * 1024 * 1024 + 1) }, 413, "DERIVED_PAYLOAD_TOO_LARGE"],
    ["{}", { "content-length": "02" }, 400, "INVALID_REQUEST"],
    ["{}", { "content-length": "1" }, 400, "INVALID_REQUEST"],
    [new Uint8Array([0xc3, 0x28]), {}, 400, "INVALID_JSON"],
    ["{", {}, 400, "INVALID_JSON"],
    ["null", {}, 400, "INVALID_REQUEST"],
  ] as const) {
    const check = rig(); const response = await check.handler(incoming(body, headers));
    assert.equal(response.status, status); assert.equal((await response.json() as { error: { code: string } }).error.code, code); check.assertNoPaidWork();
  }
});
