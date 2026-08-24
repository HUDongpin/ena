import { createHash } from "node:crypto";
import { OPEN_ENA_SESSION_COOKIE, verifyOpenEnaSessionToken } from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import {
  assertAnalysisExecutionDatasetV2,
  assertTrajectoryRunSpecV2,
  hashAnalysisValueV1,
  type LongitudinalExecutionRequestV2,
} from "j-3dena";

const MAX_DERIVED_PAYLOAD_BYTES = 32 * 1024 * 1024;
const UPSTREAM_SUBMISSION_DEADLINE_MS = 10_000;
const COMPUTE_CONTRACT_VERSION = "3dena.contract.v1";
const OPEN_ENA_REMOTE_SUBMISSION_VERSION = "3dena.open-ena-longitudinal-remote-submit.v3";
const COMPUTE_CAPABILITY_VERSION = "3dena.longitudinal-compute-capability.v2";
const COMPUTE_STATUS_URLS_VERSION = "3dena.longitudinal-compute-status-urls.v2";
const EXECUTION_ATTEMPT_ID = /^attempt-[a-f0-9]{32}$/u;
export const OPEN_ENA_LONGITUDINAL_RATE_LIMIT_WINDOW_MS = 60_000;
export const OPEN_ENA_LONGITUDINAL_RATE_LIMIT_REQUESTS = 6;
const quotaBySession = new Map<string, { count: number; windowStartedAt: number }>();

type RequestValidatorV3 = (request: LongitudinalExecutionRequestV2) => void;

export interface OpenEnaLongitudinalComputeStatusUrlsV3 {
  schemaVersion: typeof COMPUTE_STATUS_URLS_VERSION;
  statusUrl: string;
  eventsUrl: string;
  resultUrl: string;
  artifactUrl: string;
  cancelUrl: string;
  deleteUrl: string;
}

export interface OpenEnaLongitudinalComputeCapabilityV3 {
  schemaVersion: typeof COMPUTE_CAPABILITY_VERSION;
  jobId: string;
  capabilityToken: string;
  urls: OpenEnaLongitudinalComputeStatusUrlsV3;
  expiresAt: string;
}

export interface OpenEnaLongitudinalRouteDependenciesV3 {
  upstreamFetch?: typeof fetch;
  environment?: Readonly<Record<string, string | undefined>>;
  validateRequest?: RequestValidatorV3;
  submissionDeadlineMilliseconds?: number;
  maximumDerivedPayloadBytes?: number;
  verifySessionToken?: (token: string | undefined) => boolean;
  consumeQuota?: (sessionToken: string) => boolean;
}

export class OpenEnaLongitudinalRouteErrorV3 extends Error {
  readonly code: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: string, status: number, message: string, headers: Readonly<Record<string, string>> = {}) {
    super(message);
    this.name = "OpenEnaLongitudinalRouteErrorV3";
    this.code = code;
    this.status = status;
    this.headers = headers;
  }
}

function fail(code: string, status: number, message: string, headers: Readonly<Record<string, string>> = {}): never {
  throw new OpenEnaLongitudinalRouteErrorV3(code, status, message, headers);
}

