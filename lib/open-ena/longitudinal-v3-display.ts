import type { OpenEna3dAspectRatio, OpenEna3dCamera } from "./plot3d";

export interface ImmutableTrajectoryPlotlyInputV3 {
  data: readonly Readonly<Record<string, unknown>>[];
  layout: Readonly<Record<string, unknown>>;
  config: Readonly<Record<string, unknown>>;
}

export interface MutableTrajectoryPlotlyInputV3 {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface TrajectoryPlotlyRangesV3 {
  x: readonly [number, number];
  y: readonly [number, number];
}

export interface TrajectoryPlotlyAspectRatioV3 {
  x: number;
  y: number;
  z: number;
}

export type TrajectoryPlotlyActionResultV3<T> =
  | { status: "completed"; value: T }
  | { status: "rejected" };

const TRAJECTORY_PLOTLY_RANGE_ZOOM_STEP_V3 = 1.2;

function zoomTrajectoryPlotlyRangeV3(
  [start, end]: readonly [number, number],
  direction: "in" | "out",
): [number, number] {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError("Plotly range endpoints must be finite.");
  }
  const center = start / 2 + end / 2;
  const scale = direction === "in"
    ? 1 / TRAJECTORY_PLOTLY_RANGE_ZOOM_STEP_V3
    : TRAJECTORY_PLOTLY_RANGE_ZOOM_STEP_V3;
  const scaledHalfSpan = (end / 2 - start / 2) * scale;
  const result: [number, number] = [center - scaledHalfSpan, center + scaledHalfSpan];
  if (!result.every(Number.isFinite)) {
    throw new RangeError("Zoomed Plotly range endpoints must be finite.");
  }
  return result;
}

export function zoomTrajectoryPlotlyRangesV3(
  current: TrajectoryPlotlyRangesV3,
  direction: "in" | "out",
): TrajectoryPlotlyRangesV3 {
  return {
    x: zoomTrajectoryPlotlyRangeV3(current.x, direction),
    y: zoomTrajectoryPlotlyRangeV3(current.y, direction),
  };
}

export function resetTrajectoryPlotlyRangesV3(
  initial: TrajectoryPlotlyRangesV3,
): TrajectoryPlotlyRangesV3 {
  return {
    x: [...initial.x],
    y: [...initial.y],
  };
}

export function captureInitialTrajectoryPlotlyRangesV3(
  initial: TrajectoryPlotlyRangesV3 | null,
  rendered: TrajectoryPlotlyRangesV3,
): TrajectoryPlotlyRangesV3 {
  return resetTrajectoryPlotlyRangesV3(initial ?? rendered);
}

export function captureInitialTrajectoryPlotlyAspectRatioV3(
  initial: TrajectoryPlotlyAspectRatioV3 | null,
  rendered: TrajectoryPlotlyAspectRatioV3,
): TrajectoryPlotlyAspectRatioV3 {
  return { ...(initial ?? rendered) };
}

export async function runTrajectoryPlotlyActionV3<T>(
  gate: { current: boolean },
  action: () => Promise<T>,
): Promise<TrajectoryPlotlyActionResultV3<T>> {
  if (gate.current) return { status: "rejected" };
  gate.current = true;
  try {
    return { status: "completed", value: await action() };
  } finally {
    gate.current = false;
  }
}

export type TrajectoryPlotlyControllerResultV3<T> =
  | { status: "completed"; value: T }
  | { status: "stale" };

export interface TrajectoryPlotlyControllerRenderV3 {
  specKey: object;
  input: MutableTrajectoryPlotlyInputV3;
  hasScene: boolean;
  defaultCamera: OpenEna3dCamera;
}

export interface TrajectoryPlotlyControllerDependenciesV3 {
  react: (input: MutableTrajectoryPlotlyInputV3) => Promise<unknown>;
  relayout: (payload: Record<string, unknown>) => Promise<unknown>;
  toImage: (options: Record<string, unknown>) => Promise<string>;
  readRanges: () => TrajectoryPlotlyRangesV3 | null;
  readAspectRatio: () => OpenEna3dAspectRatio | null;
  readCamera: (fallback: OpenEna3dCamera) => OpenEna3dCamera;
  zoomCamera: (
    camera: OpenEna3dCamera,
    reference: OpenEna3dCamera,
    direction: "in" | "out",
  ) => OpenEna3dCamera;
  resetCamera: (camera: OpenEna3dCamera, reference: OpenEna3dCamera) => OpenEna3dCamera;
  zoomAspectRatio: (
    aspectRatio: OpenEna3dAspectRatio,
    reference: OpenEna3dAspectRatio,
    direction: "in" | "out",
  ) => OpenEna3dAspectRatio;
  onPendingChange?: (pending: boolean) => void;
}

