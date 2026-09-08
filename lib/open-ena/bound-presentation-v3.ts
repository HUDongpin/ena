import type { ENASet } from "jena-js";
import type { BoundResultV3 } from "./model-v3/types";
import type { GroupNetwork, OpenEnaConfig, OpenEnaResult } from "./types";
import { WEB_ENA_MAX_POSITION_MODIFIER, type OpenEnaPairwiseContrast, type buildContrastV3 } from "./contrasts";
import { resolveOpenEnaGroupDisplayOptions, type OpenEnaGroupDisplaySettingsByGroup, type OpenEnaResolvedGroupDisplaySide } from "./group-display";
import { marginalMeanIntervalPair, marginalMeanStudentT95, meanCenteredIqrOutlierIntervalPair } from "./uncertainty";

export type OpenEnaContrastPresentation = Pick<OpenEnaPairwiseContrast,
  "axes" | "coordinateExtent" | "officialPlotFrame" | "geometry" | "primary" | "secondary" | "nodes" | "edges" | "edgeScaleDenominators">
  & { configuration: Pick<OpenEnaConfig, "unitColumns" | "conversationColumns">;
    declaredGroups: ReadonlyArray<{ name: string }>;
    resultProvenance?: Pick<OpenEnaPairwiseContrast["resultProvenance"], "projectionReference"> };

export function presentBoundContrastV3(value: Awaited<ReturnType<typeof buildContrastV3>>): OpenEnaContrastPresentation {
  return { axes: [...value.axes], coordinateExtent: value.coordinateExtent, officialPlotFrame: value.officialPlotFrame,
    geometry: value.geometry, primary: value.primary, secondary: value.secondary, nodes: value.nodes, edges: value.edges,
    edgeScaleDenominators: value.edgeScaleDenominators, declaredGroups: value.declaredGroups,
    configuration: { unitColumns: [...value.configuration.units.columns], conversationColumns: [...value.configuration.horizons.columns] } };
}

/** Rendering facts only. No legacy statistics, inference receipt or Reference
 * source authority is constructed to fit an older component's type. */
export type OpenEnaPlotResult = Pick<OpenEnaResult, "set" | "groups" | "dimensions" | "analyzedAt" | "projectionReference">
  & Partial<Pick<OpenEnaResult, "executionProvenance" | "orderedAudit" | "orderedResponseNodeSummary" | "provenanceBinding">>
  & { readonly boundPresentation?: BoundResultV3;
    readonly trajectoryPresentation?: ReturnType<typeof import("./trajectory-presentation-v3").buildTrajectoryPresentationV3>;
    readonly groupPresentation?: { allSuppressed: boolean; settingsByName: OpenEnaGroupDisplaySettingsByGroup; hiddenUnits: ReadonlySet<string> } };

export function nativePlotGroupSettingsV3(result: OpenEnaPlotResult, name: string) {
  const options = resolveOpenEnaGroupDisplayOptions(result.groupPresentation?.settingsByName ?? {}, name);
  return result.groupPresentation?.allSuppressed ? { ...options, showUnitPoints: false, showMean: false, showConfidenceIntervals: false, showOutlierIntervals: false } : options;
}

/** Native contrast display filtering is never handed back to inference. The
 * canonical geometry and coordinate scale stay fixed. The display envelope may
 * expand for subset intervals, but never shrinks below the full-result frame. */
