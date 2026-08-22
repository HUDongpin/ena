"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import {
  compileOpenEna3dPlotSpec,
  type OpenEna3dCamera,
  type OpenEna3dPlotSpec,
} from "@/lib/open-ena/plot3d";
import type { CameraPreset, OpenEnaResult } from "@/lib/open-ena/types";

type PlotlyApi = (typeof import("plotly.js-dist-min"))["default"];
type RenderStatus = "loading" | "ready" | "error";

export interface OpenEnaInteractive3DPlotProps {
  result: OpenEnaResult;
  codeColors?: OpenEnaCodeColors;
  groupColumn: string | null;
  xDimension: string;
  yDimension: string;
  zDimension: string;
  camera: CameraPreset;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  showVariance: boolean;
  showTrajectories: boolean;
  edgeScale: number;
  edgeThreshold: number;
  pointScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  plotResetRevision?: number;
  initialCamera?: OpenEna3dCamera | null;
  onCameraChange?: (camera: OpenEna3dCamera) => void;
  copy: OpenEnaCopy;
}

interface PlotlyEventRoot extends HTMLDivElement {
  on?: (event: "plotly_relayout", listener: (update: Record<string, unknown>) => void) => void;
  removeListener?: (event: "plotly_relayout", listener: (update: Record<string, unknown>) => void) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cameraVector(value: unknown, fallback: OpenEna3dCamera["eye"]) {
  if (!isRecord(value)) return { ...fallback };
  return {
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : fallback.x,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : fallback.y,
    z: typeof value.z === "number" && Number.isFinite(value.z) ? value.z : fallback.z,
  };
}

function cameraFromRelayout(update: Record<string, unknown>, fallback: OpenEna3dCamera) {
  const value = update["scene.camera"];
  if (!isRecord(value)) return null;
  const projectionType = isRecord(value.projection) ? value.projection.type : null;
  const projection: OpenEna3dCamera["projection"] = projectionType === "orthographic" || projectionType === "perspective"
    ? { type: projectionType }
    : { ...fallback.projection };
  return {
    center: cameraVector(value.center, fallback.center),
    eye: cameraVector(value.eye, fallback.eye),
    up: cameraVector(value.up, fallback.up),
    projection,
  } satisfies OpenEna3dCamera;
}

function exactCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

export default function OpenEnaInteractive3DPlot({
  result,
  codeColors,
  groupColumn,
  xDimension,
  yDimension,
  zDimension,
  camera,
  showPoints,
  showNetworks,
  showLabels,
  showUnitLabels,
  showVariance,
  showTrajectories,
  edgeScale,
  edgeThreshold,
  pointScale,
  plotZoom,
  flipX,
  flipY,
  plotResetRevision = 0,
  initialCamera = null,
  onCameraChange,
  copy,
}: OpenEnaInteractive3DPlotProps) {
  const plotRootRef = useRef<HTMLDivElement>(null);
  const lastAppliedCameraKeyRef = useRef<string | null>(null);
  const initialCameraRef = useRef(initialCamera);
  const lastCameraRef = useRef(initialCamera);
  const relayoutListenerRef = useRef<((update: Record<string, unknown>) => void) | null>(null);
  const [Plotly, setPlotly] = useState<PlotlyApi | null>(null);
  const [status, setStatus] = useState<RenderStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const spec = useMemo<OpenEna3dPlotSpec>(() => compileOpenEna3dPlotSpec({
    result,
    codeColors,
    groupColumn,
    xDimension,
    yDimension,
    zDimension,
    camera,
    showPoints,
    showNetworks,
    showLabels,
    showUnitLabels,
    showVariance,
    showTrajectories,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    flipX,
    flipY,
  }), [
    result,
    codeColors,
    groupColumn,
    xDimension,
    yDimension,
    zDimension,
    camera,
    showPoints,
    showNetworks,
    showLabels,
    showUnitLabels,
    showVariance,
    showTrajectories,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    flipX,
    flipY,
  ]);
  const cameraResetKey = `${camera}:${plotZoom}:${plotResetRevision}`;

  useEffect(() => {
    let active = true;
    let loadedPlotly: PlotlyApi | null = null;
    const plotRoot = plotRootRef.current;

    void import("plotly.js-dist-min")
      .then(({ default: module }) => {
        loadedPlotly = module;
        if (active) setPlotly(module);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Plotly could not be loaded.");
        setStatus("error");
      });

    return () => {
      active = false;
      const Plotly = loadedPlotly;
      const eventRoot = plotRoot as PlotlyEventRoot | null;
      if (eventRoot && relayoutListenerRef.current) {
        eventRoot.removeListener?.("plotly_relayout", relayoutListenerRef.current);
        relayoutListenerRef.current = null;
      }
      if (Plotly && plotRoot) Plotly.purge(plotRoot);
    };
  }, []);

  useEffect(() => {
    if (!Plotly || !plotRootRef.current) return;
    const plotRoot = plotRootRef.current;
    const resizeObserver = new ResizeObserver(() => {
      try {
        void Plotly.Plots.resize(plotRoot);
      } catch {
        // A detached plot can race a final observer notification during unmount.
      }
    });
    resizeObserver.observe(plotRoot);
    return () => resizeObserver.disconnect();
  }, [Plotly]);

  useEffect(() => {
    if (!Plotly || !plotRootRef.current) return;
    let active = true;
    const plotRoot = plotRootRef.current;
    setStatus("loading");
    setErrorMessage(null);

    void (async () => {
      try {
        await Plotly.react(
          plotRoot,
          spec.data as never[],
          spec.layout as never,
          spec.config as never,
        );
        if (!active) return;
        if (lastAppliedCameraKeyRef.current !== cameraResetKey) {
          const nextCamera = lastAppliedCameraKeyRef.current === null && initialCameraRef.current
            ? initialCameraRef.current
            : spec.layout.scene.camera;
          await Plotly.relayout(
            plotRoot,
            { "scene.camera": nextCamera } as never,
          );
          if (!active) return;
          lastCameraRef.current = nextCamera;
          lastAppliedCameraKeyRef.current = cameraResetKey;
        }
        const eventRoot = plotRoot as PlotlyEventRoot;
        if (!relayoutListenerRef.current && eventRoot.on) {
          const listener = (update: Record<string, unknown>) => {
            const fallback = lastCameraRef.current ?? spec.layout.scene.camera;
            const nextCamera = cameraFromRelayout(update, fallback);
            if (!nextCamera) return;
            lastCameraRef.current = nextCamera;
            onCameraChange?.(nextCamera);
          };
          relayoutListenerRef.current = listener;
          eventRoot.on("plotly_relayout", listener);
        }
        setStatus("ready");
      } catch (error: unknown) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "The interactive 3D plot could not be rendered.");
        setStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [Plotly, spec, cameraResetKey, onCameraChange]);

  const fittedSpaceStatement = `${copy.plot.sameFittedSpace} ${copy.plot.threeDInteractionHint}`;

  return (
    <figure className="open-ena-plot-figure open-ena-interactive-3d-figure">
      <div
        className="open-ena-interactive-3d-region"
        role="region"
        tabIndex={0}
        aria-label={`${copy.workspace.comparison}, ${copy.views.threeD}`}
        aria-busy={status === "loading"}
        data-testid="open-ena-interactive-3d-plot"
        data-ena-dimensions="3"
        data-ena-interactive-camera="true"
      >
        <p className="sr-only">{fittedSpaceStatement}</p>
        {status === "loading" ? (
          <p className="open-ena-interactive-3d-status" role="status" aria-live="polite">
            {copy.views.threeD}…
          </p>
        ) : null}
        {status === "error" ? (
          <p className="open-ena-interactive-3d-error" role="alert">
            {copy.plot.threeDUnavailable}{errorMessage ? ` (${errorMessage})` : ""}
          </p>
        ) : null}
        <div
          ref={plotRootRef}
          className="open-ena-interactive-3d-canvas"
        />
      </div>

      <details
        className="ena-result-summary open-ena-interactive-3d-summary"
        open={status === "error" ? true : undefined}
      >
        <summary>{copy.workspace.accessibleSummary}</summary>
        <p data-ena-fitted-space="same-jena-space">{fittedSpaceStatement}</p>
        <table>
          <caption>{copy.workspace.groupMeans} — exact fitted coordinates</caption>
          <thead>
            <tr>
              <th scope="col">{copy.workspace.groups}</th>
              <th scope="col">{xDimension}</th>
              <th scope="col">{yDimension}</th>
              <th scope="col">{zDimension}</th>
            </tr>
          </thead>
          <tbody>
            {result.groups.map((group) => (
              <tr key={group.name}>
                <th scope="row">{group.name} (n = {group.count})</th>
                <td>{exactCoordinate(group.meanPoint[xDimension])}</td>
                <td>{exactCoordinate(group.meanPoint[yDimension])}</td>
                <td>{exactCoordinate(group.meanPoint[zDimension])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <figcaption>
        {copy.workspace.methodNote} {fittedSpaceStatement}
      </figcaption>
    </figure>
  );
}
