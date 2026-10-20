import { OPEN_ENA_AI_OWNER_HEADER, openEnaAiOperationOwnerKey } from "../lib/open-ena/ai-operation-owner";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_ENA_AI_CONSENT_VALUE,
  OPEN_ENA_AI_OPERATION_HEADER,
  OPEN_ENA_AI_RETRY_HEADER,
  type OpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationResponse,
} from "../lib/open-ena/ai-interpretation";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route";
import { MemoryBillableStore } from "../lib/server/open-ena-billable";

const OPERATION = "aiop-01234567-89ab-4cde-8f01-23456789abcd";
const NEXT_OPERATION = "aiop-fedcba98-7654-4321-8fed-cba987654321";
const limits = {
  minuteRequests: 20,
  dailyMicroUsd: 99,
  monthlyMicroUsd: 99,
  globalMonthlyMicroUsd: 99,
  providerMonthlyMicroUsd: 99,
  maxConcurrency: 1,
  maxReservationMicroUsd: 99,
  longitudinalMaxReservationMicroUsd: 99,
  alertThresholds: [],
};

function request(operationId = OPERATION) {
  return new Request("http://localhost:3000/api/open-ena/ai-interpretation", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "x-open-ena-ai-consent": OPEN_ENA_AI_CONSENT_VALUE,
      [OPEN_ENA_AI_OPERATION_HEADER]: operationId,
      [OPEN_ENA_AI_OWNER_HEADER]: openEnaAiOperationOwnerKey("synthetic-receipt-principal"),
    },
    body: "{}",
  });
}

function fixture(
  failure: "record-null" | "record-throws" | "terminal-update",
  releaseFails = false,
  dispatchOutcome: "not-sent" | "sent" | "unknown" = "not-sent",
) {
  const store = new MemoryBillableStore();
  const record = store.recordAiConsentReceipt.bind(store);
  const update = store.updateAiConsentReceiptStatus.bind(store);
  let recovered = false;
  let paidDispatches = 0;
  let releases = 0;
  store.recordAiConsentReceipt = async (input) => {
    if (!recovered && failure === "record-null") return null;
    if (!recovered && failure === "record-throws") throw new Error("synthetic receipt outage");
    const receipt = await record(input);
    return receipt && { ...receipt, durable: true };
  };
  store.updateAiConsentReceiptStatus = async (input) => {
    if (!recovered && failure === "terminal-update") throw new Error("synthetic receipt outage");
    const receipt = await update(input);
    return receipt && { ...receipt, durable: true };
  };
  const release = store.release.bind(store);
  store.release = async (reservation) => {
    releases += 1;
    if (releaseFails) throw new Error("synthetic release outage");
    await release(reservation);
  };
  const handler = createOpenEnaAiInterpretationPostHandler({
    verifyPrincipal: () => ({ principalRef: "synthetic-receipt-principal" }),
    authConfigurationReady: () => true,
    billableStore: store,
    requireBillable: true,
    limits,
    parseRequest: () => ({ fixture: true }) as unknown as OpenEnaAiInterpretationRequest,
    generate: async () => {
      if (!recovered && failure === "terminal-update") {
        if (dispatchOutcome !== "not-sent") paidDispatches += 1;
        throw Object.assign(new Error("synthetic provider failure"), {
          code: "invalid-configuration",
          ...(dispatchOutcome === "unknown" ? {} : { providerDispatched: dispatchOutcome === "sent" }),
        });
      }
      paidDispatches += 1;
      return {
        response: { provider: "deepseek", model: "deepseek-flash" } as OpenEnaAiInterpretationResponse,
        usage: null,
        providerDispatched: true,
      };
    },
  });
  return {
    handler,
    recover: () => { recovered = true; },
    dispatches: () => paidDispatches,
    releases: () => releases,
  };
}

for (const failure of ["record-null", "record-throws", "terminal-update"] as const) {
  test(`receipt ${failure} permits safe operation renewal only after a successful pre-dispatch release`, async () => {
    const state = fixture(failure);
    const failed = await state.handler(request());
    assert.equal(failed.status, 503);
    assert.equal(state.dispatches(), 0);
    assert.equal(state.releases(), 1);
    assert.equal(failed.headers.get(OPEN_ENA_AI_RETRY_HEADER), "new-operation");
    assert.equal(failed.headers.get(OPEN_ENA_AI_OPERATION_HEADER), OPERATION);
    state.recover();
    assert.equal((await state.handler(request())).status, 409, "the old operation still cannot be replayed");
    assert.equal((await state.handler(request(NEXT_OPERATION))).status, 200, "released budget and concurrency permit the renewed attempt");
    assert.equal(state.dispatches(), 1);
  });

  test(`receipt ${failure} with failed release never authorizes a new operation`, async () => {
    const state = fixture(failure, true);
    const failed = await state.handler(request());
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get(OPEN_ENA_AI_RETRY_HEADER), null);
    assert.equal(state.releases(), 1);
    state.recover();
    assert.equal((await state.handler(request())).status, 409);
    assert.equal((await state.handler(request(NEXT_OPERATION))).status, 503, "unreleased reservation retains budget and concurrency");
    assert.equal(state.dispatches(), 0);
  });
}

for (const dispatchOutcome of ["sent", "unknown"] as const) {
  test(`receipt terminal failure with ${dispatchOutcome} dispatch retains spend and never authorizes renewal`, async () => {
    const state = fixture("terminal-update", false, dispatchOutcome);
    const failed = await state.handler(request());
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get(OPEN_ENA_AI_RETRY_HEADER), null);
    assert.equal(state.releases(), 0);
    state.recover();
    assert.equal((await state.handler(request())).status, 409);
    assert.equal((await state.handler(request(NEXT_OPERATION))).status, 503, "sent or unknown usage remains charged");
    assert.equal(state.dispatches(), 1);
  });
}
