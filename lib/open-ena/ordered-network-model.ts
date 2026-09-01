import type { Row } from "jena-js";
import { openEnaAnalysisKindFromResult } from "./capabilities";
import {
  canonicalizeOpenEnaConfig,
  sameOpenEnaConfig,
  validateDirectionalMask,
} from "./network-config";
import type {
  CanonicalOpenEnaConfig,
  GroupNetwork,
  OpenEnaConfig,
  OpenEnaDirectionalMask,
  OpenEnaOrderedResponseNodeSummary,
  OpenEnaOrderPolicy,
  OpenEnaResolvedOrderPolicy,
  OpenEnaResult,
} from "./types";

const ZERO_TOLERANCE = 1e-12;

export type OpenEnaOrderedNetworkScope =
  | { kind: "overall" }
  | {
      kind: "group";
      name: string;
      /** Display-only ordering supplied by linked presenters; shared science ignores it. */
      presentationRole?: "primary" | "secondary";
    };

export type OpenEnaOrderedNetworkNodeTotals = OpenEnaOrderedResponseNodeSummary;

export interface OpenEnaOrderedNetworkNode {
  code: string;
  codeIndex: number;
  responseTotal: number;
  radius: number;
}

export interface OpenEnaOrderedNetworkEdge {
  name: string;
  ground: string;
  response: string;
  groundIndex: number;
  responseIndex: number;
  normalizedMeanWeight: number;
  rawAggregateCount: number;
  reverseNormalizedMeanWeight: number;
  relativeMagnitude: number;
  maskEnabled: boolean;
  selfConnection: boolean;
  chevron: boolean;
  visible: boolean;
}

export interface OpenEnaOrderedNetworkModel {
  scope: OpenEnaOrderedNetworkScope;
  codes: string[];
  nodes: OpenEnaOrderedNetworkNode[];
  edges: OpenEnaOrderedNetworkEdge[];
  visibleEdges: OpenEnaOrderedNetworkEdge[];
  maximumNormalizedMeanWeight: number;
  weightDefinition: "equal-unit normalized mean" | "group equal-unit normalized mean";
  nodeSizeDefinition: "raw response-code total" | "incoming normalized directed mass (response-total fallback)";
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.hasOwn(left, index)
      || !Object.hasOwn(right, index)
      || left[index] !== right[index]) return false;
  }
  return true;
}

