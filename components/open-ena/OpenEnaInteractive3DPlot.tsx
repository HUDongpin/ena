"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createOpenEnaPlotViewSyncV3, openEnaPlotViewFieldsV3 } from "@/lib/open-ena/plot-view-sync-v3";
import type { OpenEnaContrastPresentation } from "@/lib/open-ena/bound-presentation-v3";
import type { OpenEnaPlotResult } from "@/lib/open-ena/bound-presentation-v3";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type { OpenEnaPairwiseContrast } from "@/lib/open-ena/contrasts";
import type { OpenEnaDerivedGroupDisplay } from "@/lib/open-ena/group-display";
import {
  isolateOpenEnaFallbackFullscreenOutsideTreeV3,
  nextOpenEnaFallbackFullscreenFocusV3,
} from "@/lib/open-ena/longitudinal-v3-display";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import { dragOpenEnaNodeIn3d, type OpenEnaNodePosition3d } from "@/lib/open-ena/node-drag-3d";
import type {
  OpenEnaNodeDimensionPosition,
  OpenEnaNodeLayoutPositions,
} from "@/lib/open-ena/node-layout";
import { compileOpenEnaOrdered3dPlotSpec } from "@/lib/open-ena/ordered-plot3d";
import type {
  OpenEnaCodeGraphPresentation,
  OpenEnaOrderedNodeTotals,
  OpenEnaOrderedPlotScope,
} from "@/lib/open-ena/ordered-plot";
import {
  cameraForPreset,
  compileOpenEna3dPlotSpec,
  type OpenEna3dAspectRatio,
  type OpenEna3dCamera,
  type OpenEna3dPlotKind,
  type OpenEna3dPlotSpec,
} from "@/lib/open-ena/plot3d";
import type { CameraPreset, OpenEnaConfig, OpenEnaResult } from "@/lib/open-ena/types";
import OpenEnaPlotActionIcon from "./OpenEnaPlotActionIcon";
import {
  getPlotlyGl3d,
  schedulePlotlyGl3dRole,
  type PlotlyGl3dApi,
  type PlotlyGl3dPointEvent,
} from "./plotly-gl3d-loader";

import { createOpenEnaPlotlyResourceOwnerV3, runOpenEnaPlotlyViewTransactionV3, type OpenEnaOwnedGlSceneV3 } from "../../lib/open-ena/plotly-resource-owner-v3";

type PlotlyApi = PlotlyGl3dApi;
type PlotlyImageApi = PlotlyApi & {
  toImage: (
    root: HTMLDivElement,
    options: { format: "png"; filename: string; width: number; height: number; scale: number },
  ) => Promise<string>;
};
export type OpenEna3dRenderStatus = "loading" | "ready" | "error";
type RenderStatus = OpenEna3dRenderStatus;

export function openEna3dFullscreenMode(capabilities: {
  requestFullscreen: unknown;
  exitFullscreen: unknown;
}): "native" | "fallback" {
  return typeof capabilities.requestFullscreen === "function"
    && typeof capabilities.exitFullscreen === "function"
    ? "native"
    : "fallback";
}

import { performPlotImageExportV3, type OpenEnaImageExportLeaseV3 } from "../../lib/open-ena/plot-image-export-v3";

export interface OpenEnaInteractive3DPlotProps extends OpenEnaCodeGraphPresentation {
  analysisKind?: "ena" | "ona";
  result: OpenEnaPlotResult;
  orderedConfig?: OpenEnaConfig;
  orderedScope?: OpenEnaOrderedPlotScope;
  orderedNodeTotals?: OpenEnaOrderedNodeTotals;
  contrast?: OpenEnaContrastPresentation | null;
  groupDisplay?: Pick<OpenEnaDerivedGroupDisplay, "primary" | "secondary" | "hiddenUnitKeys">;
  plotKind?: OpenEna3dPlotKind;
  compact?: boolean;
  displayModeBar?: boolean;
  showAccessibleSummary?: boolean;
  showCaption?: boolean;
  testId?: string;
  ariaLabel?: string;
  fullscreenTarget?: {
    id: string;
    ref: RefObject<HTMLElement | null>;
  };
  /** Native Workspace supplies its current model lease and identity approval.
   * Standalone callers retain their existing explicit user-action export policy. */
  captureImageExport?: () => OpenEnaImageExportLeaseV3 | null;
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
  nodeLayout?: OpenEnaNodeLayoutPositions;
  onNodeMove?: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
  plotResetRevision?: number;
  initialCamera?: OpenEna3dCamera | null;
  onCameraChange?: (camera: OpenEna3dCamera) => void;
  initialAspectRatio?: OpenEna3dAspectRatio | null;
  onAspectRatioChange?: (aspectRatio: OpenEna3dAspectRatio | null) => void;
  onReady?: () => void;
  onError?: () => void;
  onStatusChange?: (status: OpenEna3dRenderStatus) => void;
  copy: OpenEnaCopy;
}

interface PlotlyEventRoot extends HTMLDivElement {
  on?: {
    (event: "plotly_relayout", listener: (update: Record<string, unknown>) => void): void;
    (event: "plotly_hover" | "plotly_unhover", listener: (event: PlotlyGl3dPointEvent) => void): void;
  };
  removeListener?: {
    (event: "plotly_relayout", listener: (update: Record<string, unknown>) => void): void;
    (event: "plotly_hover" | "plotly_unhover", listener: (event: PlotlyGl3dPointEvent) => void): void;
  };
  _fullLayout?: {
    scene?: {
      aspectmode?: "auto" | "cube" | "data" | "manual";
      _scene?: {
        getCamera?: () => unknown;
        glplot?: {
          getAspectratio?: () => unknown;
        };
      };
    };
  };
}

