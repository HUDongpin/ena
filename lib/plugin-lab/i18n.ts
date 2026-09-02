import type { Locale } from "@/lib/i18n";
import type { OpenEnaPluginManifestV1 } from "@/lib/open-ena/plugins/types";
import type { PluginProposalState } from "@/lib/plugin-lab/proposal";

export interface PluginLabCopy {
  contentFallback: boolean;
  navLabel: string;
  explore: string;
  propose: string;
  status: string;
  eyebrow: string;
  title: string;
  intro: string;
  independentBoundary: string;
  catalogTitle: string;
  catalogIntro: string;
  coCreateTitle: string;
  coCreateText: string;
  publicTrack: string;
  privateTrack: string;
  processTitle: string;
  process: readonly string[];
  changesAnalysis: string;
  yes: string;
  no: string;
  productStatus: string;
  scientificEvidence: string;
  engineeringAssurance: string;
  limitations: string;
  compatibility: string;
  permissions: string;
  license: string;
  source: string;
  team: string;
  version: string;
  researchQuestion: string;
  claims: string;
  nonClaims: string;
  tryPlugin: string;
  fallbackNotice: string;
  independentBoundaryTitle: string;
  coCreateEyebrow: string;
  missionPrinciples: readonly Readonly<{ title: string; text: string }>[];
  loginInvitation: string;
  loginProposalLink: string;
  automatedTests: string;
  browserRuntime: string;
  securityPrivacy: string;
  lastReviewed: string;
  dimensions: string;
  network: string;
  storage: string;
  externalProcessing: string;
  codeLicense: string;
  documentationLicense: string;
  sampleDataLicense: string;
  maintainer: string;
  sourceRepository: string;
  citationRecord: string;
  changelog: string;
  provenanceBindings: string;
  notYetBound: string;
  reviewReceipts: string;
  sourceRevision: string;
  artifactHash: string;
  fixtureHash: string;
  methodSpecification: string;
  reviewedManifest: string;
  communityProposals: string;
  selectedIdeas: string;
  selectedIdeasIntro: string;
  communityProposal: string;
  selectedLabel: string;
  updatedLabel: string;
}

const en: PluginLabCopy = {
  contentFallback: false,
  navLabel: "Plugin Lab",
  explore: "Explore plugins",
  propose: "Propose a plugin",
  status: "Check proposal status",
  eyebrow: "Researcher × developer co-creation",
  title: "Turn an ENA research idea into a reviewable plugin.",
  intro: "Bring the research question and methodological insight. Co-design the specification, evidence, and software with Dr. Peter Hu.",
  independentBoundary: "ENA.HK Plugins are independent extensions for ENA workflows. They are not official webENA features or endorsements unless explicitly documented.",
  catalogTitle: "Reviewed plugin catalog",
  catalogIntro: "Product availability, scientific evidence, and engineering assurance are reported separately for every exact version.",
  coCreateTitle: "Bring a research question, not a code package.",
  coCreateText: "Public and private-review tracks use one structured proposal and the same scientific, privacy, security, and release gates.",
  publicTrack: "Public proposal after moderation and renewed consent",
  privateTrack: "Private review; not public and not an NDA",
  processTitle: "From idea to a maintained capability",
  process: ["Proposal", "Co-design", "Experimental", "Research Preview", "Release Candidate", "Production"],
  changesAnalysis: "Does this plugin change the analysis?",
  yes: "Yes",
  no: "No",
  productStatus: "Product status",
  scientificEvidence: "Scientific evidence",
  engineeringAssurance: "Engineering assurance",
  limitations: "Limitations",
  compatibility: "Compatibility",
  permissions: "Data and network permissions",
  license: "Licenses",
  source: "Source",
  team: "Team and roles",
  version: "Version",
  researchQuestion: "Research question",
  claims: "What this version supports",
  nonClaims: "What this version does not claim",
  tryPlugin: "Open in Open ENA",
  fallbackNotice: "The reviewed Plugin Lab method content is currently available in English on this page.",
  independentBoundaryTitle: "Independent extension boundary",
  coCreateEyebrow: "Co-create with Dr. Peter Hu",
  missionPrinciples: [
    { title: "Research question first", text: "A researcher contributes the problem, method insight, evidence, and limitations; software begins only after a reviewable specification exists." },
    { title: "Evidence stays explicit", text: "Product availability, scientific evidence, and engineering assurance are reported independently for every exact plugin version." },
    { title: "High-risk work is independently reviewed", text: "A plugin that changes analysis semantics or sends analysis data to an external service requires review beyond its proposer and primary implementer." },
  ],
  loginInvitation: "Have an idea for a new ENA method, visualization, or workflow?",
  loginProposalLink: "Propose it with Dr. Peter Hu",
  automatedTests: "Automated tests",
  browserRuntime: "Browser runtime",
  securityPrivacy: "Security/privacy",
  lastReviewed: "Last reviewed",
  dimensions: "dimensions",
  network: "network",
  storage: "storage",
  externalProcessing: "external processing",
  codeLicense: "Code",
  documentationLicense: "documentation",
  sampleDataLicense: "sample data",
  maintainer: "Maintainer",
  sourceRepository: "Source repository",
  citationRecord: "Citation record",
  changelog: "Changelog",
  provenanceBindings: "Release bindings",
  notYetBound: "not yet bound",
  reviewReceipts: "review receipts",
  sourceRevision: "Source revision",
  artifactHash: "Artifact SHA-256",
  fixtureHash: "Fixture-set SHA-256",
  methodSpecification: "Method specification",
  reviewedManifest: "Reviewed manifest SHA-256",
  communityProposals: "Community proposals",
  selectedIdeas: "Selected ideas in co-design",
  selectedIdeasIntro: "These summaries were moderated by ENA Plugin Lab and explicitly confirmed for publication by their proposers. Selection is not method validation or endorsement.",
  communityProposal: "Community proposal",
  selectedLabel: "Selected",
  updatedLabel: "updated",
};

