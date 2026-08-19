import { createAccumulationStream, extractMakeSetOptions, makeSet } from "jena-js";
import type { ENAWorkerOptions, ENAWorkerProgress } from "jena-js/browser";
import { attachStableGroupMetadata, buildOpenEnaSummary, compactOpenEnaSet } from "./analyze";
import type { OpenEnaConfig, OpenEnaResult, OpenEnaRotationReference } from "./types";

export type OpenEnaWorkerRequest =
  | { kind: "run"; id: string; options: ENAWorkerOptions; config: OpenEnaConfig; reference: OpenEnaRotationReference | null; chunkSize: number }
  | { kind: "cancel"; id: string };

export type OpenEnaWorkerResponse =
  | { kind: "progress"; id: string; progress: number; stage: ENAWorkerProgress["stage"] }
  | { kind: "result"; id: string; result: OpenEnaResult }
  | { kind: "cancelled"; id: string }
  | { kind: "error"; id: string; message: string };

interface WorkerRun {
  id: string;
  options: ENAWorkerOptions;
  config: OpenEnaConfig;
  reference: OpenEnaRotationReference | null;
  chunkSize: number;
  cancelled: boolean;
}

const scope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<OpenEnaWorkerRequest>) => void): void;
  postMessage(message: OpenEnaWorkerResponse): void;
};
const queue: WorkerRun[] = [];
let active: WorkerRun | null = null;
let pumping = false;

function yieldToMessageQueue() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function executeRun(run: WorkerRun) {
  try {
    if (run.cancelled) {
      scope.postMessage({ kind: "cancelled", id: run.id });
      return;
    }
    const { rows, ...streamOptions } = run.options;
    const stream = createAccumulationStream({
      ...streamOptions,
      expectedRows: rows.length,
      materialization: "model",
    });
    scope.postMessage({ kind: "progress", id: run.id, progress: 0, stage: "accumulate" });
    for (let index = 0; index < rows.length; index += run.chunkSize) {
      if (run.cancelled) {
        scope.postMessage({ kind: "cancelled", id: run.id });
        return;
      }
      stream.push(rows.slice(index, index + run.chunkSize));
      const covered = Math.min(1, (index + run.chunkSize) / rows.length);
      scope.postMessage({ kind: "progress", id: run.id, progress: 0.88 * covered, stage: "accumulate" });
      await yieldToMessageQueue();
    }
    const data = stream.finish();
    scope.postMessage({ kind: "progress", id: run.id, progress: 0.9, stage: "model" });
    const fullSet = attachStableGroupMetadata(
      makeSet(data, extractMakeSetOptions(run.options)),
      rows,
      run.config,
    );
    if (run.cancelled) {
      scope.postMessage({ kind: "cancelled", id: run.id });
      return;
    }
    const summary = buildOpenEnaSummary(fullSet, run.config, run.reference);
    const result = { set: compactOpenEnaSet(fullSet), ...summary };
    scope.postMessage({ kind: "progress", id: run.id, progress: 1, stage: "model" });
    scope.postMessage({ kind: "result", id: run.id, result });
  } catch (error) {
    scope.postMessage({
      kind: "error",
      id: run.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function pump() {
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
}

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message.id !== "string") return;
  if (message.kind === "cancel") {
    if (active?.id === message.id) active.cancelled = true;
    const queued = queue.find((run) => run.id === message.id);
    if (queued) queued.cancelled = true;
    return;
  }
  if (message.kind === "run") {
    queue.push({
      id: message.id,
      options: message.options,
      config: message.config,
      reference: message.reference,
      chunkSize: Number.isInteger(message.chunkSize) && message.chunkSize > 0 ? message.chunkSize : 2_000,
      cancelled: false,
    });
    void pump();
  }
});