export interface TrajectoryPlotlyControllerV3 {
  render: (
    request: TrajectoryPlotlyControllerRenderV3,
  ) => Promise<TrajectoryPlotlyControllerResultV3<null>>;
  zoom: (
    direction: "in" | "out",
  ) => Promise<TrajectoryPlotlyControllerResultV3<Record<string, unknown>>>;
  recenter: () => Promise<TrajectoryPlotlyControllerResultV3<Record<string, unknown>>>;
  copy: (
    options: Record<string, unknown>,
    consume?: (image: string, isCurrent: () => boolean) => Promise<string>,
  ) => Promise<TrajectoryPlotlyControllerResultV3<string>>;
}

export function createTrajectoryPlotlyControllerV3(
  dependencies: TrajectoryPlotlyControllerDependenciesV3,
): TrajectoryPlotlyControllerV3 {
  let generation = 0;
  let specKey: object | null = null;
  let renderState: Pick<TrajectoryPlotlyControllerRenderV3, "hasScene" | "defaultCamera"> | null = null;
  let initialRanges: TrajectoryPlotlyRangesV3 | null = null;
  let initialAspectRatio: OpenEna3dAspectRatio | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let pendingCount = 0;

  const enqueue = <T>(
    requestedGeneration: number,
    mutation: () => Promise<T>,
  ): Promise<TrajectoryPlotlyControllerResultV3<T>> => {
    pendingCount += 1;
    if (pendingCount === 1) dependencies.onPendingChange?.(true);
    const operation = queue.then(async () => {
      if (requestedGeneration !== generation) return { status: "stale" } as const;
      const value = await mutation();
      return requestedGeneration === generation
        ? { status: "completed", value } as const
        : { status: "stale" } as const;
    });
    queue = operation.then(() => undefined, () => undefined);
    return operation.finally(() => {
      pendingCount -= 1;
      if (pendingCount === 0) dependencies.onPendingChange?.(false);
    });
  };

  const requireRenderState = () => {
    if (!renderState) throw new Error("Plotly controller has not completed its initial render.");
    return renderState;
  };

  const defaultAspectRatio = (): OpenEna3dAspectRatio => ({
    ...(initialAspectRatio ?? { x: 1, y: 1, z: 1 }),
  });

  return {
    render(request) {
      if (specKey !== request.specKey) {
        specKey = request.specKey;
        generation += 1;
        initialRanges = null;
        initialAspectRatio = null;
      }
      const requestedGeneration = generation;
      return enqueue(requestedGeneration, async () => {
        await dependencies.react(request.input);
        if (requestedGeneration !== generation) return null;
        renderState = {
          hasScene: request.hasScene,
          defaultCamera: request.defaultCamera,
        };
        const renderedRanges = dependencies.readRanges();
        if (renderedRanges) {
          initialRanges = captureInitialTrajectoryPlotlyRangesV3(initialRanges, renderedRanges);
        }
        const renderedAspectRatio = dependencies.readAspectRatio();
        if (renderedAspectRatio) {
          initialAspectRatio = captureInitialTrajectoryPlotlyAspectRatioV3(
            initialAspectRatio,
            renderedAspectRatio,
          );
        }
        return null;
      });
    },
    zoom(direction) {
      const requestedGeneration = generation;
      return enqueue(requestedGeneration, async () => {
        const state = requireRenderState();
        let payload: Record<string, unknown>;
        if (!state.hasScene) {
          const ranges = dependencies.readRanges();
          if (!ranges) throw new Error("Plotly 2D ranges are unavailable.");
          const next = zoomTrajectoryPlotlyRangesV3(ranges, direction);
          payload = {
            "xaxis.autorange": false,
            "yaxis.autorange": false,
            "xaxis.range": next.x,
            "yaxis.range": next.y,
          };
        } else {
          const camera = dependencies.readCamera(state.defaultCamera);
          if (camera.projection.type === "orthographic") {
            const reference = defaultAspectRatio();
            const next = dependencies.zoomAspectRatio(
              dependencies.readAspectRatio() ?? reference,
              reference,
              direction,
            );
            payload = { "scene.aspectmode": "manual", "scene.aspectratio": next };
          } else {
            payload = {
              "scene.camera": dependencies.zoomCamera(camera, state.defaultCamera, direction),
            };
          }
        }
        await dependencies.relayout(payload);
        return payload;
      });
    },
    recenter() {
      const requestedGeneration = generation;
      return enqueue(requestedGeneration, async () => {
        const state = requireRenderState();
        let payload: Record<string, unknown>;
        if (!state.hasScene) {
          if (!initialRanges) throw new Error("Plotly 2D reset ranges are unavailable.");
          const ranges = resetTrajectoryPlotlyRangesV3(initialRanges);
          payload = {
            "xaxis.autorange": false,
            "yaxis.autorange": false,
            "xaxis.range": ranges.x,
            "yaxis.range": ranges.y,
          };
        } else {
          const camera = dependencies.readCamera(state.defaultCamera);
          payload = camera.projection.type === "orthographic"
            ? { "scene.aspectmode": "manual", "scene.aspectratio": defaultAspectRatio() }
            : { "scene.camera": dependencies.resetCamera(camera, state.defaultCamera) };
        }
        await dependencies.relayout(payload);
        return payload;
      });
    },
    copy(options, consume = async (image) => image) {
      const requestedGeneration = generation;
      return enqueue(requestedGeneration, async () => {
        const isCurrent = () => requestedGeneration === generation;
        const image = await dependencies.toImage(options);
        if (!isCurrent()) return image;
        return consume(image, isCurrent);
      });
    },
  };
}

