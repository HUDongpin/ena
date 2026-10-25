import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { parseCsv } from "../lib/open-ena/csv";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { createOpenEnaWorkerHost, type OpenEnaWorkerScope } from "../lib/open-ena/jena.worker";
import { runOpenEnaInferenceV3 } from "../lib/open-ena/inference-v2";
import { calculateEndpointGoodness2DV3, calculateEndpointWelch2DV3 } from "../lib/open-ena/endpoint-statistics-2d-v3";
import { createWorkspaceStateV3, workspaceReducerV3 } from "../components/open-ena/model-v3/workspace-controller";
import type { BoundStandardResultV3, StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import { parseAnalysisBundleV3 } from "../lib/open-ena/analysis-bundle-v3";
import { boundResultFromBundleV3 } from "../lib/open-ena/bundle-contract-v3";
import { prepareEndpointMeansFrame2DV3 } from "../lib/open-ena/endpoint-means-frame-2d-v3";
import { computeEndpointMeansFrame2D } from "../lib/open-ena/endpoint-means-frame-2d-compute";
import { instantiateEndpointLapack2D } from "../lib/open-ena/endpoint-means-frame-2d-kernel";

const [xlsxPath, officialDirectory, outputDirectory, browserDirectory] = process.argv.slice(2);
if (!xlsxPath || !officialDirectory || !outputDirectory) throw new Error("Usage: node --import tsx scripts/verify-open-ena-2d-parity.ts input.xlsx official-evidence-directory output-directory");
const bytes = await readFile(xlsxPath);
const original = JSON.parse(await readFile(join(officialDirectory, "input/source-manifest.json"), "utf8"));
assert.equal(createHash("sha256").update(bytes).digest("hex"), original.sha256, "the exact reference workbook is required");
const { dataset, normalizedText } = await parseXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { name: basename(xlsxPath), source: "upload" });
const datasetSha256 = createHash("sha256").update(normalizedText).digest("hex");
const explicit: StandardEnaDraftV3 = JSON.parse(await readFile(join(officialDirectory, "open-ena/B/draft.json"), "utf8")).draft;
let state = workspaceReducerV3(createWorkspaceStateV3(), { type: "install-source", dataset, datasetSha256 });
state = workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: {
  ...explicit, rotation: { type: "svd", centerAlignToOrigin: true },
} } });
assert.equal(state.model.drafts.standard.rotation.type, "means", "fresh two-group workflow must default to Means");
const expectedStats = JSON.parse(await readFile(join(officialDirectory, "comparison/verified-results.json"), "utf8")).official_statistics;
const reports: object[] = [];
const lapack = browserDirectory ? null : await instantiateEndpointLapack2D(await readFile("public/open-ena-2d-lapack/blas.wasm"), await readFile("public/open-ena-2d-lapack/lapack.wasm"));
await mkdir(outputDirectory, { recursive: true });

