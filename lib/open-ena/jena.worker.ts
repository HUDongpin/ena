import { createAccumulationStream, extractMakeSetOptions, makeSet } from "jena-js";
import type { ENAWorkerProgress } from "jena-js/browser";
import {
  attachStableGroupMetadata,
  buildOpenEnaAnalysisPlan,
  buildOpenEnaResult,
  canonicalizeOfficialMeanRotation,
  compactOpenEnaSet,
} from "./analyze";
import { validateConfig } from "./csv";
import { cloneOpenEnaConfig } from "./network-config";
import { buildOpenEnaOrderedAudit } from "./ordered-audit";
import type {
  OpenEnaConfig,
  OpenEnaResult,
  OpenEnaRotationReference,
  ParsedDataset,
} from "./types";

export type OpenEnaWorkerRequest =
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
      const validationErrors = validateConfig(run.dataset, run.config);
      if (validationErrors.length > 0) throw new Error(validationErrors.join(" "));
      const plan = buildOpenEnaAnalysisPlan(run.dataset, run.config, run.reference);
      const { options, configuration, executionProvenance } = plan;
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
      post({ kind: "progress", id: run.id, progress: 1, stage: "model" });
      post({
        kind: "result",
        id: run.id,
        result: orderedAudit ? { ...result, orderedAudit } : result,
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
      try {
        queue.push(snapshotRunRequest(message));
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
