import type {
  BoundResultV3,
  BoundStandardResultV3,
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  ScalarIdentityV3,
} from "./model-v3/types";

function inlineV3(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ");
  let longestBacktickRun = 0;
  for (const run of normalized.matchAll(/`+/gu)) {
    if (run[0].length > longestBacktickRun) longestBacktickRun = run[0].length;
  }
  const fence = "`".repeat(longestBacktickRun + 1);
  const padding = normalized.length === 0 || normalized.startsWith("`") || normalized.endsWith("`")
    || normalized.startsWith(" ") || normalized.endsWith(" ");
  return padding ? `${fence} ${normalized} ${fence}` : `${fence}${normalized}${fence}`;
}

function scalarV3(value: ScalarIdentityV3): string {
  return inlineV3(`${value.type}:${String(value.value)}`);
}

function percentageV3(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

function sectionV3(title: string, lines: readonly string[]): string {
  return [`## ${title}`, "", ...lines].join("\n");
}

function orderPolicyV3(policy: CanonicalRowOrderV3 | CanonicalHorizonOrderV3 | null): string {
  if (policy === null) return "not applicable";
  if (policy.kind === "source-order-confirmed") {
    return `confirmed source order bound to dataset ${inlineV3(policy.confirmation.datasetSha256)} (${policy.confirmation.rowCount} rows)`;
  }
  return policy.keys.map((key) => {
    const comparator = key.comparator.type === "ordered-category"
      ? `ordered-category (${key.comparator.levels.map(scalarV3).join(", ")})`
      : key.comparator.type === "text"
        ? `text locale=${inlineV3(key.comparator.locale)}, sensitivity=${key.comparator.sensitivity}, numeric=${key.comparator.numeric}`
        : key.comparator.type;
    return `${inlineV3(key.column)} ${key.direction} by ${comparator}`;
  }).join("; then ");
}

function dictionaryMapsV3(result: BoundResultV3) {
  const dictionary = result.executionProvenance.identityDictionary;
  return {
    unit: new Map(dictionary.units.map((entry) => [entry.token, entry.displayLabel])),
    horizon: new Map(dictionary.horizons.map((entry) => [entry.token, entry.displayLabel])),
    group: new Map(dictionary.groups.map((entry) => [entry.token, entry.displayLabel])),
  };
}

function labelForV3(map: ReadonlyMap<string, string>, token: string, role: string): string {
  return inlineV3(map.get(token) ?? `${role} identity unavailable`);
}

function targetPopulationLabelV3(result: BoundStandardResultV3): string {
  return result.configuration.analysis.model.type === "EndPoint"
    ? "endpoint Units"
    : "observed Unit-Horizon steps";
}

export function buildDataBindingSectionV3(result: BoundResultV3): string {
  const binding = result.binding;
  return sectionV3("Data binding", [
    `- Dataset SHA-256: ${inlineV3(binding.datasetSha256)}`,
    `- Dataset hash kind: ${inlineV3(binding.datasetHashKind)}`,
    `- Header SHA-256: ${inlineV3(binding.headerSha256)}`,
    `- Input shape: ${binding.rowCount} source rows`,
    `- Configuration SHA-256: ${inlineV3(binding.configurationSha256)}`,
    `- Execution-plan SHA-256: ${inlineV3(binding.executionPlanSha256)}`,
    `- Scientific-result SHA-256: ${inlineV3(binding.scientificResultSha256)}`,
    `- Runtime: ${inlineV3(binding.runtimeVersion)}; algorithm build: ${inlineV3(binding.algorithmBuildSha)}`,
    `- Contracts: validation ${inlineV3(binding.validationContractVersion)}; runtime policy ${inlineV3(binding.runtimePolicyVersion)}; execution ${inlineV3(binding.executionContractVersion)}`,
    `- Bound result created: ${inlineV3(result.createdAt)}`,
  ]);
}

export function buildUnitsSectionV3(result: BoundResultV3): string {
  const { identityDictionary, unitGroups } = result.executionProvenance;
  const maps = dictionaryMapsV3(result);
  const groupCounts = new Map<string, number>();
  for (const membership of unitGroups) if (membership.groupToken !== null) {
    groupCounts.set(membership.groupToken, (groupCounts.get(membership.groupToken) ?? 0) + 1);
  }
  const group = result.configuration.units.group;
  return sectionV3("Units", [
    `- Unit fields: ${result.configuration.units.columns.map(inlineV3).join(" + ")}`,
    `- Observed typed Units: ${identityDictionary.units.length}`,
    group.type === "none" ? "- Group field: none." : `- Stable Group field: ${inlineV3(group.column)}; one bound Group value per Unit.`,
    ...(group.type === "none" ? [] : [
      `- Actual Group counts: ${identityDictionary.groups.map((entry) => `${labelForV3(maps.group, entry.token, "Group")}: n=${groupCounts.get(entry.token) ?? 0}`).join("; ")}.`,
    ]),
  ]);
}

export function buildHorizonsSectionV3(result: BoundResultV3): string {
  const horizons = result.executionProvenance.identityDictionary.horizons;
  const shared = result.executionProvenance.diagnostics.some((diagnostic) => diagnostic.id === "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS");
  return sectionV3("Horizons", [
    `- Horizon fields: ${result.configuration.horizons.columns.map(inlineV3).join(" + ")}`,
    `- Observed typed Horizons: ${horizons.length}`,
    shared
      ? "- Shared Horizons were observed across multiple Units; shared Horizon identities do not merge distinct Unit trajectories."
      : "- No shared-Horizon condition was recorded in the bound provenance.",
    "- Window boundaries were enforced within each Horizon.",
  ]);
}

export function buildCodesSectionV3(result: BoundResultV3): string {
  const representations = new Map(result.executionProvenance.codeRepresentations.map((entry) => [entry.runtimeToken, entry]));
  return sectionV3("Codes", [
    `- Selected Codes (${result.configuration.codes.length}):`,
    ...result.executionProvenance.codeDictionary.codes.map((entry) => {
      const representation = representations.get(entry.token);
      return `  - source ${inlineV3(entry.sourceColumn)}; display ${inlineV3(entry.displayLabel)}; input ${inlineV3(representation?.sourceRepresentation ?? "unavailable")}; runtime ${inlineV3(representation?.runtimeRepresentation ?? "unavailable")}`;
    }),
  ]);
}

function backwardDescriptionV3(extent: { kind: "finite"; value: number } | { kind: "infinity" }): string {
  if (extent.kind === "infinity") return "Backward extent Infinity gives unbounded backward context, including the current row and all preceding rows within each Horizon.";
  const preceding = Math.max(0, extent.value - 1);
  return `Backward size ${extent.value} includes the current row and up to ${preceding} preceding ${preceding === 1 ? "row" : "rows"} within each Horizon.`;
}

function forwardDescriptionV3(extent: { kind: "finite"; value: number } | { kind: "infinity" } | 0): string {
  if (typeof extent === "number") return "Forward size 0 includes no following rows within each Horizon.";
  if (extent.kind === "infinity") return "Forward extent Infinity gives unbounded forward context, including all following rows within each Horizon.";
  return `Forward size ${extent.value} includes up to ${extent.value} following ${extent.value === 1 ? "row" : "rows"} within each Horizon.`;
}

export function buildWindowWeightingSectionV3(result: BoundResultV3): string {
  const window = result.configuration.window;
  const weighting = result.executionProvenance.weighting;
  const weightingMeaning = weighting.scientific === "binary"
    ? "Binary input records Code presence/absence; the runtime used binary window weighting."
    : "Frequency input retains nonnegative Code counts; the runtime summed windowed count products.";
  return sectionV3("Window and weighting", [
    `- Scientific weighting: ${inlineV3(weighting.scientific)}; runtime weighting: ${inlineV3(weighting.runtime)}.`,
    `- ${weightingMeaning}`,
    ...(window.type === "Conversation" ? [
      "- Window: Conversation; all rows belonging to each Unit-Horizon combination contribute to its whole-conversation network.",
      "- Conversation row order: not applicable.",
    ] : [
      "- Window: MovingStanzaWindow.",
      `- ${backwardDescriptionV3(window.backward)}`,
      `- ${forwardDescriptionV3(window.forward)}`,
    ]),
    "- Network vectors used sphere normalization before centering and rotation.",
  ]);
}

export function buildOrderingSectionV3(result: BoundResultV3): string {
  const ordering = result.executionProvenance.ordering;
  const maps = dictionaryMapsV3(result);
  const rowSequences = new Map<string, Array<{ ordinal: number; sourceRowIndex: number }>>();
  if (ordering.resolvedRowOrder.type !== "not-applicable") {
    for (const mapping of ordering.resolvedRowOrder.mappings) {
      const sequence = rowSequences.get(mapping.horizonToken) ?? [];
      sequence.push({ ordinal: mapping.withinHorizonOrdinal, sourceRowIndex: mapping.sourceRowIndex });
      rowSequences.set(mapping.horizonToken, sequence);
    }
  }
  const rowLines = ordering.resolvedRowOrder.type === "not-applicable" ? [
    "- Requested row order: not applicable.",
    "- Resolved row order: not applicable (Conversation window).",
  ] : [
    `- Requested row order: ${orderPolicyV3(ordering.requestedRowOrder)}.`,
    `- Resolved within-Horizon source-row sequences (${ordering.resolvedRowOrder.mappings.length} rows):`,
    ...[...rowSequences].map(([horizonToken, sequence]) => (
      `  - ${labelForV3(maps.horizon, horizonToken, "Horizon")}: ${sequence.map((entry) => `${entry.ordinal}=source-row index ${entry.sourceRowIndex}`).join(", ")}`
    )),
    `- Bound runtime source-row traversal: ${ordering.runtimeSourceRowIndices.join(", ")}.`,
  ];
  const horizonLines = ordering.resolvedHorizonOrder.type === "not-applicable" ? [
    "- Requested Horizon order: not applicable.",
    "- Resolved Horizon order: not applicable (EndPoint model).",
  ] : [
    `- Requested Horizon order: ${orderPolicyV3("requestedHorizonOrder" in ordering ? ordering.requestedHorizonOrder : null)}.`,
    `- Bound implementation Horizon order: ${ordering.resolvedHorizonOrder.implementationHorizonOrder.map((token) => labelForV3(maps.horizon, token, "Horizon")).join(", ")}.`,
    `- Resolved observed Unit sequences (${ordering.resolvedHorizonOrder.unitSequences.length}):`,
    ...ordering.resolvedHorizonOrder.unitSequences.map((sequence) => (
      `  - ${labelForV3(maps.unit, sequence.unitToken, "Unit")}: ${sequence.steps.map((step) => `${step.trajectoryOrdinal}=${labelForV3(maps.horizon, step.horizonToken, "Horizon")}`).join(", ")}`
    )),
  ];
  return sectionV3("Ordering", [...rowLines, ...horizonLines]);
}

export function buildModelTrajectorySectionV3(result: BoundResultV3): string {
  if ("orderedAudit" in result) return sectionV3("Model and trajectory", [
    "- Model: EndPoint Order Network Analysis (ONA); directed ordered associations were accumulated for endpoint Units.",
    "- ONA did not run a trajectory model.",
    "- No missing trajectory steps were imputed.",
  ]);
  const standard = result as BoundStandardResultV3;
  const model = standard.configuration.analysis.model.type;
  const populations = standard.executionProvenance.populations;
  const semantics = model === "EndPoint"
    ? "EndPoint produced one network per observed Unit over its bound Horizons."
    : model === "SeparateTrajectory"
      ? "SeparateTrajectory retained step-specific networks for each observed Unit-Horizon step."
      : "AccumulatedTrajectory produced a network cumulative through each observed step for each Unit.";
  return sectionV3("Model and trajectory", [
    `- Model: ${inlineV3(model)}. ${semantics}`,
    `- Target population: ${populations.targetTokens.length} ${targetPopulationLabelV3(standard)}.`,
    ...(model === "EndPoint" ? [] : [
      `- Actual observed trajectory-step counts by Unit: ${Object.values(populations.trajectoryStepCountByUnit).reduce((sum, value) => sum + value, 0)} total steps across ${Object.keys(populations.trajectoryStepCountByUnit).length} Units.`,
    ]),
    "- No missing trajectory steps were imputed.",
  ]);
}

function varianceLineV3(result: BoundResultV3, prefix: string): string {
  const projection = result.executionProvenance.projection;
  const variances = "variance" in projection
    ? projection.variance
    : projection.fullAxes.map((axis) => Number(result.set.variance[axis] ?? 0));
  return `${prefix} ${projection.fullAxes.map((axis, index) => `${inlineV3(axis)}=${percentageV3(variances[index] ?? 0)}`).join("; ")}.`;
}

export function buildRotationSectionV3(result: BoundResultV3): string {
  const projection = result.executionProvenance.projection;
  if (result.configuration.analysisFamily === "ona") return sectionV3("Rotation", [
    `- SVD rotation; intrinsic target rank: ${projection.rank}.`,
    `- Full axes: ${projection.fullAxes.map(inlineV3).join(", ")}; supported coordinates: ${projection.estimableAxes.map(inlineV3).join(", ") || "none"}. Supported coordinates do not assert additional independent dimensions.`,
    `- ${varianceLineV3(result, "Target full-basis variance shares:")}`,
    "- Center policy: zero-network Units were aligned to the origin under sphere normalization.",
  ]);
  const standard = result as BoundStandardResultV3;
  const centerPolicy = projection.centerAlignToOrigin
    ? "zero-network observations were aligned to the origin and excluded from estimating the center"
    : "all fitted observations contributed to the center";
  const common = [
    `- Intrinsic target rank: ${projection.rank}.`,
    `- Full axes: ${projection.fullAxes.map(inlineV3).join(", ")}.`,
    `- Supported coordinates: ${projection.estimableAxes.map(inlineV3).join(", ") || "none"}; supported coordinates are usable coordinates, not a count of independent dimensions.`,
  ];
  if (projection.type === "means") {
    const means = standard.executionProvenance.meansBinding!;
    const negative = means.negative.unitTokens.length, positive = means.positive.unitTokens.length;
    return sectionV3("Rotation", [
      "- Means rotation: MR1 is the positive mean minus the negative mean.",
      `- Contrast field: ${inlineV3(means.groupColumn)}; negative ${scalarV3(means.negative.level)} (n=${negative}); positive ${scalarV3(means.positive.level)} (n=${positive}).`,
      `- Centering and residual SVD used all ${standard.executionProvenance.populations.fitTokens.length} endpoint Units; MR1 membership used only the ${negative + positive} declared contrast Units.`,
      "- Separation on MR1 is descriptive by construction and is not independent confirmation of the declared group contrast.",
      `- Center policy: ${centerPolicy}.`, ...common,
      `- ${varianceLineV3(result, "Full-basis variance shares:")}`,
    ]);
  }
  if (projection.type === "reference") {
    const reference = standard.executionProvenance.reference!, source = standard.executionProvenance.populations.sourceFit!;
    const targetRank = projection.targetProjectionRank ?? projection.rank;
    const sourceArtifact = reference.artifact;
    return sectionV3("Rotation", [
      `- Reference projection used the fixed Endpoint reference ${inlineV3(reference.referenceId)} (content SHA-256 ${inlineV3(reference.contentSha256)}).`,
      `- Reference source dataset SHA-256: ${inlineV3(sourceArtifact.source.datasetBinding.normalizedTableSha256)}; source configuration SHA-256: ${inlineV3(sourceArtifact.source.configurationSha256)}; source execution-plan SHA-256: ${inlineV3(sourceArtifact.source.executionPlanSha256)}.`,
      `- Reference source runtime: ${inlineV3(sourceArtifact.source.runtime.runtimeVersion)}; algorithm build: ${inlineV3(sourceArtifact.source.runtime.algorithmBuildSha)}.`,
      `- Reference source fit method: ${inlineV3(source.method)}; source fit population: ${source.observationCount} endpoint Units; source intrinsic rank: ${source.rank}.`,
      ...(source.means === null ? [] : [
        `- Reference source Means contrast: positive ${scalarV3(source.means.positiveLevel)} (n=${source.means.positiveCount}) minus negative ${scalarV3(source.means.negativeLevel)} (n=${source.means.negativeCount}) on ${inlineV3(source.means.groupColumn)}; its source MR1 separation is descriptive by construction.`,
      ]),
      `- Target projection population: ${standard.executionProvenance.populations.targetTokens.length} ${targetPopulationLabelV3(standard)}; target projection rank: ${targetRank}.`,
      "- The source center, fixed axes and node positions were not refitted to the target population.",
      `- Reference source center policy: ${source.centerAlignToOrigin ? "zero-network endpoint Units were aligned to the origin" : "all source endpoint Units contributed to the center"}.`,
      `- Source-fit full-basis variance shares: ${sourceArtifact.geometry.rotationColumns.map((axis, index) => `${inlineV3(axis)}=${percentageV3(source.variance[index] ?? 0)}`).join("; ")}.`,
      `- ${varianceLineV3(result, "Target projected full-basis variance shares:")}`,
      "- Target projected variance describes the target coordinates in the fixed basis; it is not source-fit explained variance.",
      ...common,
    ]);
  }
  return sectionV3("Rotation", [
    "- SVD rotation was fitted to the bound target population.",
    `- Center policy: ${centerPolicy}.`, ...common,
    `- ${varianceLineV3(result, "Full-basis variance shares:")}`,
  ]);
}

export function buildWarningsCapabilitiesSectionV3(result: BoundResultV3): string {
  const diagnostics = result.executionProvenance.diagnostics;
  const capabilities = Object.entries(result.capabilityStatus).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return sectionV3("Warnings and capabilities", [
    ...(diagnostics.length === 0 ? ["- Bound compiler/runtime warnings: none."] : [
      "- Bound compiler/runtime diagnostics:",
      ...diagnostics.map((diagnostic) => `  - ${inlineV3(diagnostic.id)} [${diagnostic.severity}]: ${inlineV3(diagnostic.summary)}${diagnostic.blocks.length > 0 ? `; blocks ${diagnostic.blocks.map(inlineV3).join(", ")}` : ""}`),
    ]),
    `- Capability status: ${capabilities.map(([name, status]) => `${inlineV3(name)}=${status}`).join("; ")}.`,
    `- Capability blocks: ${capabilities.filter(([, status]) => status === "blocked").map(([name]) => inlineV3(name)).join(", ") || "none"}.`,
    "- No inferential test, uncertainty analysis, longitudinal comparison, or AI interpretation was performed as part of constructing this bound result.",
  ]);
}

export function buildLimitationsSectionV3(result: BoundResultV3): string {
  const ona = result.configuration.analysisFamily === "ona";
  const reference = !ona && result.executionProvenance.projection.type === "reference";
  return sectionV3("Limitations and artifact audit", [
    ...(ona ? [
      "- ONA is descriptive only. Directed association does not establish causality, and no Standard ENA group subtraction, trajectory inference, or Reference projection was performed.",
    ] : [
      "- Network geometry, projected separation, and variance shares are descriptive of this bound model and do not establish causality or statistical significance.",
    ]),
    ...(reference ? [
      "- Hashes and contract checks establish internal consistency. This report does not authenticate the Reference source or establish a new source fit.",
      "- A legacy Reference candidate without native v2 source-fit provenance cannot be promoted into a modern bound result; legacy reports must retain their unauthenticated-provenance and missing-independence limitations.",
    ] : []),
    "- This report is derived only from the immutable bound result. It does not read or describe a current UI draft.",
    "- Artifact audit status: bound-only. Currentness is not established by this report; a stale label must come from a known stale-audit wrapper or importer context without rewriting scientific report bytes or hashes.",
    "- Dataset and component hashes provide integrity identifiers, not independent authentication of the source data.",
    "- Required resolved sequences and scientific distinctions are never truncated. If the complete report makes its bundle exceed the existing portable byte policy, bundle export is rejected.",
  ]);
}

export function buildMethodsReportV3(result: BoundResultV3): string {
  return [
    "# Open ENA v3 bound Methods report", "",
    "This report was generated solely from the bound result and its retained execution provenance.", "",
    [buildDataBindingSectionV3, buildUnitsSectionV3, buildHorizonsSectionV3, buildCodesSectionV3,
      buildWindowWeightingSectionV3, buildOrderingSectionV3, buildModelTrajectorySectionV3,
      buildRotationSectionV3, buildWarningsCapabilitiesSectionV3, buildLimitationsSectionV3]
      .map((builder) => builder(result)).join("\n\n"), "",
  ].join("\n");
}
