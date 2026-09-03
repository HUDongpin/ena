import type {
  BackwardExtentV3,
  CanonicalCodeV3,
  CanonicalHorizonOrderV3,
  CanonicalModelContractsV3,
  CanonicalOnaConfigV3,
  CanonicalRowOrderV3,
  CanonicalStandardAnalysisV3,
  CanonicalStandardConfigV3,
  DatasetBoundConfirmationV3,
  EndpointRotationV3,
  ForwardExtentV3,
  OrderComparatorV3,
  OrderKeyV3,
  ScalarIdentityV3,
  StandardWindowV3,
  TrajectoryRotationV3,
} from "./types";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "./types";
import {
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import type { OpenEnaDirectionalMask } from "../types";

const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/u;
const CANONICAL_UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function strictRecord(value: unknown, label: string): Record<string, unknown> {
  return snapshotPlainJsonRecordV3(value, label);
}

function exactSnapshot(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) throw new TypeError(`${label} has unknown properties: ${unknown.join(", ")}.`);
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) throw new TypeError(`${label}.${key} is required.`);
  }
  return record;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  return exactSnapshot(strictRecord(value, label), keys, label);
}

function strictArray(value: unknown, label: string): unknown[] {
  return snapshotDenseJsonArrayV3(value, label);
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new TypeError(`${label} must be ${JSON.stringify(expected)}.`);
  return expected;
}

function nonblankString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a nonblank string.`);
  }
  return value;
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string.`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean.`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function lowercaseSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !LOWERCASE_SHA256.test(value)) {
    throw new TypeError(`${label} must be a lowercase 64-hex SHA-256 digest.`);
  }
  return value;
}

function distinctNonblankStrings(
  value: unknown,
  label: string,
): [string, ...string[]] {
  const input = strictArray(value, label);
  if (input.length === 0) throw new TypeError(`${label} must be nonempty.`);
  const output = input.map((entry, index) => nonblankString(entry, `${label}[${index}]`));
  if (new Set(output).size !== output.length) throw new TypeError(`${label} values must be distinct.`);
  const [first, ...rest] = output;
  return [first, ...rest];
}

function decodeContracts(value: unknown): CanonicalModelContractsV3 {
  const record = exactRecord(
    value,
    ["validationContractVersion", "runtimePolicyVersion"],
    "contracts",
  );
  return {
    validationContractVersion: literal(
      record.validationContractVersion,
      OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      "contracts.validationContractVersion",
    ),
    runtimePolicyVersion: literal(
      record.runtimePolicyVersion,
      OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
      "contracts.runtimePolicyVersion",
    ),
  };
}

function decodeUnits(value: unknown): CanonicalStandardConfigV3["units"] {
  const record = exactRecord(value, ["columns", "group"], "units");
  const groupRecord = strictRecord(record.group, "units.group");
  let group: CanonicalStandardConfigV3["units"]["group"];
  if (groupRecord.type === "none") {
    exactSnapshot(groupRecord, ["type"], "units.group none");
    group = { type: "none" };
  } else if (groupRecord.type === "stable-metadata") {
    const exact = exactSnapshot(groupRecord, ["type", "column"], "units.group stable-metadata");
    group = {
      type: "stable-metadata",
      column: nonblankString(exact.column, "units.group.column"),
    };
  } else {
    throw new TypeError("units.group.type must be \"none\" or \"stable-metadata\".");
  }
  return { columns: distinctNonblankStrings(record.columns, "units.columns"), group };
}

function decodeHorizons(value: unknown): CanonicalStandardConfigV3["horizons"] {
  const record = exactRecord(value, ["columns"], "horizons");
  return { columns: distinctNonblankStrings(record.columns, "horizons.columns") };
}

function decodeCodes(value: unknown): CanonicalStandardConfigV3["codes"] {
  const input = strictArray(value, "codes");
  if (input.length < 3) throw new TypeError("codes must contain at least 3 entries.");
  const output: CanonicalCodeV3[] = input.map((entry, index) => {
    const record = exactRecord(entry, ["column", "displayLabel"], `codes[${index}]`);
    return {
      column: nonblankString(record.column, `codes[${index}].column`),
      displayLabel: nonblankString(record.displayLabel, `codes[${index}].displayLabel`),
    };
  });
  const columns = output.map((code) => code.column);
  if (new Set(columns).size !== columns.length) throw new TypeError("codes column values must be distinct.");
  const [first, second, third, ...rest] = output;
  return [first, second, third, ...rest];
}

function decodeScalarIdentity(value: unknown, label: string): ScalarIdentityV3 {
  const record = exactRecord(value, ["type", "value"], label);
  if (record.type === "string") {
    return { type: "string", value: nonemptyString(record.value, `${label}.value`) };
  }
  if (record.type === "number") {
    return { type: "number", value: finiteNumber(record.value, `${label}.value`) };
  }
  if (record.type === "boolean") {
    return { type: "boolean", value: booleanValue(record.value, `${label}.value`) };
  }
  throw new TypeError(`${label}.type must be \"string\", \"number\", or \"boolean\".`);
}

