"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type { OpenEnaPairwiseContrast } from "@/lib/open-ena/contrasts";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import {
  cameraForPreset,
  compileOpenEna3dPlotSpec,
  type OpenEna3dAspectRatio,
  type OpenEna3dCamera,
  type OpenEna3dPlotKind,
  type OpenEna3dPlotSpec,
} from "@/lib/open-ena/plot3d";
import type { CameraPreset, OpenEnaResult } from "@/lib/open-ena/types";
import OpenEnaPlotActionIcon from "./OpenEnaPlotActionIcon";

type PlotlyApi = (typeof import("plotly.js-dist-min"))["default"];
type PlotlyImageApi = PlotlyApi & {
  toImage: (
    root: HTMLDivElement,
    options: { format: "png"; filename: string; width: number; height: number; scale: number },
  ) => Promise<string>;
};
type RenderStatus = "loading" | "ready" | "error";

export function openEna3dFullscreenMode(capabilities: {
  requestFullscreen: unknown;
  exitFullscreen: unknown;
}): "native" | "fallback" {
  return typeof capabilities.requestFullscreen === "function"
    && typeof capabilities.exitFullscreen === "function"
    ? "native"
    : "fallback";
}

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
  fullscreenTarget?: {
    id: string;
    ref: RefObject<HTMLElement | null>;
  };
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
  initialAspectRatio?: OpenEna3dAspectRatio | null;
  onAspectRatioChange?: (aspectRatio: OpenEna3dAspectRatio | null) => void;
  copy: OpenEnaCopy;
}