function cookieValue(headers: Headers, name: string): string | undefined {
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

function consumeOpenEnaLongitudinalQuota(sessionToken: string, now = Date.now()): boolean {
  const key = createHash("sha256").update(sessionToken, "utf8").digest("hex");
  const current = quotaBySession.get(key);
  if (!current || now - current.windowStartedAt >= OPEN_ENA_LONGITUDINAL_RATE_LIMIT_WINDOW_MS) {
    if (quotaBySession.size >= 1_024) {
      const oldest = quotaBySession.keys().next().value as string | undefined;
      if (oldest) quotaBySession.delete(oldest);
    }
    quotaBySession.set(key, { count: 1, windowStartedAt: now });
    return true;
  }
  if (current.count >= OPEN_ENA_LONGITUDINAL_RATE_LIMIT_REQUESTS) return false;
  current.count += 1;
  return true;
}

async function readTextBodyWithLimit(incoming: Request, maximumBytes: number): Promise<string> {
  const declared = incoming.headers.get("content-length");
  if (declared !== null && !/^(?:0|[1-9][0-9]{0,14})$/u.test(declared)) {
    fail("INVALID_REQUEST", 400, "Content-Length is malformed.");
  }
  const declaredBytes = declared === null ? null : Number(declared);
  if (declaredBytes !== null && declaredBytes > maximumBytes) {
    fail("DERIVED_PAYLOAD_TOO_LARGE", 413, "The derived trajectory payload exceeds the 32 MiB service limit.");
  }
  if (!incoming.body) return "";
  const reader = incoming.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > maximumBytes) {
        await reader.cancel("derived payload too large");
        fail("DERIVED_PAYLOAD_TOO_LARGE", 413, "The derived trajectory payload exceeds the 32 MiB service limit.");
      }
      const copy = new Uint8Array(value.byteLength);
      copy.set(value);
      chunks.push(copy);
      total += copy.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (declaredBytes !== null && declaredBytes !== total) {
      fail("INVALID_REQUEST", 400, "Content-Length does not match the derived trajectory payload.");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof OpenEnaLongitudinalRouteErrorV3) throw error;
    fail("INVALID_JSON", 400, "The persistent trajectory request is not valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }
}

function assertSameOriginRequest(incoming: Request): string {
  if (!incoming.headers.get("origin")) fail("INVALID_REQUEST_ORIGIN", 403, "Invalid request origin.");
  const requestUrl = new URL(incoming.url);
  const requestOrigin = resolveOpenEnaRequestOrigin(incoming.headers, requestUrl.origin);
  if (!requestOrigin) fail("INVALID_REQUEST_ORIGIN", 403, "Invalid request origin.");
  const submittedProtocol = new URL(requestOrigin).protocol.replace(":", "");
  const publicProtocol = incoming.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim()
    || requestUrl.protocol.replace(":", "");
  if (submittedProtocol !== publicProtocol) fail("INVALID_REQUEST_ORIGIN", 403, "Invalid request origin.");
  return requestOrigin;
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_REQUEST", 400, `${path} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(record).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    fail("INVALID_REQUEST", 400, `${path} contains unsupported fields.`);
  }
}

const OPAQUE_PARTICIPANT = /^opaque-participant:(participant-[1-9][0-9]*-[a-f0-9]{32})$/u;
const OPAQUE_UNIT = /^opaque-unit:(unit-[1-9][0-9]*-[a-f0-9]{32})$/u;
const OPAQUE_STEP = /^opaque-step:(step-[1-9][0-9]*-[a-f0-9]{32})$/u;
const OPAQUE_POINT = /^opaque-point:(unit-[1-9][0-9]*-[a-f0-9]{32}):(step-[1-9][0-9]*-[a-f0-9]{32})$/u;

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail("PRIVACY_BOUNDARY_VIOLATION", 400, `${path} must be an array of strings.`);
  }
  return value as string[];
}

function opaqueIdentity(
  value: unknown,
  pattern: RegExp,
  path: string,
): { record: Record<string, unknown>; tokens: string[]; columns: string[]; values: unknown[] } {
  const record = objectRecord(value, path);
  const match = typeof record.canonical === "string" ? pattern.exec(record.canonical) : null;
  if (!match) {
    fail("PRIVACY_BOUNDARY_VIOLATION", 400, `${path} is not an opaque Open ENA identity.`);
  }
  const columns = stringArray(record.columns, `${path}.columns`);
  if (!Array.isArray(record.values) || record.values.length !== columns.length) {
    fail("PRIVACY_BOUNDARY_VIOLATION", 400, `${path}.values does not match its columns.`);
  }
  return { record, tokens: match.slice(1), columns, values: record.values };
}

function sameValues(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((entry, index) => Object.is(entry, right[index]));
}

