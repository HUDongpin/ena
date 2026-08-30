export interface PlotlyGl3dApi {
  react(
    root: HTMLDivElement,
    data: readonly unknown[],
    layout: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Promise<unknown>;
  relayout(root: HTMLDivElement, update: Record<string, unknown>): Promise<unknown>;
  purge(root: HTMLDivElement): void;
  toImage(
    root: HTMLDivElement,
    options: { format: "png"; filename?: string; width: number; height: number; scale: number },
  ): Promise<string>;
  Plots: { resize(root: HTMLDivElement): Promise<unknown> | unknown };
}

let plotlyPromise: Promise<PlotlyGl3dApi> | null = null;

type PlotlyLoader = () => Promise<{ default: PlotlyGl3dApi }>;

const defaultPlotlyLoader: PlotlyLoader = () => import("plotly.js-gl3d-dist-min");

export function getPlotlyGl3d(load: PlotlyLoader = defaultPlotlyLoader) {
  if (!plotlyPromise) {
    const pending = load().then(({ default: plotly }) => plotly);
    plotlyPromise = pending;
    void pending.catch(() => {
      if (plotlyPromise === pending) plotlyPromise = null;
    });
  }
  return plotlyPromise;
}

let primaryReady: Promise<void> | null = null;
let resolvePrimaryReady: (() => void) | null = null;

export function schedulePlotlyGl3dRole<T>(
  role: "comparison" | "primary" | "secondary",
  run: (role: "comparison" | "primary" | "secondary") => Promise<T> | T,
) {
  if (role === "comparison") return Promise.resolve(run(role));
  return new Promise<T>((resolve, reject) => {
    const schedule = (onComplete: () => void) => {
      const timer = typeof window !== "undefined" ? window.setTimeout : setTimeout;
      timer(() => {
        Promise.resolve(run(role)).then(resolve, reject).then(onComplete, onComplete);
      }, 0);
    };
    if (role === "primary") {
      if (!primaryReady) {
        primaryReady = new Promise<void>((ready) => { resolvePrimaryReady = ready; });
      }
      schedule(() => {
        resolvePrimaryReady?.();
        resolvePrimaryReady = null;
      });
      return;
    }
    if (!primaryReady) primaryReady = new Promise<void>((ready) => { resolvePrimaryReady = ready; });
    primaryReady.then(() => schedule(() => {}), () => schedule(() => {}));
  });
}

export function resetPlotlyGl3dLoaderForTests() {
  plotlyPromise = null;
  primaryReady = null;
  resolvePrimaryReady = null;
}
