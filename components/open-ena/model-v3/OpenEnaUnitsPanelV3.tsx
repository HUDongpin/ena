"use client";

import { useId, useState } from "react";
import OpenEnaGroupDisplayControls, {
  type GroupDisclosureCommandV3,
  type OpenEnaGroupDisplayControlGroup,
} from "../OpenEnaGroupDisplayControls";
import {
  OpenEnaOfficialFieldPathEditor,
  OpenEnaOfficialIconButton,
} from "../OpenEnaOfficialModelControls";
import type { OpenEnaGroupDisplayCopy } from "../../../lib/open-ena-i18n";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";
import type {
  ModelDiagnosticV3,
} from "../../../lib/open-ena/model-v3/diagnostics";
import type { ExecutionIdentityEntryV3 } from "../../../lib/open-ena/model-v3/identity";
import type { OnaCompilerDiagnosticV3 } from "../../../lib/open-ena/model-v3/ona-compiler-preflight";
import type {
  ScalarIdentityV3,
} from "../../../lib/open-ena/model-v3/types";
import {
  OPEN_ENA_MODEL_FIELD_PATHS_V3,
  type ModelUiDiagnosticLocalizationInputV3,
} from "./OpenEnaModelDiagnosticsV3";
import type { OpenEnaModelPanelFieldsV3 } from "./OpenEnaModelTabsV3";
import {
  modelScientificContextV3,
  type ModelScientificContextV3,
  type ModelStateActionV3,
  type ModelStateV3,
} from "./model-state";

type UnitsDiagnosticV3 = ModelDiagnosticV3 | OnaCompilerDiagnosticV3;

export interface OpenEnaUnitsPanelV3Copy {
  readonly units: string;
  readonly unitPickerEmpty: string;
  readonly addRemoveFields: (label: string) => string;
  readonly removeField: (field: string, label: string) => string;
  readonly counts: string;
  readonly unitCount: (count: number) => string;
  readonly groupCount: (count: number) => string;
  readonly unavailable: string;
  readonly groupStability: string;
  readonly stableGroup: string;
  readonly unstableGroup: string;
  readonly group: string;
  readonly noGroup: string;
  readonly unavailableGroupField: (field: string) => string;
  readonly means: string;
  readonly negativeLevel: string;
  readonly positiveLevel: string;
  readonly noMeansLevel: string;
  readonly unavailableMeansLevel: (typedLabel: string) => string;
  readonly meansDirection: (negative: string, positive: string) => string;
  readonly meansUnavailable: string;
  readonly meansInvalid: string;
  readonly groupToolbar: string;
  readonly collapseGroups: string;
  readonly openGroupOptions: string;
  readonly groupOptionsUnavailable: string;
  readonly hideGroups: string;
  readonly restoreGroups: string;
  readonly excludeGroup: string;
  readonly hideUnavailable: string;
  readonly excludeUnavailable: string;
  readonly undoGroupExclusion: string;
  readonly groupExcluded: string;
  readonly currentDraftGroups: string;
  readonly retainedPlotGroups: string;
  readonly stalePlotGroups: string;
  readonly noPlotGroups: string;
  readonly diagnosticLabel: string;
}

interface AvailableUnitsPreviewV3 {
  readonly availability: "available";
  /** Preview evidence only. It carries no compiler Ready or execution authority. */
  readonly context: ModelScientificContextV3;
  readonly units: readonly ExecutionIdentityEntryV3[];
  readonly groups: readonly ExecutionIdentityEntryV3[];
  readonly unitGroups: readonly {
    readonly unitToken: string;
    readonly groupToken: string | null;
  }[];
  readonly groupStability:
    | { readonly availability: "available"; readonly status: "stable" | "unstable" }
    | { readonly availability: "unavailable" };
}

export type OpenEnaUnitsPreviewV3 = AvailableUnitsPreviewV3 | {
  readonly availability: "unavailable";
  readonly context?: ModelScientificContextV3;
};

export interface OpenEnaUnitsPanelV3Props {
  readonly copy: OpenEnaUnitsPanelV3Copy;
  readonly applicabilityCopy?: OpenEnaGroupDisplayApplicabilityCopyV3;
  readonly groupDisplayCopy: OpenEnaGroupDisplayCopy;
  readonly state: ModelStateV3;
  readonly fields: OpenEnaModelPanelFieldsV3;
  readonly columnOptions: readonly string[];
  readonly preview: OpenEnaUnitsPreviewV3;
  readonly diagnostics: readonly UnitsDiagnosticV3[];
  readonly localizeDiagnostic: (diagnostic: ModelUiDiagnosticLocalizationInputV3) => {
    readonly summary: string;
    readonly detail: string;
  };
  readonly view: "2d" | "3d";
  readonly hiddenUnitKeys: readonly string[];
  readonly presetHiddenGroupTokens?: readonly string[];
  readonly dispatch: (action: ModelStateActionV3) => void;
  readonly onUnitVisibilityChange: (
    groupToken: string,
    unitToken: string,
    visible: boolean,
  ) => void;
  readonly onRevealAllHidden: () => void;
}

