import { createAccumulationStream, extractMakeSetOptions, makeSet } from "jena-js";
import type { ENAWorkerProgress } from "jena-js/browser";
import {
  attachStableGroupMetadata,
  buildOpenEnaAnalysisPlan,
  buildOpenEnaResult,
  canonicalizeOfficialMeanRotation,
  compactOpenEnaSet,
  completeStandardPlanFromAccumulationV3,
  verifyStandardScientificReadinessV3,
} from "./analyze";
import { validateExecutionPlanV3, isOnaExecutionPlanV3, type OnaExecutionPlanV3, type OpenEnaExecutionPlanV3 } from "./model-v3/execution-plan";
import { completeOnaPlanFromAccumulationV3, toOnaJenaOptionsV3, verifyOnaScientificReadinessV3 } from "./model-v3/ona-adapter";
import { bindOnaResultV3 } from "./model-v3/ona-result-binding";
import { bindResultV3 } from "./model-v3/result-binding";
import { toStandardJenaOptionsV3 } from "./model-v3/standard-adapter";
import { snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";
import { MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_PEAK_BYTES_V3 } from "./model-v3/resource-budget";
import { assertReferenceAdmissionV3 } from "./model-v3/reference-codec-v2";
import type { BoundResultV3, OpenEnaWorkerStageV3, RuntimeResourceObservationV3, OnaRuntimeResourceObservationV3 } from "./model-v3/types";
import { validateConfig } from "./csv";
import { cloneOpenEnaConfig } from "./network-config";
import { buildOpenEnaOrderedAudit } from "./ordered-audit";
import { buildOpenEnaOrderedResponseNodeSummary } from "./ordered-node-summary";
import type {
  OpenEnaConfig,
  OpenEnaResult,
  OpenEnaRotationReference,
  ParsedDataset,
} from "./types";

export type OpenEnaWorkerRequest =
  | { kind: "run-open-ena-plan-v3"; id: string; plan: OpenEnaExecutionPlanV3; chunkSize: number }
  | {
      kind: "run";
      id: string;
      dataset: ParsedDataset;
      config: OpenEnaConfig;
      reference: OpenEnaRotationReference | null;
      chunkSize: number;
    }
  | { kind: "cancel"; id: string };

export type OpenEnaWorkerResponse =
  | { kind: "progress-v3"; id: string; executionPlanSha256: string; progress: number; stage: OpenEnaWorkerStageV3 }
  | { kind: "result-v3"; id: string; executionPlanSha256: string; result: BoundResultV3 }
  | { kind: "progress"; id: string; progress: number; stage: ENAWorkerProgress["stage"] }
  | { kind: "result"; id: string; result: OpenEnaResult }
  | { kind: "cancelled"; id: string }
  | { kind: "error"; id: string; message: string };

export interface OpenEnaWorkerMessageEvent<T> {
  data: T;
}

export interface OpenEnaWorkerScope {
  addEventListener(
    type: "message",
    listener: (event: OpenEnaWorkerMessageEvent<OpenEnaWorkerRequest>) => void,
  ): void;
  postMessage(message: OpenEnaWorkerResponse): void;
}

export interface OpenEnaWorkerDependencies {
  createAccumulationStream?: typeof createAccumulationStream;
}

interface WorkerRun {
  id: string;
  dataset: ParsedDataset;
  config: OpenEnaConfig;
  reference: OpenEnaRotationReference | null;
  chunkSize: number;
  cancelled: boolean;
}

interface WorkerRunV3 {
  id: string;
  chunkSize: number;
  cancelled: boolean;
  planOutcome: Promise<{ plan: OpenEnaExecutionPlanV3 } | { error: unknown }>;
}

const DEFAULT_CHUNK_SIZE = 2_000;

function yieldToMessageQueue() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function exactRunRequestKeys(message: object) {
  const expected = ["chunkSize", "config", "dataset", "id", "kind", "reference"];
  const actual = Object.keys(message).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function snapshotRunRequest(message: Extract<OpenEnaWorkerRequest, { kind: "run" }>): WorkerRun {
  if (!exactRunRequestKeys(message)
    || !message.dataset
    || typeof message.dataset !== "object"
    || !message.config
    || typeof message.config !== "object"
    || (message.reference !== null && typeof message.reference !== "object")) {
    throw new Error("Open ENA worker run requests must contain only one dataset/config source of truth.");
  }
  return {
    id: message.id,
    dataset: {
      ...message.dataset,
      headers: [...message.dataset.headers],
      rows: message.dataset.rows.map((row) => ({ ...row })),
    },
    config: cloneOpenEnaConfig(message.config),
    reference: message.reference ? structuredClone(message.reference) : null,
    chunkSize: Number.isInteger(message.chunkSize) && message.chunkSize > 0
      ? message.chunkSize
      : DEFAULT_CHUNK_SIZE,
    cancelled: false,
  };
}

/**
 * Host the exact production worker protocol on a structural message scope so
 * lifecycle, cancellation, and disposal behavior can be tested in-process.
 */
export function createOpenEnaWorkerHost(
  scope: OpenEnaWorkerScope,
  dependencies: OpenEnaWorkerDependencies = {},
) {
  const createStream = dependencies.createAccumulationStream ?? createAccumulationStream;
  const queue: (WorkerRun | WorkerRunV3)[] = [];
  let active: WorkerRun | WorkerRunV3 | null = null;
  let pumping = false;

  const post = (message: OpenEnaWorkerResponse) => scope.postMessage(message);

  const executeOnaV3 = async (run: WorkerRunV3, plan: OnaExecutionPlanV3) => {
    let stream: ReturnType<typeof createAccumulationStream> | undefined;
    const cancelled = () => { if (run.cancelled) throw new DOMException("The ONA v3 run was cancelled.", "AbortError"); };
    const progress = (stage: OpenEnaWorkerStageV3, value: number) => { cancelled(); post({ kind: "progress-v3", id: run.id, executionPlanSha256: plan.header.executionPlanSha256, stage, progress: value }); };
    const admission = plan.operationalAdmission, estimate = plan.header.resourceEstimate;
    const sourceCells = 3 * plan.rows.length * plan.codeDictionary.codes.length;
    const guard = (cells: number, scratch: number, limit: number) => {
      cancelled();
      if (![cells, scratch].every((value) => Number.isSafeInteger(value) && value >= 0) || sourceCells + cells + scratch > Math.min(limit, admission.totalNumericCells)) throw new TypeError(`ONA runtime phase exceeds its admitted resource upper bound (${sourceCells}+${cells}+${scratch}>${Math.min(limit, admission.totalNumericCells)} numeric slots).`);
    };
    try {
      cancelled(); verifyOnaScientificReadinessV3(plan); cancelled();
      progress("materialize", 0.05);
      const options = toOnaJenaOptionsV3(plan), { rows, ...streamOptions } = options;
      let maximumRetainedRowsAfterChunk = 0;
      stream = createStream({ ...streamOptions, expectedRows: rows.length, materialization: "full", onResources(state) {
        // Partial native Code/network counters are an additional guard only;
        // they do not measure ordered expansions or the true retained peak.
        guard(state.numericCells, state.temporaryNumericCellsBound, admission.stages.accumulationCells);
      } });
      if (typeof stream.finishAsync !== "function") throw new TypeError("ONA v3 requires cancellable asynchronous stream completion.");
      progress("accumulate", 0.1);
      for (let index = 0; index < rows.length; index += run.chunkSize) {
        cancelled(); const state = stream.push(rows.slice(index, index + run.chunkSize));
        if (!Number.isSafeInteger(state.activeBufferedRows) || state.activeBufferedRows < 0 || state.activeBufferedRows > estimate.estimatedRetainedWindowRows || state.rowsSeen !== Math.min(index + run.chunkSize, rows.length)) throw new TypeError("ONA exact chunk-boundary stream state exceeds its resource contract.");
        maximumRetainedRowsAfterChunk = Math.max(maximumRetainedRowsAfterChunk, state.activeBufferedRows);
        progress("accumulate", 0.1 + 0.55 * state.rowsSeen / rows.length);
        await yieldToMessageQueue();
      }
      const data = await stream.finishAsync({ chunkSize: run.chunkSize, yieldControl: async () => { await yieldToMessageQueue(); cancelled(); } });
      const stages = { normalize: 0.7, center: 0.75, "rotate-or-project": 0.8, "position-nodes": 0.85 };
      const runtime = completeOnaPlanFromAccumulationV3(plan, data, rows, { onStage(stage) { progress(stage, stages[stage]); }, onResources(state) { guard(state.numericCells, state.temporaryNumericCellsBound, admission.stages.modelCells); } });
      // Native finish has disposed histories/expansions. Release only our raw
      // and row-edge materialization after audit extraction, preserving evidence.
      runtime.set.rawRows = []; runtime.set.rowConnectionCounts = []; runtime.set.rowWindowProvenance = []; runtime.set.metaData = [];
      data.rawRows = []; data.rowConnectionCounts = []; data.rowWindowProvenance = []; data.metaData = [];
      rows.length = 0;
      await yieldToMessageQueue(); cancelled();
      progress("validate-result", 0.9);
      const observed: OnaRuntimeResourceObservationV3 = { processedRows: stream.state.rowsSeen, maximumRetainedRowsAfterChunk,
        bufferedRowsPeakUpperBound: Math.min(plan.rows.length, estimate.estimatedRetainedWindowRows + 1), numericCellsUpperBound: admission.totalNumericCells,
        peakBytesUpperBound: admission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" };
      const result = await bindOnaResultV3(plan, runtime, observed);
      cancelled(); progress("complete", 1); cancelled();
      post({ kind: "result-v3", id: run.id, executionPlanSha256: plan.header.executionPlanSha256, result });
    } finally { stream?.dispose(); }
  };

  const executeV3 = async (run: WorkerRunV3) => {
    let stream: ReturnType<typeof createAccumulationStream> | undefined;
    const cancelled = () => {
      if (run.cancelled) throw new DOMException("The v3 run was cancelled.", "AbortError");
    };
    try {
      cancelled();
      const outcome = await run.planOutcome;
      cancelled();
      if ("error" in outcome) throw outcome.error;
      const plan = outcome.plan;
      if (isOnaExecutionPlanV3(plan)) { await executeOnaV3(run, plan); return; }
      const progress = (stage: OpenEnaWorkerStageV3, value: number) => {
        cancelled();
        post({ kind: "progress-v3", id: run.id, executionPlanSha256: plan.header.executionPlanSha256, stage, progress: value });
      };
      const compiled = await verifyStandardScientificReadinessV3(plan);
      cancelled();
      const estimate = plan.header.resourceEstimate;
      const admission = plan.reference?.admission;
      if (estimate.blocked) throw new TypeError("Plan exceeds the pre-allocation resource budget.");
      if (admission) assertReferenceAdmissionV3(admission, estimate);
      const numericLimit = Math.min(MAX_ESTIMATED_NUMERIC_CELLS_V3, estimate.estimatedNumericCells + (admission?.incrementalNumericCells ?? 0));
      const byteLimit = Math.min(MAX_ESTIMATED_PEAK_BYTES_V3, estimate.estimatedPeakBytes + (admission?.incrementalPeakBytes ?? 0));
      // Count actual captured/remapped Reference numeric slots. The admission
      // ledger still separately bounds simultaneous capture/hash representations.
      const geometry = plan.reference?.artifact.geometry;
      const rotation = plan.reference?.rotationSet;
      const referenceCells = geometry && rotation ? geometry.rotationMatrix.reduce((sum, row) => sum + row.length, 0)
        + geometry.centerVector.length + geometry.eigenvalues.length + geometry.nodes.reduce((sum, node) => sum + node.coordinates.length, 0)
        + plan.reference!.artifact.fit.variance.length + rotation.rotationMatrix.reduce((sum, row) => sum + row.length, 0)
        + rotation.centerVector.length + rotation.eigenvalues.length + (rotation.nodes ?? []).reduce((sum, row) => sum + Object.values(row).filter((value) => typeof value === "number").length, 0) : 0;
      // Source proof and typed execution rows retain two Code-value copies.
      let materializedCells = plan.rows.reduce((sum, row) => sum + Object.values(row.codeValues).length, 0)
        + plan.sourceProof.rows.reduce((sum, row) => sum + plan.codeDictionary.codes.filter((code) => typeof row.values[code.sourceColumn] === "number").length, 0) + referenceCells;
      let maximumBufferedRows = 0;
      let numericPeak = 0;
      let bytePeak = 0;
      const observe = (numericCells: number, scratch: number, bufferPeak = 0) => {
        cancelled();
        for (const value of [numericCells, scratch, bufferPeak]) if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Runtime resource counter is invalid.");
        const current = materializedCells + numericCells;
        const allocationBound = current + scratch;
        const bytes = 8 * (current - referenceCells + scratch) + estimate.estimatedWorkerMaterializationBytes + estimate.estimatedStructuralBytes + (admission?.incrementalPeakBytes ?? 0);
        if (allocationBound > numericLimit || allocationBound - referenceCells > estimate.estimatedNumericCells || bytes > byteLimit || bufferPeak > Math.min(plan.rows.length, estimate.estimatedRetainedWindowRows + 1)) throw new TypeError("Runtime allocation exceeds the declared resource estimate or hard limit.");
        numericPeak = Math.max(numericPeak, current);
        bytePeak = Math.max(bytePeak, bytes);
        maximumBufferedRows = Math.max(maximumBufferedRows, bufferPeak);
      };
      observe(0, plan.rows.length * plan.codeDictionary.codes.length);
      progress("materialize", 0.05);
      const options = toStandardJenaOptionsV3(plan);
      const { rows, ...streamOptions } = options;
      materializedCells += rows.length * plan.codeDictionary.codes.length;
      stream = createStream({ ...streamOptions, expectedRows: rows.length, materialization: "model", onResources(state) {
        observe(state.numericCells, state.temporaryNumericCellsBound, state.bufferedRowsPeak);
      } });
      if (typeof stream.finishAsync !== "function") throw new TypeError("v3 requires cancellable asynchronous stream completion.");
      progress("accumulate", 0.1);
      for (let index = 0; index < rows.length; index += run.chunkSize) {
        cancelled();
        stream.push(rows.slice(index, index + run.chunkSize));
        progress("accumulate", 0.1 + 0.55 * Math.min(rows.length, index + run.chunkSize) / rows.length);
        await yieldToMessageQueue();
      }
      const data = await stream.finishAsync({ chunkSize: run.chunkSize, yieldControl: async () => { await yieldToMessageQueue(); cancelled(); } });
      const stages = { normalize: 0.7, center: 0.75, "rotate-or-project": 0.8, "position-nodes": 0.85 };
      const runtime = completeStandardPlanFromAccumulationV3(plan, data, {
        onStage(stage) { progress(stage, stages[stage]); },
        onResources(state) { observe(state.numericCells, state.temporaryNumericCellsBound); },
      });
      // Numerical output no longer needs the temporary mapped input. Release it
      // before binder capture so every retained scientific container is visible
      // to the binder, rather than supplying a guessed/caller-owned byte offset.
      materializedCells -= rows.length * plan.codeDictionary.codes.length;
      rows.length = 0;
      await yieldToMessageQueue(); cancelled();
      progress("validate-result", 0.9);
      const observed: RuntimeResourceObservationV3 = {
        processedRows: stream.state.rowsSeen, maximumBufferedRows, numericCellsAllocated: numericPeak,
        peakBytesObservedOrBounded: bytePeak, observationMethod: "exact-counters-and-conservative-byte-bound",
      };
      const result = await bindResultV3(plan, runtime, observed, compiled.diagnostics);
      cancelled();
      progress("complete", 1);
      cancelled();
      post({ kind: "result-v3", id: run.id, executionPlanSha256: plan.header.executionPlanSha256, result });
    } catch (error) {
      if (run.cancelled || (error instanceof DOMException && error.name === "AbortError")) post({ kind: "cancelled", id: run.id });
      else post({ kind: "error", id: run.id, message: error instanceof Error ? error.message : String(error) });
    } finally { stream?.dispose(); }
  };

  const executeRun = async (run: WorkerRun) => {
    let stream: ReturnType<typeof createAccumulationStream> | undefined;
    try {
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      const validationErrors = validateConfig(run.dataset, run.config);
      if (validationErrors.length > 0) throw new Error(validationErrors.join(" "));
      const plan = buildOpenEnaAnalysisPlan(run.dataset, run.config, run.reference);
      const { options, configuration, executionProvenance } = plan;
      const { rows, ...streamOptions } = options;
      const orderedResponseNodeSummary = buildOpenEnaOrderedResponseNodeSummary(rows, configuration);
      stream = createStream({
        ...streamOptions,
        expectedRows: rows.length,
        materialization: configuration.analysisKind === "ona" ? "full" : "model",
      });
      post({ kind: "progress", id: run.id, progress: 0, stage: "accumulate" });
      for (let index = 0; index < rows.length; index += run.chunkSize) {
        if (run.cancelled) {
          post({ kind: "cancelled", id: run.id });
          return;
        }
        stream.push(rows.slice(index, index + run.chunkSize));
        const covered = Math.min(1, (index + run.chunkSize) / rows.length);
        post({ kind: "progress", id: run.id, progress: 0.88 * covered, stage: "accumulate" });
        await yieldToMessageQueue();
      }
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      const data = stream.finish();
      post({ kind: "progress", id: run.id, progress: 0.9, stage: "model" });
      const generatedSet = makeSet(data, extractMakeSetOptions(options));
      const fittedSet = configuration.rotation === "mean"
        ? canonicalizeOfficialMeanRotation(generatedSet)
        : generatedSet;
      const fullSet = attachStableGroupMetadata(fittedSet, rows, configuration);
      const orderedAudit = buildOpenEnaOrderedAudit(fullSet);
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      const result: OpenEnaResult = buildOpenEnaResult(
        compactOpenEnaSet(fullSet),
        configuration,
        run.reference,
        executionProvenance,
      );
      const resultWithOrderedAudit = orderedAudit ? { ...result, orderedAudit } : result;
      post({ kind: "progress", id: run.id, progress: 1, stage: "model" });
      post({
        kind: "result",
        id: run.id,
        result: orderedResponseNodeSummary
          ? { ...resultWithOrderedAudit, orderedResponseNodeSummary }
          : resultWithOrderedAudit,
      });
    } catch (error) {
      post({
        kind: "error",
        id: run.id,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      stream?.dispose();
    }
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      let next = queue.shift();
      while (next) {
        active = next;
        if ("planOutcome" in next) await executeV3(next);
        else await executeRun(next);
        active = null;
        next = queue.shift();
      }
    } finally {
      active = null;
      pumping = false;
    }
  };

  scope.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message.id !== "string" || message.id.length === 0) return;
    if (message.kind === "cancel") {
      if (active?.id === message.id) {
        active.cancelled = true;
        return;
      }
      const queuedIndex = queue.findIndex((run) => run.id === message.id);
      if (queuedIndex >= 0) {
        queue.splice(queuedIndex, 1);
        post({ kind: "cancelled", id: message.id });
      }
      return;
    }
    if (message.kind === "run" || message.kind === "run-open-ena-plan-v3") {
      if (active?.id === message.id || queue.some((run) => run.id === message.id)) {
        post({
          kind: "error",
          id: message.id,
          message: `Open ENA worker request id "${message.id}" is already active or queued.`,
        });
        return;
      }
      try {
        if (message.kind === "run-open-ena-plan-v3") {
          const captured = snapshotPlainJsonRecordV3(message, "v3 worker request");
          const keys = Object.keys(captured).sort();
          if (keys.join(",") !== "chunkSize,id,kind,plan" || !Number.isSafeInteger(captured.chunkSize) || Number(captured.chunkSize) < 1) throw new TypeError("v3 requests accept only id, plan and operational chunkSize.");
          post({ kind: "progress-v3", id: message.id, stage: "verify-plan", progress: 0, executionPlanSha256: "" });
          // Validation owns descriptor-safe admission/capture before its first await.
          const planOutcome = validateExecutionPlanV3(captured.plan).then((plan) => ({ plan }), (error: unknown) => ({ error }));
          queue.push({ id: message.id, chunkSize: Math.min(Number(captured.chunkSize), DEFAULT_CHUNK_SIZE), cancelled: false, planOutcome });
        } else queue.push(snapshotRunRequest(message));
      } catch (error) {
        post({
          kind: "error",
          id: message.id,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      void pump();
    }
  });
}

declare const self: OpenEnaWorkerScope | undefined;

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  createOpenEnaWorkerHost(self);
}
