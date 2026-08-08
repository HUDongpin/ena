export const locales = ["en", "zh-hant", "zh-hans"] as const;

export type Locale = (typeof locales)[number];
export type TextDirection = "ltr" | "rtl";

export const defaultLocale: Locale = "en";

export const localeMeta: Record<
  Locale,
  {
    label: string;
    shortLabel: string;
    htmlLang: string;
    dir: TextDirection;
  }
> = {
  en: { label: "English", shortLabel: "EN", htmlLang: "en-HK", dir: "ltr" },
  "zh-hant": { label: "繁體中文", shortLabel: "繁", htmlLang: "zh-Hant-HK", dir: "ltr" },
  "zh-hans": { label: "简体中文", shortLabel: "简", htmlLang: "zh-Hans-CN", dir: "ltr" },
};

export interface Dictionary {
  meta: {
    siteTitle: string;
    siteDescription: string;
  };
  nav: {
    home: string;
    mission: string;
    news: string;
    academy: string;
    about: string;
    menu: string;
    close: string;
    language: string;
  };
  common: {
    skipToContent: string;
    backToTop: string;
    exploreMethod: string;
    openWebtool: string;
    browseResources: string;
    learnAboutSite: string;
    externalLink: string;
  };
  home: {
    eyebrow: string;
    heroTitle: string;
    heroText: string;
    graphTitle: string;
    graphCaption: string;
    networkLabels: [string, string, string, string, string];
    principleTitle: string;
    principleText: string;
    workflowEyebrow: string;
    workflowTitle: string;
    workflowText: string;
    workflow: Array<{ title: string; text: string }>;
    questionsTitle: string;
    questionsText: string;
    questions: Array<{ title: string; text: string }>;
    ctaTitle: string;
    ctaText: string;
  };
  mission: {
    eyebrow: string;
    title: string;
    intro: string;
    definitionTitle: string;
    definitionText: string;
    modelTitle: string;
    modelText: string;
    modelParts: Array<{ title: string; text: string }>;
    principlesTitle: string;
    principlesText: string;
    principles: Array<{ title: string; text: string }>;
    resourcesTitle: string;
    resourcesText: string;
  };
  news: {
    eyebrow: string;
    title: string;
    intro: string;
    emptyTitle: string;
    emptyText: string;
    emptyNote: string;
  };
  academy: {
    eyebrow: string;
    title: string;
    intro: string;
    emptyTitle: string;
    emptyText: string;
    emptyNote: string;
  };
  about: {
    eyebrow: string;
    title: string;
    intro: string;
    purposeTitle: string;
    purposeText: string;
    values: Array<{ title: string; text: string }>;
    boundariesTitle: string;
    boundariesText: string;
    resourcesTitle: string;
    resourcesText: string;
    webtoolTitle: string;
    webtoolText: string;
    libraryTitle: string;
    libraryText: string;
    tutorialTitle: string;
    tutorialText: string;
  };
  footer: {
    description: string;
    navigation: string;
    primaryResources: string;
    copyright: string;
  };
}

