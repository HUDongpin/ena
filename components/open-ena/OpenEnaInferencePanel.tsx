"use client";

import type { OpenEnaInferenceCopy } from "@/lib/open-ena-i18n";
import type { OpenEnaInferenceResultV2 } from "@/lib/open-ena/inference-v2";
import type { OpenEnaConfig } from "@/lib/open-ena/types";

export type OpenEnaInferenceDesignChoice = "independent" | "paired" | "repeated";

export interface OpenEnaInferenceDesignAvailability {
  enabled: boolean;
  reason: string | null;
}

export interface OpenEnaInferencePreviewRow {
  id: string;
  label: string;
  value: number | string;
}

export interface OpenEnaInferencePreview {
  message: string;
  rows: OpenEnaInferencePreviewRow[];
}

interface OpenEnaInferencePanelProps {
  copy: OpenEnaInferenceCopy;
  modelType: OpenEnaConfig["model"];
  design: OpenEnaInferenceDesignChoice | null;
  designAvailability: Record<OpenEnaInferenceDesignChoice, OpenEnaInferenceDesignAvailability>;
  onDesignChange: (design: OpenEnaInferenceDesignChoice) => void;
  repeatedEntityColumns: string[];
  repeatedEntityColumnOptions: string[];
  identityConfirmed: boolean;
  onRepeatedEntityColumnsChange: (columns: string[]) => void;
  onIdentityConfirmedChange: (confirmed: boolean) => void;
  timeColumn: string;
  timeColumnOptions: string[];
  onTimeColumnChange: (column: string) => void;
  groupOptions: string[];
  selectedGroup: string | null;
  primaryGroup: string;
  secondaryGroup: string;
  onSelectedGroupChange: (group: string | null) => void;
  onPrimaryGroupChange: (group: string) => void;
  onSecondaryGroupChange: (group: string) => void;
  periodOptions: string[];
  selectedPeriod: string;
  earlierPeriod: string;
  laterPeriod: string;
  repeatedPeriods: string[];
  onSelectedPeriodChange: (period: string) => void;
  onEarlierPeriodChange: (period: string) => void;
  onLaterPeriodChange: (period: string) => void;
  onRepeatedPeriodsChange: (periods: string[]) => void;
  preview: OpenEnaInferencePreview | null;
  eligibilityMessage: string;
  canRun: boolean;
  running: boolean;
  inference: OpenEnaInferenceResultV2 | null;
  integrityError: string | null;
  onRun: () => void;
}

const DESIGN_ORDER = ["independent", "paired", "repeated"] as const;

function formatNumber(value: number | null, digits = 4) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.0001) return value.toExponential(3);
  return Number(value.toFixed(digits)).toString();
}

function formatMinimumAttainable(
  value: { formula: string; log2: number; numeric: number | null } | null,
) {
  if (!value) return "—";
  return value.numeric === null
    ? `${value.formula}; log2 = ${value.log2}`
    : formatNumber(value.numeric, 6);
}

function resultStatus(copy: OpenEnaInferenceCopy, result: OpenEnaInferenceResultV2) {
  if (result.status === "available") return copy.resultAvailable;
  if (result.status === "not-estimable") return copy.resultNotEstimable;
  return copy.resultDisabled;
}

function InferenceProvenance({
  copy,
  inference,
}: {
  copy: OpenEnaInferenceCopy;
  inference: OpenEnaInferenceResultV2;
}) {
  const datasetHash = inference.binding.dataset.normalizedUtf8TextSha256;
  const configuration = inference.binding.configuration;
  const configurationSummary = JSON.stringify({
    model: configuration.model,
    window: configuration.window,
    windowSizeBack: configuration.windowSizeBack,
    windowSizeForward: configuration.windowSizeForward,
    weightBy: configuration.weightBy,
    rotation: configuration.rotation,
    centerAlignToOrigin: configuration.centerAlignToOrigin,
  });
  const methodSummary = JSON.stringify(inference.method);
  return (
    <section
      className="ena-inference-provenance"
      aria-labelledby="open-ena-inference-provenance-heading"
      data-ena-inference-provenance="true"
    >
      <h5 id="open-ena-inference-provenance-heading">{copy.provenanceTitle}</h5>
      <dl>
        <div><dt>{copy.provenanceLabel}</dt><dd>{inference.provenance}</dd></div>
        <div><dt>{copy.analyzedAtLabel}</dt><dd>{inference.analyzedAt}</dd></div>
        <div>
          <dt>{copy.datasetBindingLabel}</dt>
          <dd>
            <code title={datasetHash}>{datasetHash.slice(0, 12)}…</code>
            <span aria-hidden="true"> · </span>{inference.binding.dataset.hashKind}
          </dd>
        </div>
        <div>
          <dt>{copy.modelAxesLabel}</dt>
          <dd>{inference.binding.modelType}<span aria-hidden="true"> · </span>{inference.binding.axes.join(" × ")}</dd>
        </div>
        <div><dt>{copy.configurationBindingLabel}</dt><dd><code>{configurationSummary}</code></dd></div>
        <div><dt>{copy.fixedMethodLabel}</dt><dd><code>{methodSummary}</code></dd></div>
      </dl>
    </section>
  );
}

