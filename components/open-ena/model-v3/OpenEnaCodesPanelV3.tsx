"use client";

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  OpenEnaAnalysisFamilyControl,
  type OpenEnaAnalysisFamilyControlCopy,
} from "../OpenEnaAnalysisFamilyControl";
import { OpenEnaOfficialIconButton } from "../OpenEnaOfficialModelControls";
import { codeColorFor } from "../../../lib/open-ena/plot-style";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";
import {
  profileCodeColumnValuesV3,
  type CodeValueRepresentationV3,
} from "../../../lib/open-ena/model-v3/code-profile";
import type { ModelDiagnosticV3 } from "../../../lib/open-ena/model-v3/diagnostics";
import type { OnaCompilerDiagnosticV3 } from "../../../lib/open-ena/model-v3/ona-compiler-preflight";
import type { ParsedDataset } from "../../../lib/open-ena/types";
import {
  modelScientificContextV3,
  type ModelScientificContextV3,
  type ModelStateActionV3,
  type ModelStateV3,
} from "./model-state";
import type { OpenEnaModelPanelFieldsV3 } from "./OpenEnaModelTabsV3";

type CodeDiagnosticV3 = ModelDiagnosticV3 | OnaCompilerDiagnosticV3;

export type CodeFieldIncompatibilityReasonV3 =
  | "missing"
  | "active-role"
  | "binary-values"
  | "frequency-values"
  | "duplicate-selection";

export type OpenEnaCodeProfileViewV3 =
  | {
      readonly availability: "available";
      readonly representation: CodeValueRepresentationV3;
      readonly positiveCount: number;
    }
  | { readonly availability: "unavailable" };

export interface OpenEnaCodeFieldPreviewV3 {
  readonly column: string;
  readonly profile: OpenEnaCodeProfileViewV3;
  readonly incompatibilityReasons: readonly CodeFieldIncompatibilityReasonV3[];
  readonly diagnostics: readonly CodeDiagnosticV3[];
}

export type OpenEnaCodesPreviewV3 =
  | {
      readonly availability: "available";
      readonly context: ModelScientificContextV3;
      readonly fields: readonly OpenEnaCodeFieldPreviewV3[];
      readonly diagnosticAvailability: "available" | "unavailable";
      readonly diagnostics: readonly CodeDiagnosticV3[];
    }
  | {
      readonly availability: "unavailable";
      readonly context?: ModelScientificContextV3;
    };

export type OpenEnaCodesDiagnosticEvidenceV3 =
  | {
      readonly availability: "available";
      readonly context: ModelScientificContextV3;
      readonly diagnostics: readonly CodeDiagnosticV3[];
    }
  | {
      readonly availability: "unavailable";
      readonly context?: ModelScientificContextV3;
    };

export interface ModelUiCodeDiagnosticLocalizationInputV3 {
  readonly id: string;
  readonly severity: CodeDiagnosticV3["severity"];
  readonly scope: CodeDiagnosticV3["scope"];
  readonly fieldPath?: string;
  readonly evidence?: {
    readonly totalCount: number;
    readonly sampleLimit: number;
    readonly truncated: boolean;
  };
}

export interface OpenEnaCodesPanelV3Copy {
  readonly intro: string;
  readonly family: OpenEnaAnalysisFamilyControlCopy;
  readonly familyChanged: (family: "standard" | "ona") => string;
  readonly toolbar: string;
  readonly hideCodes: string;
  readonly restoreCodes: string;
  readonly excludeAllCodes: string;
  readonly hideUnavailable: string;
  readonly excludeUnavailable: string;
  readonly selectedCodes: string;
  readonly codeType: string;
  readonly positiveCountLabel: string;
  readonly profileTypes: Readonly<Record<CodeValueRepresentationV3, string>>;
  readonly positiveCount: (count: number) => string;
  readonly unavailable: string;
  readonly diagnostics: string;
  readonly diagnosticsUnavailable: string;
  readonly chooseColor: (code: string) => string;
  readonly hideCode: (code: string) => string;
  readonly showCode: (code: string) => string;
  readonly excludeCode: (code: string) => string;
  readonly reorderCode: (code: string) => string;
  readonly reorderInstructions: string;
  readonly moveUnavailable: string;
  readonly displayActionUnavailable: string;
  readonly restoreBeforeCodeVisibility: string;
  readonly manageCodes: string;
  readonly closeManager: string;
  readonly managerTitle: string;
  readonly managerInstructions: string;
  readonly addCode: (code: string) => string;
  readonly incompatibilityReason: Readonly<
    Record<CodeFieldIncompatibilityReasonV3, string>
  >;
  readonly noCodesTitle: string;
  readonly minimumThreeCodes: string;
  readonly otherSettingsPreserved: string;
  readonly undo: string;
}

