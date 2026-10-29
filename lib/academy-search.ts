import { getAcademyCopy } from "./academy-i18n";
import type { AcademyLesson } from "./academy-types";
import { locales } from "./i18n";

// Search aliases for the existing English lessons, not translations of their
// reviewed bodies. Keep simplified/traditional forms together for cross-locale searches.
const chineseKeywords: Readonly<Record<string, string>> = {
  "academy-001": "研究问题 研究問題 分析单位 分析單位 对话边界 對話邊界 编码方案 編碼方案",
  "academy-002": "编码数据 編碼資料 数据格式 資料格式 二元编码 二元編碼 数据准备 資料準備",
  "academy-003": "模型比较 模型比較 组间比较 組間比較 移动窗口 移動窗口 滑动窗口 滑動窗口",
  "academy-004": "网络解释 網絡詮釋 质性证据 質性證據 定性证据 定性證據 差异图 差異圖",
  "academy-005": "归一化 正規化 标准化 標準化 投影 旋转 旋轉",
  "academy-006": "编码信度 編碼信度 编码一致性 編碼一致性 编码可靠性 編碼可靠性 编码手册 編碼手冊",
  "academy-007": "移动窗口 移動窗口 滑动窗口 滑動窗口 语境 語境 对话边界 對話邊界",
  "academy-008": "编码频率 編碼頻率 连接权重 連接權重 共现 共現",
  "academy-009": "嵌套单位 巢狀單位 元数据 中繼資料 伪重复 偽重複",
  "academy-010": "单位网络 單位網絡 异常值 異常值 影响点 影響點 组均值 組均值",
  "academy-011": "配对比较 配對比較 重复测量 重複測量 单位内变化 單位內變化",
  "academy-012": "不确定性 不確定性 自助法 重采样 重抽樣 置信区间 信賴區間",
  "academy-013": "均值旋转 均值旋轉 组间比较 組間比較 预先指定 預先指定",
  "academy-014": "奇异值分解 奇異值分解 共同配准 共同配準 方差解释 變異解釋 节点位置 節點位置",
  "academy-015": "跨实现复现 跨實作重現 数值容差 數值容差 可复现 可重現",
  "academy-016": "窗口敏感性 分段 分割 稳健性 穩健性 敏感性分析",
  "academy-017": "网络相减 網絡相減 差异图 差異圖 边差异 邊差異",
  "academy-018": "证据溯源 證據溯源 原文片段 质性证据 質性證據 定性证据 定性證據",
  "academy-019": "效应量 效應量 置信区间 信賴區間 统计报告 統計報告",
  "academy-020": "多组比较 多組比較 多重比较 多重比較 计划对比 計劃對比",
  "academy-021": "纵向轨迹 縱向軌跡 纵向分析 縱向分析 时间顺序 時間順序 共享空间 共享空間",
  "academy-022": "有向网络 有向網絡 有序网络 有序網絡 序列 转移 轉移",
  "academy-023": "多模态 多模態 事件对齐 事件對齊 传感器 感測器",
  "academy-024": "自动编码 自動編碼 分类器验证 分類器驗證 误差传播 誤差傳播 人工审核 人工審核",
  "academy-025": "缺失数据 缺失資料 遗漏数据 遺漏資料 排除规则 排除規則 样本流失 樣本流失",
  "academy-026": "预注册 預註冊 决策记录 決策記錄 验证性分析 驗證性分析",
  "academy-027": "归一化 正規化 标准化 標準化 球面归一化 球面正規化",
  "academy-028": "零网络 零網絡 空向量 稀疏数据 稀疏資料 归一化失败 正規化失敗",
  "academy-029": "导出 匯出 可复现 可重現 溯源 文件哈希 檔案雜湊",
  "academy-030": "方法章节 方法章節 方法报告 方法報告 论文写作 論文寫作",
  "academy-031": "结果报告 結果報告 分层证据 分層證據 网络统计 網絡統計",
  "academy-032": "因果语言 因果語言 因果推断 因果推論 观察性研究 觀察性研究",
  "academy-033": "同行评审 同行評審 方法审查 方法審查 可复现 可重現",
};
const uiCopies = locales.map(getAcademyCopy);

export function academySearchKeywords(lesson: AcademyLesson): string {
  return [...uiCopies.flatMap(copy => [copy.trackLabels[lesson.track], copy.levelLabels[lesson.level]]), chineseKeywords[lesson.id] ?? ""].join(" ");
}
