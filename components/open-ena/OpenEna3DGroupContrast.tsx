"use client";

import type { CSSProperties, ReactNode } from "react";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type { OpenEnaPairwiseContrast } from "@/lib/open-ena/contrasts";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import type { OpenEna3dAspectRatio, OpenEna3dCamera } from "@/lib/open-ena/plot3d";
import type { CameraPreset, OpenEnaResult } from "@/lib/open-ena/types";
import OpenEnaInteractive3DPlot from "./OpenEnaInteractive3DPlot";

export interface OpenEna3DGroupContrastProps {
  result: OpenEnaResult;
  contrast: OpenEnaPairwiseContrast;
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
  plotResetRevision?: number;
  sharedCamera?: OpenEna3dCamera | null;
  onCameraChange?: (camera: OpenEna3dCamera) => void;
  sharedAspectRatio?: OpenEna3dAspectRatio | null;
  onAspectRatioChange?: (aspectRatio: OpenEna3dAspectRatio | null) => void;
  centerMode: "plot" | "data";
  dataView?: ReactNode;
  copy: OpenEnaCopy;
}

export default function OpenEna3DGroupContrast({
  result,
  contrast,
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
  edgeScale,
  edgeThreshold,
  pointScale,
  plotZoom,
  flipX,
  flipY,
  plotResetRevision = 0,
  sharedCamera = null,
  onCameraChange,
  sharedAspectRatio = null,
  onAspectRatioChange,
  centerMode,
  dataView,
  copy,
}: OpenEna3DGroupContrastProps) {
  const sharedPlotProps = {
    result,
    contrast,
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
    showTrajectories: false,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    flipX,
    flipY,
    plotResetRevision,
    initialCamera: sharedCamera,
    onCameraChange,
    initialAspectRatio: sharedAspectRatio,
    onAspectRatioChange,
    copy,
  } as const;

  return (
    <section
      className="open-ena-3d-group-contrast"
      data-testid="open-ena-3d-group-contrast"
      data-ena-dimensions="3"
      data-ena-camera-sync="shared"
      data-ena-scene-frame="full-result"
      data-ena-center-mode={centerMode}
      data-ena-difference-edge-scale-definition={contrast.edgeScaleDenominators.differenceDefinition}
      data-ena-shared-mean-edge-scale-definition={contrast.edgeScaleDenominators.sharedMeanDefinition}
      aria-labelledby="open-ena-3d-group-contrast-title"
    >
      <header className="open-ena-3d-triptych-header">
        <div>
          <span>LINKED 3D GROUP COMPARISON</span>
          <h2 id="open-ena-3d-group-contrast-title">
            {contrast.primary.name} − {contrast.secondary.name}
          </h2>
        </div>
        <p>One fitted jENA space · shared axes, frame, and camera</p>
      </header>

      <div className="open-ena-3d-triptych-layout">
        <div
          className="open-ena-3d-triptych-center"
          data-testid="open-ena-3d-center-surface"
          data-ena-center-mode={centerMode}
        >
          {centerMode === "data" ? (
            <article
              className="open-ena-3d-triptych-panel open-ena-3d-triptych-main open-ena-3d-triptych-data-view"
              data-testid="open-ena-3d-data-view"
              role="region"
              aria-label="Data View"
            >
              {dataView ?? (
                <p className="ena-sets-compatibility-note" role="status">
                  Data View is not available for this 3D comparison result.
                </p>
              )}
            </article>
          ) : (
            <article
              className="open-ena-3d-triptych-panel open-ena-3d-triptych-main"
              data-testid="open-ena-3d-comparison-plot"
              data-ena-plot-role="comparison"
              data-ena-network-role="signed-primary-minus-secondary"
            >
              <header className="open-ena-3d-triptych-heading">
                <div>
                  <h3>Comparison Plot <small>3D</small></h3>
                  <p>{contrast.primary.name} − {contrast.secondary.name} · signed edge differences</p>
                </div>
                <span>n = {contrast.primary.unitCount} vs {contrast.secondary.unitCount}</span>
              </header>
              <OpenEnaInteractive3DPlot
                {...sharedPlotProps}
                plotKind="comparison"
                displayModeBar={false}
                testId="open-ena-interactive-3d-plot"
                ariaLabel={`Comparison 3D plot: ${contrast.primary.name} minus ${contrast.secondary.name}.`}
              />
            </article>
          )}
        </div>

        <div className="open-ena-3d-triptych-sides">
          <article
            className="open-ena-3d-triptych-panel open-ena-3d-triptych-side"
            data-testid="open-ena-3d-primary-plot"
            data-ena-plot-role="primary"
            data-ena-network-role="group-mean"
            style={{ "--ena-3d-group-color": contrast.primary.color ?? "#3366cc" } as CSSProperties}
          >
            <header className="open-ena-3d-triptych-heading">
              <div>
                <h3>Primary Plot <small>3D</small></h3>
                <p><strong>{contrast.primary.name}</strong> · n = {contrast.primary.unitCount} · group mean network</p>
              </div>
            </header>
            <OpenEnaInteractive3DPlot
              {...sharedPlotProps}
              plotKind="primary"
              compact
              displayModeBar={false}
              showAccessibleSummary={false}
              showCaption={false}
              showVariance={false}
              showUnitLabels={false}
              testId="open-ena-3d-primary-canvas"
              ariaLabel={`Primary 3D plot: ${contrast.primary.name}, ${contrast.primary.unitCount} analytic units. Camera linked to Comparison.`}
            />
          </article>

          <article
            className="open-ena-3d-triptych-panel open-ena-3d-triptych-side"
            data-testid="open-ena-3d-secondary-plot"
            data-ena-plot-role="secondary"
            data-ena-network-role="group-mean"
            style={{ "--ena-3d-group-color": contrast.secondary.color ?? "#dc3912" } as CSSProperties}
          >
            <header className="open-ena-3d-triptych-heading">
              <div>
                <h3>Secondary Plot <small>3D</small></h3>
                <p><strong>{contrast.secondary.name}</strong> · n = {contrast.secondary.unitCount} · group mean network</p>
              </div>
            </header>
            <OpenEnaInteractive3DPlot
              {...sharedPlotProps}
              plotKind="secondary"
              compact
              displayModeBar={false}
              showAccessibleSummary={false}
              showCaption={false}
              showVariance={false}
              showUnitLabels={false}
              testId="open-ena-3d-secondary-canvas"
              ariaLabel={`Secondary 3D plot: ${contrast.secondary.name}, ${contrast.secondary.unitCount} analytic units. Camera linked to Comparison.`}
            />
          </article>
        </div>
      </div>
    </section>
  );
}