function scalarIdentityKey(value: ScalarIdentityV3): string {
  if (value.type === "number") return `number:${Object.is(value.value, -0) ? "0" : String(value.value)}`;
  return `${value.type}:${String(value.value)}`;
}

function decodeConfirmation(value: unknown, label: string): DatasetBoundConfirmationV3 {
  const record = exactRecord(
    value,
    ["kind", "analysisFamily", "datasetSha256", "rowCount", "relevantColumns", "confirmedAt", "confirmationVersion"],
    label,
  );
  literal(record.kind, "explicit-researcher-confirmation", `${label}.kind`);
  if (record.analysisFamily !== "standard" && record.analysisFamily !== "ona") {
    throw new TypeError(`${label}.analysisFamily must be "standard" or "ona".`);
  }
  literal(record.confirmationVersion, 1, `${label}.confirmationVersion`);
  if (typeof record.rowCount !== "number" || !Number.isSafeInteger(record.rowCount) || record.rowCount < 0) {
    throw new TypeError(`${label}.rowCount must be a nonnegative safe integer.`);
  }
  const confirmedAt = nonemptyString(record.confirmedAt, `${label}.confirmedAt`);
  if (!CANONICAL_UTC_ISO.test(confirmedAt)
    || !Number.isFinite(Date.parse(confirmedAt))
    || new Date(confirmedAt).toISOString() !== confirmedAt) {
    throw new TypeError(`${label}.confirmedAt must be a canonical UTC ISO timestamp ending in Z.`);
  }
  return {
    kind: "explicit-researcher-confirmation",
    analysisFamily: record.analysisFamily,
    datasetSha256: lowercaseSha256(record.datasetSha256, `${label}.datasetSha256`),
    rowCount: record.rowCount,
    relevantColumns: distinctNonblankStrings(record.relevantColumns, `${label}.relevantColumns`),
    confirmedAt,
    confirmationVersion: 1,
  };
}

function decodeComparator(value: unknown, label: string): OrderComparatorV3 {
  const record = strictRecord(value, label);
  if (record.type === "number") {
    exactSnapshot(record, ["type"], `${label} number comparator`);
    return { type: "number" };
  }
  if (record.type === "date") {
    const exact = exactSnapshot(record, ["type", "format"], `${label} date comparator`);
    return { type: "date", format: literal(exact.format, "YYYY-MM-DD", `${label}.format`) };
  }
  if (record.type === "datetime") {
    const exact = exactSnapshot(record, ["type", "format", "timeZone"], `${label} datetime comparator`);
    return {
      type: "datetime",
      format: literal(exact.format, "ISO-8601", `${label}.format`),
      timeZone: literal(exact.timeZone, "offset-in-value", `${label}.timeZone`),
    };
  }
  if (record.type === "ordered-category") {
    const exact = exactSnapshot(record, ["type", "levels"], `${label} ordered-category comparator`);
    const input = strictArray(exact.levels, `${label}.levels`);
    if (input.length === 0) throw new TypeError(`${label}.levels must be nonempty.`);
    const levels = input.map((entry, index) => decodeScalarIdentity(entry, `${label}.levels[${index}]`));
    const identities = levels.map(scalarIdentityKey);
    if (new Set(identities).size !== identities.length) {
      throw new TypeError(`${label}.levels identities must be distinct.`);
    }
    return { type: "ordered-category", levels };
  }
  if (record.type === "text") {
    const exact = exactSnapshot(record, ["type", "locale", "sensitivity", "numeric"], `${label} text comparator`);
    const locale = nonblankString(exact.locale, `${label}.locale`);
    let canonicalLocales: string[];
    try {
      canonicalLocales = Intl.getCanonicalLocales(locale);
    } catch {
      throw new TypeError(`${label}.locale must be a canonical BCP-47 locale.`);
    }
    if (canonicalLocales.length !== 1 || canonicalLocales[0] !== locale) {
      throw new TypeError(`${label}.locale must use canonical BCP-47 spelling.`);
    }
    const sensitivity = exact.sensitivity;
    if (sensitivity !== "base" && sensitivity !== "accent" && sensitivity !== "case" && sensitivity !== "variant") {
      throw new TypeError(`${label}.sensitivity must be base, accent, case, or variant.`);
    }
    return {
      type: "text",
      locale,
      sensitivity,
      numeric: booleanValue(exact.numeric, `${label}.numeric`),
    };
  }
  throw new TypeError(`${label}.type is not a supported comparator discriminator.`);
}

