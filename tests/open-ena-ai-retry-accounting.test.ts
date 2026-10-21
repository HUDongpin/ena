import { OPEN_ENA_AI_OWNER_HEADER, openEnaAiOperationOwnerKey } from "../lib/open-ena/ai-operation-owner";
import assert from "node:assert/strict";
import test from "node:test";
import { mayRenewOpenEnaAiOperation } from "../components/open-ena/OpenEnaAiInterpretation";
import {
  OPEN_ENA_AI_CONSENT_VALUE,
  parseOpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationResponse,
} from "../lib/open-ena/ai-interpretation";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route";
import { OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1 } from "../lib/server/open-ena-ai-prompt-evaluation";
import {
  MemoryBillableStore,
  type AiConsentReceiptInput,
  type AiConsentReceiptUpdate,
} from "../lib/server/open-ena-billable";
import type { OpenEnaAiGenerationResult } from "../lib/server/deepseek-client";

const FIRST_OPERATION = "aiop-01234567-89ab-4cde-8f01-23456789abcd";
const NEW_OPERATION = "aiop-fedcba98-7654-4321-8fed-cba987654321";
const PRINCIPAL = "synthetic-retry-principal";
const LIMITS = {
  minuteRequests: 6,
  dailyMicroUsd: 198,
  monthlyMicroUsd: 198,
  globalMonthlyMicroUsd: 198,
  providerMonthlyMicroUsd: 198,
  maxConcurrency: 2,
  maxReservationMicroUsd: 99,
  longitudinalMaxReservationMicroUsd: 99,
  alertThresholds: [100],
};
const RESULT: OpenEnaAiGenerationResult = {
  // This synthetic generator supplies only the fields the handler uses for its
  // accounting receipt. Browser response parsing has separate fixture tests.
  response: { provider: "deepseek", model: "synthetic-no-provider" } as OpenEnaAiInterpretationResponse,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costMicroUsd: 99 },
  providerDispatched: true,
};

// Keep real in-memory reservation and receipt binding behavior while exercising
// the handler's mandatory-durable-receipt branch. No database or provider runs.
class SyntheticDurableBillableStore extends MemoryBillableStore {
  override async recordAiConsentReceipt(input: AiConsentReceiptInput) {
    const receipt = await super.recordAiConsentReceipt(input);
    return receipt ? { ...receipt, durable: true } : null;
  }

  override async updateAiConsentReceiptStatus(input: AiConsentReceiptUpdate) {
    const receipt = await super.updateAiConsentReceiptStatus(input);
    return receipt ? { ...receipt, durable: true } : null;
  }
}

function request(operationId: string) {
  return new Request("http://localhost/api/open-ena/ai-interpretation", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      "x-open-ena-ai-consent": OPEN_ENA_AI_CONSENT_VALUE,
      "x-open-ena-ai-operation-id": operationId,
      [OPEN_ENA_AI_OWNER_HEADER]: openEnaAiOperationOwnerKey(PRINCIPAL),
    },
    body: JSON.stringify(OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1[0].request),
  });
}

function handler(store: MemoryBillableStore, generate: () => Promise<OpenEnaAiGenerationResult>) {
  return createOpenEnaAiInterpretationPostHandler({
    environment: { NODE_ENV: "development" },
    verifyPrincipal: () => ({ principalRef: PRINCIPAL }),
    authConfigurationReady: () => true,
    billableStore: store,
    limits: LIMITS,
    requireBillable: true,
    parseRequest: parseOpenEnaAiInterpretationRequest,
    generate,
  });
}

