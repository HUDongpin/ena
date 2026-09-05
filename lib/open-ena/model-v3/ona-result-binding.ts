import { orderedAdjacencyKey, type ENASet, type Row } from "jena-js";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import { centeredNetworkRankV3 } from "./diagnostics";
import { captureOnaExecutionPlanInputV3, captureOnaJsonV3, buildOnaResponseNodeSummaryV3, toOnaJenaOptionsV3, validateOnaExecutionPlanV3, verifyOnaScientificEvidenceV3, type InternalOnaRunResultV3, type OnaExecutionPlanV3 } from "./ona-adapter";
import type { BoundOnaResultV3, OnaRuntimeResourceObservationV3, OnaResultExecutionProvenanceV3, ResultBindingV3, SerializableEnaSetV3 } from "./types";
import { buildOpenEnaOrderedAudit } from "../ordered-audit";
import type { OpenEnaOrderedAudit, OpenEnaOrderedResponseNodeSummary } from "../types";
import { MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_STRUCTURAL_BYTES_V3 } from "./resource-budget";
import { assertOnaScientificClosureV3 } from "./ona-scientific-closure";
import type { OnaCompilerDiagnosticV3 } from "./ona-compiler-preflight";

const COUNTERS = { version: 1, numericCells: "conservative-phase-dimension-upper-bound", bufferedRows: "chunk-boundary-observation-plus-separate-peak-upper-bound", bytes: "conservative-structural-and-temporary-overlap-bound" } as const;
const CAPABILITIES = { "build-model": "available", "export-current-model": "available", "export-reference": "blocked", "group-inference": "blocked", "trajectory-inference": "blocked", "longitudinal-comparison": "blocked", "ai-interpretation": "blocked" } as const;
function same(left: unknown, right: unknown, label: string): void {
  if (canonicalJsonV3(left) !== canonicalJsonV3(right)) throw new TypeError(`ONA bound result ${label} is inconsistent.`);
}
function finite(value: unknown, nonnegative = false): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || (nonnegative && value < 0)) throw new TypeError("ONA scientific coordinates/counts must be finite and counts nonnegative.");
}
function integer(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`ONA ${label} must be a nonnegative safe integer.`);
}
function lookup(map: ReadonlyMap<string, string>, value: unknown): string {
  if (typeof value !== "string" || !map.has(value)) throw new TypeError("ONA result contains an unknown identity or column token.");
  return map.get(value)!;
}
function keys(value: object, expected: readonly string[], label: string): void { same(Object.keys(value).sort(), [...expected].sort(), `${label} fields`); }

export function onaPlanBindingV3(plan: OnaExecutionPlanV3): Omit<ResultBindingV3, "scientificResultSha256"> {
  const h = plan.header;
  return { datasetSha256: h.datasetSha256, datasetHashKind: h.datasetHashKind, rowCount: h.rowCount, headerSha256: h.headerSha256, configurationSha256: h.configurationSha256, executionPlanSha256: h.executionPlanSha256,
    runtimeVersion: h.runtimeVersion, algorithmBuildSha: h.algorithmBuildSha, validationContractVersion: h.validationContractVersion, runtimePolicyVersion: h.runtimePolicyVersion, executionContractVersion: h.executionContractVersion,
    referenceId: null, referenceContentSha256: null };
}

function labels(plan: OnaExecutionPlanV3): OnaResultExecutionProvenanceV3["labels"] {
  const codes = plan.codeDictionary.codes.map((code, index) => ({ runtimeToken: code.token, column: `Code ${index + 1}`, sourceColumn: code.sourceColumn, displayLabel: code.displayLabel, canonicalIdentity: code.canonicalIdentity }));
  return { unitColumn: "Unit", horizonColumn: "Horizon", groupColumn: "Group", codes,
    edges: orderedAdjacencyKey(codes.map((code) => code.runtimeToken)).map((edge, index) => ({ runtimeColumn: edge.name, column: `Connection ${index + 1}`, sourceCodeIdentity: codes[edge.sourceIndex].canonicalIdentity, targetCodeIdentity: codes[edge.targetIndex].canonicalIdentity })) };
}

function population(plan: OnaExecutionPlanV3): string[] { return [...new Set(plan.runtimeSourceRowIndices.map((index) => plan.rows[index].unitToken))]; }

