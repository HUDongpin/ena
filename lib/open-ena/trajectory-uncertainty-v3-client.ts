"use client";

import { captureControlArrayV3 } from "./inference-consumers-v3";
import { deepFreezeV3, snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";
import { captureTrajectoryUncertaintyInputV3, type TrajectoryCentroidIntervalV3, type TrajectoryUncertaintyInputV3, type TrajectoryUncertaintyResultV3 } from "./trajectory-uncertainty-v3";

export interface TrajectoryUncertaintyOptionsV3 {
  signal?: AbortSignal;
  /** May reduce the fixed 30-second deadline, never increase it. */
  deadlineMs?: number;
  /** Owner checks the admitted source binding and summary population. */
  isCurrent?: () => boolean;
  /** Worker lifecycle test seam; production uses the native module worker. */
  workerFactory?: () => Pick<Worker, "onmessage" | "onerror" | "postMessage" | "terminate">;
}

function record(input: unknown, keys: readonly string[]) {
  const value = snapshotPlainJsonRecordV3(input, "trajectory uncertainty response");
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError("Invalid trajectory uncertainty response fields");
  return value;
}

/** Check returned identities, metadata, original estimates and interval state.
 * This response cannot grant native bound-result admission: the owning caller
 * supplies that gate and currentness check before building the input. */
function captureResponse(input: TrajectoryUncertaintyInputV3, candidate: unknown): TrajectoryUncertaintyResultV3 {
  const value = record(candidate, ["bindingKey", "axes", "method", "confidenceLevel", "repetitions", "seed", "centroids"]);
  const axes = captureControlArrayV3(value.axes, "uncertainty response axes", input.axes.length, 200);
  if (value.bindingKey !== input.bindingKey || axes.some((axis, i) => axis !== input.axes[i])) throw new TypeError("stale trajectory uncertainty binding/axes mismatch");
  if (value.method !== "percentile-bootstrap" || value.confidenceLevel !== 0.95 || value.repetitions !== 500 || value.seed !== 2026) throw new TypeError("Invalid trajectory uncertainty method metadata");
  const expected = new Map<string, { groupKey: string; horizonKey: string; n: number; sums: number[] }>();
  for (const group of input.groups) for (const unit of group.units) for (const step of unit.steps) {
    const entry = expected.get(step.centroidKey) ?? { groupKey: group.groupKey, horizonKey: step.horizonKey, n: 0, sums: input.axes.map(() => 0) };
    entry.n++; step.coordinates.forEach((coordinate, i) => { entry.sums[i] += coordinate; }); expected.set(step.centroidKey, entry);
  }
  const seen = new Set<string>();
  const centroids = captureControlArrayV3(value.centroids, "uncertainty response centroids", expected.size, 100_000).map(item => {
    const c = record(item, ["centroidKey", "groupKey", "horizonKey", "n", "axes"]);
    const key = typeof c.centroidKey === "string" ? c.centroidKey : "", expectedCentroid = expected.get(key);
    if (!expectedCentroid || seen.has(key) || c.groupKey !== expectedCentroid.groupKey || c.horizonKey !== expectedCentroid.horizonKey || c.n !== expectedCentroid.n) throw new TypeError("Trajectory uncertainty centroid identity/count mismatch");
    seen.add(key);
    const intervals = captureControlArrayV3(c.axes, "uncertainty response intervals", input.axes.length, 200).map((item, i): TrajectoryCentroidIntervalV3 => {
      const a = record(item, ["axis", "estimate", "lower", "upper", "status", "finiteDraws", "reason"]);
      const estimate = expectedCentroid.sums[i] / expectedCentroid.n;
      if (a.axis !== input.axes[i] || !Object.is(a.estimate, estimate)
        || typeof a.finiteDraws !== "number" || !Number.isSafeInteger(a.finiteDraws) || a.finiteDraws < 0 || a.finiteDraws > 500) throw new TypeError("Trajectory uncertainty estimate/axis/draw mismatch");
      const requiredReason = expectedCentroid.n < 2 ? "insufficient-units" : !Number.isFinite(estimate) ? "numeric-overflow" : a.finiteDraws < 400 ? "insufficient-finite-draws" : null;
      if (a.status === "unavailable") {
        if (a.lower !== null || a.upper !== null || (a.reason !== requiredReason && a.reason !== "numeric-overflow") || a.reason === null) throw new TypeError("Invalid unavailable trajectory uncertainty interval");
      } else if ((a.status !== "available" && a.status !== "degenerate") || requiredReason || a.reason !== null
        || typeof a.lower !== "number" || typeof a.upper !== "number" || !Number.isFinite(a.lower) || !Number.isFinite(a.upper) || a.lower > a.upper
        || (a.status === "degenerate") !== (a.lower === a.upper)) throw new TypeError("Invalid available trajectory uncertainty interval");
      return { axis: input.axes[i], estimate, lower: a.lower as number | null, upper: a.upper as number | null,
        status: a.status as TrajectoryCentroidIntervalV3["status"], finiteDraws: a.finiteDraws, reason: a.reason as TrajectoryCentroidIntervalV3["reason"] };
    });
    return { centroidKey: key, groupKey: expectedCentroid.groupKey, horizonKey: expectedCentroid.horizonKey, n: expectedCentroid.n, axes: intervals };
  });
  return deepFreezeV3({ bindingKey: input.bindingKey, axes: input.axes, method: "percentile-bootstrap", confidenceLevel: 0.95, repetitions: 500, seed: 2026, centroids });
}

let sequence = 0;
/** Starts only a bounded native centroid bootstrap. No longitudinal legacy
 * execution, refit, remote compute, scientific-statistic change, or shared cache. */
export async function runTrajectoryUncertaintyV3(input: TrajectoryUncertaintyInputV3, options: TrajectoryUncertaintyOptionsV3 = {}): Promise<TrajectoryUncertaintyResultV3> {
  const { signal, isCurrent, workerFactory, deadlineMs = 30_000 } = options;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000) throw new TypeError("Trajectory uncertainty deadline must be between 1 and 30000 ms");
  const deadlineAt = performance.now() + deadlineMs;
  const checkCurrent = () => {
    if (signal?.aborted) throw new DOMException("Trajectory uncertainty cancelled", "AbortError");
    if (isCurrent && !isCurrent()) throw new TypeError("stale trajectory uncertainty source or population");
    if (performance.now() >= deadlineAt) throw new Error("Trajectory uncertainty worker reached its hard deadline");
  };
  checkCurrent();
  const captured = captureTrajectoryUncertaintyInputV3(input);
  checkCurrent();
  const worker = workerFactory ? workerFactory() : new Worker(new URL("./trajectory-uncertainty-v3.worker.ts", import.meta.url), { type: "module" });
  const id = `trajectory-uncertainty-${++sequence}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, result?: TrajectoryUncertaintyResultV3) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      worker.onmessage = null; worker.onerror = null; worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new DOMException("Trajectory uncertainty cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("Trajectory uncertainty worker reached its hard deadline")), Math.max(1, deadlineAt - performance.now()));
    worker.onerror = event => finish(new Error(event.message || "Trajectory uncertainty worker failed"));
    worker.onmessage = event => {
      if (settled) return;
      const message = event.data;
      if (!message || message.id !== id) return;
      try {
        checkCurrent();
        if (message.kind === "error") throw new Error(typeof message.message === "string" ? message.message : "Trajectory uncertainty worker failed");
        if (message.kind !== "result") throw new TypeError("Invalid trajectory uncertainty worker response");
        const result = captureResponse(captured, message.result);
        checkCurrent(); finish(undefined, result);
      } catch (error) { finish(error); }
    };
    signal?.addEventListener("abort", abort, { once: true });
    try { checkCurrent(); worker.postMessage({ kind: "run", id, input: captured }); }
    catch (error) { finish(error); }
  });
}
