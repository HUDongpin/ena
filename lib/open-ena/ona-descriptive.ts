import { validateENADataNetworkContract } from "jena-js";
import { openEnaAnalysisKindFromResult } from "./capabilities";
import {
  canonicalizeOpenEnaConfig,
  sameOpenEnaConfig,
  validateDirectionalMask,
} from "./network-config";
import type {
  CanonicalOpenEnaConfig,
  OpenEnaConfig,
  OpenEnaOrderedAudit,
  OpenEnaResult,
} from "./types";

const ZERO_TOLERANCE = 1e-12;
const DEFAULT_TOP_EDGE_LIMIT = 5;

export type OpenEnaOnaDescriptiveScope =
  | { kind: "overall" }
  | { kind: "group"; name: string };

export interface OpenEnaOnaEdgeDiagnostic {
  groundSource: string;
  responseTarget: string;
  groundIndex: number;
  responseIndex: number;
  diagonal: boolean;
  maskEnabled: boolean;
  rawAggregateCount: number;
  equalUnitNormalizedMean: number;
  nonzeroUnitCount: number;
}

export interface OpenEnaOnaCodeMassDiagnostic {
  code: string;
  rawMass: number;
}

export interface OpenEnaOnaPairAsymmetry {
  firstCode: string;
  secondCode: string;
  firstToSecondRaw: number;
  secondToFirstRaw: number;
  absoluteRawDifference: number;
  firstToSecondNormalizedMean: number;
  secondToFirstNormalizedMean: number;
  absoluteNormalizedMeanDifference: number;
  dominantDirection: string | "tie";
}

export interface OpenEnaOnaDescriptiveSummary {
  analysisKind: "ona";
  interpretationBoundary: "descriptive-only";
  scope: OpenEnaOnaDescriptiveScope;
  scopeLabel: string;
  unitCount: number;
  /** Always covers the full deidentified audit; group membership is intentionally absent from it. */
  responseRowCount: number;
  /** Always covers the full deidentified audit; opaque horizon ordinals are not group labels. */
  opaqueHorizonCount: number;
  codeCount: number;
  directedCellCount: number;
  enabledCellCount: number;
  maskedCellCount: number;
  zeroNetworkCount: number;
  rawConnectionTotal: number;
  rawSelfConnectionTotal: number;
  rawOffDiagonalConnectionTotal: number;
  incomingRawTotals: OpenEnaOnaCodeMassDiagnostic[];
  outgoingRawTotals: OpenEnaOnaCodeMassDiagnostic[];
  topDirectedEdges: OpenEnaOnaEdgeDiagnostic[];
  pairAsymmetries: OpenEnaOnaPairAsymmetry[];
  groupCounts: Array<{ name: string; unitCount: number }>;
  varianceDiagnostics: Array<{ dimension: string; explainedProportion: number }>;
  edges: OpenEnaOnaEdgeDiagnostic[];
}

