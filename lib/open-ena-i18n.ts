import type { Locale } from "./i18n";
import type {
  OpenEnaInferenceIntegrityCodeV2,
  OpenEnaInferenceReasonCodeV2,
} from "./open-ena/inference-v2";
import type {
  OpenEnaRankWarningCode,
  OpenEnaResolvedRankPMethod,
} from "./open-ena/rank-inference";

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

export interface OpenEnaCopy {
  eyebrow: string;
  title: string;
  intro: string;
  navLabel: string;
  modes: { sets: string; data: string; model: string; plot: string; stats: string };
  views: { twoD: string; threeD: string };
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
    isometric: string;
    xy: string;
    xz: string;
    yz: string;
    reset: string;
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
  omittedTests: "Omitted for {units} units. In jENA 0.6.2, these test summaries are currently coupled to the same quadratic correlation helper, so Open ENA does not run them automatically above {limit} units.",
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
  projectionCorrelationBoundary: "Not reported for reference projection. jENA 0.6.2 retains target-fitted centroids while this plot uses fixed imported nodes, so those point–centroid correlations would not describe the displayed reference geometry.",
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
  omittedTests: "由於共有 {units} 個單位，此項已省略。在 jENA 0.6.2 中，這些檢定摘要目前與同一個二次複雜度的相關輔助程式耦合，因此 Open ENA 不會在超過 {limit} 個單位時自動執行。",
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
  projectionCorrelationBoundary: "參照投影不報告此值。jENA 0.6.2 保留對目標資料擬合的質心，而此圖使用固定匯入節點，因此這些點—質心相關無法描述畫面所示的參照幾何。",
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
  omittedTests: "由于共有 {units} 个单位，此项已省略。在 jENA 0.6.2 中，这些检验摘要目前与同一个二次复杂度的相关辅助程序耦合，因此 Open ENA 不会在超过 {limit} 个单位时自动运行。",
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
  projectionCorrelationBoundary: "参考投影不报告此值。jENA 0.6.2 保留对目标数据拟合的质心，而此图使用固定导入节点，因此这些点—质心相关无法描述画面所示的参考几何。",
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

const en: OpenEnaCopy = {
  eyebrow: "Browser-based research workspace",
  title: "Open ENA",
  intro: "Build, inspect, and compare epistemic network models with jENA in the standard 2D workspace.",
  navLabel: "Open ENA",
  modes: { sets: "Sets", data: "Data", model: "Model", plot: "Plot Tools", stats: "Stats & Export" },
  views: { twoD: "2D ENA", threeD: "3D ENA" },
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
    isometric: "Isometric",
    xy: "X-Y plane",
    xz: "X-Z plane",
    yz: "Y-Z plane",
    reset: "Reset view",
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
    legendAriaLabel: "Longitudinal trajectory legend",
    largerCentroidMarker: "Larger outlined marker = group-period centroid",
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
    individualMarksSampled: "Individual plot marks are sampled: {pointsShown} of {pointsTotal} points and {segmentsShown} of {segmentsTotal} segments are shown. Group-centroid paths remain complete.",
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
    description: "Ask GPT-5.6 Luna to review the confirmed aggregate ENA evidence and the exact inference already computed in this browser. AI does not recompute the tests or replace researcher judgment.",
    previewTitle: "Review the aggregate request",
    previewHint: "Inspect the exact versioned JSON before deciding whether to send it.",
    consentLabel: "I reviewed this aggregate request and consent to sending it to the external AI provider.",
    generate: "Generate AI interpretation",
    generating: "Generating interpretation…",
    cancel: "Cancel",
    retry: "Retry",
    errorTitle: "AI interpretation was not generated",
    noCurrentResult: "Build a current ENA model before requesting an AI interpretation.",
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
    methodNote: "Interpret the graph with the source evidence and the recorded unit, conversation, code, window, weighting, normalization, and rotation choices. Visual separation alone is not significance or causality.",
    threeDNote: "The 3D ENA exploratory application is a separate website and does not automatically receive this workspace’s dataset or model.",
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
  intro: "在標準 2D 工作區中使用 jENA 建構、檢視和比較認知網絡模型。",
  navLabel: "開放 ENA",
  modes: { sets: "分析集", data: "資料", model: "模型", plot: "繪圖工具", stats: "統計與匯出" },
  views: { twoD: "2D ENA", threeD: "3D ENA" },
  sets: { ...en.sets, title: "分析集", description: "將端點模型保留在瀏覽器記憶體中，並比較共享同一參照幾何的擬合或投影網絡。", capture: "擷取目前模型", captureHint: "只擷取衍生座標與等權單位網絡平均值，不保留原始來源資料列；分析單位識別碼仍會保留，必要時請先假名化。", emptyTitle: "尚未擷取分析集", emptyText: "先建立端點模型，再在這裡擷取。擬合模型會安裝其可重用參照，使之後的 CSV 或 XLSX 檔案可投影到完全相同的 ENA 空間。", fitted: "擬合", projected: "投影", generatedReference: "可重用擬合參照", projectionReference: "已投影至參照", sourceHash: "分析資料表 SHA-256", hashScope: "雜湊範圍", primary: "主要分析集", secondary: "次要分析集", choosePrimary: "選擇主要分析集", chooseSecondary: "選擇相容的次要分析集", comparisonHint: "帶符號連線差異為共享固定幾何中的「主要減次要」。JSON 會保留分析單位識別碼；需要分享時請先假名化。", noCompatibleSecondary: "沒有可用的相容次要分析集。請在同一參照幾何中擷取或投影另一個端點模型。", remove: "移除", exportJson: "匯出比較 JSON", exportEdges: "匯出連線差異 CSV" },
  data: { ...en.data, title: "從編碼資料開始", description: "在此瀏覽器開啟 CSV 或 XLSX 檔案，或載入已記錄的學院範例以查看完整流程。", upload: "開啟 CSV 或 XLSX", uploadHint: "CSV 或 XLSX，最多 5 MB、20,000 列；XLSX 使用第一個工作表", sample: "載入教學範例", noFile: "尚未載入資料", active: "使用中的資料集", rows: "資料列", columns: "欄位", source: "來源", local: "核心 ENA 運算保留在此瀏覽器；原始來源資料列不會傳送至可選的 AI 解讀服務。" },
  model: { ...en.model, title: "定義 ENA 模型", description: "對應賦予網絡分析意義的欄位，然後執行已驗證的 jENA 流程。", sequenceNote: "CSV 或 XLSX 資料列順序定義每段對話中的序列；若順序重要，請在分析前先排序來源檔案。", unit: "分析單位", conversation: "對話", group: "比較群組", identityHint: "可選一個或多個欄位；順序會定義複合識別。", noGroup: "不設比較群組（全部分析單位）", codes: "編碼", window: "窗口", movingWindow: "移動段落窗口", conversationWindow: "完整對話", back: "向後跨度（包括目前列）", forward: "向前資料列", configureTrajectory: "設定軌跡模型", modelType: "模型類型", endpoint: "端點（每個分析單位一個網絡）", separateTrajectory: "分離軌跡（每一步一個點）", accumulatedTrajectory: "累積軌跡（每一步為累積網絡）", trajectoryHint: "軌跡步驟依每個分析單位首次出現的對話順序排列；統計面板不會將重複步驟視為獨立分析單位。", rotation: "旋轉", svd: "SVD（資料變異）", means: "廣義均值旋轉（GMR）", center: "將零網絡分析單位置於原點", weighting: "加權", binary: "二元", run: "建立 ENA 模型", rerun: "重新建立模型", valid: "模型輸入有效" },
  plot: { ...en.plot, title: "調整研究視圖", description: "這些控制只改變呈現方式，不會在未提示下重新建立模型。", showPoints: "分析單位點", showNetworks: "群組網絡", showLabels: "編碼標籤", showTrajectories: "軌跡路徑", edgeScale: "連線寬度", camera: "相機", isometric: "等距", reset: "重設視圖" },
  contrast: { ...en.contrast, title: "端點群組對比", description: "依序選擇主要與次要群組。中央圖以同一比例尺疊加兩個平均網絡；帶符號的「主要減次要」差異保留在證據表與匯出中。", primary: "主要群組", secondary: "次要群組", swap: "交換主要與次要群組", selectedOrder: "所選群組順序", selectedAxes: "所選座標軸", multiplicity: "此網絡對比只作描述；已確認的統計推論工作流程會在明確執行後套用固定 Holm 檢定族。", exportJson: "匯出群組對比 JSON", exportEdges: "匯出群組對比連線 CSV", requiresGroup: "無法使用群組對比：端點模型需要群組變項。", requiresTwoGroups: "無法使用群組對比：端點模型需要至少兩個不同群組。", endpointOnly: "無法使用群組對比：此功能只適用於端點模型。" },
  longitudinal: { ...en.longitudinal, title: "縱向群組質心路徑", description: "依明確期間順序，在固定 jENA 空間中衍生等權實體群組質心。這些呈現設定不會重建 jENA 或改變投影座標。", repeatedEntity: "重複測量實體", timeOrder: "時間／順序欄位", observedOrder: "明確時間順序（依來源資料首次出現）", moveEarlier: "將期間向前移", moveLater: "將期間向後移", cohortPolicy: "隊列政策", available: "可用隊列", complete: "完整隊列", availableHint: "可用隊列使用各期間實際出現的重複實體。", completeHint: "完整隊列只保留每個排序期間均有資料的重複實體。", showIndividualPaths: "個別軌跡路徑", showGroupPaths: "群組質心路徑", descriptive: "描述性縱向幾何", noEndpointTests: "重複軌跡期間不套用端點 Mann–Whitney 或 Welch 檢定。", exportJson: "匯出縱向 JSON", exportCsv: "匯出縱向期間 CSV", exportInferenceCsv: "匯出推論比較 CSV", allUnits: "未設定比較群組：顯示一條「全部單位」總體質心路徑。", period: "期間", group: "群組", availableCount: "可用", completeCount: "完整", includedCount: "納入", excludedCount: "缺失／排除", unavailableModel: "縱向群組質心分析需要成功的分離或累積軌跡結果。", unavailableEntity: "縱向分析需要來自擬合單位對應的重複實體欄位。", unavailableTime: "縱向分析需要來自擬合對話對應的時間／順序欄位。", unavailablePeriods: "縱向分析至少需要兩個排序期間。", unavailableComplete: "完整隊列中沒有在每個所選期間均有資料的合資格重複實體。", figureAriaLabel: "群組質心軌跡圖；小螢幕可水平捲動。", geometryView: "軌跡幾何視圖", diagnosticsCaption: "群組與期間質心診斷", nUsed: "使用數", nExcluded: "排除數", centroid: "質心", status: "狀態", gap: "缺口", observed: "已觀察", gapRule: "缺失期間之間不連線。", legendAriaLabel: "縱向軌跡圖例", largerCentroidMarker: "較大輪廓標記＝群組期間質心", timeDirectionArrow: "箭頭＝觀察時間方向", flipped: "已翻轉", firstAxis: "維度 1", secondAxis: "維度 2", circle: "圓形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六邊形", solid: "實線", dashed: "虛線", dotted: "點線", dashDot: "點劃線", shortDashed: "短虛線", longShortDashed: "長短虛線", marker: "標記", path: "路徑", rowsTruncated: "畫面省略了其餘期間列；請使用縱向匯出取得完整診斷。", individualMarksSampled: "個別圖形標記已抽樣：顯示 {pointsShown}/{pointsTotal} 個點與 {segmentsShown}/{segmentsTotal} 段。群組質心路徑保持完整。" },
  stats: { ...en.stats, title: "證據與可重現性", description: "將描述性摘要與模型規格一併閱讀；發表層級的推論需要有理據的檢定與研究設計。", variance: "解釋變異", groupSummary: "群組摘要", effect: "絕對 Cohen’s d", verifiedTests: "jENA 檢定統計量", correlations: "維度相關", notTest: "jENA 報告檢定統計量與自由度，但不計算 p 值；請依研究設計選擇及報告推論檢定。", manifest: "分析清單", export: "匯出清單", exportBundle: "匯出結果套件", trajectoryNotice: "端點群組檢定與點—質心相關不適用於重複軌跡步驟。請以描述方式解讀軌跡幾何，或在工作區外使用符合研究設計的縱向方法。", ui: statsUiZhHant },
  aiInterpretation: {
    ...en.aiInterpretation,
    title: "AI 輔助解讀",
    description: "請 GPT-5.6 Luna 審閱已確認的 ENA 彙總證據，以及瀏覽器已計算的精確推論結果。AI 不會重新計算檢定，也不能取代研究者判斷。",
    previewTitle: "審閱彙總請求",
    previewHint: "決定是否傳送前，請檢查完整且具版本的 JSON。",
    consentLabel: "我已審閱此彙總請求，並同意將它傳送給外部 AI 供應商。",
    generate: "生成 AI 解讀",
    generating: "正在生成解讀…",
    cancel: "取消",
    retry: "重試",
    errorTitle: "未能生成 AI 解讀",
    noCurrentResult: "請先建立目前的 ENA 模型，再請求 AI 解讀。",
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
  workspace: { ...en.workspace, comparison: "比較圖", groupNetworks: "群組網絡", emptyTitle: "建立教學範例", emptyText: "載入已記錄的範例或開啟編碼 CSV 或 XLSX 檔案，對應模型並建立分析。必要條件尚未完成時，比較圖、主要圖和次要圖框架仍會保持可見。", ready: "就緒", running: "正在以 jENA 建立…", result: "目前模型", units: "分析單位", trajectorySteps: "軌跡步驟", codes: "編碼", groups: "群組", runtime: "運行環境", methodNote: "請結合來源證據及已記錄的分析單位、對話、編碼、窗口、加權、標準化和旋轉選擇來解讀圖形。視覺分離本身並不代表顯著性或因果關係。", threeDNote: "3D ENA 探索應用程式是獨立網站，不會自動接收此工作區的資料集或模型。", errorTitle: "未能建立模型", accessibleSummary: "無障礙結果摘要", groupMeans: "群組平均座標", strongestDifferences: "最強網絡差異", strongestConnections: "最強網絡連結", strongerGroup: "較強群組", difference: "絕對差異", meanWeight: "平均權重" },
};

const zhHans: OpenEnaCopy = {
  ...zhHant,
  eyebrow: "浏览器研究工作区",
  title: "开放 ENA",
  intro: "在标准 2D 工作区中使用 jENA 构建、查看和比较认知网络模型。",
  navLabel: "开放 ENA",
  modes: { sets: "分析集", data: "数据", model: "模型", plot: "绘图工具", stats: "统计与导出" },
  views: { twoD: "2D ENA", threeD: "3D ENA" },
  sets: { ...zhHant.sets, title: "分析集", description: "将端点模型保留在浏览器内存中，并比较共享同一参考几何的拟合或投影网络。", capture: "捕获当前模型", captureHint: "只捕获派生坐标与等权单位网络均值，不保留原始来源数据行；分析单位标识符仍会保留，必要时请先假名化。", emptyTitle: "尚未捕获分析集", emptyText: "先构建端点模型，再在此捕获。拟合模型会安装其可复用参考，使之后的 CSV 或 XLSX 文件可投影到完全相同的 ENA 空间。", fitted: "拟合", projected: "投影", generatedReference: "可复用拟合参考", projectionReference: "已投影至参考", sourceHash: "分析数据表 SHA-256", hashScope: "哈希范围", primary: "主要分析集", secondary: "次要分析集", choosePrimary: "选择主要分析集", chooseSecondary: "选择兼容的次要分析集", comparisonHint: "带符号连线差异为共享固定几何中的“主要减次要”。JSON 会保留分析单位标识符；需要分享时请先假名化。", noCompatibleSecondary: "没有可用的兼容次要分析集。请在同一参考几何中捕获或投影另一个端点模型。", remove: "移除", exportJson: "导出比较 JSON", exportEdges: "导出连线差异 CSV" },
  data: { ...zhHant.data, title: "从编码数据开始", description: "在此浏览器打开 CSV 或 XLSX 文件，或加载已有说明的学院示例以查看完整流程。", upload: "打开 CSV 或 XLSX", uploadHint: "CSV 或 XLSX，最多 5 MB、20,000 行；XLSX 使用第一个工作表", sample: "加载教学示例", noFile: "尚未加载数据", active: "当前数据集", rows: "数据行", columns: "字段", source: "来源", local: "核心 ENA 计算保留在此浏览器；原始来源数据行不会发送到可选的 AI 解读服务。" },
  model: { ...zhHant.model, title: "定义 ENA 模型", description: "映射赋予网络分析意义的字段，然后运行已验证的 jENA 流程。", sequenceNote: "CSV 或 XLSX 数据行顺序定义每段对话中的序列；若顺序重要，请在分析前先排序源文件。", unit: "分析单位", conversation: "对话", group: "比较组", identityHint: "可选一个或多个字段；顺序会定义复合标识。", noGroup: "不设比较组（全部分析单位）", codes: "编码", window: "窗口", movingWindow: "移动段落窗口", conversationWindow: "完整对话", back: "向后跨度（包括当前行）", forward: "向前数据行", configureTrajectory: "配置轨迹模型", modelType: "模型类型", endpoint: "端点（每个分析单位一个网络）", separateTrajectory: "分离轨迹（每一步一个点）", accumulatedTrajectory: "累积轨迹（每一步为累积网络）", trajectoryHint: "轨迹步骤按每个分析单位首次出现的对话顺序排列；统计面板不会将重复步骤视为独立分析单位。", rotation: "旋转", svd: "SVD（数据方差）", means: "广义均值旋转（GMR）", center: "将零网络分析单位置于原点", weighting: "加权", binary: "二元", run: "构建 ENA 模型", rerun: "重新构建模型", valid: "模型输入有效" },
  plot: { ...zhHant.plot, title: "调整研究视图", description: "这些控件只改变呈现方式，不会在未提示下重新构建模型。", showPoints: "分析单位点", showNetworks: "组网络", showLabels: "编码标签", showTrajectories: "轨迹路径", edgeScale: "连线宽度", camera: "相机", isometric: "等距", reset: "重置视图" },
  contrast: { ...en.contrast, title: "端点组对比", description: "依次选择主要组和次要组。中央图以同一比例尺叠加两个平均网络；带符号的“主要减次要”差异保留在证据表与导出中。", primary: "主要组", secondary: "次要组", swap: "交换主要组和次要组", selectedOrder: "所选组顺序", selectedAxes: "所选坐标轴", multiplicity: "此网络对比仅作描述；已确认的统计推断工作流程会在明确运行后应用固定 Holm 检验族。", exportJson: "导出组对比 JSON", exportEdges: "导出组对比连线 CSV", requiresGroup: "无法使用组对比：端点模型需要分组变量。", requiresTwoGroups: "无法使用组对比：端点模型需要至少两个不同组。", endpointOnly: "无法使用组对比：此功能仅适用于端点模型。" },
  longitudinal: { ...en.longitudinal, title: "纵向组质心路径", description: "按明确时期顺序，在固定 jENA 空间中派生等权实体组质心。这些呈现设置不会重建 jENA 或改变投影坐标。", repeatedEntity: "重复测量实体", timeOrder: "时间／顺序字段", observedOrder: "明确时间顺序（按来源数据首次出现）", moveEarlier: "将时期前移", moveLater: "将时期后移", cohortPolicy: "队列策略", available: "可用队列", complete: "完整队列", availableHint: "可用队列使用各时期实际出现的重复实体。", completeHint: "完整队列只保留每个排序时期均有数据的重复实体。", showIndividualPaths: "个体轨迹路径", showGroupPaths: "组质心路径", descriptive: "描述性纵向几何", noEndpointTests: "重复轨迹时期不应用端点 Mann–Whitney 或 Welch 检验。", exportJson: "导出纵向 JSON", exportCsv: "导出纵向时期 CSV", exportInferenceCsv: "导出推断比较 CSV", allUnits: "未设置比较组：显示一条“所有单位”总体质心路径。", period: "时期", group: "组", availableCount: "可用", completeCount: "完整", includedCount: "纳入", excludedCount: "缺失／排除", unavailableModel: "纵向组质心分析需要成功的分离或累积轨迹结果。", unavailableEntity: "纵向分析需要来自拟合单位映射的重复实体字段。", unavailableTime: "纵向分析需要来自拟合对话映射的时间／顺序字段。", unavailablePeriods: "纵向分析至少需要两个排序时期。", unavailableComplete: "完整队列中没有在每个所选时期均有数据的合格重复实体。", figureAriaLabel: "组质心轨迹图；小屏幕可水平滚动。", geometryView: "轨迹几何视图", diagnosticsCaption: "组与时期质心诊断", nUsed: "使用数", nExcluded: "排除数", centroid: "质心", status: "状态", gap: "缺口", observed: "已观察", gapRule: "缺失时期之间不连线。", legendAriaLabel: "纵向轨迹图例", largerCentroidMarker: "较大轮廓标记＝组时期质心", timeDirectionArrow: "箭头＝观察时间方向", flipped: "已翻转", firstAxis: "维度 1", secondAxis: "维度 2", circle: "圆形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六边形", solid: "实线", dashed: "虚线", dotted: "点线", dashDot: "点划线", shortDashed: "短虚线", longShortDashed: "长短虚线", marker: "标记", path: "路径", rowsTruncated: "画面省略了其余时期行；请使用纵向导出获取完整诊断。", individualMarksSampled: "个体图形标记已抽样：显示 {pointsShown}/{pointsTotal} 个点与 {segmentsShown}/{segmentsTotal} 段。组质心路径保持完整。" },
  stats: { ...zhHant.stats, title: "证据与可复现性", description: "将描述性摘要与模型规格一并解读；发表层级的推论需要有依据的检验与研究设计。", variance: "解释方差", groupSummary: "组摘要", effect: "绝对 Cohen’s d", verifiedTests: "jENA 检验统计量", correlations: "维度相关", notTest: "jENA 报告检验统计量和自由度，但不计算 p 值；请根据研究设计选择并报告推论检验。", manifest: "分析清单", export: "导出清单", exportBundle: "导出结果包", trajectoryNotice: "端点组检验与点—质心相关不适用于重复轨迹步骤。请描述性解读轨迹几何，或在工作区外使用符合研究设计的纵向方法。", ui: statsUiZhHans },
  aiInterpretation: {
    ...zhHant.aiInterpretation,
    title: "AI 辅助解读",
    description: "请 GPT-5.6 Luna 审阅已确认的 ENA 汇总证据，以及浏览器已计算的精确推断结果。AI 不会重新计算检验，也不能取代研究者判断。",
    previewTitle: "审阅汇总请求",
    previewHint: "决定是否发送前，请检查完整且带版本的 JSON。",
    consentLabel: "我已审阅此汇总请求，并同意将它发送给外部 AI 供应商。",
    generate: "生成 AI 解读",
    generating: "正在生成解读…",
    cancel: "取消",
    retry: "重试",
    errorTitle: "未能生成 AI 解读",
    noCurrentResult: "请先构建当前 ENA 模型，再请求 AI 解读。",
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
  workspace: { ...zhHant.workspace, comparison: "比较图", groupNetworks: "组网络", emptyTitle: "构建教学示例", emptyText: "加载已有说明的示例或打开编码 CSV 或 XLSX 文件，映射模型并构建分析。必要条件尚未完成时，比较图、主要图和次要图框架仍会保持可见。", ready: "就绪", running: "正在使用 jENA 构建…", result: "当前模型", units: "分析单位", trajectorySteps: "轨迹步骤", codes: "编码", groups: "组", runtime: "运行环境", methodNote: "请结合来源证据以及记录的分析单位、对话、编码、窗口、加权、标准化和旋转选择来解读图形。视觉分离本身并不代表显著性或因果关系。", threeDNote: "3D ENA 探索应用程序是独立网站，不会自动接收此工作区的数据集或模型。", errorTitle: "未能构建模型", accessibleSummary: "无障碍结果摘要", groupMeans: "组平均坐标", strongestDifferences: "最强网络差异", strongestConnections: "最强网络连接", strongerGroup: "较强组", difference: "绝对差异", meanWeight: "平均权重" },
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