export function validateOnaObservationV3(plan: OnaExecutionPlanV3, observed: OnaRuntimeResourceObservationV3): void {
  keys(observed, ["processedRows", "maximumRetainedRowsAfterChunk", "bufferedRowsPeakUpperBound", "numericCellsUpperBound", "peakBytesUpperBound", "observationMethod"], "observations");
  for (const field of ["processedRows", "maximumRetainedRowsAfterChunk", "bufferedRowsPeakUpperBound", "numericCellsUpperBound", "peakBytesUpperBound"] as const) integer(observed[field], field);
  const admission = plan.operationalAdmission, estimate = plan.header.resourceEstimate;
  if (observed.processedRows !== plan.rows.length || observed.observationMethod !== "dimension-bounds-and-chunk-boundary-stream-state"
    || observed.maximumRetainedRowsAfterChunk > estimate.estimatedRetainedWindowRows
    || observed.bufferedRowsPeakUpperBound !== Math.min(plan.rows.length, estimate.estimatedRetainedWindowRows + 1)
    || observed.numericCellsUpperBound !== admission.totalNumericCells || observed.peakBytesUpperBound !== admission.totalPeakBytes) throw new TypeError("ONA resource observation disagrees with its admitted phase bounds.");
}

function validateAudit(plan: OnaExecutionPlanV3, audit: OpenEnaOrderedAudit): void {
  keys(audit, ["schemaVersion", "codeOrder", "edgeOrder", "responseRowIndices", "previousResponseRowIndices", "priorRowCounts", "horizonOrdinals", "edgeValues"], "audit");
  same(audit.codeOrder, plan.codeDictionary.codes.map((code) => code.token), "audit Code order");
  if (audit.schemaVersion !== 1 || audit.edgeOrder !== "response-major-ground-minor") throw new TypeError("ONA ordered audit family is invalid.");
  for (const table of [audit.responseRowIndices, audit.previousResponseRowIndices, audit.priorRowCounts, audit.horizonOrdinals, audit.edgeValues]) if (table.length !== plan.rows.length) throw new TypeError("ONA audit row count must match the exact source population.");
  const prior = new Map<string, { index: number; count: number; ordinal: number }>();
  const backward = plan.configuration.window.backward.kind === "infinity" ? Infinity : plan.configuration.window.backward.value;
  for (let index = 0; index < plan.rows.length; index += 1) {
    const row = plan.rows[plan.runtimeSourceRowIndices[index]], previous = prior.get(row.horizonToken);
    const expected = { index, count: (previous?.count ?? 0) + 1, ordinal: previous?.ordinal ?? prior.size };
    if (audit.responseRowIndices[index] !== index || audit.previousResponseRowIndices[index] !== (previous?.index ?? null) || audit.priorRowCounts[index] !== Math.min(previous?.count ?? 0, backward - 1) || audit.horizonOrdinals[index] !== expected.ordinal) throw new TypeError("ONA audit predecessor/window/order proof differs from the executed source schedule.");
    if (audit.edgeValues[index].length !== plan.codeDictionary.edges.length) throw new TypeError("ONA audit requires the complete response-major directed basis.");
    audit.edgeValues[index].forEach((value, edgeIndex) => {
      finite(value, true);
      const edge = plan.codeDictionary.edges[edgeIndex];
      if (!plan.directionalMask.enabled[edge.groundIndex][edge.responseIndex] && value !== 0) throw new TypeError("ONA audit cannot enable a masked direction.");
    });
    prior.set(row.horizonToken, expected);
  }
}

export function countOnaScientificCellsV3(set: ENASet | SerializableEnaSetV3, audit: OpenEnaOrderedAudit, summary: OpenEnaOrderedResponseNodeSummary): number {
  const count = (rows: readonly Row[], fields: readonly string[]) => rows.reduce((total, row) => total + fields.filter((field) => typeof row[field] === "number").length, 0);
  const axes = set.rotation.rotationColumns.slice(0, 3), edges = set.codeColumns;
  return count(set.rawRows, set.codes) + count(set.rowConnectionCounts, [...set.codes, ...edges])
    + [set.connectionCounts, set.lineWeights, set.pointsForProjection].reduce((total, rows) => total + count(rows, edges), 0)
    + set.connectionMatrix.reduce((total, row) => total + row.length, 0)
    + count(set.points, axes) + count(set.centroids ?? [], axes) + count(set.rotation.nodes ?? [], axes)
    + set.rotation.rotationMatrix.reduce((total, row) => total + row.length, 0) + set.rotation.eigenvalues.length + set.rotation.centerVector.length + Object.keys(set.variance).length
    + audit.edgeValues.reduce((total, row) => total + row.length, 0) + summary.overallResponseCodeTotals.length + summary.groups.reduce((total, group) => total + group.responseCodeTotals.length, 0);
}

