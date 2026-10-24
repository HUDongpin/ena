import { parseBundleJsonV3 } from "../open-ena/bundle-json-v3";
import { OpenEnaCloudError, type OpenEnaCloudErrorCode } from "./open-ena-cloud-db";

export const OPEN_ENA_CLOUD_HEADERS = {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Cookie, Origin",
};

export function openEnaCloudJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: OPEN_ENA_CLOUD_HEADERS });
}

export function openEnaCloudFailure(error: unknown) {
  const code = error instanceof OpenEnaCloudError ? error.code : "unavailable";
  const statuses: Record<OpenEnaCloudErrorCode, number> = {
    "invalid-input": 400, "invalid-token": 400, unauthenticated: 401, "not-found": 404,
    conflict: 409, quota: 409, "rate-limited": 429, "too-large": 413, unavailable: 503,
  };
  const response = openEnaCloudJson({ error: code }, statuses[code]);
  if (code === "rate-limited") response.headers.set("Retry-After", "3600");
  if (code === "unavailable") response.headers.set("Retry-After", "5");
  return response;
}

export async function readOpenEnaCloudJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new OpenEnaCloudError("invalid-input");
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^(0|[1-9]\d*)$/u.test(declared)) throw new OpenEnaCloudError("invalid-input");
  if (declared !== null && Number(declared) > maxBytes) throw new OpenEnaCloudError("too-large");
  if (!request.body) throw new OpenEnaCloudError("invalid-input");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel().catch(() => undefined); throw new OpenEnaCloudError("too-large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = parseBundleJsonV3(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Not an object.");
    return value as Record<string, unknown>;
  } catch { throw new OpenEnaCloudError("invalid-input"); }
}

export function assertOpenEnaCloudFields(body: Record<string, unknown>, allowed: string[], required: string[] = []) {
  if (Object.keys(body).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(body, key))) throw new OpenEnaCloudError("invalid-input");
}

export function openEnaCloudSessionCookie(request: Request): string | undefined {
  const matches = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith("open-ena-session=")) ?? [];
  return matches.length === 1 ? matches[0].slice("open-ena-session=".length) : undefined;
}
