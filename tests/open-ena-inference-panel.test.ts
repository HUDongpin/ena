import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaInferencePanel from "../components/open-ena/OpenEnaInferencePanel";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import type {
  OpenEnaFriedmanInferenceRowV2,
  OpenEnaInferenceResultV2,
  OpenEnaWilcoxonInferenceRowV2,
} from "../lib/open-ena/inference-v2";
import { OPEN_ENA_RANK_INFERENCE_METHOD } from "../lib/open-ena/rank-inference";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const componentPath = join(projectRoot, "components/open-ena/OpenEnaInferencePanel.tsx");
const source = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";

test("Comparison exposes three native research-design radios without another tablist or method picker", () => {
  assert.ok(source, "the controlled inference panel must exist");
  assert.match(source, /<div[^>]*role="radiogroup"[^>]*data-ena-inference-design/);
  assert.match(source, /aria-label=\{copy\.designLegend\}/);
  assert.doesNotMatch(source, /<legend>\{copy\.designLegend\}<\/legend>/);
  assert.match(source, /type="radio"/);
  assert.match(source, /designIndependent/);
  assert.match(source, /designPaired/);
  assert.match(source, /designRepeated/);
  assert.doesNotMatch(source, /role="tablist"/);
  assert.doesNotMatch(source, /method(?:Picker|Select|Options)|name="(?:method|statistical-method)"/i);
});

test("disabled designs, eligibility, integrity errors, and results expose the required accessibility semantics", () => {
  assert.match(source, /aria-describedby=\{[^}]*reasonId/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /tabIndex=\{-1\}/);
  assert.match(source, /href="#open-ena-inference-results"/);
  assert.match(source, /<caption>/);
  assert.match(source, /scope="col"/);
  assert.match(source, /scope="row"/);
});

test("Holm-adjusted p is the primary result and raw p remains an audit column", () => {
  const holm = source.indexOf("copy.pHolm");
  const raw = source.indexOf("copy.pRaw");
  assert.ok(holm >= 0, "the panel must label Holm-adjusted p");
  assert.ok(raw > holm, "Holm-adjusted p must precede the raw audit p column");
  assert.doesNotMatch(source, /p\s*[<=>]\s*0?\.0?5|significant|not significant/i);
});

test("the panel consumes only aggregate preview/result props and cannot render private longitudinal rows", () => {
  assert.doesNotMatch(
    source,
    /entityToken|canonicalIdentity|comparisonFrame|\.pairs\b|\.blocks\b|entityPeriodCoordinates|pairedDifferences/,
  );
  assert.match(source, /preview\.rows\.map/);
  assert.match(source, /OpenEnaInferenceResultV2/);
});

test("all supported workbench locales use full rank-test names and complete inference copy", () => {
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const localized = getOpenEnaCopy(locale);
    const copy = localized.stats.inference;
    assert.match(copy.designIndependent, /Mann[–-]Whitney U/);
    assert.match(copy.designPaired, /Wilcoxon signed-rank/);
    assert.match(copy.designRepeated, /Friedman[\s\S]*Wilcoxon signed-rank/);
    assert.match(localized.contrast.multiplicity, /Holm/);
    assert.doesNotMatch(localized.contrast.multiplicity, /No multiplicity correction|不作多重/iu);
    for (const [key, value] of Object.entries(copy)) {
      if (typeof value === "string") assert.ok(value.trim(), `${locale} inference copy ${key} must not be empty`);
    }
  }
});

test("endpoint output uses the exact non-temporal title in every locale while retaining the full test name", () => {
  const expectedTitles = {
    en: "Independent endpoint groups",
    "zh-hant": "獨立端點群組",
    "zh-hans": "独立端点组",
  } as const;
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const copy = getOpenEnaCopy(locale).stats.inference;
    assert.equal(copy.mannWhitneyEndpointCaption, expectedTitles[locale]);
    assert.match(copy.designIndependent, /Mann[–-]Whitney U/);
    assert.ok(copy.endpointTemporalBoundary.trim());
  }
});

