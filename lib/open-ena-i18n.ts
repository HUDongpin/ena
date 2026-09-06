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
import type { OpenEnaUnitPointStyle } from "./open-ena/unit-point-style";
import type { OpenEnaCodeColorPickerCopy } from "./open-ena/code-color-presets";
import {
  MODEL_DIAGNOSTIC_IDS_V3,
  MODEL_SUGGESTED_ACTION_IDS_V3,
  type ModelDiagnosticIdV3,
  type ModelSuggestedActionIdV3,
} from "./open-ena/model-v3/diagnostics";
import {
  ONA_COMPILER_DIAGNOSTIC_IDS_V3,
  type OnaCompilerDiagnosticIdV3,
} from "./open-ena/model-v3/ona-compiler-preflight";
import {
  tabsCopy,
  unitsCopy,
  horizonsCopy,
  windowsCopy,
  codesCopy,
  orderCopy,
} from "../components/open-ena/model-v3/model-copy-v3";
import type { OpenEnaModelTabsV3Copy } from "../components/open-ena/model-v3/OpenEnaModelTabsV3";
import type { OpenEnaUnitsPanelV3Copy } from "../components/open-ena/model-v3/OpenEnaUnitsPanelV3";
import type { OpenEnaHorizonsPanelV3Copy } from "../components/open-ena/model-v3/OpenEnaHorizonsPanelV3";
import type { OpenEnaWindowsPanelV3Copy } from "../components/open-ena/model-v3/OpenEnaWindowsPanelV3";
import type { OpenEnaCodesPanelV3Copy } from "../components/open-ena/model-v3/OpenEnaCodesPanelV3";
import type { OpenEnaOrderPolicyEditorV3Copy } from "../components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3";
import type {
  ModelSuggestedActionLocalizationInputV3,
  ModelUiDiagnosticLocalizationInputV3,
} from "../components/open-ena/model-v3/OpenEnaModelDiagnosticsV3";
import type { NativeStatsCopyV3 } from "../components/open-ena/model-v3/OpenEnaNativeStatsPanelV3";
import type { OpenEnaImportPreviewCopyV3 } from "../components/open-ena/model-v3/OpenEnaImportPreviewV3";
import type { SourceTypeErrorCodeV3 } from "./open-ena/source-preparation-v3";
import type { OpenEnaDataViewCopy } from "../components/open-ena/OpenEnaDataView";

export type OpenEnaModelDiagnosticIdV3 = ModelDiagnosticIdV3 | OnaCompilerDiagnosticIdV3;

interface OpenEnaModelDiagnosticMessageV3 {
  readonly summary: (input: OpenEnaModelDiagnosticLocalizationInputV3) => string;
  readonly detail: (input: OpenEnaModelDiagnosticLocalizationInputV3) => string;
}

type OpenEnaModelDiagnosticLocalizationInputV3 = Omit<ModelUiDiagnosticLocalizationInputV3, "id"> & { readonly id: string };

interface OpenEnaModelSuggestedActionMessageV3 {
  readonly label: (input: ModelSuggestedActionLocalizationInputV3) => string;
  readonly confirmation: (input: ModelSuggestedActionLocalizationInputV3) => string;
}

export interface OpenEnaModelV3Copy {
  readonly tabs: OpenEnaModelTabsV3Copy;
  readonly units: OpenEnaUnitsPanelV3Copy;
  readonly horizons: OpenEnaHorizonsPanelV3Copy;
  readonly windows: OpenEnaWindowsPanelV3Copy;
  readonly codes: OpenEnaCodesPanelV3Copy;
  readonly order: OpenEnaOrderPolicyEditorV3Copy;
  readonly nativeStats: NativeStatsCopyV3;
  readonly importPreview: OpenEnaImportPreviewCopyV3;
  readonly groupApplicability: {
    readonly preset: string;
    readonly global: string;
    readonly trajectoryIntervals: string;
  };
  readonly workspace: OpenEnaWorkspaceV3Copy;
  readonly diagnosticMessages: Readonly<Record<OpenEnaModelDiagnosticIdV3, OpenEnaModelDiagnosticMessageV3>>;
  readonly suggestedActions: Readonly<Record<ModelSuggestedActionIdV3, OpenEnaModelSuggestedActionMessageV3>>;
}

export interface OpenEnaWorkspaceV3Copy {
  readonly configureTrajectory: string;
  readonly resultStatus: Readonly<Record<"current" | "stale" | "none", string>>;
  readonly runStatus: Readonly<Record<"idle" | "running" | "error" | "obsolete" | "cancelled", string>>;
  readonly startingWorker: string;
  readonly workerStage: (stageId: string) => string;
  readonly runModel: string;
  readonly cancelRun: string;
  readonly cancelPendingImport: string;
  readonly operationFailed: string;
  readonly failures: {
    readonly codedDataTooLarge: (input: { readonly limitMiB: number }) => string;
    readonly artifactTooLarge: (input: { readonly limitMiB: number }) => string;
    readonly presetTooLarge: (input: { readonly limitMiB: number }) => string;
    readonly sampleUnavailable: string;
    readonly pngCanvasUnavailable: string;
    readonly pngEncodingFailed: string;
    readonly pngRenderFailed: string;
    readonly operationFailed: string;
  };
  readonly dataView: OpenEnaDataViewCopy & {
    readonly overall: string;
    readonly primary: string;
    readonly secondary: string;
    readonly empty: string;
    readonly sourceIndexMeaning: string;
    readonly metadataLabels: {
      readonly trajectoryOrdinal: string;
      readonly observedHorizons: string;
      readonly observedSourceRowIndices: string;
    };
    readonly sourceTraversalLabels: {
      readonly sourceRowIndex: string;
      readonly runtimeOrdinal: string;
      readonly horizon: string;
      readonly withinHorizonOrdinal: string;
    };
  };
  readonly data: {
    readonly ariaLabel: string; readonly title: string; readonly openFile: string; readonly loadSample: string; readonly loadTrajectorySample: string;
    readonly sampleExplanation: string; readonly importArtifact: string; readonly artifactTooLarge: string;
    readonly reviewTypes: string; readonly reviewTypesTitle: string; readonly typingExplanation: string;
    readonly sourceTypeLabel: (column: string) => string; readonly sourceTypes: Readonly<Record<"text" | "number" | "boolean", string>>;
    readonly missingCells: (count: number) => string; readonly collisions: (count: number) => string; readonly invalidCells: (count: number) => string;
    readonly sourceErrors: Readonly<Record<SourceTypeErrorCodeV3, string>>;
    readonly cancelPreparation: string; readonly confirmPreparation: string; readonly confirmPreparationDisabled: string;
    readonly datasetSummary: (name: string, rows: number, hash: string, hashKind: string | undefined) => string;
    readonly sourceData: string; readonly downloadTyped: string; readonly downloadReceipt: string; readonly downloadOriginal: string;
    readonly historicalArtifact: (hash: string) => string; readonly reviewHistorical: string;
    readonly unavailableCell: string; readonly boundedRows: (shown: number, total: number) => string;
    readonly codedDataTooLarge: string; readonly sampleUnavailable: string;
  };
  readonly onaMask: { readonly legend: string; readonly description: string; readonly initialize: string };
  readonly plot: {
    readonly title: string; readonly exportContrastJson: string; readonly exportContrastEdges: string; readonly switchPlots: string;
    readonly showCentroidPaths: string; readonly endpointsOnly: string; readonly fittedOrder: string; readonly displayHorizon: (label: string) => string;
    readonly points: string; readonly networks: string; readonly codeLabels: string; readonly unitLabels: string; readonly variance: string; readonly trajectories: string;
    readonly flipX: string; readonly flipY: string; readonly edgeThreshold: string; readonly edgeScale: string; readonly pointScale: string; readonly zoom: string;
    readonly unavailable: string; readonly axis: (index: number) => string; readonly resetNodes: string;
    readonly pngCanvasUnavailable: string; readonly pngEncodingFailed: string; readonly pngRenderFailed: string;
    readonly unknownRenderedCode: string; readonly toolsTitle: string;
    readonly comparisonPlot: string; readonly primaryPlot: string; readonly secondaryPlot: string; readonly dataView: string;
    readonly comparisonAria: string; readonly primaryPlotAria: string; readonly secondaryPlotAria: string;
    readonly primaryEmptyAria: string; readonly secondaryEmptyAria: string; readonly emptyGroupPrompt: string; readonly selectedGroupOrder: string;
    readonly dataViewComparisonRecords: (primary: string, secondary: string) => string;
    readonly dataViewUnavailable: string;
  };
  readonly stats: {
    readonly separation: string; readonly inferenceDesign: string; readonly designs: Readonly<Record<"independent" | "paired" | "repeated", string>>;
    readonly identityConfirmation: string; readonly periodInstructions: string; readonly runInference: string; readonly onaDescriptive: string;
    readonly onaEdges: string; readonly onaAudit: string; readonly exportOnaEdges: string; readonly exportOnaAudit: string; readonly exportNative: string;
    readonly localDataView: string; readonly globalTraversal: string; readonly exportDataView: string; readonly exportDataViewConfirmation: string;
    readonly dataViewValidated: string; readonly exportMethods: string; readonly onaMeaning: string;
  };
  readonly artifacts: {
    readonly ariaLabel: string; readonly title: string; readonly clearPreset: string; readonly exportPreset: string; readonly reviewPreset: string;
    readonly presetPreview: string; readonly presetMatches: string; readonly presetMismatch: string; readonly presetCodesMismatch: string; readonly presetFamilyMismatch: string;
    readonly cancelPreset: string; readonly applyPreset: string; readonly exportDraft: string; readonly draftBlocked: string; readonly exportConfig: string;
    readonly exportAnalysis: string; readonly exportAnalysisConfirmation: string; readonly exportStale: string; readonly reexportReference: string; readonly exportReference: string;
    readonly captureSet: (count: number) => string; readonly compareSets: string; readonly historicalComparison: string;
    readonly presetTooLarge: string; readonly referenceDisplayName: string;
    readonly presetScope: string;
  };
  readonly ai: { readonly ready: string; readonly unavailable: string; readonly openStats: string; readonly disabled: string; readonly wireLimitations: string };
  readonly toolbar: { readonly dataView: string; readonly downloadModel: string; readonly exportSvg: string; readonly exportPng: string; readonly researchSpace: string };
  readonly shell: { readonly workspaceAria: string; readonly modesAria: string; readonly local: string; readonly runtimePrivacy: (version: string) => string };
  readonly result: { readonly plotAria: string; readonly historicalGeometry: string; readonly boundGeometry: string; readonly oneAxis: string; readonly fittedCoordinates: string; readonly contrastUnavailable: string; readonly codeLabels: string; readonly trajectorySteps: string; readonly cohortMeaning: string };
  readonly empty: { readonly ariaLabel: string; readonly comparisonPlot: string; readonly setupRequired: string; readonly researchSpace: string; readonly networkAria: string; readonly pathway: string; readonly complete: string; readonly incomplete: string; readonly openRows: string; readonly defineModel: string; readonly buildModel: string; readonly primaryPlot: string; readonly secondaryPlot: string; readonly awaitingGroup: string; readonly primaryPending: string; readonly secondaryPending: string; readonly dataReady: (rows: number) => string; readonly dataPrompt: string };
}

export type OpenEnaWorkspaceFailureV3 =
  | { readonly id: "coded-data-too-large"; readonly limitMiB: number }
  | { readonly id: "artifact-too-large"; readonly limitMiB: number }
  | { readonly id: "preset-too-large"; readonly limitMiB: number }
  | { readonly id: "sample-unavailable" }
  | { readonly id: "png-canvas-unavailable" }
  | { readonly id: "png-encoding-failed" }
  | { readonly id: "png-render-failed" }
  | { readonly id: "operation-failed" };

export function formatOpenEnaWorkspaceFailureV3(copy: OpenEnaWorkspaceV3Copy, failure: OpenEnaWorkspaceFailureV3): string {
  switch (failure.id) {
    case "coded-data-too-large": return copy.failures.codedDataTooLarge({ limitMiB: failure.limitMiB });
    case "artifact-too-large": return copy.failures.artifactTooLarge({ limitMiB: failure.limitMiB });
    case "preset-too-large": return copy.failures.presetTooLarge({ limitMiB: failure.limitMiB });
    case "sample-unavailable": return copy.failures.sampleUnavailable;
    case "png-canvas-unavailable": return copy.failures.pngCanvasUnavailable;
    case "png-encoding-failed": return copy.failures.pngEncodingFailed;
    case "png-render-failed": return copy.failures.pngRenderFailed;
    case "operation-failed": return copy.failures.operationFailed;
  }
}

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
    threeD: string;
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
    threeDLinkedWorkspace: string;
    threeDSameFittedModel: string;
    threeDDirection: string;
    threeDReciprocalLane: string;
    threeDSelfLoop: string;
    threeDDescriptiveOnly: string;
    threeDDegenerateAxis: string;
    threeDAccessibleSummary: string;
    threeDOverall: string;
    threeDPrimary: string;
    threeDSecondary: string;
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
    pointStyleNames: Readonly<Record<OpenEnaUnitPointStyle, string>>;
    unitPointDescription: (input: {
      unit: string;
      group: string;
      xDimension: string;
      xValue: string;
      yDimension: string;
      yValue: string;
    }) => string;
    groupPointDescription: (input: {
      number: number;
      group: string;
      color: string;
      style: string;
    }) => string;
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
  modes: { data: string; model: string; plot: string; stats: string; ai: string };
  views: { twoD: string; threeD: string };
  plotExport: {
    identityOmittedPoint: (index: number) => string;
  };
  groupDisplay: OpenEnaGroupDisplayCopy;
  modelV3: OpenEnaModelV3Copy;
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
    codeColorPicker: Readonly<OpenEnaCodeColorPickerCopy>;
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
    resetNodeLayout: string;
    threeDComparisonPlot: string;
    threeDPrimaryPlot: string;
    threeDSecondaryPlot: string;
    threeDPlotActions: string;
    zoomIn: string;
    zoomOut: string;
    recenter: string;
    copyImage: string;
    copyImageTitle: string;
    fullscreenEnter: string;
    fullscreenExit: string;
    fullscreenDialog: string;
    actionUnavailable: string;
    copyingImage: string;
    imageCopied: string;
    imageDataCopied: string;
    copyUnavailable: string;
    fullscreenOpening: string;
    fullscreenFallbackEnabled: string;
    fullscreenClosed: string;
    fullscreenExitFailed: string;
    fullscreenUnavailable: string;
    threeDInteractionHint: string;
    sameFittedSpace: string;
    threeDExportHint: string;
    threeDLoading: string;
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
    identityExportWarning: string;
    identityExportConfirmation: string;
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

const codeColorPickerEn: Readonly<OpenEnaCodeColorPickerCopy> = Object.freeze<OpenEnaCodeColorPickerCopy>({
  chooseColor: (code) => `Choose color for ${code}`,
  dialogTitle: (code) => `Code color for ${code}`,
  colorPresets: "Color Presets:",
  customColor: "Custom Color:",
  primary: "Primary",
  complementary: "Complementary",
  cancel: "Cancel",
  confirm: "OK",
  saturationValue: "Saturation and brightness",
  saturation: "Saturation",
  brightness: "Brightness",
  saturationBrightnessValue: (saturation, brightness) => `Saturation ${saturation}%, brightness ${brightness}%`,
  hue: "Hue",
  invalidHex: "Enter a six-digit hexadecimal color such as #cc423a.",
  presetLabel: (index, primary, complementary) => `Preset ${index}: Primary ${primary}, Complementary ${complementary}`,
});

const codeColorPickerZhHant: Readonly<OpenEnaCodeColorPickerCopy> = Object.freeze<OpenEnaCodeColorPickerCopy>({
  chooseColor: (code) => `選擇 ${code} 的顏色`,
  dialogTitle: (code) => `${code} 的編碼顏色`,
  colorPresets: "顏色預設：",
  customColor: "自訂顏色：",
  primary: "主色",
  complementary: "互補色",
  cancel: "取消",
  confirm: "確定",
  saturationValue: "飽和度與亮度",
  saturation: "飽和度",
  brightness: "亮度",
  saturationBrightnessValue: (saturation, brightness) => `飽和度 ${saturation}%，亮度 ${brightness}%`,
  hue: "色相",
  invalidHex: "請輸入六位十六進位顏色，例如 #cc423a。",
  presetLabel: (index, primary, complementary) => `預設 ${index}：主色 ${primary}，互補色 ${complementary}`,
});

const codeColorPickerZhHans: Readonly<OpenEnaCodeColorPickerCopy> = Object.freeze<OpenEnaCodeColorPickerCopy>({
  chooseColor: (code) => `选择 ${code} 的颜色`,
  dialogTitle: (code) => `${code} 的编码颜色`,
  colorPresets: "颜色预设：",
  customColor: "自定义颜色：",
  primary: "主色",
  complementary: "互补色",
  cancel: "取消",
  confirm: "确定",
  saturationValue: "饱和度与亮度",
  saturation: "饱和度",
  brightness: "亮度",
  saturationBrightnessValue: (saturation, brightness) => `饱和度 ${saturation}%，亮度 ${brightness}%`,
  hue: "色相",
  invalidHex: "请输入六位十六进制颜色，例如 #cc423a。",
  presetLabel: (index, primary, complementary) => `预设 ${index}：主色 ${primary}，互补色 ${complementary}`,
});

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
  providerDisclosure: string;
  dataScopeDisclosure: string;
  retentionDisclosure: string;
  regionDisclosure: string;
  auditReceiptDisclosure: string;
  disclosureSummary: string;
  provider: string;
  model: string;
  provenance: string;
  generatedAt: string;
  promptVersion: string;
  evidenceKey: string;
  auditReceipt: string;
  requestSha256: string;
  consentPolicyVersion: string;
  recordedAt: string;
  durable: string;
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

type NativeModelLocaleV3 = "en" | "zh-hant" | "zh-hans";

const MODEL_DIAGNOSTIC_IDS_ALL_V3 = Object.freeze([
  ...MODEL_DIAGNOSTIC_IDS_V3,
  ...ONA_COMPILER_DIAGNOSTIC_IDS_V3,
] as const);

