import { createHash } from "node:crypto";
import {
  openEnaV2AuthConfigurationReady,
  OPEN_ENA_SESSION_COOKIE,
} from "@/lib/open-ena-auth";
import { verifyProductionOpenEnaSessionTokenV2 } from "@/lib/server/open-ena-auth-security-store";
import { createProductionBillableStore, parseBillablePolicy, type BillableStore, type BillableLimits } from "./open-ena-billable";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import {
  OPEN_ENA_AI_CONSENT_HEADER,
  OPEN_ENA_AI_CONSENT_VALUE,
  OPEN_ENA_AI_OPERATION_HEADER,
  OPEN_ENA_AI_OPERATION_ID,
  parseOpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationResponse,
} from "@/lib/open-ena/ai-interpretation";
import {
  generateLunaInterpretation,
  OPEN_ENA_AI_DEFAULT_MODEL,
  type OpenEnaAiGenerationResult,
} from "@/lib/server/luna-client";
import type {
  AiConsentReceipt,
  AiConsentReceiptInput,
  AiConsentReceiptUpdate,
} from "./open-ena-billable";

export const OPEN_ENA_AI_MAX_REQUEST_BYTES = 48 * 1024;

interface OpenEnaAiInterpretationRouteDependencies {
  verifyPrincipal: (token: string | undefined) => { principalRef: string } | null | Promise<{ principalRef: string } | null>;
  authConfigurationReady: () => boolean;
  environment?: Readonly<Record<string, string | undefined>>;
  providerDescriptor?: () => { provider: string; model: string };
  /** Unit-test seam only. Production uses the durable BillableStore implementation. */
  consumeQuota?: (principalRef: string) => boolean | Promise<boolean>;
  billableStore?: BillableStore;
  limits?: BillableLimits;
  requireBillable?: boolean;
  billableStoreFactory?: () => Promise<BillableStore | null>;
  parseRequest: (value: unknown) => OpenEnaAiInterpretationRequest;
  generate: (
    request: OpenEnaAiInterpretationRequest,
    signal: AbortSignal,
  ) => Promise<OpenEnaAiGenerationResult>;
}

export const OPEN_ENA_AI_RATE_LIMIT_WINDOW_MS = 60_000;
export const OPEN_ENA_AI_RATE_LIMIT_REQUESTS = 6;

export function openEnaAiAuthConfigurationReady(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return openEnaV2AuthConfigurationReady(environment);
}

