"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";
import { decodeCanonicalRowOrderV3 } from "../../../lib/open-ena/model-v3/schema";
import type {
  CanonicalRowOrderV3,
  DatasetBoundConfirmationV3,
  OrderComparatorV3,
  OrderKeyV3,
  ScalarIdentityV3,
} from "../../../lib/open-ena/model-v3/types";
import type { ModelScientificContextV3 } from "./model-state";

export type OrderComparatorTypeV3 = OrderComparatorV3["type"];

export interface OrderCategoryLevelRawV3 {
  readonly id: string;
  readonly type: ScalarIdentityV3["type"];
  readonly value: string;
}

export interface OrderKeyRawV3 {
  readonly id: string;
  readonly column: string;
  readonly direction: "ascending" | "descending";
  readonly comparatorType: OrderComparatorTypeV3;
  readonly categoryLevels: readonly OrderCategoryLevelRawV3[];
  readonly textLocale: string;
  readonly textSensitivity: "base" | "accent" | "case" | "variant";
  readonly textNumeric: boolean;
}

/** UI-only state. The owner keeps it across tab/family unmounts and may replace it
 * explicitly after Reset or Import. IDs and raw strings never enter schema v3. */
export interface OrderPolicyEditorRawStateV3 {
  readonly mode: "columns" | "source";
  readonly rows: readonly OrderKeyRawV3[];
}

export interface SourceOrderConfirmationContextV3 {
  /** UI acceptance binds the open statement to the complete current draft/run epoch. */
  readonly scientificContext: ModelScientificContextV3;
  readonly rowCount: number;
  /** Already resolved for the editor's scope, in authoritative order. */
  readonly relevantColumns: readonly string[];
}

export interface OpenEnaOrderPolicyEditorV3Copy {
  readonly sortByFields: string;
  readonly useSourceOrder: string;
  readonly addKey: string;
  readonly removeKey: (index: number) => string;
  readonly moveKeyUp: (index: number) => string;
  readonly moveKeyDown: (index: number) => string;
  readonly keyLabel: (index: number) => string;
  readonly field: string;
  readonly missingField: (field: string) => string;
  readonly chooseField: string;
  readonly direction: string;
  readonly ascending: string;
  readonly descending: string;
  readonly comparator: string;
  readonly comparators: Readonly<Record<OrderComparatorTypeV3, string>>;
  readonly categoryLevels: string;
  readonly addCategoryLevel: string;
  readonly removeCategoryLevel: (index: number) => string;
  readonly moveCategoryLevelUp: (index: number) => string;
  readonly moveCategoryLevelDown: (index: number) => string;
  readonly scalarType: string;
  readonly scalarTypes: Readonly<Record<ScalarIdentityV3["type"], string>>;
  readonly scalarValue: string;
  readonly booleanValues: Readonly<Record<"true" | "false", string>>;
  readonly textLocale: string;
  readonly textSensitivity: string;
  readonly textSensitivities: Readonly<Record<"base" | "accent" | "case" | "variant", string>>;
  readonly textNumeric: string;
  readonly invalidEditor: string;
  readonly sourceStatement: string;
  readonly reviewSourceStatement: string;
  readonly acceptSourceStatement: string;
  readonly cancelSourceStatement: string;
  readonly sourceConfirmed: string;
  readonly sourceUnconfirmed: string;
  readonly sourceBindingChanged: string;
  readonly datasetHash: string;
  readonly rowCount: string;
  readonly relevantFields: string;
  readonly confirmationVersion: string;
  readonly confirmedAt: string;
  readonly unavailable: string;
}

export interface OpenEnaOrderPolicyEditorV3Props {
  readonly label: string;
  readonly fieldId: string;
  readonly copy: OpenEnaOrderPolicyEditorV3Copy;
  readonly value: CanonicalRowOrderV3 | null;
  readonly rawState: OrderPolicyEditorRawStateV3;
  readonly columnOptions: readonly string[];
  readonly confirmationContext: SourceOrderConfirmationContextV3 | null;
  readonly onChange: (value: CanonicalRowOrderV3 | null) => void;
  readonly onRawStateChange: (value: OrderPolicyEditorRawStateV3) => void;
  /** The durable owner aggregates this field with every other active raw blocker. */
  readonly onBlockedChange: (blocked: boolean) => void;
  readonly now?: () => Date;
}

