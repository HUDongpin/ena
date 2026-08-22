import type { Row } from "jena-js";
import { rowsToCsv } from "./export";
import {
  buildOpenEnaOnaDescriptiveSummary,
  validateOpenEnaOnaOrderedAudit,
  type OpenEnaOnaDescriptiveScope,
} from "./ona-descriptive";
import type { OpenEnaConfig, OpenEnaResult } from "./types";

export const OPEN_ENA_ONA_AUDIT_REIDENTIFICATION_WARNING =
  "This audit is deidentified, not anonymous. Ordered response patterns may carry re-identification risk when combined with outside information; share only under appropriate governance.";

export interface OpenEnaOnaAggregateEdgeExportRow extends Row {
  scope: "overall" | "group";
  group: string | null;
  groundSource: string;
  responseTarget: string;
  diagonal: boolean;
  maskEnabled: boolean;
  rawAggregateCount: number;
  equalUnitNormalizedMean: number;
  nonzeroUnitCount: number;
}

export interface OpenEnaOnaAggregateEdgeExport {
  kind: "open-ena-ona-aggregate-edges";
  privacy: "aggregate-only";
  scope: "overall" | "group";
  group: string | null;
  rows: OpenEnaOnaAggregateEdgeExportRow[];
  csv: string;
}

export interface OpenEnaOnaDeidentifiedAuditExport {
  kind: "open-ena-ona-deidentified-audit";
  privacy: "deidentified-row-audit";
  warning: string;
  rows: Row[];
  csv: string;
}

export function buildOpenEnaOnaAggregateEdgeExport(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope?: OpenEnaOnaDescriptiveScope;
}): OpenEnaOnaAggregateEdgeExport {
  const summary = buildOpenEnaOnaDescriptiveSummary(input);
  const scope = summary.scope.kind;
  const group = summary.scope.kind === "group" ? summary.scope.name : null;
  const rows: OpenEnaOnaAggregateEdgeExportRow[] = summary.edges.map((edge) => ({
    scope,
    group,
    groundSource: edge.groundSource,
    responseTarget: edge.responseTarget,
    diagonal: edge.diagonal,
    maskEnabled: edge.maskEnabled,
    rawAggregateCount: edge.rawAggregateCount,
    equalUnitNormalizedMean: edge.equalUnitNormalizedMean,
    nonzeroUnitCount: edge.nonzeroUnitCount,
  }));
  return {
    kind: "open-ena-ona-aggregate-edges",
    privacy: "aggregate-only",
    scope,
    group,
    rows,
    csv: rowsToCsv(rows),
  };
}

export function buildOpenEnaOnaDeidentifiedAuditExport(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
}): OpenEnaOnaDeidentifiedAuditExport {
  const summary = buildOpenEnaOnaDescriptiveSummary(input);
  const validated = validateOpenEnaOnaOrderedAudit(input.result, summary.edges
    .filter((edge) => edge.responseIndex === 0)
    .sort((left, right) => left.groundIndex - right.groundIndex)
    .map((edge) => edge.groundSource));
  const edgeDigits = String(summary.directedCellCount).length;
  const contributionHeaders = summary.edges.map((edge, edgeIndex) => (
    `edge_${String(edgeIndex + 1).padStart(edgeDigits, "0")}: ${edge.groundSource} → ${edge.responseTarget} contribution`
  ));
  const rows: Row[] = validated.positionByResponseIndex.map((position, responseIndex) => {
    const row: Row = {
      responseOrdinal: responseIndex + 1,
      opaqueHorizonOrdinal: validated.audit.horizonOrdinals[position] + 1,
      previousResponseOrdinal: validated.audit.previousResponseRowIndices[position] === null
        ? null
        : validated.audit.previousResponseRowIndices[position]! + 1,
      priorRowCount: validated.audit.priorRowCounts[position],
    };
    for (let edgeIndex = 0; edgeIndex < contributionHeaders.length; edgeIndex += 1) {
      row[contributionHeaders[edgeIndex]] = validated.audit.edgeValues[position][edgeIndex];
    }
    return row;
  });
  return {
    kind: "open-ena-ona-deidentified-audit",
    privacy: "deidentified-row-audit",
    warning: OPEN_ENA_ONA_AUDIT_REIDENTIFICATION_WARNING,
    rows,
    csv: rowsToCsv(rows),
  };
}