type OnaRuntimeEvidenceV3 = Omit<InternalOnaRunResultV3, "set"> & { readonly set: ENASet | SerializableEnaSetV3 };

function guardBindingAllocation(plan: OnaExecutionPlanV3, retainedScientificCells: number, scratch: number): void {
  // Unknown import keeps captured and independently validated source graphs;
  // native binding has fewer plan copies, so4NC remains conservative there.
  const cells = 4 * plan.rows.length * plan.codeDictionary.codes.length + retainedScientificCells + scratch;
  if (!Number.isSafeInteger(cells) || cells > Math.min(plan.operationalAdmission.stages.bindingCells, plan.operationalAdmission.totalNumericCells, MAX_ESTIMATED_NUMERIC_CELLS_V3)) throw new TypeError("ONA binding allocation exceeds pre-diagnostic resource admission.");
  const a = plan.operationalAdmission, base = plan.header.resourceEstimate;
  const structure = base.estimatedStructuralBytes + 8 * a.resultIdentityBytes;
  const bytes = base.estimatedWorkerMaterializationBytes + structure + 8 * cells + 192 * a.compactScientificCells;
  if (a.numericSerializationBytes !== 192 * a.compactScientificCells || a.metadataSerializationBytes !== 8 * a.resultIdentityBytes || a.totalStructuralBytes !== structure
    || !Number.isSafeInteger(bytes) || bytes > Math.min(a.totalPeakBytes, MAX_ESTIMATED_PEAK_BYTES_V3) || structure > MAX_ESTIMATED_STRUCTURAL_BYTES_V3) throw new TypeError("ONA serialization/diagnostic bytes exceed resource admission.");
}

