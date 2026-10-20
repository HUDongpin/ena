import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import writeXlsxFile from "write-excel-file/universal";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";

const options = { name: "serial-dates.xlsx", source: "upload" as const };
async function workbook(values: Array<number | string>, epoch1904 = false, dateStyle = true) {
  const rows = values.map((value, i) => [{ value, type: typeof value === "string" ? String : Number, ...(typeof value === "number" && dateStyle ? { format: "mm/dd/yyyy" } : {}) }, { value: "h", type: String }, ...[[1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]][i % 4].map(value => ({ value, type: Number }))]);
  const bytes = await (await writeXlsxFile([["unit", "horizon", "A", "B", "C"], ...rows]).toBlob()).arrayBuffer();
  const files = unzipSync(new Uint8Array(bytes));
  files["xl/workbook.xml"] = strToU8(strFromU8(files["xl/workbook.xml"]).replace("<workbookPr/>", `<workbookPr date1904="${epoch1904 ? "1" : "0"}"/>`));
  let worksheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  values.forEach((value, i) => {
    if (typeof value === "string") worksheet = worksheet.replace(new RegExp(`<c r="A${i + 2}" t="s"><v>\\d+</v></c>`, "u"), `<c r="A${i + 2}" t="d"><v>${value}</v></c>`);
  });
  files["xl/worksheets/sheet1.xml"] = strToU8(worksheet);
  return zipSync(files).buffer as ArrayBuffer;
}

test("1900 serial days 1 through 59 and exact quarter days preserve the Excel calendar", async () => {
  const values = Array.from({ length: 59 }, (_v, i) => [i + 1, i + 1.25, i + 1.5, i + 1.75]).flat();
  const parsed = await parseXlsx(await workbook(values), options);
  const expected = values.map(value => new Date(Date.UTC(1900, 0, Math.floor(value), (value % 1) * 24)).toISOString());
  assert.deepEqual(parsed.dataset.rows.map(row => row.unit), expected);
});

test("fictional 1900-02-29 serials reject instead of aliasing a real calendar Unit", async () => {
  for (const value of [60, 60.25, 60.5, 60.999999]) {
    await assert.rejects(parseXlsx(await workbook([value]), options), /date.*1900-02-29|1900-02-29.*date/iu, String(value));
  }
});

test("the 1904 epoch, modern dates, unformatted numbers and existing pre-epoch behavior stay unchanged", async () => {
  const controls: Array<[number[], boolean, string[]]> = [
    [[0, 1, 59, 60, 60.5, 61, 39267], true, ["1904-01-01T00:00:00.000Z", "1904-01-02T00:00:00.000Z", "1904-02-29T00:00:00.000Z", "1904-03-01T00:00:00.000Z", "1904-03-01T12:00:00.000Z", "1904-03-02T00:00:00.000Z", "2011-07-05T00:00:00.000Z"]],
    [[-1, 0, 0.5, 61, 61.5, 25569, 40729, 45000.5], false, ["1899-12-29T00:00:00.000Z", "1899-12-30T00:00:00.000Z", "1899-12-30T12:00:00.000Z", "1900-03-01T00:00:00.000Z", "1900-03-01T12:00:00.000Z", "1970-01-01T00:00:00.000Z", "2011-07-05T00:00:00.000Z", "2023-03-15T12:00:00.000Z"]],
  ];
  for (const [values, epoch, expected] of controls) assert.deepEqual((await parseXlsx(await workbook(values, epoch), options)).dataset.rows.map(row => row.unit), expected);
  assert.deepEqual((await parseXlsx(await workbook([1, 59, 60, 60.5, 61], false, false), options)).dataset.rows.map(row => row.unit), [1, 59, 60, 60.5, 61]);
});

test("serial January 1 cannot merge with an independent December 31 scientific Unit", async () => {
  const native = await parseXlsx(await workbook([1, "1899-12-31T00:00:00Z", "1900-01-02T00:00:00Z", "1900-01-03T00:00:00Z"]), options);
  const control = await parseXlsx(await workbook(["1900-01-01T00:00:00Z", "1899-12-31T00:00:00Z", "1900-01-02T00:00:00Z", "1900-01-03T00:00:00Z"]), options);
  const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };
  for (const parsed of [native, control]) {
    const datasetSha256 = await sha256TextV3(parsed.normalizedText);
    const compiled = await compileStandardDraftV3(parsed.dataset, datasetSha256, draft);
    assert.equal(compiled.status, "ready"); if (compiled.status !== "ready") throw new Error("Expected ready");
    const plan = await buildStandardExecutionPlanV3({ dataset: parsed.dataset, datasetSha256, compileResult: compiled, reference: null });
    const runtime = runStandardPlanV3(plan);
    assert.equal(runtime.set.points.length, 4);
    assert.deepEqual(runtime.set.connectionCounts.map(row => runtime.set.adjacencyKey.map(edge => row[edge.name])).sort(), [[1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 1, 1]].sort());
  }
  assert.equal(native.normalizedText, control.normalizedText);
});
