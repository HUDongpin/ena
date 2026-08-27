import type {
  OpenEnaAiInterpretationRequest,
  OpenEnaAiInterpretationResponse,
} from "../open-ena/ai-interpretation";
import {
  collectOpenEnaAiEvidenceIds,
  OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1,
  OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
  parseOpenEnaAiInterpretationResponse,
} from "../open-ena/ai-interpretation";
import {
  OPEN_ENA_AI_PROMPT_SPEC_V1,
  getApprovedOpenEnaAiPromptArtifact,
  instantiateOpenEnaAiResponseSchema,
} from "./open-ena-ai-prompt-governance";

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

  constructor(code: LunaClientErrorCode, message: string) {
    super(message);
    this.name = "LunaClientError";
    this.code = code;
  }
}

export interface LunaClientOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
  timeoutMs?: number;
  signal?: AbortSignal;
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
): Promise<OpenEnaAiInterpretationResponse> {
  if (request.schemaVersion === OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1) {
    throw new LunaClientError(
      "upgrade-required",
      "Historical AI requests cannot be sent to the provider. Build and review a current v2 inference request.",
    );
  }
  let promptArtifact: ReturnType<typeof getApprovedOpenEnaAiPromptArtifact>;
  let responseJsonSchema: ReturnType<typeof instantiateOpenEnaAiResponseSchema>;
  try {
    promptArtifact = getApprovedOpenEnaAiPromptArtifact(request.promptVersion, request.locale);
    responseJsonSchema = instantiateOpenEnaAiResponseSchema(
      promptArtifact,
      [...collectOpenEnaAiEvidenceIds(request.evidence)],
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
  const baseUrl = validatedBaseUrl(environment.OPEN_ENA_AI_BASE_URL?.trim() || OPEN_ENA_AI_DEFAULT_BASE_URL);
  const model = environment.OPEN_ENA_AI_MODEL?.trim() || OPEN_ENA_AI_DEFAULT_MODEL;
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
            { role: "user", content: JSON.stringify(request.evidence) },
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
          throw new LunaClientError("upstream-cancelled", "AI interpretation provider request was cancelled.");
        }
        throw new LunaClientError("upstream-timeout", "AI interpretation provider timed out.");
      }
      throw new LunaClientError("upstream-network", "AI interpretation provider could not be reached.");
    }
    if (upstream.status === 401) {
      throw new LunaClientError("upstream-unauthorized", "AI interpretation provider authorization failed.");
    }
    if (upstream.status === 429) {
      throw new LunaClientError("upstream-rate-limited", "AI interpretation provider rate limit reached.");
    }
    if (upstream.status === 402) {
      throw new LunaClientError("upstream-payment-required", "OpenRouter credits are required for AI interpretation.");
    }
    if (upstream.status >= 500) {
      throw new LunaClientError("upstream-unavailable", "AI interpretation provider is temporarily unavailable.");
    }
    if (!upstream.ok) {
      throw new LunaClientError("invalid-configuration", "AI interpretation is temporarily unavailable.");
    }
    let payload: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      payload = await boundedProviderJson(upstream) as typeof payload;
    } catch {
      if (controller.signal.aborted) {
        if (options.signal?.aborted) {
          throw new LunaClientError("upstream-cancelled", "AI interpretation provider request was cancelled.");
        }
        throw new LunaClientError("upstream-timeout", "AI interpretation provider timed out.");
      }
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.");
    }
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.");
    }
    if (content.includes(apiKey)) {
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.");
    }
    const generatedAt = (options.clock ?? (() => new Date()))().toISOString();
    try {
      const interpretation = JSON.parse(content) as unknown;
      return parseOpenEnaAiInterpretationResponse({
        schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
        promptVersion: request.promptVersion,
        binding: request.binding,
        provider: "openrouter",
        model,
        generatedAt,
        interpretation,
      }, request);
    } catch {
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.");
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
