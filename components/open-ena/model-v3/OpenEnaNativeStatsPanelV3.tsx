"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { BoundResultV3 } from "../../../lib/open-ena/model-v3/types";
import type { OpenEnaCopy } from "../../../lib/open-ena-i18n";
import { nativeStatisticsTablesV3, type NativeInferenceV3 } from "../../../lib/open-ena/native-statistics-export-v3";
import { restoredWorkbenchCopy } from "../workbench-restoration-copy";
import { calculateEndpointGoodness2DV3, calculateEndpointWelch2DV3, type EndpointGoodness2DV3, type EndpointWelch2DV3 } from "../../../lib/open-ena/endpoint-statistics-2d-v3";
import type { OpenEnaEndpointControlsV3 } from "../../../lib/open-ena/inference-consumers-v3";

type ComparisonCardCopy = ReturnType<typeof restoredWorkbenchCopy>["comparisonCards"];

function endpointNumber(value: unknown, probability = false): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (probability && value > 0 && value < 0.0001) return "<0.0001";
  const rounded = Number(value.toFixed(4));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4);
}

export function OpenEnaEndpointWelchCards2D({ rows, copy, axisSigns = {} }: {
  rows: EndpointWelch2DV3["rows"]; copy: ComparisonCardCopy; axisSigns?: Readonly<Record<string, number>>;
}) {
  return <div className="ena-native-comparison-cards">{rows.map(row => {
    const sign = axisSigns[row.axis] ?? 1;
    const n = (value: number | null, signed = false, probability = false) => <span title={value === null ? undefined : String(value)}>{endpointNumber(value === null ? null : value * (signed ? sign : 1), probability)}</span>;
    return <article className="ena-native-axis-card" key={row.axis}><header><h3>{row.axis}</h3><span>Welch t</span></header>
      <dl><div><dt>t</dt><dd>{n(row.t, true)}</dd></div><div><dt>{copy.df}</dt><dd>{n(row.df)}</dd></div>
        <div><dt>{copy.rawP}</dt><dd>{n(row.p, false, true)}</dd></div><div><dt>Cohen&apos;s d</dt><dd>{n(row.cohensD)}</dd></div></dl>
      <table><thead><tr><th>{copy.group}</th><th>{copy.n}</th><th>{copy.mean}</th><th title={copy.sd}>SD</th></tr></thead><tbody>
        <tr><th>{copy.primary}</th><td>{row.nPrimary}</td><td>{n(row.meanPrimary, true)}</td><td>{n(row.sdPrimary)}</td></tr>
        <tr><th>{copy.secondary}</th><td>{row.nSecondary}</td><td>{n(row.meanSecondary, true)}</td><td>{n(row.sdSecondary)}</td></tr>
      </tbody></table></article>;
  })}</div>;
}

export function OpenEnaEndpointMannWhitneyCards2D({ rows, copy, axisSigns = {} }: {
  rows: readonly object[]; copy: ComparisonCardCopy; axisSigns?: Readonly<Record<string, number>>;
}) {
  return <div className="ena-native-comparison-cards">{rows.map((record, index) => {
    const row = Object.fromEntries(Object.entries(record)), axis = String(row.axis ?? index), sign = axisSigns[axis] ?? 1;
    const number = (key: string, signed = false) => typeof row[key] === "number" ? Number(row[key]) * (signed ? sign : 1) : null;
    const u1 = number("uPrimary"), u2 = number("uSecondary"), effect = number("rankBiserialPrimaryVsSecondary");
    return <article className="ena-native-axis-card" key={axis}><header><h3>{axis}</h3><span>Mann–Whitney</span></header>
      <dl><div><dt>{copy.minimumU}</dt><dd>{endpointNumber(u1 === null || u2 === null ? null : Math.min(u1, u2))}</dd></div>
        <div><dt>{copy.rawP}</dt><dd>{endpointNumber(number("pRaw"), true)}</dd></div>
        <div><dt>{copy.absoluteEffect}</dt><dd>{endpointNumber(effect === null ? null : Math.abs(effect))}</dd></div></dl>
      <table><thead><tr><th>{copy.group}</th><th>{copy.n}</th><th>{copy.median}</th></tr></thead><tbody>
        <tr><th>{copy.primary}</th><td>{endpointNumber(number("nPrimary"))}</td><td>{endpointNumber(number("medianPrimary", true))}</td></tr>
        <tr><th>{copy.secondary}</th><td>{endpointNumber(number("nSecondary"))}</td><td>{endpointNumber(number("medianSecondary", true))}</td></tr>
      </tbody></table></article>;
  })}</div>;
}