function decodeOrderKey(value: unknown, label: string): OrderKeyV3 {
  const record = exactRecord(value, ["column", "direction", "comparator"], label);
  const direction = record.direction;
  if (direction !== "ascending" && direction !== "descending") {
    throw new TypeError(`${label}.direction must be \"ascending\" or \"descending\".`);
  }
  return {
    column: nonblankString(record.column, `${label}.column`),
    direction,
    comparator: decodeComparator(record.comparator, `${label}.comparator`),
  };
}

function decodeOrder(value: unknown, label: string): CanonicalRowOrderV3 {
  const record = strictRecord(value, label);
  if (record.kind === "columns") {
    const exact = exactSnapshot(record, ["kind", "keys"], `${label} columns order`);
    const input = strictArray(exact.keys, `${label}.keys`);
    if (input.length === 0) throw new TypeError(`${label}.keys must be nonempty.`);
    const keys = input.map((entry, index) => decodeOrderKey(entry, `${label}.keys[${index}]`));
    const columns = keys.map((key) => key.column);
    if (new Set(columns).size !== columns.length) {
      throw new TypeError(`${label} key columns must be distinct; duplicate order columns are invalid.`);
    }
    const [first, ...rest] = keys;
    return { kind: "columns", keys: [first, ...rest] };
  }
  if (record.kind === "source-order-confirmed") {
    const exact = exactSnapshot(record, ["kind", "confirmation"], `${label} source-order-confirmed order`);
    return {
      kind: "source-order-confirmed",
      confirmation: decodeConfirmation(exact.confirmation, `${label}.confirmation`),
    };
  }
  throw new TypeError(`${label}.kind must be \"columns\" or \"source-order-confirmed\".`);
}

function decodeBackwardExtent(value: unknown, label: string): BackwardExtentV3 {
  const record = strictRecord(value, label);
  if (record.kind === "infinity") {
    exactSnapshot(record, ["kind"], `${label} infinity extent`);
    return { kind: "infinity" };
  }
  if (record.kind === "finite") {
    const exact = exactSnapshot(record, ["kind", "value"], `${label} finite extent`);
    if (typeof exact.value !== "number" || !Number.isSafeInteger(exact.value) || exact.value < 1) {
      throw new TypeError(`${label}.value must be a safe integer greater than or equal to 1.`);
    }
    return { kind: "finite", value: exact.value };
  }
  throw new TypeError(`${label}.kind must be \"finite\" or \"infinity\".`);
}

function decodeForwardExtent(value: unknown, label: string): ForwardExtentV3 {
  const record = strictRecord(value, label);
  if (record.kind === "infinity") {
    exactSnapshot(record, ["kind"], `${label} infinity extent`);
    return { kind: "infinity" };
  }
  if (record.kind === "finite") {
    const exact = exactSnapshot(record, ["kind", "value"], `${label} finite extent`);
    if (typeof exact.value !== "number" || !Number.isSafeInteger(exact.value) || exact.value < 0) {
      throw new TypeError(`${label}.value must be a safe integer greater than or equal to 0.`);
    }
    return { kind: "finite", value: exact.value };
  }
  throw new TypeError(`${label}.kind must be \"finite\" or \"infinity\".`);
}

function decodeStandardWindow(value: unknown): StandardWindowV3 {
  const record = strictRecord(value, "window");
  if (record.type === "Conversation") {
    exactSnapshot(record, ["type"], "Conversation window");
    return { type: "Conversation" };
  }
  if (record.type === "MovingStanzaWindow") {
    const exact = exactSnapshot(record, ["type", "backward", "forward", "rowOrder"], "MovingStanzaWindow window");
    return {
      type: "MovingStanzaWindow",
      backward: decodeBackwardExtent(exact.backward, "window.backward"),
      forward: decodeForwardExtent(exact.forward, "window.forward"),
      rowOrder: decodeOrder(exact.rowOrder, "window.rowOrder"),
    };
  }
  throw new TypeError("window.type must be \"MovingStanzaWindow\" or \"Conversation\".");
}

