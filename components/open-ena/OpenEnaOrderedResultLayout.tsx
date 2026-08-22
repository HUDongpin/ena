import type { ReactNode, Ref } from "react";
import type { OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import type { OpenEnaOrderedNodeTotals } from "@/lib/open-ena/ordered-plot";
import type { OpenEnaConfig, OpenEnaResult } from "@/lib/open-ena/types";
import OpenEnaOrderedPlot, { type OpenEnaOrderedPlotCopy } from "./OpenEnaOrderedPlot";

export interface OpenEnaOrderedResultLayoutCopy {
  overallPlot: string;
  overallSubtitle: string;
  primaryPlot: string;
  secondaryPlot: string;
  groupMeanSubtitle: string;
  dataView: string;
  dataViewSubtitle: string;
  unavailableGroupPlot: string;
  descriptiveBoundary: string;
  directionGuide: string;
  rightToolsLabel: string;
}

const DEFAULT_COPY: OpenEnaOrderedResultLayoutCopy = {
  overallPlot: "Overall ONA",
  overallSubtitle: "All analytic units · descriptive ordered network",
  primaryPlot: "Primary Plot",
  secondaryPlot: "Secondary Plot",
  groupMeanSubtitle: "Descriptive group mean · no subtraction",
  dataView: "Ordered Data View",
  dataViewSubtitle: "Runtime-audited ground → response contributions",
  unavailableGroupPlot: "A second descriptive group network is not available for this model.",
  descriptiveBoundary: "Ordered networks are descriptive-only in this release; these panels do not compute a group difference or inferential effect.",
  directionGuide: "Direction: triangle apex is ground/source, base is response/target; a chevron marks the stronger direction and an inner disc marks a self-connection.",
  rightToolsLabel: "Ordered plot tools",
};

export interface OpenEnaOrderedResultLayoutProps {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  primaryGroupName: string | null;
  secondaryGroupName: string | null;
  centerMode: "plot" | "data";
  dataView?: ReactNode;
  rightTools?: ReactNode;
  xDimension: string;
  yDimension: string;
  edgeThreshold: number;
  edgeScale: number;
  pointScale: number;
  textScale: number;
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
  copy?: Partial<OpenEnaOrderedResultLayoutCopy>;
  plotCopy?: Partial<OpenEnaOrderedPlotCopy>;
  svgRef?: Ref<SVGSVGElement>;
}

export default function OpenEnaOrderedResultLayout(props: OpenEnaOrderedResultLayoutProps) {
  const {
    result,
    config,
    centerMode,
    dataView,
    rightTools,
    primaryGroupName,
    secondaryGroupName,
  } = props;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const primaryGroup = result.groups.find((group) => group.name === primaryGroupName)
    ?? result.groups[0]
    ?? null;
  const secondaryGroup = result.groups.find((group) => (
    group.name === secondaryGroupName && group.name !== primaryGroup?.name
  )) ?? result.groups.find((group) => group.name !== primaryGroup?.name) ?? null;
  const sharedPlotProps = {
    result,
    config,
    xDimension: props.xDimension,
    yDimension: props.yDimension,
    edgeThreshold: props.edgeThreshold,
    edgeScale: props.edgeScale,
    pointScale: props.pointScale,
    textScale: props.textScale,
    plotZoom: props.plotZoom,
    flipX: props.flipX,
    flipY: props.flipY,
    showPoints: props.showPoints,
    showNetworks: props.showNetworks,
    showLabels: props.showLabels,
    showUnitLabels: props.showUnitLabels,
    showVariance: props.showVariance,
    codeColors: props.codeColors,
    nodeTotals: props.nodeTotals,
    copy: props.plotCopy,
  };

  return (
    <section
      className="open-ena-set-comparison open-ena-ordered-result-layout"
      data-testid="open-ena-ordered-result-layout"
      data-ena-center-mode={centerMode}
      aria-label={copy.overallPlot}
    >
      <div className="ena-set-comparison-layout">
        <div
          data-testid="open-ena-ordered-center-surface"
          data-ena-center-mode={centerMode}
          data-ena-workbench-region="center"
          style={{ minWidth: 0 }}
        >
          {centerMode === "data" ? (
            <section className="ena-set-main-plot" role="region" aria-label={copy.dataView}>
              <header className="ena-set-plot-heading">
                <div><h3>{copy.dataView}</h3><p>{copy.dataViewSubtitle}</p></div>
                <span>{props.xDimension} × {props.yDimension}</span>
              </header>
              {dataView ?? <p className="ena-sets-compatibility-note">{copy.unavailableGroupPlot}</p>}
            </section>
          ) : (
            <figure className="ena-set-main-plot" tabIndex={0} aria-label={copy.overallPlot}>
              <header className="ena-set-plot-heading">
                <div><h3>{copy.overallPlot}</h3><p>{copy.overallSubtitle}</p></div>
                <span>{props.xDimension} × {props.yDimension}</span>
              </header>
              <OpenEnaOrderedPlot
                {...sharedPlotProps}
                scope={{ kind: "overall" }}
                compact={false}
                svgRef={props.svgRef}
              />
              <figcaption>{copy.descriptiveBoundary}</figcaption>
            </figure>
          )}
        </div>

        <div
          className="ena-set-side-plots"
          data-ena-workbench-region="right-stack"
          data-ena-side-plot-count={Number(Boolean(primaryGroup)) + Number(Boolean(secondaryGroup))}
        >
          {primaryGroup ? (
            <figure tabIndex={0} aria-label={`${copy.primaryPlot}: ${primaryGroup.name}`} data-ena-panel-role="primary">
              <header className="ena-set-plot-heading">
                <div><h3>{copy.primaryPlot}</h3><p>{primaryGroup.name} · {copy.groupMeanSubtitle}</p></div>
                <span>n = {primaryGroup.count}</span>
              </header>
              <OpenEnaOrderedPlot
                {...sharedPlotProps}
                scope={{ kind: "group", name: primaryGroup.name }}
                showPoints={false}
                showUnitLabels={false}
                showVariance={false}
                compact
              />
            </figure>
          ) : null}
          {secondaryGroup ? (
            <figure tabIndex={0} aria-label={`${copy.secondaryPlot}: ${secondaryGroup.name}`} data-ena-panel-role="secondary">
              <header className="ena-set-plot-heading">
                <div><h3>{copy.secondaryPlot}</h3><p>{secondaryGroup.name} · {copy.groupMeanSubtitle}</p></div>
                <span>n = {secondaryGroup.count}</span>
              </header>
              <OpenEnaOrderedPlot
                {...sharedPlotProps}
                scope={{ kind: "group", name: secondaryGroup.name }}
                showPoints={false}
                showUnitLabels={false}
                showVariance={false}
                compact
              />
            </figure>
          ) : (
            <section className="ena-ordered-direction-guide" role="note">
              <h3>{copy.directionGuide}</h3>
              <p>{copy.unavailableGroupPlot}</p>
            </section>
          )}
          <div
            className="ena-set-right-tools"
            data-testid="open-ena-ordered-right-tools"
            aria-label={copy.rightToolsLabel}
          >
            {rightTools}
          </div>
        </div>
      </div>
    </section>
  );
}