export interface OpenEnaValidatedOrderedAudit {
  audit: OpenEnaOrderedAudit;
  /** Audit-array position for each zero-based ordered response-row index. */
  positionByResponseIndex: number[];
  responseRowCount: number;
  opaqueHorizonCount: number;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function finiteNonnegative(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and nonnegative.`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value as number;
}

function nonnegativeSafeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value as number;
}

function checkedAdd(left: number, right: number, label: string) {
  const total = left + right;
  if (!Number.isFinite(total)) throw new Error(`${label} exceeds finite arithmetic range.`);
  return total;
}

function checkedMultiply(left: number, right: number, label: string) {
  const product = left * right;
  if (!Number.isFinite(product)) throw new Error(`${label} exceeds finite arithmetic range.`);
  return product;
}

function nearlyEqual(left: number, right: number, tolerance = 1e-12) {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function expectedSphereWeights(values: readonly number[]) {
  let scale = 0;
  let scaledSumSquares = 1;
  for (const value of values) {
    const absolute = Math.abs(value);
    if (absolute === 0) continue;
    if (scale < absolute) {
      const ratio = scale / absolute;
      scaledSumSquares = 1 + scaledSumSquares * ratio * ratio;
      scale = absolute;
    } else {
      const ratio = absolute / scale;
      scaledSumSquares += ratio * ratio;
    }
  }
  if (scale === 0) return values.map(() => 0);
  const scaledNorm = Math.sqrt(scaledSumSquares);
  return values.map((value) => (value / scale) / scaledNorm);
}

function validateOnaConfiguration(config: CanonicalOpenEnaConfig) {
  if (config.analysisKind !== "ona") {
    throw new Error("ONA descriptive output requires an ONA configuration.");
  }
  if (config.model !== "EndPoint"
    || config.window !== "MovingStanzaWindow"
    || (config.windowSizeBack !== Number.POSITIVE_INFINITY
      && (!Number.isSafeInteger(config.windowSizeBack) || config.windowSizeBack < 1))
    || config.windowSizeForward !== 0
    || config.weightBy !== "sum"
    || config.rotation !== "svd"
    || config.referenceRotationId !== null
    || !config.orderPolicy
    || !config.directionalMask) {
    throw new Error(
      "ONA descriptive output requires the completed Endpoint, backward MovingStanzaWindow, sum, SVD, explicit-order contract; only windowSizeBack may use the Infinity sentinel.",
    );
  }
  const maskErrors = validateDirectionalMask(config.directionalMask, config.codes);
  if (maskErrors.length > 0) {
    throw new Error(`ONA descriptive output requires one valid label-bound p² directional mask. ${maskErrors.join(" ")}`);
  }
}

function assertCompletedOnaContext(result: OpenEnaResult, suppliedConfig: OpenEnaConfig) {
  const config = canonicalizeOpenEnaConfig(suppliedConfig);
  validateOnaConfiguration(config);
  if (openEnaAnalysisKindFromResult(result) !== "ona") {
    throw new Error("ONA descriptive output requires one completed ordered-network result.");
  }
  try {
    validateENADataNetworkContract(result.set);
  } catch (error) {
    throw new Error(`The completed ONA runtime network is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const execution = result.executionProvenance;
  if (!execution
    || execution.schemaVersion !== 1
    || execution.analysisKind !== "ona"
    || execution.networkType !== "ordered"
    || execution.nodePositionMethod !== "directed"
    || !execution.ordering
    || !execution.directionalMask
    || !sameOpenEnaConfig(execution.configuration, config)
    || !sameOpenEnaConfig({
      ...config,
      orderPolicy: execution.ordering.requestedPolicy,
      directionalMask: execution.directionalMask,
    }, config)) {
    throw new Error("The supplied ONA configuration does not match the completed directed execution provenance.");
  }
  if (result.provenanceBinding
    && !sameOpenEnaConfig(result.provenanceBinding.configuration, config)) {
    throw new Error("The supplied ONA configuration does not match the completed result binding.");
  }
  if (result.projectionReference !== null
    || result.statsDiagnostics.correlations !== "not-applicable-ordered-network"
    || result.statsDiagnostics.tests !== "not-applicable-ordered-network") {
    throw new Error("Completed ONA output must remain descriptive-only without reference or inferential statistics.");
  }
  if (!sameStrings(result.set.codes, config.codes)
    || !sameStrings(result.set.units, config.unitColumns)
    || !sameStrings(result.set.conversation, config.conversationColumns)
    || result.set.modelType !== config.model
    || result.set.functionParams.model !== config.model
    || result.set.functionParams.window !== config.window
    || result.set.functionParams.windowSizeBack !== config.windowSizeBack
    || result.set.functionParams.windowSizeForward !== config.windowSizeForward
    || result.set.functionParams.weightBy !== config.weightBy) {
    throw new Error("The completed ONA runtime fields disagree with the supplied canonical configuration.");
  }
  return config;
}

export function validateOpenEnaOnaOrderedAudit(
  result: OpenEnaResult,
  expectedCodes: readonly string[],
): OpenEnaValidatedOrderedAudit {
  const audit = result.orderedAudit;
  if (!audit
    || audit.schemaVersion !== 1
    || audit.edgeOrder !== "response-major-ground-minor"
    || !sameStrings(audit.codeOrder, expectedCodes)) {
    throw new Error("ONA descriptive output requires one aligned response-major p² ordered audit.");
  }
  const edgeCount = expectedCodes.length * expectedCodes.length;
  const responseRowCount = audit.edgeValues.length;
  const arrays = [
    audit.responseRowIndices,
    audit.previousResponseRowIndices,
    audit.priorRowCounts,
    audit.horizonOrdinals,
  ];
  if (arrays.some((values) => values.length !== responseRowCount)) {
    throw new Error("ONA ordered audit parallel arrays must have the same response-row length.");
  }

  const positionByResponseIndex = Array<number>(responseRowCount).fill(-1);
  const horizonOrdinals = new Set<number>();
  for (let position = 0; position < responseRowCount; position += 1) {
    if (!Object.hasOwn(audit.edgeValues, position)
      || !Object.hasOwn(audit.responseRowIndices, position)
      || !Object.hasOwn(audit.previousResponseRowIndices, position)
      || !Object.hasOwn(audit.priorRowCounts, position)
      || !Object.hasOwn(audit.horizonOrdinals, position)) {
      throw new Error("ONA ordered audit response rows must be dense arrays.");
    }
    const responseIndex = nonnegativeSafeInteger(
      audit.responseRowIndices[position],
      `ONA ordered audit response index ${position + 1}`,
    );
    if (responseIndex >= responseRowCount || positionByResponseIndex[responseIndex] !== -1) {
      throw new Error("ONA ordered audit response-row indices must form one complete unique mapping.");
    }
    positionByResponseIndex[responseIndex] = position;
    nonnegativeSafeInteger(audit.priorRowCounts[position], `ONA ordered audit prior-row count ${position + 1}`);
    const horizonOrdinal = nonnegativeSafeInteger(
      audit.horizonOrdinals[position],
      `ONA ordered audit horizon ordinal ${position + 1}`,
    );
    horizonOrdinals.add(horizonOrdinal);
    const previous = audit.previousResponseRowIndices[position];
    if (previous !== null
      && (!Number.isSafeInteger(previous) || previous < 0 || previous >= responseIndex)) {
      throw new Error("ONA ordered audit predecessor links must point to an earlier response row.");
    }
    const edgeValues = audit.edgeValues[position];
    if (!Array.isArray(edgeValues) || edgeValues.length !== edgeCount) {
      throw new Error(`ONA ordered audit row ${position + 1} must contain one complete p² edge vector.`);
    }
    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      if (!Object.hasOwn(edgeValues, edgeIndex)) {
        throw new Error("ONA ordered audit edge vectors must be dense arrays.");
      }
      finiteNonnegative(edgeValues[edgeIndex], `ONA ordered audit cell [${position}, ${edgeIndex}]`);
    }
  }
  if (positionByResponseIndex.some((position) => position < 0)) {
    throw new Error("ONA ordered audit response-row indices must form one complete unique mapping.");
  }
  const sortedHorizons = [...horizonOrdinals].sort((left, right) => left - right);
  if (sortedHorizons.some((ordinal, index) => ordinal !== index)) {
    throw new Error("ONA ordered audit opaque horizon ordinals must be contiguous from zero.");
  }