test("Simplified Chinese Stats navigation and inference copy do not fall back to Traditional Chinese or English frame jargon", () => {
  const copy = getOpenEnaCopy("zh-hans");
  assert.deepEqual(copy.stats.tabs, {
    comparison: "比较",
    goodness: "拟合优度",
    variance: "方差",
  });
  assert.doesNotMatch(copy.stats.inference.provisionalZeroFirstAxis, /frame|檢|軸|執|與/iu);
  assert.doesNotMatch(copy.stats.inference.provisionalZeroSecondAxis, /frame|檢|軸|執|與/iu);
});

const noOp = () => undefined;

function panelProps() {
  const copy = getOpenEnaCopy("en").stats.inference;
  return {
    copy,
    modelType: "EndPoint" as const,
    design: null,
    designAvailability: {
      independent: { enabled: true, reason: null },
      paired: { enabled: false, reason: copy.pairedRequiresTrajectory },
      repeated: { enabled: false, reason: copy.repeatedRequiresTrajectory },
    },
    onDesignChange: noOp,
    repeatedEntityColumns: [],
    repeatedEntityColumnOptions: [],
    identityConfirmed: false,
    onRepeatedEntityColumnsChange: noOp,
    onIdentityConfirmedChange: noOp,
    timeColumn: "",
    timeColumnOptions: [],
    onTimeColumnChange: noOp,
    groupOptions: ["Primary", "Secondary"],
    selectedGroup: null,
    primaryGroup: "Primary",
    secondaryGroup: "Secondary",
    onSelectedGroupChange: noOp,
    onPrimaryGroupChange: noOp,
    onSecondaryGroupChange: noOp,
    periodOptions: [],
    selectedPeriod: "",
    earlierPeriod: "",
    laterPeriod: "",
    repeatedPeriods: [],
    onSelectedPeriodChange: noOp,
    onEarlierPeriodChange: noOp,
    onLaterPeriodChange: noOp,
    onRepeatedPeriodsChange: noOp,
    preview: null,
    eligibilityMessage: copy.eligibilitySelectDesign,
    canRun: false,
    running: false,
    inference: null,
    integrityError: null,
    onRun: noOp,
  };
}

function availableEndpointInference(): Extract<OpenEnaInferenceResultV2, { kind: "endpoint-independent" }> {
  return Object.freeze({
    schemaVersion: 2,
    kind: "endpoint-independent",
    analyzedAt: "2026-08-21T09:08:07.000Z",
    request: {
      kind: "endpoint-independent",
      primaryGroup: "Primary",
      secondaryGroup: "Secondary",
      axes: ["MR1", "SVD2"],
    },
    binding: {
      analyzedAt: "2026-08-21T09:08:07.000Z",
      dataset: {
        normalizedUtf8TextSha256: "a".repeat(64),
        hashKind: "normalized-utf8-csv-text-sha256",
      },
      modelType: "EndPoint",
      configuration: SAMPLE_CONFIG,
      axes: ["MR1", "SVD2"],
      trajectoryMapping: null,
    },
    coordinateSystem: "unflipped-model-coordinates",
    provenance: "ENA.HK post-projection inference",
    method: OPEN_ENA_RANK_INFERENCE_METHOD,
    status: "available",
    reason: null,
    scope: {
      design: "independent-endpoint-groups",
      analysisUnit: "endpoint-analytic-unit",
      temporalScope: "endpoint-common-period-not-verified",
      primaryGroup: "Primary",
      secondaryGroup: "Secondary",
    },
    ledger: {
      candidateEntityCount: 8,
      primaryAvailableCount: 4,
      secondaryAvailableCount: 4,
      includedEntityCount: 8,
      includedAnalyticPointCount: 8,
    },
    families: [],
    warnings: ["small-sample"],
    rows: [{
      axisIndex: 0,
      axis: "MR1",
      test: "mann-whitney-u",
      status: "available",
      reason: null,
      familyId: "family-safe",
      memberId: "member-safe",
      familySizePlanned: 2,
      pRaw: 0.028571,
      pHolm: 0.057142,
      holmRank: 1,
      holmMultiplier: 2,
      resolvedPMethod: "exact-classic",
      continuityCorrectionApplied: false,
      tieGroupCount: 0,
      tiedObservationCount: 0,
      tieCorrectionSum: 0,
      warnings: ["small-sample"],
      effectDirection: "positive-primary-higher-ranks",
      nPrimary: 4,
      nSecondary: 4,
      medianPrimary: 2,
      medianSecondary: 1,
      uPrimary: 16,
      uSecondary: 0,
      z: null,
      rankBiserialPrimaryVsSecondary: 1,
      exactTail: null,
    }],
  } satisfies OpenEnaInferenceResultV2);
}

