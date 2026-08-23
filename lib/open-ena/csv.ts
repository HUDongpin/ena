import { accumulateDataChunked } from "jena-js";
import type { Row, Scalar } from "jena-js";
import type { OpenEnaConfig, ParsedDataset } from "./types";
import {
  analysisKindFor,
  canonicalizeOpenEnaConfig,
  orderRowsForOpenEna,
  typedHorizonIdentity,
  typedTupleIdentity,
} from "./network-config";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 256;
const MAX_HEADER_CHARACTERS = 256;
const MAX_CODE_COLUMNS = 30;
const MAX_GROUPS = 6;
const MAX_MODELED_EDGE_CELLS = 2_000_000;
const DECIMAL_CODE_COUNT = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

function assertColumnCount(columnCount: number) {
  if (columnCount > MAX_COLUMNS) {
    throw new Error(`This browser release supports up to ${MAX_COLUMNS} columns per CSV.`);
  }
}

function toScalar(value: string): Scalar {
  if (value.trim() === "") return null;
  // Preserve the source representation here. Structural identifiers such as
  // "001" and large integer strings must not be coerced into the same JS number.
  // Selected code columns are converted explicitly at the jENA boundary.
  return value;
}

function binaryValue(value: Row[string]): 0 | 1 | null {
  if (value === 0 || value === false) return 0;
  if (value === 1 || value === true) return 1;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "0" || normalized === "false") return 0;
  if (normalized === "1" || normalized === "true") return 1;
  return null;
}

function rawCodeCount(value: Row[string]): number | null {
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = value.trim();
  if (!DECIMAL_CODE_COUNT.test(normalized) || normalized.startsWith("-")) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const significand = normalized.replace(/^\+/, "").split(/[eE]/, 1)[0] ?? "";
  if (parsed === 0 && /[1-9]/.test(significand)) return null;
  return parsed;
}

export function parseCsv(text: string, options: { name: string; sizeBytes?: number; source: ParsedDataset["source"] }): ParsedDataset {
  const sizeBytes = options.sizeBytes ?? new TextEncoder().encode(text).byteLength;
  if (sizeBytes > MAX_FILE_BYTES) throw new Error("CSV files must be 5 MB or smaller.");

  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const finishRecord = () => {
    if (!record.some((value) => value.length > 0)) {
      record = [];
      return;
    }
    if (records.length > 0 && record.length !== records[0].length) {
      throw new Error(`Row ${records.length + 1} has ${record.length} fields; the header has ${records[0].length}.`);
    }
    if (records.length > MAX_ROWS) {
      throw new Error(`This browser release supports up to ${MAX_ROWS.toLocaleString()} rows per run.`);
    }
    records.push(record);
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) throw new Error(`Unexpected quote near character ${index + 1}.`);
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
      if (records.length === 0) assertColumnCount(record.length + 1);
      else if (record.length >= records[0].length) {
        throw new Error(`Row ${records.length + 1} has more fields than the ${records[0].length}-column header.`);
      }
    } else if (character === "\n" || character === "\r") {
      record.push(field);
      field = "";
      if (records.length === 0) assertColumnCount(record.length);
      finishRecord();
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The CSV ends inside a quoted field.");
  record.push(field);
  if (records.length === 0) assertColumnCount(record.length);
  finishRecord();
  if (records.length < 2) throw new Error("The CSV needs a header and at least one data row.");

  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => header.length === 0)) throw new Error("Every CSV column needs a header.");
  if (headers.some((header) => header.length > MAX_HEADER_CHARACTERS)) {
    throw new Error(`CSV column headers must be ${MAX_HEADER_CHARACTERS} characters or fewer.`);
  }
  if (new Set(headers).size !== headers.length) throw new Error("CSV column headers must be unique.");

  const rows: Row[] = records.slice(1).map((values) => {
    return Object.fromEntries(headers.map((header, columnIndex) => [header, toScalar(values[columnIndex])]));
  });

  return {
    name: options.name,
    headers,
    rows,
    sizeBytes,
    source: options.source,
    hashKind: "normalized-utf8-csv-text-sha256",
  };
}

function findHeader(headers: string[], candidates: string[]) {
  const candidateSet = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  return headers.find((header) => candidateSet.has(header.toLowerCase()));
}

function chooseHeader(headers: string[], candidates: string[], fallbackIndex = 0) {
  return findHeader(headers, candidates) ?? headers[fallbackIndex] ?? "";
}

