import type { Locale } from "./i18n";

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
    multiplicity: "No multiplicity correction is applied across axes or repeated pair selections.",
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
  },
  aiInterpretation: {
    title: "AI-assisted interpretation",
    description: "Ask GPT-5.6 Luna to summarize the reviewed aggregate ENA evidence. The result is a research aid, not an autonomous finding.",
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
    aggregatePrivacyGate: "AI interpretation is unavailable because each aggregate group and observed trajectory period must contain at least three entities.",
    aiGenerated: "AI-generated; researcher review is required.",
    descriptiveOnly: "Descriptive interpretation of aggregate ENA evidence only.",
    notStatisticalInference: "This is not a statistical test or statistical inference.",
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
  contrast: { ...en.contrast, title: "端點群組對比", description: "依序選擇主要與次要群組。中央圖以同一比例尺疊加兩個平均網絡；帶符號的「主要減次要」差異保留在證據表與匯出中。", primary: "主要群組", secondary: "次要群組", swap: "交換主要與次要群組", selectedOrder: "所選群組順序", multiplicity: "各軸或重複配對選擇之間不作多重比較校正。", exportJson: "匯出群組對比 JSON", exportEdges: "匯出群組對比連線 CSV", requiresGroup: "無法使用群組對比：端點模型需要群組變項。", requiresTwoGroups: "無法使用群組對比：端點模型需要至少兩個不同群組。", endpointOnly: "無法使用群組對比：此功能只適用於端點模型。" },
  longitudinal: { ...en.longitudinal, title: "縱向群組質心路徑", description: "依明確期間順序，在固定 jENA 空間中衍生等權實體群組質心。這些呈現設定不會重建 jENA 或改變投影座標。", repeatedEntity: "重複測量實體", timeOrder: "時間／順序欄位", observedOrder: "明確時間順序（依來源資料首次出現）", moveEarlier: "將期間向前移", moveLater: "將期間向後移", cohortPolicy: "隊列政策", available: "可用隊列", complete: "完整隊列", availableHint: "可用隊列使用各期間實際出現的重複實體。", completeHint: "完整隊列只保留每個排序期間均有資料的重複實體。", showIndividualPaths: "個別軌跡路徑", showGroupPaths: "群組質心路徑", descriptive: "描述性縱向幾何", noEndpointTests: "重複軌跡期間不套用端點 Mann–Whitney 或 Welch 檢定。", exportJson: "匯出縱向 JSON", exportCsv: "匯出縱向期間 CSV", allUnits: "未設定比較群組：顯示一條「全部單位」總體質心路徑。", period: "期間", group: "群組", availableCount: "可用", completeCount: "完整", includedCount: "納入", excludedCount: "缺失／排除", unavailableModel: "縱向群組質心分析需要成功的分離或累積軌跡結果。", unavailableEntity: "縱向分析需要來自擬合單位對應的重複實體欄位。", unavailableTime: "縱向分析需要來自擬合對話對應的時間／順序欄位。", unavailablePeriods: "縱向分析至少需要兩個排序期間。", unavailableComplete: "完整隊列中沒有在每個所選期間均有資料的合資格重複實體。", figureAriaLabel: "群組質心軌跡圖；小螢幕可水平捲動。", geometryView: "軌跡幾何視圖", diagnosticsCaption: "群組與期間質心診斷", nUsed: "使用數", nExcluded: "排除數", centroid: "質心", status: "狀態", gap: "缺口", observed: "已觀察", gapRule: "缺失期間之間不連線。", legendAriaLabel: "縱向軌跡圖例", largerCentroidMarker: "較大輪廓標記＝群組期間質心", timeDirectionArrow: "箭頭＝觀察時間方向", flipped: "已翻轉", firstAxis: "維度 1", secondAxis: "維度 2", circle: "圓形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六邊形", solid: "實線", dashed: "虛線", dotted: "點線", dashDot: "點劃線", shortDashed: "短虛線", longShortDashed: "長短虛線", marker: "標記", path: "路徑", rowsTruncated: "畫面省略了其餘期間列；請使用縱向匯出取得完整診斷。", individualMarksSampled: "個別圖形標記已抽樣：顯示 {pointsShown}/{pointsTotal} 個點與 {segmentsShown}/{segmentsTotal} 段。群組質心路徑保持完整。" },
  stats: { ...en.stats, title: "證據與可重現性", description: "將描述性摘要與模型規格一併閱讀；發表層級的推論需要有理據的檢定與研究設計。", variance: "解釋變異", groupSummary: "群組摘要", effect: "絕對 Cohen’s d", verifiedTests: "jENA 檢定統計量", correlations: "維度相關", notTest: "jENA 報告檢定統計量與自由度，但不計算 p 值；請依研究設計選擇及報告推論檢定。", manifest: "分析清單", export: "匯出清單", exportBundle: "匯出結果套件", trajectoryNotice: "端點群組檢定與點—質心相關不適用於重複軌跡步驟。請以描述方式解讀軌跡幾何，或在工作區外使用符合研究設計的縱向方法。" },
  aiInterpretation: {
    ...en.aiInterpretation,
    title: "AI 輔助解讀",
    description: "請 GPT-5.6 Luna 摘要經審閱的 ENA 彙總證據。結果只供研究輔助，並非自主研究發現。",
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
    aggregatePrivacyGate: "AI 解讀目前不可用：每個彙總群組及已觀察軌跡期間必須至少包含三個實體。",
    aiGenerated: "由 AI 生成；必須由研究者審閱。",
    descriptiveOnly: "只對 ENA 彙總證據作描述性解讀。",
    notStatisticalInference: "此內容不是統計推論或統計檢定。",
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
  contrast: { ...en.contrast, title: "端点组对比", description: "依次选择主要组和次要组。中央图以同一比例尺叠加两个平均网络；带符号的“主要减次要”差异保留在证据表与导出中。", primary: "主要组", secondary: "次要组", swap: "交换主要组和次要组", selectedOrder: "所选组顺序", multiplicity: "各轴或重复配对选择之间不作多重比较校正。", exportJson: "导出组对比 JSON", exportEdges: "导出组对比连线 CSV", requiresGroup: "无法使用组对比：端点模型需要分组变量。", requiresTwoGroups: "无法使用组对比：端点模型需要至少两个不同组。", endpointOnly: "无法使用组对比：此功能仅适用于端点模型。" },
  longitudinal: { ...en.longitudinal, title: "纵向组质心路径", description: "按明确时期顺序，在固定 jENA 空间中派生等权实体组质心。这些呈现设置不会重建 jENA 或改变投影坐标。", repeatedEntity: "重复测量实体", timeOrder: "时间／顺序字段", observedOrder: "明确时间顺序（按来源数据首次出现）", moveEarlier: "将时期前移", moveLater: "将时期后移", cohortPolicy: "队列策略", available: "可用队列", complete: "完整队列", availableHint: "可用队列使用各时期实际出现的重复实体。", completeHint: "完整队列只保留每个排序时期均有数据的重复实体。", showIndividualPaths: "个体轨迹路径", showGroupPaths: "组质心路径", descriptive: "描述性纵向几何", noEndpointTests: "重复轨迹时期不应用端点 Mann–Whitney 或 Welch 检验。", exportJson: "导出纵向 JSON", exportCsv: "导出纵向时期 CSV", allUnits: "未设置比较组：显示一条“所有单位”总体质心路径。", period: "时期", group: "组", availableCount: "可用", completeCount: "完整", includedCount: "纳入", excludedCount: "缺失／排除", unavailableModel: "纵向组质心分析需要成功的分离或累积轨迹结果。", unavailableEntity: "纵向分析需要来自拟合单位映射的重复实体字段。", unavailableTime: "纵向分析需要来自拟合对话映射的时间／顺序字段。", unavailablePeriods: "纵向分析至少需要两个排序时期。", unavailableComplete: "完整队列中没有在每个所选时期均有数据的合格重复实体。", figureAriaLabel: "组质心轨迹图；小屏幕可水平滚动。", geometryView: "轨迹几何视图", diagnosticsCaption: "组与时期质心诊断", nUsed: "使用数", nExcluded: "排除数", centroid: "质心", status: "状态", gap: "缺口", observed: "已观察", gapRule: "缺失时期之间不连线。", legendAriaLabel: "纵向轨迹图例", largerCentroidMarker: "较大轮廓标记＝组时期质心", timeDirectionArrow: "箭头＝观察时间方向", flipped: "已翻转", firstAxis: "维度 1", secondAxis: "维度 2", circle: "圆形", diamond: "菱形", triangle: "三角形", square: "方形", cross: "十字形", hexagon: "六边形", solid: "实线", dashed: "虚线", dotted: "点线", dashDot: "点划线", shortDashed: "短虚线", longShortDashed: "长短虚线", marker: "标记", path: "路径", rowsTruncated: "画面省略了其余时期行；请使用纵向导出获取完整诊断。", individualMarksSampled: "个体图形标记已抽样：显示 {pointsShown}/{pointsTotal} 个点与 {segmentsShown}/{segmentsTotal} 段。组质心路径保持完整。" },
  stats: { ...zhHant.stats, title: "证据与可复现性", description: "将描述性摘要与模型规格一并解读；发表层级的推论需要有依据的检验与研究设计。", variance: "解释方差", groupSummary: "组摘要", effect: "绝对 Cohen’s d", verifiedTests: "jENA 检验统计量", correlations: "维度相关", notTest: "jENA 报告检验统计量和自由度，但不计算 p 值；请根据研究设计选择并报告推论检验。", manifest: "分析清单", export: "导出清单", exportBundle: "导出结果包", trajectoryNotice: "端点组检验与点—质心相关不适用于重复轨迹步骤。请描述性解读轨迹几何，或在工作区外使用符合研究设计的纵向方法。" },
  aiInterpretation: {
    ...zhHant.aiInterpretation,
    title: "AI 辅助解读",
    description: "请 GPT-5.6 Luna 总结经审阅的 ENA 汇总证据。结果仅供研究辅助，并非自主研究发现。",
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
    aggregatePrivacyGate: "AI 解读当前不可用：每个汇总组及已观察轨迹时期必须至少包含三个实体。",
    aiGenerated: "由 AI 生成；必须由研究者审阅。",
    descriptiveOnly: "只对 ENA 汇总证据作描述性解读。",
    notStatisticalInference: "此内容不是统计推断或统计检验。",
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
  accumulatedOrderLocked: "累積軌跡必須鎖定於擬合時的來源出現順序，因為每個點包含此前的網絡歷史。",
  noContributorOverlap: "沒有共同參與者",
  gapRule: "缺失期間或相鄰期間沒有共同重複實體時，均不連線。",
  timeDirectionArrow: "箭頭＝所選期間方向",
});

Object.assign(zhHant.model, {
  codeColor: "編碼顏色",
});

Object.assign(zhHans.longitudinal, {
  accumulatedOrderLocked: "累积轨迹必须锁定于拟合时的来源出现顺序，因为每个点包含此前的网络历史。",
  noContributorOverlap: "没有共同参与者",
  gapRule: "缺失时期或相邻时期没有共同重复实体时，均不连线。",
  timeDirectionArrow: "箭头＝所选时期方向",
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