const TRAJECTORY_CONFIG: OpenEnaConfig = {
  ...SAMPLE_CONFIG,
  unitColumns: ["Group", "Name"],
  conversationColumns: ["Lesson"],
  groupColumn: "Group",
  model: "SeparateTrajectory",
};

function trajectoryBinding() {
  return {
    analyzedAt: "2026-08-21T10:11:12.000Z",
    dataset: {
      normalizedUtf8TextSha256: "b".repeat(64),
      hashKind: "normalized-utf8-csv-text-sha256" as const,
    },
    modelType: "SeparateTrajectory" as const,
    configuration: TRAJECTORY_CONFIG,
    axes: ["MR1", "SVD2"] as [string, string],
    trajectoryMapping: {
      contractVersion: 1 as const,
      repeatedEntityColumns: ["Group", "Name"],
      identityConfirmed: true as const,
      timeColumn: "Lesson",
      timeOrder: ["Lesson 1", "Lesson 2", "Lesson 3"],
    },
  };
}

function trajectoryPanelProps() {
  const copy = getOpenEnaCopy("en").stats.inference;
  return {
    ...panelProps(),
    modelType: "SeparateTrajectory" as const,
    designAvailability: {
      independent: { enabled: true, reason: null },
      paired: { enabled: true, reason: null },
      repeated: { enabled: true, reason: null },
    },
    repeatedEntityColumns: ["Group", "Name"],
    repeatedEntityColumnOptions: ["Group", "Name"],
    identityConfirmed: true,
    timeColumn: "Lesson",
    timeColumnOptions: ["Lesson"],
    groupOptions: ["Experimental", "Control"],
    selectedGroup: "Experimental",
    primaryGroup: "Experimental",
    secondaryGroup: "Control",
    periodOptions: ["Lesson 1", "Lesson 2", "Lesson 3"],
    selectedPeriod: "Lesson 2",
    earlierPeriod: "Lesson 1",
    laterPeriod: "Lesson 2",
    repeatedPeriods: ["Lesson 1", "Lesson 2", "Lesson 3"],
    preview: {
      message: copy.eligibilityReady,
      rows: [
        { id: "candidates", label: copy.candidateEntities, value: 9 },
        { id: "included", label: copy.includedEntities, value: 8 },
      ],
    },
    eligibilityMessage: copy.eligibilityReady,
    canRun: true,
  };
}

function availableTrajectoryIndependentInference(): OpenEnaInferenceResultV2 {
  return Object.freeze({
    schemaVersion: 2,
    kind: "trajectory-independent-period",
    analyzedAt: "2026-08-21T10:11:12.000Z",
    request: {
      kind: "trajectory-independent-period",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Lesson",
      period: "Lesson 2",
      primaryGroup: "Experimental",
      secondaryGroup: "Control",
      axes: ["MR1", "SVD2"],
    },
    binding: trajectoryBinding(),
    coordinateSystem: "unflipped-model-coordinates",
    provenance: "ENA.HK post-projection inference",
    method: OPEN_ENA_RANK_INFERENCE_METHOD,
    status: "available",
    reason: null,
    scope: {
      design: "independent-groups-at-one-period",
      analysisUnit: "compact-entity-period-point",
      timeColumn: "Lesson",
      period: "Lesson 2",
      primaryGroup: "Experimental",
      secondaryGroup: "Control",
    },
    ledger: {
      candidateEntityCount: 9,
      primaryAvailableCount: 4,
      secondaryAvailableCount: 4,
      includedEntityCount: 8,
      includedCompactPointCount: 8,
      includedSourcePointCount: 16,
    },
    families: [{
      role: "comparison",
      familyId: "trajectory-independent-family",
      familySizePlanned: 2,
      memberIds: ["trajectory-independent-mr1"],
    }],
    warnings: ["small-sample"],
    rows: [{
      ...availableEndpointInference().rows[0],
      familyId: "trajectory-independent-family",
      memberId: "trajectory-independent-mr1",
      nPrimary: 4,
      nSecondary: 4,
      medianPrimary: 0.8,
      medianSecondary: 0.2,
      pRaw: 0.028571,
      pHolm: 0.057142,
    }],
  } satisfies OpenEnaInferenceResultV2);
}