const zhHant: PluginLabCopy = {
  ...en,
  navLabel: "插件實驗室",
  explore: "探索插件",
  propose: "提出插件構想",
  status: "查詢提案狀態",
  eyebrow: "研究者 × 開發者共創",
  title: "把 ENA 研究構想轉化為可審查的插件。",
  intro: "由研究者帶來研究問題與方法洞見，與 Dr. Peter Hu 共同設計規格、證據與軟件。",
  independentBoundary: "ENA.HK Plugins 是獨立開發的 ENA 工作流程擴展。除非另有明確證明，它們並非 official webENA 功能或官方背書。",
  catalogTitle: "經審視的插件目錄",
  catalogIntro: "每個精確版本分開報告產品狀態、科學證據與工程保證。",
  coCreateTitle: "帶來研究問題，不需要先提交程式碼。",
  coCreateText: "公開與私密初審使用同一份結構化提案，並通過相同的科學、隱私、安全和發布階段門。",
  publicTrack: "經人工審核及再次同意後公開摘要",
  privateTrack: "私密初審；不公開，也不構成 NDA",
  processTitle: "從構想到持續維護的能力",
  process: ["提案", "共同設計", "實驗", "研究預覽", "發布候選", "生產"],
  changesAnalysis: "這個插件會改變分析嗎？",
  yes: "會",
  no: "不會",
  productStatus: "產品狀態",
  scientificEvidence: "科學證據",
  engineeringAssurance: "工程保證",
  limitations: "限制",
  compatibility: "相容性",
  permissions: "資料與網絡權限",
  license: "許可",
  source: "原始碼",
  team: "團隊與角色",
  version: "版本",
  researchQuestion: "研究問題",
  claims: "本版本支持的主張",
  nonClaims: "本版本不作出的主張",
  tryPlugin: "在 Open ENA 開啟",
  fallbackNotice: "本頁經審校的 Plugin Lab 方法內容目前以英文提供。",
  independentBoundaryTitle: "獨立擴展邊界",
  coCreateEyebrow: "與 Dr. Peter Hu 共創",
  missionPrinciples: [
    { title: "研究問題優先", text: "研究者提出問題、方法洞見、證據與限制；只有在形成可審查規格後才開始軟件工作。" },
    { title: "證據保持明確", text: "每個精確插件版本分開報告產品可用性、科學證據和工程保證。" },
    { title: "高風險工作接受獨立審查", text: "改變分析語義或把分析資料傳送到外部服務的插件，必須由提案者和主要實作者以外的人員審查。" },
  ],
  loginInvitation: "對新的 ENA 方法、視覺化或工作流程有構想？",
  loginProposalLink: "與 Dr. Peter Hu 一起提出提案",
  automatedTests: "自動化測試",
  browserRuntime: "瀏覽器執行",
  securityPrivacy: "安全與隱私",
  lastReviewed: "最後審查",
  dimensions: "個維度",
  network: "網絡",
  storage: "儲存",
  externalProcessing: "外部處理",
  codeLicense: "程式碼",
  documentationLicense: "文件",
  sampleDataLicense: "樣例資料",
  maintainer: "維護者",
  sourceRepository: "原始碼儲存庫",
  citationRecord: "引用紀錄",
  changelog: "變更記錄",
  provenanceBindings: "發布綁定",
  notYetBound: "尚未綁定",
  reviewReceipts: "審查收據",
  sourceRevision: "原始碼修訂",
  artifactHash: "成品 SHA-256",
  fixtureHash: "測試資料集 SHA-256",
  methodSpecification: "方法規格",
  reviewedManifest: "經審查 manifest SHA-256",
  communityProposals: "社群提案",
  selectedIdeas: "共同設計中的入選構想",
  selectedIdeasIntro: "這些摘要已由 ENA Plugin Lab 人工審核，並由提案者明確確認公開。入選不代表方法驗證或背書。",
  communityProposal: "社群提案",
  selectedLabel: "已入選",
  updatedLabel: "更新於",
};