export function presentBoundGroupDisplayV3(value: Awaited<ReturnType<typeof buildContrastV3>>, settings: OpenEnaGroupDisplaySettingsByGroup, hiddenKeys: readonly string[], suppressed: boolean) {
  const contrast = presentBoundContrastV3(value);
  const hidden = new Set(hiddenKeys), dictionary = value.result.executionProvenance.identityDictionary;
  const units = new Map(dictionary.units.map((unit) => [unit.displayLabel, unit.token]));
  function side(original: typeof contrast.primary): { side: typeof original; display: OpenEnaResolvedGroupDisplaySide } {
    const group = dictionary.groups.find((group) => group.displayLabel === original.name)!;
    const originalOptions = resolveOpenEnaGroupDisplayOptions(settings, group.token);
    const options = suppressed ? { ...originalOptions, showUnitPoints: false, showMean: false, showConfidenceIntervals: false, showOutlierIntervals: false } : originalOptions;
    const visible = original.unitIds.filter((unit) => !hidden.has(JSON.stringify([group.token, units.get(unit)])));
    const summary = options.includeHiddenPoints ? original.unitIds : visible;
    const summarySet = new Set(summary);
    const display: OpenEnaResolvedGroupDisplaySide = { name: original.name, settings: options, totalUnitCount: original.unitCount, validUnitCount: original.points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)).length,
      hiddenUnitCount: original.unitCount - visible.length, visibleUnitIds: visible, summaryUnitIds: summary };
    if (summary.length === 0) return { side: original, display: { ...display, settings: { ...options, showMean: false, showConfidenceIntervals: false, showOutlierIntervals: false } } };
    const points = value.result.set.points.filter((row) => summarySet.has(String(row.ENA_UNIT)));
    const weights = value.result.set.lineWeights.filter((row) => summarySet.has(String(row.ENA_UNIT)));
    const means = (rows: typeof points, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, rows.reduce((sum, row) => sum + Number(row[key]), 0) / rows.length]));
    const meanPoint = means(points, value.geometry.dimensions);
    return { display, side: { ...original, unitCount: summary.length, meanPoint,
      meanWeights: means(weights, value.result.set.codeColumns),
      meanConfidenceIntervals: marginalMeanIntervalPair(points.map((row) => ({ x: Number(row[value.axes[0]]), y: Number(row[value.axes[1]]) })), value.axes),
      outlierIntervals: meanCenteredIqrOutlierIntervalPair(points.map((row) => ({ x: Number(row[value.axes[0]]), y: Number(row[value.axes[1]]) })), value.axes),
      meanConfidenceIntervalsByDimension: Object.fromEntries(value.geometry.dimensions.map((axis) => [axis, marginalMeanStudentT95(points.map((row) => Number(row[axis])))])),
    } };
  }
  const primary = side(contrast.primary), secondary = side(contrast.secondary);
  const frame = contrast.officialPlotFrame;
  const intervalExtent = [primary.side, secondary.side].flatMap((side) => [
    ...Object.values(side.meanConfidenceIntervalsByDimension ?? {}),
    side.outlierIntervals?.x, side.outlierIntervals?.y,
  ]).reduce((maximum, interval) => interval?.status === "estimable" ? Math.max(maximum, Math.abs(interval.lower), Math.abs(interval.upper)) : maximum, 0);
  const maxPosition = frame ? Math.max(frame.maxPosition, intervalExtent * frame.pointScaleFactor) : 0;
  const officialPlotFrame = frame ? { ...frame, maxPosition, extremePosition: Math.max(frame.extremePosition, maxPosition * WEB_ENA_MAX_POSITION_MODIFIER) } : undefined;
  return { contrast: { ...contrast, officialPlotFrame, primary: primary.side, secondary: secondary.side,
    edges: contrast.edges.map((edge) => { const primaryWeight = primary.side.meanWeights[edge.name], secondaryWeight = secondary.side.meanWeights[edge.name]; const signedDifference = primaryWeight - secondaryWeight;
      return { ...edge, primaryWeight, secondaryWeight, signedDifference, stronger: signedDifference > 0 ? "primary" as const : signedDifference < 0 ? "secondary" as const : "equal" as const }; }) },
    primary: primary.display, secondary: secondary.display, hiddenUnitKeys: [...hiddenKeys] };
}

/** Estimable latent axes are not necessarily materialized point/node columns.
 * Match the accepted native consumer boundary; never turn absent coordinates
 * into a displayed zero or invent additional node geometry. */
export function retainedBoundPlotAxesV3(bound: BoundResultV3) {
  return bound.executionProvenance.projection.estimableAxes.filter((axis) =>
    bound.set.points.every((point) => typeof point[axis] === "number" && Number.isFinite(point[axis]))
    && (bound.set.rotation.nodes ?? []).every((node) => typeof node[axis] === "number" && Number.isFinite(node[axis])));
}