function wilcoxonRow(
  axisIndex: 0 | 1,
  axis: string,
  earlierPeriodIndex: number,
  laterPeriodIndex: number,
  familyId: string,
  memberId: string,
  nMissing: number,
  pRaw: number,
  pHolm: number,
): OpenEnaWilcoxonInferenceRowV2 {
  return {
    axisIndex,
    axis,
    test: "wilcoxon-signed-rank",
    status: "available",
    reason: null,
    familyId,
    memberId,
    familySizePlanned: 2,
    pRaw,
    pHolm,
    holmRank: 1,
    holmMultiplier: 2,
    resolvedPMethod: "exact-conditional-sign-flip",
    continuityCorrectionApplied: false,
    tieGroupCount: 1,
    tiedObservationCount: 2,
    tieCorrectionSum: 6,
    warnings: ["small-sample", "ties-present", "signed-rank-symmetry-assumption"],
    effectDirection: "positive-later-higher",
    earlierPeriodIndex,
    laterPeriodIndex,
    differenceDirection: "later-minus-earlier",
    nMatched: 6,
    nMissing,
    nPositive: 4,
    nNegative: 1,
    nZero: 1,
    nNonzero: 5,
    nRanked: 5,
    medianDifference: 0.25,
    q1Difference: 0.1,
    q3Difference: 0.4,
    iqrDifference: 0.3,
    wPositive: 13,
    wNegative: 2,
    t: 2,
    z: null,
    rankBiserialLaterVsEarlier: 11 / 15,
    exactTail: null,
    minimumAttainableTwoSidedP: {
      formula: "2^(1-nNonzero)",
      log2: -4,
      numeric: 0.0625,
    },
  };
}

function availablePairedInference(): OpenEnaInferenceResultV2 {
  const rows = [
    wilcoxonRow(0, "MR1", 0, 1, "paired-family", "paired-mr1", 1, 0.0625, 0.125),
    wilcoxonRow(1, "SVD2", 0, 1, "paired-family", "paired-svd2", 1, 0.125, 0.125),
  ];
  return Object.freeze({
    schemaVersion: 2,
    kind: "trajectory-paired-periods",
    analyzedAt: "2026-08-21T10:11:12.000Z",
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Lesson",
      group: "Experimental",
      earlierPeriod: "Lesson 1",
      laterPeriod: "Lesson 2",
      axes: ["MR1", "SVD2"],
      cohortPolicy: "pairwise-complete",
    },
    binding: trajectoryBinding(),
    coordinateSystem: "unflipped-model-coordinates",
    provenance: "ENA.HK post-projection inference",
    method: OPEN_ENA_RANK_INFERENCE_METHOD,
    status: "available",
    reason: null,
    scope: {
      design: "same-entities-at-two-periods",
      analysisUnit: "repeated-entity",
      timeColumn: "Lesson",
      group: "Experimental",
      earlierPeriod: "Lesson 1",
      laterPeriod: "Lesson 2",
      differenceDirection: "later-minus-earlier",
      cohortPolicy: "pairwise-complete",
    },
    ledger: {
      candidateEntityCount: 7,
      earlierAvailableCount: 7,
      laterAvailableCount: 6,
      matchedEntityCount: 6,
      earlierOnlyCount: 1,
      laterOnlyCount: 0,
      missingPairCount: 1,
      earlierAvailableCompactPointCount: 7,
      laterAvailableCompactPointCount: 6,
      earlierAvailableSourcePointCount: 14,
      laterAvailableSourcePointCount: 12,
      matchedCompactPointCount: 12,
      matchedSourcePointCount: 24,
      axes: [
        { axisIndex: 0, zeroDifferenceCount: 1, nonzeroDifferenceCount: 5, rankedCount: 5 },
        { axisIndex: 1, zeroDifferenceCount: 1, nonzeroDifferenceCount: 5, rankedCount: 5 },
      ],
    },
    families: [{
      role: "comparison",
      familyId: "paired-family",
      familySizePlanned: 2,
      memberIds: rows.map((row) => row.memberId),
    }],
    rows,
    warnings: ["small-sample", "ties-present", "missing-pairs", "signed-rank-symmetry-assumption"],
  } satisfies OpenEnaInferenceResultV2);
}