const en: Dictionary = {
  meta: {
    siteTitle: "ENA | Epistemic Network Analysis",
    siteDescription:
      "A multilingual knowledge site for learning, applying, and discussing Epistemic Network Analysis.",
  },
  nav: {
    home: "Home",
    mission: "Mission",
    news: "News",
    academy: "Academy",
    about: "About",
    menu: "Menu",
    close: "Close",
    language: "Language",
  },
  common: {
    skipToContent: "Skip to content",
    backToTop: "Back to top",
    exploreMethod: "Explore the method",
    openWebtool: "Open ENA webtool",
    browseResources: "Browse official resources",
    learnAboutSite: "About this site",
    externalLink: "Opens in a new tab",
  },
  home: {
    eyebrow: "Epistemic Network Analysis",
    heroTitle: "See how ideas connect.",
    heroText:
      "ENA models how concepts connect in discourse and practice, making patterns of thinking visible and comparable.",
    graphTitle: "Conceptual network model",
    graphCaption:
      "An illustrative ENA graph. Nodes represent coded concepts and line weight represents relative connection strength.",
    networkLabels: ["Evidence", "Design", "Identity", "Practice", "Reflection"],
    principleTitle: "Connections carry meaning.",
    principleText:
      "Counts show what appears. Networks show what appears together, within a defined context, and how those relationships differ across units or groups.",
    workflowEyebrow: "A relational workflow",
    workflowTitle: "From coded data to a network model",
    workflowText:
      "ENA keeps theory, qualitative evidence, mathematical modeling, and visual interpretation connected throughout an analysis.",
    workflow: [
      {
        title: "Frame the question",
        text: "Define the phenomenon, analytic units, and the context in which connections are meaningful.",
      },
      {
        title: "Code the evidence",
        text: "Represent relevant ideas, actions, or practices with a transparent coding scheme.",
      },
      {
        title: "Model co-occurrence",
        text: "Accumulate connections among codes within the selected conversational or temporal window.",
      },
      {
        title: "Compare structures",
        text: "Interpret network patterns alongside the underlying qualitative evidence and research design.",
      },
    ],
    questionsTitle: "Built for relational questions",
    questionsText:
      "ENA is useful when the structure among concepts matters as much as the frequency of each concept.",
    questions: [
      {
        title: "Learning and discourse",
        text: "Examine how learners connect concepts, evidence, strategies, and reflection.",
      },
      {
        title: "Teams and practice",
        text: "Compare patterns in collaboration, professional reasoning, or coordinated action.",
      },
      {
        title: "Documents and policy",
        text: "Study how ideas are organized across texts, cases, periods, or stakeholder groups.",
      },
      {
        title: "Mixed-method inquiry",
        text: "Connect interpretable network models with close reading and contextual evidence.",
      },
    ],
    ctaTitle: "Learn the method before reading the graph.",
    ctaText:
      "Start with the analytic choices that give each node, connection, and comparison its meaning.",
  },
  mission: {
    eyebrow: "Mission and method",
    title: "Make relational thinking easier to learn, apply, and discuss.",
    intro:
      "ENA.hk is designed as a clear public entry point to Epistemic Network Analysis, with accurate concepts, transparent scope, and direct paths to primary resources.",
    definitionTitle: "What ENA makes visible",
    definitionText:
      "Epistemic Network Analysis is a method for identifying, quantifying, and visualizing connections among elements in coded data. It supports comparison while keeping interpretation tied to qualitative context.",
    modelTitle: "The model begins with research design",
    modelText:
      "An ENA graph is not a self-explanatory picture. Its meaning depends on how the data, units, conversations, codes, and comparison are defined.",
    modelParts: [
      {
        title: "Units",
        text: "The entities whose network structures are modeled and compared, such as people, teams, or documents.",
      },
      {
        title: "Conversation",
        text: "The bounded context in which coded elements may be considered connected.",
      },
      {
        title: "Codes",
        text: "Theory-informed or empirically developed indicators of meaningful ideas, actions, or practices.",
      },
      {
        title: "Networks",
        text: "Weighted summaries of code co-occurrence that can be visualized, interpreted, and compared.",
      },
    ],
    principlesTitle: "Principles for responsible interpretation",
    principlesText:
      "Strong ENA work treats modeling choices as part of the argument and returns to the source evidence when explaining a pattern.",
    principles: [
      {
        title: "Theory first",
        text: "Let the research question and conceptual framework guide what relationships should count.",
      },
      {
        title: "Context preserved",
        text: "Interpret model outputs with close attention to the data and setting that produced them.",
      },
      {
        title: "Choices documented",
        text: "Make units, windows, codes, normalization, rotation, and comparison decisions reviewable.",
      },
      {
        title: "Claims calibrated",
        text: "Use networks as evidence within a design, not as automatic proof of causation or quality.",
      },
    ],
    resourcesTitle: "Continue with primary ENA resources",
    resourcesText:
      "Use the official webtool and resource library for software access, data preparation guidance, tutorials, and worked examples.",
  },
  news: {
    eyebrow: "ENA News",
    title: "Research and community updates",
    intro:
      "This section will publish reviewed ENA research notes, method updates, software releases, and community developments.",
    emptyTitle: "No news has been published yet.",
    emptyText:
      "The route and publishing structure are ready. The first item will appear only after its source, summary, and classification are reviewed.",
    emptyNote: "For current materials, visit the primary ENA resource library.",
  },
  academy: {
    eyebrow: "ENA Academy",
    title: "Learn the method step by step",
    intro:
      "This section will provide reviewed lessons on research design, data preparation, modeling choices, visualization, and interpretation.",
    emptyTitle: "No academy lessons have been published yet.",
    emptyText:
      "The learning route is ready for future lessons. No placeholder lesson or unreviewed method guidance is presented as published content.",
    emptyNote: "Begin with the Mission page or the official ENA resources.",
  },
  about: {
    eyebrow: "About ENA.hk",
    title: "A focused knowledge site for Epistemic Network Analysis",
    intro:
      "ENA.hk provides a multilingual public structure for explaining the method, sharing reviewed updates, and developing a future learning academy.",
    purposeTitle: "What this site is for",
    purposeText:
      "The site is built to help researchers, educators, students, and practitioners find a clear starting point without separating mathematical models from qualitative meaning.",
    values: [
      {
        title: "Clarity",
        text: "Explain ENA concepts in precise language without hiding important analytic choices.",
      },
      {
        title: "Evidence",
        text: "Connect summaries and lessons to identifiable primary sources and reviewed materials.",
      },
      {
        title: "Interpretability",
        text: "Keep network models connected to the coded evidence, context, and claims they support.",
      },
    ],
    boundariesTitle: "Scope and source transparency",
    boundariesText:
      "ENA.hk is a knowledge site. The ENA webtool and the established project resource library remain the primary destinations for official software access and core project materials.",
    resourcesTitle: "Primary resources",
    resourcesText:
      "These external destinations provide the software, foundational guidance, and peer-reviewed method description.",
    webtoolTitle: "ENA webtool",
    webtoolText: "Create and inspect ENA models in the established browser-based analysis environment.",
    libraryTitle: "ENA resource library",
    libraryText: "Find getting-started material, data preparation guidance, worked examples, and software links.",
    tutorialTitle: "Peer-reviewed tutorial",
    tutorialText: "Read the Journal of Learning Analytics tutorial on identifying and quantifying connections in coded data.",
  },
  footer: {
    description:
      "A multilingual knowledge site for learning, applying, and discussing Epistemic Network Analysis.",
    navigation: "Navigation",
    primaryResources: "Primary resources",
    copyright: "© 2026 ENA.hk. All rights reserved.",
  },
};