const colors = ["#cc423a", "#218ebf", "#56b09d", "#8554a3", "#bf7a21", "#4d4d4d"];
const extent = (value: number | "Infinity") => value === "Infinity" ? Infinity : value;

/** An admitted result can remain visibly historical. This projection does not
 * establish currentness; scientific consumers still require an independent plan. */
export function presentBoundResultV3(bound: BoundResultV3): {
  result: OpenEnaPlotResult;
  config: OpenEnaConfig;
  codeSourceByRenderedCode: Readonly<Record<string, string>>;
  codeLabelByRenderedCode: Readonly<Record<string, string>>;
} {
  const p = bound.executionProvenance, c = bound.configuration;
  const dimensions = retainedBoundPlotAxesV3(bound);
  const set: ENASet = { ...structuredClone(bound.set), functionParams: {
    ...structuredClone(bound.set.functionParams),
    windowSizeBack: extent(bound.set.functionParams.windowSizeBack),
    windowSizeForward: extent(bound.set.functionParams.windowSizeForward),
  } };
  const names = c.units.group.type === "none" ? ["All Units"] : p.identityDictionary.groups.map((group) => group.displayLabel);
  const groups: GroupNetwork[] = names.map((name, index) => {
    const points = set.points.filter((point) => c.units.group.type === "none" || point.Group === name);
    const weights = set.lineWeights.filter((point) => c.units.group.type === "none" || point.Group === name);
    // Overall trajectory summaries give each fitted Unit equal weight. The
    // separate Horizon centroid layer uses the observed population at that Horizon.
    const average = (rows: typeof points, key: string) => {
      const byUnit = new Map<string, number[]>();
      for (const row of rows) { const unit = String(row.ENA_UNIT); const values = byUnit.get(unit) ?? []; values.push(Number(row[key])); byUnit.set(unit, values); }
      const means = [...byUnit.values()].map((values) => values.reduce((total, value) => total + value, 0) / values.length);
      return means.length ? means.reduce((total, value) => total + value, 0) / means.length : 0;
    };
    return { name, count: new Set(points.map((row) => row.Unit)).size, pointCount: points.length,
      color: colors[index % colors.length],
      meanPoint: Object.fromEntries(dimensions.map((axis) => [axis, average(points, axis)])),
      meanWeights: Object.fromEntries(set.adjacencyKey.map((edge) => [edge.name, average(weights, edge.name)])),
    };
  });
  const ona = c.analysisFamily === "ona";
  const mask = ona ? { schemaVersion: 1 as const, codeOrder: [...set.codes], enabled: c.directionalMask.enabled.map((row) => [...row]) } : null;
  const config: OpenEnaConfig = {
    analysisKind: ona ? "ona" : "ena", unitColumns: [...set.units], conversationColumns: [...set.conversation],
    groupColumn: c.units.group.type === "none" ? null : "Group", codes: [...set.codes],
    model: c.analysisFamily === "ona" ? "EndPoint" : c.analysis.model.type, window: c.window.type,
    windowSizeBack: extent(bound.set.functionParams.windowSizeBack), windowSizeForward: extent(bound.set.functionParams.windowSizeForward),
    weightBy: p.weighting.runtime, rotation: p.projection.type === "means" ? "mean" : p.projection.type,
    referenceRotationId: bound.binding.referenceId, centerAlignToOrigin: p.projection.centerAlignToOrigin,
    ...(ona ? { directionalMask: mask, orderPolicy: null } : {}),
  };
  const result: OpenEnaPlotResult = { set, groups, dimensions, analyzedAt: bound.createdAt,
    projectionReference: null, boundPresentation: bound,
    ...("orderedAudit" in bound ? { orderedAudit: bound.orderedAudit, orderedResponseNodeSummary: bound.orderedResponseNodeSummary } : {}),
  };
  return { result, config,
    codeSourceByRenderedCode: Object.fromEntries(p.labels.codes.map((code) => [code.column, code.sourceColumn])),
    codeLabelByRenderedCode: Object.fromEntries(p.labels.codes.map((code) => [code.column, code.displayLabel])),
  };
}