const MODEL_EXACT_ZH_HANT_V3: Readonly<Record<string, string>> = {
  "Global diagnostics": "全域診斷", "More evidence is available": "尚有更多證據", "Confirm scientific change": "確認科學設定變更", "Field": "欄位",
  "Unit fields": "單位欄位", "Add a Unit field": "新增單位欄位", "Units and Groups": "單位與群組",
  "Unavailable for this draft": "此草稿目前不可用", "Group stability": "群組穩定性", "Stable within every Unit": "每個單位內均保持穩定",
  "Group changes within at least one Unit": "群組值在至少一個單位內發生變化", "Create Sample / Group": "建立樣本／群組", "No Group": "沒有群組",
  "Means contrast": "均值對比", "Negative level": "負向層級", "Positive level": "正向層級", "No level selected": "尚未選擇層級",
  "Choose a current, stable Group to select Means levels.": "請選擇目前且穩定的群組，再設定均值層級。",
  "Means remains selected and needs a Group and two distinct levels.": "均值旋轉保持選取；仍需一個群組及兩個不同層級。",
  "Group actions": "群組操作", "Collapse all group option panels": "摺疊所有群組選項", "Open all group display options": "展開所有群組顯示選項",
  "A result with Groups is required.": "需要包含群組的結果。", "Hide all group layers": "隱藏所有群組圖層", "Restore all group layers": "還原所有群組圖層",
  "Exclude group configuration": "排除群組設定", "A result for this dataset and family is required.": "需要此資料集與分析系列的結果。",
  "Choose a Group before excluding it.": "請先選擇要排除的群組。", "Undo Group exclusion": "復原群組排除",
  "Group configuration excluded. The retained result is stale.": "已排除群組設定；保留的結果現已過期。", "Current draft Groups": "目前草稿群組",
  "Groups from the retained result": "保留結果中的群組", "These display controls belong to the retained stale result.": "這些顯示控制項屬於保留的過期結果。",
  "No result-bound Group display is available.": "目前沒有與結果綁定的群組顯示。", "Group stability diagnostics": "群組穩定性診斷",
  "Horizon identity": "視域識別", "Add a Horizon field": "新增視域欄位", "Horizon structure counts": "視域結構計數",
  "Unit by Horizon structure": "單位 × 視域結構", "Source rows": "來源資料列", "No shared Horizons": "沒有共用視域",
  "Trajectory step order": "軌跡步驟順序", "Horizon order is not applicable to End Point; the inactive draft is preserved.": "端點模型不使用視域順序；未啟用的草稿設定會保留。",
  "Horizon order is not applicable to ONA End Point.": "ONA 端點模型不使用視域順序。", "Per-Unit sequence preview": "各單位序列預覽",
  "Sequence preview unavailable for this context": "此情境無法提供序列預覽", "Add tie-breaker order key": "新增同值判定順序鍵", "Horizon diagnostics": "視域診斷",
  "EndPoint": "端點", "Moving Stanza Window": "移動節段窗口", "Conversation / Horizon Window": "對話／視域窗口",
  "All source rows in the same typed Horizon contribute; extent and row order are inactive.": "同一類型化視域內的所有來源資料列都會參與；範圍與資料列順序不啟用。",
  "Backward context": "向後情境", "Forward context": "向前情境", "Finite": "有限", "Entire Horizon": "整個視域", "Rows": "資料列",
  "Includes the current row only within its Horizon.": "在該視域內僅包含目前資料列。", "Includes the current row and every preceding row within its Horizon.": "在該視域內包含目前資料列及所有先前資料列。",
  "Adds no following rows.": "不加入後續資料列。", "Adds every following row within its Horizon; the current row is excluded from this count.": "加入該視域內所有後續資料列；此計數不包含目前資料列。",
  "Enter an extent.": "請輸入範圍。", "Use a whole decimal integer or Infinity.": "請使用十進位整數或 Infinity。", "Backward context must be at least 1.": "向後情境至少為 1。",
  "Forward context must be at least 0.": "向前情境至少為 0。", "The extent exceeds the largest safe integer.": "範圍超過最大安全整數。", "Row order": "資料列順序",
  "Binary accepts one consistent 0/1 numeric or false/true Boolean representation per Code.": "每個代碼必須一致使用數字 0/1 或布林 false/true 二元表示。",
  "Frequency accepts finite nonnegative numeric Code values, including decimals.": "頻數接受有限且非負的代碼數值，包括小數。", "Projection & Rotation": "投影與旋轉",
  "Align target-fitted center to the origin": "將目標擬合中心對齊原點", "Set the ordered Means contrast in Units.": "在單位面板設定有方向的均值對比。",
  "Open Means contrast in Units": "在單位面板開啟均值對比", "Direct Means rotation requires EndPoint. The Means selection is preserved.": "直接均值旋轉需要端點模型；均值選擇會保留。",
  "Choose SVD": "選擇 SVD", "Choose Reference": "選擇參考", "Return to EndPoint": "返回端點模型", "Reference source": "參考來源",
  "No Reference selected": "尚未選擇參考", "Choose an owned validated Reference. The Reference selection remains active and Run is blocked.": "請選擇已擁有且通過驗證的參考；目前選擇會保留，並阻止執行。",
  "Current owned Reference evidence is unavailable for this exact context.": "目前擁有的參考證據不適用於此精確情境。",
  "The selected Reference is incompatible with this target. The selection is preserved.": "所選參考與此目標不相容；選擇會保留。", "Compatible with the current target configuration.": "與目前目標設定相容。",
  "Reference evidence": "參考證據", "Content hash": "內容雜湊", "Source fit": "來源擬合", "Source SVD": "來源 SVD", "Source Means": "來源均值",
  "Source population": "來源母體", "Endpoint Units": "端點單位", "Source observations": "來源觀測", "Fixed basis": "固定基底",
  "Centering is fixed by the source Reference": "中心化由來源參考固定", "source fit aligned to origin": "來源擬合已對齊原點", "source fit center retained": "保留來源擬合中心",
  "Target projection": "目標投影", "No current target projection has been adopted.": "尚未採用目前目標投影。", "Compatibility details": "相容性詳情",
  "Execution resource preflight": "執行資源預檢", "No current compiler-owned preflight is available for this exact scientific context.": "此精確科學情境沒有目前由編譯器擁有的預檢。",
  "Active raw Window input is invalid, so there is no executable plan or current estimate.": "啟用中的原始窗口輸入無效，因此沒有可執行計畫或目前估算。",
  "The active draft is invalid, so there is no executable plan or current estimate.": "啟用中的草稿無效，因此沒有可執行計畫或目前估算。", "Current preflight admitted": "目前預檢已准入",
  "Hard caps block execution; they never authorize truncating rows, Codes, windows, or data.": "硬性上限會阻止執行，絕不授權截斷資料列、代碼、窗口或資料。",
  "Ordered Network Analysis Window contract": "有序網絡分析窗口契約", "Forward context is fixed at 0 for Ordered Network Analysis.": "有序網絡分析的向前情境固定為 0。",
  "Frequency weighting is fixed for Ordered Network Analysis.": "有序網絡分析固定使用頻數權重。", "EndPoint is fixed for Ordered Network Analysis.": "有序網絡分析固定使用端點模型。",
  "SVD is fixed for Ordered Network Analysis.": "有序網絡分析固定使用 SVD。", "Selected codes become the nodes in the model network.": "所選代碼會成為模型網絡中的節點。",
  "Analysis family": "分析系列", "Method boundary": "方法邊界", "Undirected co-occurrence": "無向共現", "Standard boundary": "標準 ENA 邊界",
  "Directed ground-response": "有向前項—回應", "ONA boundary": "ONA 邊界", "Code actions": "代碼操作", "Hide all code nodes": "隱藏所有代碼節點",
  "Restore all code nodes": "還原所有代碼節點", "Exclude all selected Codes": "排除所有已選代碼", "Select at least one Code before hiding nodes.": "請先選擇至少一個代碼，再隱藏節點。",
  "There are no selected Codes to exclude.": "沒有可排除的已選代碼。", "Selected Codes": "已選代碼", "Type": "類型", "Positive rows": "正值資料列",
  "Numeric Binary": "數字二元", "Boolean Binary": "布林二元", "Unavailable for this exact draft": "此精確草稿目前不可用",
  "Compiler diagnostics are unavailable for this exact draft.": "此精確草稿沒有可用的編譯器診斷。", "Press Alt+Arrow Up or Alt+Arrow Down to change display order.": "按 Alt+向上鍵或 Alt+向下鍵變更顯示順序。",
  "Display reorder is unavailable until selected Codes are distinct.": "已選代碼互不相同後才能調整顯示順序。", "Display actions are unavailable until selected Codes are distinct.": "已選代碼互不相同後才能使用顯示操作。",
  "Restore all Codes before changing one Code visibility.": "變更單一代碼可見性前，請先還原所有代碼。", "Manage Codes": "管理代碼", "Close Code manager": "關閉代碼管理器",
  "Compatible source fields can be selected. Incompatible fields remain visible with reasons.": "可選擇相容的來源欄位；不相容欄位仍會顯示原因。", "Missing from the current dataset": "目前資料集缺少此欄位",
  "Used by an active scientific role": "正由啟用中的科學角色使用", "Values do not use one uniform numeric 0/1 or Boolean representation": "值未一致使用數字 0/1 或布林表示",
  "Values are not all finite nonnegative numbers": "並非所有值都是有限非負數", "Selected more than once; remove it to repair the draft": "重複選取；請移除重複項以修復草稿",
  "No codes selected": "尚未選擇代碼", "At least three distinct Codes are required to run a model.": "執行模型至少需要三個不同代碼。",
  "Units, Horizons, Windows, Order, Rotation, and the other analysis family remain preserved.": "單位、視域、窗口、順序、旋轉及另一分析系列的設定均會保留。", "Undo Code exclusion": "復原代碼排除",
  "Sort by fields": "依欄位排序", "Use source order": "使用來源順序", "Add order key": "新增順序鍵", "Choose a field": "選擇欄位", "Direction": "方向",
  "Comparator": "比較器", "Ordered category": "有序類別", "Ordered category levels": "有序類別層級", "Add category level": "新增類別層級", "Value type": "值類型",
  "Value": "值", "Locale": "語系", "Sensitivity": "敏感度", "Base": "基礎", "Accent": "重音", "Case": "大小寫", "Variant": "變體", "Numeric collation": "數字排序",
  "Complete every active order field before running.": "執行前請完成所有啟用中的順序欄位。", "I confirm the observed source sequence for this exact dataset and field context.": "我確認此精確資料集與欄位情境中觀察到的來源序列。",
  "Review source-order statement": "檢視來源順序聲明", "Accept statement": "接受聲明", "Source order explicitly confirmed": "已明確確認來源順序", "Source order is not confirmed": "尚未確認來源順序",
  "The dataset or scientific context changed. Review the statement again.": "資料集或科學情境已變更；請重新檢視聲明。", "Relevant fields": "相關欄位", "Confirmation version": "確認版本", "Confirmed at": "確認時間",
  "Unavailable for this context": "此情境目前不可用", "Correlation goodness-of-fit statistics are unavailable in this native model bundle; no correlation test is claimed.": "此原生模型套件不提供相關性適配度統計，因此不宣稱已進行相關檢驗。",
  "These descriptive values belong to the retained historical model.": "這些描述值屬於保留的歷史模型。", "These values belong to the current bound model.": "這些值屬於目前綁定的模型。",
  "Researcher-requested post-model inference": "研究者要求的模型後推論", "Native comparison statistics": "原生比較統計", "Repeated-measures omnibus statistics": "重複量數整體統計",
  "Selected-request followup statistics": "所選要求的後續統計", "Observed inference population": "觀察到的推論母體", "Target variance along fixed Reference axes": "固定參考軸上的目標變異",
  "Variance in the fitted space": "擬合空間中的變異", "Review imported artifact": "檢視匯入成果", "Current draft": "目前草稿", "Imported draft": "匯入的草稿", "Cancel import": "取消匯入",
  "Replace configuration": "取代設定", "Load configuration": "載入設定", "Keep read-only historical result": "保留唯讀歷史結果", "Add Reference": "新增參考",
  "This result is historical. Its configuration is loaded only by an explicit action.": "此結果為歷史結果；只有明確操作才會載入其設定。",
  "Accepting an artifact does not start a model. References are added without selecting Rotation.": "接受成果不會啟動模型；新增參考時不會選取旋轉。",
  "Legacy schema 2 analysis packages cannot become a v3 Reference because they do not contain the required fitted basis evidence.": "舊版 schema 2 分析套件缺少必要的擬合基底證據，因此不能成為 v3 參考。",
  "A presentation preset hides this Group. Clear preset Group hiding to use these saved controls; individual Unit preferences are retained.": "呈現預設隱藏了此群組。清除預設群組隱藏後即可使用這些已儲存控制項；個別單位偏好仍會保留。",
  "All Groups are hidden. Restore Group visibility to use these saved controls; individual Unit preferences are retained.": "所有群組均已隱藏。還原群組可見性後即可使用這些已儲存控制項；個別單位偏好仍會保留。",
  "Native trajectory display summaries do not provide confidence or outlier intervals. These saved interval preferences do not apply to this view.": "原生軌跡顯示摘要不提供信賴區間或離群區間；已儲存的區間偏好不適用於此檢視。",
};

const MODEL_EXACT_ZH_HANS_V3: Readonly<Record<string, string>> = {
  "Global diagnostics": "全局诊断",
  "More evidence is available": "尚有更多证据",
  "Confirm scientific change": "确认科学设置更改",
  "Field": "字段",
  "Unit fields": "单位字段",
  "Add a Unit field": "添加单位字段",
  "Units and Groups": "单位与组",
  "Unavailable for this draft": "此草稿当前不可用",
  "Group stability": "组稳定性",
  "Stable within every Unit": "在每个单位内保持稳定",
  "Group changes within at least one Unit": "组值在至少一个单位内发生变化",
  "Create Sample / Group": "创建样本／组",
  "No Group": "没有组",
  "Means contrast": "均值对比",
  "Negative level": "负向层级",
  "Positive level": "正向层级",
  "No level selected": "尚未选择层级",
  "Choose a current, stable Group to select Means levels.": "请选择当前且稳定的组，再设置均值层级。",
  "Means remains selected and needs a Group and two distinct levels.": "均值旋转仍保持选中；还需要一个组及两个不同层级。",
  "Group actions": "组操作",
  "Collapse all group option panels": "折叠所有组选项",
  "Open all group display options": "展开所有组显示选项",
  "A result with Groups is required.": "需要包含组的结果。",
  "Hide all group layers": "隐藏所有组图层",
  "Restore all group layers": "恢复所有组图层",
  "Exclude group configuration": "排除组设置",
  "A result for this dataset and family is required.": "需要此数据集与分析系列的结果。",
  "Choose a Group before excluding it.": "请先选择要排除的组。",
  "Undo Group exclusion": "撤销组排除",
  "Group configuration excluded. The retained result is stale.": "已排除组设置；保留的结果现已过期。",
  "Current draft Groups": "当前草稿组",
  "Groups from the retained result": "保留结果中的组",
  "These display controls belong to the retained stale result.": "这些显示控件属于保留的过期结果。",
  "No result-bound Group display is available.": "当前没有与结果绑定的组显示。",
  "Group stability diagnostics": "组稳定性诊断",
  "Horizon identity": "视域标识",
  "Add a Horizon field": "添加视域字段",
  "Horizon structure counts": "视域结构计数",
  "Unit by Horizon structure": "单位 × 视域结构",
  "Source rows": "来源数据行",
  "No shared Horizons": "没有共享视域",
  "Trajectory step order": "轨迹步骤顺序",
  "Horizon order is not applicable to End Point; the inactive draft is preserved.": "端点模型不使用视域顺序；未启用的草稿设置会保留。",
  "Horizon order is not applicable to ONA End Point.": "ONA 端点模型不使用视域顺序。",
  "Per-Unit sequence preview": "各单位序列预览",
  "Sequence preview unavailable for this context": "此情境无法提供序列预览",
  "Add tie-breaker order key": "添加同值判定顺序键",
  "Horizon diagnostics": "视域诊断",
  "EndPoint": "端点",
  "Moving Stanza Window": "移动节段窗口",
  "Conversation / Horizon Window": "对话／视域窗口",
  "All source rows in the same typed Horizon contribute; extent and row order are inactive.": "同一类型化视域内的所有来源数据行都会参与；范围与数据行顺序不启用。",
  "Backward context": "向后上下文",
  "Forward context": "向前上下文",
  "Finite": "有限",
  "Entire Horizon": "整个视域",
  "Rows": "数据行",
  "Includes the current row only within its Horizon.": "在该视域内仅包含当前数据行。",
  "Includes the current row and every preceding row within its Horizon.": "在该视域内包含当前数据行及所有先前数据行。",
  "Adds no following rows.": "不加入后续数据行。",
  "Adds every following row within its Horizon; the current row is excluded from this count.": "加入该视域内所有后续数据行；此计数不包含当前数据行。",
  "Enter an extent.": "请输入范围。",
  "Use a whole decimal integer or Infinity.": "请使用十进制整数或 Infinity。",
  "Backward context must be at least 1.": "向后上下文至少为 1。",
  "Forward context must be at least 0.": "向前上下文至少为 0。",
  "The extent exceeds the largest safe integer.": "范围超过最大安全整数。",
  "Row order": "数据行顺序",
  "Binary accepts one consistent 0/1 numeric or false/true Boolean representation per Code.": "每个代码必须一致使用数字 0/1 或布尔 false/true 二元表示。",
  "Frequency accepts finite nonnegative numeric Code values, including decimals.": "频数接受有限且非负的代码数值，包括小数。",
  "Projection & Rotation": "投影与旋转",
  "Align target-fitted center to the origin": "将目标拟合中心对齐原点",
  "Set the ordered Means contrast in Units.": "在单位面板设置有方向的均值对比。",
  "Open Means contrast in Units": "在单位面板开启均值对比",
  "Direct Means rotation requires EndPoint. The Means selection is preserved.": "直接均值旋转需要端点模型；均值选择会保留。",
  "Choose SVD": "选择 SVD",
  "Choose Reference": "选择参考",
  "Return to EndPoint": "返回端点模型",
  "Reference source": "参考来源",
  "No Reference selected": "尚未选择参考",
  "Choose an owned validated Reference. The Reference selection remains active and Run is blocked.": "请选择已拥有且通过验证的参考；当前选择会保留，并阻止执行。",
  "Current owned Reference evidence is unavailable for this exact context.": "当前所选参考证据不适用于此精确上下文。",
  "The selected Reference is incompatible with this target. The selection is preserved.": "所选参考与此目标不兼容；选择会保留。",
  "Compatible with the current target configuration.": "与当前目标设置兼容。",
  "Reference evidence": "参考证据",
  "Content hash": "内容哈希",
  "Source fit": "来源拟合",
  "Source SVD": "来源 SVD",
  "Source Means": "来源均值",
  "Source population": "来源总体",
  "Endpoint Units": "端点单位",
  "Source observations": "来源观测",
  "Fixed basis": "固定基底",
  "Centering is fixed by the source Reference": "中心化由来源参考固定",
  "source fit aligned to origin": "来源拟合已对齐原点",
  "source fit center retained": "保留来源拟合中心",
  "Target projection": "目标投影",
  "No current target projection has been adopted.": "尚未采用当前目标投影。",
  "Compatibility details": "兼容性详情",
  "Execution resource preflight": "执行资源预检",
  "No current compiler-owned preflight is available for this exact scientific context.": "此精确科学上下文没有当前由编译器拥有的预检。",
  "Active raw Window input is invalid, so there is no executable plan or current estimate.": "启用中的原始窗口输入无效，因此没有可运行计划或当前估算。",
  "The active draft is invalid, so there is no executable plan or current estimate.": "启用中的草稿无效，因此没有可运行计划或当前估算。",
  "Current preflight admitted": "当前预检已准入",
  "Hard caps block execution; they never authorize truncating rows, Codes, windows, or data.": "硬性上限会阻止运行，绝不授权截断数据行、代码、窗口或数据。",
  "Ordered Network Analysis Window contract": "有序网络分析窗口契约",
  "Forward context is fixed at 0 for Ordered Network Analysis.": "有序网络分析的向前上下文固定为 0。",
  "Frequency weighting is fixed for Ordered Network Analysis.": "有序网络分析固定使用频数权重。",
  "EndPoint is fixed for Ordered Network Analysis.": "有序网络分析固定使用端点模型。",
  "SVD is fixed for Ordered Network Analysis.": "有序网络分析固定使用 SVD。",
  "Selected codes become the nodes in the model network.": "所选代码会成为模型网络中的节点。",
  "Analysis family": "分析系列",
  "Method boundary": "方法边界",
  "Undirected co-occurrence": "无向共现",
  "Standard boundary": "标准 ENA 边界",
  "Directed ground-response": "有向前项—响应",
  "ONA boundary": "ONA 边界",
  "Code actions": "代码操作",
  "Hide all code nodes": "隐藏所有代码节点",
  "Restore all code nodes": "恢复所有代码节点",
  "Exclude all selected Codes": "排除所有已选代码",
  "Select at least one Code before hiding nodes.": "请先选择至少一个代码，再隐藏节点。",
  "There are no selected Codes to exclude.": "没有可排除的已选代码。",
  "Selected Codes": "已选代码",
  "Type": "类型",
  "Positive rows": "正值数据行",
  "Numeric Binary": "数字二元",
  "Boolean Binary": "布尔二元",
  "Unavailable for this exact draft": "此精确草稿当前不可用",
  "Compiler diagnostics are unavailable for this exact draft.": "此精确草稿没有可用的编译器诊断。",
  "Press Alt+Arrow Up or Alt+Arrow Down to change display order.": "按 Alt+向上键或 Alt+向下键变更显示顺序。",
  "Display reorder is unavailable until selected Codes are distinct.": "已选代码互不相同后才能调整显示顺序。",
  "Display actions are unavailable until selected Codes are distinct.": "已选代码互不相同后才能使用显示操作。",
  "Restore all Codes before changing one Code visibility.": "变更单一代码可见性前，请先恢复所有代码。",
  "Manage Codes": "管理代码",
  "Close Code manager": "关闭代码管理器",
  "Compatible source fields can be selected. Incompatible fields remain visible with reasons.": "可选择兼容的来源字段；不兼容字段仍会显示原因。",
  "Missing from the current dataset": "当前数据集缺少此字段",
  "Used by an active scientific role": "正由启用中的科学角色使用",
  "Values do not use one uniform numeric 0/1 or Boolean representation": "值未一致使用数字 0/1 或布尔表示",
  "Values are not all finite nonnegative numbers": "并非所有值都是有限非负数",
  "Selected more than once; remove it to repair the draft": "重复选择；请移除重复项以修复草稿",
  "No codes selected": "尚未选择代码",
  "At least three distinct Codes are required to run a model.": "运行模型至少需要三个不同代码。",
  "Units, Horizons, Windows, Order, Rotation, and the other analysis family remain preserved.": "单位、视域、窗口、顺序、旋转及另一分析系列的设置都会保留。",
  "Undo Code exclusion": "撤销代码排除",
  "Sort by fields": "依字段排序",
  "Use source order": "使用来源顺序",
  "Add order key": "添加顺序键",
  "Choose a field": "选择字段",
  "Direction": "方向",
  "Comparator": "比较器",
  "Ordered category": "有序类别",
  "Ordered category levels": "有序类别层级",
  "Add category level": "添加类别层级",
  "Value type": "值类型",
  "Value": "值",
  "Locale": "区域设置",
  "Sensitivity": "敏感度",
  "Base": "基础",
  "Accent": "重音",
  "Case": "大小写",
  "Variant": "变体",
  "Numeric collation": "数字排序",
  "Complete every active order field before running.": "运行前请完成所有启用中的顺序字段。",
  "I confirm the observed source sequence for this exact dataset and field context.": "我确认此精确数据集与字段情境中观测到的来源序列。",
  "Review source-order statement": "查看来源顺序声明",
  "Accept statement": "接受声明",
  "Source order explicitly confirmed": "已明确确认来源顺序",
  "Source order is not confirmed": "尚未确认来源顺序",
  "The dataset or scientific context changed. Review the statement again.": "数据集或科学上下文已更改；请重新查看声明。",
  "Relevant fields": "相关字段",
  "Confirmation version": "确认版本",
  "Confirmed at": "确认时间",
  "Unavailable for this context": "此上下文当前不可用",
  "Correlation goodness-of-fit statistics are unavailable in this native model bundle; no correlation test is claimed.": "此原生模型套件不提供相关拟合优度统计，因此不声称已执行相关检验。",
  "These descriptive values belong to the retained historical model.": "这些描述值属于保留的历史模型。",
  "These values belong to the current bound model.": "这些值属于当前绑定模型。",
  "Researcher-requested post-model inference": "研究者请求的模型后推断",
  "Native comparison statistics": "原生比较统计",
  "Repeated-measures omnibus statistics": "重复测量总体统计",
  "Selected-request followup statistics": "所选请求的后续统计",
  "Observed inference population": "观测到的推断总体",
  "Target variance along fixed Reference axes": "固定参考轴上的目标方差",
  "Variance in the fitted space": "拟合空间中的方差",
  "Review imported artifact": "查看导入成果",
  "Current draft": "当前草稿",
  "Imported draft": "导入的草稿",
  "Cancel import": "取消导入",
  "Replace configuration": "替换设置",
  "Load configuration": "加载设置",
  "Keep read-only historical result": "保留只读历史结果",
  "Add Reference": "添加参考",
  "This result is historical. Its configuration is loaded only by an explicit action.": "这是历史结果；只有明确操作才会加载其设置。",
  "Accepting an artifact does not start a model. References are added without selecting Rotation.": "接受成果不会启动模型；添加参考时不会选择旋转。",
  "Legacy schema 2 analysis packages cannot become a v3 Reference because they do not contain the required fitted basis evidence.": "旧版 schema 2 分析套件缺少必要的拟合基底证据，因此不能成为 v3 参考。",
  "A presentation preset hides this Group. Clear preset Group hiding to use these saved controls; individual Unit preferences are retained.": "呈现预设隐藏了此组。清除预设组隐藏后即可使用这些已保存控件；个别单位偏好仍会保留。",
  "All Groups are hidden. Restore Group visibility to use these saved controls; individual Unit preferences are retained.": "所有组均已隐藏。恢复组可见性后即可使用这些已保存控件；个别单位偏好仍会保留。",
  "Native trajectory display summaries do not provide confidence or outlier intervals. These saved interval preferences do not apply to this view.": "原生轨迹显示摘要不提供置信区间或离群区间；已保存的区间偏好不适用于此视图。",
};