  for (let position = 0; position < responseRowCount; position += 1) {
    const horizon = audit.horizonOrdinals[position];
    const previous = audit.previousResponseRowIndices[position];
    if (previous !== null) {
      const previousPosition = positionByResponseIndex[previous];
      if (audit.horizonOrdinals[previousPosition] !== horizon) {
        throw new Error("ONA ordered audit predecessor links cannot cross opaque horizons.");
      }
    }
    let cursor = previous;
    const priorRowCount = audit.priorRowCounts[position];
    for (let step = 0; step < priorRowCount; step += 1) {
      if (cursor === null) {
        throw new Error("ONA ordered audit predecessor chain is shorter than its prior-row count.");
      }
      const cursorPosition = positionByResponseIndex[cursor];
      if (cursorPosition < 0 || audit.horizonOrdinals[cursorPosition] !== horizon) {
        throw new Error("ONA ordered audit predecessor chain cannot cross opaque horizons.");
      }
      cursor = audit.previousResponseRowIndices[cursorPosition];
    }
  }

  const latestResponseByHorizon = new Map<number, number>();
  for (let responseIndex = 0; responseIndex < responseRowCount; responseIndex += 1) {
    const position = positionByResponseIndex[responseIndex];
    const horizon = audit.horizonOrdinals[position];
    const expectedPrevious = latestResponseByHorizon.get(horizon) ?? null;
    if (audit.previousResponseRowIndices[position] !== expectedPrevious) {
      throw new Error("ONA ordered audit previous-response links must identify the immediate predecessor within each opaque horizon.");
    }
    latestResponseByHorizon.set(horizon, responseIndex);
  }