interface EndpointContext2D {
  plan: unknown; controls: OpenEnaEndpointControlsV3 | null; busy: boolean;
  axisSigns: Readonly<Record<string, number>>;
  onRun: () => void;
  onExport: (artifact: object) => void;
}

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

export function OpenEnaEndpointGoodness2D({ goodness, current, axisCount, copy, cardCopy, nativeCopy }: {
  goodness: EndpointGoodness2DV3 | null; current: boolean; axisCount: number;
  copy: OpenEnaCopy["stats"]; cardCopy: ComparisonCardCopy; nativeCopy: NativeStatsCopyV3;
}) {
  if (!current) return <p role="status">{nativeCopy.historical}</p>;
  if (axisCount !== 2) return <p role="status">{cardCopy.goodnessAxes}</p>;
  if (goodness?.status !== "available") return <p role="status">{goodness ? cardCopy.goodnessLimit : cardCopy.calculating}</p>;
  return <div className="ena-result-table-wrap"><table><caption>{copy.ui.correlationsCaption}</caption>
    <thead><tr><th>{copy.ui.axis}</th><th>{copy.ui.pearsonR}</th><th>{copy.ui.spearmanRho}</th></tr></thead>
    <tbody>{goodness.rows.map(row => <tr key={row.axis}><th>{row.axis}{row.pearson !== null && row.pearson < 0.9 ? <span title={cardCopy.goodnessWarning}> ⚠</span> : null}</th>
      <td title={String(row.pearson)}>{endpointNumber(row.pearson)}</td><td title={String(row.spearman)}>{endpointNumber(row.spearman)}</td></tr>)}</tbody>
  </table></div>;
}

