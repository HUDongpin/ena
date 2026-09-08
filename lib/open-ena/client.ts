"use client";

import type { ENAWorkerProgress } from "jena-js/browser";
import { bindOpenEnaResultProvenance } from "./analyze";
import { cloneOpenEnaConfig } from "./network-config";
import type { OpenEnaConfig, OpenEnaResult, OpenEnaRotationReference, ParsedDataset } from "./types";
import type { OpenEnaWorkerRequest, OpenEnaWorkerResponse } from "./jena.worker";
import { validateExecutionPlanV3, type StandardExecutionPlanV3, type OnaExecutionPlanV3, type OpenEnaExecutionPlanV3 } from "./model-v3/execution-plan";
import { validateBoundResultV3 } from "./model-v3/result-binding";
import type { BoundResultV3, BoundStandardResultV3, BoundOnaResultV3, OpenEnaWorkerStageV3 } from "./model-v3/types";

export interface AnalyzePlanWorkerOptionsV3 {
  signal?: AbortSignal;
  onProgress?: (progress: { id: string; progress: number; stage: OpenEnaWorkerStageV3 }) => void;
}

function createProductionWorker() {
  return new Worker(new URL("./jena.worker.ts", import.meta.url), { type: "module" });
}

/** One immutable scientific input. Operational callbacks never cross the wire. */
export function analyzePlanInWorkerV3(readyPlan: StandardExecutionPlanV3, options?: AnalyzePlanWorkerOptionsV3): Promise<BoundStandardResultV3>;
export function analyzePlanInWorkerV3(readyPlan: OnaExecutionPlanV3, options?: AnalyzePlanWorkerOptionsV3): Promise<BoundOnaResultV3>;
export function analyzePlanInWorkerV3(readyPlan: OpenEnaExecutionPlanV3, options?: AnalyzePlanWorkerOptionsV3): Promise<BoundResultV3>;
export async function analyzePlanInWorkerV3(readyPlan: OpenEnaExecutionPlanV3, options: AnalyzePlanWorkerOptionsV3 = {}): Promise<BoundResultV3> {
  const plan = await validateExecutionPlanV3(readyPlan);
  if (options.signal?.aborted) throw new DOMException("The jENA run was cancelled.", "AbortError");
  const id = `open-ena-v3-${crypto.randomUUID()}`;
  const expectedHash = plan.header.executionPlanSha256;
  const worker = createProductionWorker();
  return new Promise((resolve, reject) => {
    let settled = false;
    let validating = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback();
    };
    const abort = () => {
      if (settled) return;
      worker.postMessage({ kind: "cancel", id } satisfies OpenEnaWorkerRequest);
      finish(() => reject(new DOMException("The jENA run was cancelled.", "AbortError")));
    };
    const timeout = setTimeout(() => {
      worker.postMessage({ kind: "cancel", id } satisfies OpenEnaWorkerRequest);
      finish(() => reject(new Error("The jENA run timed out after 60 seconds.")));
    }, 60_000);
    worker.onmessage = (event: MessageEvent<OpenEnaWorkerResponse>) => {
      if (settled) return;
      const message = event.data;
      if (!message || message.id !== id) return;
      if (message.kind === "progress-v3") {
        if (message.executionPlanSha256 && message.executionPlanSha256 !== expectedHash) {
          finish(() => reject(new Error("Worker progress belongs to a different execution plan hash.")));
          return;
        }
        try { options.onProgress?.({ id, progress: message.progress, stage: message.stage }); }
        catch (error) { finish(() => reject(error)); }
      } else if (message.kind === "result-v3") {
        if (validating) return;
        if (message.executionPlanSha256 !== expectedHash) {
          finish(() => reject(new Error("Worker result belongs to a different execution plan hash.")));
          return;
        }
        validating = true;
        void validateBoundResultV3(message.result, plan).then(
          (result) => { if (settled) return; if (options.signal?.aborted) abort(); else finish(() => resolve(result)); },
          (error: unknown) => finish(() => reject(error)),
        );
      } else if (message.kind === "cancelled") finish(() => reject(new DOMException("The jENA run was cancelled.", "AbortError")));
      else if (message.kind === "error") finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || "The jENA worker failed.")));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    else worker.postMessage({ kind: "run-open-ena-plan-v3", id, plan, chunkSize: 2000 } satisfies OpenEnaWorkerRequest);
  });
}

export function buildOpenEnaWorkerRunRequest(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  options: {
    id: string;
    reference: OpenEnaRotationReference | null;
    chunkSize: number;
  },
): Extract<OpenEnaWorkerRequest, { kind: "run" }> {
  return {
    kind: "run",
    id: options.id,
    dataset: {
      ...dataset,
      headers: [...dataset.headers],
      rows: dataset.rows.map((row) => ({ ...row })),
    },
    config: cloneOpenEnaConfig(config),
    reference: options.reference ? structuredClone(options.reference) : null,
    chunkSize: options.chunkSize,
  };
}

export async function analyzeDatasetInWorker(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: ENAWorkerProgress) => void;
    reference?: OpenEnaRotationReference | null;
    datasetSha256: string;
  },
): Promise<OpenEnaResult> {
  if (!/^[a-f\d]{64}$/iu.test(options.datasetSha256)) {
    throw new Error("Open ENA analysis requires the imported dataset's SHA-256 provenance binding.");
  }
  const id = `open-ena-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const request = buildOpenEnaWorkerRunRequest(dataset, config, {
    id,
    reference: options.reference ?? null,
    chunkSize: 2_000,
  });
  const worker = createProductionWorker();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortHandler);
      worker.terminate();
      callback();
    };
    const abortHandler = () => {
      worker.postMessage({ kind: "cancel", id } satisfies OpenEnaWorkerRequest);
      finish(() => reject(new DOMException("The jENA run was cancelled.", "AbortError")));
    };
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("The jENA run timed out after 60 seconds.")));
    }, 60_000);
    worker.onmessage = (event: MessageEvent<OpenEnaWorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.kind === "progress") {
        options.onProgress?.({ id, progress: message.progress, stage: message.stage });
      } else if (message.kind === "result") {
        try {
          const bound = bindOpenEnaResultProvenance(
            message.result,
            dataset,
            options.datasetSha256,
            request.config,
          );
          finish(() => resolve(bound));
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
      } else if (message.kind === "cancelled") {
        finish(() => reject(new DOMException("The jENA run was cancelled.", "AbortError")));
      } else if (message.kind === "error") {
        finish(() => reject(new Error(message.message)));
      }
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "The jENA worker failed.")));
    };
    if (options.signal?.aborted) abortHandler();
    else {
      options.signal?.addEventListener("abort", abortHandler, { once: true });
      worker.postMessage(request);
    }
  });
}
