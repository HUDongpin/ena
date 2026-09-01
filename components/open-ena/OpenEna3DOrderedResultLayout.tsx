"use client";

import { useId, useRef, type CSSProperties, type ReactNode } from "react";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type {
  OpenEnaNodeDimensionPosition,
  OpenEnaNodeLayoutPositions,
} from "@/lib/open-ena/node-layout";
import type { OpenEnaOrderedNodeTotals } from "@/lib/open-ena/ordered-plot";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import type { OpenEna3dAspectRatio, OpenEna3dCamera } from "@/lib/open-ena/plot3d";
import type { CameraPreset, OpenEnaConfig, OpenEnaResult } from "@/lib/open-ena/types";
import OpenEnaInteractive3DPlot from "./OpenEnaInteractive3DPlot";

export interface OpenEna3DOrderedResultLayoutProps {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  primaryGroupName: string | null;
  secondaryGroupName: string | null;
  rightTools?: ReactNode;
  xDimension: string;
  yDimension: string;
  zDimension: string;
  camera: CameraPreset;
  edgeThreshold: number;
  edgeScale: number;
  pointScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  showVariance: boolean;
  codeColors?: OpenEnaCodeColors;
  nodeTotals?: OpenEnaOrderedNodeTotals;
  nodeLayout?: OpenEnaNodeLayoutPositions;
  onNodeMove?: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
  plotResetRevision?: number;
  sharedCamera?: OpenEna3dCamera | null;
  onCameraChange?: (camera: OpenEna3dCamera) => void;
  sharedAspectRatio?: OpenEna3dAspectRatio | null;
  onAspectRatioChange?: (aspectRatio: OpenEna3dAspectRatio | null) => void;
  copy: OpenEnaCopy;
}

