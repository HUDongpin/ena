import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { buildAnalysisBundle } from "../lib/open-ena/export";
import { flattenOpenEnaInferenceRows } from "../lib/open-ena/inference-consumers";
import { runOpenEnaInferenceV2 } from "../lib/open-ena/inference-v2";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import {
  buildLongitudinalDerivation,
  buildLongitudinalGroupCentroidExport,
  longitudinalInferenceRowsToCsv,
} from "../lib/open-ena/longitudinal";
import { buildMethodsReport } from "../lib/open-ena/methods";
import {
  SAMPLE_CONFIG,
  type OpenEnaConfig,
  type OpenEnaResult,
} from "../lib/open-ena/types";

const HASH = "f".repeat(64);
const HASH_KIND = "normalized-utf8-csv-text-sha256" as const;
const ANALYZED_AT = "2026-08-21T18:00:00.000Z";

function bindResult(result: OpenEnaResult, configuration: OpenEnaConfig): OpenEnaResult {
  return {
    ...result,
    analyzedAt: ANALYZED_AT,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: HASH_KIND,
      configuration: structuredClone(configuration),
    },
  };
}

function trajectoryFixture(periods: readonly string[]) {
  const rows = ["Group,Name,Period,A,B,C"];
  const patterns = {
    Control: ["1,1,0", "1,0,1", "1,1,1", "0,1,1"],
    Experimental: ["0,1,1", "0,1,0", "1,0,0", "0,0,1"],
  } as const;
  for (const group of ["Control", "Experimental"] as const) {
    for (let entity = 0; entity < patterns[group].length; entity += 1) {
      for (const [periodIndex, period] of periods.entries()) {
        const pattern = patterns[group][(entity + periodIndex) % patterns[group].length];
        rows.push(`${group},${group[0]}${entity + 1},${period},${pattern}`);
      }
    }
  }
  const dataset = parseCsv(`${rows.join("\n")}\n`, {
    name: `trajectory-${periods.length}-period.csv`,
    source: "upload",
  });
  const configuration: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["Group", "Name"],
    conversationColumns: ["Period"],
    groupColumn: "Group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
  };
  const result = bindResult(analyzeDataset(dataset, configuration), configuration);
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const derivation = buildLongitudinalDerivation(result, configuration, dataset, {
    repeatedEntityColumns: ["Group", "Name"],
    identityConfirmed: true,
    timeColumn: "Period",
    timeOrder: [...periods],
    cohortPolicy: "available",
    axes,
    datasetNormalizedUtf8TextSha256: HASH,
  }, ANALYZED_AT);
  return { dataset, configuration, result, axes, derivation };
}

function sameFourPeoplePairedFixture() {
  const dataset = parseCsv([
    "Cohort,Name,Period,A,B,C",
    "Study,P1,baseline,1,1,0",
    "Study,P1,scaffolded,1,0,1",
    "Study,P2,baseline,1,0,1",
    "Study,P2,scaffolded,0,1,1",
    "Study,P3,baseline,0,1,1",
    "Study,P3,scaffolded,1,1,0",
    "Study,P4,baseline,1,1,1",
    "Study,P4,scaffolded,0,1,0",
  ].join("\n") + "\n", {
    name: "same-four-people-baseline-scaffolded.csv",
    source: "upload",
  });
  const configuration: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["Cohort", "Name"],
    conversationColumns: ["Period"],
    groupColumn: "Cohort",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
  };
  const result = bindResult(analyzeDataset(dataset, configuration), configuration);
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const derivation = buildLongitudinalDerivation(result, configuration, dataset, {
    repeatedEntityColumns: ["Cohort", "Name"],
    identityConfirmed: true,
    timeColumn: "Period",
    timeOrder: ["baseline", "scaffolded"],
    cohortPolicy: "available",
    axes,
    datasetNormalizedUtf8TextSha256: HASH,
  }, ANALYZED_AT);
  return { configuration, result, axes, derivation };
}

function workspaceSource() {
  return readFileSync(
    join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
    "utf8",
  );
}