  if (result.set.adjacencyKey.length !== edgeCount
    || result.set.connectionCounts.some((row) => typeof row !== "object" || row === null)) {
    throw new Error("ONA ordered audit cannot be reconciled to the completed p² aggregate result.");
  }
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const edge = result.set.adjacencyKey[edgeIndex];
    let auditTotal = 0;
    for (let position = 0; position < responseRowCount; position += 1) {
      auditTotal = checkedAdd(
        auditTotal,
        audit.edgeValues[position][edgeIndex],
        `ONA ordered audit total for edge ${edgeIndex + 1}`,
      );
    }
    let aggregateTotal = 0;
    for (const row of result.set.connectionCounts) {
      aggregateTotal = checkedAdd(
        aggregateTotal,
        finiteNonnegative(row[edge.name], `ONA completed aggregate “${edge.name}”`),
        `ONA completed aggregate total “${edge.name}”`,
      );
    }
    if (!nearlyEqual(auditTotal, aggregateTotal, 1e-10)) {
      throw new Error(`ONA ordered audit total for “${edge.name}” does not match the completed aggregate result.`);
    }
  }

  return {
    audit,
    positionByResponseIndex,
    responseRowCount,
    opaqueHorizonCount: horizonOrdinals.size,
  };
}

function normalizeScope(scope: OpenEnaOnaDescriptiveScope | undefined): OpenEnaOnaDescriptiveScope {
  if (!scope) return { kind: "overall" };
  if (scope.kind === "overall") return { kind: "overall" };
  if (scope.kind === "group" && typeof scope.name === "string" && scope.name.length > 0) {
    return { kind: "group", name: scope.name };
  }
  throw new Error("ONA descriptive scope must be overall or one non-empty group name.");
}

function scopeRows(
  result: OpenEnaResult,
  config: CanonicalOpenEnaConfig,
  scope: OpenEnaOnaDescriptiveScope,
) {
  if (scope.kind === "overall") return result.set.connectionCounts;
  if (!config.groupColumn) {
    throw new Error("ONA group scope requires a configured group column.");
  }
  return result.set.connectionCounts.filter((row) => String(row[config.groupColumn as string] ?? "") === scope.name);
}

