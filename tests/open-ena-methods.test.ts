import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { buildAnalysisBundle } from "../lib/open-ena/export";
import { buildMethodsReport, referenceMeanRotationInterpretation } from "../lib/open-ena/methods";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

const sampleText = readFileSync(
  join(process.cwd(), "public", "data", "academy", "ena-design-talk-sample.csv"),
  "utf8",
);

test("the generated methods report records the analytic estimand without source-text leakage", () => {
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
  assert.match(report, /Mann–Whitney U/);
  assert.match(report, /auto exact-first/i);
  assert.match(report, /Resolved p method/);
  assert.match(report, /(?:exact-classic|exact-conditional-rank-permutation|normal-approximation-tie-corrected)/);
  assert.doesNotMatch(report, /two-sided normal-approximation p-value/i);
  assert.match(report, /no multiplicity correction/);
  assert.match(report, /abc123/);
  assert.match(report, /axis signs are arbitrary/i);
  assert.doesNotMatch(report, /compare alternatives|utterance/);
});

test("publication methods never render a small valid p-value as zero", () => {
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

  assert.match(report, /\| < \.001 \|/);
  assert.doesNotMatch(report, /\| 0\.000 \|/);
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

test("methods and bundle inference follow the researcher-selected visible axes", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  const selectedAxes = [result.dimensions[1], result.dimensions[2]];
  const report = buildMethodsReport(dataset, SAMPLE_CONFIG, result, "abc123", selectedAxes, { flipX: true, flipY: false });
  const inferenceTable = report.slice(report.indexOf("| Axis |"), report.indexOf("## Interpretation"));
  assert.match(inferenceTable, new RegExp(`\\| ${selectedAxes[0]} \\|`));
  assert.match(inferenceTable, new RegExp(`\\| ${selectedAxes[1]} \\|`));
  assert.doesNotMatch(inferenceTable, new RegExp(`\\| ${result.dimensions[0]} \\|`));
  assert.match(report, new RegExp(`Displayed 2D axes: X .*${selectedAxes[0]}.*\\(flipped\\); Y .*${selectedAxes[1]}.*\\(unflipped\\)`));
  assert.match(report, /in the unflipped model coordinate system/);

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
  const bundledTable = bundle.methodsReportMarkdown.slice(
    bundle.methodsReportMarkdown.indexOf("| Axis |"),
    bundle.methodsReportMarkdown.indexOf("## Interpretation"),
  );
  assert.match(bundledTable, new RegExp(`\\| ${selectedAxes[1]} \\|`));
  assert.match(bundle.methodsReportMarkdown, /X .*\(flipped\); Y .*\(unflipped\)/);
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

test("methods record displayed axes even when group inference is unavailable", () => {
  const dataset = parseCsv(sampleText, { name: "academy.csv", source: "sample" });
  const ungroupedConfig = { ...SAMPLE_CONFIG, groupColumn: null };
  const result = analyzeDataset(dataset, ungroupedConfig);
  const selectedAxes = [result.dimensions[1], result.dimensions[2]];
  const report = buildMethodsReport(dataset, ungroupedConfig, result, null, selectedAxes, { flipY: true });

  assert.match(report, /Group inference boundary/);
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
  assert.match(workspace, /buildMethodsReport/);
  assert.match(workspace, /Methods & Reproducibility/);
  assert.match(workspace, /Copy methods text/);
  assert.match(workspace, /methods-report\.md/);
  assert.match(workspace, /navigator\.clipboard\.writeText/);
  assert.match(workspace, /Reference MR1 interpretation/);
  assert.match(workspace, /statistics remain in unflipped model coordinates/);
  assert.match(workspace, /edgeThreshold,/);
  assert.match(workspace, /showNetworks,/);
  assert.match(workspace, /showUnitLabels,/);
  assert.match(workspace, /plotZoom,/);
});