const MODEL_SHORT_LOCALES_V3: Readonly<Record<string, readonly [string, string]>> = {
  "Model configuration": ["模型設定", "模型设置"], Units: ["單位", "单位"], Horizons: ["視域", "视域"], Windows: ["窗口", "窗口"], Codes: ["代碼", "代码"],
  "About Units settings": ["關於單位設定", "关于单位设置"], "Units help": ["單位說明", "单位帮助"], "Choose Unit fields.": ["選擇單位欄位。", "选择单位字段。"],
  "About Horizons settings": ["關於視域設定", "关于视域设置"], "Horizons help": ["視域說明", "视域帮助"], "Choose Horizon fields.": ["選擇視域欄位。", "选择视域字段。"],
  "About Windows settings": ["關於窗口設定", "关于窗口设置"], "Windows help": ["窗口說明", "窗口帮助"], "Choose a Window.": ["選擇窗口類型及其精確情境範圍。", "选择窗口类型及其精确情境范围。"],
  "About Codes settings": ["關於代碼設定", "关于代码设置"], "Codes help": ["代碼說明", "代码帮助"], "Choose Code fields.": ["選擇代碼欄位。", "选择代码字段。"],
  "Model status": ["模型狀態", "模型状态"], "Configuration incomplete": ["設定未完成", "设置未完成"], "Configuration ready": ["設定已就緒", "设置已就绪"], "No result": ["沒有結果", "没有结果"], Running: ["執行中", "运行中"], "Current result": ["目前結果", "当前结果"], "Stale result": ["過期結果", "过期结果"], "Run error": ["執行錯誤", "运行错误"], "Obsolete run": ["已淘汰的執行", "已淘汰的运行"], "Cancelled run": ["已取消的執行", "已取消的运行"],
  "Scientific configuration": ["科學設定", "科学设置"], Family: ["分析系列", "分析系列"], Model: ["模型", "模型"], Window: ["窗口", "窗口"], Weighting: ["權重", "权重"], Rotation: ["旋轉", "旋转"], "Units count": ["單位數量", "单位数量"], "Horizons count": ["視域數量", "视域数量"], "Groups count": ["群組數量", "组数量"], "Codes count": ["代碼數量", "代码数量"],
  "Standard ENA": ["標準 ENA", "标准 ENA"], "Ordered Network Analysis": ["有序網絡分析", "有序网络分析"], "End Point": ["端點", "端点"], "Separate Trajectory": ["分離軌跡", "分离轨迹"], "Accumulated Trajectory": ["累積軌跡", "累积轨迹"], "Moving Stanza": ["移動節段", "移动节段"], Conversation: ["對話", "对话"], Binary: ["二元", "二元"], Frequency: ["頻數", "频数"], "Frequency (sum)": ["頻數（總和）", "频数（总和）"], Means: ["均值", "均值"], Reference: ["參考", "参考"], Unavailable: ["不可用", "不可用"],
  "Model diagnostics": ["模型診斷", "模型诊断"], "Global diagnostics": ["全域診斷", "全局诊断"], Dataset: ["資料集", "数据集"], Resources: ["資源", "资源"], Migration: ["遷移", "迁移"], Error: ["錯誤", "错误"], Warning: ["警告", "警告"], Information: ["資訊", "信息"], Evidence: ["證據", "证据"], "More evidence is available": ["尚有更多證據", "尚有更多证据"], "Confirm scientific change": ["確認科學設定變更", "确认科学设置更改"], Confirm: ["確認", "确认"], Cancel: ["取消", "取消"],
  Field: ["欄位", "字段"], Direction: ["方向", "方向"], Ascending: ["升序", "升序"], Descending: ["降序", "降序"], Comparator: ["比較器", "比较器"], Number: ["數字", "数字"], Text: ["文字", "文本"], Boolean: ["布林值", "布尔值"], String: ["字串", "字符串"], Locale: ["語系", "语言区域"], Sensitivity: ["敏感度", "敏感度"], Value: ["值", "值"], Diagnostics: ["診斷", "诊断"], Type: ["類型", "类型"],
  Unit: ["單位", "单位"], Horizon: ["視域", "视域"], Source: ["來源", "来源"], Selected: ["已選", "已选"], "Date (YYYY-MM-DD)": ["日期（YYYY-MM-DD）", "日期（YYYY-MM-DD）"],
  "Datetime (ISO-8601, offset in value)": ["日期時間（ISO-8601，值內含時區偏移）", "日期时间（ISO-8601，值内含时区偏移）"],
};

function translateModelTextV3(locale: NativeModelLocaleV3, input: string): string {
  if (locale === "en" || input === "—" || input === "SVD" || input === "true" || input === "false" || /^[\d.×/()\s-]+$/u.test(input)) return input;
  const exact = locale === "zh-hant" ? MODEL_EXACT_ZH_HANT_V3[input] : MODEL_EXACT_ZH_HANS_V3[input];
  const localized = exact ?? MODEL_SHORT_LOCALES_V3[input]?.[locale === "zh-hant" ? 0 : 1];
  if (localized === undefined) throw new Error(`Missing Models v3 ${locale} copy for: ${input}`);
  return localized;
}

function localizeModelTreeV3<T>(value: T, locale: NativeModelLocaleV3): T {
  if (typeof value === "string") return translateModelTextV3(locale, value) as T;
  if (typeof value === "function") {
    return ((...args: unknown[]) => translateModelTextV3(locale, (value as (...values: unknown[]) => string)(...args))) as T;
  }
  if (Array.isArray(value)) return value.map((item) => localizeModelTreeV3(item, locale)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeModelTreeV3(item, locale)])) as T;
  }
  return value;
}

const DIAGNOSTIC_SUMMARIES_V3: Readonly<Record<OpenEnaModelDiagnosticIdV3, readonly [string, string, string]>> = {
  STANDARD_DATASET_BINDING_INVALID: ["Dataset binding is invalid", "資料集綁定無效", "数据集绑定无效"],
  STANDARD_UNITS_REQUIRED: ["Select at least one Unit identity field", "請選擇至少一個單位識別欄位", "请选择至少一个单位标识字段"],
  STANDARD_HORIZONS_REQUIRED: ["Select at least one Horizon identity field", "請選擇至少一個視域識別欄位", "请选择至少一个视域标识字段"],
  STANDARD_IDENTITY_MISSING: ["A selected identity is missing", "所選識別值有缺失", "所选标识值有缺失"],
  STANDARD_IDENTITY_VALUE_UNSUPPORTED: ["An identity value has an unsupported type", "識別值使用不支援的類型", "标识值使用不支持的类型"],
  STANDARD_CODES_TOO_FEW: ["Select at least three distinct Codes", "請選擇至少三個不同代碼", "请选择至少三个不同代码"],
  STANDARD_CODES_DUPLICATE_SELECTION: ["Remove duplicate Code selections", "請移除重複的代碼選擇", "请移除重复的代码选择"],
  STANDARD_CODE_FIELD_MISSING: ["A selected Code field is missing", "所選代碼欄位不存在", "所选代码字段不存在"],
  STANDARD_CODE_ROLE_COLLISION: ["A Code conflicts with an active structural role", "代碼與啟用中的結構角色衝突", "代码与启用中的结构角色冲突"],
  STANDARD_CODE_VALUE_INVALID: ["Code values violate the selected weighting domain", "代碼值違反所選權重值域", "代码值违反所选权重值域"],
  STANDARD_CODE_ALL_ZERO: ["A selected Code is zero for every row", "所選代碼在所有資料列均為零", "所选代码在所有数据行均为零"],
  STANDARD_CODE_ISOLATED: ["A selected Code has no candidate co-occurrence", "所選代碼沒有候選共現", "所选代码没有候选共现"],
  STANDARD_CODE_DUPLICATE_PROFILE: ["Selected Codes have duplicate value profiles", "所選代碼具有重複值分布", "所选代码具有重复值分布"],
  STANDARD_NO_GLOBAL_COOCCURRENCE: ["No candidate Code pair co-occurs", "沒有候選代碼配對共現", "没有候选代码配对共现"],
  STANDARD_GROUP_FIELD_MISSING: ["The selected Group field or value is missing", "所選群組欄位或值缺失", "所选组字段或值缺失"],
  STANDARD_GROUP_UNSTABLE_WITHIN_UNIT: ["Group must remain stable within each Unit", "群組在每個單位內必須保持穩定", "组在每个单位内必须保持稳定"],
  STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS: ["Shared Horizons are allowed and kept separate by Unit", "共用視域是允許的，並會按單位分開", "共享视域是允许的，并会按单位分开"],
  STANDARD_ROW_ORDER_REQUIRED: ["Moving Stanza requires an explicit row order", "移動節段需要明確的資料列順序", "移动节段需要明确的数据行顺序"],
  STANDARD_ROW_ORDER_INVALID: ["The row order cannot be resolved", "無法解析資料列順序", "无法解析数据行顺序"],
  STANDARD_HORIZON_ORDER_REQUIRED: ["Trajectory models require an explicit Horizon order", "軌跡模型需要明確的視域順序", "轨迹模型需要明确的视域顺序"],
  STANDARD_HORIZON_ORDER_INVALID: ["The Horizon order cannot be resolved", "無法解析視域順序", "无法解析视域顺序"],
  STANDARD_HORIZON_ORDER_UNRESOLVED_TIE: ["Add a key to resolve tied Horizon positions", "請新增順序鍵以解決視域同值", "请添加顺序键以解决视域同值"],
  STANDARD_SOURCE_ORDER_CONFIRMATION_STALE: ["Review the source-order confirmation again", "請重新檢視來源順序確認", "请重新查看来源顺序确认"],
  STANDARD_MEANS_REQUIRES_ENDPOINT: ["Direct Means rotation requires an End Point model", "直接均值旋轉需要端點模型", "直接均值旋转需要端点模型"],
  STANDARD_MEANS_GROUP_REQUIRED: ["Means rotation requires a stable Group", "均值旋轉需要穩定群組", "均值旋转需要稳定组"],
  STANDARD_MEANS_LEVEL_REQUIRED: ["Select both ordered Means levels", "請選擇兩個有方向的均值層級", "请选择两个有方向的均值层级"],
  STANDARD_MEANS_LEVEL_EMPTY: ["A selected Means level has no eligible Unit network", "所選均值層級沒有符合資格的單位網絡", "所选均值层级没有符合资格的单位网络"],
  STANDARD_MEANS_IDENTICAL: ["Means levels must be distinct and produce a nonzero contrast", "均值層級必須不同且產生非零對比", "均值层级必须不同且产生非零对比"],
  STANDARD_TRAJECTORY_HAS_NO_PATH: ["No Unit has a fitted multi-step trajectory path", "沒有單位具有擬合的多步軌跡路徑", "没有单位具有拟合的多步轨迹路径"],
  STANDARD_TRAJECTORY_SINGLE_STEP_UNITS: ["Some Units have one fitted trajectory step", "部分單位只有一個擬合軌跡步驟", "部分单位只有一个拟合轨迹步骤"],
  STANDARD_TARGET_RANK_ZERO: ["The target network space has rank zero", "目標網絡空間的秩為零", "目标网络空间的秩为零"],
  STANDARD_SVD_ONE_DIMENSIONAL: ["The SVD model is valid with one axis; two-axis consumers remain unavailable", "SVD 模型以單一軸有效；雙軸消費者仍不可用", "SVD 模型以单一轴有效；双轴消费者仍不可用"],
  STANDARD_REFERENCE_MISSING: ["Select an owned Reference with its expected digest", "請選擇具預期摘要的已擁有參考", "请选择具预期摘要的已拥有参考"],
  STANDARD_REFERENCE_INCOMPATIBLE: ["The selected Reference is incompatible with this target", "所選參考與此目標不相容", "所选参考与此目标不兼容"],
  STANDARD_REFERENCE_TARGET_DEGENERATE: ["Reference projection remains valid although the target has rank zero", "即使目標秩為零，參考投影仍然有效", "即使目标秩为零，参考投影仍然有效"],
  STANDARD_OUTPUT_NONFINITE: ["The fitted output contains a nonfinite value", "擬合輸出包含非有限值", "拟合输出包含非有限值"],
  RESOURCE_BUDGET_EXCEEDED: ["The exact execution estimate exceeds a hard resource limit", "精確執行估算超出硬性資源上限", "精确运行估算超出硬性资源上限"],
  ONA_DATASET_BINDING_INVALID: ["ONA dataset binding is invalid", "ONA 資料集綁定無效", "ONA 数据集绑定无效"],
  ONA_DATASET_EMPTY: ["ONA requires at least one source row", "ONA 至少需要一個來源資料列", "ONA 至少需要一个来源数据行"],
  ONA_DATASET_FIELD_INVALID: ["An ONA structural field is missing or invalid", "ONA 結構欄位缺失或無效", "ONA 结构字段缺失或无效"],
  ONA_ORDER_INVALID: ["ONA requires one valid explicit response order", "ONA 需要一個有效的明確回應順序", "ONA 需要一个有效的明确回应顺序"],
  ONA_GROUP_UNSTABLE: ["ONA Group must remain stable within each Unit", "ONA 群組在每個單位內必須保持穩定", "ONA 组在每个单位内必须保持稳定"],
  ONA_CODE_ALL_ZERO: ["An ONA Code is zero for every row", "ONA 代碼在所有資料列均為零", "ONA 代码在所有数据行均为零"],
  ONA_NO_ENABLED_CONNECTION: ["No positive ordered ONA connection remains", "沒有保留正值的 ONA 有序連線", "没有保留正值的 ONA 有序连接"],
  ONA_NUMERICAL_INVALID: ["ONA numerical accumulation produced an invalid value", "ONA 數值累積產生無效值", "ONA 数值累积产生无效值"],
  ONA_TARGET_RANK_ZERO: ["The ONA target network space has rank zero", "ONA 目標網絡空間的秩為零", "ONA 目标网络空间的秩为零"],
  ONA_ZERO_NETWORK_UNITS: ["Some ONA Units have zero directed network mass", "部分 ONA 單位的有向網絡總量為零", "部分 ONA 单位的有向网络总量为零"],
  ONA_SVD_ONE_DIMENSIONAL: ["The ONA SVD model is valid with one axis", "ONA SVD 模型以單一軸有效", "ONA SVD 模型以单一轴有效"],
  ONA_DRAFT_INVALID: ["The ONA draft violates its fixed scientific contract", "ONA 草稿違反固定科學契約", "ONA 草稿违反固定科学契约"],
  ONA_RESOURCE_BUDGET_EXCEEDED: ["The exact ONA estimate exceeds a hard resource limit", "精確 ONA 估算超出硬性資源上限", "精确 ONA 估算超出硬性资源上限"],
};

