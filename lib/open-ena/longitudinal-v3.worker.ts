import {
  executeLongitudinalAnalysisV2,
  type LongitudinalAnalysisBundleV2,
  type LongitudinalExecutionRequestV2,
} from "j-3dena";

export type OpenEnaLongitudinalWorkerStageV3 =
  | "validate-binding"
  | "path-inference-bootstrap"
  | "finalize-envelope";

export type OpenEnaLongitudinalWorkerRequestV3 =
  | { kind: "run"; id: string; request: LongitudinalExecutionRequestV2 }
  | { kind: "cancel"; id: string };

export type OpenEnaLongitudinalWorkerResponseV3 =
  | { kind: "progress"; id: string; progress: number; stage: OpenEnaLongitudinalWorkerStageV3 }
  | { kind: "result"; id: string; result: LongitudinalAnalysisBundleV2 }
  | { kind: "cancelled"; id: string }
  | { kind: "error"; id: string; message: string };

export interface OpenEnaLongitudinalWorkerScopeV3 {
  addEventListener(
    type: "message",
    listener: (event: { data: OpenEnaLongitudinalWorkerRequestV3 }) => void,
  ): void;
  postMessage(message: OpenEnaLongitudinalWorkerResponseV3): void;
}

export interface OpenEnaLongitudinalWorkerDependenciesV3 {
  execute?: typeof executeLongitudinalAnalysisV2;
}

interface QueuedRunV3 {
  id: string;
  request: LongitudinalExecutionRequestV2;
  cancelled: boolean;
}

function snapshotRun(message: Extract<OpenEnaLongitudinalWorkerRequestV3, { kind: "run" }>): QueuedRunV3 {
  const keys = Object.keys(message).sort();
  if (keys.length !== 3 || keys[0] !== "id" || keys[1] !== "kind" || keys[2] !== "request") {
    throw new Error("Longitudinal Worker V3 run messages must contain exactly id, kind, and request.");
  }
  if (!message.id || !message.request || typeof message.request !== "object") {
    throw new Error("Longitudinal Worker V3 requires a non-empty id and immutable execution request.");
  }
  return { id: message.id, request: structuredClone(message.request), cancelled: false };
}

export function createOpenEnaLongitudinalWorkerHostV3(
  scope: OpenEnaLongitudinalWorkerScopeV3,
  dependencies: OpenEnaLongitudinalWorkerDependenciesV3 = {},
): void {
  const execute = dependencies.execute ?? executeLongitudinalAnalysisV2;
  const queue: QueuedRunV3[] = [];
  let active: QueuedRunV3 | null = null;
  let pumping = false;
  const post = (message: OpenEnaLongitudinalWorkerResponseV3) => scope.postMessage(message);

  const runOne = async (run: QueuedRunV3) => {
    try {
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      post({ kind: "progress", id: run.id, progress: 0.05, stage: "validate-binding" });
      await Promise.resolve();
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      post({ kind: "progress", id: run.id, progress: 0.22, stage: "path-inference-bootstrap" });
      const result = await execute(run.request);
      if (run.cancelled) {
        post({ kind: "cancelled", id: run.id });
        return;
      }
      post({ kind: "progress", id: run.id, progress: 0.96, stage: "finalize-envelope" });
      post({ kind: "result", id: run.id, result });
    } catch (error) {
      if (run.cancelled) post({ kind: "cancelled", id: run.id });
      else post({ kind: "error", id: run.id, message: error instanceof Error ? error.message : String(error) });
    }
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      let next = queue.shift();
      while (next) {
        active = next;
        await runOne(next);
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
      const index = queue.findIndex((run) => run.id === message.id);
      if (index >= 0) {
        queue.splice(index, 1);
        post({ kind: "cancelled", id: message.id });
      }
      return;
    }
    if (message.kind !== "run") return;
    if (active?.id === message.id || queue.some((run) => run.id === message.id)) {
      post({ kind: "error", id: message.id, message: `Longitudinal Worker V3 id ${JSON.stringify(message.id)} is already active or queued.` });
      return;
    }
    try {
      queue.push(snapshotRun(message));
      void pump();
    } catch (error) {
      post({ kind: "error", id: message.id, message: error instanceof Error ? error.message : String(error) });
    }
  });
}

declare const self: OpenEnaLongitudinalWorkerScopeV3 | undefined;

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  createOpenEnaLongitudinalWorkerHostV3(self);
}
