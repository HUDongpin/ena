"use client";

import {
  executeLongitudinalAnalysisV2,
  hashLongitudinalExecutionRequestV2,
  verifyLongitudinalAnalysisBundleV2,
  type LongitudinalAnalysisBundleV2,
  type LongitudinalExecutionRequestV2,
} from "j-3dena";
import { deepFreezeV3 } from "./model-v3/canonical-json";

import type {
  OpenEnaLongitudinalWorkerResponseV3,
  OpenEnaLongitudinalWorkerStageV3,
} from "./longitudinal-v3.worker";

const LOCAL_TIME_BUDGET_MS = 8_000;
const LOCAL_MEMORY_BUDGET_BYTES = 128 * 1024 * 1024;
const HARD_DEADLINE_MS = 60_000;
const REMOTE_POLL_INTERVAL_MS = 250;
const REMOTE_CLEANUP_DEADLINE_MS = 10_000;
const MAX_REMOTE_METADATA_BYTES = 64 * 1024;
const REMOTE_ERROR_BODY_DEADLINE_MS = 1_000;
const MAX_REMOTE_ARTIFACT_BYTES = 128 * 1024 * 1024;
const COMPUTE_CONTRACT_VERSION = "3dena.contract.v1";
const REMOTE_SUBMISSION_VERSION = "3dena.open-ena-longitudinal-remote-submit.v3";
const REMOTE_CAPABILITY_VERSION = "3dena.longitudinal-compute-capability.v2";
const REMOTE_URLS_VERSION = "3dena.longitudinal-compute-status-urls.v2";
const REMOTE_ARTIFACT_VERSION = "3dena.compute-scientific-longitudinal-result-artifact.v2";
const completedCache = new Map<string, LongitudinalAnalysisBundleV2>();

function executionAttemptId(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random generation is unavailable for persistent-compute retries.");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `attempt-${token}`;
}

type RemoteStateV3 =
  | "RESERVED"
  | "UPLOADED"
  | "QUEUED"
  | "LEASED"
  | "RUNNING"
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

interface RemoteCapabilityV3 {
  schemaVersion: typeof REMOTE_CAPABILITY_VERSION;
  jobId: string;
  capabilityToken: string;
  urls: {
    schemaVersion: typeof REMOTE_URLS_VERSION;
    statusUrl: string;
    eventsUrl: string;
    resultUrl: string;
    artifactUrl: string;
    cancelUrl: string;
    deleteUrl: string;
  };
  expiresAt: string;
}

interface RemoteStatusV3 {
  schemaVersion: "3dena.job-status.v1";
  jobId: string;
  state: RemoteStateV3;
  resultAvailable: boolean;
  errorCode: string | null;
}

export interface OpenEnaLongitudinalRouteDecisionV3 {
  target: "browser-worker" | "persistent-compute-service";
  predictedMilliseconds: number;
  predictedMemoryBytes: number;
  requiresConfirmation: boolean;
  reason: "within-local-budget" | "predicted-time-budget" | "predicted-memory-budget" | "predicted-time-and-memory-budget";
  hardDeadlineMilliseconds: 60_000;
  remotePayload: {
    rawRows: false;
    identities: "opaque-participant-tokens";
    coordinates: "preprojected-fixed-jena-rotation";
    fields: ["coordinates", "opaqueParticipant", "group", "time", "weightsOrStrata", "taskParameters"];
  };
}

export interface OpenEnaLongitudinalProgressV3 {
  progress: number;
  stage: OpenEnaLongitudinalWorkerStageV3 | "remote-submit" | "remote-wait" | "complete";
}

export interface ExecuteOpenEnaLongitudinalPreparedOptionsV3 {
  signal?: AbortSignal;
  onProgress?: (progress: OpenEnaLongitudinalProgressV3) => void;
  allowRemote?: boolean;
  forceLocal?: boolean;
  remoteEndpoint?: string;
  fetchImpl?: typeof fetch;
  remotePollIntervalMilliseconds?: number;
  remoteCleanupDeadlineMilliseconds?: number;
  /** Test seam. Production callers omit this and retain the fixed 60 second contract. */
  remoteDeadlineMilliseconds?: number;
  nodeExecutor?: (request: LongitudinalExecutionRequestV2) => Promise<LongitudinalAnalysisBundleV2>;
  resultVerifier?: (bundle: unknown) => Promise<void>;
}

export interface OpenEnaLongitudinalExecutionReceiptV3 {
  bundle: LongitudinalAnalysisBundleV2;
  cacheHit: boolean;
  decision: OpenEnaLongitudinalRouteDecisionV3;
}

export type OpenEnaLongitudinalExecutionClientErrorCodeV3 =
  | "REMOTE_CONFIRMATION_REQUIRED"
  | "REMOTE_SERVICE_UNAVAILABLE"
  | "REMOTE_AUTH_REQUIRED"
  | "REMOTE_RATE_LIMITED"
  | "REMOTE_REQUEST_REJECTED"
  | "REMOTE_SUBMISSION_FAILED"
  | "REMOTE_POLL_FAILED"
  | "REMOTE_TERMINAL_FAILED"
  | "REMOTE_TERMINAL_EXPIRED"
  | "REMOTE_TERMINAL_CANCELLED"
  | "REMOTE_RESULT_FAILED"
  | "REMOTE_DEADLINE_EXCEEDED";

