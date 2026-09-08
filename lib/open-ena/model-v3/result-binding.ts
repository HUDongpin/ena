import type { ENASet, Row } from "jena-js";
import { adjacencyKey } from "jena-js/core";
import { assertStandardRotationOutputV3, fixedProjectionRankV3, standardRuntimeDiagnosticsV3, verifyStandardScientificEvidenceV3 } from "../analyze";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import type { ModelCapabilityStatusV3 } from "./compiler";
import type { ModelCapabilityV3, ModelDiagnosticV3 } from "./diagnostics";
import { captureExecutionPlanDiscriminatorV3, captureExecutionPlanInputV3, validateStandardExecutionPlanV3, isOnaExecutionPlanV3, type OpenEnaExecutionPlanV3, type StandardExecutionPlanV3 } from "./execution-plan";
import { buildMeansBindingV3, scheduleStandardExecutionRowsV3 } from "./standard-adapter";
import { MAX_ESTIMATED_EXPORT_BYTES_V3, MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3 } from "./resource-budget";
import type { BoundStandardResultV3 as BoundResultV3, BoundResultV3 as AnyBoundResultV3, BoundOnaResultV3, InternalStandardRunResultV3, ResultBindingV3, ResultExecutionProvenanceV3, RuntimeResourceObservationV3, SerializableEnaSetV3 } from "./types";
import { onaPlanBindingV3, onaScientificResultHashPayloadV3, validateBoundOnaResultV3 } from "./ona-result-binding";
import type { OnaExecutionPlanV3 } from "./ona-adapter";
import { assertStandardScientificClosureV3 } from "./standard-scientific-closure";
import { assertCombinedStandardResourcesV3, canonicalJsonByteLengthV3, captureStandardOperationalAdmissionV3 } from "./standard-closure-resource-budget";

