"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";
import type {
  ModelDiagnosticV3,
  ModelSuggestedActionV3,
} from "../../../lib/open-ena/model-v3/diagnostics";
import type { OnaCompilerDiagnosticV3 } from "../../../lib/open-ena/model-v3/ona-compiler-preflight";
import type { AnalysisFamilyV3 } from "../../../lib/open-ena/model-v3/types";
import type { ModelScientificContextV3 } from "./model-state";

export type OpenEnaModelTabV3 = "units" | "horizons" | "windows" | "codes";
export type ModelUiDiagnosticV3 = ModelDiagnosticV3 | OnaCompilerDiagnosticV3;
export type ModelUiDiagnosticScopeV3 = ModelUiDiagnosticV3["scope"];
export type ModelUiDiagnosticSeverityV3 = ModelUiDiagnosticV3["severity"] | "information";

export interface ModelUiDiagnosticLocalizationInputV3 {
  readonly id: ModelUiDiagnosticV3["id"];
  readonly severity: ModelUiDiagnosticSeverityV3;
  readonly scope: ModelUiDiagnosticScopeV3;
  readonly fieldPath?: string;
  readonly evidence?: {
    readonly totalCount: number;
    readonly sampleLimit: 5;
    readonly truncated: boolean;
  };
}

export interface ModelUiEvidenceSampleLocalizationInputV3 {
  readonly rowIndex?: number;
  readonly identity?: string;
  /** Exact source Code identity from blocking ONA_CODE_ALL_ZERO evidence. */
  readonly codeColumn?: string;
}

export interface ModelSuggestedActionLocalizationInputV3 {
  readonly id: ModelSuggestedActionV3["id"];
  readonly patch: ModelSuggestedActionV3["patch"];
}

export interface ModelDiagnosticFieldTargetV3 {
  readonly tab: OpenEnaModelTabV3;
  readonly fieldPath: string;
  readonly fieldId: string;
}

