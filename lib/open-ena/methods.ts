import { assertOpenEnaInferenceBindingV2 } from "./inference-consumers";
import type {
  OpenEnaInferenceResultV2,
  OpenEnaMannWhitneyInferenceRowV2,
  OpenEnaWilcoxonInferenceRowV2,
} from "./inference-v2";
import type { OpenEnaConfig, OpenEnaResult, ParsedDataset } from "./types";
import { datasetHashKindFor, JENA_RUNTIME_VERSION, OPEN_ENA_APP_VERSION } from "./types";
import {
  marginalMeanIntervalPair,
  type OpenEnaMarginalMeanInterval,
} from "./uncertainty";

export interface OpenEnaPresentationOptions {
  flipX?: boolean;
  flipY?: boolean;
  edgeThreshold?: number;
  showNetworks?: boolean;
  showPoints?: boolean;
  showTrajectories?: boolean;
  showLabels?: boolean;
  showGroupLabels?: boolean;
  showUnitLabels?: boolean;
  showVariance?: boolean;
  edgeScale?: number;
  pointScale?: number;
  plotZoom?: number;
  selectedGroupOrder?: readonly [string, string];
}

function inline(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ");
  const longestBacktickRun = Math.max(
    0,
    ...(normalized.match(/`+/gu) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longestBacktickRun + 1);
  const needsPadding = normalized.length === 0
    || normalized.startsWith("`")
    || normalized.endsWith("`")
    || normalized.startsWith(" ")
    || normalized.endsWith(" ");
  return needsPadding
    ? `${fence} ${normalized} ${fence}`
    : `${fence}${normalized}${fence}`;
}

function formatNumber(value: number | null, digits = 3) {
  return value === null || !Number.isFinite(value) ? "not estimable" : value.toFixed(digits);
}

function auditNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "not estimable";
  return Object.is(value, -0) ? "0" : String(value);
}

function effectiveWindow(config: OpenEnaConfig) {
  if (config.window === "Conversation") {
    return "Whole-conversation accumulation per analytic unit and conversation; forward context is not separately applied.";
  }
  return `Moving stanza window with ${config.windowSizeBack} rows total including the current row and ${config.windowSizeForward} forward context rows.`;
}

function marginalIntervalTableRow(
  groupName: string,
  axis: string,
  interval: OpenEnaMarginalMeanInterval,
) {
  if (interval.status === "not-estimable") {
    return `| ${inline(groupName)} | ${inline(axis)} | ${interval.sampleSize} | not estimable | not estimable | not estimable | not estimable | not estimable | not estimable (${interval.reason}) |`;
  }
  return `| ${inline(groupName)} | ${inline(axis)} | ${interval.sampleSize} | ${formatNumber(interval.mean, 6)} | ${formatNumber(interval.sampleStandardDeviation, 6)} | ${formatNumber(interval.standardError, 6)} | ${interval.degreesFreedom} | ${formatNumber(interval.lower, 6)} | ${formatNumber(interval.upper, 6)} |`;
}

function marginalIntervalSection(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  reportedDimensions: readonly string[],
  selectedGroupOrder: readonly [string, string] | undefined,
) {
  if (result.set.modelType !== "EndPoint" || !config.groupColumn || reportedDimensions.length < 2) {
    return [];
  }
  const groupOrder = selectedGroupOrder
    ? [selectedGroupOrder[0], selectedGroupOrder[1]] as const
    : result.groups.length === 2
      ? [result.groups[0].name, result.groups[1].name] as const
      : null;
  if (!groupOrder) return [];
  const axes = [reportedDimensions[0], reportedDimensions[1]] as const;
  const rows = groupOrder.flatMap((groupName) => {
    const points = result.set.points
      .filter((row) => String(row[config.groupColumn!] ?? "") === groupName)
      .map((row) => ({ x: Number(row[axes[0]]), y: Number(row[axes[1]]) }));
    const intervals = marginalMeanIntervalPair(points, axes);
    return [
      marginalIntervalTableRow(groupName, axes[0], intervals.x),
      marginalIntervalTableRow(groupName, axes[1], intervals.y),
    ];
  });
  const geometryBoundary = result.projectionReference
    ? "Intervals are conditional on the fixed imported reference geometry and do not propagate uncertainty from fitting its center, rotation, or node positions."
    : "Intervals are conditional on the ENA coordinate system fitted to this dataset and do not propagate uncertainty from fitting its center, rotation, or node positions.";
  return [
    "## Group-mean uncertainty guides",
    "",
    `For ${inline(groupOrder[0])} and ${inline(groupOrder[1])}, ENA.HK calculated a two-sided 95% one-sample Student-t confidence interval separately on ${inline(axes[0])} and ${inline(axes[1])}: arithmetic mean ± t(0.975, n−1) × sample SD / √n. Endpoint analytic units were treated as the independent observations; the sample variance used n−1 degrees of freedom.`,
    "The dashed guide is the Cartesian product of the two separate marginal intervals. It is not a joint 95% two-dimensional confidence region, prediction interval, group-difference interval, or significance test. No simultaneous-coverage correction was applied across axes, and interval overlap or non-overlap must not be used as a substitute for a group-comparison test.",
    `${geometryBoundary} With small groups, the interval is sensitive to individual observations and the per-axis approximate-normality assumption. A guide is not estimable when n < 2 or either displayed axis has zero or non-finite standard error.`,
    "",
    "| Group | Axis | n | Mean | Sample SD | SE | df | Lower 95% | Upper 95% |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
  ];
}

export function referenceMeanRotationInterpretation(
  result: OpenEnaResult,
  targetHash: string | null,
  formatLabel: (value: string) => string = (value) => value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " "),
) {
  const reference = result.projectionReference;
  if (!reference || reference.fit.method !== "mean") return null;
  const sourceHash = reference.source.normalizedUtf8TextSha256;
  const contrast = `${formatLabel(reference.fit.groupColumn)}: ${reference.fit.groupOrder.map(formatLabel).join(" then ")}`;
  if (sourceHash && targetHash && sourceHash === targetHash) {
    return `The declared reference analyzed-table hash matches this dataset (${contrast}). If the imported package accurately records its fit, separation and inference on MR1 are descriptive by construction, not independent confirmation.`;
  }
  if (sourceHash && targetHash) {
    return `The fixed MR1 axis was defined on a different recorded source (${contrast}). Treat MR1 inference as held-out only when analytic units are independent and the contrast was prespecified.`;
  }
  return `The fixed MR1 axis was defined by ${contrast}, but independence from the fitting sample cannot be verified because an analyzed-table hash is missing.`;
}

function rotationDescription(config: OpenEnaConfig, result: OpenEnaResult, targetHash: string | null) {
  if (result.projectionReference) {
    const sourceHash = result.projectionReference.source.normalizedUtf8TextSha256 ?? "not recorded";
    const meanInterpretation = referenceMeanRotationInterpretation(result, targetHash, inline);
    return [
      `Reference projection into ${inline(result.projectionReference.name)} (${inline(result.projectionReference.referenceId)}).`,
      `The center, axes, and reference node positions were fixed from ${inline(result.projectionReference.source.datasetName)} (declared analyzed-table SHA-256: ${inline(sourceHash)}). Imported provenance metadata is structurally validated but not independently authenticated by ENA.HK.`,
      `The reference was fitted with unit mapping ${result.projectionReference.fit.unitColumns.map(inline).join(" + ")} and conversation mapping ${result.projectionReference.fit.conversationColumns.map(inline).join(" + ")}.`,
      "Variance shares describe the current dataset in the fixed reference basis, not explained variance in the fitted reference sample.",
      ...(meanInterpretation ? [meanInterpretation] : []),
    ].join(" ");
  }
  if (config.rotation === "mean") {
    return "Generalized means rotation (displayed as GMR1; serialized as MR1 for Open ENA reference compatibility) followed by remaining SVD dimensions. GMR1 is constructed from the same group contrast, so its separation and inference are descriptive by construction rather than independent confirmation.";
  }
  return "SVD rotation fitted to the current model.";
}

function warningDisclosure(code: string) {
  const messages: Record<string, string> = {
    "small-sample": "The effective sample is small.",
    "discrete-attainable-p": "The exact two-sided p-value is discrete and bounded by the reported minimum attainable p where applicable.",
    "ties-present": "Average ranks and the recorded conditional exact or tie-corrected approximation policy were used for ties.",
    "zero-differences-present": "Matched zero differences were retained in diagnostics and excluded from signed-rank ranking under the Wilcox zero policy.",
    "missing-pairs": "Pairwise-complete inclusion omitted entities without both selected periods.",
    "missing-complete-blocks": "The all-period-complete cohort omitted entities missing any selected period.",
    "signed-rank-symmetry-assumption": "Wilcoxon signed-rank inference assumes a symmetric distribution of paired differences.",
    "independent-entity-assumption": "Mann–Whitney U inference assumes independent analytic entities between groups.",
    "cluster-independence-unverified": "Cluster independence is unverified; the ordinary rank test does not model nested or clustered entities.",
    "accumulated-trajectory-path-dependence": "Accumulated trajectory coordinates contain prior history, so later points are path-dependent rather than ordinary independent time points.",
    "arbitrary-axis-sign": "ENA rotation-axis signs are arbitrary; reversing an axis reverses signed effects but not two-sided p-values.",
    "mr1-circularity": "MR1/GMR1 was defined using the comparison contrast; inference on that axis is descriptive by construction unless genuinely held out.",
  };
  return messages[code] ?? `Recorded inference warning: ${code}.`;
}

function inferenceIdentityColumns(inference: OpenEnaInferenceResultV2) {
  return inference.kind === "endpoint-independent"
    ? null
    : inference.request.repeatedEntityColumns;
}

function inferenceScopeLines(inference: OpenEnaInferenceResultV2) {
  switch (inference.kind) {
    case "endpoint-independent":
      return [
        "### Independent endpoint groups · Mann–Whitney U",
        "",
        `- Primary group: ${inline(inference.scope.primaryGroup)}`,
        `- Secondary group: ${inline(inference.scope.secondaryGroup)}`,
        "- Temporal scope: endpoint common period was not verified by the system.",
        "- Analysis unit: one endpoint analytic unit.",
      ];
    case "trajectory-independent-period":
      return [
        "### Independent groups at one period · Mann–Whitney U",
        "",
        `- Time field: ${inline(inference.scope.timeColumn)}`,
        `- Selected period: ${inline(inference.scope.period)}`,
        `- Primary group: ${inline(inference.scope.primaryGroup)}`,
        `- Secondary group: ${inline(inference.scope.secondaryGroup)}`,
        "- Analysis unit: one compact entity-period point at the selected period.",
      ];
    case "trajectory-paired-periods":
      return [
        "### Paired periods · Wilcoxon signed-rank",
        "",
        `- Time field: ${inline(inference.scope.timeColumn)}`,
        `- Selected group: ${inline(inference.scope.group ?? "All units")}`,
        `- Period direction: ${inline(inference.scope.earlierPeriod)} → ${inline(inference.scope.laterPeriod)}; every difference is later minus earlier.`,
        `- Cohort policy: ${inline(inference.scope.cohortPolicy)}.`,
        "- Analysis unit: one repeated entity matched across both selected periods.",
      ];
    case "trajectory-repeated-periods":
      return [
        "### Repeated periods · Friedman + Holm-adjusted Wilcoxon signed-rank follow-up",
        "",
        `- Time field: ${inline(inference.scope.timeColumn)}`,
        `- Selected group: ${inline(inference.scope.group ?? "All units")}`,
        `- Ordered periods: ${inference.scope.periods.map(inline).join(" → ")}`,
        `- Cohort policy: ${inline(inference.scope.cohortPolicy)} shared by the omnibus and every follow-up contrast.`,
        "- Follow-up policy: all selected period pairs, generated regardless of the omnibus p-value.",
        "- Analysis unit: one all-period-complete repeated entity block.",
      ];
  }
}

function mannWhitneyRows(rows: readonly OpenEnaMannWhitneyInferenceRowV2[]) {
  return [
    "| Axis | Primary n | Secondary n | Primary median | Secondary median | U primary | U secondary | Raw p | Holm-adjusted p | Rank-biserial primary vs secondary | Resolved p method |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${inline(row.axis)} | ${row.nPrimary} | ${row.nSecondary} | ${auditNumber(row.medianPrimary)} | ${auditNumber(row.medianSecondary)} | ${auditNumber(row.uPrimary)} | ${auditNumber(row.uSecondary)} | ${auditNumber(row.pRaw)} | ${auditNumber(row.pHolm)} | ${auditNumber(row.rankBiserialPrimaryVsSecondary)} | ${inline(row.resolvedPMethod ?? "not estimable")} |`),
    "",
  ];
}

function wilcoxonRows(
  inference: Extract<OpenEnaInferenceResultV2, {
    kind: "trajectory-paired-periods" | "trajectory-repeated-periods";
  }>,
  rows: readonly OpenEnaWilcoxonInferenceRowV2[],
) {
  const periods = inference.kind === "trajectory-paired-periods"
    ? [inference.scope.earlierPeriod, inference.scope.laterPeriod]
    : inference.scope.periods;
  return [
    "| Axis | Earlier → later | Matched | Missing | Positive | Negative | Zero | Nonzero/ranked | Median difference | IQR difference | W+ | W− | T | Raw p | Holm-adjusted p | Paired rank-biserial later vs earlier | Resolved p method |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => {
      const earlier = inference.kind === "trajectory-paired-periods"
        ? inference.scope.earlierPeriod
        : periods[row.earlierPeriodIndex] ?? `period ${row.earlierPeriodIndex}`;
      const later = inference.kind === "trajectory-paired-periods"
        ? inference.scope.laterPeriod
        : periods[row.laterPeriodIndex] ?? `period ${row.laterPeriodIndex}`;
      return `| ${inline(row.axis)} | ${inline(earlier)} → ${inline(later)} | ${row.nMatched} | ${row.nMissing} | ${row.nPositive} | ${row.nNegative} | ${row.nZero} | ${row.nNonzero}/${row.nRanked} | ${auditNumber(row.medianDifference)} | ${auditNumber(row.iqrDifference)} | ${auditNumber(row.wPositive)} | ${auditNumber(row.wNegative)} | ${auditNumber(row.t)} | ${auditNumber(row.pRaw)} | ${auditNumber(row.pHolm)} | ${auditNumber(row.rankBiserialLaterVsEarlier)} | ${inline(row.resolvedPMethod ?? "not estimable")} |`;
    }),
    "",
  ];
}

