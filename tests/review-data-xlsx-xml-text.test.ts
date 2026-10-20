import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const options = { name: "xml-text.xlsx", source: "upload" as const };
const inline = (coordinate: string, value: string) => `<c r="${coordinate}" t="inlineStr"><is><t>${value}</t></is></c>`;
function workbook(rows: string[], strings = "", extra: Record<string, string> = {}) {
  const files = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="book" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Data" sheetId="1" r:id="data"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="data" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="strings" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst xmlns="${ns}">${strings}</sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${ns}"><sheetData>${rows.map((cells, i) => `<row r="${i + 1}">${cells}</row>`).join("")}</sheetData></worksheet>`,
    ...extra,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)]))).buffer as ArrayBuffer;
}

test("XML comments preserve numeric, cached formula, shared-index and native date values", async () => {
  const strings = Array.from({ length: 11 }, (_v, i) => `<si><t>value-${i}</t></si>`).join("");
  const header = ["number", "formula", "shared", "date", "precise", "blank"].map((name, i) => inline("ABCDEF"[i] + "1", name)).join("");
  const row = '<c r="A2"><v>1<!-- split -->2</v></c><c r="B2" t="str"><f>ignored()</f><v>left<!-- split -->right</v></c><c r="C2" t="s"><v>1<!-- split -->0</v></c><c r="D2" t="d"><v>2024-03-<!-- split -->01</v></c><c r="E2" t="d"><v>2024-03-01T00:00:00.<!-- split -->001Z</v></c><c r="F2" t="d"><v/></c>';
  const parsed = await parseXlsx(workbook([header, row], strings), options);
  assert.deepEqual(parsed.dataset.rows[0], { number: 12, formula: "leftright", shared: "value-10", date: "2024-03-01T00:00:00.000Z", precise: "2024-03-01T00:00:00.001Z", blank: null });
});

test("CDATA reaches cell values literally while normal text entities decode once", async () => {
  const header = ["inline", "shared", "date", "number"].map((name, i) => inline("ABCD"[i] + "1", name)).join("");
  const fragment = '<![CDATA[<&amp;>漢😊]]>&amp;tail';
  const row = inline("A2", fragment) + '<c r="B2" t="s"><v>0</v></c><c r="C2" t="d"><v><![CDATA[2024-03-]]>01</v></c><c r="D2"><v><![CDATA[1]]>2</v></c>';
  const parsed = await parseXlsx(workbook([header, row], `<si><t>${fragment}</t></si>`), options);
  assert.deepEqual(parsed.dataset.rows[0], { inline: "<&amp;>漢😊&tail", shared: "<&amp;>漢😊&tail", date: "2024-03-01T00:00:00.000Z", number: 12 });
  await assert.rejects(parseXlsx(workbook([inline("A1", "date"), '<c r="A2" t="d"><v>2024-02-<![CDATA[30]]>T00:00:00Z</v></c>']), options), /invalid calendar date/iu);
});

test("plain and rich strings reset between cells/items and omit phonetic text", async () => {
  const rich = '<r><t>ri<!-- split -->ch</t></r><rPh sb="0" eb="4"><t>PHONETIC</t></rPh><r><t><![CDATA[<&amp;>]]>tail</t></r>';
  const header = ["inline", "shared", "plain", "empty", "next"].map((name, i) => inline("ABCDE"[i] + "1", name)).join("");
  const row = `<c r="A2" t="inlineStr"><is>${rich}</is></c><c r="B2" t="s"><v>0</v></c>` + inline("C2", "p<!-- split -->lain") + inline("D2", "") + '<c r="E2" t="s"><v>1</v></c>';
  const parsed = await parseXlsx(workbook([header, row], `<si>${rich}</si><si><t>next</t></si>`), options);
  assert.deepEqual(parsed.dataset.rows[0], { inline: "rich<&amp;>tail", shared: "rich<&amp;>tail", plain: "plain", empty: null, next: "next" });
});

for (const mode of ["inline", "shared"] as const) test(`fragmented ${mode} Unit names cannot merge during the complete scientific pipeline`, async () => {
  const header = ["unit", "horizon", "A", "B", "C"].map((name, i) => inline("ABCDE"[i] + "1", name)).join("");
  const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };
    const units = ["left<!-- split -->x", "right<!-- split -->x", "third", "fourth"];
    const rows = units.map((unit, i) => (mode === "inline" ? inline(`A${i + 2}`, unit) : `<c r="A${i + 2}" t="s"><v>${i}</v></c>`) + inline(`B${i + 2}`, "h") + [[1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]][i].map((value, j) => `<c r="${"CDE"[j]}${i + 2}"><v>${value}</v></c>`).join(""));
    const parsed = await parseXlsx(workbook([header, ...rows], units.map(unit => `<si><t>${unit}</t></si>`).join(""), { "xl/worksheets/unused.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="d"><v>INVALID</v></c></row></sheetData></worksheet>' }), options);
    const datasetSha256 = await sha256TextV3(parsed.normalizedText);
    const compiled = await compileStandardDraftV3(parsed.dataset, datasetSha256, draft);
    assert.equal(compiled.status, "ready"); if (compiled.status !== "ready") throw new Error("Expected ready");
    const plan = await buildStandardExecutionPlanV3({ dataset: parsed.dataset, datasetSha256, compileResult: compiled, reference: null });
    const runtime = runStandardPlanV3(plan);
    assert.equal(runtime.set.points.length, 4);
    assert.deepEqual(parsed.dataset.rows.map(row => row.unit), ["leftx", "rightx", "third", "fourth"]);
    assert.deepEqual(runtime.set.connectionCounts.map(row => runtime.set.adjacencyKey.map(edge => row[edge.name])).sort(), [[1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 1, 1]].sort());
});