const zhHans: PluginLabCopy = {
  ...zhHant,
  navLabel: "插件实验室",
  explore: "探索插件",
  propose: "提出插件构想",
  status: "查询提案状态",
  eyebrow: "研究者 × 开发者共创",
  title: "把 ENA 研究构想转化为可审查的插件。",
  intro: "由研究者带来研究问题与方法洞见，与 Dr. Peter Hu 共同设计规格、证据与软件。",
  independentBoundary: "ENA.HK Plugins 是独立开发的 ENA 工作流程扩展。除非另有明确证明，它们并非 official webENA 功能或官方背书。",
  catalogTitle: "经审阅的插件目录",
  catalogIntro: "每个精确版本分别报告产品状态、科学证据与工程保证。",
  coCreateTitle: "带来研究问题，不需要先提交代码。",
  coCreateText: "公开与私密初审使用同一份结构化提案，并通过相同的科学、隐私、安全和发布阶段门。",
  publicTrack: "经人工审核及再次同意后公开摘要",
  privateTrack: "私密初审；不公开，也不构成 NDA",
  processTitle: "从构想到持续维护的能力",
  process: ["提案", "共同设计", "实验", "研究预览", "发布候选", "生产"],
  changesAnalysis: "这个插件会改变分析吗？",
  yes: "会",
  no: "不会",
  productStatus: "产品状态",
  scientificEvidence: "科学证据",
  engineeringAssurance: "工程保证",
  limitations: "限制",
  compatibility: "兼容性",
  permissions: "数据与网络权限",
  license: "许可",
  source: "源代码",
  team: "团队与角色",
  version: "版本",
  researchQuestion: "研究问题",
  claims: "本版本支持的主张",
  nonClaims: "本版本不作出的主张",
  tryPlugin: "在 Open ENA 打开",
  fallbackNotice: "本页经审校的 Plugin Lab 方法内容目前以英文提供。",
  independentBoundaryTitle: "独立扩展边界",
  coCreateEyebrow: "与 Dr. Peter Hu 共创",
  missionPrinciples: [
    { title: "研究问题优先", text: "研究者提出问题、方法洞见、证据与限制；只有在形成可审查规格后才开始软件工作。" },
    { title: "证据保持明确", text: "每个精确插件版本分别报告产品可用性、科学证据和工程保证。" },
    { title: "高风险工作接受独立审查", text: "改变分析语义或把分析数据发送到外部服务的插件，必须由提案者和主要实现者以外的人员审查。" },
  ],
  loginInvitation: "对新的 ENA 方法、可视化或工作流程有构想？",
  loginProposalLink: "与 Dr. Peter Hu 一起提出提案",
  automatedTests: "自动化测试",
  browserRuntime: "浏览器运行",
  securityPrivacy: "安全与隐私",
  lastReviewed: "最后审查",
  dimensions: "个维度",
  network: "网络",
  storage: "存储",
  externalProcessing: "外部处理",
  codeLicense: "代码",
  documentationLicense: "文档",
  sampleDataLicense: "样例数据",
  maintainer: "维护者",
  sourceRepository: "源代码仓库",
  citationRecord: "引用记录",
  changelog: "变更记录",
  provenanceBindings: "发布绑定",
  notYetBound: "尚未绑定",
  reviewReceipts: "审查回执",
  sourceRevision: "源代码修订",
  artifactHash: "产物 SHA-256",
  fixtureHash: "测试数据集 SHA-256",
  methodSpecification: "方法规格",
  reviewedManifest: "经审查 manifest SHA-256",
  communityProposals: "社区提案",
  selectedIdeas: "共同设计中的入选构想",
  selectedIdeasIntro: "这些摘要已由 ENA Plugin Lab 人工审核，并由提案者明确确认公开。入选不代表方法验证或背书。",
  communityProposal: "社区提案",
  selectedLabel: "已入选",
  updatedLabel: "更新于",
};

