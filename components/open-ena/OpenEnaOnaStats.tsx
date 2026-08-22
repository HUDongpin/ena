import { useId } from "react";
import {
  buildOpenEnaOnaDescriptiveSummary,
  type OpenEnaOnaDescriptiveScope,
} from "@/lib/open-ena/ona-descriptive";
import type { OpenEnaConfig, OpenEnaResult } from "@/lib/open-ena/types";

export interface OpenEnaOnaStatsCopy {
  title: string;
  descriptiveBoundary: string;
  overallScopeLabel: string;
  groupScopeLabel: string;
  modelCoverage: string;
  analyticUnits: string;
  orderedRows: string;
  opaqueHorizons: string;
  codes: string;
  directedCells: string;
  enabled: string;
  masked: string;
  zeroNetworks: string;
  rawMass: string;
  total: string;
  selfConnections: string;
  offDiagonal: string;
  incomingRawMass: string;
  outgoingRawMass: string;
  topDirectedCells: string;
  pairAsymmetry: string;
  groupUnitCounts: string;
  varianceDiagnostics: string;
  noPositiveCells: string;
  normalizedMean: string;
  raw: string;
  nonzeroUnits: string;
  absoluteNormalizedAsymmetry: string;
  tie: string;
}

const DEFAULT_COPY: OpenEnaOnaStatsCopy = {
  title: "ONA descriptive statistics",
  descriptiveBoundary: "Descriptive only. No subtraction or inferential comparison is computed.",
  overallScopeLabel: "Overall ordered network",
  groupScopeLabel: "{group} ordered mean network",
  modelCoverage: "ONA model coverage",
  analyticUnits: "analytic units",
  orderedRows: "ordered response rows (completed result)",
  opaqueHorizons: "opaque horizons (completed result)",
  codes: "codes",
  directedCells: "directed cells",
  enabled: "enabled",
  masked: "masked",
  zeroNetworks: "Zero networks",
  rawMass: "Raw directed mass",
  total: "Total",
  selfConnections: "Self-connections",
  offDiagonal: "Off-diagonal",
  incomingRawMass: "Incoming raw mass",
  outgoingRawMass: "Outgoing raw mass",
  topDirectedCells: "Top directed cells",
  pairAsymmetry: "Pair asymmetry",
  groupUnitCounts: "Group unit counts",
  varianceDiagnostics: "Model variance diagnostics",
  noPositiveCells: "No enabled directed cell has positive completed evidence.",
  normalizedMean: "normalized mean",
  raw: "raw",
  nonzeroUnits: "nonzero units",
  absoluteNormalizedAsymmetry: "absolute normalized asymmetry",
  tie: "tie",
};

export interface OpenEnaOnaStatsProps {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope?: OpenEnaOnaDescriptiveScope;
  topEdgeLimit?: number;
  copy?: Partial<OpenEnaOnaStatsCopy>;
}

function displayNumber(value: number) {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) return value.toExponential(4);
  return Number(value.toPrecision(6)).toString();
}

