import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset, buildManifest } from "../lib/open-ena/analyze";
import { inferConfig } from "../lib/open-ena/csv";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { buildReferenceRotationPackage } from "../lib/open-ena/reference";
import type { ParsedDataset } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const workspace = readFileSync(
  join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
  "utf8",
);

type SpreadsheetCell = string | number | boolean | Date | null;
type SpreadsheetModule = {
  codedDataFileKind(name: string): "csv" | "xlsx";
  datasetFromSpreadsheetRows(
    rows: SpreadsheetCell[][],
    options: { name: string; sizeBytes?: number; source: ParsedDataset["source"] },
  ): ParsedDataset;
  parseXlsx(
    buffer: ArrayBuffer,
    options: { name: string; sizeBytes?: number; source: ParsedDataset["source"] },
  ): Promise<{ dataset: ParsedDataset; normalizedText: string }>;
};

const spreadsheetModuleUrl = new URL("../lib/open-ena/spreadsheet.ts", import.meta.url).href;

async function spreadsheetModule(): Promise<SpreadsheetModule> {
  const loaded = await import(spreadsheetModuleUrl).catch(() => null);
  assert.ok(
    loaded,
    "CSV/XLSX ingestion needs a browser-local lib/open-ena/spreadsheet.ts implementation",
  );
  assert.equal(typeof loaded.codedDataFileKind, "function");
  assert.equal(typeof loaded.datasetFromSpreadsheetRows, "function");
  assert.equal(typeof loaded.parseXlsx, "function");
  return loaded as SpreadsheetModule;
}

test("the coded-data picker accepts CSV and XLSX, including their browser MIME types", () => {
  const acceptValue = workspace.match(
    /ref=\{fileInputRef\}[\s\S]*?accept="([^"]+)"/,
  )?.[1];
  assert.ok(acceptValue, "the coded-data file picker must declare accepted formats");

  const accepted = new Set(acceptValue.split(",").map((value) => value.trim()));
  assert.equal(accepted.has(".csv"), true);
  assert.equal(accepted.has(".xlsx"), true);
  assert.equal(accepted.has("text/csv"), true);
  assert.equal(
    accepted.has("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    true,
  );
  assert.equal(accepted.has(".xls"), false, "legacy XLS is not part of the supported contract");
});

test("English, Simplified Chinese, and Traditional Chinese all disclose CSV and XLSX import", () => {
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    const { data, model, workspace: workspaceCopy } = getOpenEnaCopy(locale);
    for (const [surface, value] of [
      ["description", data.description],
      ["upload button", data.upload],
      ["upload hint", data.uploadHint],
      ["sequence note", model.sequenceNote],
      ["empty workspace", workspaceCopy.emptyText],
    ] as const) {
      assert.match(value, /CSV[\s\S]*XLSX/i, `${locale} ${surface} must name both formats`);
    }
  }
});

test("file-kind dispatch is case-insensitive and fails closed on unsupported extensions", async () => {
  const { codedDataFileKind } = await spreadsheetModule();

  assert.equal(codedDataFileKind("coded-data.csv"), "csv");
  assert.equal(codedDataFileKind("coded-data.CSV"), "csv");
  assert.equal(codedDataFileKind("coded-data.xlsx"), "xlsx");
  assert.equal(codedDataFileKind("coded-data.XLSX"), "xlsx");
  assert.throws(() => codedDataFileKind("coded-data.xls"), /CSV[\s\S]*XLSX/i);
  assert.throws(() => codedDataFileKind("coded-data.txt"), /CSV[\s\S]*XLSX/i);
  assert.throws(() => codedDataFileKind("coded-data"), /CSV[\s\S]*XLSX/i);
});

test("spreadsheet rows preserve typed cells, normalize blanks, and infer the Yu 0712 mapping", async () => {
  const { datasetFromSpreadsheetRows } = await spreadsheetModule();
  const rows: SpreadsheetCell[][] = [
    [" Group ", "Lesson", "Name", "EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"],
    ["Control", 1, "Alex", 1, true, 0, false, null, 0, 1],
    ["Experimental", 2, "Alex", 0, false, 1, true, 1, 1, 0],
    [null, null, null, null, null, null, null, null, null, null],
  ];
  const dataset = datasetFromSpreadsheetRows(rows, {
    name: "Yu_ena_coded_data_0712.xlsx",
    sizeBytes: 1_024,
    source: "upload",
  });

  assert.deepEqual(dataset.headers, ["Group", "Lesson", "Name", "EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"]);
  assert.equal(dataset.rows.length, 2, "a wholly blank trailing worksheet row is not coded data");
  assert.equal(dataset.rows[0].Group, "Control", "source row order must be preserved");
  assert.equal(dataset.rows[1].Group, "Experimental");
  assert.equal(dataset.rows[0].Lesson, 1, "finite numeric worksheet cells remain numbers");
  assert.equal(dataset.rows[0].ICT, true, "boolean worksheet cells remain booleans");
  assert.equal(dataset.rows[0].SR, null, "blank worksheet cells normalize to null");
  assert.equal(dataset.hashKind, "canonical-first-xlsx-worksheet-v1-sha256");

  const config = inferConfig(dataset);
  assert.deepEqual(config.unitColumns, ["Group", "Name"]);
  assert.deepEqual(config.conversationColumns, ["Group", "Name", "Lesson"]);
  assert.equal(config.groupColumn, "Group");
  assert.deepEqual(config.codes, ["EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"]);
  assert.equal(config.window, "Conversation");
  assert.equal(config.rotation, "mean");

  assert.throws(
    () => datasetFromSpreadsheetRows([
      ["unit", "conversation", "A"],
      ["u1", "c1", Number.NaN],
    ], { name: "non-finite.xlsx", source: "upload" }),
    /finite/i,
  );
});