export interface PluginProposalFormCopy {
  fallback: boolean;
  fallbackNotice: string;
  beforeSubmitTitle: string;
  beforeSubmitText: string;
  intakeClosedTitle: string;
  intakeClosedText: string;
  saveReceipt: string;
  proposalReceived: string;
  accessCodeOnce: string;
  proposalId: string;
  accessCode: string;
  checkStatus: string;
  safetyTitle: string;
  safetyText: string;
  email: string;
  nameOptional: string;
  affiliationOptional: string;
  proposalTitle: string;
  researchQuestion: string;
  currentGap: string;
  proposedChange: string;
  unchangedBoundary: string;
  publicSummary: string;
  privateDetails: string;
  referenceLinks: string;
  reviewVisibility: string;
  privateReview: string;
  publicAfterReview: string;
  noNdaTitle: string;
  noNdaText: string;
  collaborationTrack: string;
  academic: string;
  commissioned: string;
  unsure: string;
  fundingBoundary: string;
  dataSafetyConfirmation: string;
  privacyConsent: string;
  submitError: string;
  submitting: string;
  submit: string;
}

export interface PluginProposalStatusCopy {
  fallback: boolean;
  fallbackNotice: string;
  privateAccess: string;
  accessIntro: string;
  currentStatus: string;
  lastUpdated: string;
  statusBoundaryTitle: string;
  statusBoundaryText: string;
  proposalId: string;
  accessCode: string;
  viewStatus: string;
  publicationRequested: string;
  reviewProjection: string;
  projectionExplanation: string;
  cacheWarning: string;
  confirmPublication: string;
  keepPrivate: string;
  withdrawPublication: string;
  consentError: string;
}

const proposalStatusEn: PluginProposalStatusCopy = {
  fallback: false,
  fallbackNotice: "",
  privateAccess: "Private proposal access",
  accessIntro: "Access codes are exchanged for a short-lived, path-scoped session and never placed in the URL.",
  currentStatus: "Current status",
  lastUpdated: "Last updated",
  statusBoundaryTitle: "Status boundary",
  statusBoundaryText: "Selected means the idea may enter co-design. It does not mean that a plugin is scientifically validated or available in Production.",
  proposalId: "Proposal ID",
  accessCode: "Access code",
  viewStatus: "View status",
  publicationRequested: "Publication consent requested",
  reviewProjection: "Review the exact public projection",
  projectionExplanation: "Confirming publishes only the proposal title and public summary below. Email, name, affiliation, private details, and internal notes are never included.",
  cacheWarning: "Removing a published summary later removes it from ENA.HK but cannot erase search caches or third-party copies.",
  confirmPublication: "Confirm publication",
  keepPrivate: "Keep private",
  withdrawPublication: "Withdraw publication",
  consentError: "The consent decision could not be recorded.",
};

const proposalStatusZhHant: PluginProposalStatusCopy = {
  ...proposalStatusEn,
  privateAccess: "私密提案存取",
  accessIntro: "存取碼會兌換為短期且只限本狀態路徑的工作階段，絕不放入網址。",
  currentStatus: "目前狀態",
  lastUpdated: "最後更新",
  statusBoundaryTitle: "狀態邊界",
  statusBoundaryText: "「已入選」只表示構想可以進入共同設計，不代表插件已通過科學驗證或已可在生產環境使用。",
  proposalId: "提案 ID",
  accessCode: "存取碼",
  viewStatus: "查看狀態",
  publicationRequested: "請確認公開同意",
  reviewProjection: "審閱將會公開的確切內容",
  projectionExplanation: "確認後只會公開下方的提案標題和公開摘要；電郵、姓名、機構、私密詳情及內部備註絕不會公開。",
  cacheWarning: "日後移除公開摘要會把它從 ENA.HK 移除，但無法清除搜尋快取或第三方副本。",
  confirmPublication: "確認公開",
  keepPrivate: "維持私密",
  withdrawPublication: "撤回公開",
  consentError: "未能記錄公開同意決定。",
};