const DIAGNOSTIC_GUIDANCE_V3: Readonly<Record<OpenEnaModelDiagnosticIdV3, readonly [string, string, string]>> = {
  STANDARD_DATASET_BINDING_INVALID: ["Reopen the exact admitted source so its rows, headers, digest, and hash kind agree.", "重新開啟精確准入來源，使資料列、欄位、摘要及雜湊種類一致。", "重新打开精确准入来源，使数据行、字段、摘要及哈希类型一致。"],
  STANDARD_UNITS_REQUIRED: ["Add current source fields to the ordered Unit identity.", "將目前來源欄位加入有序單位識別。", "将当前来源字段加入有序单位标识。"],
  STANDARD_HORIZONS_REQUIRED: ["Add current source fields to the ordered Horizon identity.", "將目前來源欄位加入有序視域識別。", "将当前来源字段加入有序视域标识。"],
  STANDARD_IDENTITY_MISSING: ["Use present fields and nonmissing values on every affected row.", "為每個受影響資料列使用存在的欄位及非缺失值。", "为每个受影响数据行使用存在的字段及非缺失值。"],
  STANDARD_IDENTITY_VALUE_UNSUPPORTED: ["Identity fields accept supported scalar strings, finite numbers, or Booleans.", "識別欄位只接受受支援的純量字串、有限數字或布林值。", "标识字段只接受受支持的标量字符串、有限数字或布尔值。"],
  STANDARD_CODES_TOO_FEW: ["Select three different nonblank current fields as Codes.", "選擇三個不同且非空白的目前欄位作為代碼。", "选择三个不同且非空白的当前字段作为代码。"],
  STANDARD_CODES_DUPLICATE_SELECTION: ["Remove repeated Code selections; display order cannot disambiguate them.", "移除重複代碼選擇；顯示順序無法辨別它們。", "移除重复代码选择；显示顺序无法区分它们。"],
  STANDARD_CODE_FIELD_MISSING: ["Remove the unavailable choice or reopen a source containing that exact field.", "移除不可用選擇，或重新開啟包含該精確欄位的來源。", "移除不可用选择，或重新打开包含该精确字段的来源。"],
  STANDARD_CODE_ROLE_COLLISION: ["Use another Code or remove the field from its conflicting structural role.", "使用其他代碼，或將該欄位從衝突的結構角色移除。", "使用其他代码，或将该字段从冲突的结构角色移除。"],
  STANDARD_CODE_VALUE_INVALID: ["Binary requires one homogeneous numeric 0/1 or Boolean false/true representation per Code; Frequency requires finite nonnegative numbers.", "二元權重要求每個代碼一致使用數字 0/1 或布林 false/true；頻數權重要求有限非負數。", "二元权重要求每个代码一致使用数字 0/1 或布尔 false/true；频数权重要求有限非负数。"],
  STANDARD_CODE_ALL_ZERO: ["Exclude the exact Code or correct its source values; all-zero nodes cannot contribute.", "排除精確代碼或修正來源值；全零節點無法作出貢獻。", "排除精确代码或修正来源值；全零节点无法作出贡献。"],
  STANDARD_CODE_ISOLATED: ["Inspect its windowed relation or explicitly confirm exclusion; selection is retained.", "檢視其窗口化關係或明確確認排除；選擇會保留。", "查看其窗口化关系或明确确认排除；选择会保留。"],
  STANDARD_CODE_DUPLICATE_PROFILE: ["Verify why distinct Code fields carry the same typed row profile.", "核對不同代碼欄位為何具有相同的類型化資料列分布。", "核对不同代码字段为何具有相同的类型化数据行分布。"],
  STANDARD_NO_GLOBAL_COOCCURRENCE: ["Review the diagnostic severity and blocked capabilities. SVD or Means needs an eligible co-occurrence, while a compatible fixed Reference can retain a valid projection and report this as a warning.", "請檢視診斷嚴重程度及被阻擋的功能。SVD 或均值旋轉需要符合資格的共現；相容的固定參考仍可保留有效投影，並將此情況報告為警告。", "请查看诊断严重程度及被阻止的功能。SVD 或均值旋转需要符合资格的共现；兼容的固定参考仍可保留有效投影，并将此情况报告为警告。"],
  STANDARD_GROUP_FIELD_MISSING: ["Choose a current Group field with supported nonmissing values.", "選擇具有受支援非缺失值的目前群組欄位。", "选择具有受支持非缺失值的当前组字段。"],
  STANDARD_GROUP_UNSTABLE_WITHIN_UNIT: ["Repair values so every typed Unit belongs to at most one Group.", "修正值，使每個類型化單位最多屬於一個群組。", "修正值，使每个类型化单位最多属于一个组。"],
  STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS: ["This information does not block model construction; typed Unit identities keep the paths separate.", "此資訊不會阻止模型建立；類型化單位識別會保持路徑分離。", "此信息不会阻止模型建立；类型化单位标识会保持路径分离。"],
  STANDARD_ROW_ORDER_REQUIRED: ["Define order keys or confirm the observed source sequence for this context.", "定義順序鍵，或為此情境確認觀察到的來源序列。", "定义顺序键，或为此情境确认观测到的来源序列。"],
  STANDARD_ROW_ORDER_INVALID: ["Complete keys and repair missing, duplicate, tied, or invalid comparator values.", "完成順序鍵並修正缺失、重複、同值或無效比較器值。", "完成顺序键并修正缺失、重复、同值或无效比较器值。"],
  STANDARD_HORIZON_ORDER_REQUIRED: ["Define Horizon keys or confirm the exact observed Horizon sequence.", "定義視域順序鍵，或確認觀察到的精確視域序列。", "定义视域顺序键，或确认观测到的精确视域序列。"],
  STANDARD_HORIZON_ORDER_INVALID: ["Complete every Horizon key with current fields and valid comparators.", "使用目前欄位及有效比較器完成每個視域順序鍵。", "使用当前字段及有效比较器完成每个视域顺序键。"],
  STANDARD_HORIZON_ORDER_UNRESOLVED_TIE: ["Add a deterministic key; source index is never a silent tie-breaker.", "新增確定性順序鍵；來源索引絕不會靜默打破同值。", "添加确定性顺序键；来源索引绝不会静默打破同值。"],
  STANDARD_SOURCE_ORDER_CONFIRMATION_STALE: ["Dataset, family, rows, or relevant fields changed; bind a new confirmation.", "資料集、系列、資料列或相關欄位已變更；請綁定新確認。", "数据集、系列、数据行或相关字段已更改；请绑定新确认。"],
  STANDARD_MEANS_REQUIRES_ENDPOINT: ["The Means choice is retained; return to End Point or select another rotation deliberately.", "均值選擇會保留；請返回端點模型或明確選擇其他旋轉。", "均值选择会保留；请返回端点模型或明确选择其他旋转。"],
  STANDARD_MEANS_GROUP_REQUIRED: ["Choose a current Group field stable within every typed Unit.", "選擇在每個類型化單位內穩定的目前群組欄位。", "选择在每个类型化单位内稳定的当前组字段。"],
  STANDARD_MEANS_LEVEL_REQUIRED: ["Select explicit negative and positive levels; order defines MR1 direction.", "明確選擇負向及正向層級；順序定義 MR1 方向。", "明确选择负向及正向层级；顺序定义 MR1 方向。"],
  STANDARD_MEANS_LEVEL_EMPTY: ["Choose an observed level with an eligible nonzero Unit network.", "選擇具有符合資格非零單位網絡的已觀察層級。", "选择具有符合资格非零单位网络的已观测层级。"],
  STANDARD_MEANS_IDENTICAL: ["This covers identical typed selections and distinct selections whose sphere-normalized group means are identical.", "此條件涵蓋相同的類型化選擇，也涵蓋選擇不同但球面正規化群組均值相同的情況。", "此条件涵盖相同的类型化选择，也涵盖选择不同但球面归一化组均值相同的情况。"],
  STANDARD_TRAJECTORY_HAS_NO_PATH: ["Review Horizon order and coverage; one Unit needs multiple fitted steps.", "檢視視域順序及涵蓋；至少一個單位需要多個擬合步驟。", "查看视域顺序及覆盖；至少一个单位需要多个拟合步骤。"],
  STANDARD_TRAJECTORY_SINGLE_STEP_UNITS: ["The model remains buildable; these Units contribute observations but no multi-step path segment.", "模型仍可建立；這些單位提供觀測，但沒有多步路徑線段。", "模型仍可建立；这些单位提供观测，但没有多步路径线段。"],
  STANDARD_TARGET_RANK_ZERO: ["Revise Code selection or variation; SVD and direct Means need a nonzero target basis.", "修訂代碼選擇或變異；SVD 及直接均值需要非零目標基底。", "修订代码选择或变异；SVD 及直接均值需要非零目标基底。"],
  STANDARD_SVD_ONE_DIMENSIONAL: ["The fitted model remains valid; consumers requiring two supported axes, including AI interpretation, remain unavailable.", "擬合模型仍然有效；需要兩個受支援軸的消費者（包括 AI 解讀）仍不可用。", "拟合模型仍然有效；需要两个受支持轴的消费者（包括 AI 解读）仍不可用。"],
  STANDARD_REFERENCE_MISSING: ["Select an owned validated Reference with its exact expected content digest.", "選擇具有精確預期內容摘要的已擁有有效參考。", "选择具有精确预期内容摘要的已拥有有效参考。"],
  STANDARD_REFERENCE_INCOMPATIBLE: ["Match Code identity/order, weighting, family, and fixed basis before projection.", "投影前配對代碼識別／順序、權重、系列及固定基底。", "投影前匹配代码标识／顺序、权重、系列及固定基底。"],
  STANDARD_REFERENCE_TARGET_DEGENERATE: ["The fixed Reference projection remains valid; only target-derived rank interpretation is degenerate.", "固定參考投影仍然有效；只有目標衍生的秩解讀退化。", "固定参考投影仍然有效；只有目标派生的秩解读退化。"],
  STANDARD_OUTPUT_NONFINITE: ["Review source magnitude; nonfinite fitted coordinates or weights are rejected.", "檢視來源量級；非有限擬合座標或權重會被拒絕。", "查看来源量级；非有限拟合坐标或权重会被拒绝。"],
  RESOURCE_BUDGET_EXCEEDED: ["A hard cap blocks execution and never authorizes truncating rows, Codes, windows, or data.", "硬性上限會阻止執行，且絕不授權截斷資料列、代碼、窗口或資料。", "硬性上限会阻止运行，且绝不授权截断数据行、代码、窗口或数据。"],
  ONA_DATASET_BINDING_INVALID: ["Reopen the exact admitted ONA source so binding fields and digest agree.", "重新開啟精確准入的 ONA 來源，使綁定欄位與摘要一致。", "重新打开精确准入的 ONA 来源，使绑定字段与摘要一致。"],
  ONA_DATASET_EMPTY: ["Provide source rows; ONA does not invent an empty directed result.", "提供來源資料列；ONA 不會虛構空白有向結果。", "提供来源数据行；ONA 不会虚构空白有向结果。"],
  ONA_DATASET_FIELD_INVALID: ["Use present structural and order fields with supported values.", "使用存在且具有受支援值的結構及順序欄位。", "使用存在且具有受支持值的结构及顺序字段。"],
  ONA_ORDER_INVALID: ["Complete explicit response order or bind a current source-order confirmation.", "完成明確回應順序，或綁定目前來源順序確認。", "完成明确回应顺序，或绑定当前来源顺序确认。"],
  ONA_GROUP_UNSTABLE: ["Repair values so every typed ONA Unit belongs to at most one Group.", "修正值，使每個類型化 ONA 單位最多屬於一個群組。", "修正值，使每个类型化 ONA 单位最多属于一个组。"],
  ONA_CODE_ALL_ZERO: ["Remove the exact Code or correct its values before directed accumulation.", "在有向累積前移除精確代碼或修正其值。", "在有向累积前移除精确代码或修正其值。"],
  ONA_NO_ENABLED_CONNECTION: ["Inspect positive Code values, typed Horizon boundaries, response order, backward-window extent, and the directional mask together. At least one positive ordered ground/source to response/target mass must survive all five conditions; changing the mask alone may not repair this draft.", "請一併檢查正值代碼、具類型的視域邊界、回應順序、向後窗口範圍及方向遮罩。至少一項由前項／來源指向回應／目標的正值有序質量必須通過全部五項條件；只改動遮罩未必能修復此草稿。", "请一并检查正值代码、带类型的视域边界、回应顺序、向后窗口范围及方向遮罩。至少一项由前项／来源指向回应／目标的正值有序质量必须通过全部五项条件；只更改遮罩未必能修复此草稿。"],
  ONA_NUMERICAL_INVALID: ["Review magnitude and order; overflow, underflow, and nonfinite products reject.", "檢視量級及順序；溢位、下溢及非有限乘積會被拒絕。", "查看量级及顺序；溢出、下溢及非有限乘积会被拒绝。"],
  ONA_TARGET_RANK_ZERO: ["The admitted descriptive geometry remains available and this diagnostic does not block the model. If independent variation was expected, inspect Code values, order, backward window, and mask before rebuilding.", "已准入的描述幾何仍可使用，此診斷不會阻擋模型。若原本預期有獨立變異，請在重建前檢查代碼值、順序、向後窗口及遮罩。", "已准入的描述几何仍可使用，此诊断不会阻止模型。若原本预期有独立变异，请在重建前检查代码值、顺序、向后窗口及遮罩。"],
  ONA_ZERO_NETWORK_UNITS: ["The descriptive model remains available; affected Units carry zero directed mass.", "描述性模型仍可用；受影響單位的有向總量為零。", "描述性模型仍可用；受影响单位的有向总量为零。"],
  ONA_SVD_ONE_DIMENSIONAL: ["The fitted ONA model remains valid on its single supported axis.", "擬合的 ONA 模型在其單一受支援軸上仍然有效。", "拟合的 ONA 模型在其单一受支持轴上仍然有效。"],
  ONA_DRAFT_INVALID: ["Restore fixed End Point, SVD, Frequency-sum, backward-only, and mask fields.", "還原固定端點、SVD、頻數總和、僅向後及遮罩欄位。", "恢复固定端点、SVD、频数总和、仅向后及遮罩字段。"],
  ONA_RESOURCE_BUDGET_EXCEEDED: ["A hard cap blocks execution and never authorizes truncating the ordered source or directed matrix.", "硬性上限會阻止執行，且絕不授權截斷有序來源或有向矩陣。", "硬性上限会阻止运行，且绝不授权截断有序来源或有向矩阵。"],
};

function diagnosticMessagesV3(locale: NativeModelLocaleV3): OpenEnaModelV3Copy["diagnosticMessages"] {
  return Object.fromEntries(MODEL_DIAGNOSTIC_IDS_ALL_V3.map((id) => [id, {
    summary: () => DIAGNOSTIC_SUMMARIES_V3[id][locale === "en" ? 0 : locale === "zh-hant" ? 1 : 2],
    detail: (input: OpenEnaModelDiagnosticLocalizationInputV3) => {
      const field = input.fieldPath ?? input.scope;
      const count = input.evidence?.totalCount;
      const summary = DIAGNOSTIC_SUMMARIES_V3[id][locale === "en" ? 0 : locale === "zh-hant" ? 1 : 2];
      const guidance = DIAGNOSTIC_GUIDANCE_V3[id][locale === "en" ? 0 : locale === "zh-hant" ? 1 : 2];
      if (locale === "en") return `${summary}. Inspect ${field}${count === undefined ? "" : `; ${count} affected items are reported`}. ${guidance}`;
      return locale === "zh-hant" ? `${summary}。請檢視 ${field}${count === undefined ? "" : `；目前報告 ${count} 個受影響項目`}。${guidance}`
        : `${summary}。请查看 ${field}${count === undefined ? "" : `；当前报告 ${count} 个受影响项目`}。${guidance}`;
    },
  }])) as unknown as OpenEnaModelV3Copy["diagnosticMessages"];
}

function actionIdentityV3(input: ModelSuggestedActionLocalizationInputV3): string {
  switch (input.patch.type) {
    case "exclude-code": return input.patch.code;
    case "select-model": return input.patch.value;
    case "select-rotation": return input.patch.value;
    case "replace-row-order": return "rowOrder";
    case "replace-horizon-order": return "horizonOrder";
    case "clear-group": return "group";
  }
}

function suggestedActionMessagesV3(locale: NativeModelLocaleV3): OpenEnaModelV3Copy["suggestedActions"] {
  return Object.fromEntries(MODEL_SUGGESTED_ACTION_IDS_V3.map((id) => [id, {
    label: (input: ModelSuggestedActionLocalizationInputV3) => {
      const identity = actionIdentityV3(input);
      const enLabels: Record<ModelSuggestedActionIdV3, string> = {
        "exclude-code": `Exclude ${identity} Code`, "replace-row-order": "Use suggested row order",
        "replace-horizon-order": "Use suggested Horizon order", "select-endpoint": "Select End Point",
        "select-svd": "Select SVD", "select-reference": "Select Reference", "clear-group": "Clear Group selection",
      };
      const zhHantLabels: Record<ModelSuggestedActionIdV3, string> = {
        "exclude-code": `排除代碼 ${identity}`, "replace-row-order": "使用建議的資料列順序",
        "replace-horizon-order": "使用建議的視域順序", "select-endpoint": "選擇端點模型",
        "select-svd": "選擇 SVD", "select-reference": "選擇參考", "clear-group": "清除群組選擇",
      };
      const zhHansLabels: Record<ModelSuggestedActionIdV3, string> = {
        "exclude-code": `排除代码 ${identity}`, "replace-row-order": "使用建议的数据行顺序",
        "replace-horizon-order": "使用建议的视域顺序", "select-endpoint": "选择端点模型",
        "select-svd": "选择 SVD", "select-reference": "选择参考", "clear-group": "清除组选择",
      };
      return locale === "en" ? enLabels[id] : locale === "zh-hant" ? zhHantLabels[id] : zhHansLabels[id];
    },
    confirmation: (input: ModelSuggestedActionLocalizationInputV3) => locale === "en" ? `Confirm this scientific configuration change: ${actionIdentityV3(input)}.` : locale === "zh-hant" ? `確認套用此科學設定變更：${actionIdentityV3(input)}。` : `确认应用此科学设置更改：${actionIdentityV3(input)}。`,
  }])) as OpenEnaModelV3Copy["suggestedActions"];
}

const nativeStatsCopyEnV3: NativeStatsCopyV3 = {
  unavailable: "Correlation goodness-of-fit statistics are unavailable in this native model bundle; no correlation test is claimed.",
  historical: "These descriptive values belong to the retained historical model.", current: "These values belong to the current bound model.",
  inferred: "Researcher-requested post-model inference", rows: "Native comparison statistics", omnibus: "Repeated-measures omnibus statistics",
  followups: "Selected-request followup statistics", ledger: "Observed inference population", fixedVariance: "Target variance along fixed Reference axes", fittedVariance: "Variance in the fitted space",
};

const importPreviewCopyEnV3: OpenEnaImportPreviewCopyV3 = {
  title: "Review imported artifact", field: "Field", before: "Current draft", after: "Imported draft", cancel: "Cancel import",
  accept: "Replace configuration", loadConfiguration: "Load configuration", keepHistorical: "Keep read-only historical result",
  registerReference: "Add Reference", historical: "This result is historical. Its configuration is loaded only by an explicit action.",
  noAutoRun: "Accepting an artifact does not start a model. References are added without selecting Rotation.",
  legacyReference: "Legacy schema 2 analysis packages cannot become a v3 Reference because they do not contain the required fitted basis evidence.",
};

const groupApplicabilityEnV3 = {
  preset: "A presentation preset hides this Group. Clear preset Group hiding to use these saved controls; individual Unit preferences are retained.",
  global: "All Groups are hidden. Restore Group visibility to use these saved controls; individual Unit preferences are retained.",
  trajectoryIntervals: "Native trajectory display summaries do not provide confidence or outlier intervals. These saved interval preferences do not apply to this view.",
} as const;