function decodeReferenceRotation(
  record: Record<string, unknown>,
  label: string,
): EndpointRotationV3 & TrajectoryRotationV3 {
  const exact = exactSnapshot(record, ["type", "referenceId", "expectedContentSha256"], `${label} reference rotation`);
  return {
    type: "reference",
    referenceId: nonblankString(exact.referenceId, `${label}.referenceId`),
    expectedContentSha256: lowercaseSha256(exact.expectedContentSha256, `${label}.expectedContentSha256`),
  };
}

function decodeSvdRotation(
  record: Record<string, unknown>,
  label: string,
): EndpointRotationV3 & TrajectoryRotationV3 {
  const exact = exactSnapshot(record, ["type", "centerAlignToOrigin"], `${label} SVD rotation`);
  return {
    type: "svd",
    centerAlignToOrigin: booleanValue(exact.centerAlignToOrigin, `${label}.centerAlignToOrigin`),
  };
}

function decodeEndpointRotation(value: unknown, label: string): EndpointRotationV3 {
  const record = strictRecord(value, label);
  if (record.type === "svd") return decodeSvdRotation(record, label);
  if (record.type === "reference") return decodeReferenceRotation(record, label);
  if (record.type === "means") {
    const exact = exactSnapshot(record, ["type", "centerAlignToOrigin", "contrast"], `${label} Means rotation`);
    const contrast = exactRecord(
      exact.contrast,
      ["groupColumn", "negativeLevel", "positiveLevel"],
      `${label}.contrast`,
    );
    return {
      type: "means",
      centerAlignToOrigin: booleanValue(exact.centerAlignToOrigin, `${label}.centerAlignToOrigin`),
      contrast: {
        groupColumn: nonblankString(contrast.groupColumn, `${label}.contrast.groupColumn`),
        negativeLevel: decodeScalarIdentity(contrast.negativeLevel, `${label}.contrast.negativeLevel`),
        positiveLevel: decodeScalarIdentity(contrast.positiveLevel, `${label}.contrast.positiveLevel`),
      },
    };
  }
  throw new TypeError(`${label}.type must be \"svd\", \"means\", or \"reference\".`);
}

function decodeTrajectoryRotation(value: unknown, label: string): TrajectoryRotationV3 {
  const record = strictRecord(value, label);
  if (record.type === "means") {
    throw new TypeError("Trajectory models cannot use Means rotation; Means is Endpoint-only.");
  }
  if (record.type === "svd") return decodeSvdRotation(record, label);
  if (record.type === "reference") return decodeReferenceRotation(record, label);
  throw new TypeError(`${label}.type must be \"svd\" or \"reference\" for a trajectory model.`);
}

function decodeAnalysis(value: unknown): CanonicalStandardAnalysisV3 {
  const record = exactRecord(value, ["model", "rotation"], "analysis");
  const model = strictRecord(record.model, "analysis.model");
  if (model.type === "EndPoint") {
    exactSnapshot(model, ["type"], "EndPoint model");
    return {
      model: { type: "EndPoint" },
      rotation: decodeEndpointRotation(record.rotation, "analysis.rotation"),
    };
  }
  if (model.type === "SeparateTrajectory" || model.type === "AccumulatedTrajectory") {
    const exact = exactSnapshot(model, ["type", "horizonOrder"], `${model.type} model`);
    const horizonOrder: CanonicalHorizonOrderV3 = decodeOrder(exact.horizonOrder, "analysis.model.horizonOrder");
    const rotation = decodeTrajectoryRotation(record.rotation, "analysis.rotation");
    if (model.type === "SeparateTrajectory") {
      return { model: { type: "SeparateTrajectory", horizonOrder }, rotation };
    }
    return { model: { type: "AccumulatedTrajectory", horizonOrder }, rotation };
  }
  throw new TypeError("analysis.model.type must be EndPoint, SeparateTrajectory, or AccumulatedTrajectory.");
}

function decodeStandardWeighting(value: unknown): CanonicalStandardConfigV3["weighting"] {
  const record = exactRecord(value, ["type"], "weighting");
  if (record.type === "binary") return { type: "binary" };
  if (record.type === "frequency") return { type: "frequency" };
  throw new TypeError("weighting.type must be \"binary\" or \"frequency\".");
}

