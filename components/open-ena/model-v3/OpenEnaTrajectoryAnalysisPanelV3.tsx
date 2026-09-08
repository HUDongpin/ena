"use client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../../lib/i18n";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";
import { runOpenEnaTrajectoryPathInferenceV3, assertOpenEnaTrajectoryPathInferenceConsumerV3, type OpenEnaTrajectoryPathControlsV3, type OpenEnaTrajectoryPathInferenceResultV3 } from "../../../lib/open-ena/trajectory-path-inference-v3";
import { buildOpenEnaTrajectoryExportV3, assertOpenEnaTrajectoryExportConsumerV3, type OpenEnaTrajectoryExportOptionsV3, type OpenEnaTrajectoryExportV3 } from "../../../lib/open-ena/trajectory-export-v3";

export function trajectoryAnalysisCopyV3(locale: Locale) {
  const t = (en: string, hant: string, hans: string) => locale === "zh-hant" ? hant : locale === "zh-hans" ? hans : en;
  return {
    title: t("Whole-path comparison and collected analyses", "完整路徑比較與已收集分析", "完整路径比较与已收集分析"),
    independent: t("I confirm that the entity histories in these two Groups are independent.", "我確認這兩個群組中的實體歷程彼此獨立。", "我确认这两个组中的实体历程彼此独立。"),
    requirements: t("Confirm physical identity and independent Groups, select at least two Horizons in fitted order, and choose three distinct supported axes. Only complete histories enter this comparison.", "確認實體身分及群組獨立性，按已擬合次序選擇至少兩個視域，並選擇三條不同的受支援軸。此比較只納入完整歷程。", "确认实体身份及组独立性，按已拟合顺序选择至少两个视域，并选择三条不同的受支持轴。此比较只纳入完整历程。"),
    run: t("Run whole-path comparison", "執行完整路徑比較", "运行完整路径比较"),
    running: t("Computing whole-path comparison…", "正在計算完整路徑比較…", "正在计算完整路径比较…"),
    ready: t("Whole-path comparison current", "完整路徑比較為目前結果", "完整路径比较为当前结果"),
    unavailable: t("Path comparison is unavailable for the current confirmed identities, axes, Horizons, complete cohorts or resource limits.", "目前確認的身分、軸、視域、完整樣本群或資源限制不允許路徑比較。", "当前确认的身份、轴、视域、完整样本群或资源限制不允许路径比较。"),
    stale: t("This calculation no longer matches the current model and controls. Run it again.", "此計算已不符合目前模型與控制設定。請重新執行。", "此计算已不符合当前模型与控制设置。请重新运行。"),
    exportError: t("The selected analyses could not be exported. Recompute any stale analyses and try again.", "無法匯出所選分析。請重新計算過時分析後再試。", "无法导出所选分析。请重新计算过时分析后重试。"),
    collected: t("Collected rank designs", "已收集的秩檢定設計", "已收集的秩检验设计"),
    participants: t("Include participant data in this export", "在此匯出中包含參與者資料", "在此次导出中包含参与者数据"),
    export: t("Export trajectory bundle", "匯出軌跡分析套件", "导出轨迹分析包"),
    exporting: t("Preparing trajectory export…", "正在準備軌跡匯出…", "正在准备轨迹导出…"),
    exported: t("Trajectory export prepared", "軌跡匯出已準備就緒", "轨迹导出已准备就绪"),
    disclosure: t("The default bundle contains aggregate path and collected rank statistics. Its plot describes the complete comparison cohorts, rather than display-filtered available cohorts. Participant identities and traces require explicit opt-in.", "預設套件包含彙總路徑及已收集的秩統計。套件圖形描述完整比較樣本群，並非經顯示篩選的可用樣本群。參與者身分及軌跡須明確選擇納入。", "默认分析包包含汇总路径及已收集的秩统计。包内图形描述完整比较样本群，而非经显示筛选的可用样本群。参与者身份及轨迹须明确选择纳入。"),
    axes: t("Path axes", "路徑軸", "路径轴"),
    table: t("Whole-path statistics", "完整路徑統計", "完整路径统计"),
    headers: [t("Metric", "指標", "指标"), t("Period index", "時段索引", "时段索引"), t("Distance space", "距離空間", "距离空间"), t("Observed", "觀察值", "观测值"), t("Raw p", "原始 p", "原始 p"), t("Holm p", "Holm p", "Holm p"), t("Permutations", "置換次數", "置换次数")],
    download: (name: string) => t(`Download ${name}`, `下載 ${name}`, `下载 ${name}`),
  };
}

