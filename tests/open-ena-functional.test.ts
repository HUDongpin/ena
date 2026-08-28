import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset, buildJenaOptions } from "../lib/open-ena/analyze";
import { inferConfig, parseCsv, validateConfig } from "../lib/open-ena/csv";
import { buildAnalysisBundle } from "../lib/open-ena/export";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const sampleText = readFileSync(
  join(projectRoot, "public", "data", "academy", "ena-design-talk-sample.csv"),
  "utf8",
);

function sampleDataset() {
  return parseCsv(sampleText, { name: "ena-design-talk-sample.csv", source: "sample" });
}

test("advanced endpoint options reach jENA and means rotation is deterministic", () => {
  const dataset = sampleDataset();
  const config = {
    ...SAMPLE_CONFIG,
    windowSizeForward: 1,
    rotation: "mean",
    centerAlignToOrigin: false,
  } as const;

  assert.deepEqual(validateConfig(dataset, config), []);
  const options = buildJenaOptions(dataset, config);
  assert.equal(options.windowSizeForward, 1);
  assert.equal(options.centerAlignToOrigin, false);
  assert.equal("utterance" in options.rows[0], false);
  assert.deepEqual(Object.keys(options.rows[0]), [
    "team_id",
    "conversation_id",
    "condition",
    "goal",
    "evidence",
    "strategy",
    "tradeoff",
    "revision",
  ]);
  assert.deepEqual(options.rotation, {
    method: "generalized",
    params: {
      xVar: "condition",
      select2Groups: ["baseline", "scaffolded"],
    },
  });

  const noForward = analyzeDataset(dataset, { ...config, windowSizeForward: 0 });
  assert.equal(noForward.dimensions[0], "MR1");
  assert.ok(Math.abs((noForward.set.variance.MR1 ?? 0) - 0.3778080150968768) < 1e-10);
  assert.ok(Math.abs(Number(noForward.set.points[0].MR1) + 0.1992186012089415) < 1e-10);
});

test("means rotation requires exactly two non-empty comparison groups", () => {
  const dataset = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g1,0,1,1\n",
    { name: "single-group.csv", source: "upload" },
  );
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"] as string[],
    conversationColumns: ["conversation"] as string[],
    groupColumn: "group",
    codes: ["A", "B", "C"] as string[],
    rotation: "mean",
  } as const;

  assert.match(validateConfig(dataset, config).join(" "), /Mean rotation requires exactly two comparison groups/);
});

test("model mappings cannot collide with Open ENA trajectory export identities", () => {
  const dataset = parseCsv(
    "unit,conversation,OPEN_ENA_POINT_INDEX,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g2,0,1,1\n",
    { name: "export-identity-collision.csv", source: "upload" },
  );
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "OPEN_ENA_POINT_INDEX",
    codes: ["A", "B", "C"],
  } as unknown as typeof SAMPLE_CONFIG;

  assert.match(validateConfig(dataset, config).join(" "), /reserved by (?:jENA|Open ENA)/);
});

test("preflight mirrors jENA forward windows and protects rotation/statistics limits", () => {
  const forwardOnly = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,0,0\nu1,c1,g1,0,1,0\nu2,c2,g2,0,0,1\nu2,c2,g2,0,1,0\n",
    { name: "forward.csv", source: "upload" },
  );
  const forwardConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    windowSizeBack: 1,
    windowSizeForward: 1,
  };
  assert.deepEqual(validateConfig(forwardOnly, forwardConfig), []);

  const mrCollision = parseCsv(
    "unit,conversation,MR1,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g2,0,1,1\n",
    { name: "mr-collision.csv", source: "upload" },
  );
  assert.match(validateConfig(mrCollision, {
    ...forwardConfig,
    groupColumn: "MR1",
    rotation: "mean",
  }).join(" "), /rotation column/);

  const tooManyUnits = parseCsv(
    `unit,conversation,group,A,B,C\n${Array.from({ length: 2_001 }, (_, index) => `u${index},c${index},g1,1,1,0`).join("\n")}\n`,
    { name: "too-many-units.csv", source: "upload" },
  );
  assert.doesNotMatch(validateConfig(tooManyUnits, {
    ...forwardConfig,
    windowSizeForward: 0,
  }).join(" "), /units per run/);

  const tooManyGroups = parseCsv(
    `unit,conversation,group,A,B,C\n${Array.from({ length: 7 }, (_, index) => `u${index},c${index},g${index + 1},1,1,1`).join("\n")}\n`,
    { name: "seven-groups.csv", source: "upload" },
  );
  assert.match(validateConfig(tooManyGroups, {
    ...forwardConfig,
    windowSizeForward: 0,
  }).join(" "), /up to 6 comparison groups/);

  const thirtyCodes = Array.from({ length: 30 }, (_, index) => `C${index + 1}`);
  const oversizedModel = parseCsv(
    [
      ["unit", "conversation", ...thirtyCodes].join(","),
      ...Array.from({ length: 1_200 }, (_, index) => [`u${index}`, `c${index}`, ...thirtyCodes.map(() => "1")].join(",")),
    ].join("\n") + "\n",
    { name: "oversized-model.csv", source: "upload" },
  );
  assert.match(validateConfig(oversizedModel, {
    ...forwardConfig,
    groupColumn: null,
    codes: thirtyCodes,
    windowSizeForward: 0,
  }).join(" "), /model-size safety budget/);

  const trajectorySteps = parseCsv(
    [
      ["unit", "conversation", ...thirtyCodes].join(","),
      ...Array.from({ length: 4_000 }, (_, index) => ["u1", `c${index}`, ...thirtyCodes.map(() => "1")].join(",")),
    ].join("\n") + "\n",
    { name: "oversized-trajectory.csv", source: "upload" },
  );
  assert.match(validateConfig(trajectorySteps, {
    ...forwardConfig,
    groupColumn: null,
    codes: thirtyCodes,
    model: "SeparateTrajectory",
    window: "Conversation",
    windowSizeForward: 0,
  }).join(" "), /model-size safety budget/);
});

