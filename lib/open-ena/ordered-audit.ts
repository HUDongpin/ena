import type { ENASet } from "jena-js";
import type { OpenEnaOrderedAudit } from "./types";

const MAX_ORDERED_AUDIT_EDGE_CELLS = 2_000_000;

function finiteCell(value: unknown, rowIndex: number, edgeIndex: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`ONA ordered audit cell [${rowIndex}, ${edgeIndex}] must be finite.`);
  }
  return value;
}

/**
 * Extract the minimum row-level ordered evidence needed by a future Data View.
 * Identity-bearing jENA rows and horizon strings never cross this boundary.
 */
export function buildOpenEnaOrderedAudit(set: ENASet): OpenEnaOrderedAudit | undefined {
  if (set.networkType !== "ordered") return undefined;
  const width = set.codes.length;
  const edgeCount = width * width;
  const windowRows = set.rowWindowProvenance;
  if (set.codeColumns.length !== edgeCount
    || set.adjacencyKey.length !== edgeCount
    || !Array.isArray(windowRows)
    || windowRows.length !== set.rowConnectionCounts.length) {
    throw new Error("ONA ordered audit requires aligned p² row connections and window provenance.");
  }
  if (set.rowConnectionCounts.length * edgeCount > MAX_ORDERED_AUDIT_EDGE_CELLS) {
    throw new Error("ONA ordered audit exceeds the browser edge-cell payload budget.");
  }
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const expectedSourceIndex = edgeIndex % width;
    const expectedTargetIndex = Math.floor(edgeIndex / width);
    const edge = set.adjacencyKey[edgeIndex];
    if (!edge
      || edge.sourceIndex !== expectedSourceIndex
      || edge.targetIndex !== expectedTargetIndex
      || edge.source !== set.codes[expectedSourceIndex]
      || edge.target !== set.codes[expectedTargetIndex]
      || set.codeColumns[edgeIndex] !== edge.name) {
      throw new Error("ONA ordered audit adjacency does not match response-major ground-minor code order.");
    }
  }

  const horizonOrdinalByIdentity = new Map<string, number>();
  const responseRowIndices: number[] = [];
  const previousResponseRowIndices: Array<number | null> = [];
  const priorRowCounts: number[] = [];
  const horizonOrdinals: number[] = [];
  const edgeValues: number[][] = [];

  for (let auditIndex = 0; auditIndex < windowRows.length; auditIndex += 1) {
    const provenance = windowRows[auditIndex];
    const responseRowIndex = provenance.responseRowIndex;
    if (!Number.isSafeInteger(responseRowIndex)
      || responseRowIndex < 0
      || responseRowIndex >= windowRows.length
      || responseRowIndices.includes(responseRowIndex)) {
      throw new Error("ONA ordered audit response-row indices must be a complete unique mapping.");
    }
    const previous = provenance.previousRowIndex;
    if (previous !== null
      && (!Number.isSafeInteger(previous) || previous < 0 || previous >= responseRowIndex)) {
      throw new Error("ONA ordered audit previous-row links must point to an earlier response row.");
    }
    if (!Number.isSafeInteger(provenance.priorRowCount) || provenance.priorRowCount < 0) {
      throw new Error("ONA ordered audit prior-row counts must be nonnegative safe integers.");
    }
    if (typeof provenance.horizonIdentity !== "string" || provenance.horizonIdentity.length === 0) {
      throw new Error("ONA ordered audit requires a stable internal horizon identity.");
    }
    let horizonOrdinal = horizonOrdinalByIdentity.get(provenance.horizonIdentity);
    if (horizonOrdinal === undefined) {
      horizonOrdinal = horizonOrdinalByIdentity.size;
      horizonOrdinalByIdentity.set(provenance.horizonIdentity, horizonOrdinal);
    }
    const row = set.rowConnectionCounts[auditIndex];
    if (!row) throw new Error("ONA ordered audit is missing a row connection vector.");
    responseRowIndices.push(responseRowIndex);
    previousResponseRowIndices.push(previous);
    priorRowCounts.push(provenance.priorRowCount);
    horizonOrdinals.push(horizonOrdinal);
    edgeValues.push(set.codeColumns.map((column, edgeIndex) => (
      finiteCell(row[column], auditIndex, edgeIndex)
    )));
  }

  const auditPositionByResponse = new Map(responseRowIndices.map((index, position) => [index, position]));
  for (let position = 0; position < previousResponseRowIndices.length; position += 1) {
    const previous = previousResponseRowIndices[position];
    if (previous === null) continue;
    const previousPosition = auditPositionByResponse.get(previous);
    if (previousPosition === undefined || horizonOrdinals[previousPosition] !== horizonOrdinals[position]) {
      throw new Error("ONA ordered audit previous-row links must remain within one opaque horizon.");
    }
  }

  return {
    schemaVersion: 1,
    codeOrder: [...set.codes],
    edgeOrder: "response-major-ground-minor",
    responseRowIndices,
    previousResponseRowIndices,
    priorRowCounts,
    horizonOrdinals,
    edgeValues,
  };
}
