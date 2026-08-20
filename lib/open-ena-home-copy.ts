import type { Locale } from "./i18n";

export interface OpenEnaHomeCopy {
  eyebrow: string;
  title: string;
  lead: string;
  pillars: Array<{ title: string; text: string }>;
  methodNote: string;
  figureTitle: string;
  figureDescription: string;
  figureCaption: string;
  figureLabels: {
    data: string;
    model: string;
    comparison: string;
    export: string;
    local: string;
    workspace: string;
    configuration: string;
    unit: string;
    window: string;
    codes: string;
    twoD: string;
    primary: string;
    secondary: string;
  };
}

const en: OpenEnaHomeCopy = {
  eyebrow: "Open tools · Transparent methods",
  title: "An open path from coded evidence to interpretable networks.",
  lead:
    "Open coded CSV or XLSX data directly in your browser, define the analysis, inspect two-dimensional network comparisons, and take the model specification and results with you.",
  pillars: [
    {
      title: "Open by design",
      text: "Free to enter and powered by the open jENA runtime, so the research workflow is not locked inside a proprietary analysis shell.",
    },
    {
      title: "Local by default",
      text: "Your source CSV or XLSX file is processed in this browser. The Open ENA workspace has no data-upload endpoint.",
    },
    {
      title: "Reproducible in practice",
      text: "Export model choices, diagnostics, figures, and the evidence boundaries needed to explain how a result was produced.",
    },
  ],
  methodNote:
    "Open ENA keeps the method visible: visual separation or a thicker edge is not, by itself, evidence of statistical significance.",
  figureTitle: "Open ENA browser research workspace",
  figureDescription:
    "An interface illustration showing coded data, model controls, a central comparison network, primary and secondary plots, and a reproducibility export in one connected workspace.",
  figureCaption:
    "Interface concept: data, model choices, comparison plots, and reproducibility exports remain connected in one browser workspace.",
  figureLabels: {
    data: "DATA",
    model: "MODEL",
    comparison: "COMPARISON",
    export: "EXPORT",
    local: "LOCAL",
    workspace: "BROWSER RESEARCH WORKSPACE",
    configuration: "ENA configuration",
    unit: "UNIT",
    window: "WINDOW",
    codes: "CODES",
    twoD: "2D ENA",
    primary: "PRIMARY",
    secondary: "SECONDARY",
  },
};

const zhHant: OpenEnaHomeCopy = {
  eyebrow: "開放工具 · 透明方法",
  title: "Open ENA：從編碼證據走向可解釋網絡的開放路徑。",
  lead:
    "在瀏覽器中直接開啟編碼 CSV 或 XLSX、定義分析模型、檢視二維網絡比較，並帶走模型規格與結果。",
  pillars: [
    {
      title: "開放使用",
      text: "免費進入，以開源 jENA 運算為核心，讓研究流程不被封閉的分析環境鎖定。",
    },
    {
      title: "本機優先",
      text: "來源 CSV 或 XLSX 檔案在目前瀏覽器中處理；Open ENA 工作區不設資料上傳端點。",
    },
    {
      title: "實踐可重現",
      text: "匯出模型選擇、診斷、圖表，以及說明結果如何產生所需的證據邊界。",
    },
  ],
  methodNote:
    "Open ENA 讓方法保持可見：圖上的分離或較粗連線，本身並不等於統計顯著性。",
  figureTitle: "Open ENA 瀏覽器研究工作區",
  figureDescription:
    "介面示意圖在同一工作區呈現編碼資料、模型控制、中央比較網絡、主要與次要圖，以及可重現匯出。",
  figureCaption:
    "介面概念：資料、模型選擇、比較圖與可重現匯出在同一瀏覽器工作區中保持連貫。",
  figureLabels: {
    data: "資料",
    model: "模型",
    comparison: "比較",
    export: "匯出",
    local: "本機",
    workspace: "瀏覽器研究工作區",
    configuration: "ENA 模型設定",
    unit: "單位",
    window: "窗口",
    codes: "編碼",
    twoD: "2D ENA",
    primary: "主要",
    secondary: "次要",
  },
};

const zhHans: OpenEnaHomeCopy = {
  eyebrow: "开放工具 · 透明方法",
  title: "Open ENA：从编码证据走向可解释网络的开放路径。",
  lead:
    "在浏览器中直接打开编码 CSV 或 XLSX、定义分析模型、查看二维网络比较，并带走模型规格与结果。",
  pillars: [
    {
      title: "开放使用",
      text: "免费进入，以开源 jENA 运算为核心，让研究流程不被封闭的分析环境锁定。",
    },
    {
      title: "本地优先",
      text: "源 CSV 或 XLSX 文件在当前浏览器中处理；Open ENA 工作区不设置数据上传端点。",
    },
    {
      title: "实践可复现",
      text: "导出模型选择、诊断、图表，以及说明结果如何产生所需的证据边界。",
    },
  ],
  methodNote:
    "Open ENA 让方法保持可见：图中的分离或较粗连线，本身并不等于统计显著性。",
  figureTitle: "Open ENA 浏览器研究工作区",
  figureDescription:
    "界面示意图在同一工作区呈现编码数据、模型控件、中央比较网络、主要与次要图，以及可复现导出。",
  figureCaption:
    "界面概念：数据、模型选择、比较图与可复现导出在同一浏览器工作区中保持连贯。",
  figureLabels: {
    data: "数据",
    model: "模型",
    comparison: "比较",
    export: "导出",
    local: "本地",
    workspace: "浏览器研究工作区",
    configuration: "ENA 模型设置",
    unit: "单位",
    window: "窗口",
    codes: "编码",
    twoD: "2D ENA",
    primary: "主要",
    secondary: "次要",
  },
};

export function getOpenEnaHomeCopy(locale: Locale): OpenEnaHomeCopy {
  if (locale === "zh-hant") return zhHant;
  if (locale === "zh-hans") return zhHans;
  return en;
}