test("researchers can use composite identities, no comparison group, or more than two groups", () => {
  const composite = parseCsv(
    [
      "cohort,name,lesson,condition,A,B,C",
      "g1,Alex,L1,baseline,1,1,0",
      "g1,Alex,L2,baseline,0,1,1",
      "g2,Alex,L1,scaffolded,1,0,1",
      "g2,Alex,L2,scaffolded,1,1,0",
    ].join("\n") + "\n",
    { name: "composite.csv", source: "upload" },
  );
  const compositeConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["cohort", "name"],
    conversationColumns: ["cohort", "name", "lesson"],
    groupColumn: "condition",
    codes: ["A", "B", "C"],
    window: "Conversation",
  } as unknown as typeof SAMPLE_CONFIG;
  assert.deepEqual(validateConfig(composite, compositeConfig), []);
  const compositeOptions = buildJenaOptions(composite, compositeConfig);
  assert.deepEqual(compositeOptions.units, ["cohort", "name"]);
  assert.deepEqual(compositeOptions.conversation, ["cohort", "name", "lesson"]);
  assert.deepEqual(analyzeDataset(composite, compositeConfig).set.points.map((row) => row.ENA_UNIT), ["g1::Alex", "g2::Alex"]);

  const paperWorkflow = parseCsv(
    [
      "Group,Name,Lesson,A,B,C",
      "A,Alex,L1,1,1,0",
      "A,Alex,L2,0,1,1",
      "B,Blair,L1,1,0,1",
      "B,Blair,L2,1,1,0",
    ].join("\n") + "\n",
    { name: "paper-workflow.csv", source: "upload" },
  );
  const paperConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["Group", "Name"],
    conversationColumns: ["Group", "Name", "Lesson"],
    groupColumn: "Group",
    codes: ["A", "B", "C"],
    window: "Conversation",
  } as unknown as typeof SAMPLE_CONFIG;
  assert.deepEqual(validateConfig(paperWorkflow, paperConfig), []);
  const paperResult = analyzeDataset(paperWorkflow, paperConfig);
  assert.deepEqual(paperResult.set.points.map((row) => row.ENA_UNIT), ["A::Alex", "B::Blair"]);
  assert.deepEqual(paperResult.groups.map((group) => group.name), ["A", "B"]);

  const ungrouped = parseCsv(
    "unit,conversation,A,B,C\nu1,c1,1,1,0\nu2,c2,0,1,1\nu3,c3,1,0,1\n",
    { name: "ungrouped.csv", source: "upload" },
  );
  const inferred = inferConfig(ungrouped) as typeof SAMPLE_CONFIG & {
    unitColumns: string[];
    conversationColumns: string[];
    groupColumn: string | null;
  };
  assert.deepEqual(inferred.unitColumns, ["unit"]);
  assert.deepEqual(inferred.conversationColumns, ["conversation"]);
  assert.equal(inferred.groupColumn, null);
  assert.deepEqual(inferred.codes, ["A", "B", "C"]);
  assert.deepEqual(validateConfig(ungrouped, inferred), []);
  assert.deepEqual(analyzeDataset(ungrouped, inferred).groups.map((group) => group.name), ["All units"]);

  const threeGroups = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g2,0,1,1\nu3,c3,g3,1,0,1\n",
    { name: "three-groups.csv", source: "upload" },
  );
  const threeGroupConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
  } as unknown as typeof SAMPLE_CONFIG;
  assert.deepEqual(validateConfig(threeGroups, threeGroupConfig), []);
  assert.deepEqual(analyzeDataset(threeGroups, threeGroupConfig).stats.tests?.map((test) => test.test), [
    "one-way-anova",
    "one-way-anova",
    "one-way-anova",
  ]);
});

