"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { placePlotLabels, type PlotLabelPlacement, type PlotLabelRect } from "@/lib/open-ena/plot-label-layout";

export interface SvgTrajectoryLabel {
  id: string;
  kind: "code" | "centroid" | "unit";
  text: string;
  detail: string;
  anchor: { x: number; y: number };
  fontSize: number;
  priority: number;
  preferredOffset?: { x: number; y: number };
  placement?: "adjacent";
  code?: string;
}

type TextMetric = { width: number; height: number; baselineX: number; baselineY: number };
const PAD = 3;
const labelPadding = (label?: SvgTrajectoryLabel) => label?.placement === "adjacent" ? 1 : PAD;

export function placeSvgTrajectoryLabels(input: Parameters<typeof placePlotLabels>[0], activeLabelId: string | null) {
  return placePlotLabels({ ...input, labels: input.labels.map(label => label.id === activeLabelId ? { ...label, priority: 10000 } : label) });
}

/** Measure actual SVG glyph bounds in viewBox units, never CSS viewport pixels. */
export function useSvgTrajectoryLabels(labels: readonly SvgTrajectoryLabel[], bounds: PlotLabelRect, obstacles: readonly PlotLabelRect[], frameKey: string, activeLabelId: string | null = null) {
  const layerRef = useRef<SVGGElement>(null);
  const previous = useRef<{ intent: string; placements: ReadonlyMap<string, PlotLabelPlacement> } | null>(null);
  const [measured, setMeasured] = useState<{ key: string; metrics: Map<string, TextMetric>; obstacles: PlotLabelRect[] } | null>(null);
  // Resizing/font completion can reuse valid offsets. A new fitted frame, axis,
  // anchor or manual drag is a new intent and must win over the old placement.
  const intent = JSON.stringify({ frameKey, labels });
  const key = JSON.stringify({ intent, bounds, obstacles });
  const current = measured?.key === key ? measured : null;
  const metrics = useMemo(() => new Map(labels.map((label) => [label.id, current?.metrics.get(label.id) ?? {
    // Conservative pre-font/SSR bounds; the mounted SVG replaces these with glyph measurements.
    width: Math.max(label.fontSize, [...label.text].reduce((sum, char) => sum + (/[^\u0000-\u00ff]/u.test(char) ? 1 : 0.68), 0) * label.fontSize) + labelPadding(label) * 2,
    height: label.fontSize * 1.25 + labelPadding(label) * 2,
    baselineX: labelPadding(label),
    baselineY: label.fontSize + labelPadding(label),
  }])), [key, current]);
  const placements = useMemo(() => placeSvgTrajectoryLabels({
    labels: labels.map((label) => ({ ...label, ...metrics.get(label.id)! })),
    bounds,
    obstacles: [...obstacles, ...(current?.obstacles ?? [])],
    previous: previous.current?.intent === intent ? previous.current.placements : undefined,
  }, activeLabelId), [key, metrics, current, activeLabelId]);

  useLayoutEffect(() => { previous.current = { intent, placements }; }, [intent, placements]);

  useLayoutEffect(() => {
    const layer = layerRef.current, svg = layer?.ownerSVGElement;
    if (!layer || !svg || labels.length === 0) return;
    let active = true, frame: number | null = null;
    const measure = () => {
      frame = null;
      if (!active) return;
      const next = new Map<string, TextMetric>();
      for (const text of layer.querySelectorAll<SVGTextElement>("text[data-ena-label-measure]")) {
        const id = text.dataset.enaLabelMeasure;
        if (!id) continue;
        const box = text.getBBox(), pad = labelPadding(labels.find(label => label.id === id));
        if (box.width > 0 && box.height > 0) next.set(id, { width: box.width + pad * 2, height: box.height + pad * 2, baselineX: pad - box.x, baselineY: pad - box.y });
      }
      const reserved = [...svg.querySelectorAll<SVGGraphicsElement>(".ena-zero-axes text, .ena-reference-figure-provenance")].map((element) => {
        const box = element.getBBox();
        return { x: box.x - PAD, y: box.y - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
      });
      setMeasured((previous) => {
        const unchanged = previous?.key === key && next.size === previous.metrics.size
          && [...next].every(([id, metric]) => JSON.stringify(metric) === JSON.stringify(previous.metrics.get(id)))
          && JSON.stringify(reserved) === JSON.stringify(previous.obstacles);
        return unchanged ? previous : { key, metrics: next, obstacles: reserved };
      });
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(svg);
    const fonts = svg.ownerDocument.fonts;
    void fonts?.ready.then(() => { if (active) schedule(); });
    fonts?.addEventListener("loadingdone", schedule);
    svg.ownerDocument.addEventListener("fullscreenchange", schedule);
    return () => {
      active = false;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      fonts?.removeEventListener("loadingdone", schedule);
      svg.ownerDocument.removeEventListener("fullscreenchange", schedule);
    };
  }, [key]);
  return { layerRef, metrics, placements };
}
