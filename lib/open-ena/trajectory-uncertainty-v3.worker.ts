import { computeTrajectoryUncertaintyV3, type TrajectoryUncertaintyInputV3 } from "./trajectory-uncertainty-v3";

interface TrajectoryUncertaintyWorkerScopeV3 {
  addEventListener(type: "message", callback: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

/** One bounded calculation per disposable worker. Cancellation and deadlines
 * terminate the worker from the client, including during synchronous arithmetic. */
export function createTrajectoryUncertaintyWorkerHostV3(scope: TrajectoryUncertaintyWorkerScopeV3): void {
  scope.addEventListener("message", event => {
    const message = event.data as { kind?: unknown; id?: unknown; input?: unknown } | null;
    if (!message || message.kind !== "run" || typeof message.id !== "string" || !message.id.length || message.id.length > 256) return;
    try {
      if (Object.keys(message).length !== 3) throw new TypeError("Invalid trajectory uncertainty worker request");
      const result = computeTrajectoryUncertaintyV3(message.input as TrajectoryUncertaintyInputV3);
      scope.postMessage({ kind: "result", id: message.id, result });
    } catch (error) {
      scope.postMessage({ kind: "error", id: message.id, message: error instanceof Error ? error.message : "Trajectory uncertainty worker failed" });
    }
  });
}

if (typeof self !== "undefined" && typeof document === "undefined") createTrajectoryUncertaintyWorkerHostV3(self);