export class OpenEnaLongitudinalExecutionClientErrorV3 extends Error {
  readonly code: OpenEnaLongitudinalExecutionClientErrorCodeV3;
  readonly decision: OpenEnaLongitudinalRouteDecisionV3;
  readonly canContinueLocally: boolean;
  readonly canDisableInference: boolean;
  /** Immediate remote retry is appropriate; recovery UI may enable a later explicit retry. */
  readonly canRetryRemote: boolean;
  /** Server `error.code` when the route returned a structured JSON error. */
  readonly serverCode: string | null;
  /** Parsed `Retry-After`, accepting delta-seconds and HTTP-date. */
  readonly retryAfterSeconds: number | null;
  readonly retryAtMilliseconds: number | null;
  readonly httpStatus: number | null;

  constructor(
    code: OpenEnaLongitudinalExecutionClientErrorCodeV3,
    message: string,
    decision: OpenEnaLongitudinalRouteDecisionV3,
    options: {
      canContinueLocally: boolean;
      canDisableInference: boolean;
      canRetryRemote?: boolean;
      serverCode?: string | null;
      retryAfterSeconds?: number | null;
      retryAtMilliseconds?: number | null;
      httpStatus?: number | null;
    },
  ) {
    super(message);
    this.name = "OpenEnaLongitudinalExecutionClientErrorV3";
    this.code = code;
    this.decision = decision;
    this.canContinueLocally = options.canContinueLocally;
    this.canDisableInference = options.canDisableInference;
    this.canRetryRemote = options.canRetryRemote ?? true;
    this.serverCode = options.serverCode ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.retryAtMilliseconds = options.retryAtMilliseconds
      ?? (this.retryAfterSeconds === null ? null : Date.now() + this.retryAfterSeconds * 1000);
    this.httpStatus = options.httpStatus ?? null;
  }
}

function recoverableRemoteError(
  code: Exclude<OpenEnaLongitudinalExecutionClientErrorCodeV3, "REMOTE_CONFIRMATION_REQUIRED">,
  message: string,
  decision: OpenEnaLongitudinalRouteDecisionV3,
): OpenEnaLongitudinalExecutionClientErrorV3 {
  return new OpenEnaLongitudinalExecutionClientErrorV3(
    code,
    message,
    decision,
    { canContinueLocally: true, canDisableInference: true },
  );
}

function caughtMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function requestShape(request: LongitudinalExecutionRequestV2) {
  const result = request.dataset.sourceResult?.result as {
    points?: unknown[];
    dimensions?: unknown[];
    edges?: unknown[];
  } | undefined;
  // Source-row receipts are a conservative predictor when participant-period
  // reduction makes the fitted point table smaller than the uploaded study.
  const points = Math.max(result?.points?.length ?? 0, request.dataset.receipt.rows);
  const dimensions = result?.dimensions?.length ?? 3;
  const edges = result?.edges?.length ?? 1;
  const periods = request.pathTask.runSpec.orderedPeriods.length;
  const permutations = request.inferenceTask?.requests.reduce((sum, item) => (
    item.kind === "path-comparison" ? sum + item.repetitions : sum
  ), 0) ?? 0;
  return { points, dimensions, edges, periods, permutations };
}

export function estimateOpenEnaLongitudinalExecutionV3(
  request: LongitudinalExecutionRequestV2,
): OpenEnaLongitudinalRouteDecisionV3 {
  const shape = requestShape(request);
  const baseOperations = shape.points * Math.max(3, shape.dimensions) * 28;
  const resamplingOperations = shape.permutations
    * shape.points
    * Math.max(2, shape.periods)
    * Math.max(3, Math.min(shape.dimensions, 12))
    * 0.42;
  const predictedMilliseconds = Math.ceil(35 + (baseOperations + resamplingOperations) / 22_000);
  const predictedMemoryBytes = Math.ceil(
    8 * shape.points * (shape.dimensions + shape.edges + 24) * 3
    + 8 * shape.permutations * Math.max(2, shape.periods) * Math.max(3, shape.dimensions),
  );
  const overTime = predictedMilliseconds > LOCAL_TIME_BUDGET_MS;
  const overMemory = predictedMemoryBytes > LOCAL_MEMORY_BUDGET_BYTES;
  const target = overTime || overMemory ? "persistent-compute-service" : "browser-worker";
  return {
    target,
    predictedMilliseconds,
    predictedMemoryBytes,
    requiresConfirmation: target === "persistent-compute-service",
    reason: overTime && overMemory
      ? "predicted-time-and-memory-budget"
      : overTime
        ? "predicted-time-budget"
        : overMemory
          ? "predicted-memory-budget"
          : "within-local-budget",
    hardDeadlineMilliseconds: HARD_DEADLINE_MS,
    remotePayload: {
      rawRows: false,
      identities: "opaque-participant-tokens",
      coordinates: "preprojected-fixed-jena-rotation",
      fields: ["coordinates", "opaqueParticipant", "group", "time", "weightsOrStrata", "taskParameters"],
    },
  };
}