/**
 * Plotly normalizes traces and layouts in place. The package compiler returns
 * an immutable, hash-bound display spec, so the browser presenter must never
 * pass those objects directly across Plotly's mutation boundary.
 */
export function cloneTrajectoryPlotlyInputV3(
  source: ImmutableTrajectoryPlotlyInputV3,
): MutableTrajectoryPlotlyInputV3 {
  const input = { data: source.data, layout: source.layout, config: source.config };
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(input) as MutableTrajectoryPlotlyInputV3;
  }
  return JSON.parse(JSON.stringify(input)) as MutableTrajectoryPlotlyInputV3;
}

function mutableRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Applies a presenter-only narrow-screen layout to an already-cloned Plotly
 * input. This deliberately sits after the immutable package compiler so
 * responsive legend placement cannot alter the scientific envelope or hash.
 */
export function applyCompactTrajectoryPlotlyLayoutV3(
  input: MutableTrajectoryPlotlyInputV3,
  compact: boolean,
): MutableTrajectoryPlotlyInputV3 {
  if (!compact) return input;

  const legend = mutableRecord(input.layout.legend);
  const legendFont = mutableRecord(legend.font);
  const margin = mutableRecord(input.layout.margin);
  input.layout.autosize = true;
  const compactLegend: Record<string, unknown> = {
    ...legend,
    orientation: "v",
    x: 0,
    xanchor: "left",
    y: -0.08,
    yanchor: "top",
    font: { ...legendFont, size: 10 },
    tracegroupgap: 1,
  };
  delete compactLegend.entrywidth;
  delete compactLegend.entrywidthmode;
  input.layout.legend = compactLegend;
  input.layout.margin = {
    ...margin,
    l: 44,
    r: 12,
    t: 52,
    b: 210,
  };
  return input;
}

/**
 * Uses the complete fullscreen Plotly paper for the presenter. The legend is
 * intentionally overlaid inside the paper so Plotly does not reserve a wide
 * blank column beside a square 3D scene. This is a display-only transform of a
 * mutable clone; it cannot change the immutable trajectory result envelope.
 */
export function applyFullscreenTrajectoryPlotlyLayoutV3(
  input: MutableTrajectoryPlotlyInputV3,
  fullscreen: boolean,
): MutableTrajectoryPlotlyInputV3 {
  if (!fullscreen) return input;

  const legend = mutableRecord(input.layout.legend);
  const legendFont = mutableRecord(legend.font);
  const fullscreenLegend: Record<string, unknown> = {
    ...legend,
    orientation: "v",
    x: 0.995,
    xanchor: "right",
    y: 0.995,
    yanchor: "top",
    bgcolor: "rgba(255,255,255,0.82)",
    bordercolor: "rgba(91,111,116,0.28)",
    borderwidth: 1,
    font: { ...legendFont, size: 11 },
    tracegroupgap: 2,
  };
  delete fullscreenLegend.entrywidth;
  delete fullscreenLegend.entrywidthmode;

  input.layout.autosize = true;
  input.layout.legend = fullscreenLegend;
  input.layout.margin = { l: 24, r: 8, t: 28, b: 20 };
  const scene = mutableRecord(input.layout.scene);
  if (Object.keys(scene).length > 0) {
    input.layout.scene = {
      ...scene,
      domain: { x: [0, 1], y: [0, 1] },
    };
  }
  return input;
}