const proposalStatusZhHans: PluginProposalStatusCopy = {
  ...proposalStatusZhHant,
  privateAccess: "私密提案访问",
  accessIntro: "访问码会兑换为短期且仅限本状态路径的会话，绝不会放入网址。",
  currentStatus: "当前状态",
  lastUpdated: "最后更新",
  statusBoundaryTitle: "状态边界",
  statusBoundaryText: "“已入选”只表示构想可以进入共同设计，不代表插件已通过科学验证或已可在生产环境使用。",
  proposalId: "提案 ID",
  accessCode: "访问码",
  viewStatus: "查看状态",
  publicationRequested: "请确认公开同意",
  reviewProjection: "审阅将会公开的确切内容",
  projectionExplanation: "确认后只会公开下方的提案标题和公开摘要；电子邮件、姓名、机构、私密详情及内部备注绝不会公开。",
  cacheWarning: "日后移除公开摘要会把它从 ENA.HK 移除，但无法清除搜索缓存或第三方副本。",
  confirmPublication: "确认公开",
  keepPrivate: "保持私密",
  withdrawPublication: "撤回公开",
  consentError: "未能记录公开同意决定。",
};

const proposalFormEn: PluginProposalFormCopy = {
  fallback: false,
  fallbackNotice: "",
  beforeSubmitTitle: "Before you submit",
  beforeSubmitText: "Private review is not an NDA. Selected proposals may be co-developed with Dr. Peter Hu; submission is not a contract or promise of acceptance. Commissioned work does not purchase scientific verification.",
  intakeClosedTitle: "Proposal intake is not yet open",
  intakeClosedText: "The public catalog is available now. Text submission remains disabled until the licensing, privacy, database migration, and operator-readiness gates are independently completed.",
  saveReceipt: "Save this receipt now",
  proposalReceived: "Proposal received",
  accessCodeOnce: "The access code is shown once. ENA.HK does not email it automatically.",
  proposalId: "Proposal ID",
  accessCode: "Access code",
  checkStatus: "Check proposal status",
  safetyTitle: "Text only. Do not submit participant or student data.",
  safetyText: "Do not include raw research records, credentials, restricted materials, or links that expose them. Plugin review does not replace ethics approval.",
  email: "Email",
  nameOptional: "Name (optional)",
  affiliationOptional: "Affiliation (optional)",
  proposalTitle: "Proposal title",
  researchQuestion: "Research question",
  currentGap: "What is missing from current ENA tools?",
  proposedChange: "What should the plugin change?",
  unchangedBoundary: "What must remain unchanged?",
  publicSummary: "Public summary",
  privateDetails: "Private details",
  referenceLinks: "Reference links (optional, HTTPS only)",
  reviewVisibility: "Review visibility",
  privateReview: "Private review",
  publicAfterReview: "Eligible public summary after moderation, email confirmation, and renewed consent",
  noNdaTitle: "Private review is not an NDA.",
  noNdaText: "Arrange a separate agreement before submitting legally confidential or patent-sensitive details.",
  collaborationTrack: "Collaboration track",
  academic: "Academic collaboration",
  commissioned: "Commissioned-development inquiry",
  unsure: "Unsure",
  fundingBoundary: "Funding may affect scope and scheduling. It does not buy acceptance, scientific verification, a badge, or paper authorship.",
  dataSafetyConfirmation: "I confirm that this proposal contains no personal or participant data, raw research records, credentials, or restricted materials.",
  privacyConsent: "I consent to ENA Plugin Lab processing these details to assess and respond to this proposal.",
  submitError: "The proposal could not be recorded. No success receipt was created; please try again later.",
  submitting: "Submitting…",
  submit: "Submit proposal",
};

