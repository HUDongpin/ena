import { assertCurrentCapabilityV3 } from "./inference-consumers-v3";
import { captureExecutionPlanInputV3, type StandardExecutionPlanV3 } from "./model-v3/execution-plan";
import { canonicalJsonV3 } from "./model-v3/canonical-json";
import type { BoundResultV3 } from "./model-v3/types";
import type { EndpointMeansFrameInput2D, EndpointMeansFrame2D } from "./endpoint-means-frame-2d-compute";
import type { OpenEnaContrastPresentation } from "./bound-presentation-v3";

export const supportsEndpointMeansFrame2D = (result: BoundResultV3 | null) => Boolean(result
  && result.configuration.analysisFamily === "standard"
  && result.configuration.analysis.model.type === "EndPoint"
  && result.configuration.analysis.rotation.type === "means"
  && result.executionProvenance.projection.estimableAxes.length >= 2);

export async function prepareEndpointMeansFrame2DV3(input: unknown, independentPlan: unknown): Promise<EndpointMeansFrameInput2D> {
  const capturedPlan = captureExecutionPlanInputV3(independentPlan);
  const result = await assertCurrentCapabilityV3(input, capturedPlan, "build-model");
  if (result.configuration.analysisFamily !== "standard"
    || result.configuration.analysis.model.type !== "EndPoint" || result.configuration.analysis.rotation.type !== "means"
    || !supportsEndpointMeansFrame2D(result)) throw new TypeError("2D R-compatible framing requires a current direct Means EndPoint model.");
  const rotation = result.configuration.analysis.rotation;
  const plan = capturedPlan as StandardExecutionPlanV3;
  const names = new Map(plan.identityDictionary.units.map(unit => [unit.token, unit.displayLabel]));
  const first = new Map<string, number>();
  for (const row of plan.rows) { const name = names.get(row.unitToken)!; first.set(name, Math.min(first.get(name) ?? Infinity, row.sourceRowIndex)); }
  const order = result.set.pointsForProjection.map((row, index) => ({ index, name: String(row.ENA_UNIT) }));
  if (order.some(({ name }) => !first.has(name))) throw new Error("2D framing lost source Unit identity.");
  order.sort((a, b) => first.get(a.name)! - first.get(b.name)!);
  const codes = result.configuration.codes.map(code => result.executionProvenance.labels.codes.find(c => c.sourceColumn === code.column)?.column);
  const edges: number[] = [];
  for (let j = 1; j < codes.length; j++) for (let i = 0; i < j; i++) {
    const index = result.set.adjacencyKey.findIndex(edge => (edge.source === codes[i] && edge.target === codes[j]) || (edge.target === codes[i] && edge.source === codes[j]));
    if (index < 0) throw new Error("2D framing lost source edge identity.");
    edges.push(index);
  }
  const groups = result.executionProvenance.identityDictionary.groups;
  const groupId = new Map(groups.map((group, index) => [group.displayLabel, index]));
  const membership = new Map(groups.map(group => {
    const value = group.fields.find(field => field.column === rotation.contrast.groupColumn)?.value;
    return [group.displayLabel, value && canonicalJsonV3(value) === canonicalJsonV3(rotation.contrast.negativeLevel) ? -1
      : value && canonicalJsonV3(value) === canonicalJsonV3(rotation.contrast.positiveLevel) ? 1 : 0];
  }));
  const dimensions = result.set.rotation.rotationColumns.slice(0, 2);
  const pointByUnit = new Map(result.set.points.map(row => [String(row.ENA_UNIT), row]));
  return {
    points: order.map(({ index }) => edges.map(edge => Number(result.set.pointsForProjection[index][result.set.codeColumns[edge]]))),
    fittedBasis: edges.map(edge => result.set.rotation.rotationMatrix[edge].slice(0, 2)),
    fittedPoints: order.map(({ name }) => dimensions.map(axis => Number(pointByUnit.get(name)?.[axis]))),
    fittedNodes: (result.set.rotation.nodes ?? []).map(row => dimensions.map(axis => Number(row[axis]))),
    contrastGroups: order.map(({ index }) => membership.get(String(result.set.pointsForProjection[index].Group)) ?? 0),
    groupIds: order.map(({ index }) => groupId.get(String(result.set.pointsForProjection[index].Group)) ?? -1),
  };
}

/** Apply only at the 2D presentation boundary. Leave science and 3D untouched. */
export function applyEndpointMeansFrame2D<T extends Pick<OpenEnaContrastPresentation, "primary" | "secondary" | "officialPlotFrame">>(contrast: T, frame: EndpointMeansFrame2D): T {
  // A user may exclude hidden units from displayed means/CIs. Permit the camera
  // to expand for those CIs without importing the legacy outlier-based extent.
  const intervalMaximum = [contrast.primary, contrast.secondary].flatMap(side => Object.values(side.meanConfidenceIntervalsByDimension ?? {}))
    .reduce((max, interval) => interval.status === "estimable" ? Math.max(max, Math.abs(interval.lower), Math.abs(interval.upper)) : max, 0);
  const maxPosition = Math.max(frame.maxPosition, Number((intervalMaximum * frame.pointScaleFactor).toFixed(4)));
  return { ...contrast, officialPlotFrame: { source: "webena-points-rotated-scaled", pointScaleFactor: frame.pointScaleFactor, maxPosition, extremePosition: maxPosition * 1.2 } };
}

export function endpointMeansFrameReceipt2D(contrast: Pick<OpenEnaContrastPresentation, "officialPlotFrame"> | null, frame: EndpointMeansFrame2D | null) {
  return {
    baseReplayFrame: frame,
    displayFrame: frame && contrast?.officialPlotFrame ? { ...frame, ...contrast.officialPlotFrame } : null,
  };
}
