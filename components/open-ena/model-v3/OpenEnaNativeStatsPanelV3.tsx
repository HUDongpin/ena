"use client";
import { useId, useState, type ReactNode } from "react";
import type { BoundResultV3 } from "../../../lib/open-ena/model-v3/types";
import type { OpenEnaCopy } from "../../../lib/open-ena-i18n";
import { nativeStatisticsTablesV3, type NativeInferenceV3 } from "../../../lib/open-ena/native-statistics-export-v3";
import { restoredWorkbenchCopy } from "../workbench-restoration-copy";

type ComparisonCardCopy = ReturnType<typeof restoredWorkbenchCopy>["comparisonCards"];

function metricText(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : Number(value.toPrecision(4)).toString();
}

/** Format native output only. Full-precision values and all audit fields remain in the table. */
export function OpenEnaNativeComparisonCardsV3({ rows, copy }: { rows: readonly object[]; copy: ComparisonCardCopy }) {
  return <div className="ena-native-comparison-cards">{rows.map((record, index) => {
    const row: Record<string, unknown> = Object.fromEntries(Object.entries(record));
    const metrics = [["uPrimary", "U"], ["statistic", "Statistic"], ["pRaw", copy.rawP], ["pHolm", copy.adjustedP], ["rankBiserialPrimaryVsSecondary", copy.effect]]
      .filter(([key]) => Object.hasOwn(row, key));
    const number = (key: string) => <span title={typeof row[key] === "number" ? String(row[key]) : undefined}>{metricText(row[key])}</span>;
    return <article className="ena-native-axis-card" key={String(row.memberId ?? `${row.axis}:${index}`)}>
      <header><h3>{String(row.axis ?? row.test ?? index + 1)}</h3><span>{String(row.test ?? "")}</span></header>
      {row.status !== "available" && <p role="status">{String(row.reason ?? row.status ?? "—")}</p>}
      <dl>{metrics.map(([key, label]) => <div key={key} data-native-metric={key}><dt>{label}</dt><dd>{number(key)}</dd></div>)}</dl>
      {Object.hasOwn(row, "nPrimary") && <table><thead><tr><th>{copy.group}</th><th>{copy.n}</th><th>{copy.median}</th></tr></thead>
        <tbody><tr><th>{copy.primary}</th><td>{number("nPrimary")}</td><td>{number("medianPrimary")}</td></tr>
          <tr><th>{copy.secondary}</th><td>{number("nSecondary")}</td><td>{number("medianSecondary")}</td></tr></tbody>
      </table>}
    </article>;
  })}</div>;
}

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

export function OpenEnaNativeStatsPanelV3({ result, current, axes, inference, copy, nativeCopy = nativeStatsCopyV3, comparisonCardCopy = restoredWorkbenchCopy("en").comparisonCards, children, renderTable }: {
  result: BoundResultV3 | null; current: boolean; axes: readonly string[]; inference: NativeInferenceV3 | null;
  copy: OpenEnaCopy["stats"]; nativeCopy?: NativeStatsCopyV3; children: ReactNode;
  comparisonCardCopy?: ComparisonCardCopy;
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
        {"rows" in tables && <><OpenEnaNativeComparisonCardsV3 rows={tables.rows ?? []} copy={comparisonCardCopy} />
          <details className="ena-panel-details"><summary>{nativeCopy.rows}</summary>{renderTable(tables.rows ?? [], nativeCopy.rows)}</details></>}
        {"omnibusRows" in tables && renderTable(tables.omnibusRows ?? [], nativeCopy.omnibus)}
        {"followupRows" in tables && renderTable(tables.followupRows ?? [], nativeCopy.followups)}
        <details className="ena-panel-details"><summary>{nativeCopy.inferred}</summary>
          {renderTable(Object.entries(inference.inference.method).map(([parameter, value]) => ({ parameter, value })), nativeCopy.inferred)}<p>{inference.inference.status}</p>
          {tables.ledger && renderTable(Object.entries(tables.ledger).map(([field, value]) => ({ field, value })), nativeCopy.ledger)}
        </details>
        <ul className="ena-native-inference-warnings">{inference.inference.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </section>}</>}
      {tab === "goodness" && <p role="status">{nativeCopy.unavailable}</p>}
      {tab === "variance" && <><p>{current ? nativeCopy.current : nativeCopy.historical}</p>
        <p>{result?.executionProvenance.projection.type === "reference" ? nativeCopy.fixedVariance : nativeCopy.fittedVariance}</p>
        {result && renderTable(axes.filter((axis) => Object.hasOwn(result.set.variance, axis)).map((axis) => ({ axis, share: result.set.variance[axis] })), copy.tabs.variance)}</>}
    </div>
  </>;
}
