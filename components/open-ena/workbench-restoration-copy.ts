import type { Locale } from "@/lib/i18n";

/** Presentation copy only. Scientific terms and actions stay in the native v3 catalog. */
export function restoredWorkbenchCopy(locale: Locale) {
  const text = (en: string, traditional: string, simplified: string) =>
    locale === "zh-hant" ? traditional : locale === "zh-hans" ? simplified : en;
  return {
    dataKicker: text("01 · Dataset", "01 · 資料集", "01 · 数据集"),
    modelKicker: text("02 · Model", "02 · 模型", "02 · 模型"),
    plotKicker: text("03 · Presenter", "03 · 繪圖", "03 · 绘图"),
    statsKicker: text("04 · Statistics", "04 · 統計", "04 · 统计"),
    aiKicker: text("05 · AI interpretation", "05 · AI 輔助解讀", "05 · AI 辅助解读"),
    aiEvidenceScope: text("AI evidence scope", "AI 證據範圍", "AI 证据范围"),
    teachingModel: text("Teaching Sample · jENA model configuration", "教學範例 · jENA 模型設定", "教学示例 · jENA 模型设置"),
    createSample: text("Create Sample", "建立樣本", "创建样本"),
    contrastActions: text("Comparison exports", "比較結果匯出", "比较结果导出"),
    display: text("Plotted layers", "繪圖圖層", "绘图图层"),
    dimensions: text("Dimensions", "維度", "维度"),
    scales: text("Plot scales", "繪圖比例", "绘图比例"),
    familyDetails: text("Network method details", "網絡方法詳情", "网络方法详情"),
    statsDescription: text("Inspect comparisons and export the current model's evidence.", "檢視比較結果並匯出目前模型的證據。", "查看比较结果并导出当前模型的证据。"),
    comparisonCards: {
      rawP: text("p (raw)", "p（原始）", "p（原始）"),
      adjustedP: text("p (Holm)", "p（Holm 校正）", "p（Holm 校正）"),
      effect: text("Rank-biserial r", "秩二列相關 r", "秩二列相关 r"),
      primary: text("Primary", "主要組", "主要组"),
      secondary: text("Secondary", "次要組", "次要组"),
      group: text("Group", "群組", "组"),
      median: text("Median", "中位數", "中位数"),
      n: "N",
    },
  };
}