const CAPABILITIES: readonly ModelCapabilityV3[] = ["build-model", "export-current-model", "export-reference", "group-inference", "trajectory-inference", "longitudinal-comparison", "ai-interpretation"];
const COUNTER_CONTRACT = { version: 1, numericCells: "peak-tracked-retained-scientific-slots", numericMetadata: "covered-by-structural-byte-policy", bytes: "conservative-structural-and-temporary-overlap-bound" } as const;
function same(left: unknown, right: unknown, label: string): void {
  if (canonicalJsonV3(left) !== canonicalJsonV3(right)) throw new TypeError(`Bound result ${label} does not match its execution plan or scientific content.`);
}
function integer(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a nonnegative safe integer.`);
}
function lookup(map: ReadonlyMap<string, string>, value: unknown, label: string): string {
  if (typeof value !== "string" || !map.has(value)) throw new TypeError(`Unknown ${label} identity token or label.`);
  return map.get(value)!;
}

function nonnegativeScientificValue(value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError("Raw Code/cooccurrence and normalized network values must be finite and nonnegative.");
}

function validateFunctionParameterShape(params: ENASet["functionParams"] | SerializableEnaSetV3["functionParams"]): void {
  same(Object.keys(params).sort(), ["includeMeta", "model", "weightBy", "window", "windowSizeBack", "windowSizeForward"], "function parameters shape");
  if (params.includeMeta !== true) throw new TypeError("Standard v3 function parameters require includeMeta=true.");
}

/** Separate validation work phase, not cumulative runtime work or an allocation.
 * E³ bounds the upper-triangle column dot products. The finite square shape is
 * checked first; only scalar scratch is retained, never a Gram matrix or refit.
 */
function validateOrthonormalBasis(plan: StandardExecutionPlanV3, set: ENASet): void {
  const width = set.codeColumns.length;
  const work = width * width * width;
  if (!Number.isSafeInteger(work) || work > Math.min(plan.header.resourceEstimate.estimatedRotationWorkUnits, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3)) throw new TypeError("Orthonormal basis validation exceeds admitted rotation work.");
  for (let left = 0; left < width; left += 1) for (let right = left; right < width; right += 1) {
    let product = 0;
    for (let row = 0; row < width; row += 1) product += set.rotation.rotationMatrix[row][left] * set.rotation.rotationMatrix[row][right];
    if (!Number.isFinite(product) || Math.abs(product - (left === right ? 1 : 0)) > 1e-8) throw new TypeError("Standard rotation columns must be orthonormal at tolerance 1e-8.");
  }
}

function planBinding(plan: StandardExecutionPlanV3): Omit<ResultBindingV3, "scientificResultSha256"> {
  const h = plan.header;
  return {
    datasetSha256: h.datasetSha256, datasetHashKind: h.datasetHashKind, headerSha256: h.headerSha256, rowCount: h.rowCount,
    configurationSha256: h.configurationSha256, executionPlanSha256: h.executionPlanSha256,
    runtimeVersion: h.runtimeVersion, algorithmBuildSha: h.algorithmBuildSha,
    validationContractVersion: h.validationContractVersion, runtimePolicyVersion: h.runtimePolicyVersion, executionContractVersion: h.executionContractVersion,
    referenceId: plan.reference?.referenceId ?? null, referenceContentSha256: plan.reference?.contentSha256 ?? null,
  };
}

function labels(plan: StandardExecutionPlanV3): ResultExecutionProvenanceV3["labels"] {
  const codes = plan.codeDictionary.codes.map((code, index) => ({
    runtimeToken: code.token, column: `Code ${index + 1}`, sourceColumn: code.sourceColumn,
    displayLabel: code.displayLabel, canonicalIdentity: code.canonicalIdentity,
  }));
  const adjacency = adjacencyKey(codes.map((code) => code.runtimeToken));
  return {
    unitColumn: "Unit", horizonColumn: "Horizon", groupColumn: "Group", codes,
    edges: adjacency.map((edge, index) => ({
      runtimeColumn: edge.name, column: `Connection ${index + 1}`,
      sourceCodeIdentity: codes[edge.sourceIndex].canonicalIdentity, targetCodeIdentity: codes[edge.targetIndex].canonicalIdentity,
    })),
  };
}

function staticProvenance(plan: StandardExecutionPlanV3) {
  const groups = new Map<string, string | null>();
  const allowedGroups = new Set(plan.identityDictionary.groups.map((entry) => entry.token));
  for (const row of plan.rows) {
    if (row.groupToken !== null && !allowedGroups.has(row.groupToken)) throw new TypeError("Unknown Group identity token.");
    if (groups.has(row.unitToken) && groups.get(row.unitToken) !== row.groupToken) throw new TypeError("Unit Group membership is not stable.");
    groups.set(row.unitToken, row.groupToken);
  }
  return {
    header: plan.header, sourceProofSha256: plan.sourceProof.sourceProofSha256,
    identityDictionary: plan.identityDictionary, codeDictionary: plan.codeDictionary, codeRepresentations: plan.codeRepresentations,
    unitGroups: plan.identityDictionary.units.map((entry) => ({ unitToken: entry.token, groupToken: groups.get(entry.token) ?? null })),
    labels: labels(plan), ordering: {
      requestedRowOrder: plan.configuration.window.type === "MovingStanzaWindow" ? plan.configuration.window.rowOrder : null,
      requestedHorizonOrder: plan.configuration.analysis.model.type === "EndPoint" ? null : plan.configuration.analysis.model.horizonOrder,
      resolvedRowOrder: plan.rowOrdering, resolvedHorizonOrder: plan.horizonOrdering,
      runtimeSourceRowIndices: scheduleStandardExecutionRowsV3(plan).map((row) => row.sourceRowIndex),
    },
    adapterParameters: plan.adapterParameters, weighting: plan.weighting,
    normalization: "sphere" as const, boundary: "within-horizon" as const, reference: plan.reference,
  };
}

function validateObservation(plan: StandardExecutionPlanV3, observed: RuntimeResourceObservationV3): void {
  same(Object.keys(observed).sort(), ["maximumBufferedRows", "numericCellsAllocated", "observationMethod", "peakBytesObservedOrBounded", "processedRows"], "resource observation shape");
  for (const field of ["processedRows", "maximumBufferedRows", "numericCellsAllocated", "peakBytesObservedOrBounded"] as const) integer(observed[field], `Observed ${field}`);
  if (observed.observationMethod !== "exact-counters-and-conservative-byte-bound" || observed.processedRows !== plan.rows.length) throw new TypeError("Observed resource method/processed population is invalid.");
  const estimate = plan.header.resourceEstimate;
  const limits = assertCombinedStandardResourcesV3(plan.operationalAdmission, plan.reference?.admission, plan.referenceSerializationAdmission, plan.planSerializationAdmission);
  // R is retained after eviction; one arriving row can coexist before eviction.
  if (observed.maximumBufferedRows > Math.min(plan.rows.length, estimate.estimatedRetainedWindowRows + 1)
    || observed.numericCellsAllocated > limits.estimatedNumericCells
    || observed.peakBytesObservedOrBounded > limits.estimatedPeakBytes) throw new TypeError("Observed runtime resources exceed the admitted estimate or hard limit.");
}

function populationPairs(plan: StandardExecutionPlanV3, runtime: InternalStandardRunResultV3): [string, string | null][] {
  const endpoint = plan.configuration.analysis.model.type === "EndPoint";
  const units = new Set(plan.identityDictionary.units.map((entry) => entry.token));
  const horizons = new Set(plan.identityDictionary.horizons.map((entry) => entry.token));
  const expected = new Set(plan.rows.map((row) => endpoint ? row.unitToken : canonicalJsonV3([row.unitToken, row.horizonToken])));
  const scheduled = scheduleStandardExecutionRowsV3(plan);
  let expectedOrder = [...new Set(scheduled.map((row) => endpoint ? row.unitToken : canonicalJsonV3([row.unitToken, row.horizonToken])))];
  if (plan.configuration.analysis.model.type === "AccumulatedTrajectory") {
    const unitOrder = [...new Set(scheduled.map((row) => row.unitToken))];
    const tokensByUnit = new Map<string, string[]>();
    for (const token of expectedOrder) {
      const unit = JSON.parse(token)[0] as string;
      const tokens = tokensByUnit.get(unit) ?? [];
      tokens.push(token); tokensByUnit.set(unit, tokens);
    }
    expectedOrder = unitOrder.flatMap((unit) => tokensByUnit.get(unit) ?? []);
  }
  same(runtime.populations.targetTokens, expectedOrder, "runtime population order");
  const seen = new Set<string>();
  const steps: Record<string, number> = {};
  const pairs = runtime.populations.targetTokens.map((token): [string, string | null] => {
    if (typeof token !== "string" || !expected.has(token) || seen.has(token)) throw new TypeError("Unknown or duplicate analytical population identity token.");
    seen.add(token);
    const pair: [string, string | null] = endpoint ? [token, null] : JSON.parse(token);
    if (!units.has(pair[0]) || (!endpoint && (!pair[1] || !horizons.has(pair[1])))) throw new TypeError("Unknown Unit/Horizon population identity token.");
    if (!endpoint) steps[pair[0]] = (steps[pair[0]] ?? 0) + 1;
    return pair;
  });
  if (seen.size !== expected.size || runtime.populations.imputedStepCount !== 0) throw new TypeError("Analytical population/step count differs from the plan.");
  same(runtime.populations.trajectoryStepCountByUnit, steps, "trajectory step counts");
  const reference = plan.reference;
  same(runtime.populations.fitTokens, reference ? [] : runtime.populations.targetTokens, "fit population");
  if (runtime.populations.fit !== (reference ? "reference-source-endpoint-units" : endpoint ? "endpoint-units" : "observed-unit-horizon-steps")) throw new TypeError("Invalid fit population family.");
  same(runtime.populations.sourceFit ?? null, reference?.artifact.fit ?? null, "Reference source population");
  return pairs;
}

function validateRuntime(plan: StandardExecutionPlanV3, runtime: InternalStandardRunResultV3): [string, string | null][] {
  same(runtime.configuration, plan.configuration, "configuration");
  same(runtime.executionPlanHeader, plan.header, "execution header");
  const set = runtime.set;
  const allowedSetFields = new Set(["modelType", "networkType", "codes", "units", "conversation", "codeColumns", "adjacencyKey", "rawRows", "rowConnectionCounts", "connectionCounts", "connectionMatrix", "metaData", "unitLabels", "functionParams", "trajectories", "lineWeights", "pointsForProjection", "points", "rotation", "variance", "centroids"]);
  if (Object.keys(set).some((field) => !allowedSetFields.has(field))) throw new TypeError("Unknown scientific set field.");
  const codes = plan.codeDictionary.codes.map((code) => code.token);
  const edges = adjacencyKey(codes);
  same(set.codes, codes, "Code basis"); same(set.rotation.codes, codes, "rotation Code basis");
  same(set.codeColumns, edges.map((edge) => edge.name), "edge columns");
  same(set.adjacencyKey, edges, "edge basis"); same(set.rotation.adjacencyKey, edges, "rotation edge basis");
  same(Object.keys(set.rotation).sort(), ["adjacencyKey", "centerVector", "codes", "eigenvalues", "nodes", "rotationColumns", "rotationMatrix"], "rotation fields");
  for (const node of set.rotation.nodes ?? []) same(Object.keys(node).sort(), ["code", ...set.rotation.rotationColumns.slice(0, 3)].sort(), "node coordinate fields");
  // Runtime and exported nodes follow the complete canonical Code basis order.
  same(set.rotation.nodes?.map((node) => node.code), codes, "node Code order and coverage");
  same(set.units, [plan.adapterParameters.unitTokenColumn], "Unit columns");
  same(set.conversation, [plan.adapterParameters.horizonTokenColumn], "Horizon columns");
  const unitTokens = new Set(plan.identityDictionary.units.map((entry) => entry.token));
  const horizonTokens = new Set(plan.identityDictionary.horizons.map((entry) => entry.token));
  const scientificColumns = new Set([...codes, ...edges.map((edge) => edge.name)]);
  for (const table of [set.rawRows, set.rowConnectionCounts]) for (const row of table) {
    for (const [key, value] of Object.entries(row)) {
      if (key === "ENA_UNIT" || key === "__open_ena_unit_token") {
        if (typeof value !== "string" || !unitTokens.has(value)) throw new TypeError("Unknown raw Unit identity token.");
      } else if (key === "__open_ena_horizon_token" || key === "TRAJ_UNIT") {
        if (typeof value !== "string" || !horizonTokens.has(value)) throw new TypeError("Unknown raw Horizon identity token.");
      } else {
        if (!scientificColumns.has(key)) throw new TypeError("Unknown raw scientific Code/edge field.");
        nonnegativeScientificValue(value);
      }
    }
  }
  if ((set.networkType ?? "standard") !== "standard" || set.modelType !== plan.configuration.analysis.model.type) throw new TypeError("Bound result has an invalid family/model network shape.");
  const window = plan.configuration.window;
  validateFunctionParameterShape(set.functionParams);
  const extent = (value: { kind: "infinity" } | { kind: "finite"; value: number }) => value.kind === "infinity" ? Infinity : value.value;
  if (set.functionParams.windowSizeBack !== (window.type === "Conversation" ? Infinity : extent(window.backward))
    || set.functionParams.windowSizeForward !== (window.type === "Conversation" ? 0 : extent(window.forward))
    || set.functionParams.window !== window.type || set.functionParams.model !== plan.configuration.analysis.model.type || set.functionParams.weightBy !== plan.weighting.runtime) throw new TypeError("Runtime window/weighting parameters differ from the plan.");
  assertStandardRotationOutputV3(set, plan.reference !== null);
  if (!plan.reference) validateOrthonormalBasis(plan, set);
  const pairs = populationPairs(plan, runtime);
  if (set.connectionCounts.length !== pairs.length || set.connectionMatrix.length !== pairs.length) throw new TypeError("Runtime table population count differs from the plan.");
  const expectedLabels = pairs.map(([unit, horizon]) => horizon === null ? unit : `${unit}::${horizon}`);
  same(set.unitLabels, expectedLabels, "analytical labels");
  for (const table of [set.connectionCounts, set.points, set.lineWeights, set.pointsForProjection, set.metaData]) {
    if (table.length !== pairs.length) throw new TypeError("Runtime table population count mismatch.");
    table.forEach((row, index) => {
      if (row.ENA_UNIT !== pairs[index][0] || row.__open_ena_unit_token !== pairs[index][0]) throw new TypeError("Runtime table Unit identity token mismatch.");
    });
  }
  set.centroids!.forEach((row, index) => { if (row.unit !== expectedLabels[index]) throw new TypeError("Centroid identity token mismatch."); });
  if (plan.configuration.analysis.model.type !== "EndPoint") {
    if (set.trajectories?.length !== pairs.length) throw new TypeError("Missing trajectory steps.");
    set.trajectories.forEach((row, index) => { if (row.__open_ena_horizon_token !== pairs[index][1] || row.__open_ena_unit_token !== pairs[index][0]) throw new TypeError("Trajectory Unit/Horizon identity token mismatch."); });
  } else if (set.trajectories !== undefined) throw new TypeError("Endpoint cannot contain trajectory tables.");
  set.connectionMatrix.forEach((row, index) => same(row, set.codeColumns.map((column) => set.connectionCounts[index][column]), "connection matrix/table values"));
  for (const row of set.connectionMatrix) for (const value of row) nonnegativeScientificValue(value);
  for (const table of [set.connectionCounts, set.lineWeights]) for (const row of table) {
    for (const [column, value] of Object.entries(row)) if (scientificColumns.has(column)) nonnegativeScientificValue(value);
  }
  const unitFields = ["__open_ena_unit_token", "ENA_UNIT"];
  const displayAxes = set.rotation.rotationColumns.slice(0, 3);
  const tableFields = (table: readonly Row[], fields: readonly string[], role: string) => {
    for (const row of table) same(Object.keys(row).sort(), [...fields].sort(), `${role} fields`);
  };
  tableFields(set.rawRows, [...unitFields, "__open_ena_horizon_token", ...codes], "raw source");
  tableFields(set.rowConnectionCounts, [...unitFields, "__open_ena_horizon_token", ...codes, ...set.codeColumns], "raw cooccurrence");
  for (const [role, table] of [["counts", set.connectionCounts], ["line weights", set.lineWeights], ["projection inputs", set.pointsForProjection]] as const) tableFields(table, [...unitFields, ...set.codeColumns], role);
  tableFields(set.points, [...unitFields, ...displayAxes], "points");
  tableFields(set.metaData, unitFields, "metadata");
  tableFields(set.centroids!, ["unit", ...displayAxes], "centroids");
  if (set.trajectories) tableFields(set.trajectories, [...unitFields, "__open_ena_horizon_token"], "trajectory");
  const p = runtime.projection;
  same(Object.keys(p).sort(), ["centerAlignToOrigin", "centerVector", "estimableAxes", "fullAxes", "rank", "runtimeFirstAxis", "type", "variance", ...(plan.reference ? ["targetProjectionRank"] : [])].sort(), "projection fields");
  same(Object.keys(runtime.populations).sort(), ["fit", "fitTokens", "targetTokens", "trajectoryStepCountByUnit", "imputedStepCount", ...(plan.reference ? ["sourceFit"] : [])].sort(), "population fields");
  same(runtime.meansBinding, plan.configuration.analysis.rotation.type === "means" ? buildMeansBindingV3(plan) : null, "Means membership");
  integer(p.rank, "Projection rank");
  if (p.rank > Math.min(set.codeColumns.length, Math.max(0, pairs.length - 1)) || p.type !== plan.configuration.analysis.rotation.type || (!plan.reference && p.rank === 0)) throw new TypeError("Invalid projection family/rank.");
  const configuredRotation = plan.configuration.analysis.rotation;
  if (p.centerAlignToOrigin !== (configuredRotation.type === "reference" ? plan.reference!.artifact.fit.centerAlignToOrigin : configuredRotation.centerAlignToOrigin)
    || p.runtimeFirstAxis !== set.rotation.rotationColumns[0]) throw new TypeError("Runtime center/first-axis policy mismatch.");
  same(p.fullAxes, set.rotation.rotationColumns, "full axes"); same(p.centerVector, set.rotation.centerVector, "center");
  same(p.variance, p.fullAxes.map((axis) => set.variance[axis]), "full variance");
  if (new Set(p.estimableAxes).size !== p.estimableAxes.length || p.estimableAxes.some((axis) => !p.fullAxes.includes(axis))) throw new TypeError("Estimable axes are not a unique subset of the full basis.");
  if (plan.reference) {
    same(set.rotation, plan.reference.rotationSet, "fixed Reference geometry");
    same(p.estimableAxes, plan.reference.artifact.fit.estimableAxes, "Reference estimable axes");
    if (p.targetProjectionRank !== p.rank) throw new TypeError("Reference target projection rank mismatch.");
  } else if (p.type === "svd") {
    const eigenvalues = set.rotation.eigenvalues;
    const width = set.codeColumns.length;
    if (eigenvalues.length !== width || eigenvalues[0] <= 0 || eigenvalues.some((value, index) => value < 0 || (index > 0 && value > eigenvalues[index - 1]))) throw new TypeError("SVD requires a complete nonnegative ordered eigenvalue vector.");
    const total = eigenvalues.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total) || p.variance.some((value, index) => Math.abs(value - eigenvalues[index] / total) > 1e-8)) throw new TypeError("SVD eigenvalues do not agree with full-basis variance.");
    // Same normalized-network rank threshold as the approved Reference source validator.
    const threshold = Math.max(Number.MIN_VALUE, eigenvalues[0] * 1e-12, (8 * Number.EPSILON * width) ** 2);
    if (p.rank !== eigenvalues.filter((value) => value > threshold).length) throw new TypeError("SVD rank does not agree with its eigenvalues under the numerical rank policy.");
    same(p.estimableAxes, p.fullAxes.slice(0, p.rank), "SVD estimable rank prefix");
  } else {
    if (set.rotation.eigenvalues.length !== 0 || p.fullAxes[0] !== "MR1" || p.variance[0] <= 0) throw new TypeError("Means requires empty SVD eigenvalues and positive MR1 variance.");
    const floor = Math.max(...p.variance) * 1e-12;
    same(p.estimableAxes, p.fullAxes.filter((_axis, index) => index === 0 || p.variance[index] > floor), "Means variance-supported axes");
  }
  return pairs;
}

/** Field-specific restoration. Literal user strings are never searched/replaced. */
function transformSet(plan: StandardExecutionPlanV3, input: ENASet | SerializableEnaSetV3, pairs: [string, string | null][], reverse = false): ENASet | SerializableEnaSetV3 {
  validateFunctionParameterShape(input.functionParams);
  const labelMap = labels(plan);
  const pairsMap = (entries: readonly [string, string][]) => new Map(entries.map(([a, b]) => reverse ? [b, a] : [a, b]));
  const units = pairsMap(plan.identityDictionary.units.map((entry) => [entry.token, entry.displayLabel]));
  const horizons = pairsMap(plan.identityDictionary.horizons.map((entry) => [entry.token, entry.displayLabel]));
  const codes = pairsMap(labelMap.codes.map((entry) => [entry.runtimeToken, entry.column]));
  const columns = pairsMap([
    ["__open_ena_unit_token", "Unit"], ["__open_ena_horizon_token", "Horizon"],
    ...labelMap.codes.map((entry): [string, string] => [entry.runtimeToken, entry.column]),
    ...labelMap.edges.map((entry): [string, string] => [entry.runtimeColumn, entry.column]),
  ]);
  const sourceUnit = reverse ? "Unit" : "__open_ena_unit_token";
  const sourceHorizon = reverse ? "Horizon" : "__open_ena_horizon_token";
  const axes = input.rotation.rotationColumns;
  const allowed = new Set([...columns.keys(), "ENA_UNIT", "TRAJ_UNIT", "unit", ...axes]);
  const unitDisplay = new Map(plan.identityDictionary.units.map((entry) => [entry.token, entry.displayLabel]));
  const horizonDisplay = new Map(plan.identityDictionary.horizons.map((entry) => [entry.token, entry.displayLabel]));
  const groupDisplay = new Map(plan.identityDictionary.groups.map((entry) => [entry.token, entry.displayLabel]));
  const groups = new Map(plan.rows.map((entry) => [entry.unitToken, entry.groupToken]));
  function row(row: Row, index?: number, centroid = false, trajectory = false): Row {
    const output: Row = {};
    for (const [key, value] of Object.entries(row)) {
      if (reverse && key === "Group" && index !== undefined) continue;
      if (reverse && key === "Horizon" && index !== undefined && pairs[index][1] !== null && !trajectory) continue;
      if (!allowed.has(key)) throw new TypeError("Unknown runtime/exported table column token.");
      const mapped = columns.get(key) ?? key;
      if (Object.hasOwn(output, mapped)) throw new TypeError("Restored table column collision.");
      if (key === "unit" && centroid && index !== undefined) {
        const [unit, horizon] = pairs[index];
        output[mapped] = reverse ? horizon === null ? unit : `${unit}::${horizon}` : unitDisplay.get(unit)!;
      } else if (key === sourceUnit || key === "ENA_UNIT") output[mapped] = lookup(units, value, "Unit");
      else if (key === sourceHorizon || key === "TRAJ_UNIT") output[mapped] = lookup(horizons, value, "Horizon");
      else {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Scientific table coordinates/Code values must be finite numbers.");
        output[mapped] = value;
      }
    }
    if (!reverse && index !== undefined && pairs[index][1] !== null) output.Horizon = horizonDisplay.get(pairs[index][1]!)!;
    if (!reverse && index !== undefined) {
      const group = groups.get(pairs[index][0]);
      if (group !== null && group !== undefined) output.Group = lookup(groupDisplay, group, "Group");
    }
    return output;
  }
  const edgeMap = pairsMap(labelMap.edges.map((entry) => [entry.runtimeColumn, entry.column]));
  const adjacency = input.adjacencyKey.map((edge) => ({ ...edge, source: lookup(codes, edge.source, "Code"), target: lookup(codes, edge.target, "Code"), name: lookup(edgeMap, edge.name, "edge") }));
  const serializeExtent = (value: number | "Infinity") => reverse ? value === "Infinity" ? Infinity : value : value === Infinity ? "Infinity" as const : value;
  const output = {
    ...input,
    codes: input.codes.map((code) => lookup(codes, code, "Code")), units: [reverse ? "__open_ena_unit_token" : "Unit"], conversation: [reverse ? "__open_ena_horizon_token" : "Horizon"],
    codeColumns: input.codeColumns.map((column) => lookup(edgeMap, column, "edge")), adjacencyKey: adjacency,
    rawRows: input.rawRows.map((entry) => row(entry)), rowConnectionCounts: input.rowConnectionCounts.map((entry) => row(entry)),
    connectionCounts: input.connectionCounts.map((entry, index) => row(entry, index)),
    points: input.points.map((entry, index) => row(entry, index)), lineWeights: input.lineWeights.map((entry, index) => row(entry, index)),
    pointsForProjection: input.pointsForProjection.map((entry, index) => row(entry, index)), metaData: input.metaData.map((entry, index) => row(entry, index)),
    centroids: input.centroids?.map((entry, index) => row(entry, index, true)),
    ...(input.trajectories ? { trajectories: input.trajectories.map((entry, index) => row(entry, index, false, true)) } : {}),
    unitLabels: pairs.map(([unit, horizon]) => reverse ? horizon === null ? unit : `${unit}::${horizon}` : horizon === null ? unitDisplay.get(unit)! : canonicalJsonV3([unitDisplay.get(unit), horizonDisplay.get(horizon)])),
    functionParams: {
      model: input.functionParams.model, weightBy: input.functionParams.weightBy, window: input.functionParams.window, includeMeta: input.functionParams.includeMeta,
      windowSizeBack: serializeExtent(input.functionParams.windowSizeBack), windowSizeForward: serializeExtent(input.functionParams.windowSizeForward),
    },
    rotation: { ...input.rotation, codes: input.rotation.codes.map((code) => lookup(codes, code, "Code")), adjacencyKey: adjacency,
      nodes: input.rotation.nodes?.map((entry) => ({ ...Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "code")), code: lookup(codes, entry.code, "Code node") })),
    },
  };
  return output as ENASet | SerializableEnaSetV3;
}

function mergedDiagnostics(plan: StandardExecutionPlanV3, compiler: readonly ModelDiagnosticV3[], runtime: readonly ModelDiagnosticV3[]): ModelDiagnosticV3[] {
  const source = plan.reference ? compiler.filter((entry) => entry.id !== "STANDARD_REFERENCE_TARGET_DEGENERATE") : compiler;
  const map = new Map<string, ModelDiagnosticV3>();
  for (const entry of [...source, ...runtime]) {
    if (!entry || typeof entry.id !== "string" || !Array.isArray(entry.blocks) || entry.blocks.some((block) => !CAPABILITIES.includes(block))) throw new TypeError("Invalid runtime diagnostic/capability.");
    map.set(canonicalJsonV3(entry), entry);
  }
  return [...map.values()];
}
function capabilities(plan: StandardExecutionPlanV3, diagnostics: readonly ModelDiagnosticV3[]): ModelCapabilityStatusV3 {
  const blocked = new Set(diagnostics.flatMap((entry) => entry.blocks));
  if (plan.configuration.units.group.type === "none") blocked.add("group-inference");
  if (plan.configuration.analysis.model.type === "EndPoint") { blocked.add("trajectory-inference"); blocked.add("longitudinal-comparison"); }
  else blocked.add("export-reference");
  if (plan.reference) blocked.add("export-reference");
  return Object.fromEntries(CAPABILITIES.map((capability) => [capability, blocked.has(capability) ? "blocked" : "available"])) as ModelCapabilityStatusV3;
}

/** Unique retained-container counting. Shared arrays/row objects count once;
 * equal-valued independent copies count separately. Window/index/rank metadata
 * is excluded. Both Boolean and numeric source representation remain explicit.
 */
function scientificSlotsV3(sets: readonly (ENASet | SerializableEnaSetV3)[], projections: readonly InternalStandardRunResultV3["projection"][], references: readonly StandardExecutionPlanV3["reference"][], sourceFitVariances: readonly (readonly number[] | undefined)[] = [], excludeReferenceGeometry = false): number {
  const seen = new WeakSet<object>();
  function count(value: unknown): number {
    if (typeof value === "number") return 1;
    if (value === null || typeof value !== "object" || seen.has(value)) return 0;
    seen.add(value);
    return Object.values(value).reduce<number>((sum, entry) => sum + count(entry), 0);
  }
  let cells = 0;
  for (const set of sets) cells += count([
    set.rawRows, set.rowConnectionCounts, set.connectionCounts, set.connectionMatrix,
    set.lineWeights, set.pointsForProjection, set.points, set.centroids,
    ...(excludeReferenceGeometry ? [] : [set.rotation.rotationMatrix, set.rotation.centerVector, set.rotation.eigenvalues, set.rotation.nodes]), set.variance,
  ]);
  for (const projection of projections) cells += count([...(excludeReferenceGeometry ? [] : [projection.centerVector]), projection.variance]);
  for (const reference of references) if (reference && !excludeReferenceGeometry) cells += count([
    reference.artifact.geometry.centerVector, reference.artifact.geometry.rotationMatrix, reference.artifact.geometry.eigenvalues,
    reference.artifact.geometry.nodes.map((node) => node.coordinates), reference.artifact.fit.variance,
    reference.rotationSet.centerVector, reference.rotationSet.rotationMatrix, reference.rotationSet.eigenvalues, reference.rotationSet.nodes,
  ]);
  if (!excludeReferenceGeometry) for (const variance of sourceFitVariances) cells += count(variance);
  return cells;
}

function validateFixedProjectionRankV3(plan: StandardExecutionPlanV3, admittedPlan: StandardExecutionPlanV3, bound: BoundResultV3, runtime: InternalStandardRunResultV3): void {
  if (!plan.reference) return;
  const seen = new WeakSet<object>();
  let codeSlots = 0;
  for (const heldPlan of [plan, admittedPlan]) {
    for (const row of heldPlan.rows) if (!seen.has(row.codeValues)) {
      seen.add(row.codeValues); codeSlots += Object.values(row.codeValues).length;
    }
    for (const row of heldPlan.sourceProof.rows) if (!seen.has(row.values)) {
      seen.add(row.values);
      codeSlots += heldPlan.codeDictionary.codes.filter((code) => typeof row.values[code.sourceColumn] === "number").length;
    }
  }
  const p = bound.executionProvenance;
  const sets = [bound.set, runtime.set];
  const heldReferences = [admittedPlan.reference, plan.reference, p.reference];
  const slots = codeSlots + scientificSlotsV3(sets, [p.projection], heldReferences, [p.populations.sourceFit?.variance]);
  const e = runtime.set.codeColumns.length;
  const t = runtime.set.pointsForProjection.length;
  // Existing fixedProjectionRankV3 retains full projected and centered T×E
  // matrices while its existing covariance/Jacobi diagnostic uses3E² scratch.
  const scratch = 2 * t * e + 3 * e * e + 8 * e;
  const estimate = plan.header.resourceEstimate;
  const admission = plan.reference.admission;
  const targetSlots = codeSlots + scientificSlotsV3(sets, [p.projection], [], [], true);
  // All fixed Reference representations are already charged in the additive
  // ledger. Do not charge them again as target bytes in this conservative bound.
  const bytes = 8 * (targetSlots + scratch) + estimate.estimatedStructuralBytes + estimate.estimatedWorkerMaterializationBytes + admission.incrementalPeakBytes;
  const limits = assertCombinedStandardResourcesV3(plan.operationalAdmission, admission, plan.referenceSerializationAdmission, plan.planSerializationAdmission);
  if (![slots, scratch, bytes].every(Number.isSafeInteger)
    || slots + scratch > limits.estimatedNumericCells
    || bytes > limits.estimatedPeakBytes) throw new TypeError("Fixed projection rank validation exceeds admitted allocation resources.");
  const actualRank = fixedProjectionRankV3(runtime.set);
  if (p.projection.rank !== actualRank || p.projection.targetProjectionRank !== actualRank) throw new TypeError("Declared Reference target rank disagrees with the actual full fixed projection.");
}

export function scientificResultHashPayloadV3(result: Pick<BoundResultV3, "configuration" | "executionProvenance" | "set" | "capabilityStatus"> | BoundOnaResultV3) {
  if ("orderedAudit" in result) return onaScientificResultHashPayloadV3(result);
  return { configuration: result.configuration, executionProvenance: result.executionProvenance, set: result.set, capabilityStatus: result.capabilityStatus };
}

/** Admit dimensions before own-key traversal, then detach all values before hashing yields. */
function captureBoundResultV3(input: unknown, expectedPlan: unknown, internal?: { rawCells: number; originalScientificCells: number }): BoundResultV3 {
  const plan = snapshotPlainJsonRecordV3(expectedPlan, "Expected plan");
  const header = snapshotPlainJsonRecordV3(plan.header, "Expected plan header");
  const estimate = snapshotPlainJsonRecordV3(header.resourceEstimate, "Expected resource estimate");
  for (const key of ["rows", "codes", "units", "horizons", "trajectorySteps", "adjacencyDimensions", "estimatedNumericCells", "estimatedPeakBytes", "estimatedStateCount"]) integer(estimate[key], `Admission ${key}`);
  const n = Math.min(100_000, Number(estimate.rows));
  const t = Math.min(100_000, Number(estimate.trajectorySteps));
  const c = Math.min(10_000, Number(estimate.codes));
  const e = Math.min(25_000_000, Number(estimate.adjacencyDimensions));
  const units = Math.min(100_000, Number(estimate.units));
  const horizons = Math.min(100_000, Number(estimate.horizons));
  let referenceCells = 0;
  let referenceBytes = 0;
  if (plan.reference !== null) {
    const ref = snapshotPlainJsonRecordV3(plan.reference, "Reference admission");
    const admission = snapshotPlainJsonRecordV3(ref.admission, "Reference admission ledger");
    integer(admission.incrementalNumericCells, "Reference admission cells"); integer(admission.incrementalPeakBytes, "Reference admission bytes");
    referenceCells = admission.incrementalNumericCells; referenceBytes = admission.incrementalPeakBytes;
  }
  const operational = captureStandardOperationalAdmissionV3(plan.operationalAdmission);
  const numericLimit = Math.min(MAX_ESTIMATED_NUMERIC_CELLS_V3, operational.totalNumericCells + referenceCells);
  const supplemental = plan.referenceSerializationAdmission as StandardExecutionPlanV3["referenceSerializationAdmission"];
  const planSerialization = plan.planSerializationAdmission as StandardExecutionPlanV3["planSerializationAdmission"];
  const byteLimit = Math.min(MAX_ESTIMATED_PEAK_BYTES_V3, operational.totalPeakBytes + referenceBytes + (supplemental?.incrementalPeakBytes ?? 0) + planSerialization.serializationPeakBytes);
  // Numeric arrays plus the already admitted structural/identity bytes bound
  // total complexity without imposing a new identity-field-count policy.
  const scalarLimit = numericLimit + Math.floor(byteLimit / 8);
  const proof = snapshotPlainJsonRecordV3(plan.sourceProof, "Captured source proof");
  const headerCount = (proof.headers as readonly unknown[]).length;
  const maxPolicyArray = (value: unknown): number => {
    if (!value || typeof value !== "object") return 0;
    let maximum = Array.isArray(value) ? value.length : 0;
    for (const child of Object.values(value)) maximum = Math.max(maximum, maxPolicyArray(child));
    return maximum;
  };
  const policyArrayBound = maxPolicyArray(plan.configuration);
  let scalars = 0;
  let bytes = 0;
  const encoder = new TextEncoder();
  const active = new WeakSet<object>();
  const originalScientificContainers = new WeakSet<object>();
  function fixedReferenceValue(actual: unknown, expected: unknown, scientific = false, countable = true): unknown {
    if (expected === null || typeof expected !== "object") {
      if (!Object.is(actual, expected)) throw new TypeError("Runtime fixed Reference geometry differs from the captured plan.");
      if (internal && scientific && countable && typeof expected === "number") internal.originalScientificCells += 1;
      return expected;
    }
    if (scientific && actual !== null && typeof actual === "object") {
      countable &&= !originalScientificContainers.has(actual);
      originalScientificContainers.add(actual);
    }
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || Object.getOwnPropertyDescriptor(actual, "length")?.value !== expected.length) throw new TypeError("Runtime fixed Reference geometry has invalid dimensions.");
      for (let index = 0; index < expected.length; index += 1) {
        const entry = Object.getOwnPropertyDescriptor(actual, String(index));
        if (!entry || !entry.enumerable || !("value" in entry)) throw new TypeError("Runtime fixed Reference geometry requires dense data entries.");
        fixedReferenceValue(entry.value, expected[index], scientific, countable);
      }
      if (Reflect.ownKeys(actual).length !== expected.length + 1 || Object.getOwnPropertyDescriptor(actual, "length")?.value !== expected.length) throw new TypeError("Runtime fixed Reference geometry changed during capture.");
    } else {
      const record = snapshotPlainJsonRecordV3(actual, "Runtime fixed Reference geometry");
      const keys = Object.keys(expected);
      if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) throw new TypeError("Runtime fixed Reference geometry has unexpected fields.");
      for (const key of keys) fixedReferenceValue(record[key], (expected as Record<string, unknown>)[key], scientific || ["rotationMatrix", "centerVector", "eigenvalues", "nodes", "variance"].includes(key), countable);
    }
    return expected;
  }
  function captureInternalRaw(value: unknown, path: string): [] {
    if (!Array.isArray(value)) throw new TypeError("Internal raw tables must be arrays.");
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    integer(length, "Internal raw table length");
    // Conversation rowConnectionCounts is a partition table, not necessarilyN.
    if (length > n) throw new TypeError("Internal raw table exceeds admitted source/partition cardinality.");
    if (Object.getOwnPropertyDescriptor(value, "length")?.value !== length) throw new TypeError("Internal raw table length changed before capture.");
    const dictionary = plan.codeDictionary as StandardExecutionPlanV3["codeDictionary"];
    const identities = plan.identityDictionary as StandardExecutionPlanV3["identityDictionary"];
    const codes = dictionary.codes.map((entry) => entry.token);
    const edges = adjacencyKey(codes).map((entry) => entry.name);
    const scientific = new Set(path.endsWith(".rawRows") ? codes : [...codes, ...edges]);
    const unitTokens = new Set(identities.units.map((entry) => entry.token)), horizonTokens = new Set(identities.horizons.map((entry) => entry.token));
    const expected = ["__open_ena_unit_token", "ENA_UNIT", "__open_ena_horizon_token", ...scientific].sort();
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError("Internal raw table requires dense data entries.");
      const row = snapshotPlainJsonRecordV3(descriptor.value, "Internal raw row");
      for (const [key, cell] of Object.entries(row)) {
        if (scientific.has(key)) { nonnegativeScientificValue(cell); internal!.rawCells += 1; }
        else if (key === "__open_ena_unit_token" || key === "ENA_UNIT") { if (typeof cell !== "string" || !unitTokens.has(cell)) throw new TypeError("Unknown raw Unit token."); }
        else if (key === "__open_ena_horizon_token") { if (typeof cell !== "string" || !horizonTokens.has(cell)) throw new TypeError("Unknown raw Horizon token."); }
        else throw new TypeError("Unknown internal raw scientific fields.");
      }
      same(Object.keys(row).sort(), expected, "internal raw table fields");
      if (internal!.rawCells > numericLimit) throw new TypeError("Internal raw input exceeds admitted retained numeric resources.");
    }
    if (Reflect.ownKeys(value).length !== length + 1 || Object.getOwnPropertyDescriptor(value, "length")?.value !== length) throw new TypeError("Internal raw table changed or has extra properties.");
    return [];
  }
  function capture(value: unknown, path: string, depth: number, scientific = false, originalCountable = true): unknown {
    if (depth > 64 || ++scalars > scalarLimit) throw new TypeError("Bound result exceeds resource admission complexity.");
    const modelOnlyTable = /^result\.set\.(rawRows|rowConnectionCounts)$/u.test(path);
    if (modelOnlyTable && internal) return captureInternalRaw(value, path);
    if (internal && plan.reference !== null) {
      const reference = plan.reference as StandardExecutionPlanV3["reference"];
      if (path === "result.set.rotation") {
        fixedReferenceValue(value, reference!.rotationSet);
        // The owned Reference arrays replace, rather than copy, the validated
        // caller geometry. Retained original geometry is charged separately.
        return reference!.rotationSet;
      }
      if (path === "result.projection.centerVector") { fixedReferenceValue(value, reference!.rotationSet.centerVector, true); return reference!.rotationSet.centerVector; }
      if (path === "result.populations.sourceFit") { fixedReferenceValue(value, reference!.artifact.fit); return reference!.artifact.fit; }
    }
    if (modelOnlyTable && !Array.isArray(value)) throw new TypeError("Canonical model-only raw tables must be empty arrays.");
    scientific ||= /^result\.set\.(connectionCounts|connectionMatrix|lineWeights|pointsForProjection|points|centroids|variance)$|^result\.set\.rotation\.(rotationMatrix|centerVector|eigenvalues|nodes)$|^result\.projection\.(centerVector|variance)$|^result\.populations\.sourceFit\.variance$/u.test(path);
    if (internal && scientific && value !== null && typeof value === "object") {
      originalCountable &&= !originalScientificContainers.has(value);
      originalScientificContainers.add(value);
    }
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
      if (internal && value === Infinity && /^result\.set\.functionParams\.windowSize(Back|Forward)$/u.test(path)) return "Infinity";
      if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Bound result numeric values must be finite.");
      if (internal && scientific && originalCountable && typeof value === "number") {
        internal.originalScientificCells += 1;
        if (internal.rawCells + internal.originalScientificCells + operational.stages.sourceCaptureCells + operational.compactScientificCells > numericLimit) throw new TypeError("Binding input capture exceeds retained numeric admission.");
      }
      if (typeof value === "string" && value.length > byteLimit - bytes) throw new TypeError("Bound result exceeds resource admission bytes.");
      bytes += encoder.encode(JSON.stringify(value)).byteLength;
      if (bytes > byteLimit) throw new TypeError("Bound result exceeds resource admission bytes.");
      return value;
    }
    if (typeof value !== "object" || active.has(value)) throw new TypeError("Bound result must contain only acyclic JSON values.");
    active.add(value);
    try {
      if (Array.isArray(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, "length");
        const length = descriptor && "value" in descriptor ? descriptor.value : undefined;
        integer(length, "Bound result array admission length");
        // Canonical bound exports never retain optional internal raw tables.
        // Reject their population before inspecting entries, keys or values.
        if (modelOnlyTable && length !== 0) throw new TypeError("Canonical model-only raw tables must be empty arrays.");
        let limit = Math.min(scalarLimit, Math.max(n, t, e, c, headerCount, units, horizons, policyArrayBound));
        if (/^result\.set\.(connectionCounts|connectionMatrix|lineWeights|pointsForProjection|points|metaData|centroids|trajectories)$/u.test(path)) limit = t;
        else if (modelOnlyTable) limit = 0;
        else if (/\.connectionMatrix\[\d+\]$|\.rotationMatrix\[\d+\]$/u.test(path)) limit = e;
        else if (/\.rotationMatrix$|\.adjacencyKey$|\.rotationColumns$|\.codeColumns$|\.fullAxes$|\.estimableAxes$|\.centerVector$|\.eigenvalues$/u.test(path)) limit = e;
        else if (/\.rotation\.nodes$|\.rotation\.codes$|\.set\.codes$|\.codeDictionary\.codes$/u.test(path)) limit = c;
        else if (/\.identityDictionary\.(units|groups)$|\.unitGroups$/u.test(path)) limit = units;
        else if (/\.identityDictionary\.horizons$/u.test(path)) limit = horizons;
        if (length > limit || scalars + length > scalarLimit) throw new TypeError(`Bound result ${path} exceeds admitted array cardinality.`);
        // Check accepted length BEFORE enumerating keys or inspecting entries.
        const acceptedLength = Object.getOwnPropertyDescriptor(value, "length");
        if (!acceptedLength || !("value" in acceptedLength) || acceptedLength.value !== length) throw new TypeError("Bound result array length changed before admission capture.");
        const entries: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const entry = Object.getOwnPropertyDescriptor(value, String(index));
          if (!entry || !entry.enumerable || !("value" in entry)) throw new TypeError("Bound result admission requires dense data entries.");
          entries.push(entry.value);
        }
        const keys = Reflect.ownKeys(value);
        if (keys.length !== length + 1 || keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length))) throw new TypeError("Bound result admission array has extra properties.");
        const result = entries.map((entry, index) => capture(entry, `${path}[${index}]`, depth + 1, scientific, originalCountable));
        const again = Object.getOwnPropertyDescriptor(value, "length");
        if (!again || !("value" in again) || again.value !== length || entries.some((entry, index) => !Object.is(Object.getOwnPropertyDescriptor(value, String(index))?.value, entry))) throw new TypeError("Bound result changed during descriptor admission capture.");
        return result;
      }
      const record = snapshotPlainJsonRecordV3(value, `Admission ${path}`);
      if (Object.keys(record).length > scalarLimit) throw new TypeError("Bound result exceeds admitted object cardinality.");
      bytes += Object.keys(record).reduce((sum, key) => sum + encoder.encode(JSON.stringify(key)).byteLength + 2, 2);
      if (bytes > byteLimit) throw new TypeError("Bound result exceeds resource admission bytes.");
      const captured = Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, capture(entry, `${path}.${key}`, depth + 1, scientific, originalCountable)]));
      const again = snapshotPlainJsonRecordV3(value, `Admission ${path}`);
      if (Object.keys(again).length !== Object.keys(record).length || Object.keys(record).some((key) => !Object.is(record[key], again[key]))) throw new TypeError("Bound result changed during descriptor admission capture.");
      return captured;
    } finally { active.delete(value); }
  }
  return capture(input, "result", 0) as BoundResultV3;
}

type OwnedStandardReadinessV3 = Awaited<ReturnType<typeof verifyStandardScientificEvidenceV3>>;
function captureRuntimeV3(plan: StandardExecutionPlanV3, runtimeInput: InternalStandardRunResultV3, observedInput: RuntimeResourceObservationV3, providedDiagnostics: readonly ModelDiagnosticV3[] | null) {
  const counts = { rawCells: 0, originalScientificCells: 0 };
  const root = snapshotPlainJsonRecordV3(runtimeInput, "Internal Standard runtime");
  const captured = captureBoundResultV3({ ...root, observedInput, providedDiagnostics }, plan, counts) as unknown as InternalStandardRunResultV3 & { observedInput: RuntimeResourceObservationV3; providedDiagnostics: readonly ModelDiagnosticV3[] | null };
  for (const field of ["windowSizeBack", "windowSizeForward"] as const) if ((captured.set.functionParams[field] as unknown) === "Infinity") captured.set.functionParams[field] = Infinity;
  return { runtime: captured, observed: captured.observedInput, providedDiagnostics: captured.providedDiagnostics, originalCells: counts.rawCells + counts.originalScientificCells };
}

function guardScientificClosureV3(plan: StandardExecutionPlanV3, heldCells: number): void {
  const a = plan.operationalAdmission;
  const cells = a.stages.sourceCaptureCells + heldCells + a.stages.sourceOracleCells + a.stages.algebraCells + a.stages.rankDiagnosticCells;
  const limit = assertCombinedStandardResourcesV3(a, plan.reference?.admission, plan.referenceSerializationAdmission, plan.planSerializationAdmission);
  if (!Number.isSafeInteger(cells) || cells > limit.estimatedNumericCells) throw new TypeError("Standard scientific closure exceeds its pre-allocation numeric admission.");
}

async function prepareOwnedStandardBindingV3(capturedPlan: StandardExecutionPlanV3) {
  const plan = await validateStandardExecutionPlanV3(capturedPlan);
  guardScientificClosureV3(plan, 0);
  const readiness = await verifyStandardScientificEvidenceV3(plan);
  return { plan, readiness };
}

/** @internal The factory owns the real readiness source oracle. bind closes
 * over that private value, never this.compiled or a caller-supplied oracle.
 */
export async function prepareStandardResultBindingV3(input: StandardExecutionPlanV3) {
  const capturedPlan = captureExecutionPlanInputV3(input) as StandardExecutionPlanV3;
  const { plan, readiness } = await prepareOwnedStandardBindingV3(capturedPlan);
  return Object.freeze({ compiled: readiness.compiled, bind: async (runtime: InternalStandardRunResultV3, observed: RuntimeResourceObservationV3) => {
    const captured = captureRuntimeV3(plan, runtime, observed, null);
    return bindCapturedResultV3(plan, captured.runtime, captured.observed, readiness, captured.originalCells);
  } });
}

/** Both caller graphs are bounded and detached before this function first yields. */
export async function bindResultV3(inputPlan: StandardExecutionPlanV3, runtime: InternalStandardRunResultV3, observed: RuntimeResourceObservationV3, diagnostics: readonly ModelDiagnosticV3[]): Promise<BoundResultV3> {
  const capturedPlan = captureExecutionPlanInputV3(inputPlan) as StandardExecutionPlanV3;
  const captured = captureRuntimeV3(capturedPlan, runtime, observed, diagnostics);
  const { plan, readiness } = await prepareOwnedStandardBindingV3(capturedPlan);
  same(captured.providedDiagnostics, readiness.compiled.diagnostics, "compiler diagnostics");
  return bindCapturedResultV3(plan, captured.runtime, captured.observed, readiness, captured.originalCells);
}

async function bindCapturedResultV3(plan: StandardExecutionPlanV3, runtime: InternalStandardRunResultV3, observedResources: RuntimeResourceObservationV3, readiness: OwnedStandardReadinessV3, originalCells: number): Promise<BoundResultV3> {
  const binding = planBinding(plan);
  const pairs = validateRuntime(plan, runtime);
  same(runtime.diagnostics, standardRuntimeDiagnosticsV3(runtime.projection.type, runtime.projection.rank, runtime.meansBinding), "runtime diagnostics");
  validateObservation(plan, observedResources);
  const merged = mergedDiagnostics(plan, readiness.compiled.diagnostics, runtime.diagnostics);
  const planCells = plan.rows.reduce((sum, row) => sum + Object.values(row.codeValues).length, 0)
    + plan.sourceProof.rows.reduce((sum, row) => sum + plan.codeDictionary.codes.filter((code) => typeof row.values[code.sourceColumn] === "number").length, 0);
  const referenceAllowance = plan.reference?.admission.incrementalNumericCells ?? 0;
  const numericLimit = Math.min(MAX_ESTIMATED_NUMERIC_CELLS_V3, plan.operationalAdmission.totalNumericCells + referenceAllowance);
  const runtimeCells = scientificSlotsV3([runtime.set], [runtime.projection], [plan.reference]);
  guardScientificClosureV3(plan, runtimeCells + originalCells);
  if (plan.reference && runtime.projection.rank !== fixedProjectionRankV3(runtime.set)) throw new TypeError("Declared Reference target rank disagrees with the actual full fixed projection.");
  assertStandardScientificClosureV3(plan, runtime, pairs, readiness.evidence);
  // Bound v3 exposes model materialization. Synchronous scientific fixtures may
  // retain optional raw tables; their storage is counted but never copied into
  // unbudgeted per-row edge exports.
  const modelSet = { ...runtime.set, rawRows: [], rowConnectionCounts: [] };
  const guard = (cells: number) => {
    if (!Number.isSafeInteger(cells) || cells > numericLimit) throw new TypeError("Binding allocation exceeds the admitted numeric resource budget.");
  };
  // A transformed set cannot allocate more scientific slots than one complete
  // runtime set. Check its bound before making any new scientific row objects.
  guard(planCells + originalCells + runtimeCells + scientificSlotsV3([modelSet], [], []));
  const payload = {
    configuration: plan.configuration,
    executionProvenance: {
      ...staticProvenance(plan), projection: runtime.projection, populations: runtime.populations, meansBinding: runtime.meansBinding,
      resources: { targetBaseline: plan.header.resourceEstimate, operationalAdmission: plan.operationalAdmission, referenceAdmission: plan.reference?.admission ?? null, referenceSerializationAdmission: plan.referenceSerializationAdmission, planSerializationAdmission: plan.planSerializationAdmission, counterContract: COUNTER_CONTRACT, observed: observedResources },
      diagnostics: merged,
    },
    set: transformSet(plan, modelSet, pairs) as SerializableEnaSetV3,
    capabilityStatus: capabilities(plan, merged),
  };
  const transformedCells = scientificSlotsV3([runtime.set, payload.set], [runtime.projection], [plan.reference]);
  const detachedCopyCells = scientificSlotsV3([payload.set], [payload.executionProvenance.projection], [payload.executionProvenance.reference]) + (runtime.populations.sourceFit?.variance.length ?? 0);
  guard(planCells + originalCells + transformedCells + detachedCopyCells);
  const exportLimit = assertCombinedStandardResourcesV3(plan.operationalAdmission, plan.reference?.admission, plan.referenceSerializationAdmission, plan.planSerializationAdmission).estimatedExportBytes;
  canonicalJsonByteLengthV3(payload, exportLimit);
  // Captures and rejects all unsupported/nonfinite JSON values before the await.
  const serialized = canonicalJsonV3(payload);
  if (new TextEncoder().encode(serialized).byteLength > exportLimit) throw new TypeError("Complete scientific result exceeds admitted export bytes.");
  const detached = JSON.parse(serialized) as typeof payload;
  const boundPeak = planCells + originalCells + readiness.evidence.targetVectors.reduce((sum, row) => sum + row.length, 0) + scientificSlotsV3([runtime.set, payload.set, detached.set], [runtime.projection, detached.executionProvenance.projection], [plan.reference, detached.executionProvenance.reference], [runtime.populations.sourceFit?.variance, detached.executionProvenance.populations.sourceFit?.variance]);
  guard(boundPeak);
  const boundBytes = assertCombinedStandardResourcesV3(plan.operationalAdmission, plan.reference?.admission, plan.referenceSerializationAdmission, plan.planSerializationAdmission).estimatedPeakBytes;
  detached.executionProvenance.resources.observed = {
    ...observedResources,
    numericCellsAllocated: Math.max(observedResources.numericCellsAllocated, boundPeak),
    peakBytesObservedOrBounded: Math.max(observedResources.peakBytesObservedOrBounded, boundBytes),
  };
  validateObservation(plan, detached.executionProvenance.resources.observed);
  const scientificResultSha256 = await sha256CanonicalJsonV3(detached);
  return deepFreezeV3({ schemaVersion: 3, kind: "open-ena-bound-result", binding: { ...binding, scientificResultSha256 }, ...detached, createdAt: new Date().toISOString() });
}

/** Validate both currentness and the complete scientific content; never treats a hash as authentication. */
export async function validateBoundStandardResultV3(input: unknown, expectedPlan: unknown): Promise<BoundResultV3> {
  return validateBoundStandardResultFromCapturedPlanV3(input, captureExecutionPlanInputV3(expectedPlan));
}

async function validateBoundStandardResultFromCapturedPlanV3(input: unknown, capturedPlan: unknown): Promise<BoundResultV3> {
  // Both captures occur synchronously. Settle a failed plan promise even when
  // result admission throws before the first await.
  const planOutcome = validateStandardExecutionPlanV3(capturedPlan).then((plan) => ({ plan }), (error: unknown) => ({ error }));
  const captured = captureBoundResultV3(input, capturedPlan);
  const outcome = await planOutcome;
  if ("error" in outcome) throw outcome.error;
  const plan = outcome.plan;
  if (captured.schemaVersion !== 3 || captured.kind !== "open-ena-bound-result" || typeof captured.createdAt !== "string" || !Number.isFinite(Date.parse(captured.createdAt))) throw new TypeError("Invalid BoundResult v3 envelope.");
  same(Object.keys(captured).sort(), ["binding", "capabilityStatus", "configuration", "createdAt", "executionProvenance", "kind", "schemaVersion", "set"], "envelope keys");
  const { scientificResultSha256, ...binding } = captured.binding;
  same(binding, planBinding(plan), "complete binding");
  const exportLimit = assertCombinedStandardResourcesV3(plan.operationalAdmission, plan.reference?.admission, plan.referenceSerializationAdmission, plan.planSerializationAdmission).estimatedExportBytes;
  canonicalJsonByteLengthV3(scientificResultHashPayloadV3(captured), exportLimit);
  if (!/^[a-f0-9]{64}$/u.test(scientificResultSha256) || await sha256CanonicalJsonV3(scientificResultHashPayloadV3(captured)) !== scientificResultSha256) throw new TypeError("Scientific result SHA-256 does not match its complete content.");
  const p = captured.executionProvenance;
  const { projection, populations, meansBinding, resources, diagnostics, ...staticFields } = p;
  same(staticFields, staticProvenance(plan), "complete static provenance");
  same(captured.configuration, plan.configuration, "canonical configuration");
  same(resources.targetBaseline, plan.header.resourceEstimate, "resource baseline");
  same(resources.operationalAdmission, plan.operationalAdmission, "operational admission");
  same(resources.referenceSerializationAdmission, plan.referenceSerializationAdmission, "Reference serialization admission");
  same(resources.planSerializationAdmission, plan.planSerializationAdmission, "plan serialization admission");
  same(resources.referenceAdmission, plan.reference?.admission ?? null, "Reference admission");
  same(resources.counterContract, COUNTER_CONTRACT, "resource counter semantics");
  validateObservation(plan, resources.observed);
  const partial: InternalStandardRunResultV3 = { configuration: plan.configuration, executionPlanHeader: plan.header, projection, populations, meansBinding, diagnostics: [], set: {} as ENASet };
  const pairs = populationPairs(plan, partial);
  const runtime = { ...partial, set: transformSet(plan, captured.set, pairs, true) as ENASet };
  validateRuntime(plan, runtime);
  validateFixedProjectionRankV3(plan, capturedPlan as StandardExecutionPlanV3, captured, runtime);
  // Reverse/forward equality detects extra exported identity values and labels.
  same(transformSet(plan, runtime.set, pairs), captured.set, "restored scientific tables");
  guardScientificClosureV3(plan, scientificSlotsV3([captured.set, runtime.set], [projection], [plan.reference, p.reference]));
  const { compiled, evidence } = await verifyStandardScientificEvidenceV3(plan);
  assertStandardScientificClosureV3(plan, runtime, pairs, evidence);
  same(diagnostics, mergedDiagnostics(plan, compiled.diagnostics, standardRuntimeDiagnosticsV3(projection.type, projection.rank, meansBinding)), "complete compiler/runtime diagnostics");
  same(captured.capabilityStatus, capabilities(plan, diagnostics), "capability status");
  return deepFreezeV3(captured);
}

/** Cheap currentness only, for already validated immutable values. Not content authentication. */
export function resultMatchesPlanV3(result: AnyBoundResultV3 | null, plan: OpenEnaExecutionPlanV3): boolean {
  if (!result || result.schemaVersion !== 3 || result.kind !== "open-ena-bound-result") return false;
  const expected = isOnaExecutionPlanV3(plan) ? onaPlanBindingV3(plan) : planBinding(plan);
  return /^[a-f0-9]{64}$/u.test(result.binding.scientificResultSha256)
    && Object.keys(result.binding).length === Object.keys(expected).length + 1
    && Object.entries(expected).every(([key, value]) => result.binding[key as keyof ResultBindingV3] === value);
}

export function validateBoundResultV3(input: unknown, expectedPlan: StandardExecutionPlanV3): Promise<BoundResultV3>;
export function validateBoundResultV3(input: unknown, expectedPlan: OnaExecutionPlanV3): Promise<BoundOnaResultV3>;
export function validateBoundResultV3(input: unknown, expectedPlan: unknown): Promise<AnyBoundResultV3>;
export async function validateBoundResultV3(input: unknown, expectedPlan: unknown): Promise<AnyBoundResultV3> {
  const root = captureExecutionPlanDiscriminatorV3(expectedPlan), header = snapshotPlainJsonRecordV3(root.header, "bound plan header");
  return header.analysisFamily === "ona" ? validateBoundOnaResultV3(input, root) : validateBoundStandardResultFromCapturedPlanV3(input, captureExecutionPlanInputV3(root));
}
