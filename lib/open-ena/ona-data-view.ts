import {
  expandOrderedPriorRowIndices,
  type OrderedWindowProvenance,
  type Row,
} from "jena-js";
import { bindOpenEnaResultProvenance } from "./analyze";
import { openEnaAnalysisKindFromResult } from "./capabilities";
import {
  canonicalizeOpenEnaConfig,
  sameOpenEnaConfig,
} from "./network-config";
import type {
  OpenEnaConfig,
  OpenEnaOrderedAudit,
  OpenEnaResult,
  ParsedDataset,
} from "./types";
import { datasetHashKindFor } from "./types";

const MAX_ORDERED_AUDIT_EDGE_CELLS = 2_000_000;

type OpenEnaOnaDataViewCell = string | number | boolean | null;

export type OpenEnaOnaDataViewScope =
  | { kind: "overall" }
  | { kind: "group"; name: string };

export interface OpenEnaOnaDataViewColumn {
  key: string;
  label: string;
  kind: "provenance" | "metadata" | "directed-edge";
  ground?: string;
  response?: string;
  groundIndex?: number;
  responseIndex?: number;
}

export interface OpenEnaOnaDataViewRow {
  responseRowIndex: number;
  sourceRowIndex: number;
  values: Record<string, OpenEnaOnaDataViewCell>;
}

export interface OpenEnaOnaDataView {
  analysisKind: "ona";
  scope: OpenEnaOnaDataViewScope;
  columns: OpenEnaOnaDataViewColumn[];
  rows: OpenEnaOnaDataViewRow[];
  /** Ordered response index -> zero-based imported source-row index. */
  responseRowSourceIndices: number[];
  privacy: {
    contributionSource: "ordered-audit";
    containsLocalIdentifiers: true;
    exportClassification: "local-identity-bearing-view";
    warning: string;
  };
}

export interface ValidatedOpenEnaOrderedAudit {
  audit: OpenEnaOrderedAudit;
  /** Audit array position indexed by ordered response-row index. */
  auditPositionByResponseRow: number[];
  /** Exact prior response rows, oldest to newest, indexed by response row. */
  predecessorResponseRows: number[][];
}

function exactKeys(value: object, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function denseArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error(`${label} must not contain sparse cells.`);
  }
}

function auditFailure(message: string): never {
  throw new Error(`Invalid ONA ordered audit: ${message}`);
}

function validateAdjacency(result: OpenEnaResult, codes: readonly string[]) {
  const size = codes.length;
  const edgeCount = size * size;
  if (!Number.isSafeInteger(edgeCount)
    || result.set.adjacencyKey.length !== edgeCount
    || result.set.codeColumns.length !== edgeCount) {
    auditFailure("directed adjacency must contain the complete p² response-major, ground-minor edge order.");
  }
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const groundIndex = edgeIndex % size;
    const responseIndex = Math.floor(edgeIndex / size);
    const edge = result.set.adjacencyKey[edgeIndex];
    if (!edge
      || edge.sourceIndex !== groundIndex
      || edge.targetIndex !== responseIndex
      || edge.source !== codes[groundIndex]
      || edge.target !== codes[responseIndex]
      || edge.name !== `${edge.source} & ${edge.target}`
      || result.set.codeColumns[edgeIndex] !== edge.name) {
      auditFailure("directed adjacency does not match the p² source/ground to response/target contract.");
    }
  }
}

/**
 * Validate the de-identified ordered audit before it is joined to any local
 * source metadata. Contributions remain authoritative audit cells; this
 * function never reconstructs them from imported code columns.
 */
