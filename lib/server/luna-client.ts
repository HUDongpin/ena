import type {
  OpenEnaAiInterpretationRequest,
  OpenEnaAiInterpretationResponse,
} from "../open-ena/ai-interpretation";
import {
  collectOpenEnaAiEvidenceIds,
  OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1,
  OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
  parseOpenEnaAiInterpretationRequestV2,
  parseOpenEnaAiInterpretationResponse,
} from "../open-ena/ai-interpretation";
import {
  OPEN_ENA_AI_PROMPT_SPEC_V1,
  getApprovedOpenEnaAiPromptArtifact,
  instantiateOpenEnaAiResponseSchema,
} from "./open-ena-ai-prompt-governance";
export type OpenEnaProviderUsage = { promptTokens: number; completionTokens: number; totalTokens: number; costMicroUsd: number };
export function validateOpenEnaProviderUsage(value: unknown): OpenEnaProviderUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  const values = [usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.costMicroUsd];
  if (!values.every((entry) => typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0)) {
    return null;
  }
  if (usage.totalTokens !== (usage.promptTokens as number) + (usage.completionTokens as number)) {
    return null;
  }
  return usage as OpenEnaProviderUsage;
}
export type OpenEnaAiGenerationResult = { response: OpenEnaAiInterpretationResponse; usage: OpenEnaProviderUsage | null; providerDispatched: true };
export class OpenEnaProviderBudgetError extends Error { readonly providerDispatched = false; constructor(message = "Provider budget could not be verified.") { super(message); this.name = "OpenEnaProviderBudgetError"; } }
export async function verifyOpenEnaProviderHardBudget(
  fetcher: typeof fetch,
  apiKey: string,
  providerMonthlyMicroUsd: number,
  globalMonthlyMicroUsd: number,
  reservationMicroUsd: number,
  base = OPEN_ENA_AI_DEFAULT_BASE_URL,
  signal?: AbortSignal,
) {
  if ([providerMonthlyMicroUsd, globalMonthlyMicroUsd, reservationMicroUsd].some((value) => (
    !Number.isSafeInteger(value) || value < 0
  ))) throw new OpenEnaProviderBudgetError();
  const ceilingUsd = Math.min(providerMonthlyMicroUsd, globalMonthlyMicroUsd) / 1_000_000;
  const reservationUsd = reservationMicroUsd / 1_000_000;
  try {
    const response = await fetcher(`${base.replace(/\/+$/u, "")}/key`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!response.ok) throw new OpenEnaProviderBudgetError();
    const body = await response.json() as {
      data?: { limit_reset?: unknown; limit?: unknown; limit_remaining?: unknown };
    };
    const limit = body.data?.limit;
    const remaining = body.data?.limit_remaining;
    if (
      body.data?.limit_reset !== "monthly"
      || typeof limit !== "number"
      || !Number.isFinite(limit)
      || limit < 0
      || limit > ceilingUsd
      || typeof remaining !== "number"
      || !Number.isFinite(remaining)
      || remaining < reservationUsd
      || remaining > limit
    ) throw new OpenEnaProviderBudgetError();
    return true;
  } catch (error) {
    if (error instanceof OpenEnaProviderBudgetError) throw error;
    throw new OpenEnaProviderBudgetError();
  }
}

export const OPEN_ENA_AI_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const OPEN_ENA_AI_DEFAULT_MODEL = "openai/gpt-5.6-luna";
export const OPEN_ENA_AI_DEFAULT_TIMEOUT_MS = 20_000;
export const OPEN_ENA_AI_MAX_COMPLETION_TOKENS = OPEN_ENA_AI_PROMPT_SPEC_V1.tokenBudget;
export const OPEN_ENA_AI_MAX_RESPONSE_BYTES = 64 * 1024;

export type LunaClientErrorCode =
  | "disabled"
  | "missing-api-key"
  | "upgrade-required"
  | "invalid-configuration"
  | "upstream-payment-required"
  | "upstream-unauthorized"
  | "upstream-rate-limited"
  | "upstream-unavailable"
  | "upstream-malformed"
  | "upstream-timeout"
  | "upstream-cancelled"
  | "upstream-network";

export class LunaClientError extends Error {
  readonly code: LunaClientErrorCode;
  readonly providerDispatched: boolean;

  constructor(code: LunaClientErrorCode, message: string, providerDispatched = false) {
    super(message);
    this.name = "LunaClientError";
    this.code = code;
    this.providerDispatched = providerDispatched;
  }
}