export function decodeCanonicalStandardConfigV3(value: unknown): CanonicalStandardConfigV3 {
  const record = exactRecord(
    value,
    ["schemaVersion", "analysisFamily", "contracts", "units", "horizons", "codes", "weighting", "window", "analysis"],
    "Standard config",
  );
  literal(record.schemaVersion, 3, "Standard config.schemaVersion");
  literal(record.analysisFamily, "standard", "Standard config.analysisFamily");
  return {
    schemaVersion: 3,
    analysisFamily: "standard",
    contracts: decodeContracts(record.contracts),
    units: decodeUnits(record.units),
    horizons: decodeHorizons(record.horizons),
    codes: decodeCodes(record.codes),
    weighting: decodeStandardWeighting(record.weighting),
    window: decodeStandardWindow(record.window),
    analysis: decodeAnalysis(record.analysis),
  };
}

function decodeOnaMask(
  value: unknown,
  codes: CanonicalStandardConfigV3["codes"],
): OpenEnaDirectionalMask {
  const record = exactRecord(value, ["schemaVersion", "codeOrder", "enabled"], "directionalMask");
  literal(record.schemaVersion, 1, "directionalMask.schemaVersion");
  const codeOrder = distinctNonblankStrings(record.codeOrder, "directionalMask.codeOrder");
  const canonicalColumns = codes.map((code) => code.column);
  if (codeOrder.length !== canonicalColumns.length
    || codeOrder.some((column, index) => column !== canonicalColumns[index])) {
    throw new TypeError("directionalMask.codeOrder must use exactly the canonical Code columns in declared order.");
  }
  const rows = strictArray(record.enabled, "directionalMask.enabled");
  if (rows.length !== canonicalColumns.length) {
    throw new TypeError("directionalMask.enabled must be a square matrix matching codeOrder length.");
  }
  const enabled = rows.map((row, rowIndex) => {
    const cells = strictArray(row, `directionalMask.enabled[${rowIndex}]`);
    if (cells.length !== canonicalColumns.length) {
      throw new TypeError("directionalMask.enabled must be a square matrix matching codeOrder length.");
    }
    return cells.map((cell, columnIndex) => booleanValue(
      cell,
      `directionalMask.enabled[${rowIndex}][${columnIndex}]`,
    ));
  });
  return { schemaVersion: 1, codeOrder: [...codeOrder], enabled };
}

export function decodeCanonicalOnaConfigV3(value: unknown): CanonicalOnaConfigV3 {
  const record = exactRecord(
    value,
    [
      "schemaVersion",
      "analysisFamily",
      "contracts",
      "units",
      "horizons",
      "codes",
      "model",
      "weighting",
      "window",
      "rotation",
      "directionalMask",
    ],
    "ONA config",
  );
  literal(record.schemaVersion, 3, "ONA config.schemaVersion");
  literal(record.analysisFamily, "ona", "ONA config.analysisFamily");

  const modelBranch = strictRecord(record.model, "ONA model");
  literal(modelBranch.type, "EndPoint", "ONA model.type");
  exactSnapshot(modelBranch, ["type"], "ONA model");
  const weightingBranch = strictRecord(record.weighting, "ONA weighting");
  literal(weightingBranch.type, "frequency", "ONA weighting.type");
  const weighting = exactSnapshot(weightingBranch, ["type", "engineMethod"], "ONA weighting");
  literal(weighting.engineMethod, "sum", "ONA weighting.engineMethod");
  const windowBranch = strictRecord(record.window, "ONA window");
  literal(windowBranch.type, "MovingStanzaWindow", "ONA window.type");
  const window = exactSnapshot(
    windowBranch,
    ["type", "backward", "forward", "rowOrder"],
    "ONA window",
  );
  literal(window.forward, 0, "ONA window.forward");
  const rotationBranch = strictRecord(record.rotation, "ONA rotation");
  literal(rotationBranch.type, "svd", "ONA rotation.type");
  const rotation = exactSnapshot(rotationBranch, ["type", "centerAlignToOrigin"], "ONA rotation");
  literal(rotation.centerAlignToOrigin, true, "ONA rotation.centerAlignToOrigin");

  const codes = decodeCodes(record.codes);
  return {
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: decodeContracts(record.contracts),
    units: decodeUnits(record.units),
    horizons: decodeHorizons(record.horizons),
    codes,
    model: { type: "EndPoint" },
    weighting: { type: "frequency", engineMethod: "sum" },
    window: {
      type: "MovingStanzaWindow",
      backward: decodeBackwardExtent(window.backward, "ONA window.backward"),
      forward: 0,
      rowOrder: decodeOrder(window.rowOrder, "ONA window.rowOrder"),
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask: decodeOnaMask(record.directionalMask, codes),
  };
}