const proposalFormZhHant: PluginProposalFormCopy = {
  ...proposalFormEn,
  beforeSubmitTitle: "提交前須知",
  beforeSubmitText: "私密初審不構成 NDA。入選提案可能與 Dr. Peter Hu 共同開發；提交並非合約，也不保證獲選。委託開發不會購得科學驗證。",
  intakeClosedTitle: "提案收集尚未開放",
  intakeClosedText: "公開插件目錄現已可用。完成許可、隱私、資料庫遷移及營運準備的獨立審核前，文字提案功能維持停用。",
  saveReceipt: "請立即保存此收據",
  proposalReceived: "已收到提案",
  accessCodeOnce: "存取碼只顯示一次；ENA.HK 不會自動以電郵寄送。",
  proposalId: "提案 ID",
  accessCode: "存取碼",
  checkStatus: "查詢提案狀態",
  safetyTitle: "只接受文字。請勿提交參與者或學生資料。",
  safetyText: "請勿包含原始研究紀錄、憑證、受限制材料，或會暴露這些內容的連結。插件審查不能取代倫理審批。",
  email: "電郵",
  nameOptional: "姓名（選填）",
  affiliationOptional: "所屬機構（選填）",
  proposalTitle: "提案標題",
  researchQuestion: "研究問題",
  currentGap: "現有 ENA 工具有甚麼缺口？",
  proposedChange: "插件應改變甚麼？",
  unchangedBoundary: "哪些部分必須保持不變？",
  publicSummary: "公開摘要",
  privateDetails: "私密詳情",
  referenceLinks: "參考連結（選填，只接受 HTTPS）",
  reviewVisibility: "審查可見度",
  privateReview: "私密初審",
  publicAfterReview: "經人工審核、電郵確認及再次同意後，可公開摘要",
  noNdaTitle: "私密初審不構成 NDA。",
  noNdaText: "提交法律機密或專利敏感資料前，請另行訂立協議。",
  collaborationTrack: "合作類型",
  academic: "學術合作",
  commissioned: "委託開發查詢",
  unsure: "尚未確定",
  fundingBoundary: "資金可能影響範圍與時程，但不會購得入選、科學驗證、認證標誌或論文署名。",
  dataSafetyConfirmation: "我確認本提案不含個人或參與者資料、原始研究紀錄、憑證或受限制材料。",
  privacyConsent: "我同意 ENA Plugin Lab 處理這些資料，以評估及回覆本提案。",
  submitError: "未能記錄提案，因此沒有建立成功收據；請稍後再試。",
  submitting: "提交中…",
  submit: "提交提案",
};

const proposalFormZhHans: PluginProposalFormCopy = {
  ...proposalFormZhHant,
  beforeSubmitTitle: "提交前须知",
  beforeSubmitText: "私密初审不构成 NDA。入选提案可能与 Dr. Peter Hu 共同开发；提交并非合同，也不保证入选。委托开发不会购得科学验证。",
  intakeClosedTitle: "提案征集尚未开放",
  intakeClosedText: "公开插件目录现已可用。完成许可、隐私、数据库迁移及运营准备的独立审核前，文字提案功能保持停用。",
  saveReceipt: "请立即保存此回执",
  proposalReceived: "已收到提案",
  accessCodeOnce: "访问码只显示一次；ENA.HK 不会自动通过邮件发送。",
  proposalId: "提案 ID",
  accessCode: "访问码",
  checkStatus: "查询提案状态",
  safetyTitle: "只接受文字。请勿提交参与者或学生数据。",
  safetyText: "请勿包含原始研究记录、凭证、受限制材料，或会暴露这些内容的链接。插件审查不能取代伦理审批。",
  email: "电子邮件",
  nameOptional: "姓名（选填）",
  affiliationOptional: "所属机构（选填）",
  proposalTitle: "提案标题",
  researchQuestion: "研究问题",
  currentGap: "现有 ENA 工具有哪些缺口？",
  proposedChange: "插件应改变什么？",
  unchangedBoundary: "哪些部分必须保持不变？",
  publicSummary: "公开摘要",
  privateDetails: "私密详情",
  referenceLinks: "参考链接（选填，只接受 HTTPS）",
  reviewVisibility: "审查可见度",
  privateReview: "私密初审",
  publicAfterReview: "经人工审核、邮件确认及再次同意后，可公开摘要",
  noNdaTitle: "私密初审不构成 NDA。",
  noNdaText: "提交法律机密或专利敏感信息前，请另行签订协议。",
  collaborationTrack: "合作类型",
  academic: "学术合作",
  commissioned: "委托开发咨询",
  unsure: "尚未确定",
  fundingBoundary: "资金可能影响范围与进度，但不会购得入选、科学验证、认证标志或论文署名。",
  dataSafetyConfirmation: "我确认本提案不含个人或参与者数据、原始研究记录、凭证或受限制材料。",
  privacyConsent: "我同意 ENA Plugin Lab 处理这些信息，以评估及回复本提案。",
  submitError: "未能记录提案，因此没有创建成功回执；请稍后再试。",
  submitting: "提交中…",
  submit: "提交提案",
};