function validateRuntime(plan: OnaExecutionPlanV3, runtime: OnaRuntimeEvidenceV3, retainedScientificCells = countOnaScientificCellsV3(runtime.set, runtime.orderedAudit, runtime.orderedResponseNodeSummary)): number {
  assertClosureWorkAdmission(plan);
  same(runtime.configuration, plan.configuration, "configuration"); same(runtime.executionPlanHeader, plan.header, "header");
  const set = runtime.set, codes = plan.codeDictionary.codes.map((code) => code.token), edges = orderedAdjacencyKey(codes), columns = edges.map((edge) => edge.name);
  keys(set, ["modelType", "codes", "units", "conversation", "codeColumns", "adjacencyKey", "rawRows", "rowConnectionCounts", "connectionCounts", "connectionMatrix", "metaData", "unitLabels", "functionParams", "networkType", "rowWindowProvenance", "lineWeights", "pointsForProjection", "points", "rotation", "variance", "centroids"], "set");
  if (set.networkType !== "ordered" || set.modelType !== "EndPoint") throw new TypeError("ONA result must be an ordered Endpoint network.");
  same(set.codes, codes, "Codes"); same(set.codeColumns, columns, "edge columns"); same(set.adjacencyKey, edges, "directed edge basis");
  same(set.units, [plan.adapterParameters.unitTokenColumn], "Unit column"); same(set.conversation, [plan.adapterParameters.horizonTokenColumn], "Horizon column");
  same({ ...set.functionParams, windowSizeBack: set.functionParams.windowSizeBack === Infinity ? "Infinity" : set.functionParams.windowSizeBack }, { model: "EndPoint", window: "MovingStanzaWindow", windowSizeBack: plan.configuration.window.backward.kind === "infinity" ? "Infinity" : plan.configuration.window.backward.value, windowSizeForward: 0, includeMeta: true, weightBy: "sum", networkType: "ordered" }, "fixed function parameters");
  const tokens = population(plan), groupByUnit = new Map(plan.rows.map((row) => [row.unitToken, row.groupToken]));
  const axes = Array.from({ length: edges.length }, (_, index) => `SVD${index + 1}`), display = axes.slice(0, 3);
  const rotation = set.rotation;
  keys(rotation, ["codes", "adjacencyKey", "rotationMatrix", "rotationColumns", "eigenvalues", "centerVector", "nodes"], "rotation");
  same(rotation.codes, codes, "rotation Codes"); same(rotation.adjacencyKey, edges, "rotation edges"); same(rotation.rotationColumns, axes, "full SVD axes");
  if (rotation.rotationMatrix.length !== edges.length || rotation.eigenvalues.length !== edges.length || rotation.centerVector.length !== edges.length) throw new TypeError("ONA rotation requires a complete full directed basis.");
  for (const row of rotation.rotationMatrix) { if (row.length !== edges.length) throw new TypeError("ONA rotation must be square."); row.forEach((value) => finite(value)); }
  rotation.centerVector.forEach((value) => finite(value)); rotation.eigenvalues.forEach((value, index) => { finite(value, true); if (index && value > rotation.eigenvalues[index - 1]) throw new TypeError("ONA SVD eigenvalues must be descending."); });
  const orthogonalWork = edges.length ** 3;
  if (!Number.isSafeInteger(orthogonalWork) || orthogonalWork > Math.min(plan.header.resourceEstimate.estimatedRotationWorkUnits, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3)) throw new TypeError("ONA orthonormal validation exceeds its checked work admission.");
  for (let left = 0; left < edges.length; left += 1) for (let right = left; right < edges.length; right += 1) {
    let product = 0; for (const row of rotation.rotationMatrix) product += row[left] * row[right];
    if (!Number.isFinite(product) || Math.abs(product - (left === right ? 1 : 0)) > 1e-8) throw new TypeError("ONA SVD basis must be orthonormal.");
  }
  same(set.unitLabels, tokens, "Unit population order");
  same(rotation.nodes?.map((node) => node.code), codes, "node order");
  for (const node of rotation.nodes ?? []) { keys(node, ["code", ...display], "node"); display.forEach((axis) => finite(node[axis])); }
  keys(set.variance, axes, "variance"); Object.values(set.variance).forEach((value) => finite(value, true));
  const rowKeys = (token: string, fields: readonly string[]) => ["ENA_UNIT", plan.adapterParameters.unitTokenColumn, ...(groupByUnit.get(token) === null ? [] : [plan.adapterParameters.groupTokenColumn]), ...fields];
  for (const [table, fields, nonnegative] of [[set.connectionCounts, columns, true], [set.lineWeights, columns, true], [set.pointsForProjection, columns, false], [set.points, display, false]] as const) {
    if (table.length !== tokens.length) throw new TypeError("ONA table Unit population differs from the plan.");
    table.forEach((row, index) => {
      keys(row, rowKeys(tokens[index], fields), "scientific row");
      if (row.ENA_UNIT !== tokens[index] || row[plan.adapterParameters.unitTokenColumn] !== tokens[index] || (groupByUnit.get(tokens[index]) !== null && row[plan.adapterParameters.groupTokenColumn] !== groupByUnit.get(tokens[index]))) throw new TypeError("ONA row Unit/Group identities differ from the source proof.");
      fields.forEach((field) => finite(row[field], nonnegative));
    });
  }
  if (set.centroids?.length !== tokens.length || set.connectionMatrix.length !== tokens.length) throw new TypeError("ONA matrix/centroid population is incomplete.");
  set.centroids.forEach((row, index) => { keys(row, ["unit", ...display], "centroid"); if (row.unit !== tokens[index]) throw new TypeError("ONA centroid Unit token is invalid."); display.forEach((axis) => finite(row[axis])); });
  set.connectionMatrix.forEach((row, index) => same(row, columns.map((column) => set.connectionCounts[index][column]), "matrix/count table"));
  for (const row of set.connectionMatrix) row.forEach((value, index) => {
    const edge = plan.codeDictionary.edges[index];
    if (!plan.directionalMask.enabled[edge.groundIndex][edge.responseIndex] && value !== 0) throw new TypeError("ONA aggregate cannot enable a masked direction.");
  });
  if (set.metaData.length !== 0 && set.metaData.length !== tokens.length) throw new TypeError("ONA metadata population is invalid.");
  validateAudit(plan, runtime.orderedAudit);
  const options = toOnaJenaOptionsV3(plan);
  if (set.rawRows.length || set.rowConnectionCounts.length || set.rowWindowProvenance?.length) {
    if (set.rawRows.length !== plan.rows.length || set.rowConnectionCounts.length !== plan.rows.length) throw new TypeError("ONA full materialization must retain every response row.");
    set.rawRows.forEach((row, index) => same(row, { ...options.rows[index], ENA_UNIT: options.rows[index][plan.adapterParameters.unitTokenColumn] }, "full raw source row"));
    const nativeSet: ENASet = { ...set, functionParams: { ...set.functionParams,
      windowSizeBack: set.functionParams.windowSizeBack === "Infinity" ? Infinity : set.functionParams.windowSizeBack,
      windowSizeForward: set.functionParams.windowSizeForward === "Infinity" ? Infinity : set.functionParams.windowSizeForward } };
    same(buildOpenEnaOrderedAudit(nativeSet), runtime.orderedAudit, "full row audit");
  }
  same(runtime.orderedResponseNodeSummary, buildOnaResponseNodeSummaryV3(plan, options.rows), "source response totals and typed Group identities");
  guardBindingAllocation(plan, retainedScientificCells, plan.operationalAdmission.stages.rankDiagnosticCells);
  const rank = centeredNetworkRankV3(set.connectionMatrix, true);
  if (rank < 0 || rank > Math.min(edges.length, Math.max(0, tokens.length - 1))) throw new TypeError("ONA descriptive SVD rank is outside its target population.");
  if (countOnaScientificCellsV3(set, runtime.orderedAudit, runtime.orderedResponseNodeSummary) > plan.operationalAdmission.stages.bindingCells) throw new TypeError("ONA result scientific storage exceeds its binding budget.");
  return rank;
}

