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
      parametric: text("Parametric", "參數檢驗", "参数检验"),
      nonparametric: text("Non-parametric", "非參數檢驗", "非参数检验"),
      mean: text("Mean", "平均數", "平均数"),
      sd: text("Standard deviation", "標準差", "标准差"),
      df: text("Degrees of freedom", "自由度", "自由度"),
      welchPrecision: text("Welch tests use four-decimal coordinates, matching webENA. Full-precision model values are retained.", "Welch 檢驗使用四位小數座標，與 webENA 一致；模型仍保留完整精度。", "Welch 检验使用四位小数坐标，与 webENA 一致；模型仍保留完整精度。"),
      minimumU: text("U (minimum)", "U（較小值）", "U（较小值）"),
      absoluteEffect: text("Rank-biserial r (absolute)", "秩二列相關 r（絕對值）", "秩二列相关 r（绝对值）"),
      calculate: text("Calculate", "計算", "计算"),
      calculating: text("Calculating…", "計算中…", "计算中…"),
      export2D: text("Export 2D statistics", "匯出二維統計", "导出二维统计"),
      goodnessLimit: text("Correlation calculation exceeds the browser Unit limit.", "相關計算超過瀏覽器的單位數量上限。", "相关计算超过浏览器的单位数量上限。"),
      goodnessAxes: text("2D goodness of fit requires two supported axes; this model cannot estimate both axes.", "二維擬合度需要兩個受支援軸；此模型無法估計兩個軸。", "二维拟合度需要两个受支持轴；此模型无法估计两个轴。"),
      goodnessWarning: text("Pearson r below 0.9", "Pearson r 低於 0.9", "Pearson r 低于 0.9"),
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