function inferenceResultTables(inference: OpenEnaInferenceResultV2) {
  if (inference.kind === "endpoint-independent"
    || inference.kind === "trajectory-independent-period") {
    return mannWhitneyRows(inference.rows);
  }
  if (inference.kind === "trajectory-paired-periods") {
    return wilcoxonRows(inference, inference.rows);
  }
  return [
    "#### Friedman omnibus",
    "",
    "| Axis | Complete n | Missing complete blocks | Period count | Q | df | Raw p | Holm-adjusted p | Kendall’s W | Resolved p method |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...inference.omnibusRows.map((row) => `| ${inline(row.axis)} | ${row.nComplete} | ${row.nMissingCompleteBlocks} | ${row.nPeriods} | ${auditNumber(row.q)} | ${auditNumber(row.degreesFreedom)} | ${auditNumber(row.pRaw)} | ${auditNumber(row.pHolm)} | ${auditNumber(row.kendallsW)} | ${inline(row.resolvedPMethod ?? "not estimable")} |`),
    "",
    "#### Wilcoxon signed-rank follow-up · all period pairs",
    "",
    ...wilcoxonRows(inference, inference.followupRows),
  ];
}

function inferenceSection(inference: OpenEnaInferenceResultV2 | null) {
  if (!inference) {
    return [
      "## Inferential comparison",
      "",
      "No researcher-confirmed inferential comparison was run for this successful result. Descriptive geometry and uncertainty guides must not be read as substitutes for an inferential test.",
      "",
    ];
  }
  const identityColumns = inferenceIdentityColumns(inference);
  const ledger = inference.ledger === null ? "not available" : JSON.stringify(inference.ledger);
  return [
    "## Inferential comparison",
    "",
    ...inferenceScopeLines(inference),
    ...(identityColumns
      ? [`- Confirmed composite repeated-entity identity fields: ${identityColumns.map(inline).join(" + ")}.`]
      : []),
    `- Result status: ${inline(inference.status)}${inference.reason ? ` (${inline(inference.reason)})` : ""}.`,
    `- Inclusion and exclusion ledger: ${inline(ledger)}`,
    `- Fixed policy: two-sided; auto exact-first; ranks and paired differences normalized to 12 significant digits; exact ranked N ≤ ${inference.method.exactMaxRankedN}; Wilcox zero handling; continuity correction ${inference.method.continuityCorrection} for approximation branches; Holm correction with planned unavailable members retained in family size.`,
    "- Statistics and signed effects use the unflipped model coordinate system. Plot flips, labels, scaling, visibility and zoom do not alter these inferential rows.",
    "",
    ...inferenceResultTables(inference),
    "#### Multiplicity families",
    "",
    "| Family role | Family ID | Planned size | Member IDs |",
    "| --- | --- | ---: | --- |",
    ...inference.families.map((family) => `| ${inline(family.role)} | ${inline(family.familyId)} | ${family.familySizePlanned} | ${family.memberIds.map(inline).join(", ")} |`),
    "",
    "#### Inference warnings and boundaries",
    "",
    ...(inference.warnings.length
      ? inference.warnings.map((warning) => `- ${inline(warning)}: ${warningDisclosure(warning)}`)
      : ["- No additional inference warning code was recorded."]),
    "- Raw and Holm-adjusted p-values are audit values, not measures of practical importance. These post-projection tests do not establish causality, learning gain, intervention effects, or the substantive importance of a coordinate difference.",
    "",
  ];
}

