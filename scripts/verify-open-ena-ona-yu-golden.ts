#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Row } from "jena-js";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv, validateConfig } from "../lib/open-ena/csv";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import type { OpenEnaConfig } from "../lib/open-ena/types";

export const DEFAULT_YU_ONA_WORKBOOK_PATH =
  "/Volumes/Starship/ENA的衍生文件/ONA/Yu_ena_coded_data_0712.xlsx";
export const DEFAULT_YU_ONA_GOLDEN_PATH =
  "/Volumes/Starship/ENA的衍生文件/ONA/ona_output/yu_within_student/ona_connection_counts.csv";

const EXPECTED_WORKBOOK_SHA256 =
  "f2132f8dc3e147609169472594a2031130be23eab4a2ac0fb9adcb6d9d667042";
const EXPECTED_GOLDEN_SHA256 =
  "b4c0a6921ece7df51d846b3864e239747062da304a212aa0e2402d4a85074253";
const CODES = ["EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"] as const;
const EXPECTED_EDGE_COLUMNS = CODES.flatMap((response) => (
  CODES.map((ground) => `${ground} & ${response}`)
));

export interface YuOnaGoldenVerification {
  schemaVersion: 1;
  privacy: {
    sourceFilesCommitted: false;
    sourceRowsReturned: false;
    unitIdentifiersReturned: false;
    aggregateSummaryOnly: true;
  };
  inputs: {
    workbookSha256: string;
    goldenSha256: string;
  };
  contract: {
    analysisKind: "ona";
    networkType: "ordered";
    unitColumns: ["Group", "Name"];
    horizonColumns: ["Group", "Name"];
    orderColumns: ["Lesson"];
    orderComparators: { Lesson: "string" };
    lessonRuntimeType: "string";
    lessonDistinctValueCount: number;
    maximumRowsPerHorizon: number;
    window: "MovingStanzaWindow";
    windowSizeBack: 2;
    windowSizeForward: 0;
    effectivePreviousRows: number;
    weightBy: "sum";
    rotation: "svd";
  };
  result: {
    sourceRows: number;
    units: number;
    codes: string[];
    directedDimensions: number;
    goldenConnectionTotal: number;
    openEnaConnectionTotal: number;
    goldenZeroNetworks: number;
    openEnaZeroNetworks: number;
    mismatchedCells: number;
    maximumAbsoluteDifference: number;
  };
}

export interface YuOnaGoldenOptions {
  workbookPath?: string;
  goldenPath?: string;
}

function requireContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function exactStrings(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function rowIdentity(row: Row) {
  const group = row.Group;
  const name = row.Name;
  requireContract(
    typeof group === "string" && group.length > 0
      && typeof name === "string" && name.length > 0,
    "Yu ONA verification requires non-empty Group and Name values for every unit.",
  );
  // This key remains inside the verifier. It is never returned, logged, or
  // included in an error, so the public result is aggregate-only.
  return JSON.stringify([["Group", group], ["Name", name]]);
}

function finiteNumber(row: Row, column: string, surface: "golden" | "Open ENA") {
  const value = row[column];
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  requireContract(
    Number.isFinite(number),
    `Yu ONA ${surface} contains a non-finite directed connection value.`,
  );
  return number;
}

function uniqueRowsByUnit(rows: readonly Row[], surface: "golden" | "Open ENA") {
  const byUnit = new Map<string, Row>();
  for (const row of rows) {
    const key = rowIdentity(row);
    requireContract(
      !byUnit.has(key),
      `Yu ONA ${surface} contains a duplicate Group + Name unit.`,
    );
    byUnit.set(key, row);
  }
  return byUnit;
}

function connectionSummary(rows: readonly Row[], surface: "golden" | "Open ENA") {
  let total = 0;
  let zeroNetworks = 0;
  for (const row of rows) {
    let unitTotal = 0;
    for (const edge of EXPECTED_EDGE_COLUMNS) {
      const value = finiteNumber(row, edge, surface);
      requireContract(value >= 0, `Yu ONA ${surface} contains a negative directed connection value.`);
      total += value;
      unitTotal += value;
    }
    if (unitTotal === 0) zeroNetworks += 1;
  }
  return { total, zeroNetworks };
}

function workbookArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export function buildYuOnaConfig(): OpenEnaConfig {
  const codes = [...CODES];
  return {
    analysisKind: "ona",
    unitColumns: ["Group", "Name"],
    conversationColumns: ["Group", "Name"],
    groupColumn: "Group",
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: false,
    orderPolicy: {
      kind: "columns",
      columns: ["Lesson"],
      // Open ENA's actual XLSX parser preserves this workbook's Lesson cells
      // as strings (including their source whitespace), so string comparison
      // is the explicit lossless runtime contract for this golden run.
      comparators: { Lesson: "string" },
    },
    directionalMask: createDirectionalMask(codes),
  };
}

export async function verifyOpenEnaOnaYuGolden(
  options: YuOnaGoldenOptions = {},
): Promise<YuOnaGoldenVerification> {
  const workbookPath = options.workbookPath ?? DEFAULT_YU_ONA_WORKBOOK_PATH;
  const goldenPath = options.goldenPath ?? DEFAULT_YU_ONA_GOLDEN_PATH;
  const [workbookBytes, goldenBytes] = await Promise.all([
    readFile(workbookPath),
    readFile(goldenPath),
  ]);
  const workbookSha256 = sha256(workbookBytes);
  const goldenSha256 = sha256(goldenBytes);
  requireContract(
    workbookSha256 === EXPECTED_WORKBOOK_SHA256,
    "Yu ONA workbook SHA-256 does not match the reviewed source artifact.",
  );
  requireContract(
    goldenSha256 === EXPECTED_GOLDEN_SHA256,
    "Yu ONA golden CSV SHA-256 does not match the reviewed R-derived artifact.",
  );

  const parsedWorkbook = await parseXlsx(workbookArrayBuffer(workbookBytes), {
    name: "Yu_ena_coded_data_0712.xlsx",
    sizeBytes: workbookBytes.byteLength,
    source: "upload",
  });
  const dataset = parsedWorkbook.dataset;
  requireContract(
    exactStrings(dataset.headers, ["Group", "Lesson", "Name", ...CODES]),
    "Yu ONA workbook columns or code order differ from the reviewed contract.",
  );
  requireContract(dataset.rows.length === 174, "Yu ONA workbook must contain 174 source rows.");

  const lessonTypes = new Set(dataset.rows.map((row) => typeof row.Lesson));
  const lessonValues = new Set(dataset.rows.map((row) => row.Lesson));
  requireContract(
    lessonTypes.size === 1 && lessonTypes.has("string"),
    "Yu ONA Lesson cells must remain strings under the production XLSX parser.",
  );
  requireContract(lessonValues.size === 2, "Yu ONA workbook must contain exactly two Lesson values.");

  const rowsPerHorizon = new Map<string, number>();
  for (const row of dataset.rows) {
    const key = rowIdentity(row);
    rowsPerHorizon.set(key, (rowsPerHorizon.get(key) ?? 0) + 1);
  }
  const maximumRowsPerHorizon = Math.max(...rowsPerHorizon.values());
  requireContract(rowsPerHorizon.size === 87, "Yu ONA workbook must contain 87 Group + Name units.");
  requireContract(
    maximumRowsPerHorizon === 2
      && [...rowsPerHorizon.values()].every((count) => count === 2),
    "Yu ONA within-student horizons must contain exactly two ordered rows each.",
  );

  const config = buildYuOnaConfig();
  const validationErrors = validateConfig(dataset, config);
  requireContract(
    validationErrors.length === 0,
    `Yu ONA configuration failed production validation: ${validationErrors.join(" ")}`,
  );
  const result = analyzeDataset(dataset, config);
  requireContract(result.set.networkType === "ordered", "Yu ONA run did not use jENA's ordered runtime.");
  requireContract(
    exactStrings(result.set.codes, CODES),
    "Yu ONA runtime code order differs from the reviewed contract.",
  );
  requireContract(
    exactStrings(result.set.codeColumns, EXPECTED_EDGE_COLUMNS)
      && result.set.adjacencyKey.length === CODES.length ** 2
      && result.set.adjacencyKey.every((edge, edgeIndex) => {
        const sourceIndex = edgeIndex % CODES.length;
        const targetIndex = Math.floor(edgeIndex / CODES.length);
        return edge.sourceIndex === sourceIndex
          && edge.targetIndex === targetIndex
          && edge.source === CODES[sourceIndex]
          && edge.target === CODES[targetIndex]
          && edge.name === EXPECTED_EDGE_COLUMNS[edgeIndex];
      }),
    "Yu ONA runtime adjacency is not the expected response-major, ground-minor p-squared layout.",
  );
  const runtimeWindowRows = result.set.rowWindowProvenance;
  requireContract(
    Array.isArray(runtimeWindowRows) && runtimeWindowRows.length === dataset.rows.length,
    "Yu ONA ordered runtime did not retain one window-provenance record per response row.",
  );
  const effectivePreviousRows = Math.max(...runtimeWindowRows.map((row) => row.priorRowCount));
  requireContract(
    effectivePreviousRows === 1,
    "Yu ONA ordered runtime must expose at most one prior row in every two-row within-student horizon.",
  );

  const golden = parseCsv(goldenBytes.toString("utf8"), {
    name: "ona_connection_counts.csv",
    sizeBytes: goldenBytes.byteLength,
    source: "sample",
  });
  requireContract(
    exactStrings(golden.headers.slice(0, 3), ["Group", "Name", "ENA_UNIT"])
      && exactStrings(golden.headers.slice(3), EXPECTED_EDGE_COLUMNS),
    "Yu ONA golden CSV columns or directed-edge order differ from the reviewed contract.",
  );
  requireContract(golden.rows.length === 87, "Yu ONA golden CSV must contain 87 unit networks.");
  requireContract(
    result.set.connectionCounts.length === 87,
    "Open ENA Yu ONA output must contain 87 unit connection-count networks.",
  );

  const goldenByUnit = uniqueRowsByUnit(golden.rows, "golden");
  const openEnaByUnit = uniqueRowsByUnit(result.set.connectionCounts, "Open ENA");
  requireContract(
    goldenByUnit.size === openEnaByUnit.size
      && [...goldenByUnit.keys()].every((key) => openEnaByUnit.has(key)),
    "Open ENA and the Yu ONA golden CSV do not contain the same Group + Name unit set.",
  );

  let mismatchedCells = 0;
  let maximumAbsoluteDifference = 0;
  const mismatchedEdgeColumns = new Set<string>();
  for (const [key, goldenRow] of goldenByUnit) {
    const openEnaRow = openEnaByUnit.get(key);
    requireContract(openEnaRow, "Open ENA is missing a Yu ONA unit represented in the golden CSV.");
    for (const edge of EXPECTED_EDGE_COLUMNS) {
      const expected = finiteNumber(goldenRow, edge, "golden");
      const actual = finiteNumber(openEnaRow, edge, "Open ENA");
      if (actual !== expected) {
        mismatchedCells += 1;
        maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, Math.abs(actual - expected));
        mismatchedEdgeColumns.add(edge);
      }
    }
  }
  requireContract(
    mismatchedCells === 0,
    `Open ENA differs from the Yu ONA gold standard in ${mismatchedCells} cells across ${mismatchedEdgeColumns.size} directed edge columns; maximum absolute difference is ${maximumAbsoluteDifference}. No unit identities or unit-level values are disclosed.`,
  );

  const goldenSummary = connectionSummary(golden.rows, "golden");
  const openEnaSummary = connectionSummary(result.set.connectionCounts, "Open ENA");
  requireContract(
    goldenSummary.total === 811 && goldenSummary.zeroNetworks === 3,
    "The reviewed Yu ONA golden aggregate must total 811 with 3 zero networks.",
  );
  requireContract(
    openEnaSummary.total === goldenSummary.total
      && openEnaSummary.zeroNetworks === goldenSummary.zeroNetworks,
    "Open ENA Yu ONA aggregate totals differ from the reviewed gold standard.",
  );

  return {
    schemaVersion: 1,
    privacy: {
      sourceFilesCommitted: false,
      sourceRowsReturned: false,
      unitIdentifiersReturned: false,
      aggregateSummaryOnly: true,
    },
    inputs: { workbookSha256, goldenSha256 },
    contract: {
      analysisKind: "ona",
      networkType: "ordered",
      unitColumns: ["Group", "Name"],
      horizonColumns: ["Group", "Name"],
      orderColumns: ["Lesson"],
      orderComparators: { Lesson: "string" },
      lessonRuntimeType: "string",
      lessonDistinctValueCount: lessonValues.size,
      maximumRowsPerHorizon,
      window: "MovingStanzaWindow",
      windowSizeBack: 2,
      windowSizeForward: 0,
      effectivePreviousRows,
      weightBy: "sum",
      rotation: "svd",
    },
    result: {
      sourceRows: dataset.rows.length,
      units: result.set.connectionCounts.length,
      codes: [...result.set.codes],
      directedDimensions: result.set.adjacencyKey.length,
      goldenConnectionTotal: goldenSummary.total,
      openEnaConnectionTotal: openEnaSummary.total,
      goldenZeroNetworks: goldenSummary.zeroNetworks,
      openEnaZeroNetworks: openEnaSummary.zeroNetworks,
      mismatchedCells,
      maximumAbsoluteDifference,
    },
  };
}

function cliOptions(argv: readonly string[]): YuOnaGoldenOptions | "help" {
  const options: YuOnaGoldenOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return "help";
    if (argument !== "--workbook" && argument !== "--golden") {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const path = argv[index + 1];
    if (!path) throw new Error(`${argument} requires a local file path.`);
    if (argument === "--workbook") options.workbookPath = path;
    else options.goldenPath = path;
    index += 1;
  }
  return options;
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  if (options === "help") {
    process.stdout.write([
      "Usage: tsx scripts/verify-open-ena-ona-yu-golden.ts [options]",
      "",
      "Options:",
      "  --workbook <path>  Local Yu XLSX source (not copied or committed)",
      "  --golden <path>    Local R-derived connection-count CSV (not copied or committed)",
      "  -h, --help         Show this help",
      "",
    ].join("\n"));
    return;
  }
  const verification = await verifyOpenEnaOnaYuGolden(options);
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Yu ONA verification failed.";
    process.stderr.write(`Yu ONA golden verification failed: ${message}\n`);
    process.exitCode = 1;
  });
}