export interface LunaClientOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
  timeoutMs?: number;
  signal?: AbortSignal;
  providerMonthlyMicroUsd?: number;
  globalMonthlyMicroUsd?: number;
  reservationMicroUsd?: number;
  verifyHardBudget?: (
    apiKey: string,
    providerMonthlyMicroUsd: number,
    globalMonthlyMicroUsd: number,
    reservationMicroUsd: number,
    signal?: AbortSignal,
  ) => Promise<boolean>;
}

function chatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/u, "")}/chat/completions`;
}

function validatedBaseUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.");
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/u, "");
  if (parsed.protocol !== "https:"
    || parsed.hostname !== "openrouter.ai"
    || parsed.port
    || normalizedPath !== "/api/v1"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.");
  }
  return `${parsed.origin}/api/v1`;
}

async function boundedProviderJson(upstream: Response) {
  const declaredLength = upstream.headers?.get?.("content-length") ?? null;
  if (declaredLength && /^\d+$/u.test(declaredLength)
    && Number(declaredLength) > OPEN_ENA_AI_MAX_RESPONSE_BYTES) {
    throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.");
  }
  if (!upstream.body) return upstream.json() as Promise<unknown>;

  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > OPEN_ENA_AI_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  return JSON.parse(text) as unknown;
}

export async function generateLunaInterpretation(
  request: OpenEnaAiInterpretationRequest,
  options: LunaClientOptions = {},
): Promise<OpenEnaAiGenerationResult> {
  if (request.schemaVersion === OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1) {
    throw new LunaClientError(
      "upgrade-required",
      "Historical AI requests cannot be sent to the provider. Build and review a current v2 inference request.",
    );
  }
  let normalizedRequest: ReturnType<typeof parseOpenEnaAiInterpretationRequestV2>;
  try {
    normalizedRequest = parseOpenEnaAiInterpretationRequestV2(request);
  } catch {
    throw new LunaClientError(
      "invalid-configuration",
      "AI interpretation prompt governance rejected the request.",
    );
  }
  let promptArtifact: ReturnType<typeof getApprovedOpenEnaAiPromptArtifact>;
  let responseJsonSchema: ReturnType<typeof instantiateOpenEnaAiResponseSchema>;
  try {
    promptArtifact = getApprovedOpenEnaAiPromptArtifact(
      normalizedRequest.promptVersion,
      normalizedRequest.locale,
    );
    responseJsonSchema = instantiateOpenEnaAiResponseSchema(
      normalizedRequest.promptVersion,
      normalizedRequest.locale,
      [...collectOpenEnaAiEvidenceIds(normalizedRequest.evidence)],
    );
  } catch {
    throw new LunaClientError(
      "invalid-configuration",
      "AI interpretation prompt governance rejected the request.",
    );
  }
  const environment = options.environment ?? process.env;
  if (environment.OPEN_ENA_AI_ENABLED !== "true") {
    throw new LunaClientError("disabled", "AI interpretation is disabled.");
  }
  if (!environment.OPENROUTER_API_KEY?.trim()) {
    throw new LunaClientError("missing-api-key", "AI interpretation is not configured.");
  }
  const apiKey = environment.OPENROUTER_API_KEY.trim();
  if (apiKey.length > 512 || /[\u0000-\u001f\u007f]/u.test(apiKey)) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.");
  }
  const baseUrl = validatedBaseUrl(environment.OPEN_ENA_AI_BASE_URL?.trim() || OPEN_ENA_AI_DEFAULT_BASE_URL);
  const model = environment.OPEN_ENA_AI_MODEL?.trim() || OPEN_ENA_AI_DEFAULT_MODEL;
  if (!/^[A-Za-z0-9._:/@-]{1,160}$/u.test(model)) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.");
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? OPEN_ENA_AI_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.");
  }
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const budgetInputs = [
      options.providerMonthlyMicroUsd,
      options.globalMonthlyMicroUsd,
      options.reservationMicroUsd,
    ];
    const configuredBudgetInputs = budgetInputs.filter((value) => value !== undefined).length;
    if (configuredBudgetInputs !== 0 && configuredBudgetInputs !== budgetInputs.length) {
      throw new LunaClientError("invalid-configuration", "AI interpretation provider budget is unavailable.");
    }
    if (
      options.providerMonthlyMicroUsd !== undefined
      && options.globalMonthlyMicroUsd !== undefined
      && options.reservationMicroUsd !== undefined
    ) {
      try {
        const verified = await (
          options.verifyHardBudget
          ?? ((key, provider, global, reservation, signal) => verifyOpenEnaProviderHardBudget(
            fetchImplementation,
            key,
            provider,
            global,
            reservation,
            baseUrl,
            signal,
          ))
        )(
          apiKey,
          options.providerMonthlyMicroUsd,
          options.globalMonthlyMicroUsd,
          options.reservationMicroUsd,
          controller.signal,
        );
        if (verified !== true) throw new OpenEnaProviderBudgetError();
      } catch {
        if (controller.signal.aborted) {
          if (options.signal?.aborted) {
            throw new LunaClientError("upstream-cancelled", "AI interpretation provider request was cancelled.");
          }
          throw new LunaClientError("upstream-timeout", "AI interpretation provider timed out.");
        }
        throw new LunaClientError("invalid-configuration", "AI interpretation provider budget is unavailable.");
      }
    }
    let upstream: Response;
    try {
      upstream = await fetchImplementation(chatCompletionsUrl(baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: OPEN_ENA_AI_MAX_COMPLETION_TOKENS,
          messages: [
            { role: "system", content: promptArtifact.systemPrompt },
            { role: "user", content: JSON.stringify(normalizedRequest.evidence) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "open_ena_ai_interpretation",
              strict: true,
              schema: responseJsonSchema,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        if (options.signal?.aborted) {
          throw new LunaClientError("upstream-cancelled", "AI interpretation provider request was cancelled.", true);
        }
        throw new LunaClientError("upstream-timeout", "AI interpretation provider timed out.", true);
      }
      throw new LunaClientError("upstream-network", "AI interpretation provider could not be reached.", true);
    }
    if (upstream.status === 401) {
      throw new LunaClientError("upstream-unauthorized", "AI interpretation provider authorization failed.", true);
    }
    if (upstream.status === 429) {
      throw new LunaClientError("upstream-rate-limited", "AI interpretation provider rate limit reached.", true);
    }
    if (upstream.status === 402) {
      throw new LunaClientError("upstream-payment-required", "OpenRouter credits are required for AI interpretation.", true);
    }
    if (upstream.status >= 500) {
      throw new LunaClientError("upstream-unavailable", "AI interpretation provider is temporarily unavailable.", true);
    }
    if (!upstream.ok) {
      throw new LunaClientError("invalid-configuration", "AI interpretation is temporarily unavailable.", true);
    }
    let payload: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      payload = await boundedProviderJson(upstream) as typeof payload;
    } catch {
      if (controller.signal.aborted) {
        if (options.signal?.aborted) {
          throw new LunaClientError("upstream-cancelled", "AI interpretation provider request was cancelled.", true);
        }
        throw new LunaClientError("upstream-timeout", "AI interpretation provider timed out.", true);
      }
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true);
    }
    if (content.includes(apiKey)) {
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true);
    }
    const generatedAt = (options.clock ?? (() => new Date()))().toISOString();
    try {
      const interpretation = JSON.parse(content) as unknown;
      const response = parseOpenEnaAiInterpretationResponse({
        schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
        promptVersion: normalizedRequest.promptVersion,
        binding: normalizedRequest.binding,
        provider: "openrouter",
        model,
        generatedAt,
        interpretation,
      }, normalizedRequest);
      const upstreamUsage = (payload as Record<string, unknown>).usage;
      const rawUsage = upstreamUsage && typeof upstreamUsage === "object" ? upstreamUsage as Record<string, unknown> : null;
      const cost = rawUsage?.cost;
      const usage = rawUsage && typeof rawUsage.prompt_tokens === "number" && Number.isSafeInteger(rawUsage.prompt_tokens) && rawUsage.prompt_tokens >= 0
        && typeof rawUsage.completion_tokens === "number" && Number.isSafeInteger(rawUsage.completion_tokens) && rawUsage.completion_tokens >= 0
        && typeof rawUsage.total_tokens === "number" && Number.isSafeInteger(rawUsage.total_tokens) && rawUsage.total_tokens >= 0
        && rawUsage.total_tokens === rawUsage.prompt_tokens + rawUsage.completion_tokens
        && typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && Number.isSafeInteger(Math.ceil(cost * 1_000_000))
        ? { promptTokens: rawUsage.prompt_tokens, completionTokens: rawUsage.completion_tokens, totalTokens: rawUsage.total_tokens, costMicroUsd: Math.ceil(cost * 1_000_000) }
        : null;
      return { response, usage, providerDispatched: true };
    } catch {
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true);
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
