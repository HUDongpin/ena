import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { buildAnalysisBundle } from "../lib/open-ena/export";
import { runOpenEnaInferenceV2 } from "../lib/open-ena/inference-v2";
import { buildLongitudinalDerivation } from "../lib/open-ena/longitudinal";
import { buildMethodsReport, referenceMeanRotationInterpretation } from "../lib/open-ena/methods";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

const sampleText = readFileSync(
  join(process.cwd(), "public", "data", "academy", "ena-design-talk-sample.csv"),
  "utf8",
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

async function trajectoryMethodsFixture() {
  const sourceHash = "c".repeat(64);
  const dataset = parseCsv([
    "group,unit,period,A,B,C",
    "G,u1,T1,1,1,0", "G,u1,T2,1,0,1", "G,u1,T3,0,1,1",
    "G,u2,T1,1,1,0", "G,u2,T2,0,1,1", "G,u2,T3,1,0,1",
    "G,u3,T1,1,0,1", "G,u3,T2,1,1,0", "G,u3,T3,0,1,1",
    "G,u4,T1,0,1,1", "G,u4,T2,1,0,1", "G,u4,T3,1,1,0",
    "G,u5,T1,1,1,1", "G,u5,T2,1,1,0", "G,u5,T3,1,0,1",
    "G,u6,T1,1,0,1", "G,u6,T2,0,1,1", "G,u6,T3,1,1,1",
  ].join("\n") + "\n", { name: "trajectory-methods.csv", source: "upload" });
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["group", "unit"],
    conversationColumns: ["period"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory" as const,
    window: "Conversation" as const,
  };
  const analyzed = analyzeDataset(dataset, config);
  const result = {
    ...analyzed,
    analyzedAt: "2026-08-21T12:13:14.000Z",
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: sourceHash,
      datasetHashKind: "normalized-utf8-csv-text-sha256" as const,
      configuration: structuredClone(config),
    },
  };
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const comparisonFrame = buildLongitudinalDerivation(result, config, dataset, {
    repeatedEntityColumns: ["group", "unit"],
    identityConfirmed: true,
    timeColumn: "period",
    timeOrder: ["T1", "T2", "T3"],
    cohortPolicy: "available",
    axes,
    datasetNormalizedUtf8TextSha256: sourceHash,
  }, "2026-08-21T12:14:15.000Z").comparisonFrame;
  const currentBinding = {
    datasetNormalizedUtf8TextSha256: sourceHash,
    datasetHashKind: "normalized-utf8-csv-text-sha256" as const,
    configuration: config,
  };
  const paired = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["group", "unit"],
      timeColumn: "period",
      group: "G",
      earlierPeriod: "T1",
      laterPeriod: "T2",
      axes,
      cohortPolicy: "pairwise-complete",
    },
    result,
    comparisonFrame,
    currentBinding,
  });
  const repeated = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-repeated-periods",
      repeatedEntityColumns: ["group", "unit"],
      timeColumn: "period",
      group: "G",
      periods: ["T1", "T2", "T3"],
      axes,
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    },
    result,
    comparisonFrame,
    currentBinding,
  });
  return { dataset, config, result, sourceHash, axes, paired, repeated };
}

test("the generated methods report records the model but never invents inference before an explicit run", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const report = buildMethodsReport(dataset, SAMPLE_CONFIG, result, "abc123");

  assert.match(report, /^# ENA\.HK Open ENA Methods & Reproducibility Report/m);
  assert.match(report, /jENA `jena-js` 0\.6\.2/);
  assert.match(report, /Analytic unit: `team_id`/);
  assert.match(report, /Conversation: `conversation_id`/);
  assert.match(report, /Moving stanza window/);
  assert.match(report, /5 rows total including the current row/);
  assert.match(report, /sphere normalization/);
  assert.match(report, /SVD rotation/);
  assert.match(report, /## Inferential comparison/);
  assert.match(report, /No researcher-confirmed inferential comparison was run/);
  assert.doesNotMatch(report, /Mann–Whitney U|Resolved p method|auto exact-first/i);
  assert.doesNotMatch(report, /raw p|Holm p|no multiplicity correction/i);
  assert.match(report, /abc123/);
  assert.match(report, /axis signs are arbitrary/i);
  assert.doesNotMatch(report, /compare alternatives|utterance/);
});

test("publication methods do not fabricate p-values from visibly separated points before Run", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const dimension = result.dimensions[0];
  const firstGroup = result.groups[0].name;
  const secondGroup = result.groups[1].name;
  const separatedPoints = [
    ...Array.from({ length: 10 }, (_, index) => ({
      ...result.set.points[0],
      ENA_UNIT: `first-${index}`,
      [SAMPLE_CONFIG.groupColumn as string]: firstGroup,
      [dimension]: index,
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      ...result.set.points[0],
      ENA_UNIT: `second-${index}`,
      [SAMPLE_CONFIG.groupColumn as string]: secondGroup,
      [dimension]: 100 + index,
    })),
  ];
  const report = buildMethodsReport(
    dataset,
    SAMPLE_CONFIG,
    { ...result, set: { ...result.set, points: separatedPoints } },
    null,
    [dimension],
  );

  assert.match(report, /No researcher-confirmed inferential comparison was run/);
  assert.doesNotMatch(report, /\| < \.001 \||\| 0\.000 \|/);
  assert.doesNotMatch(report, /Mann–Whitney U|raw p|Holm p/i);
});