async function cacheKey(request: LongitudinalExecutionRequestV2): Promise<string> {
  return hashLongitudinalExecutionRequestV2(request);
}

async function assertResultBinding(
  bundle: LongitudinalAnalysisBundleV2,
  request: LongitudinalExecutionRequestV2,
): Promise<void> {
  const requestedInference = request.inferenceTask?.requests ?? [];
  const rankRequests = requestedInference.filter((item) => item.kind !== "path-comparison");
  const pathRequests = requestedInference.filter((item) => item.kind === "path-comparison");
  const overlayRequests = request.networkOverlayTask?.requests ?? [];
  const expectedJenaBuildId = `jena-js@${request.execution.jenaVersion}+${request.execution.jenaCommit}:${request.execution.buildId}`;
  const expectedRequestHash = await hashLongitudinalExecutionRequestV2(request);
  if (
    bundle.identity.datasetHash !== request.pathTask.datasetHash
    || bundle.identity.specHash !== request.pathTask.specHash
    || bundle.identity.sourceResultHash !== request.pathTask.runSpec.sourceResultHash
    || bundle.identity.requestHash !== expectedRequestHash
    || bundle.identity.runId !== request.pathTask.runId
    || bundle.identity.jenaBuildId !== expectedJenaBuildId
    || bundle.execution.jenaVersion !== request.execution.jenaVersion
    || bundle.execution.jenaCommit !== request.execution.jenaCommit
    || bundle.execution.jenaTarballIntegrity !== request.execution.jenaTarballIntegrity
    || bundle.execution.sdkVersion !== request.execution.sdkVersion
    || bundle.execution.buildId !== request.execution.buildId
    || bundle.execution.seed !== request.execution.seed
    || JSON.stringify(bundle.runSpec) !== JSON.stringify(request.pathTask.runSpec)
    || bundle.inference.length !== rankRequests.length
    || bundle.pathComparisons.length !== pathRequests.length
    || bundle.networkOverlays.length !== overlayRequests.length
    || bundle.bootstrap.length !== 0
  ) throw new Error("Longitudinal execution returned an envelope with a mismatched immutable binding.");
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function remoteRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} is not a valid persistent-compute object.`);
  }
  return value as Record<string, unknown>;
}

function remoteExact(value: Record<string, unknown>, fields: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${path} contains unsupported persistent-compute fields.`);
  }
}