function createWorkspaceCopyV3(locale: NativeModelLocaleV3): OpenEnaWorkspaceV3Copy {
  const t = (enValue: string, hantValue: string, hansValue: string) => locale === "en" ? enValue : locale === "zh-hant" ? hantValue : hansValue;
  return {
    configureTrajectory: t("Configure trajectory model", "設定軌跡模型", "设置轨迹模型"),
    resultStatus: { current: t("Current result", "目前結果", "当前结果"), stale: t("Retained stale result", "保留的過期結果", "保留的过期结果"), none: t("No result", "沒有結果", "没有结果") },
    runStatus: { idle: t("Idle", "閒置", "空闲"), running: t("Running", "執行中", "运行中"), error: t("Run error", "執行錯誤", "运行错误"), obsolete: t("Obsolete run", "已淘汰的執行", "已淘汰的运行"), cancelled: t("Cancelled run", "已取消的執行", "已取消的运行") },
    startingWorker: t("Starting model worker", "正在啟動模型工作程序", "正在启动模型工作进程"), workerStage: (stageId) => t(`Worker stage: ${stageId}`, `工作程序階段：${stageId}`, `工作进程阶段：${stageId}`), runModel: t("Run model", "執行模型", "运行模型"), cancelRun: t("Cancel run", "取消執行", "取消运行"),
    cancelPendingImport: t("Cancel pending import", "取消待處理匯入", "取消待处理导入"), operationFailed: t("The requested operation failed. Review the current configuration and try again.", "要求的操作失敗。請檢查目前設定後再試。", "请求的操作失败。请检查当前设置后重试。"),
    failures: {
      codedDataTooLarge: ({ limitMiB }) => t(`Coded data exceeds the ${limitMiB} MB limit (${limitMiB} MiB, ${limitMiB} × 1,024 × 1,024 bytes).`, `編碼資料超過 ${limitMiB} MB 上限（${limitMiB} MiB，即 ${limitMiB} × 1,024 × 1,024 位元組）。`, `编码数据超过 ${limitMiB} MB 上限（${limitMiB} MiB，即 ${limitMiB} × 1,024 × 1,024 字节）。`),
      artifactTooLarge: ({ limitMiB }) => t(`The imported artifact exceeds the ${limitMiB} MiB limit.`, `匯入成果超過 ${limitMiB} MiB 上限。`, `导入成果超过 ${limitMiB} MiB 上限。`),
      presetTooLarge: ({ limitMiB }) => t(`The presentation preset exceeds the ${limitMiB} MiB limit.`, `呈現預設超過 ${limitMiB} MiB 上限。`, `呈现预设超过 ${limitMiB} MiB 上限。`),
      sampleUnavailable: t("The teaching sample is currently unavailable. Try again after checking the local sample route.", "教學樣本目前不可用；請檢查本機樣本路徑後再試。", "教学样本当前不可用；请检查本机样本路径后重试。"),
      pngCanvasUnavailable: t("The browser could not prepare the PNG canvas.", "瀏覽器無法準備 PNG 畫布。", "浏览器无法准备 PNG 画布。"),
      pngEncodingFailed: t("The browser could not encode the PNG figure.", "瀏覽器無法編碼 PNG 圖形。", "浏览器无法编码 PNG 图形。"),
      pngRenderFailed: t("The browser could not render the SVG figure as PNG.", "瀏覽器無法將 SVG 圖形轉譯為 PNG。", "浏览器无法将 SVG 图形渲染为 PNG。"),
      operationFailed: t("The requested operation failed. Review the current configuration and try again.", "要求的操作失敗。請檢查目前設定後再試。", "请求的操作失败。请检查当前设置后重试。"),
    },
    dataView: {
      ariaLabel: t("Native Data View center surface", "原生資料檢視中央區域", "原生数据视图中央区域"),
      title: t("Data View", "資料檢視", "数据视图"),
      returnLabel: t("Return to Comparison", "返回比較圖", "返回比较图"),
      returnAriaLabel: t("Return to Comparison Plot", "返回比較圖", "返回比较图"),
      contextLabel: t("Show units in", "顯示以下範圍的單位", "显示以下范围的单位"),
      overall: t("Overall", "整體", "整体"), primary: t("Primary", "主要群組", "主组"), secondary: t("Secondary", "次要群組", "次组"),
      record: t("Data View record", "資料檢視記錄", "数据视图记录"), records: t("Data View records", "資料檢視記錄", "数据视图记录"),
      recordCount: (count) => t(`${count.toLocaleString("en-US")} ${count === 1 ? "Data View record" : "Data View records"}`, `共 ${count.toLocaleString("zh-Hant")} 筆資料檢視記錄`, `共 ${count.toLocaleString("zh-Hans")} 条数据视图记录`),
      exportLabel: t("Export CSV ↓", "匯出 CSV ↓", "导出 CSV ↓"), exportAriaLabel: t("Export Data View records as CSV", "將資料檢視記錄匯出為 CSV", "将数据视图记录导出为 CSV"), tableAriaLabel: t("Data View records", "資料檢視記錄", "数据视图记录"),
      previousPage: t("Previous page", "上一頁", "上一页"), nextPage: t("Next page", "下一頁", "下一页"),
      rowsShown: t("Rows {start}–{end} of {total} · Page {page} of {pages}", "資料列 {start}–{end}／{total} · 第 {page}／{pages} 頁", "数据行 {start}–{end}／{total} · 第 {page}／{pages} 页"),
      columnsShown: t("Variable columns {start}–{end} of {total} · Page {page} of {pages}", "變數欄 {start}–{end}／{total} · 第 {page}／{pages} 頁", "变量列 {start}–{end}／{total} · 第 {page}／{pages} 页"),
      rowPaginationLabel: t("Data View row pages", "資料檢視資料列分頁", "数据视图数据行分页"), columnPaginationLabel: t("Data View variable-column pages", "資料檢視變數欄分頁", "数据视图变量列分页"),
      provenanceGroup: t("Ordered provenance", "有序來源記錄", "有序来源记录"), metadataGroup: t("Metadata", "中繼資料", "元数据"),
      codeGroup: t("Normalized undirected edges", "正規化無向邊", "归一化无向边"), directedEdgeGroup: t("Normalized directed edges", "正規化有向邊", "归一化有向边"),
      yes: t("Yes", "是", "是"), no: t("No", "否", "否"),
      empty: t("No Data View records match this context.", "沒有符合此範圍的資料檢視記錄。", "没有符合此范围的数据视图记录。"),
      sourceIndexMeaning: t("Global retained source-row traversal uses zero-based indices. Per-point observed source membership is unavailable; these indices are not network contribution evidence. EndPoint observed Horizons are unavailable because the bound model retains no source-to-Unit membership.", "全域保留來源資料列走訪採用從零開始的索引。逐點觀測來源成員關係不可用；這些索引不是網絡貢獻證據。端點模型的觀測視域不可用，因為綁定模型不保留來源資料列到單位的成員關係。", "全局保留来源数据行遍历采用从零开始的索引。逐点观测来源成员关系不可用；这些索引不是网络贡献证据。端点模型的观测视域不可用，因为绑定模型不保留来源数据行到单位的成员关系。"),
      metadataLabels: {
        trajectoryOrdinal: t("Trajectory ordinal", "軌跡序位", "轨迹序位"),
        observedHorizons: t("Observed Horizons", "觀測視域", "观测视域"),
        observedSourceRowIndices: t("Observed source row indices (0-based)", "觀測來源資料列索引（從零開始）", "观测来源数据行索引（从零开始）"),
      },
      sourceTraversalLabels: {
        sourceRowIndex: t("Source row index", "來源資料列索引", "来源数据行索引"),
        runtimeOrdinal: t("Runtime ordinal", "執行時序位", "运行时序位"),
        horizon: t("Horizon identity", "視域識別", "视域标识"),
        withinHorizonOrdinal: t("Within-Horizon ordinal", "視域內序位", "视域内序位"),
      },
    },
    data: {
      ariaLabel: t("Data source", "資料來源", "数据来源"), title: t("Coded data", "編碼資料", "编码数据"), openFile: t("Open coded CSV or XLSX", "開啟編碼 CSV 或 XLSX", "打开编码 CSV 或 XLSX"),
      loadSample: t("Load sample", "載入樣本", "加载样本"), loadTrajectorySample: t("Load trajectory sample", "載入軌跡樣本", "加载轨迹样本"),
      sampleExplanation: t("Samples use versioned explicit type declarations and order policies, then run through the strict model compiler.", "樣本使用具版本的明確類型宣告與順序政策，再交由嚴格模型編譯器處理。", "样本使用带版本的明确类型声明与顺序策略，再交由严格模型编译器处理。"),
      importArtifact: t("Import configuration, result or Reference", "匯入設定、結果或參考", "导入设置、结果或参考"), artifactTooLarge: t("Artifact exceeds 16 MiB.", "成果超過 16 MiB。", "成果超过 16 MiB。"),
      reviewTypes: t("Review CSV source types", "檢視 CSV 來源類型", "查看 CSV 来源类型"), reviewTypesTitle: t("Review source column types", "檢視來源欄位類型", "查看来源字段类型"),
      typingExplanation: t("Text preserves identifiers and literal formula-looking text. Number accepts complete JSON decimal numbers without spaces or a plus sign; overflow, nonzero underflow and unsafe integers reject. Fractions use IEEE 754 rounding. Boolean accepts only literal true or false. Missing cells remain missing. Confirm creates a separate typed XLSX source; Code selection never converts values.", "文字會保留識別值及看似公式的原文。數字只接受不含空格或加號的完整 JSON 十進位數；溢位、非零下溢及不安全整數會被拒絕。小數依 IEEE 754 捨入。布林值只接受原文 true 或 false。缺失儲存格仍為缺失。確認後會建立獨立的具類型 XLSX 來源；選擇代碼絕不轉換值。", "文本会保留标识值及看似公式的原文。数字只接受不含空格或加号的完整 JSON 十进制数；溢出、非零下溢及不安全整数会被拒绝。小数依 IEEE 754 舍入。布尔值只接受原文 true 或 false。缺失单元格仍为缺失。确认后会建立独立的带类型 XLSX 来源；选择代码绝不转换值。"),
      sourceTypeLabel: (column) => t(`Source type: ${column}`, `來源類型：${column}`, `来源类型：${column}`), sourceTypes: { text: t("Text", "文字", "文本"), number: t("Number", "數字", "数字"), boolean: t("Boolean", "布林值", "布尔值") },
      missingCells: (count) => t(`${count} missing cells`, `${count} 個缺失儲存格`, `${count} 个缺失单元格`), collisions: (count) => t(`${count} potential identity collisions`, `${count} 個潛在識別衝突`, `${count} 个潜在标识冲突`), invalidCells: (count) => t(`${count} invalid cells.`, `${count} 個無效儲存格。`, `${count} 个无效单元格。`),
      sourceErrors: {
        "literal-text-required": t("CSV preparation requires literal source text cells.", "CSV 準備需要原文字串儲存格。", "CSV 准备需要原文本字符串单元格。"),
        "boolean-literal-required": t("Boolean requires literal true or false.", "布林值必須是原文 true 或 false。", "布尔值必须是原文 true 或 false。"),
        "number-token-required": t("Number requires a complete JSON decimal token.", "數字必須是完整的 JSON 十進位記號。", "数字必须是完整的 JSON 十进制记号。"),
        "number-range-invalid": t("Number overflows, underflows or loses integer precision.", "數字發生溢位、下溢或失去整數精度。", "数字发生溢出、下溢或失去整数精度。"),
      },
      cancelPreparation: t("Cancel source preparation", "取消來源準備", "取消来源准备"), confirmPreparation: t("Confirm types and create typed XLSX", "確認類型並建立具類型 XLSX", "确认类型并建立带类型 XLSX"), confirmPreparationDisabled: t("Resolve all invalid source cells before confirming types.", "確認類型前，請先處理所有無效來源儲存格。", "确认类型前，请先处理所有无效来源单元格。"),
      datasetSummary: (name, rows, hash, kind) => t(`${name} · ${rows} rows · ${hash} · ${kind ?? "unrecorded"}`, `${name} · ${rows} 個資料列 · ${hash} · ${kind ?? "未記錄"}`, `${name} · ${rows} 个数据行 · ${hash} · ${kind ?? "未记录"}`), sourceData: t("Source data", "來源資料", "来源数据"),
      downloadTyped: t("Download typed XLSX source", "下載具類型 XLSX 來源", "下载带类型 XLSX 来源"), downloadReceipt: t("Download source derivation receipt", "下載來源衍生收據", "下载来源派生收据"), downloadOriginal: t("Download original CSV", "下載原始 CSV", "下载原始 CSV"),
      historicalArtifact: (hash) => t(`Historical, read-only artifact ${hash}`, `歷史唯讀成果 ${hash}`, `历史只读成果 ${hash}`), reviewHistorical: t("Review historical configuration", "檢視歷史設定", "查看历史设置"),
      unavailableCell: t("Unavailable", "不可用", "不可用"), boundedRows: (shown, total) => t(`Showing the first ${shown} of ${total} rows. Exports retain all rows.`, `顯示前 ${shown}/${total} 個資料列；匯出會保留全部資料列。`, `显示前 ${shown}/${total} 个数据行；导出会保留全部数据行。`),
      codedDataTooLarge: t("Coded data exceeds 5 MB.", "編碼資料超過 5 MB。", "编码数据超过 5 MB。"), sampleUnavailable: t("The sample source is unavailable.", "樣本來源目前不可用。", "样本来源当前不可用。"),
    },
    onaMask: { legend: t("ONA directional mask", "ONA 方向遮罩", "ONA 方向遮罩"), description: t("Rows are source/ground Codes; columns are response Codes. Changes alter the scientific configuration.", "資料列是來源／前項代碼；欄是回應代碼。變更會改動科學設定。", "数据行是来源／前项代码；列是回应代码。更改会改动科学设置。"), initialize: t("Initialize explicit all-enabled mask", "初始化明確全部啟用遮罩", "初始化明确全部启用遮罩") },
    plot: {
      title: t("Plot presentation", "圖形呈現", "图形呈现"), exportContrastJson: t("Export full-population contrast JSON", "匯出完整母體對比 JSON", "导出完整总体对比 JSON"), exportContrastEdges: t("Export full-population contrast edges", "匯出完整母體對比邊", "导出完整总体对比边"), switchPlots: t("Switch Plots", "交換圖形", "交换图形"), showCentroidPaths: t("Show Group centroid paths", "顯示群組質心路徑", "显示组质心路径"), endpointsOnly: t("Show endpoints only (display)", "僅顯示端點（呈現）", "仅显示端点（呈现）"), fittedOrder: t("Fitted Horizon order is locked. Display filters retain original ordinals and do not change inference cohorts.", "擬合的視域順序已鎖定。顯示篩選會保留原始序位，且不改變推論群組。", "拟合的视域顺序已锁定。显示筛选会保留原始序位，且不改变推断群组。"), displayHorizon: (label) => t(`Display ${label}`, `顯示 ${label}`, `显示 ${label}`),
      points: t("Points", "點", "点"), networks: t("Networks", "網絡", "网络"), codeLabels: t("Code labels", "代碼標籤", "代码标签"), unitLabels: t("Unit labels", "單位標籤", "单位标签"), variance: t("Variance", "變異", "方差"), trajectories: t("Trajectories", "軌跡", "轨迹"), flipX: t("Flip X", "翻轉 X", "翻转 X"), flipY: t("Flip Y", "翻轉 Y", "翻转 Y"), edgeThreshold: t("Edge threshold", "邊閾值", "边阈值"), edgeScale: t("Edge scale", "邊比例", "边比例"), pointScale: t("Point scale", "點比例", "点比例"), zoom: t("Zoom", "縮放", "缩放"), unavailable: t("Unavailable", "不可用", "不可用"), axis: (index) => t(`Axis ${index}`, `軸 ${index}`, `轴 ${index}`), resetNodes: t("Reset node positions", "重設節點位置", "重置节点位置"),
      pngCanvasUnavailable: t("The browser could not prepare the PNG canvas.", "瀏覽器無法準備 PNG 畫布。", "浏览器无法准备 PNG 画布。"), pngEncodingFailed: t("The browser could not encode the PNG figure.", "瀏覽器無法編碼 PNG 圖形。", "浏览器无法编码 PNG 图形。"), pngRenderFailed: t("The browser could not render the SVG figure as PNG.", "瀏覽器無法將 SVG 圖形轉譯為 PNG。", "浏览器无法将 SVG 图形渲染为 PNG。"),
      unknownRenderedCode: t("The rendered Code identity is not available in the source mapping.", "呈現的代碼識別在來源對應中不可用。", "呈现的代码标识在来源映射中不可用。"), toolsTitle: t("Plot Tools", "繪圖工具", "绘图工具"),
      comparisonPlot: t("Comparison Plot", "比較圖", "比较图"), primaryPlot: t("Primary Plot", "主要圖", "主图"), secondaryPlot: t("Secondary Plot", "次要圖", "次图"), dataView: t("Data View", "資料檢視", "数据视图"),
      comparisonAria: t("Comparison plot. Scroll horizontally on small screens.", "比較圖；小螢幕可水平捲動。", "比较图；小屏幕可水平滚动。"), primaryPlotAria: t("Primary plot. Scroll horizontally on small screens.", "主要圖；小螢幕可水平捲動。", "主图；小屏幕可水平滚动。"), secondaryPlotAria: t("Secondary plot. Scroll horizontally on small screens.", "次要圖；小螢幕可水平捲動。", "次图；小屏幕可水平滚动。"),
      primaryEmptyAria: t("Primary Plot is empty", "主要圖目前為空", "主图当前为空"), secondaryEmptyAria: t("Secondary Plot is empty", "次要圖目前為空", "次图当前为空"), emptyGroupPrompt: t("Click or hover points in the comparison plot to display networks here", "在比較圖點擊或停留於資料點，即可在此顯示網絡", "在比较图点击或停留于数据点，即可在此显示网络"), selectedGroupOrder: t("Selected group order", "所選群組順序", "所选组顺序"),
      dataViewComparisonRecords: (primary, secondary) => t(`${primary} and ${secondary} · comparison records`, `${primary} 與 ${secondary} · 比較記錄`, `${primary} 与 ${secondary} · 比较记录`),
      dataViewUnavailable: t("Data View is not available for this comparison result.", "此比較結果沒有可用的資料檢視。", "此比较结果没有可用的数据视图。"),
    },
    stats: {
      separation: t("Model bundles contain unavailable statistics. Inference below is an explicit, separate post-model request.", "模型套件包含不可用的統計項目。下方推論是明確且獨立的模型後要求。", "模型包包含不可用的统计项目。下方推断是明确且独立的模型后请求。"), inferenceDesign: t("Trajectory inference design", "軌跡推論設計", "轨迹推断设计"), designs: { independent: t("Independent groups at a period", "單一時段的獨立群組", "单一时段的独立组"), paired: t("Paired periods", "配對時段", "配对时段"), repeated: t("Repeated periods", "重複時段", "重复时段") },
      identityConfirmation: t("I confirm these fitted Units identify the same entities across periods.", "我確認這些擬合單位在各時段識別相同實體。", "我确认这些拟合单位在各时段标识相同实体。"), periodInstructions: t("Select exactly one period for independent, exactly two for paired, or at least three for repeated inference. Select periods in the requested order. The native consumer verifies fitted precedence and rejects incomparable or reversed periods.", "獨立推論需選一個時段，配對推論需選兩個，重複推論需選至少三個。請依要求順序選取；原生消費者會驗證擬合先後並拒絕不可比較或反向時段。", "独立推断需选一个时段，配对推断需选两个，重复推断需选至少三个。请依请求顺序选择；原生消费者会验证拟合先后并拒绝不可比较或反向时段。"), runInference: t("Run confirmed inference", "執行已確認推論", "运行已确认推断"), onaDescriptive: t("ONA remains descriptive only; group and trajectory inference are unavailable.", "ONA 仍僅提供描述；群組及軌跡推論不可用。", "ONA 仍仅提供描述；组及轨迹推断不可用。"),
      onaEdges: t("ONA directed aggregate edges", "ONA 有向彙總邊", "ONA 有向汇总边"), onaAudit: t("Full-run deidentified ordered audit", "完整執行去識別有序稽核", "完整运行去标识有序审计"), exportOnaEdges: t("Export ONA aggregate edges", "匯出 ONA 彙總邊", "导出 ONA 汇总边"), exportOnaAudit: t("Export ONA deidentified audit", "匯出 ONA 去識別稽核", "导出 ONA 去标识审计"), exportNative: t("Export native statistics", "匯出原生統計", "导出原生统计"),
      localDataView: t("Local identity-bearing bound Data View", "本機含識別綁定資料檢視", "本机含标识绑定数据视图"), globalTraversal: t("Global runtime source traversal (not per-point membership)", "全域執行時來源走訪（非逐點成員關係）", "全局运行时来源遍历（非逐点成员关系）"), exportDataView: t("Export current Data View", "匯出目前資料檢視", "导出当前数据视图"), exportDataViewConfirmation: t("This local identity-bearing view contains Unit and Group identities. Export it?", "此本機含識別檢視包含單位及群組識別。要匯出嗎？", "此本机含标识视图包含单位及组标识。要导出吗？"), dataViewValidated: t("Data View validated against the independent current plan.", "資料檢視已依獨立目前計畫驗證。", "数据视图已依独立当前计划验证。"), exportMethods: t("Export Methods", "匯出方法", "导出方法"),
      onaMeaning: t("Descriptive directed ground/source to response/target networks. Group filtering affects aggregate descriptive tables only; the deidentified audit covers the full run and carries no per-Group source membership. No difference test or inferential effect is computed.", "描述由前項／來源指向回應／目標的有向網絡。群組篩選只影響彙總描述表；去識別稽核涵蓋完整執行，且不包含逐群組來源成員關係。不會計算差異檢定或推論效應。", "描述由前项／来源指向回应／目标的有向网络。组筛选只影响汇总描述表；去标识审计涵盖完整运行，且不包含逐组来源成员关系。不会计算差异检验或推断效应。"),
    },
    artifacts: {
      ariaLabel: t("Model artifacts", "模型成果", "模型成果"), title: t("Artifacts", "成果", "成果"), clearPreset: t("Clear preset Group hiding", "清除預設群組隱藏", "清除预设组隐藏"), exportPreset: t("Export presentation preset", "匯出呈現預設", "导出呈现预设"), reviewPreset: t("Review presentation preset", "檢視呈現預設", "查看呈现预设"), presetPreview: t("Presentation preset preview", "呈現預設預覽", "呈现预设预览"), presetMatches: t("This preset matches the retained result. Application changes display only.", "此預設符合保留結果；套用只會改變顯示。", "此预设符合保留结果；应用只会改变显示。"), presetMismatch: t("Unapplied preset: this belongs to a different scientific result.", "未套用預設：其屬於不同科學結果。", "未应用预设：其属于不同科学结果。"), presetCodesMismatch: t("The active editor excludes Codes used by this retained result. The preset remains unapplied.", "啟用中的編輯器排除了保留結果所用代碼；預設維持未套用。", "启用中的编辑器排除了保留结果所用代码；预设保持未应用。"), presetFamilyMismatch: t("The editor family differs from the retained result. The preset remains unapplied.", "編輯器分析系列與保留結果不同；預設維持未套用。", "编辑器分析系列与保留结果不同；预设保持未应用。"), cancelPreset: t("Cancel preset", "取消預設", "取消预设"), applyPreset: t("Apply matching presentation preset", "套用相符呈現預設", "应用匹配呈现预设"), exportDraft: t("Export draft", "匯出草稿", "导出草稿"), draftBlocked: t("Resolve unfinished raw input before exporting: the portable draft grammar cannot represent that visible text. Typed incomplete drafts remain exportable.", "匯出前請處理未完成的原始輸入：可攜式草稿語法無法表示該可見文字。具類型的不完整草稿仍可匯出。", "导出前请处理未完成的原始输入：可移植草稿语法无法表示该可见文本。带类型的不完整草稿仍可导出。"), exportConfig: t("Export canonical configuration", "匯出規範設定", "导出规范设置"), exportAnalysis: t("Export current analysis", "匯出目前分析", "导出当前分析"), exportAnalysisConfirmation: t("Export the full identity-bearing model bundle?", "要匯出完整且含識別的模型套件嗎？", "要导出完整且含标识的模型包吗？"), exportStale: t("Export STALE audit", "匯出過期稽核", "导出过期审计"), reexportReference: t("Re-export original Reference", "重新匯出原始參考", "重新导出原始参考"), exportReference: t("Export Reference", "匯出參考", "导出参考"), captureSet: (count) => t(`Capture analysis set (${count}/6)`, `擷取分析集（${count}/6）`, `捕获分析集（${count}/6）`), compareSets: t("Compare last two sets in the same basis", "在相同基底比較最後兩個分析集", "在相同基底比较最后两个分析集"), historicalComparison: t("Historical same-basis set comparison", "歷史相同基底分析集比較", "历史相同基底分析集比较"),
      presetTooLarge: t("Presentation preset exceeds 16 MiB.", "呈現預設超過 16 MiB。", "呈现预设超过 16 MiB。"), referenceDisplayName: t("Reference", "參考", "参考"),
      presetScope: t("This preset contains per-Code visibility and colors, hidden Groups, node positions, selected axes, camera and supported plot layers. It does not contain the Primary/Secondary pair, individual hidden Units, per-Group control preferences, global suppression and its saved visibility snapshots, complementary colors, Horizon filters or Group-centroid path choices. Those preferences stay unchanged when applying a preset. Restore global visibility before applying. Preset-hidden Groups use a separate display overlay that can be cleared without changing per-Group choices.", "此預設包含各代碼的可見性與顏色、隱藏群組、節點位置、所選座標軸、相機及支援的圖層；不包含主要／次要配對、個別隱藏單位、各群組控制偏好、全域隱藏與其可見性快照、互補色、視域篩選或群組質心路徑。套用時這些偏好保持不變。套用前請還原全域可見性。預設隱藏群組使用獨立顯示覆蓋，可在不改變各群組選擇下清除。", "此预设包含各代码的可见性与颜色、隐藏组、节点位置、所选坐标轴、相机及支持的图层；不包含主要／次要配对、个别隐藏单位、各组控制偏好、全局隐藏及其可见性快照、互补色、视域筛选或组质心路径。应用时这些偏好保持不变。应用前请恢复全局可见性。预设隐藏组使用独立显示覆盖，可在不改变各组选择下清除。"),
    },
    ai: {
      ready: t("Current native Stats result is ready for aggregate review.", "目前原生統計結果已可供彙總檢視。", "当前原生统计结果已可供汇总查看。"), unavailable: t("Run and review a current native Stats result first.", "請先執行並檢視目前原生統計結果。", "请先运行并查看当前原生统计结果。"), openStats: t("Open Stats", "開啟統計", "打开统计"), disabled: t("Run a current eligible native inference and review its aggregate evidence first.", "請先執行目前符合資格的原生推論，並檢視其彙總證據。", "请先运行当前符合资格的原生推断，并查看其汇总证据。"),
      wireLimitations: t("The V2 wire carries aggregate evidence only and omits native typed identities and the full binding. Native path summaries are omitted because V2 cannot express partial fitted precedence. Independent-period requests include only required selected centroids with proved fitted precedence and truthfully recorded observed continuity. An incomparable predecessor, or a connected previous centroid with fewer than 3 Units (N < 3), requires local review. Selected native rank comparisons remain included. Trajectory group coordinate summaries give each Unit equal weight across that Unit's observed steps.", "V2 傳輸只包含彙總證據，不包含原生具類型識別與完整綁定。原生路徑摘要亦不傳送，因為 V2 無法表達部分擬合先後關係。獨立期間請求只納入必要的所選質心，且其擬合先後已證明、觀測連續性如實記錄。若前一期間不可比較，或相連的前一質心少於 3 個單位（N < 3），須在本機審閱。所選的原生秩比較仍會納入。軌跡群組座標摘要對每個單位已觀測到的步驟給予相同權重。", "V2 传输只包含汇总证据，不包含原生带类型标识与完整绑定。原生路径摘要也不传输，因为 V2 无法表达部分拟合先后关系。独立期间请求只纳入必要的所选质心，且其拟合先后已证明、观测连续性如实记录。若前一期间不可比较，或相连的前一质心少于 3 个单位（N < 3），须在本机查看。所选的原生秩比较仍会纳入。轨迹组坐标摘要对每个单位已观测到的步骤给予相同权重。"),
    },
    toolbar: { dataView: t("Data View", "資料檢視", "数据视图"), downloadModel: t("Download Model", "下載模型", "下载模型"), exportSvg: t("Export SVG", "匯出 SVG", "导出 SVG"), exportPng: t("Export PNG", "匯出 PNG", "导出 PNG"), researchSpace: t("SVD research space", "SVD 研究空間", "SVD 研究空间") },
    shell: { workspaceAria: t("Open ENA analysis workspace", "Open ENA 分析工作區", "Open ENA 分析工作区"), modesAria: t("Analysis modes", "分析模式", "分析模式"), local: t("Local", "本機", "本机"), runtimePrivacy: (version) => t(`ENA computation powered by jENA v${version} (GPL-3.0-only); ENA.HK provides the interface, plotting, and exports. Source data stays in this workspace's browser memory unless you intentionally export it.`, `ENA 運算由 jENA v${version}（GPL-3.0-only）提供；ENA.HK 提供介面、繪圖及匯出。除非您主動匯出，來源資料只會保留在此工作區的瀏覽器記憶體中。`, `ENA 计算由 jENA v${version}（GPL-3.0-only）提供；ENA.HK 提供界面、绘图及导出。除非您主动导出，来源数据只会保留在此工作区的浏览器内存中。`) },
    result: { plotAria: t("Bound model plot", "綁定模型圖", "绑定模型图"), historicalGeometry: t("Historical geometry: edits require a new run.", "歷史幾何：編輯後需要重新執行。", "历史几何：编辑后需要重新运行。"), boundGeometry: t("Bound fitted geometry", "已綁定擬合幾何", "已绑定拟合几何"), oneAxis: t("Only one supported fitted axis is available. No second coordinate is invented.", "只有一個受支援的擬合軸；不會虛構第二座標。", "只有一个受支持的拟合轴；不会虚构第二坐标。"), fittedCoordinates: t("Fitted coordinates", "擬合座標", "拟合坐标"), contrastUnavailable: t("Contrast requires two declared Groups and two supported fitted axes. The fitted model remains available for inspection.", "對比需要兩個已宣告群組及兩個受支援擬合軸；擬合模型仍可供檢視。", "对比需要两个已声明组及两个受支持拟合轴；拟合模型仍可供查看。"), codeLabels: t("Code labels", "代碼標籤", "代码标签"), trajectorySteps: t("Observed fitted trajectory steps and original ordinals", "觀察到的擬合軌跡步驟及原始序位", "观测到的拟合轨迹步骤及原始序位"), cohortMeaning: t("Downstream complete-case availability does not determine core trajectory validity. Display filters do not change the cohort or fitted ordinals.", "下游完整案例的可用性不決定核心軌跡是否有效。顯示篩選不會改變隊列或擬合序位。", "下游完整案例的可用性不决定核心轨迹是否有效。显示筛选不会改变队列或拟合序位。") },
    empty: { ariaLabel: t("Open ENA model setup workbench", "Open ENA 模型設定工作台", "Open ENA 模型设置工作台"), comparisonPlot: t("COMPARISON PLOT", "比較圖", "比较图"), setupRequired: t("Model setup required", "需要設定模型", "需要设置模型"), researchSpace: t("2D research space", "2D 研究空間", "2D 研究空间"), networkAria: t("Connected four-node epistemic network", "四節點連接知識網絡", "四节点连接知识网络"), pathway: t("MODEL → VIEW → PRESENTER", "模型 → 檢視 → 呈現", "模型 → 视图 → 呈现"), complete: t("Complete: ", "已完成：", "已完成："), incomplete: t("Not complete: ", "未完成：", "未完成："), openRows: t("Open or load coded rows", "開啟或載入編碼資料列", "打开或加载编码数据行"), defineModel: t("Define Units, Horizons, Windows, and Codes; Group is optional", "設定單位、視域、窗口及代碼；群組可選", "设置单位、视域、窗口及代码；组可选"), buildModel: t("Build the model with jENA", "使用 jENA 建立模型", "使用 jENA 构建模型"), primaryPlot: t("PRIMARY PLOT", "主要圖", "主图"), secondaryPlot: t("SECONDARY PLOT", "次要圖", "次图"), awaitingGroup: t("Awaiting group selection", "等待群組選擇", "等待组选择"), primaryPending: t("Primary network appears after a model is built.", "建立模型後會顯示主要網絡。", "构建模型后会显示主网络。"), secondaryPending: t("Secondary network appears after a model is built.", "建立模型後會顯示次要網絡。", "构建模型后会显示次网络。"), dataReady: (rows) => t(`${rows.toLocaleString()} coded rows ready for review`, `${rows.toLocaleString()} 個編碼資料列可供檢視`, `${rows.toLocaleString()} 个编码数据行可供查看`), dataPrompt: t("Open a CSV or XLSX file, or load the teaching sample, to inspect coded rows.", "開啟 CSV 或 XLSX 檔案，或載入教學樣本，以檢視編碼資料列。", "打开 CSV 或 XLSX 文件，或加载教学样本，以查看编码数据行。") },
  };
}

