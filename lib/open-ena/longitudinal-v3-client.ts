"use client";

import {
  executeLongitudinalAnalysisV2,
  hashAnalysisValueV1,
  verifyLongitudinalAnalysisBundleV2,
  type LongitudinalAnalysisBundleV2,
  type LongitudinalExecutionRequestV2,
} from "j-3dena";

import type {
  OpenEnaLongitudinalWorkerResponseV3,
  OpenEnaLongitudinalWorkerStageV3,
} from "./longitudinal-v3.worker";

const LOCAL_TIME_BUDGET_MS = 8_000;
const LOCAL_MEMORY_BUDGET_BYTES = 128 * 1024 * 1024;
const HARD_DEADLINE_MS = 60_000;
const completedCache = new Map<string, LongitudinalAnalysisBundleV2>();

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
  nodeExecutor?: (request: LongitudinalExecutionRequestV2) => Promise<LongitudinalAnalysisBundleV2>;
  resultVerifier?: (bundle: unknown) => Promise<void>;
}

export interface OpenEnaLongitudinalExecutionReceiptV3 {
  bundle: LongitudinalAnalysisBundleV2;
  cacheHit: boolean;
  decision: OpenEnaLongitudinalRouteDecisionV3;
}

export class OpenEnaLongitudinalExecutionClientErrorV3 extends Error {
  readonly code: string;
  readonly decision: OpenEnaLongitudinalRouteDecisionV3;
  readonly canContinueLocally: boolean;
  readonly canDisableInferenceOrUncertainty: boolean;

  constructor(
    code: string,
    message: string,
    decision: OpenEnaLongitudinalRouteDecisionV3,
    options: { canContinueLocally: boolean; canDisableInferenceOrUncertainty: boolean },
  ) {
    super(message);
    this.name = "OpenEnaLongitudinalExecutionClientErrorV3";
    this.code = code;
    this.decision = decision;
    this.canContinueLocally = options.canContinueLocally;
    this.canDisableInferenceOrUncertainty = options.canDisableInferenceOrUncertainty;
  }
}

function requestShape(request: LongitudinalExecutionRequestV2) {
  const result = request.dataset.sourceResult?.result as {
    points?: unknown[];
    dimensions?: unknown[];
    edges?: unknown[];
  } | undefined;
  const points = result?.points?.length ?? request.dataset.receipt.rows;
  const dimensions = result?.dimensions?.length ?? 3;
  const edges = result?.edges?.length ?? 1;
  const periods = request.pathTask.runSpec.orderedPeriods.length;
  const bootstrap = request.bootstrapTask?.repetitions ?? 0;
  const permutations = request.inferenceTask?.requests.reduce((sum, item) => (
    item.kind === "path-comparison" ? sum + item.repetitions : sum
  ), 0) ?? 0;
  return { points, dimensions, edges, periods, bootstrap, permutations };
}