test("one current native inference authority feeds Stats AI and separate statistics export", () => {

  assert.match(v3, /inference\?\.key === consumerKey/);
  assert.match(v3, /inference=\{activeInference\}/);
  assert.match(v3, /inference: activeInference, controls:/);
  assert.match(v3, /exportNativeStatisticsV3\(activeInference, result, currentPlan, controls!/);
  assert.doesNotMatch(v3, /runOpenEnaInferenceV2|buildAnalysisBundle\(/);

});

test("JSON, Methods and inference CSV retain the exact values of one current inference", async () => {
  const trajectory = trajectoryFixture(["T1", "T2", "T3"]);
  const currentInference = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      earlierPeriod: "T1",
      laterPeriod: "T2",
      axes: trajectory.axes,
      cohortPolicy: "pairwise-complete",
    },
    result: trajectory.result,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: HASH_KIND,
      configuration: trajectory.configuration,
    },
    comparisonFrame: trajectory.derivation.comparisonFrame,
  });
  const inferenceContext = {
    groupNames: trajectory.result.groups.map((group) => group.name),
    groupColumn: trajectory.configuration.groupColumn,
    trajectoryMapping: {
      contractVersion: 1 as const,
      repeatedEntityColumns: [...trajectory.derivation.view.repeatedEntityColumns],
      identityConfirmed: true as const,
      timeColumn: trajectory.derivation.view.timeColumn,
      timeOrder: [...trajectory.derivation.view.timeOrder],
    },
  };
  const methods = buildMethodsReport(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    trajectory.axes,
    {},
    currentInference,
    inferenceContext,
  );
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    {
      methodsDimensions: trajectory.axes,
      inference: currentInference,
      inferenceContext,
    },
  );
  const longitudinal = buildLongitudinalGroupCentroidExport(
    trajectory.derivation.view,
    undefined,
    currentInference,
  );
  const inferenceCsv = longitudinalInferenceRowsToCsv(
    trajectory.derivation.view,
    currentInference,
  );
  const parsedCsv = parseCsv(inferenceCsv, { name: "current-inference.csv", source: "upload" });
  const expectedRows = flattenOpenEnaInferenceRows(currentInference);

  assert.strictEqual(bundle.inference, currentInference);
  assert.strictEqual(longitudinal.inference, currentInference);
  assert.equal(bundle.methodsReportMarkdown, methods);
  assert.deepEqual(JSON.parse(JSON.stringify(bundle.inference)), currentInference);
  assert.equal(parsedCsv.rows.length, expectedRows.length);
  for (const expected of expectedRows) {
    const downloaded = parsedCsv.rows.find((row) => row.memberId === expected.memberId);
    assert.ok(downloaded, `CSV must retain inference member ${expected.memberId}`);
    for (const field of [
      "test", "axis", "status", "familyId", "memberId", "pRaw", "pHolm",
      "resolvedPMethod", "nMatched", "nMissing", "nZero", "wPositive", "wNegative",
      "rankBiserialLaterVsEarlier",
    ] as const) {
      const expectedValue = expected[field];
      assert.equal(
        downloaded[field],
        expectedValue === null || expectedValue === undefined ? null : String(expectedValue),
        `CSV ${expected.memberId} ${field} must match currentInference`,
      );
    }
    if (expected.pRaw !== null) assert.ok(methods.includes(String(expected.pRaw)));
    if (expected.pHolm !== null) assert.ok(methods.includes(String(expected.pHolm)));
  }
});

test("a real one-period trajectory builds a private frame and runs independent Mann–Whitney", async () => {
  const trajectory = trajectoryFixture(["T1"]);
  assert.equal(trajectory.derivation.comparisonFrame.timeOrder.length, 1);
  assert.equal(trajectory.derivation.comparisonFrame.points.length, 8);
  const inference = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-independent-period",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      period: "T1",
      primaryGroup: "Control",
      secondaryGroup: "Experimental",
      axes: trajectory.axes,
    },
    result: trajectory.result,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: HASH_KIND,
      configuration: trajectory.configuration,
    },
    comparisonFrame: trajectory.derivation.comparisonFrame,
  });
  assert.equal(inference.kind, "trajectory-independent-period");
  assert.notEqual(inference.status, "disabled");
  assert.equal(inference.rows.length, 2);


  assert.match(v3, /trajectory-independent-period/);
  assert.match(v3, /trajectory-paired-periods/);
  assert.match(v3, /runOpenEnaTrajectoryInferenceV3/);
  assert.match(v3, /primaryGroup: endpointControls!.primaryGroup/);

});