export interface OpenEnaCodesPanelV3Props {
  readonly state: ModelStateV3;
  readonly copy: OpenEnaCodesPanelV3Copy;
  readonly fields: OpenEnaModelPanelFieldsV3;
  readonly preview: OpenEnaCodesPreviewV3;
  readonly dispatch: (action: ModelStateActionV3) => void;
  readonly onChooseCodeColor: (code: string) => void;
  readonly localizeDiagnostic: (
    diagnostic: ModelUiCodeDiagnosticLocalizationInputV3,
  ) => { readonly summary: string; readonly detail: string };
}

function sameContext(
  left: ModelScientificContextV3,
  right: ModelScientificContextV3,
): boolean {
  return (
    left.datasetSha256 === right.datasetSha256 &&
    left.family === right.family &&
    left.scientificRevision === right.scientificRevision &&
    left.draftFingerprint === right.draftFingerprint &&
    left.executionEpoch === right.executionEpoch
  );
}

function activeRoleColumns(state: ModelStateV3): Set<string> {
  const family = state.drafts.activeFamily;
  const draft = family === "ona" ? state.drafts.ona : state.drafts.standard;
  const columns = new Set<string>([
    ...draft.unitColumns,
    ...draft.horizonColumns,
    ...(draft.groupColumn === null ? [] : [draft.groupColumn]),
  ]);
  if (family === "ona") {
    const ona = state.drafts.ona;
    if (ona.rowOrder?.kind === "columns") {
      for (const key of ona.rowOrder.keys) columns.add(key.column);
    }
    return columns;
  }
  const standard = state.drafts.standard;
  if (
    standard.windowType === "MovingStanzaWindow" &&
    standard.movingStanza.rowOrder?.kind === "columns"
  ) {
    for (const key of standard.movingStanza.rowOrder.keys)
      columns.add(key.column);
  }
  if (
    standard.model !== "EndPoint" &&
    standard.horizonOrder?.kind === "columns"
  ) {
    for (const key of standard.horizonOrder.keys) columns.add(key.column);
  }
  return columns;
}

function diagnosticColumns(diagnostic: CodeDiagnosticV3): string[] {
  const direct = diagnostic.fieldPath?.startsWith("codes.")
    ? [diagnostic.fieldPath.slice("codes.".length)]
    : [];
  const fromEvidence =
    diagnostic.evidence?.samples.flatMap((sample) =>
      "codeColumn" in sample && typeof sample.codeColumn === "string"
        ? [sample.codeColumn]
        : [],
    ) ?? [];
  return [...new Set([...direct, ...fromEvidence])];
}

/**
 * Builds a view from one current dataset/state/compiler invocation. The caller
 * retains custody of the dataset hash and must discard this view on any context
 * change; the component independently checks that binding before displaying it.
 */
