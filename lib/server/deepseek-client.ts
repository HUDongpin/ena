import type { OpenEnaAiInterpretationRequest } from "../open-ena/ai-interpretation";
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
import { OPEN_ENA_BILLABLE_MAX_PROVIDER_REQUEST_MS } from "./open-ena-billable";

export const OPEN_ENA_AI_DEFAULT_MODEL = "deepseek-flash";
export const OPEN_ENA_AI_MAX_COMPLETION_TOKENS = OPEN_ENA_AI_PROMPT_SPEC_V1.tokenBudget;
export const OPEN_ENA_AI_MAX_RESPONSE_BYTES = 64 * 1024;
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_PEAK_INPUT_MICRO_USD_PER_MILLION = 300_000;
const DEEPSEEK_PEAK_OUTPUT_MICRO_USD_PER_MILLION = 1_200_000;
const INPUT_TOKEN_OVERHEAD = 1_024;

export type OpenEnaProviderUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Conservative peak-rate estimate for the in-app ledger, not a provider invoice. */
  costMicroUsd: number;
};
export type OpenEnaAiGenerationResult = {
  response: ReturnType<typeof parseOpenEnaAiInterpretationResponse>;
  usage: OpenEnaProviderUsage | null;
  providerDispatched: true;
};

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
  readonly usage: OpenEnaProviderUsage | null;
  constructor(code: LunaClientErrorCode, message: string, providerDispatched = false, usage: OpenEnaProviderUsage | null = null) {
    super(message);
    this.name = "LunaClientError";
    this.code = code;
    this.providerDispatched = providerDispatched;
    this.usage = usage;
  }
}

export interface DeepSeekClientOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
  timeoutMs?: number;
  signal?: AbortSignal;
  reservationMicroUsd?: number;
}

function boundedJson(response: Response, measured?: (bytes: number) => void): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > OPEN_ENA_AI_MAX_RESPONSE_BYTES) {
    measured?.(Math.min(Number(declared), Number.MAX_SAFE_INTEGER));
    throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true);
  }
  if (!response.body) return response.json() as Promise<unknown>;
  return (async () => {
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        measured?.(size);
        if (size > OPEN_ENA_AI_MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("oversize");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  })();
}

function peakCostMicroUsd(inputTokens: number, outputTokens: number) {
  return Math.ceil((
    inputTokens * DEEPSEEK_PEAK_INPUT_MICRO_USD_PER_MILLION
    + outputTokens * DEEPSEEK_PEAK_OUTPUT_MICRO_USD_PER_MILLION
  ) / 1_000_000);
}

function readUsage(value: unknown): OpenEnaProviderUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const total = usage.total_tokens;
  if (![input, output, total].every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0)
    || total !== (input as number) + (output as number)) return null;
  const cost = peakCostMicroUsd(input as number, output as number);
  // A valid overrun must reach settlement: clipping it to the reservation would
  // understate spend and suppress the ledger's reservation-overrun alert.
  if (!Number.isSafeInteger(cost)) return null;
  return { promptTokens: input as number, completionTokens: output as number, totalTokens: total as number, costMicroUsd: cost };
}

function requestError(status: number, dispatched: boolean): LunaClientError {
  if (status === 401 || status === 403) return new LunaClientError("upstream-unauthorized", "AI interpretation provider authorization failed.", dispatched);
  if (status === 402) return new LunaClientError("upstream-payment-required", "DeepSeek balance is unavailable for AI interpretation.", dispatched);
  if (status === 429) return new LunaClientError("upstream-rate-limited", "AI interpretation provider rate limit reached.", dispatched);
  if (status >= 500) return new LunaClientError("upstream-unavailable", "AI interpretation provider is temporarily unavailable.", dispatched);
  return new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.", dispatched);
}

type DeepSeekFailureStage =
  | "balance-network" | "balance-http" | "balance-body"
  | "responses-network" | "responses-http" | "responses-body"
  | "responses-shape" | "responses-contract-json" | "responses-contract-evidence-ref"
  | "responses-contract-observation" | "responses-contract-question"
  | "responses-contract-limitation" | "responses-contract-binding"
  | "responses-contract-structure" | "responses-contract-other";