export function OpenEnaNativeStatsPanelV3({ result, current, axes, inference, copy, nativeCopy = nativeStatsCopyV3, comparisonCardCopy = restoredWorkbenchCopy("en").comparisonCards, children, renderTable, endpoint2D }: {
  result: BoundResultV3 | null; current: boolean; axes: readonly string[]; inference: NativeInferenceV3 | null;
  copy: OpenEnaCopy["stats"]; nativeCopy?: NativeStatsCopyV3; children: ReactNode;
  comparisonCardCopy?: ComparisonCardCopy;
  renderTable: (rows: readonly object[], label: string) => ReactNode;
  endpoint2D?: EndpointContext2D;
}) {
  const id = useId(), [tab, setTab] = useState<"comparison" | "goodness" | "variance">("comparison");
  const tabs = ["comparison", "goodness", "variance"] as const;
  const tables = inference ? nativeStatisticsTablesV3(inference) : null;
  const [comparisonType, setComparisonType] = useState<"parametric" | "nonparametric">("nonparametric");
  const [retry, setRetry] = useState(0);
  const [goodness, setGoodness] = useState<{ key: string; value: EndpointGoodness2DV3 } | null>(null);
  const [welch, setWelch] = useState<{ key: string; value: EndpointWelch2DV3 } | null>(null);
  const [calculationError, setCalculationError] = useState<{ key: string; message: string } | null>(null);
  const goodnessKey = endpoint2D && current && result && axes.length === 2
    ? JSON.stringify([result.binding, result.createdAt, axes]) : "";
  const comparisonKey = goodnessKey && endpoint2D?.controls && inference
    ? `${goodnessKey}:${JSON.stringify(endpoint2D.controls)}` : "";
  useEffect(() => {
    if (!goodnessKey || !endpoint2D) return;
    let active = true;
    void calculateEndpointGoodness2DV3(result, endpoint2D.plan, axes).then(value => {
      if (active) { setGoodness({ key: goodnessKey, value }); setCalculationError(null); }
    }).catch(error => { if (active) setCalculationError({ key: goodnessKey, message: error instanceof Error ? error.message : String(error) }); });
    return () => { active = false; };
  }, [goodnessKey, result, endpoint2D?.plan, retry]);
  useEffect(() => {
    if (!comparisonKey || !endpoint2D?.controls) return;
    let active = true;
    void calculateEndpointWelch2DV3(result, endpoint2D.plan, endpoint2D.controls).then(value => {
      if (active) setWelch({ key: comparisonKey, value });
    }).catch(error => { if (active) setCalculationError({ key: comparisonKey, message: error instanceof Error ? error.message : String(error) }); });
    return () => { active = false; };
  }, [comparisonKey, result, endpoint2D?.plan, inference]);
  const currentGoodness = goodness?.key === goodnessKey && goodnessKey ? goodness.value : null;
  const currentWelch = welch?.key === comparisonKey && comparisonKey ? welch.value : null;
  return <>
    <div className="ena-stats-tabs" role="tablist" aria-label={copy.title}>{tabs.map((value, index) => <button type="button" key={value} role="tab"
      id={`${id}-${value}`} aria-controls={`${id}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
      data-ena-stats-tab={value} onClick={() => setTab(value)} onKeyDown={(event) => {
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
        if (next === null) return; event.preventDefault(); setTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus();
      }}>{copy.tabs[value]}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0} data-ena-stats-panel={tab}>
      {tab === "comparison" && <>{children}{endpoint2D && <div className="ena-restored-action-row">
        {(["parametric", "nonparametric"] as const).map(kind => <button type="button" key={kind} aria-pressed={comparisonType === kind}
          disabled={!current || !endpoint2D.controls || endpoint2D.busy} onClick={() => { setComparisonType(kind); endpoint2D.onRun(); }}>{comparisonCardCopy[kind]}</button>)}
      </div>}{inference && tables && <section aria-label={nativeCopy.inferred}>
        {"rows" in tables && <>{endpoint2D ? comparisonType === "parametric"
          ? currentWelch ? <><OpenEnaEndpointWelchCards2D rows={currentWelch.rows} copy={comparisonCardCopy} axisSigns={endpoint2D.axisSigns} /><p>{comparisonCardCopy.welchPrecision}</p></> : <p role="status">{comparisonCardCopy.calculating}</p>
          : <OpenEnaEndpointMannWhitneyCards2D rows={tables.rows ?? []} copy={comparisonCardCopy} axisSigns={endpoint2D.axisSigns} />
          : <OpenEnaNativeComparisonCardsV3 rows={tables.rows ?? []} copy={comparisonCardCopy} />}
          <details className="ena-panel-details"><summary>{nativeCopy.rows}</summary>{renderTable(tables.rows ?? [], nativeCopy.rows)}</details></>}
        {"omnibusRows" in tables && renderTable(tables.omnibusRows ?? [], nativeCopy.omnibus)}
        {"followupRows" in tables && renderTable(tables.followupRows ?? [], nativeCopy.followups)}
        <details className="ena-panel-details"><summary>{nativeCopy.inferred}</summary>
          {renderTable(Object.entries(inference.inference.method).map(([parameter, value]) => ({ parameter, value })), nativeCopy.inferred)}<p>{inference.inference.status}</p>
          {tables.ledger && renderTable(Object.entries(tables.ledger).map(([field, value]) => ({ field, value })), nativeCopy.ledger)}
        </details>
        <ul className="ena-native-inference-warnings">{inference.inference.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </section>}</>}
      {tab === "goodness" && (endpoint2D ? <>
        <button type="button" disabled={!current || !goodnessKey} onClick={() => setRetry(value => value + 1)}>{comparisonCardCopy.calculate}</button>
        <OpenEnaEndpointGoodness2D goodness={currentGoodness} current={current} axisCount={axes.length} copy={copy} cardCopy={comparisonCardCopy} nativeCopy={nativeCopy} />
      </> : <p role="status">{nativeCopy.unavailable}</p>)}
      {tab === "variance" && <><p>{current ? nativeCopy.current : nativeCopy.historical}</p>
        <p>{result?.executionProvenance.projection.type === "reference" ? nativeCopy.fixedVariance : nativeCopy.fittedVariance}</p>
        {result && renderTable(axes.filter((axis) => Object.hasOwn(result.set.variance, axis)).map((axis) => ({ axis, share: result.set.variance[axis] })), copy.tabs.variance)}</>}
      {endpoint2D && calculationError && [goodnessKey, comparisonKey].includes(calculationError.key) && <p role="alert">{calculationError.message}</p>}
      {endpoint2D && currentGoodness && <button type="button" disabled={!current || endpoint2D.busy || Boolean(inference && !currentWelch)} onClick={() => endpoint2D.onExport({
        schemaVersion: 1, kind: "open-ena-endpoint-statistics-2d", executable: false, binding: currentGoodness.binding,
        axes: [...axes], displayAxisSigns: endpoint2D.axisSigns, goodness: currentGoodness, welch: currentWelch,
        nonparametric: inference?.kind === "open-ena-endpoint-inference" ? inference.inference : null,
        nonparametricDisplay: "minimum U and absolute rank-biserial r; raw signed group statistics are retained",
      })}>{comparisonCardCopy.export2D}</button>}
    </div>
  </>;
}