/** Scoped integration copy; full catalog translation remains Task32-owned. */
export const GROUP_DISPLAY_APPLICABILITY_COPY_V3 = {
  preset: "A presentation preset hides this Group. Clear preset Group hiding to use these saved controls; individual Unit preferences are retained.",
  global: "All Groups are hidden. Restore Group visibility to use these saved controls; individual Unit preferences are retained.",
  trajectoryIntervals: "Native trajectory display summaries do not provide confidence or outlier intervals. These saved interval preferences do not apply to this view.",
} as const;

export interface OpenEnaGroupDisplayApplicabilityCopyV3 {
  readonly preset: string;
  readonly global: string;
  readonly trajectoryIntervals: string;
}

const GROUP_COLORS = [
  "#cc423a",
  "#218ebf",
  "#56b09d",
  "#8554a3",
  "#bf7a21",
  "#4d4d4d",
] as const;

function sameContext(left: ModelScientificContextV3, right: ModelScientificContextV3): boolean {
  return left.datasetSha256 === right.datasetSha256
    && left.family === right.family
    && left.scientificRevision === right.scientificRevision
    && left.draftFingerprint === right.draftFingerprint
    && left.executionEpoch === right.executionEpoch;
}

function scalarKey(value: ScalarIdentityV3 | null): string | null {
  return value === null ? null : canonicalJsonV3(value);
}

function typedScalarLabel(value: ScalarIdentityV3): string {
  return `[${value.type}] ${canonicalJsonV3(value.value)}`;
}