let nextRawId = 0;
function rawId(prefix: string): string {
  nextRawId += 1;
  return `${prefix}-${nextRawId}`;
}

function levelToRaw(level: ScalarIdentityV3): OrderCategoryLevelRawV3 {
  return {
    id: rawId("order-level"),
    type: level.type,
    value: String(level.value),
  };
}

function keyToRaw(key?: OrderKeyV3): OrderKeyRawV3 {
  const comparator = key?.comparator;
  return {
    id: rawId("order-key"),
    column: key?.column ?? "",
    direction: key?.direction ?? "ascending",
    comparatorType: comparator?.type ?? "number",
    categoryLevels: comparator?.type === "ordered-category"
      ? comparator.levels.map(levelToRaw)
      : [],
    textLocale: comparator?.type === "text" ? comparator.locale : "en",
    textSensitivity: comparator?.type === "text" ? comparator.sensitivity : "variant",
    textNumeric: comparator?.type === "text" ? comparator.numeric : false,
  };
}

export function createEmptyOrderKeyRawV3(): OrderKeyRawV3 {
  return keyToRaw();
}

export function createOrderPolicyEditorRawStateV3(
  value: CanonicalRowOrderV3 | null,
  preferredMode?: "columns" | "source",
): OrderPolicyEditorRawStateV3 {
  if (value?.kind === "columns") {
    return { mode: "columns", rows: value.keys.map((key) => keyToRaw(key)) };
  }
  return {
    mode: preferredMode ?? (value?.kind === "source-order-confirmed" ? "source" : "columns"),
    rows: [],
  };
}

function scalarFromRaw(level: OrderCategoryLevelRawV3): ScalarIdentityV3 | null {
  switch (level.type) {
    case "string":
      return level.value.length > 0 ? { type: "string", value: level.value } : null;
    case "boolean":
      return level.value === "true" || level.value === "false"
        ? { type: "boolean", value: level.value === "true" }
        : null;
    case "number": {
      if (level.value.trim().length === 0) return null;
      const value = Number(level.value);
      return Number.isFinite(value) ? { type: "number", value: Object.is(value, -0) ? 0 : value } : null;
    }
    default:
      return null;
  }
}

