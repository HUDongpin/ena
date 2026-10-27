import { placePlotLabels, type PlotLabelCandidate, type PlotLabelPlacement, type PlotLabelRect } from "./plot-label-layout";
import type { OpenEna3dLabelAnnotation } from "./plot3d";

type AnnotationRuntime = {
  name?: string; x?: unknown; y?: unknown; z?: unknown;
  ax?: number; ay?: number; xshift?: number; yshift?: number; opacity?: number; captureevents?: boolean;
  _xa?: { _offset?: number; r2p?: (value: unknown) => number };
  _ya?: { _offset?: number; r2p?: (value: unknown) => number };
};
type LabelRoot = HTMLDivElement & {
  _fullData?: Array<{ visible?: boolean | string; type?: string; mode?: string; meta?: { role?: string };
    x?: ArrayLike<number | null>; y?: ArrayLike<number | null>; z?: ArrayLike<number | null>;
    text?: ArrayLike<string>; textfont?: { size?: number; family?: string };
    line?: { width?: number };
    marker?: { size?: number | ArrayLike<number>; line?: { width?: number } } }>;
  _fullLayout?: {
    width?: number; height?: number;
    font?: { family?: string; size?: number };
    _size?: { l: number; t: number; w: number; h: number };
    scene?: { annotations?: AnnotationRuntime[]; domain?: { x: number[]; y: number[] };
      xaxis?: { r2l?: (value: unknown) => number; l2r?: (value: number) => number }; yaxis?: { r2l?: (value: unknown) => number; l2r?: (value: number) => number }; zaxis?: { r2l?: (value: unknown) => number; l2r?: (value: number) => number };
      _scene?: { dataScale?: ArrayLike<number>; glplot?: { cameraParams?: { model?: ArrayLike<number>; view?: ArrayLike<number>; projection?: ArrayLike<number> } } } };
  };
};

function multiply4(matrix: ArrayLike<number>, vector: readonly number[]): number[] | null {
  if (matrix.length !== 16) return null;
  const next = [0, 0, 0, 0];
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) next[row] += matrix[4 * column + row] * vector[column];
  return next.every(Number.isFinite) ? next : null;
}

function inverse4(matrix: ArrayLike<number>): number[] | null {
  if (matrix.length !== 16) return null;
  const rows = Array.from({ length: 4 }, (_, row) => [
    ...Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]),
    ...Array.from({ length: 4 }, (_, column) => row === column ? 1 : 0),
  ]);
  if (!rows.flat().every(Number.isFinite)) return null;
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-14) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    rows[column] = rows[column].map(value => value / divisor);
    for (let row = 0; row < 4; row++) if (row !== column) {
      const factor = rows[row][column];
      rows[row] = rows[row].map((value, index) => value - factor * rows[column][index]);
    }
  }
  return Array.from({ length: 16 }, (_, index) => rows[index % 4][4 + Math.floor(index / 4)]);
}

/** Adapter for pinned Plotly 3.7.0 annotations3d. Plotly owns perspective,
 * reversed axes, aspect ratios and scene domains; never approximate them here.
 * Missing internals fail closed to the existing scientific-point hover. */