function mappedPayload(plan: OnaExecutionPlanV3, set: ENASet | SerializableEnaSetV3, audit: OpenEnaOrderedAudit, summary: OpenEnaOrderedResponseNodeSummary, reverse = false) {
  const label = labels(plan), pairs = (values: [string, string][]) => new Map(values.map(([a, b]) => reverse ? [b, a] : [a, b]));
  const units = pairs(plan.identityDictionary.units.map((entry) => [entry.token, entry.displayLabel]));
  const groups = pairs(plan.identityDictionary.groups.map((entry) => [entry.token, entry.displayLabel]));
  const codes = pairs(label.codes.map((entry) => [entry.runtimeToken, entry.column]));
  const columns = pairs([[plan.adapterParameters.unitTokenColumn, "Unit"], [plan.adapterParameters.groupTokenColumn, "Group"], ...label.edges.map((entry): [string, string] => [entry.runtimeColumn, entry.column])]);
  const edges = pairs(label.edges.map((entry) => [entry.runtimeColumn, entry.column]));
  const row = (input: Row): Row => Object.fromEntries(Object.entries(input).map(([key, value]) => [columns.get(key) ?? key,
    key === "ENA_UNIT" || key === "unit" || key === (reverse ? "Unit" : plan.adapterParameters.unitTokenColumn) ? lookup(units, value)
      : key === (reverse ? "Group" : plan.adapterParameters.groupTokenColumn) ? lookup(groups, value) : value]));
  const adjacencyKey = set.adjacencyKey.map((entry) => ({ ...entry, source: lookup(codes, entry.source), target: lookup(codes, entry.target), name: lookup(edges, entry.name) }));
  const mappedSet: SerializableEnaSetV3 = { ...set, units: [reverse ? plan.adapterParameters.unitTokenColumn : "Unit"], conversation: [reverse ? plan.adapterParameters.horizonTokenColumn : "Horizon"],
    codes: set.codes.map((value) => lookup(codes, value)), codeColumns: set.codeColumns.map((value) => lookup(edges, value)), adjacencyKey,
    rawRows: [], rowConnectionCounts: [], rowWindowProvenance: [], metaData: [], connectionCounts: set.connectionCounts.map(row), lineWeights: set.lineWeights.map(row), pointsForProjection: set.pointsForProjection.map(row), points: set.points.map(row), centroids: set.centroids?.map(row), unitLabels: set.unitLabels.map((value) => lookup(units, value)),
    functionParams: { ...set.functionParams, windowSizeBack: set.functionParams.windowSizeBack === Infinity ? "Infinity" : set.functionParams.windowSizeBack, windowSizeForward: 0 },
    rotation: { ...set.rotation, codes: set.rotation.codes.map((value) => lookup(codes, value)), adjacencyKey, nodes: set.rotation.nodes?.map((node) => ({ ...node, code: lookup(codes, node.code) })) } };
  return { set: mappedSet, orderedAudit: { ...audit, codeOrder: audit.codeOrder.map((value) => lookup(codes, value)) }, orderedResponseNodeSummary: { ...summary, codeOrder: summary.codeOrder.map((value) => lookup(codes, value)), groups: summary.groups.map((group) => ({ ...group, name: plan.configuration.units.group.type === "none" ? group.name : lookup(groups, group.name) })) } };
}