export function createOpenEnaCodesPreviewV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  state: ModelStateV3,
  diagnosticEvidence: OpenEnaCodesDiagnosticEvidenceV3,
): OpenEnaCodesPreviewV3 {
  const context = modelScientificContextV3(state);
  if (datasetSha256 !== state.datasetSha256) {
    return { availability: "unavailable", context };
  }
  const draft = state.drafts[state.drafts.activeFamily];
  const weighting =
    state.drafts.activeFamily === "standard"
      ? state.drafts.standard.weighting
      : "frequency";
  const headers = [...dataset.headers];
  const headerSet = new Set(headers);
  const selectedCount = new Map<string, number>();
  for (const code of draft.codes) {
    selectedCount.set(code, (selectedCount.get(code) ?? 0) + 1);
  }
  const columns = [...headers];
  for (const code of draft.codes) {
    if (!headerSet.has(code)) columns.push(code);
  }
  const roles = activeRoleColumns(state);
  const diagnosticPrefix =
    state.drafts.activeFamily === "standard" ? "STANDARD_" : "ONA_";
  const diagnosticEvidenceCurrent =
    diagnosticEvidence.availability === "available" &&
    sameContext(diagnosticEvidence.context, context);
  const codeDiagnostics = diagnosticEvidenceCurrent
    ? diagnosticEvidence.diagnostics.filter(
        (diagnostic) =>
          diagnostic.scope === "codes" &&
          diagnostic.id.startsWith(diagnosticPrefix),
      )
    : [];
  const fields = [...new Set(columns)].map(
    (column): OpenEnaCodeFieldPreviewV3 => {
      const reasons: CodeFieldIncompatibilityReasonV3[] = [];
      if (!headerSet.has(column)) reasons.push("missing");
      if (roles.has(column)) reasons.push("active-role");
      const profiled = headerSet.has(column)
        ? profileCodeColumnValuesV3(
            dataset.rows as Array<Record<string, unknown>>,
            column,
            weighting,
          )
        : null;
      if (profiled?.status === "invalid") {
        reasons.push(
          weighting === "binary" ? "binary-values" : "frequency-values",
        );
      }
      if ((selectedCount.get(column) ?? 0) > 1)
        reasons.push("duplicate-selection");
      const profile: OpenEnaCodeProfileViewV3 =
        profiled?.status === "valid" &&
        profiled.representation !== null &&
        dataset.rows.length > 0
          ? {
              availability: "available",
              representation: profiled.representation,
              positiveCount: profiled.positiveCount,
            }
          : { availability: "unavailable" };
      return {
        column,
        profile,
        incompatibilityReasons: reasons,
        diagnostics: codeDiagnostics.filter((diagnostic) =>
          diagnosticColumns(diagnostic).includes(column),
        ),
      };
    },
  );
  return {
    availability: "available",
    context,
    fields,
    diagnosticAvailability: diagnosticEvidenceCurrent
      ? "available"
      : "unavailable",
    diagnostics: codeDiagnostics,
  };
}

function localizationInput(
  diagnostic: CodeDiagnosticV3,
): ModelUiCodeDiagnosticLocalizationInputV3 {
  return {
    id: diagnostic.id,
    severity: diagnostic.severity,
    scope: diagnostic.scope,
    ...(diagnostic.fieldPath === undefined
      ? {}
      : { fieldPath: diagnostic.fieldPath }),
    ...(diagnostic.evidence === undefined
      ? {}
      : {
          evidence: {
            totalCount: diagnostic.evidence.totalCount,
            sampleLimit: diagnostic.evidence.sampleLimit,
            truncated: diagnostic.evidence.truncated,
          },
        }),
  };
}

function canUndoCodeExclusion(state: ModelStateV3): boolean {
  const undo = state.undo;
  const family = state.drafts.activeFamily;
  return (
    (undo?.action === "exclude-all-codes" || undo?.action === "exclude-code") &&
    undo.datasetSha256 === state.datasetSha256 &&
    undo.family === family &&
    undo.resultingDraftFingerprint ===
      `model-draft-json-v3:${canonicalJsonV3(state.drafts[family])}`
  );
}

function diagnosticKey(diagnostic: CodeDiagnosticV3, index: number): string {
  return `${diagnostic.id}:${diagnostic.fieldPath ?? "global"}:${index}`;
}

