import type { Locale } from "./i18n";
import type {
  OpenEnaInferenceIntegrityCodeV2,
  OpenEnaInferenceReasonCodeV2,
} from "./open-ena/inference-v2";
import type {
  OpenEnaRankWarningCode,
  OpenEnaResolvedRankPMethod,
} from "./open-ena/rank-inference";
import type { OpenEnaResultTablesCopy } from "./open-ena/export";

export interface OpenEnaPersistentPlotToolsCopy {
  plotSettings: string;
  closePlotSettings: string;
  close: string;
  scaleEdgeWeights: string;
  edgeWeights: string;
  edgeWeightsValue: string;
  resetEdgeWeights: string;
  textSize: string;
  textSizeControl: string;
  textSizeValue: string;
  resetTextSize: string;
  codeLabels: string;
  unitCircle: string;
  axisDirection: string;
  flipXAxis: string;
  flipYAxis: string;
  networkGraph: string;
  minimumEdgeWeight: string;
  plottedPoints: string;
  groupLabels: string;
  unitPoints: string;
  scaleUnitCircles: string;
  unitLabels: string;
  advanced: string;
  plotZoom: string;
  zoomOut: string;
  fit: string;
  zoomIn: string;
  resetAllPlotTools: string;
  resetAll: string;
  on: string;
  off: string;
  settingLabel: (label: string) => string;
  enableLabel: (label: string) => string;
  disableLabel: (label: string) => string;
  timesValue: (value: string) => string;
  pixelsValue: (value: number) => string;
  minimumEdgeWeightValue: (percent: number) => string;
  fitPlotValue: (zoom: string) => string;
}

export interface OpenEnaGroupDisplayCopy {
  title: string;
  description: string;
  showAllHiddenLabel: string;
  showAll: (count: number) => string;
  visibleCount: (group: string, visible: number, total: number) => string;
  displaySettings: (group: string) => string;
  showUnitPoints: string;
  showMean: string;
  showConfidenceIntervals: string;
  showOutlierIntervals: string;
  includeHiddenPoints: string;
  settingLabel: (setting: string, group: string) => string;
  outlierTwoDBoundary: string;
  outlierThreeDBoundary: string;
  meanRequiredBoundary: string;
  intervalRequiresTwoUnits: string;
  searchUnits: string;
  searchUnitsLabel: (group: string) => string;
  unitListWindow: (shown: number, matching: number, total: number) => string;
  unitVisibility: (visible: number, total: number) => string;
  unitAction: (visible: boolean, unitId: string, group: string) => string;
  hide: string;
  show: string;
  keepOneVisible: string;
  derivationError: string;
  hiddenStatus: (count: number) => string;
  shortcut: string;
}

export interface OpenEnaInferenceCopy {
  designLegend: string;
  designIndependent: string;
  designIndependentDescription: string;
  designPaired: string;
  designPairedDescription: string;
  designRepeated: string;
  designRepeatedDescription: string;
  endpointRequiresIndependent: string;
  independentRequiresTwoGroups: string;
  independentRequiresPeriod: string;
  pairedRequiresTrajectory: string;
  pairedRequiresTwoPeriods: string;
  repeatedRequiresTrajectory: string;
  repeatedRequiresThreePeriods: string;
  identityLegend: string;
  identityHint: string;
  identityConfirmation: string;
  timeField: string;
  group: string;
  allUnits: string;
  primaryGroup: string;
  secondaryGroup: string;
  selectedPeriod: string;
  earlierPeriod: string;
  laterPeriod: string;
  repeatedPeriods: string;
  periodSelectionHint: string;
  eligibilitySelectDesign: string;
  eligibilityConfirmIdentity: string;
  eligibilityCompleteScope: string;
  eligibilityReady: string;
  ledgerTitle: string;
  ledgerCaption: string;
  status: string;
  value: string;
  candidateEntities: string;
  availablePrimary: string;
  availableSecondary: string;
  includedEntities: string;
  earlierAvailable: string;
  laterAvailable: string;
  matchedEntities: string;
  earlierOnly: string;
  laterOnly: string;
  missingPairs: string;
  provisionalZeroFirstAxis: string;
  provisionalZeroSecondAxis: string;
  completeBlocks: string;
  missingAnySelectedPeriod: string;
  availableAtPeriod: string;
  run: string;
  running: string;
  jumpToResults: string;
  resultsTitle: string;
  resultAvailable: string;
  resultNotEstimable: string;
  resultDisabled: string;
  integrityError: string;
  axis: string;
  primary: string;
  secondary: string;
  n: string;
  median: string;
  uPrimary: string;
  uSecondary: string;
  pHolm: string;
  pRaw: string;
  rankBiserial: string;
  resolvedMethod: string;
  direction: string;
  matched: string;
  missing: string;
  zero: string;
  positive: string;
  negative: string;
  nonzero: string;
  differenceMedian: string;
  differenceIqr: string;
  wPositive: string;
  wNegative: string;
  tStatistic: string;
  minimumAttainableP: string;
  periods: string;
  completeN: string;
  qStatistic: string;
  degreesFreedom: string;
  kendallsW: string;
  mannWhitneyEndpointCaption: string;
  mannWhitneyPeriodCaption: string;
  wilcoxonCaption: string;
  friedmanCaption: string;
  followupCaption: string;
  endpointTemporalBoundary: string;
  resultAuditHint: string;
  provenanceTitle: string;
  provenanceLabel: string;
  analyzedAtLabel: string;
  datasetBindingLabel: string;
  modelAxesLabel: string;
  configurationBindingLabel: string;
  fixedMethodLabel: string;
  noResult: string;
  warnings: string;
  auditCodeLabel: string;
  reasonMessages: Readonly<Record<OpenEnaInferenceReasonCodeV2, string>>;
  integrityMessages: Readonly<Record<OpenEnaInferenceIntegrityCodeV2, string>>;
  warningMessages: Readonly<Record<OpenEnaRankWarningCode, string>>;
  resolvedMethodNames: Readonly<Record<OpenEnaResolvedRankPMethod, string>>;
}

export interface OpenEnaStatsUiCopy {
  evidenceKicker: string;
  viewsAriaLabel: string;
  jenaTestsCaption: string;
  axis: string;
  test: string;
  statistic: string;
  degreesFreedom: string;
  welchT: string;
  oneWayF: string;
  notEstimable: string;
  fittedModelGroupOrder: string;
  omittedTests: string;
  referenceMr1Title: string;
  selectedPair: string;
  mr1Circularity: string;
  allGroupTitle: string;
  allGroupDescription: string;
  correlationsCaption: string;
  pearsonR: string;
  spearmanRho: string;
  correlationsExplanation: string;
  omittedCorrelations: string;
  projectionCorrelationBoundary: string;
  varianceCaption: string;
  share: string;
  varianceExplanation: string;
  projectedVarianceBoundary: string;
  referenceSpace: string;
  notRecorded: string;
  legacyHashScope: string;
  referenceRotationJson: string;
  methodsTitle: string;
  methodsDescription: string;
  copyMethods: string;
  methodsReport: string;
  methodsPreview: string;
}

export interface OpenEnaOnaCopy {
  family: {
    legend: string;
    methodBoundaryLabel: string;
    selectedLabel: string;
    ena: { label: string; description: string; methodBoundary: string };
    ona: { label: string; description: string; methodBoundary: string };
  };
  setupIncomplete: string;
  run: string;
  rerun: string;
  workspace: {
    directedSpace: string;
    twoD: string;
    downloadBundle: string;
    staleTitle: string;
    staleDescription: string;
    rebuilding: (progress: number, stage: "accumulate" | "model") => string;
    cancel: string;
    statsKicker: string;
  };
  plotTools: OpenEnaPersistentPlotToolsCopy;
  order: {
    title: string;
    description: string;
    orderPolicyLegend: string;
    columnsPolicyLabel: string;
    columnsPolicyDescription: string;
    sourceRowPolicyLabel: string;
    sourceRowPolicyDescription: string;
    orderColumnsLegend: string;
    comparatorLabel: string;
    comparatorPlaceholder: string;
    comparatorLabels: Record<"number" | "string" | "boolean" | "iso-datetime", string>;
    sourceRowConfirmationLabel: string;
    windowTitle: string;
    windowModeLegend: string;
    finiteWindowLabel: string;
    entireHorizonLabel: string;
    windowSizeLabel: string;
    invalidWindowSize: string;
    lockedTitle: string;
    modelLabel: string;
    modelValue: string;
    windowTypeLabel: string;
    windowTypeValue: string;
    forwardLabel: string;
    forwardValue: string;
    weightLabel: string;
    weightValue: string;
    rotationLabel: string;
    rotationValue: string;
    referenceLabel: string;
    referenceValue: string;
    previewTitle: string;
    previewReady: string;
    previewNeedsConfiguration: string;
    previewRejected: string;
    resolvedPolicyTitle: string;
    directionLabel: string;
    directionAscending: string;
    missingLabel: string;
    missingReject: string;
    tiesLabel: string;
    tiesReject: string;
    stableLabel: string;
    stableYes: string;
    sourceOrderValue: string;
    orderedPositionHeader: string;
    sourceRecordHeader: string;
    horizonOrdinalHeader: string;
    boundaryHeader: string;
    unitFieldsHeader: string;
    horizonFieldsHeader: string;
    orderFieldsHeader: string;
    boundarySingle: string;
    boundaryStart: string;
    boundaryWithin: string;
    boundaryEnd: string;
    emptyFields: string;
    previousPage: string;
    nextPage: string;
    previewRange: string;
  };
  mask: {
    triggerLabel: string;
    dialogTitle: string;
    dialogDescription: string;
    closeLabel: string;
    matrixCaption: string;
    groundHeader: string;
    responseHeader: string;
    allLabel: string;
    noneLabel: string;
    diagonalLabel: string;
    offDiagonalLabel: string;
    invalidMaskMessage: string;
    cellLabel: (ground: string, response: string, diagonal: boolean) => string;
    cellAnnouncement: (ground: string, response: string, enabled: boolean) => string;
    bulkAnnouncement: (preset: "all" | "none" | "diagonal" | "off-diagonal", enabled: number, total: number) => string;
  };
  layout: {
    overallPlot: string;
    overallSubtitle: string;
    primaryPlot: string;
    secondaryPlot: string;
    groupMeanSubtitle: string;
    dataView: string;
    dataViewSubtitle: string;
    unavailableGroupPlot: string;
    descriptiveBoundary: string;
    directionGuide: string;
    rightToolsLabel: string;
  };
  plot: {
    overallTitle: string;
    groupTitle: string;
    directedNetworkDescription: string;
    normalizedMeanWeight: string;
    rawAggregateCount: string;
    respondedToWith: string;
    selfConnection: string;
    visibleConnections: string;
    noVisibleConnections: string;
    sourceApexLegend: string;
    chevronLegend: string;
    selfDiscLegend: string;
    nodeSizeLabel: string;
    unitsLabel: string;
    groundSourceLabel: string;
    responseTargetLabel: string;
    directionLegendLabel: string;
    flippedLabel: string;
    visibleCellsLabel: string;
  };
  dataView: {
    ariaLabel: string;
    title: string;
    returnLabel: string;
    returnAriaLabel: string;
    contextLabel: string;
    overall: string;
    primary: string;
    secondary: string;
    record: string;
    records: string;
    exportLabel: string;
    exportAriaLabel: string;
    tableAriaLabel: string;
    previousPage: string;
    nextPage: string;
    rowsShown: string;
    columnsShown: string;
    rowPaginationLabel: string;
    columnPaginationLabel: string;
    provenanceGroup: string;
    metadataGroup: string;
    codeGroup: string;
    directedEdgeGroup: string;
    provenanceLabels: {
      orderedResponsePosition: string;
      sourceRecordNumber: string;
      opaqueHorizonOrdinal: string;
      priorRowCount: string;
      predecessorResponsePositions: string;
    };
    yes: string;
    no: string;
    empty: string;
    missingDatasetBinding: string;
    localIdentityWarning: string;
    exportConfirmation: string;
  };
  stats: {
    title: string;
    descriptiveBoundary: string;
    overallScopeLabel: string;
    groupScopeLabel: string;
    modelCoverage: string;
    analyticUnits: string;
    orderedRows: string;
    opaqueHorizons: string;
    codes: string;
    directedCells: string;
    enabled: string;
    masked: string;
    zeroNetworks: string;
    rawMass: string;
    total: string;
    selfConnections: string;
    offDiagonal: string;
    incomingRawMass: string;
    outgoingRawMass: string;
    topDirectedCells: string;
    pairAsymmetry: string;
    groupUnitCounts: string;
    varianceDiagnostics: string;
    noPositiveCells: string;
    normalizedMean: string;
    raw: string;
    nonzeroUnits: string;
    absoluteNormalizedAsymmetry: string;
    tie: string;
  };
  exports: {
    title: string;
    description: string;
    scopeLabel: string;
    aggregateLabel: string;
    aggregateDescription: string;
    auditLabel: string;
    auditDescription: string;
    auditWarning: string;
    auditConfirmation: string;
    bundleConfirmation: string;
  };
  unavailable: {
    sets: string;
    reference: string;
    groupContrast: string;
    trajectory: string;
    threeD: string;
    inference: string;
    ai: string;
  };
  presenter: {
    title: string;
    description: string;
    directionBoundary: string;
    groupPanelsTitle: string;
    groupPanelsDescription: string;
  };
}

export interface OpenEnaCopy {
  eyebrow: string;
  title: string;
  intro: string;
  navLabel: string;
  modes: { sets: string; data: string; model: string; plot: string; stats: string; ai: string };
  views: { twoD: string; threeD: string };
  groupDisplay: OpenEnaGroupDisplayCopy;
  ona: OpenEnaOnaCopy;
  sets: {
    title: string;
    description: string;
    capture: string;
    captureHint: string;
    emptyTitle: string;
    emptyText: string;
    fitted: string;
    projected: string;
    generatedReference: string;
    projectionReference: string;
    sourceHash: string;
    hashScope: string;
    primary: string;
    secondary: string;
    choosePrimary: string;
    chooseSecondary: string;
    comparisonHint: string;
    noCompatibleSecondary: string;
    remove: string;
    exportJson: string;
    exportEdges: string;
  };
  data: {
    title: string;
    description: string;
    upload: string;
    uploadHint: string;
    sample: string;
    sampleHint: string;
    trajectorySample: string;
    trajectorySampleHint: string;
    noFile: string;
    active: string;
    rows: string;
    columns: string;
    source: string;
    local: string;
  };
  model: {
    title: string;
    description: string;
    sequenceNote: string;
    unit: string;
    conversation: string;
    group: string;
    identityHint: string;
    noGroup: string;
    codes: string;
    codeColor: string;
    window: string;
    movingWindow: string;
    conversationWindow: string;
    back: string;
    forward: string;
    configureTrajectory: string;
    modelType: string;
    endpoint: string;
    separateTrajectory: string;
    accumulatedTrajectory: string;
    trajectoryHint: string;
    rotation: string;
    svd: string;
    means: string;
    center: string;
    weighting: string;
    binary: string;
    sum: string;
    run: string;
    rerun: string;
    valid: string;
  };
  plot: {
    title: string;
    description: string;
    showPoints: string;
    showNetworks: string;
    showLabels: string;
    showUnitLabels: string;
    showVariance: string;
    showTrajectories: string;
    edgeScale: string;
    edgeThreshold: string;
    pointScale: string;
    axisX: string;
    axisY: string;
    axisZ: string;
    camera: string;
    cameraPosition: string;
    default3dCamera: string;
    isometric: string;
    xy: string;
    xz: string;
    yz: string;
    yx: string;
    zx: string;
    zy: string;
    reset: string;
    threeDInteractionHint: string;
    sameFittedSpace: string;
    threeDExportHint: string;
    threeDUnavailable: string;
    threeDRequiresThreeDimensions: string;
  };
  contrast: {
    title: string;
    description: string;
    primary: string;
    secondary: string;
    swap: string;
    selectedOrder: string;
    selectedAxes: string;
    multiplicity: string;
    exportJson: string;
    exportEdges: string;
    requiresGroup: string;
    requiresTwoGroups: string;
    endpointOnly: string;
  };
  longitudinal: {
    title: string;
    description: string;
    repeatedEntity: string;
    confirmIdentity: string;
    identityConfirmationHint: string;
    timeOrder: string;
    observedOrder: string;
    accumulatedOrderLocked: string;
    moveEarlier: string;
    moveLater: string;
    cohortPolicy: string;
    available: string;
    complete: string;
    availableHint: string;
    completeHint: string;
    showIndividualPaths: string;
    showGroupPaths: string;
    descriptive: string;
    noEndpointTests: string;
    exportJson: string;
    exportCsv: string;
    exportInferenceCsv: string;
    allUnits: string;
    period: string;
    group: string;
    availableCount: string;
    completeCount: string;
    includedCount: string;
    excludedCount: string;
    unavailableModel: string;
    unavailableEntity: string;
    unavailableTime: string;
    unavailablePeriods: string;
    unavailableComplete: string;
    figureAriaLabel: string;
    geometryView: string;
    diagnosticsCaption: string;
    nUsed: string;
    nExcluded: string;
    centroid: string;
    status: string;
    gap: string;
    observed: string;
    noContributorOverlap: string;
    gapRule: string;
    noConnectedPaths: string;
    legendAriaLabel: string;
    largerCentroidMarker: string;
    timeDirectionArrow: string;
    flipped: string;
    firstAxis: string;
    secondAxis: string;
    circle: string;
    diamond: string;
    triangle: string;
    square: string;
    cross: string;
    hexagon: string;
    solid: string;
    dashed: string;
    dotted: string;
    dashDot: string;
    shortDashed: string;
    longShortDashed: string;
    marker: string;
    path: string;
    rowsTruncated: string;
    individualMarksSampled: string;
  };
  stats: {
    title: string;
    description: string;
    variance: string;
    groupSummary: string;
    effect: string;
    verifiedTests: string;
    correlations: string;
    notTest: string;
    manifest: string;
    export: string;
    exportBundle: string;
    trajectoryNotice: string;
    tabs: { comparison: string; goodness: string; variance: string };
    inference: OpenEnaInferenceCopy;
    ui: OpenEnaStatsUiCopy;
  };
  aiInterpretation: OpenEnaAiInterpretationCopy;
  resultTables: OpenEnaResultTablesCopy;
  workspace: {
    comparison: string;
    groupNetworks: string;
    emptyTitle: string;
    emptyText: string;
    ready: string;
    running: string;
    result: string;
    units: string;
    trajectorySteps: string;
    codes: string;
    groups: string;
    runtime: string;
    jenaSourceLabel: string;
    jenaSourceAriaLabel: (version: string, commit: string) => string;
    methodNote: string;
    threeDNote: string;
    errorTitle: string;
    accessibleSummary: string;
    groupMeans: string;
    strongestDifferences: string;
    strongestConnections: string;
    strongerGroup: string;
    difference: string;
    meanWeight: string;
  };
}

export interface OpenEnaAiInterpretationCopy {
  title: string;
  description: string;
  statsSourceLabel: string;
  statsReady: string;
  statsRequired: string;
  openStats: string;
  previewTitle: string;
  previewHint: string;
  consentLabel: string;
  generate: string;
  generating: string;
  cancel: string;
  retry: string;
  errorTitle: string;
  noCurrentResult: string;
  staleResult: string;
  aggregatePrivacyGate: string;
  aiGenerated: string;
  descriptiveOnly: string;
  notStatisticalInference: string;
  privacyLocal: string;
  privacyExternal: string;
  provider: string;
  model: string;
  provenance: string;
  generatedAt: string;
  promptVersion: string;
  evidenceKey: string;
  observedPatterns: string;
  contextualQuestions: string;
  limitations: string;
}