function provenance(plan: OnaExecutionPlanV3, rank: number, observed: OnaRuntimeResourceObservationV3, diagnostics: readonly OnaCompilerDiagnosticV3[]): OnaResultExecutionProvenanceV3 {
  const tokens = population(plan), fullAxes = Array.from({ length: plan.codeDictionary.edges.length }, (_, index) => `SVD${index + 1}`);
  const groups = new Map(plan.rows.map((row) => [row.unitToken, row.groupToken]));
  return { header: plan.header, sourceProofSha256: plan.sourceProof.sourceProofSha256, identityDictionary: plan.identityDictionary, codeDictionary: plan.codeDictionary, codeRepresentations: plan.codeRepresentations,
    unitGroups: plan.identityDictionary.units.map((entry) => ({ unitToken: entry.token, groupToken: groups.get(entry.token) ?? null })), labels: labels(plan),
    ordering: { requestedRowOrder: plan.configuration.window.rowOrder, resolvedRowOrder: plan.rowOrdering, resolvedHorizonOrder: plan.horizonOrdering, runtimeSourceRowIndices: plan.runtimeSourceRowIndices },
    adapterParameters: plan.adapterParameters, weighting: plan.weighting, directionalMask: plan.directionalMask, normalization: "sphere", boundary: "within-horizon", reference: null,
    projection: { type: "svd", centerAlignToOrigin: true, rank, fullAxes, estimableAxes: fullAxes.slice(0, rank), geometryPath: "set.rotation", variancePath: "set.variance" },
    populations: { fit: "endpoint-units", fitTokens: tokens, targetTokens: tokens, imputedStepCount: 0 },
    resources: { targetBaseline: plan.header.resourceEstimate, operationalAdmission: plan.operationalAdmission, counterContract: COUNTERS, observed }, diagnostics };
}

function assertClosureWorkAdmission(plan: OnaExecutionPlanV3): void {
  const n = plan.rows.length, u = plan.identityDictionary.units.length, c = plan.codeDictionary.codes.length, e = c * c, d = Math.min(3, e);
  const work = e ** 3 + 2 * u * e * e + 4 * u * c * c + 3 * d * c ** 3 + 12 * u * e + n * e;
  if (!Number.isSafeInteger(work) || work !== plan.operationalAdmission.closureWorkUnits || work > MAX_ESTIMATED_ROTATION_WORK_UNITS_V3) throw new TypeError("ONA scientific closure exceeds its admitted work budget.");
}

/** The source oracle and closure temporaries do not escape into provenance. */
function validateScientificClosure(plan: OnaExecutionPlanV3, runtime: OnaRuntimeEvidenceV3, retainedCells: number): readonly OnaCompilerDiagnosticV3[] {
  assertClosureWorkAdmission(plan);
  guardBindingAllocation(plan, retainedCells, plan.operationalAdmission.stages.validationScratchCells);
  const evidence = verifyOnaScientificEvidenceV3(plan);
  guardBindingAllocation(plan, retainedCells, plan.operationalAdmission.stages.scientificClosureCells);
  assertOnaScientificClosureV3({ set: runtime.set, runtimeUnitTokens: population(plan), sourceUnitTokens: evidence.unitTokens, sourceConnectionMatrix: evidence.connectionMatrix,
    auditEdgeValues: runtime.orderedAudit.edgeValues, auditUnitTokens: plan.runtimeSourceRowIndices.map((index) => plan.rows[index].unitToken) });
  return evidence.diagnostics;
}

export function onaScientificResultHashPayloadV3(result: Pick<BoundOnaResultV3, "configuration" | "executionProvenance" | "set" | "orderedAudit" | "orderedResponseNodeSummary" | "capabilityStatus">) {
  return { configuration: result.configuration, executionProvenance: result.executionProvenance, set: result.set, orderedAudit: result.orderedAudit, orderedResponseNodeSummary: result.orderedResponseNodeSummary, capabilityStatus: result.capabilityStatus };
}