function createModelV3Copy(locale: NativeModelLocaleV3): OpenEnaModelV3Copy {
  let model!: OpenEnaModelV3Copy;
  const localizedTabs = localizeModelTreeV3(tabsCopy, locale);
  const hant = locale === "zh-hant";
  const chinese = locale !== "en";
  const localizedUnits: OpenEnaUnitsPanelV3Copy = {
    ...localizeModelTreeV3(unitsCopy, locale),
    addRemoveFields: (label) => chinese ? `${hant ? "新增或移除" : "添加或移除"}${label}${hant ? "欄位" : "字段"}` : `Add or remove ${label} fields`,
    removeField: (field, label) => chinese ? `${hant ? "從" : "从"}${label}${hant ? "移除" : "移除"}${field}` : `Remove ${field} from ${label}`,
    unitCount: (count) => chinese ? `${count} ${hant ? "個單位" : "个单位"}` : `${count} Units`, groupCount: (count) => chinese ? `${count} ${hant ? "個群組" : "个组"}` : `${count} Groups`,
    unavailableGroupField: (field) => chinese ? `${field}（${hant ? "目前欄位不可用" : "当前字段不可用"}）` : `${field} (unavailable current field)`,
    unavailableMeansLevel: (label) => chinese ? `${label}（${hant ? "目前層級不可用" : "当前层级不可用"}）` : `${label} (unavailable current level)`,
    meansDirection: (negative, positive) => chinese ? `${negative} → ${positive}` : `${negative} to ${positive}`,
  };
  const localizedHorizons: OpenEnaHorizonsPanelV3Copy = {
    ...localizeModelTreeV3(horizonsCopy, locale),
    addRemoveFields: localizedUnits.addRemoveFields, removeField: localizedUnits.removeField,
    unitCount: localizedUnits.unitCount,
    horizonCount: (count) => chinese ? `${count} ${hant ? "個視域" : "个视域"}` : `${count} Horizons`,
    observationCount: (count) => chinese ? `${count} ${hant ? "個單位 × 視域觀測" : "个单位 × 视域观测"}` : `${count} Unit by Horizon observations`,
    sharedHorizons: (count) => chinese ? `${count} ${hant ? "個共用視域" : "个共享视域"}` : `${count} shared Horizons`,
    singleRowObservations: (count) => chinese ? `${count} ${hant ? "個單列觀測" : "个单行观测"}` : `${count} single-row observations`,
    extremeObservations: (minimum, maximum) => chinese ? `${hant ? "觀測資料列範圍" : "观测数据行范围"}：${minimum}–${maximum}` : `Observed rows range from ${minimum} to ${maximum}`,
    boundedRows: (shown, total) => chinese ? `${hant ? "顯示" : "显示"} ${shown}／${total} ${hant ? "個觀測" : "个观测"}` : `Showing ${shown} of ${total} observations`,
    sequence: (unit, steps) => `${unit}：${steps}`,
    boundedSequences: (shown, total) => chinese ? `${hant ? "顯示" : "显示"} ${shown}／${total} ${hant ? "個單位序列" : "个单位序列"}` : `Showing ${shown} of ${total} Unit sequences`,
  };
  const localizedWindows: OpenEnaWindowsPanelV3Copy = {
    ...localizeModelTreeV3(windowsCopy, locale),
    backwardFinite: (preceding) => chinese ? `${hant ? "包含目前資料列，以及同一視域內最多" : "包含当前数据行，以及同一视域内最多"} ${preceding} ${hant ? "個先前資料列。" : "个先前数据行。"}` : `Includes the current row and at most ${preceding} preceding rows within its Horizon.`,
    forwardFinite: (following) => chinese ? `${hant ? "加入同一視域內最多" : "加入同一视域内最多"} ${following} ${hant ? "個後續資料列；此計數不包含目前資料列。" : "个后续数据行；此计数不包含当前数据行。"}` : `Adds at most ${following} following rows within its Horizon; the current row is excluded from this count.`,
    unavailableReference: (name) => chinese ? `${name}（${hant ? "目前參考不可用" : "当前参考不可用"}）` : `${name} (unavailable current Reference)`,
    basisSummary: (codeCount, edgeCount, axisCount) => chinese ? `${codeCount} ${hant ? "個代碼" : "个代码"}，${edgeCount} ${hant ? "條邊" : "条边"}，${axisCount} ${hant ? "個軸" : "个轴"}` : `${codeCount} Codes, ${edgeCount} edges, ${axisCount} axes`,
    targetProjectionSummary: (rank, variance) => chinese ? `${hant ? "目標秩" : "目标秩"} ${rank}；${hant ? "固定軸變異" : "固定轴方差"} ${variance}` : `Target rank ${rank}; fixed-axis variance ${variance}`,
    referenceCompatibilityReason: (reason) => chinese ? `${hant ? "參考相容性" : "参考兼容性"}：${reason}` : `Reference compatibility: ${reason.replaceAll("-", " ")}`,
    resourceRows: (value) => chinese ? `${value} ${hant ? "個資料列" : "个数据行"}` : `${value} rows`, resourceDimensions: (value) => chinese ? `${value} ${hant ? "個鄰接維度" : "个邻接维度"}` : `${value} adjacency dimensions`,
    resourceVisits: (value) => chinese ? `${value} ${hant ? "次估算窗口造訪" : "次估算窗口访问"}` : `${value} estimated window visits`, resourcePeak: (value) => chinese ? `${value} ${hant ? "估算尖峰位元組" : "估算峰值字节"}` : `${value} estimated peak bytes`,
    resourceRotation: (value) => chinese ? `${value} ${hant ? "個估算旋轉工作單位" : "个估算旋转工作单位"}` : `${value} estimated rotation work units`,
  };
  const localizedCodes: OpenEnaCodesPanelV3Copy = {
    ...localizeModelTreeV3(codesCopy, locale),
    familyChanged: (family) => chinese ? `${hant ? "分析系列已切換為" : "分析系列已切换为"} ${family}；${hant ? "已還原其獨立設定。" : "已恢复其独立设置。"}` : `Analysis family changed to ${family}. Independent settings restored.`,
    positiveCount: (count) => chinese ? `${count} ${hant ? "個正值資料列" : "个正值数据行"}` : `${count} positive rows`,
    chooseColor: (code) => chinese ? `${hant ? "選擇" : "选择"} ${code} ${hant ? "的顏色" : "的颜色"}` : `Choose color for ${code}`,
    hideCode: (code) => chinese ? `${hant ? "隱藏" : "隐藏"} ${code} ${hant ? "節點" : "节点"}` : `Hide ${code} node`, showCode: (code) => chinese ? `${hant ? "顯示" : "显示"} ${code} ${hant ? "節點" : "节点"}` : `Show ${code} node`,
    excludeCode: (code) => chinese ? `${hant ? "排除代碼" : "排除代码"} ${code}` : `Exclude ${code} Code`, reorderCode: (code) => chinese ? `${hant ? "調整" : "调整"} ${code} ${hant ? "的顯示順序" : "的显示顺序"}` : `Reorder ${code}`,
    addCode: (code) => chinese ? `${hant ? "將" : "将"} ${code} ${hant ? "選為代碼" : "选为代码"}` : `Select ${code} as a Code`,
  };
  const localizedOrder: OpenEnaOrderPolicyEditorV3Copy = {
    ...localizeModelTreeV3(orderCopy, locale),
    removeKey: (index) => chinese ? `${hant ? "移除順序鍵" : "移除顺序键"} ${index + 1}` : `Remove order key ${index + 1}`,
    moveKeyUp: (index) => chinese ? `${hant ? "將順序鍵" : "将顺序键"} ${index + 1} ${hant ? "上移" : "上移"}` : `Move order key ${index + 1} up`, moveKeyDown: (index) => chinese ? `${hant ? "將順序鍵" : "将顺序键"} ${index + 1} ${hant ? "下移" : "下移"}` : `Move order key ${index + 1} down`,
    keyLabel: (index) => chinese ? `${hant ? "順序鍵" : "顺序键"} ${index + 1}` : `Order key ${index + 1}`, missingField: (field) => chinese ? `${field}（${hant ? "目前欄位不可用" : "当前字段不可用"}）` : `${field} (unavailable current field)`,
    removeCategoryLevel: (index) => chinese ? `${hant ? "移除類別層級" : "移除类别层级"} ${index + 1}` : `Remove category level ${index + 1}`, moveCategoryLevelUp: (index) => chinese ? `${hant ? "將類別層級" : "将类别层级"} ${index + 1} ${hant ? "上移" : "上移"}` : `Move category level ${index + 1} up`, moveCategoryLevelDown: (index) => chinese ? `${hant ? "將類別層級" : "将类别层级"} ${index + 1} ${hant ? "下移" : "下移"}` : `Move category level ${index + 1} down`,
  };
  const tabs: OpenEnaModelTabsV3Copy = {
    ...localizedTabs,
    tabDiagnosticLabel: ({ label, errors, warnings }) => locale === "en"
      ? `${label}, ${errors} ${errors === 1 ? "error" : "errors"} and ${warnings} ${warnings === 1 ? "warning" : "warnings"}`
      : locale === "zh-hant" ? `${label}，${errors} 個錯誤，${warnings} 個警告` : `${label}，${errors} 个错误，${warnings} 个警告`,
    status: { ...localizedTabs.status, summary: ({ configuration, result }) => locale === "en" ? `${configuration}. ${result}.` : `${configuration}。${result}。` },
    scientificSummary: { ...localizedTabs.scientificSummary, count: (value) => `${value}` },
    diagnostics: {
      ...localizedTabs.diagnostics,
      localize: (input) => localizeModelDiagnosticV3(model, input),
      suggestedAction: (input) => localizeModelSuggestedActionV3(model, input),
      evidenceSample: (sample, index) => {
        const identity = sample.codeColumn ?? sample.identity;
        const row = sample.rowIndex === undefined ? "" : locale === "en" ? `row ${sample.rowIndex + 1}` : locale === "zh-hant" ? `第 ${sample.rowIndex + 1} 列` : `第 ${sample.rowIndex + 1} 行`;
        return [locale === "en" ? `Evidence sample ${index + 1}` : locale === "zh-hant" ? `證據樣本 ${index + 1}` : `证据样本 ${index + 1}`, identity, row].filter(Boolean).join(" · ");
      },
      evidenceTotal: (totalCount) => locale === "en" ? `${totalCount} affected rows` : locale === "zh-hant" ? `${totalCount} 個受影響資料列` : `${totalCount} 个受影响数据行`,
    },
  };
  model = {
    tabs, units: localizedUnits,
    horizons: localizedHorizons, windows: localizedWindows,
    codes: localizedCodes, order: localizedOrder,
    nativeStats: localizeModelTreeV3(nativeStatsCopyEnV3, locale), importPreview: localizeModelTreeV3(importPreviewCopyEnV3, locale),
    groupApplicability: localizeModelTreeV3(groupApplicabilityEnV3, locale),
    workspace: createWorkspaceCopyV3(locale),
    diagnosticMessages: diagnosticMessagesV3(locale), suggestedActions: suggestedActionMessagesV3(locale),
  };
  return model;
}