export function validateOpenEnaOrderedAudit(
  result: OpenEnaResult,
): ValidatedOpenEnaOrderedAudit {
  if (openEnaAnalysisKindFromResult(result) !== "ona"
    || result.set.networkType !== "ordered") {
    auditFailure("a completed ordered-network result is required.");
  }
  const audit = result.orderedAudit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    auditFailure("the completed result is missing its de-identified row evidence.");
  }
  if (!exactKeys(audit, [
    "schemaVersion",
    "codeOrder",
    "edgeOrder",
    "responseRowIndices",
    "previousResponseRowIndices",
    "priorRowCounts",
    "horizonOrdinals",
    "edgeValues",
  ])) {
    auditFailure("schema contains unknown, missing, or identity-bearing fields.");
  }
  if (audit.schemaVersion !== 1 || audit.edgeOrder !== "response-major-ground-minor") {
    auditFailure("schemaVersion and edge order must match the ordered-audit v1 contract.");
  }
  denseArray(audit.codeOrder, "ONA ordered audit codeOrder");
  if (!audit.codeOrder.every((code) => typeof code === "string" && code.length > 0)
    || new Set(audit.codeOrder).size !== audit.codeOrder.length
    || !sameStrings(audit.codeOrder, result.set.codes)) {
    auditFailure("code order must exactly match the completed ordered result.");
  }
  validateAdjacency(result, audit.codeOrder);

  const arrays: Array<[unknown, string]> = [
    [audit.responseRowIndices, "response-row indices"],
    [audit.previousResponseRowIndices, "previous-response indices"],
    [audit.priorRowCounts, "prior-row counts"],
    [audit.horizonOrdinals, "opaque horizon ordinals"],
    [audit.edgeValues, "edge vectors"],
  ];
  for (const [value, label] of arrays) denseArray(value, `ONA ordered audit ${label}`);
  const rowCount = audit.responseRowIndices.length;
  if (arrays.some(([value]) => (value as unknown[]).length !== rowCount)) {
    auditFailure("parallel row arrays must have identical lengths.");
  }
  const edgeCount = audit.codeOrder.length * audit.codeOrder.length;
  if (!Number.isSafeInteger(edgeCount)
    || rowCount * edgeCount > MAX_ORDERED_AUDIT_EDGE_CELLS) {
    auditFailure("p² edge vectors exceed the validated browser payload budget.");
  }

  const auditPositionByResponseRow = Array<number>(rowCount).fill(-1);
  const provenance: OrderedWindowProvenance[] = [];
  for (let auditPosition = 0; auditPosition < rowCount; auditPosition += 1) {
    const responseRowIndex = audit.responseRowIndices[auditPosition];
    const previousResponseRowIndex = audit.previousResponseRowIndices[auditPosition];
    const priorRowCount = audit.priorRowCounts[auditPosition];
    const horizonOrdinal = audit.horizonOrdinals[auditPosition];
    const edgeVector = audit.edgeValues[auditPosition];
    if (!Number.isSafeInteger(responseRowIndex)
      || responseRowIndex < 0
      || responseRowIndex >= rowCount
      || auditPositionByResponseRow[responseRowIndex] !== -1) {
      auditFailure("response-row indices must be one complete unique 0…n−1 permutation.");
    }
    auditPositionByResponseRow[responseRowIndex] = auditPosition;
    if (previousResponseRowIndex !== null
      && (!Number.isSafeInteger(previousResponseRowIndex)
        || previousResponseRowIndex < 0
        || previousResponseRowIndex >= responseRowIndex)) {
      auditFailure("each predecessor must be null or an earlier ordered response row.");
    }
    if (!Number.isSafeInteger(priorRowCount) || priorRowCount < 0) {
      auditFailure("prior-row counts must be nonnegative safe integers.");
    }
    if (!Number.isSafeInteger(horizonOrdinal) || horizonOrdinal < 0) {
      auditFailure("opaque horizon ordinals must be nonnegative safe integers.");
    }
    denseArray(edgeVector, `ONA ordered audit edge vector ${auditPosition + 1}`);
    if (edgeVector.length !== edgeCount) {
      auditFailure(`edge vector ${auditPosition + 1} must contain exactly p² (${edgeCount}) cells.`);
    }
    for (let edgeIndex = 0; edgeIndex < edgeVector.length; edgeIndex += 1) {
      const value = edgeVector[edgeIndex];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        auditFailure(`edge vector ${auditPosition + 1}, cell ${edgeIndex + 1} must be finite nonnegative.`);
      }
    }
    provenance.push({
      responseRowIndex,
      previousRowIndex: previousResponseRowIndex,
      priorRowCount,
      horizon: String(horizonOrdinal),
      horizonIdentity: `opaque-horizon-${horizonOrdinal}`,
    });
  }
  if (auditPositionByResponseRow.some((position) => position < 0)) {
    auditFailure("response-row indices must be one complete unique 0…n−1 permutation.");
  }

  const observedOrdinals = [...new Set(audit.horizonOrdinals)].sort((left, right) => left - right);
  if (observedOrdinals.some((ordinal, index) => ordinal !== index)) {
    auditFailure("opaque horizon ordinals must form one contiguous 0…h−1 range.");
  }
  if (rowCount > 0) {
    try {
      // The public jENA helper validates the complete predecessor forest and
      // fixed backward-window counts before expanding the requested row.
      expandOrderedPriorRowIndices(provenance, audit.responseRowIndices[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      auditFailure(`predecessor/prior-row provenance is inconsistent: ${message}`);
    }
  }

  const provenanceByResponse = new Map(provenance.map((entry) => [entry.responseRowIndex, entry]));
  const predecessorResponseRows = Array.from({ length: rowCount }, (_, responseRowIndex) => {
    const entry = provenanceByResponse.get(responseRowIndex);
    if (!entry) auditFailure(`missing response row ${responseRowIndex}.`);
    const newestToOldest: number[] = [];
    let previous = entry.previousRowIndex;
    for (let remaining = entry.priorRowCount; remaining > 0; remaining -= 1) {
      if (previous === null) auditFailure(`predecessor chain for response row ${responseRowIndex} ends early.`);
      newestToOldest.push(previous);
      const previousEntry = provenanceByResponse.get(previous);
      if (!previousEntry || previousEntry.horizonIdentity !== entry.horizonIdentity) {
        auditFailure(`predecessor chain for response row ${responseRowIndex} crosses an opaque horizon.`);
      }
      previous = previousEntry.previousRowIndex;
    }
    return newestToOldest.reverse();
  });

  return { audit, auditPositionByResponseRow, predecessorResponseRows };
}

function metadataValue(row: Row, column: string): OpenEnaOnaDataViewCell {
  const value = row[column] as unknown;
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`ONA Data View metadata column “${column}” contains a non-finite number.`);
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  throw new Error(`ONA Data View metadata column “${column}” must contain only scalar local values.`);
}

