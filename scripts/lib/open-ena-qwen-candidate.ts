import {
  collectOpenEnaAiEvidenceIds,
  parseInterpretationV2,
  parseOpenEnaAiInterpretationRequestV2,
  type OpenEnaAiInterpretationRequestV2,
} from "../../lib/open-ena/ai-interpretation";
import {
  getApprovedOpenEnaAiPromptArtifact,
  instantiateOpenEnaAiResponseSchema,
} from "../../lib/server/open-ena-ai-prompt-governance";

/** An isolated validation candidate. Production routing and billing do not import it. */
export const QWEN_CANDIDATE = Object.freeze({
  provider: "alibaba-model-studio",
  model: "qwen3.7-plus-2026-05-26",
  region: "cn-beijing",
  endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  timeoutMilliseconds: 20_000,
  maximumOutputTokens: 1_800,
} as const);
const MAX_RESPONSE_BYTES = 64 * 1024;
const OMITTED_KEYWORD = "/properties/observedPatterns/items/properties/evidenceRefs/uniqueItems";

export type QwenCandidateUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type QwenCandidateErrorCode =
  | "invalid-request" | "invalid-api-key" | "invalid-timeout"
  | "network" | "timeout" | "http-error" | "response-too-large"
  | "invalid-json" | "invalid-response" | "incomplete-response" | "invalid-interpretation";

type ErrorDetails = {
  providerDispatched?: boolean;
  httpStatus?: number;
  usage?: QwenCandidateUsage | null;
  /** May be a bounded prefix for network, timeout or response-too-large errors. */
  rawBody?: Uint8Array;
  responseModel?: string;
  finishReason?: string;
};

export class QwenCandidateError extends Error {
  readonly code: QwenCandidateErrorCode;
  readonly providerDispatched: boolean;
  readonly httpStatus?: number;
  readonly usage: QwenCandidateUsage | null;
  readonly rawBody?: Uint8Array;
  readonly responseModel?: string;
  readonly finishReason?: string;

  constructor(code: QwenCandidateErrorCode, details: ErrorDetails = {}) {
    super(`Qwen candidate request failed (${code}).`);
    this.name = "QwenCandidateError";
    this.code = code;
    this.providerDispatched = details.providerDispatched ?? false;
    this.httpStatus = details.httpStatus;
    this.usage = details.usage ?? null;
    this.responseModel = details.responseModel;
    this.finishReason = details.finishReason;
    // The caller can save private evidence explicitly, but ordinary error
    // serialization must not accidentally copy provider prose into logs.
    Object.defineProperty(this, "rawBody", { value: details.rawBody, enumerable: false });
  }
}

export type QwenCandidateResult = {
  interpretation: ReturnType<typeof parseInterpretationV2>;
  rawInterpretation: unknown;
  usage: QwenCandidateUsage | null;
  rawBody: Uint8Array;
  responseModel: string;
  finishReason: string;
  httpStatus: number;
  outgoingRequestBody: string;
};