test("the derived result bundle includes the same raw-row-excluding methods report", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const bundle = buildAnalysisBundle(dataset, SAMPLE_CONFIG, result, "abc123") as ReturnType<typeof buildAnalysisBundle> & {
    methodsReportMarkdown?: string;
  };
  assert.equal(typeof bundle.methodsReportMarkdown, "string");
  assert.match(bundle.methodsReportMarkdown ?? "", /Methods & Reproducibility Report/);
  assert.doesNotMatch(bundle.methodsReportMarkdown ?? "", /compare alternatives|utterance/);
});

test("methods and bundle record researcher-selected visible axes without automatic inference", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const selectedAxes = [result.dimensions[1], result.dimensions[2]];
  const report = buildMethodsReport(dataset, SAMPLE_CONFIG, result, "abc123", selectedAxes, { flipX: true, flipY: false });
  assert.match(report, new RegExp(`Displayed 2D axes: X .*${selectedAxes[0]}.*\\(flipped\\); Y .*${selectedAxes[1]}.*\\(unflipped\\)`));
  assert.match(report, /in the unflipped model coordinate system/);
  assert.match(report, /No researcher-confirmed inferential comparison was run/);

  const bundle = buildAnalysisBundle(dataset, SAMPLE_CONFIG, result, "abc123", {
    methodsDimensions: selectedAxes,
    methodsFlipX: true,
    methodsFlipY: false,
    edgeThreshold: 0.35,
    showNetworks: false,
    showPoints: true,
    showTrajectories: false,
    showLabels: false,
    showGroupLabels: true,
    showUnitLabels: true,
    showVariance: false,
    edgeScale: 1.4,
    pointScale: 0.8,
    plotZoom: 1.6,
  });
  assert.match(bundle.methodsReportMarkdown, /X .*\(flipped\); Y .*\(unflipped\)/);
  assert.match(bundle.methodsReportMarkdown, /No researcher-confirmed inferential comparison was run/);
  assert.deepEqual(bundle.presentation, {
    selectedAxes,
    flipX: true,
    flipY: false,
    edgeThreshold: 0.35,
    showNetworks: false,
    showPoints: true,
    showTrajectories: false,
    showLabels: false,
    showGroupLabels: true,
    showUnitLabels: true,
    showVariance: false,
    edgeScale: 1.4,
    pointScale: 0.8,
    plotZoom: 1.6,
  });
  assert.match(bundle.methodsReportMarkdown, /35\.0% \(0\.35\).*presentation-only/i);
  assert.match(bundle.methodsReportMarkdown, /below the threshold remain in the computed model and exported tables/i);
  assert.match(bundle.methodsReportMarkdown, /Group networks: hidden/);
  assert.match(bundle.methodsReportMarkdown, /Unit points: shown/);
  assert.match(bundle.methodsReportMarkdown, /Trajectory paths: hidden/);
  assert.match(bundle.methodsReportMarkdown, /Code labels: hidden; group labels: shown; unit labels: shown; variance labels: hidden/);
  assert.match(bundle.methodsReportMarkdown, /Edge width scale: 1\.4×; unit point scale: 0\.8×; plot zoom: 1\.6×/);
});

test("methods record displayed axes while confirmed inference is unavailable", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const ungroupedConfig = { ...SAMPLE_CONFIG, groupColumn: null };
  const result = analyzeDataset(dataset, ungroupedConfig);
  const selectedAxes = [result.dimensions[1], result.dimensions[2]];
  const report = buildMethodsReport(dataset, ungroupedConfig, result, null, selectedAxes, { flipY: true });

  assert.match(report, /No researcher-confirmed inferential comparison was run/);
  assert.match(report, new RegExp(`Displayed 2D axes: X .*${selectedAxes[0]}.*; Y .*${selectedAxes[1]}.*\\(flipped\\)`));
});