type FailureDiagnostic = {
  locale: string; promptVersion: string; model: string; httpStatus: number | null;
  responseStatus: "completed" | "incomplete" | "failed" | "in_progress" | "unknown" | null;
  incompleteReason: "max_output_tokens" | "content_filter" | "unknown" | null;
  responseBytes: number | null; outputTokens: number | null; rule: string | null; field: string | null;
};

function reportFailure(stage: DeepSeekFailureStage, diagnostic: FailureDiagnostic, status?: number) {
  if (process.env.NODE_ENV !== "production") return;
  // Only normalized configuration, fixed enums/paths and measured numbers.
  // Never include exception messages, output field names or provider text.
  console.error(`open-ena-deepseek-failure:${stage}${status === undefined ? "" : `:${status}`}`,
    JSON.stringify({ ...diagnostic, stage, httpStatus: status ?? diagnostic.httpStatus }));
}

function contractFailureDetail(error: unknown, interpretation: unknown): Pick<FailureDiagnostic, "rule" | "field"> {
  if (error instanceof SyntaxError) return { rule: "json-syntax", field: "interpretation" };
  const message = error instanceof Error ? error.message : "";
  let field = "interpretation";
  if (/binding/iu.test(message)) field = "binding";
  else if (/evidence ref|cites evidence|must cite aggregate/iu.test(message)) field = "interpretation.observedPatterns[].evidenceRefs";
  else if (/observed pattern \d+.*statement/iu.test(message)) field = "interpretation.observedPatterns[].statement";
  else if (/observed pattern \d+/iu.test(message)) field = "interpretation.observedPatterns[]";
  else if (/observed patterns/iu.test(message)) field = "interpretation.observedPatterns";
  else if (/contextual question/iu.test(message)) field = "interpretation.contextualQuestions";
  else if (/limitation/iu.test(message)) field = "interpretation.limitations";
  let rule = "contract";
  if (/unexpected field/iu.test(message)) rule = "unexpected-field";
  else if (/missing a required field/iu.test(message)) {
    rule = "required-field";
    if (field === "interpretation" && interpretation && typeof interpretation === "object" && !Array.isArray(interpretation)) {
      const missing = ["observedPatterns", "contextualQuestions", "limitations"].find((key) => !Object.hasOwn(interpretation, key));
      if (missing) field = `interpretation.${missing}`;
    }
  } else if (/must be a string/iu.test(message)) rule = "string-type";
  else if (/must be an array/iu.test(message)) rule = "array-type";
  else if (/must be an object/iu.test(message)) rule = "object-type";
  else if (/exceeds its allowed length/iu.test(message)) rule = "array-length";
  else if (/was not supplied/iu.test(message)) rule = "evidence-reference";
  else if (/must cite aggregate|at least one limitation/iu.test(message)) rule = "empty-array";
  else if (/must be unique/iu.test(message)) rule = "duplicate";
  else if (/must be nonempty/iu.test(message)) rule = "empty-text";
  else if (/is too long/iu.test(message)) rule = "text-length";
  else if (/binding/iu.test(message)) rule = "binding-mismatch";
  return { rule, field };
}

/** New provider output must not inherit the historical reader's text coercion. */
function assertGeneratedProseTypes(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.observedPatterns)) record.observedPatterns.forEach((pattern: unknown, index: number) => {
    if (pattern && typeof pattern === "object" && !Array.isArray(pattern) && Object.hasOwn(pattern, "statement")
      && typeof (pattern as Record<string, unknown>).statement !== "string") {
      throw new Error(`AI v2 observed pattern ${index + 1} statement must be a string.`);
    }
  });
  for (const [key, label] of [["contextualQuestions", "contextual question"], ["limitations", "limitation"]] as const) {
    const items = record[key];
    if (Array.isArray(items)) items.forEach((item: unknown, index: number) => {
      if (typeof item !== "string") throw new Error(`AI v2 ${label} ${index + 1} must be a string.`);
    });
  }
}

