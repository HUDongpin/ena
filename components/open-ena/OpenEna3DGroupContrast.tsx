"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { OpenEnaContrastPresentation } from "@/lib/open-ena/bound-presentation-v3";
import type { OpenEnaPlotResult } from "@/lib/open-ena/bound-presentation-v3";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type { OpenEnaPairwiseContrast } from "@/lib/open-ena/contrasts";
import type { OpenEnaDerivedGroupDisplay } from "@/lib/open-ena/group-display";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import type {
  OpenEnaNodeDimensionPosition,
  OpenEnaNodeLayoutPositions,
} from "@/lib/open-ena/node-layout";
import type { OpenEnaCodeGraphPresentation } from "@/lib/open-ena/ordered-plot";
import type { OpenEna3dAspectRatio, OpenEna3dCamera } from "@/lib/open-ena/plot3d";
import type { CameraPreset, OpenEnaResult } from "@/lib/open-ena/types";
import OpenEnaInteractive3DPlot, {
  type OpenEna3dRenderStatus,
} from "./OpenEnaInteractive3DPlot";

export interface OpenEna3DGroupContrastProps extends OpenEnaCodeGraphPresentation {
  result: OpenEnaPlotResult;
  contrast: OpenEnaContrastPresentation;
  groupDisplay?: Pick<OpenEnaDerivedGroupDisplay, "primary" | "secondary" | "hiddenUnitKeys">;
  captureImageExport?: () => (() => boolean) | null;
  codeColors?: OpenEnaCodeColors;
  groupColumn: string;
  xDimension: string;
  yDimension: string;
  zDimension: string;
  camera: CameraPreset;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  showVariance: boolean;
  edgeScale: number;
  edgeThreshold: number;
  pointScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  nodeLayout?: OpenEnaNodeLayoutPositions;
  onNodeMove?: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
  plotResetRevision?: number;
  sharedCamera?: OpenEna3dCamera | null;
  onCameraChange?: (camera: OpenEna3dCamera) => void;
  sharedAspectRatio?: OpenEna3dAspectRatio | null;
  onAspectRatioChange?: (aspectRatio: OpenEna3dAspectRatio | null) => void;
  centerMode: "plot" | "data";
  dataView?: ReactNode;
  rightTools?: ReactNode;
  copy: OpenEnaCopy;
}