const inferenceEn: OpenEnaInferenceCopy = {
  designLegend: "Confirm the research design",
  designIndependent: "Independent groups · Mann–Whitney U",
  designIndependentDescription: "Compare two independent groups at an endpoint or at one explicit trajectory period.",
  designPaired: "Paired periods · Wilcoxon signed-rank",
  designPairedDescription: "Pair the same confirmed entities across two periods within one group.",
  designRepeated: "Repeated periods · Friedman + Holm-adjusted Wilcoxon signed-rank",
  designRepeatedDescription: "Use one all-period complete cohort across three or more periods and every pairwise follow-up.",
  endpointRequiresIndependent: "Endpoint results support independent-group inference only.",
  independentRequiresTwoGroups: "This design requires two distinct comparison groups.",
  independentRequiresPeriod: "One valid trajectory period is required for this independent-group design.",
  pairedRequiresTrajectory: "Paired-period inference requires a successful trajectory model.",
  pairedRequiresTwoPeriods: "Paired-period inference requires at least two ordered periods.",
  repeatedRequiresTrajectory: "Repeated-period inference requires a successful trajectory model.",
  repeatedRequiresThreePeriods: "Repeated-period inference requires at least three ordered periods.",
  identityLegend: "Composite repeated-entity identity",
  identityHint: "Fields are ordered as fitted. Confirm that the selected combination identifies one stable repeated entity.",
  identityConfirmation: "I confirm this composite identity for repeated-measures matching.",
  timeField: "Time field",
  group: "One comparison group",
  allUnits: "All units",
  primaryGroup: "Primary group",
  secondaryGroup: "Secondary group",
  selectedPeriod: "Selected period",
  earlierPeriod: "Earlier period slot",
  laterPeriod: "Later period slot",
  repeatedPeriods: "Selected repeated periods",
  periodSelectionHint: "Select at least three periods. Follow-ups use every selected pair in this displayed order.",
  eligibilitySelectDesign: "Select a research design to continue.",
  eligibilityConfirmIdentity: "Confirm the composite repeated-entity identity to continue.",
  eligibilityCompleteScope: "Complete the group, time, period, and axis scope to review the inclusion ledger.",
  eligibilityReady: "The design and aggregate inclusion ledger are ready for review. No p-value has been calculated yet.",
  ledgerTitle: "Inclusion ledger before inference",
  ledgerCaption: "Aggregate candidates, inclusions, and exclusions for the confirmed design",
  status: "Ledger item",
  value: "Count",
  candidateEntities: "Candidate entities",
  availablePrimary: "Available in Primary",
  availableSecondary: "Available in Secondary",
  includedEntities: "Included entities",
  earlierAvailable: "Available in earlier slot",
  laterAvailable: "Available in later slot",
  matchedEntities: "Matched entities",
  earlierOnly: "Earlier-only entities",
  laterOnly: "Later-only entities",
  missingPairs: "Missing A/B pairs",
  provisionalZeroFirstAxis: "Zero differences on first axis (pre-run frame check)",
  provisionalZeroSecondAxis: "Zero differences on second axis (pre-run frame check)",
  completeBlocks: "All-period complete entities",
  missingAnySelectedPeriod: "Missing any selected period",
  availableAtPeriod: "Available at period",
  run: "Run inferential comparison",
  running: "Running inferential comparison…",
  jumpToResults: "Jump to inferential results",
  resultsTitle: "Inferential comparison results",
  resultAvailable: "Available",
  resultNotEstimable: "Not estimable",
  resultDisabled: "Disabled",
  integrityError: "The inference integrity check stopped this analysis.",
  axis: "Axis",
  primary: "Primary",
  secondary: "Secondary",
  n: "n",
  median: "Median",
  uPrimary: "U for Primary",
  uSecondary: "U for Secondary",
  pHolm: "Holm-adjusted p (primary)",
  pRaw: "Raw p (audit)",
  rankBiserial: "Rank-biserial effect",
  resolvedMethod: "Resolved p-value method",
  direction: "Period direction",
  matched: "Matched",
  missing: "Missing",
  zero: "Zero",
  positive: "Positive",
  negative: "Negative",
  nonzero: "Nonzero / ranked",
  differenceMedian: "Difference median",
  differenceIqr: "Difference IQR",
  wPositive: "W positive",
  wNegative: "W negative",
  tStatistic: "T = min(W positive, W negative)",
  minimumAttainableP: "Minimum attainable two-sided p",
  periods: "Periods",
  completeN: "Complete n",
  qStatistic: "Friedman Q",
  degreesFreedom: "Degrees of freedom",
  kendallsW: "Kendall’s W",
  mannWhitneyEndpointCaption: "Independent endpoint groups",
  mannWhitneyPeriodCaption: "Independent groups at one selected period · Mann–Whitney U",
  wilcoxonCaption: "Paired periods · Wilcoxon signed-rank (later minus earlier)",
  friedmanCaption: "Repeated periods · Friedman omnibus",
  followupCaption: "All selected-period pairs · Holm-adjusted Wilcoxon signed-rank follow-ups",
  endpointTemporalBoundary: "The endpoint model does not verify that the two independent groups share one common time period.",
  resultAuditHint: "Holm-adjusted p is primary; raw p is retained for audit. Coordinates are the unflipped fitted-model coordinates.",
  provenanceTitle: "Inference provenance",
  provenanceLabel: "Producer",
  analyzedAtLabel: "Analyzed at",
  datasetBindingLabel: "Dataset binding",
  modelAxesLabel: "Model and unflipped axes",
  configurationBindingLabel: "Configuration binding",
  fixedMethodLabel: "Fixed method policy",
  noResult: "No inferential result has been run for the current confirmed design.",
  warnings: "Method and design warnings",
  auditCodeLabel: "Audit code",
  reasonMessages: {
    "design-not-confirmed": "The research design has not been confirmed.",
    "identity-not-confirmed": "The composite repeated-entity identity has not been confirmed.",
    "identity-columns-invalid": "The repeated-entity identity fields are invalid for the successful model.",
    "identity-component-empty": "At least one repeated-entity identity component is empty.",
    "time-column-invalid": "The selected time field is invalid for the successful model.",
    "axes-invalid": "The selected inference axes are invalid for the successful result.",
    "group-required": "Select one comparison group for this repeated-measures design.",
    "group-invalid": "The selected comparison group is invalid for the current result.",
    "groups-must-differ": "The Primary and Secondary groups must be different.",
    "period-invalid": "The selected period is invalid for the current comparison frame.",
    "periods-must-differ": "The earlier and later periods must be different.",
    "at-least-three-periods-required": "Repeated-period inference requires at least three selected periods.",
    "empty-group": "At least one selected comparison group has no eligible entities.",
    "insufficient-ranked-observations": "There are too few ranked observations to estimate this test.",
    "all-values-tied": "All eligible values are tied, so this comparison cannot be estimated.",
    "all-zero-differences": "Every matched difference is zero, so the signed-rank test cannot be estimated.",
    "no-complete-blocks": "No entity has a complete block across all selected periods.",
  },
  integrityMessages: {
    "binding-mismatch": "The inference inputs do not match the immutable successful-result binding.",
    "identity-collision": "The repeated-entity identity maps across incompatible comparison groups.",
    "group-instability": "Repeated-entity comparison-group membership is unstable.",
    "entity-period-instability": "The compact entity-period mapping is unstable.",
    "nonfinite-coordinate": "A required model coordinate is missing or not finite.",
  },
  warningMessages: {
    "small-sample": "The ranked sample is small; attainable two-sided p-values are discrete.",
    "discrete-attainable-p": "The exact two-sided p-value can take only discrete attainable values for this sample.",
    "ties-present": "Tied ranks are present and are handled by average ranks and the recorded conditional or corrected method.",
    "zero-differences-present": "Zero paired differences are counted in the ledger but excluded from signed ranks under the Wilcox zero rule.",
    "missing-pairs": "Some candidate entities are missing one of the two selected periods and are excluded from this pairwise-complete comparison.",
    "missing-complete-blocks": "Some candidate entities are missing at least one selected period and are excluded from the all-period-complete cohort.",
    "signed-rank-symmetry-assumption": "Wilcoxon signed-rank inference assumes a symmetric distribution of paired differences.",
    "independent-entity-assumption": "Mann–Whitney U inference assumes the compared entity observations are independent between groups.",
    "cluster-independence-unverified": "The ordinary rank test does not verify or adjust for additional clustering among entities.",
    "accumulated-trajectory-path-dependence": "Each accumulated-trajectory point contains its preceding network history and is not an isolated time-point measurement.",
    "arbitrary-axis-sign": "ENA axis signs are arbitrary; reversing an axis reverses signed effects without changing two-sided p-values.",
    "mr1-circularity": "MR1 is constructed from the fitted group contrast, so inference on MR1 is circular and should be treated cautiously.",
  },
  resolvedMethodNames: {
    "exact-classic": "Exact two-sided rank distribution",
    "exact-conditional-rank-permutation": "Exact conditional rank-permutation distribution",
    "normal-approximation-tie-corrected": "Tie-corrected normal approximation with continuity correction",
    "exact-conditional-sign-flip": "Exact conditional sign-flip distribution",
    "normal-approximation-actual-ranks": "Normal approximation from actual signed ranks with continuity correction",
    "exact-conditional-period-permutation": "Exact conditional within-entity period permutation",
    "chi-square-approximation-tie-corrected": "Tie-corrected chi-square approximation",
  },
};

const inferenceZhHant: OpenEnaInferenceCopy = {
  designLegend: "確認研究設計",
  designIndependent: "獨立群組 · Mann–Whitney U 檢定",
  designIndependentDescription: "比較端點或一個明確軌跡期間中的兩個獨立群組。",
  designPaired: "配對期間 · Wilcoxon signed-rank（威爾科克森符號秩檢定）",
  designPairedDescription: "在一個群組內，以已確認的相同實體配對兩個期間。",
  designRepeated: "重複期間 · Friedman 檢定 + Holm 校正的 Wilcoxon signed-rank（威爾科克森符號秩檢定）",
  designRepeatedDescription: "三個或以上期間共用一個全期間完整隊列，並產生所有期間對的後續比較。",
  endpointRequiresIndependent: "端點結果只支援獨立群組推論。",
  independentRequiresTwoGroups: "此設計需要兩個不同的比較群組。",
  independentRequiresPeriod: "此獨立群組設計需要一個有效的軌跡期間。",
  pairedRequiresTrajectory: "配對期間推論需要成功的軌跡模型。",
  pairedRequiresTwoPeriods: "配對期間推論至少需要兩個排序期間。",
  repeatedRequiresTrajectory: "重複期間推論需要成功的軌跡模型。",
  repeatedRequiresThreePeriods: "重複期間推論至少需要三個排序期間。",
  identityLegend: "複合重複實體識別",
  identityHint: "欄位依擬合順序排列。請確認所選組合只識別一個穩定的重複實體。",
  identityConfirmation: "我確認使用此複合識別進行重複測量配對。",
  timeField: "時間欄位",
  group: "一個比較群組",
  allUnits: "全部單位",
  primaryGroup: "主要群組",
  secondaryGroup: "次要群組",
  selectedPeriod: "所選期間",
  earlierPeriod: "較早期間欄位",
  laterPeriod: "較後期間欄位",
  repeatedPeriods: "所選重複期間",
  periodSelectionHint: "至少選三個期間；後續比較依顯示順序使用所有期間對。",
  eligibilitySelectDesign: "請先選擇研究設計。",
  eligibilityConfirmIdentity: "請確認複合重複實體識別。",
  eligibilityCompleteScope: "請完成群組、時間、期間與軸範圍，然後檢查納入帳本。",
  eligibilityReady: "設計與彙總納入帳本已可供檢查；尚未計算任何 p 值。",
  ledgerTitle: "推論前納入帳本",
  ledgerCaption: "已確認設計的彙總候選、納入與排除數",
  status: "帳本項目",
  value: "數量",
  candidateEntities: "候選實體",
  availablePrimary: "主要群組可用",
  availableSecondary: "次要群組可用",
  includedEntities: "納入實體",
  earlierAvailable: "較早欄位可用",
  laterAvailable: "較後欄位可用",
  matchedEntities: "已配對實體",
  earlierOnly: "只在較早欄位",
  laterOnly: "只在較後欄位",
  missingPairs: "缺失 A/B 配對",
  provisionalZeroFirstAxis: "第一軸零差（執行前比較框架檢查）",
  provisionalZeroSecondAxis: "第二軸零差（執行前比較框架檢查）",
  completeBlocks: "全期間完整實體",
  missingAnySelectedPeriod: "任一所選期間缺失",
  availableAtPeriod: "期間可用",
  run: "執行推論比較",
  running: "正在執行推論比較…",
  jumpToResults: "跳到推論結果",
  resultsTitle: "推論比較結果",
  resultAvailable: "可用",
  resultNotEstimable: "不可估計",
  resultDisabled: "已停用",
  integrityError: "推論完整性檢查已停止此分析。",
  axis: "軸",
  primary: "主要群組",
  secondary: "次要群組",
  n: "n",
  median: "中位數",
  uPrimary: "主要群組 U",
  uSecondary: "次要群組 U",
  pHolm: "Holm 校正 p（主要）",
  pRaw: "原始 p（稽核）",
  rankBiserial: "秩二列效應量",
  resolvedMethod: "實際 p 值方法",
  direction: "期間方向",
  matched: "配對",
  missing: "缺失",
  zero: "零差",
  positive: "正差",
  negative: "負差",
  nonzero: "非零／排秩",
  differenceMedian: "差值中位數",
  differenceIqr: "差值 IQR",
  wPositive: "W 正秩",
  wNegative: "W 負秩",
  tStatistic: "T = min(W 正秩, W 負秩)",
  minimumAttainableP: "最低可達雙側 p",
  periods: "期間",
  completeN: "完整 n",
  qStatistic: "Friedman Q",
  degreesFreedom: "自由度",
  kendallsW: "Kendall’s W",
  mannWhitneyEndpointCaption: "獨立端點群組",
  mannWhitneyPeriodCaption: "所選同一期間的獨立群組 · Mann–Whitney U 檢定",
  wilcoxonCaption: "配對期間 · Wilcoxon signed-rank（較後減較早）",
  friedmanCaption: "重複期間 · Friedman 總體檢定",
  followupCaption: "所有所選期間對 · Holm 校正的 Wilcoxon signed-rank 後續比較",
  endpointTemporalBoundary: "端點模型不會驗證兩個獨立群組是否位於同一共同時間期間。",
  resultAuditHint: "Holm 校正 p 為主要值；原始 p 保留作稽核。座標使用未翻轉的擬合模型座標。",
  provenanceTitle: "推論來源記錄",
  provenanceLabel: "產生者",
  analyzedAtLabel: "分析時間",
  datasetBindingLabel: "資料集綁定",
  modelAxesLabel: "模型與未翻轉軸",
  configurationBindingLabel: "設定綁定",
  fixedMethodLabel: "固定方法政策",
  noResult: "目前已確認的設計尚未執行推論結果。",
  warnings: "方法與設計警告",
  auditCodeLabel: "稽核代碼",
  reasonMessages: {
    "design-not-confirmed": "尚未確認研究設計。",
    "identity-not-confirmed": "尚未確認複合重複實體識別。",
    "identity-columns-invalid": "重複實體識別欄位不適用於成功模型。",
    "identity-component-empty": "至少一個重複實體識別組成值為空。",
    "time-column-invalid": "所選時間欄位不適用於成功模型。",
    "axes-invalid": "所選推論軸不適用於成功結果。",
    "group-required": "請為此重複測量設計選擇一個比較群組。",
    "group-invalid": "所選比較群組不適用於目前結果。",
    "groups-must-differ": "主要群組與次要群組必須不同。",
    "period-invalid": "所選期間不適用於目前比較框架。",
    "periods-must-differ": "較早期間與較後期間必須不同。",
    "at-least-three-periods-required": "重複期間推論至少需要三個所選期間。",
    "empty-group": "至少一個所選比較群組沒有合資格實體。",
    "insufficient-ranked-observations": "可排秩觀察太少，無法估計此檢定。",
    "all-values-tied": "所有合資格值均為同秩，因此無法估計此比較。",
    "all-zero-differences": "所有配對差值均為零，因此無法估計符號秩檢定。",
    "no-complete-blocks": "沒有實體在所有所選期間形成完整區組。",
  },
  integrityMessages: {
    "binding-mismatch": "推論輸入與不可變的成功結果綁定不一致。",
    "identity-collision": "重複實體識別被映射至不相容的比較群組。",
    "group-instability": "重複實體的比較群組成員資格不穩定。",
    "entity-period-instability": "精簡實體—期間映射不穩定。",
    "nonfinite-coordinate": "必要的模型座標缺失或不是有限數值。",
  },
  warningMessages: {
    "small-sample": "排秩樣本較小；可達的雙側 p 值是離散的。",
    "discrete-attainable-p": "在此樣本下，精確雙側 p 值只能取離散的可達值。",
    "ties-present": "資料包含同秩；系統以平均秩及記錄的條件精確或校正方法處理。",
    "zero-differences-present": "零配對差計入納入帳本，但依 Wilcox 零值規則不進入符號秩。",
    "missing-pairs": "部分候選實體缺少兩個所選期間之一，已從成對完整比較排除。",
    "missing-complete-blocks": "部分候選實體缺少至少一個所選期間，已從全期間完整隊列排除。",
    "signed-rank-symmetry-assumption": "Wilcoxon 符號秩推論假設配對差值分布對稱。",
    "independent-entity-assumption": "Mann–Whitney U 推論假設兩群組的實體觀察彼此獨立。",
    "cluster-independence-unverified": "一般秩檢定不會驗證或校正實體之間的額外聚類。",
    "accumulated-trajectory-path-dependence": "每個累積軌跡點包含此前的網絡歷史，並非孤立的時間點測量。",
    "arbitrary-axis-sign": "ENA 軸的正負方向是任意的；反轉軸會反轉帶符號效應，但不改變雙側 p 值。",
    "mr1-circularity": "MR1 由已擬合的群組對比建構，因此對 MR1 的推論具有循環性，應審慎解讀。",
  },
  resolvedMethodNames: {
    "exact-classic": "經典精確雙側秩分布",
    "exact-conditional-rank-permutation": "精確條件秩置換分布",
    "normal-approximation-tie-corrected": "同秩校正並含連續性校正的常態近似",
    "exact-conditional-sign-flip": "精確條件符號翻轉分布",
    "normal-approximation-actual-ranks": "依實際符號秩並含連續性校正的常態近似",
    "exact-conditional-period-permutation": "實體內期間標籤的精確條件置換",
    "chi-square-approximation-tie-corrected": "同秩校正的卡方近似",
  },
};