function contractFailureStage(error: unknown): DeepSeekFailureStage {
  if (error instanceof SyntaxError) return "responses-contract-json";
  const message = error instanceof Error ? error.message : "";
  if (/cites evidence that was not supplied|evidence ref|evidenceRefs/iu.test(message)) return "responses-contract-evidence-ref";
  if (/observed pattern/iu.test(message)) return "responses-contract-observation";
  if (/contextual question/iu.test(message)) return "responses-contract-question";
  if (/limitation/iu.test(message)) return "responses-contract-limitation";
  if (/binding/iu.test(message)) return "responses-contract-binding";
  if (/interpretation|response schema|response model|response provider/iu.test(message)) return "responses-contract-structure";
  return "responses-contract-other";
}

export async function generateLunaInterpretation(
  request: OpenEnaAiInterpretationRequest,
  options: DeepSeekClientOptions = {},
): Promise<OpenEnaAiGenerationResult> {
  if (request.schemaVersion === OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1) {
    throw new LunaClientError("upgrade-required", "Historical AI requests cannot be sent to the provider.");
  }
  let normalized: ReturnType<typeof parseOpenEnaAiInterpretationRequestV2>;
  let prompt: ReturnType<typeof getApprovedOpenEnaAiPromptArtifact>;
  let schema: ReturnType<typeof instantiateOpenEnaAiResponseSchema>;
  try {
    normalized = parseOpenEnaAiInterpretationRequestV2(request);
    prompt = getApprovedOpenEnaAiPromptArtifact(normalized.promptVersion, normalized.locale);
    schema = instantiateOpenEnaAiResponseSchema(
      normalized.promptVersion, normalized.locale, [...collectOpenEnaAiEvidenceIds(normalized.evidence)],
    );
  } catch {
    throw new LunaClientError("invalid-configuration", "AI interpretation prompt governance rejected the request.");
  }

  const environment = options.environment ?? process.env;
  if (environment.OPEN_ENA_AI_ENABLED !== "true") throw new LunaClientError("disabled", "AI interpretation is disabled.");
  const apiKey = environment.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new LunaClientError("missing-api-key", "AI interpretation is not configured.");
  if (apiKey.length > 512 || /[\u0000-\u001f\u007f]/u.test(apiKey)) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.");
  }
  const model = environment.OPEN_ENA_AI_MODEL?.trim() || OPEN_ENA_AI_DEFAULT_MODEL;
  if (model !== OPEN_ENA_AI_DEFAULT_MODEL) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider model is not approved.");
  }
  const diagnostic: FailureDiagnostic = { locale: normalized.locale, promptVersion: normalized.promptVersion, model,
    httpStatus: null, responseStatus: null, incompleteReason: null, responseBytes: null, outputTokens: null, rule: null, field: null };
  const report = (stage: DeepSeekFailureStage, status?: number) => reportFailure(stage, diagnostic, status);
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > OPEN_ENA_BILLABLE_MAX_PROVIDER_REQUEST_MS) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider configuration is invalid.");
  }
  const reservation = options.reservationMicroUsd;
  if (reservation !== undefined && (!Number.isSafeInteger(reservation) || reservation < 1)) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider budget is unavailable.");
  }
  const userContent = JSON.stringify(normalized.evidence);
  const maxInputTokens = new TextEncoder().encode(prompt.systemPrompt).byteLength
    + new TextEncoder().encode(userContent).byteLength
    + new TextEncoder().encode(JSON.stringify(schema)).byteLength
    + INPUT_TOKEN_OVERHEAD;
  if (reservation !== undefined && peakCostMicroUsd(maxInputTokens, OPEN_ENA_AI_MAX_COMPLETION_TOKENS) > reservation) {
    throw new LunaClientError("invalid-configuration", "AI interpretation provider budget is unavailable.");
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher = options.fetch ?? globalThis.fetch;
  const cancelled = (dispatched: boolean) => new LunaClientError(
    options.signal?.aborted ? "upstream-cancelled" : "upstream-timeout",
    options.signal?.aborted ? "AI interpretation provider request was cancelled." : "AI interpretation provider timed out.",
    dispatched,
  );
  let activeResponse: Response | undefined;
  try {
    let balance: Response;
    try {
      balance = await fetcher(`${DEEPSEEK_BASE_URL}/user/balance`, {
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw cancelled(false);
      report("balance-network");
      throw new LunaClientError("upstream-network", "AI interpretation provider could not be reached.");
    }
    activeResponse = balance;
    if (!balance.ok) {
      report("balance-http", balance.status);
      throw requestError(balance.status, false);
    }
    try {
      const body = await boundedJson(balance) as { is_available?: unknown };
      if (body?.is_available !== true) throw new Error("balance unavailable");
    } catch {
      if (controller.signal.aborted) throw cancelled(false);
      report("balance-body", balance.status);
      throw new LunaClientError("invalid-configuration", "AI interpretation provider balance is unavailable.");
    }
    if (controller.signal.aborted) throw cancelled(false);

    let upstream: Response;
    try {
      upstream = await fetcher(`${DEEPSEEK_BASE_URL}/responses`, {
        method: "POST",
        redirect: "error",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "none" },
          max_output_tokens: OPEN_ENA_AI_MAX_COMPLETION_TOKENS,
          input: [
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: userContent },
          ],
          text: { format: { type: "json_schema", name: "open_ena_ai_interpretation", schema } },
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw cancelled(true);
      report("responses-network");
      throw new LunaClientError("upstream-network", "AI interpretation provider could not be reached.", true);
    }
    activeResponse = upstream;
    diagnostic.httpStatus = upstream.status;
    if (!upstream.ok) {
      report("responses-http", upstream.status);
      throw requestError(upstream.status, true);
    }
    let payload: unknown;
    try {
      payload = await boundedJson(upstream, (bytes) => { diagnostic.responseBytes = bytes; });
    } catch {
      if (controller.signal.aborted) throw cancelled(true);
      diagnostic.rule = diagnostic.responseBytes !== null && diagnostic.responseBytes > OPEN_ENA_AI_MAX_RESPONSE_BYTES ? "response-size" : "response-body";
      diagnostic.field = "response";
      report("responses-body");
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true);
    }
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    // Usage is independent of the scientific response contract. A paid response
    // can be unusable while still carrying valid, accountable provider usage.
    const usage = readUsage(record.usage);
    diagnostic.outputTokens = usage?.completionTokens ?? null;
    diagnostic.responseStatus = ["completed", "incomplete", "failed", "in_progress"].includes(record.status as string)
      ? record.status as FailureDiagnostic["responseStatus"] : "unknown";
    const incomplete = record.incomplete_details && typeof record.incomplete_details === "object"
      ? (record.incomplete_details as Record<string, unknown>).reason : null;
    diagnostic.incompleteReason = incomplete == null ? null
      : incomplete === "max_output_tokens" || incomplete === "content_filter" ? incomplete : "unknown";
    const output = Array.isArray(record.output) ? record.output : [];
    const texts = output.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const message = item as Record<string, unknown>;
      if (message.type !== "message" || message.role !== "assistant" || !Array.isArray(message.content)) return [];
      return message.content.filter((entry): entry is { type: "output_text"; text: string } => (
        !!entry && typeof entry === "object" && (entry as Record<string, unknown>).type === "output_text"
        && typeof (entry as Record<string, unknown>).text === "string"
      )).map((entry) => entry.text);
    });
    if (record.status !== "completed" || texts.length !== 1 || texts[0].includes(apiKey)) {
      diagnostic.rule = "response-shape"; diagnostic.field = "response";
      report("responses-shape");
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true, usage);
    }
    let interpretation: unknown;
    try {
      interpretation = JSON.parse(texts[0]);
      assertGeneratedProseTypes(interpretation);
      const response = parseOpenEnaAiInterpretationResponse({
        schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
        promptVersion: normalized.promptVersion,
        binding: normalized.binding,
        provider: "deepseek",
        model,
        generatedAt: (options.clock ?? (() => new Date()))().toISOString(),
        interpretation,
      }, normalized);
      return { response, usage, providerDispatched: true };
    } catch (error) {
      Object.assign(diagnostic, contractFailureDetail(error, interpretation));
      report(contractFailureStage(error));
      throw new LunaClientError("upstream-malformed", "AI interpretation returned an invalid response.", true, usage);
    }
  } finally {
    // HTTP/header rejection does not consume the body. Cancel it before
    // clearing the deadline so an unread provider stream cannot keep its
    // connection alive after this generation has already failed.
    if (activeResponse?.body && !activeResponse.bodyUsed) {
      void activeResponse.body.cancel().catch(() => undefined);
    }
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