test("spreadsheet import enforces the shared browser data limits", async () => {
  const { datasetFromSpreadsheetRows } = await spreadsheetModule();
  const options = { name: "guardrails.xlsx", source: "upload" as const };

  assert.throws(
    () => datasetFromSpreadsheetRows([["unit", "unit"], ["u1", "u1"]], options),
    /unique/i,
  );
  assert.throws(
    () => datasetFromSpreadsheetRows([["unit"], ["u1", "unexpected"]], options),
    /more cells/i,
  );
  assert.throws(
    () => datasetFromSpreadsheetRows([
      Array.from({ length: 257 }, (_, index) => `column-${index}`),
      Array.from({ length: 257 }, () => 0),
    ], options),
    /256 columns/i,
  );
  assert.throws(
    () => datasetFromSpreadsheetRows([
      ["unit"],
      ...Array.from({ length: 20_001 }, (_, index) => [`u${index}`]),
    ], options),
    /20,000 rows/i,
  );
  assert.throws(
    () => datasetFromSpreadsheetRows([["unit"], ["u1"]], {
      ...options,
      sizeBytes: 5 * 1024 * 1024 + 1,
    }),
    /5 MB/i,
  );
  assert.throws(
    () => datasetFromSpreadsheetRows([["unit", "recorded_at"], ["u1", new Date(Number.NaN)]], options),
    /invalid date/i,
  );
  assert.throws(
    () => datasetFromSpreadsheetRows([["unit"], ["x".repeat(5 * 1024 * 1024)]], options),
    /expands beyond the 5 MB/i,
  );
});

test("XLSX parsing rejects corrupt workbooks and declared archive expansion before decompression", async () => {
  const { parseXlsx } = await spreadsheetModule();
  await assert.rejects(
    () => parseXlsx(new Uint8Array(32).buffer, { name: "corrupt.xlsx", source: "upload" }),
    /valid \.xlsx/i,
  );

  const archive = new Uint8Array(68);
  const view = new DataView(archive.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint32(24, 64 * 1024 * 1024 + 1, true);
  view.setUint32(46, 0x06054b50, true);
  view.setUint16(54, 1, true);
  view.setUint16(56, 1, true);
  view.setUint32(58, 46, true);
  view.setUint32(62, 0, true);
  await assert.rejects(
    () => parseXlsx(archive.buffer, { name: "expanded.xlsx", source: "upload" }),
    /64 MB browser safety limit/i,
  );
});

// A minimal two-sheet XLSX fixture. The first sheet contains Yu-style coded
// data; the second deliberately carries a sentinel that must never be loaded.
const TWO_SHEET_XLSX_BASE64 =
  "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";

test("XLSX import reads only the first worksheet and emits deterministic normalized text", async () => {
  const { parseXlsx } = await spreadsheetModule();
  const bytes = Buffer.from(TWO_SHEET_XLSX_BASE64, "base64");
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const options = {
    name: "two-sheet-yu.xlsx",
    sizeBytes: bytes.byteLength,
    source: "upload" as const,
  };

  const first = await parseXlsx(arrayBuffer, options);
  const second = await parseXlsx(arrayBuffer, options);

  assert.deepEqual(first.dataset.headers, ["Group", "Lesson", "Name", "EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"]);
  assert.equal(first.dataset.rows.length, 2);
  assert.equal(first.dataset.hashKind, "canonical-first-xlsx-worksheet-v1-sha256");
  assert.deepEqual(first.dataset.rows.map((row) => row.Group), ["Control", "Experimental"]);
  assert.equal(first.dataset.headers.includes("DO_NOT_READ"), false);
  assert.equal(first.normalizedText.includes("DO_NOT_READ"), false);
  assert.equal(first.normalizedText.length > 0, true);
  assert.equal(first.normalizedText, second.normalizedText);

  const config = inferConfig(first.dataset);
  assert.deepEqual(config.unitColumns, ["Group", "Name"]);
  assert.deepEqual(config.conversationColumns, ["Group", "Name", "Lesson"]);
  assert.equal(config.groupColumn, "Group");
  assert.deepEqual(config.codes, ["EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"]);
  assert.equal(config.window, "Conversation");

  const result = analyzeDataset(first.dataset, config);
  const digest = "a".repeat(64);
  const manifest = buildManifest(first.dataset, config, result, digest);
  const reference = buildReferenceRotationPackage(first.dataset, config, result, digest);
  assert.equal(manifest.dataset.hashKind, "canonical-first-xlsx-worksheet-v1-sha256");
  assert.equal(reference.source.hashKind, "canonical-first-xlsx-worksheet-v1-sha256");
});