const inferenceZhHans: OpenEnaInferenceCopy = {
  ...inferenceZhHant,
  designLegend: "确认研究设计",
  designIndependent: "独立组 · Mann–Whitney U 检验",
  designIndependentDescription: "比较端点或一个明确轨迹时期中的两个独立组。",
  designPaired: "配对时期 · Wilcoxon signed-rank（威尔科克森符号秩检验）",
  designPairedDescription: "在一个组内，以已确认的相同实体配对两个时期。",
  designRepeated: "重复时期 · Friedman 检验 + Holm 校正的 Wilcoxon signed-rank（威尔科克森符号秩检验）",
  designRepeatedDescription: "三个或以上时期共用一个全时期完整队列，并生成所有时期对的后续比较。",
  endpointRequiresIndependent: "端点结果仅支持独立组推断。",
  independentRequiresTwoGroups: "此设计需要两个不同的比较组。",
  independentRequiresPeriod: "此独立组设计需要一个有效的轨迹时期。",
  pairedRequiresTrajectory: "配对时期推断需要成功的轨迹模型。",
  pairedRequiresTwoPeriods: "配对时期推断至少需要两个排序时期。",
  repeatedRequiresTrajectory: "重复时期推断需要成功的轨迹模型。",
  repeatedRequiresThreePeriods: "重复时期推断至少需要三个排序时期。",
  identityLegend: "复合重复实体标识",
  identityHint: "字段按拟合顺序排列。请确认所选组合仅标识一个稳定的重复实体。",
  identityConfirmation: "我确认使用此复合标识进行重复测量配对。",
  timeField: "时间字段",
  group: "一个比较组",
  allUnits: "所有单位",
  primaryGroup: "主要组",
  secondaryGroup: "次要组",
  selectedPeriod: "所选时期",
  earlierPeriod: "较早时期栏位",
  laterPeriod: "较后时期栏位",
  repeatedPeriods: "所选重复时期",
  periodSelectionHint: "至少选择三个时期；后续比较按显示顺序使用所有时期对。",
  eligibilitySelectDesign: "请先选择研究设计。",
  eligibilityConfirmIdentity: "请确认复合重复实体标识。",
  eligibilityCompleteScope: "请完成组、时间、时期与轴范围，然后检查纳入账本。",
  eligibilityReady: "设计与汇总纳入账本已可检查；尚未计算任何 p 值。",
  ledgerTitle: "推断前纳入账本",
  ledgerCaption: "已确认设计的汇总候选、纳入与排除数",
  status: "账本项目",
  value: "数量",
  candidateEntities: "候选实体",
  availablePrimary: "主要组可用",
  availableSecondary: "次要组可用",
  includedEntities: "纳入实体",
  earlierAvailable: "较早栏位可用",
  laterAvailable: "较后栏位可用",
  matchedEntities: "已配对实体",
  earlierOnly: "仅较早栏位",
  laterOnly: "仅较后栏位",
  missingPairs: "缺失 A/B 配对",
  provisionalZeroFirstAxis: "第一轴零差（运行前比较框架检查）",
  provisionalZeroSecondAxis: "第二轴零差（运行前比较框架检查）",
  completeBlocks: "全时期完整实体",
  missingAnySelectedPeriod: "任一所选时期缺失",
  availableAtPeriod: "时期可用",
  run: "运行推断比较",
  running: "正在运行推断比较…",
  jumpToResults: "跳到推断结果",
  resultsTitle: "推断比较结果",
  resultAvailable: "可用",
  resultNotEstimable: "不可估计",
  resultDisabled: "已禁用",
  integrityError: "推断完整性检查已停止此分析。",
  axis: "轴",
  primary: "主要组",
  secondary: "次要组",
  median: "中位数",
  uPrimary: "主要组 U",
  uSecondary: "次要组 U",
  pHolm: "Holm 校正 p（主要）",
  pRaw: "原始 p（审计）",
  rankBiserial: "秩二列效应量",
  resolvedMethod: "实际 p 值方法",
  direction: "时期方向",
  matched: "配对",
  missing: "缺失",
  zero: "零差",
  positive: "正差",
  negative: "负差",
  nonzero: "非零／排秩",
  differenceMedian: "差值中位数",
  differenceIqr: "差值 IQR",
  wPositive: "W 正秩",
  wNegative: "W 负秩",
  tStatistic: "T = min(W 正秩, W 负秩)",
  minimumAttainableP: "最低可达双侧 p",
  periods: "时期",
  completeN: "完整 n",
  degreesFreedom: "自由度",
  mannWhitneyEndpointCaption: "独立端点组",
  mannWhitneyPeriodCaption: "所选同一时期的独立组 · Mann–Whitney U 检验",
  wilcoxonCaption: "配对时期 · Wilcoxon signed-rank（较后减较早）",
  friedmanCaption: "重复时期 · Friedman 总体检验",
  followupCaption: "所有所选时期对 · Holm 校正的 Wilcoxon signed-rank 后续比较",
  endpointTemporalBoundary: "端点模型不会验证两个独立组是否处于同一共同时间时期。",
  resultAuditHint: "Holm 校正 p 为主要值；原始 p 保留作审计。坐标使用未翻转的拟合模型坐标。",
  provenanceTitle: "推断来源记录",
  provenanceLabel: "生成者",
  analyzedAtLabel: "分析时间",
  datasetBindingLabel: "数据集绑定",
  modelAxesLabel: "模型与未翻转轴",
  configurationBindingLabel: "配置绑定",
  fixedMethodLabel: "固定方法策略",
  noResult: "当前已确认的设计尚未运行推断结果。",
  warnings: "方法与设计警告",
  auditCodeLabel: "审计代码",
  reasonMessages: {
    "design-not-confirmed": "尚未确认研究设计。",
    "identity-not-confirmed": "尚未确认复合重复实体标识。",
    "identity-columns-invalid": "重复实体标识字段不适用于成功模型。",
    "identity-component-empty": "至少一个重复实体标识组成值为空。",
    "time-column-invalid": "所选时间字段不适用于成功模型。",
    "axes-invalid": "所选推断轴不适用于成功结果。",
    "group-required": "请为此重复测量设计选择一个比较组。",
    "group-invalid": "所选比较组不适用于当前结果。",
    "groups-must-differ": "主要组与次要组必须不同。",
    "period-invalid": "所选时期不适用于当前比较框架。",
    "periods-must-differ": "较早时期与较后时期必须不同。",
    "at-least-three-periods-required": "重复时期推断至少需要三个所选时期。",
    "empty-group": "至少一个所选比较组没有合格实体。",
    "insufficient-ranked-observations": "可排序观察太少，无法估计此检验。",
    "all-values-tied": "所有合格值均为同秩，因此无法估计此比较。",
    "all-zero-differences": "所有配对差值均为零，因此无法估计符号秩检验。",
    "no-complete-blocks": "没有实体在所有所选时期形成完整区组。",
  },
  integrityMessages: {
    "binding-mismatch": "推断输入与不可变的成功结果绑定不一致。",
    "identity-collision": "重复实体标识被映射至不兼容的比较组。",
    "group-instability": "重复实体的比较组成员资格不稳定。",
    "entity-period-instability": "紧凑实体—时期映射不稳定。",
    "nonfinite-coordinate": "必要的模型坐标缺失或不是有限数值。",
  },
  warningMessages: {
    "small-sample": "排序样本较小；可达的双侧 p 值是离散的。",
    "discrete-attainable-p": "在此样本下，精确双侧 p 值只能取离散的可达值。",
    "ties-present": "数据包含同秩；系统以平均秩及记录的条件精确或校正方法处理。",
    "zero-differences-present": "零配对差计入纳入账本，但依 Wilcox 零值规则不进入符号秩。",
    "missing-pairs": "部分候选实体缺少两个所选时期之一，已从成对完整比较排除。",
    "missing-complete-blocks": "部分候选实体缺少至少一个所选时期，已从全时期完整队列排除。",
    "signed-rank-symmetry-assumption": "Wilcoxon 符号秩推断假设配对差值分布对称。",
    "independent-entity-assumption": "Mann–Whitney U 推断假设两组的实体观察彼此独立。",
    "cluster-independence-unverified": "普通秩检验不会验证或校正实体之间的额外聚类。",
    "accumulated-trajectory-path-dependence": "每个累积轨迹点包含此前的网络历史，并非孤立的时间点测量。",
    "arbitrary-axis-sign": "ENA 轴的正负方向是任意的；反转轴会反转带符号效应，但不改变双侧 p 值。",
    "mr1-circularity": "MR1 由已拟合的组对比构建，因此对 MR1 的推断具有循环性，应谨慎解读。",
  },
  resolvedMethodNames: {
    "exact-classic": "经典精确双侧秩分布",
    "exact-conditional-rank-permutation": "精确条件秩置换分布",
    "normal-approximation-tie-corrected": "同秩校正并含连续性校正的正态近似",
    "exact-conditional-sign-flip": "精确条件符号翻转分布",
    "normal-approximation-actual-ranks": "按实际符号秩并含连续性校正的正态近似",
    "exact-conditional-period-permutation": "实体内时期标签的精确条件置换",
    "chi-square-approximation-tie-corrected": "同秩校正的卡方近似",
  },
};

const statsUiEn: OpenEnaStatsUiCopy = {
  evidenceKicker: "04 · Evidence",
  viewsAriaLabel: "Statistics views",
  jenaTestsCaption: "jENA fitted-model test statistics",
  axis: "Axis",
  test: "Test",
  statistic: "Statistic",
  degreesFreedom: "df",
  welchT: "Welch t",
  oneWayF: "One-way F",
  notEstimable: "Not estimable",
  fittedModelGroupOrder: "Fitted-model group order: {groups}. A Welch t sign follows this order, while rotated-axis signs themselves are arbitrary. “{notEstimable}” indicates insufficient group replication or within-group variance.",
  omittedTests: "Omitted for {units} units. In jENA 0.7.0-ona.0, these test summaries are currently coupled to the same quadratic correlation helper, so Open ENA does not run them automatically above {limit} units.",
  referenceMr1Title: "Reference MR1 interpretation",
  selectedPair: "selected pair",
  mr1Circularity: "MR1 is constructed from the same group contrast used for the original fitted order {groups}, independently of the current selector order. Separation and inference on MR1 remain descriptive by construction, not independent confirmation.",
  allGroupTitle: "jENA all-group omnibus statistics",
  allGroupDescription: "This fitted-model result covers every declared group and is separate from the selected Primary-versus-Secondary comparison above.",
  correlationsCaption: "Selected-axis point–centroid correlation diagnostics",
  pearsonR: "Pearson r",
  spearmanRho: "Spearman ρ",
  correlationsExplanation: "Pearson and Spearman values correlate pairwise signed differences among unit-point coordinates with the corresponding signed differences among network-centroid coordinates along each selected axis; they are not correlations between axes.",
  omittedCorrelations: "Omitted for {units} units. Pairwise correspondence diagnostics scale quadratically and run automatically only through {limit} units; the ENA model and linear summaries remain available.",
  projectionCorrelationBoundary: "Not reported for reference projection. jENA 0.7.0-ona.0 retains target-fitted centroids while this plot uses fixed imported nodes, so those point–centroid correlations would not describe the displayed reference geometry.",
  varianceCaption: "Variance shares for the selected axes",
  share: "Share",
  varianceExplanation: "Shares use all rotated dimensions, so the selected axes may not total 100%.",
  projectedVarianceBoundary: "For this projected model, these shares describe the current dataset in the fixed reference basis—not variance explained in the reference sample.",
  referenceSpace: "Reference space",
  notRecorded: "Not recorded",
  legacyHashScope: "legacy normalized UTF-8 text",
  referenceRotationJson: "Reference rotation JSON",
  methodsTitle: "Methods & Reproducibility",
  methodsDescription: "A publication-ready starting point that records the exact model, projection, inference, source identity, and interpretation boundaries. Review and adapt it to the study design before use.",
  copyMethods: "Copy methods text",
  methodsReport: "Methods report",
  methodsPreview: "Preview generated report",
};

const statsUiZhHant: OpenEnaStatsUiCopy = {
  evidenceKicker: "04 · 證據",
  viewsAriaLabel: "統計檢視",
  jenaTestsCaption: "jENA 擬合模型檢定統計量",
  axis: "軸",
  test: "檢定",
  statistic: "統計量",
  degreesFreedom: "自由度",
  welchT: "Welch t 檢定",
  oneWayF: "單因子 F 檢定",
  notEstimable: "無法估計",
  fittedModelGroupOrder: "擬合模型群組順序：{groups}。Welch t 的正負號依此順序，而旋轉軸本身的正負方向可任意翻轉。「{notEstimable}」表示群組重複數或組內變異不足。",
  omittedTests: "由於共有 {units} 個單位，此項已省略。在 jENA 0.7.0-ona.0 中，這些檢定摘要目前與同一個二次複雜度的相關輔助程式耦合，因此 Open ENA 不會在超過 {limit} 個單位時自動執行。",
  referenceMr1Title: "參照 MR1 解讀",
  selectedPair: "所選配對",
  mr1Circularity: "MR1 由原始擬合順序 {groups} 所用的同一群組對比建構，不受目前選擇器順序影響。MR1 上的分離與推論依其建構方式仍只屬描述性結果，並非獨立確認。",
  allGroupTitle: "jENA 全群組總體統計量",
  allGroupDescription: "此擬合模型結果涵蓋所有已宣告群組，與上方所選的主要群組對次要群組比較分開呈現。",
  correlationsCaption: "所選軸的點—質心相關診斷",
  pearsonR: "Pearson r",
  spearmanRho: "Spearman ρ",
  correlationsExplanation: "Pearson 與 Spearman 數值比較每個所選軸上，分析單位點座標的兩兩帶符號差與網絡質心座標的對應帶符號差；它們不是軸與軸之間的相關。",
  omittedCorrelations: "由於共有 {units} 個單位，此項已省略。兩兩對應診斷按二次複雜度增長，只會在不超過 {limit} 個單位時自動執行；ENA 模型與線性摘要仍然可用。",
  projectionCorrelationBoundary: "參照投影不報告此值。jENA 0.7.0-ona.0 保留對目標資料擬合的質心，而此圖使用固定匯入節點，因此這些點—質心相關無法描述畫面所示的參照幾何。",
  varianceCaption: "所選軸的變異占比",
  share: "占比",
  varianceExplanation: "占比以全部旋轉維度為分母，因此所選軸的總和未必是 100%。",
  projectedVarianceBoundary: "對此投影模型，這些占比描述目前資料集在固定參照基底中的分布，而不是參照樣本中的解釋變異。",
  referenceSpace: "參照空間",
  notRecorded: "未記錄",
  legacyHashScope: "舊版正規化 UTF-8 文字",
  referenceRotationJson: "參照旋轉 JSON",
  methodsTitle: "方法與可重現性",
  methodsDescription: "可供發表撰寫起步的報告，記錄精確模型、投影、推論、來源識別與解讀邊界。使用前請按研究設計審閱及調整。",
  copyMethods: "複製方法文字",
  methodsReport: "方法報告",
  methodsPreview: "預覽生成的報告",
};

const statsUiZhHans: OpenEnaStatsUiCopy = {
  evidenceKicker: "04 · 证据",
  viewsAriaLabel: "统计视图",
  jenaTestsCaption: "jENA 拟合模型检验统计量",
  axis: "轴",
  test: "检验",
  statistic: "统计量",
  degreesFreedom: "自由度",
  welchT: "Welch t 检验",
  oneWayF: "单因素 F 检验",
  notEstimable: "无法估计",
  fittedModelGroupOrder: "拟合模型组顺序：{groups}。Welch t 的正负号依此顺序，而旋转轴本身的正负方向可任意翻转。“{notEstimable}”表示组重复数或组内方差不足。",
  omittedTests: "由于共有 {units} 个单位，此项已省略。在 jENA 0.7.0-ona.0 中，这些检验摘要目前与同一个二次复杂度的相关辅助程序耦合，因此 Open ENA 不会在超过 {limit} 个单位时自动运行。",
  referenceMr1Title: "参考 MR1 解读",
  selectedPair: "所选配对",
  mr1Circularity: "MR1 由原始拟合顺序 {groups} 所用的同一组对比构建，不受当前选择器顺序影响。MR1 上的分离与推断依其构建方式仍仅属描述性结果，并非独立确认。",
  allGroupTitle: "jENA 全组总体统计量",
  allGroupDescription: "此拟合模型结果涵盖所有已声明组，与上方所选的主要组对次要组比较分开呈现。",
  correlationsCaption: "所选轴的点—质心相关诊断",
  pearsonR: "Pearson r",
  spearmanRho: "Spearman ρ",
  correlationsExplanation: "Pearson 与 Spearman 数值比较每个所选轴上，分析单位点坐标的两两带符号差与网络质心坐标的对应带符号差；它们不是轴与轴之间的相关。",
  omittedCorrelations: "由于共有 {units} 个单位，此项已省略。两两对应诊断按二次复杂度增长，只会在不超过 {limit} 个单位时自动运行；ENA 模型与线性摘要仍然可用。",
  projectionCorrelationBoundary: "参考投影不报告此值。jENA 0.7.0-ona.0 保留对目标数据拟合的质心，而此图使用固定导入节点，因此这些点—质心相关无法描述画面所示的参考几何。",
  varianceCaption: "所选轴的方差占比",
  share: "占比",
  varianceExplanation: "占比以全部旋转维度为分母，因此所选轴之和未必是 100%。",
  projectedVarianceBoundary: "对此投影模型，这些占比描述当前数据集在固定参考基底中的分布，而不是参考样本中的解释方差。",
  referenceSpace: "参考空间",
  notRecorded: "未记录",
  legacyHashScope: "旧版规范化 UTF-8 文本",
  referenceRotationJson: "参考旋转 JSON",
  methodsTitle: "方法与可复现性",
  methodsDescription: "可供发表写作起步的报告，记录精确模型、投影、推断、来源标识与解读边界。使用前请按研究设计审阅并调整。",
  copyMethods: "复制方法文本",
  methodsReport: "方法报告",
  methodsPreview: "预览生成的报告",
};

const resultTablesEn: OpenEnaResultTablesCopy = {
  summaryTitle: "Result data",
  summaryDescription: "Inspect and export jENA model tables",
  tabsAriaLabel: "Result tables",
  labels: {
    coordinates: "Coordinates",
    lineWeights: "Line weights",
    connectionCounts: "Connection counts",
    trajectories: "Trajectory steps",
    centroids: "Centroids",
    nodePositions: "Node positions",
    adjacencyKey: "Adjacency key",
  },
  exportLabels: {
    coordinates: "Coordinates CSV",
    lineWeights: "Line weights CSV",
    connectionCounts: "Connection counts CSV",
    trajectories: "Trajectory steps CSV",
    centroids: "Centroids CSV",
    nodePositions: "Node positions CSV",
    adjacencyKey: "Adjacency key CSV",
  },
  notApplicableShort: "N/A",
  unavailableReasons: {
    "endpoint-model": "Not applicable to endpoint models.",
    "projection-reference": "Not applicable to projection-reference results.",
  },
  notApplicableNote: (table, reason) => `${table} — ${reason}`,
  tableAriaLabel: (table) => `${table} table`,
  exportAriaLabel: (table) => `Export ${table} as CSV`,
  showingAllRows: (count) => `Showing all ${count.toLocaleString("en")} rows.`,
  showingPreviewRows: (shown, total) => `Showing ${shown.toLocaleString("en")} of ${total.toLocaleString("en")} rows. The CSV export contains all rows.`,
  emptyRows: "No rows are available in this table.",
};

const resultTablesZhHant: OpenEnaResultTablesCopy = {
  summaryTitle: "結果資料",
  summaryDescription: "檢視及匯出 jENA 模型資料表",
  tabsAriaLabel: "結果資料表",
  labels: {
    coordinates: "座標",
    lineWeights: "連線權重",
    connectionCounts: "連線計數",
    trajectories: "軌跡步驟",
    centroids: "質心",
    nodePositions: "節點位置",
    adjacencyKey: "鄰接鍵",
  },
  exportLabels: {
    coordinates: "座標 CSV",
    lineWeights: "連線權重 CSV",
    connectionCounts: "連線計數 CSV",
    trajectories: "軌跡步驟 CSV",
    centroids: "質心 CSV",
    nodePositions: "節點位置 CSV",
    adjacencyKey: "鄰接鍵 CSV",
  },
  notApplicableShort: "不適用",
  unavailableReasons: {
    "endpoint-model": "不適用於端點模型。",
    "projection-reference": "不適用於參考投影結果。",
  },
  notApplicableNote: (table, reason) => `${table} — ${reason}`,
  tableAriaLabel: (table) => `${table}資料表`,
  exportAriaLabel: (table) => `將${table}匯出為 CSV`,
  showingAllRows: (count) => `顯示全部 ${count.toLocaleString("zh-Hant")} 列。`,
  showingPreviewRows: (shown, total) => `顯示 ${shown.toLocaleString("zh-Hant")}/${total.toLocaleString("zh-Hant")} 列；CSV 匯出包含全部列。`,
  emptyRows: "此資料表沒有可用資料列。",
};