function isBinaryCode(rows: Row[], header: string) {
  const values = rows.map((row) => row[header]).filter((value) => value !== null);
  if (values.length === 0) return false;
  return values.every((value) => binaryValue(value) !== null);
}

function isActiveCode(value: Row[string]) {
  return binaryValue(value) === 1;
}

function compositeValue(row: Row, columns: string[]) {
  return columns.map((column) => String(row[column] ?? "")).join("::");
}

function analysisIdentity(
  row: Row,
  columns: readonly string[],
  analysisKind: "ena" | "ona",
  label: string,
) {
  return analysisKind === "ona"
    ? typedTupleIdentity(row, columns, label)
    : compositeValue(row, [...columns]);
}

export function coerceSelectedCodes(
  rows: Row[],
  codes: string[],
  retainedColumns: string[] = [],
  analysisKind: "ena" | "ona" = "ena",
): Row[] {
  const modelColumns = [...new Set([...retainedColumns, ...codes])];
  const codeSet = new Set(codes);
  return rows.map((row) => Object.fromEntries(modelColumns.map((column) => [
    column,
    codeSet.has(column)
      ? (analysisKind === "ona" ? rawCodeCount(row[column]) : binaryValue(row[column])) ?? row[column]
      : row[column],
  ])));
}

function hasCoOccurrence(dataset: ParsedDataset, config: OpenEnaConfig) {
  const conversations = new Map<string, Row[]>();
  for (const row of dataset.rows) {
    const conversation = compositeValue(row, config.conversationColumns);
    const key = config.window === "Conversation"
      ? `${conversation}\u001F${compositeValue(row, config.unitColumns)}`
      : conversation;
    const rows = conversations.get(key) ?? [];
    rows.push(row);
    conversations.set(key, rows);
  }

  for (const rows of conversations.values()) {
    if (config.window === "Conversation") {
      const activeCodes = new Set<string>();
      for (const row of rows) {
        for (const code of config.codes) {
          if (isActiveCode(row[code])) activeCodes.add(code);
        }
        if (activeCodes.size >= 2) return true;
      }
      continue;
    }

    const prefix = config.codes.map(() => new Uint32Array(rows.length + 1));
    for (let index = 0; index < rows.length; index += 1) {
      for (let codeIndex = 0; codeIndex < config.codes.length; codeIndex += 1) {
        prefix[codeIndex][index + 1] = prefix[codeIndex][index]
          + (isActiveCode(rows[index][config.codes[codeIndex]]) ? 1 : 0);
      }
    }
    for (let index = 0; index < rows.length; index += 1) {
      const first = Math.max(0, index - Math.max(0, config.windowSizeBack - 1));
      const last = Math.min(rows.length - 1, index + config.windowSizeForward);
      for (let target = 1; target < config.codes.length; target += 1) {
        const targetAll = prefix[target][last + 1] - prefix[target][first];
        const targetPast = prefix[target][index] - prefix[target][first];
        const targetFuture = prefix[target][last + 1] - prefix[target][index + 1];
        for (let source = 0; source < target; source += 1) {
          const sourceAll = prefix[source][last + 1] - prefix[source][first];
          const sourcePast = prefix[source][index] - prefix[source][first];
          const sourceFuture = prefix[source][last + 1] - prefix[source][index + 1];
          const weight = sourceAll * targetAll
            - sourcePast * targetPast
            - sourceFuture * targetFuture;
          if (weight > 0) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function hasOrderedConnection(dataset: ParsedDataset, config: OpenEnaConfig) {
  const canonical = canonicalizeOpenEnaConfig(config);
  if (canonical.analysisKind !== "ona" || !canonical.orderPolicy || !canonical.directionalMask) return false;
  const ordered = orderRowsForOpenEna(dataset.rows, canonical.conversationColumns, canonical.orderPolicy);
  const rowsByHorizon = new Map<string, Row[]>();
  for (const row of ordered.rows) {
    const key = typedHorizonIdentity(row, canonical.conversationColumns);
    const rows = rowsByHorizon.get(key) ?? [];
    rows.push(row);
    rowsByHorizon.set(key, rows);
  }
  for (const rows of rowsByHorizon.values()) {
    const priorCodeCounts = new Uint32Array(canonical.codes.length);
    const activeCodeHistory: number[][] = [];
    let historyStart = 0;
    const maxPriorRows = canonical.windowSizeBack === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.max(0, canonical.windowSizeBack - 1);
    for (let responseIndex = 0; responseIndex < rows.length; responseIndex += 1) {
      const response = rows[responseIndex];
      while (responseIndex - historyStart > maxPriorRows) {
        for (const codeIndex of activeCodeHistory[historyStart]) priorCodeCounts[codeIndex] -= 1;
        historyStart += 1;
      }
      const responseCodes = canonical.codes
        .map((code, codeIndex) => (rawCodeCount(response[code]) ?? 0) > 0 ? codeIndex : -1)
        .filter((codeIndex) => codeIndex >= 0);
      for (const sourceCode of responseCodes) {
        for (const targetCode of responseCodes) {
          if (sourceCode !== targetCode && canonical.directionalMask.enabled[sourceCode][targetCode]) {
            return true;
          }
        }
      }
      for (const targetCode of responseCodes) {
        for (let sourceCode = 0; sourceCode < priorCodeCounts.length; sourceCode += 1) {
          if (priorCodeCounts[sourceCode] > 0 && canonical.directionalMask.enabled[sourceCode][targetCode]) {
            return true;
          }
        }
      }
      for (const codeIndex of responseCodes) priorCodeCounts[codeIndex] += 1;
      activeCodeHistory.push(responseCodes);
    }
  }
  return false;
}

/**
 * jENA's ordered accumulator deliberately preserves raw count magnitude. That
 * means a finite input can still overflow while forming a lagged product,
 * updating a horizon's running sum, or summing row connections into a unit.
 * Downstream numeric materialization treats non-finite values as zero, so use
 * the ordered accumulator itself as a preflight before rotation/model fitting
 * instead of maintaining a second sliding-window implementation here.
 */
function hasFiniteOrderedConnectionNumerics(dataset: ParsedDataset, config: OpenEnaConfig) {
  const canonical = canonicalizeOpenEnaConfig(config);
  if (canonical.analysisKind !== "ona" || !canonical.orderPolicy || !canonical.directionalMask) return false;
  try {
    const ordered = orderRowsForOpenEna(
      dataset.rows,
      canonical.conversationColumns,
      canonical.orderPolicy,
    );
    const retainedColumns = [
      ...canonical.unitColumns,
      ...canonical.conversationColumns,
      ...(canonical.groupColumn ? [canonical.groupColumn] : []),
    ];
    const rows = coerceSelectedCodes(ordered.rows, canonical.codes, retainedColumns, "ona");
    const accumulated = accumulateDataChunked({
      rows,
      units: [...canonical.unitColumns],
      conversation: [...canonical.conversationColumns],
      codes: [...canonical.codes],
      networkType: "ordered",
      model: "EndPoint",
      window: "MovingStanzaWindow",
      windowSizeBack: canonical.windowSizeBack,
      windowSizeForward: 0,
      weightBy: "sum",
      mask: canonical.directionalMask.enabled.map((row) => row.map((enabled) => enabled ? 1 : 0)),
      includeMeta: false,
      materialization: "model",
      chunkSize: Math.max(1, Math.min(rows.length, 1_000)),
    });
    return accumulated.connectionCounts.every((row) =>
      accumulated.codeColumns.every((column) => Number.isFinite(Number(row[column])))
    );
  } catch {
    return false;
  }
}

export function inferConfig(dataset: ParsedDataset): OpenEnaConfig {
  const { headers, rows } = dataset;
  const explicitUnitColumn = findHeader(headers, ["unit", "unit_id", "team_id", "participant_id", "student_id", "case_id"]);
  const nameColumn = findHeader(headers, ["name"]);
  const unitColumn = explicitUnitColumn ?? nameColumn ?? headers[0] ?? "";
  const conversationColumn = chooseHeader(
    headers,
    ["conversation", "conversation_id", "session_id", "discussion_id", "document_id", "lesson"],
    Math.min(1, headers.length - 1),
  );
  const groupColumn = findHeader(headers, ["group", "condition", "treatment", "cohort", "class"]) ?? null;
  const groupByUnit = new Map<string, string>();
  const unitSpansGroups = Boolean(!explicitUnitColumn && nameColumn && groupColumn && groupColumn !== unitColumn && rows.some((row) => {
    const unit = String(row[unitColumn] ?? "");
    const group = String(row[groupColumn] ?? "");
    const previous = groupByUnit.get(unit);
    groupByUnit.set(unit, group);
    return previous !== undefined && previous !== group;
  }));
  const unitColumns = unitSpansGroups && groupColumn ? [groupColumn, unitColumn] : [unitColumn];
  const conversationColumns = unitSpansGroups
    ? [...new Set([...unitColumns, conversationColumn])]
    : [conversationColumn];
  const oneRowPerConversation = new Set(rows.map((row) => JSON.stringify(
    conversationColumns.map((column) => row[column] ?? null),
  ))).size === rows.length;
  const excluded = new Set([...unitColumns, ...conversationColumns, ...(groupColumn ? [groupColumn] : [])]);
  const codes: string[] = [];
  for (const header of headers) {
    if (!excluded.has(header) && isBinaryCode(rows, header)) {
      codes.push(header);
      if (codes.length === MAX_CODE_COLUMNS) break;
    }
  }

  const rotation = officialComparisonRotation(dataset, {
    groupColumn,
    model: "EndPoint",
    currentRotation: "svd",
  });

  return {
    analysisKind: "ena",
    unitColumns,
    conversationColumns,
    groupColumn,
    codes,
    model: "EndPoint",
    window: oneRowPerConversation ? "Conversation" : "MovingStanzaWindow",
    windowSizeBack: 5,
    windowSizeForward: 0,
    weightBy: "binary",
    rotation,
    referenceRotationId: null,
    centerAlignToOrigin: true,
  };
}

export function officialComparisonRotation(
  dataset: ParsedDataset | null,
  options: {
    groupColumn: string | null;
    model: OpenEnaConfig["model"];
    currentRotation: OpenEnaConfig["rotation"];
  },
): OpenEnaConfig["rotation"] {
  if (options.model !== "EndPoint") return "svd";
  if (options.currentRotation === "reference") return "reference";
  if (!dataset || !options.groupColumn || !dataset.headers.includes(options.groupColumn)) return "svd";

  const groups = new Set<string>();
  for (const row of dataset.rows) {
    const group = String(row[options.groupColumn] ?? "").trim();
    if (!group) return "svd";
    groups.add(group);
    if (groups.size > 2) return "svd";
  }
  return groups.size === 2 ? "mean" : "svd";
}

export function validateConfig(dataset: ParsedDataset, config: OpenEnaConfig): string[] {
  const errors: string[] = [];
  let analysisKind: "ena" | "ona";
  try {
    analysisKind = analysisKindFor(config);
  } catch (error) {
    return [error instanceof Error ? error.message : "Open ENA analysis kind is invalid."];
  }
  let canonicalConfig: ReturnType<typeof canonicalizeOpenEnaConfig> | null = null;
  try {
    canonicalConfig = canonicalizeOpenEnaConfig(config);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Open ENA configuration canonicalization failed.");
  }
  if (config.codes.length > MAX_CODE_COLUMNS) {
    return [`This browser release supports up to ${MAX_CODE_COLUMNS} code columns per run.`];
  }
  if (config.codes.length < 3) errors.push("Select at least three code columns.");
  if (config.rotation === "reference" && !config.referenceRotationId) {
    errors.push("Import and select a reference rotation before building this projection.");
  }
  if (config.rotation === "reference" && config.model !== "EndPoint") {
    errors.push("Reference projection is currently limited to endpoint models.");
  }
  if (config.rotation === "mean" && config.model !== "EndPoint") {
    errors.push("Mean rotation is currently limited to endpoint models so every analytic unit receives equal weight.");
  }
  if (analysisKind === "ona") {
    if (config.model !== "EndPoint") errors.push("ONA is currently limited to endpoint models.");
    if (config.window !== "MovingStanzaWindow") errors.push("ONA requires the moving stanza window.");
    if (!(config.windowSizeBack === Number.POSITIVE_INFINITY
      || (Number.isInteger(config.windowSizeBack) && config.windowSizeBack >= 1))) {
      errors.push("ONA backward window size must be an integer of at least 1 or Infinity.");
    }
    if (config.windowSizeForward !== 0) errors.push("ONA requires the forward window size to be zero.");
    if (config.weightBy !== "sum") errors.push("ONA requires raw sum weighting.");
    if (config.rotation !== "svd") errors.push("ONA currently requires SVD rotation.");
    if (config.referenceRotationId !== null) errors.push("ONA cannot retain or import a reference rotation.");
  }
  const reservedColumns = new Set(["ENA_UNIT", "TRAJ_UNIT", "OPEN_ENA_POINT_INDEX"]);
  const edgeColumns = new Set<string>();
  const edgeColumnNames: string[] = [];
  const targetStart = analysisKind === "ona" ? 0 : 1;
  for (let target = targetStart; target < config.codes.length; target += 1) {
    const sourceEnd = analysisKind === "ona" ? config.codes.length : target;
    for (let source = 0; source < sourceEnd; source += 1) {
      const edgeName = `${config.codes[source]} & ${config.codes[target]}`;
      edgeColumns.add(edgeName);
      edgeColumnNames.push(edgeName);
    }
  }
  for (const [label, columns] of [
    ["Unit", config.unitColumns],
    ["Conversation", config.conversationColumns],
  ] as const) {
    if (columns.length === 0) errors.push(`${label} requires at least one coded-data column.`);
    if (new Set(columns).size !== columns.length) errors.push(`${label} identity columns must be unique.`);
    for (const column of columns) {
      if (!dataset.headers.includes(column)) errors.push(`${label} must reference a coded-data column.`);
      else if (dataset.rows.some((row) => row[column] === null || row[column] === undefined || row[column] === "")) errors.push(`${label} column “${column}” contains missing values.`);
    }
  }
  if (config.groupColumn) {
    if (!dataset.headers.includes(config.groupColumn)) errors.push("Group must reference a coded-data column.");
    else if (dataset.rows.some((row) => row[config.groupColumn as string] === null || row[config.groupColumn as string] === "")) errors.push(`Group column “${config.groupColumn}” contains missing values.`);
  }
  const delimiterGuardColumns = analysisKind === "ona"
    ? config.unitColumns
    : [...config.unitColumns, ...config.conversationColumns];
  if (delimiterGuardColumns.every((column) => dataset.headers.includes(column))) {
    for (const row of dataset.rows) {
      if (delimiterGuardColumns.some((column) => String(row[column] ?? "").includes("::"))) {
        errors.push(analysisKind === "ona"
          ? "ONA unit component values cannot contain “::”, which jENA reserves when building composite unit identities."
          : "Unit and conversation component values cannot contain “::”, which jENA reserves when building composite identities.");
        break;
      }
    }
  }
  const validUnitColumns = config.unitColumns.length > 0
    && config.unitColumns.every((column) => dataset.headers.includes(column))
    && dataset.rows.every((row) => config.unitColumns.every((column) => (
      row[column] !== null && row[column] !== undefined && row[column] !== ""
    )));
  if (analysisKind === "ona" && validUnitColumns) {
    const typedIdentityByDisplay = new Map<string, string>();
    for (const row of dataset.rows) {
      const display = compositeValue(row, config.unitColumns);
      const identity = typedTupleIdentity(row, config.unitColumns, "ONA unit column");
      const previous = typedIdentityByDisplay.get(display);
      if (previous !== undefined && previous !== identity) {
        errors.push("ONA unit identity is ambiguous because distinct typed unit tuples produce the same display label; use unambiguous unit values or columns.");
        break;
      }
      typedIdentityByDisplay.set(display, identity);
    }
  }
  const structuralColumns = [...new Set([...config.unitColumns, ...config.conversationColumns])];
  const mappedColumns = [...structuralColumns, ...(config.groupColumn ? [config.groupColumn] : [])];
  for (const column of [...mappedColumns, ...config.codes]) {
    if (reservedColumns.has(column)) errors.push(`Column “${column}” uses a name reserved by jENA or Open ENA.`);
  }
  for (const column of mappedColumns) {
    if (/^(?:SVD|MR)\d+$/i.test(column)) errors.push(`Model field “${column}” collides with a jENA rotation column.`);
  }
  if (config.codes.some((code) => code.includes(" & ")) || new Set(edgeColumnNames).size !== edgeColumnNames.length) {
    errors.push("Code names cannot contain “ & ” because jENA uses it to name network edges.");
  }
  if (mappedColumns.some((column) => edgeColumns.has(column))) {
    errors.push("A mapped model field collides with a jENA-generated edge name.");
  }
  if (new Set(config.codes).size !== config.codes.length) errors.push("Code columns must be unique.");
  for (const code of config.codes) {
    if (!dataset.headers.includes(code)) errors.push(`Code “${code}” is not in the dataset.`);
    if (mappedColumns.includes(code)) errors.push(`Code “${code}” is already used as a model field.`);
    const invalid = dataset.rows.some((row) => (
      analysisKind === "ona" ? rawCodeCount(row[code]) : binaryValue(row[code])
    ) === null);
    if (invalid) {
      errors.push(analysisKind === "ona"
        ? `Code “${code}” must contain only finite nonnegative counts.`
        : `Code “${code}” must contain only 0/1 or true/false values.`);
    } else if (!dataset.rows.some((row) => (
      analysisKind === "ona" ? (rawCodeCount(row[code]) ?? 0) > 0 : isActiveCode(row[code])
    ))) {
      errors.push(`Code “${code}” has no active values.`);
    }
  }
  if (config.groupColumn && validUnitColumns && dataset.headers.includes(config.groupColumn)) {
    const groupColumn = config.groupColumn;
    const groupByUnit = new Map<string, string>();
    for (const row of dataset.rows) {
      const unit = analysisIdentity(row, config.unitColumns, analysisKind, "ONA unit column");
      const group = String(row[groupColumn] ?? "");
      const previous = groupByUnit.get(unit);
      if (previous !== undefined && previous !== group) {
        errors.push(`Comparison group “${groupColumn}” must be stable within each unit; at least one analytic unit maps to multiple group values.`);
        break;
      }
      groupByUnit.set(unit, group);
    }
  }
  if (analysisKind === "ena"
    && (!Number.isInteger(config.windowSizeBack) || config.windowSizeBack < 0 || config.windowSizeBack > 100)) {
    errors.push("The backward window must be an integer from 0 to 100.");
  }
  if (analysisKind === "ena"
    && (!Number.isInteger(config.windowSizeForward) || config.windowSizeForward < 0 || config.windowSizeForward > 100)) {
    errors.push("The forward window must be an integer from 0 to 100.");
  }
  if (analysisKind === "ona" && canonicalConfig?.orderPolicy) {
    if (canonicalConfig.orderPolicy.kind === "columns") {
      for (const column of canonicalConfig.orderPolicy.columns) {
        if (!dataset.headers.includes(column)) errors.push(`ONA order column “${column}” is not in the dataset.`);
      }
    }
    try {
      orderRowsForOpenEna(dataset.rows, canonicalConfig.conversationColumns, canonicalConfig.orderPolicy);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "ONA row ordering is invalid.");
    }
  }
  if (config.groupColumn && dataset.headers.includes(config.groupColumn)) {
    const groupColumn = config.groupColumn;
    const groups = new Set(dataset.rows.map((row) => String(row[groupColumn] ?? "")));
    if (groups.size > MAX_GROUPS) {
      errors.push(`This visual research release supports up to ${MAX_GROUPS} comparison groups per model.`);
    }
    if (config.rotation === "mean" && groups.size !== 2) {
      errors.push("Mean rotation requires exactly two comparison groups.");
    }
  } else if (config.rotation === "mean") {
    errors.push("Mean rotation requires a comparison group with exactly two values.");
  }
  if (
    validUnitColumns
    && config.codes.length >= 2
  ) {
    const projectedRowCount = config.model === "EndPoint" || analysisKind === "ona"
      ? new Set(dataset.rows.map((row) => analysisIdentity(
          row,
          config.unitColumns,
          analysisKind,
          "ONA unit column",
        ))).size
      : new Set(dataset.rows.map((row) => analysisIdentity(
          row,
          [...config.unitColumns, ...config.conversationColumns],
          analysisKind,
          "ONA projected identity column",
        ))).size;
    const edgeCount = analysisKind === "ona"
      ? config.codes.length * config.codes.length
      : config.codes.length * (config.codes.length - 1) / 2;
    const modeledEdgeCells = edgeCount * (dataset.rows.length + projectedRowCount * 3);
    if (modeledEdgeCells > MAX_MODELED_EDGE_CELLS) {
      errors.push(analysisKind === "ona"
        ? `This ONA configuration exceeds the browser model-size safety budget (${modeledEdgeCells.toLocaleString()} derived directed edge cells including diagonal; limit ${MAX_MODELED_EDGE_CELLS.toLocaleString()}). Reduce rows, codes, or unique units.`
        : `This configuration exceeds the browser model-size safety budget (${modeledEdgeCells.toLocaleString()} derived edge cells; limit ${MAX_MODELED_EDGE_CELLS.toLocaleString()}). Reduce rows, codes, or unique units.`);
    }
  }
  if (errors.length === 0) {
    if (analysisKind === "ona" && !hasFiniteOrderedConnectionNumerics(dataset, config)) {
      errors.push("ONA raw counts exceed the finite numeric safety range for ordered connection accumulation.");
    } else if (analysisKind === "ona" && !hasOrderedConnection(dataset, config)) {
      errors.push("The selected codes do not form an enabled ordered connection within one typed horizon and backward window.");
    } else if (analysisKind === "ena" && !hasCoOccurrence(dataset, config)) {
      errors.push("The selected codes do not co-occur within the configured conversation window.");
    }
  }
  return [...new Set(errors)];
}