function comparatorFromRaw(row: OrderKeyRawV3): OrderComparatorV3 | null {
  switch (row.comparatorType) {
    case "number": return { type: "number" };
    case "date": return { type: "date", format: "YYYY-MM-DD" };
    case "datetime": return { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" };
    case "ordered-category": {
      if (row.categoryLevels.length === 0) return null;
      const levels = row.categoryLevels.map(scalarFromRaw);
      if (levels.some((level) => level === null)) return null;
      const typed = levels as ScalarIdentityV3[];
      if (new Set(typed.map((level) => canonicalJsonV3(level))).size !== typed.length) return null;
      return { type: "ordered-category", levels: typed };
    }
    case "text":
      if (row.textLocale.trim().length === 0) return null;
      try { new Intl.Collator(row.textLocale); } catch { return null; }
      return {
        type: "text",
        locale: row.textLocale,
        sensitivity: row.textSensitivity,
        numeric: row.textNumeric,
      };
  }
}

export function orderPolicyFromRawStateV3(
  rawState: OrderPolicyEditorRawStateV3,
  currentColumns: readonly string[],
): CanonicalRowOrderV3 | null {
  if (rawState.mode !== "columns" || rawState.rows.length === 0) return null;
  const keys = rawState.rows.map((row) => {
    const comparator = comparatorFromRaw(row);
    if (row.column.trim().length === 0 || !currentColumns.includes(row.column) || comparator === null) return null;
    return { column: row.column, direction: row.direction, comparator };
  });
  if (keys.some((key) => key === null)) return null;
  const typed = keys as Array<NonNullable<typeof keys[number]>>;
  if (new Set(typed.map((key) => key.column)).size !== typed.length) return null;
  const [first, ...rest] = typed;
  try {
    return decodeCanonicalRowOrderV3({ kind: "columns", keys: [first, ...rest] });
  } catch {
    return null;
  }
}

function contextSignature(context: SourceOrderConfirmationContextV3): string {
  return canonicalJsonV3({
    scientificContext: context.scientificContext,
    rowCount: context.rowCount,
    relevantColumns: [...context.relevantColumns],
  });
}

export function confirmationMatchesContextV3(
  confirmation: DatasetBoundConfirmationV3,
  context: SourceOrderConfirmationContextV3,
): boolean {
  return confirmation.kind === "explicit-researcher-confirmation"
    && confirmation.confirmationVersion === 1
    && confirmation.analysisFamily === context.scientificContext.family
    && confirmation.datasetSha256 === context.scientificContext.datasetSha256
    && confirmation.rowCount === context.rowCount
    && confirmation.relevantColumns.length === context.relevantColumns.length
    && confirmation.relevantColumns.every((column, index) => column === context.relevantColumns[index]);
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}

function move<T>(values: readonly T[], from: number, to: number): T[] {
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function OpenEnaOrderPolicyEditorV3({
  label,
  fieldId,
  copy,
  value,
  rawState,
  columnOptions,
  confirmationContext,
  onChange,
  onRawStateChange,
  onBlockedChange,
  now = () => new Date(),
}: OpenEnaOrderPolicyEditorV3Props) {
  const radioName = useId();
  const invalidId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sourceReviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openedContext, setOpenedContext] = useState<SourceOrderConfirmationContextV3 | null>(null);
  const [openedIntent, setOpenedIntent] = useState<string | null>(null);
  const [bindingChanged, setBindingChanged] = useState(false);
  const columnsPolicy = orderPolicyFromRawStateV3(rawState, columnOptions);
  const activeConfirmation = value?.kind === "source-order-confirmed" ? value.confirmation : null;
  const sourceConfirmed = rawState.mode === "source"
    && confirmationContext !== null
    && activeConfirmation !== null
    && confirmationMatchesContextV3(activeConfirmation, confirmationContext);
  const blocked = rawState.mode === "columns" ? columnsPolicy === null : !sourceConfirmed;

  useEffect(() => { onBlockedChange(blocked); }, [blocked, onBlockedChange]);
  useEffect(() => {
    if (openedContext === null) return;
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, [openedContext]);

  function publish(next: OrderPolicyEditorRawStateV3): void {
    onRawStateChange(next);
    if (next.mode === "columns") {
      const policy = orderPolicyFromRawStateV3(next, columnOptions);
      if (policy !== null) onChange(policy);
    }
  }

  function selectMode(mode: "columns" | "source"): void {
    if (mode === rawState.mode) return;
    setOpenedContext(null);
    setOpenedIntent(null);
    setBindingChanged(false);
    const next = { ...rawState, mode };
    onRawStateChange(next);
    onChange(mode === "columns" ? orderPolicyFromRawStateV3(next, columnOptions) : null);
  }

  function dismissSourceReview(returnFocus: boolean): void {
    setOpenedContext(null);
    setOpenedIntent(null);
    if (returnFocus) requestAnimationFrame(() => sourceReviewTriggerRef.current?.focus());
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismissSourceReview(true);
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
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateRow(index: number, patch: Partial<OrderKeyRawV3>): void {
    publish({
      ...rawState,
      rows: rawState.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    });
  }

  function reorderRow(index: number, nextIndex: number): void {
    if (nextIndex < 0 || nextIndex >= rawState.rows.length) return;
    publish({ ...rawState, rows: move(rawState.rows, index, nextIndex) });
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number): void {
    if (event.target !== event.currentTarget) return;
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    reorderRow(index, index + (event.key === "ArrowUp" ? -1 : 1));
  }

  function acceptSource(): void {
    const currentIntent = canonicalJsonV3({ mode: rawState.mode, value });
    if (openedContext === null || confirmationContext === null
      || rawState.mode !== "source"
      || openedIntent !== currentIntent
      || contextSignature(openedContext) !== contextSignature(confirmationContext)) {
      dismissSourceReview(true);
      setBindingChanged(true);
      return;
    }
    const confirmedAt = now().toISOString();
    if (new Date(confirmedAt).toISOString() !== confirmedAt) return;
    onChange({
      kind: "source-order-confirmed",
      confirmation: {
        kind: "explicit-researcher-confirmation",
        analysisFamily: confirmationContext.scientificContext.family,
        datasetSha256: confirmationContext.scientificContext.datasetSha256,
        rowCount: confirmationContext.rowCount,
        relevantColumns: [...confirmationContext.relevantColumns],
        confirmedAt,
        confirmationVersion: 1,
      },
    });
    dismissSourceReview(true);
    setBindingChanged(false);
  }

  function renderContext(context: SourceOrderConfirmationContextV3) {
    return (
      <dl className="ena-model-order-v3-source-facts">
        <div><dt>{copy.datasetHash}</dt><dd>{shortHash(context.scientificContext.datasetSha256)}</dd></div>
        <div><dt>{copy.rowCount}</dt><dd>{context.rowCount}</dd></div>
        <div><dt>{copy.relevantFields}</dt><dd>{context.relevantColumns.join(" → ")}</dd></div>
        <div><dt>{copy.confirmationVersion}</dt><dd>1</dd></div>
      </dl>
    );
  }

  return (
    <fieldset
      id={fieldId}
      tabIndex={-1}
      className="ena-model-order-v3"
      aria-describedby={blocked ? invalidId : undefined}
    >
      <legend>{label}</legend>
      <label>
        <input type="radio" name={radioName} checked={rawState.mode === "columns"} onChange={() => selectMode("columns")} />
        {copy.sortByFields}
      </label>
      <label>
        <input type="radio" name={radioName} checked={rawState.mode === "source"} onChange={() => selectMode("source")} />
        {copy.useSourceOrder}
      </label>

      {rawState.mode === "columns" ? (
        <div className="ena-model-order-v3-keys">
          {rawState.rows.map((row, index) => (
            <div
              key={row.id}
              className="ena-model-order-v3-key"
              tabIndex={0}
              aria-label={copy.keyLabel(index)}
              onKeyDown={(event) => onRowKeyDown(event, index)}
            >
              <label>
                <span>{copy.field}</span>
                <select value={row.column} onChange={(event) => updateRow(index, { column: event.target.value })}>
                  <option value="">{copy.chooseField}</option>
                  {row.column !== "" && !columnOptions.includes(row.column)
                    ? <option value={row.column}>{copy.missingField(row.column)}</option>
                    : null}
                  {columnOptions.map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
              </label>
              <label>
                <span>{copy.direction}</span>
                <select value={row.direction} onChange={(event) => updateRow(index, { direction: event.target.value as OrderKeyRawV3["direction"] })}>
                  <option value="ascending">{copy.ascending}</option>
                  <option value="descending">{copy.descending}</option>
                </select>
              </label>
              <label>
                <span>{copy.comparator}</span>
                <select value={row.comparatorType} onChange={(event) => updateRow(index, { comparatorType: event.target.value as OrderComparatorTypeV3 })}>
                  {(Object.keys(copy.comparators) as OrderComparatorTypeV3[]).map((type) => (
                    <option key={type} value={type}>{copy.comparators[type]}</option>
                  ))}
                </select>
              </label>
              {row.comparatorType === "ordered-category" ? (
                <fieldset>
                  <legend>{copy.categoryLevels}</legend>
                  {row.categoryLevels.map((level, levelIndex) => (
                    <div key={level.id} className="ena-model-order-v3-level">
                      <label><span>{copy.scalarType}</span><select value={level.type} onChange={(event) => {
                        const type = event.target.value as ScalarIdentityV3["type"];
                        const categoryLevels = row.categoryLevels.map((candidate, candidateIndex) => candidateIndex === levelIndex
                          ? { ...candidate, type, value: type === "boolean" ? "false" : "" }
                          : candidate);
                        updateRow(index, { categoryLevels });
                      }}>
                        {(Object.keys(copy.scalarTypes) as ScalarIdentityV3["type"][]).map((type) => <option key={type} value={type}>{copy.scalarTypes[type]}</option>)}
                      </select></label>
                      <label><span>{copy.scalarValue}</span>{level.type === "boolean" ? (
                        <select value={level.value} onChange={(event) => updateRow(index, { categoryLevels: row.categoryLevels.map((candidate, candidateIndex) => candidateIndex === levelIndex ? { ...candidate, value: event.target.value } : candidate) })}>
                          <option value="false">{copy.booleanValues.false}</option><option value="true">{copy.booleanValues.true}</option>
                        </select>
                      ) : <input value={level.value} inputMode={level.type === "number" ? "decimal" : undefined} onChange={(event) => updateRow(index, { categoryLevels: row.categoryLevels.map((candidate, candidateIndex) => candidateIndex === levelIndex ? { ...candidate, value: event.target.value } : candidate) })} />}</label>
                      {levelIndex > 0 ? <button type="button" aria-label={copy.moveCategoryLevelUp(levelIndex)} onClick={() => updateRow(index, { categoryLevels: move(row.categoryLevels, levelIndex, levelIndex - 1) })}>↑</button> : null}
                      {levelIndex < row.categoryLevels.length - 1 ? <button type="button" aria-label={copy.moveCategoryLevelDown(levelIndex)} onClick={() => updateRow(index, { categoryLevels: move(row.categoryLevels, levelIndex, levelIndex + 1) })}>↓</button> : null}
                      <button type="button" aria-label={copy.removeCategoryLevel(levelIndex)} onClick={() => updateRow(index, { categoryLevels: row.categoryLevels.filter((_candidate, candidateIndex) => candidateIndex !== levelIndex) })}>×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => updateRow(index, { categoryLevels: [...row.categoryLevels, { id: rawId("order-level"), type: "string", value: "" }] })}>{copy.addCategoryLevel}</button>
                </fieldset>
              ) : null}
              {row.comparatorType === "text" ? (
                <div className="ena-model-order-v3-text">
                  <label><span>{copy.textLocale}</span><input value={row.textLocale} onChange={(event) => updateRow(index, { textLocale: event.target.value })} /></label>
                  <label><span>{copy.textSensitivity}</span><select value={row.textSensitivity} onChange={(event) => updateRow(index, { textSensitivity: event.target.value as OrderKeyRawV3["textSensitivity"] })}>
                    {(Object.keys(copy.textSensitivities) as OrderKeyRawV3["textSensitivity"][]).map((sensitivity) => <option key={sensitivity} value={sensitivity}>{copy.textSensitivities[sensitivity]}</option>)}
                  </select></label>
                  <label><input type="checkbox" checked={row.textNumeric} onChange={(event) => updateRow(index, { textNumeric: event.target.checked })} />{copy.textNumeric}</label>
                </div>
              ) : null}
              {index > 0 ? <button type="button" aria-label={copy.moveKeyUp(index)} onClick={() => reorderRow(index, index - 1)}>↑</button> : null}
              {index < rawState.rows.length - 1 ? <button type="button" aria-label={copy.moveKeyDown(index)} onClick={() => reorderRow(index, index + 1)}>↓</button> : null}
              <button type="button" aria-label={copy.removeKey(index)} onClick={() => publish({ ...rawState, rows: rawState.rows.filter((_candidate, candidateIndex) => candidateIndex !== index) })}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => publish({ ...rawState, rows: [...rawState.rows, keyToRaw()] })}>{copy.addKey}</button>
        </div>
      ) : (
        <section className="ena-model-order-v3-source">
          {confirmationContext === null ? <p>{copy.unavailable}</p> : renderContext(confirmationContext)}
          {sourceConfirmed && activeConfirmation !== null ? (
            <p role="status">{copy.sourceConfirmed}. {copy.confirmedAt}: {activeConfirmation.confirmedAt}</p>
          ) : <p>{copy.sourceUnconfirmed}</p>}
          {bindingChanged ? <p role="alert">{copy.sourceBindingChanged}</p> : null}
          {confirmationContext !== null ? (
            <button ref={sourceReviewTriggerRef} type="button" onClick={() => {
              setBindingChanged(false);
              setOpenedContext({
                ...confirmationContext,
                scientificContext: { ...confirmationContext.scientificContext },
                relevantColumns: [...confirmationContext.relevantColumns],
              });
              setOpenedIntent(canonicalJsonV3({ mode: rawState.mode, value }));
            }}>
              {copy.reviewSourceStatement}
            </button>
          ) : null}
          {openedContext !== null ? (
            <dialog
              ref={dialogRef}
              aria-label={copy.reviewSourceStatement}
              onCancel={(event) => { event.preventDefault(); dismissSourceReview(true); }}
              onKeyDown={onDialogKeyDown}
            >
              <p>{copy.sourceStatement}</p>
              {renderContext(openedContext)}
              <button type="button" onClick={acceptSource}>{copy.acceptSourceStatement}</button>
              <button type="button" onClick={() => dismissSourceReview(true)}>{copy.cancelSourceStatement}</button>
            </dialog>
          ) : null}
        </section>
      )}
      {blocked ? <p id={invalidId} role="alert">{copy.invalidEditor}</p> : null}
    </fieldset>
  );
}

export default OpenEnaOrderPolicyEditorV3;