export default function OpenEnaOnaStats(props: OpenEnaOnaStatsProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const summary = buildOpenEnaOnaDescriptiveSummary({
    result: props.result,
    config: props.config,
    scope: props.scope,
    topEdgeLimit: props.topEdgeLimit,
  });
  const idPrefix = useId();
  const headingId = `${idPrefix}-heading`;
  const rawMassHeadingId = `${idPrefix}-raw-mass`;
  const incomingHeadingId = `${idPrefix}-incoming`;
  const outgoingHeadingId = `${idPrefix}-outgoing`;
  const topCellsHeadingId = `${idPrefix}-top-cells`;
  const asymmetryHeadingId = `${idPrefix}-asymmetry`;
  const groupsHeadingId = `${idPrefix}-groups`;
  const varianceHeadingId = `${idPrefix}-variance`;
  const scopeLabel = summary.scope.kind === "overall"
    ? copy.overallScopeLabel
    : copy.groupScopeLabel.replace("{group}", summary.scope.name);

  return (
    <section
      className="open-ena-ona-stats"
      data-testid="open-ena-ona-stats"
      data-ona-boundary="descriptive-only"
      data-ona-scope={summary.scope.kind === "overall" ? "overall" : `group:${summary.scope.name}`}
      role="region"
      aria-labelledby={headingId}
    >
      <header>
        <p>{scopeLabel}</p>
        <h3 id={headingId}>{copy.title}</h3>
        <p role="note">{copy.descriptiveBoundary}</p>
      </header>

      <ul aria-label={copy.modelCoverage}>
        <li><strong>{summary.unitCount}</strong> {copy.analyticUnits}</li>
        <li><strong>{summary.responseRowCount}</strong> {copy.orderedRows}</li>
        <li><strong>{summary.opaqueHorizonCount}</strong> {copy.opaqueHorizons}</li>
        <li><strong>{summary.codeCount}</strong> {copy.codes}</li>
        <li>
          <strong>{summary.directedCellCount}</strong> {copy.directedCells}
          {" · "}{summary.enabledCellCount} {copy.enabled}{" · "}{summary.maskedCellCount} {copy.masked}
        </li>
        <li><strong>{summary.zeroNetworkCount}</strong> {copy.zeroNetworks}</li>
      </ul>

      <section aria-labelledby={rawMassHeadingId}>
        <h4 id={rawMassHeadingId}>{copy.rawMass}</h4>
        <dl>
          <div><dt>{copy.total}</dt><dd>{displayNumber(summary.rawConnectionTotal)}</dd></div>
          <div><dt>{copy.selfConnections}</dt><dd>{displayNumber(summary.rawSelfConnectionTotal)}</dd></div>
          <div><dt>{copy.offDiagonal}</dt><dd>{displayNumber(summary.rawOffDiagonalConnectionTotal)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby={incomingHeadingId}>
        <h4 id={incomingHeadingId}>{copy.incomingRawMass}</h4>
        <ul>
          {summary.incomingRawTotals.map((entry) => (
            <li key={entry.code}><span>{entry.code}</span> <strong>{displayNumber(entry.rawMass)}</strong></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={outgoingHeadingId}>
        <h4 id={outgoingHeadingId}>{copy.outgoingRawMass}</h4>
        <ul>
          {summary.outgoingRawTotals.map((entry) => (
            <li key={entry.code}><span>{entry.code}</span> <strong>{displayNumber(entry.rawMass)}</strong></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={topCellsHeadingId}>
        <h4 id={topCellsHeadingId}>{copy.topDirectedCells}</h4>
        {summary.topDirectedEdges.length > 0 ? (
          <ol>
            {summary.topDirectedEdges.map((edge) => (
              <li key={`${edge.groundIndex}:${edge.responseIndex}`}>
                <strong>{edge.groundSource} → {edge.responseTarget}</strong>
                {" · "}{displayNumber(edge.equalUnitNormalizedMean)} {copy.normalizedMean}
                {" · "}{displayNumber(edge.rawAggregateCount)} {copy.raw}
                {" · "}{edge.nonzeroUnitCount} {copy.nonzeroUnits}
              </li>
            ))}
          </ol>
        ) : <p>{copy.noPositiveCells}</p>}
      </section>

      <section aria-labelledby={asymmetryHeadingId}>
        <h4 id={asymmetryHeadingId}>{copy.pairAsymmetry}</h4>
        <ul>
          {summary.pairAsymmetries.map((pair) => (
            <li key={`${pair.firstCode}:${pair.secondCode}`}>
              <strong>{pair.firstCode} ↔ {pair.secondCode}</strong>
              {" · "}{displayNumber(pair.absoluteNormalizedMeanDifference)} {copy.absoluteNormalizedAsymmetry}
              {" · "}{pair.dominantDirection === "tie" ? copy.tie : pair.dominantDirection}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={groupsHeadingId}>
        <h4 id={groupsHeadingId}>{copy.groupUnitCounts}</h4>
        <ul>
          {summary.groupCounts.map((group) => (
            <li key={group.name}><span>{group.name}</span> <strong>{group.unitCount}</strong></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={varianceHeadingId}>
        <h4 id={varianceHeadingId}>{copy.varianceDiagnostics}</h4>
        <ul>
          {summary.varianceDiagnostics.map((entry) => (
            <li key={entry.dimension}>
              <span>{entry.dimension}</span> <strong>{displayNumber(entry.explainedProportion * 100)}%</strong>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