/** The durable service repeats stricter token, provenance, hash and metadata checks before queueing. */
export function assertOpenEnaLongitudinalRemotePrivacyV3(request: LongitudinalExecutionRequestV2): void {
  if (request.execution.target !== "persistent-compute-service") {
    fail("INVALID_EXECUTION_TARGET", 400, "Remote trajectory execution must declare persistent-compute-service.");
  }
  if (request.bootstrapTask !== undefined) {
    fail("TRAJECTORY_CI_UNSUPPORTED", 400, "Trajectory analysis does not submit confidence-interval or bootstrap tasks.");
  }
  const sourceResult = request.dataset.sourceResult;
  if (!sourceResult || sourceResult.sourceKind !== "raw-jena") {
    fail("INVALID_SOURCE_KIND", 400, "Remote trajectory execution requires the bound raw-jena result envelope.");
  }
  const scientific = objectRecord(sourceResult.result, "request.dataset.sourceResult.result");
  const points = scientific.points;
  if (!Array.isArray(points) || points.length === 0) fail("EMPTY_DERIVED_PAYLOAD", 400, "The projected trajectory payload contains no fitted points.");
  const participantColumns = request.pathTask.runSpec.participantColumns;
  const timeColumn = request.pathTask.runSpec.timeColumn;
  const groupColumn = request.pathTask.runSpec.groupColumn;
  points.forEach((candidate, index) => {
    const point = objectRecord(candidate, `points[${index}]`);
    const participant = opaqueIdentity(point.participantLabel, OPAQUE_PARTICIPANT, `points[${index}].participantLabel`);
    const unit = opaqueIdentity(point.unit, OPAQUE_UNIT, `points[${index}].unit`);
    const step = opaqueIdentity(point.step, OPAQUE_STEP, `points[${index}].step`);
    const id = opaqueIdentity(point.id, OPAQUE_POINT, `points[${index}].id`);
    if (!sameValues(participant.columns, participantColumns)
      || participant.values.some((component, componentIndex) => (
        component !== (componentIndex === 0 ? participant.tokens[0] : "@opaque-component")
      ))) {
      fail("PRIVACY_BOUNDARY_VIOLATION", 400, `points[${index}].participantLabel contains a raw identity component.`);
    }
    let unitTokenSeen = false;
    unit.columns.forEach((column, componentIndex) => {
      const component = unit.values[componentIndex];
      if (groupColumn && column === groupColumn) {
        const group = objectRecord(point.group, `points[${index}].group`);
        if (!Object.is(component, group.value)) {
          fail("PRIVACY_BOUNDARY_VIOLATION", 400, `points[${index}].unit contains an unbound group value.`);
        }
        return;
      }
      const expected = unitTokenSeen ? "@opaque-unit-component" : unit.tokens[0];
      if (component !== expected) {
        fail("PRIVACY_BOUNDARY_VIOLATION", 400, `points[${index}].unit contains a raw identity component.`);
      }
      unitTokenSeen = true;
    });
    let stepTokenSeen = false;
    step.columns.forEach((column, componentIndex) => {
      const component = step.values[componentIndex];
      if (column === timeColumn) {
        const time = objectRecord(point.time, `points[${index}].time`);
        if (!Object.is(component, time.value)) {
          fail("PRIVACY_BOUNDARY_VIOLATION", 400, `points[${index}].step contains an unbound time value.`);
        }
        return;
      }
      const expected = stepTokenSeen ? "@opaque-step-component" : step.tokens[0];
      if (component !== expected) {
        fail("PRIVACY_BOUNDARY_VIOLATION", 400, `points[${index}].step contains a raw identity component.`);
      }
      stepTokenSeen = true;
    });
    if (!unitTokenSeen || id.tokens[0] !== unit.tokens[0] || id.tokens[1] !== step.tokens[0]
      || !sameValues(id.columns, [...unit.columns, ...step.columns])
      || !sameValues(id.values, [...unit.values, ...step.values])) {
      fail("PRIVACY_BOUNDARY_VIOLATION", 400, `points[${index}].id is not bound to its opaque unit and step.`);
    }
  });
  const accumulation = objectRecord(scientific.accumulation, "request.dataset.sourceResult.result.accumulation");
  const rowCounts = objectRecord(accumulation.rowCounts, "request.dataset.sourceResult.result.accumulation.rowCounts");
  if (!Array.isArray(rowCounts.rowKeys) || rowCounts.rowKeys.length !== 0
    || !Array.isArray(rowCounts.values) || rowCounts.values.length !== 0) {
    fail("PRIVACY_BOUNDARY_VIOLATION", 400, "Raw coded row counts must be removed before remote execution.");
  }
}

