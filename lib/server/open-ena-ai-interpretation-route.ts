import { createHash } from "node:crypto";
import {
  openEnaAuthConfigurationReady,
  OPEN_ENA_SESSION_COOKIE,
  verifyOpenEnaSessionToken,
} from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import {
  OPEN_ENA_AI_CONSENT_HEADER,
  OPEN_ENA_AI_CONSENT_VALUE,
  parseOpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationResponse,
} from "@/lib/open-ena/ai-interpretation";
import { generateLunaInterpretation } from "@/lib/server/luna-client";

export const OPEN_ENA_AI_MAX_REQUEST_BYTES = 48 * 1024;

interface OpenEnaAiInterpretationRouteDependencies {
  verifySessionToken: (token: string | undefined) => boolean;
  authConfigurationReady: () => boolean;
  consumeQuota: (sessionToken: string) => boolean;
  parseRequest: (value: unknown) => OpenEnaAiInterpretationRequest;
  generate: (
    request: OpenEnaAiInterpretationRequest,
    signal: AbortSignal,
  ) => Promise<OpenEnaAiInterpretationResponse>;
}

export const OPEN_ENA_AI_RATE_LIMIT_WINDOW_MS = 60_000;
export const OPEN_ENA_AI_RATE_LIMIT_REQUESTS = 6;
const quotaBySession = new Map<string, { count: number; windowStartedAt: number }>();

export function openEnaAiAuthConfigurationReady(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return openEnaAuthConfigurationReady(environment);
}

function consumeOpenEnaAiQuota(sessionToken: string, now = Date.now()) {
  const key = createHash("sha256").update(sessionToken, "utf8").digest("hex");
  const current = quotaBySession.get(key);
  if (!current || now - current.windowStartedAt >= OPEN_ENA_AI_RATE_LIMIT_WINDOW_MS) {
    if (quotaBySession.size >= 1_024) {
      const oldest = quotaBySession.keys().next().value as string | undefined;
      if (oldest) quotaBySession.delete(oldest);
    }
    quotaBySession.set(key, { count: 1, windowStartedAt: now });
    return true;
  }
  if (current.count >= OPEN_ENA_AI_RATE_LIMIT_REQUESTS) return false;
  current.count += 1;
  return true;
}

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
    if (!dependencies.verifySessionToken(sessionToken)) {
      return jsonResponse({ error: "Authentication required." }, 401);
    }

    if (!dependencies.authConfigurationReady()) {
      return jsonResponse({ error: "AI interpretation requires explicit secure access configuration." }, 503);
    }

    const submittedOrigin = request.headers.get("origin");
    if (!submittedOrigin) {
      return jsonResponse({ error: "Invalid request origin." }, 403);
    }

    const requestOrigin = resolveOpenEnaRequestOrigin(
      request.headers,
      new URL(request.url).origin,
    );
    if (!requestOrigin) {
      return jsonResponse({ error: "Invalid request origin." }, 403);
    }
    const submittedProtocol = new URL(requestOrigin).protocol.replace(":", "");
    const publicProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim()
      || new URL(request.url).protocol.replace(":", "");
    if (submittedProtocol !== publicProtocol) {
      return jsonResponse({ error: "Invalid request origin." }, 403);
    }

    if (request.headers.get(OPEN_ENA_AI_CONSENT_HEADER) !== OPEN_ENA_AI_CONSENT_VALUE) {
      return jsonResponse({ error: "Reviewed aggregate consent is required." }, 428);
    }

    if (!sessionToken || !dependencies.consumeQuota(sessionToken)) {
      return jsonResponse({ error: "Too many AI interpretation requests. Please try again later." }, 429);
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

    try {
      const interpretation = await dependencies.generate(parsedRequest, request.signal);
      return jsonResponse(interpretation, 200);
    } catch (error) {
      return safeProviderFailure(error);
    }
  };
}

const productionPostHandler = createOpenEnaAiInterpretationPostHandler({
  verifySessionToken: verifyOpenEnaSessionToken,
  authConfigurationReady: openEnaAiAuthConfigurationReady,
  consumeQuota: consumeOpenEnaAiQuota,
  parseRequest: parseOpenEnaAiInterpretationRequest,
  generate: (request, signal) => generateLunaInterpretation(request, { signal }),
});

export async function handleOpenEnaAiInterpretationPost(request: Request) {
  return productionPostHandler(request);
}