function localizationInput(diagnostic: UnitsDiagnosticV3): ModelUiDiagnosticLocalizationInputV3 {
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

function validUndo(state: ModelStateV3): boolean {
  const undo = state.undo;
  const family = state.drafts.activeFamily;
  return undo?.action === "exclude-group-configuration"
    && undo.datasetSha256 === state.datasetSha256
    && undo.family === family
    && undo.resultingDraftFingerprint
      === `model-draft-json-v3:${canonicalJsonV3(state.drafts[family])}`;
}

function resultGroups(state: ModelStateV3): OpenEnaGroupDisplayControlGroup[] {
  const family = state.drafts.activeFamily;
  const result = state.result;
  if (result === null
    || result.binding.datasetSha256 !== state.datasetSha256
    || result.configuration.analysisFamily !== family) return [];

  const dictionary = result.executionProvenance.identityDictionary;
  const unitLabels = new Map(dictionary.units.map((unit) => [unit.token, unit.displayLabel]));
  const unitsByGroup = new Map<string, string[]>();
  for (const binding of result.executionProvenance.unitGroups) {
    if (binding.groupToken === null || !unitLabels.has(binding.unitToken)) continue;
    const units = unitsByGroup.get(binding.groupToken) ?? [];
    units.push(binding.unitToken);
    unitsByGroup.set(binding.groupToken, units);
  }
  return dictionary.groups.map((group, index) => {
    const unitIds = unitsByGroup.get(group.token) ?? [];
    return {
      id: group.token,
      name: group.displayLabel,
      label: group.displayLabel,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      unitIds,
      unitLabelsById: Object.fromEntries(unitIds.map((unitId) => [
        unitId,
        unitLabels.get(unitId) ?? unitId,
      ])),
    };
  });
}

function isGroupDiagnostic(diagnostic: UnitsDiagnosticV3): boolean {
  return diagnostic.id === "STANDARD_GROUP_FIELD_MISSING"
    || diagnostic.id === "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT"
    || diagnostic.id === "STANDARD_MEANS_GROUP_REQUIRED"
    || diagnostic.id === "STANDARD_MEANS_LEVEL_REQUIRED"
    || diagnostic.id === "STANDARD_MEANS_LEVEL_EMPTY"
    || diagnostic.id === "STANDARD_MEANS_IDENTICAL"
    || diagnostic.id === "ONA_GROUP_UNSTABLE";
}

export function OpenEnaUnitsPanelV3({
  copy,
  applicabilityCopy = GROUP_DISPLAY_APPLICABILITY_COPY_V3,
  groupDisplayCopy,
  state,
  fields,
  columnOptions,
  preview,
  diagnostics,
  localizeDiagnostic,
  view,
  hiddenUnitKeys,
  presetHiddenGroupTokens = [],
  dispatch,
  onUnitVisibilityChange,
  onRevealAllHidden,
}: OpenEnaUnitsPanelV3Props) {
  const [disclosureCommand, setDisclosureCommand] = useState<GroupDisclosureCommandV3>();
  const reasonBaseId = useId();
  const scientificContext = modelScientificContextV3(state);
  const activePreview = preview.availability === "available"
    && sameContext(preview.context, scientificContext)
    ? preview
    : null;
  const family = state.drafts.activeFamily;
  const draft = state.drafts[family];
  const display = state.display[family];
  const plotGroups = resultGroups(state);
  const presetSuppressed = new Set(presetHiddenGroupTokens);
  const suppressedGroups = Object.fromEntries(plotGroups.flatMap((group) => {
    const reasons = [display.allGroupsSuppressed ? applicabilityCopy.global : "",
      presetSuppressed.has(group.id ?? group.name) ? applicabilityCopy.preset : ""].filter(Boolean);
    return reasons.length ? [[group.id ?? group.name, reasons.join(" ")]] : [];
  }));
  const trajectoryIntervalsUnavailable = state.result?.configuration.analysisFamily === "standard"
    && state.result.configuration.analysis.model.type !== "EndPoint";
  const canHideGroups = plotGroups.length > 0;
  const canExcludeGroup = draft.groupColumn !== null;
  const canUndoGroup = validUndo(state);
  const groupDiagnostics = diagnostics.filter(isGroupDiagnostic);
  const meansRotation = family === "standard" && state.drafts.standard.rotation.type === "means"
    ? state.drafts.standard.rotation
    : null;
  const groupLevels = (activePreview?.groups ?? []).filter((group) => (
    draft.groupColumn !== null
    && group.fields.length === 1
    && group.fields[0].column === draft.groupColumn
  ));
  const labelsByScalar = new Map(groupLevels.flatMap((group) => (
    group.fields.length === 1
      ? [[scalarKey(group.fields[0].value), group.displayLabel] as const]
      : []
  )));
  const negativeKey = scalarKey(meansRotation?.negativeLevel ?? null);
  const positiveKey = scalarKey(meansRotation?.positiveLevel ?? null);
  const negativeLabel = negativeKey === null
    ? null
    : labelsByScalar.get(negativeKey)
      ?? (meansRotation?.negativeLevel ? typedScalarLabel(meansRotation.negativeLevel) : null);
  const positiveLabel = positiveKey === null
    ? null
    : labelsByScalar.get(positiveKey)
      ?? (meansRotation?.positiveLevel ? typedScalarLabel(meansRotation.positiveLevel) : null);
  const negativeToken = groupLevels.find((group) => scalarKey(group.fields[0]?.value ?? null) === negativeKey)?.token;
  const positiveToken = groupLevels.find((group) => scalarKey(group.fields[0]?.value ?? null) === positiveKey)?.token;
  const negativeSelectValue = negativeKey === null ? "" : negativeToken ?? "retained-negative";
  const positiveSelectValue = positiveKey === null ? "" : positiveToken ?? "retained-positive";
  const stableGroupPreview = activePreview?.groupStability.availability === "available"
    && activePreview.groupStability.status === "stable";
  const meansEditingDisabled = !stableGroupPreview || groupLevels.length === 0;
  const meansInvalid = meansRotation !== null && (
    draft.groupColumn === null
    || negativeKey === null
    || positiveKey === null
    || negativeKey === positiveKey
    || activePreview?.groupStability.availability === "available"
      && activePreview.groupStability.status === "unstable"
    || activePreview !== null && negativeKey !== null && negativeToken === undefined
    || activePreview !== null && positiveKey !== null && positiveToken === undefined
  );
  const hideReasonId = `${reasonBaseId}-hide`;
  const excludeReasonId = `${reasonBaseId}-exclude`;
  const meansUnavailableReasonId = `${reasonBaseId}-means-unavailable`;

  function replaceUnitColumns(unitColumns: string[]) {
    dispatch(family === "standard"
      ? { type: "replace-standard-draft", draft: { ...state.drafts.standard, unitColumns } }
      : { type: "replace-ona-draft", draft: { ...state.drafts.ona, unitColumns } });
  }

  function replaceGroupColumn(groupColumn: string | null) {
    dispatch(family === "standard"
      ? { type: "replace-standard-draft", draft: { ...state.drafts.standard, groupColumn } }
      : { type: "replace-ona-draft", draft: { ...state.drafts.ona, groupColumn } });
  }

  function replaceMeansLevel(kind: "negativeLevel" | "positiveLevel", token: string) {
    if (meansRotation === null) return;
    const selected = token === ""
      ? null
      : groupLevels.find((group) => group.token === token)?.fields[0]?.value ?? null;
    dispatch({
      type: "replace-standard-draft",
      draft: {
        ...state.drafts.standard,
        rotation: { ...meansRotation, [kind]: selected },
      },
    });
  }

  function command(action: GroupDisclosureCommandV3["action"]) {
    setDisclosureCommand((current) => ({ revision: (current?.revision ?? 0) + 1, action }));
  }

  return (
    <section className="ena-model-units-v3" data-testid="open-ena-model-v3-units-panel">
      <OpenEnaOfficialFieldPathEditor
        label={copy.units}
        selectedFields={draft.unitColumns}
        options={columnOptions}
        fieldId={fields.id("unitColumns")}
        emptyLabel={copy.unitPickerEmpty}
        addRemoveLabel={copy.addRemoveFields}
        removeLabel={copy.removeField}
        onChange={replaceUnitColumns}
      />

      <section aria-label={copy.counts} className="ena-model-units-v3-counts">
        {activePreview === null ? <p>{copy.unavailable}</p> : (
          <>
            <p>{copy.unitCount(activePreview.units.length)}</p>
            <p>{copy.groupCount(activePreview.groups.length)}</p>
          </>
        )}
      </section>

      <label className="ena-model-units-v3-group-field">
        <span>{copy.group}</span>
        <select
          id={fields.id("groupColumn")}
          value={draft.groupColumn ?? ""}
          onChange={(event) => replaceGroupColumn(event.target.value || null)}
        >
          <option value="">{copy.noGroup}</option>
          {draft.groupColumn !== null && !columnOptions.includes(draft.groupColumn) ? (
            <option value={draft.groupColumn}>{copy.unavailableGroupField(draft.groupColumn)}</option>
          ) : null}
          {columnOptions.map((column) => <option key={column} value={column}>{column}</option>)}
        </select>
      </label>

      <section aria-label={copy.groupStability} className="ena-model-units-v3-stability">
        {activePreview?.groupStability.availability === "available"
          ? <p>{activePreview.groupStability.status === "stable" ? copy.stableGroup : copy.unstableGroup}</p>
          : <p>{copy.unavailable}</p>}
      </section>

      {activePreview !== null && activePreview.groups.length > 0 ? (
        <section aria-label={copy.currentDraftGroups}>
          <ul>{activePreview.groups.map((group) => (
            <li key={group.token}>{group.displayLabel}</li>
          ))}</ul>
        </section>
      ) : null}

      {meansRotation !== null ? (
        <fieldset
          id={fields.id(OPEN_ENA_MODEL_FIELD_PATHS_V3.meansContrast)}
          tabIndex={-1}
          className="ena-model-units-v3-means"
        >
          <legend>{copy.means}</legend>
          <label>
            <span>{copy.negativeLevel}</span>
            <select
              id={fields.id("rotation.negativeLevel")}
              value={negativeSelectValue}
              aria-describedby={meansEditingDisabled ? meansUnavailableReasonId : undefined}
              disabled={meansEditingDisabled}
              onChange={(event) => replaceMeansLevel("negativeLevel", event.target.value)}
            >
              <option value="">{copy.noMeansLevel}</option>
              {negativeKey !== null && negativeToken === undefined && negativeLabel !== null ? (
                <option value="retained-negative">{copy.unavailableMeansLevel(negativeLabel)}</option>
              ) : null}
              {groupLevels.map((group) => <option key={group.token} value={group.token}>{group.displayLabel}</option>)}
            </select>
          </label>
          <label>
            <span>{copy.positiveLevel}</span>
            <select
              id={fields.id("rotation.positiveLevel")}
              value={positiveSelectValue}
              aria-describedby={meansEditingDisabled ? meansUnavailableReasonId : undefined}
              disabled={meansEditingDisabled}
              onChange={(event) => replaceMeansLevel("positiveLevel", event.target.value)}
            >
              <option value="">{copy.noMeansLevel}</option>
              {positiveKey !== null && positiveToken === undefined && positiveLabel !== null ? (
                <option value="retained-positive">{copy.unavailableMeansLevel(positiveLabel)}</option>
              ) : null}
              {groupLevels.map((group) => <option key={group.token} value={group.token}>{group.displayLabel}</option>)}
            </select>
          </label>
          {negativeLabel !== null && positiveLabel !== null
            ? <p>{copy.meansDirection(negativeLabel, positiveLabel)}</p>
            : null}
          {meansEditingDisabled ? (
            <p id={meansUnavailableReasonId}>{copy.meansUnavailable}</p>
          ) : null}
          {meansInvalid ? <p role="alert">{copy.meansInvalid}</p> : null}
        </fieldset>
      ) : null}

      {groupDiagnostics.length > 0 ? (
        <section aria-label={copy.diagnosticLabel}>
          {groupDiagnostics.map((diagnostic, index) => {
            const localized = localizeDiagnostic(localizationInput(diagnostic));
            return (
              <article key={`${diagnostic.id}:${index}`} data-diagnostic-id={diagnostic.id}>
                <h4>{localized.summary}</h4>
                <p>{localized.detail}</p>
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="ena-model-toolbar" role="toolbar" aria-label={copy.groupToolbar}>
        <OpenEnaOfficialIconButton
          icon="collapse"
          ariaLabel={copy.collapseGroups}
          title={canHideGroups ? copy.collapseGroups : copy.groupOptionsUnavailable}
          describedBy={!canHideGroups ? hideReasonId : undefined}
          disabled={!canHideGroups}
          onClick={() => command("collapse-all")}
        />
        <OpenEnaOfficialIconButton
          icon="mean"
          ariaLabel={copy.openGroupOptions}
          title={canHideGroups ? copy.openGroupOptions : copy.groupOptionsUnavailable}
          describedBy={!canHideGroups ? hideReasonId : undefined}
          disabled={!canHideGroups}
          onClick={() => command("open-all-options")}
        />
        <OpenEnaOfficialIconButton
          icon={display.allGroupsSuppressed ? "show" : "visibility"}
          ariaLabel={display.allGroupsSuppressed ? copy.restoreGroups : copy.hideGroups}
          title={display.allGroupsSuppressed ? copy.restoreGroups : copy.hideGroups}
          ariaPressed={display.allGroupsSuppressed}
          describedBy={!canHideGroups ? hideReasonId : undefined}
          disabled={!canHideGroups}
          onClick={() => dispatch({
            type: display.allGroupsSuppressed
              ? "restore-group-visibility"
              : "hide-all-groups",
          })}
        />
        <OpenEnaOfficialIconButton
          icon="exclude"
          ariaLabel={copy.excludeGroup}
          title={canExcludeGroup ? copy.excludeGroup : copy.excludeUnavailable}
          describedBy={!canExcludeGroup ? excludeReasonId : undefined}
          disabled={!canExcludeGroup}
          onClick={() => dispatch({ type: "exclude-group-configuration" })}
        />
      </div>
      {!canHideGroups ? <p id={hideReasonId}>{copy.hideUnavailable}</p> : null}
      {!canExcludeGroup ? <p id={excludeReasonId}>{copy.excludeUnavailable}</p> : null}
      {canUndoGroup ? (
        <p role="status">
          {copy.groupExcluded}{" "}
          <button type="button" onClick={() => dispatch({ type: "undo-model-edit" })}>
            {copy.undoGroupExclusion}
          </button>
        </p>
      ) : null}

      <section aria-label={copy.retainedPlotGroups}>
        {plotGroups.length === 0 ? <p>{copy.noPlotGroups}</p> : (
          <>
            {state.resultStatus === "stale" ? <p>{copy.stalePlotGroups}</p> : null}
            <OpenEnaGroupDisplayControls
              groups={plotGroups}
              settingsByGroup={display.groups}
              suppressedGroups={suppressedGroups}
              intervalsUnavailableReason={trajectoryIntervalsUnavailable ? applicabilityCopy.trajectoryIntervals : undefined}
              hiddenUnitKeys={hiddenUnitKeys}
              view={view}
              copy={groupDisplayCopy}
              disclosureCommand={disclosureCommand}
              onSettingsChange={(groupToken, patch) => dispatch({
                type: "set-group-display",
                groupToken,
                patch,
              })}
              onUnitVisibilityChange={onUnitVisibilityChange}
              onRevealAllHidden={onRevealAllHidden}
            />
          </>
        )}
      </section>
    </section>
  );
}

export default OpenEnaUnitsPanelV3;