const resultTablesZhHans: OpenEnaResultTablesCopy = {
  summaryTitle: "结果数据",
  summaryDescription: "查看并导出 jENA 模型表格",
  tabsAriaLabel: "结果表格",
  labels: {
    coordinates: "坐标",
    lineWeights: "连接权重",
    connectionCounts: "连接计数",
    trajectories: "轨迹步骤",
    centroids: "质心",
    nodePositions: "节点位置",
    adjacencyKey: "邻接键",
  },
  exportLabels: {
    coordinates: "坐标 CSV",
    lineWeights: "连接权重 CSV",
    connectionCounts: "连接计数 CSV",
    trajectories: "轨迹步骤 CSV",
    centroids: "质心 CSV",
    nodePositions: "节点位置 CSV",
    adjacencyKey: "邻接键 CSV",
  },
  notApplicableShort: "不适用",
  unavailableReasons: {
    "endpoint-model": "不适用于端点模型。",
    "projection-reference": "不适用于参考投影结果。",
  },
  notApplicableNote: (table, reason) => `${table} — ${reason}`,
  tableAriaLabel: (table) => `${table}表格`,
  exportAriaLabel: (table) => `将${table}导出为 CSV`,
  showingAllRows: (count) => `显示全部 ${count.toLocaleString("zh-Hans")} 行。`,
  showingPreviewRows: (shown, total) => `显示 ${shown.toLocaleString("zh-Hans")}/${total.toLocaleString("zh-Hans")} 行；CSV 导出包含全部行。`,
  emptyRows: "此表格没有可用数据行。",
};

const en: OpenEnaCopy = {
  eyebrow: "Browser-based research workspace",
  title: "Open ENA",
  intro: "Build, inspect, and compare epistemic network models with jENA in one workspace with linked 2D and interactive 3D views.",
  navLabel: "Open ENA",
  modes: { sets: "Sets", data: "Data", model: "Model", plot: "Plot Tools", stats: "Stats & Export", ai: "AI" },
  views: { twoD: "2D ENA", threeD: "3D ENA" },
  groupDisplay: {
    title: "Plotted groups and units",
    description: "Visibility and group summaries are display-only; the fitted jENA result and Stats remain unchanged.",
    showAllHiddenLabel: "Show all hidden unit points",
    showAll: (count) => `Show all (${count})`,
    visibleCount: (group, visible, total) => `${group} · ${visible} of ${total} unit points visible`,
    displaySettings: (group) => `Display settings for ${group}`,
    showUnitPoints: "Show unit points",
    showMean: "Show mean",
    showConfidenceIntervals: "Show confidence intervals",
    showOutlierIntervals: "Show outlier intervals",
    includeHiddenPoints: "Include hidden points",
    settingLabel: (setting, group) => `${setting} for ${group}`,
    outlierTwoDBoundary: "Outlier guides use rENA-compatible mean ± 1.5 × IQR on each displayed axis; they do not remove points.",
    outlierThreeDBoundary: "Outlier intervals are currently available in 2D only.",
    meanRequiredBoundary: "Enable Show mean to display its confidence or outlier interval.",
    intervalRequiresTwoUnits: "Confidence and outlier intervals require at least two units in the displayed summary population.",
    searchUnits: "Search units",
    searchUnitsLabel: (group) => `Search units in ${group}`,
    unitListWindow: (shown, matching, total) => `Showing ${shown} of ${matching} matching units (${total} total).`,
    unitVisibility: (visible, total) => `Unit visibility · ${visible}/${total}`,
    unitAction: (visible, unitId, group) => `${visible ? "Hide" : "Show"} unit ${unitId} in ${group}`,
    hide: "Hide",
    show: "Show",
    keepOneVisible: "Keep one visible unit for summaries, or enable Include hidden points first.",
    derivationError: "Group display could not be derived safely. Restore hidden units or rebuild the current result before continuing.",
    hiddenStatus: (count) => `${count} unit point${count === 1 ? " is" : "s are"} hidden.`,
    shortcut: "Manage group/unit visibility and Mean, CI, or outlier guides →",
  },
  resultTables: resultTablesEn,
  ona: {
    family: {
      legend: "Analysis family",
      methodBoundaryLabel: "Method boundary",
      selectedLabel: "Selected",
      ena: {
        label: "Standard ENA",
        description: "Undirected co-occurrence networks with standard ENA windows, models, rotations, comparisons, and trajectories.",
        methodBoundary: "Uses p(p−1)/2 undirected connections and excludes diagonal self-connections.",
      },
      ona: {
        label: "Ordered Network Analysis (ONA)",
        description: "Directed ground/source → response/target networks with explicit typed order and a full p² mask.",
        methodBoundary: "Endpoint, backward-only Moving Stanza Window, raw summed products, SVD, and descriptive-only results in this release.",
      },
    },
    setupIncomplete: "Complete an explicit ONA order policy before this ordered model can run.",
    run: "Build ONA model",
    rerun: "Rebuild ONA model",
    workspace: {
      directedSpace: "p² directed space",
      twoD: "2D ONA",
      downloadBundle: "Download ONA bundle",
      staleTitle: "Configuration changed",
      staleDescription: "The directed ONA view remains bound to the last successful ordered model. Rebuild to apply the pending controls.",
      rebuilding: (progress, stage) => `Rebuilding ordered network with jENA · ${progress}% · ${stage === "accumulate" ? "accumulating ordered contributions" : "normalizing, rotating, and projecting the ONA model"}`,
      cancel: "Cancel",
      statsKicker: "ONA · descriptive",
    },
    plotTools: {
      plotSettings: "Plot Settings",
      closePlotSettings: "Close Plot Settings",
      close: "Close",
      scaleEdgeWeights: "Scale edge weights",
      edgeWeights: "Edge Weights",
      edgeWeightsValue: "Edge Weights value",
      resetEdgeWeights: "Reset Edge Weights",
      textSize: "Text size",
      textSizeControl: "Text Size",
      textSizeValue: "Text Size value",
      resetTextSize: "Reset Text Size",
      codeLabels: "Code labels",
      unitCircle: "Unit circle",
      axisDirection: "Axis direction",
      flipXAxis: "Flip X-Axis",
      flipYAxis: "Flip Y-Axis",
      networkGraph: "Network Graph",
      minimumEdgeWeight: "Minimum edge weight",
      plottedPoints: "Plotted Points",
      groupLabels: "Group labels",
      unitPoints: "Unit points",
      scaleUnitCircles: "Scale unit circles",
      unitLabels: "Unit labels",
      advanced: "Advanced",
      plotZoom: "Plot zoom",
      zoomOut: "Zoom out",
      fit: "Fit",
      zoomIn: "Zoom in",
      resetAllPlotTools: "Reset all plot tools",
      resetAll: "Reset all",
      on: "On",
      off: "Off",
      settingLabel: (label) => `${label} setting`,
      enableLabel: (label) => `Enable ${label}`,
      disableLabel: (label) => `Disable ${label}`,
      timesValue: (value) => `${value} times`,
      pixelsValue: (value) => `${value} pixels`,
      minimumEdgeWeightValue: (percent) => `${percent} percent of the strongest edge`,
      fitPlotValue: (zoom) => `Fit plot; current zoom ${zoom} times`,
    },
    order: {
      title: "Order and backward window",
      description: "Declare how rows are ordered inside each typed horizon. Missing values and ties are rejected rather than guessed.",
      orderPolicyLegend: "Row-order authority",
      columnsPolicyLabel: "Explicit order columns",
      columnsPolicyDescription: "Sort ascending within each typed horizon using one declared comparator per column.",
      sourceRowPolicyLabel: "Confirmed source-record order",
      sourceRowPolicyDescription: "Use imported record order only after explicitly confirming that it carries the intended sequence.",
      orderColumnsLegend: "Order columns and typed comparators",
      comparatorLabel: "Comparator",
      comparatorPlaceholder: "Choose comparator",
      comparatorLabels: {
        number: "Number",
        string: "String (code-point order)",
        boolean: "Boolean",
        "iso-datetime": "ISO date-time",
      },
      sourceRowConfirmationLabel: "I confirm that source-record order is the intended within-horizon sequence.",
      windowTitle: "Backward context",
      windowModeLegend: "Window scope",
      finiteWindowLabel: "Finite total stanza rows",
      entireHorizonLabel: "Entire typed horizon",
      windowSizeLabel: "Total rows including the current response",
      invalidWindowSize: "Use a positive whole number or Entire typed horizon.",
      lockedTitle: "Locked ONA execution contract",
      modelLabel: "Model",
      modelValue: "Endpoint",
      windowTypeLabel: "Window",
      windowTypeValue: "Moving Stanza Window",
      forwardLabel: "Forward rows",
      forwardValue: "0 (backward only)",
      weightLabel: "Weighting",
      weightValue: "Raw summed products",
      rotationLabel: "Rotation",
      rotationValue: "SVD with directed node geometry",
      referenceLabel: "Reference rotation",
      referenceValue: "Unavailable for ONA",
      previewTitle: "Canonical order preview",
      previewReady: "The same canonical ordering function used at execution produced this preview.",
      previewNeedsConfiguration: "Choose a complete order policy to preview the executed response order.",
      previewRejected: "The current rows do not satisfy this typed order policy. Resolve missing values, invalid types, or ties.",
      resolvedPolicyTitle: "Resolved execution policy",
      directionLabel: "Direction",
      directionAscending: "Ascending within each typed horizon",
      missingLabel: "Missing values",
      missingReject: "Reject",
      tiesLabel: "Tied order tuples",
      tiesReject: "Reject",
      stableLabel: "Stable mapping",
      stableYes: "Yes; ordered responses retain their source-record mapping",
      sourceOrderValue: "Confirmed source-record order; no comparator sort is applied.",
      orderedPositionHeader: "Ordered response",
      sourceRecordHeader: "Source record",
      horizonOrdinalHeader: "Typed horizon",
      boundaryHeader: "Boundary",
      unitFieldsHeader: "Unit fields",
      horizonFieldsHeader: "Horizon fields",
      orderFieldsHeader: "Order fields",
      boundarySingle: "Single-row horizon",
      boundaryStart: "Start",
      boundaryWithin: "Within",
      boundaryEnd: "End",
      emptyFields: "—",
      previousPage: "Previous page",
      nextPage: "Next page",
      previewRange: "Rows {start}–{end} of {total} · Page {page} of {pages}",
    },
    mask: {
      triggerLabel: "Edit p² directional mask",
      dialogTitle: "Directional connection mask",
      dialogDescription: "Each cell independently enables one ground/source row code → response/target column code. Diagonal self-connections are included.",
      closeLabel: "Close directional mask editor",
      matrixCaption: "ONA p² direction mask: rows are ground/source; columns are response/target",
      groundHeader: "Ground/source",
      responseHeader: "Response/target",
      allLabel: "All directions",
      noneLabel: "No directions",
      diagonalLabel: "Diagonal only",
      offDiagonalLabel: "Off-diagonal only",
      invalidMaskMessage: "The mask is not bound to the current code order. Reconcile the selected codes before editing.",
      cellLabel: (ground, response, diagonal) => `${ground} ground/source to ${response} response/target${diagonal ? "; self-connection" : ""}`,
      cellAnnouncement: (ground, response, enabled) => `${ground} to ${response} ${enabled ? "enabled" : "disabled"}.`,
      bulkAnnouncement: (preset, enabled, total) => `${preset} preset applied; ${enabled} of ${total} directions enabled.`,
    },
    layout: {
      overallPlot: "Overall ONA",
      overallSubtitle: "All analytic units · descriptive ordered network",
      primaryPlot: "Primary group",
      secondaryPlot: "Secondary group",
      groupMeanSubtitle: "Descriptive group mean · no subtraction",
      dataView: "Ordered Data View",
      dataViewSubtitle: "Runtime-audited ground/source → response/target contributions",
      unavailableGroupPlot: "A second descriptive group network is not available for this model.",
      descriptiveBoundary: "ONA is descriptive-only in this release; these panels do not calculate group differences, p-values, effect sizes, confidence intervals, or causal effects.",
      directionGuide: "Triangle apex is ground/source, triangle base is response/target; a chevron marks the stronger reciprocal direction and an inner disc marks a self-connection.",
      rightToolsLabel: "Ordered plot tools",
    },
    plot: {
      overallTitle: "Overall ordered network",
      groupTitle: "Ordered group mean network",
      directedNetworkDescription: "Directed ONA network; triangle apex is ground/source and triangle base is response/target.",
      normalizedMeanWeight: "equal-unit normalized mean weight",
      rawAggregateCount: "raw aggregate count",
      respondedToWith: "responded to {ground} with {response}",
      selfConnection: "self-connection",
      visibleConnections: "Visible directed connections",
      noVisibleConnections: "No enabled directed connection passes the current display threshold.",
      sourceApexLegend: "Triangle apex = ground/source; base = response/target",
      chevronLegend: "Chevron = stronger reciprocal direction; an exact tie marks both directions",
      selfDiscLegend: "Inner disc = diagonal self-connection",
      nodeSizeLabel: "Node size",
      unitsLabel: "analytic units",
      groundSourceLabel: "ground/source",
      responseTargetLabel: "response/target",
      directionLegendLabel: "Ordered network direction legend",
      flippedLabel: "flipped",
      visibleCellsLabel: "visible directed cells",
    },
    dataView: {
      ariaLabel: "Ordered Data View center surface",
      title: "Ordered Data View",
      returnLabel: "Return to Overall ONA",
      returnAriaLabel: "Return to the overall directed ONA plot",
      contextLabel: "Show audited responses for",
      overall: "Overall",
      primary: "Primary group",
      secondary: "Secondary group",
      record: "audited response",
      records: "audited responses",
      exportLabel: "Export local Data View CSV ↓",
      exportAriaLabel: "Export identity-bearing local ONA Data View as CSV",
      tableAriaLabel: "Audited ONA response contributions",
      previousPage: "Previous page",
      nextPage: "Next page",
      rowsShown: "Rows {start}–{end} of {total} · Page {page} of {pages}",
      columnsShown: "Variable columns {start}–{end} of {total} · Page {page} of {pages}",
      rowPaginationLabel: "Data View row pages",
      columnPaginationLabel: "Data View variable-column pages",
      provenanceGroup: "Ordered provenance",
      metadataGroup: "Local metadata join",
      codeGroup: "Codes",
      directedEdgeGroup: "Directed p² contributions",
      provenanceLabels: {
        orderedResponsePosition: "Ordered response position",
        sourceRecordNumber: "Source record number (local)",
        opaqueHorizonOrdinal: "Opaque horizon ordinal",
        priorRowCount: "Prior rows in backward window",
        predecessorResponsePositions: "Predecessor response positions",
      },
      yes: "Yes",
      no: "No",
      empty: "No audited ONA response rows match this context.",
      missingDatasetBinding: "ONA Data View requires the analyzed dataset SHA-256 binding.",
      localIdentityWarning: "This local view joins de-identified ordered contributions to source record numbers and selected unit, horizon, group, and order metadata. It may identify participants.",
      exportConfirmation: "This CSV contains local identity-bearing metadata and source-record mappings. Confirm that you will review and de-identify it before sharing.",
    },
    stats: {
      title: "ONA descriptive statistics",
      descriptiveBoundary: "Descriptive only. No group subtraction, inferential comparison, p-value, effect size, confidence interval, or causal claim is computed.",
      overallScopeLabel: "Overall ordered network",
      groupScopeLabel: "{group} ordered mean network",
      modelCoverage: "ONA model coverage",
      analyticUnits: "analytic units",
      orderedRows: "ordered response rows (completed result)",
      opaqueHorizons: "opaque horizons (completed result)",
      codes: "codes",
      directedCells: "directed cells",
      enabled: "enabled",
      masked: "masked",
      zeroNetworks: "Zero networks",
      rawMass: "Raw directed mass",
      total: "Total",
      selfConnections: "Self-connections",
      offDiagonal: "Off-diagonal",
      incomingRawMass: "Incoming raw mass by response/target",
      outgoingRawMass: "Outgoing raw mass by ground/source",
      topDirectedCells: "Top directed cells",
      pairAsymmetry: "Reciprocal pair asymmetry",
      groupUnitCounts: "Group unit counts",
      varianceDiagnostics: "Model variance diagnostics",
      noPositiveCells: "No enabled directed cell has positive completed evidence.",
      normalizedMean: "equal-unit normalized mean",
      raw: "raw",
      nonzeroUnits: "nonzero units",
      absoluteNormalizedAsymmetry: "absolute normalized asymmetry",
      tie: "tie",
    },
    exports: {
      title: "ONA research exports",
      description: "Choose an aggregate-only edge table or a de-identified ordered audit. Neither safe export includes the local source-row mapping.",
      scopeLabel: "Descriptive scope",
      aggregateLabel: "Export aggregate directed edges CSV",
      aggregateDescription: "Aggregate-only p² cells: scope, direction, mask, raw total, equal-unit normalized mean, and nonzero-unit count.",
      auditLabel: "Export de-identified ordered audit CSV",
      auditDescription: "Opaque response and horizon ordinals plus runtime-audited p² contributions; no unit, source-row, or metadata identifiers.",
      auditWarning: "De-identified is not anonymous. Ordered response patterns may still carry re-identification risk when combined with outside information; share only under appropriate governance.",
      auditConfirmation: "This audit is de-identified, not anonymous, and may carry re-identification risk. Confirm that its sharing is covered by appropriate research governance.",
      bundleConfirmation: "The full ONA model bundle excludes raw source rows but retains analytic-unit labels and group names. Confirm that you have reviewed or pseudonymized those identifiers before exporting.",
    },
    unavailable: {
      sets: "Analysis Sets and shared reference geometry are not verified for ONA.",
      reference: "Reference rotation is not available for ONA.",
      groupContrast: "ONA group panels show descriptive means only; pairwise subtraction is not available.",
      trajectory: "Trajectory models are not verified for ONA.",
      threeD: "3D ONA is not verified in this release; use the directed 2D view.",
      inference: "Inferential tests are not verified for ONA; only descriptive diagnostics are shown.",
      ai: "AI interpretation is unavailable for ONA until an aggregate-only ordered evidence contract is independently verified.",
    },
    presenter: {
      title: "Tune the directed ONA view",
      description: "These controls change only the directed 2D presentation; they do not rebuild the ordered model.",
      directionBoundary: "Display thresholds never change the fitted p² matrix or the configured directional mask.",
      groupPanelsTitle: "Descriptive group panels",
      groupPanelsDescription: "Choose any two completed groups for independent mean-network panels. Selection never computes subtraction, contrast, or inference.",
    },
  },
  sets: {
    title: "Analysis sets",
    description: "Keep endpoint models in browser memory and compare fitted or projected networks that share one reference geometry.",
    capture: "Capture current model",
    captureHint: "Captures derived coordinates and equal-unit network means only; raw source rows are not retained. Analytic-unit identifiers remain and may require pseudonymization.",
    emptyTitle: "No analysis sets captured",
    emptyText: "Build an endpoint model, then capture it here. A fitted capture installs its reusable reference so a later CSV or XLSX file can be projected into exactly the same ENA space.",
    fitted: "Fitted",
    projected: "Projected",
    generatedReference: "Reusable fitted reference",
    projectionReference: "Projected into reference",
    sourceHash: "Analyzed table SHA-256",
    hashScope: "Hash scope",
    primary: "Primary set",
    secondary: "Secondary set",
    choosePrimary: "Choose primary",
    chooseSecondary: "Choose compatible secondary",
    comparisonHint: "The signed edge difference is Primary minus Secondary in their shared fixed geometry. JSON retains analytic-unit identifiers; pseudonymize before sharing when needed.",
    noCompatibleSecondary: "No compatible secondary set is available. Capture or project another endpoint model in the same reference geometry.",
    remove: "Remove",
    exportJson: "Export comparison JSON",
    exportEdges: "Export edge differences CSV",
  },
  data: {
    title: "Start with coded data",
    description: "Open a CSV or XLSX file in this browser, or load the documented Academy sample to see the full workflow.",
    upload: "Open CSV or XLSX",
    uploadHint: "CSV or XLSX, up to 5 MB and 20,000 rows; XLSX uses the first worksheet",
    sample: "Load teaching sample",
    sampleHint: "48 synthetic rows, 8 teams, 5 codes",
    trajectorySample: "Load 2D trajectory sample",
    trajectorySampleHint: "54 synthetic rows · 6 learners · TP1–TP3 · 6 codes",
    noFile: "No dataset loaded",
    active: "Active dataset",
    rows: "Rows",
    columns: "Columns",
    source: "Source",
    local: "Core ENA computation stays in this browser; raw source rows are never sent to the optional AI interpretation service.",
  },
  model: {
    title: "Define the ENA model",
    description: "Map the fields that give the network its analytic meaning, then run the verified jENA pipeline.",
    sequenceNote: "CSV or XLSX row order defines sequence within each conversation. Sort the source file before analysis when order matters.",
    unit: "Unit",
    conversation: "Conversation",
    group: "Comparison group",
    identityHint: "Select one or more columns; order defines the composite identity.",
    noGroup: "No comparison group (all units)",
    codes: "Codes",
    codeColor: "Code color",
    window: "Window",
    movingWindow: "Moving stanza window",
    conversationWindow: "Whole conversation",
    back: "Backward span (includes current row)",
    forward: "Forward context rows",
    configureTrajectory: "Configure trajectory model",
    modelType: "Model type",
    endpoint: "Endpoint (one network per unit)",
    separateTrajectory: "Separate trajectory (one point per step)",
    accumulatedTrajectory: "Accumulated trajectory (running network per step)",
    trajectoryHint: "Trajectory steps follow each unit’s first-encountered conversation order. Repeated steps are not treated as independent units in the Stats panel.",
    rotation: "Rotation",
    svd: "SVD (data variance)",
    means: "Generalized Means Rotation",
    center: "Pin zero-network units to the origin",
    weighting: "Weighting",
    binary: "Binary",
    sum: "Summed products",
    run: "Build ENA model",
    rerun: "Rebuild model",
    valid: "Model inputs are valid",
  },
  plot: {
    title: "Tune the research view",
    description: "These controls change presentation only. They do not silently rebuild the model.",
    showPoints: "Unit points",
    showNetworks: "Group networks",
    showLabels: "Code labels",
    showUnitLabels: "Unit labels",
    showVariance: "Variance on axes",
    showTrajectories: "Trajectory paths",
    edgeScale: "Edge width",
    edgeThreshold: "Minimum relative edge",
    pointScale: "Unit point size",
    axisX: "X axis",
    axisY: "Y axis",
    axisZ: "Z axis",
    camera: "Camera",
    cameraPosition: "Camera Position",
    default3dCamera: "Default 3D Camera",
    isometric: "Isometric",
    xy: "X-Y plane",
    xz: "X-Z plane",
    yz: "Y-Z plane",
    yx: "Y-X plane",
    zx: "Z-X plane",
    zy: "Z-Y plane",
    reset: "Reset view",
    threeDInteractionHint: "Drag to rotate; scroll or use the five plot actions to zoom in, zoom out, recenter, copy the image, or enter fullscreen. The geometry is descriptive, not inferential.",
    sameFittedSpace: "Same fitted jENA space; switching between 2D and 3D does not rerun or refit the analysis.",
    threeDExportHint: "Use the copy-image button in the 3D plot toolbar to place a PNG on the clipboard. SVG and high-resolution PNG research exports apply to the 2D view.",
    threeDUnavailable: "Interactive 3D is unavailable. The fitted result remains intact; switch back to 2D or reload this view.",
    threeDRequiresThreeDimensions: "3D ENA requires three distinct dimensions in the completed result. The 2D result remains available.",
  },
  contrast: {
    title: "Endpoint group contrast",
    description: "Choose an ordered Primary and Secondary pair. The central plot draws each signed Primary-minus-Secondary edge difference once; the side plots retain the complete group-mean networks on one shared mean scale.",
    primary: "Primary group",
    secondary: "Secondary group",
    swap: "Swap Primary and Secondary",
    selectedOrder: "Selected group order",
    selectedAxes: "Selected axes",
    multiplicity: "This network contrast is descriptive. The confirmed Stats inference workflow applies its fixed Holm family after an explicit run.",
    exportJson: "Export group contrast JSON",
    exportEdges: "Export group contrast edges CSV",
    requiresGroup: "Group contrast unavailable: the endpoint model requires a grouping variable.",
    requiresTwoGroups: "Group contrast unavailable: the endpoint model requires at least two distinct groups.",
    endpointOnly: "Group contrast unavailable: it is only available for endpoint models.",
  },
  longitudinal: {
    title: "Longitudinal group-centroid paths",
    description: "Derive equal-entity group centroids across an explicit period order in the fixed jENA space. These presentation settings do not rebuild jENA or change projected coordinates.",
    repeatedEntity: "Repeated entity",
    confirmIdentity: "Confirm composite identity",
    identityConfirmationHint: "Inference stays off until you confirm that all selected unit fields identify one stable repeated entity.",
    timeOrder: "Time / order field",
    observedOrder: "Explicit time order (first encountered in source data)",
    accumulatedOrderLocked: "Accumulated trajectories are locked to the fitted source encounter order because each point contains its preceding network history.",
    moveEarlier: "Move period earlier",
    moveLater: "Move period later",
    cohortPolicy: "Cohort policy",
    available: "Available cohort",
    complete: "Complete cohort",
    availableHint: "Available cohort uses the repeated entities observed in each period.",
    completeHint: "Complete cohort retains only repeated entities represented in every ordered period.",
    showIndividualPaths: "Individual trajectory paths",
    showGroupPaths: "Group-centroid paths",
    descriptive: "Descriptive longitudinal geometry",
    noEndpointTests: "Endpoint Mann–Whitney and Welch tests are not applied to repeated trajectory periods.",
    exportJson: "Export longitudinal JSON",
    exportCsv: "Export longitudinal periods CSV",
    exportInferenceCsv: "Export inferential comparison CSV",
    allUnits: "No comparison group: one overall All units centroid path is shown.",
    period: "Period",
    group: "Group",
    availableCount: "Available",
    completeCount: "Complete",
    includedCount: "Included",
    excludedCount: "Missing / excluded",
    unavailableModel: "Longitudinal group-centroid analysis requires a successful Separate or Accumulated trajectory result.",
    unavailableEntity: "Longitudinal analysis requires a repeated-entity field from the fitted unit mapping.",
    unavailableTime: "Longitudinal analysis requires a time/order field from the fitted conversation mapping.",
    unavailablePeriods: "Longitudinal analysis requires at least two ordered periods.",
    unavailableComplete: "No eligible repeated entities are represented in every selected period for the Complete cohort.",
    figureAriaLabel: "Group-centroid trajectory plot. Scroll horizontally on small screens.",
    geometryView: "Trajectory geometry view",
    diagnosticsCaption: "Group-by-period centroid diagnostics",
    nUsed: "n used",
    nExcluded: "n excluded",
    centroid: "Centroid",
    status: "Status",
    gap: "Gap",
    observed: "Observed",
    noContributorOverlap: "No shared contributors",
    gapRule: "No segment bridges a missing period or an adjacent transition with zero shared repeated entities.",
    noConnectedPaths: "No connected trajectory can be drawn. No repeated entity occurs in adjacent selected periods. Check the repeated-entity and time-point mapping.",
    legendAriaLabel: "Longitudinal trajectory legend",
    largerCentroidMarker: "Larger outlined square = group-period centroid",
    timeDirectionArrow: "Arrow = selected period direction",
    flipped: "flipped",
    firstAxis: "Dimension 1",
    secondAxis: "Dimension 2",
    circle: "circle",
    diamond: "diamond",
    triangle: "triangle",
    square: "square",
    cross: "cross",
    hexagon: "hexagon",
    solid: "solid",
    dashed: "dashed",
    dotted: "dotted",
    dashDot: "dash-dot",
    shortDashed: "short-dashed",
    longShortDashed: "long-short-dashed",
    marker: "marker",
    path: "path",
    rowsTruncated: "Additional period rows are omitted from this on-screen table; use the longitudinal export for the complete diagnostics.",
    individualMarksSampled: "Individual plot marks are sampled: {pointsShown} of {pointsTotal} points, {segmentsShown} of {segmentsTotal} whole-entity path transitions, and {arrowsShown} of {arrowsTotal} direction arrows are shown. Group-centroid paths remain complete.",
  },
  stats: {
    title: "Evidence and reproducibility",
    description: "Read descriptive summaries with the model specification. Publication-level inference requires a justified test and design.",
    variance: "Variance explained",
    groupSummary: "Group summary",
    effect: "Absolute Cohen’s d",
    verifiedTests: "jENA test statistics",
    correlations: "Dimension correlations",
    notTest: "jENA reports the test statistic and degrees of freedom, but not a p-value. Choose and report inferential tests according to the study design.",
    manifest: "Analysis manifest",
    export: "Export manifest",
    exportBundle: "Export result bundle",
    trajectoryNotice: "Endpoint group tests and point-centroid correlations are not applied to repeated trajectory steps. Use the trajectory geometry descriptively or run a longitudinal method justified by the study design outside this workspace.",
    tabs: { comparison: "Comparison", goodness: "Goodness of Fit", variance: "Variance" },
    inference: inferenceEn,
    ui: statsUiEn,
  },
  aiInterpretation: {
    title: "AI-assisted interpretation",
    description: "Interpret the current confirmed results produced in Stats & Export. AI reviews only the exact aggregate evidence and inference already computed in this browser; it does not recompute tests or replace researcher judgment.",
    statsSourceLabel: "Stats result source",
    statsReady: "A current confirmed Stats result is ready for AI review.",
    statsRequired: "Run and confirm an inference in Stats & Export to prepare a result for AI review.",
    openStats: "Open Stats & Export",
    previewTitle: "Review the aggregate request",
    previewHint: "Inspect the exact versioned JSON before deciding whether to send it.",
    consentLabel: "I reviewed this aggregate request and consent to sending it to the external AI provider.",
    generate: "Generate AI interpretation",
    generating: "Generating interpretation…",
    cancel: "Cancel",
    retry: "Retry",
    errorTitle: "AI interpretation was not generated",
    noCurrentResult: "Run and confirm a current result in Stats & Export before requesting an AI interpretation.",
    staleResult: "Rebuild the ENA model so the interpretation matches the current configuration.",
    aggregatePrivacyGate: "AI review requires a current confirmed inference. Inferential cells below the three-entity disclosure threshold are omitted with an explicit boundary while eligible descriptive evidence remains.",
    aiGenerated: "AI-generated; researcher review is required.",
    descriptiveOnly: "Review of descriptive aggregate evidence and supplied confirmed inferential audit values only.",
    notStatisticalInference: "AI does not recompute statistical tests and does not replace researcher judgment.",
    privacyLocal: "ENA is computed locally in this browser; raw source rows and raw source data are never sent to the AI provider.",
    privacyExternal: "AI interpretation is optional. Only the reviewed aggregate request is sent to an external AI provider after you consent and press Generate.",
    provider: "Provider",
    model: "Model",
    provenance: "Interpretation provenance",
    generatedAt: "Generated",
    promptVersion: "Prompt version",
    evidenceKey: "Evidence key",
    observedPatterns: "Observed patterns",
    contextualQuestions: "Contextual questions",
    limitations: "Limitations",
  },
  workspace: {
    comparison: "Comparison Plot",
    groupNetworks: "Group networks",
    emptyTitle: "Build the Teaching Sample",
    emptyText: "Load the documented sample or open a coded CSV or XLSX file, map the model, and build the analysis. The comparison, primary, and secondary research frames stay visible while prerequisites are incomplete.",
    ready: "Ready",
    running: "Building with jENA…",
    result: "Current model",
    units: "Units",
    trajectorySteps: "Trajectory steps",
    codes: "Codes",
    groups: "Groups",
    runtime: "Runtime",
    jenaSourceLabel: "source",
    jenaSourceAriaLabel: (version, commit) => `jENA ${version} corresponding source at commit ${commit}; opens in a new tab`,
    methodNote: "Interpret the graph with the source evidence and the recorded unit, conversation, code, window, weighting, normalization, and rotation choices. Visual separation alone is not significance or causality.",
    threeDNote: "Interactive 3D displays the same fitted jENA coordinates as the 2D view. Switching views does not rerun or refit the analysis; rotate, zoom, and interpret the geometry descriptively rather than as inferential evidence.",
    errorTitle: "The model was not built",
    accessibleSummary: "Accessible result summary",
    groupMeans: "Group mean coordinates",
    strongestDifferences: "Strongest network differences",
    strongestConnections: "Strongest network connections",
    strongerGroup: "Stronger group",
    difference: "Absolute difference",
    meanWeight: "Mean weight",
  },
};