const navLabels: Readonly<Record<Locale, string>> = {
  en: en.navLabel,
  "zh-hant": zhHant.navLabel,
  "zh-hans": zhHans.navLabel,
  es: "Laboratorio de plugins",
  fr: "Laboratoire de plugins",
  pt: "Laboratório de plugins",
  de: "Plugin-Labor",
  ar: "مختبر الإضافات",
  ko: "플러그인 랩",
  ja: "プラグインラボ",
  hi: "प्लगइन लैब",
  ru: "Лаборатория плагинов",
  id: "Lab Plugin",
  bn: "প্লাগইন ল্যাব",
};

export function getPluginLabCopy(locale: Locale): PluginLabCopy {
  if (locale === "zh-hant") return zhHant;
  if (locale === "zh-hans") return zhHans;
  if (locale === "en") return en;
  return { ...en, navLabel: navLabels[locale], contentFallback: true };
}

export function pluginContentForLocale(plugin: OpenEnaPluginManifestV1, locale: Locale) {
  if (locale === "zh-hant" || locale === "zh-hans" || locale === "en") {
    return { content: plugin.content[locale], language: locale, fallback: false, fallbackNotice: "" } as const;
  }
  return { content: plugin.content.en, language: "en", fallback: true, fallbackNotice: getPluginLabCopy(locale).fallbackNotice } as const;
}

export function getPluginProposalFormCopy(locale: Locale): PluginProposalFormCopy {
  if (locale === "zh-hant") return proposalFormZhHant;
  if (locale === "zh-hans") return proposalFormZhHans;
  if (locale === "en") return proposalFormEn;
  return { ...proposalFormEn, fallback: true, fallbackNotice: getPluginLabCopy(locale).fallbackNotice };
}

export function getPluginProposalStatusCopy(locale: Locale): PluginProposalStatusCopy {
  if (locale === "zh-hant") return proposalStatusZhHant;
  if (locale === "zh-hans") return proposalStatusZhHans;
  if (locale === "en") return proposalStatusEn;
  return { ...proposalStatusEn, fallback: true, fallbackNotice: getPluginLabCopy(locale).fallbackNotice };
}

export function pluginProposalStateLabel(state: PluginProposalState, locale: Locale) {
  const labels = {
    en: { received: "received", "under-review": "under review", "needs-information": "needs information", selected: "selected", "not-selected": "not selected", withdrawn: "withdrawn" },
    "zh-hant": { received: "已收到", "under-review": "審查中", "needs-information": "需要補充資料", selected: "已入選", "not-selected": "未入選", withdrawn: "已撤回" },
    "zh-hans": { received: "已收到", "under-review": "审查中", "needs-information": "需要补充信息", selected: "已入选", "not-selected": "未入选", withdrawn: "已撤回" },
  } as const;
  return labels[reviewedLabelLocale(locale)][state];
}

export function pluginProposalMessageLabel(messageCode: string, locale: Locale) {
  const labels = {
    en: { "proposal-received": "Proposal received", "proposal-under-review": "Review started", "proposal-needs-information": "More information requested", "proposal-selected": "Selected for co-design", "proposal-not-selected": "Not selected", "proposal-withdrawn": "Proposal withdrawn" },
    "zh-hant": { "proposal-received": "已收到提案", "proposal-under-review": "已開始審查", "proposal-needs-information": "需要補充資料", "proposal-selected": "已入選共同設計", "proposal-not-selected": "未入選", "proposal-withdrawn": "已撤回提案" },
    "zh-hans": { "proposal-received": "已收到提案", "proposal-under-review": "已开始审查", "proposal-needs-information": "需要补充信息", "proposal-selected": "已入选共同设计", "proposal-not-selected": "未入选", "proposal-withdrawn": "已撤回提案" },
  } as const;
  const selected = labels[reviewedLabelLocale(locale)] as Record<string, string>;
  return selected[messageCode] ?? messageCode.replaceAll("-", " ");
}