/** Internal native result only; unknown external data enters validateBoundResultV3. */
export async function bindOnaResultV3(plan: OnaExecutionPlanV3, runtime: InternalOnaRunResultV3, observed: OnaRuntimeResourceObservationV3): Promise<BoundOnaResultV3> {
  const runtimeCells = countOnaScientificCellsV3(runtime.set, runtime.orderedAudit, runtime.orderedResponseNodeSummary);
  guardBindingAllocation(plan, runtimeCells, 0);
  const rank = validateRuntime(plan, runtime);
  validateOnaObservationV3(plan, observed);
  const diagnostics = validateScientificClosure(plan, runtime, runtimeCells);
  guardBindingAllocation(plan, runtimeCells + plan.operationalAdmission.compactScientificCells, 0);
  const mapped = mappedPayload(plan, runtime.set, runtime.orderedAudit, runtime.orderedResponseNodeSummary);
  const cells = countOnaScientificCellsV3(mapped.set, mapped.orderedAudit, mapped.orderedResponseNodeSummary);
  if (cells > plan.operationalAdmission.compactScientificCells) throw new TypeError("ONA compact output exceeds its enumerated scientific-cell envelope.");
  const payload = { configuration: plan.configuration, executionProvenance: provenance(plan, rank, observed, diagnostics), ...mapped, capabilityStatus: CAPABILITIES };
  guardBindingAllocation(plan, runtimeCells + 2 * cells, 0);
  const detached = captureOnaJsonV3(payload, { byteLimit: plan.operationalAdmission.totalExportBytes, structuralLimit: plan.operationalAdmission.totalPeakBytes }) as typeof payload;
  const scientificResultSha256 = await sha256CanonicalJsonV3(detached);
  return deepFreezeV3({ schemaVersion: 3, kind: "open-ena-bound-result", binding: { ...onaPlanBindingV3(plan), scientificResultSha256 }, ...detached, createdAt: new Date().toISOString() });
}