test("Open ENA exposes jENA statistics rather than recomputing a plot-only summary", () => {
  const result = analyzeDataset(sampleDataset(), SAMPLE_CONFIG);
  assert.equal(result.stats.dimensions.length, 3);
  assert.equal(result.stats.groups?.length, 2);
  assert.equal(result.stats.tests?.length, 3);
  assert.deepEqual(result.stats.tests?.map((row) => row.test), ["welch-t", "welch-t", "welch-t"]);
  assert.ok(Math.abs((result.stats.tests?.[0]?.statistic ?? 0) - -1.238600172474281) < 1e-10);
  assert.equal(result.stats.correlations.length, 3);
});

test("large models complete while quadratic jENA diagnostics are explicitly omitted", () => {
  const dataset = parseCsv(
    `unit,conversation,A,B,C\n${Array.from({ length: 501 }, (_, index) => `u${index},c${index},1,1,1`).join("\n")}\n`,
    { name: "large-ungrouped.csv", source: "upload" },
  );
  const config = inferConfig(dataset);
  assert.deepEqual(validateConfig(dataset, config), []);

  const result = analyzeDataset(dataset, config);
  assert.equal(result.set.points.length, 501);
  assert.equal(result.stats.dimensions.length, 3);
  assert.equal(result.stats.correlations.length, 0);
  assert.equal(result.stats.tests, undefined);
  assert.deepEqual(result.statsDiagnostics, {
    correlations: "omitted-unit-limit",
    tests: "omitted-unit-limit",
    correlationUnitLimit: 500,
  });
});

test("browser results discard row-level source payloads after modeling", async () => {
  const { compactOpenEnaSet } = await import("../lib/open-ena/analyze");
  const result = analyzeDataset(sampleDataset(), SAMPLE_CONFIG);
  const compact = compactOpenEnaSet(result.set);

  assert.equal(compact.rawRows.length, 0);
  assert.equal(compact.rowConnectionCounts.length, 0);
  assert.equal(compact.metaData.length, 0);
  assert.equal(compact.connectionCounts.length, 8);
  assert.equal(compact.points.length, 8);
  assert.equal(compact.rotation.rotationMatrix.length, 10);
  assert.equal(JSON.stringify(compact).includes("utterance"), false);
});

test("source ingestion owns dataset generation and blocks analysis until the source is committed", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );

  assert.match(workspace, /const \[sourceBusy, setSourceBusy\] = useState\(false\)/);
  assert.match(workspace, /const datasetGenerationRef = useRef\(0\)/);
  assert.match(workspace, /const canRun = Boolean\([\s\S]{0,180}!sourceBusy[\s\S]{0,80}!loading/);
  assert.match(workspace, /datasetGenerationRef\.current \+= 1/);
  assert.match(workspace, /const analysisGeneration = datasetGenerationRef\.current/);
  assert.match(workspace, /datasetGenerationRef\.current !== analysisGeneration/);
  assert.match(workspace, /aria-busy=\{loading \|\| sourceBusy \|\| referenceBusy\}/);
});

test("composite identities preserve declared order while codes remain in visible CSV-header order", () => {
  const workspace = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /function toggleInSelectionOrder/);
  assert.match(workspace, /return checked[\s\S]*?selected\.includes\(header\)[\s\S]*?\[\.\.\.selected, header\][\s\S]*?: selected\.filter/);
  assert.match(workspace, /function toggleInHeaderOrder/);
  assert.match(workspace, /return headers\.filter\(\(candidate\) => next\.has\(candidate\)\)/);
  assert.match(workspace, /unitColumns: toggleInSelectionOrder\(current\.unitColumns, header, event\.target\.checked\)/);
  assert.match(workspace, /conversationColumns: toggleInSelectionOrder\(current\.conversationColumns, header, event\.target\.checked\)/);
  assert.match(workspace, /codes: toggleInHeaderOrder\(headers, current\.codes, header, event\.target\.checked\)/);
});

