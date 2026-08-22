"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type { OpenEnaPairwiseContrast } from "@/lib/open-ena/contrasts";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import {
  compileOpenEna3dPlotSpec,
  type OpenEna3dCamera,
  type OpenEna3dPlotKind,
  type OpenEna3dPlotSpec,
} from "@/lib/open-ena/plot3d";
import type { CameraPreset, OpenEnaResult } from "@/lib/open-ena/types";

type PlotlyApi = (typeof import("plotly.js-dist-min"))["default"];
type RenderStatus = "loading" | "ready" | "error";

export interface OpenEnaInteractive3DPlotProps {
  result: OpenEnaResult;
  contrast?: OpenEnaPairwiseContrast | null;
  plotKind?: OpenEna3dPlotKind;
  compact?: boolean;
  displayModeBar?: boolean;
  showAccessibleSummary?: boolean;
  showCaption?: boolean;
  testId?: string;
  ariaLabel?: string;
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
  _fullLayout?: {
    scene?: {
      _scene?: {
        getCamera?: () => unknown;
      };
    };
  };
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

function cameraFromValue(value: unknown, fallback: OpenEna3dCamera) {
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

function cameraFromRelayout(update: Record<string, unknown>, fallback: OpenEna3dCamera) {
  return cameraFromValue(update["scene.camera"], fallback);
}

function cameraKey(camera: OpenEna3dCamera | null | undefined) {
  if (!camera) return null;
  return JSON.stringify({
    center: camera.center,
    eye: camera.eye,
    up: camera.up,
    projection: camera.projection,
  });
}

function exactCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

export default function OpenEnaInteractive3DPlot({
  result,
  contrast = null,
  plotKind = "comparison",
  compact = false,
  displayModeBar = !compact,
  showAccessibleSummary = !compact,
  showCaption = !compact,
  testId = plotKind === "comparison"
    ? "open-ena-interactive-3d-plot"
    : `open-ena-3d-${plotKind}-plot`,
  ariaLabel,
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
  initialCameraRef.current = initialCamera;

  const spec = useMemo<OpenEna3dPlotSpec>(() => compileOpenEna3dPlotSpec({
    result,
    contrast,
    plotKind,
    compact,
    displayModeBar,
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
    contrast,
    plotKind,
    compact,
    displayModeBar,
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
  const controlledCameraKey = cameraKey(initialCamera);
  const networkTraces = spec.data.filter((trace) => trace.meta.role === "network-edge");
  const unitPointGroups = spec.data
    .filter((trace) => trace.meta.role === "unit-points")
    .map((trace) => trace.meta.groupName)
    .filter((groupName): groupName is string => Boolean(groupName));
  const networkGroups = [...new Set(networkTraces
    .map((trace) => trace.meta.groupName)
    .filter((groupName): groupName is string => Boolean(groupName)))];
  const edgeScaleDenominator = networkTraces[0]?.meta.edgeScaleDenominator ?? 0;

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
      const fallbackCamera = lastCameraRef.current ?? initialCameraRef.current ?? spec.layout.scene.camera;
      const runtimeCamera = cameraFromValue(
        eventRoot?._fullLayout?.scene?._scene?.getCamera?.(),
        fallbackCamera,
      );
      if (runtimeCamera) {
        lastCameraRef.current = runtimeCamera;
        onCameraChange?.(runtimeCamera);
      }
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
        void Promise.resolve(Plotly.Plots.resize(plotRoot)).catch(() => {
          // Plotly rejects when a final observer callback reaches a detached plot.
        });
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
            const nextCamera = cameraFromRelayout(update, fallback) ?? cameraFromValue(
              eventRoot._fullLayout?.scene?._scene?.getCamera?.(),
              fallback,
            );
            if (!nextCamera) return;
            if (cameraKey(nextCamera) === cameraKey(lastCameraRef.current)) return;
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

  useEffect(() => {
    if (!Plotly || status !== "ready" || !plotRootRef.current || !initialCamera) return;
    if (controlledCameraKey === cameraKey(lastCameraRef.current)) return;
    const plotRoot = plotRootRef.current;
    lastCameraRef.current = initialCamera;
    void Promise.resolve(Plotly.relayout(
      plotRoot,
      { "scene.camera": initialCamera } as never,
    )).catch(() => {
      // A sibling can unmount while a linked-camera update is in flight.
    });
  }, [Plotly, controlledCameraKey, initialCamera, status]);

  const fittedSpaceStatement = `${copy.plot.sameFittedSpace} ${copy.plot.threeDInteractionHint}`;
  const summaryGroups = contrast
    ? result.groups.filter((group) => (
        plotKind === "primary"
          ? group.name === contrast.primary.name
          : plotKind === "secondary"
            ? group.name === contrast.secondary.name
            : group.name === contrast.primary.name || group.name === contrast.secondary.name
      ))
    : result.groups;
  const resolvedAriaLabel = ariaLabel ?? `${copy.workspace.comparison}, ${copy.views.threeD}`;

  return (
    <figure
      className="open-ena-plot-figure open-ena-interactive-3d-figure"
      data-ena-plot-kind={plotKind}
      data-ena-plot-size={compact ? "compact" : "main"}
    >
      <div
        className="open-ena-interactive-3d-region"
        role="region"
        tabIndex={0}
        aria-label={resolvedAriaLabel}
        aria-busy={status === "loading"}
        data-testid={testId}
        data-ena-dimensions="3"
        data-ena-interactive-camera="true"
        data-ena-camera-sync={contrast ? "shared" : "single"}
        data-ena-scene-frame="full-result"
        data-ena-plot-role={plotKind}
        data-ena-camera-state={controlledCameraKey ?? cameraKey(spec.layout.scene.camera) ?? undefined}
        data-ena-x-range={spec.layout.scene.xaxis.range.join(",")}
        data-ena-y-range={spec.layout.scene.yaxis.range.join(",")}
        data-ena-z-range={spec.layout.scene.zaxis.range.join(",")}
        data-ena-unit-point-groups={unitPointGroups.join("|")}
        data-ena-network-groups={networkGroups.join("|")}
        data-ena-network-scale-denominator={edgeScaleDenominator}
        data-ena-code-node-count={spec.data.find((trace) => trace.meta.role === "code-node")?.x.length ?? 0}
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
          data-ena-plotly-root="true"
        />
      </div>

      {showAccessibleSummary ? (
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
              {summaryGroups.map((group) => (
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
      ) : null}

      {showCaption ? (
        <figcaption>
          {copy.workspace.methodNote} {fittedSpaceStatement}
        </figcaption>
      ) : null}
    </figure>
  );
}
