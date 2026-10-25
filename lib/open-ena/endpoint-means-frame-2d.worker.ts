import { instantiateEndpointLapack2D } from "./endpoint-means-frame-2d-kernel";
import { computeEndpointMeansFrame2D, type EndpointMeansFrameInput2D } from "./endpoint-means-frame-2d-compute";

self.onmessage = async (event: MessageEvent<EndpointMeansFrameInput2D>) => {
  try {
    const assets = await Promise.all(["blas", "lapack"].map(async name => {
      const response = await fetch(`/open-ena-2d-lapack/${name}.wasm`, { credentials: "omit" });
      if (!response.ok) throw new Error("2D LAPACK asset unavailable.");
      return new Uint8Array(await response.arrayBuffer());
    }));
    const runtime = await instantiateEndpointLapack2D(assets[0], assets[1]);
    self.postMessage({ status: "ready", frame: computeEndpointMeansFrame2D(event.data, runtime) });
  } catch (error) {
    self.postMessage({ status: "unavailable", message: error instanceof Error ? error.message : "2D frame unavailable." });
  }
};
