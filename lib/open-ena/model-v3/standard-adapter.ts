import type { Row, RotationOptions } from "jena-js";
import type { ENAWorkerOptions } from "jena-js/browser";
import { canonicalJsonV3, deepFreezeV3, snapshotDenseJsonArrayV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import type { StandardAdapterParametersV3, StandardExecutionPlanV3, StandardExecutionRowV3 } from "./execution-plan";
import type { BackwardExtentV3, CanonicalCodeV3, CanonicalStandardConfigV3, StandardMeansBindingV3 } from "./types";

const CODE_TOKEN_PREFIX_V3 = "__open_ena_code_v3_";
const EDGE_TOKEN_PREFIX_V3 = "__open_ena_edge_v3_";

export interface CanonicalCodeEntryV3 {
  readonly token: string;
  readonly sourceColumn: string;
  readonly displayLabel: string;
  readonly canonicalIdentity: string;
}

export interface CanonicalStandardEdgeEntryV3 {
  readonly token: string;
  readonly sourceCodeIdentity: string;
  readonly targetCodeIdentity: string;
}

export interface StandardCodeDictionaryV3 {
  readonly codes: readonly CanonicalCodeEntryV3[];
  readonly edges: readonly CanonicalStandardEdgeEntryV3[];
}

export interface CodeRepresentationBindingV3 {
  readonly runtimeToken: string;
  readonly sourceColumn: string;
  readonly sourceRepresentation: "numeric-binary" | "boolean-binary" | "frequency";
  readonly runtimeRepresentation: "number";
}

type StandardWeightingV3 = CanonicalStandardConfigV3["weighting"];
type BinarySourceRepresentationV3 = "numeric-binary" | "boolean-binary";

function exactKeysV3(
  record: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function ownEnumerableDataValueV3(
  value: object,
  key: string,
  label: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    throw new TypeError(`${label} is missing an own data property.`);
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`${label} must be an own enumerable data property, not an accessor.`);
  }
  return descriptor.value;
}