test("user-controlled methods labels cannot inject Markdown headings or escape code spans", () => {
  const hostileLabel = "`reported value\r\n\n## Fabricated result\t```";
  const dataset = {
    ...parseCsv(sampleText, { name: hostileLabel, source: "sample" }),
    name: hostileLabel,
  };
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const hostileConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: [hostileLabel],
    conversationColumns: [hostileLabel],
    groupColumn: hostileLabel,
    codes: [hostileLabel],
  };
  const hostileResult = {
    ...result,
    groups: result.groups.map((group, index) => ({
      ...group,
      name: `${hostileLabel} group ${index + 1}`,
    })),
    projectionReference: {
      schemaVersion: 1 as const,
      kind: "open-ena-reference-rotation" as const,
      app: "ENA.HK Open ENA" as const,
      runtime: "jena-js" as const,
      runtimeVersion: "0.6.2",
      referenceId: hostileLabel,
      name: hostileLabel,
      source: {
        datasetName: hostileLabel,
        normalizedUtf8TextSha256: null,
        analyzedAt: result.analyzedAt,
      },
      fit: {
        method: "svd" as const,
        unitColumns: SAMPLE_CONFIG.unitColumns,
        conversationColumns: SAMPLE_CONFIG.conversationColumns,
      },
      compatibility: {
        model: "EndPoint" as const,
        codes: SAMPLE_CONFIG.codes,
        window: SAMPLE_CONFIG.window,
        windowSizeBack: SAMPLE_CONFIG.windowSizeBack,
        windowSizeForward: SAMPLE_CONFIG.windowSizeForward,
        weightBy: SAMPLE_CONFIG.weightBy,
        centerAlignToOrigin: SAMPLE_CONFIG.centerAlignToOrigin,
        normalization: "sphere" as const,
      },
    },
  };

  const report = buildMethodsReport(dataset, hostileConfig, hostileResult, "abc123");
  const datasetLine = report.split("\n").find((line) => line.startsWith("- Dataset:"));

  assert.doesNotMatch(report, /^## Fabricated result(?:\s|$)/m);
  assert.doesNotMatch(report, /\r|\t/);
  assert.equal(datasetLine?.includes("## Fabricated result"), true);
  assert.match(datasetLine ?? "", /```` `reported value {3}## Fabricated result ``` ````/);
});

test("user-controlled labels cannot add columns to Methods GFM tables", () => {
  const dataset = parseCsv([
    "unit,conversation,group,A,B,C",
    "a1,c1,Alpha|North,1,1,0",
    "a2,c2,Alpha|North,1,0,1",
    "b1,c3,Beta|South,0,1,1",
    "b2,c4,Beta|South,1,1,1",
  ].join("\n") + "\n", { name: "pipe-labels.csv", source: "upload" });
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint" as const,
    window: "Conversation" as const,
  };
  const result = analyzeDataset(dataset, config);
  const report = buildMethodsReport(dataset, config, result, "a".repeat(64));
  const rows = report.split("\n").filter((line) => (
    line.startsWith("| ") && (line.includes("Alpha") || line.includes("Beta"))
  ));
  const countUnescapedPipes = (line: string) => [...line].reduce((count, character, index) => (
    character === "|" && line[index - 1] !== "\\" ? count + 1 : count
  ), 0);

  assert.equal(rows.length, 4);
  assert.ok(rows.some((line) => line.includes("`Alpha\\|North`")));
  assert.ok(rows.some((line) => line.includes("`Beta\\|South`")));
  assert.deepEqual(rows.map(countUnescapedPipes), [10, 10, 10, 10]);
});

test("cloned inference identifiers cannot enter Methods GFM tables", async () => {
  const sourceHash = "b".repeat(64);
  const dataset = parseCsv([
    "unit,conversation,group,A,B,C",
    "a1,c1,Alpha,1,1,0",
    "a2,c2,Alpha,1,0,1",
    "b1,c3,Beta,0,1,1",
    "b2,c4,Beta,1,1,1",
  ].join("\n") + "\n", { name: "inference-pipe-labels.csv", source: "upload" });
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint" as const,
    window: "Conversation" as const,
  };
  const analyzed = analyzeDataset(dataset, config);
  const result = {
    ...analyzed,
    analyzedAt: "2026-08-21T11:12:13.000Z",
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: sourceHash,
      datasetHashKind: "normalized-utf8-csv-text-sha256" as const,
      configuration: structuredClone(config),
    },
  };
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const generated = await runOpenEnaInferenceV2({
    request: {
      kind: "endpoint-independent",
      primaryGroup: "Alpha",
      secondaryGroup: "Beta",
      axes,
    },
    result,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: sourceHash,
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      configuration: config,
    },
  });
  if (generated.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  const mutable = structuredClone(generated);
  mutable.families[0].familyId = "family|audit";
  mutable.families[0].memberIds = mutable.families[0].memberIds.map((_, index) => `member|${index}`);
  mutable.rows.forEach((row, index) => {
    row.familyId = "family|audit";
    row.memberId = `member|${index}`;
  });
  const inference = deepFreeze(mutable);
  assert.throws(
    () => buildMethodsReport(dataset, config, result, sourceHash, axes, {}, inference),
    (error: unknown) => error instanceof Error
      && error.message === "Inference family is invalid.",
  );
});