export default function OpenEna3DOrderedResultLayout(props: OpenEna3DOrderedResultLayoutProps) {
  const {
    result,
    config,
    primaryGroupName,
    secondaryGroupName,
    rightTools,
    copy,
  } = props;
  const instanceId = useId();
  const overallFullscreenRef = useRef<HTMLElement>(null);
  const primaryFullscreenRef = useRef<HTMLElement>(null);
  const secondaryFullscreenRef = useRef<HTMLElement>(null);
  const overallFullscreenTargetId = `open-ena-ona-3d-overall-fullscreen-${instanceId}`;
  const primaryFullscreenTargetId = `open-ena-ona-3d-primary-fullscreen-${instanceId}`;
  const secondaryFullscreenTargetId = `open-ena-ona-3d-secondary-fullscreen-${instanceId}`;
  const titleId = `open-ena-ona-3d-title-${instanceId}`;
  const primaryGroup = result.groups.find((group) => group.name === primaryGroupName)
    ?? result.groups[0]
    ?? null;
  const secondaryGroup = result.groups.find((group) => (
    group.name === secondaryGroupName && group.name !== primaryGroup?.name
  )) ?? result.groups.find((group) => group.name !== primaryGroup?.name) ?? null;
  const sharedPlotProps = {
    analysisKind: "ona" as const,
    result,
    orderedConfig: config,
    orderedNodeTotals: props.nodeTotals,
    codeColors: props.codeColors,
    groupColumn: config.groupColumn,
    xDimension: props.xDimension,
    yDimension: props.yDimension,
    zDimension: props.zDimension,
    camera: props.camera,
    showPoints: props.showPoints,
    showNetworks: props.showNetworks,
    showLabels: props.showLabels,
    showUnitLabels: props.showUnitLabels,
    showVariance: props.showVariance,
    showTrajectories: false,
    edgeScale: props.edgeScale,
    edgeThreshold: props.edgeThreshold,
    pointScale: props.pointScale,
    plotZoom: props.plotZoom,
    flipX: props.flipX,
    flipY: props.flipY,
    nodeLayout: props.nodeLayout,
    onNodeMove: props.onNodeMove,
    plotResetRevision: props.plotResetRevision,
    initialCamera: props.sharedCamera,
    onCameraChange: props.onCameraChange,
    initialAspectRatio: props.sharedAspectRatio,
    onAspectRatioChange: props.onAspectRatioChange,
    displayModeBar: false,
    showAccessibleSummary: false,
    showCaption: false,
    copy,
  } as const;

  return (
    <section
      className="open-ena-3d-group-contrast open-ena-3d-ordered-result-layout"
      data-testid="open-ena-3d-ordered-result-layout"
      data-ena-analysis-kind="ona"
      data-ena-dimensions="3"
      data-ena-camera-sync="shared"
      data-ena-scene-frame="full-result"
      aria-labelledby={titleId}
    >
      <header className="open-ena-3d-triptych-header">
        <div>
          <span>LINKED 3D ORDERED NETWORKS</span>
          <h2 id={titleId}>{copy.ona.layout.overallPlot}</h2>
        </div>
        <p>{props.xDimension} × {props.yDimension} × {props.zDimension} · shared axes, frame, and camera</p>
      </header>

      <div className="open-ena-3d-triptych-layout">
        <div className="open-ena-3d-triptych-center" data-testid="open-ena-ona-3d-center-surface">
          <article
            id={overallFullscreenTargetId}
            ref={overallFullscreenRef}
            className="open-ena-3d-triptych-panel open-ena-3d-triptych-main"
            data-testid="open-ena-ona-3d-overall-plot"
            data-ena-plot-role="comparison"
            data-ena-network-role="descriptive-overall-directed"
          >
            <header className="open-ena-3d-triptych-heading">
              <div>
                <h3>{copy.ona.layout.overallPlot} <small>3D</small></h3>
                <p>{copy.ona.layout.overallSubtitle}</p>
              </div>
              <span>{result.set.points.length} {copy.workspace.units.toLowerCase()}</span>
            </header>
            <OpenEnaInteractive3DPlot
              {...sharedPlotProps}
              analysisKind="ona"
              orderedScope={{ kind: "overall" }}
              plotKind="comparison"
              fullscreenTarget={{ id: overallFullscreenTargetId, ref: overallFullscreenRef }}
              testId="open-ena-ona-3d-overall-canvas"
              ariaLabel={`${copy.ona.layout.overallPlot}, ${copy.views.threeD}`}
            />
          </article>
        </div>

        <div
          className="open-ena-3d-triptych-sides"
          data-ena-side-plot-count={Number(Boolean(primaryGroup)) + Number(Boolean(secondaryGroup))}
        >
          {primaryGroup ? (
            <article
              id={primaryFullscreenTargetId}
              ref={primaryFullscreenRef}
              className="open-ena-3d-triptych-panel open-ena-3d-triptych-side"
              data-testid="open-ena-ona-3d-primary-plot"
              data-ena-plot-role="primary"
              data-ena-network-role="descriptive-group-directed"
              style={{ "--ena-3d-group-color": primaryGroup.color ?? "#3366cc" } as CSSProperties}
            >
              <header className="open-ena-3d-triptych-heading">
                <div>
                  <h3>{copy.ona.layout.primaryPlot} <small>3D</small></h3>
                  <p><strong>{primaryGroup.name}</strong> · {copy.ona.layout.groupMeanSubtitle}</p>
                </div>
                <span>n = {primaryGroup.count}</span>
              </header>
              <OpenEnaInteractive3DPlot
                {...sharedPlotProps}
                analysisKind="ona"
                orderedScope={{ kind: "group", name: primaryGroup.name }}
                plotKind="primary"
                fullscreenTarget={{ id: primaryFullscreenTargetId, ref: primaryFullscreenRef }}
                compact
                showPoints={false}
                showUnitLabels={false}
                showVariance={false}
                testId="open-ena-ona-3d-primary-canvas"
                ariaLabel={`${copy.ona.layout.primaryPlot}: ${primaryGroup.name}, ${copy.views.threeD}`}
              />
            </article>
          ) : null}

          {secondaryGroup ? (
            <article
              id={secondaryFullscreenTargetId}
              ref={secondaryFullscreenRef}
              className="open-ena-3d-triptych-panel open-ena-3d-triptych-side"
              data-testid="open-ena-ona-3d-secondary-plot"
              data-ena-plot-role="secondary"
              data-ena-network-role="descriptive-group-directed"
              style={{ "--ena-3d-group-color": secondaryGroup.color ?? "#dc3912" } as CSSProperties}
            >
              <header className="open-ena-3d-triptych-heading">
                <div>
                  <h3>{copy.ona.layout.secondaryPlot} <small>3D</small></h3>
                  <p><strong>{secondaryGroup.name}</strong> · {copy.ona.layout.groupMeanSubtitle}</p>
                </div>
                <span>n = {secondaryGroup.count}</span>
              </header>
              <OpenEnaInteractive3DPlot
                {...sharedPlotProps}
                analysisKind="ona"
                orderedScope={{ kind: "group", name: secondaryGroup.name }}
                plotKind="secondary"
                fullscreenTarget={{ id: secondaryFullscreenTargetId, ref: secondaryFullscreenRef }}
                compact
                showPoints={false}
                showUnitLabels={false}
                showVariance={false}
                testId="open-ena-ona-3d-secondary-canvas"
                ariaLabel={`${copy.ona.layout.secondaryPlot}: ${secondaryGroup.name}, ${copy.views.threeD}`}
              />
            </article>
          ) : (
            <section className="ena-ordered-direction-guide" role="note">
              <p>{copy.ona.layout.unavailableGroupPlot}</p>
            </section>
          )}

          <div
            className="ena-set-right-tools"
            data-testid="open-ena-ona-3d-right-tools"
            aria-label={copy.ona.layout.rightToolsLabel}
          >
            {rightTools}
          </div>
        </div>
      </div>
    </section>
  );
}