function uniqueMetadataColumns(config: ReturnType<typeof canonicalizeOpenEnaConfig>) {
  const ordered = [
    ...config.unitColumns,
    ...config.conversationColumns,
    ...(config.groupColumn ? [config.groupColumn] : []),
    ...(config.orderPolicy?.kind === "columns" ? config.orderPolicy.columns : []),
  ];
  const codeSet = new Set(config.codes);
  if (ordered.some((column) => codeSet.has(column))) {
    throw new Error("ONA Data View cannot expose a selected code column through its local metadata join.");
  }
  return [...new Set(ordered)];
}

export function buildOpenEnaOnaDataView(input: {
  dataset: ParsedDataset;
  datasetHash: string;
  result: OpenEnaResult;
  resultConfig: OpenEnaConfig;
  scope: OpenEnaOnaDataViewScope;
}): OpenEnaOnaDataView {
  const { dataset, result, resultConfig, scope } = input;
  const configuration = canonicalizeOpenEnaConfig(resultConfig);
  if (configuration.analysisKind !== "ona" || openEnaAnalysisKindFromResult(result) !== "ona") {
    throw new Error("ONA Data View requires a completed ordered-network result and matching ONA configuration.");
  }
  if (!/^[a-f\d]{64}$/iu.test(input.datasetHash)) {
    throw new Error("ONA Data View dataset binding requires a 64-character hexadecimal SHA-256 digest.");
  }
  const binding = result.provenanceBinding;
  if (!binding
    || binding.datasetNormalizedUtf8TextSha256 !== input.datasetHash.toLowerCase()
    || binding.datasetHashKind !== datasetHashKindFor(dataset)
    || !sameOpenEnaConfig(binding.configuration, configuration)) {
    throw new Error("ONA Data View dataset binding or completed configuration is stale.");
  }

  // This replays the canonical ordering against the current local rows and is
  // the authority for the source-index permutation. It does not inspect code
  // columns and returns a defensive provenance/config clone.
  const bound = bindOpenEnaResultProvenance(
    result,
    dataset,
    input.datasetHash,
    configuration,
  );
  const validated = validateOpenEnaOrderedAudit(bound);
  const sourceIndices = bound.executionProvenance?.ordering?.responseRowSourceIndices;
  if (!sourceIndices
    || sourceIndices.length !== dataset.rows.length
    || sourceIndices.length !== validated.audit.responseRowIndices.length) {
    throw new Error("ONA Data View provenance and ordered audit do not cover the current dataset rows exactly.");
  }
  const metadataColumns = uniqueMetadataColumns(configuration);
  if (metadataColumns.some((column) => !dataset.headers.includes(column))) {
    throw new Error("ONA Data View local metadata join references a column absent from the current dataset.");
  }
  if (scope.kind === "group") {
    if (!configuration.groupColumn
      || !result.groups.some((group) => group.name === scope.name)) {
      throw new Error(`ONA Data View group scope “${scope.name}” is not present in the completed result.`);
    }
  }

  const columns: OpenEnaOnaDataViewColumn[] = [
    { key: "orderedResponsePosition", label: "Ordered response position", kind: "provenance" },
    { key: "sourceRecordNumber", label: "Source record number (local)", kind: "provenance" },
    { key: "opaqueHorizonOrdinal", label: "Opaque horizon ordinal", kind: "provenance" },
    { key: "priorRowCount", label: "Prior rows in backward window", kind: "provenance" },
    { key: "predecessorResponsePositions", label: "Predecessor response positions", kind: "provenance" },
    ...metadataColumns.map((column): OpenEnaOnaDataViewColumn => ({
      key: `metadata:${column}`,
      label: column,
      kind: "metadata",
    })),
    ...result.set.adjacencyKey.map((edge, edgeIndex): OpenEnaOnaDataViewColumn => ({
      key: `edge:${edgeIndex}`,
      label: `${edge.source} → ${edge.target}`,
      kind: "directed-edge",
      ground: edge.source,
      response: edge.target,
      groundIndex: edge.sourceIndex,
      responseIndex: edge.targetIndex,
    })),
  ];

  const rows: OpenEnaOnaDataViewRow[] = [];
  for (let responseRowIndex = 0; responseRowIndex < sourceIndices.length; responseRowIndex += 1) {
    const sourceRowIndex = sourceIndices[responseRowIndex];
    if (!Number.isSafeInteger(sourceRowIndex)
      || sourceRowIndex < 0
      || sourceRowIndex >= dataset.rows.length) {
      throw new Error("ONA Data View provenance contains an invalid source-index permutation.");
    }
    const sourceRow = dataset.rows[sourceRowIndex];
    if (!sourceRow) throw new Error("ONA Data View source-index permutation references a missing local row.");
    if (scope.kind === "group") {
      const groupColumn = configuration.groupColumn as string;
      if (String(metadataValue(sourceRow, groupColumn) ?? "") !== scope.name) continue;
    }
    const auditPosition = validated.auditPositionByResponseRow[responseRowIndex];
    const values: Record<string, OpenEnaOnaDataViewCell> = {
      orderedResponsePosition: responseRowIndex + 1,
      sourceRecordNumber: sourceRowIndex + 1,
      opaqueHorizonOrdinal: validated.audit.horizonOrdinals[auditPosition] + 1,
      priorRowCount: validated.audit.priorRowCounts[auditPosition],
      predecessorResponsePositions: validated.predecessorResponseRows[responseRowIndex]
        .map((index) => index + 1)
        .join(", "),
    };
    for (const column of metadataColumns) {
      values[`metadata:${column}`] = metadataValue(sourceRow, column);
    }
    const edgeVector = validated.audit.edgeValues[auditPosition];
    for (let edgeIndex = 0; edgeIndex < edgeVector.length; edgeIndex += 1) {
      values[`edge:${edgeIndex}`] = edgeVector[edgeIndex];
    }
    rows.push({ responseRowIndex, sourceRowIndex, values });
  }

  return {
    analysisKind: "ona",
    scope: structuredClone(scope),
    columns,
    rows,
    responseRowSourceIndices: [...sourceIndices],
    privacy: {
      contributionSource: "ordered-audit",
      containsLocalIdentifiers: true,
      exportClassification: "local-identity-bearing-view",
      warning: "This local Data View joins de-identified ONA contributions to identity-bearing source metadata. Review and de-identify before sharing.",
    },
  };
}