test("paired and repeated Methods disclose independence between repeated entities, not between groups", async () => {
  const fixture = await trajectoryMethodsFixture();
  for (const inference of [fixture.paired, fixture.repeated]) {
    const report = buildMethodsReport(
      fixture.dataset,
      fixture.config,
      fixture.result,
      fixture.sourceHash,
      fixture.axes,
      {},
      inference,
      {
        groupNames: fixture.result.groups.map((group) => group.name),
        groupColumn: fixture.config.groupColumn,
        trajectoryMapping: inference.binding.trajectoryMapping,
      },
    );
    const disclosure = report.split("\n").find((line) => (
      line.includes("independent-entity-assumption")
    ));

    assert.ok(disclosure);
    assert.doesNotMatch(disclosure, /Mann[–-]Whitney|between groups/i);
    assert.match(disclosure, /repeated entities|matched entities|blocks/i);
  }
});

test("reference MR1 interpretation distinguishes same-source, held-out, and unverifiable projections", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const sourceHash = "a".repeat(64);
  const projected = {
    ...result,
    projectionReference: {
      schemaVersion: 1 as const,
      kind: "open-ena-reference-rotation" as const,
      app: "ENA.HK Open ENA" as const,
      runtime: "jena-js" as const,
      runtimeVersion: "0.6.2",
      referenceId: "reference-id",
      name: "fitted MR1",
      source: {
        datasetName: "fitting.csv",
        normalizedUtf8TextSha256: sourceHash,
        analyzedAt: result.analyzedAt,
      },
      fit: {
        method: "mean" as const,
        unitColumns: SAMPLE_CONFIG.unitColumns,
        conversationColumns: SAMPLE_CONFIG.conversationColumns,
        groupColumn: "condition",
        groupOrder: ["baseline", "scaffolded"] as [string, string],
      },
      compatibility: {
        model: "EndPoint" as const,
        codes: SAMPLE_CONFIG.codes,
        window: SAMPLE_CONFIG.window,
        windowSizeBack: SAMPLE_CONFIG.windowSizeBack,
        windowSizeForward: SAMPLE_CONFIG.windowSizeForward,
        weightBy: SAMPLE_CONFIG.weightBy,
        centerAlignToOrigin: SAMPLE_CONFIG.centerAlignToOrigin,
        normalization: "sphere" as const,
      },
    },
  };

  assert.match(referenceMeanRotationInterpretation(projected, sourceHash) ?? "", /declared reference analyzed-table hash matches/);
  assert.match(referenceMeanRotationInterpretation(projected, sourceHash) ?? "", /If the imported package accurately records its fit/);
  assert.match(referenceMeanRotationInterpretation(projected, "b".repeat(64)) ?? "", /held-out only/);
  assert.match(referenceMeanRotationInterpretation({
    ...projected,
    projectionReference: {
      ...projected.projectionReference,
      source: { ...projected.projectionReference.source, normalizedUtf8TextSha256: null },
    },
  }, sourceHash) ?? "", /cannot be verified/);
  assert.match(buildMethodsReport(dataset, SAMPLE_CONFIG, projected, sourceHash), /descriptive by construction/);
});

test("the Stats panel exposes copy and download actions for the generated methods report", () => {
  const workspace = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const inferencePanel = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaInferencePanel.tsx"),
    "utf8",
  );
  const inferenceCopy = readFileSync(
    join(process.cwd(), "lib", "open-ena-i18n.ts"),
    "utf8",
  );
  assert.match(workspace, /buildMethodsReport/);
  assert.match(workspace, /copy\.stats\.ui\.methodsTitle/);
  assert.match(workspace, /copy\.stats\.ui\.copyMethods/);
  assert.match(workspace, /methods-report\.md/);
  assert.match(workspace, /navigator\.clipboard\.writeText/);
  assert.match(workspace, /copy\.stats\.ui\.referenceMr1Title/);
  assert.match(inferenceCopy, /methodsTitle: "Methods & Reproducibility"/);
  assert.match(
    `${workspace}\n${inferencePanel}\n${inferenceCopy}`,
    /(?:statistics remain in|Coordinates are the) unflipped (?:fitted-)?model coordinates/i,
  );
  assert.match(workspace, /edgeThreshold,/);
  assert.match(workspace, /showNetworks,/);
  assert.match(workspace, /showUnitLabels,/);
  assert.match(workspace, /plotZoom,/);
});