export function buildMethodsReport(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  result: OpenEnaResult,
  sourceHash: string | null = null,
  reportedDimensions: readonly string[] = result.dimensions.slice(0, 2),
  presentation: OpenEnaPresentationOptions = {},
  inference: OpenEnaInferenceResultV2 | null = null,
) {
  const unitCount = new Set(result.set.points.map((row) => String(row.ENA_UNIT ?? ""))).size;
  if (inference) {
    if (!sourceHash || reportedDimensions.length !== 2) {
      throw new Error("Inference consumer binding mismatch.");
    }
    assertOpenEnaInferenceBindingV2(inference, {
      analyzedAt: result.analyzedAt,
      datasetNormalizedUtf8TextSha256: sourceHash,
      datasetHashKind: datasetHashKindFor(dataset),
      modelType: result.set.modelType,
      configuration: config,
      axes: [reportedDimensions[0], reportedDimensions[1]],
    });
  }
  const groupText = config.groupColumn
    ? `${inline(config.groupColumn)} (${result.groups.map((group) => `${inline(group.name)}: n=${group.count}`).join(", ")})`
    : "No comparison field; all units were summarized together.";
  const dimensions = result.dimensions.map((dimension) => (
    `${inline(dimension)} ${((result.set.variance[dimension] ?? 0) * 100).toFixed(1)}%`
  )).join(", ");
  const [displayedX = result.dimensions[0] ?? "X", displayedY = result.dimensions[1] ?? displayedX] = reportedDimensions;
  const edgeThreshold = presentation.edgeThreshold ?? 0;
  const shown = (value: boolean | undefined, fallback = true) => (value ?? fallback) ? "shown" : "hidden";
  const inferenceReportSection = inferenceSection(inference);
  const intervalSection = marginalIntervalSection(
    result,
    config,
    reportedDimensions,
    presentation.selectedGroupOrder,
  );
  const sourceHashKind = datasetHashKindFor(dataset);

  return [
    "# ENA.HK Open ENA Methods & Reproducibility Report",
    "",
    `Generated from ENA.HK Open ENA ${OPEN_ENA_APP_VERSION}; analysis completed ${result.analyzedAt}.`,
    "",
    "## Data identity",
    "",
    `- Dataset: ${inline(dataset.name)}`,
    `- Analyzed-table SHA-256: ${inline(sourceHash ?? "not recorded")}`,
    `- Hash scope: ${inline(sourceHashKind)}. CSV hashes BOM-normalized UTF-8 source text; XLSX hashes the versioned canonical values of the analyzed first worksheet, excluding workbook styling and other worksheets.`,
    `- Input shape: ${dataset.rows.length.toLocaleString()} rows and ${dataset.headers.length.toLocaleString()} columns`,
    "- Source row order defined sequence within conversations; XLSX analysis used the first worksheet.",
    "- Raw source rows and unselected source columns are intentionally excluded from derived result exports.",
    "",
    "## ENA model",
    "",
    `The network model was computed in the browser with jENA \`jena-js\` ${JENA_RUNTIME_VERSION}.`,
    `- Model type: ${inline(result.set.modelType)}`,
    `- Analytic unit: ${config.unitColumns.map(inline).join(" + ")}`,
    `- Conversation: ${config.conversationColumns.map(inline).join(" + ")}`,
    `- Comparison field: ${groupText}`,
    `- Codes (${config.codes.length}): ${config.codes.map(inline).join(", ")}`,
    `- Window: ${effectiveWindow(config)}`,
    `- Co-occurrence weighting: ${config.weightBy === "binary" ? "binary threshold per windowed cell" : "summed window products"}`,
    "- Network vectors used sphere normalization; node positions used the undirected method.",
    `- Zero-network handling: ${config.centerAlignToOrigin ? "zero-network units were pinned to the origin and excluded from estimating the center" : "all unit rows contributed to the fitted center"}.`,
    `- Rotation: ${rotationDescription(config, result, sourceHash)}`,
    "",
    "## Result summary",
    "",
    `- ${unitCount.toLocaleString()} distinct analytic units and ${result.set.points.length.toLocaleString()} projected points`,
    `- ${result.groups.length} displayed group network(s) and ${result.set.codes.length} codes`,
    `- Rotated dimensions: ${dimensions}`,
    `- Displayed 2D axes: X ${inline(displayedX)} (${presentation.flipX ? "flipped" : "unflipped"}); Y ${inline(displayedY)} (${presentation.flipY ? "flipped" : "unflipped"}).`,
    "- Axis flips are presentation-only. Coordinates and every supplied inferential statistic remain in the unflipped model coordinate system.",
    `- Relative edge display threshold: ${(edgeThreshold * 100).toFixed(1)}% (${edgeThreshold}). This is a presentation-only filter relative to the applicable strongest edge; edges below the threshold remain in the computed model and exported tables, so hidden edges are not model absence.`,
    `- Group networks: ${shown(presentation.showNetworks)}; Unit points: ${shown(presentation.showPoints)}; Trajectory paths: ${shown(presentation.showTrajectories)}.`,
    `- Code labels: ${shown(presentation.showLabels)}; group labels: ${shown(presentation.showGroupLabels)}; unit labels: ${shown(presentation.showUnitLabels, false)}; variance labels: ${shown(presentation.showVariance)}.`,
    `- Edge width scale: ${presentation.edgeScale ?? 1}×; unit point scale: ${presentation.pointScale ?? 1}×; plot zoom: ${presentation.plotZoom ?? 1}×.`,
    "- jENA diagnostic statistics were used only where the model type and automatic unit limit permitted them.",
    ...(result.projectionReference
      ? ["- Point-centroid correlations and target-fitted centroids were withheld because they do not describe the fixed imported node geometry in jENA 0.6.2 reference projections."]
      : []),
    "",
    ...intervalSection,
    ...inferenceReportSection,
    "## Interpretation and reproducibility boundaries",
    "",
    "- Rotation axis signs are arbitrary; a mirrored solution can represent the same geometry.",
    "- Network edges, group means, visual separation, and post-projection statistics are descriptive of the specified model and do not establish causality.",
    "- The exact source coded-data file, codebook, this report, analysis manifest, and derived result bundle should be preserved together.",
    "- For trajectories, repeated steps require a design-appropriate longitudinal method and were not treated as independent endpoint observations.",
    "",
  ].join("\n");
}
