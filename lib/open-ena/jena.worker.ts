import { createAccumulationStream, extractMakeSetOptions, makeSet } from "jena-js";
import type { ENAWorkerProgress } from "jena-js/browser";
import {
  attachStableGroupMetadata,
  buildOpenEnaResult,
  canonicalizeOfficialMeanRotation,
  compactOpenEnaSet,
} from "./analyze";
import { canonicalizeOpenEnaConfig, sameOpenEnaConfig } from "./network-config";
import type {
  OpenEnaAnalysisPlan,
  OpenEnaResult,
  OpenEnaRotationReference,
} from "./types";

export type OpenEnaWorkerRequest =
  | {
      kind: "run";
      id: string;
      plan: OpenEnaAnalysisPlan;
      reference: OpenEnaRotationReference | null;
      chunkSize: number;
    }
  | { kind: "cancel"; id: string };

export type OpenEnaWorkerResponse =
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
  plan: OpenEnaAnalysisPlan;
  reference: OpenEnaRotationReference | null;
  chunkSize: number;
  cancelled: boolean;
}

const DEFAULT_CHUNK_SIZE = 2_000;

function yieldToMessageQueue() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertWorkerPlan(plan: OpenEnaAnalysisPlan) {
  if (!plan || typeof plan !== "object" || !plan.configuration || !plan.options || !plan.executionProvenance) {
    throw new Error("Open ENA worker received an incomplete analysis plan.");
  }
  const configuration = canonicalizeOpenEnaConfig(plan.configuration);
  if (!sameOpenEnaConfig(configuration, plan.configuration)) {
    throw new Error("Open ENA worker analysis-plan configuration is not canonical.");
  }
  const options = plan.options;
  const provenance = plan.executionProvenance;
  if (!Array.isArray(options.rows) || options.rows.length === 0) {
    throw new Error("Open ENA worker analysis plan contains no coded-data rows.");
  }
  if (!sameStringArray(options.units, configuration.unitColumns)
    || !sameStringArray(options.conversation, configuration.conversationColumns)
    || !sameStringArray(options.codes, configuration.codes)
    || options.model !== configuration.model
    || options.window !== configuration.window
    || options.weightBy !== configuration.weightBy) {
    throw new Error("Open ENA worker options do not match their canonical configuration.");
  }
  if (provenance.analysisKind !== configuration.analysisKind) {
    throw new Error("Open ENA worker execution provenance does not match its configuration.");
  }
  if (configuration.analysisKind === "ena") {
    if (Object.hasOwn(options, "networkType")
      || Object.hasOwn(options, "mask")
      || Object.hasOwn(options, "nodePositionMethod")
      || provenance.networkType !== "standard"
      || provenance.nodePositionMethod !== "undirected"
      || provenance.ordering !== null
      || provenance.directionalMask !== null) {
      throw new Error("Standard ENA worker plans cannot carry ordered-network runtime options.");
    }
    return;
  }
  const directionalMask = configuration.directionalMask;
  if (options.networkType !== "ordered"
    || options.nodePositionMethod !== "directed"
    || provenance.networkType !== "ordered"
    || provenance.nodePositionMethod !== "directed"
    || !provenance.ordering
    || !directionalMask
    || !Array.isArray(options.mask)
    || options.mask.length !== directionalMask.enabled.length
    || directionalMask.enabled.some((row, source) => row.some((enabled, target) => (
      options.mask?.[source]?.[target] !== (enabled ? 1 : 0)
    )))) {
    throw new Error("ONA worker plans require one consistent ordered, directed, label-bound runtime contract.");
  }
  if (provenance.ordering.responseRowSourceIndices.length !== options.rows.length
    || new Set(provenance.ordering.responseRowSourceIndices).size !== options.rows.length
    || provenance.ordering.responseRowSourceIndices.some((index) => (
      !Number.isSafeInteger(index) || index < 0 || index >= options.rows.length
    ))) {
    throw new Error("ONA worker source-index provenance must be a complete permutation of the response rows.");
  }
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
  const queue: WorkerRun[] = [];
  let active: WorkerRun | null = null;
  let pumping = false;

  const post = (message: OpenEnaWorkerResponse) => scope.postMessage(message);

  const executeRun = async (run: WorkerRun) => {
    let stream: ReturnType<typeof createAccumulationStream> | undefined;
    try {
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      assertWorkerPlan(run.plan);
      const { options, configuration, executionProvenance } = run.plan;
      const { rows, ...streamOptions } = options;
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
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      const result = buildOpenEnaResult(
        compactOpenEnaSet(fullSet),
        configuration,
        run.reference,
        executionProvenance,
      );
      post({ kind: "progress", id: run.id, progress: 1, stage: "model" });
      post({ kind: "result", id: run.id, result });
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
        await executeRun(next);
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
    if (message.kind === "run") {
      if (active?.id === message.id || queue.some((run) => run.id === message.id)) {
        post({
          kind: "error",
          id: message.id,
          message: `Open ENA worker request id "${message.id}" is already active or queued.`,
        });
        return;
      }
      queue.push({
        id: message.id,
        plan: message.plan,
        reference: message.reference,
        chunkSize: Number.isInteger(message.chunkSize) && message.chunkSize > 0
          ? message.chunkSize
          : DEFAULT_CHUNK_SIZE,
        cancelled: false,
      });
      void pump();
    }
  });
}

declare const self: OpenEnaWorkerScope | undefined;

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  createOpenEnaWorkerHost(self);
}