function nonEmptyRemoteString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path} must be a non-empty string.`);
  return value;
}

function safeRemoteControlUrls(
  values: Record<"statusUrl" | "eventsUrl" | "resultUrl" | "artifactUrl" | "cancelUrl" | "deleteUrl", string>,
  jobId: string,
): void {
  const parsed = Object.entries(values).map(([name, value]) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`capability.urls.${name} is not an absolute URL.`);
    }
    const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
      throw new Error(`capability.urls.${name} is unsafe.`);
    }
    return [name, url] as const;
  });
  const origin = parsed[0]?.[1].origin;
  const jobPath = `/jobs/${encodeURIComponent(jobId)}`;
  if (!origin || parsed.some(([, url]) => url.origin !== origin
    || !(url.pathname.endsWith(jobPath) || url.pathname.includes(`${jobPath}/`)))) {
    throw new Error("Persistent compute control URLs do not share one job-scoped origin.");
  }
}

function parseRemoteCapability(value: unknown): RemoteCapabilityV3 {
  const capability = remoteRecord(value, "capability");
  remoteExact(capability, ["schemaVersion", "jobId", "capabilityToken", "urls", "expiresAt"], "capability");
  if (capability.schemaVersion !== REMOTE_CAPABILITY_VERSION) throw new Error("Persistent compute returned an unsupported capability version.");
  const urls = remoteRecord(capability.urls, "capability.urls");
  remoteExact(urls, ["schemaVersion", "statusUrl", "eventsUrl", "resultUrl", "artifactUrl", "cancelUrl", "deleteUrl"], "capability.urls");
  if (urls.schemaVersion !== REMOTE_URLS_VERSION) throw new Error("Persistent compute returned unsupported control URLs.");
  const expiresAt = nonEmptyRemoteString(capability.expiresAt, "capability.expiresAt");
  if (Number.isNaN(Date.parse(expiresAt))) throw new Error("Persistent compute returned an invalid capability expiry.");
  const jobId = nonEmptyRemoteString(capability.jobId, "capability.jobId");
  const parsedUrls = {
    statusUrl: nonEmptyRemoteString(urls.statusUrl, "capability.urls.statusUrl"),
    eventsUrl: nonEmptyRemoteString(urls.eventsUrl, "capability.urls.eventsUrl"),
    resultUrl: nonEmptyRemoteString(urls.resultUrl, "capability.urls.resultUrl"),
    artifactUrl: nonEmptyRemoteString(urls.artifactUrl, "capability.urls.artifactUrl"),
    cancelUrl: nonEmptyRemoteString(urls.cancelUrl, "capability.urls.cancelUrl"),
    deleteUrl: nonEmptyRemoteString(urls.deleteUrl, "capability.urls.deleteUrl"),
  };
  safeRemoteControlUrls(parsedUrls, jobId);
  return {
    schemaVersion: REMOTE_CAPABILITY_VERSION,
    jobId,
    capabilityToken: nonEmptyRemoteString(capability.capabilityToken, "capability.capabilityToken"),
    urls: {
      schemaVersion: REMOTE_URLS_VERSION,
      ...parsedUrls,
    },
    expiresAt,
  };
}

function parseRemoteStatus(value: unknown, capability: RemoteCapabilityV3): RemoteStatusV3 {
  const status = remoteRecord(value, "status");
  remoteExact(status, [
    "schemaVersion", "jobId", "state", "owner", "progress", "createdAt", "updatedAt",
    "expiresAt", "resultAvailable", "errorCode",
  ], "status");
  const states: RemoteStateV3[] = [
    "RESERVED", "UPLOADED", "QUEUED", "LEASED", "RUNNING", "CANCEL_REQUESTED",
    "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED",
  ];
  if (status.schemaVersion !== "3dena.job-status.v1"
    || status.jobId !== capability.jobId
    || !states.includes(status.state as RemoteStateV3)
    || typeof status.resultAvailable !== "boolean"
    || (status.errorCode !== null && typeof status.errorCode !== "string")) {
    throw new Error("Persistent compute returned an invalid job status.");
  }
  return {
    schemaVersion: "3dena.job-status.v1",
    jobId: capability.jobId,
    state: status.state as RemoteStateV3,
    resultAvailable: status.resultAvailable,
    errorCode: status.errorCode as string | null,
  };
}

function computeHeaders(capability: RemoteCapabilityV3, accept = "application/json"): Headers {
  return new Headers({
    accept,
    authorization: `Bearer ${capability.capabilityToken}`,
    "x-3dena-contract-version": COMPUTE_CONTRACT_VERSION,
  });
}

const REMOTE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;

interface RemoteHttpFailureV3 {
  status: number;
  serverCode: string | null;
  retryAfterSeconds: number | null;
  retryAtMilliseconds: number | null;
}

class RemoteHttpErrorV3 extends Error {
  readonly failure: RemoteHttpFailureV3;

  constructor(label: string, failure: RemoteHttpFailureV3) {
    const codeSuffix = failure.serverCode ? ` (${failure.serverCode})` : "";
    super(`${label} returned HTTP ${failure.status}${codeSuffix}.`);
    this.name = "RemoteHttpErrorV3";
    this.failure = failure;
  }
}

function retryAtMilliseconds(header: string | null, now: number): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (/^(?:0|[1-9][0-9]{0,6})$/u.test(trimmed)) return now + Number(trimmed) * 1000;
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/u.test(trimmed)) return null;
  const deadline = Date.parse(trimmed);
  return Number.isFinite(deadline) ? Math.max(now, deadline) : null;
}

function serverErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && REMOTE_ERROR_CODE_PATTERN.test(code) ? code : null;
}

function isJsonRemoteContentType(header: string | null): boolean {
  const media = header?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return media === "application/json" || media.endsWith("+json");
}

/**
 * Read a failed remote response only far enough to keep `error.code`.
 * Only a JSON content type is read, and only up to the metadata size within one second.
 * Any other body, or a read that overflows, stalls, or fails, is cancelled; the HTTP status is kept.
 */
async function readRemoteFailure(response: Response): Promise<RemoteHttpFailureV3> {
  const receivedAt = Date.now();
  const retryAt = retryAtMilliseconds(response.headers.get("retry-after"), receivedAt);
  const failure = (serverCode: string | null): RemoteHttpFailureV3 => ({
    status: response.status,
    serverCode,
    retryAfterSeconds: retryAt === null ? null : Math.ceil((retryAt - receivedAt) / 1000),
    retryAtMilliseconds: retryAt,
  });
  const release = () => response.body?.cancel().catch(() => undefined);
  if (!isJsonRemoteContentType(response.headers.get("content-type"))) {
    void release();
    return failure(null);
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > MAX_REMOTE_METADATA_BYTES)) {
    void release();
    return failure(null);
  }
  const reader = response.body?.getReader();
  if (!reader) return failure(null);
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => undefined);
  }, REMOTE_ERROR_BODY_DEADLINE_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) return failure(null);
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REMOTE_METADATA_BYTES) {
        void reader.cancel().catch(() => undefined);
        return failure(null);
      }
      chunks.push(value);
    }
  } catch {
    void reader.cancel().catch(() => undefined);
    return failure(null);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return failure(serverErrorCode(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))));
  } catch {
    return failure(null);
  }
}

function remoteHttpClientError(
  error: RemoteHttpErrorV3,
  decision: OpenEnaLongitudinalRouteDecisionV3,
  phase: "submission" | "poll" | "result",
): OpenEnaLongitudinalExecutionClientErrorV3 {
  const { status, serverCode, retryAfterSeconds: retryAfter, retryAtMilliseconds: retryAt } = error.failure;
  const auth = status === 401;
  const rateLimited = status === 429;
  const unavailable = status === 503;
  const rejected = status >= 400 && status < 500 && !auth && !rateLimited;
  return new OpenEnaLongitudinalExecutionClientErrorV3(
    auth ? "REMOTE_AUTH_REQUIRED" : rateLimited ? "REMOTE_RATE_LIMITED"
      : unavailable ? "REMOTE_SERVICE_UNAVAILABLE" : rejected ? "REMOTE_REQUEST_REJECTED"
        : phase === "submission" ? "REMOTE_SUBMISSION_FAILED" : phase === "poll" ? "REMOTE_POLL_FAILED" : "REMOTE_RESULT_FAILED",
    error.message,
    decision,
    {
      canContinueLocally: true,
      canDisableInference: true,
      canRetryRemote: !auth && !rateLimited && !unavailable && !rejected,
      serverCode,
      retryAfterSeconds: retryAfter,
      retryAtMilliseconds: retryAt,
      httpStatus: status,
    },
  );
}

async function jsonResponse(
  response: Response,
  label: string,
): Promise<unknown> {
  if (!response.ok) {
    throw new RemoteHttpErrorV3(label, await readRemoteFailure(response));
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > MAX_REMOTE_METADATA_BYTES)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${label} exceeds the persistent-compute metadata limit.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${label} returned an empty body.`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REMOTE_METADATA_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`${label} exceeds the persistent-compute metadata limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

function waitRemote(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError("The persistent trajectory task was cancelled."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(abortError("The persistent trajectory task was cancelled."));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function progressForRemoteState(state: RemoteStateV3): number {
  return ({
    RESERVED: 0.08,
    UPLOADED: 0.1,
    QUEUED: 0.15,
    LEASED: 0.25,
    RUNNING: 0.55,
    CANCEL_REQUESTED: 0.7,
    SUCCEEDED: 0.9,
    FAILED: 0.9,
    CANCELLED: 0.9,
    EXPIRED: 0.9,
  } as const)[state];
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function boundedResponseBytes(response: Response, expectedLength: number): Promise<Uint8Array> {
  if (expectedLength < 1 || expectedLength > MAX_REMOTE_ARTIFACT_BYTES) {
    throw new Error("Persistent trajectory artifact exceeds the Open ENA result limit.");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > MAX_REMOTE_ARTIFACT_BYTES)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Persistent trajectory artifact Content-Length exceeds the Open ENA result limit.");
  }
  // Fetch can decompress the body while retaining its compressed Content-Length.
  // The decoded bytes below must still exactly match the immutable receipt.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Persistent trajectory artifact has no readable body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (total + next.value.byteLength > expectedLength) {
        await reader.cancel("artifact exceeds immutable receipt").catch(() => undefined);
        throw new Error("Persistent trajectory artifact exceeds its immutable result receipt.");
      }
      const copy = new Uint8Array(next.value.byteLength);
      copy.set(next.value);
      chunks.push(copy);
      total += copy.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedLength) {
    throw new Error("Persistent trajectory artifact length does not match its immutable result receipt.");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function deleteRemoteJob(
  capability: RemoteCapabilityV3,
  fetchImpl: typeof fetch,
  deadlineMilliseconds: number,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deadlineMilliseconds);
  const operationKey = `open-ena-delete-${capability.jobId}`;
  try {
    while (true) {
      const headers = computeHeaders(capability, "application/vnd.3dena.job-deletion-receipt.v2+json");
      headers.set("idempotency-key", operationKey);
      const response = await fetchImpl(capability.urls.deleteUrl, {
        redirect: "error",
        method: "DELETE",
        headers,
        signal: controller.signal,
      });
      const value = await jsonResponse(response, "Persistent trajectory deletion");
      const receipt = remoteRecord(value, "deletion receipt");
      remoteExact(receipt, [
        "schemaVersion", "jobId", "cancelled", "inputDeleted", "resultDeleted", "deletedAt",
        "intentAccepted", "termination", "capacity", "objects",
      ], "deletion receipt");
      if (receipt.schemaVersion !== "3dena.job-deletion-receipt.v2" || receipt.jobId !== capability.jobId
        || typeof receipt.cancelled !== "boolean"
        || typeof receipt.inputDeleted !== "boolean" || typeof receipt.resultDeleted !== "boolean"
        || receipt.intentAccepted !== true
        || !["not_required", "pending", "observed"].includes(receipt.termination as string)
        || !["not_reserved", "held", "released"].includes(receipt.capacity as string)
        || !["pending", "deleted"].includes(receipt.objects as string)
        || (receipt.deletedAt !== null
          && (typeof receipt.deletedAt !== "string" || Number.isNaN(Date.parse(receipt.deletedAt))))) {
        throw new Error("Persistent compute returned an invalid deletion receipt.");
      }
      if ((receipt.objects === "deleted")
        !== (receipt.inputDeleted === true && receipt.resultDeleted === true && receipt.deletedAt !== null)
        || (receipt.termination === "pending" && receipt.capacity !== "held")) {
        throw new Error("Persistent compute returned contradictory deletion lifecycle facts.");
      }
      if (receipt.objects === "deleted" && receipt.inputDeleted === true && receipt.resultDeleted === true
        && receipt.termination !== "pending" && receipt.capacity !== "held" && typeof receipt.deletedAt === "string") return;
      await waitRemote(REMOTE_POLL_INTERVAL_MS, controller.signal);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteBundle(
  capability: RemoteCapabilityV3,
  request: LongitudinalExecutionRequestV2,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<LongitudinalAnalysisBundleV2> {
  const referenceResponse = await fetchImpl(capability.urls.resultUrl, {
    redirect: "error",
    method: "GET",
    headers: computeHeaders(capability),
    signal,
  });
  const referenceValue = await jsonResponse(referenceResponse, "Persistent trajectory result reference");
  const reference = remoteRecord(referenceValue, "result reference");
  remoteExact(reference, ["schemaVersion", "jobId", "sha256", "byteLength", "resultUrl", "exportUrl", "expiresAt"], "result reference");
  if (reference.schemaVersion !== "3dena.job-result-reference.v1"
    || reference.jobId !== capability.jobId
    || typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(reference.sha256)
    || !Number.isSafeInteger(reference.byteLength) || Number(reference.byteLength) < 1
    || Number(reference.byteLength) > MAX_REMOTE_ARTIFACT_BYTES) {
    throw new Error("Persistent compute returned an invalid result reference.");
  }

  const artifactResponse = await fetchImpl(capability.urls.artifactUrl, {
    redirect: "error",
    method: "GET",
    headers: computeHeaders(capability, "application/json"),
    signal,
  });
  if (!artifactResponse.ok) {
    throw new RemoteHttpErrorV3("Persistent trajectory artifact", await readRemoteFailure(artifactResponse));
  }
  const artifactBytes = await boundedResponseBytes(artifactResponse, Number(reference.byteLength));
  const artifactSha256 = await sha256Hex(artifactBytes);
  if (artifactBytes.byteLength !== reference.byteLength
    || artifactSha256 !== reference.sha256
    || artifactResponse.headers.get("x-3dena-result-sha256") !== reference.sha256) {
    throw new Error("Persistent trajectory artifact bytes do not match the immutable result receipt.");
  }
  let artifactValue: unknown;
  try {
    artifactValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifactBytes));
  } catch {
    throw new Error("Persistent trajectory artifact is not canonical JSON.");
  }
  const artifact = remoteRecord(artifactValue, "artifact");
  remoteExact(artifact, ["version", "owner", "taskKind", "requestHash", "bundle"], "artifact");
  if (artifact.version !== REMOTE_ARTIFACT_VERSION || artifact.taskKind !== "longitudinal-analysis-v2") {
    throw new Error("Persistent trajectory artifact has an unsupported contract.");
  }
  const owner = remoteRecord(artifact.owner, "artifact.owner");
  remoteExact(owner, ["contractVersion", "datasetHash", "specHash", "runId", "taskId"], "artifact.owner");
  if (owner.contractVersion !== "3dena.compute-task-owner.v1"
    || owner.datasetHash !== request.pathTask.datasetHash
    || owner.specHash !== request.pathTask.specHash
    || owner.runId !== request.pathTask.runId
    || owner.taskId !== capability.jobId) {
    throw new Error("Persistent trajectory artifact owner does not match the submitted immutable task.");
  }
  const expectedRequestHash = await hashLongitudinalExecutionRequestV2(request);
  const bundle = artifact.bundle as LongitudinalAnalysisBundleV2;
  if (typeof artifact.requestHash !== "string"
    || artifact.requestHash !== expectedRequestHash
    || bundle?.identity?.requestHash !== expectedRequestHash) {
    throw new Error("Persistent trajectory artifact request hash does not match the submitted immutable task.");
  }
  return bundle;
}

async function runInBrowserWorker(
  request: LongitudinalExecutionRequestV2,
  options: ExecuteOpenEnaLongitudinalPreparedOptionsV3,
): Promise<LongitudinalAnalysisBundleV2> {
  const id = `open-ena-longitudinal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const worker = new Worker(new URL("./longitudinal-v3.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortHandler);
      worker.terminate();
      callback();
    };
    const abortHandler = () => {
      if (settled) return;
      worker.postMessage({ kind: "cancel", id });
      finish(() => reject(abortError("The longitudinal analysis was cancelled.")));
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("The longitudinal Worker reached its 60 second hard deadline.")));
    }, HARD_DEADLINE_MS);
    worker.onmessage = (event: MessageEvent<OpenEnaLongitudinalWorkerResponseV3>) => {
      if (settled) return;
      const message = event.data;
      if (!message || message.id !== id) return;
      if (message.kind === "progress") {
        try { options.onProgress?.({ progress: message.progress, stage: message.stage }); }
        catch (error) { finish(() => reject(error)); }
      }
      else if (message.kind === "result") finish(() => resolve(message.result));
      else if (message.kind === "cancelled") finish(() => reject(abortError("The longitudinal analysis was cancelled.")));
      else if (message.kind === "error") finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || "The longitudinal Worker failed.")));
    if (options.signal?.aborted) abortHandler();
    else {
      options.signal?.addEventListener("abort", abortHandler, { once: true });
      worker.postMessage({ kind: "run", id, request });
    }
  });
}

