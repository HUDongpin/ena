"use client";
import { useId, useState, type ReactNode } from "react";
import type { BoundResultV3 } from "../../../lib/open-ena/model-v3/types";
import type { OpenEnaCopy } from "../../../lib/open-ena-i18n";
import { nativeStatisticsTablesV3, type NativeInferenceV3 } from "../../../lib/open-ena/native-statistics-export-v3";

export interface NativeStatsCopyV3 {
  unavailable: string; historical: string; current: string; inferred: string;
  rows: string; omnibus: string; followups: string; ledger: string;
  fixedVariance: string; fittedVariance: string;
}
export const nativeStatsCopyV3: NativeStatsCopyV3 = {
  unavailable: "Correlation goodness-of-fit statistics are unavailable in this native model bundle; no correlation test is claimed.",
  historical: "These descriptive values belong to the retained historical model.", current: "These values belong to the current bound model.",
  inferred: "Researcher-requested post-model inference", rows: "Native comparison statistics", omnibus: "Repeated-measures omnibus statistics",
  followups: "Selected-request followup statistics", ledger: "Observed inference population", fixedVariance: "Target variance along fixed Reference axes", fittedVariance: "Variance in the fitted space",
};

export function OpenEnaNativeStatsPanelV3({ result, current, axes, inference, copy, nativeCopy = nativeStatsCopyV3, children, renderTable }: {
  result: BoundResultV3 | null; current: boolean; axes: readonly string[]; inference: NativeInferenceV3 | null;
  copy: OpenEnaCopy["stats"]; nativeCopy?: NativeStatsCopyV3; children: ReactNode;
  renderTable: (rows: readonly object[], label: string) => ReactNode;
}) {
  const id = useId(), [tab, setTab] = useState<"comparison" | "goodness" | "variance">("comparison");
  const tabs = ["comparison", "goodness", "variance"] as const;
  const tables = inference ? nativeStatisticsTablesV3(inference) : null;
  return <>
    <div className="ena-stats-tabs" role="tablist" aria-label={copy.title}>{tabs.map((value, index) => <button type="button" key={value} role="tab"
      id={`${id}-${value}`} aria-controls={`${id}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
      data-ena-stats-tab={value} onClick={() => setTab(value)} onKeyDown={(event) => {
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
        if (next === null) return; event.preventDefault(); setTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus();
      }}>{copy.tabs[value]}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0} data-ena-stats-panel={tab}>
      {tab === "comparison" && <>{children}{inference && tables && <section aria-label={nativeCopy.inferred}>
        {renderTable(Object.entries(inference.inference.method).map(([parameter, value]) => ({ parameter, value })), nativeCopy.inferred)}<p>{inference.inference.status}</p>
        {"rows" in tables && renderTable(tables.rows ?? [], nativeCopy.rows)}
        {"omnibusRows" in tables && renderTable(tables.omnibusRows ?? [], nativeCopy.omnibus)}
        {"followupRows" in tables && renderTable(tables.followupRows ?? [], nativeCopy.followups)}
        {tables.ledger && renderTable(Object.entries(tables.ledger).map(([field, value]) => ({ field, value })), nativeCopy.ledger)}
        <ul>{inference.inference.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </section>}</>}
      {tab === "goodness" && <p role="status">{nativeCopy.unavailable}</p>}
      {tab === "variance" && <><p>{current ? nativeCopy.current : nativeCopy.historical}</p>
        <p>{result?.executionProvenance.projection.type === "reference" ? nativeCopy.fixedVariance : nativeCopy.fittedVariance}</p>
        {result && renderTable(axes.filter((axis) => Object.hasOwn(result.set.variance, axis)).map((axis) => ({ axis, share: result.set.variance[axis] })), copy.tabs.variance)}</>}
    </div>
  </>;
}