const contributionLabels = {
  en: {
    "analysis-family": "Method Variant",
    "model-workflow": "Workflow",
    "presenter-2d": "2D Visualization",
    "presenter-3d": "3D Visualization",
    diagnostic: "Diagnostic",
    exporter: "Export",
    "external-service": "External Service",
  },
  "zh-hant": {
    "analysis-family": "方法變體", "model-workflow": "工作流程", "presenter-2d": "2D 視覺化",
    "presenter-3d": "3D 視覺化", diagnostic: "診斷", exporter: "匯出", "external-service": "外部服務",
  },
  "zh-hans": {
    "analysis-family": "方法变体", "model-workflow": "工作流程", "presenter-2d": "2D 可视化",
    "presenter-3d": "3D 可视化", diagnostic: "诊断", exporter: "导出", "external-service": "外部服务",
  },
} as const;

function reviewedLabelLocale(locale: Locale) { return locale === "zh-hant" || locale === "zh-hans" ? locale : "en"; }

export function pluginContributionLabel(kind: OpenEnaPluginManifestV1["contributionKinds"][number], locale: Locale = "en") {
  return contributionLabels[reviewedLabelLocale(locale)][kind];
}

export function pluginLifecycleLabel(lifecycle: OpenEnaPluginManifestV1["lifecycle"], locale: Locale = "en") {
  const labels = {
    en: { incubating: "incubating", experimental: "experimental", "research-preview": "research preview", production: "production", deprecated: "deprecated", revoked: "revoked" },
    "zh-hant": { incubating: "孵化中", experimental: "實驗", "research-preview": "研究預覽", production: "生產", deprecated: "已棄用", revoked: "已撤銷" },
    "zh-hans": { incubating: "孵化中", experimental: "实验", "research-preview": "研究预览", production: "生产", deprecated: "已弃用", revoked: "已撤销" },
  } as const;
  return labels[reviewedLabelLocale(locale)][lifecycle];
}

export function pluginScientificEvidenceLabel(evidence: OpenEnaPluginManifestV1["scientificEvidence"], locale: Locale = "en") {
  const labels = {
    en: { "display-only": "display only", "method-specified": "method specified", "computationally-reproduced": "computationally reproduced", "empirically-evaluated": "empirically evaluated", "externally-peer-reviewed": "externally peer reviewed" },
    "zh-hant": { "display-only": "僅呈現", "method-specified": "方法已說明", "computationally-reproduced": "計算已重現", "empirically-evaluated": "已作實證評估", "externally-peer-reviewed": "已經外部同儕評審" },
    "zh-hans": { "display-only": "仅呈现", "method-specified": "方法已说明", "computationally-reproduced": "计算已复现", "empirically-evaluated": "已作实证评估", "externally-peer-reviewed": "已经外部同行评审" },
  } as const;
  return labels[reviewedLabelLocale(locale)][evidence];
}

export function pluginReviewStatusLabel(status: OpenEnaPluginManifestV1["engineeringAssurance"]["automatedTests"], locale: Locale = "en") {
  const labels = {
    en: { pending: "pending", passed: "passed", "not-required": "not required" },
    "zh-hant": { pending: "待完成", passed: "已通過", "not-required": "不需要" },
    "zh-hans": { pending: "待完成", passed: "已通过", "not-required": "不需要" },
  } as const;
  return labels[reviewedLabelLocale(locale)][status];
}

export function pluginPermissionValueLabel(value: "none" | "host-brokered" | "host-mediated", locale: Locale = "en") {
  const labels = {
    en: { none: "none", "host-brokered": "host brokered", "host-mediated": "host mediated" },
    "zh-hant": { none: "無", "host-brokered": "由主機代理", "host-mediated": "由主機管理" },
    "zh-hans": { none: "无", "host-brokered": "由主机代理", "host-mediated": "由主机管理" },
  } as const;
  return labels[reviewedLabelLocale(locale)][value];
}

export function pluginAuthorRoleLabel(role: OpenEnaPluginManifestV1["authors"][number]["role"], locale: Locale = "en") {
  const labels = {
    en: { conceptualization: "conceptualization", methodology: "methodology", software: "software", validation: "validation", visualization: "visualization", "project-administration": "project administration" },
    "zh-hant": { conceptualization: "概念構思", methodology: "方法學", software: "軟件", validation: "驗證", visualization: "視覺化", "project-administration": "項目管理" },
    "zh-hans": { conceptualization: "概念构思", methodology: "方法学", software: "软件", validation: "验证", visualization: "可视化", "project-administration": "项目管理" },
  } as const;
  return labels[reviewedLabelLocale(locale)][role];
}