function jsonResponse(body: unknown, status: number, extraHeaders: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestSha256(value: unknown) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

const CONSENT_POLICY_VERSION = OPEN_ENA_AI_CONSENT_VALUE;

function receiptHeaders(receipt: AiConsentReceipt): HeadersInit {
  return {
    "x-open-ena-ai-receipt-id": receipt.id,
    "x-open-ena-ai-receipt-durable": String(receipt.durable),
    "x-open-ena-ai-receipt-status": receipt.status,
    "x-open-ena-ai-receipt-recorded-at": receipt.recordedAt,
    "x-open-ena-ai-operation-id": receipt.operationId,
    "x-open-ena-ai-request-sha256": receipt.requestSha256,
    "x-open-ena-ai-consent-policy": receipt.consentPolicyVersion,
    "x-open-ena-ai-receipt-provider": receipt.provider,
    "x-open-ena-ai-receipt-model": receipt.model,
  };
}

function receiptBindsToRequest(
  receipt: AiConsentReceipt,
  input: AiConsentReceiptInput,
  requireDurable: boolean,
) {
  const principalRefHash = createHash("sha256").update(input.principalRef, "utf8").digest("hex");
  return receipt.principalRefHash === principalRefHash
    && receipt.operationId === input.operationId
    && receipt.requestSha256 === input.requestSha256
    && receipt.consentPolicyVersion === input.consentPolicyVersion
    && receipt.provider === input.provider
    && receipt.model === input.model
    && (!requireDurable || receipt.durable);
}

function cookieValue(headers: Headers, name: string) {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function declaredContentLength(headers: Headers) {
  const header = headers.get("content-length");
  if (header === null) return null;
  if (!/^\d+$/u.test(header)) return Number.NaN;
  return Number(header);
}

class RequestBodyTooLargeError extends Error {}

async function readBoundedRequestBody(request: Request) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > OPEN_ENA_AI_MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function errorProperty(error: unknown, property: string) {
  if (typeof error !== "object" || error === null || !(property in error)) {
    return undefined;
  }

  return (error as Record<string, unknown>)[property];
}

function safeProviderFailure(error: unknown) {
  const status = Number(
    errorProperty(error, "status")
      ?? errorProperty(error, "statusCode")
      ?? errorProperty(error, "httpStatus"),
  );
  const code = errorProperty(error, "code");
  const name = errorProperty(error, "name");

  if (status === 402 || code === "upstream-payment-required") {
    return jsonResponse(
      { error: "OpenRouter credits are required before AI interpretation can run." },
      402,
    );
  }
  if (status === 429 || code === "upstream-rate-limited") {
    return jsonResponse(
      { error: "The AI interpretation provider is rate limited. Please try again later." },
      429,
    );
  }
  if (code === "upgrade-required") {
    return jsonResponse(
      { error: "Historical AI requests cannot be sent. Build and review a current v2 inference request." },
      400,
    );
  }
  if (
    status === 503
    || code === "disabled"
    || code === "missing-api-key"
    || code === "invalid-configuration"
    || code === "upstream-unavailable"
  ) {
    return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
  }
  if (code === "upstream-cancelled") {
    return jsonResponse({ error: "The AI interpretation request was cancelled." }, 499);
  }
  if (
    status === 504
    || code === "upstream-timeout"
    || code === "ABORT_ERR"
    || code === "ETIMEDOUT"
    || name === "AbortError"
  ) {
    return jsonResponse({ error: "The AI interpretation provider timed out." }, 504);
  }

  return jsonResponse({ error: "The AI interpretation provider request failed." }, 502);
}

export function createOpenEnaAiInterpretationPostHandler(
  dependencies: OpenEnaAiInterpretationRouteDependencies,
) {
  return async function handleOpenEnaAiInterpretationPost(request: Request) {
    const sessionToken = cookieValue(request.headers, OPEN_ENA_SESSION_COOKIE);
    let principal: { principalRef: string } | null;
    try {
      principal = await dependencies.verifyPrincipal(sessionToken);
    } catch {
      return jsonResponse({ error: "Authentication service is temporarily unavailable." }, 503);
    }
    if (!principal) {
      return jsonResponse({ error: "Authentication required." }, 401);
    }

    let authReady = false;
    try {
      authReady = dependencies.authConfigurationReady();
    } catch {
      return jsonResponse({ error: "AI interpretation requires explicit secure access configuration." }, 503);
    }
    if (!authReady) {
      return jsonResponse({ error: "AI interpretation requires explicit secure access configuration." }, 503);
    }

    const submittedOrigin = request.headers.get("origin");
    if (!submittedOrigin) {
      return jsonResponse({ error: "Invalid request origin." }, 403);
    }

    const requestOrigin = resolveOpenEnaRequestOrigin(
      request.headers,
      new URL(request.url).origin,
      dependencies.environment,
    );
    if (!requestOrigin) {
      return jsonResponse({ error: "Invalid request origin." }, 403);
    }
    if (request.headers.get(OPEN_ENA_AI_CONSENT_HEADER) !== OPEN_ENA_AI_CONSENT_VALUE) {
      return jsonResponse({ error: "Reviewed aggregate consent is required." }, 428);
    }
    let store: BillableStore | null = dependencies.billableStore ?? null;
    try {
      if (!store && dependencies.billableStoreFactory) {
        store = await dependencies.billableStoreFactory();
      }
    } catch {
      return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
    }
    if (dependencies.requireBillable && !store) {
      return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
    }
    const limits = dependencies.limits ?? (store ? parseBillablePolicy(dependencies.environment ?? process.env) : null);
    if (store && !limits) {
      return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
    }
    try {
      const quotaAllowed = dependencies.consumeQuota
        ? await dependencies.consumeQuota(principal.principalRef)
        : store && limits
          ? await store.consumeQuota(
              principal.principalRef,
              "ai-interpretation",
              limits.minuteRequests,
            )
          : true;
      if (!quotaAllowed) {
        return jsonResponse({ error: "Too many AI interpretation requests. Please try again later." }, 429);
      }
    } catch {
      return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
    }
    const operationId = request.headers.get(OPEN_ENA_AI_OPERATION_HEADER);
    if (!operationId || !OPEN_ENA_AI_OPERATION_ID.test(operationId)) {
      return jsonResponse({ error: "A valid AI generation operation is required." }, 400);
    }

    const contentLength = declaredContentLength(request.headers);
    if (Number.isNaN(contentLength)) {
      return jsonResponse({ error: "Invalid Content-Length header." }, 400);
    }
    if (contentLength !== null && contentLength > OPEN_ENA_AI_MAX_REQUEST_BYTES) {
      return jsonResponse({ error: "The AI interpretation request is too large." }, 413);
    }

    let bytes: Uint8Array;
    try {
      bytes = await readBoundedRequestBody(request);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return jsonResponse({ error: "The AI interpretation request is too large." }, 413);
      }
      return jsonResponse(
        { error: "The AI interpretation request body could not be read." },
        400,
      );
    }
    let value: unknown;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      value = JSON.parse(text);
    } catch {
      return jsonResponse(
        { error: "The AI interpretation request must be valid UTF-8 JSON." },
        400,
      );
    }

    let parsedRequest: OpenEnaAiInterpretationRequest;
    try {
      parsedRequest = dependencies.parseRequest(value);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "The AI interpretation request is invalid.";
      return jsonResponse({ error: message }, 400);
    }

    let descriptor: { provider: string; model: string };
    try {
      descriptor = dependencies.providerDescriptor?.() ?? {
        provider: "openrouter",
        model: dependencies.environment?.OPEN_ENA_AI_MODEL?.trim() || OPEN_ENA_AI_DEFAULT_MODEL,
      };
    } catch {
      return jsonResponse({ error: "AI interpretation provider configuration is unavailable." }, 503);
    }
    if (
      typeof descriptor.provider !== "string"
      || !/^[A-Za-z0-9._:/@-]{1,80}$/u.test(descriptor.provider)
      || typeof descriptor.model !== "string"
      || !/^[A-Za-z0-9._:/@-]{1,160}$/u.test(descriptor.model)
    ) {
      return jsonResponse({ error: "AI interpretation provider configuration is unavailable." }, 503);
    }
    const parsedRequestSha256 = requestSha256(parsedRequest);
    let reservation;
    let consentReceipt: AiConsentReceipt | null = null;
    if (store && limits) {
      const reservationInput = {
        principalRef: principal.principalRef,
        resource: "ai-interpretation",
        microUsd: limits.maxReservationMicroUsd,
        idempotencyKey: operationId,
        limits,
      };
      let result;
      try {
        result = store.reserveDetailed
          ? await store.reserveDetailed(reservationInput)
          : {
              ok: true as const,
              reservation: await store.reserve(reservationInput),
            };
      } catch {
        return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
      }
      if (!result.ok || !result.reservation) {
        if (!result.ok && result.reason === "idempotency-replayed") {
          return jsonResponse({ error: "This AI generation operation was already processed." }, 409);
        }
        try {
          await store.alert({
            code: "billable-denied",
            principalRef: principal.principalRef,
            metadata: {
              reason: result.ok ? "store-failure" : result.reason,
              resource: "ai-interpretation",
            },
          });
        } catch {
          // The request is already denied; never retry or dispatch because alert delivery failed.
        }
        return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
      }
      reservation = result.reservation;
    }

    const recordReceipt = store?.recordAiConsentReceipt;
    const updateReceipt = store?.updateAiConsentReceiptStatus;
    const receiptInput: AiConsentReceiptInput = {
      principalRef: principal.principalRef,
      operationId,
      requestSha256: parsedRequestSha256,
      consentPolicyVersion: CONSENT_POLICY_VERSION,
      provider: descriptor.provider,
      model: descriptor.model,
    };
    if (recordReceipt) {
      try {
        consentReceipt = await recordReceipt.call(store, receiptInput);
      } catch {
        consentReceipt = null;
      }
    }
    if (consentReceipt && !receiptBindsToRequest(consentReceipt, receiptInput, Boolean(dependencies.requireBillable))) {
      consentReceipt = null;
    }
    if (store && dependencies.requireBillable && (!recordReceipt || !updateReceipt || !consentReceipt)) {
      if (reservation) {
        try {
          await store.release(reservation);
        } catch {
          // Keep the response fail-closed even if cleanup is unavailable.
        }
      }
      return jsonResponse({ error: "AI interpretation consent receipt storage is unavailable." }, 503);
    }

    let result: OpenEnaAiGenerationResult;
    try {
      result = await dependencies.generate(parsedRequest, request.signal);
    } catch (error) {
      let receiptTerminalFailure = false;
      if (consentReceipt && store?.updateAiConsentReceiptStatus) {
        try {
          const failed = await store.updateAiConsentReceiptStatus({
            receiptId: consentReceipt.id,
            status: "failed",
            provider: descriptor.provider,
            model: descriptor.model,
          } satisfies AiConsentReceiptUpdate);
          const failedInput = { ...receiptInput, provider: descriptor.provider, model: descriptor.model };
          if (failed && failed.status === "failed" && receiptBindsToRequest(failed, failedInput, Boolean(dependencies.requireBillable))) {
            consentReceipt = failed;
          } else {
            receiptTerminalFailure = Boolean(dependencies.requireBillable);
            consentReceipt = null;
          }
        } catch {
          receiptTerminalFailure = Boolean(dependencies.requireBillable);
          consentReceipt = null;
        }
      }
      if (reservation) {
        const dispatched = errorProperty(error, "providerDispatched") === true;
        try {
          if (dispatched) {
            await store!.settle(reservation, null, true);
            try {
              await store!.alert({
                code: "provider-dispatch-failed",
                principalRef: principal.principalRef,
                metadata: { resource: "ai-interpretation" },
              });
            } catch {
              // Settlement already succeeded; do not encourage a second provider dispatch.
            }
          } else await store!.release(reservation);
        } catch {
          return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
        }
      }
      if (receiptTerminalFailure) {
        return jsonResponse({ error: "AI interpretation consent receipt storage is unavailable." }, 503);
      }
      return safeProviderFailure(error);
    }
    if (reservation) {
      try {
        if (result.usage) await store!.settle(reservation, result.usage.costMicroUsd, true);
        else {
          await store!.settle(reservation, null, true);
          try {
            await store!.alert({
              code: "provider-usage-missing",
              principalRef: principal.principalRef,
              metadata: { resource: "ai-interpretation" },
            });
          } catch {
            // Settlement is authoritative; an alert outage must not trigger a paid retry.
          }
        }
      } catch {
        return jsonResponse({ error: "AI interpretation is temporarily unavailable." }, 503);
      }
    }
    if (consentReceipt && store?.updateAiConsentReceiptStatus) {
      let receiptTerminalFailure = false;
      try {
        const completed = await store.updateAiConsentReceiptStatus({
          receiptId: consentReceipt.id,
          status: "completed",
          provider: result.response.provider,
          model: result.response.model,
        });
        const completedInput = { ...receiptInput, provider: result.response.provider, model: result.response.model };
        if (completed && completed.status === "completed" && receiptBindsToRequest(completed, completedInput, Boolean(dependencies.requireBillable))) {
          consentReceipt = completed;
        } else {
          receiptTerminalFailure = Boolean(dependencies.requireBillable);
          consentReceipt = null;
        }
      } catch {
        receiptTerminalFailure = Boolean(dependencies.requireBillable);
        consentReceipt = null;
      }
      if (receiptTerminalFailure) {
        return jsonResponse({ error: "AI interpretation consent receipt storage is unavailable." }, 503);
      }
    }
    return jsonResponse(result.response, 200, consentReceipt ? receiptHeaders(consentReceipt) : {});
  };
}

const productionPostHandler = createOpenEnaAiInterpretationPostHandler({
  verifyPrincipal: (token) => verifyProductionOpenEnaSessionTokenV2(token),
  authConfigurationReady: openEnaAiAuthConfigurationReady,
  environment: process.env,
  requireBillable: true,
  billableStoreFactory: () => createProductionBillableStore(),
  parseRequest: parseOpenEnaAiInterpretationRequest,
  generate: (request, signal) => {
    const limits = parseBillablePolicy(process.env);
    if (!limits) return Promise.reject(Object.assign(new Error("AI interpretation billing policy is unavailable."), { code: "invalid-configuration", providerDispatched: false }));
    return generateLunaInterpretation(request, {
      signal,
      providerMonthlyMicroUsd: limits.providerMonthlyMicroUsd,
      globalMonthlyMicroUsd: limits.globalMonthlyMicroUsd,
      reservationMicroUsd: limits.maxReservationMicroUsd,
      environment: process.env,
    });
  },
});

export async function handleOpenEnaAiInterpretationPost(request: Request) {
  return productionPostHandler(request);
}