function validateScientificRequest(request: LongitudinalExecutionRequestV2): void {
  assertAnalysisExecutionDatasetV2(request.dataset);
  assertTrajectoryRunSpecV2(request.pathTask.runSpec);
  const sourceResult = request.dataset.sourceResult;
  if (!sourceResult) fail("MISSING_SOURCE_RESULT", 400, "The immutable jENA source result is required.");
  if (request.pathTask.datasetHash !== request.dataset.receipt.sha256
    || request.pathTask.specHash !== request.dataset.specHash
    || request.pathTask.runSpec.sourceResultHash !== sourceResult.hash) {
    fail("IMMUTABLE_BINDING_MISMATCH", 400, "The dataset, spec, and source-result hashes do not share one immutable binding.");
  }
}

function computeBaseUrl(environment: Readonly<Record<string, string | undefined>>): URL {
  const configured = environment.OPEN_ENA_LONGITUDINAL_COMPUTE_URL?.trim();
  if (!configured) fail("REMOTE_SERVICE_UNAVAILABLE", 503, "Persistent trajectory compute is not configured.");
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    fail("REMOTE_SERVICE_UNAVAILABLE", 503, "Persistent trajectory compute is not configured correctly.");
  }
  const loopback = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((!loopback && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail("REMOTE_SERVICE_UNAVAILABLE", 503, "Persistent trajectory compute is not configured correctly.");
  }
  if (parsed.pathname !== "/") {
    fail("REMOTE_SERVICE_UNAVAILABLE", 503, "Persistent trajectory compute must be mounted at the configured origin root.");
  }
  return parsed;
}

function computeServiceToken(environment: Readonly<Record<string, string | undefined>>): string {
  const configured = environment.OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN;
  if (!configured || !/^[^\u0000-\u0020\u007f]{32,512}$/u.test(configured)) {
    fail("REMOTE_SERVICE_UNAVAILABLE", 503, "Persistent trajectory compute authentication is not configured correctly.");
  }
  return configured;
}

function safeComputeUrl(value: unknown, base: URL, path: string): string {
  if (typeof value !== "string") fail("INVALID_UPSTREAM_RESPONSE", 502, "Persistent compute returned an invalid capability.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_UPSTREAM_RESPONSE", 502, "Persistent compute returned an invalid capability.");
  }
  const basePath = base.pathname.replace(/\/+$/u, "");
  if (parsed.origin !== base.origin || parsed.username || parsed.password || parsed.search || parsed.hash
    || !(parsed.pathname === basePath || parsed.pathname.startsWith(`${basePath}/`))) {
    fail("INVALID_UPSTREAM_RESPONSE", 502, `Persistent compute returned an unsafe ${path}.`);
  }
  return parsed.toString();
}

function parseCapability(value: unknown, base: URL): OpenEnaLongitudinalComputeCapabilityV3 {
  const capability = objectRecord(value, "upstream");
  exactKeys(capability, ["schemaVersion", "jobId", "capabilityToken", "urls", "expiresAt"], "upstream");
  if (capability.schemaVersion !== COMPUTE_CAPABILITY_VERSION
    || typeof capability.jobId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u.test(capability.jobId)
    || typeof capability.capabilityToken !== "string" || capability.capabilityToken.length < 16
    || typeof capability.expiresAt !== "string" || Number.isNaN(Date.parse(capability.expiresAt))) {
    fail("INVALID_UPSTREAM_RESPONSE", 502, "Persistent compute returned an invalid capability.");
  }
  const urls = objectRecord(capability.urls, "upstream.urls");
  exactKeys(urls, ["schemaVersion", "statusUrl", "eventsUrl", "resultUrl", "artifactUrl", "cancelUrl", "deleteUrl"], "upstream.urls");
  if (urls.schemaVersion !== COMPUTE_STATUS_URLS_VERSION) fail("INVALID_UPSTREAM_RESPONSE", 502, "Persistent compute returned unsupported control URLs.");
  const parsedUrls = {
    statusUrl: safeComputeUrl(urls.statusUrl, base, "status URL"),
    eventsUrl: safeComputeUrl(urls.eventsUrl, base, "events URL"),
    resultUrl: safeComputeUrl(urls.resultUrl, base, "result URL"),
    artifactUrl: safeComputeUrl(urls.artifactUrl, base, "artifact URL"),
    cancelUrl: safeComputeUrl(urls.cancelUrl, base, "cancel URL"),
    deleteUrl: safeComputeUrl(urls.deleteUrl, base, "delete URL"),
  };
  const encodedJobId = encodeURIComponent(capability.jobId);
  if (Object.values(parsedUrls).some((value) => !new URL(value).pathname.includes(`/jobs/${encodedJobId}`))) {
    fail("INVALID_UPSTREAM_RESPONSE", 502, "Persistent compute returned control URLs for another job.");
  }
  return {
    schemaVersion: COMPUTE_CAPABILITY_VERSION,
    jobId: capability.jobId,
    capabilityToken: capability.capabilityToken,
    urls: {
      schemaVersion: COMPUTE_STATUS_URLS_VERSION,
      ...parsedUrls,
    },
    expiresAt: capability.expiresAt,
  };
}