function MannWhitneyTable({
  copy,
  inference,
}: {
  copy: OpenEnaInferenceCopy;
  inference: Extract<OpenEnaInferenceResultV2, {
    kind: "endpoint-independent" | "trajectory-independent-period";
  }>;
}) {
  const caption = inference.kind === "endpoint-independent"
    ? copy.mannWhitneyEndpointCaption
    : copy.mannWhitneyPeriodCaption;
  return (
    <div className="ena-inference-table-wrap">
      <table className="ena-stats-table ena-inference-result-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.axis}</th>
            <th scope="col">{copy.primary}</th>
            <th scope="col">{copy.n}</th>
            <th scope="col">{copy.median}</th>
            <th scope="col">{copy.uPrimary}</th>
            <th scope="col">{copy.secondary}</th>
            <th scope="col">{copy.n}</th>
            <th scope="col">{copy.median}</th>
            <th scope="col">{copy.uSecondary}</th>
            <th scope="col">{copy.pHolm}</th>
            <th scope="col">{copy.pRaw}</th>
            <th scope="col">{copy.rankBiserial}</th>
            <th scope="col">{copy.resolvedMethod}</th>
          </tr>
        </thead>
        <tbody>{inference.rows.map((row) => (
          <tr key={row.memberId}>
            <th scope="row">{row.axis}</th>
            <td>{inference.request.primaryGroup}</td>
            <td>{row.nPrimary}</td>
            <td>{formatNumber(row.medianPrimary)}</td>
            <td>{formatNumber(row.uPrimary, 2)}</td>
            <td>{inference.request.secondaryGroup}</td>
            <td>{row.nSecondary}</td>
            <td>{formatNumber(row.medianSecondary)}</td>
            <td>{formatNumber(row.uSecondary, 2)}</td>
            <td className="ena-inference-primary-value">{formatNumber(row.pHolm, 6)}</td>
            <td>{formatNumber(row.pRaw, 6)}</td>
            <td>{formatNumber(row.rankBiserialPrimaryVsSecondary)}</td>
            <td>{row.resolvedPMethod ?? "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function WilcoxonTable({
  copy,
  inference,
}: {
  copy: OpenEnaInferenceCopy;
  inference: Extract<OpenEnaInferenceResultV2, { kind: "trajectory-paired-periods" }>;
}) {
  const direction = `${inference.scope.earlierPeriod} → ${inference.scope.laterPeriod}`;
  return (
    <div className="ena-inference-table-wrap">
      <table className="ena-stats-table ena-inference-result-table">
        <caption>{copy.wilcoxonCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.axis}</th>
            <th scope="col">{copy.direction}</th>
            <th scope="col">{copy.matched}</th>
            <th scope="col">{copy.missing}</th>
            <th scope="col">{copy.positive}</th>
            <th scope="col">{copy.negative}</th>
            <th scope="col">{copy.zero}</th>
            <th scope="col">{copy.nonzero}</th>
            <th scope="col">{copy.differenceMedian}</th>
            <th scope="col">{copy.differenceIqr}</th>
            <th scope="col">{copy.wPositive}</th>
            <th scope="col">{copy.wNegative}</th>
            <th scope="col">{copy.tStatistic}</th>
            <th scope="col">{copy.pHolm}</th>
            <th scope="col">{copy.pRaw}</th>
            <th scope="col">{copy.rankBiserial}</th>
            <th scope="col">{copy.minimumAttainableP}</th>
            <th scope="col">{copy.resolvedMethod}</th>
          </tr>
        </thead>
        <tbody>{inference.rows.map((row) => (
          <tr key={row.memberId}>
            <th scope="row">{row.axis}</th>
            <td>{direction}</td>
            <td>{row.nMatched}</td>
            <td>{row.nMissing}</td>
            <td>{row.nPositive}</td>
            <td>{row.nNegative}</td>
            <td>{row.nZero}</td>
            <td>{row.nNonzero} / {row.nRanked}</td>
            <td>{formatNumber(row.medianDifference)}</td>
            <td>{formatNumber(row.iqrDifference)}</td>
            <td>{formatNumber(row.wPositive, 2)}</td>
            <td>{formatNumber(row.wNegative, 2)}</td>
            <td>{formatNumber(row.t, 2)}</td>
            <td className="ena-inference-primary-value">{formatNumber(row.pHolm, 6)}</td>
            <td>{formatNumber(row.pRaw, 6)}</td>
            <td>{formatNumber(row.rankBiserialLaterVsEarlier)}</td>
            <td>{formatMinimumAttainable(row.minimumAttainableTwoSidedP)}</td>
            <td>{row.resolvedPMethod ?? "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function RepeatedTables({
  copy,
  inference,
}: {
  copy: OpenEnaInferenceCopy;
  inference: Extract<OpenEnaInferenceResultV2, { kind: "trajectory-repeated-periods" }>;
}) {
  return (
    <>
      <div className="ena-inference-table-wrap">
        <table className="ena-stats-table ena-inference-result-table">
          <caption>{copy.friedmanCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.axis}</th>
              <th scope="col">{copy.periods}</th>
              <th scope="col">{copy.completeN}</th>
              <th scope="col">{copy.qStatistic}</th>
              <th scope="col">{copy.degreesFreedom}</th>
              <th scope="col">{copy.pHolm}</th>
              <th scope="col">{copy.pRaw}</th>
              <th scope="col">{copy.kendallsW}</th>
              <th scope="col">{copy.resolvedMethod}</th>
            </tr>
          </thead>
          <tbody>{inference.omnibusRows.map((row) => (
            <tr key={row.memberId}>
              <th scope="row">{row.axis}</th>
              <td>{row.nPeriods}</td>
              <td>{row.nComplete}</td>
              <td>{formatNumber(row.q)}</td>
              <td>{formatNumber(row.degreesFreedom, 0)}</td>
              <td className="ena-inference-primary-value">{formatNumber(row.pHolm, 6)}</td>
              <td>{formatNumber(row.pRaw, 6)}</td>
              <td>{formatNumber(row.kendallsW)}</td>
              <td>{row.resolvedPMethod ?? "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="ena-inference-table-wrap">
        <table className="ena-stats-table ena-inference-result-table">
          <caption>{copy.followupCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.axis}</th>
              <th scope="col">{copy.direction}</th>
              <th scope="col">{copy.matched}</th>
              <th scope="col">{copy.zero}</th>
              <th scope="col">{copy.nonzero}</th>
              <th scope="col">{copy.wPositive}</th>
              <th scope="col">{copy.wNegative}</th>
              <th scope="col">{copy.tStatistic}</th>
              <th scope="col">{copy.pHolm}</th>
              <th scope="col">{copy.pRaw}</th>
              <th scope="col">{copy.rankBiserial}</th>
              <th scope="col">{copy.resolvedMethod}</th>
            </tr>
          </thead>
          <tbody>{inference.followupRows.map((row) => (
            <tr key={row.memberId}>
              <th scope="row">{row.axis}</th>
              <td>{inference.scope.periods[row.earlierPeriodIndex]} → {inference.scope.periods[row.laterPeriodIndex]}</td>
              <td>{row.nMatched}</td>
              <td>{row.nZero}</td>
              <td>{row.nNonzero} / {row.nRanked}</td>
              <td>{formatNumber(row.wPositive, 2)}</td>
              <td>{formatNumber(row.wNegative, 2)}</td>
              <td>{formatNumber(row.t, 2)}</td>
              <td className="ena-inference-primary-value">{formatNumber(row.pHolm, 6)}</td>
              <td>{formatNumber(row.pRaw, 6)}</td>
              <td>{formatNumber(row.rankBiserialLaterVsEarlier)}</td>
              <td>{row.resolvedPMethod ?? "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

export default function OpenEnaInferencePanel({
  copy,
  modelType,
  design,
  designAvailability,
  onDesignChange,
  repeatedEntityColumns,
  repeatedEntityColumnOptions,
  identityConfirmed,
  onRepeatedEntityColumnsChange,
  onIdentityConfirmedChange,
  timeColumn,
  timeColumnOptions,
  onTimeColumnChange,
  groupOptions,
  selectedGroup,
  primaryGroup,
  secondaryGroup,
  onSelectedGroupChange,
  onPrimaryGroupChange,
  onSecondaryGroupChange,
  periodOptions,
  selectedPeriod,
  earlierPeriod,
  laterPeriod,
  repeatedPeriods,
  onSelectedPeriodChange,
  onEarlierPeriodChange,
  onLaterPeriodChange,
  onRepeatedPeriodsChange,
  preview,
  eligibilityMessage,
  canRun,
  running,
  inference,
  integrityError,
  onRun,
}: OpenEnaInferencePanelProps) {
  const trajectory = modelType !== "EndPoint";
  const designCopy = {
    independent: [copy.designIndependent, copy.designIndependentDescription],
    paired: [copy.designPaired, copy.designPairedDescription],
    repeated: [copy.designRepeated, copy.designRepeatedDescription],
  } as const;

  function toggleIdentityColumn(column: string, checked: boolean) {
    const selected = new Set(repeatedEntityColumns);
    if (checked) selected.add(column);
    else selected.delete(column);
    onRepeatedEntityColumnsChange(repeatedEntityColumnOptions.filter((candidate) => selected.has(candidate)));
  }

  function toggleRepeatedPeriod(period: string, checked: boolean) {
    const selected = new Set(repeatedPeriods);
    if (checked) selected.add(period);
    else selected.delete(period);
    onRepeatedPeriodsChange(periodOptions.filter((candidate) => selected.has(candidate)));
  }

  return (
    <section className="ena-inference-panel" aria-labelledby="open-ena-inference-heading">
      <h3 id="open-ena-inference-heading">{copy.designLegend}</h3>
      <fieldset className="ena-inference-designs" data-ena-inference-design="true">
        <legend>{copy.designLegend}</legend>
        {DESIGN_ORDER.map((choice) => {
          const availability = designAvailability[choice];
          const reasonId = `open-ena-inference-${choice}-reason`;
          return (
            <label key={choice} className="ena-inference-design-card" data-selected={design === choice ? "true" : "false"}>
              <input
                type="radio"
                name="open-ena-inference-design"
                value={choice}
                checked={design === choice}
                disabled={!availability.enabled}
                aria-describedby={availability.enabled ? undefined : reasonId}
                onChange={() => onDesignChange(choice)}
              />
              <span><strong>{designCopy[choice][0]}</strong><small>{designCopy[choice][1]}</small></span>
              {!availability.enabled && availability.reason ? <small id={reasonId}>{availability.reason}</small> : null}
            </label>
          );
        })}
      </fieldset>

      {trajectory && design ? (
        <fieldset className="ena-inference-identity">
          <legend>{copy.identityLegend}</legend>
          <p>{copy.identityHint}</p>
          <div className="ena-inference-check-grid">{repeatedEntityColumnOptions.map((column) => (
            <label key={column}>
              <input
                type="checkbox"
                checked={repeatedEntityColumns.includes(column)}
                onChange={(event) => toggleIdentityColumn(column, event.currentTarget.checked)}
              />
              <span>{column}</span>
            </label>
          ))}</div>
          <label className="ena-inference-confirmation">
            <input
              type="checkbox"
              checked={identityConfirmed}
              disabled={repeatedEntityColumns.length === 0}
              onChange={(event) => onIdentityConfirmedChange(event.currentTarget.checked)}
            />
            <span>{copy.identityConfirmation}</span>
          </label>
        </fieldset>
      ) : null}

      {design ? (
        <div className="ena-inference-scope">
          {trajectory ? (
            <label className="ena-field">
              <span>{copy.timeField}</span>
              <select value={timeColumn} onChange={(event) => onTimeColumnChange(event.currentTarget.value)}>
                {timeColumnOptions.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
            </label>
          ) : null}

          {design === "independent" ? (
            <>
              <label className="ena-field">
                <span>{copy.primaryGroup}</span>
                <select value={primaryGroup} onChange={(event) => onPrimaryGroupChange(event.currentTarget.value)}>
                  {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </label>
              <label className="ena-field">
                <span>{copy.secondaryGroup}</span>
                <select value={secondaryGroup} onChange={(event) => onSecondaryGroupChange(event.currentTarget.value)}>
                  {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </label>
              {trajectory ? (
                <label className="ena-field">
                  <span>{copy.selectedPeriod}</span>
                  <select value={selectedPeriod} onChange={(event) => onSelectedPeriodChange(event.currentTarget.value)}>
                    {periodOptions.map((period) => <option key={period} value={period}>{period}</option>)}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}

          {design === "paired" ? (
            <>
              {groupOptions.length ? (
                <label className="ena-field">
                  <span>{copy.group}</span>
                  <select value={selectedGroup ?? ""} onChange={(event) => onSelectedGroupChange(event.currentTarget.value)}>
                    {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                </label>
              ) : <p className="ena-inference-all-units">{copy.group}: <strong>{copy.allUnits}</strong></p>}
              <label className="ena-field">
                <span>{copy.earlierPeriod}</span>
                <select value={earlierPeriod} onChange={(event) => onEarlierPeriodChange(event.currentTarget.value)}>
                  {periodOptions.map((period) => <option key={period} value={period}>{period}</option>)}
                </select>
              </label>
              <label className="ena-field">
                <span>{copy.laterPeriod}</span>
                <select value={laterPeriod} onChange={(event) => onLaterPeriodChange(event.currentTarget.value)}>
                  {periodOptions.map((period) => <option key={period} value={period}>{period}</option>)}
                </select>
              </label>
            </>
          ) : null}

          {design === "repeated" ? (
            <>
              {groupOptions.length ? (
                <label className="ena-field">
                  <span>{copy.group}</span>
                  <select value={selectedGroup ?? ""} onChange={(event) => onSelectedGroupChange(event.currentTarget.value)}>
                    {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                </label>
              ) : <p className="ena-inference-all-units">{copy.group}: <strong>{copy.allUnits}</strong></p>}
              <fieldset className="ena-inference-periods">
                <legend>{copy.repeatedPeriods}</legend>
                <p>{copy.periodSelectionHint}</p>
                <div className="ena-inference-check-grid">{periodOptions.map((period) => (
                  <label key={period}>
                    <input
                      type="checkbox"
                      checked={repeatedPeriods.includes(period)}
                      onChange={(event) => toggleRepeatedPeriod(period, event.currentTarget.checked)}
                    />
                    <span>{period}</span>
                  </label>
                ))}</div>
              </fieldset>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="ena-inference-eligibility" role="status" aria-live="polite" aria-atomic="true">
        {eligibilityMessage}
      </p>

      {preview ? (
        <section className="ena-inference-ledger" aria-labelledby="open-ena-inference-ledger-heading">
          <h4 id="open-ena-inference-ledger-heading">{copy.ledgerTitle}</h4>
          <div className="ena-inference-table-wrap">
            <table className="ena-stats-table">
              <caption>{copy.ledgerCaption}</caption>
              <thead><tr><th scope="col">{copy.status}</th><th scope="col">{copy.value}</th></tr></thead>
              <tbody>{preview.rows.map((row) => (
                <tr key={row.id}><th scope="row">{row.label}</th><td>{row.value}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p>{preview.message}</p>
        </section>
      ) : null}

      {integrityError ? <p className="ena-inference-error" role="alert"><strong>{copy.integrityError}</strong> {integrityError}</p> : null}

      <button
        type="button"
        className="ena-action-button ena-action-primary ena-inference-run"
        disabled={!canRun || running}
        onClick={onRun}
      >
        {running ? copy.running : copy.run}
      </button>

      {inference ? <a className="ena-inline-link ena-inference-jump" href="#open-ena-inference-results">{copy.jumpToResults}</a> : null}

      {inference ? (
        <section className="ena-inference-results" aria-labelledby="open-ena-inference-results">
          <h4 id="open-ena-inference-results" tabIndex={-1}>{copy.resultsTitle}</h4>
          <p>{resultStatus(copy, inference)}{inference.reason ? ` · ${inference.reason}` : ""}</p>
          {inference.kind === "endpoint-independent" || inference.kind === "trajectory-independent-period"
            ? <MannWhitneyTable copy={copy} inference={inference} />
            : inference.kind === "trajectory-paired-periods"
              ? <WilcoxonTable copy={copy} inference={inference} />
              : <RepeatedTables copy={copy} inference={inference} />}
          {inference.kind === "endpoint-independent" ? <p>{copy.endpointTemporalBoundary}</p> : null}
          <p>{copy.resultAuditHint}</p>
          <InferenceProvenance copy={copy} inference={inference} />
          {inference.warnings.length ? (
            <details className="ena-inference-warnings">
              <summary>{copy.warnings}</summary>
              <ul>{inference.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          ) : null}
        </section>
      ) : <p className="ena-inference-empty">{copy.noResult}</p>}
    </section>
  );
}