function isDenseArray(value: unknown, expectedLength?: number): value is unknown[] {
  if (!Array.isArray(value) || (expectedLength !== undefined && value.length !== expectedLength)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isDenseZeroBasedPermutation(value: unknown): value is number[] {
  if (!isDenseArray(value) || value.length === 0) return false;
  const seen = new Set<number>();
  for (const sourceIndex of value) {
    if (typeof sourceIndex !== "number"
      || !Number.isSafeInteger(sourceIndex)
      || sourceIndex < 0
      || sourceIndex >= value.length
      || seen.has(sourceIndex)) return false;
    seen.add(sourceIndex);
  }
  return seen.size === value.length;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactStringKeys(value: unknown, expectedKeys: readonly string[]) {
  if (!isNonArrayObject(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key) => expectedKeys.includes(key));
}

function sameMask(left: OpenEnaDirectionalMask, right: OpenEnaDirectionalMask) {
  return sameStrings(left.codeOrder, right.codeOrder)
    && left.enabled.length === right.enabled.length
    && left.enabled.every((row, rowIndex) => (
      row.length === right.enabled[rowIndex]?.length
      && row.every((enabled, responseIndex) => enabled === right.enabled[rowIndex][responseIndex])
    ));
}

function sameOrderPolicy(left: OpenEnaOrderPolicy, right: OpenEnaOrderPolicy) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "source-row" && right.kind === "source-row") {
    return left.confirmed === true && right.confirmed === true;
  }
  return left.kind === "columns"
    && right.kind === "columns"
    && sameStrings(left.columns, right.columns)
    && hasExactStringKeys(left.comparators, left.columns)
    && hasExactStringKeys(right.comparators, right.columns)
    && left.columns.every((column) => left.comparators[column] === right.comparators[column]);
}

function resolvedOrderMatches(
  requested: OpenEnaOrderPolicy,
  resolved: OpenEnaResolvedOrderPolicy,
) {
  if (requested.kind === "source-row") {
    return resolved.kind === "source-row"
      && resolved.confirmed === true
      && resolved.stable === true;
  }
  return resolved.kind === "columns"
    && sameStrings(resolved.columns, requested.columns)
    && hasExactStringKeys(requested.comparators, requested.columns)
    && hasExactStringKeys(resolved.comparators, resolved.columns)
    && requested.columns.every((column) => resolved.comparators[column] === requested.comparators[column])
    && resolved.direction === "ascending"
    && resolved.missing === "reject"
    && resolved.ties === "reject"
    && resolved.stable === true;
}

function finiteNonnegative(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite nonnegative.`);
  }
  return value;
}

function validateNodeTotals(
  totals: OpenEnaOrderedNetworkNodeTotals,
  codes: readonly string[],
  scope: OpenEnaOrderedNetworkScope,
  result: OpenEnaResult,
) {
  if (typeof totals !== "object"
    || totals === null
    || totals.schemaVersion !== 1
    || !isDenseArray(totals.codeOrder, codes.length)
    || !sameStrings(totals.codeOrder, codes)) {
    throw new Error("ONA ordered node totals must exactly match the configured code order.");
  }
  if (!isDenseArray(totals.overallResponseCodeTotals, codes.length)
    || !isDenseArray(totals.groups)
    || totals.groups.some((group) => (
      typeof group !== "object"
      || group === null
      || typeof group.name !== "string"
      || !isDenseArray(group.responseCodeTotals, codes.length)
    ))) {
    throw new Error("ONA ordered node totals must use dense code-aligned overall and group arrays.");
  }
  const values = scope.kind === "overall"
    ? totals.overallResponseCodeTotals
    : totals.groups.find((group) => group.name === scope.name)?.responseCodeTotals;
  if (!values || values.length !== codes.length) {
    throw new Error("ONA ordered node totals are missing the requested plot scope.");
  }
  const groupNames = totals.groups.map((group) => group.name);
  if (new Set(groupNames).size !== groupNames.length
    || totals.groups.length !== result.groups.length
    || result.groups.some((group) => {
      const summary = totals.groups.find((candidate) => candidate.name === group.name);
      return !summary
        || !Number.isSafeInteger(summary.unitCount)
        || summary.unitCount !== group.count
        || summary.responseCodeTotals.length !== codes.length;
    })) {
    throw new Error("ONA ordered node totals must match every completed result group and unit count.");
  }
  for (const group of totals.groups) {
    group.responseCodeTotals.forEach((value, index) => {
      finiteNonnegative(value, `ONA group “${group.name}” response total ${index + 1}`);
    });
  }
  const overall = totals.overallResponseCodeTotals.map((value, index) => (
    finiteNonnegative(value, `ONA overall response total ${index + 1}`)
  ));
  if (overall.length !== codes.length) {
    throw new Error("ONA ordered node totals must contain one overall value for every configured code.");
  }
  for (let codeIndex = 0; codeIndex < codes.length; codeIndex += 1) {
    let groupedTotal = 0;
    let groupedMagnitude = 0;
    for (const group of totals.groups) {
      groupedTotal += group.responseCodeTotals[codeIndex];
      groupedMagnitude += Math.abs(group.responseCodeTotals[codeIndex]);
      if (!Number.isFinite(groupedTotal) || !Number.isFinite(groupedMagnitude)) {
        throw new Error(`ONA grouped response total ${codeIndex + 1} exceeds finite arithmetic range.`);
      }
    }
    const roundoffTolerance = Number.EPSILON * groupedMagnitude * Math.max(8, totals.groups.length * 2);
    if (Math.abs(groupedTotal - overall[codeIndex]) > roundoffTolerance) {
      throw new Error("ONA ordered node overall totals must numerically agree with their de-identified group totals.");
    }
  }
  return scope.kind === "overall"
    ? overall
    : values.map((value, index) => finiteNonnegative(value, `ONA response total ${index + 1}`));
}

function rowBelongsToScope(
  row: Row,
  scope: OpenEnaOrderedNetworkScope,
  groupColumn: string | null,
) {
  if (scope.kind === "overall") return true;
  return Boolean(groupColumn) && String(row[groupColumn as string] ?? "") === scope.name;
}

function assertOptionalProvenanceBinding(
  result: OpenEnaResult,
  config: CanonicalOpenEnaConfig,
) {
  if (!Object.hasOwn(result, "provenanceBinding")) return;
  const binding = Reflect.get(result, "provenanceBinding") as unknown;
  if (!isNonArrayObject(binding)
    || !Object.hasOwn(binding, "configuration")
    || !sameOpenEnaConfig(binding.configuration as OpenEnaConfig, config)) {
    throw new Error("The completed ONA provenance binding configuration must match the canonical plot configuration.");
  }
}

function invalidOrderedAuditIntegrity(): never {
  throw new Error("The completed ONA ordered audit integrity requires aligned dense response-major p² arrays.");
}

function optionalOrderedAuditResponseRowCount(
  result: OpenEnaResult,
  codes: readonly string[],
) {
  if (!Object.hasOwn(result, "orderedAudit")) return null;
  const audit = Reflect.get(result, "orderedAudit") as unknown;
  if (!isNonArrayObject(audit)
    || audit.schemaVersion !== 1
    || audit.edgeOrder !== "response-major-ground-minor"
    || !isDenseArray(audit.codeOrder, codes.length)
    || !sameStrings(audit.codeOrder as string[], codes)
    || !isDenseArray(audit.edgeValues)) {
    invalidOrderedAuditIntegrity();
  }
  const responseRowCount = audit.edgeValues.length;
  const responseRowIndices = audit.responseRowIndices;
  if (!isDenseArray(responseRowIndices, responseRowCount)
    || !isDenseArray(audit.previousResponseRowIndices, responseRowCount)
    || !isDenseArray(audit.priorRowCounts, responseRowCount)
    || !isDenseArray(audit.horizonOrdinals, responseRowCount)
    || !isDenseZeroBasedPermutation(responseRowIndices)) {
    invalidOrderedAuditIntegrity();
  }
  const edgeCount = codes.length * codes.length;
  for (const edgeRow of audit.edgeValues) {
    if (!isDenseArray(edgeRow, edgeCount)) invalidOrderedAuditIntegrity();
  }
  return responseRowCount;
}

function validateCompletedResultGroups(value: unknown): GroupNetwork[] {
  const invalid = (): never => {
    throw new Error(
      "ONA completed result groups integrity requires nonempty groups with unique nonempty names, positive safe unit counts, and object mean-weight maps.",
    );
  };
  const groups = isDenseArray(value) ? value : invalid();
  if (groups.length === 0) invalid();
  const names = new Set<string>();
  for (const candidate of groups) {
    const group = isNonArrayObject(candidate) ? candidate : invalid();
    const name = typeof group.name === "string" ? group.name : invalid();
    if (name.length === 0
      || names.has(name)
      || !Number.isSafeInteger(group.count)
      || (group.count as number) < 1
      || !isNonArrayObject(group.meanWeights)) {
      invalid();
    }
    names.add(name);
  }
  return groups as unknown as GroupNetwork[];
}

function assertExecutionProvenance(
  result: OpenEnaResult,
  config: CanonicalOpenEnaConfig,
) {
  const execution = result.executionProvenance;
  const configMask = config.directionalMask;
  const configOrder = config.orderPolicy;
  if (!execution
    || execution.schemaVersion !== 1
    || execution.analysisKind !== "ona"
    || execution.networkType !== "ordered"
    || execution.nodePositionMethod !== "directed"
    || execution.configuration?.analysisKind !== "ona"
    || !execution.configuration.directionalMask
    || !execution.configuration.orderPolicy
    || !execution.directionalMask
    || !execution.ordering
    || !configMask
    || !configOrder) {
    throw new Error("The completed ONA execution provenance must describe one canonical directed ordered-network run.");
  }
  const provenanceConfigurationMaskErrors = validateDirectionalMask(
    execution.configuration.directionalMask,
    result.set.codes,
  );
  const provenanceMaskErrors = validateDirectionalMask(execution.directionalMask, result.set.codes);
  if (provenanceConfigurationMaskErrors.length > 0
    || provenanceMaskErrors.length > 0
    || !sameMask(execution.configuration.directionalMask, configMask)
    || !sameMask(execution.directionalMask, configMask)
    || !sameOpenEnaConfig(execution.configuration, config)
    || !sameOrderPolicy(execution.configuration.orderPolicy, configOrder)
    || !sameOrderPolicy(execution.ordering.requestedPolicy, configOrder)
    || !resolvedOrderMatches(execution.ordering.requestedPolicy, execution.ordering.resolvedPolicy)
    || !isDenseZeroBasedPermutation(execution.ordering.responseRowSourceIndices)) {
    throw new Error("The completed ONA execution provenance has a stale configuration, directional mask, or order contract.");
  }
  const auditResponseRowCount = optionalOrderedAuditResponseRowCount(result, config.codes);
  if (auditResponseRowCount !== null
    && execution.ordering.responseRowSourceIndices.length !== auditResponseRowCount) {
    throw new Error("The ONA source-index mapping must cover all ordered audit response rows.");
  }
}

export function buildOpenEnaOrderedNetworkModel(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope: OpenEnaOrderedNetworkScope;
  edgeThreshold: number;
  nodeTotals?: OpenEnaOrderedNetworkNodeTotals;
}): OpenEnaOrderedNetworkModel {
  const { result, scope } = input;
  const config = canonicalizeOpenEnaConfig(input.config);
  assertOptionalProvenanceBinding(result, config);
  if (config.analysisKind !== "ona"
    || openEnaAnalysisKindFromResult(result) !== "ona"
    || result.set.networkType !== "ordered") {
    throw new Error("The shared ordered-network model requires one completed ONA result.");
  }
  if (!sameStrings(result.set.codes, config.codes)) {
    throw new Error("The shared ordered-network model code order disagrees with the completed configuration.");
  }
  assertExecutionProvenance(result, config);
  const maskErrors = validateDirectionalMask(config.directionalMask, config.codes);
  if (!config.directionalMask || maskErrors.length > 0) {
    throw new Error(`The shared ordered-network model requires one valid label-bound p² directional mask. ${maskErrors.join(" ")}`.trim());
  }
  if (!Number.isFinite(input.edgeThreshold) || input.edgeThreshold < 0 || input.edgeThreshold > 1) {
    throw new Error("ONA edge threshold must be finite from zero to one.");
  }
  const size = config.codes.length;
  const edgeCount = size * size;
  if (result.set.adjacencyKey.length !== edgeCount || result.set.codeColumns.length !== edgeCount) {
    throw new Error("ONA adjacency must contain the complete p² response-major, ground-minor edge order.");
  }
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const groundIndex = edgeIndex % size;
    const responseIndex = Math.floor(edgeIndex / size);
    const edge = result.set.adjacencyKey[edgeIndex];
    if (!edge
      || edge.sourceIndex !== groundIndex
      || edge.targetIndex !== responseIndex
      || edge.source !== config.codes[groundIndex]
      || edge.target !== config.codes[responseIndex]
      || edge.name !== `${edge.source} & ${edge.target}`
      || result.set.codeColumns[edgeIndex] !== edge.name) {
      throw new Error("ONA adjacency must use the complete response-major, ground-minor source/target contract.");
    }
  }

  const groups = validateCompletedResultGroups(result.groups);
  const selectedGroup = scope.kind === "group"
    ? groups.find((group) => group.name === scope.name)
    : null;
  if (scope.kind === "group" && !selectedGroup) {
    throw new Error(`ONA group plot scope “${scope.name}” is not present in the completed result.`);
  }
  const ungroupedSingleGroupScope = scope.kind === "group"
    && !config.groupColumn
    && groups.length === 1
    && selectedGroup?.name === scope.name;
  if (scope.kind === "group" && !config.groupColumn && !ungroupedSingleGroupScope) {
    throw new Error("ONA group plot scope requires one authoritative group column for raw aggregation.");
  }
  const rawScope: OpenEnaOrderedNetworkScope = ungroupedSingleGroupScope
    ? { kind: "overall" }
    : scope;
  let totalUnits = 0;
  for (const group of groups) {
    if (!Number.isSafeInteger(totalUnits + group.count)) {
      throw new Error("ONA plotting unit count total exceeds the safe finite arithmetic range.");
    }
    totalUnits += group.count;
  }
  const meanWeight = (edgeName: string) => {
    if (selectedGroup) {
      return finiteNonnegative(selectedGroup.meanWeights[edgeName], `ONA group mean edge “${edgeName}”`);
    }
    let weighted = 0;
    for (const group of groups) {
      const value = finiteNonnegative(group.meanWeights[edgeName], `ONA group mean edge “${edgeName}”`);
      const contribution = value * group.count;
      if (!Number.isFinite(contribution) || !Number.isFinite(weighted + contribution)) {
        throw new Error(`ONA overall mean edge “${edgeName}” exceeds finite arithmetic range.`);
      }
      weighted += contribution;
    }
    return weighted / totalUnits;
  };

  const rawAggregateCount = (edgeName: string) => {
    let total = 0;
    for (const row of result.set.connectionCounts) {
      if (typeof row !== "object" || row === null) {
        throw new Error("ONA raw connection rows must be objects.");
      }
      if (!rowBelongsToScope(row, rawScope, config.groupColumn)) continue;
      const value = finiteNonnegative(row[edgeName], `ONA raw connection “${edgeName}”`);
      if (!Number.isFinite(total + value)) {
        throw new Error(`ONA raw connection aggregate “${edgeName}” exceeds finite arithmetic range.`);
      }
      total += value;
    }
    return total;
  };

  const weightedEdges = result.set.adjacencyKey.map((edge) => ({
    edge,
    normalizedMeanWeight: meanWeight(edge.name),
    rawAggregateCount: rawAggregateCount(edge.name),
  }));
  const maximumNormalizedMeanWeight = Math.max(
    ZERO_TOLERANCE,
    ...weightedEdges.map(({ normalizedMeanWeight }) => normalizedMeanWeight),
  );
  const byDirection = new Map(weightedEdges.map((entry) => [
    `${entry.edge.sourceIndex}:${entry.edge.targetIndex}`,
    entry.normalizedMeanWeight,
  ]));
  const edges: OpenEnaOrderedNetworkEdge[] = weightedEdges.map(({ edge, normalizedMeanWeight, rawAggregateCount }) => {
    const reverseNormalizedMeanWeight = byDirection.get(`${edge.targetIndex}:${edge.sourceIndex}`);
    if (reverseNormalizedMeanWeight === undefined) {
      throw new Error(`ONA adjacency is missing reciprocal edge ${edge.target} & ${edge.source}.`);
    }
    const maskEnabled = config.directionalMask!.enabled[edge.sourceIndex][edge.targetIndex];
    const selfConnection = edge.sourceIndex === edge.targetIndex;
    const relativeMagnitude = normalizedMeanWeight / maximumNormalizedMeanWeight;
    const chevron = !selfConnection
      && normalizedMeanWeight > ZERO_TOLERANCE
      && normalizedMeanWeight >= reverseNormalizedMeanWeight;
    const visible = maskEnabled
      && normalizedMeanWeight > ZERO_TOLERANCE
      && relativeMagnitude >= input.edgeThreshold;
    return {
      name: edge.name,
      ground: edge.source,
      response: edge.target,
      groundIndex: edge.sourceIndex,
      responseIndex: edge.targetIndex,
      normalizedMeanWeight,
      rawAggregateCount,
      reverseNormalizedMeanWeight,
      relativeMagnitude,
      maskEnabled,
      selfConnection,
      chevron,
      visible,
    };
  });

  const responseTotals = input.nodeTotals
    ? validateNodeTotals(input.nodeTotals, config.codes, scope, result)
    : config.codes.map((_, responseIndex) => {
        let total = 0;
        for (const edge of edges) {
          if (edge.responseIndex !== responseIndex || !edge.maskEnabled) continue;
          if (!Number.isFinite(total + edge.normalizedMeanWeight)) {
            throw new Error(`ONA incoming normalized directed mass ${responseIndex + 1} exceeds finite arithmetic range.`);
          }
          total += edge.normalizedMeanWeight;
        }
        return total;
      });
  const maximumResponseTotal = Math.max(ZERO_TOLERANCE, ...responseTotals);
  const nodes = config.codes.map((code, codeIndex) => {
    const responseTotal = responseTotals[codeIndex];
    return {
      code,
      codeIndex,
      responseTotal,
      radius: 10 + Math.sqrt(responseTotal / maximumResponseTotal) * 12,
    };
  });

  return {
    scope: scope.kind === "overall"
      ? { kind: "overall" }
      : { kind: "group", name: scope.name },
    codes: [...config.codes],
    nodes,
    edges,
    visibleEdges: edges.filter((edge) => edge.visible),
    maximumNormalizedMeanWeight,
    weightDefinition: scope.kind === "overall" ? "equal-unit normalized mean" : "group equal-unit normalized mean",
    nodeSizeDefinition: input.nodeTotals
      ? "raw response-code total"
      : "incoming normalized directed mass (response-total fallback)",
  };
}
