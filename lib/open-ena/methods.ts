import { buildEndpointMannWhitney } from "./inference";
import type { OpenEnaConfig, OpenEnaResult, ParsedDataset } from "./types";
import { JENA_RUNTIME_VERSION, OPEN_ENA_APP_VERSION } from "./types";

export interface OpenEnaPresentationOptions {
  flipX?: boolean;
  flipY?: boolean;
  edgeThreshold?: number;
  showNetworks?: boolean;
  showPoints?: boolean;
  showTrajectories?: boolean;
  showLabels?: boolean;
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

function formatPValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "not estimable";
  return value < 0.001 ? "< .001" : value.toFixed(3);
}

function effectiveWindow(config: OpenEnaConfig) {
  if (config.window === "Conversation") {
    return "Whole-conversation accumulation per analytic unit and conversation; forward context is not separately applied.";
  }
  return `Moving stanza window with ${config.windowSizeBack} rows total including the current row and ${config.windowSizeForward} forward context rows.`;
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
    return `The declared reference source hash matches this dataset (${contrast}). If the imported package accurately records its fit, separation and inference on MR1 are descriptive by construction, not independent confirmation.`;
  }
  if (sourceHash && targetHash) {
    return `The fixed MR1 axis was defined on a different recorded source (${contrast}). Treat MR1 inference as held-out only when analytic units are independent and the contrast was prespecified.`;
  }
  return `The fixed MR1 axis was defined by ${contrast}, but independence from the fitting sample cannot be verified because a source hash is missing.`;
}

function rotationDescription(config: OpenEnaConfig, result: OpenEnaResult, targetHash: string | null) {
  if (result.projectionReference) {
    const sourceHash = result.projectionReference.source.normalizedUtf8TextSha256 ?? "not recorded";
    const meanInterpretation = referenceMeanRotationInterpretation(result, targetHash, inline);
    return [
      `Reference projection into ${inline(result.projectionReference.name)} (${inline(result.projectionReference.referenceId)}).`,
      `The center, axes, and reference node positions were fixed from ${inline(result.projectionReference.source.datasetName)} (declared source SHA-256: ${inline(sourceHash)}). Imported source metadata is structurally validated but not independently authenticated by ENA.HK.`,
      `The reference was fitted with unit mapping ${result.projectionReference.fit.unitColumns.map(inline).join(" + ")} and conversation mapping ${result.projectionReference.fit.conversationColumns.map(inline).join(" + ")}.`,
      "Variance shares describe the current dataset in the fixed reference basis, not explained variance in the fitted reference sample.",
      ...(meanInterpretation ? [meanInterpretation] : []),
    ].join(" ");
  }
  if (config.rotation === "mean") {
    return "Two-group means rotation (MR1) followed by remaining SVD dimensions. MR1 is constructed from the same group contrast, so its separation and inference are descriptive by construction rather than independent confirmation.";
  }
  return "SVD rotation fitted to the current model.";
}