export async function validateBoundOnaResultV3(input: unknown, expectedPlan: unknown): Promise<BoundOnaResultV3> {
  const capturedPlan = captureOnaExecutionPlanInputV3(expectedPlan);
  const planRecord = snapshotPlainJsonRecordV3(capturedPlan, "ONA admitted plan");
  const resource = snapshotPlainJsonRecordV3(planRecord.operationalAdmission, "ONA admitted resources");
  const header = snapshotPlainJsonRecordV3(planRecord.header, "ONA admitted header");
  const n = Number(header.rowCount), dictionary = snapshotPlainJsonRecordV3(planRecord.codeDictionary, "ONA dictionary");
  const c = (dictionary.codes as unknown[]).length, e = c * c;
  const identities = snapshotPlainJsonRecordV3(planRecord.identityDictionary, "ONA admitted identities");
  const u = (identities.units as unknown[]).length;
  const axes = Array.from({ length: e }, (_, index) => `SVD${index + 1}`), display = axes.slice(0, 3);
  const edgeColumns = Array.from({ length: e }, (_, index) => `Connection ${index + 1}`);
  const config = snapshotPlainJsonRecordV3(planRecord.configuration, "ONA admitted configuration");
  const units = snapshotPlainJsonRecordV3(config.units, "ONA configured Units"), group = snapshotPlainJsonRecordV3(units.group, "ONA configured Group");
  const identityColumns = ["Unit", "ENA_UNIT", ...(group.type === "none" ? [] : ["Group"])];
  const captured = captureOnaJsonV3(input, { byteLimit: Number(resource.totalExportBytes), structuralLimit: Number(resource.totalPeakBytes), arrayBound(path) {
    if (path === "$.orderedAudit.edgeValues" || /^\$\.orderedAudit\.(responseRowIndices|previousResponseRowIndices|priorRowCounts|horizonOrdinals)$/u.test(path)) return { maximum: n, exact: true };
    if (/^\$\.orderedAudit\.edgeValues\[\d+\]$/u.test(path) || path === "$.set.rotation.rotationMatrix" || /^\$\.set\.rotation\.rotationMatrix\[\d+\]$/u.test(path)) return { maximum: e, exact: true };
    if (/^\$\.set\.(rawRows|rowConnectionCounts|rowWindowProvenance|metaData)$/u.test(path)) return { maximum: 0, exact: true };
    if (/^\$\.set\.(connectionCounts|connectionMatrix|lineWeights|pointsForProjection|points|centroids|unitLabels)$/u.test(path)) return { maximum: u, exact: true };
    if (/^\$\.set\.connectionMatrix\[\d+\]$/u.test(path) || /^\$\.set\.rotation\.(rotationColumns|eigenvalues|centerVector)$/u.test(path)) return { maximum: e, exact: true };
    if (path === "$.set.rotation.nodes") return { maximum: c, exact: true };
    if (path === "$.orderedResponseNodeSummary.groups") return { maximum: u };
    if (path === "$.orderedResponseNodeSummary.overallResponseCodeTotals" || /^\$\.orderedResponseNodeSummary\.groups\[\d+\]\.responseCodeTotals$/u.test(path)) return { maximum: c, exact: true };
    if (path === "$.set.codes" || path === "$.orderedAudit.codeOrder" || path === "$.orderedResponseNodeSummary.codeOrder") return { maximum: c, exact: true };
    return undefined;
  }, recordKeys(path) {
    if (path === "$") return ["schemaVersion", "kind", "binding", "configuration", "executionProvenance", "set", "orderedAudit", "orderedResponseNodeSummary", "capabilityStatus", "createdAt"];
    if (path === "$.set.rotation") return ["codes", "adjacencyKey", "rotationMatrix", "rotationColumns", "eigenvalues", "centerVector", "nodes"];
    if (path === "$.set.variance") return axes;
    if (/^\$\.set\.rotation\.nodes\[\d+\]$/u.test(path)) return ["code", ...display];
    if (/^\$\.set\.(connectionCounts|lineWeights|pointsForProjection)\[\d+\]$/u.test(path)) return [...identityColumns, ...edgeColumns];
    if (/^\$\.set\.points\[\d+\]$/u.test(path)) return [...identityColumns, ...display];
    if (/^\$\.set\.centroids\[\d+\]$/u.test(path)) return ["unit", ...display];
    if (/^\$\.orderedResponseNodeSummary\.groups\[\d+\]$/u.test(path)) return ["name", "unitCount", "responseCodeTotals"];
    return undefined;
  }, scalarKind(path) {
    if (/^\$\.set\.(connectionMatrix|rotation\.rotationMatrix)\[\d+\]\[\d+\]$/u.test(path)
      || /^\$\.set\.rotation\.(eigenvalues|centerVector)\[\d+\]$/u.test(path)
      || /^\$\.set\.(connectionCounts|lineWeights|pointsForProjection|points|centroids)\[\d+\]\.(Connection \d+|SVD\d+)$/u.test(path)
      || /^\$\.orderedAudit\.edgeValues\[\d+\]\[\d+\]$/u.test(path)) return "number";
    return undefined;
  } }) as BoundOnaResultV3;
  const plan = await validateOnaExecutionPlanV3(capturedPlan);
  keys(captured, ["schemaVersion", "kind", "binding", "configuration", "executionProvenance", "set", "orderedAudit", "orderedResponseNodeSummary", "capabilityStatus", "createdAt"], "envelope");
  if (captured.schemaVersion !== 3 || captured.kind !== "open-ena-bound-result" || typeof captured.createdAt !== "string" || !Number.isFinite(Date.parse(captured.createdAt))) throw new TypeError("ONA bound result envelope is invalid.");
  const { scientificResultSha256, ...binding } = captured.binding;
  same(binding, onaPlanBindingV3(plan), "binding");
  if (!/^[a-f0-9]{64}$/u.test(scientificResultSha256) || await sha256CanonicalJsonV3(onaScientificResultHashPayloadV3(captured)) !== scientificResultSha256) throw new TypeError("ONA scientific result hash differs from its complete content.");
  const restored = mappedPayload(plan, captured.set, captured.orderedAudit, captured.orderedResponseNodeSummary, true);
  const runtime = { configuration: plan.configuration, executionPlanHeader: plan.header, ...restored };
  const retainedCells = countOnaScientificCellsV3(captured.set, captured.orderedAudit, captured.orderedResponseNodeSummary)
    + countOnaScientificCellsV3(restored.set, restored.orderedAudit, restored.orderedResponseNodeSummary);
  const rank = validateRuntime(plan, runtime, retainedCells);
  validateOnaObservationV3(plan, captured.executionProvenance.resources.observed);
  const diagnostics = validateScientificClosure(plan, runtime, retainedCells);
  same(captured.configuration, plan.configuration, "configuration");
  same(captured.executionProvenance, provenance(plan, rank, captured.executionProvenance.resources.observed, diagnostics), "complete provenance");
  same(captured.capabilityStatus, CAPABILITIES, "descriptive capabilities");
  same(mappedPayload(plan, restored.set, restored.orderedAudit, restored.orderedResponseNodeSummary), { set: captured.set, orderedAudit: captured.orderedAudit, orderedResponseNodeSummary: captured.orderedResponseNodeSummary }, "reversible identity mapping");
  return deepFreezeV3(captured);
}