test("the same four people at baseline and scaffolded enter paired Wilcoxon, never 4+4 Mann–Whitney", async () => {
  const fixture = sameFourPeoplePairedFixture();
  assert.deepEqual(fixture.result.groups.map((group) => group.name), ["Study"]);
  assert.deepEqual(fixture.derivation.comparisonFrame.repeatedEntityColumns, ["Cohort", "Name"]);
  assert.equal(fixture.derivation.comparisonFrame.points.length, 8);

  const commonInput = {
    result: fixture.result,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: HASH_KIND,
      configuration: fixture.configuration,
    },
    comparisonFrame: fixture.derivation.comparisonFrame,
  };
  const paired = await runOpenEnaInferenceV2({
    ...commonInput,
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Cohort", "Name"],
      timeColumn: "Period",
      group: "Study",
      earlierPeriod: "baseline",
      laterPeriod: "scaffolded",
      axes: fixture.axes,
      cohortPolicy: "pairwise-complete",
    },
  });
  assert.equal(paired.kind, "trajectory-paired-periods");
  assert.equal(paired.ledger?.matchedEntityCount, 4);
  assert.equal(paired.rows.length, 2);
  assert.ok(paired.rows.every((row) => row.test === "wilcoxon-signed-rank"));
  assert.ok(paired.rows.every((row) => row.nMatched === 4));

  const periodAsGroup = await runOpenEnaInferenceV2({
    ...commonInput,
    request: {
      kind: "trajectory-independent-period",
      repeatedEntityColumns: ["Cohort", "Name"],
      timeColumn: "Period",
      period: "baseline",
      primaryGroup: "baseline",
      secondaryGroup: "scaffolded",
      axes: fixture.axes,
    },
  });
  assert.equal(periodAsGroup.kind, "trajectory-independent-period");
  assert.equal(periodAsGroup.status, "disabled");
  assert.equal(periodAsGroup.reason, "group-invalid");
  assert.deepEqual(periodAsGroup.rows, []);
  assert.doesNotMatch(JSON.stringify(periodAsGroup.rows), /mann-whitney-u/);


  assert.match(v3, /trajectory-independent-period/);
  assert.match(v3, /trajectory-paired-periods/);
  assert.match(v3, /runOpenEnaTrajectoryInferenceV3/);
  assert.match(v3, /primaryGroup: endpointControls!.primaryGroup/);

});

test("stable result, warning, integrity and p-method codes have localized researcher-facing copy", () => {
  const reasonCodes = [
    "design-not-confirmed", "identity-not-confirmed", "identity-columns-invalid",
    "identity-component-empty", "time-column-invalid", "axes-invalid", "group-required",
    "group-invalid", "groups-must-differ", "period-invalid", "periods-must-differ",
    "at-least-three-periods-required", "empty-group", "insufficient-ranked-observations",
    "all-values-tied", "all-zero-differences", "no-complete-blocks",
  ];
  const integrityCodes = [
    "binding-mismatch", "identity-collision", "group-instability",
    "entity-period-instability", "nonfinite-coordinate",
  ];
  const warningCodes = [
    "small-sample", "discrete-attainable-p", "ties-present", "zero-differences-present",
    "missing-pairs", "missing-complete-blocks", "signed-rank-symmetry-assumption",
    "independent-entity-assumption", "cluster-independence-unverified",
    "accumulated-trajectory-path-dependence", "arbitrary-axis-sign", "mr1-circularity",
  ];
  const methodCodes = [
    "exact-classic", "exact-conditional-rank-permutation", "normal-approximation-tie-corrected",
    "exact-conditional-sign-flip", "normal-approximation-actual-ranks",
    "exact-conditional-period-permutation", "chi-square-approximation-tie-corrected",
  ];
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const localized = getOpenEnaCopy(locale);
    const inference = localized.stats.inference;
    const dictionaries: Array<[
      string,
      readonly string[],
      object,
    ]> = [
      ["reason", reasonCodes, inference.reasonMessages],
      ["integrity", integrityCodes, inference.integrityMessages],
      ["warning", warningCodes, inference.warningMessages],
      ["method", methodCodes, inference.resolvedMethodNames],
    ];
    for (const [label, codes, dictionary] of dictionaries) {
      for (const code of codes) {
        const message = (dictionary as Readonly<Record<string, string>>)[code];
        assert.ok(message?.trim(), `${locale} ${label} code ${code} must be localized`);
        assert.notEqual(message, code, `${locale} ${label} code ${code} must not be shown raw`);
      }
    }
    assert.ok(inference.auditCodeLabel.trim());
    assert.ok(localized.longitudinal.exportInferenceCsv.trim());
  }
  assert.match(getOpenEnaCopy("en").longitudinal.exportInferenceCsv, /inferential comparison CSV/i);
  assert.match(getOpenEnaCopy("zh-hant").longitudinal.exportInferenceCsv, /推論比較 CSV/);
  assert.match(getOpenEnaCopy("zh-hans").longitudinal.exportInferenceCsv, /推断比较 CSV/);

  const panel = readFileSync(
    join(process.cwd(), "components/open-ena/OpenEnaInferencePanel.tsx"),
    "utf8",
  );
  assert.match(panel, /localizedReason\(copy,/);
  assert.match(panel, /localizedIntegrity\(copy,/);
  assert.match(panel, /localizedWarning\(copy,/);
  assert.match(panel, /localizedResolvedMethod\(copy,/);
  assert.doesNotMatch(panel, /\{row\.resolvedPMethod \?\? "—"\}/);
  assert.doesNotMatch(panel, /<li key=\{warning\}>\{warning\}<\/li>/);
});