async function runRemote(
  request: LongitudinalExecutionRequestV2,
  decision: OpenEnaLongitudinalRouteDecisionV3,
  options: ExecuteOpenEnaLongitudinalPreparedOptionsV3,
): Promise<LongitudinalAnalysisBundleV2> {
  if (!options.remoteEndpoint) {
    throw new OpenEnaLongitudinalExecutionClientErrorV3(
      "REMOTE_SERVICE_UNAVAILABLE",
      "Persistent trajectory compute is not configured. Continue locally or disable inference explicitly.",
      decision,
      { canContinueLocally: true, canDisableInference: true, canRetryRemote: false },
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollInterval = options.remotePollIntervalMilliseconds ?? REMOTE_POLL_INTERVAL_MS;
  const cleanupDeadline = options.remoteCleanupDeadlineMilliseconds ?? REMOTE_CLEANUP_DEADLINE_MS;
  const remoteDeadline = options.remoteDeadlineMilliseconds ?? HARD_DEADLINE_MS;
  if (!Number.isSafeInteger(pollInterval) || pollInterval < 1 || pollInterval > 5_000
    || !Number.isSafeInteger(cleanupDeadline) || cleanupDeadline < 1 || cleanupDeadline > 60_000
    || !Number.isSafeInteger(remoteDeadline) || remoteDeadline < 1 || remoteDeadline > HARD_DEADLINE_MS) {
    throw new TypeError("Persistent trajectory polling configuration is invalid.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteDeadline);
  const abortHandler = () => controller.abort();
  options.signal?.addEventListener("abort", abortHandler, { once: true });
  let capability: RemoteCapabilityV3 | null = null;
  let phase: "submission" | "poll" | "result" = "submission";
  try {
    options.onProgress?.({ progress: 0.05, stage: "remote-submit" });
    const remoteRequest: LongitudinalExecutionRequestV2 = {
      ...request,
      execution: { ...request.execution, target: "persistent-compute-service" },
    };
    const attemptId = executionAttemptId();
    const response = await fetchImpl(options.remoteEndpoint, {
      redirect: "error",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: REMOTE_SUBMISSION_VERSION,
        executionAttemptId: attemptId,
        processingPolicyConfirmed: true,
        request: remoteRequest,
      }),
      signal: controller.signal,
    });
    capability = parseRemoteCapability(await jsonResponse(response, "Persistent trajectory submission"));
    phase = "poll";
    options.onProgress?.({ progress: 0.1, stage: "remote-wait" });
    while (true) {
      const statusResponse = await fetchImpl(capability.urls.statusUrl, {
        redirect: "error",
        method: "GET",
        headers: computeHeaders(capability),
        signal: controller.signal,
      });
      const status = parseRemoteStatus(
        await jsonResponse(statusResponse, "Persistent trajectory status"),
        capability,
      );
      options.onProgress?.({ progress: progressForRemoteState(status.state), stage: "remote-wait" });
      if (status.state === "SUCCEEDED") {
        phase = "result";
        if (!status.resultAvailable) throw new Error("Persistent trajectory succeeded without a published result.");
        const bundle = await fetchRemoteBundle(capability, remoteRequest, fetchImpl, controller.signal);
        await deleteRemoteJob(capability, fetchImpl, cleanupDeadline);
        if (controller.signal.aborted) throw abortError("Persistent trajectory deadline reached during durable deletion.");
        return bundle;
      }
      if (status.state === "FAILED" || status.state === "EXPIRED" || status.state === "CANCELLED") {
        const terminalCode = status.state === "FAILED"
          ? "REMOTE_TERMINAL_FAILED"
          : status.state === "EXPIRED"
            ? "REMOTE_TERMINAL_EXPIRED"
            : "REMOTE_TERMINAL_CANCELLED";
        throw recoverableRemoteError(
          terminalCode,
          `Persistent trajectory compute ended in ${status.state}${status.errorCode ? ` (${status.errorCode})` : ""}.`,
          decision,
        );
      }
      await waitRemote(pollInterval, controller.signal);
    }
  } catch (error) {
    if (capability) {
      try {
        await deleteRemoteJob(capability, fetchImpl, cleanupDeadline);
      } catch {
        // Preserve the primary compute/cancellation failure. Durable deletion
        // intent, if accepted, is completed by the service sweeper.
      }
    }
    if (options.signal?.aborted) throw abortError("The persistent trajectory task was cancelled.");
    // Cleanup may use the remaining execution budget. Preserve an HTTP policy
    // failure already received, including its original Retry-After deadline.
    if (error instanceof RemoteHttpErrorV3) throw remoteHttpClientError(error, decision, phase);
    if (controller.signal.aborted) {
      throw recoverableRemoteError(
        "REMOTE_DEADLINE_EXCEEDED",
        "Persistent trajectory compute reached its 60 second hard deadline.",
        decision,
      );
    }
    if (error instanceof OpenEnaLongitudinalExecutionClientErrorV3) throw error;
    const detail = caughtMessage(error);
    if (phase === "submission") {
      throw recoverableRemoteError(
        "REMOTE_SUBMISSION_FAILED",
        `Persistent trajectory submission failed. ${detail}`,
        decision,
      );
    }
    if (phase === "poll") {
      throw recoverableRemoteError(
        "REMOTE_POLL_FAILED",
        `Persistent trajectory status polling failed. ${detail}`,
        decision,
      );
    }
    throw recoverableRemoteError(
      "REMOTE_RESULT_FAILED",
      `Persistent trajectory result retrieval or verification failed. ${detail}`,
      decision,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortHandler);
  }
}

export async function executeOpenEnaLongitudinalPreparedV3(
  request: LongitudinalExecutionRequestV2,
  options: ExecuteOpenEnaLongitudinalPreparedOptionsV3 = {},
): Promise<OpenEnaLongitudinalExecutionReceiptV3> {
  if (request.bootstrapTask !== undefined) {
    throw new Error("Trajectory analysis does not execute CI or bootstrap tasks; remove bootstrapTask and rerun.");
  }
  if (options.signal?.aborted) throw abortError("The longitudinal analysis was cancelled before it started.");
  // One owned snapshot binds admission, hashing, execution and verification even
  // when the caller edits its request while one of those phases awaits.
  request = deepFreezeV3(structuredClone(request));
  const decision = estimateOpenEnaLongitudinalExecutionV3(request);
  const key = await cacheKey(request);
  if (options.signal?.aborted) throw abortError("The longitudinal analysis was cancelled before it started.");
  const cached = completedCache.get(key);
  if (cached) return { bundle: cached, cacheHit: true, decision };
  if (decision.requiresConfirmation && !options.forceLocal && !options.allowRemote) {
    throw new OpenEnaLongitudinalExecutionClientErrorV3(
      "REMOTE_CONFIRMATION_REQUIRED",
      `Predicted trajectory task size is ${decision.predictedMilliseconds} ms and ${decision.predictedMemoryBytes} bytes. Confirm persistent compute, continue locally, or disable inference.`,
      decision,
      { canContinueLocally: true, canDisableInference: true },
    );
  }
  let bundle: LongitudinalAnalysisBundleV2;
  if (decision.target === "persistent-compute-service" && !options.forceLocal) {
    bundle = await runRemote(request, decision, options);
  } else if (options.nodeExecutor) {
    bundle = await options.nodeExecutor(request);
  } else if (typeof Worker !== "undefined") {
    bundle = await runInBrowserWorker({
      ...request,
      execution: { ...request.execution, target: "browser-worker" },
    }, options);
  } else {
    bundle = await executeLongitudinalAnalysisV2({
      ...request,
      execution: { ...request.execution, target: "node-service" },
    });
  }
  if (options.signal?.aborted) throw abortError("The longitudinal analysis was cancelled.");
  try {
    // Neither executor aliases nor consumers may mutate a verified cache entry.
    // Capture before asynchronous verification; cache hits reuse this frozen copy.
    bundle = deepFreezeV3(structuredClone(bundle));
    await (options.resultVerifier ?? verifyLongitudinalAnalysisBundleV2)(bundle);
    await assertResultBinding(bundle, request);
  } catch (error) {
    if (decision.target === "persistent-compute-service" && !options.forceLocal) {
      throw recoverableRemoteError(
        "REMOTE_RESULT_FAILED",
        `Persistent trajectory result verification failed. ${caughtMessage(error)}`,
        decision,
      );
    }
    throw error;
  }
  if (options.signal?.aborted) throw abortError("The longitudinal analysis was cancelled.");
  options.onProgress?.({ progress: 1, stage: "complete" });
  if (options.signal?.aborted) throw abortError("The longitudinal analysis was cancelled.");
  completedCache.set(key, bundle);
  return { bundle, cacheHit: false, decision };
}

export function clearOpenEnaLongitudinalExecutionCacheV3(): void {
  completedCache.clear();
}