for (const [caseName, draft] of [["A", state.model.drafts.standard], ["B", explicit]] as const) {
  const compiled = await compileStandardDraftV3(dataset, datasetSha256, draft);
  assert.equal(compiled.status, "ready", compiled.diagnostics.map(d => d.summary).join("; "));
  if (compiled.status !== "ready") throw new Error("Compiler rejected the parity case");
  const plan = await buildStandardExecutionPlanV3({ dataset, datasetSha256, compileResult: compiled, reference: null });
  const browserBundle = browserDirectory ? await parseAnalysisBundleV3(await readFile(join(browserDirectory, caseName, "model.json"), "utf8")) : null;
  if (browserBundle) {
    // Separate UI runs confirm the same source order at different times. Ignore
    // only that timestamp; retain dataset, rows, fields and every scientific choice.
    const comparable = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === "confirmedAt" ? "independent confirmation time" : item));
    assert.deepEqual(comparable(browserBundle.configuration), comparable(compiled.canonicalConfiguration), "browser configuration must match the independent source configuration");
  }
  const result = browserBundle ? boundResultFromBundleV3(browserBundle) as BoundStandardResultV3 : await new Promise<BoundStandardResultV3>((resolve, reject) => {
    let listener: (event: { data: unknown }) => void = () => {};
    const timeout = setTimeout(() => reject(new Error("Worker timed out")), 20_000);
    createOpenEnaWorkerHost({
      addEventListener(_type: string, fn: typeof listener) { listener = fn; },
      postMessage(message: { kind: string; result?: BoundStandardResultV3; message?: string }) {
        if (message.kind === "result-v3") { clearTimeout(timeout); resolve(message.result!); }
        if (message.kind === "error") { clearTimeout(timeout); reject(new Error(message.message ?? JSON.stringify(message))); }
      },
    } as unknown as OpenEnaWorkerScope);
    listener({ data: { kind: "run-open-ena-plan-v3", id: `parity-${caseName}`, plan, chunkSize: 64 } });
  });
  const axes: [string, string] = ["MR1", "SVD2"];
  const controls = { axes, primaryGroup: { type: "string" as const, value: "Experimental" }, secondaryGroup: { type: "string" as const, value: "Control" } };
  const browserStats = browserDirectory ? JSON.parse(await readFile(join(browserDirectory, caseName, "statistics.json"), "utf8")) : null;
  const displayFrame = browserStats?.displayFrame ?? (lapack ? computeEndpointMeansFrame2D(await prepareEndpointMeansFrame2DV3(result, plan), lapack) : null);
  if (browserStats) {
    assert.deepEqual(browserStats.binding, result.binding, "statistics and model must come from the same browser run");
    assert.equal(result.binding.datasetSha256, datasetSha256, "browser model must use the original typed workbook");
  }
  const goodness = browserStats?.goodness ?? await calculateEndpointGoodness2DV3(result, plan, axes);
  const welch = browserStats?.welch ?? await calculateEndpointWelch2DV3(result, plan, controls);
  const inference = browserStats ? { inference: browserStats.nonparametric } : await runOpenEnaInferenceV3(result, plan, controls);
  const csv = async (name: string) => parseCsv(await readFile(join(officialDirectory, `official/${caseName}/export/${name}.csv`), "utf8"), { name, source: "upload" }).rows;
  const officialPoints = await csv("points"), officialNodes = await csv("nodes"), officialWeights = await csv("line-weights"), officialCounts = await csv("connection-counts");
  const unitNames = new Map(result.executionProvenance.identityDictionary.units.map(u => [u.displayLabel, ["Group", "Name"].map(c => u.fields.find(f => f.column === c)!.value.value).join("::")]));
  const units = new Map(result.set.points.map(row => [unitNames.get(String(row.ENA_UNIT))!, row]));
  assert.equal(units.size, 87);
  const axisSigns = axes.map((axis, dimension) => {
    const officialAxis = dimension === 0 && caseName === "A" ? "GMR1" : axis;
    const error = (sign: number) => officialPoints.reduce((sum, p) => sum + (Number(units.get(String(p.ENA_UNIT))![axis]) * sign - Number(p[officialAxis])) ** 2, 0);
    return error(1) <= error(-1) ? 1 : -1;
  });
  const differences: { category: string; item: string; official: number; local: number; absoluteDifference: number; tolerance: number; passed: boolean }[] = [];
  const check = (category: string, item: string, actual: number, expected: number, tolerance = 0.000050001) => {
    const absoluteDifference = Math.abs(actual - expected), passed = Number.isFinite(actual) && absoluteDifference <= tolerance;
    differences.push({ category, item, official: expected, local: actual, absoluteDifference, tolerance, passed });
  };
  for (const row of officialPoints) axes.forEach((axis, i) => check("unit-coordinate", `${row.ENA_UNIT}/${axis}`, Number(units.get(String(row.ENA_UNIT))![axis]) * axisSigns[i], Number(row[i === 0 && caseName === "A" ? "GMR1" : axis])));
  const codeNames = new Map(result.executionProvenance.labels.codes.map(c => [c.column, c.sourceColumn]));
  const nodes = new Map(result.set.rotation.nodes!.map(row => [codeNames.get(String(row.code))!, row]));
  for (const row of officialNodes) axes.forEach((axis, i) => check("node-coordinate", `${row.code}/${axis}`, Number(nodes.get(String(row.code))![axis]) * axisSigns[i], Number(row[i === 0 && caseName === "A" ? "GMR1" : axis])));
  const edges = new Map(result.set.adjacencyKey.map(edge => [[codeNames.get(edge.source), codeNames.get(edge.target)].sort().join(" & "), edge.name]));
  for (const [category, reference, actual] of [["edge-weight", officialWeights, result.set.lineWeights], ["connection-count", officialCounts, result.set.connectionCounts]] as const) {
    const byUnit = new Map(actual.map(row => [unitNames.get(String(row.ENA_UNIT))!, row]));
    for (const row of reference) for (const edge of Object.keys(row).filter(c => c.includes(" & "))) {
      const column = edges.get(edge.split(" & ").sort().join(" & "))!;
      check(category, `${row.ENA_UNIT}/${edge}`, Number(byUnit.get(String(row.ENA_UNIT))![column]), Number(row[edge]), category === "connection-count" ? 0 : undefined);
    }
  }
  for (const [i, axis] of axes.entries()) {
    const key = i === 0 ? "X" : "Y", expected = expectedStats[caseName];
    const t = welch.rows[i], u = inference.inference.rows[i], r = goodness.rows[i];
    check("Welch", `${axis}/t`, t.t! * axisSigns[i], expected.parametric[key].t);
    check("Welch", `${axis}/df`, t.df!, expected.parametric[key].df);
    check("Welch", `${axis}/p`, t.p!, expected.parametric[key].p);
    check("Welch", `${axis}/d`, t.cohensD!, expected.parametric[key].cohens_d);
    for (const [value, name, signed] of [[t.meanPrimary, "mean_experimental", true], [t.meanSecondary, "mean_control", true], [t.sdPrimary, "sd_experimental", false], [t.sdSecondary, "sd_control", false]] as const) {
      check("Welch", `${axis}/${name}`, value! * (signed ? axisSigns[i] : 1), expected.parametric[key][name]);
    }
    check("Mann-Whitney", `${axis}/U-min`, Math.min(u.uPrimary!, u.uSecondary!), expected.nonparametric[key].U, 0);
    check("Mann-Whitney", `${axis}/p`, u.pRaw!, expected.nonparametric[key].p);
    check("Mann-Whitney", `${axis}/r-absolute`, Math.abs(u.rankBiserialPrimaryVsSecondary!), expected.nonparametric[key].effect_r_as_displayed);
    check("Mann-Whitney", `${axis}/median-experimental`, u.medianPrimary! * axisSigns[i], expected.nonparametric[key].median_experimental);
    check("Mann-Whitney", `${axis}/median-control`, u.medianSecondary! * axisSigns[i], expected.nonparametric[key].median_control);
    check("Goodness", `${axis}/pearson`, r.pearson!, expected.goodness[key].pearson);
    check("Goodness", `${axis}/spearman`, r.spearman!, expected.goodness[key].spearman);
    check("Variance", axis, result.set.variance[axis], expected.variance[key].share);
    assert.equal(t.nPrimary, 45); assert.equal(t.nSecondary, 42);
    assert.equal(u.nPrimary, 45); assert.equal(u.nSecondary, 42);
  }
  const failures = differences.filter(row => !row.passed);
  const report = { caseName, engine: browserDirectory ? "actual Chrome model and statistics downloads; bundle integrity verified; statistics not recomputed" : "production worker host in Node", datasetSha256, binding: result.binding, configuration: result.configuration,
    modelCreatedAt: result.createdAt,
    axisSigns: Object.fromEntries(axes.map((axis, i) => [axis, axisSigns[i]])), unitCount: units.size,
    comparisonPrecision: "official CSV/statistics rounded to four decimal places; absolute rounding interval 0.00005; counts and U exact",
    checks: differences.length, failures, passed: failures.length === 0,
  };
  await writeFile(join(outputDirectory, `${caseName}-result.json`), JSON.stringify(result));
  await writeFile(join(outputDirectory, `${caseName}-statistics.json`), JSON.stringify({ goodness, welch, inference, displayFrame }, null, 2));
  await writeFile(join(outputDirectory, `${caseName}-comparison.json`), JSON.stringify({ ...report, differences }, null, 2));
  reports.push(report);
  console.log(JSON.stringify(report, null, 2));
}
await writeFile(join(outputDirectory, "summary.json"), JSON.stringify(reports, null, 2));
assert.ok(reports.every(report => (report as { passed: boolean }).passed), "2D parity failed; inspect the comparison evidence");