function friedmanRow(axisIndex: 0 | 1, axis: string): OpenEnaFriedmanInferenceRowV2 {
  return {
    axisIndex,
    axis,
    test: "friedman",
    status: "available",
    reason: null,
    familyId: "friedman-family",
    memberId: `friedman-${axisIndex}`,
    familySizePlanned: 2,
    pRaw: axisIndex === 0 ? 0.02 : 0.04,
    pHolm: 0.04,
    holmRank: axisIndex + 1,
    holmMultiplier: axisIndex === 0 ? 2 : 1,
    resolvedPMethod: "exact-conditional-period-permutation",
    continuityCorrectionApplied: false,
    tieGroupCount: 0,
    tiedObservationCount: 0,
    tieCorrectionSum: 0,
    warnings: ["small-sample"],
    effectDirection: "non-directional",
    nComplete: 5,
    nMissingCompleteBlocks: 1,
    nPeriods: 3,
    q: axisIndex === 0 ? 8.4 : 6.8,
    degreesFreedom: 2,
    kendallsW: axisIndex === 0 ? 0.84 : 0.68,
    exactTail: null,
  };
}

function availableRepeatedInference(): OpenEnaInferenceResultV2 {
  const omnibusRows = [friedmanRow(0, "MR1"), friedmanRow(1, "SVD2")];
  const periodPairs = [[0, 1], [0, 2], [1, 2]] as const;
  const followupRows = ([0, 1] as const).flatMap((axisIndex) => periodPairs.map(([earlier, later], pairIndex) => (
    wilcoxonRow(
      axisIndex,
      axisIndex === 0 ? "MR1" : "SVD2",
      earlier,
      later,
      "repeated-followup-family",
      `followup-${axisIndex}-${earlier}-${later}`,
      0,
      0.03 + pairIndex * 0.01,
      0.18 + pairIndex * 0.03,
    )
  )));
  return Object.freeze({
    schemaVersion: 2,
    kind: "trajectory-repeated-periods",
    analyzedAt: "2026-08-21T10:11:12.000Z",
    request: {
      kind: "trajectory-repeated-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Lesson",
      group: "Experimental",
      periods: ["Lesson 1", "Lesson 2", "Lesson 3"],
      axes: ["MR1", "SVD2"],
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    },
    binding: trajectoryBinding(),
    coordinateSystem: "unflipped-model-coordinates",
    provenance: "ENA.HK post-projection inference",
    method: OPEN_ENA_RANK_INFERENCE_METHOD,
    status: "available",
    reason: null,
    scope: {
      design: "same-entities-at-repeated-periods",
      analysisUnit: "repeated-entity",
      timeColumn: "Lesson",
      group: "Experimental",
      periods: ["Lesson 1", "Lesson 2", "Lesson 3"],
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    },
    ledger: {
      candidateEntityCount: 6,
      availableByPeriod: [
        { periodIndex: 0, availableEntityCount: 6, availableCompactPointCount: 6, availableSourcePointCount: 12 },
        { periodIndex: 1, availableEntityCount: 6, availableCompactPointCount: 6, availableSourcePointCount: 12 },
        { periodIndex: 2, availableEntityCount: 5, availableCompactPointCount: 5, availableSourcePointCount: 10 },
      ],
      completeBlockCount: 5,
      completeBlockCompactPointCount: 15,
      completeBlockSourcePointCount: 30,
      missingAnySelectedPeriodCount: 1,
    },
    families: [
      {
        role: "omnibus",
        familyId: "friedman-family",
        familySizePlanned: 2,
        memberIds: omnibusRows.map((row) => row.memberId),
      },
      {
        role: "posthoc",
        familyId: "repeated-followup-family",
        familySizePlanned: 6,
        memberIds: followupRows.map((row) => row.memberId),
      },
    ],
    omnibusRows,
    followupRows,
    warnings: ["small-sample", "missing-complete-blocks", "signed-rank-symmetry-assumption"],
  } satisfies OpenEnaInferenceResultV2);
}

