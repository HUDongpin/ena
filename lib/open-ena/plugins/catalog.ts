import { parseOpenEnaPluginManifestV1 } from "./manifest";
import type { OpenEnaPluginManifestV1 } from "./types";

const repository = "https://github.com/HUDongpin/ena";
const maintainer = { name: "Dr. Peter Hu Dongpin", publicConsent: true } as const;
const previewAssurance = {
  automatedTests: "passed",
  browserRuntime: "pending",
  securityPrivacyReview: "pending",
  lastReviewed: "2026-09-02",
} as const;
const licenses = { code: "GPL-3.0-only", documentation: "CC-BY-4.0", sampleData: "NOASSERTION" } as const;

function source() {
  return { repository, revision: null, artifactSha256: null, fixtureSetSha256: null };
}

const rawCatalog = [
  {
    schemaVersion: "ena.hk/plugin-manifest/v1",
    pluginId: "ena-hk/3d-ena",
    slug: "3d-ena",
    version: "0.1.0-preview.1",
    contributionKinds: ["presenter-3d"], riskLevel: "P0", changesAnalysis: false,
    lifecycle: "research-preview", scientificEvidence: "display-only",
    content: {
      en: { name: "3D ENA", tagline: "Explore one fitted ENA model in three dimensions.", researchQuestion: "What relational geometry becomes visible when a third fitted dimension remains available?", limitations: ["The 3D view does not refit ENA or create inferential evidence.", "A third fitted dimension is required."], claims: ["Presents the existing fitted jENA coordinates in a linked three-dimensional view."], nonClaims: ["Does not rebuild connections, refit rotations, run inference, or establish validity from visual separation."] },
      "zh-hant": { name: "3D ENA", tagline: "在三個維度探索同一個已擬合 ENA 模型。", researchQuestion: "當第三個已擬合維度可用時，哪些關係幾何會變得可見？", limitations: ["3D 視圖不會重新擬合 ENA，也不會建立推論證據。", "結果必須包含第三個已擬合維度。"], claims: ["以相連的三維視圖呈現現有的已擬合 jENA 座標。"], nonClaims: ["不會重建連線、重新擬合旋轉、執行推論，或以視覺分離建立有效性。"] },
      "zh-hans": { name: "3D ENA", tagline: "在三个维度探索同一个已拟合 ENA 模型。", researchQuestion: "当第三个已拟合维度可用时，哪些关系几何会变得可见？", limitations: ["3D 视图不会重新拟合 ENA，也不会建立推断证据。", "结果必须包含第三个已拟合维度。"], claims: ["以相连的三维视图呈现现有的已拟合 jENA 坐标。"], nonClaims: ["不会重建连线、重新拟合旋转、运行推断，或以视觉分离建立有效性。"] },
    },
    authors: [{ name: "Dr. Peter Hu Dongpin", role: "software", publicConsent: true }, { name: "Dr. Peter Hu Dongpin", role: "visualization", publicConsent: true }],
    maintainer,
    compatibility: { coreApi: "1", jenaVersions: ["0.7.0-ona.0"], resultSchemaVersions: [2, 3], analysisKinds: ["ena"], modelTypes: ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"], minimumDimensions: 3, requiredCapabilities: ["3d"] },
    permissions: { dataAccessTier: "D2", network: "none", storage: "none", externalProcessing: false },
    scientificBoundary: { claims: ["Presents the existing fitted jENA coordinates in a linked three-dimensional view."], nonClaims: ["Does not rebuild connections, refit rotations, run inference, or establish validity from visual separation."] },
    engineeringAssurance: previewAssurance, source: source(), licenses,
    approvalBinding: { methodSpecificationSha256: null, reviewedManifestSha256: null },
    citation: "https://www.ena.hk/en/plugins/3d-ena", reviewReceipts: [],
    changelog: [{ version: "0.1.0-preview.1", date: "2026-09-02", summary: { en: "Initial Plugin Lab reference manifest.", "zh-hant": "首次 Plugin Lab 參考 manifest。", "zh-hans": "首次 Plugin Lab 参考 manifest。" } }],
  },
  {
    schemaVersion: "ena.hk/plugin-manifest/v1",
    pluginId: "ena-hk/ordered-network-analysis", slug: "ordered-network-analysis", version: "0.1.0-preview.1",
    contributionKinds: ["analysis-family", "presenter-2d", "diagnostic", "exporter"], riskLevel: "P2", changesAnalysis: true,
    lifecycle: "research-preview", scientificEvidence: "computationally-reproduced",
    content: {
      en: { name: "Ordered Network Analysis", tagline: "Model directed ground-to-response relations from explicitly ordered records.", researchQuestion: "How do earlier coded states connect directionally to later responses?", limitations: ["The current result is descriptive-only.", "Order, ties, horizons, and directional masks must be explicit."], claims: ["Uses an explicit typed order and a directed p-squared ordered adjacency."], nonClaims: ["Does not provide causal claims, ONA group subtraction, p-values, confidence intervals, or ONA trajectory inference."] },
      "zh-hant": { name: "有序網絡分析（ONA）", tagline: "從明確排序的紀錄建立 ground-to-response 有向關係。", researchQuestion: "較早的編碼狀態如何定向連接到較後的回應？", limitations: ["目前結果只作描述用途。", "排序、同值、horizon 與方向遮罩都必須明確。"], claims: ["使用明確的型別化順序與有向 p-squared 有序鄰接。"], nonClaims: ["不提供因果主張、ONA 群組相減、p 值、信賴區間或 ONA 軌跡推論。"] },
      "zh-hans": { name: "有序网络分析（ONA）", tagline: "从明确排序的记录建立 ground-to-response 有向关系。", researchQuestion: "较早的编码状态如何定向连接到较后的响应？", limitations: ["目前结果只作描述用途。", "排序、同值、horizon 与方向遮罩都必须明确。"], claims: ["使用明确的类型化顺序与有向 p-squared 有序邻接。"], nonClaims: ["不提供因果主张、ONA 组间相减、p 值、置信区间或 ONA 轨迹推断。"] },
    },
    authors: [{ name: "Dr. Peter Hu Dongpin", role: "software", publicConsent: true }], maintainer,
    compatibility: { coreApi: "1", jenaVersions: ["0.7.0-ona.0"], resultSchemaVersions: [2], analysisKinds: ["ona"], modelTypes: ["EndPoint"], minimumDimensions: 2, requiredCapabilities: [] },
    permissions: { dataAccessTier: "D2", network: "none", storage: "none", externalProcessing: false },
    scientificBoundary: { claims: ["Uses an explicit typed order and a directed p-squared ordered adjacency."], nonClaims: ["Does not provide causal claims, ONA group subtraction, p-values, confidence intervals, or ONA trajectory inference."] },
    engineeringAssurance: previewAssurance, source: source(), licenses,
    approvalBinding: { methodSpecificationSha256: null, reviewedManifestSha256: null },
    citation: "https://www.ena.hk/en/plugins/ordered-network-analysis", reviewReceipts: [],
    changelog: [{ version: "0.1.0-preview.1", date: "2026-09-02", summary: { en: "Initial reviewed-method catalog entry.", "zh-hant": "首次經審視方法目錄條目。", "zh-hans": "首次经审阅方法目录条目。" } }],
  },
  {
    schemaVersion: "ena.hk/plugin-manifest/v1",
    pluginId: "ena-hk/3d-ona", slug: "3d-ona", version: "0.1.0-preview.1",
    contributionKinds: ["presenter-3d"], riskLevel: "P0", changesAnalysis: false,
    lifecycle: "experimental", scientificEvidence: "display-only",
    content: {
      en: { name: "3D ONA Presenter", tagline: "Inspect a completed directed ONA result in three fitted dimensions.", researchQuestion: "How can reciprocal, self, and directed ONA geometry be inspected in a third fitted dimension?", limitations: ["Requires a completed ONA result with three dimensions.", "The presenter adds no ONA inference or group subtraction."], claims: ["Presents the same completed directed ONA model in three dimensions."], nonClaims: ["Does not convert standard ENA into ONA or create a new inferential result."] },
      "zh-hant": { name: "3D ONA 呈現器", tagline: "以三個已擬合維度檢視完成的有向 ONA 結果。", researchQuestion: "如何在第三個已擬合維度檢視互惠、自連與有向 ONA 幾何？", limitations: ["需要包含三個維度的完成 ONA 結果。", "呈現器不增加 ONA 推論或群組相減。"], claims: ["以三個維度呈現同一個已完成的有向 ONA 模型。"], nonClaims: ["不會把標準 ENA 轉換為 ONA，也不會建立新的推論結果。"] },
      "zh-hans": { name: "3D ONA 呈现器", tagline: "以三个已拟合维度查看完成的有向 ONA 结果。", researchQuestion: "如何在第三个已拟合维度查看互惠、自连与有向 ONA 几何？", limitations: ["需要包含三个维度的完成 ONA 结果。", "呈现器不增加 ONA 推断或组相减。"], claims: ["以三个维度呈现同一个已完成的有向 ONA 模型。"], nonClaims: ["不会把标准 ENA 转换为 ONA，也不会创建新的推断结果。"] },
    },
    authors: [{ name: "Dr. Peter Hu Dongpin", role: "visualization", publicConsent: true }], maintainer,
    compatibility: { coreApi: "1", jenaVersions: ["0.7.0-ona.0"], resultSchemaVersions: [2], analysisKinds: ["ona"], modelTypes: ["EndPoint"], minimumDimensions: 3, requiredCapabilities: ["3d"] },
    permissions: { dataAccessTier: "D2", network: "none", storage: "none", externalProcessing: false },
    scientificBoundary: { claims: ["Presents the same completed directed ONA model in three dimensions."], nonClaims: ["Does not convert standard ENA into ONA or create a new inferential result."] },
    engineeringAssurance: previewAssurance, source: source(), licenses,
    approvalBinding: { methodSpecificationSha256: null, reviewedManifestSha256: null },
    citation: "https://www.ena.hk/en/plugins/3d-ona", reviewReceipts: [],
    changelog: [{ version: "0.1.0-preview.1", date: "2026-09-02", summary: { en: "Initial experimental catalog entry.", "zh-hant": "首次實驗目錄條目。", "zh-hans": "首次实验目录条目。" } }],
  },
  {
    schemaVersion: "ena.hk/plugin-manifest/v1",
    pluginId: "ena-hk/longitudinal-ena", slug: "longitudinal-ena", version: "0.1.0-preview.1",
    contributionKinds: ["model-workflow", "presenter-3d", "diagnostic", "exporter"], riskLevel: "P3", changesAnalysis: true,
    lifecycle: "experimental", scientificEvidence: "method-specified",
    content: {
      en: { name: "Longitudinal ENA", tagline: "Follow explicitly ordered entity-period movement in fitted ENA space.", researchQuestion: "How does an entity or group move through a shared fitted ENA space across periods?", limitations: ["Repeated-entity identity and period order must be confirmed.", "Remote compute, when enabled, has a separate privacy and operational boundary."], claims: ["Derives ordered longitudinal movement from a completed fitted trajectory model under explicit identity and period settings."], nonClaims: ["Does not treat repeated steps as independent or establish causality or learning gains."] },
      "zh-hant": { name: "縱向 ENA", tagline: "在已擬合 ENA 空間追蹤明確排序的 entity-period 移動。", researchQuestion: "個體或群組如何跨時期在共享 ENA 空間移動？", limitations: ["必須確認重複實體身份與時期順序。", "啟用遠端計算時另有隱私與營運邊界。"], claims: ["在明確的身分與時期設定下，從已完成擬合的軌跡模型推導有序縱向移動。"], nonClaims: ["不會把重複步驟視為獨立，也不會建立因果關係或學習增益。"] },
      "zh-hans": { name: "纵向 ENA", tagline: "在已拟合 ENA 空间追踪明确排序的 entity-period 移动。", researchQuestion: "个体或组如何跨时期在共享 ENA 空间移动？", limitations: ["必须确认重复实体身份与时期顺序。", "启用远程计算时另有隐私与运营边界。"], claims: ["在明确的身份与时期设置下，从已完成拟合的轨迹模型推导有序纵向移动。"], nonClaims: ["不会把重复步骤视为独立，也不会建立因果关系或学习增益。"] },
    },
    authors: [{ name: "Dr. Peter Hu Dongpin", role: "software", publicConsent: true }], maintainer,
    compatibility: { coreApi: "1", jenaVersions: ["0.7.0-ona.0"], resultSchemaVersions: [2], analysisKinds: ["ena"], modelTypes: ["SeparateTrajectory", "AccumulatedTrajectory"], minimumDimensions: 3, requiredCapabilities: ["trajectory", "3d"] },
    permissions: { dataAccessTier: "D2", network: "host-brokered", storage: "host-mediated", externalProcessing: true },
    scientificBoundary: { claims: ["Derives ordered longitudinal movement from a completed fitted trajectory model under explicit identity and period settings."], nonClaims: ["Does not treat repeated steps as independent or establish causality or learning gains."] },
    engineeringAssurance: previewAssurance, source: source(), licenses,
    approvalBinding: { methodSpecificationSha256: null, reviewedManifestSha256: null },
    citation: "https://www.ena.hk/en/plugins/longitudinal-ena", reviewReceipts: [],
    changelog: [{ version: "0.1.0-preview.1", date: "2026-09-02", summary: { en: "Initial high-risk workflow catalog entry.", "zh-hant": "首次高風險工作流程目錄條目。", "zh-hans": "首次高风险工作流程目录条目。" } }],
  },
] as const;

export const OPEN_ENA_PLUGIN_CATALOG: readonly OpenEnaPluginManifestV1[] = Object.freeze(
  rawCatalog.map((entry) => parseOpenEnaPluginManifestV1(entry)),
);

const bySlug = new Map(OPEN_ENA_PLUGIN_CATALOG.map((entry) => [entry.slug, entry]));

export function getOpenEnaPluginBySlug(slug: string) {
  return bySlug.get(slug) ?? null;
}