function assertPlainRecordV3(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain row object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain row object.`);
  }
}

function captureCodeSourceColumnV3(value: unknown, index: number): string {
  const label = `Code dictionary definitions[${index}]`;
  assertPlainRecordV3(value, label);
  const column = ownEnumerableDataValueV3(value, "column", `${label}.column`);
  if (typeof column !== "string" || column.trim().length === 0) {
    throw new TypeError(`${label}.column must be a nonblank string.`);
  }
  return column;
}

function captureCanonicalCodeDefinitionV3(
  value: unknown,
  index: number,
  sourceColumn: string,
): CanonicalCodeV3 {
  const label = `Code dictionary definitions[${index}]`;
  const record = snapshotPlainJsonRecordV3(value, label);
  exactKeysV3(record, ["column", "displayLabel"], label);
  if (record.column !== sourceColumn) {
    throw new TypeError(`${label}.column changed during descriptor capture.`);
  }
  if (typeof record.displayLabel !== "string" || record.displayLabel.trim().length === 0) {
    throw new TypeError(`${label}.displayLabel must be a nonblank string.`);
  }
  return { column: sourceColumn, displayLabel: record.displayLabel };
}

function compareUtf16CodeUnitsV3(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function compareUtf8V3(encoder: TextEncoder, left: string, right: string): number {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a[index] - b[index];
    if (difference !== 0) return difference;
  }
  const lengthDifference = a.length - b.length;
  if (lengthDifference !== 0) return lengthDifference;
  // TextEncoder replaces lone surrogates. This exact-code-unit fallback keeps
  // distinct source labels deterministic without normalizing their identities.
  return compareUtf16CodeUnitsV3(left, right);
}

function tokenOrdinalV3(index: number): string {
  return String(index).padStart(3, "0");
}

function weightingTypeV3(weighting: StandardWeightingV3): StandardWeightingV3["type"] {
  const record = snapshotPlainJsonRecordV3(weighting, "Standard weighting");
  exactKeysV3(record, ["type"], "Standard weighting");
  if (record.type !== "binary" && record.type !== "frequency") {
    throw new TypeError("Standard weighting.type must be binary or frequency.");
  }
  return record.type;
}

function sourceCodeValueV3(row: Row, sourceColumn: string, weighting: StandardWeightingV3["type"]): unknown {
  const label = `${weighting === "binary" ? "Binary" : "Frequency"} Code “${sourceColumn}”`;
  assertPlainRecordV3(row, label);
  return ownEnumerableDataValueV3(row, sourceColumn, label);
}

function binaryCodeValueV3(
  row: Row,
  sourceColumn: string,
): { value: number; representation: BinarySourceRepresentationV3 } {
  const value = sourceCodeValueV3(row, sourceColumn, "binary");
  if (typeof value === "boolean") {
    return { value: value ? 1 : 0, representation: "boolean-binary" };
  }
  if (typeof value === "number" && (value === 0 || value === 1)) {
    return {
      value: Object.is(value, -0) ? 0 : value,
      representation: "numeric-binary",
    };
  }
  throw new TypeError(`Binary Code “${sourceColumn}” is not 0/1 or Boolean.`);
}

function frequencyCodeValueV3(row: Row, sourceColumn: string): number {
  const value = sourceCodeValueV3(row, sourceColumn, "frequency");
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `Frequency Code “${sourceColumn}” is not a finite non-negative number.`,
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function buildCanonicalCodeEntriesV3(
  definitions: readonly CanonicalCodeV3[],
): readonly CanonicalCodeEntryV3[] {
  const captured = snapshotDenseJsonArrayV3(definitions, "Code dictionary definitions");
  const sourceColumns = captured.map(captureCodeSourceColumnV3);
  if (new Set(sourceColumns).size !== sourceColumns.length) {
    throw new TypeError("Code dictionary definitions must have distinct source columns.");
  }
  const definitionsSnapshot = captured.map((definition, index) => {
    return captureCanonicalCodeDefinitionV3(definition, index, sourceColumns[index]);
  });
  const encoder = new TextEncoder();
  const ordered = [...definitionsSnapshot].sort((left, right) => {
    return compareUtf8V3(encoder, left.column, right.column);
  });
  return deepFreezeV3(ordered.map((definition, index) => ({
    token: `${CODE_TOKEN_PREFIX_V3}${tokenOrdinalV3(index)}`,
    sourceColumn: definition.column,
    displayLabel: definition.displayLabel,
    canonicalIdentity: definition.column,
  })));
}

export function buildStandardCodeDictionaryV3(
  definitions: readonly CanonicalCodeV3[],
): StandardCodeDictionaryV3 {
  const codes = buildCanonicalCodeEntriesV3(definitions);
  const edges: CanonicalStandardEdgeEntryV3[] = [];
  for (let targetIndex = 0; targetIndex < codes.length; targetIndex += 1) {
    for (let sourceIndex = 0; sourceIndex < targetIndex; sourceIndex += 1) {
      edges.push({
        token: `${EDGE_TOKEN_PREFIX_V3}${tokenOrdinalV3(sourceIndex)}_${tokenOrdinalV3(targetIndex)}`,
        sourceCodeIdentity: codes[sourceIndex].canonicalIdentity,
        targetCodeIdentity: codes[targetIndex].canonicalIdentity,
      });
    }
  }
  return deepFreezeV3({ codes, edges });
}

export function materializeStandardCodesV3(
  row: Row,
  weighting: StandardWeightingV3,
  dictionary: StandardCodeDictionaryV3,
): Readonly<Record<string, number>> {
  const type = weightingTypeV3(weighting);
  const materialized: Record<string, number> = {};
  for (const code of dictionary.codes) {
    materialized[code.token] = type === "binary"
      ? binaryCodeValueV3(row, code.sourceColumn).value
      : frequencyCodeValueV3(row, code.sourceColumn);
  }
  return deepFreezeV3(materialized);
}

export function buildCodeRepresentationBindingsV3(
  rows: readonly Row[],
  weighting: StandardWeightingV3,
  dictionary: StandardCodeDictionaryV3,
): readonly CodeRepresentationBindingV3[] {
  const capturedRows = snapshotDenseJsonArrayV3(rows, "Standard Code representation rows");
  if (capturedRows.length === 0) {
    throw new TypeError("Standard Code representation binding requires at least one row.");
  }
  const type = weightingTypeV3(weighting);
  const bindings = dictionary.codes.map((code): CodeRepresentationBindingV3 => {
    if (type === "frequency") {
      for (const row of capturedRows) {
        frequencyCodeValueV3(row as Row, code.sourceColumn);
      }
      return {
        runtimeToken: code.token,
        sourceColumn: code.sourceColumn,
        sourceRepresentation: "frequency",
        runtimeRepresentation: "number",
      };
    }

    let sourceRepresentation: BinarySourceRepresentationV3 | null = null;
    for (const row of capturedRows) {
      const current = binaryCodeValueV3(row as Row, code.sourceColumn).representation;
      if (sourceRepresentation === null) {
        sourceRepresentation = current;
      } else if (sourceRepresentation !== current) {
        throw new TypeError(
          `Binary Code “${code.sourceColumn}” has mixed numeric and Boolean representations.`,
        );
      }
    }
    return {
      runtimeToken: code.token,
      sourceColumn: code.sourceColumn,
      sourceRepresentation: sourceRepresentation!,
      runtimeRepresentation: "number",
    };
  });
  return deepFreezeV3(bindings);
}

function assertStandardAdapterParametersV3(plan: StandardExecutionPlanV3): StandardAdapterParametersV3 {
  const config = plan.configuration;
  const expected: StandardAdapterParametersV3 = {
    networkType: "standard",
    unitTokenColumn: "__open_ena_unit_token",
    horizonTokenColumn: "__open_ena_horizon_token",
    codeTokens: plan.codeDictionary.codes.map((entry) => entry.token),
    model: config.analysis.model.type,
    window: config.window.type === "Conversation"
      ? { type: "Conversation" }
      : { type: "MovingStanzaWindow", backward: config.window.backward, forward: config.window.forward },
    weightBy: config.weighting.type === "binary" ? "binary" : "sum",
    displayDimensions: 3,
  };
  if (canonicalJsonV3(plan.adapterParameters) !== canonicalJsonV3(expected)) {
    throw new TypeError("Standard adapter parameters do not match the canonical plan.");
  }
  return expected;
}

function extentToNumberV3(extent: BackwardExtentV3): number {
  return extent.kind === "infinity" ? Infinity : extent.value;
}

function executionRowToJenaRowV3(row: StandardExecutionRowV3): Row {
  return {
    __open_ena_unit_token: row.unitToken,
    __open_ena_horizon_token: row.horizonToken,
    ...row.codeValues,
  };
}

function pushHorizonPriorityV3(heap: number[], priority: number): void {
  let index = heap.length;
  heap.push(priority);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent] <= priority) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = priority;
}

function popHorizonPriorityV3(heap: number[]): number {
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1] < heap[child]) child += 1;
      if (last <= heap[child]) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

/**
 * Internal execution permutation for a built/validated plan. Whole Horizon
 * buckets retain shared-Unit context and their exact within-Horizon row order.
 * Unit sequences supply scientific constraints; implementationHorizonOrder is
 * only a deterministic priority among currently unconstrained Horizons.
 * Worker/result binding must reuse this permutation's preserved sourceRowIndex,
 * rather than assuming jENA row outputs still correspond to plan.rows order.
 */
export function scheduleStandardExecutionRowsV3(plan: StandardExecutionPlanV3): readonly StandardExecutionRowV3[] {
  if (plan.configuration.analysis.model.type === "EndPoint") return Object.freeze([...plan.rows]);
  const order = plan.horizonOrdering;
  if (order.type !== "trajectory-horizon-order") {
    throw new TypeError("Standard trajectory schedule requires resolved Unit sequences.");
  }
  const buckets = new Map<string, StandardExecutionRowV3[]>();
  const observedByUnit = new Map<string, Set<string>>();
  const sourceIndices = new Set<number>();
  for (const row of plan.rows) {
    if (!Number.isSafeInteger(row.sourceRowIndex) || row.sourceRowIndex < 0
      || row.sourceRowIndex >= plan.rows.length || sourceIndices.has(row.sourceRowIndex)) {
      throw new TypeError("Standard trajectory schedule requires a complete source-row permutation.");
    }
    sourceIndices.add(row.sourceRowIndex);
    const bucket = buckets.get(row.horizonToken) ?? [];
    bucket.push(row);
    buckets.set(row.horizonToken, bucket);
    const observed = observedByUnit.get(row.unitToken) ?? new Set<string>();
    observed.add(row.horizonToken);
    observedByUnit.set(row.unitToken, observed);
  }
  const priorities = new Map(order.implementationHorizonOrder.map((token, index) => [token, index]));
  if (priorities.size !== order.implementationHorizonOrder.length || priorities.size !== buckets.size
    || [...priorities.keys()].some((token) => !buckets.has(token))) {
    throw new TypeError("Standard trajectory schedule requires every observed Horizon exactly once in its tie priority.");
  }
  const successors = order.implementationHorizonOrder.map(() => new Set<number>());
  const indegrees = order.implementationHorizonOrder.map(() => 0);
  const coveredUnits = new Set<string>();
  for (const sequence of order.unitSequences) {
    const observed = observedByUnit.get(sequence.unitToken);
    if (observed === undefined || coveredUnits.has(sequence.unitToken) || sequence.steps.length !== observed.size) {
      throw new TypeError("Standard trajectory schedule requires one complete sequence per observed Unit.");
    }
    coveredUnits.add(sequence.unitToken);
    const coveredSteps = new Set<string>();
    let previous: number | undefined;
    for (const [ordinal, step] of sequence.steps.entries()) {
      if (step.trajectoryOrdinal !== ordinal || !observed.has(step.horizonToken) || coveredSteps.has(step.horizonToken)) {
        throw new TypeError("Standard trajectory schedule must cover each observed Unit-Horizon step exactly once without imputation.");
      }
      coveredSteps.add(step.horizonToken);
      const current = priorities.get(step.horizonToken)!;
      if (previous !== undefined && !successors[previous].has(current)) {
        successors[previous].add(current);
        indegrees[current] += 1;
      }
      previous = current;
    }
  }
  if (coveredUnits.size !== observedByUnit.size) {
    throw new TypeError("Standard trajectory schedule is missing an observed Unit sequence.");
  }
  // Kahn's algorithm with a min-heap: O(rows + steps + H log H), without
  // repeated full sorting or shifting an O(H)-length ready queue.
  const ready: number[] = [];
  indegrees.forEach((count, priority) => { if (count === 0) pushHorizonPriorityV3(ready, priority); });
  const scheduled: StandardExecutionRowV3[] = [];
  while (ready.length > 0) {
    const priority = popHorizonPriorityV3(ready);
    for (const row of buckets.get(order.implementationHorizonOrder[priority])!) scheduled.push(row);
    for (const next of successors[priority]) {
      indegrees[next] -= 1;
      if (indegrees[next] === 0) pushHorizonPriorityV3(ready, next);
    }
  }
  if (scheduled.length !== plan.rows.length) {
    throw new TypeError("Standard trajectory schedule contains cyclic Horizon constraints.");
  }
  return Object.freeze(scheduled);
}

/** Unit-stable typed Group membership, independent of source-row multiplicity. */
export function buildMeansBindingV3(plan: StandardExecutionPlanV3): StandardMeansBindingV3 {
  const config = plan.configuration;
  const rotation = config.analysis.rotation;
  if (config.analysisFamily !== "standard" || config.analysis.model.type !== "EndPoint" || rotation.type !== "means") {
    throw new TypeError("Means binding requires a Standard EndPoint Means plan.");
  }
  const { groupColumn, negativeLevel, positiveLevel } = rotation.contrast;
  if (config.units.group.type !== "stable-metadata" || config.units.group.column !== groupColumn) {
    throw new TypeError("Means contrast requires the configured Unit-stable Group column.");
  }
  const negativeKey = canonicalJsonV3(negativeLevel);
  const positiveKey = canonicalJsonV3(positiveLevel);
  if (negativeKey === positiveKey) throw new TypeError("Means requires distinct non-overlapping Group levels.");
  const groupKeys = new Map(plan.identityDictionary.groups.map((group) => {
    if (group.fields.length !== 1 || group.fields[0].column !== groupColumn) {
      throw new TypeError("Means requires verified typed Group fields.");
    }
    return [group.token, canonicalJsonV3(group.fields[0].value)];
  }));
  const knownUnits = new Set(plan.identityDictionary.units.map((unit) => unit.token));
  const membership = new Map<string, string>();
  for (const row of plan.rows) {
    const group = row.groupToken === null ? undefined : groupKeys.get(row.groupToken);
    if (!knownUnits.has(row.unitToken) || group === undefined) {
      throw new TypeError("Means requires known Unit tokens and nonempty typed Group membership.");
    }
    const previous = membership.get(row.unitToken);
    if (previous !== undefined && previous !== group) {
      throw new TypeError("Means Group membership must be stable within each Unit.");
    }
    membership.set(row.unitToken, group);
  }
  if (membership.size !== knownUnits.size) throw new TypeError("Means requires membership for every Endpoint Unit.");
  const unitsFor = (key: string) => plan.identityDictionary.units
    .filter((unit) => membership.get(unit.token) === key).map((unit) => unit.token);
  const negative = unitsFor(negativeKey);
  const positive = unitsFor(positiveKey);
  if (negative.length === 0 || positive.length === 0) {
    throw new TypeError("Means requires nonempty Unit membership in both Group levels.");
  }
  return deepFreezeV3({
    groupColumn,
    negative: { level: { ...negativeLevel }, unitTokens: negative },
    positive: { level: { ...positiveLevel }, unitTokens: positive },
    direction: "positive-minus-negative",
  });
}

/** Positive FIRST: jENA's mean rotation computes mean(left) - mean(right). */
export function buildMeansMasksV3(binding: StandardMeansBindingV3, connectionCounts: readonly Row[]): [boolean[], boolean[]] {
  const positive = new Set(binding.positive.unitTokens);
  const negative = new Set(binding.negative.unitTokens);
  if (positive.size === 0 || negative.size === 0
    || positive.size !== binding.positive.unitTokens.length || negative.size !== binding.negative.unitTokens.length
    || [...positive].some((token) => negative.has(token))) {
    throw new TypeError("Means requires two nonempty, distinct, non-overlapping Unit memberships.");
  }
  const seen = new Set<string>();
  const masks: [boolean[], boolean[]] = [[], []];
  for (const row of connectionCounts) {
    const token = row.__open_ena_unit_token;
    if (typeof token !== "string" || row.ENA_UNIT !== token || seen.has(token)) {
      throw new TypeError("Means Endpoint counts must contain each Unit exactly once, without duplicate tokens.");
    }
    seen.add(token);
    masks[0].push(positive.has(token));
    masks[1].push(negative.has(token));
  }
  if ([...positive, ...negative].some((token) => !seen.has(token))) {
    throw new TypeError("Means Endpoint counts are missing selected Unit membership.");
  }
  return masks;
}

function makeSetRotationOptionsV3(plan: StandardExecutionPlanV3): {
  centerAlignToOrigin: boolean;
  rotation: RotationOptions;
} {
  const rotation = plan.configuration.analysis.rotation;
  if (rotation.type === "reference") {
    throw new TypeError(
      "Reference mapping requires a complete validated Reference v2 artifact; execution remains fail-closed until the Reference tasks are complete.",
    );
  }
  if (rotation.type === "svd") {
    return { centerAlignToOrigin: rotation.centerAlignToOrigin, rotation: { method: "svd" } };
  }
  if (plan.configuration.analysis.model.type !== "EndPoint") {
    throw new TypeError("Direct Means rotation is only valid for EndPoint models.");
  }
  const binding = buildMeansBindingV3(plan);
  return {
    centerAlignToOrigin: rotation.centerAlignToOrigin,
    rotation: {
      method: "mean",
      params: {
        // jENA subtracts right from left; preserve positive-minus-negative.
        groups: [
          [...binding.positive.unitTokens],
          [...binding.negative.unitTokens],
        ],
      },
    },
  };
}

/**
 * Internal mapper for an immutable plan produced by build/validateExecutionPlanV3.
 * Full plan validation belongs at the runner boundary; scientific jENA options
 * are rederived here and cannot be supplied as caller overrides.
 */
export function toStandardJenaOptionsV3(plan: StandardExecutionPlanV3): ENAWorkerOptions {
  const parameters = assertStandardAdapterParametersV3(plan);
  return {
    rows: scheduleStandardExecutionRowsV3(plan).map(executionRowToJenaRowV3),
    units: [parameters.unitTokenColumn],
    conversation: [parameters.horizonTokenColumn],
    codes: [...parameters.codeTokens],
    networkType: parameters.networkType,
    model: parameters.model,
    window: parameters.window.type,
    windowSizeBack: parameters.window.type === "Conversation" ? Infinity : extentToNumberV3(parameters.window.backward),
    windowSizeForward: parameters.window.type === "Conversation" ? 0 : extentToNumberV3(parameters.window.forward),
    weightBy: parameters.weightBy,
    dimensions: parameters.displayDimensions,
    ...makeSetRotationOptionsV3(plan),
  };
}