export function localizeModelDiagnosticV3(copy: OpenEnaModelV3Copy, input: OpenEnaModelDiagnosticLocalizationInputV3) {
  const message = copy.diagnosticMessages[input.id as OpenEnaModelDiagnosticIdV3];
  if (message === undefined) throw new Error(`Unknown Models v3 diagnostic ID: ${input.id}`);
  return { summary: message.summary(input), detail: message.detail(input) };
}

export function localizeModelSuggestedActionV3(copy: OpenEnaModelV3Copy, input: ModelSuggestedActionLocalizationInputV3) {
  const message = copy.suggestedActions[input.id];
  if (message === undefined) throw new Error(`Unknown Models v3 suggested action ID: ${input.id}`);
  return { label: message.label(input), confirmation: message.confirmation(input) };
}

const modelV3En = createModelV3Copy("en");
const modelV3ZhHant = createModelV3Copy("zh-hant");
const modelV3ZhHans = createModelV3Copy("zh-hans");

const en: OpenEnaCopy = {
  eyebrow: "Browser-based research workspace",
  title: "Open ENA",
  intro: "Build, inspect, and compare epistemic network models with jENA in one workspace with linked 2D and interactive 3D views.",
  plotExport: {
    identityOmittedPoint: (index) => `Analytic unit point ${index}; identifier omitted from this SVG export.`,
  },
  navLabel: "Open ENA",
  modes: { data: "Data", model: "Model", plot: "Plot Tools", stats: "Stats & Export", ai: "AI" },
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
  modelV3: modelV3En,
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
      threeD: "3D ONA · descriptive ordered space",
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
      threeDLinkedWorkspace: "Linked 3D ONA workspace",
      threeDSameFittedModel: "The 2D and 3D views use the same completed fitted ordered model, coordinates, directed weights, mask, and audit; switching views does not rerun or refit it.",
      threeDDirection: "Arrowheads point from ground/source to response/target.",
      threeDReciprocalLane: "Reciprocal directions use stable separate lanes so A → B and B → A remain distinguishable.",
      threeDSelfLoop: "A closed three-dimensional ring with a tangent arrowhead represents a diagonal self-connection.",
      threeDDescriptiveOnly: "Only the completed fitted ONA geometry and exact descriptive model values are shown.",
      threeDDegenerateAxis: "The selected third axis has zero variance, so the fitted 3D result is faithfully displayed as a plane without invented depth.",
      threeDAccessibleSummary: "Accessible summary of visible directed ONA cells",
      threeDOverall: "Overall",
      threeDPrimary: "Primary",
      threeDSecondary: "Secondary",
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
      pointStyleNames: {
        solid: "solid",
        "inner-ring": "inner ring",
        "center-dot": "center dot",
        "horizontal-bar": "horizontal bar",
        plus: "plus sign",
        cross: "diagonal cross",
      },
      unitPointDescription: ({ unit, group, xDimension, xValue, yDimension, yValue }) => (
        `Analytic unit ${unit} · Group ${group} · horizontal axis ${xDimension} ${xValue} · vertical axis ${yDimension} ${yValue}`
      ),
      groupPointDescription: ({ number, group, color, style }) => (
        `${number}. ${group}; color ${color}; ${style} circle marker`
      ),
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
      inference: "Inferential tests are not verified for ONA; only descriptive diagnostics are shown.",
      ai: "AI interpretation is unavailable for ONA until an aggregate-only ordered evidence contract is independently verified.",
    },
    presenter: {
      title: "Tune the directed ONA view",
      description: "These controls change only the directed 2D or 3D presentation; they do not rebuild the ordered model.",
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
    trajectorySample: "Load 3D trajectory sample",
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
    codeColorPicker: codeColorPickerEn,
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
    resetNodeLayout: "Reset node layout",
    threeDComparisonPlot: "Comparison Plot",
    threeDPrimaryPlot: "Primary Plot",
    threeDSecondaryPlot: "Secondary Plot",
    threeDPlotActions: "3D plot actions",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    recenter: "Recenter",
    copyImage: "Copy image",
    copyImageTitle: "Copy plot image to clipboard",
    fullscreenEnter: "Enter Fullscreen",
    fullscreenExit: "Exit Fullscreen",
    fullscreenDialog: "Fullscreen 3D plot",
    actionUnavailable: "3D view action unavailable",
    copyingImage: "Copying image",
    imageCopied: "Image copied",
    imageDataCopied: "Image data copied",
    copyUnavailable: "Copy unavailable",
    fullscreenOpening: "Opening fullscreen",
    fullscreenFallbackEnabled: "Fullscreen fallback enabled",
    fullscreenClosed: "Fullscreen closed",
    fullscreenExitFailed: "Native fullscreen could not close. Press Escape to exit.",
    fullscreenUnavailable: "Fullscreen unavailable",
    threeDInteractionHint: "Drag to rotate; scroll or use the five plot actions to zoom in, zoom out, recenter, copy the image, or enter fullscreen. The geometry is descriptive, not inferential.",
    sameFittedSpace: "Same fitted jENA space; switching between 2D and 3D does not rerun or refit the analysis.",
    threeDExportHint: "Use the copy-image button in the 3D plot toolbar to place a PNG on the clipboard. SVG and high-resolution PNG research exports apply to the 2D view.",
    threeDLoading: "Loading 3D plot",
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
    identityExportWarning: "Standard ENA derived exports can retain selected analytic-unit and group identifiers and, for trajectory tables, conversation or time identifiers. They are not anonymous; review and pseudonymize them before sharing.",
    identityExportConfirmation: "This Standard ENA export may contain analytic-unit, group, conversation, or time identifiers. Confirm that you have reviewed or pseudonymized them and that sharing is covered by appropriate research governance.",
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
    providerDisclosure: "Gateway/provider: OpenRouter routes this reviewed request to the configured model shown below.",
    dataScopeDisclosure: "Data sent: the reviewed, aggregate-only JSON preview; no raw source rows, source text, or participant-level records.",
    retentionDisclosure: "Retention and subprocessors: OpenRouter says prompt/completion logging is opt-in at its layer. Every AI generation requests ZDR-only routing and denies provider data collection; if no endpoint satisfies both controls, the request fails instead of falling back to a non-ZDR provider. These request-level controls do not prove downstream retention, training, or processing region, which remain endpoint, provider, and account facts.",
    regionDisclosure: "Processing region: the route and downstream provider region can vary by deployment and endpoint; this app does not promise a fixed region.",
    auditReceiptDisclosure: "Audit receipt: a minimal hash-bound consent receipt records the operation, request hash, policy version, provider/model, time, and terminal status; it never stores the prompt or response.",
    disclosureSummary: "Review the provider, data, retention, region, and receipt disclosures before consent.",
    provider: "Provider",
    model: "Model",
    provenance: "Interpretation provenance",
    generatedAt: "Generated",
    promptVersion: "Prompt version",
    evidenceKey: "Evidence key",
    auditReceipt: "Consent receipt",
    requestSha256: "Reviewed request SHA-256",
    consentPolicyVersion: "Consent policy",
    recordedAt: "Receipt recorded",
    durable: "Durable receipt",
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
  plotExport: {
    identityOmittedPoint: (index) => `分析單位點 ${index}；此 SVG 匯出已省略識別碼。`,
  },
  modes: { data: "資料", model: "模型", plot: "繪圖工具", stats: "統計與匯出", ai: "AI 解讀" },
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
  modelV3: modelV3ZhHant,
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
      threeD: "3D ONA · 描述性順序空間",
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
      threeDLinkedWorkspace: "連動 3D ONA 工作台",
      threeDSameFittedModel: "2D 與 3D 視圖使用同一個已完成擬合的順序模型、座標、有方向權重、遮罩與審計；切換視圖不會重新執行或重新擬合。",
      threeDDirection: "箭頭由來源碼／ground 指向回應碼／response。",
      threeDReciprocalLane: "互惠方向使用穩定的分離車道，讓 A → B 與 B → A 保持可區分。",
      threeDSelfLoop: "帶切向箭頭的封閉三維環線代表對角自連線。",
      threeDDescriptiveOnly: "只顯示已完成擬合的 ONA 幾何與精確描述性模型數值。",
      threeDDegenerateAxis: "所選第三軸的變異為零，因此忠實地把已擬合 3D 結果顯示為平面，不製造虛假深度。",
      threeDAccessibleSummary: "可見有方向 ONA 儲存格的無障礙摘要",
      threeDOverall: "整體",
      threeDPrimary: "主要",
      threeDSecondary: "次要",
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
      pointStyleNames: {
        solid: "實心",
        "inner-ring": "內環",
        "center-dot": "中心點",
        "horizontal-bar": "水平線",
        plus: "加號",
        cross: "斜十字",
      },
      unitPointDescription: ({ unit, group, xDimension, xValue, yDimension, yValue }) => (
        `分析單位 ${unit} · 群組 ${group} · 橫軸 ${xDimension} ${xValue} · 縱軸 ${yDimension} ${yValue}`
      ),
      groupPointDescription: ({ number, group, color, style }) => (
        `第 ${number} 組：${group}；顏色 ${color}；${style}圓形標記`
      ),
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
      inference: "ONA 尚未驗證推論檢定；只顯示描述性診斷。",
      ai: "在只含彙總的順序證據合約通過獨立驗證前，ONA 不提供 AI 解讀。",
    },
    presenter: {
      title: "調整有方向 ONA 視圖",
      description: "這些控制只改變有方向 2D 或 3D 呈現，不會重新建立順序模型。",
      directionBoundary: "顯示門檻不會改變已擬合 p² 矩陣或已設定方向遮罩。",
      groupPanelsTitle: "描述性群組面板",
      groupPanelsDescription: "可從已完成結果選擇任意兩個群組，分別顯示平均網絡；此選擇不會計算相減、對比或推論。",
    },
  },
  sets: { ...en.sets, title: "分析集", description: "將端點模型保留在瀏覽器記憶體中，並比較共享同一參照幾何的擬合或投影網絡。", capture: "擷取目前模型", captureHint: "只擷取衍生座標與等權單位網絡平均值，不保留原始來源資料列；分析單位識別碼仍會保留，必要時請先假名化。", emptyTitle: "尚未擷取分析集", emptyText: "先建立端點模型，再在這裡擷取。擬合模型會安裝其可重用參照，使之後的 CSV 或 XLSX 檔案可投影到完全相同的 ENA 空間。", fitted: "擬合", projected: "投影", generatedReference: "可重用擬合參照", projectionReference: "已投影至參照", sourceHash: "分析資料表 SHA-256", hashScope: "雜湊範圍", primary: "主要分析集", secondary: "次要分析集", choosePrimary: "選擇主要分析集", chooseSecondary: "選擇相容的次要分析集", comparisonHint: "帶符號連線差異為共享固定幾何中的「主要減次要」。JSON 會保留分析單位識別碼；需要分享時請先假名化。", noCompatibleSecondary: "沒有可用的相容次要分析集。請在同一參照幾何中擷取或投影另一個端點模型。", remove: "移除", exportJson: "匯出比較 JSON", exportEdges: "匯出連線差異 CSV" },
  data: { ...en.data, title: "從編碼資料開始", description: "在此瀏覽器開啟 CSV 或 XLSX 檔案，或載入已記錄的學院範例以查看完整流程。", upload: "開啟 CSV 或 XLSX", uploadHint: "CSV 或 XLSX，最多 5 MB、20,000 列；XLSX 使用第一個工作表", sample: "載入教學範例", trajectorySample: "載入 3D 軌跡範例", trajectorySampleHint: "54 筆合成資料 · 6 位學習者 · TP1–TP3 · 6 個編碼", noFile: "尚未載入資料", active: "使用中的資料集", rows: "資料列", columns: "欄位", source: "來源", local: "核心 ENA 運算保留在此瀏覽器；原始來源資料列不會傳送至可選的 AI 解讀服務。" },
  model: { ...en.model, title: "定義 ENA 模型", description: "對應賦予網絡分析意義的欄位，然後執行已驗證的 jENA 流程。", sequenceNote: "CSV 或 XLSX 資料列順序定義每段對話中的序列；若順序重要，請在分析前先排序來源檔案。", unit: "分析單位", conversation: "對話", group: "比較群組", identityHint: "可選一個或多個欄位；順序會定義複合識別。", noGroup: "不設比較群組（全部分析單位）", codes: "編碼", window: "窗口", movingWindow: "移動段落窗口", conversationWindow: "完整對話", back: "向後跨度（包括目前列）", forward: "向前資料列", configureTrajectory: "設定軌跡模型", modelType: "模型類型", endpoint: "端點（每個分析單位一個網絡）", separateTrajectory: "分離軌跡（每一步一個點）", accumulatedTrajectory: "累積軌跡（每一步為累積網絡）", trajectoryHint: "軌跡步驟依每個分析單位首次出現的對話順序排列；統計面板不會將重複步驟視為獨立分析單位。", rotation: "旋轉", svd: "SVD（資料變異）", means: "廣義均值旋轉（GMR）", center: "將零網絡分析單位置於原點", weighting: "加權", binary: "二元", run: "建立 ENA 模型", rerun: "重新建立模型", valid: "模型輸入有效" },
  plot: { ...en.plot, title: "調整研究視圖", description: "這些控制只改變呈現方式，不會在未提示下重新建立模型。", showPoints: "分析單位點", showNetworks: "群組網絡", showLabels: "編碼標籤", showTrajectories: "軌跡路徑", edgeScale: "連線寬度", axisX: "X 軸", axisY: "Y 軸", axisZ: "Z 軸", camera: "相機", cameraPosition: "相機位置", default3dCamera: "預設 3D 相機", isometric: "等距", xy: "X-Y 平面", xz: "X-Z 平面", yz: "Y-Z 平面", yx: "Y-X 平面", zx: "Z-X 平面", zy: "Z-Y 平面", reset: "重設視圖", resetNodeLayout: "重設節點配置", threeDComparisonPlot: "比較圖", threeDPrimaryPlot: "主要圖", threeDSecondaryPlot: "次要圖", threeDPlotActions: "3D 繪圖操作", zoomIn: "放大", zoomOut: "縮小", recenter: "回正", copyImage: "複製圖片", copyImageTitle: "複製繪圖圖片到剪貼簿", fullscreenEnter: "進入全螢幕", fullscreenExit: "離開全螢幕", fullscreenDialog: "全螢幕 3D 圖", actionUnavailable: "3D 視圖操作無法使用", copyingImage: "正在複製圖片", imageCopied: "圖片已複製", imageDataCopied: "圖片資料已複製", copyUnavailable: "無法複製", fullscreenOpening: "正在開啟全螢幕", fullscreenFallbackEnabled: "已啟用全螢幕備用模式", fullscreenClosed: "全螢幕已關閉", fullscreenExitFailed: "原生全螢幕無法關閉。請按 Escape 離開。", fullscreenUnavailable: "全螢幕無法使用", threeDInteractionHint: "拖曳以旋轉；滾動或使用五個繪圖操作來放大、縮小、回正、複製圖片或進入全螢幕。此幾何只作描述，不屬推論證據。", sameFittedSpace: "沿用同一個已擬合 jENA 空間；切換 2D 與 3D 不會重新執行或重新擬合分析。", threeDExportHint: "使用 3D 繪圖工具列的複製圖片按鈕，把 PNG 放到剪貼簿。SVG 與高解析度 PNG 研究圖匯出只適用於 2D 視圖。", threeDLoading: "正在載入 3D 繪圖", threeDUnavailable: "互動式 3D 暫時無法使用。已擬合結果仍保持完整；請切回 2D 或重新載入此視圖。", threeDRequiresThreeDimensions: "3D ENA 需要已完成結果具有三個不同維度；2D 結果仍可使用。" },
  contrast: { ...en.contrast, title: "端點群組對比", description: "依序選擇主要與次要群組。中央圖以同一比例尺疊加兩個平均網絡；帶符號的「主要減次要」差異保留在證據表與匯出中。", primary: "主要群組", secondary: "次要群組", swap: "交換主要與次要群組", selectedOrder: "所選群組順序", selectedAxes: "所選座標軸", multiplicity: "此網絡對比只作描述；已確認的統計推論工作流程會在明確執行後套用固定 Holm 檢定族。", exportJson: "匯出群組對比 JSON", exportEdges: "匯出群組對比連線 CSV", requiresGroup: "無法使用群組對比：端點模型需要群組變項。", requiresTwoGroups: "無法使用群組對比：端點模型需要至少兩個不同群組。", endpointOnly: "無法使用群組對比：此功能只適用於端點模型。" },
  longitudinal: { ...en.longitudinal, title: "縱向群組質心路徑", description: "依明確期間順序，在固定 jENA 空間中衍生等權實體群組質心。這些呈現設定不會重建 jENA 或改變投影座標。", repeatedEntity: "重複測量實體", timeOrder: "時間／順序欄位", observedOrder: "明確時間順序（依來源資料首次出現）", moveEarlier: "將期間向前移", moveLater: "將期間向後移", cohortPolicy: "隊列政策", available: "可用隊列", complete: "完整隊列", availableHint: "可用隊列使用各期間實際出現的重複實體。", completeHint: "完整隊列只保留每個排序期間均有資料的重複實體。", showIndividualPaths: "個別軌跡路徑", showGroupPaths: "群組質心路徑", descriptive: "描述性縱向幾何", noEndpointTests: "重複軌跡期間不套用端點 Mann–Whitney 或 Welch 檢定。", exportJson: "匯出縱向 JSON", exportCsv: "匯出縱向期間 CSV", exportInferenceCsv: "匯出推論比較 CSV", allUnits: "未設定比較群組：顯示一條「全部單位」總體質心路徑。", period: "期間", group: "群組", availableCount: "可用", completeCount: "完整", includedCount: "納入", excludedCount: "缺失／排除", unavailableModel: "縱向群組質心分析需要成功的分離或累積軌跡結果。", unavailableEntity: "縱向分析需要來自擬合單位對應的重複實體欄位。", unavailableTime: "縱向分析需要來自擬合對話對應的時間／順序欄位。", unavailablePeriods: "縱向分析至少需要兩個排序期間。", unavailableComplete: "完整隊列中沒有在每個所選期間均有資料的合資格重複實體。", figureAriaLabel: "群組質心軌跡圖；小螢幕可水平捲動。", geometryView: "軌跡幾何視圖", diagnosticsCaption: "群組與期間質心診斷", nUsed: "使用數", nExcluded: "排除數", centroid: "質心", status: "狀態", gap: "缺口", observed: "已觀察", gapRule: "缺失期間之間不連線。", noConnectedPaths: "無法繪製相連軌跡：所選相鄰期間沒有重複實體。請檢查重複實體與時間點對應。", legendAriaLabel: "縱向軌跡圖例", largerCentroidMarker: "較大輪廓方形＝群組期間質心", timeDirectionArrow: "箭頭＝觀察時間方向", flipped: "已翻轉", firstAxis: "維度 1", secondAxis: "維度 2", circle: "圓形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六邊形", solid: "實線", dashed: "虛線", dotted: "點線", dashDot: "點劃線", shortDashed: "短虛線", longShortDashed: "長短虛線", marker: "標記", path: "路徑", rowsTruncated: "畫面省略了其餘期間列；請使用縱向匯出取得完整診斷。", individualMarksSampled: "個別圖形標記已抽樣：顯示 {pointsShown}/{pointsTotal} 個點、{segmentsShown}/{segmentsTotal} 個整體實體路徑轉換，以及 {arrowsShown}/{arrowsTotal} 個方向箭頭。群組質心路徑保持完整。" },
  stats: { ...en.stats, title: "證據與可重現性", description: "將描述性摘要與模型規格一併閱讀；發表層級的推論需要有理據的檢定與研究設計。", variance: "解釋變異", groupSummary: "群組摘要", effect: "絕對 Cohen’s d", verifiedTests: "jENA 檢定統計量", correlations: "維度相關", notTest: "jENA 報告檢定統計量與自由度，但不計算 p 值；請依研究設計選擇及報告推論檢定。", manifest: "分析清單", export: "匯出清單", exportBundle: "匯出結果套件", identityExportWarning: "標準 ENA 衍生匯出可能保留所選分析單位與群組識別碼；軌跡資料表亦可能保留對話或時間識別碼。這些資料並非匿名；分享前請審閱並假名化。", identityExportConfirmation: "此標準 ENA 匯出可能包含分析單位、群組、對話或時間識別碼。請確認您已審閱或假名化，且分享受適當研究治理規範。", trajectoryNotice: "端點群組檢定與點—質心相關不適用於重複軌跡步驟。請以描述方式解讀軌跡幾何，或在工作區外使用符合研究設計的縱向方法。", ui: statsUiZhHant },
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
    providerDisclosure: "閘道／供應商：OpenRouter 會將此經審閱的請求轉送至下方顯示的指定模型。",
    dataScopeDisclosure: "傳送資料：經審閱、僅含彙總資料的 JSON 預覽；不含原始來源資料列、來源文字或參與者層級記錄。",
    retentionDisclosure: "保留期及下游處理者：OpenRouter 表示其提示／完成內容記錄在其層級為選擇性。每次 AI 生成都要求僅使用 ZDR 端點並拒絕供應商資料收集；若沒有端點同時符合兩項控制，請求會失敗，不會降級至非 ZDR 供應商。這些請求級控制不能證明下游保留期、訓練政策或處理地區；它們仍取決於端點、供應商及帳戶。",
    regionDisclosure: "處理地區：路由及下游供應商地區可能依部署及端點而變；本程式不承諾固定地區。",
    auditReceiptDisclosure: "審計回執：最小化、與雜湊綁定的同意回執會記錄操作、請求雜湊、政策版本、供應商／模型、時間及終端狀態；絕不保存提示或回應。",
    disclosureSummary: "同意前請審閱供應商、資料、保留期、地區及回執披露。",
    provider: "供應商",
    model: "模型",
    provenance: "解讀來源記錄",
    generatedAt: "生成時間",
    promptVersion: "提示版本",
    evidenceKey: "證據鍵",
    auditReceipt: "同意回執",
    requestSha256: "經審閱請求 SHA-256",
    consentPolicyVersion: "同意政策",
    recordedAt: "回執記錄時間",
    durable: "持久回執",
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
  plotExport: {
    identityOmittedPoint: (index) => `分析单位点 ${index}；此 SVG 导出已省略标识符。`,
  },
  modes: { data: "数据", model: "模型", plot: "绘图工具", stats: "统计与导出", ai: "AI 解读" },
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
  modelV3: modelV3ZhHans,
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
      threeD: "3D ONA · 描述性顺序空间",
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
      threeDLinkedWorkspace: "联动 3D ONA 工作台",
      threeDSameFittedModel: "2D 与 3D 视图使用同一个已完成拟合的顺序模型、坐标、有向权重、遮罩与审计；切换视图不会重新运行或重新拟合。",
      threeDDirection: "箭头由源码／ground 指向响应码／response。",
      threeDReciprocalLane: "互惠方向使用稳定的分离车道，让 A → B 与 B → A 保持可区分。",
      threeDSelfLoop: "带切向箭头的闭合三维环线代表对角自连线。",
      threeDDescriptiveOnly: "仅显示已完成拟合的 ONA 几何与精确描述性模型数值。",
      threeDDegenerateAxis: "所选第三轴的方差为零，因此忠实地把已拟合 3D 结果显示为平面，不制造虚假深度。",
      threeDAccessibleSummary: "可见有向 ONA 单元格的无障碍摘要",
      threeDOverall: "整体",
      threeDPrimary: "主要",
      threeDSecondary: "次要",
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
      pointStyleNames: {
        solid: "实心",
        "inner-ring": "内环",
        "center-dot": "中心点",
        "horizontal-bar": "水平线",
        plus: "加号",
        cross: "斜十字",
      },
      unitPointDescription: ({ unit, group, xDimension, xValue, yDimension, yValue }) => (
        `分析单位 ${unit} · 组 ${group} · 横轴 ${xDimension} ${xValue} · 纵轴 ${yDimension} ${yValue}`
      ),
      groupPointDescription: ({ number, group, color, style }) => (
        `第 ${number} 组：${group}；颜色 ${color}；${style}圆形标记`
      ),
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
      inference: "ONA 尚未验证推断检验；只显示描述性诊断。",
      ai: "在仅含汇总的顺序证据契约通过独立验证前，ONA 不提供 AI 解读。",
    },
    presenter: {
      title: "调整有向 ONA 视图",
      description: "这些控件只改变有向 2D 或 3D 呈现，不会重新构建顺序模型。",
      directionBoundary: "显示阈值不会改变已拟合 p² 矩阵或已设置方向遮罩。",
      groupPanelsTitle: "描述性组面板",
      groupPanelsDescription: "可从已完成结果选择任意两个组，分别显示平均网络；此选择不会计算相减、对比或推断。",
    },
  },
  sets: { ...zhHant.sets, title: "分析集", description: "将端点模型保留在浏览器内存中，并比较共享同一参考几何的拟合或投影网络。", capture: "捕获当前模型", captureHint: "只捕获派生坐标与等权单位网络均值，不保留原始来源数据行；分析单位标识符仍会保留，必要时请先假名化。", emptyTitle: "尚未捕获分析集", emptyText: "先构建端点模型，再在此捕获。拟合模型会安装其可复用参考，使之后的 CSV 或 XLSX 文件可投影到完全相同的 ENA 空间。", fitted: "拟合", projected: "投影", generatedReference: "可复用拟合参考", projectionReference: "已投影至参考", sourceHash: "分析数据表 SHA-256", hashScope: "哈希范围", primary: "主要分析集", secondary: "次要分析集", choosePrimary: "选择主要分析集", chooseSecondary: "选择兼容的次要分析集", comparisonHint: "带符号连线差异为共享固定几何中的“主要减次要”。JSON 会保留分析单位标识符；需要分享时请先假名化。", noCompatibleSecondary: "没有可用的兼容次要分析集。请在同一参考几何中捕获或投影另一个端点模型。", remove: "移除", exportJson: "导出比较 JSON", exportEdges: "导出连线差异 CSV" },
  data: { ...zhHant.data, title: "从编码数据开始", description: "在此浏览器打开 CSV 或 XLSX 文件，或加载已有说明的学院示例以查看完整流程。", upload: "打开 CSV 或 XLSX", uploadHint: "CSV 或 XLSX，最多 5 MB、20,000 行；XLSX 使用第一个工作表", sample: "加载教学示例", trajectorySample: "加载 3D 轨迹示例", trajectorySampleHint: "54 条合成数据 · 6 位学习者 · TP1–TP3 · 6 个编码", noFile: "尚未加载数据", active: "当前数据集", rows: "数据行", columns: "字段", source: "来源", local: "核心 ENA 计算保留在此浏览器；原始来源数据行不会发送到可选的 AI 解读服务。" },
  model: { ...zhHant.model, title: "定义 ENA 模型", description: "映射赋予网络分析意义的字段，然后运行已验证的 jENA 流程。", sequenceNote: "CSV 或 XLSX 数据行顺序定义每段对话中的序列；若顺序重要，请在分析前先排序源文件。", unit: "分析单位", conversation: "对话", group: "比较组", identityHint: "可选一个或多个字段；顺序会定义复合标识。", noGroup: "不设比较组（全部分析单位）", codes: "编码", window: "窗口", movingWindow: "移动段落窗口", conversationWindow: "完整对话", back: "向后跨度（包括当前行）", forward: "向前数据行", configureTrajectory: "配置轨迹模型", modelType: "模型类型", endpoint: "端点（每个分析单位一个网络）", separateTrajectory: "分离轨迹（每一步一个点）", accumulatedTrajectory: "累积轨迹（每一步为累积网络）", trajectoryHint: "轨迹步骤按每个分析单位首次出现的对话顺序排列；统计面板不会将重复步骤视为独立分析单位。", rotation: "旋转", svd: "SVD（数据方差）", means: "广义均值旋转（GMR）", center: "将零网络分析单位置于原点", weighting: "加权", binary: "二元", run: "构建 ENA 模型", rerun: "重新构建模型", valid: "模型输入有效" },
  plot: { ...zhHant.plot, title: "调整研究视图", description: "这些控件只改变呈现方式，不会在未提示下重新构建模型。", showPoints: "分析单位点", showNetworks: "组网络", showLabels: "编码标签", showTrajectories: "轨迹路径", edgeScale: "连线宽度", axisX: "X 轴", axisY: "Y 轴", axisZ: "Z 轴", camera: "相机", cameraPosition: "相机位置", default3dCamera: "默认 3D 相机", isometric: "等距", xy: "X-Y 平面", xz: "X-Z 平面", yz: "Y-Z 平面", yx: "Y-X 平面", zx: "Z-X 平面", zy: "Z-Y 平面", reset: "重置视图", resetNodeLayout: "重置节点布局", threeDComparisonPlot: "比较图", threeDPrimaryPlot: "主要图", threeDSecondaryPlot: "次要图", threeDPlotActions: "3D 绘图操作", zoomIn: "放大", zoomOut: "缩小", recenter: "回正", copyImage: "复制图片", copyImageTitle: "复制绘图图片到剪贴板", fullscreenEnter: "进入全屏", fullscreenExit: "退出全屏", fullscreenDialog: "全屏 3D 图", actionUnavailable: "3D 视图操作不可用", copyingImage: "正在复制图片", imageCopied: "图片已复制", imageDataCopied: "图片数据已复制", copyUnavailable: "无法复制", fullscreenOpening: "正在打开全屏", fullscreenFallbackEnabled: "已启用全屏备用模式", fullscreenClosed: "全屏已关闭", fullscreenExitFailed: "原生全屏无法关闭。请按 Escape 退出。", fullscreenUnavailable: "全屏不可用", threeDInteractionHint: "拖动以旋转；滚动或使用五个绘图操作来放大、缩小、回正、复制图片或进入全屏。此几何仅作描述，不属于推断证据。", sameFittedSpace: "沿用同一个已拟合 jENA 空间；切换 2D 与 3D 不会重新运行或重新拟合分析。", threeDExportHint: "使用 3D 绘图工具栏的复制图片按钮，把 PNG 放到剪贴板。SVG 与高分辨率 PNG 研究图导出仅适用于 2D 视图。", threeDLoading: "正在加载 3D 绘图", threeDUnavailable: "交互式 3D 暂时不可用。已拟合结果仍保持完整；请切回 2D 或重新加载此视图。", threeDRequiresThreeDimensions: "3D ENA 需要已完成结果具有三个不同维度；2D 结果仍可使用。" },
  contrast: { ...en.contrast, title: "端点组对比", description: "依次选择主要组和次要组。中央图以同一比例尺叠加两个平均网络；带符号的“主要减次要”差异保留在证据表与导出中。", primary: "主要组", secondary: "次要组", swap: "交换主要组和次要组", selectedOrder: "所选组顺序", selectedAxes: "所选坐标轴", multiplicity: "此网络对比仅作描述；已确认的统计推断工作流程会在明确运行后应用固定 Holm 检验族。", exportJson: "导出组对比 JSON", exportEdges: "导出组对比连线 CSV", requiresGroup: "无法使用组对比：端点模型需要分组变量。", requiresTwoGroups: "无法使用组对比：端点模型需要至少两个不同组。", endpointOnly: "无法使用组对比：此功能仅适用于端点模型。" },
  longitudinal: { ...en.longitudinal, title: "纵向组质心路径", description: "按明确时期顺序，在固定 jENA 空间中派生等权实体组质心。这些呈现设置不会重建 jENA 或改变投影坐标。", repeatedEntity: "重复测量实体", timeOrder: "时间／顺序字段", observedOrder: "明确时间顺序（按来源数据首次出现）", moveEarlier: "将时期前移", moveLater: "将时期后移", cohortPolicy: "队列策略", available: "可用队列", complete: "完整队列", availableHint: "可用队列使用各时期实际出现的重复实体。", completeHint: "完整队列只保留每个排序时期均有数据的重复实体。", showIndividualPaths: "个体轨迹路径", showGroupPaths: "组质心路径", descriptive: "描述性纵向几何", noEndpointTests: "重复轨迹时期不应用端点 Mann–Whitney 或 Welch 检验。", exportJson: "导出纵向 JSON", exportCsv: "导出纵向时期 CSV", exportInferenceCsv: "导出推断比较 CSV", allUnits: "未设置比较组：显示一条“所有单位”总体质心路径。", period: "时期", group: "组", availableCount: "可用", completeCount: "完整", includedCount: "纳入", excludedCount: "缺失／排除", unavailableModel: "纵向组质心分析需要成功的分离或累积轨迹结果。", unavailableEntity: "纵向分析需要来自拟合单位映射的重复实体字段。", unavailableTime: "纵向分析需要来自拟合对话映射的时间／顺序字段。", unavailablePeriods: "纵向分析至少需要两个排序时期。", unavailableComplete: "完整队列中没有在每个所选时期均有数据的合格重复实体。", figureAriaLabel: "组质心轨迹图；小屏幕可水平滚动。", geometryView: "轨迹几何视图", diagnosticsCaption: "组与时期质心诊断", nUsed: "使用数", nExcluded: "排除数", centroid: "质心", status: "状态", gap: "缺口", observed: "已观察", gapRule: "缺失时期之间不连线。", noConnectedPaths: "无法绘制连接轨迹：所选相邻时期没有重复实体。请检查重复实体和时间点映射。", legendAriaLabel: "纵向轨迹图例", largerCentroidMarker: "较大轮廓方形＝组时期质心", timeDirectionArrow: "箭头＝观察时间方向", flipped: "已翻转", firstAxis: "维度 1", secondAxis: "维度 2", circle: "圆形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六边形", solid: "实线", dashed: "虚线", dotted: "点线", dashDot: "点划线", shortDashed: "短虚线", longShortDashed: "长短虚线", marker: "标记", path: "路径", rowsTruncated: "画面省略了其余时期行；请使用纵向导出获取完整诊断。", individualMarksSampled: "个体图形标记已抽样：显示 {pointsShown}/{pointsTotal} 个点、{segmentsShown}/{segmentsTotal} 个整实体路径转换，以及 {arrowsShown}/{arrowsTotal} 个方向箭头。组质心路径保持完整。" },
  stats: { ...zhHant.stats, title: "证据与可复现性", description: "将描述性摘要与模型规格一并解读；发表层级的推论需要有依据的检验与研究设计。", variance: "解释方差", groupSummary: "组摘要", effect: "绝对 Cohen’s d", verifiedTests: "jENA 检验统计量", correlations: "维度相关", notTest: "jENA 报告检验统计量和自由度，但不计算 p 值；请根据研究设计选择并报告推论检验。", manifest: "分析清单", export: "导出清单", exportBundle: "导出结果包", identityExportWarning: "标准 ENA 衍生导出可能保留所选分析单位与组标识符；轨迹数据表也可能保留对话或时间标识符。这些数据并非匿名；分享前请审阅并假名化。", identityExportConfirmation: "此标准 ENA 导出可能包含分析单位、组、对话或时间标识符。请确认您已审阅或假名化，且分享受适当研究治理规范。", trajectoryNotice: "端点组检验与点—质心相关不适用于重复轨迹步骤。请描述性解读轨迹几何，或在工作区外使用符合研究设计的纵向方法。", ui: statsUiZhHans },
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
    providerDisclosure: "网关／供应商：OpenRouter 会将此经审阅的请求转发至下方显示的指定模型。",
    dataScopeDisclosure: "发送数据：经审阅、仅含聚合数据的 JSON 预览；不含原始来源数据行、来源文本或参与者级记录。",
    retentionDisclosure: "保留期及下游处理者：OpenRouter 表示其提示／完成内容记录在其层级为可选。每次 AI 生成都要求仅使用 ZDR 端点并拒绝供应商数据收集；若没有端点同时符合两项控制，请求会失败，不会降级到非 ZDR 供应商。这些请求级控制不能证明下游保留期、训练政策或处理地区；它们仍取决于端点、供应商及账户。",
    regionDisclosure: "处理地区：路由及下游供应商地区可能随部署及端点变化；本程序不承诺固定地区。",
    auditReceiptDisclosure: "审计回执：最小化、与哈希绑定的同意回执会记录操作、请求哈希、政策版本、供应商／模型、时间及终态；绝不保存提示或响应。",
    disclosureSummary: "同意前请审阅供应商、数据、保留期、地区及回执披露。",
    provider: "供应商",
    model: "模型",
    provenance: "解读来源记录",
    generatedAt: "生成时间",
    promptVersion: "提示版本",
    evidenceKey: "证据键",
    auditReceipt: "同意回执",
    requestSha256: "经审阅请求 SHA-256",
    consentPolicyVersion: "同意政策",
    recordedAt: "回执记录时间",
    durable: "持久回执",
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
  codeColorPicker: codeColorPickerZhHant,
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
  codeColorPicker: codeColorPickerZhHans,
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