const zhHant: Dictionary = {
  meta: {
    siteTitle: "ENA | 認知網絡分析",
    siteDescription: "一個用於學習、應用和討論認知網絡分析的多語言知識網站。",
  },
  nav: {
    home: "首頁",
    mission: "使命",
    news: "新聞",
    academy: "學院",
    about: "關於",
    menu: "選單",
    close: "關閉",
    language: "語言",
  },
  common: {
    skipToContent: "跳至主要內容",
    backToTop: "返回頂部",
    exploreMethod: "探索分析方法",
    openWebtool: "開啟 ENA 網頁工具",
    browseResources: "瀏覽官方資源",
    learnAboutSite: "關於本網站",
    externalLink: "在新分頁開啟",
  },
  home: {
    eyebrow: "認知網絡分析",
    heroTitle: "看見觀念如何連結。",
    heroText: "ENA 建模話語與實踐中的概念連結，讓思考模式可以被看見和比較。",
    graphTitle: "概念網絡模型",
    graphCaption: "示意 ENA 圖。節點代表編碼概念，線條粗細代表相對連結強度。",
    networkLabels: ["證據", "設計", "身份", "實踐", "反思"],
    principleTitle: "連結本身承載意義。",
    principleText: "次數顯示甚麼出現，網絡則顯示甚麼在特定脈絡中共同出現，以及這些關係如何因分析單位或群組而異。",
    workflowEyebrow: "關聯式分析流程",
    workflowTitle: "從編碼資料到網絡模型",
    workflowText: "ENA 在整個分析過程中連結理論、質性證據、數學建模和視覺詮釋。",
    workflow: [
      { title: "界定問題", text: "定義研究現象、分析單位，以及連結具有意義的脈絡。" },
      { title: "編碼證據", text: "以透明的編碼架構表示相關觀念、行動或實踐。" },
      { title: "建模共現", text: "在所選對話或時間窗口內累積編碼之間的連結。" },
      { title: "比較結構", text: "結合原始質性證據和研究設計，詮釋網絡模式。" },
    ],
    questionsTitle: "適合研究關聯問題",
    questionsText: "當概念之間的結構與每個概念的出現頻率同樣重要時，ENA 尤其有用。",
    questions: [
      { title: "學習與話語", text: "研究學習者如何連結概念、證據、策略和反思。" },
      { title: "團隊與實踐", text: "比較協作、專業推理或協調行動中的模式。" },
      { title: "文件與政策", text: "研究觀念如何在文本、案例、時期或持份者群組中組織。" },
      { title: "混合方法研究", text: "把可詮釋的網絡模型連結至細讀和脈絡證據。" },
    ],
    ctaTitle: "先理解方法，再閱讀網絡圖。",
    ctaText: "從賦予每個節點、連結和比較實際意義的分析選擇開始。",
  },
  mission: {
    eyebrow: "使命與方法",
    title: "讓關聯思考更容易學習、應用和討論。",
    intro: "ENA.hk 旨在成為清晰的認知網絡分析公共入口，提供準確概念、透明範圍，以及通往第一手資源的直接路徑。",
    definitionTitle: "ENA 讓甚麼變得可見",
    definitionText: "認知網絡分析是一種用於識別、量化和視覺化編碼資料中各元素連結的方法。它支援比較，同時讓詮釋與質性脈絡保持連結。",
    modelTitle: "模型始於研究設計",
    modelText: "ENA 圖並非不言自明。圖的意義取決於如何定義資料、分析單位、對話、編碼和比較。",
    modelParts: [
      { title: "分析單位", text: "被建模和比較網絡結構的實體，例如個人、團隊或文件。" },
      { title: "對話範圍", text: "編碼元素可被視為互相連結的有限脈絡。" },
      { title: "編碼", text: "由理論或實證發展而來，用於表示重要觀念、行動或實踐的指標。" },
      { title: "網絡", text: "編碼共現的加權摘要，可用於視覺化、詮釋和比較。" },
    ],
    principlesTitle: "負責任詮釋原則",
    principlesText: "嚴謹的 ENA 研究把建模選擇視為論證的一部分，並在解釋模式時返回原始證據。",
    principles: [
      { title: "理論優先", text: "讓研究問題和概念框架引導哪些關係應被計算。" },
      { title: "保留脈絡", text: "根據產生模型輸出的資料和情境進行詮釋。" },
      { title: "記錄選擇", text: "讓分析單位、窗口、編碼、正規化、旋轉和比較決定可供檢視。" },
      { title: "校準主張", text: "把網絡視為研究設計中的證據，而非因果或品質的自動證明。" },
    ],
    resourcesTitle: "繼續使用第一手 ENA 資源",
    resourcesText: "使用官方網頁工具和資源庫取得軟件、資料準備指南、教程和實例。",
  },
  news: {
    eyebrow: "ENA 新聞",
    title: "研究與社群更新",
    intro: "本區將發布經審核的 ENA 研究札記、方法更新、軟件版本和社群動態。",
    emptyTitle: "目前尚未發布新聞。",
    emptyText: "頁面和發布結構已準備完成。首篇內容只會在來源、摘要和分類完成審核後出現。",
    emptyNote: "如需目前資料，請前往 ENA 第一手資源庫。",
  },
  academy: {
    eyebrow: "ENA 學院",
    title: "逐步學習分析方法",
    intro: "本區將提供關於研究設計、資料準備、建模選擇、視覺化和詮釋的審核課程。",
    emptyTitle: "目前尚未發布學院課程。",
    emptyText: "學習頁面已為未來課程準備完成。本網站不會把佔位課程或未經審核的方法指引當作已發布內容。",
    emptyNote: "可先閱讀使命頁面或瀏覽官方 ENA 資源。",
  },
  about: {
    eyebrow: "關於 ENA.hk",
    title: "專注於認知網絡分析的知識網站",
    intro: "ENA.hk 提供多語言公共架構，用於解釋方法、分享經審核的更新，以及建立未來的學習學院。",
    purposeTitle: "本網站的用途",
    purposeText: "本網站協助研究人員、教育工作者、學生和實務工作者找到清晰起點，同時不把數學模型與質性意義分開。",
    values: [
      { title: "清晰", text: "以準確語言解釋 ENA 概念，不隱藏重要分析選擇。" },
      { title: "證據", text: "把摘要和課程連結至可識別的第一手來源和審核材料。" },
      { title: "可詮釋性", text: "讓網絡模型與其所依據的編碼證據、脈絡和主張保持連結。" },
    ],
    boundariesTitle: "範圍與來源透明度",
    boundariesText: "ENA.hk 是知識網站。ENA 網頁工具和既有項目資源庫仍是官方軟件和核心項目材料的第一手目的地。",
    resourcesTitle: "第一手資源",
    resourcesText: "以下外部網站提供軟件、基礎指南和經同儕評審的方法說明。",
    webtoolTitle: "ENA 網頁工具",
    webtoolText: "在既有的瀏覽器分析環境中建立和檢視 ENA 模型。",
    libraryTitle: "ENA 資源庫",
    libraryText: "尋找入門材料、資料準備指南、實例和軟件連結。",
    tutorialTitle: "同儕評審教程",
    tutorialText: "閱讀《Journal of Learning Analytics》關於識別和量化編碼資料連結的教程。",
  },
  footer: {
    description: "一個用於學習、應用和討論認知網絡分析的多語言知識網站。",
    navigation: "導覽",
    primaryResources: "第一手資源",
    copyright: "© 2026 ENA.hk。版權所有。",
  },
};