export function OpenEnaCodesPanelV3({
  state,
  copy,
  fields,
  preview,
  dispatch,
  onChooseCodeColor,
  localizeDiagnostic,
}: OpenEnaCodesPanelV3Props) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const draggedCode = useRef<string | null>(null);
  const reasonId = useId();
  const managerId = useId();
  const scientificContext = modelScientificContextV3(state);
  const activePreview =
    preview.availability === "available" &&
    sameContext(preview.context, scientificContext)
      ? preview
      : null;
  const family = state.drafts.activeFamily;
  const draft = state.drafts[family];
  const display = state.display[family];
  const duplicateSelection = new Set(draft.codes).size !== draft.codes.length;
  const fieldByColumn = new Map(
    activePreview?.fields.map((field) => [field.column, field]),
  );
  const orderedCodes = duplicateSelection
    ? [...draft.codes]
    : [...display.codeOrder];
  const firstRowIndex = new Map<string, number>();
  orderedCodes.forEach((code, index) => {
    if (!firstRowIndex.has(code)) firstRowIndex.set(code, index);
  });
  const managerFields =
    activePreview?.fields ??
    [...new Set(draft.codes)].map(
      (column): OpenEnaCodeFieldPreviewV3 => ({
        column,
        profile: { availability: "unavailable" },
        incompatibilityReasons:
          draft.codes.filter((code) => code === column).length > 1
            ? ["duplicate-selection"]
            : [],
        diagnostics: [],
      }),
    );
  const undoAvailable = canUndoCodeExclusion(state);
  const hideReason =
    draft.codes.length === 0 ? `${reasonId}-hide-empty` : undefined;
  const excludeReason =
    draft.codes.length === 0 ? `${reasonId}-exclude-empty` : undefined;

  function changeFamily(next: "ena" | "ona"): void {
    const nextFamily = next === "ena" ? "standard" : "ona";
    if (nextFamily === family) return;
    dispatch({ type: "set-active-family", family: nextFamily });
    setAnnouncement(copy.familyChanged(nextFamily));
  }

  function setSelected(column: string, selected: boolean): void {
    if (selected)
      dispatch({ type: "set-codes", codes: [...draft.codes, column] });
    else dispatch({ type: "exclude-code", code: column });
    setAnnouncement(selected ? copy.addCode(column) : copy.excludeCode(column));
  }

  function moveCode(code: string, targetIndex: number): void {
    if (duplicateSelection) return;
    const currentIndex = orderedCodes.indexOf(code);
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= orderedCodes.length ||
      currentIndex === targetIndex
    )
      return;
    const next = [...orderedCodes];
    next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, code);
    dispatch({ type: "set-code-order", codes: next });
  }

  function handleReorderKey(
    code: string,
    index: number,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown"))
      return;
    event.preventDefault();
    moveCode(code, index + (event.key === "ArrowUp" ? -1 : 1));
  }

  function handleDrop(
    code: string,
    index: number,
    event: DragEvent<HTMLButtonElement>,
  ): void {
    event.preventDefault();
    const source = draggedCode.current;
    draggedCode.current = null;
    if (source !== null) moveCode(source, index);
  }

  function renderDiagnostics(diagnostics: readonly CodeDiagnosticV3[]) {
    return diagnostics.length === 0 ? null : (
      <section
        className="ena-model-codes-v3-diagnostics"
        aria-label={copy.diagnostics}
      >
        {diagnostics.map((diagnostic, index) => {
          const localized = localizeDiagnostic(localizationInput(diagnostic));
          return (
            <article
              data-severity={diagnostic.severity}
              key={diagnosticKey(diagnostic, index)}
            >
              <strong>{localized.summary}</strong>
              <p>{localized.detail}</p>
            </article>
          );
        })}
      </section>
    );
  }

  const fieldDiagnosticSet = new Set(
    activePreview?.fields.flatMap((field) => field.diagnostics) ?? [],
  );
  const globalDiagnostics =
    activePreview?.diagnostics.filter(
      (diagnostic) => !fieldDiagnosticSet.has(diagnostic),
    ) ?? [];

  return (
    <section
      className="ena-model-codes-v3 ena-official-model-panel"
      data-ena-official-panel="codes"
      data-testid="open-ena-model-v3-codes-panel"
    >
      <p className="sr-only">{copy.intro}</p>
      <OpenEnaAnalysisFamilyControl
        compact
        value={family === "standard" ? "ena" : "ona"}
        onChange={changeFamily}
        copy={copy.family}
        name="open-ena-model-v3-analysis-family"
      />
      <p aria-live="polite" className="ena-model-codes-v3-announcement">
        {announcement}
      </p>

      <div
        className="ena-model-codes-v3-toolbar ena-model-toolbar"
        role="toolbar"
        aria-label={copy.toolbar}
      >
        <OpenEnaOfficialIconButton
          icon={display.allCodesSuppressed ? "show" : "visibility"}
          ariaLabel={
            display.allCodesSuppressed ? copy.restoreCodes : copy.hideCodes
          }
          title={
            display.allCodesSuppressed ? copy.restoreCodes : copy.hideCodes
          }
          ariaPressed={display.allCodesSuppressed}
          describedBy={hideReason}
          disabled={draft.codes.length === 0}
          onClick={() =>
            dispatch({
              type: display.allCodesSuppressed
                ? "restore-code-visibility"
                : "hide-all-codes",
            })
          }
        />
        <OpenEnaOfficialIconButton
          icon="exclude"
          ariaLabel={copy.excludeAllCodes}
          title={copy.excludeAllCodes}
          describedBy={excludeReason}
          disabled={draft.codes.length === 0}
          onClick={() => {
            dispatch({ type: "exclude-all-codes" });
            setAnnouncement(copy.excludeAllCodes);
          }}
        />
        <button
          type="button"
          id={fields.id("codes")}
          aria-controls={managerId}
          aria-expanded={managerOpen}
          onClick={() => setManagerOpen((open) => !open)}
        >
          {copy.manageCodes}
        </button>
      </div>
      {draft.codes.length === 0 ? (
        <>
          <p id={`${reasonId}-hide-empty`}>{copy.hideUnavailable}</p>
          <p id={`${reasonId}-exclude-empty`}>{copy.excludeUnavailable}</p>
        </>
      ) : null}
      {activePreview?.diagnosticAvailability === "available" ? null : (
        <p className="ena-model-codes-v3-diagnostics-unavailable">
          {copy.diagnosticsUnavailable}
        </p>
      )}

      <section
        id={managerId}
        hidden={!managerOpen}
        aria-label={copy.managerTitle}
      >
        <h3>{copy.managerTitle}</h3>
        <p>{copy.managerInstructions}</p>
        {managerFields.map((field) => {
          const selected = draft.codes.includes(field.column);
          const disabled = !selected && field.incompatibilityReasons.length > 0;
          const managerReasonId = `${managerId}-${managerFields.indexOf(field)}-reason`;
          return (
            <div className="ena-model-code-choice" key={field.column}>
              <label>
                <input
                  type="checkbox"
                  name="open-ena-code-choice"
                  value={field.column}
                  checked={selected}
                  disabled={disabled}
                  aria-label={copy.addCode(field.column)}
                  aria-describedby={
                    field.incompatibilityReasons.length > 0
                      ? managerReasonId
                      : undefined
                  }
                  onChange={(event) =>
                    setSelected(field.column, event.target.checked)
                  }
                />
                <span>{field.column}</span>
              </label>
              {field.incompatibilityReasons.length > 0 ? (
                <ul id={managerReasonId}>
                  {field.incompatibilityReasons.map((reason) => (
                    <li key={reason}>{copy.incompatibilityReason[reason]}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
        <button type="button" onClick={() => setManagerOpen(false)}>
          {copy.closeManager}
        </button>
      </section>

      {draft.codes.length === 0 ? (
        <section
          className="ena-model-empty"
          aria-labelledby={`${reasonId}-title`}
        >
          <h3 id={`${reasonId}-title`}>{copy.noCodesTitle}</h3>
          <p>{copy.minimumThreeCodes}</p>
          <p>{copy.otherSettingsPreserved}</p>
          <button type="button" onClick={() => setManagerOpen(true)}>
            {copy.manageCodes}
          </button>
          {undoAvailable ? (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "undo-model-edit" });
                setAnnouncement(copy.undo);
              }}
            >
              {copy.undo}
            </button>
          ) : null}
        </section>
      ) : (
        <section
          aria-label={copy.selectedCodes}
          className="ena-model-codes-v3-list"
        >
          <p className="sr-only">{copy.reorderInstructions}</p>
          {duplicateSelection ? (
            <p id={`${reasonId}-duplicate`}>{copy.moveUnavailable}</p>
          ) : null}
          {orderedCodes.map((code, index) => {
            const evidence = fieldByColumn.get(code);
            const visible = display.codeVisibility[code] !== false;
            const displayDisabled = duplicateSelection;
            const displayReason = displayDisabled
              ? `${reasonId}-duplicate-display`
              : undefined;
            const visibilityDisabled =
              displayDisabled || display.allCodesSuppressed;
            const visibilityReason = display.allCodesSuppressed
              ? `${reasonId}-bulk-hidden`
              : displayReason;
            return (
              <article
                className="ena-model-code-row-v3"
                data-code-source={code}
                id={
                  firstRowIndex.get(code) === index
                    ? fields.id(`codes.${code}`)
                    : undefined
                }
                tabIndex={firstRowIndex.get(code) === index ? -1 : undefined}
                key={`${code}:${duplicateSelection ? index : "source"}`}
              >
                <button
                  type="button"
                  className="ena-model-code-drag-handle-v3"
                  aria-label={copy.reorderCode(code)}
                  aria-describedby={
                    duplicateSelection ? `${reasonId}-duplicate` : undefined
                  }
                  title={
                    duplicateSelection
                      ? copy.moveUnavailable
                      : copy.reorderInstructions
                  }
                  draggable={!duplicateSelection}
                  disabled={duplicateSelection}
                  onDragStart={(event) => {
                    draggedCode.current = code;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", code);
                  }}
                  onDragOver={(event) => {
                    if (!duplicateSelection) event.preventDefault();
                  }}
                  onDrop={(event) => handleDrop(code, index, event)}
                  onDragEnd={() => {
                    draggedCode.current = null;
                  }}
                  onKeyDown={(event) => handleReorderKey(code, index, event)}
                >
                  <span aria-hidden="true">⠿</span>
                </button>
                <h3>{code}</h3>
                <details className="ena-code-profile-details">
                  <summary aria-label={`${code}: ${copy.codeType}`} title={copy.codeType}>?</summary>
                <dl>
                  <div>
                    <dt>{copy.codeType}</dt>
                    <dd>
                      {evidence?.profile.availability === "available"
                        ? copy.profileTypes[evidence.profile.representation]
                        : copy.unavailable}
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.positiveCountLabel}</dt>
                    <dd>
                      {evidence?.profile.availability === "available"
                        ? copy.positiveCount(evidence.profile.positiveCount)
                        : copy.unavailable}
                    </dd>
                  </div>
                </dl>
                </details>
                <button
                  type="button"
                  className="ena-model-code-color-v3"
                  aria-label={copy.chooseColor(code)}
                  aria-describedby={displayReason}
                  disabled={displayDisabled}
                  onClick={() => onChooseCodeColor(code)}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      backgroundColor: codeColorFor(display.codeColors, code),
                    }}
                  />
                </button>
                <OpenEnaOfficialIconButton
                  icon={visible ? "visibility" : "show"}
                  ariaLabel={
                    visible ? copy.hideCode(code) : copy.showCode(code)
                  }
                  title={visible ? copy.hideCode(code) : copy.showCode(code)}
                  ariaPressed={!visible}
                  describedBy={visibilityReason}
                  disabled={visibilityDisabled}
                  onClick={() =>
                    dispatch({
                      type: "set-code-visible",
                      code,
                      visible: !visible,
                    })
                  }
                />
                <OpenEnaOfficialIconButton
                  icon="exclude"
                  ariaLabel={copy.excludeCode(code)}
                  title={copy.excludeCode(code)}
                  onClick={() => {
                    dispatch({ type: "exclude-code", code });
                    setAnnouncement(copy.excludeCode(code));
                  }}
                />
                {renderDiagnostics(evidence?.diagnostics ?? [])}
              </article>
            );
          })}
          {duplicateSelection ? (
            <p id={`${reasonId}-duplicate-display`}>
              {copy.displayActionUnavailable}
            </p>
          ) : null}
          {display.allCodesSuppressed ? (
            <p id={`${reasonId}-bulk-hidden`}>
              {copy.restoreBeforeCodeVisibility}
            </p>
          ) : null}
          {renderDiagnostics(globalDiagnostics)}
          {undoAvailable ? (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "undo-model-edit" });
                setAnnouncement(copy.undo);
              }}
            >
              {copy.undo}
            </button>
          ) : null}
        </section>
      )}
    </section>
  );
}