export function prepareQwenCandidateRequest(request: OpenEnaAiInterpretationRequestV2) {
  try {
    const normalizedRequest = parseOpenEnaAiInterpretationRequestV2(request);
    const approved = getApprovedOpenEnaAiPromptArtifact(normalizedRequest.promptVersion, normalizedRequest.locale);
    const originalSchema = instantiateOpenEnaAiResponseSchema(normalizedRequest.promptVersion,
      normalizedRequest.locale, [...collectOpenEnaAiEvidenceIds(normalizedRequest.evidence)]);
    const transportSchema = structuredClone(originalSchema);
    // Alibaba's transport rejects this keyword. Only this cloned property is
    // omitted; the unchanged local parser still rejects duplicate references.
    const references: { uniqueItems?: boolean } = transportSchema.properties.observedPatterns.items.properties.evidenceRefs;
    if (references.uniqueItems !== true) throw new Error("Unexpected approved reference schema.");
    delete references.uniqueItems;
    const body = {
      model: QWEN_CANDIDATE.model,
      stream: false,
      enable_thinking: false,
      max_tokens: QWEN_CANDIDATE.maximumOutputTokens,
      messages: [
        { role: "system", content: approved.systemPrompt },
        { role: "user", content: JSON.stringify(normalizedRequest.evidence) },
      ],
      response_format: { type: "json_schema", json_schema: {
        name: "open_ena_ai_interpretation", strict: true, schema: transportSchema,
      } },
    };
    return { body, normalizedRequest, originalSchema, transportSchema, omittedSchemaKeywords: [OMITTED_KEYWORD] };
  } catch {
    throw new QwenCandidateError("invalid-request");
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readUsage(value: unknown): QwenCandidateUsage | null {
  const usage = record(value);
  const prompt = usage?.prompt_tokens, completion = usage?.completion_tokens, total = usage?.total_tokens;
  if (typeof prompt !== "number" || typeof completion !== "number" || typeof total !== "number"
    || ![prompt, completion, total].every(value => Number.isSafeInteger(value) && value >= 0)
    || prompt + completion !== total) return null;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

/** The historical parser normalizes text; new provider prose must already be strings. */
function assertProseTypes(value: unknown) {
  const interpretation = record(value);
  if (!interpretation) return;
  if (Array.isArray(interpretation.observedPatterns)) {
    for (const pattern of interpretation.observedPatterns) {
      const item = record(pattern);
      if (item && Object.hasOwn(item, "statement") && typeof item.statement !== "string") throw new Error("Non-string statement.");
    }
  }
  for (const key of ["contextualQuestions", "limitations"]) {
    const values = interpretation[key];
    if (Array.isArray(values) && values.some(value => typeof value !== "string")) throw new Error("Non-string prose.");
  }
}

export async function generateQwenCandidate(request: OpenEnaAiInterpretationRequestV2, options: {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): Promise<QwenCandidateResult> {
  const prepared = prepareQwenCandidateRequest(request);
  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  if (!apiKey || apiKey.length > 512 || /[\u0000-\u0020\u007f]/u.test(apiKey)) throw new QwenCandidateError("invalid-api-key");
  const timeoutMs = options.timeoutMs ?? QWEN_CANDIDATE.timeoutMilliseconds;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > QWEN_CANDIDATE.timeoutMilliseconds) throw new QwenCandidateError("invalid-timeout");
  const outgoingRequestBody = JSON.stringify(prepared.body);
  const controller = new AbortController();
  const fetcher = options.fetch ?? globalThis.fetch;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let providerDispatched = false, timedOut = false;
  let usage: QwenCandidateUsage | null = null;
  let responseModel: string | undefined, finishReason: string | undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const capturedBytes = () => {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  };
  const failure = (code: QwenCandidateErrorCode) => new QwenCandidateError(code, {
    providerDispatched, httpStatus: response?.status, usage,
    rawBody: response ? capturedBytes() : undefined, responseModel, finishReason,
  });
  const cancelRead = () => { if (reader) void reader.cancel().catch(() => undefined); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(failure("timeout"));
      controller.abort();
      // A tee or injected stream may never settle cancellation. Its promise
      // must not extend the independent deadline or hold up the next case.
      cancelRead();
    }, timeoutMs);
  });
  const execute = async (): Promise<QwenCandidateResult> => {
    providerDispatched = true;
    response = await fetcher(QWEN_CANDIDATE.endpoint, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: outgoingRequestBody,
    });
    if (timedOut) { void response.body?.cancel().catch(() => undefined); throw failure("timeout"); }
    reader = response.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (timedOut) throw failure("timeout");
        if (done) break;
        const remaining = MAX_RESPONSE_BYTES - size;
        if (value.byteLength > remaining) {
          if (remaining > 0) { chunks.push(value.slice(0, remaining)); size += remaining; }
          cancelRead();
          throw failure("response-too-large");
        }
        chunks.push(value.slice()); size += value.byteLength;
      }
    }
    const rawBody = capturedBytes();
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); }
    catch { throw failure(response.ok ? "invalid-json" : "http-error"); }
    const envelope = record(payload);
    usage = readUsage(envelope?.usage);
    if (!response.ok) throw failure("http-error");
    if (!envelope || !Array.isArray(envelope.choices) || envelope.choices.length !== 1) throw failure("invalid-response");
    const choice = record(envelope.choices[0]);
    const message = record(choice?.message);
    if (typeof envelope.model === "string" && /^[A-Za-z0-9._:/@-]{1,160}$/u.test(envelope.model)) responseModel = envelope.model;
    if (typeof choice?.finish_reason === "string"
      && ["stop", "length", "content_filter", "tool_calls", "function_call"].includes(choice.finish_reason)) finishReason = choice.finish_reason;
    if (!choice || !message || responseModel !== QWEN_CANDIDATE.model || !finishReason
      || message.role !== "assistant" || typeof message.content !== "string"
      || message.refusal != null || message.tool_calls != null || message.function_call != null) throw failure("invalid-response");
    if (finishReason !== "stop") throw failure("incomplete-response");
    let rawInterpretation: unknown;
    try { rawInterpretation = JSON.parse(message.content); }
    catch { throw failure("invalid-interpretation"); }
    try {
      assertProseTypes(rawInterpretation);
      const interpretation = parseInterpretationV2(rawInterpretation, collectOpenEnaAiEvidenceIds(prepared.normalizedRequest.evidence));
      return { interpretation, rawInterpretation, usage, rawBody, responseModel, finishReason,
        httpStatus: response.status, outgoingRequestBody };
    } catch { throw failure("invalid-interpretation"); }
  };
  try { return await Promise.race([execute(), deadline]); }
  catch (error) {
    if (error instanceof QwenCandidateError) throw error;
    throw failure(timedOut ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
}