const zhHant: OpenEnaCopy = {
  ...en,
  eyebrow: "瀏覽器研究工作區",
  title: "開放 ENA",
  intro: "在同一工作區中使用 jENA 建構、檢視和比較認知網絡模型，並在相連的 2D 與互動式 3D 視圖之間切換。",
  navLabel: "開放 ENA",
  modes: { sets: "分析集", data: "資料", model: "模型", plot: "繪圖工具", stats: "統計與匯出", ai: "AI 解讀" },
  views: { twoD: "2D ENA", threeD: "3D ENA" },
  groupDisplay: {
    title: "已繪製群組與分析單位",
    description: "可見性與群組摘要只影響呈現；已擬合的 jENA 結果與統計維持不變。",
    showAllHiddenLabel: "顯示所有隱藏的分析單位點",
    showAll: (count) => `全部顯示（${count}）`,
    visibleCount: (group, visible, total) => `${group} · 顯示 ${visible}/${total} 個分析單位點`,
    displaySettings: (group) => `${group} 的顯示設定`,
    showUnitPoints: "顯示分析單位點",
    showMean: "顯示平均值",
    showConfidenceIntervals: "顯示信賴區間",
    showOutlierIntervals: "顯示離群範圍",
    includeHiddenPoints: "摘要包含隱藏點",
    settingLabel: (setting, group) => `${group}：${setting}`,
    outlierTwoDBoundary: "離群範圍依照 rENA，在每個顯示軸使用平均值 ± 1.5 × IQR；不會移除資料點。",
    outlierThreeDBoundary: "離群範圍目前只適用於 2D。",
    meanRequiredBoundary: "請啟用「顯示平均值」，以顯示其信賴區間或離群範圍。",
    intervalRequiresTwoUnits: "信賴區間與離群範圍需要顯示摘要母體中至少兩個分析單位。",
    searchUnits: "搜尋分析單位",
    searchUnitsLabel: (group) => `搜尋 ${group} 的分析單位`,
    unitListWindow: (shown, matching, total) => `顯示 ${shown}/${matching} 個相符分析單位（共 ${total} 個）。`,
    unitVisibility: (visible, total) => `分析單位可見性 · ${visible}/${total}`,
    unitAction: (visible, unitId, group) => `${visible ? "隱藏" : "顯示"} ${group} 的分析單位 ${unitId}`,
    hide: "隱藏",
    show: "顯示",
    keepOneVisible: "請保留一個可見分析單位供摘要使用，或先啟用「摘要包含隱藏點」。",
    derivationError: "無法安全建立群組顯示。請恢復隱藏的分析單位，或重新建立目前結果後再繼續。",
    hiddenStatus: (count) => `已隱藏 ${count} 個分析單位點。`,
    shortcut: "管理群組／分析單位可見性及平均值、CI 或離群範圍 →",
  },
  resultTables: resultTablesZhHant,
  ona: {
    ...en.ona,
    family: {
      legend: "分析類型",
      methodBoundaryLabel: "方法邊界",
      selectedLabel: "已選取",
      ena: {
        label: "標準 ENA",
        description: "使用標準 ENA 窗口、模型、旋轉、比較與軌跡的無方向共現網絡。",
        methodBoundary: "使用 p(p−1)/2 個無方向連線，不包括對角自連線。",
      },
      ona: {
        label: "順序網絡分析（ONA）",
        description: "使用明確型別順序與完整 p² 遮罩的有方向來源碼／ground → 回應碼／response 網絡。",
        methodBoundary: "此版本鎖定端點、只向後移動段落窗口、原始乘積總和、SVD，且只提供描述性結果。",
      },
    },
    setupIncomplete: "必須完成明確的 ONA 排序政策，才可執行此順序模型。",
    run: "建立 ONA 模型",
    rerun: "重新建立 ONA 模型",
    workspace: {
      directedSpace: "p² 有方向空間",
      twoD: "2D ONA",
      downloadBundle: "下載 ONA 結果套件",
      staleTitle: "設定已變更",
      staleDescription: "有方向 ONA 視圖仍綁定上一次成功建立的順序模型。請重新建立，以套用待處理的控制項。",
      rebuilding: (progress, stage) => `使用 jENA 重建順序網絡 · ${progress}% · ${stage === "accumulate" ? "累積順序貢獻" : "正規化、旋轉及投影 ONA 模型"}`,
      cancel: "取消",
      statsKicker: "ONA · 描述性",
    },
    plotTools: {
      plotSettings: "繪圖設定",
      closePlotSettings: "關閉繪圖設定",
      close: "關閉",
      scaleEdgeWeights: "縮放邊權重",
      edgeWeights: "邊權重",
      edgeWeightsValue: "邊權重數值",
      resetEdgeWeights: "重設邊權重",
      textSize: "文字大小",
      textSizeControl: "文字大小",
      textSizeValue: "文字大小數值",
      resetTextSize: "重設文字大小",
      codeLabels: "編碼標籤",
      unitCircle: "單位圓",
      axisDirection: "座標軸方向",
      flipXAxis: "翻轉 X 軸",
      flipYAxis: "翻轉 Y 軸",
      networkGraph: "網絡圖",
      minimumEdgeWeight: "最小邊權重",
      plottedPoints: "已繪製點",
      groupLabels: "群組標籤",
      unitPoints: "分析單位點",
      scaleUnitCircles: "縮放分析單位圓",
      unitLabels: "分析單位標籤",
      advanced: "進階",
      plotZoom: "圖形縮放",
      zoomOut: "縮小",
      fit: "適合",
      zoomIn: "放大",
      resetAllPlotTools: "重設所有繪圖工具",
      resetAll: "全部重設",
      on: "開",
      off: "關",
      settingLabel: (label) => `${label}設定`,
      enableLabel: (label) => `啟用${label}`,
      disableLabel: (label) => `停用${label}`,
      timesValue: (value) => `${value} 倍`,
      pixelsValue: (value) => `${value} 像素`,
      minimumEdgeWeightValue: (percent) => `${percent}%（相對於最強邊）`,
      fitPlotValue: (zoom) => `使圖形符合可視範圍；目前縮放 ${zoom} 倍`,
    },
    order: {
      title: "順序與向後窗口",
      description: "宣告每個具型別 horizon 內的資料列順序。缺失值與並列順序會被拒絕，不會猜測。",
      orderPolicyLegend: "資料列順序依據",
      columnsPolicyLabel: "明確順序欄位",
      columnsPolicyDescription: "在每個具型別 horizon 內升冪排序，且每個欄位均須宣告比較器。",
      sourceRowPolicyLabel: "已確認的來源記錄順序",
      sourceRowPolicyDescription: "只有在明確確認匯入記錄順序就是研究順序後，才使用來源記錄順序。",
      orderColumnsLegend: "順序欄位與型別比較器",
      comparatorLabel: "比較器",
      comparatorPlaceholder: "選擇比較器",
      comparatorLabels: { number: "數值", string: "字串（碼位順序）", boolean: "布林值", "iso-datetime": "ISO 日期時間" },
      sourceRowConfirmationLabel: "我確認來源記錄順序就是 horizon 內預期的研究順序。",
      windowTitle: "向後脈絡",
      windowModeLegend: "窗口範圍",
      finiteWindowLabel: "有限段落總列數",
      entireHorizonLabel: "完整具型別 horizon",
      windowSizeLabel: "總列數（包括目前 response 列）",
      invalidWindowSize: "請使用正整數或完整具型別 horizon。",
      lockedTitle: "鎖定的 ONA 執行合約",
      modelLabel: "模型",
      modelValue: "端點",
      windowTypeLabel: "窗口",
      windowTypeValue: "移動段落窗口",
      forwardLabel: "向前資料列",
      forwardValue: "0（只向後）",
      weightLabel: "加權",
      weightValue: "原始乘積總和",
      rotationLabel: "旋轉",
      rotationValue: "SVD 與有方向節點幾何",
      referenceLabel: "參照旋轉",
      referenceValue: "ONA 不適用",
      previewTitle: "規範順序預覽",
      previewReady: "此預覽使用執行分析時的同一個規範排序函數。",
      previewNeedsConfiguration: "完成排序政策後，才可預覽實際 response 順序。",
      previewRejected: "目前資料列不符合此型別順序政策；請處理缺失值、錯誤型別或並列。",
      resolvedPolicyTitle: "已解析執行政策",
      directionLabel: "方向",
      directionAscending: "在每個具型別 horizon 內升冪",
      missingLabel: "缺失值",
      missingReject: "拒絕",
      tiesLabel: "並列順序組",
      tiesReject: "拒絕",
      stableLabel: "穩定對應",
      stableYes: "是；排序後 response 保留來源記錄對應",
      sourceOrderValue: "已確認來源記錄順序；不套用比較器排序。",
      orderedPositionHeader: "排序後 response",
      sourceRecordHeader: "來源記錄",
      horizonOrdinalHeader: "具型別 horizon",
      boundaryHeader: "邊界",
      unitFieldsHeader: "分析單位欄位",
      horizonFieldsHeader: "Horizon 欄位",
      orderFieldsHeader: "順序欄位",
      boundarySingle: "單列 horizon",
      boundaryStart: "開始",
      boundaryWithin: "內部",
      boundaryEnd: "結束",
      emptyFields: "—",
      previousPage: "上一頁",
      nextPage: "下一頁",
      previewRange: "第 {start}–{end} 列，共 {total} 列 · 第 {page}/{pages} 頁",
    },
    mask: {
      triggerLabel: "編輯 p² 方向遮罩",
      dialogTitle: "方向連線遮罩",
      dialogDescription: "每個儲存格獨立啟用一個列來源碼／ground → 欄回應碼／response；包括對角自連線。",
      closeLabel: "關閉方向遮罩編輯器",
      matrixCaption: "ONA p² 方向遮罩：列為來源碼／ground，欄為回應碼／response",
      groundHeader: "來源碼／ground",
      responseHeader: "回應碼／response",
      allLabel: "全部方向",
      noneLabel: "不選方向",
      diagonalLabel: "只選對角",
      offDiagonalLabel: "只選非對角",
      invalidMaskMessage: "遮罩未綁定目前編碼順序；請先協調所選編碼。",
      cellLabel: (ground, response, diagonal) => `${ground} 來源碼／ground 到 ${response} 回應碼／response${diagonal ? "；自連線" : ""}`,
      cellAnnouncement: (ground, response, enabled) => `${ground} 到 ${response} 已${enabled ? "啟用" : "停用"}。`,
      bulkAnnouncement: (preset, enabled, total) => `已套用 ${preset} 預設；啟用 ${enabled}/${total} 個方向。`,
    },
    layout: {
      overallPlot: "整體 ONA",
      overallSubtitle: "所有分析單位 · 描述性順序網絡",
      primaryPlot: "主要群組",
      secondaryPlot: "次要群組",
      groupMeanSubtitle: "描述性群組平均 · 不相減",
      dataView: "順序資料檢視",
      dataViewSubtitle: "由執行階段審計的來源碼／ground → 回應碼／response 貢獻",
      unavailableGroupPlot: "此模型沒有第二個可用的描述性群組網絡。",
      descriptiveBoundary: "此版本的 ONA 只作描述；這些面板不計算群組差異、p 值、效應量、信賴區間或因果效應。",
      directionGuide: "三角形頂點為來源碼／ground、底邊為回應碼／response；箭角標示互惠方向中較強者，內圓盤標示自連線。",
      rightToolsLabel: "順序網絡繪圖工具",
    },
    plot: {
      overallTitle: "整體順序網絡",
      groupTitle: "順序群組平均網絡",
      directedNetworkDescription: "有方向 ONA 網絡；三角形頂點為來源碼／ground，底邊為回應碼／response。",
      normalizedMeanWeight: "分析單位等權正規化平均權重",
      rawAggregateCount: "原始彙總計數",
      respondedToWith: "以 {response} 回應 {ground}",
      selfConnection: "自連線",
      visibleConnections: "可見有方向連線",
      noVisibleConnections: "沒有已啟用的有方向連線通過目前顯示門檻。",
      sourceApexLegend: "三角形頂點＝來源碼／ground；底邊＝回應碼／response",
      chevronLegend: "箭角＝互惠方向中較強者；完全相同時兩個方向皆標示",
      selfDiscLegend: "內圓盤＝對角自連線",
      nodeSizeLabel: "節點大小",
      unitsLabel: "分析單位",
      groundSourceLabel: "來源碼／ground",
      responseTargetLabel: "回應碼／response",
      directionLegendLabel: "順序網絡方向圖例",
      flippedLabel: "已翻轉",
      visibleCellsLabel: "個可見有方向儲存格",
    },
    dataView: {
      ariaLabel: "順序資料檢視中央區域",
      title: "順序資料檢視",
      returnLabel: "返回整體 ONA",
      returnAriaLabel: "返回整體有方向 ONA 圖",
      contextLabel: "顯示以下範圍的審計 response",
      overall: "整體",
      primary: "主要群組",
      secondary: "次要群組",
      record: "筆審計 response",
      records: "筆審計 response",
      exportLabel: "匯出本機資料檢視 CSV ↓",
      exportAriaLabel: "匯出含本機識別資料的 ONA 資料檢視 CSV",
      tableAriaLabel: "經審計的 ONA response 貢獻",
      previousPage: "上一頁",
      nextPage: "下一頁",
      rowsShown: "第 {start}–{end} 列，共 {total} 列 · 第 {page}/{pages} 頁",
      columnsShown: "第 {start}–{end} 個可變欄，共 {total} 欄 · 第 {page}/{pages} 頁",
      rowPaginationLabel: "資料檢視列分頁",
      columnPaginationLabel: "資料檢視可變欄分頁",
      provenanceGroup: "順序來源追蹤",
      metadataGroup: "本機詮釋資料連接",
      codeGroup: "編碼",
      directedEdgeGroup: "有方向 p² 貢獻",
      provenanceLabels: {
        orderedResponsePosition: "排序後 response 位置",
        sourceRecordNumber: "來源記錄號（本機）",
        opaqueHorizonOrdinal: "不透明 horizon 序號",
        priorRowCount: "向後窗口中的先前列數",
        predecessorResponsePositions: "先前 response 位置",
      },
      yes: "是",
      no: "否",
      empty: "此範圍沒有符合的 ONA 審計 response 列。",
      missingDatasetBinding: "ONA 資料檢視需要已分析資料集的 SHA-256 綁定。",
      localIdentityWarning: "此本機檢視會把去識別的順序貢獻連接至來源記錄號，以及所選分析單位、horizon、群組與順序詮釋資料；內容可能識別參與者。",
      exportConfirmation: "此 CSV 含本機識別詮釋資料與來源記錄對應。請確認您會在分享前審閱並去識別。",
    },
    stats: {
      title: "ONA 描述統計",
      descriptiveBoundary: "只作描述；不計算群組相減、推論比較、p 值、效應量、信賴區間或因果主張。",
      overallScopeLabel: "整體順序網絡",
      groupScopeLabel: "{group} 順序平均網絡",
      modelCoverage: "ONA 模型涵蓋範圍",
      analyticUnits: "個分析單位",
      orderedRows: "列排序後 response（完整結果）",
      opaqueHorizons: "個不透明 horizon（完整結果）",
      codes: "個編碼",
      directedCells: "個有方向儲存格",
      enabled: "已啟用",
      masked: "已遮罩",
      zeroNetworks: "零網絡",
      rawMass: "原始有方向質量",
      total: "總計",
      selfConnections: "自連線",
      offDiagonal: "非對角",
      incomingRawMass: "依回應碼／response-target 的流入原始質量",
      outgoingRawMass: "依來源碼／ground-source 的流出原始質量",
      topDirectedCells: "最高有方向儲存格",
      pairAsymmetry: "互惠配對不對稱",
      groupUnitCounts: "群組分析單位數",
      varianceDiagnostics: "模型變異診斷",
      noPositiveCells: "沒有已啟用的有方向儲存格具有正值完整證據。",
      normalizedMean: "分析單位等權正規化平均",
      raw: "原始",
      nonzeroUnits: "個非零單位",
      absoluteNormalizedAsymmetry: "絕對正規化不對稱",
      tie: "相同",
    },
    exports: {
      title: "ONA 研究匯出",
      description: "可選擇只含彙總的連線表或去識別順序審計；兩者都不包含本機來源列對應。",
      scopeLabel: "描述範圍",
      aggregateLabel: "匯出彙總有方向連線 CSV",
      aggregateDescription: "只含彙總的 p² 儲存格：範圍、方向、遮罩、原始總量、分析單位等權正規化平均與非零單位數。",
      auditLabel: "匯出去識別順序審計 CSV",
      auditDescription: "只含不透明 response/horizon 序號與執行階段審計的 p² 貢獻；不含分析單位、來源列或詮釋資料識別。",
      auditWarning: "去識別不等於匿名。順序 response 模式與外部資訊結合後仍可能有重新識別風險；只應在適當研究治理下分享。",
      auditConfirmation: "此審計已去識別但並非匿名，仍可能有重新識別風險。請確認分享受適當研究治理規範。",
      bundleConfirmation: "完整 ONA 模型 bundle 不含原始來源列，但保留分析單位標籤與群組名稱。請確認匯出前已審閱或假名化這些識別資料。",
    },
    unavailable: {
      sets: "ONA 尚未驗證分析集與共享參照幾何。",
      reference: "ONA 不支援參照旋轉。",
      groupContrast: "ONA 群組面板只顯示描述性平均，不提供成對相減。",
      trajectory: "ONA 尚未驗證軌跡模型。",
      threeD: "此版本尚未驗證 3D ONA；請使用有方向 2D 視圖。",
      inference: "ONA 尚未驗證推論檢定；只顯示描述性診斷。",
      ai: "在只含彙總的順序證據合約通過獨立驗證前，ONA 不提供 AI 解讀。",
    },
    presenter: {
      title: "調整有方向 ONA 視圖",
      description: "這些控制只改變有方向 2D 呈現，不會重新建立順序模型。",
      directionBoundary: "顯示門檻不會改變已擬合 p² 矩陣或已設定方向遮罩。",
      groupPanelsTitle: "描述性群組面板",
      groupPanelsDescription: "可從已完成結果選擇任意兩個群組，分別顯示平均網絡；此選擇不會計算相減、對比或推論。",
    },
  },
  sets: { ...en.sets, title: "分析集", description: "將端點模型保留在瀏覽器記憶體中，並比較共享同一參照幾何的擬合或投影網絡。", capture: "擷取目前模型", captureHint: "只擷取衍生座標與等權單位網絡平均值，不保留原始來源資料列；分析單位識別碼仍會保留，必要時請先假名化。", emptyTitle: "尚未擷取分析集", emptyText: "先建立端點模型，再在這裡擷取。擬合模型會安裝其可重用參照，使之後的 CSV 或 XLSX 檔案可投影到完全相同的 ENA 空間。", fitted: "擬合", projected: "投影", generatedReference: "可重用擬合參照", projectionReference: "已投影至參照", sourceHash: "分析資料表 SHA-256", hashScope: "雜湊範圍", primary: "主要分析集", secondary: "次要分析集", choosePrimary: "選擇主要分析集", chooseSecondary: "選擇相容的次要分析集", comparisonHint: "帶符號連線差異為共享固定幾何中的「主要減次要」。JSON 會保留分析單位識別碼；需要分享時請先假名化。", noCompatibleSecondary: "沒有可用的相容次要分析集。請在同一參照幾何中擷取或投影另一個端點模型。", remove: "移除", exportJson: "匯出比較 JSON", exportEdges: "匯出連線差異 CSV" },
  data: { ...en.data, title: "從編碼資料開始", description: "在此瀏覽器開啟 CSV 或 XLSX 檔案，或載入已記錄的學院範例以查看完整流程。", upload: "開啟 CSV 或 XLSX", uploadHint: "CSV 或 XLSX，最多 5 MB、20,000 列；XLSX 使用第一個工作表", sample: "載入教學範例", trajectorySample: "載入 2D 軌跡範例", trajectorySampleHint: "54 筆合成資料 · 6 位學習者 · TP1–TP3 · 6 個編碼", noFile: "尚未載入資料", active: "使用中的資料集", rows: "資料列", columns: "欄位", source: "來源", local: "核心 ENA 運算保留在此瀏覽器；原始來源資料列不會傳送至可選的 AI 解讀服務。" },
  model: { ...en.model, title: "定義 ENA 模型", description: "對應賦予網絡分析意義的欄位，然後執行已驗證的 jENA 流程。", sequenceNote: "CSV 或 XLSX 資料列順序定義每段對話中的序列；若順序重要，請在分析前先排序來源檔案。", unit: "分析單位", conversation: "對話", group: "比較群組", identityHint: "可選一個或多個欄位；順序會定義複合識別。", noGroup: "不設比較群組（全部分析單位）", codes: "編碼", window: "窗口", movingWindow: "移動段落窗口", conversationWindow: "完整對話", back: "向後跨度（包括目前列）", forward: "向前資料列", configureTrajectory: "設定軌跡模型", modelType: "模型類型", endpoint: "端點（每個分析單位一個網絡）", separateTrajectory: "分離軌跡（每一步一個點）", accumulatedTrajectory: "累積軌跡（每一步為累積網絡）", trajectoryHint: "軌跡步驟依每個分析單位首次出現的對話順序排列；統計面板不會將重複步驟視為獨立分析單位。", rotation: "旋轉", svd: "SVD（資料變異）", means: "廣義均值旋轉（GMR）", center: "將零網絡分析單位置於原點", weighting: "加權", binary: "二元", run: "建立 ENA 模型", rerun: "重新建立模型", valid: "模型輸入有效" },
  plot: { ...en.plot, title: "調整研究視圖", description: "這些控制只改變呈現方式，不會在未提示下重新建立模型。", showPoints: "分析單位點", showNetworks: "群組網絡", showLabels: "編碼標籤", showTrajectories: "軌跡路徑", edgeScale: "連線寬度", axisX: "X 軸", axisY: "Y 軸", axisZ: "Z 軸", camera: "相機", cameraPosition: "相機位置", default3dCamera: "預設 3D 相機", isometric: "等距", xy: "X-Y 平面", xz: "X-Z 平面", yz: "Y-Z 平面", yx: "Y-X 平面", zx: "Z-X 平面", zy: "Z-Y 平面", reset: "重設視圖", threeDInteractionHint: "拖曳以旋轉；滾動或使用五個繪圖操作來放大、縮小、回正、複製圖片或進入全螢幕。此幾何只作描述，不屬推論證據。", sameFittedSpace: "沿用同一個已擬合 jENA 空間；切換 2D 與 3D 不會重新執行或重新擬合分析。", threeDExportHint: "使用 3D 繪圖工具列的複製圖片按鈕，把 PNG 放到剪貼簿。SVG 與高解析度 PNG 研究圖匯出只適用於 2D 視圖。", threeDUnavailable: "互動式 3D 暫時無法使用。已擬合結果仍保持完整；請切回 2D 或重新載入此視圖。", threeDRequiresThreeDimensions: "3D ENA 需要已完成結果具有三個不同維度；2D 結果仍可使用。" },
  contrast: { ...en.contrast, title: "端點群組對比", description: "依序選擇主要與次要群組。中央圖以同一比例尺疊加兩個平均網絡；帶符號的「主要減次要」差異保留在證據表與匯出中。", primary: "主要群組", secondary: "次要群組", swap: "交換主要與次要群組", selectedOrder: "所選群組順序", selectedAxes: "所選座標軸", multiplicity: "此網絡對比只作描述；已確認的統計推論工作流程會在明確執行後套用固定 Holm 檢定族。", exportJson: "匯出群組對比 JSON", exportEdges: "匯出群組對比連線 CSV", requiresGroup: "無法使用群組對比：端點模型需要群組變項。", requiresTwoGroups: "無法使用群組對比：端點模型需要至少兩個不同群組。", endpointOnly: "無法使用群組對比：此功能只適用於端點模型。" },
  longitudinal: { ...en.longitudinal, title: "縱向群組質心路徑", description: "依明確期間順序，在固定 jENA 空間中衍生等權實體群組質心。這些呈現設定不會重建 jENA 或改變投影座標。", repeatedEntity: "重複測量實體", timeOrder: "時間／順序欄位", observedOrder: "明確時間順序（依來源資料首次出現）", moveEarlier: "將期間向前移", moveLater: "將期間向後移", cohortPolicy: "隊列政策", available: "可用隊列", complete: "完整隊列", availableHint: "可用隊列使用各期間實際出現的重複實體。", completeHint: "完整隊列只保留每個排序期間均有資料的重複實體。", showIndividualPaths: "個別軌跡路徑", showGroupPaths: "群組質心路徑", descriptive: "描述性縱向幾何", noEndpointTests: "重複軌跡期間不套用端點 Mann–Whitney 或 Welch 檢定。", exportJson: "匯出縱向 JSON", exportCsv: "匯出縱向期間 CSV", exportInferenceCsv: "匯出推論比較 CSV", allUnits: "未設定比較群組：顯示一條「全部單位」總體質心路徑。", period: "期間", group: "群組", availableCount: "可用", completeCount: "完整", includedCount: "納入", excludedCount: "缺失／排除", unavailableModel: "縱向群組質心分析需要成功的分離或累積軌跡結果。", unavailableEntity: "縱向分析需要來自擬合單位對應的重複實體欄位。", unavailableTime: "縱向分析需要來自擬合對話對應的時間／順序欄位。", unavailablePeriods: "縱向分析至少需要兩個排序期間。", unavailableComplete: "完整隊列中沒有在每個所選期間均有資料的合資格重複實體。", figureAriaLabel: "群組質心軌跡圖；小螢幕可水平捲動。", geometryView: "軌跡幾何視圖", diagnosticsCaption: "群組與期間質心診斷", nUsed: "使用數", nExcluded: "排除數", centroid: "質心", status: "狀態", gap: "缺口", observed: "已觀察", gapRule: "缺失期間之間不連線。", noConnectedPaths: "無法繪製相連軌跡：所選相鄰期間沒有重複實體。請檢查重複實體與時間點對應。", legendAriaLabel: "縱向軌跡圖例", largerCentroidMarker: "較大輪廓方形＝群組期間質心", timeDirectionArrow: "箭頭＝觀察時間方向", flipped: "已翻轉", firstAxis: "維度 1", secondAxis: "維度 2", circle: "圓形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六邊形", solid: "實線", dashed: "虛線", dotted: "點線", dashDot: "點劃線", shortDashed: "短虛線", longShortDashed: "長短虛線", marker: "標記", path: "路徑", rowsTruncated: "畫面省略了其餘期間列；請使用縱向匯出取得完整診斷。", individualMarksSampled: "個別圖形標記已抽樣：顯示 {pointsShown}/{pointsTotal} 個點、{segmentsShown}/{segmentsTotal} 個整體實體路徑轉換，以及 {arrowsShown}/{arrowsTotal} 個方向箭頭。群組質心路徑保持完整。" },
  stats: { ...en.stats, title: "證據與可重現性", description: "將描述性摘要與模型規格一併閱讀；發表層級的推論需要有理據的檢定與研究設計。", variance: "解釋變異", groupSummary: "群組摘要", effect: "絕對 Cohen’s d", verifiedTests: "jENA 檢定統計量", correlations: "維度相關", notTest: "jENA 報告檢定統計量與自由度，但不計算 p 值；請依研究設計選擇及報告推論檢定。", manifest: "分析清單", export: "匯出清單", exportBundle: "匯出結果套件", trajectoryNotice: "端點群組檢定與點—質心相關不適用於重複軌跡步驟。請以描述方式解讀軌跡幾何，或在工作區外使用符合研究設計的縱向方法。", ui: statsUiZhHant },
  aiInterpretation: {
    ...en.aiInterpretation,
    title: "AI 輔助解讀",
    description: "解讀「統計與匯出」目前產生並已確認的結果。AI 只審閱此瀏覽器已計算的精確彙總證據與推論；不會重新計算檢定，也不能取代研究者判斷。",
    statsSourceLabel: "統計結果來源",
    statsReady: "目前已確認的統計結果可供 AI 審閱。",
    statsRequired: "請先在「統計與匯出」執行並確認推論，再交由 AI 解讀。",
    openStats: "開啟統計與匯出",
    previewTitle: "審閱彙總請求",
    previewHint: "決定是否傳送前，請檢查完整且具版本的 JSON。",
    consentLabel: "我已審閱此彙總請求，並同意將它傳送給外部 AI 供應商。",
    generate: "生成 AI 解讀",
    generating: "正在生成解讀…",
    cancel: "取消",
    retry: "重試",
    errorTitle: "未能生成 AI 解讀",
    noCurrentResult: "請先在「統計與匯出」執行並確認目前的結果，再請求 AI 解讀。",
    staleResult: "請重新建立 ENA 模型，確保解讀符合目前設定。",
    aggregatePrivacyGate: "AI 審閱需要目前已確認的推論。低於三個實體披露門檻的推論儲存格會連同明確界線一併省略，合資格的描述性證據仍會保留。",
    aiGenerated: "由 AI 生成；必須由研究者審閱。",
    descriptiveOnly: "只審閱描述性彙總證據及所提供、已確認的推論審計值。",
    notStatisticalInference: "AI 不會重新計算統計檢定，也不能取代研究者判斷。",
    privacyLocal: "ENA 在此瀏覽器中運算；原始來源資料列不會傳送給 AI 供應商。",
    privacyExternal: "AI 解讀是可選功能。只有經審閱的彙總請求，才會在您同意並按下生成後傳送給外部 AI 供應商。",
    provider: "供應商",
    model: "模型",
    provenance: "解讀來源記錄",
    generatedAt: "生成時間",
    promptVersion: "提示版本",
    evidenceKey: "證據鍵",
    observedPatterns: "觀察到的模式",
    contextualQuestions: "情境問題",
    limitations: "限制",
  },
  workspace: { ...en.workspace, jenaSourceLabel: "原始碼", jenaSourceAriaLabel: (version, commit) => `jENA ${version} 對應原始碼，提交 ${commit}；在新分頁開啟`, comparison: "比較圖", groupNetworks: "群組網絡", emptyTitle: "建立教學範例", emptyText: "載入已記錄的範例或開啟編碼 CSV 或 XLSX 檔案，對應模型並建立分析。必要條件尚未完成時，比較圖、主要圖和次要圖框架仍會保持可見。", ready: "就緒", running: "正在以 jENA 建立…", result: "目前模型", units: "分析單位", trajectorySteps: "軌跡步驟", codes: "編碼", groups: "群組", runtime: "運行環境", methodNote: "請結合來源證據及已記錄的分析單位、對話、編碼、窗口、加權、標準化和旋轉選擇來解讀圖形。視覺分離本身並不代表顯著性或因果關係。", threeDNote: "互動式 3D 顯示與 2D 視圖相同的已擬合 jENA 座標。切換視圖不會重新執行或重新擬合分析；旋轉與縮放後仍應把幾何作描述性解讀，而非視為推論證據。", errorTitle: "未能建立模型", accessibleSummary: "無障礙結果摘要", groupMeans: "群組平均座標", strongestDifferences: "最強網絡差異", strongestConnections: "最強網絡連結", strongerGroup: "較強群組", difference: "絕對差異", meanWeight: "平均權重" },
};