export function buildOpenEnaOnaDescriptiveSummary(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope?: OpenEnaOnaDescriptiveScope;
  topEdgeLimit?: number;
}): OpenEnaOnaDescriptiveSummary {
  const config = assertCompletedOnaContext(input.result, input.config);
  const scope = normalizeScope(input.scope);
  const topEdgeLimit = input.topEdgeLimit ?? DEFAULT_TOP_EDGE_LIMIT;
  positiveSafeInteger(topEdgeLimit, "ONA top-edge limit");
  for (const edge of input.result.set.adjacencyKey) {
    if (config.directionalMask!.enabled[edge.sourceIndex][edge.targetIndex]) continue;
    for (const row of input.result.set.connectionCounts) {
      if (finiteNonnegative(row[edge.name], `ONA masked directed cell “${edge.name}”`) !== 0) {
        throw new Error(`ONA masked directed cell “${edge.name}” contains nonzero completed evidence.`);
      }
    }
  }
  const audit = validateOpenEnaOnaOrderedAudit(input.result, config.codes);
  const groups = input.result.groups;
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("ONA descriptive output requires at least one completed aggregate group.");
  }
  const groupNames = new Set<string>();
  const groupCounts = groups.map((group, index) => {
    if (typeof group.name !== "string" || group.name.length === 0 || groupNames.has(group.name)) {
      throw new Error("ONA completed groups must have unique non-empty names.");
    }
    groupNames.add(group.name);
    return {
      name: group.name,
      unitCount: positiveSafeInteger(group.count, `ONA group ${index + 1} unit count`),
    };
  });
  const totalUnits = groupCounts.reduce(
    (sum, group) => checkedAdd(sum, group.unitCount, "ONA total unit count"),
    0,
  );
  if (!Number.isSafeInteger(totalUnits)
    || input.result.set.connectionCounts.length !== totalUnits
    || input.result.set.points.length !== totalUnits) {
    throw new Error("ONA completed aggregate rows, points, and group unit counts must align one-to-one.");
  }
  if (!config.groupColumn && groups.length !== 1) {
    throw new Error("ONA results without a group column must expose exactly one aggregate group.");
  }
  if (audit.responseRowCount < totalUnits || audit.opaqueHorizonCount < 1) {
    throw new Error("ONA ordered audit must contain at least one response row per analytic unit and one opaque horizon.");
  }
  if (input.result.set.lineWeights.length !== totalUnits) {
    throw new Error("ONA completed line weights must contain exactly one normalized row per analytic unit.");
  }
  if (config.groupColumn) {
    for (const group of groupCounts) {
      const rowCount = input.result.set.connectionCounts.filter((row) => (
        String(row[config.groupColumn as string] ?? "") === group.name
      )).length;
      if (rowCount !== group.unitCount) {
        throw new Error(`ONA completed group “${group.name}” count does not match its aggregate unit rows.`);
      }
      const pointCount = input.result.set.points.filter((row) => (
        String(row[config.groupColumn as string] ?? "") === group.name
      )).length;
      const lineWeightCount = input.result.set.lineWeights.filter((row) => (
        String(row[config.groupColumn as string] ?? "") === group.name
      )).length;
      if (pointCount !== group.unitCount || lineWeightCount !== group.unitCount) {
        throw new Error(`ONA completed group “${group.name}” points and line weights do not match its unit count.`);
      }
    }
    if (input.result.set.connectionCounts.some((row) => (
      !groupNames.has(String(row[config.groupColumn as string] ?? ""))
    ))) {
      throw new Error("ONA aggregate unit rows contain a group absent from the completed group summary.");
    }
  }
  const groupNameForRow = (row: Record<string, unknown>) => (
    config.groupColumn ? String(row[config.groupColumn] ?? "") : groups[0].name
  );
  const lineWeightsByGroup = new Map(groups.map((group) => [group.name, [] as typeof input.result.set.lineWeights]));
  for (let rowIndex = 0; rowIndex < totalUnits; rowIndex += 1) {
    const rawRow = input.result.set.connectionCounts[rowIndex];
    const lineRow = input.result.set.lineWeights[rowIndex];
    const rawGroup = groupNameForRow(rawRow);
    const lineGroup = groupNameForRow(lineRow);
    if (!groupNames.has(rawGroup) || rawGroup !== lineGroup) {
      throw new Error("ONA normalized line weights must preserve the aggregate row group alignment.");
    }
    const rawValues = input.result.set.adjacencyKey.map((edge) => (
      finiteNonnegative(rawRow[edge.name], `ONA raw directed cell “${edge.name}”`)
    ));
    const expectedWeights = expectedSphereWeights(rawValues);
    for (let edgeIndex = 0; edgeIndex < input.result.set.adjacencyKey.length; edgeIndex += 1) {
      const edge = input.result.set.adjacencyKey[edgeIndex];
      const actual = finiteNonnegative(
        lineRow[edge.name],
        `ONA normalized line weight “${edge.name}”`,
      );
      if (!nearlyEqual(actual, expectedWeights[edgeIndex], 1e-10)) {
        throw new Error(`ONA normalized line weight “${edge.name}” does not match its completed raw unit network.`);
      }
    }
    lineWeightsByGroup.get(rawGroup)!.push(lineRow);
  }
  const validatedGroupMeans = new Map<string, Map<string, number>>();
  for (const group of groups) {
    const lineRows = lineWeightsByGroup.get(group.name)!;
    const means = new Map<string, number>();
    for (const edge of input.result.set.adjacencyKey) {
      const mean = lineRows.reduce((sum, row) => (
        checkedAdd(
          sum,
          finiteNonnegative(row[edge.name], `ONA group line weight “${edge.name}”`),
          `ONA group line-weight sum “${edge.name}”`,
        )
      ), 0) / lineRows.length;
      const reported = finiteNonnegative(
        group.meanWeights[edge.name],
        `ONA completed group mean “${edge.name}”`,
      );
      if (!nearlyEqual(mean, reported, 1e-12)) {
        throw new Error(`ONA completed group mean “${edge.name}” does not match its normalized line weights.`);
      }
      means.set(edge.name, mean);
    }
    validatedGroupMeans.set(group.name, means);
  }
  const selectedGroup = scope.kind === "group"
    ? groups.find((group) => group.name === scope.name)
    : null;
  if (scope.kind === "group" && !selectedGroup) {
    throw new Error(`ONA group scope “${scope.name}” is absent from the completed result.`);
  }
  const rows = scopeRows(input.result, config, scope);
  const unitCount = scope.kind === "overall" ? totalUnits : selectedGroup!.count;
  if (rows.length !== unitCount) {
    throw new Error("ONA descriptive scope must contain exactly one aggregate row per analytic unit.");
  }

  const mask = config.directionalMask!;
  const edges: OpenEnaOnaEdgeDiagnostic[] = input.result.set.adjacencyKey.map((edge, edgeIndex) => {
    const expectedGroundIndex = edgeIndex % config.codes.length;
    const expectedResponseIndex = Math.floor(edgeIndex / config.codes.length);
    if (edge.sourceIndex !== expectedGroundIndex
      || edge.targetIndex !== expectedResponseIndex
      || edge.source !== config.codes[expectedGroundIndex]
      || edge.target !== config.codes[expectedResponseIndex]
      || edge.name !== `${edge.source} & ${edge.target}`
      || input.result.set.codeColumns[edgeIndex] !== edge.name) {
      throw new Error("ONA adjacency must preserve the complete response-major, ground-minor p² contract.");
    }
    let rawAggregateCount = 0;
    let nonzeroUnitCount = 0;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const value = finiteNonnegative(rows[rowIndex][edge.name], `ONA raw directed cell “${edge.name}”`);
      rawAggregateCount = checkedAdd(rawAggregateCount, value, `ONA raw directed aggregate “${edge.name}”`);
      if (value > 0) nonzeroUnitCount += 1;
    }
    let equalUnitNormalizedMean = 0;
    if (selectedGroup) {
      equalUnitNormalizedMean = validatedGroupMeans.get(selectedGroup.name)!.get(edge.name)!;
    } else {
      let weighted = 0;
      for (const group of groups) {
        const mean = validatedGroupMeans.get(group.name)!.get(edge.name)!;
        weighted = checkedAdd(
          weighted,
          checkedMultiply(mean, group.count, `ONA weighted normalized mean “${edge.name}”`),
          `ONA weighted normalized mean “${edge.name}”`,
        );
      }
      equalUnitNormalizedMean = weighted / totalUnits;
    }
    if (!Number.isFinite(equalUnitNormalizedMean)) {
      throw new Error(`ONA normalized mean “${edge.name}” must remain finite.`);
    }
    const maskEnabled = mask.enabled[edge.sourceIndex][edge.targetIndex];
    if (!maskEnabled
      && (rawAggregateCount !== 0 || Math.abs(equalUnitNormalizedMean) > ZERO_TOLERANCE)) {
      throw new Error(`ONA masked directed cell “${edge.name}” contains nonzero completed evidence.`);
    }
    return {
      groundSource: edge.source,
      responseTarget: edge.target,
      groundIndex: edge.sourceIndex,
      responseIndex: edge.targetIndex,
      diagonal: edge.sourceIndex === edge.targetIndex,
      maskEnabled,
      rawAggregateCount,
      equalUnitNormalizedMean,
      nonzeroUnitCount,
    };
  });

  let rawSelfConnectionTotal = 0;
  let rawOffDiagonalConnectionTotal = 0;
  for (const edge of edges) {
    if (edge.diagonal) {
      rawSelfConnectionTotal = checkedAdd(
        rawSelfConnectionTotal,
        edge.rawAggregateCount,
        "ONA raw self-connection mass",
      );
    } else {
      rawOffDiagonalConnectionTotal = checkedAdd(
        rawOffDiagonalConnectionTotal,
        edge.rawAggregateCount,
        "ONA raw off-diagonal mass",
      );
    }
  }
  const rawConnectionTotal = checkedAdd(
    rawSelfConnectionTotal,
    rawOffDiagonalConnectionTotal,
    "ONA total raw connection mass",
  );

  const incomingRawTotals = config.codes.map((code, responseIndex) => ({
    code,
    rawMass: edges
      .filter((edge) => edge.responseIndex === responseIndex)
      .reduce((sum, edge) => checkedAdd(sum, edge.rawAggregateCount, `ONA incoming raw mass for “${code}”`), 0),
  }));
  const outgoingRawTotals = config.codes.map((code, groundIndex) => ({
    code,
    rawMass: edges
      .filter((edge) => edge.groundIndex === groundIndex)
      .reduce((sum, edge) => checkedAdd(sum, edge.rawAggregateCount, `ONA outgoing raw mass for “${code}”`), 0),
  }));
  const zeroNetworkCount = rows.filter((row, rowIndex) => {
    let total = 0;
    for (const edge of input.result.set.adjacencyKey) {
      total = checkedAdd(
        total,
        finiteNonnegative(row[edge.name], `ONA aggregate unit row ${rowIndex + 1} cell “${edge.name}”`),
        `ONA aggregate unit row ${rowIndex + 1} total`,
      );
    }
    return total === 0;
  }).length;

  const topDirectedEdges = [...edges]
    .filter((edge) => edge.maskEnabled && (edge.equalUnitNormalizedMean > 0 || edge.rawAggregateCount > 0))
    .sort((left, right) => (
      right.equalUnitNormalizedMean - left.equalUnitNormalizedMean
      || right.rawAggregateCount - left.rawAggregateCount
      || left.responseIndex - right.responseIndex
      || left.groundIndex - right.groundIndex
    ))
    .slice(0, topEdgeLimit);
  const byDirection = new Map(edges.map((edge) => [`${edge.groundIndex}:${edge.responseIndex}`, edge]));
  const pairAsymmetries: OpenEnaOnaPairAsymmetry[] = [];
  for (let firstIndex = 0; firstIndex < config.codes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < config.codes.length; secondIndex += 1) {
      const firstToSecond = byDirection.get(`${firstIndex}:${secondIndex}`)!;
      const secondToFirst = byDirection.get(`${secondIndex}:${firstIndex}`)!;
      const rawDifference = firstToSecond.rawAggregateCount - secondToFirst.rawAggregateCount;
      const normalizedDifference = firstToSecond.equalUnitNormalizedMean - secondToFirst.equalUnitNormalizedMean;
      const firstCode = config.codes[firstIndex];
      const secondCode = config.codes[secondIndex];
      pairAsymmetries.push({
        firstCode,
        secondCode,
        firstToSecondRaw: firstToSecond.rawAggregateCount,
        secondToFirstRaw: secondToFirst.rawAggregateCount,
        absoluteRawDifference: Math.abs(rawDifference),
        firstToSecondNormalizedMean: firstToSecond.equalUnitNormalizedMean,
        secondToFirstNormalizedMean: secondToFirst.equalUnitNormalizedMean,
        absoluteNormalizedMeanDifference: Math.abs(normalizedDifference),
        dominantDirection: Math.abs(normalizedDifference) <= ZERO_TOLERANCE
          ? "tie"
          : normalizedDifference > 0
            ? `${firstCode} → ${secondCode}`
            : `${secondCode} → ${firstCode}`,
      });
    }
  }
  pairAsymmetries.sort((left, right) => (
    right.absoluteNormalizedMeanDifference - left.absoluteNormalizedMeanDifference
    || right.absoluteRawDifference - left.absoluteRawDifference
    || left.firstCode.localeCompare(right.firstCode)
    || left.secondCode.localeCompare(right.secondCode)
  ));

  const dimensions = input.result.dimensions;
  const expectedDimensions = input.result.set.rotation.rotationColumns.slice(0, 3);
  if (!Array.isArray(dimensions)
    || dimensions.length === 0
    || new Set(dimensions).size !== dimensions.length
    || !sameStrings(dimensions, expectedDimensions)) {
    throw new Error("ONA variance diagnostics require the completed rotation dimensions in their canonical order.");
  }
  const varianceDiagnostics = dimensions.map((dimension) => {
    const explainedProportion = finiteNonnegative(
      input.result.set.variance[dimension],
      `ONA explained variance for “${dimension}”`,
    );
    if (explainedProportion > 1 + ZERO_TOLERANCE) {
      throw new Error(`ONA explained variance for “${dimension}” cannot exceed one.`);
    }
    return { dimension, explainedProportion };
  });
  const enabledCellCount = mask.enabled.reduce(
    (count, row) => count + row.filter(Boolean).length,
    0,
  );

  return {
    analysisKind: "ona",
    interpretationBoundary: "descriptive-only",
    scope,
    scopeLabel: scope.kind === "overall" ? "Overall ordered network" : `${scope.name} ordered mean network`,
    unitCount,
    responseRowCount: audit.responseRowCount,
    opaqueHorizonCount: audit.opaqueHorizonCount,
    codeCount: config.codes.length,
    directedCellCount: config.codes.length * config.codes.length,
    enabledCellCount,
    maskedCellCount: config.codes.length * config.codes.length - enabledCellCount,
    zeroNetworkCount,
    rawConnectionTotal,
    rawSelfConnectionTotal,
    rawOffDiagonalConnectionTotal,
    incomingRawTotals,
    outgoingRawTotals,
    topDirectedEdges,
    pairAsymmetries,
    groupCounts,
    varianceDiagnostics,
    edges,
  };
}