export interface OpenEnaModelDiagnosticsV3Copy {
  readonly label: string;
  readonly globalLabel: string;
  readonly scopeLabels: Readonly<Record<ModelUiDiagnosticScopeV3, string>>;
  readonly severityLabels: Readonly<Record<ModelUiDiagnosticSeverityV3, string>>;
  readonly localize: (diagnostic: ModelUiDiagnosticLocalizationInputV3) => {
    readonly summary: string;
    readonly detail: string;
  };
  readonly evidenceLabel: string;
  readonly evidenceTotal: (totalCount: number) => string;
  readonly evidenceSample: (
    sample: ModelUiEvidenceSampleLocalizationInputV3,
    index: number,
    diagnostic: ModelUiDiagnosticLocalizationInputV3,
  ) => string;
  readonly evidenceTruncated: string;
  readonly suggestedAction: (action: ModelSuggestedActionLocalizationInputV3) => {
    readonly label: string;
    readonly confirmation: string;
  };
  readonly confirmationTitle: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export interface OpenEnaModelDiagnosticsV3Props {
  readonly diagnostics: readonly ModelUiDiagnosticV3[];
  readonly copy: OpenEnaModelDiagnosticsV3Copy;
  readonly scientificContext: ModelScientificContextV3;
  readonly onNavigateField: (target: ModelDiagnosticFieldTargetV3) => void;
  readonly onSuggestedAction: (
    action: ModelSuggestedActionV3,
    context: ModelScientificContextV3,
  ) => void;
}

const GLOBAL_SCOPES = new Set<ModelUiDiagnosticScopeV3>([
  "dataset",
  "resources",
  "migration",
]);

function codePointId(value: string): string {
  return Array.from(value, (character) => (
    character.codePointAt(0)?.toString(16).padStart(6, "0") ?? "000000"
  )).join("");
}

/**
 * Injective for every JavaScript string: each Unicode code point occupies six
 * hexadecimal characters, so punctuation and source-language column names do
 * not require selector escaping and cannot collapse to the same field ID.
 */
export function modelFieldIdV3(tab: OpenEnaModelTabV3, fieldPath: string): string {
  return `ena-model-field-${tab}-${codePointId(fieldPath)}`;
}

function fieldTabV3(
  family: AnalysisFamilyV3,
  fieldPath: string,
): OpenEnaModelTabV3 | null {
  if (
    fieldPath === "unitColumns"
    || fieldPath.startsWith("unitColumns.")
    || fieldPath === "groupColumn"
    || fieldPath.startsWith("group.")
    || fieldPath === "rotation.meansContrast"
    || fieldPath === "rotation.negativeLevel"
    || fieldPath === "rotation.positiveLevel"
  ) return "units";

  if (
    fieldPath === "horizonColumns"
    || fieldPath.startsWith("horizonColumns.")
    || fieldPath === "horizonOrder"
    || fieldPath.startsWith("horizonOrder.")
  ) return "horizons";

  if (
    fieldPath === "window"
    || fieldPath.startsWith("window.")
    || fieldPath === "movingStanza"
    || fieldPath.startsWith("movingStanza.")
    || fieldPath === "rowOrder"
    || fieldPath.startsWith("rowOrder.")
    || fieldPath === "backward"
    || fieldPath === "weighting"
    || fieldPath === "rotation"
    || fieldPath.startsWith("rotation.")
    || fieldPath === "model"
    || fieldPath === "reference"
    || fieldPath.startsWith("reference.")
    || fieldPath === "resources"
    || fieldPath.startsWith("resources.")
  ) return "windows";

  if (
    fieldPath === "codes"
    || fieldPath.startsWith("codes.")
    || (family === "ona" && (
      fieldPath === "directionalMask"
      || fieldPath.startsWith("directionalMask.")
    ))
  ) return "codes";

  return null;
}

export const OPEN_ENA_MODEL_FIELD_PATHS_V3 = Object.freeze({
  meansContrast: "rotation.meansContrast",
} as const);

function diagnosticFieldPathV3(
  family: AnalysisFamilyV3,
  diagnosticOrFieldPath: ModelUiDiagnosticV3 | string | undefined,
): string | undefined {
  if (typeof diagnosticOrFieldPath !== "object" || diagnosticOrFieldPath === null) {
    return diagnosticOrFieldPath;
  }
  if (
    family === "standard"
    && diagnosticOrFieldPath.fieldPath === "rotation"
    && (
      diagnosticOrFieldPath.id === "STANDARD_MEANS_LEVEL_REQUIRED"
      || diagnosticOrFieldPath.id === "STANDARD_MEANS_IDENTICAL"
    )
  ) return OPEN_ENA_MODEL_FIELD_PATHS_V3.meansContrast;
  return diagnosticOrFieldPath.fieldPath;
}

/** Global and unknown paths deliberately return null instead of a fake anchor. */
export function modelDiagnosticFieldTargetV3(
  family: AnalysisFamilyV3,
  diagnosticOrFieldPath: ModelUiDiagnosticV3 | string | undefined,
): ModelDiagnosticFieldTargetV3 | null {
  const fieldPath = diagnosticFieldPathV3(family, diagnosticOrFieldPath);
  if (fieldPath === undefined) return null;
  if (
    fieldPath === "dataset"
    || fieldPath.startsWith("dataset.")
    || fieldPath === "migration"
    || fieldPath.startsWith("migration.")
  ) return null;
  const tab = fieldTabV3(family, fieldPath);
  return tab === null ? null : {
    tab,
    fieldPath,
    fieldId: modelFieldIdV3(tab, fieldPath),
  };
}

export function modelDiagnosticTabV3(
  _family: AnalysisFamilyV3,
  diagnostic: ModelUiDiagnosticV3,
): OpenEnaModelTabV3 | null {
  switch (diagnostic.scope) {
    case "units": return "units";
    case "horizons": return "horizons";
    case "windows": return "windows";
    case "codes": return "codes";
    case "rotation":
    case "reference":
    case "model": return GLOBAL_SCOPES.has(diagnostic.scope) ? null : "windows";
    case "dataset":
    case "resources":
    case "migration": return null;
  }
}

function suggestedActionsV3(
  diagnostic: ModelUiDiagnosticV3,
): readonly ModelSuggestedActionV3[] {
  return "suggestedActions" in diagnostic
    ? diagnostic.suggestedActions ?? []
    : [];
}

function actionSignatureV3(action: ModelSuggestedActionV3): string {
  return `${action.id}:${canonicalJsonV3(action.patch)}`;
}

function contextMatchesV3(
  left: ModelScientificContextV3,
  right: ModelScientificContextV3,
): boolean {
  return left.datasetSha256 === right.datasetSha256
    && left.family === right.family
    && left.scientificRevision === right.scientificRevision
    && left.draftFingerprint === right.draftFingerprint
    && left.executionEpoch === right.executionEpoch;
}

interface PendingConfirmationV3 {
  readonly diagnosticId: ModelUiDiagnosticV3["id"];
  readonly fieldPath: string | undefined;
  readonly actionSignature: string;
  readonly context: ModelScientificContextV3;
  readonly label: string;
  readonly confirmation: string;
  readonly trigger: HTMLButtonElement;
  readonly fieldTarget: ModelDiagnosticFieldTargetV3 | null;
}

function resolvePendingActionV3(
  pending: PendingConfirmationV3,
  diagnostics: readonly ModelUiDiagnosticV3[],
): ModelSuggestedActionV3 | null {
  if (pending.context.family !== "standard") return null;
  for (const diagnostic of diagnostics) {
    if (
      diagnostic.id !== pending.diagnosticId
      || diagnostic.fieldPath !== pending.fieldPath
    ) continue;
    const action = suggestedActionsV3(diagnostic).find((candidate) => (
      actionSignatureV3(candidate) === pending.actionSignature
    ));
    if (action !== undefined) return action;
  }
  return null;
}

export function OpenEnaModelDiagnosticsV3({
  diagnostics,
  copy,
  scientificContext,
  onNavigateField,
  onSuggestedAction,
}: OpenEnaModelDiagnosticsV3Props) {
  const [pending, setPending] = useState<PendingConfirmationV3 | null>(null);
  const [focusReturn, setFocusReturn] = useState<PendingConfirmationV3 | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const grouped = useMemo(() => {
    const groups = new Map<ModelUiDiagnosticScopeV3, ModelUiDiagnosticV3[]>();
    for (const diagnostic of diagnostics) {
      const entries = groups.get(diagnostic.scope) ?? [];
      entries.push(diagnostic);
      groups.set(diagnostic.scope, entries);
    }
    return [...groups.entries()];
  }, [diagnostics]);

  function returnPendingFocus(closed: PendingConfirmationV3): void {
    if (closed.trigger.isConnected) {
      closed.trigger.focus();
      return;
    }
    const target = closed.fieldTarget;
    const targetElement = target === null
      ? null
      : document.getElementById(target.fieldId);
    if (targetElement instanceof HTMLElement) targetElement.focus();
    else containerRef.current?.focus();
  }

  function dismissPending(returnFocus: boolean): void {
    const closed = pending;
    setPending(null);
    if (returnFocus && closed !== null) setFocusReturn(closed);
  }

  useEffect(() => {
    if (pending === null) return;
    if (
      !contextMatchesV3(pending.context, scientificContext)
      || resolvePendingActionV3(pending, diagnostics) === null
    ) {
      const closed = pending;
      setPending(null);
      setFocusReturn(closed);
    }
  }, [diagnostics, pending, scientificContext]);

  useEffect(() => {
    if (pending === null) return;
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, [pending]);

  useEffect(() => {
    if (pending !== null || focusReturn === null) return;
    returnPendingFocus(focusReturn);
    setFocusReturn(null);
  }, [focusReturn, pending]);

  function navigate(
    event: MouseEvent<HTMLAnchorElement>,
    target: ModelDiagnosticFieldTargetV3,
  ): void {
    event.preventDefault();
    onNavigateField(target);
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissPending(true);
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function confirmPending(): void {
    if (pending === null || !contextMatchesV3(pending.context, scientificContext)) {
      dismissPending(true);
      return;
    }
    const currentAction = resolvePendingActionV3(pending, diagnostics);
    if (currentAction !== null) onSuggestedAction(currentAction, scientificContext);
    dismissPending(true);
  }

  return (
    <div
      ref={containerRef}
      className="ena-model-diagnostics"
      aria-label={copy.label}
      tabIndex={-1}
    >
      {grouped.map(([scope, entries]) => (
        <section
          key={scope}
          data-diagnostic-scope={scope}
          aria-label={GLOBAL_SCOPES.has(scope) ? copy.globalLabel : undefined}
        >
          <h3>{copy.scopeLabels[scope]}</h3>
          <ul>
            {entries.map((diagnostic, diagnosticIndex) => {
              const localizationInput: ModelUiDiagnosticLocalizationInputV3 = {
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
              const localized = copy.localize(localizationInput);
              const target = modelDiagnosticFieldTargetV3(scientificContext.family, diagnostic);
              const evidence = diagnostic.evidence;
              const actions = scientificContext.family === "standard"
                ? suggestedActionsV3(diagnostic)
                : [];
              return (
                <li
                  key={`${diagnostic.id}:${diagnostic.fieldPath ?? "global"}:${diagnosticIndex}`}
                  data-severity={diagnostic.severity}
                >
                  <p>
                    <span aria-hidden="true">{diagnostic.severity === "error" ? "!" : diagnostic.severity === "warning" ? "△" : "i"}</span>{" "}
                    <span>{copy.severityLabels[diagnostic.severity]}</span>{" "}
                    {target === null ? (
                      <strong>{localized.summary}</strong>
                    ) : (
                      <a href={`#${target.fieldId}`} onClick={(event) => navigate(event, target)}>
                        {localized.summary}
                      </a>
                    )}
                  </p>
                  <p>{localized.detail}</p>
                  {evidence === undefined ? null : (
                    <section aria-label={copy.evidenceLabel}>
                      <p>{copy.evidenceTotal(evidence.totalCount)}</p>
                      <ul>
                        {evidence.samples.slice(0, Math.min(5, evidence.sampleLimit)).map((sample, index) => (
                          <li key={`${sample.rowIndex ?? "row"}:${index}`}>
                            {copy.evidenceSample({
                              ...(sample.rowIndex === undefined ? {} : { rowIndex: sample.rowIndex }),
                              ...(typeof (sample as unknown as { readonly identity?: unknown }).identity === "string"
                                ? { identity: (sample as unknown as { readonly identity: string }).identity }
                                : {}),
                              ...(typeof (sample as unknown as { readonly codeColumn?: unknown }).codeColumn === "string"
                                ? { codeColumn: (sample as unknown as { readonly codeColumn: string }).codeColumn }
                                : {}),
                            }, index, localizationInput)}
                          </li>
                        ))}
                      </ul>
                      {evidence.truncated ? <p>{copy.evidenceTruncated}</p> : null}
                    </section>
                  )}
                  {actions.map((action) => {
                    const actionCopy = copy.suggestedAction({ id: action.id, patch: action.patch });
                    return (
                      <button
                        key={actionSignatureV3(action)}
                        type="button"
                        onClick={(event) => setPending({
                          diagnosticId: diagnostic.id,
                          fieldPath: diagnostic.fieldPath,
                          actionSignature: actionSignatureV3(action),
                          context: scientificContext,
                          label: actionCopy.label,
                          confirmation: actionCopy.confirmation,
                          trigger: event.currentTarget,
                          fieldTarget: target,
                        })}
                      >
                        {actionCopy.label}
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {pending === null ? null : (
        <dialog
          ref={dialogRef}
          aria-labelledby="ena-model-action-confirmation-heading"
          aria-describedby="ena-model-action-confirmation-description"
          onCancel={(event) => {
            event.preventDefault();
            dismissPending(true);
          }}
          onKeyDown={onDialogKeyDown}
        >
          <h3 id="ena-model-action-confirmation-heading">{copy.confirmationTitle}</h3>
          <p id="ena-model-action-confirmation-description">{pending.confirmation}</p>
          <p>{pending.label}</p>
          <button type="button" onClick={() => dismissPending(true)}>{copy.cancelLabel}</button>
          <button type="button" onClick={confirmPending}>{copy.confirmLabel}</button>
        </dialog>
      )}
    </div>
  );
}

export default OpenEnaModelDiagnosticsV3;