const zhHans: OpenEnaCopy = {
  ...zhHant,
  eyebrow: "浏览器研究工作区",
  title: "开放 ENA",
  intro: "在同一工作区中使用 jENA 构建、查看和比较认知网络模型，并在相连的 2D 与交互式 3D 视图之间切换。",
  navLabel: "开放 ENA",
  modes: { sets: "分析集", data: "数据", model: "模型", plot: "绘图工具", stats: "统计与导出", ai: "AI 解读" },
  views: { twoD: "2D ENA", threeD: "3D ENA" },
  groupDisplay: {
    title: "已绘制组与分析单位",
    description: "可见性和组摘要只影响呈现；已拟合的 jENA 结果与统计保持不变。",
    showAllHiddenLabel: "显示所有隐藏的分析单位点",
    showAll: (count) => `全部显示（${count}）`,
    visibleCount: (group, visible, total) => `${group} · 显示 ${visible}/${total} 个分析单位点`,
    displaySettings: (group) => `${group} 的显示设置`,
    showUnitPoints: "显示分析单位点",
    showMean: "显示均值",
    showConfidenceIntervals: "显示置信区间",
    showOutlierIntervals: "显示离群范围",
    includeHiddenPoints: "摘要包含隐藏点",
    settingLabel: (setting, group) => `${group}：${setting}`,
    outlierTwoDBoundary: "离群范围遵循 rENA，在每个显示轴使用均值 ± 1.5 × IQR；不会删除数据点。",
    outlierThreeDBoundary: "离群范围目前仅适用于 2D。",
    meanRequiredBoundary: "请启用“显示均值”，以显示其置信区间或离群范围。",
    intervalRequiresTwoUnits: "置信区间和离群范围需要显示摘要总体中至少两个分析单位。",
    searchUnits: "搜索分析单位",
    searchUnitsLabel: (group) => `搜索 ${group} 的分析单位`,
    unitListWindow: (shown, matching, total) => `显示 ${shown}/${matching} 个匹配分析单位（共 ${total} 个）。`,
    unitVisibility: (visible, total) => `分析单位可见性 · ${visible}/${total}`,
    unitAction: (visible, unitId, group) => `${visible ? "隐藏" : "显示"} ${group} 的分析单位 ${unitId}`,
    hide: "隐藏",
    show: "显示",
    keepOneVisible: "请保留一个可见分析单位用于摘要，或先启用“摘要包含隐藏点”。",
    derivationError: "无法安全生成组显示。请恢复隐藏的分析单位，或重新生成当前结果后再继续。",
    hiddenStatus: (count) => `已隐藏 ${count} 个分析单位点。`,
    shortcut: "管理组／分析单位可见性及均值、CI 或离群范围 →",
  },
  resultTables: resultTablesZhHans,
  ona: {
    ...zhHant.ona,
    family: {
      legend: "分析类型",
      methodBoundaryLabel: "方法边界",
      selectedLabel: "已选择",
      ena: {
        label: "标准 ENA",
        description: "使用标准 ENA 窗口、模型、旋转、比较与轨迹的无向共现网络。",
        methodBoundary: "使用 p(p−1)/2 个无向连线，不包括对角自连线。",
      },
      ona: {
        label: "顺序网络分析（ONA）",
        description: "使用明确类型顺序和完整 p² 遮罩的有向源码／ground → 响应码／response 网络。",
        methodBoundary: "此版本锁定端点、仅向后移动段落窗口、原始乘积总和、SVD，并只提供描述性结果。",
      },
    },
    setupIncomplete: "必须完成明确的 ONA 排序策略，才能运行此顺序模型。",
    run: "构建 ONA 模型",
    rerun: "重新构建 ONA 模型",
    workspace: {
      directedSpace: "p² 有向空间",
      twoD: "2D ONA",
      downloadBundle: "下载 ONA 结果包",
      staleTitle: "配置已更改",
      staleDescription: "有向 ONA 视图仍绑定上一次成功构建的顺序模型。请重新构建，以应用待处理的控件。",
      rebuilding: (progress, stage) => `使用 jENA 重建顺序网络 · ${progress}% · ${stage === "accumulate" ? "累积顺序贡献" : "归一化、旋转并投影 ONA 模型"}`,
      cancel: "取消",
      statsKicker: "ONA · 描述性",
    },
    plotTools: {
      plotSettings: "绘图设置",
      closePlotSettings: "关闭绘图设置",
      close: "关闭",
      scaleEdgeWeights: "缩放边权重",
      edgeWeights: "边权重",
      edgeWeightsValue: "边权重数值",
      resetEdgeWeights: "重置边权重",
      textSize: "文本大小",
      textSizeControl: "文本大小",
      textSizeValue: "文本大小数值",
      resetTextSize: "重置文本大小",
      codeLabels: "编码标签",
      unitCircle: "单位圆",
      axisDirection: "坐标轴方向",
      flipXAxis: "翻转 X 轴",
      flipYAxis: "翻转 Y 轴",
      networkGraph: "网络图",
      minimumEdgeWeight: "最小边权重",
      plottedPoints: "已绘制点",
      groupLabels: "组标签",
      unitPoints: "分析单位点",
      scaleUnitCircles: "缩放分析单位圆",
      unitLabels: "分析单位标签",
      advanced: "高级",
      plotZoom: "图形缩放",
      zoomOut: "缩小",
      fit: "适合",
      zoomIn: "放大",
      resetAllPlotTools: "重置所有绘图工具",
      resetAll: "全部重置",
      on: "开",
      off: "关",
      settingLabel: (label) => `${label}设置`,
      enableLabel: (label) => `启用${label}`,
      disableLabel: (label) => `停用${label}`,
      timesValue: (value) => `${value} 倍`,
      pixelsValue: (value) => `${value} 像素`,
      minimumEdgeWeightValue: (percent) => `${percent}%（相对于最强边）`,
      fitPlotValue: (zoom) => `使图形适合可视范围；当前缩放 ${zoom} 倍`,
    },
    order: {
      title: "顺序与向后窗口",
      description: "声明每个有类型 horizon 内的数据行顺序。缺失值和并列顺序会被拒绝，不会猜测。",
      orderPolicyLegend: "数据行顺序依据",
      columnsPolicyLabel: "明确顺序字段",
      columnsPolicyDescription: "在每个有类型 horizon 内升序排列，且每个字段都必须声明比较器。",
      sourceRowPolicyLabel: "已确认的来源记录顺序",
      sourceRowPolicyDescription: "只有在明确确认导入记录顺序就是研究顺序后，才使用来源记录顺序。",
      orderColumnsLegend: "顺序字段与类型比较器",
      comparatorLabel: "比较器",
      comparatorPlaceholder: "选择比较器",
      comparatorLabels: { number: "数值", string: "字符串（码位顺序）", boolean: "布尔值", "iso-datetime": "ISO 日期时间" },
      sourceRowConfirmationLabel: "我确认来源记录顺序就是 horizon 内预期的研究顺序。",
      windowTitle: "向后语境",
      windowModeLegend: "窗口范围",
      finiteWindowLabel: "有限段落总行数",
      entireHorizonLabel: "完整有类型 horizon",
      windowSizeLabel: "总行数（包括当前 response 行）",
      invalidWindowSize: "请使用正整数或完整有类型 horizon。",
      lockedTitle: "锁定的 ONA 执行契约",
      modelLabel: "模型",
      modelValue: "端点",
      windowTypeLabel: "窗口",
      windowTypeValue: "移动段落窗口",
      forwardLabel: "向前数据行",
      forwardValue: "0（仅向后）",
      weightLabel: "加权",
      weightValue: "原始乘积总和",
      rotationLabel: "旋转",
      rotationValue: "SVD 与有向节点几何",
      referenceLabel: "参考旋转",
      referenceValue: "ONA 不适用",
      previewTitle: "规范顺序预览",
      previewReady: "此预览使用运行分析时的同一个规范排序函数。",
      previewNeedsConfiguration: "完成排序策略后，才能预览实际 response 顺序。",
      previewRejected: "当前数据行不符合此类型顺序策略；请处理缺失值、错误类型或并列。",
      resolvedPolicyTitle: "已解析执行策略",
      directionLabel: "方向",
      directionAscending: "在每个有类型 horizon 内升序",
      missingLabel: "缺失值",
      missingReject: "拒绝",
      tiesLabel: "并列顺序组",
      tiesReject: "拒绝",
      stableLabel: "稳定映射",
      stableYes: "是；排序后 response 保留来源记录映射",
      sourceOrderValue: "已确认来源记录顺序；不应用比较器排序。",
      orderedPositionHeader: "排序后 response",
      sourceRecordHeader: "来源记录",
      horizonOrdinalHeader: "有类型 horizon",
      boundaryHeader: "边界",
      unitFieldsHeader: "分析单位字段",
      horizonFieldsHeader: "Horizon 字段",
      orderFieldsHeader: "顺序字段",
      boundarySingle: "单行 horizon",
      boundaryStart: "开始",
      boundaryWithin: "内部",
      boundaryEnd: "结束",
      emptyFields: "—",
      previousPage: "上一页",
      nextPage: "下一页",
      previewRange: "第 {start}–{end} 行，共 {total} 行 · 第 {page}/{pages} 页",
    },
    mask: {
      triggerLabel: "编辑 p² 方向遮罩",
      dialogTitle: "方向连线遮罩",
      dialogDescription: "每个单元格独立启用一个行源码／ground → 列响应码／response；包括对角自连线。",
      closeLabel: "关闭方向遮罩编辑器",
      matrixCaption: "ONA p² 方向遮罩：行为源码／ground，列为响应码／response",
      groundHeader: "源码／ground",
      responseHeader: "响应码／response",
      allLabel: "全部方向",
      noneLabel: "不选方向",
      diagonalLabel: "仅选对角",
      offDiagonalLabel: "仅选非对角",
      invalidMaskMessage: "遮罩未绑定当前编码顺序；请先协调所选编码。",
      cellLabel: (ground, response, diagonal) => `${ground} 源码／ground 到 ${response} 响应码／response${diagonal ? "；自连线" : ""}`,
      cellAnnouncement: (ground, response, enabled) => `${ground} 到 ${response} 已${enabled ? "启用" : "停用"}。`,
      bulkAnnouncement: (preset, enabled, total) => `已应用 ${preset} 预设；启用 ${enabled}/${total} 个方向。`,
    },
    layout: {
      overallPlot: "整体 ONA",
      overallSubtitle: "所有分析单位 · 描述性顺序网络",
      primaryPlot: "主要组",
      secondaryPlot: "次要组",
      groupMeanSubtitle: "描述性组均值 · 不相减",
      dataView: "顺序数据视图",
      dataViewSubtitle: "由运行时审计的源码／ground → 响应码／response 贡献",
      unavailableGroupPlot: "此模型没有第二个可用的描述性组网络。",
      descriptiveBoundary: "此版本的 ONA 仅作描述；这些面板不计算组差异、p 值、效应量、置信区间或因果效应。",
      directionGuide: "三角形顶点为源码／ground、底边为响应码／response；箭角标示互惠方向中较强者，内圆盘标示自连线。",
      rightToolsLabel: "顺序网络绘图工具",
    },
    plot: {
      overallTitle: "整体顺序网络",
      groupTitle: "顺序组均值网络",
      directedNetworkDescription: "有向 ONA 网络；三角形顶点为源码／ground，底边为响应码／response。",
      normalizedMeanWeight: "分析单位等权归一化平均权重",
      rawAggregateCount: "原始汇总计数",
      respondedToWith: "以 {response} 响应 {ground}",
      selfConnection: "自连线",
      visibleConnections: "可见有向连线",
      noVisibleConnections: "没有已启用的有向连线通过当前显示阈值。",
      sourceApexLegend: "三角形顶点＝源码／ground；底边＝响应码／response",
      chevronLegend: "箭角＝互惠方向中较强者；完全相同时两个方向都标示",
      selfDiscLegend: "内圆盘＝对角自连线",
      nodeSizeLabel: "节点大小",
      unitsLabel: "分析单位",
      groundSourceLabel: "源码／ground",
      responseTargetLabel: "响应码／response",
      directionLegendLabel: "顺序网络方向图例",
      flippedLabel: "已翻转",
      visibleCellsLabel: "个可见有向单元格",
    },
    dataView: {
      ariaLabel: "顺序数据视图中央区域",
      title: "顺序数据视图",
      returnLabel: "返回整体 ONA",
      returnAriaLabel: "返回整体有向 ONA 图",
      contextLabel: "显示以下范围的审计 response",
      overall: "整体",
      primary: "主要组",
      secondary: "次要组",
      record: "条审计 response",
      records: "条审计 response",
      exportLabel: "导出本地数据视图 CSV ↓",
      exportAriaLabel: "导出含本地标识数据的 ONA 数据视图 CSV",
      tableAriaLabel: "经审计的 ONA response 贡献",
      previousPage: "上一页",
      nextPage: "下一页",
      rowsShown: "第 {start}–{end} 行，共 {total} 行 · 第 {page}/{pages} 页",
      columnsShown: "第 {start}–{end} 个可变列，共 {total} 列 · 第 {page}/{pages} 页",
      rowPaginationLabel: "数据视图行分页",
      columnPaginationLabel: "数据视图可变列分页",
      provenanceGroup: "顺序来源追踪",
      metadataGroup: "本地元数据连接",
      codeGroup: "编码",
      directedEdgeGroup: "有向 p² 贡献",
      provenanceLabels: {
        orderedResponsePosition: "排序后 response 位置",
        sourceRecordNumber: "来源记录号（本地）",
        opaqueHorizonOrdinal: "不透明 horizon 序号",
        priorRowCount: "向后窗口中的先前行数",
        predecessorResponsePositions: "先前 response 位置",
      },
      yes: "是",
      no: "否",
      empty: "此范围没有匹配的 ONA 审计 response 行。",
      missingDatasetBinding: "ONA 数据视图需要已分析数据集的 SHA-256 绑定。",
      localIdentityWarning: "此本地视图会把去标识的顺序贡献连接到来源记录号，以及所选分析单位、horizon、组和顺序元数据；内容可能识别参与者。",
      exportConfirmation: "此 CSV 含本地标识元数据与来源记录映射。请确认您会在分享前审阅并去标识。",
    },
    stats: {
      title: "ONA 描述统计",
      descriptiveBoundary: "仅作描述；不计算组相减、推断比较、p 值、效应量、置信区间或因果主张。",
      overallScopeLabel: "整体顺序网络",
      groupScopeLabel: "{group} 顺序均值网络",
      modelCoverage: "ONA 模型覆盖范围",
      analyticUnits: "个分析单位",
      orderedRows: "行排序后 response（完整结果）",
      opaqueHorizons: "个不透明 horizon（完整结果）",
      codes: "个编码",
      directedCells: "个有向单元格",
      enabled: "已启用",
      masked: "已遮罩",
      zeroNetworks: "零网络",
      rawMass: "原始有向质量",
      total: "总计",
      selfConnections: "自连线",
      offDiagonal: "非对角",
      incomingRawMass: "按响应码／response-target 的流入原始质量",
      outgoingRawMass: "按源码／ground-source 的流出原始质量",
      topDirectedCells: "最高有向单元格",
      pairAsymmetry: "互惠配对不对称",
      groupUnitCounts: "组分析单位数",
      varianceDiagnostics: "模型方差诊断",
      noPositiveCells: "没有已启用的有向单元格具有正值完整证据。",
      normalizedMean: "分析单位等权归一化均值",
      raw: "原始",
      nonzeroUnits: "个非零单位",
      absoluteNormalizedAsymmetry: "绝对归一化不对称",
      tie: "相同",
    },
    exports: {
      title: "ONA 研究导出",
      description: "可选择仅含汇总的连线表或去标识顺序审计；两者都不包含本地来源行映射。",
      scopeLabel: "描述范围",
      aggregateLabel: "导出汇总有向连线 CSV",
      aggregateDescription: "仅含汇总的 p² 单元格：范围、方向、遮罩、原始总量、分析单位等权归一化均值与非零单位数。",
      auditLabel: "导出去标识顺序审计 CSV",
      auditDescription: "仅含不透明 response/horizon 序号与运行时审计的 p² 贡献；不含分析单位、来源行或元数据标识。",
      auditWarning: "去标识不等于匿名。顺序 response 模式与外部信息结合后仍可能有重新标识风险；仅应在适当研究治理下分享。",
      auditConfirmation: "此审计已去标识但并非匿名，仍可能有重新标识风险。请确认分享受适当研究治理规范。",
      bundleConfirmation: "完整 ONA 模型 bundle 不含原始来源行，但保留分析单位标签与组名称。请确认导出前已审阅或假名化这些标识数据。",
    },
    unavailable: {
      sets: "ONA 尚未验证分析集与共享参考几何。",
      reference: "ONA 不支持参考旋转。",
      groupContrast: "ONA 组面板只显示描述性均值，不提供成对相减。",
      trajectory: "ONA 尚未验证轨迹模型。",
      threeD: "此版本尚未验证 3D ONA；请使用有向 2D 视图。",
      inference: "ONA 尚未验证推断检验；只显示描述性诊断。",
      ai: "在仅含汇总的顺序证据契约通过独立验证前，ONA 不提供 AI 解读。",
    },
    presenter: {
      title: "调整有向 ONA 视图",
      description: "这些控件只改变有向 2D 呈现，不会重新构建顺序模型。",
      directionBoundary: "显示阈值不会改变已拟合 p² 矩阵或已设置方向遮罩。",
      groupPanelsTitle: "描述性组面板",
      groupPanelsDescription: "可从已完成结果选择任意两个组，分别显示平均网络；此选择不会计算相减、对比或推断。",
    },
  },
  sets: { ...zhHant.sets, title: "分析集", description: "将端点模型保留在浏览器内存中，并比较共享同一参考几何的拟合或投影网络。", capture: "捕获当前模型", captureHint: "只捕获派生坐标与等权单位网络均值，不保留原始来源数据行；分析单位标识符仍会保留，必要时请先假名化。", emptyTitle: "尚未捕获分析集", emptyText: "先构建端点模型，再在此捕获。拟合模型会安装其可复用参考，使之后的 CSV 或 XLSX 文件可投影到完全相同的 ENA 空间。", fitted: "拟合", projected: "投影", generatedReference: "可复用拟合参考", projectionReference: "已投影至参考", sourceHash: "分析数据表 SHA-256", hashScope: "哈希范围", primary: "主要分析集", secondary: "次要分析集", choosePrimary: "选择主要分析集", chooseSecondary: "选择兼容的次要分析集", comparisonHint: "带符号连线差异为共享固定几何中的“主要减次要”。JSON 会保留分析单位标识符；需要分享时请先假名化。", noCompatibleSecondary: "没有可用的兼容次要分析集。请在同一参考几何中捕获或投影另一个端点模型。", remove: "移除", exportJson: "导出比较 JSON", exportEdges: "导出连线差异 CSV" },
  data: { ...zhHant.data, title: "从编码数据开始", description: "在此浏览器打开 CSV 或 XLSX 文件，或加载已有说明的学院示例以查看完整流程。", upload: "打开 CSV 或 XLSX", uploadHint: "CSV 或 XLSX，最多 5 MB、20,000 行；XLSX 使用第一个工作表", sample: "加载教学示例", trajectorySample: "加载 2D 轨迹示例", trajectorySampleHint: "54 条合成数据 · 6 位学习者 · TP1–TP3 · 6 个编码", noFile: "尚未加载数据", active: "当前数据集", rows: "数据行", columns: "字段", source: "来源", local: "核心 ENA 计算保留在此浏览器；原始来源数据行不会发送到可选的 AI 解读服务。" },
  model: { ...zhHant.model, title: "定义 ENA 模型", description: "映射赋予网络分析意义的字段，然后运行已验证的 jENA 流程。", sequenceNote: "CSV 或 XLSX 数据行顺序定义每段对话中的序列；若顺序重要，请在分析前先排序源文件。", unit: "分析单位", conversation: "对话", group: "比较组", identityHint: "可选一个或多个字段；顺序会定义复合标识。", noGroup: "不设比较组（全部分析单位）", codes: "编码", window: "窗口", movingWindow: "移动段落窗口", conversationWindow: "完整对话", back: "向后跨度（包括当前行）", forward: "向前数据行", configureTrajectory: "配置轨迹模型", modelType: "模型类型", endpoint: "端点（每个分析单位一个网络）", separateTrajectory: "分离轨迹（每一步一个点）", accumulatedTrajectory: "累积轨迹（每一步为累积网络）", trajectoryHint: "轨迹步骤按每个分析单位首次出现的对话顺序排列；统计面板不会将重复步骤视为独立分析单位。", rotation: "旋转", svd: "SVD（数据方差）", means: "广义均值旋转（GMR）", center: "将零网络分析单位置于原点", weighting: "加权", binary: "二元", run: "构建 ENA 模型", rerun: "重新构建模型", valid: "模型输入有效" },
  plot: { ...zhHant.plot, title: "调整研究视图", description: "这些控件只改变呈现方式，不会在未提示下重新构建模型。", showPoints: "分析单位点", showNetworks: "组网络", showLabels: "编码标签", showTrajectories: "轨迹路径", edgeScale: "连线宽度", axisX: "X 轴", axisY: "Y 轴", axisZ: "Z 轴", camera: "相机", cameraPosition: "相机位置", default3dCamera: "默认 3D 相机", isometric: "等距", xy: "X-Y 平面", xz: "X-Z 平面", yz: "Y-Z 平面", yx: "Y-X 平面", zx: "Z-X 平面", zy: "Z-Y 平面", reset: "重置视图", threeDInteractionHint: "拖动以旋转；滚动或使用五个绘图操作来放大、缩小、回正、复制图片或进入全屏。此几何仅作描述，不属于推断证据。", sameFittedSpace: "沿用同一个已拟合 jENA 空间；切换 2D 与 3D 不会重新运行或重新拟合分析。", threeDExportHint: "使用 3D 绘图工具栏的复制图片按钮，把 PNG 放到剪贴板。SVG 与高分辨率 PNG 研究图导出仅适用于 2D 视图。", threeDUnavailable: "交互式 3D 暂时不可用。已拟合结果仍保持完整；请切回 2D 或重新加载此视图。", threeDRequiresThreeDimensions: "3D ENA 需要已完成结果具有三个不同维度；2D 结果仍可使用。" },
  contrast: { ...en.contrast, title: "端点组对比", description: "依次选择主要组和次要组。中央图以同一比例尺叠加两个平均网络；带符号的“主要减次要”差异保留在证据表与导出中。", primary: "主要组", secondary: "次要组", swap: "交换主要组和次要组", selectedOrder: "所选组顺序", selectedAxes: "所选坐标轴", multiplicity: "此网络对比仅作描述；已确认的统计推断工作流程会在明确运行后应用固定 Holm 检验族。", exportJson: "导出组对比 JSON", exportEdges: "导出组对比连线 CSV", requiresGroup: "无法使用组对比：端点模型需要分组变量。", requiresTwoGroups: "无法使用组对比：端点模型需要至少两个不同组。", endpointOnly: "无法使用组对比：此功能仅适用于端点模型。" },
  longitudinal: { ...en.longitudinal, title: "纵向组质心路径", description: "按明确时期顺序，在固定 jENA 空间中派生等权实体组质心。这些呈现设置不会重建 jENA 或改变投影坐标。", repeatedEntity: "重复测量实体", timeOrder: "时间／顺序字段", observedOrder: "明确时间顺序（按来源数据首次出现）", moveEarlier: "将时期前移", moveLater: "将时期后移", cohortPolicy: "队列策略", available: "可用队列", complete: "完整队列", availableHint: "可用队列使用各时期实际出现的重复实体。", completeHint: "完整队列只保留每个排序时期均有数据的重复实体。", showIndividualPaths: "个体轨迹路径", showGroupPaths: "组质心路径", descriptive: "描述性纵向几何", noEndpointTests: "重复轨迹时期不应用端点 Mann–Whitney 或 Welch 检验。", exportJson: "导出纵向 JSON", exportCsv: "导出纵向时期 CSV", exportInferenceCsv: "导出推断比较 CSV", allUnits: "未设置比较组：显示一条“所有单位”总体质心路径。", period: "时期", group: "组", availableCount: "可用", completeCount: "完整", includedCount: "纳入", excludedCount: "缺失／排除", unavailableModel: "纵向组质心分析需要成功的分离或累积轨迹结果。", unavailableEntity: "纵向分析需要来自拟合单位映射的重复实体字段。", unavailableTime: "纵向分析需要来自拟合对话映射的时间／顺序字段。", unavailablePeriods: "纵向分析至少需要两个排序时期。", unavailableComplete: "完整队列中没有在每个所选时期均有数据的合格重复实体。", figureAriaLabel: "组质心轨迹图；小屏幕可水平滚动。", geometryView: "轨迹几何视图", diagnosticsCaption: "组与时期质心诊断", nUsed: "使用数", nExcluded: "排除数", centroid: "质心", status: "状态", gap: "缺口", observed: "已观察", gapRule: "缺失时期之间不连线。", noConnectedPaths: "无法绘制连接轨迹：所选相邻时期没有重复实体。请检查重复实体和时间点映射。", legendAriaLabel: "纵向轨迹图例", largerCentroidMarker: "较大轮廓方形＝组时期质心", timeDirectionArrow: "箭头＝观察时间方向", flipped: "已翻转", firstAxis: "维度 1", secondAxis: "维度 2", circle: "圆形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六边形", solid: "实线", dashed: "虚线", dotted: "点线", dashDot: "点划线", shortDashed: "短虚线", longShortDashed: "长短虚线", marker: "标记", path: "路径", rowsTruncated: "画面省略了其余时期行；请使用纵向导出获取完整诊断。", individualMarksSampled: "个体图形标记已抽样：显示 {pointsShown}/{pointsTotal} 个点、{segmentsShown}/{segmentsTotal} 个整实体路径转换，以及 {arrowsShown}/{arrowsTotal} 个方向箭头。组质心路径保持完整。" },
  stats: { ...zhHant.stats, title: "证据与可复现性", description: "将描述性摘要与模型规格一并解读；发表层级的推论需要有依据的检验与研究设计。", variance: "解释方差", groupSummary: "组摘要", effect: "绝对 Cohen’s d", verifiedTests: "jENA 检验统计量", correlations: "维度相关", notTest: "jENA 报告检验统计量和自由度，但不计算 p 值；请根据研究设计选择并报告推论检验。", manifest: "分析清单", export: "导出清单", exportBundle: "导出结果包", trajectoryNotice: "端点组检验与点—质心相关不适用于重复轨迹步骤。请描述性解读轨迹几何，或在工作区外使用符合研究设计的纵向方法。", ui: statsUiZhHans },
  aiInterpretation: {
    ...zhHant.aiInterpretation,
    title: "AI 辅助解读",
    description: "解读“统计与导出”当前产生并已确认的结果。AI 只审阅此浏览器已计算的精确汇总证据与推断；不会重新计算检验，也不能取代研究者判断。",
    statsSourceLabel: "统计结果来源",
    statsReady: "当前已确认的统计结果可供 AI 审阅。",
    statsRequired: "请先在“统计与导出”运行并确认推断，再交由 AI 解读。",
    openStats: "打开统计与导出",
    previewTitle: "审阅汇总请求",
    previewHint: "决定是否发送前，请检查完整且带版本的 JSON。",
    consentLabel: "我已审阅此汇总请求，并同意将它发送给外部 AI 供应商。",
    generate: "生成 AI 解读",
    generating: "正在生成解读…",
    cancel: "取消",
    retry: "重试",
    errorTitle: "未能生成 AI 解读",
    noCurrentResult: "请先在“统计与导出”运行并确认当前结果，再请求 AI 解读。",
    staleResult: "请重新构建 ENA 模型，确保解读符合当前设置。",
    aggregatePrivacyGate: "AI 审阅需要当前已确认的推断。低于三个实体披露门槛的推断单元格会连同明确边界一并省略，合格的描述性证据仍会保留。",
    aiGenerated: "由 AI 生成；必须由研究者审阅。",
    descriptiveOnly: "只审阅描述性汇总证据及所提供、已确认的推断审计值。",
    notStatisticalInference: "AI 不会重新计算统计检验，也不能取代研究者判断。",
    privacyLocal: "ENA 在此浏览器中计算；原始来源数据行不会发送给 AI 供应商。",
    privacyExternal: "AI 解读是可选功能。只有经审阅的汇总请求，才会在您同意并点击生成后发送给外部 AI 供应商。",
    provider: "供应商",
    model: "模型",
    provenance: "解读来源记录",
    generatedAt: "生成时间",
    promptVersion: "提示版本",
    evidenceKey: "证据键",
    observedPatterns: "观察到的模式",
    contextualQuestions: "情境问题",
    limitations: "限制",
  },
  workspace: { ...zhHant.workspace, jenaSourceLabel: "源代码", jenaSourceAriaLabel: (version, commit) => `jENA ${version} 对应源代码，提交 ${commit}；在新标签页打开`, comparison: "比较图", groupNetworks: "组网络", emptyTitle: "构建教学示例", emptyText: "加载已有说明的示例或打开编码 CSV 或 XLSX 文件，映射模型并构建分析。必要条件尚未完成时，比较图、主要图和次要图框架仍会保持可见。", ready: "就绪", running: "正在使用 jENA 构建…", result: "当前模型", units: "分析单位", trajectorySteps: "轨迹步骤", codes: "编码", groups: "组", runtime: "运行环境", methodNote: "请结合来源证据以及记录的分析单位、对话、编码、窗口、加权、标准化和旋转选择来解读图形。视觉分离本身并不代表显著性或因果关系。", threeDNote: "交互式 3D 显示与 2D 视图相同的已拟合 jENA 坐标。切换视图不会重新运行或重新拟合分析；旋转与缩放后仍应把几何作描述性解读，而非视为推断证据。", errorTitle: "未能构建模型", accessibleSummary: "无障碍结果摘要", groupMeans: "组平均坐标", strongestDifferences: "最强网络差异", strongestConnections: "最强网络连接", strongerGroup: "较强组", difference: "绝对差异", meanWeight: "平均权重" },
};