export function estimateOpenEnaLongitudinalExecutionV3(
  request: LongitudinalExecutionRequestV2,
): OpenEnaLongitudinalRouteDecisionV3 {
  const shape = requestShape(request);
  const baseOperations = shape.points * Math.max(3, shape.dimensions) * 28;
  const resamplingOperations = (shape.bootstrap + shape.permutations)
    * shape.points
    * Math.max(2, shape.periods)
    * Math.max(3, Math.min(shape.dimensions, 12))
    * 0.42;
  const predictedMilliseconds = Math.ceil(35 + (baseOperations + resamplingOperations) / 22_000);
  const predictedMemoryBytes = Math.ceil(
    8 * shape.points * (shape.dimensions + shape.edges + 24) * 3
    + 8 * (shape.bootstrap + shape.permutations) * Math.max(2, shape.periods) * Math.max(3, shape.dimensions),
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
  const { target: _target, ...scientificExecution } = request.execution;
  return hashAnalysisValueV1({
    dataset: request.dataset,
    pathTask: request.pathTask,
    inferenceTask: request.inferenceTask ?? null,
    bootstrapTask: request.bootstrapTask ?? null,
    networkOverlayTask: request.networkOverlayTask ?? null,
    execution: scientificExecution,
  });
}

function assertResultBinding(
  bundle: LongitudinalAnalysisBundleV2,
  request: LongitudinalExecutionRequestV2,
): void {
  if (
    bundle.identity.datasetHash !== request.pathTask.datasetHash
    || bundle.identity.specHash !== request.pathTask.specHash
    || bundle.identity.sourceResultHash !== request.pathTask.runSpec.sourceResultHash
    || bundle.identity.runId !== request.pathTask.runId
  ) throw new Error("Longitudinal execution returned an envelope with a mismatched immutable binding.");
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
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
      worker.postMessage({ kind: "cancel", id });
      finish(() => reject(abortError("The longitudinal analysis was cancelled.")));
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("The longitudinal Worker reached its 60 second hard deadline.")));
    }, HARD_DEADLINE_MS);
    worker.onmessage = (event: MessageEvent<OpenEnaLongitudinalWorkerResponseV3>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.kind === "progress") options.onProgress?.({ progress: message.progress, stage: message.stage });
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
      "Persistent trajectory compute is not configured. Continue locally or disable inference/uncertainty explicitly.",
      decision,
      { canContinueLocally: true, canDisableInferenceOrUncertainty: true },
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HARD_DEADLINE_MS);
  const abortHandler = () => controller.abort();
  options.signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    options.onProgress?.({ progress: 0.05, stage: "remote-submit" });
    const remoteRequest: LongitudinalExecutionRequestV2 = {
      ...structuredClone(request),
      execution: { ...request.execution, target: "persistent-compute-service" },
    };
    const response = await fetchImpl(options.remoteEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 2, request: remoteRequest }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Persistent trajectory compute returned HTTP ${response.status}.`);
    options.onProgress?.({ progress: 0.55, stage: "remote-wait" });
    return await response.json() as LongitudinalAnalysisBundleV2;
  } catch (error) {
    if (controller.signal.aborted) {
      if (options.signal?.aborted) throw abortError("The persistent trajectory task was cancelled.");
      throw new Error("Persistent trajectory compute reached its 60 second hard deadline.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortHandler);
  }
}

export async function executeOpenEnaLongitudinalPreparedV3(
  request: LongitudinalExecutionRequestV2,
  options: ExecuteOpenEnaLongitudinalPreparedOptionsV3 = {},
): Promise<OpenEnaLongitudinalExecutionReceiptV3> {
  const decision = estimateOpenEnaLongitudinalExecutionV3(request);
  const key = await cacheKey(request);
  const cached = completedCache.get(key);
  if (cached) return { bundle: cached, cacheHit: true, decision };
  if (options.signal?.aborted) throw abortError("The longitudinal analysis was cancelled before it started.");
  if (decision.requiresConfirmation && !options.forceLocal && !options.allowRemote) {
    throw new OpenEnaLongitudinalExecutionClientErrorV3(
      "REMOTE_CONFIRMATION_REQUIRED",
      `Predicted trajectory task size is ${decision.predictedMilliseconds} ms and ${decision.predictedMemoryBytes} bytes. Confirm persistent compute, continue locally, or disable inference/uncertainty.`,
      decision,
      { canContinueLocally: true, canDisableInferenceOrUncertainty: true },
    );
  }
  let bundle: LongitudinalAnalysisBundleV2;
  if (decision.target === "persistent-compute-service" && !options.forceLocal) {
    bundle = await runRemote(request, decision, options);
  } else if (options.nodeExecutor) {
    bundle = await options.nodeExecutor(request);
  } else if (typeof Worker !== "undefined") {
    bundle = await runInBrowserWorker({
      ...structuredClone(request),
      execution: { ...request.execution, target: "browser-worker" },
    }, options);
  } else {
    bundle = await executeLongitudinalAnalysisV2({
      ...structuredClone(request),
      execution: { ...request.execution, target: "node-service" },
    });
  }
  await (options.resultVerifier ?? verifyLongitudinalAnalysisBundleV2)(bundle);
  assertResultBinding(bundle, request);
  options.onProgress?.({ progress: 1, stage: "complete" });
  completedCache.set(key, bundle);
  return { bundle, cacheHit: false, decision };
}

export function clearOpenEnaLongitudinalExecutionCacheV3(): void {
  completedCache.clear();
}