test("server-rendered endpoint UI is pre-run by default and keeps unavailable longitudinal designs visible with reasons", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaInferencePanel, panelProps()));
  assert.match(markup, /<div[^>]*role="radiogroup"[^>]*data-ena-inference-design="true"/);
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 3);
  assert.match(markup, /Paired-period inference requires a successful trajectory model/);
  assert.match(markup, /Repeated-period inference requires a successful trajectory model/);
  assert.match(markup, /No inferential result has been run/);
  assert.doesNotMatch(markup, /Holm-adjusted p \(primary\)|Raw p \(audit\)/);
});

test("server-rendered result foregrounds Holm and discloses the immutable result provenance without private-row sentinels", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaInferencePanel, {
    ...panelProps(),
    design: "independent",
    inference: availableEndpointInference(),
  }));
  assert.match(markup, /data-ena-inference-provenance="true"/);
  assert.match(markup, /ENA\.HK post-projection inference/);
  assert.match(markup, /2026-08-21T09:08:07\.000Z/);
  assert.match(markup, /aaaaaaaaaaaa…/);
  assert.match(markup, /<caption>Independent endpoint groups<\/caption>/);
  assert.match(markup, /Independent groups · Mann–Whitney U/);
  assert.match(markup, /does not verify that the two independent groups share one common time period/);
  assert.ok(markup.indexOf("Holm-adjusted p (primary)") < markup.indexOf("Raw p (audit)"));
  assert.doesNotMatch(markup, /opaque-secret|participant-private|paired-difference-private/);
});

test("trajectory one-period independent UI exposes composite identity, time, period, aggregate ledger, and Mann–Whitney result", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaInferencePanel, {
    ...trajectoryPanelProps(),
    design: "independent",
    inference: availableTrajectoryIndependentInference(),
  }));
  const designGroup = markup.match(/<div[^>]*data-ena-inference-design="true"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.equal((designGroup.match(/type="radio"/g) ?? []).length, 3);
  assert.doesNotMatch(designGroup, /disabled=""/);
  assert.match(markup, /Composite repeated-entity identity/);
  assert.match(markup, />Group<|>Name</);
  assert.match(markup, /I confirm this composite identity/);
  assert.match(markup, /Time field[\s\S]*Lesson/);
  assert.match(markup, /Selected period[\s\S]*Lesson 2/);
  assert.match(markup, /Primary group[\s\S]*Experimental/);
  assert.match(markup, /Secondary group[\s\S]*Control/);
  assert.match(markup, /Inclusion ledger before inference/);
  assert.match(markup, /Candidate entities[\s\S]*9/);
  assert.match(markup, /Independent groups at one selected period · Mann–Whitney U/);
  assert.ok(markup.indexOf("Holm-adjusted p (primary)") < markup.indexOf("Raw p (audit)"));
  assert.doesNotMatch(markup, /does not verify that the two independent groups share one common time period/);
  assert.doesNotMatch(markup, /opaque-secret|participant-private|paired-difference-private/);
});