Object.assign(zhHant.longitudinal, {
  confirmIdentity: "確認複合識別",
  identityConfirmationHint: "在您確認所有所選單位欄位能識別一個穩定重複實體之前，推論維持停用。",
  accumulatedOrderLocked: "累積軌跡必須鎖定於擬合時的來源出現順序，因為每個點包含此前的網絡歷史。",
  noContributorOverlap: "沒有共同參與者",
  gapRule: "缺失期間或相鄰期間沒有共同重複實體時，均不連線。",
  timeDirectionArrow: "箭頭＝所選期間方向",
});

Object.assign(zhHant.model, {
  codeColor: "編碼顏色",
});

Object.assign(zhHans.longitudinal, {
  confirmIdentity: "确认复合标识",
  identityConfirmationHint: "在您确认所有所选单位字段能标识一个稳定重复实体之前，推断保持禁用。",
  accumulatedOrderLocked: "累积轨迹必须锁定于拟合时的来源出现顺序，因为每个点包含此前的网络历史。",
  noContributorOverlap: "没有共同参与者",
  gapRule: "缺失时期或相邻时期没有共同重复实体时，均不连线。",
  timeDirectionArrow: "箭头＝所选时期方向",
});

Object.assign(zhHant.stats, {
  tabs: { comparison: "比較", goodness: "擬合優度", variance: "變異" },
  inference: inferenceZhHant,
});

