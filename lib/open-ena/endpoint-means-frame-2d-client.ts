import type { EndpointMeansFrameInput2D, EndpointMeansFrame2D } from "./endpoint-means-frame-2d-compute";

export function requestEndpointMeansFrame2D(input: EndpointMeansFrameInput2D, signal: AbortSignal): Promise<EndpointMeansFrame2D> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("2D framing cancelled.")); return; }
    const worker = new Worker("/open-ena-2d-lapack/worker.js");
    const close = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); worker.terminate(); };
    const fail = (message: string) => { close(); reject(new Error(message)); };
    const cancel = () => fail("2D framing cancelled.");
    const timer = setTimeout(() => fail("2D framing timed out."), 30_000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => fail("2D display worker unavailable.");
    worker.onmessage = (event: MessageEvent<{ status: string; frame?: EndpointMeansFrame2D; message?: string }>) => {
      const frame = event.data.frame;
      if (event.data.status !== "ready" || !frame || frame.profile !== "rena-one-contrast-means-lapack-3.12"
        || ![frame.pointScaleFactor, frame.maxPosition, frame.extremePosition].every(v => Number.isFinite(v) && v > 0)) {
        fail(event.data.message ?? "2D display frame unavailable."); return;
      }
      close(); resolve(frame);
    };
    try { worker.postMessage(input); } catch { fail("2D display input unavailable."); }
  });
}