export function readPlotlyAnnotationAnchor(value: unknown): { x: number; y: number } | null {
  const annotation = value as AnnotationRuntime | null;
  if (!annotation || typeof annotation._xa?.r2p !== "function" || typeof annotation._ya?.r2p !== "function"
    || !Number.isFinite(annotation._xa._offset) || !Number.isFinite(annotation._ya._offset)) return null;
  try {
    const x = annotation._xa._offset! + annotation._xa.r2p(annotation.x);
    const y = annotation._ya._offset! + annotation._ya.r2p(annotation.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch { return null; }
}

/** Marker obstacles use the same native matrices used by annotations3d.
 * This is only matrix-vector multiplication; camera, perspective, aspect,
 * ranges and coordinate normalization remain entirely owned by Plotly. */
export function readPlotlyPointAnchor(root: HTMLDivElement, point: { x: unknown; y: unknown; z: unknown }): { x: number; y: number } | null {
  const full = (root as LabelRoot)._fullLayout, scene = full?.scene;
  const size = full?._size, scale = scene?._scene?.dataScale, matrices = scene?._scene?.glplot?.cameraParams;
  if (!size || !scene || !scale || !matrices || !scene.xaxis?.r2l || !scene.yaxis?.r2l || !scene.zaxis?.r2l) return null;
  try {
    let vector = [scene.xaxis.r2l(point.x) * scale[0], scene.yaxis.r2l(point.y) * scale[1], scene.zaxis.r2l(point.z) * scale[2], 1];
    if (!vector.every(Number.isFinite)) return null;
    for (const matrix of [matrices.model, matrices.view, matrices.projection]) {
      if (!matrix) return null;
      const next = multiply4(matrix, vector);
      if (!next) return null;
      vector = next;
    }
    if (!vector.every(Number.isFinite) || vector[3] <= 0) return null;
    const domain = scene.domain ?? { x: [0, 1], y: [0, 1] };
    return { x: size.l + domain.x[0] * size.w + 0.5 * (1 + vector[0] / vector[3]) * size.w * (domain.x[1] - domain.x[0]),
      y: size.t + (1 - domain.y[1]) * size.h + 0.5 * (1 - vector[1] / vector[3]) * size.h * (domain.y[1] - domain.y[0]) };
  } catch { return null; }
}

/** Translate a label anchor by exact Plotly-layout pixels at unchanged camera
 * depth. Inverting native matrices prevents the first drag step from jumping
 * when an automatically displaced annotation becomes a manual anchor. */
export function movePlotlyPointByPixels(root: HTMLDivElement, point: { x: number; y: number; z: number }, delta: { x: number; y: number }): { x: number; y: number; z: number } | null {
  const full = (root as LabelRoot)._fullLayout, scene = full?.scene, size = full?._size;
  const scale = scene?._scene?.dataScale, native = scene?._scene?.glplot?.cameraParams;
  if (!scene || !size || !scale || !native || ![delta.x, delta.y].every(Number.isFinite)) return null;
  const axes = [scene.xaxis, scene.yaxis, scene.zaxis];
  if (axes.some(axis => !axis?.r2l || !axis.l2r) || [0, 1, 2].some(index => !Number.isFinite(scale[index]) || scale[index] === 0)) return null;
  const matrices = [native.model, native.view, native.projection];
  if (matrices.some(matrix => !matrix)) return null;
  try {
    let vector = [axes[0]!.r2l!(point.x) * scale[0], axes[1]!.r2l!(point.y) * scale[1], axes[2]!.r2l!(point.z) * scale[2], 1];
    for (const matrix of matrices) { const next = multiply4(matrix!, vector); if (!next) return null; vector = next; }
    if (vector[3] <= 0) return null;
    const domain = scene.domain ?? { x: [0, 1], y: [0, 1] };
    const width = size.w * (domain.x[1] - domain.x[0]), height = size.h * (domain.y[1] - domain.y[0]);
    if (!(width > 0 && height > 0)) return null;
    vector[0] += 2 * delta.x / width * vector[3];
    vector[1] -= 2 * delta.y / height * vector[3];
    for (const matrix of [...matrices].reverse()) {
      const inverse = inverse4(matrix!); if (!inverse) return null;
      const next = multiply4(inverse, vector); if (!next) return null;
      vector = next;
    }
    if (Math.abs(vector[3]) < 1e-14) return null;
    const resolved = vector.slice(0, 3).map((value, index) => axes[index]!.l2r!(value / vector[3] / scale[index]));
    return resolved.every(Number.isFinite) ? { x: resolved[0], y: resolved[1], z: resolved[2] } : null;
  } catch { return null; }
}

export function readPlotlyAnnotationDragPosition(root: HTMLDivElement, annotationIndex: number) {
  const annotation = (root as LabelRoot)._fullLayout?.scene?.annotations?.[annotationIndex];
  if (!annotation || typeof annotation.x !== "number" || typeof annotation.y !== "number" || typeof annotation.z !== "number") return null;
  // Native SVG text is rounded to whole pixels. Preserve its declarative
  // subpixel center: folding the rounded DOM center into a manual anchor can
  // consume the collision gap and spuriously relocate a one-pixel drag.
  return movePlotlyPointByPixels(root, { x: annotation.x, y: annotation.y, z: annotation.z },
    { x: annotation.ax ?? 0, y: annotation.ay ?? 0 });
}

const textContexts = new WeakMap<HTMLDivElement, CanvasRenderingContext2D | null>();
// CI wireframes can subdivide into many screen-space collision rectangles.
// Bound label-layout scratch separately from the unchanged scientific traces.
const MAX_SCENE_LABEL_OBSTACLES = 50_000;
function fixedSceneObstacles(root: HTMLDivElement): { obstacles: PlotLabelRect[]; exceeded: boolean } {
  const runtime = root as LabelRoot;
  const obstacles: PlotLabelRect[] = [];
  for (const trace of runtime._fullData ?? []) {
    if (trace.visible === false || trace.visible === "legendonly" || trace.type !== "scatter3d") continue;
    const role = trace.meta?.role;
    if (role === "confidence-interval") {
      const padding = (trace.line?.width ?? 2) / 2 + 2;
      for (let index = 1; index < (trace.x?.length ?? 0); index++) {
        const endpoints = [index - 1, index].map(pointIndex => ({ x: trace.x![pointIndex], y: trace.y?.[pointIndex], z: trace.z?.[pointIndex] }));
        if (endpoints.some(point => ![point.x, point.y, point.z].every(value => typeof value === "number" && Number.isFinite(value)))) continue;
        const [from, to] = endpoints.map(point => readPlotlyPointAnchor(root, point));
        if (!from || !to) continue;
        // Short projected segments follow only the wireframe edges; one large
        // bounding rectangle would incorrectly reserve its unfilled interior.
        const count = Math.max(1, Math.min(256, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 12)));
        for (let step = 0; step < count; step++) {
          if (obstacles.length >= MAX_SCENE_LABEL_OBSTACLES) return { obstacles: [], exceeded: true };
          const x0 = from.x + (to.x - from.x) * step / count, x1 = from.x + (to.x - from.x) * (step + 1) / count;
          const y0 = from.y + (to.y - from.y) * step / count, y1 = from.y + (to.y - from.y) * (step + 1) / count;
          obstacles.push({ x: Math.min(x0, x1) - padding, y: Math.min(y0, y1) - padding,
            width: Math.abs(x1 - x0) + padding * 2, height: Math.abs(y1 - y0) + padding * 2, soft: true });
        }
      }
      continue;
    }
    const marker = role === "code-node" || role === "group-mean" || role === "unit-points";
    const axisText = role === "axis-label";
    if (!marker && !axisText) continue;
    for (let index = 0; index < (trace.x?.length ?? 0); index++) {
      const point = { x: trace.x![index], y: trace.y?.[index], z: trace.z?.[index] };
      if (![point.x, point.y, point.z].every(value => typeof value === "number" && Number.isFinite(value))) continue;
      const anchor = readPlotlyPointAnchor(root, point);
      if (!anchor) continue;
      let width: number, height: number;
      if (marker) {
        const size = trace.marker?.size;
        const diameter = typeof size === "number" ? size : size?.[index] ?? 6;
        width = height = diameter + 2 * (trace.marker?.line?.width ?? 0) + 2;
      } else {
        if (!textContexts.has(root)) textContexts.set(root, document.createElement("canvas").getContext("2d"));
        const context = textContexts.get(root);
        if (!context) continue;
        const fontSize = trace.textfont?.size ?? runtime._fullLayout?.font?.size ?? 12;
        context.font = `${fontSize}px ${trace.textfont?.family ?? runtime._fullLayout?.font?.family ?? "Arial"}`;
        const metrics = context.measureText(trace.text?.[index] ?? "");
        width = Math.max(1, metrics.width) + 4;
        height = Math.max(fontSize, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + 4;
      }
      if (Number.isFinite(width) && Number.isFinite(height)) {
        if (obstacles.length >= MAX_SCENE_LABEL_OBSTACLES) return { obstacles: [], exceeded: true };
        obstacles.push({ x: anchor.x - width / 2, y: anchor.y - height / 2, width, height, soft: role === "unit-points" });
      }
    }
  }
  return { obstacles, exceeded: false };
}

export interface OpenEna3dLabelMeasurement {
  labels: PlotLabelCandidate[];
  bounds: PlotLabelRect;
  obstacles: PlotLabelRect[];
}

function annotationElement(root: HTMLDivElement, index: number) {
  return root.querySelector<SVGGElement>(`.annotation-scene[data-index="${index}"]`);
}

function decorateLabels(root: LabelRoot, labels: readonly OpenEna3dLabelAnnotation[]) {
  const annotations = root._fullLayout?.scene?.annotations ?? [];
  for (const label of labels) {
    const annotation = annotations[label.annotationIndex];
    if (annotation?.name !== label.id) continue;
    const element = annotationElement(root, label.annotationIndex);
    if (!element) continue;
    element.setAttribute("data-ena-label-id", label.id);
    element.setAttribute("data-ena-label-role", label.role);
    element.setAttribute("data-ena-label-visible", annotation.opacity === 1 ? "true" : "false");
    // Plotly recreates these elements on camera frames. Delegated pointer
    // handlers read this index; deferred text must never intercept an orbit.
    element.style.pointerEvents = annotation.opacity === 1 ? "auto" : "none";
  }
}

export function measureOpenEna3dLabels(root: HTMLDivElement, labels: readonly OpenEna3dLabelAnnotation[]): OpenEna3dLabelMeasurement {
  const runtime = root as LabelRoot;
  const full = runtime._fullLayout;
  const size = full?._size;
  const scene = full?.scene;
  const rect = root.getBoundingClientRect();
  const width = full?.width ?? root.clientWidth, height = full?.height ?? root.clientHeight;
  if (!size || !scene || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) {
    return { labels: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, obstacles: [] };
  }
  const scaleX = width / rect.width, scaleY = height / rect.height;
  const domain = scene.domain ?? { x: [0, 1], y: [0, 1] };
  const bounds = { x: size.l + domain.x[0] * size.w, y: size.t + (1 - domain.y[1]) * size.h,
    width: (domain.x[1] - domain.x[0]) * size.w, height: (domain.y[1] - domain.y[0]) * size.h };
  const localRect = (element: Element): PlotLabelRect => {
    const box = element.getBoundingClientRect();
    return { x: (box.left - rect.left) * scaleX, y: (box.top - rect.top) * scaleY, width: box.width * scaleX, height: box.height * scaleY };
  };
  const measured: PlotLabelCandidate[] = [];
  const obstacles: PlotLabelRect[] = [];
  let projectionError = 0, verifiedProjections = 0;
  for (const label of labels) {
    const annotation = scene.annotations?.[label.annotationIndex];
    if (annotation?.name !== label.id) continue;
    const anchor = readPlotlyAnnotationAnchor(annotation);
    const element = annotationElement(root, label.annotationIndex)?.querySelector(".annotation-text-g .bg");
    if (!anchor || !element) continue;
    const projected = readPlotlyPointAnchor(root, { x: annotation.x, y: annotation.y, z: annotation.z });
    if (projected) { projectionError = Math.max(projectionError, Math.abs(projected.x - anchor.x), Math.abs(projected.y - anchor.y)); verifiedProjections++; }
    const box = localRect(element);
    if (!(box.width > 0 && box.height > 0)) continue;
    const manualAnchor = label.preferredPosition ? readPlotlyPointAnchor(root, label.preferredPosition) : null;
    measured.push({ id: label.id, anchor, width: box.width + 1, height: box.height + 1, priority: label.priority, ...(label.role === "centroid" || (label.role === "code" && !label.preferredPosition) ? { placement: "adjacent" as const } : {}),
      preferredOffset: manualAnchor ? { x: manualAnchor.x - anchor.x, y: manualAnchor.y - anchor.y } : { x: 0, y: -box.height / 2 - 10 } });
    obstacles.push({ x: anchor.x - 4, y: anchor.y - 4, width: 8, height: 8, soft: label.role === "unit" });
  }
  root.setAttribute("data-ena-label-projection-error", verifiedProjections ? String(projectionError) : "unavailable");
  // Check the pinned projection adapter against Plotly's annotation projection
  // on the actual camera frame before using it for unlabelled marker obstacles.
  if (verifiedProjections && projectionError < 0.5) {
    const fixed = fixedSceneObstacles(root);
    root.setAttribute("data-ena-label-obstacle-budget", fixed.exceeded ? "exceeded" : "within-limit");
    if (fixed.exceeded) {
      // An incomplete collision map could place text on omitted CI edges.
      // Empty candidates make the existing owner defer every original label
      // to its full-detail list; the plotted intervals and identities remain.
      decorateLabels(runtime, labels);
      return { labels: [], bounds, obstacles: [] };
    }
    for (const obstacle of fixed.obstacles) obstacles.push(obstacle);
  }
  for (const element of root.querySelectorAll(".legend, .annotation")) obstacles.push(localRect(element));
  const toolbar = root.closest(".open-ena-interactive-3d-region")?.querySelector(".open-ena-3d-plot-actions");
  if (toolbar) obstacles.push(localRect(toolbar));
  decorateLabels(runtime, labels);
  return { labels: measured, bounds, obstacles };
}

export interface OpenEna3dLabelLayoutOptions {
  root: HTMLDivElement;
  labels: readonly OpenEna3dLabelAnnotation[];
  isCurrent(): boolean;
  run<T>(operation: () => Promise<T> | T): Promise<T>;
  relayout(update: Record<string, unknown>): Promise<unknown>;
  scheduleFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  measure?: () => OpenEna3dLabelMeasurement;
  onDeferredChange?: (ids: readonly string[]) => void;
  onError?: () => void;
}

/** One controller owns one rendered specification. All writes are screen
 * offsets on Plotly's detached layout, serialized by the existing GL owner. */
export function createOpenEna3dLabelLayout(options: OpenEna3dLabelLayoutOptions) {
  let closed = false, dirty = true, frame: number | null = null;
  let running: Promise<void> | null = null;
  let selectedId: string | null = null;
  let previous = new Map<string, PlotLabelPlacement>();
  let deferredKey = "";
  const active = () => !closed && options.isCurrent();
  const currentAnnotations = () => (options.root as LabelRoot)._fullLayout?.scene?.annotations ?? [];
  const setPending = () => { if (active()) options.root.setAttribute("data-ena-label-layout", "pending"); };

  async function apply() {
    await options.run(async () => {
      if (!active()) return;
      const measurement = options.measure?.() ?? measureOpenEna3dLabels(options.root, options.labels);
      const manualIds = new Set(options.labels.filter(label => label.preferredPosition).map(label => label.id));
      const retained = new Map([...previous].filter(([id]) => !manualIds.has(id)));
      const placements = placePlotLabels({ ...measurement,
        labels: measurement.labels.map(label => label.id === selectedId ? { ...label, priority: 10000 } : label), previous: retained });
      const update: Record<string, unknown> = {};
      const native = currentAnnotations();
      const deferred: string[] = [];
      for (const label of options.labels) {
        const annotation = native[label.annotationIndex];
        if (annotation?.name !== label.id) continue;
        const placement = placements.get(label.id);
        const visible = placement?.visible === true;
        if (!visible) deferred.push(label.id);
        // Arrowless period labels use pixel shifts. Code/Unit labels retain
        // ax/ay so their existing leaders and manual dragging keep working.
        const next = { ...(label.role === "centroid"
          ? { xshift: visible ? Math.round(placement.dx) : 0, yshift: visible ? -Math.round(placement.dy) : 0 }
          : { ax: visible ? Math.round(placement.dx) : 0, ay: visible ? Math.round(placement.dy) : 0 }),
          opacity: visible ? 1 : 0, captureevents: visible };
        for (const [field, value] of Object.entries(next)) {
          if (annotation[field as keyof typeof next] !== value) update[`scene.annotations[${label.annotationIndex}].${field}`] = value;
        }
      }
      if (!active()) return;
      if (Object.keys(update).length) await options.relayout(update);
      if (!active()) return;
      previous = placements;
      decorateLabels(options.root as LabelRoot, options.labels);
      options.root.setAttribute("data-ena-label-deferred-count", String(deferred.length));
      const key = JSON.stringify(deferred);
      if (key !== deferredKey) { deferredKey = key; options.onDeferredChange?.(deferred); }
    });
  }

  async function flush(): Promise<void> {
    if (!active()) return;
    dirty = true;
    if (frame !== null) { options.cancelFrame(frame); frame = null; }
    if (running) { await running; if (dirty && active()) return flush(); return; }
    setPending();
    const operation = (async () => {
      // Requests arriving during a relayout replace the next measurement, never
      // append an unbounded queue of obsolete camera positions.
      while (dirty && active()) { dirty = false; await apply(); }
    })();
    running = operation;
    try { await operation; }
    finally {
      if (running === operation) running = null;
      if (active()) options.root.setAttribute("data-ena-label-layout", dirty ? "pending" : "ready");
    }
  }

  function schedule() {
    if (!active()) return;
    dirty = true; setPending();
    if (frame !== null || running) return;
    frame = options.scheduleFrame(() => {
      frame = null;
      void flush().catch(() => { if (active()) { options.root.setAttribute("data-ena-label-layout", "unavailable"); options.onError?.(); } });
    });
  }

  return {
    schedule, flush,
    select(id: string | null) { if (selectedId !== id) { selectedId = id; schedule(); } },
    close() { closed = true; dirty = false; if (frame !== null) options.cancelFrame(frame); frame = null; },
  };
}