interface PlotlyEventRoot extends HTMLDivElement {
  on?: (event: "plotly_relayout", listener: (update: Record<string, unknown>) => void) => void;
  removeListener?: (event: "plotly_relayout", listener: (update: Record<string, unknown>) => void) => void;
  _fullLayout?: {
    scene?: {
      _scene?: {
        getCamera?: () => unknown;
        glplot?: {
          getAspectratio?: () => unknown;
        };
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
  result,
  contrast = null,
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
  initialAspectRatio = null,
  onAspectRatioChange,
  copy,
}: OpenEnaInteractive3DPlotProps) {
  const instanceId = useId();
  const figureRef = useRef<HTMLElement>(null);
  const plotRootRef = useRef<HTMLDivElement>(null);
  const lastAppliedCameraKeyRef = useRef<string | null>(null);
  const initialCameraRef = useRef(initialCamera);
  const lastCameraRef = useRef(initialCamera);
  const initialAspectRatioRef = useRef(initialAspectRatio);
  const lastAspectRatioRef = useRef(initialAspectRatio);
  const relayoutListenerRef = useRef<((update: Record<string, unknown>) => void) | null>(null);
  const actionStatusTimerRef = useRef<number | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const fullscreenInitiatorRef = useRef<HTMLButtonElement | null>(null);
  const fullscreenResizeFrameRef = useRef<number | null>(null);
  const fullscreenFocusFrameRef = useRef<number | null>(null);
  const fullscreenRequestPendingRef = useRef(false);
  const fullscreenStateRef = useRef(false);
  const plotlyRef = useRef<PlotlyApi | null>(null);
  const renderStatusRef = useRef<RenderStatus>("loading");
  const [Plotly, setPlotly] = useState<PlotlyApi | null>(null);
  const [status, setStatus] = useState<RenderStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const generatedFullscreenTargetId = `open-ena-interactive-3d-fullscreen-target-${instanceId}`;
  const fullscreenTargetId = fullscreenTarget?.id ?? generatedFullscreenTargetId;
  const fullscreenTargetRef = fullscreenTarget?.ref ?? figureRef;
  const canvasId = `open-ena-interactive-3d-canvas-${instanceId}`;
  initialCameraRef.current = initialCamera;
  initialAspectRatioRef.current = initialAspectRatio;
  plotlyRef.current = Plotly;
  renderStatusRef.current = status;

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
      if (actionStatusTimerRef.current !== null) window.clearTimeout(actionStatusTimerRef.current);
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
      if (event.key === "Escape" && target.getAttribute("data-fallback-fullscreen") === "true") {
        exitFallbackFullscreen(target, true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("fullscreenerror", handleFullscreenError);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("openena3dfallbackfullscreenchange", handleFallbackFullscreenChange);
    syncFullscreenState(false);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("fullscreenerror", handleFullscreenError);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("openena3dfallbackfullscreenchange", handleFallbackFullscreenChange);
      const ownedFallback = target.getAttribute("data-fallback-fullscreen") === "true";
      target.removeAttribute("data-fallback-fullscreen");
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
          const nextAspectRatio = lastAppliedCameraKeyRef.current === null && initialAspectRatioRef.current
            ? initialAspectRatioRef.current
            : spec.layout.scene.aspectratio ?? null;
          await Plotly.relayout(plotRoot, {
            "scene.camera": nextCamera,
            "scene.aspectmode": nextAspectRatio ? "manual" : "cube",
            ...(nextAspectRatio ? { "scene.aspectratio": nextAspectRatio } : {}),
          } as never);
          if (!active) return;
          lastCameraRef.current = nextCamera;
          lastAspectRatioRef.current = nextAspectRatio;
          lastAppliedCameraKeyRef.current = cameraResetKey;
          if (aspectRatioKey(nextAspectRatio) !== controlledAspectRatioKey) {
            onAspectRatioChange?.(nextAspectRatio);
          }
        }
        const eventRoot = plotRoot as PlotlyEventRoot;
        if (!relayoutListenerRef.current && eventRoot.on) {
          const listener = (update: Record<string, unknown>) => {
            const fallbackCamera = lastCameraRef.current ?? spec.layout.scene.camera;
            const nextCamera = cameraFromRelayout(update, fallbackCamera) ?? cameraFromValue(
              eventRoot._fullLayout?.scene?._scene?.getCamera?.(),
              fallbackCamera,
            );
            if (nextCamera && cameraKey(nextCamera) !== cameraKey(lastCameraRef.current)) {
              lastCameraRef.current = nextCamera;
              onCameraChange?.(nextCamera);
            }

            const fallbackAspectRatio = lastAspectRatioRef.current
              ?? spec.layout.scene.aspectratio
              ?? UNIT_ASPECT_RATIO;
            const nextAspectRatio = aspectRatioFromValue(
              update["scene.aspectratio"],
              fallbackAspectRatio,
            ) ?? aspectRatioFromValue(
              eventRoot._fullLayout?.scene?._scene?.glplot?.getAspectratio?.(),
              fallbackAspectRatio,
            );
            if (
              nextAspectRatio
              && (nextCamera ?? fallbackCamera).projection.type === "orthographic"
              && aspectRatioKey(nextAspectRatio) !== aspectRatioKey(lastAspectRatioRef.current)
            ) {
              lastAspectRatioRef.current = nextAspectRatio;
              onAspectRatioChange?.(nextAspectRatio);
            }
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
  }, [Plotly, spec, cameraResetKey, onCameraChange, onAspectRatioChange]);

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

  useEffect(() => {
    if (!Plotly || status !== "ready" || !plotRootRef.current || !initialAspectRatio) return;
    if (controlledAspectRatioKey === aspectRatioKey(lastAspectRatioRef.current)) return;
    const plotRoot = plotRootRef.current;
    lastAspectRatioRef.current = initialAspectRatio;
    void Promise.resolve(Plotly.relayout(plotRoot, {
      "scene.aspectmode": "manual",
      "scene.aspectratio": initialAspectRatio,
    } as never)).catch(() => {
      // A sibling can unmount while a linked orthographic zoom update is in flight.
    });
  }, [Plotly, controlledAspectRatioKey, initialAspectRatio, status]);

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
  const confidenceIntervalRows = contrast && plotKind === "comparison"
    ? [contrast.primary, contrast.secondary].flatMap((side) => (
        [xDimension, yDimension, zDimension].flatMap((dimension) => {
          const interval = side.meanConfidenceIntervalsByDimension?.[dimension];
          return interval ? [{ side, dimension, interval }] : [];
        })
      ))
    : [];
  const resolvedAriaLabel = ariaLabel ?? `${copy.workspace.comparison}, ${copy.views.threeD}`;
  const plotName = plotKind === "comparison" ? "Comparison" : plotKind === "primary" ? "Primary" : "Secondary";
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

  async function applyDisplayCamera(nextCamera: OpenEna3dCamera) {
    if (!Plotly || status !== "ready" || !plotRootRef.current) return;
    lastCameraRef.current = nextCamera;
    await Plotly.relayout(
      plotRootRef.current,
      { "scene.camera": nextCamera } as never,
    );
    onCameraChange?.(nextCamera);
  }

  async function applyDisplayAspectRatio(nextAspectRatio: OpenEna3dAspectRatio) {
    if (!Plotly || status !== "ready" || !plotRootRef.current) return;
    lastAspectRatioRef.current = nextAspectRatio;
    await Plotly.relayout(plotRootRef.current, {
      "scene.aspectmode": "manual",
      "scene.aspectratio": nextAspectRatio,
    } as never);
    onAspectRatioChange?.(nextAspectRatio);
  }

  async function applyDefaultDisplayDistance() {
    if (!Plotly || status !== "ready" || !plotRootRef.current) return;
    const activeCamera = currentCamera();
    const nextCamera = activeCamera.projection.type === "orthographic"
      ? {
          center: { ...activeCamera.center },
          eye: { ...activeCamera.eye },
          up: { ...activeCamera.up },
          projection: { ...activeCamera.projection },
        }
      : resetOpenEna3dCameraDistance(activeCamera, cameraForPreset(camera));
    const nextAspectRatio = activeCamera.projection.type === "orthographic"
      ? resetAspectRatio()
      : null;
    lastCameraRef.current = nextCamera;
    lastAspectRatioRef.current = nextAspectRatio;
    await Plotly.relayout(plotRootRef.current, {
      "scene.camera": nextCamera,
      "scene.aspectmode": nextAspectRatio ? "manual" : "cube",
      ...(nextAspectRatio ? { "scene.aspectratio": nextAspectRatio } : {}),
    } as never);
    onCameraChange?.(nextCamera);
    onAspectRatioChange?.(nextAspectRatio);
  }

  function changeCameraZoom(direction: "in" | "out") {
    const activeCamera = currentCamera();
    const action = activeCamera.projection.type === "orthographic"
      ? applyDisplayAspectRatio(zoomOpenEna3dAspectRatio(currentAspectRatio(), resetAspectRatio(), direction))
      : applyDisplayCamera(zoomOpenEna3dCamera(activeCamera, cameraForPreset(camera), direction));
    void action.catch(() => {
      announceAction("3D view action unavailable");
    });
  }

  function recenterCamera() {
    void applyDefaultDisplayDistance().catch(() => {
      announceAction("3D view action unavailable");
    });
  }

  function copyPlotImage() {
    if (!Plotly || status !== "ready" || !plotRootRef.current) return;
    const plotRoot = plotRootRef.current;
    announceAction("Copying image");
    void (async () => {
      const dataUrl = await (Plotly as PlotlyImageApi).toImage(plotRoot, {
        format: "png",
        filename: `open-ena-3d-${plotKind}`,
        width: Math.max(1, Math.round(plotRoot.clientWidth)),
        height: Math.max(1, Math.round(plotRoot.clientHeight)),
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
      });
      const png = pngBlobFromDataUrl(dataUrl);
      if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        announceAction("Image copied");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dataUrl);
        announceAction("Image data copied");
      } else {
        throw new Error("Clipboard access is unavailable.");
      }
    })().catch(() => announceAction("Copy unavailable"));
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
      try {
        void Promise.resolve(Plotly.Plots.resize(plotRoot)).catch(() => {
          // The plot can unmount while the fullscreen resize frame is pending.
        });
      } catch {
        // A detached plot can reject a final synchronous fullscreen resize.
      }
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
    if (previousFullscreen && !nextFullscreen && restoreFocusOnExit) {
      announceAction("Fullscreen closed");
      restoreFullscreenFocus();
    }
  }

  function enterFallbackFullscreen(target: HTMLElement) {
    document.querySelectorAll<HTMLElement>(
      '.open-ena-3d-triptych-panel[data-fallback-fullscreen="true"], '
      + '.open-ena-interactive-3d-figure[data-fallback-fullscreen="true"]',
    ).forEach((activeTarget) => {
      if (activeTarget !== target) activeTarget.removeAttribute("data-fallback-fullscreen");
    });
    target.setAttribute("data-fallback-fullscreen", "true");
    document.dispatchEvent(new Event("openena3dfallbackfullscreenchange"));
    announceAction("Fullscreen fallback enabled");
  }

  function exitFallbackFullscreen(target: HTMLElement, restoreFocus: boolean) {
    target.removeAttribute("data-fallback-fullscreen");
    document.dispatchEvent(new Event("openena3dfallbackfullscreenchange"));
    announceAction("Fullscreen closed");
    if (restoreFocus) restoreFullscreenFocus();
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
    announceAction("Opening fullscreen");
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
    if (!target || status !== "ready" || fullscreenRequestPendingRef.current) return;
    fullscreenInitiatorRef.current = fullscreenButtonRef.current;
    if (target.getAttribute("data-fallback-fullscreen") === "true") {
      exitFallbackFullscreen(target, true);
      return;
    }
    if (document.fullscreenElement === target) {
      if (typeof document.exitFullscreen === "function") {
        void document.exitFullscreen().catch(() => announceAction("Fullscreen exit unavailable"));
      } else {
        announceAction("Fullscreen exit unavailable");
      }
      return;
    }
    void enterFullscreen(target).catch(() => announceAction("Fullscreen unavailable"));
  }

  const fullscreenActionLabel = isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen";

  return (
    <figure
      id={fullscreenTarget ? undefined : fullscreenTargetId}
      ref={figureRef}
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
        />
        <div
          className="ena-official-plot-actions open-ena-3d-plot-actions"
          role="group"
          aria-label={`${plotName} Plot actions`}
          data-ena-plot-toolbar={plotKind}
          data-ena-toolbar-design="unframed-plot-actions"
        >
          <button
            type="button"
            data-ena-plot-action="zoom-in"
            aria-label={`${plotName} Plot: Zoom In`}
            aria-controls={canvasId}
            title="Zoom In"
            disabled={status !== "ready"}
            onClick={() => changeCameraZoom("in")}
          >
            <OpenEnaPlotActionIcon name="zoom-in" />
          </button>
          <button
            type="button"
            data-ena-plot-action="zoom-out"
            aria-label={`${plotName} Plot: Zoom Out`}
            aria-controls={canvasId}
            title="Zoom Out"
            disabled={status !== "ready"}
            onClick={() => changeCameraZoom("out")}
          >
            <OpenEnaPlotActionIcon name="zoom-out" />
          </button>
          <button
            type="button"
            data-ena-plot-action="recenter"
            data-ena-recenter-behavior="default-distance"
            aria-label={`${plotName} Plot: Recenter`}
            aria-controls={canvasId}
            title="Recenter Plot"
            disabled={status !== "ready"}
            onClick={recenterCamera}
          >
            <OpenEnaPlotActionIcon name="recenter" />
          </button>
          <button
            type="button"
            data-ena-plot-action="copy-image"
            aria-label={`${plotName} Plot: Copy image`}
            aria-controls={canvasId}
            title="Copy plot image to clipboard"
            disabled={status !== "ready"}
            onClick={copyPlotImage}
          >
            <OpenEnaPlotActionIcon name="copy" />
          </button>
          <button
            ref={fullscreenButtonRef}
            type="button"
            data-ena-plot-action="fullscreen"
            aria-label={`${plotName} Plot: ${fullscreenActionLabel}`}
            aria-controls={fullscreenTargetId}
            aria-pressed={isFullscreen}
            title={fullscreenActionLabel}
            disabled={status !== "ready"}
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