test("trajectory paired UI renders the pairwise-complete ledger and later-minus-earlier Wilcoxon audit table", () => {
  const copy = getOpenEnaCopy("en").stats.inference;
  const markup = renderToStaticMarkup(createElement(OpenEnaInferencePanel, {
    ...trajectoryPanelProps(),
    design: "paired",
    preview: {
      message: copy.eligibilityReady,
      rows: [
        { id: "candidates", label: copy.candidateEntities, value: 7 },
        { id: "matched", label: copy.matchedEntities, value: 6 },
        { id: "earlier-only", label: copy.earlierOnly, value: 1 },
        { id: "later-only", label: copy.laterOnly, value: 0 },
        { id: "missing", label: copy.missingPairs, value: 1 },
        { id: "zero-x", label: copy.provisionalZeroFirstAxis, value: 1 },
      ],
    },
    inference: availablePairedInference(),
  }));
  assert.match(markup, /One comparison group[\s\S]*Experimental/);
  assert.match(markup, /Earlier period[\s\S]*Lesson 1/);
  assert.match(markup, /Later period[\s\S]*Lesson 2/);
  assert.match(markup, /Matched entities[\s\S]*6/);
  assert.match(markup, /Earlier-only entities[\s\S]*1/);
  assert.match(markup, /Missing A\/B pairs[\s\S]*1/);
  assert.match(markup, /Paired periods · Wilcoxon signed-rank \(later minus earlier\)/);
  assert.match(markup, /Lesson 1 → Lesson 2/);
  assert.match(markup, /W positive/);
  assert.match(markup, /W negative/);
  assert.match(markup, /T = min\(W positive, W negative\)/);
  assert.match(markup, /exact-conditional-sign-flip/);
  assert.ok(markup.indexOf("Holm-adjusted p (primary)") < markup.indexOf("Raw p (audit)"));
  assert.doesNotMatch(markup, /opaque-secret|participant-private|paired-difference-private/);
});

test("trajectory repeated UI renders one all-period-complete cohort, Friedman, and every Holm follow-up pair", () => {
  const copy = getOpenEnaCopy("en").stats.inference;
  const markup = renderToStaticMarkup(createElement(OpenEnaInferencePanel, {
    ...trajectoryPanelProps(),
    design: "repeated",
    preview: {
      message: copy.eligibilityReady,
      rows: [
        { id: "candidates", label: copy.candidateEntities, value: 6 },
        { id: "lesson-1", label: `${copy.availableAtPeriod}: Lesson 1`, value: 6 },
        { id: "lesson-2", label: `${copy.availableAtPeriod}: Lesson 2`, value: 6 },
        { id: "lesson-3", label: `${copy.availableAtPeriod}: Lesson 3`, value: 5 },
        { id: "complete", label: copy.completeBlocks, value: 5 },
        { id: "missing-any", label: copy.missingAnySelectedPeriod, value: 1 },
      ],
    },
    inference: availableRepeatedInference(),
  }));
  assert.match(markup, /Selected repeated periods/);
  assert.equal((markup.match(/name="open-ena-inference-design"/g) ?? []).length, 3);
  for (const period of ["Lesson 1", "Lesson 2", "Lesson 3"]) assert.match(markup, new RegExp(period));
  assert.match(markup, /All-period complete entities[\s\S]*5/);
  assert.match(markup, /Missing any selected period[\s\S]*1/);
  assert.match(markup, /Repeated periods · Friedman omnibus/);
  assert.match(markup, /Complete n/);
  assert.match(markup, /Kendall’s W/);
  assert.match(markup, /All selected-period pairs · Holm-adjusted Wilcoxon signed-rank follow-ups/);
  for (const direction of ["Lesson 1 → Lesson 2", "Lesson 1 → Lesson 3", "Lesson 2 → Lesson 3"]) {
    assert.equal((markup.match(new RegExp(direction, "g")) ?? []).length, 2, `${direction} must appear for both axes`);
  }
  assert.ok(markup.indexOf("Holm-adjusted p (primary)") < markup.indexOf("Raw p (audit)"));
  assert.doesNotMatch(markup, /opaque-secret|participant-private|paired-difference-private/);
});
