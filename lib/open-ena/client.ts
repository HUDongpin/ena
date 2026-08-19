"use client";

import type { ENAWorkerProgress } from "jena-js/browser";
import { buildJenaOptions } from "./analyze";
import type { OpenEnaConfig, OpenEnaResult, OpenEnaRotationReference, ParsedDataset } from "./types";
import type { OpenEnaWorkerRequest, OpenEnaWorkerResponse } from "./jena.worker";

export async function analyzeDatasetInWorker(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: ENAWorkerProgress) => void;
    reference?: OpenEnaRotationReference | null;
  } = {},
): Promise<OpenEnaResult> {
  const worker = new Worker(new URL("./jena.worker.ts", import.meta.url), { type: "module" });
  const id = `open-ena-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
        finish(() => resolve(message.result));
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
      worker.postMessage({
        kind: "run",
        id,
        options: buildJenaOptions(dataset, config, options.reference ?? null),
        config,
        reference: options.reference ?? null,
        chunkSize: 2_000,
      } satisfies OpenEnaWorkerRequest);
    }
  });
}
