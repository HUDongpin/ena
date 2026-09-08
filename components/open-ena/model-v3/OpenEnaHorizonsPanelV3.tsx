"use client";

import { useEffect } from "react";
import { OpenEnaOfficialFieldPathEditor } from "../OpenEnaOfficialModelControls";
import type { ModelDiagnosticV3 } from "../../../lib/open-ena/model-v3/diagnostics";
import type { ExecutionIdentityEntryV3 } from "../../../lib/open-ena/model-v3/identity";
import {
  createEmptyOrderKeyRawV3,
  OpenEnaOrderPolicyEditorV3,
  type OpenEnaOrderPolicyEditorV3Copy,
  type OrderPolicyEditorRawStateV3,
} from "./OpenEnaOrderPolicyEditorV3";
import {
  modelScientificContextV3,
  type ModelScientificContextV3,
  type ModelStateActionV3,
  type ModelStateV3,
} from "./model-state";
import type { OpenEnaModelPanelFieldsV3 } from "./OpenEnaModelTabsV3";

const MAX_STRUCTURE_ROWS = 200;
const MAX_SEQUENCE_UNITS = 100;
const MAX_SEQUENCE_STEPS = 100;

export interface OpenEnaHorizonsPanelV3Copy {
  readonly horizonIdentity: string;
  readonly horizonPickerEmpty: string;
  readonly addRemoveFields: (label: string) => string;
  readonly removeField: (field: string, label: string) => string;
  readonly counts: string;
  readonly unitCount: (count: number) => string;
  readonly horizonCount: (count: number) => string;
  readonly observationCount: (count: number) => string;
  readonly unavailable: string;
  readonly structure: string;
  readonly structureColumns: Readonly<{ unit: string; horizon: string; rows: string }>;
  readonly sharedHorizons: (count: number) => string;
  readonly noSharedHorizons: string;
  readonly singleRowObservations: (count: number) => string;
  readonly extremeObservations: (minimum: number, maximum: number) => string;
  readonly boundedRows: (shown: number, total: number) => string;
  readonly trajectoryOrder: string;
  readonly horizonOrderNotApplicable: string;
  readonly onaOrderNotApplicable: string;
  readonly sequences: string;
  readonly sequence: (unit: string, steps: string) => string;
  readonly sequenceUnavailable: string;
  readonly boundedSequences: (shown: number, total: number) => string;
  readonly tieAction: string;
  readonly diagnostics: string;
}

interface AvailableHorizonsPreviewV3 {
  readonly availability: "available";
  readonly context: ModelScientificContextV3;
  /** Exact dataset row count used by source-order confirmation. */
  readonly rowCount: number;
  readonly units: readonly ExecutionIdentityEntryV3[];
  readonly horizons: readonly ExecutionIdentityEntryV3[];
  readonly observations: readonly {
    readonly unitToken: string;
    readonly horizonToken: string;
    readonly rowCount: number;
  }[];
  readonly resolvedOrder:
    | { readonly availability: "unavailable" }
    | {
        readonly availability: "available";
        readonly unitSequences: readonly {
          readonly unitToken: string;
          readonly steps: readonly {
            readonly horizonToken: string;
            readonly trajectoryOrdinal: number;
          }[];
        }[];
      };
}

export type OpenEnaHorizonsPreviewV3 = AvailableHorizonsPreviewV3 | {
  readonly availability: "unavailable";
  readonly context?: ModelScientificContextV3;
};

export interface ModelUiHorizonDiagnosticLocalizationInputV3 {
  readonly id: string;
  readonly severity: ModelDiagnosticV3["severity"];
  readonly scope: ModelDiagnosticV3["scope"];
  readonly fieldPath?: string;
  readonly evidence?: {
    readonly totalCount: number;
    readonly sampleLimit: number;
    readonly truncated: boolean;
  };
}

export interface OpenEnaHorizonsPanelV3Props {
  readonly copy: OpenEnaHorizonsPanelV3Copy;
  readonly orderCopy: OpenEnaOrderPolicyEditorV3Copy;
  readonly state: ModelStateV3;
  readonly fields: OpenEnaModelPanelFieldsV3;
  readonly columnOptions: readonly string[];
  readonly preview: OpenEnaHorizonsPreviewV3;
  readonly diagnostics: readonly ModelDiagnosticV3[];
  readonly localizeDiagnostic: (diagnostic: ModelUiHorizonDiagnosticLocalizationInputV3) => {
    readonly summary: string;
    readonly detail: string;
  };
  readonly orderRawState: OrderPolicyEditorRawStateV3;
  readonly onOrderRawStateChange: (value: OrderPolicyEditorRawStateV3) => void;
  /** Durable owner aggregates this field with every other active raw blocker. */
  readonly onOrderBlockedChange: (blocked: boolean) => void;
  readonly dispatch: (action: ModelStateActionV3) => void;
  readonly now?: () => Date;
}