async function assertOnlyOneReservationCharged(store: MemoryBillableStore) {
  const input = {
    principalRef: PRINCIPAL, resource: "ai-interpretation", limits: LIMITS,
  };
  const remaining = await store.reserveDetailed({ ...input, microUsd: 99, idempotencyKey: "remaining-budget" });
  assert.equal(remaining.ok, true, "one unused 99-microUSD allowance must remain");
  if (!remaining.ok) return;
  try {
    assert.deepEqual(await store.reserveDetailed({ ...input, microUsd: 1, idempotencyKey: "exhausted-budget" }), {
      ok: false, reason: "daily-ceiling",
    }, "unknown dispatched usage must still consume its full 99-microUSD reservation");
  } finally {
    await store.release(remaining.reservation);
  }
}

for (const dispatchVerdict of ["dispatched", "unknown"] as const) {
  test(`repeated retries retain operation identity and accounting after ${dispatchVerdict} provider failure`, async () => {
    const store = new SyntheticDurableBillableStore();
    let providerCalls = 0;
    const post = handler(store, async () => {
      providerCalls += 1;
      throw Object.assign(new Error("Synthetic generation failure"), {
        code: "upstream-network",
        ...(dispatchVerdict === "dispatched" ? { providerDispatched: true } : {}),
      });
    });
    for (const expectedStatus of [502, 409, 409]) {
      const response = await post(request(FIRST_OPERATION));
      assert.equal(response.status, expectedStatus);
      assert.equal(response.headers.get("x-open-ena-ai-retry"), null);
      assert.equal(mayRenewOpenEnaAiOperation(response, FIRST_OPERATION), false);
      assert.equal((await response.json()).errorCode, "operation-not-retryable", "the panel must be told that retry cannot recover this operation");
    }
    assert.equal(providerCalls, 1);
    await assertOnlyOneReservationCharged(store);
  });
}

test("409 retries do not start overlapping generation even when concurrency two is allowed", async () => {
  const store = new SyntheticDurableBillableStore();
  const entered = Promise.withResolvers<void>();
  const complete = Promise.withResolvers<OpenEnaAiGenerationResult>();
  let providerCalls = 0;
  const post = handler(store, async () => {
    providerCalls += 1;
    entered.resolve();
    return complete.promise;
  });
  const first = post(request(FIRST_OPERATION));
  await entered.promise;
  try {
    for (let retry = 0; retry < 2; retry += 1) {
      const response = await post(request(FIRST_OPERATION));
      assert.equal(response.status, 409);
      assert.equal(mayRenewOpenEnaAiOperation(response, FIRST_OPERATION), false);
      assert.equal((await response.json()).errorCode, "operation-not-retryable", "an in-progress operation must not offer another dispatch");
    }
    assert.equal(providerCalls, 1);
  } finally {
    complete.resolve(RESULT);
    assert.equal((await first).status, 200);
  }
  await assertOnlyOneReservationCharged(store);
});

test("explicit pre-dispatch release permits a fresh operation without charging the failed attempt", async () => {
  const store = new SyntheticDurableBillableStore();
  let generatorCalls = 0;
  const post = handler(store, async () => {
    generatorCalls += 1;
    if (generatorCalls === 1) {
      throw Object.assign(new Error("Synthetic pre-dispatch failure"), {
        code: "invalid-configuration", providerDispatched: false,
      });
    }
    return RESULT;
  });
  const failed = await post(request(FIRST_OPERATION));
  assert.equal(failed.status, 503);
  assert.equal(mayRenewOpenEnaAiOperation(failed, FIRST_OPERATION), true);
  assert.equal(mayRenewOpenEnaAiOperation(failed, NEW_OPERATION), false);
  assert.equal((await failed.json()).errorCode, undefined);
  const releasedReplay = await post(request(FIRST_OPERATION));
  assert.equal(releasedReplay.status, 409);
  assert.equal(mayRenewOpenEnaAiOperation(releasedReplay, FIRST_OPERATION), true);
  assert.equal((await releasedReplay.json()).errorCode, undefined, "confirmed release stays retryable");
  assert.equal((await post(request(NEW_OPERATION))).status, 200);
  assert.equal(generatorCalls, 2);
  await assertOnlyOneReservationCharged(store);
});