Object.assign(zhHans.stats, {
  tabs: { comparison: "比较", goodness: "拟合优度", variance: "方差" },
  inference: inferenceZhHans,
});

Object.assign(zhHans.model, {
  codeColor: "编码颜色",
});

const navLabels: Record<Locale, string> = {
  en: "Open ENA",
  "zh-hant": "開放 ENA",
  "zh-hans": "开放 ENA",
  es: "Abrir ENA",
  fr: "Ouvrir ENA",
  pt: "Abrir ENA",
  de: "ENA öffnen",
  ar: "فتح ENA",
  ko: "Open ENA",
  ja: "Open ENA",
  hi: "Open ENA",
  ru: "Открыть ENA",
  id: "Buka ENA",
  bn: "Open ENA",
};

export const openEnaLocalizedLocales = ["en", "zh-hant", "zh-hans"] as const;

export function isOpenEnaLocalizedLocale(
  locale: Locale,
): locale is (typeof openEnaLocalizedLocales)[number] {
  return (openEnaLocalizedLocales as readonly Locale[]).includes(locale);
}

export function getOpenEnaFallbackNotice(locale: Locale) {
  if (isOpenEnaLocalizedLocale(locale)) return null;
  return `Open ENA is not yet localized for the ${locale} route. The English interface is shown while this route and locale are retained.`;
}

export function getOpenEnaCopy(locale: Locale): OpenEnaCopy {
  if (locale === "zh-hant") return zhHant;
  if (locale === "zh-hans") return zhHans;
  if (locale === "en") return en;
  return {
    ...en,
    eyebrow: `${navLabels[locale]} · English workspace interface`,
    navLabel: navLabels[locale],
  };
}

export function getOpenEnaNavLabel(locale: Locale) {
  return navLabels[locale];
}