test("a replacement source aborts the current run only at the source commit boundary", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const loadSample = workspace.slice(
    workspace.indexOf("async function loadSample"),
    workspace.indexOf("async function openCodedData"),
  );
  const openCodedData = workspace.slice(
    workspace.indexOf("async function openCodedData"),
    workspace.indexOf("function resetPlot"),
  );

  for (const [sourceCommit, hashStatement] of [
    [loadSample, "const nextHash = await sha256Hex(text)"],
    [openCodedData, "const nextHash = await sha256Hex(normalizedHashText)"],
  ] as const) {
    const hashFinished = sourceCommit.indexOf(hashStatement);
    const abortCurrentRun = sourceCommit.indexOf("abortRef.current?.abort()");
    const commitDataset = sourceCommit.indexOf("setDataset(nextDataset)");
    assert.ok(hashFinished >= 0, "source ingestion must hash the complete source before commit");
    assert.ok(abortCurrentRun > hashFinished, "the current analysis must remain owned by the old dataset during source read/hash");
    assert.ok(abortCurrentRun < commitDataset, "the current analysis must be aborted immediately before the new dataset commit");
  }
  assert.match(
    workspace,
    /async function runAnalysis\([\s\S]{0,240}nextDatasetHash\s*=\s*datasetHash[\s\S]*?datasetSha256:\s*nextDatasetHash[\s\S]*?setResult\(nextResult\)/,
    "each worker result must bind to the immutable hash supplied to that run",
  );
  assert.match(
    loadSample,
    /await runAnalysis\(nextDataset,\s*SAMPLE_CONFIG,\s*nextHash\)/,
    "the teaching sample must pass its freshly computed hash into the immediate worker run",
  );
  assert.match(
    loadSample,
    /fetch\(SAMPLE_DATASET_URL,\s*\{\s*cache:\s*"no-store"/,
    "the teaching sample must not reuse stale bytes after a fixture revision",
  );
});

test("the reproducibility bundle retains normalized tables, count evidence, and the full rotation set", async () => {
  const { buildAnalysisBundle, rowsToCsv } = await import("../lib/open-ena/export");
  const dataset = sampleDataset();
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const bundle = buildAnalysisBundle(dataset, SAMPLE_CONFIG, result, "abc123");

  assert.equal(bundle.manifest.dataset.normalizedUtf8TextSha256, "abc123");
  assert.equal(bundle.manifest.dataset.hashKind, "normalized-utf8-csv-text-sha256");
  assert.equal(bundle.tables.coordinates.length, 8);
  assert.equal(bundle.tables.lineWeights.length, 8);
  assert.equal(bundle.tables.connectionCounts.length, 8);
  assert.equal(bundle.tables.pointsForProjection.length, 8);
  assert.equal(bundle.tables.centroids.length, 8);
  assert.equal(bundle.tables.nodePositions.length, 5);
  assert.equal(bundle.tables.adjacencyKey.length, 10);
  assert.equal(bundle.rotationSet.codes.length, 5);
  assert.equal(bundle.rotationSet.adjacencyKey.length, 10);
  assert.equal(bundle.rotationSet.rotationMatrix.length, 10);
  assert.equal(bundle.rotationSet.rotationColumns.length, 10);
  assert.equal(bundle.rotationSet.eigenvalues.length, 10);
  assert.equal(bundle.rotationSet.centerVector.length, 10);
  assert.equal(bundle.statistics.tests?.length, 3);
  assert.equal("rawRows" in bundle, false);
  assert.equal("rowConnectionCounts" in bundle.tables, false);
  assert.doesNotMatch(JSON.stringify(bundle), /utterance/);

  const conversationManifest = (await import("../lib/open-ena/analyze")).buildManifest(
    dataset,
    { ...SAMPLE_CONFIG, window: "Conversation" },
    analyzeDataset(dataset, { ...SAMPLE_CONFIG, window: "Conversation" }),
  );
  assert.equal(conversationManifest.effectiveJenaOptions.windowSizeBack, "Infinity");

  const csv = rowsToCsv([
    { unit: "001", note: "quoted, value", score: 1 },
    { unit: "2", note: "line one\nline two", score: null },
  ]);
  assert.equal(
    csv,
    'unit,note,score\r\n001,"quoted, value",1\r\n2,"line one\nline two",\r\n',
  );
});

test("CSV export neutralizes spreadsheet formulas while preserving numeric scalars", async () => {
  const { rowsToCsv } = await import("../lib/open-ena/export");
  const csv = rowsToCsv([{
    safe: "research",
    formula: "=1+1",
    spaced: "   @cmd",
    control: "\u0001=cmd",
    plus: "+SUM(A1:A2)",
    negativeString: "-7",
    numericNegative: -7,
    tab: "\tcmd",
    cr: "\rCMD",
  }]);

  assert.equal(
    csv,
    "safe,formula,spaced,control,plus,negativeString,numericNegative,tab,cr\r\n"
      + "research,'=1+1,'   @cmd,'\u0001=cmd,'+SUM(A1:A2),'-7,-7,'\tcmd,\"'\rCMD\"\r\n",
  );
  assert.equal(rowsToCsv([{ "=formulaHeader": "safe" }]), "'=formulaHeader\r\nsafe\r\n");
});

test("the researcher interface exposes the implemented model controls, data tables, and result exports", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );

  assert.match(workspace, /windowSizeForward/);
  assert.match(workspace, /rotation/);
  assert.match(workspace, /centerAlignToOrigin/);
  assert.match(workspace, /result\.stats\.tests/);
  assert.match(workspace, /buildAnalysisBundle/);
  assert.match(workspace, /rowsToCsv/);
  assert.match(workspace, /Result data/);
  assert.match(workspace, /Coordinates CSV/);
  assert.match(workspace, /Line weights CSV/);
  assert.match(workspace, /Connection counts CSV/);
  assert.match(workspace, /Centroids CSV/);
  assert.match(workspace, /copy\.stats\.effect/);
  assert.deepEqual(
    (["en", "zh-hant", "zh-hans"] as const).map((locale) => getOpenEnaCopy(locale).stats.effect),
    ["Absolute Cohen’s d", "絕對 Cohen’s d", "绝对 Cohen’s d"],
  );
  assert.match(workspace, /Not estimable/);
  assert.match(workspace, /Number\.isFinite/);
  assert.match(workspace, /function selectAxisDimension/);
  assert.match(workspace, /updateOpenEnaWorkspace3dAxis\(\{/);
  assert.match(workspace, /threeD: \[threeDXDimension, threeDYDimension, threeDZDimension\]/);
  assert.match(workspace, /setThreeDXDimension\(next\.threeD\[0\]\)/);
  assert.doesNotMatch(workspace, /disabled=\{oppositeDimensions\.includes\(dimension\)\}/);
  assert.match(workspace, /Export SVG/);
  assert.match(workspace, /Export PNG/);
  assert.match(workspace, /XMLSerializer/);
  assert.match(workspace, /sourceAbortRef\.current = sourceController/);
  assert.match(workspace, /sourceController\.signal\.aborted \|\| sourceAbortRef\.current !== sourceController/);
  assert.match(workspace, /maxNetworkWeight/);
  assert.doesNotMatch(workspace, /Math\.max\([\s\S]{0,120}\.\.\.result\.groups\.flatMap/);
});

test("plot projection keys cannot collide with code labels and mini-networks share one edge scale", () => {
  const plot = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaPlot.tsx"),
    "utf8",
  );

  assert.match(plot, /key: `node-/);
  assert.match(plot, /key: `unit-/);
  assert.match(plot, /key: `mean-/);
  assert.doesNotMatch(plot, /lookup\.set\(item\.label/);
  assert.match(plot, /maxNetworkWeight/);
  assert.doesNotMatch(plot, /Math\.max\(1e-9, \.\.\.Object\.values\(group\.meanWeights\)/);
});

function trajectoryDataset() {
  return parseCsv(
    [
      "unit,conversation,group,A,B,C",
      "u1,c1,g1,1,1,0",
      "u1,c2,g1,0,1,1",
      "u2,c1,g2,1,0,1",
      "u2,c2,g2,1,1,0",
    ].join("\n") + "\n",
    { name: "trajectory.csv", source: "upload" },
  );
}

test("trajectory models preserve ordered steps and stable comparison metadata", () => {
  const dataset = trajectoryDataset();
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
  } as unknown as typeof SAMPLE_CONFIG;

  assert.deepEqual(validateConfig(dataset, config), []);
  const result = analyzeDataset(dataset, config);
  assert.equal(result.set.modelType, "SeparateTrajectory");
  assert.equal(result.set.points.length, 4);
  assert.deepEqual(result.set.unitLabels, ["u1::c1", "u1::c2", "u2::c1", "u2::c2"]);
  assert.deepEqual(result.set.trajectories?.map((row) => row.conversation), ["c1", "c2", "c1", "c2"]);
  assert.deepEqual(result.set.points.map((row) => row.group), ["g1", "g1", "g2", "g2"]);
  assert.deepEqual(result.groups.map(({ name, count, pointCount }) => ({ name, count, pointCount })), [
    { name: "g1", count: 1, pointCount: 2 },
    { name: "g2", count: 1, pointCount: 2 },
  ]);
});

test("trajectory diagnostics do not treat repeated steps as independent endpoint units", () => {
  const dataset = trajectoryDataset();
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "AccumulatedTrajectory",
    window: "Conversation",
  } as unknown as typeof SAMPLE_CONFIG;

  const result = analyzeDataset(dataset, config);
  assert.equal(result.stats.tests, undefined);
  assert.equal(result.stats.correlations.length, 0);
  assert.deepEqual(result.statsDiagnostics, {
    correlations: "not-applicable-trajectory",
    tests: "not-applicable-trajectory",
    correlationUnitLimit: 500,
  });
});

test("mean rotation is restricted to endpoint models to preserve unit weighting", () => {
  const dataset = trajectoryDataset();
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
    rotation: "mean",
  } as unknown as typeof SAMPLE_CONFIG;
  assert.match(validateConfig(dataset, config).join(" "), /Mean rotation is currently limited to endpoint models/);
});

test("trajectory group means weight analytic units equally when step counts differ", () => {
  const dataset = parseCsv(
    [
      "unit,conversation,group,A,B,C",
      "u1,c1,g1,1,1,0",
      "u1,c2,g1,0,1,1",
      "u1,c3,g1,1,0,1",
      "u2,c1,g1,1,1,0",
      "u3,c1,g2,1,0,1",
      "u3,c2,g2,0,1,1",
    ].join("\n") + "\n",
    { name: "unbalanced-trajectories.csv", source: "upload" },
  );
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
  } as unknown as typeof SAMPLE_CONFIG;
  const result = analyzeDataset(dataset, config);
  const group = result.groups.find((item) => item.name === "g1");
  assert.ok(group);
  const dimension = result.dimensions[0];
  const pointsByUnit = new Map<string, number[]>();
  for (const point of result.set.points.filter((row) => row.group === "g1")) {
    const unit = String(point.ENA_UNIT);
    const values = pointsByUnit.get(unit) ?? [];
    values.push(Number(point[dimension]));
    pointsByUnit.set(unit, values);
  }
  const expected = [...pointsByUnit.values()]
    .map((values) => values.reduce((sum, value) => sum + value, 0) / values.length)
    .reduce((sum, value) => sum + value, 0) / pointsByUnit.size;
  assert.ok(Math.abs((group.meanPoint[dimension] ?? 0) - expected) < 1e-12);
  assert.equal(group.count, 2);
  assert.equal(group.pointCount, 4);
});

test("trajectory mappings remain exportable after privacy compaction", async () => {
  const { compactOpenEnaSet } = await import("../lib/open-ena/analyze");
  const { buildAnalysisBundle } = await import("../lib/open-ena/export");
  const dataset = trajectoryDataset();
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "AccumulatedTrajectory",
    window: "Conversation",
  } as unknown as typeof SAMPLE_CONFIG;
  const result = analyzeDataset(dataset, config);
  const compactResult = { ...result, set: compactOpenEnaSet(result.set) };
  const bundle = buildAnalysisBundle(dataset, config, compactResult);

  assert.equal(compactResult.set.rawRows.length, 0);
  assert.equal(compactResult.set.rowConnectionCounts.length, 0);
  assert.equal(compactResult.set.trajectories?.length, 4);
  assert.equal(bundle.tables.trajectories.length, 4);
  assert.deepEqual(bundle.tables.trajectories.map((row) => row.group), ["g1", "g1", "g2", "g2"]);
});

test("trajectory export tables carry a stable step identity without leaking source text", async () => {
  const exportModule = await import("../lib/open-ena/export") as typeof import("../lib/open-ena/export") & {
    buildResultTables?: (result: ReturnType<typeof analyzeDataset>) => {
      coordinates: Array<Record<string, unknown>>;
      lineWeights: Array<Record<string, unknown>>;
      connectionCounts: Array<Record<string, unknown>>;
    };
  };
  assert.equal(typeof exportModule.buildResultTables, "function");

  const dataset = parseCsv(
    [
      "unit,pointIndex,group,utterance,A,B,C",
      "u1,step-a,g1,first private source row,1,1,0",
      "u1,step-b,g1,second private source row,0,1,1",
      "u2,step-a,g2,third private source row,1,0,1",
      "u2,step-b,g2,fourth private source row,1,1,0",
    ].join("\n") + "\n",
    { name: "trajectory-identities.csv", source: "upload" },
  );
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["pointIndex"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
  } as unknown as typeof SAMPLE_CONFIG;
  const result = analyzeDataset(dataset, config);
  const tables = exportModule.buildResultTables!(result);

  for (const rows of [tables.coordinates, tables.lineWeights, tables.connectionCounts]) {
    assert.deepEqual(rows.map((row) => row.OPEN_ENA_POINT_INDEX), [0, 1, 2, 3]);
    assert.deepEqual(rows.map((row) => row.TRAJ_UNIT), ["step-a", "step-b", "step-a", "step-b"]);
    assert.deepEqual(rows.map((row) => row.pointIndex), ["step-a", "step-b", "step-a", "step-b"]);
    assert.equal(rows.some((row) => "utterance" in row), false);
  }

  const bundle = exportModule.buildAnalysisBundle(dataset, config, result);
  assert.deepEqual(bundle.tables.coordinates, tables.coordinates);
  assert.deepEqual(bundle.tables.lineWeights, tables.lineWeights);
  assert.deepEqual(bundle.tables.connectionCounts, tables.connectionCounts);
  const coordinateCsv = exportModule.rowsToCsv(tables.coordinates);
  assert.match(coordinateCsv, /^unit,ENA_UNIT,SVD1,SVD2,SVD3,group,OPEN_ENA_POINT_INDEX,TRAJ_UNIT,pointIndex\r?\n/);
  assert.doesNotMatch(coordinateCsv, /private source row|utterance/);
});

test("the researcher interface routes verified trajectory models to the dedicated workbench", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const plot = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaPlot.tsx"),
    "utf8",
  );
  const trajectoryWorkbench = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaLongitudinalWorkbenchV3.tsx"),
    "utf8",
  );

  assert.match(workspace, /SeparateTrajectory/);
  assert.match(workspace, /AccumulatedTrajectory/);
  assert.match(workspace, /showTrajectories/);
  assert.match(workspace, /Trajectory steps CSV/);
  assert.doesNotMatch(plot, /ena-trajectory-path|result\.set\.trajectories/);
  assert.match(trajectoryWorkbench, /compileTrajectoryPlotlySpec/);
  assert.match(trajectoryWorkbench, /data-testid="open-ena-longitudinal-v3-workbench"/);
});

test("the public Open ENA contract documents mutually exclusive ENA and trajectory presenters", () => {
  const readme = readFileSync(join(projectRoot, "README.md"), "utf8");

  assert.match(
    readme,
    /Generic 2D and 3D ENA presenters show codes, network edges, unit points, and group means without trajectory paths, arrows, or time-point labels\./,
  );
  assert.match(
    readme,
    /The dedicated longitudinal trajectory presenter shows fitted code references, participant-period points, square centroids, black paths, and midpoint direction arrows without ENA mean-network edges\./,
  );
  assert.doesNotMatch(readme, /fitted jENA coordinates, nodes, networks, means, and trajectories/);
});

test("pending model edits preserve the last valid research result until rebuild", async () => {
  const types = await import("../lib/open-ena/types") as typeof import("../lib/open-ena/types") & {
    sameOpenEnaConfig?: (left: typeof SAMPLE_CONFIG, right: typeof SAMPLE_CONFIG) => boolean;
  };
  assert.equal(typeof types.sameOpenEnaConfig, "function");
  assert.equal(types.sameOpenEnaConfig?.(SAMPLE_CONFIG, { ...SAMPLE_CONFIG, codes: [...SAMPLE_CONFIG.codes] }), true);
  assert.equal(types.sameOpenEnaConfig?.(SAMPLE_CONFIG, { ...SAMPLE_CONFIG, windowSizeBack: 6 }), false);

  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const updateConfigBody = workspace.match(/function updateConfig[\s\S]*?\n  }\n\n  async function runAnalysis/)?.[0] ?? "";
  assert.doesNotMatch(updateConfigBody, /setResult\(null\)/);
  assert.doesNotMatch(updateConfigBody, /setResultConfig\(null\)/);
  assert.match(workspace, /resultIsStale/);
  assert.match(workspace, /loading && !result/);
  assert.match(workspace, /Configuration changed/);
});

test("the worker derives a de-identified ordered audit before clearing jENA row materialization", () => {
  const worker = readFileSync(
    join(projectRoot, "lib", "open-ena", "jena.worker.ts"),
    "utf8",
  );
  assert.match(worker, /materialization:\s*configuration\.analysisKind === "ona" \? "full" : "model"/);
  assert.match(worker, /buildOpenEnaOrderedAudit\(fullSet\)/);
  assert.match(worker, /compactOpenEnaSet/);
  assert.match(worker, /orderedAudit \? \{ \.\.\.result, orderedAudit \} : result/);
});

test("source evidence can be searched and filtered locally without entering exports", async () => {
  const { filterSourceEvidence } = await import("../lib/open-ena/evidence") as {
    filterSourceEvidence: (
      dataset: ReturnType<typeof sampleDataset>,
      config: typeof SAMPLE_CONFIG,
      filters: { query: string; activeCodesOnly: boolean },
    ) => Array<{ recordNumber: number; row: Record<string, unknown> }>;
  };
  const dataset = sampleDataset();
  const revisionRows = filterSourceEvidence(dataset, SAMPLE_CONFIG, {
    query: "revision",
    activeCodesOnly: false,
  });
  assert.ok(revisionRows.length > 0);
  assert.ok(revisionRows.every(({ row }) => Object.values(row).some((value) => String(value).toLowerCase().includes("revision"))));
  assert.ok(revisionRows.every(({ recordNumber }) => recordNumber >= 1));

  const activeRows = filterSourceEvidence(dataset, SAMPLE_CONFIG, {
    query: "team-01",
    activeCodesOnly: true,
  });
  assert.ok(activeRows.length > 0);
  assert.ok(activeRows.every(({ row }) => SAMPLE_CONFIG.codes.some((code) => ["1", "true"].includes(String(row[code]).toLowerCase()))));

  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /Source evidence/);
  assert.match(workspace, /filterSourceEvidence/);
  assert.match(workspace, /activeCodesOnly/);
  assert.match(workspace, /copy\.aiInterpretation\.privacyLocal/);
  assert.match(workspace, /copy\.aiInterpretation\.privacyExternal/);
  const i18n = readFileSync(
    join(projectRoot, "lib", "open-ena-i18n.ts"),
    "utf8",
  );
  assert.match(i18n, /raw source rows and raw source data are never sent to the AI provider/);
  assert.match(i18n, /reviewed aggregate request is sent to an external AI provider/);
  const exported = buildAnalysisBundle(
    dataset,
    SAMPLE_CONFIG,
    analyzeDataset(dataset, SAMPLE_CONFIG),
  );
  assert.doesNotMatch(
    JSON.stringify(exported),
    /"(?:sourceRows|rawRows)":/,
    "the actual result-bundle protocol must exclude raw source-row payloads",
  );
  assert.match(readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8"), /Parsed record/);
});

test("the empty-state checklist treats comparison groups as optional", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.doesNotMatch(workspace, /Define units, conversations, groups, and at least 3 codes/);
  assert.match(workspace, /Define units, conversations, and at least 3 codes/);
});

test("relative edge thresholds preserve strongest connections and suppress weaker ones", async () => {
  const plotModule = await import("../components/open-ena/OpenEnaPlot") as {
    passesEdgeThreshold?: (value: number, maximum: number, threshold: number) => boolean;
  };
  assert.equal(typeof plotModule.passesEdgeThreshold, "function");
  assert.equal(plotModule.passesEdgeThreshold?.(1, 1, 0.5), true);
  assert.equal(plotModule.passesEdgeThreshold?.(0.49, 1, 0.5), false);
  assert.equal(plotModule.passesEdgeThreshold?.(0.5, 1, 0.5), true);
  assert.equal(plotModule.passesEdgeThreshold?.(0, 1, 0), false);
});

test("Plot Tools expose dense-network inspection controls without rebuilding the model", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const plot = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaPlot.tsx"),
    "utf8",
  );
  for (const control of [
    "edgeThreshold",
    "pointScale",
    "plotZoom",
    "flipX",
    "flipY",
    "showVariance",
    "showUnitLabels",
  ]) assert.match(workspace, new RegExp(control));
  assert.match(workspace, /Zoom in/);
  assert.match(workspace, /Zoom out/);
  assert.match(workspace, /Fit plot/);
  assert.match(workspace, /Flip X/);
  assert.match(workspace, /Flip Y/);
  assert.match(plot, /passesEdgeThreshold/);
  assert.match(plot, /pointScale/);
  assert.match(plot, /plotZoom/);
});

test("de-labeled ENA and every ONA SVG export scrub analytic-unit identities from point metadata", () => {
  const workspace = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");
  const plot = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaPlot.tsx"), "utf8");
  const orderedPlot = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaOrderedPlot.tsx"), "utf8");
  assert.match(plot, /data-ena-unit-point="true"/);
  assert.match(orderedPlot, /data-ona-unit-point="true"/);
  assert.match(workspace, /if \(completedResultKind === "ona" \|\| !showUnitLabels\)/);
  assert.match(workspace, /\[data-ena-unit-point='true'\], \[data-ona-unit-point='true'\]/);
  assert.match(workspace, /querySelectorAll\("\.ena-set-unit-label"\).*\.remove\(\)/);
  assert.match(workspace, /identifier omitted from this SVG export/);
});