export function openEna3dCodePositionByIdentity(spec: OpenEna3dPlotSpec, code: string) {
  const trace = spec.data.find((candidate) => candidate.meta.role === "code-node");
  const pointNumber = (trace?.ids ?? trace?.text)?.indexOf(code) ?? -1;
  if (pointNumber < 0) return null;
  const x = trace?.x[pointNumber];
  const y = trace?.y[pointNumber];
  const z = trace?.z[pointNumber];
  return typeof x === "number" && typeof y === "number" && typeof z === "number"
    ? { x, y, z }
    : null;
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

function aspectRatioFromValue(value: unknown, fallback: OpenEna3dAspectRatio) {
  if (!isRecord(value)) return null;
  const x = typeof value.x === "number" && Number.isFinite(value.x) && value.x > 0 ? value.x : fallback.x;
  const y = typeof value.y === "number" && Number.isFinite(value.y) && value.y > 0 ? value.y : fallback.y;
  const z = typeof value.z === "number" && Number.isFinite(value.z) && value.z > 0 ? value.z : fallback.z;
  return { x, y, z } satisfies OpenEna3dAspectRatio;
}

function aspectRatioKey(aspectRatio: OpenEna3dAspectRatio | null | undefined) {
  return aspectRatio ? JSON.stringify(aspectRatio) : null;
}

function exactCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

function pngBlobFromDataUrl(dataUrl: string) {
  const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/iu.exec(dataUrl);
  if (!match?.[1]) throw new Error("Plotly did not return a PNG image.");
  const binary = window.atob(match[1]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

function fallbackFullscreenFocusables(target: HTMLElement) {
  return [...target.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
    + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => (
    element.getAttribute("aria-hidden") !== "true"
    && !element.hasAttribute("hidden")
    && element.getClientRects().length > 0
  ));
}

function restoreAttribute(target: HTMLElement, name: string, value: string | null) {
  if (value === null) target.removeAttribute(name);
  else target.setAttribute(name, value);
}

export const OPEN_ENA_3D_CAMERA_ZOOM_STEP = 1.2;
const MIN_CAMERA_DISTANCE_FACTOR = 0.35;
const MAX_CAMERA_DISTANCE_FACTOR = 3;
const UNIT_ASPECT_RATIO: OpenEna3dAspectRatio = { x: 1, y: 1, z: 1 };

function cameraDistance(camera: OpenEna3dCamera) {
  return Math.hypot(camera.eye.x, camera.eye.y, camera.eye.z);
}

export function zoomOpenEna3dCamera(
  camera: OpenEna3dCamera,
  reference: OpenEna3dCamera,
  direction: "in" | "out",
) {
  const distance = cameraDistance(camera);
  const referenceDistance = Math.max(cameraDistance(reference), Number.EPSILON);
  const requestedDistance = distance * (
    direction === "in" ? 1 / OPEN_ENA_3D_CAMERA_ZOOM_STEP : OPEN_ENA_3D_CAMERA_ZOOM_STEP
  );
  const nextDistance = Math.min(
    referenceDistance * MAX_CAMERA_DISTANCE_FACTOR,
    Math.max(referenceDistance * MIN_CAMERA_DISTANCE_FACTOR, requestedDistance),
  );
  const distanceScale = distance > Number.EPSILON ? nextDistance / distance : 1;
  return {
    ...camera,
    center: { ...camera.center },
    eye: {
      x: camera.eye.x * distanceScale,
      y: camera.eye.y * distanceScale,
      z: camera.eye.z * distanceScale,
    },
    up: { ...camera.up },
    projection: { ...camera.projection },
  } satisfies OpenEna3dCamera;
}

export function resetOpenEna3dCameraDistance(
  camera: OpenEna3dCamera,
  reference: OpenEna3dCamera,
) {
  const distance = cameraDistance(camera);
  const referenceDistance = cameraDistance(reference);
  const eye = distance > Number.EPSILON
    ? {
        x: camera.eye.x * referenceDistance / distance,
        y: camera.eye.y * referenceDistance / distance,
        z: camera.eye.z * referenceDistance / distance,
      }
    : { ...reference.eye };
  return {
    center: { ...camera.center },
    eye,
    up: { ...camera.up },
    projection: { ...camera.projection },
  } satisfies OpenEna3dCamera;
}

export function zoomOpenEna3dAspectRatio(
  aspectRatio: OpenEna3dAspectRatio,
  reference: OpenEna3dAspectRatio,
  direction: "in" | "out",
) {
  const scale = direction === "in" ? OPEN_ENA_3D_CAMERA_ZOOM_STEP : 1 / OPEN_ENA_3D_CAMERA_ZOOM_STEP;
  const boundedAxis = (value: number, referenceValue: number) => Math.min(
    referenceValue * MAX_CAMERA_DISTANCE_FACTOR,
    Math.max(referenceValue * MIN_CAMERA_DISTANCE_FACTOR, value * scale),
  );
  return {
    x: boundedAxis(aspectRatio.x, reference.x),
    y: boundedAxis(aspectRatio.y, reference.y),
    z: boundedAxis(aspectRatio.z, reference.z),
  } satisfies OpenEna3dAspectRatio;
}

export default function OpenEnaInteractive3DPlot({
  analysisKind = "ena",
  result,
  orderedConfig,
  orderedScope,
  orderedNodeTotals,
  contrast = null,
  groupDisplay,
  plotKind = "comparison",
  compact = false,
  displayModeBar = false,
  showAccessibleSummary = !compact,
  showCaption = !compact,
  testId = plotKind === "comparison"
    ? "open-ena-interactive-3d-plot"
    : `open-ena-3d-${plotKind}-plot`,
  ariaLabel,
  fullscreenTarget,
  captureImageExport,
  codeColors,
  groupColumn,
  xDimension,
  yDimension,
  zDimension,
  camera,
  showPoints,
  showNetworks,
  showLabels,
  showCodeGraph = true,
  codeVisibility,
  codeSourceByRenderedCode, codeLabelByRenderedCode,
  showUnitLabels,
  showVariance,
  showTrajectories,
  edgeScale,
  edgeThreshold,
  pointScale,
  plotZoom,
  flipX,
  flipY,
  nodeLayout,
  onNodeMove,
  plotResetRevision = 0,
  initialCamera = null,
  onCameraChange,
  initialAspectRatio = null,
  onAspectRatioChange,
  onReady,
  onError,
  onStatusChange,
  copy,
}: OpenEnaInteractive3DPlotProps) {
  const instanceId = useId();
  const figureRef = useRef<HTMLElement>(null);
  const plotRootRef = useRef<HTMLDivElement>(null);
  const lastAppliedCameraKeyRef = useRef<string | null>(null);
  const lastRenderedSceneRef = useRef<{ fit: object; axes: string } | null>(null);
  const initialCameraRef = useRef(initialCamera);
  const lastCameraRef = useRef(initialCamera);
  const initialAspectRatioRef = useRef(initialAspectRatio);
  const lastAspectRatioRef = useRef(initialAspectRatio);
  const ownedViewSyncRef = useRef(createOpenEnaPlotViewSyncV3());
  const userViewRevisionRef = useRef(0);
  const latestCameraResetKeyRef = useRef("");
  const plotResourcesRef = useRef<ReturnType<typeof createOpenEnaPlotlyResourceOwnerV3> | null>(null);
  const relayoutListenerRef = useRef<((update: Record<string, unknown>) => void) | null>(null);
  const hoverListenerRef = useRef<((event: PlotlyGl3dPointEvent) => void) | null>(null);
  const unhoverListenerRef = useRef<((event: PlotlyGl3dPointEvent) => void) | null>(null);
  const hoveredCodeRef = useRef<{ code: string } | null>(null);
  const activeNodeDragRef = useRef<{
    pointerId: number;
    target: HTMLDivElement;
    code: string;
    startClientX: number;
    startClientY: number;
    startPosition: OpenEnaNodePosition3d;
  } | null>(null);
  const pendingNodeMoveRef = useRef<{ code: string; next: OpenEnaNodePosition3d } | null>(null);
  const visibleCodeIdentitiesRef = useRef<ReadonlySet<string>>(new Set());
  const nodeMoveFrameRef = useRef<number | null>(null);
  const actionStatusTimerRef = useRef<number | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const fullscreenInitiatorRef = useRef<HTMLButtonElement | null>(null);
  const fullscreenResizeFrameRef = useRef<number | null>(null);
  const nativeTrajectoryFullscreenSizedRef = useRef(false);
  const fullscreenFocusFrameRef = useRef<number | null>(null);
  const fullscreenRequestPendingRef = useRef(false);
  const fullscreenStateRef = useRef(false);
  const fallbackFullscreenCleanupRef = useRef<(() => void) | null>(null);
  const plotlyRef = useRef<PlotlyApi | null>(null);
  const renderStatusRef = useRef<RenderStatus>("loading");
  const readyNotifiedRef = useRef(false);
  const errorNotifiedRef = useRef(false);
  const [Plotly, setPlotly] = useState<PlotlyApi | null>(null);
  const [status, setStatus] = useState<RenderStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const actionPendingRef = useRef(false), actionEpochRef = useRef(0);
  useEffect(() => {
    actionEpochRef.current++; actionPendingRef.current = false; setActionPending(false);
    return () => { actionEpochRef.current++; actionPendingRef.current = false; };
  }, [result, xDimension, yDimension, zDimension]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [nodeDragging, setNodeDragging] = useState<string | null>(null);
  const generatedFullscreenTargetId = `open-ena-interactive-3d-fullscreen-target-${instanceId}`;
  const fullscreenTargetId = fullscreenTarget?.id ?? generatedFullscreenTargetId;
  const fullscreenTargetRef = fullscreenTarget?.ref ?? figureRef;
  const plotLabel = plotKind === "comparison"
    ? copy.plot.threeDComparisonPlot
    : plotKind === "primary"
      ? copy.plot.threeDPrimaryPlot
      : copy.plot.threeDSecondaryPlot;
  const fallbackFullscreenLabel = `${plotLabel}: ${copy.plot.fullscreenDialog}`;
  const canvasId = `open-ena-interactive-3d-canvas-${instanceId}`;
  initialCameraRef.current = initialCamera;
  initialAspectRatioRef.current = initialAspectRatio;
  plotlyRef.current = Plotly;
  renderStatusRef.current = status;

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const spec = useMemo<OpenEna3dPlotSpec>(() => {
    if (analysisKind === "ona") {
      if (!orderedConfig || !orderedScope) {
        throw new Error("ONA 3D requires an ordered configuration and plot scope.");
      }
      return compileOpenEnaOrdered3dPlotSpec({
        result,
        config: orderedConfig,
        scope: orderedScope,
        xDimension,
        yDimension,
        zDimension,
        camera,
        showPoints,
        showNetworks,
        showLabels,
        showCodeGraph,
        codeVisibility,
        codeSourceByRenderedCode, codeLabelByRenderedCode,
        showUnitLabels,
        showVariance,
        edgeScale,
        edgeThreshold,
        pointScale,
        plotZoom,
        flipX,
        flipY,
        compact,
        codeColors,
        nodeTotals: orderedNodeTotals,
        nodeLayout,
      });
    }
    return compileOpenEna3dPlotSpec({
      result,
      contrast,
      groupDisplay,
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
      showCodeGraph,
      codeVisibility,
      codeSourceByRenderedCode, codeLabelByRenderedCode,
      showUnitLabels,
      showVariance,
      showTrajectories,
      edgeScale,
      edgeThreshold,
      pointScale,
      plotZoom,
      flipX,
      flipY,
      nodeLayout,
    });
  }, [
    analysisKind,
    result,
    orderedConfig,
    orderedScope,
    orderedNodeTotals,
    contrast,
    groupDisplay,
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
    showCodeGraph,
    codeVisibility,
    codeSourceByRenderedCode, codeLabelByRenderedCode,
    showUnitLabels,
    showVariance,
    showTrajectories,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    flipX,
    flipY,
    nodeLayout,
  ]);
  // Plotly owns and mutates the layout object handed to react/relayout. Keep
  // detached embedded dimensions before handing over each newly compiled spec.
  const embeddedLayout = useMemo(() => ({
    height: spec.layout.height,
    margin: { ...spec.layout.margin },
    legend: { ...spec.layout.legend },
    scene: { aspectmode: spec.layout.scene.aspectmode },
  }), [spec]);
  const fullscreenLayoutRef = useRef(embeddedLayout);
  fullscreenLayoutRef.current = embeddedLayout;
  const renderedCodeTrace = spec.data.find((trace) => trace.meta.role === "code-node");
  const renderedCodeIdentities = new Set(renderedCodeTrace?.ids ?? renderedCodeTrace?.text ?? []);
  const renderedCodeIdentityKey = JSON.stringify([...renderedCodeIdentities]);
  visibleCodeIdentitiesRef.current = renderedCodeIdentities;
  const cameraResetKey = `${camera}:${plotZoom}:${plotResetRevision}`;
  latestCameraResetKeyRef.current = cameraResetKey;
  // Native display wrappers can be rebuilt without changing the fitted result.
  // Legacy standalone plots retain their actual fitted set as the frame anchor.
  const scientificFrame = result.boundPresentation ?? result.set;
  const sceneAxesKey = JSON.stringify([analysisKind, xDimension, yDimension, zDimension]);
  const controlledCameraKey = cameraKey(initialCamera);
  const controlledAspectRatioKey = aspectRatioKey(initialAspectRatio);
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
    const resources = createOpenEnaPlotlyResourceOwnerV3(() => {
      const scene = (plotRoot as (HTMLDivElement & { _fullLayout?: { scene?: { _scene?: { glplot?: OpenEnaOwnedGlSceneV3 } } } }) | null)?._fullLayout?.scene?._scene?.glplot;
      return scene ?? null;
    });
    plotResourcesRef.current = resources;

    void getPlotlyGl3d()
      .then((module) => {
        loadedPlotly = module;
        if (!active) return;
        return schedulePlotlyGl3dRole(plotKind, () => {
          if (active) setPlotly(module);
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Plotly could not be loaded.");
        setStatus("error");
        if (!errorNotifiedRef.current) {
          errorNotifiedRef.current = true;
          onError?.();
        }
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
      const fallbackAspectRatio = lastAspectRatioRef.current
        ?? initialAspectRatioRef.current
        ?? spec.layout.scene.aspectratio
        ?? UNIT_ASPECT_RATIO;
      const runtimeAspectRatio = aspectRatioFromValue(
        eventRoot?._fullLayout?.scene?._scene?.glplot?.getAspectratio?.(),
        fallbackAspectRatio,
      );
      if (runtimeAspectRatio && runtimeCamera?.projection.type === "orthographic") {
        lastAspectRatioRef.current = runtimeAspectRatio;
        onAspectRatioChange?.(runtimeAspectRatio);
      }
      if (eventRoot && relayoutListenerRef.current) {
        eventRoot.removeListener?.("plotly_relayout", relayoutListenerRef.current);
        relayoutListenerRef.current = null;
      }
      if (eventRoot && hoverListenerRef.current) {
        eventRoot.removeListener?.("plotly_hover", hoverListenerRef.current);
        hoverListenerRef.current = null;
      }
      if (eventRoot && unhoverListenerRef.current) {
        eventRoot.removeListener?.("plotly_unhover", unhoverListenerRef.current);
        unhoverListenerRef.current = null;
      }
      if (nodeMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(nodeMoveFrameRef.current);
        nodeMoveFrameRef.current = null;
      }
      if (actionStatusTimerRef.current !== null) window.clearTimeout(actionStatusTimerRef.current);
      if (Plotly && plotRoot) void resources.close(() => Plotly.purge(plotRoot)).catch(() => {
        // A failed resource cleanup must remain observable after UI unmount.
        console.error(copy.plot.actionUnavailable);
      });
    };
  }, []);

  useEffect(() => {
    if (!Plotly || !plotRootRef.current) return;
    const plotRoot = plotRootRef.current;
    const resizeObserver = new ResizeObserver(() => {
      if (fullscreenStateRef.current && nativeTrajectoryFullscreenSizedRef.current) {
        scheduleFullscreenResize();
        return;
      }
      try {
        void runPlotlyOperation(() => Plotly.Plots.resize(plotRoot)).catch(() => {
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
    const target = fullscreenTargetRef.current;
    if (!target) return;

    const handleFullscreenChange = () => syncFullscreenState(true);
    const handleFallbackFullscreenChange = () => syncFullscreenState(false);
    const handleFullscreenError = () => {
      if (!fullscreenRequestPendingRef.current || document.fullscreenElement === target) return;
      fullscreenRequestPendingRef.current = false;
      enterFallbackFullscreen(target);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (target.getAttribute("data-fallback-fullscreen") !== "true") return;
      if (event.key === "Escape") {
        exitFallbackFullscreen(target, true);
        return;
      }
      if (event.key === "Tab") {
        const focusables = fallbackFullscreenFocusables(target);
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const next = nextOpenEnaFallbackFullscreenFocusV3(focusables, active, event.shiftKey);
        if (next) {
          event.preventDefault();
          next.focus();
        }
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (target.getAttribute("data-fallback-fullscreen") !== "true") return;
      if (event.target instanceof Node && target.contains(event.target)) return;
      (fallbackFullscreenFocusables(target)[0] ?? fullscreenButtonRef.current)?.focus();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("fullscreenerror", handleFullscreenError);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("openena3dfallbackfullscreenchange", handleFallbackFullscreenChange);
    syncFullscreenState(false);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("fullscreenerror", handleFullscreenError);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("openena3dfallbackfullscreenchange", handleFallbackFullscreenChange);
      const ownedFallback = target.getAttribute("data-fallback-fullscreen") === "true";
      target.removeAttribute("data-fallback-fullscreen");
      restoreFallbackFullscreenAccessibility();
      if (ownedFallback) document.dispatchEvent(new Event("openena3dfallbackfullscreenchange"));
      if (fullscreenResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(fullscreenResizeFrameRef.current);
        fullscreenResizeFrameRef.current = null;
      }
      if (fullscreenFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(fullscreenFocusFrameRef.current);
        fullscreenFocusFrameRef.current = null;
      }
      fullscreenRequestPendingRef.current = false;
      fullscreenStateRef.current = false;
      fullscreenInitiatorRef.current = null;
    };
  }, [fullscreenTargetId, fullscreenTargetRef]);

  useEffect(() => {
    if (!Plotly || !plotRootRef.current) return;
    let active = true;
    const plotRoot = plotRootRef.current;
    setStatus("loading");
    readyNotifiedRef.current = false;
    errorNotifiedRef.current = false;
    setErrorMessage(null);
    void (async () => {
      try {
        const owner = plotResourcesRef.current;
        if (!owner) return;
        const applied = await runOpenEnaPlotlyViewTransactionV3(owner, {
          active: () => active,
          revision: () => userViewRevisionRef.current,
          prepare: () => {
            const sameSceneAndReset = lastAppliedCameraKeyRef.current === cameraResetKey
              && lastRenderedSceneRef.current?.fit === scientificFrame
              && lastRenderedSceneRef.current?.axes === sceneAxesKey;
            const retainedView = sameSceneAndReset
              ? { camera: currentCamera(), aspectRatio: currentAspectRatio(), aspectMode: (plotRoot as PlotlyEventRoot)._fullLayout?.scene?.aspectmode ?? spec.layout.scene.aspectmode }
              : null;
            const nextCamera = retainedView?.camera ?? (lastAppliedCameraKeyRef.current === null && initialCameraRef.current
              ? structuredClone(initialCameraRef.current) : structuredClone(spec.layout.scene.camera));
            const nextAspectRatio = retainedView?.aspectRatio ?? (lastAppliedCameraKeyRef.current === null && initialAspectRatioRef.current
              ? { ...initialAspectRatioRef.current } : spec.layout.scene.aspectratio ? { ...spec.layout.scene.aspectratio } : null);
            return { camera: nextCamera, aspectRatio: nextAspectRatio, aspectMode: retainedView?.aspectMode ?? (nextAspectRatio ? "manual" as const : "cube" as const), retained: !!retainedView };
          },
          render: view => {
            // An inactive render may stop after react. The effective view must
            // therefore already be in react, never a transient preset reset.
            const layout = { ...structuredClone(spec.layout), scene: {
              ...structuredClone(spec.layout.scene), camera: structuredClone(view.camera),
              aspectmode: view.aspectMode,
              ...(view.aspectRatio ? { aspectratio: { ...view.aspectRatio } } : {}),
            } };
            return Plotly.react(plotRoot, spec.data as never[], layout as never, spec.config as never);
          },
          currentUserView: view => ({ ...view, camera: lastCameraRef.current ?? currentCamera(), aspectRatio: lastAspectRatioRef.current ?? currentAspectRatio(), aspectMode: (plotRoot as PlotlyEventRoot)._fullLayout?.scene?.aspectmode ?? view.aspectMode }),
          apply: view => ownedViewSyncRef.current.apply({
            "scene.camera": view.camera,
            "scene.aspectmode": view.aspectMode,
            ...(view.aspectMode === "manual" && view.aspectRatio ? { "scene.aspectratio": view.aspectRatio } : {}),
          }, update => Plotly.relayout(plotRoot, update as never)),
        });
        if (!active || !applied) return;
        lastCameraRef.current = applied.camera;
        lastAspectRatioRef.current = applied.aspectRatio;
        lastAppliedCameraKeyRef.current = cameraResetKey;
        if (!applied.retained && aspectRatioKey(applied.aspectRatio) !== controlledAspectRatioKey) onAspectRatioChange?.(applied.aspectRatio);
        lastRenderedSceneRef.current = { fit: scientificFrame, axes: sceneAxesKey };
        const eventRoot = plotRoot as PlotlyEventRoot;
        if (!relayoutListenerRef.current && eventRoot.on) {
          const listener = (update: Record<string, unknown>) => {
            if (ownedViewSyncRef.current.owns(update)) return;
            const viewFields = openEnaPlotViewFieldsV3(update);
            if (!viewFields.camera && !viewFields.aspect) return;
            const fallbackCamera = lastCameraRef.current ?? spec.layout.scene.camera;
            const nextCamera = viewFields.camera ? cameraFromRelayout(update, fallbackCamera) ?? cameraFromValue(
              eventRoot._fullLayout?.scene?._scene?.getCamera?.(),
              fallbackCamera,
            ) : null;
            if (nextCamera && cameraKey(nextCamera) !== cameraKey(lastCameraRef.current)) {
              if (viewFields.camera) userViewRevisionRef.current++;
              lastCameraRef.current = nextCamera;
              onCameraChange?.(nextCamera);
            }

            const fallbackAspectRatio = lastAspectRatioRef.current
              ?? spec.layout.scene.aspectratio
              ?? UNIT_ASPECT_RATIO;
            const nextAspectRatio = viewFields.aspect ? aspectRatioFromValue(
              update["scene.aspectratio"],
              fallbackAspectRatio,
            ) ?? aspectRatioFromValue(
              eventRoot._fullLayout?.scene?._scene?.glplot?.getAspectratio?.(),
              fallbackAspectRatio,
            ) : null;
            if (
              nextAspectRatio
              && (nextCamera ?? fallbackCamera).projection.type === "orthographic"
              && aspectRatioKey(nextAspectRatio) !== aspectRatioKey(lastAspectRatioRef.current)
            ) {
              if (viewFields.aspect) userViewRevisionRef.current++;
              lastAspectRatioRef.current = nextAspectRatio;
              onAspectRatioChange?.(nextAspectRatio);
            }
          };
          relayoutListenerRef.current = listener;
          eventRoot.on("plotly_relayout", listener);
        }
        if (!hoverListenerRef.current && eventRoot.on) {
          const listener = (event: PlotlyGl3dPointEvent) => {
            if (activeNodeDragRef.current) return;
            const point = event.points?.[0];
            const meta = point?.fullData?.meta ?? point?.data?.meta;
            if (!point || !meta || meta.role !== "code-node") {
              hoveredCodeRef.current = null;
              setHoveredCode(null);
              return;
            }
            const code = point.fullData?.ids?.[point.pointNumber] ?? point.data?.ids?.[point.pointNumber]
              ?? point.fullData?.text?.[point.pointNumber] ?? point.data?.text?.[point.pointNumber];
            if (typeof code !== "string" || !code.trim() || !visibleCodeIdentitiesRef.current.has(code)) {
              hoveredCodeRef.current = null;
              setHoveredCode(null);
              return;
            }
            hoveredCodeRef.current = { code };
            setHoveredCode(code);
          };
          hoverListenerRef.current = listener;
          eventRoot.on("plotly_hover", listener);
        }
        if (!unhoverListenerRef.current && eventRoot.on) {
          const listener = () => {
            if (activeNodeDragRef.current) return;
            hoveredCodeRef.current = null;
            setHoveredCode(null);
          };
          unhoverListenerRef.current = listener;
          eventRoot.on("plotly_unhover", listener);
        }
        setStatus("ready");
        if (fullscreenStateRef.current || (result.boundPresentation && result.trajectoryPresentation)) scheduleFullscreenResize();
        if (!readyNotifiedRef.current) {
          readyNotifiedRef.current = true;
          onReady?.();
        }
      } catch (error: unknown) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "The interactive 3D plot could not be rendered.");
        setStatus("error");
        if (!errorNotifiedRef.current) {
          errorNotifiedRef.current = true;
          onError?.();
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [Plotly, spec, cameraResetKey, scientificFrame, sceneAxesKey, onCameraChange, onAspectRatioChange, onReady, onError]);

  useEffect(() => {
    const visibleCodes = visibleCodeIdentitiesRef.current;
    if (hoveredCodeRef.current && !visibleCodes.has(hoveredCodeRef.current.code)) {
      hoveredCodeRef.current = null;
      setHoveredCode(null);
    }
    const pending = pendingNodeMoveRef.current;
    if (pending && !visibleCodes.has(pending.code)) pendingNodeMoveRef.current = null;
    const active = activeNodeDragRef.current;
    if (!active || visibleCodes.has(active.code)) return;
    if (nodeMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(nodeMoveFrameRef.current);
      nodeMoveFrameRef.current = null;
    }
    pendingNodeMoveRef.current = null;
    if (active.target.hasPointerCapture(active.pointerId)) {
      active.target.releasePointerCapture(active.pointerId);
    }
    activeNodeDragRef.current = null;
    setNodeDragging(null);
  }, [renderedCodeIdentityKey]);

  useEffect(() => {
    if (!Plotly || status !== "ready" || !plotRootRef.current || !initialCamera) return;
    const plotRoot = plotRootRef.current, revision = userViewRevisionRef.current;
    let active = true;
    void runPlotlyOperation(async () => {
      if (!active || revision !== userViewRevisionRef.current || controlledCameraKey !== cameraKey(initialCameraRef.current)) return;
      if (controlledCameraKey === cameraKey(lastCameraRef.current)) return;
      lastCameraRef.current = initialCamera;
      await ownedViewSyncRef.current.apply({ "scene.camera": initialCamera }, update => Plotly.relayout(plotRoot, update as never));
    }).catch(() => {
      // A sibling can unmount while a linked-camera update is in flight.
    });
    return () => { active = false; };
  }, [Plotly, controlledCameraKey, initialCamera, status]);

  useEffect(() => {
    if (!Plotly || status !== "ready" || !plotRootRef.current || !initialAspectRatio) return;
    const plotRoot = plotRootRef.current, revision = userViewRevisionRef.current;
    let active = true;
    void runPlotlyOperation(async () => {
      if (!active || revision !== userViewRevisionRef.current || controlledAspectRatioKey !== aspectRatioKey(initialAspectRatioRef.current)) return;
      if (controlledAspectRatioKey === aspectRatioKey(lastAspectRatioRef.current)) return;
      lastAspectRatioRef.current = initialAspectRatio;
      await ownedViewSyncRef.current.apply({
        "scene.aspectmode": "manual",
        "scene.aspectratio": initialAspectRatio,
      }, update => Plotly.relayout(plotRoot, update as never));
    }).catch(() => {
      // A sibling can unmount while a linked orthographic zoom update is in flight.
    });
    return () => { active = false; };
  }, [Plotly, controlledAspectRatioKey, initialAspectRatio, status]);

  const fittedSpaceStatement = `${copy.plot.sameFittedSpace} ${copy.plot.threeDInteractionHint}`;
  const summaryGroups = contrast && plotKind === "comparison"
    ? [
        { side: contrast.primary, display: groupDisplay?.primary },
        { side: contrast.secondary, display: groupDisplay?.secondary },
      ]
        .filter(({ display }) => display?.settings.showMean ?? true)
        .map(({ side }) => ({ name: side.name, count: side.unitCount, meanPoint: side.meanPoint }))
    : contrast
      ? result.groups.filter((group) => (
          plotKind === "primary"
            ? group.name === contrast.primary.name
            : group.name === contrast.secondary.name
        ))
    : result.groups;
  const confidenceIntervalRows = contrast && plotKind === "comparison"
    ? [
        { side: contrast.primary, display: groupDisplay?.primary },
        { side: contrast.secondary, display: groupDisplay?.secondary },
      ].filter(({ display }) => (
        (display?.settings.showMean ?? true) && (display?.settings.showConfidenceIntervals ?? true)
      )).flatMap(({ side }) => (
        [xDimension, yDimension, zDimension].flatMap((dimension) => {
          const interval = side.meanConfidenceIntervalsByDimension?.[dimension];
          return interval ? [{ side, dimension, interval }] : [];
        })
      ))
    : [];
  const resolvedAriaLabel = ariaLabel ?? `${copy.workspace.comparison}, ${copy.views.threeD}`;
  function announceAction(message: string) {
    setActionStatus(message);
    if (actionStatusTimerRef.current !== null) window.clearTimeout(actionStatusTimerRef.current);
    actionStatusTimerRef.current = window.setTimeout(() => {
      setActionStatus("");
      actionStatusTimerRef.current = null;
    }, 2_000);
  }

  function currentCamera() {
    const fallback = lastCameraRef.current ?? initialCameraRef.current ?? spec.layout.scene.camera;
    const eventRoot = plotRootRef.current as PlotlyEventRoot | null;
    return cameraFromValue(eventRoot?._fullLayout?.scene?._scene?.getCamera?.(), fallback) ?? fallback;
  }

  function resetAspectRatio() {
    return { ...UNIT_ASPECT_RATIO };
  }

  function currentAspectRatio() {
    const fallback = lastAspectRatioRef.current ?? initialAspectRatioRef.current ?? resetAspectRatio();
    const eventRoot = plotRootRef.current as PlotlyEventRoot | null;
    return aspectRatioFromValue(
      eventRoot?._fullLayout?.scene?._scene?.glplot?.getAspectratio?.(),
      fallback,
    ) ?? fallback;
  }

  function flushNodeMove() {
    nodeMoveFrameRef.current = null;
    const pending = pendingNodeMoveRef.current;
    pendingNodeMoveRef.current = null;
    if (!pending || !onNodeMove || !visibleCodeIdentitiesRef.current.has(pending.code)) return;
    const { code, next } = pending;
    onNodeMove(code, new Map([[xDimension, next.x], [yDimension, next.y], [zDimension, next.z]]));
  }

  function beginNodeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || status !== "ready" || !onNodeMove || activeNodeDragRef.current) return;
    const hovered = hoveredCodeRef.current;
    if (!hovered || !visibleCodeIdentitiesRef.current.has(hovered.code)) return;
    const position = openEna3dCodePositionByIdentity(spec, hovered.code);
    if (!position) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeNodeDragRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      code: hovered.code,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: position,
    };
    setNodeDragging(hovered.code);
  }

  function moveDraggedNode(event: ReactPointerEvent<HTMLDivElement>) {
    const active = activeNodeDragRef.current;
    if (!active || active.pointerId !== event.pointerId || !visibleCodeIdentitiesRef.current.has(active.code)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = dragOpenEnaNodeIn3d({
      position: active.startPosition,
      deltaPixels: {
        x: event.clientX - active.startClientX,
        y: event.clientY - active.startClientY,
      },
      viewport: { width: bounds.width, height: bounds.height },
      ranges: {
        x: spec.layout.scene.xaxis.range,
        y: spec.layout.scene.yaxis.range,
        z: spec.layout.scene.zaxis.range,
      },
      camera: currentCamera(),
      aspectRatio: currentAspectRatio(),
    });
    pendingNodeMoveRef.current = { code: active.code, next };
    if (nodeMoveFrameRef.current === null) {
      nodeMoveFrameRef.current = window.requestAnimationFrame(flushNodeMove);
    }
  }

  function completeNodeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const active = activeNodeDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (nodeMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(nodeMoveFrameRef.current);
      flushNodeMove();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeNodeDragRef.current = null;
    hoveredCodeRef.current = null;
    setHoveredCode(null);
    setNodeDragging(null);
  }

  function finishNodeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    completeNodeDrag(event);
  }

  function cancelNodeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    pendingNodeMoveRef.current = null;
    completeNodeDrag(event);
  }

  async function applyDisplayCamera(nextCamera: OpenEna3dCamera) {
    if (!Plotly || status !== "ready" || !plotRootRef.current) return;
    const epoch = actionEpochRef.current, root = plotRootRef.current, revision = userViewRevisionRef.current;
    const current = () => actionEpochRef.current === epoch && plotRootRef.current === root && userViewRevisionRef.current === revision && latestCameraResetKeyRef.current === cameraResetKey;
    await runPlotlyOperation(() => {
      if (!current()) return;
      lastCameraRef.current = nextCamera;
      return Plotly.relayout(root, { "scene.camera": nextCamera } as never);
    });
    if (current()) onCameraChange?.(nextCamera);
  }

  async function applyDisplayAspectRatio(nextAspectRatio: OpenEna3dAspectRatio) {
    if (!Plotly || status !== "ready" || !plotRootRef.current) return;
    const epoch = actionEpochRef.current, root = plotRootRef.current, revision = userViewRevisionRef.current;
    const current = () => actionEpochRef.current === epoch && plotRootRef.current === root && userViewRevisionRef.current === revision && latestCameraResetKeyRef.current === cameraResetKey;
    await runPlotlyOperation(() => {
      if (!current()) return;
      lastAspectRatioRef.current = nextAspectRatio;
      return Plotly.relayout(root, { "scene.aspectmode": "manual", "scene.aspectratio": nextAspectRatio } as never);
    });
    if (current()) onAspectRatioChange?.(nextAspectRatio);
  }

  async function applyDefaultDisplayDistance() {
    if (!Plotly || status !== "ready" || !plotRootRef.current) return;
    const epoch = actionEpochRef.current, root = plotRootRef.current, revision = userViewRevisionRef.current;
    const current = () => actionEpochRef.current === epoch && plotRootRef.current === root && userViewRevisionRef.current === revision && latestCameraResetKeyRef.current === cameraResetKey;
    await runPlotlyOperation(async () => {
      if (!current()) return;
      const activeCamera = currentCamera();
      const nextCamera = activeCamera.projection.type === "orthographic"
        ? structuredClone(activeCamera) : resetOpenEna3dCameraDistance(activeCamera, cameraForPreset(camera));
      const nextAspectRatio = activeCamera.projection.type === "orthographic" ? resetAspectRatio() : null;
      lastCameraRef.current = nextCamera; lastAspectRatioRef.current = nextAspectRatio;
      await Plotly.relayout(root, {
        "scene.camera": nextCamera, "scene.aspectmode": nextAspectRatio ? "manual" : "cube",
        ...(nextAspectRatio ? { "scene.aspectratio": nextAspectRatio } : {}),
      } as never);
      if (current()) { onCameraChange?.(nextCamera); onAspectRatioChange?.(nextAspectRatio); }
    });
  }

  function changeCameraZoom(direction: "in" | "out") {
    void runDisplayAction(async () => { const activeCamera = currentCamera();
      if (activeCamera.projection.type === "orthographic") await applyDisplayAspectRatio(zoomOpenEna3dAspectRatio(currentAspectRatio(), resetAspectRatio(), direction));
      else await applyDisplayCamera(zoomOpenEna3dCamera(activeCamera, cameraForPreset(camera), direction));
    }, copy.plot.actionUnavailable);
  }
  function recenterCamera() { void runDisplayAction(async () => { await applyDefaultDisplayDistance(); }, copy.plot.actionUnavailable); }

  async function runDisplayAction(operation: (active: () => boolean) => Promise<void>, failureMessage: string) {
    if (actionPendingRef.current || status !== "ready") return;
    const epoch = actionEpochRef.current;
    const active = () => actionEpochRef.current === epoch;
    actionPendingRef.current = true; setActionPending(true);
    if (fullscreenStateRef.current) fullscreenButtonRef.current?.focus();
    try { await operation(active); }
    catch { if (active()) announceAction(failureMessage); }
    finally { if (active()) { actionPendingRef.current = false; setActionPending(false); } }
  }

  function runPlotlyOperation<T>(operation: () => Promise<T> | T): Promise<T> {
    const owner = plotResourcesRef.current;
    if (!owner) return Promise.reject(new Error("Plot resources are unavailable."));
    return owner.run(operation);
  }

  function copyPlotImage() {
    if (!Plotly || status !== "ready" || !plotRootRef.current || actionPendingRef.current) return;
    const plotRoot = plotRootRef.current;
    void runDisplayAction(async active => {
      const outcome = await performPlotImageExportV3({
        acquire: captureImageExport ?? (() => () => true), active,
        render: async current => {
          announceAction(copy.plot.copyingImage);
          const dataUrl = await runPlotlyOperation(() => current() ? (Plotly as PlotlyImageApi).toImage(plotRoot, { format: "png", filename: `open-ena-3d-${plotKind}`, width: Math.max(1, Math.round(plotRoot.clientWidth)), height: Math.max(1, Math.round(plotRoot.clientHeight)), scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)) }) : null);
          if (dataUrl === null) return null;
          return { dataUrl, png: pngBlobFromDataUrl(dataUrl) };
        },
        ...(typeof ClipboardItem === "function" && navigator.clipboard?.write ? { writePng: async (png: Blob) => { await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); } } : navigator.clipboard?.writeText ? { writeText: async (text: string) => { await navigator.clipboard.writeText(text); } } : {}),
        download: png => { const url = URL.createObjectURL(png); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `open-ena-3d-${plotKind}.png`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); },
      });
      if (active() && outcome !== "obsolete" && outcome !== "denied") announceAction(outcome === "copied" ? copy.plot.imageCopied : outcome === "text-copied" ? copy.plot.imageDataCopied : copy.plot.imageDownloaded);
    }, copy.plot.copyUnavailable);
  }

  function scheduleFullscreenResize() {
    if (fullscreenResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(fullscreenResizeFrameRef.current);
    }
    fullscreenResizeFrameRef.current = window.requestAnimationFrame(() => {
      fullscreenResizeFrameRef.current = null;
      const Plotly = plotlyRef.current;
      const plotRoot = plotRootRef.current;
      if (!Plotly || renderStatusRef.current !== "ready" || !plotRoot) return;
      void runPlotlyOperation(async () => {
        if (plotRootRef.current !== plotRoot || renderStatusRef.current !== "ready") return;
        const target = fullscreenTargetRef.current;
        const nativeTrajectoryFullscreen = fullscreenStateRef.current
          && target?.getAttribute("data-ena-native-trajectory") === "true";
        if (nativeTrajectoryFullscreen || nativeTrajectoryFullscreenSizedRef.current) {
          const layout = fullscreenLayoutRef.current;
          const width = Math.max(1, plotRoot.clientWidth);
          const height = nativeTrajectoryFullscreen ? Math.max(1, plotRoot.clientHeight) : layout.height;
          const margin = nativeTrajectoryFullscreen
            ? { l: Math.min(16, width * 0.03), r: Math.min(16, width * 0.03), t: Math.min(48, height * 0.05), b: Math.min(28, height * 0.03) }
            : layout.margin;
          // Keep the complete legend and variance annotations readable without
          // letting an outside-paper legend consume the fullscreen scene.
          const legend = nativeTrajectoryFullscreen
            ? { ...layout.legend, y: 0, yanchor: "bottom" }
            : { ...layout.legend, yanchor: "auto" };
          const camera = currentCamera();
          const aspectMode = (plotRoot as PlotlyEventRoot)._fullLayout?.scene?.aspectmode ?? layout.scene.aspectmode;
          nativeTrajectoryFullscreenSizedRef.current = nativeTrajectoryFullscreen;
          await Plotly.relayout(plotRoot, {
            // Both fixed dimensions make Plotly.Plots.resize a no-op. Exit
            // must restore its declared auto-width behavior for later reflow.
            width: nativeTrajectoryFullscreen ? width : null,
            height, autosize: !nativeTrajectoryFullscreen, margin, legend, "scene.camera": camera,
            "scene.aspectmode": aspectMode,
            ...(aspectMode === "manual" ? { "scene.aspectratio": currentAspectRatio() } : {}),
          } as never);
        } else await Plotly.Plots.resize(plotRoot);
      }).catch(() => {
        // A detached plot can reject a final fullscreen geometry update.
      });
    });
  }

  function restoreFullscreenFocus() {
    if (fullscreenFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(fullscreenFocusFrameRef.current);
    }
    fullscreenFocusFrameRef.current = window.requestAnimationFrame(() => {
      fullscreenFocusFrameRef.current = null;
      fullscreenInitiatorRef.current?.focus();
    });
  }

  function restoreFallbackFullscreenAccessibility() {
    fallbackFullscreenCleanupRef.current?.();
    fallbackFullscreenCleanupRef.current = null;
  }

  function activateFallbackFullscreenAccessibility(target: HTMLElement) {
    restoreFallbackFullscreenAccessibility();
    const previousRole = target.getAttribute("role");
    const previousAriaModal = target.getAttribute("aria-modal");
    const previousAriaLabel = target.getAttribute("aria-label");
    const restoreOutsideTree = isolateOpenEnaFallbackFullscreenOutsideTreeV3(target, document.body);
    target.setAttribute("role", "dialog");
    target.setAttribute("aria-modal", "true");
    target.setAttribute("aria-label", fallbackFullscreenLabel);
    fallbackFullscreenCleanupRef.current = () => {
      restoreAttribute(target, "role", previousRole);
      restoreAttribute(target, "aria-modal", previousAriaModal);
      restoreAttribute(target, "aria-label", previousAriaLabel);
      restoreOutsideTree();
    };
  }

  function syncFullscreenState(restoreFocusOnExit: boolean) {
    const target = fullscreenTargetRef.current;
    if (!target) return;
    const nextFullscreen = document.fullscreenElement === target
      || target.getAttribute("data-fallback-fullscreen") === "true";
    const previousFullscreen = fullscreenStateRef.current;
    if (nextFullscreen === previousFullscreen) return;
    fullscreenStateRef.current = nextFullscreen;
    setIsFullscreen(nextFullscreen);
    scheduleFullscreenResize();
    if (previousFullscreen && !nextFullscreen) {
      restoreFallbackFullscreenAccessibility();
      if (restoreFocusOnExit) {
        announceAction(copy.plot.fullscreenClosed);
        restoreFullscreenFocus();
      }
    }
  }

  function enterFallbackFullscreen(target: HTMLElement) {
    let replacedAnotherTarget = false;
    document.querySelectorAll<HTMLElement>(
      '.open-ena-3d-triptych-panel[data-fallback-fullscreen="true"], '
      + '.open-ena-interactive-3d-figure[data-fallback-fullscreen="true"]',
    ).forEach((activeTarget) => {
      if (activeTarget !== target) {
        activeTarget.removeAttribute("data-fallback-fullscreen");
        replacedAnotherTarget = true;
      }
    });
    if (replacedAnotherTarget) {
      document.dispatchEvent(new Event("openena3dfallbackfullscreenchange"));
    }
    target.setAttribute("data-fallback-fullscreen", "true");
    activateFallbackFullscreenAccessibility(target);
    document.dispatchEvent(new Event("openena3dfallbackfullscreenchange"));
    announceAction(copy.plot.fullscreenFallbackEnabled);
  }

  function exitFallbackFullscreen(target: HTMLElement, restoreFocus: boolean) {
    target.removeAttribute("data-fallback-fullscreen");
    syncFullscreenState(restoreFocus);
    document.dispatchEvent(new Event("openena3dfallbackfullscreenchange"));
  }

  async function enterFullscreen(target: HTMLElement) {
    fullscreenInitiatorRef.current = fullscreenButtonRef.current;
    if (openEna3dFullscreenMode({
      requestFullscreen: target.requestFullscreen,
      exitFullscreen: document.exitFullscreen,
    }) === "fallback") {
      enterFallbackFullscreen(target);
      return;
    }
    fullscreenRequestPendingRef.current = true;
    announceAction(copy.plot.fullscreenOpening);
    try {
      await target.requestFullscreen();
      fullscreenRequestPendingRef.current = false;
      syncFullscreenState(false);
    } catch {
      fullscreenRequestPendingRef.current = false;
      if (target.isConnected) enterFallbackFullscreen(target);
    }
  }

  function toggleFullscreen() {
    const target = fullscreenTargetRef.current;
    if (!target) return;
    // Exiting an existing fullscreen surface must survive render/image work.
    // Readiness gates entry only; disabling the focused Exit also drops focus.
    fullscreenInitiatorRef.current = fullscreenButtonRef.current;
    if (target.getAttribute("data-fallback-fullscreen") === "true") {
      exitFallbackFullscreen(target, true);
      return;
    }
    if (document.fullscreenElement === target) {
      const exitFailureMessage = copy.plot.fullscreenExitFailed;
      if (typeof document.exitFullscreen === "function") {
        void document.exitFullscreen().catch(() => announceAction(exitFailureMessage));
      } else {
        announceAction(exitFailureMessage);
      }
      return;
    }
    if (status !== "ready" || fullscreenRequestPendingRef.current) return;
    void enterFullscreen(target).catch(() => announceAction(copy.plot.fullscreenUnavailable));
  }

  const fullscreenActionLabel = isFullscreen ? copy.plot.fullscreenExit : copy.plot.fullscreenEnter;

  return (
    <figure
      id={fullscreenTarget ? undefined : fullscreenTargetId}
      ref={figureRef}
      className="open-ena-plot-figure open-ena-interactive-3d-figure"
      data-ena-plot-kind={plotKind}
      data-ena-native-trajectory={result.boundPresentation && result.trajectoryPresentation ? "true" : undefined}
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
        data-ena-plot-ready={status === "ready" ? "true" : "false"}
        data-ena-plot-status={status}
        data-ena-camera-state={controlledCameraKey ?? cameraKey(spec.layout.scene.camera) ?? undefined}
        data-ena-aspect-ratio-state={controlledAspectRatioKey ?? aspectRatioKey(spec.layout.scene.aspectratio) ?? "cube"}
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
          id={canvasId}
          ref={plotRootRef}
          className="open-ena-interactive-3d-canvas"
          data-ena-plotly-root="true"
          data-ena-node-hovered={hoveredCode}
          data-ena-node-dragging={nodeDragging}
          onPointerDownCapture={beginNodeDrag}
          onPointerMoveCapture={moveDraggedNode}
          onPointerUpCapture={finishNodeDrag}
          onPointerCancelCapture={cancelNodeDrag}
        />
        <div
          className="ena-official-plot-actions open-ena-3d-plot-actions"
          role="group"
          aria-label={`${plotLabel}: ${copy.plot.threeDPlotActions}`}
          data-ena-plot-toolbar={plotKind}
          data-ena-toolbar-design="unframed-plot-actions"
        >
          <button
            type="button"
            data-ena-plot-action="zoom-in"
            aria-label={`${plotLabel}: ${copy.plot.zoomIn}`}
            aria-controls={canvasId}
            title={copy.plot.zoomIn}
            disabled={status !== "ready" || actionPending}
            onClick={() => changeCameraZoom("in")}
          >
            <OpenEnaPlotActionIcon name="zoom-in" />
          </button>
          <button
            type="button"
            data-ena-plot-action="zoom-out"
            aria-label={`${plotLabel}: ${copy.plot.zoomOut}`}
            aria-controls={canvasId}
            title={copy.plot.zoomOut}
            disabled={status !== "ready" || actionPending}
            onClick={() => changeCameraZoom("out")}
          >
            <OpenEnaPlotActionIcon name="zoom-out" />
          </button>
          <button
            type="button"
            data-ena-plot-action="recenter"
            data-ena-recenter-behavior="default-distance"
            aria-label={`${plotLabel}: ${copy.plot.recenter}`}
            aria-controls={canvasId}
            title={copy.plot.recenter}
            disabled={status !== "ready" || actionPending}
            onClick={recenterCamera}
          >
            <OpenEnaPlotActionIcon name="recenter" />
          </button>
          <button
            type="button"
            data-ena-plot-action="copy-image"
            aria-label={`${plotLabel}: ${copy.plot.copyImage}`}
            aria-controls={canvasId}
            title={copy.plot.copyImageTitle}
            disabled={status !== "ready" || actionPending}
            onClick={copyPlotImage}
          >
            <OpenEnaPlotActionIcon name="copy" />
          </button>
          <button
            ref={fullscreenButtonRef}
            type="button"
            data-ena-plot-action="fullscreen"
            aria-label={`${plotLabel}: ${fullscreenActionLabel}`}
            aria-controls={fullscreenTargetId}
            aria-pressed={isFullscreen}
            title={fullscreenActionLabel}
            disabled={!isFullscreen && status !== "ready"}
            onClick={toggleFullscreen}
          >
            <OpenEnaPlotActionIcon name={isFullscreen ? "exit-fullscreen" : "fullscreen"} />
          </button>
          <span className="ena-plot-copy-status" role="status" aria-live="polite">{actionStatus}</span>
        </div>
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
          {confidenceIntervalRows.length > 0 ? (
            <>
              <table data-ena-3d-confidence-interval-table="true">
                <caption>Separate marginal 95% Student-t confidence intervals — exact fitted coordinates</caption>
                <thead>
                  <tr>
                    <th scope="col">{copy.workspace.groups}</th>
                    <th scope="col">Axis</th>
                    <th scope="col">n</th>
                    <th scope="col">Mean</th>
                    <th scope="col">Lower 95%</th>
                    <th scope="col">Upper 95%</th>
                    <th scope="col">df</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {confidenceIntervalRows.map(({ side, dimension, interval }) => (
                    <tr
                      key={`${side.name}:${dimension}`}
                      data-ena-3d-confidence-interval-row="true"
                      data-ena-group={side.name}
                      data-ena-dimension={dimension}
                      data-ena-interval-status={interval.status}
                    >
                      <th scope="row">{side.name}</th>
                      <td>{dimension}</td>
                      <td>{interval.sampleSize}</td>
                      <td>{interval.status === "estimable" ? exactCoordinate(interval.mean) : "—"}</td>
                      <td>{interval.status === "estimable" ? exactCoordinate(interval.lower) : "—"}</td>
                      <td>{interval.status === "estimable" ? exactCoordinate(interval.upper) : "—"}</td>
                      <td>{interval.status === "estimable" ? interval.degreesFreedom : "—"}</td>
                      <td>{interval.status === "estimable" ? "estimable" : interval.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p data-ena-3d-confidence-interval-boundary="marginal-not-joint">
                Endpoint analytic units are the observations. The dashed wireframe is the Cartesian product of
                three separate marginal intervals; it is not a joint confidence region or significance test.
              </p>
            </>
          ) : null}
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