export default function OpenEna3DGroupContrast({
  result,
  contrast,
  groupDisplay,
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
  edgeScale,
  edgeThreshold,
  pointScale,
  plotZoom,
  flipX,
  flipY,
  nodeLayout,
  onNodeMove,
  plotResetRevision = 0,
  sharedCamera = null,
  onCameraChange,
  sharedAspectRatio = null,
  onAspectRatioChange,
  centerMode,
  dataView,
  rightTools,
  copy,
}: OpenEna3DGroupContrastProps) {
  const [readyStage, setReadyStage] = useState<"comparison" | "primary" | "secondary" | "all">(
    centerMode === "data" ? "primary" : "comparison",
  );
  const [readyRoles, setReadyRoles] = useState<ReadonlySet<"comparison" | "primary" | "secondary">>(
    () => new Set(),
  );
  const instanceId = useId();
  const comparisonReadyRef = useRef(false);
  const comparisonFullscreenRef = useRef<HTMLElement>(null);
  const primaryFullscreenRef = useRef<HTMLElement>(null);
  const secondaryFullscreenRef = useRef<HTMLElement>(null);
  const titleId = `open-ena-3d-group-contrast-title-${instanceId}`;
  const comparisonFullscreenTargetId = `open-ena-3d-comparison-fullscreen-target-${instanceId}`;
  const primaryFullscreenTargetId = `open-ena-3d-primary-fullscreen-target-${instanceId}`;
  const secondaryFullscreenTargetId = `open-ena-3d-secondary-fullscreen-target-${instanceId}`;
  const sharedPlotProps = {
    result,
    contrast,
    groupDisplay,
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
    showCodeGraph,
    codeVisibility,
    codeSourceByRenderedCode, codeLabelByRenderedCode,
    showUnitLabels,
    showVariance,
    showTrajectories: false,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    flipX,
    flipY,
    nodeLayout,
    onNodeMove,
    plotResetRevision,
    initialCamera: sharedCamera,
    onCameraChange,
    initialAspectRatio: sharedAspectRatio,
    onAspectRatioChange,
    copy,
  } as const;
  const comparisonReady = useCallback(
    () => {
      comparisonReadyRef.current = true;
      setReadyRoles((current) => new Set(current).add("comparison"));
      setReadyStage((stage) => stage === "comparison" ? "primary" : stage);
    },
    [],
  );
  const comparisonError = useCallback(
    () => setReadyStage((stage) => stage === "comparison" ? "primary" : stage),
    [],
  );
  const primaryReady = useCallback(
    () => {
      setReadyRoles((current) => new Set(current).add("primary"));
      setReadyStage((stage) => stage === "primary" ? "secondary" : stage);
    },
    [],
  );
  const primaryError = useCallback(
    () => setReadyStage((stage) => stage === "primary" ? "secondary" : stage),
    [],
  );
  const secondaryReady = useCallback(
    () => {
      setReadyRoles((current) => new Set(current).add("secondary"));
      setReadyStage((stage) => stage === "secondary" ? "all" : stage);
    },
    [],
  );
  const secondaryError = useCallback(
    () => setReadyStage((stage) => stage === "secondary" ? "all" : stage),
    [],
  );
  const updateReadyRole = useCallback(
    (role: "comparison" | "primary" | "secondary", status: OpenEna3dRenderStatus) => {
      setReadyRoles((current) => {
        const next = new Set(current);
        if (status === "ready") next.add(role);
        else next.delete(role);
        return next;
      });
    },
    [],
  );
  const comparisonStatus = useCallback(
    (status: OpenEna3dRenderStatus) => updateReadyRole("comparison", status),
    [updateReadyRole],
  );
  const primaryStatus = useCallback(
    (status: OpenEna3dRenderStatus) => updateReadyRole("primary", status),
    [updateReadyRole],
  );
  const secondaryStatus = useCallback(
    (status: OpenEna3dRenderStatus) => updateReadyRole("secondary", status),
    [updateReadyRole],
  );
  useEffect(() => {
    if (centerMode === "data") {
      // Primary and Secondary stay mounted in Data View, so retain their live
      // readiness. Comparison is unmounted and must earn readiness again when
      // Plot View returns.
      comparisonReadyRef.current = false;
      setReadyRoles((current) => {
        const next = new Set(current);
        next.delete("comparison");
        return next;
      });
      setReadyStage((stage) => stage === "comparison" ? "primary" : stage);
      return;
    }
    if (!comparisonReadyRef.current) {
      setReadyStage((stage) => stage === "primary" || stage === "secondary" ? "comparison" : stage);
    }
  }, [centerMode]);
  const sidePlaceholder = (role: "primary" | "secondary", name: string) => (
    <div className="open-ena-3d-triptych-placeholder" role="status" data-testid={`open-ena-3d-${role}-loading`}>
      {copy.plot.threeDLoading}: {name}…
    </div>
  );

  return (
    <section
      className="open-ena-3d-group-contrast"
      data-testid="open-ena-3d-group-contrast"
      data-ena-dimensions="3"
      data-ena-camera-sync="shared"
      data-ena-scene-frame="full-result"
      data-ena-triptych-stage={readyStage}
      data-ena-all-three-ready={centerMode === "plot" && readyRoles.size === 3 ? "true" : "false"}
      data-ena-center-mode={centerMode}
      data-ena-difference-edge-scale-definition={contrast.edgeScaleDenominators.differenceDefinition}
      data-ena-shared-mean-edge-scale-definition={contrast.edgeScaleDenominators.sharedMeanDefinition}
      aria-labelledby={titleId}
    >
      <header className="open-ena-3d-triptych-header">
        <div>
          <span>{copy.contrast.title} · 3D</span>
          <h2 id={titleId}>
            {contrast.primary.name} − {contrast.secondary.name}
          </h2>
        </div>
        <p>{copy.plot.sameFittedSpace}</p>
      </header>

      <div className="open-ena-3d-triptych-layout">
        <div
          className="open-ena-3d-triptych-center"
          data-testid="open-ena-3d-center-surface"
          data-ena-center-mode={centerMode}
        >
          {centerMode === "data" ? (
            <div
              className="open-ena-3d-triptych-panel open-ena-3d-triptych-main open-ena-3d-triptych-data-view"
              data-testid="open-ena-3d-data-view"
            >
              {dataView ?? (
                <p className="ena-sets-compatibility-note" role="status">
                  {copy.modelV3.workspace.plot.dataView}: {copy.modelV3.workspace.plot.unavailable}
                </p>
              )}
            </div>
          ) : (
            <article
              id={comparisonFullscreenTargetId}
              ref={comparisonFullscreenRef}
              className="open-ena-3d-triptych-panel open-ena-3d-triptych-main"
              data-testid="open-ena-3d-comparison-plot"
              data-ena-plot-role="comparison"
              data-ena-network-role="signed-primary-minus-secondary"
            >
              <header className="open-ena-3d-triptych-heading">
                <div>
                  <h3>{copy.plot.threeDComparisonPlot} <small>3D</small></h3>
                  <p>{contrast.primary.name} − {contrast.secondary.name} · {copy.workspace.strongestDifferences}</p>
                </div>
                <span>n = {contrast.primary.unitCount} vs {contrast.secondary.unitCount}</span>
              </header>
              <OpenEnaInteractive3DPlot
                {...sharedPlotProps}
                plotKind="comparison"
                fullscreenTarget={{
                  id: comparisonFullscreenTargetId,
                  ref: comparisonFullscreenRef,
                }}
                displayModeBar={false}
                testId="open-ena-interactive-3d-plot"
                ariaLabel={`${copy.plot.threeDComparisonPlot}: ${contrast.primary.name} − ${contrast.secondary.name}.`}
                onReady={comparisonReady}
                onError={comparisonError}
                onStatusChange={comparisonStatus}
              />
            </article>
          )}
        </div>

        <div className="open-ena-3d-triptych-sides">
          <article
            id={primaryFullscreenTargetId}
            ref={primaryFullscreenRef}
            className="open-ena-3d-triptych-panel open-ena-3d-triptych-side"
            data-testid="open-ena-3d-primary-plot"
            data-ena-plot-role="primary"
            data-ena-network-role="group-mean"
            style={{ "--ena-3d-group-color": contrast.primary.color ?? "#3366cc" } as CSSProperties}
          >
            <header className="open-ena-3d-triptych-heading">
              <div>
                <h3>{copy.plot.threeDPrimaryPlot} <small>3D</small></h3>
                <p><strong>{contrast.primary.name}</strong> · n = {contrast.primary.unitCount} · {copy.workspace.groupMeans}</p>
              </div>
            </header>
            {readyStage === "comparison" ? sidePlaceholder("primary", contrast.primary.name) : <OpenEnaInteractive3DPlot
              {...sharedPlotProps}
              plotKind="primary"
              fullscreenTarget={{
                id: primaryFullscreenTargetId,
                ref: primaryFullscreenRef,
              }}
              compact
              displayModeBar={false}
              showAccessibleSummary={false}
              showCaption={false}
              showVariance={false}
              showUnitLabels={false}
              testId="open-ena-3d-primary-canvas"
              ariaLabel={`${copy.plot.threeDPrimaryPlot}: ${contrast.primary.name} · ${copy.workspace.units} ${contrast.primary.unitCount}.`}
              onReady={primaryReady}
              onError={primaryError}
              onStatusChange={primaryStatus}
            />}
          </article>

          <article
            id={secondaryFullscreenTargetId}
            ref={secondaryFullscreenRef}
            className="open-ena-3d-triptych-panel open-ena-3d-triptych-side"
            data-testid="open-ena-3d-secondary-plot"
            data-ena-plot-role="secondary"
            data-ena-network-role="group-mean"
            style={{ "--ena-3d-group-color": contrast.secondary.color ?? "#dc3912" } as CSSProperties}
          >
            <header className="open-ena-3d-triptych-heading">
              <div>
                <h3>{copy.plot.threeDSecondaryPlot} <small>3D</small></h3>
                <p><strong>{contrast.secondary.name}</strong> · n = {contrast.secondary.unitCount} · {copy.workspace.groupMeans}</p>
              </div>
            </header>
            {readyStage === "comparison" || readyStage === "primary" ? sidePlaceholder("secondary", contrast.secondary.name) : <OpenEnaInteractive3DPlot
              {...sharedPlotProps}
              plotKind="secondary"
              fullscreenTarget={{
                id: secondaryFullscreenTargetId,
                ref: secondaryFullscreenRef,
              }}
              compact
              displayModeBar={false}
              showAccessibleSummary={false}
              showCaption={false}
              showVariance={false}
              showUnitLabels={false}
              testId="open-ena-3d-secondary-canvas"
              ariaLabel={`${copy.plot.threeDSecondaryPlot}: ${contrast.secondary.name} · ${copy.workspace.units} ${contrast.secondary.unitCount}.`}
              onReady={secondaryReady}
              onError={secondaryError}
              onStatusChange={secondaryStatus}
            />}
          </article>
          {rightTools}
        </div>
      </div>
    </section>
  );
}