export function buildMethodsReport(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  result: OpenEnaResult,
  sourceHash: string | null = null,
  reportedDimensions: readonly string[] = result.dimensions.slice(0, 2),
  presentation: OpenEnaPresentationOptions = {},
) {
  const unitCount = new Set(result.set.points.map((row) => String(row.ENA_UNIT ?? ""))).size;
  const inference = buildEndpointMannWhitney(
    result,
    config.groupColumn,
    reportedDimensions,
    presentation.selectedGroupOrder,
  );
  const groupText = config.groupColumn
    ? `${inline(config.groupColumn)} (${result.groups.map((group) => `${inline(group.name)}: n=${group.count}`).join(", ")})`
    : "No comparison field; all units were summarized together.";
  const dimensions = result.dimensions.map((dimension) => (
    `${inline(dimension)} ${((result.set.variance[dimension] ?? 0) * 100).toFixed(1)}%`
  )).join(", ");
  const [displayedX = result.dimensions[0] ?? "X", displayedY = result.dimensions[1] ?? displayedX] = reportedDimensions;
  const edgeThreshold = presentation.edgeThreshold ?? 0;
  const shown = (value: boolean | undefined, fallback = true) => (value ?? fallback) ? "shown" : "hidden";
  const inferenceSection = inference.status === "available"
    ? [
        "## ENA.HK post-projection group inference",
        "",
        `${presentation.selectedGroupOrder ? "Selected" : "Declared"} group order: ${inline(inference.groupOrder?.[0] ?? "first")} then ${inline(inference.groupOrder?.[1] ?? "second")}.`,
        `Mann–Whitney U used average ranks, tie-corrected variance, a 0.5 continuity correction, and a two-sided normal-approximation p-value. Rank-biserial effects are signed for the ${presentation.selectedGroupOrder ? "Primary selected" : "first declared"} group versus the ${presentation.selectedGroupOrder ? "Secondary selected" : "second declared"} group. This calculation is provided by ENA.HK after projection; it is not a jENA statistic, and no multiplicity correction was applied across axes or repeated pair selections.`,
        "",
        "| Axis | First median | Second median | U (first) | Two-sided p | Rank-biserial |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        ...inference.rows.map((row) => (
          `| ${row.dimension} | ${formatNumber(row.medianFirst)} | ${formatNumber(row.medianSecond)} | ${formatNumber(row.uFirst, 2)} | ${formatPValue(row.pValueTwoSided)} | ${formatNumber(row.rankBiserialFirstVsSecond)} |`
        )),
        "",
      ]
    : [
        "## Group inference boundary",
        "",
        "Endpoint Mann–Whitney inference was not applied because this result is not an endpoint model with exactly two declared comparison groups.",
        "",
      ];

  return [
    "# ENA.HK Open ENA Methods & Reproducibility Report",
    "",
    `Generated from ENA.HK Open ENA ${OPEN_ENA_APP_VERSION}; analysis completed ${result.analyzedAt}.`,
    "",
    "## Data identity",
    "",
    `- Dataset: ${inline(dataset.name)}`,
    `- Normalized UTF-8 text SHA-256: ${inline(sourceHash ?? "not recorded")}`,
    `- Input shape: ${dataset.rows.length.toLocaleString()} rows and ${dataset.headers.length.toLocaleString()} columns`,
    "- CSV row order defined sequence within conversations.",
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
    "- Axis flips are presentation-only. Coordinates, medians, U, p-values, and signed rank-biserial effects remain in the unflipped model coordinate system.",
    `- Relative edge display threshold: ${(edgeThreshold * 100).toFixed(1)}% (${edgeThreshold}). This is a presentation-only filter relative to the applicable strongest edge; edges below the threshold remain in the computed model and exported tables, so hidden edges are not model absence.`,
    `- Group networks: ${shown(presentation.showNetworks)}; Unit points: ${shown(presentation.showPoints)}; Trajectory paths: ${shown(presentation.showTrajectories)}.`,
    `- Code labels: ${shown(presentation.showLabels)}; unit labels: ${shown(presentation.showUnitLabels, false)}; variance labels: ${shown(presentation.showVariance)}.`,
    `- Edge width scale: ${presentation.edgeScale ?? 1}×; unit point scale: ${presentation.pointScale ?? 1}×; plot zoom: ${presentation.plotZoom ?? 1}×.`,
    "- jENA diagnostic statistics were used only where the model type and automatic unit limit permitted them.",
    ...(result.projectionReference
      ? ["- Point-centroid correlations and target-fitted centroids were withheld because they do not describe the fixed imported node geometry in jENA 0.6.2 reference projections."]
      : []),
    "",
    ...inferenceSection,
    "## Interpretation and reproducibility boundaries",
    "",
    "- Rotation axis signs are arbitrary; a mirrored solution can represent the same geometry.",
    "- Network edges, group means, visual separation, and post-projection statistics are descriptive of the specified model and do not establish causality.",
    "- The exact source CSV, codebook, this report, analysis manifest, and derived result bundle should be preserved together.",
    "- For trajectories, repeated steps require a design-appropriate longitudinal method and were not treated as independent endpoint observations.",
    "",
  ].join("\n");
}