function sameContext(left: ModelScientificContextV3, right: ModelScientificContextV3): boolean {
  return left.datasetSha256 === right.datasetSha256
    && left.family === right.family
    && left.scientificRevision === right.scientificRevision
    && left.draftFingerprint === right.draftFingerprint
    && left.executionEpoch === right.executionEpoch;
}

function localizationInput(diagnostic: ModelDiagnosticV3): ModelUiHorizonDiagnosticLocalizationInputV3 {
  return {
    id: diagnostic.id,
    severity: diagnostic.severity,
    scope: diagnostic.scope,
    ...(diagnostic.fieldPath === undefined ? {} : { fieldPath: diagnostic.fieldPath }),
    ...(diagnostic.evidence === undefined ? {} : {
      evidence: {
        totalCount: diagnostic.evidence.totalCount,
        sampleLimit: diagnostic.evidence.sampleLimit,
        truncated: diagnostic.evidence.truncated,
      },
    }),
  };
}

export function OpenEnaHorizonsPanelV3({
  copy,
  orderCopy,
  state,
  fields,
  columnOptions,
  preview,
  diagnostics,
  localizeDiagnostic,
  orderRawState,
  onOrderRawStateChange,
  onOrderBlockedChange,
  dispatch,
  now,
}: OpenEnaHorizonsPanelV3Props) {
  const scientificContext = modelScientificContextV3(state);
  const activePreview = preview.availability === "available"
    && sameContext(preview.context, scientificContext)
    ? preview
    : null;
  const family = state.drafts.activeFamily;
  const draft = state.drafts[family];
  const trajectoryOrderActive = family === "standard" && state.drafts.standard.model !== "EndPoint";
  const horizonDiagnostics = diagnostics.filter((diagnostic) => diagnostic.scope === "horizons");
  const hasTie = horizonDiagnostics.some((diagnostic) => diagnostic.id === "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE");

  useEffect(() => {
    if (!trajectoryOrderActive) onOrderBlockedChange(false);
  }, [trajectoryOrderActive, onOrderBlockedChange]);

  const unitLabels = new Map(activePreview?.units.map((entry) => [entry.token, entry.displayLabel]));
  const horizonLabels = new Map(activePreview?.horizons.map((entry) => [entry.token, entry.displayLabel]));
  const observations = activePreview?.observations ?? [];
  const shownObservations = observations.slice(0, MAX_STRUCTURE_ROWS);
  const unitsByHorizon = new Map<string, Set<string>>();
  for (const observation of observations) {
    const units = unitsByHorizon.get(observation.horizonToken) ?? new Set<string>();
    units.add(observation.unitToken);
    unitsByHorizon.set(observation.horizonToken, units);
  }
  const sharedCount = [...unitsByHorizon.values()].filter((units) => units.size > 1).length;
  const singleRowCount = observations.filter((observation) => observation.rowCount === 1).length;
  const rowCounts = observations.map((observation) => observation.rowCount);
  const minimumRows = rowCounts.length > 0 ? Math.min(...rowCounts) : null;
  const maximumRows = rowCounts.length > 0 ? Math.max(...rowCounts) : null;

  function replaceHorizonColumns(horizonColumns: string[]): void {
    dispatch(family === "standard"
      ? { type: "replace-standard-draft", draft: { ...state.drafts.standard, horizonColumns } }
      : { type: "replace-ona-draft", draft: { ...state.drafts.ona, horizonColumns } });
  }

  function replaceHorizonOrder(horizonOrder: typeof state.drafts.standard.horizonOrder): void {
    dispatch({
      type: "replace-standard-draft",
      draft: { ...state.drafts.standard, horizonOrder },
    });
  }

  function openTieBreakerEditor(): void {
    document.getElementById(fields.id("horizonOrder"))?.focus();
    onOrderRawStateChange({
      mode: "columns",
      rows: [...orderRawState.rows, createEmptyOrderKeyRawV3()],
    });
    replaceHorizonOrder(null);
  }

  const sequences = activePreview?.resolvedOrder.availability === "available"
    ? activePreview.resolvedOrder.unitSequences
    : null;
  const shownSequences = sequences?.slice(0, MAX_SEQUENCE_UNITS) ?? [];
  const relevantColumns = family === "standard"
    ? [...new Set([...state.drafts.standard.unitColumns, ...state.drafts.standard.horizonColumns])]
    : [];

  return (
    <section className="ena-model-horizons-v3" data-testid="open-ena-model-v3-horizons-panel">
      <OpenEnaOfficialFieldPathEditor
        label={copy.horizonIdentity}
        selectedFields={draft.horizonColumns}
        options={columnOptions}
        fieldId={fields.id("horizonColumns")}
        emptyLabel={copy.horizonPickerEmpty}
        addRemoveLabel={copy.addRemoveFields}
        removeLabel={copy.removeField}
        onChange={replaceHorizonColumns}
      />

      <section aria-label={copy.counts} className="ena-model-horizons-v3-counts">
        {activePreview === null ? <p>{copy.unavailable}</p> : (
          <>
            <p>{copy.unitCount(activePreview.units.length)}</p>
            <p>{copy.horizonCount(activePreview.horizons.length)}</p>
            <p>{copy.observationCount(observations.length)}</p>
          </>
        )}
      </section>

      <section aria-label={copy.structure} className="ena-model-horizons-v3-structure">
        {activePreview === null ? <p>{copy.unavailable}</p> : (
          <>
            <p>{sharedCount > 0 ? copy.sharedHorizons(sharedCount) : copy.noSharedHorizons}</p>
            <p>{copy.singleRowObservations(singleRowCount)}</p>
            {minimumRows !== null && maximumRows !== null
              ? <p>{copy.extremeObservations(minimumRows, maximumRows)}</p>
              : null}
            <p>{copy.boundedRows(shownObservations.length, observations.length)}</p>
            <table>
              <thead><tr><th>{copy.structureColumns.unit}</th><th>{copy.structureColumns.horizon}</th><th>{copy.structureColumns.rows}</th></tr></thead>
              <tbody>{shownObservations.map((observation, index) => (
                <tr key={`${observation.unitToken}:${observation.horizonToken}:${index}`}>
                  <td>{unitLabels.get(observation.unitToken) ?? copy.unavailable}</td>
                  <td>{horizonLabels.get(observation.horizonToken) ?? copy.unavailable}</td>
                  <td>{observation.rowCount}</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
      </section>

      {family === "ona" ? <p>{copy.onaOrderNotApplicable}</p> : trajectoryOrderActive ? (
        <>
          <OpenEnaOrderPolicyEditorV3
            label={copy.trajectoryOrder}
            fieldId={fields.id("horizonOrder")}
            copy={orderCopy}
            value={state.drafts.standard.horizonOrder}
            rawState={orderRawState}
            columnOptions={columnOptions}
            confirmationContext={activePreview === null ? null : {
              scientificContext,
              rowCount: activePreview.rowCount,
              relevantColumns,
            }}
            onChange={replaceHorizonOrder}
            onRawStateChange={onOrderRawStateChange}
            onBlockedChange={onOrderBlockedChange}
            now={now}
          />
          <section aria-label={copy.sequences} className="ena-model-horizons-v3-sequences">
            {sequences === null ? <p>{copy.sequenceUnavailable}</p> : (
              <>
                <p>{copy.boundedSequences(shownSequences.length, sequences.length)}</p>
                <ol>{shownSequences.map((sequence) => {
                  const shownSteps = sequence.steps.slice(0, MAX_SEQUENCE_STEPS);
                  const labels = shownSteps.map((step) => horizonLabels.get(step.horizonToken) ?? copy.unavailable);
                  if (shownSteps.length < sequence.steps.length) labels.push("…");
                  return <li key={sequence.unitToken}>{copy.sequence(unitLabels.get(sequence.unitToken) ?? copy.unavailable, labels.join(" → "))}</li>;
                })}</ol>
              </>
            )}
          </section>
        </>
      ) : <p>{copy.horizonOrderNotApplicable}</p>}

      {horizonDiagnostics.length > 0 ? (
        <section aria-label={copy.diagnostics}>
          {horizonDiagnostics.map((diagnostic, index) => {
            const localized = localizeDiagnostic(localizationInput(diagnostic));
            return <article key={`${diagnostic.id}:${index}`} data-diagnostic-id={diagnostic.id}>
              <h4>{localized.summary}</h4><p>{localized.detail}</p>
            </article>;
          })}
          {hasTie && trajectoryOrderActive ? (
            <button type="button" onClick={openTieBreakerEditor}>
              {copy.tieAction}
            </button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export default OpenEnaHorizonsPanelV3;