const zhHans: Dictionary = {
  meta: {
    siteTitle: "ENA | 认知网络分析",
    siteDescription: "一个用于学习、应用和讨论认知网络分析的多语言知识网站。",
  },
  nav: {
    home: "首页",
    mission: "使命",
    news: "新闻",
    academy: "学院",
    about: "关于",
    menu: "菜单",
    close: "关闭",
    language: "语言",
  },
  common: {
    skipToContent: "跳至主要内容",
    backToTop: "返回顶部",
    exploreMethod: "探索分析方法",
    openWebtool: "打开 ENA 网页工具",
    browseResources: "浏览官方资源",
    learnAboutSite: "关于本网站",
    externalLink: "在新标签页打开",
  },
  home: {
    eyebrow: "认知网络分析",
    heroTitle: "看见观念如何连接。",
    heroText: "ENA 建模话语与实践中的概念连接，让思考模式可以被看见和比较。",
    graphTitle: "概念网络模型",
    graphCaption: "示意 ENA 图。节点代表编码概念，线条粗细代表相对连接强度。",
    networkLabels: ["证据", "设计", "身份", "实践", "反思"],
    principleTitle: "连接本身承载意义。",
    principleText: "次数显示什么出现，网络则显示什么在特定情境中共同出现，以及这些关系如何因分析单位或群组而异。",
    workflowEyebrow: "关联式分析流程",
    workflowTitle: "从编码数据到网络模型",
    workflowText: "ENA 在整个分析过程中连接理论、质性证据、数学建模和视觉诠释。",
    workflow: [
      { title: "界定问题", text: "定义研究现象、分析单位，以及连接具有意义的情境。" },
      { title: "编码证据", text: "以透明的编码框架表示相关观念、行动或实践。" },
      { title: "建模共现", text: "在所选对话或时间窗口内累积编码之间的连接。" },
      { title: "比较结构", text: "结合原始质性证据和研究设计，诠释网络模式。" },
    ],
    questionsTitle: "适合研究关联问题",
    questionsText: "当概念之间的结构与每个概念的出现频率同样重要时，ENA 尤其有用。",
    questions: [
      { title: "学习与话语", text: "研究学习者如何连接概念、证据、策略和反思。" },
      { title: "团队与实践", text: "比较协作、专业推理或协调行动中的模式。" },
      { title: "文件与政策", text: "研究观念如何在文本、案例、时期或利益相关者群组中组织。" },
      { title: "混合方法研究", text: "把可诠释的网络模型连接至细读和情境证据。" },
    ],
    ctaTitle: "先理解方法，再阅读网络图。",
    ctaText: "从赋予每个节点、连接和比较实际意义的分析选择开始。",
  },
  mission: {
    eyebrow: "使命与方法",
    title: "让关联思考更容易学习、应用和讨论。",
    intro: "ENA.hk 旨在成为清晰的认知网络分析公共入口，提供准确概念、透明范围，以及通往第一手资源的直接路径。",
    definitionTitle: "ENA 让什么变得可见",
    definitionText: "认知网络分析是一种用于识别、量化和可视化编码数据中各元素连接的方法。它支持比较，同时让诠释与质性情境保持连接。",
    modelTitle: "模型始于研究设计",
    modelText: "ENA 图并非不言自明。图的意义取决于如何定义数据、分析单位、对话、编码和比较。",
    modelParts: [
      { title: "分析单位", text: "被建模和比较网络结构的实体，例如个人、团队或文件。" },
      { title: "对话范围", text: "编码元素可被视为互相连接的有限情境。" },
      { title: "编码", text: "由理论或实证发展而来，用于表示重要观念、行动或实践的指标。" },
      { title: "网络", text: "编码共现的加权摘要，可用于可视化、诠释和比较。" },
    ],
    principlesTitle: "负责任诠释原则",
    principlesText: "严谨的 ENA 研究把建模选择视为论证的一部分，并在解释模式时返回原始证据。",
    principles: [
      { title: "理论优先", text: "让研究问题和概念框架引导哪些关系应被计算。" },
      { title: "保留情境", text: "根据产生模型输出的数据和情境进行诠释。" },
      { title: "记录选择", text: "让分析单位、窗口、编码、标准化、旋转和比较决定可供检视。" },
      { title: "校准主张", text: "把网络视为研究设计中的证据，而非因果或质量的自动证明。" },
    ],
    resourcesTitle: "继续使用第一手 ENA 资源",
    resourcesText: "使用官方网页工具和资源库取得软件、数据准备指南、教程和实例。",
  },
  news: {
    eyebrow: "ENA 新闻",
    title: "研究与社群更新",
    intro: "本区将发布经审核的 ENA 研究札记、方法更新、软件版本和社群动态。",
    emptyTitle: "目前尚未发布新闻。",
    emptyText: "页面和发布结构已准备完成。首篇内容只会在来源、摘要和分类完成审核后出现。",
    emptyNote: "如需目前资料，请前往 ENA 第一手资源库。",
  },
  academy: {
    eyebrow: "ENA 学院",
    title: "逐步学习分析方法",
    intro: "本区将提供关于研究设计、数据准备、建模选择、可视化和诠释的审核课程。",
    emptyTitle: "目前尚未发布学院课程。",
    emptyText: "学习页面已为未来课程准备完成。本网站不会把占位课程或未经审核的方法指引当作已发布内容。",
    emptyNote: "可先阅读使命页面或浏览官方 ENA 资源。",
  },
  about: {
    eyebrow: "关于 ENA.hk",
    title: "专注于认知网络分析的知识网站",
    intro: "ENA.hk 提供多语言公共框架，用于解释方法、分享经审核的更新，以及建立未来的学习学院。",
    purposeTitle: "本网站的用途",
    purposeText: "本网站协助研究人员、教育工作者、学生和实务工作者找到清晰起点，同时不把数学模型与质性意义分开。",
    values: [
      { title: "清晰", text: "以准确语言解释 ENA 概念，不隐藏重要分析选择。" },
      { title: "证据", text: "把摘要和课程连接至可识别的第一手来源和审核材料。" },
      { title: "可诠释性", text: "让网络模型与其所依据的编码证据、情境和主张保持连接。" },
    ],
    boundariesTitle: "范围与来源透明度",
    boundariesText: "ENA.hk 是知识网站。ENA 网页工具和既有项目资源库仍是官方软件和核心项目材料的第一手目的地。",
    resourcesTitle: "第一手资源",
    resourcesText: "以下外部网站提供软件、基础指南和经同行评审的方法说明。",
    webtoolTitle: "ENA 网页工具",
    webtoolText: "在既有的浏览器分析环境中建立和检视 ENA 模型。",
    libraryTitle: "ENA 资源库",
    libraryText: "寻找入门材料、数据准备指南、实例和软件连接。",
    tutorialTitle: "同行评审教程",
    tutorialText: "阅读《Journal of Learning Analytics》关于识别和量化编码数据连接的教程。",
  },
  footer: {
    description: "一个用于学习、应用和讨论认知网络分析的多语言知识网站。",
    navigation: "导航",
    primaryResources: "第一手资源",
    copyright: "© 2026 ENA.hk。版权所有。",
  },
};

const dictionaries: Record<Locale, Dictionary> = {
  en,
  "zh-hant": zhHant,
  "zh-hans": zhHans,
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function normalizeLocale(value?: string | null): Locale {
  return value && isLocale(value) ? value : defaultLocale;
}

export function getDictionary(value: string): Dictionary {
  return dictionaries[normalizeLocale(value)];
}

export function getLocaleMeta(value: string) {
  return localeMeta[normalizeLocale(value)];
}
