import { assertCurrentCapabilityV3 } from "./inference-consumers-v3";
import type { BoundOnaResultV3 } from "./model-v3/types";

/** Admitted historical ONA facts, with explicit public/source namespaces. No
 * raw source membership or legacy order/provenance is reconstructed. */
export function buildHistoricalOnaViewV3(result: BoundOnaResultV3, groupToken: string | null = null) {
  const dictionary = result.executionProvenance.identityDictionary;
  const group = groupToken === null ? null : dictionary.groups.find((entry) => entry.token === groupToken);
  if (groupToken !== null && !group) throw new TypeError("Unknown typed ONA Group.");
  const selected = <T extends typeof result.set.points>(rows: T) => rows.filter((row) => group == null || row.Group === group.displayLabel);
  const counts = selected(result.set.connectionCounts), weights = selected(result.set.lineWeights), points = selected(result.set.points);
  const source = new Map(result.executionProvenance.labels.codes.map((code) => [code.column, code.sourceColumn]));
  const edges = result.set.adjacencyKey.map((edge) => ({
    groundSource: source.get(edge.source)!, responseTarget: source.get(edge.target)!,
    groundPublicCode: edge.source, responsePublicCode: edge.target,
    groundIndex: edge.sourceIndex, responseIndex: edge.targetIndex,
    maskEnabled: result.configuration.directionalMask.enabled[edge.sourceIndex][edge.targetIndex],
    rawAggregateCount: counts.reduce((sum, row) => sum + Number(row[edge.name]), 0),
    equalUnitNormalizedMean: weights.length ? weights.reduce((sum, row) => sum + Number(row[edge.name]), 0) / weights.length : null,
  }));
  return { kind: "open-ena-bound-ona-descriptive-view", binding: result.binding, group: group?.fields ?? null,
    unitCount: points.length, codeCount: result.set.codes.length, directedCellCount: edges.length,
    rawConnectionTotal: edges.reduce((sum, edge) => sum + edge.rawAggregateCount, 0),
    edges, variance: result.set.variance,
    audit: result.orderedAudit,
    auditRows: result.orderedAudit.responseRowIndices.map((responseRowIndex, index) => ({ responseRowIndex, previousResponseRowIndex: result.orderedAudit.previousResponseRowIndices[index], priorRowCount: result.orderedAudit.priorRowCounts[index], horizonOrdinal: result.orderedAudit.horizonOrdinals[index], edgeValues: result.orderedAudit.edgeValues[index] })),
    responseNodeTotals: result.orderedResponseNodeSummary,
    runtimeSourceRowIndices: result.executionProvenance.ordering.runtimeSourceRowIndices,
    meaning: "Descriptive directed ground/source to response/target networks. Group filtering affects aggregate descriptive tables only; the deidentified audit covers the full run and carries no per-Group source membership. No difference test or inferential effect is computed." };
}

export async function buildOnaBoundViewV3(input: unknown, independentPlan: unknown, groupToken: string | null = null) {
  const result = await assertCurrentCapabilityV3(input, independentPlan, "export-current-model");
  if (result.configuration.analysisFamily !== "ona") throw new TypeError("ONA view requires an ONA bound result.");
  return buildHistoricalOnaViewV3(result as BoundOnaResultV3, groupToken);
}