function errorResponse(error: unknown): Response {
  const known = error instanceof OpenEnaLongitudinalRouteErrorV3;
  return Response.json({ error: {
    code: known ? error.code : "LONGITUDINAL_COMPUTE_FAILED",
    message: known ? error.message : "The longitudinal compute request failed.",
  } }, {
    status: known ? error.status : 500,
    headers: { "cache-control": "no-store", ...(known ? error.headers : {}) },
  });
}

export function createOpenEnaLongitudinalPostHandlerV3(
  dependencies: OpenEnaLongitudinalRouteDependenciesV3 = {},
): (incoming: Request) => Promise<Response> {
  const upstreamFetch = dependencies.upstreamFetch ?? fetch;
  const environment = dependencies.environment ?? process.env;
  const validate = dependencies.validateRequest ?? validateScientificRequest;
  const deadlineMilliseconds = dependencies.submissionDeadlineMilliseconds ?? UPSTREAM_SUBMISSION_DEADLINE_MS;
  const maximumDerivedPayloadBytes = dependencies.maximumDerivedPayloadBytes ?? MAX_DERIVED_PAYLOAD_BYTES;
  const verifySessionToken = dependencies.verifySessionToken ?? verifyOpenEnaSessionToken;
  const consumeQuota = dependencies.consumeQuota ?? consumeOpenEnaLongitudinalQuota;
  return async (incoming: Request) => {
    try {
      const sessionToken = cookieValue(incoming.headers, OPEN_ENA_SESSION_COOKIE);
      if (!verifySessionToken(sessionToken)) fail("AUTHENTICATION_REQUIRED", 401, "Authentication required.");
      const requestOrigin = assertSameOriginRequest(incoming);
      if (!sessionToken || !consumeQuota(sessionToken)) {
        fail("RATE_LIMITED", 429, "Too many longitudinal compute requests. Please try again later.", {
          "retry-after": String(Math.ceil(OPEN_ENA_LONGITUDINAL_RATE_LIMIT_WINDOW_MS / 1_000)),
        });
      }
      // Resolve the complete server-only upstream configuration before reading
      // any derived research payload. Misconfigured deployments fail closed.
      const base = computeBaseUrl(environment);
      const serviceToken = computeServiceToken(environment);
      const text = await readTextBodyWithLimit(incoming, maximumDerivedPayloadBytes);
      let decoded: unknown;
      try {
        decoded = JSON.parse(text);
      } catch {
        fail("INVALID_JSON", 400, "The persistent trajectory request is not valid JSON.");
      }
      const body = objectRecord(decoded, "body");
      exactKeys(body, ["schemaVersion", "executionAttemptId", "processingPolicyConfirmed", "request"], "body");
      if (body.schemaVersion !== OPEN_ENA_REMOTE_SUBMISSION_VERSION) {
        fail("INVALID_REQUEST_VERSION", 400, "The persistent trajectory submission version is unsupported.");
      }
      if (body.processingPolicyConfirmed !== true) {
        fail("PROCESSING_POLICY_NOT_CONFIRMED", 400, "Persistent derived-data processing must be confirmed.");
      }
      if (typeof body.executionAttemptId !== "string" || !EXECUTION_ATTEMPT_ID.test(body.executionAttemptId)) {
        fail("INVALID_EXECUTION_ATTEMPT", 400, "Persistent trajectory execution attempt is invalid.");
      }
      const request = structuredClone(objectRecord(body.request, "body.request")) as unknown as LongitudinalExecutionRequestV2;
      assertOpenEnaLongitudinalRemotePrivacyV3(request);
      try {
        validate(request);
      } catch (error) {
        if (error instanceof OpenEnaLongitudinalRouteErrorV3) throw error;
        fail("INVALID_LONGITUDINAL_TASK", 400, "The longitudinal compute task failed scientific validation.");
      }

      const submission = {
        schemaVersion: "3dena.longitudinal-compute-submission.v2",
        dataset: request.dataset,
        pathTask: request.pathTask,
        ...(request.inferenceTask ? { inferenceTask: request.inferenceTask } : {}),
        ...(request.networkOverlayTask ? { networkOverlayTask: request.networkOverlayTask } : {}),
        seed: request.execution.seed,
        processingPolicyConfirmed: true,
      };
      const submissionHash = await hashAnalysisValueV1(submission);
      const operationHash = createHash("sha256")
        .update(sessionToken).update("\0")
        .update(body.executionAttemptId).update("\0")
        .update(submissionHash).digest("hex");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), deadlineMilliseconds);
      incoming.signal.addEventListener("abort", () => controller.abort(), { once: true });
      let upstream: Response;
      try {
        upstream = await upstreamFetch(new URL("v2/longitudinal-jobs", base), {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "idempotency-key": `open-ena-longitudinal-${operationHash}`,
            origin: requestOrigin,
            "x-3dena-contract-version": COMPUTE_CONTRACT_VERSION,
            "x-3dena-service-token": serviceToken,
          },
          body: JSON.stringify(submission),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          fail("REMOTE_SUBMISSION_DEADLINE_EXCEEDED", 504, "Persistent trajectory submission timed out; no repetition plan was reduced.");
        }
        fail("REMOTE_SERVICE_UNAVAILABLE", 503, "Persistent trajectory compute is unavailable.");
      } finally {
        clearTimeout(timeout);
      }
      if (!upstream.ok) {
        const safeStatus = [400, 409, 413, 429, 503, 504].includes(upstream.status)
          ? upstream.status
          : 502;
        const safeCode = upstream.status === 400
          ? "REMOTE_SUBMISSION_INVALID"
          : upstream.status === 409
            ? "REMOTE_ATTEMPT_CONFLICT"
            : upstream.status === 413
              ? "REMOTE_DERIVED_PAYLOAD_TOO_LARGE"
              : upstream.status === 429
                ? "REMOTE_RATE_LIMITED"
                : upstream.status === 503
                  ? "REMOTE_SERVICE_UNAVAILABLE"
                  : upstream.status === 504
                    ? "REMOTE_SUBMISSION_DEADLINE_EXCEEDED"
                    : "REMOTE_SUBMISSION_REJECTED";
        const safeMessage = upstream.status === 400
          ? "Persistent trajectory compute rejected the versioned derived-task contract."
          : upstream.status === 409
            ? "This compute attempt can no longer be replayed. Start a new Retry attempt."
            : upstream.status === 413
              ? "The derived trajectory payload exceeds the persistent compute limit."
              : upstream.status === 429
                ? "Persistent trajectory compute is busy. Please retry later."
                : upstream.status === 503
                  ? "Persistent trajectory compute is unavailable."
                  : upstream.status === 504
                    ? "Persistent trajectory compute exceeded its submission deadline."
                    : "Persistent trajectory compute rejected the derived task.";
        fail(
          safeCode,
          safeStatus,
          safeMessage,
          upstream.status === 429 && upstream.headers.get("retry-after")
            ? { "retry-after": upstream.headers.get("retry-after")! }
            : {},
        );
      }
      let capabilityValue: unknown;
      try {
        capabilityValue = await upstream.json();
      } catch {
        fail("INVALID_UPSTREAM_RESPONSE", 502, "Persistent compute returned an invalid capability.");
      }
      return Response.json(parseCapability(capabilityValue, base), {
        status: 202,
        headers: { "cache-control": "no-store", "x-open-ena-compute": "persistent-queued-v2" },
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const handleOpenEnaLongitudinalPostV3 = createOpenEnaLongitudinalPostHandlerV3();