export function OpenEnaTrajectoryAnalysisPanelV3({ locale, hidden, frameKey, result, plan, current, controls, ranks, confirmIdentityExport }: {
  locale: Locale; hidden: boolean; frameKey: string; result: unknown; plan: unknown; current: boolean;
  controls: Omit<OpenEnaTrajectoryPathControlsV3, "independentGroupsConfirmed"> | null;
  ranks: NonNullable<OpenEnaTrajectoryExportOptionsV3["ranks"]>;
  confirmIdentityExport: () => boolean;
}) {
  const copy = trajectoryAnalysisCopyV3(locale);
  const [independent, setIndependent] = useState(false), [participants, setParticipants] = useState(false);
  const [path, setPath] = useState<{ key: string; value: OpenEnaTrajectoryPathInferenceResultV3 } | null>(null);
  const [prepared, setPrepared] = useState<{ key: string; value: OpenEnaTrajectoryExportV3 } | null>(null);
  const [busy, setBusy] = useState<"path" | "export" | null>(null), [message, setMessage] = useState<"unavailable" | "stale" | "exportError" | "exported" | null>(null);
  const completeControls = controls ? { ...controls, independentGroupsConfirmed: independent } : null;
  const key = canonicalJsonV3({ frameKey, controls: completeControls });
  const selectionKey = canonicalJsonV3({ key, participants, ranks: ranks.map(rank => (rank.value as { scientificContextSha256: string }).scientificContextSha256) });
  const latest = useRef({ key, selectionKey, current, result, plan }); latest.current = { key, selectionKey, current, result, plan };
  const revision = useRef(0), pending = useRef(false);
  useEffect(() => { revision.current++; pending.current = false; setBusy(null); setPath(null); setPrepared(null); setParticipants(false); setIndependent(false); setMessage(null); }, [frameKey]);
  useEffect(() => () => { revision.current++; }, []);
  const pathCurrent = current && path?.key === key;
  const admitted = current && completeControls?.identityConfirmed && independent && completeControls.horizons.length >= 2 && new Set(completeControls.axes).size === 3;
  const still = (captured: typeof latest.current, serial: number, exportSelection = false) => revision.current === serial && latest.current.current && latest.current.result === captured.result && latest.current.plan === captured.plan && (exportSelection ? latest.current.selectionKey === captured.selectionKey : latest.current.key === captured.key);
  async function compute() {
    if (!admitted || !completeControls || pending.current) return;
    const captured = latest.current, serial = ++revision.current;
    pending.current = true; setBusy("path"); setMessage(null);
    try {
      const value = await runOpenEnaTrajectoryPathInferenceV3(captured.result, captured.plan, completeControls);
      await assertOpenEnaTrajectoryPathInferenceConsumerV3(value, captured.result, captured.plan, completeControls);
      if (still(captured, serial)) { setPath({ key: captured.key, value }); setPrepared(null); }
    } catch { if (still(captured, serial)) setMessage("unavailable"); }
    finally { if (revision.current === serial) { pending.current = false; setBusy(null); } }
  }
  function options(): OpenEnaTrajectoryExportOptionsV3 | null {
    return pathCurrent && path && completeControls ? { path: { value: path.value, controls: completeControls }, ranks, ...(participants ? { participantConsent: { includeParticipants: true as const } } : {}) } : null;
  }
  function save(bytes: Uint8Array, mimeType: string, filename: string) {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportFiles(filename?: string) {
    const selected = options();
    if (!selected || pending.current || (participants && !confirmIdentityExport())) return;
    const captured = latest.current, serial = ++revision.current;
    pending.current = true; setBusy("export"); setMessage(null);
    try {
      const value = filename && prepared?.key === captured.selectionKey ? prepared.value : await buildOpenEnaTrajectoryExportV3(captured.result, captured.plan, selected);
      await assertOpenEnaTrajectoryExportConsumerV3(value, captured.result, captured.plan, selected);
      if (!still(captured, serial, true)) return;
      if (filename) { const file = value.files.find(file => file.filename === filename); if (!file) throw new Error("Missing owned export file"); save(new TextEncoder().encode(file.contents), file.mimeType, file.filename); }
      else save(value.bytes, value.mimeType, value.filename);
      setPrepared({ key: captured.selectionKey, value }); setMessage("exported");
    } catch { if (still(captured, serial, true)) setMessage("exportError"); }
    finally { if (revision.current === serial) { pending.current = false; setBusy(null); } }
  }
  return <section hidden={hidden} aria-label={copy.title} data-testid="open-ena-native-trajectory-analysis">
    <h3>{copy.title}</h3><p id="native-path-requirements">{copy.requirements}</p>
    <label><input type="checkbox" checked={independent} onChange={event => setIndependent(event.target.checked)} />{copy.independent}</label>
    <p>{copy.axes}: {completeControls?.axes.join(" · ") ?? "—"}</p>
    <button type="button" disabled={!admitted || busy !== null} aria-describedby="native-path-requirements" onClick={() => void compute()}>{copy.run}</button>
    <p role="status" aria-live="polite">{busy === "path" ? copy.running : busy === "export" ? copy.exporting : message ? copy[message] : pathCurrent ? copy.ready : path ? copy.stale : ""}</p>
    {pathCurrent && path && <table data-testid="open-ena-native-trajectory-path-statistics" aria-label={copy.table}><thead><tr>{copy.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{path.value.inference.tests.map(test => <tr key={test.id}><td>{test.metric}</td><td>{test.timeIndex ?? "—"}</td><td>{test.distanceSpace}</td><td>{test.observed}</td><td>{test.pValue ?? "—"}</td><td>{test.holmAdjustedPValue ?? "—"}</td><td>{test.permutationCount}</td></tr>)}</tbody></table>}
    <p>{copy.collected}: {ranks.map(rank => (rank.value as { inference: { kind: string } }).inference.kind).join(" · ") || "—"}</p>
    <p>{copy.disclosure}</p>
    <label><input type="checkbox" checked={participants} onChange={event => setParticipants(event.target.checked)} />{copy.participants}</label>
    <button type="button" disabled={!pathCurrent || busy !== null} onClick={() => void exportFiles()}>{copy.export}</button>
    {prepared?.key === selectionKey && prepared.value.files.map(file => <button type="button" key={file.filename} disabled={!pathCurrent || busy !== null} onClick={() => void exportFiles(file.filename)}>{copy.download(file.filename)}</button>)}
  </section>;
}
