"use client";

import { useMemo, useState } from "react";
import type { Row } from "jena-js";
import { moveHorizontalScrollableRegion } from "@/lib/open-ena/horizontal-scroll";
import {
  buildOpenEnaOrderPreview,
  isOpenEnaOrderPanelValueComplete,
  orderPolicyFromPanelValue,
  type OpenEnaOrderPanelValue,
  type OpenEnaOrderPreviewField,
  type OpenEnaOrderPreviewRow,
} from "@/lib/open-ena/ona-order-preview";
import type { OpenEnaOrderComparator } from "@/lib/open-ena/types";

export interface OpenEnaOrderPanelCopy {
  title: string;
  description: string;
  orderPolicyLegend: string;
  columnsPolicyLabel: string;
  columnsPolicyDescription: string;
  sourceRowPolicyLabel: string;
  sourceRowPolicyDescription: string;
  orderColumnsLegend: string;
  comparatorLabel: string;
  comparatorPlaceholder: string;
  comparatorLabels: Record<OpenEnaOrderComparator, string>;
  sourceRowConfirmationLabel: string;
  windowTitle: string;
  windowModeLegend: string;
  finiteWindowLabel: string;
  entireHorizonLabel: string;
  windowSizeLabel: string;
  invalidWindowSize: string;
  lockedTitle: string;
  modelLabel: string;
  modelValue: string;
  windowTypeLabel: string;
  windowTypeValue: string;
  forwardLabel: string;
  forwardValue: string;
  weightLabel: string;
  weightValue: string;
  rotationLabel: string;
  rotationValue: string;
  referenceLabel: string;
  referenceValue: string;
  previewTitle: string;
  previewReady: string;
  previewNeedsConfiguration: string;
  previewRejected: string;
  resolvedPolicyTitle: string;
  directionLabel: string;
  directionAscending: string;
  missingLabel: string;
  missingReject: string;
  tiesLabel: string;
  tiesReject: string;
  stableLabel: string;
  stableYes: string;
  sourceOrderValue: string;
  orderedPositionHeader: string;
  sourceRecordHeader: string;
  horizonOrdinalHeader: string;
  boundaryHeader: string;
  unitFieldsHeader: string;
  horizonFieldsHeader: string;
  orderFieldsHeader: string;
  boundarySingle: string;
  boundaryStart: string;
  boundaryWithin: string;
  boundaryEnd: string;
  emptyFields: string;
  previousPage: string;
  nextPage: string;
  previewRange: string;
}

interface OpenEnaOrderColumnOption {
  value: string;
  label: string;
}

interface OpenEnaOrderPanelProps {
  value: OpenEnaOrderPanelValue;
  onChange: (value: OpenEnaOrderPanelValue) => void;
  rows: readonly Row[];
  unitColumns: readonly string[];
  horizonColumns: readonly string[];
  columnOptions: readonly OpenEnaOrderColumnOption[];
  copy: OpenEnaOrderPanelCopy;
  disabled?: boolean;
  idPrefix?: string;
  finiteWindowFallback?: number;
}

const COMPARATORS = ["number", "string", "boolean", "iso-datetime"] as const;
const PREVIEW_PAGE_SIZE = 100;

function formatRange(
  template: string,
  values: Readonly<Record<"start" | "end" | "total" | "page" | "pages", number>>,
) {
  return template.replace(/\{(start|end|total|page|pages)\}/gu, (_placeholder, key: keyof typeof values) => (
    String(values[key])
  ));
}

function formatPreviewValue(field: OpenEnaOrderPreviewField) {
  if (field.valueType === "missing") return "";
  if (typeof field.value === "number" && Object.is(field.value, -0)) return "-0";
  return String(field.value);
}

function formatFields(fields: OpenEnaOrderPreviewField[], empty: string) {
  if (fields.length === 0) return empty;
  return fields.map((field) => `${field.column} = ${formatPreviewValue(field)}`).join("; ");
}

function boundaryLabel(row: OpenEnaOrderPreviewRow, copy: OpenEnaOrderPanelCopy) {
  if (row.startsHorizon && row.endsHorizon) return copy.boundarySingle;
  if (row.startsHorizon) return copy.boundaryStart;
  if (row.endsHorizon) return copy.boundaryEnd;
  return copy.boundaryWithin;
}

export function OpenEnaOrderPanel({
  value,
  onChange,
  rows,
  unitColumns,
  horizonColumns,
  columnOptions,
  copy,
  disabled = false,
  idPrefix = "open-ena-order",
  finiteWindowFallback = 1,
}: OpenEnaOrderPanelProps) {
  const previewState = useMemo(() => {
    if (!isOpenEnaOrderPanelValueComplete(value)) {
      return { kind: "incomplete" as const, preview: null };
    }
    try {
      const policy = orderPolicyFromPanelValue(value);
      return {
        kind: "ready" as const,
        preview: buildOpenEnaOrderPreview({
          rows,
          unitColumns,
          horizonColumns,
          policy,
        }),
      };
    } catch {
      return { kind: "rejected" as const, preview: null };
    }
  }, [horizonColumns, rows, unitColumns, value]);
  const [previewPage, setPreviewPage] = useState(0);
  const previewRowCount = previewState.preview?.rows.length ?? 0;
  const previewPageCount = Math.max(1, Math.ceil(previewRowCount / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, previewPageCount - 1);
  const previewStart = safePreviewPage * PREVIEW_PAGE_SIZE;
  const visiblePreviewRows = previewState.preview?.rows.slice(
    previewStart,
    previewStart + PREVIEW_PAGE_SIZE,
  ) ?? [];

  const entireHorizon = value.windowSizeBack === Number.POSITIVE_INFINITY;
  const finiteWindow = !entireHorizon;
  const validFiniteWindow = Number.isSafeInteger(value.windowSizeBack) && value.windowSizeBack >= 1;
  const setValue = (patch: Partial<OpenEnaOrderPanelValue>) => onChange({ ...value, ...patch });

  const toggleColumn = (column: string, selected: boolean) => {
    const columns = selected
      ? [...value.columns, column]
      : value.columns.filter((candidate) => candidate !== column);
    const comparators = { ...value.comparators };
    if (!selected) delete comparators[column];
    setValue({ columns, comparators });
  };

  return (
    <section className="ena-order-panel" aria-labelledby={`${idPrefix}-title`}>
      <header>
        <h4 id={`${idPrefix}-title`}>{copy.title}</h4>
        <p>{copy.description}</p>
      </header>

      <fieldset disabled={disabled}>
        <legend>{copy.orderPolicyLegend}</legend>
        <label>
          <input
            type="radio"
            name={`${idPrefix}-policy`}
            checked={value.policyKind === "columns"}
            onChange={() => setValue({ policyKind: "columns" })}
          />
          <strong>{copy.columnsPolicyLabel}</strong>
          <span>{copy.columnsPolicyDescription}</span>
        </label>
        <label>
          <input
            type="radio"
            name={`${idPrefix}-policy`}
            checked={value.policyKind === "source-row"}
            onChange={() => setValue({ policyKind: "source-row" })}
          />
          <strong>{copy.sourceRowPolicyLabel}</strong>
          <span>{copy.sourceRowPolicyDescription}</span>
        </label>
      </fieldset>

      {value.policyKind === "columns" ? (
        <fieldset disabled={disabled} className="ena-order-columns">
          <legend>{copy.orderColumnsLegend}</legend>
          {columnOptions.map((option) => {
            const selected = value.columns.includes(option.value);
            const comparatorId = `${idPrefix}-${option.value}-comparator`;
            return (
              <div key={option.value}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => toggleColumn(option.value, event.currentTarget.checked)}
                  />
                  <span>{option.label}</span>
                </label>
                {selected ? (
                  <label htmlFor={comparatorId}>
                    <span>{copy.comparatorLabel}</span>
                    <select
                      id={comparatorId}
                      value={value.comparators[option.value] ?? ""}
                      onChange={(event) => {
                        const comparators = { ...value.comparators };
                        const comparator = event.currentTarget.value;
                        if (comparator === "") delete comparators[option.value];
                        else comparators[option.value] = comparator as OpenEnaOrderComparator;
                        setValue({ comparators });
                      }}
                    >
                      <option value="">{copy.comparatorPlaceholder}</option>
                      {COMPARATORS.map((comparator) => (
                        <option key={comparator} value={comparator}>{copy.comparatorLabels[comparator]}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ) : (
        <label className="ena-source-order-confirmation">
          <input
            type="checkbox"
            checked={value.sourceRowConfirmed}
            disabled={disabled}
            onChange={(event) => setValue({ sourceRowConfirmed: event.currentTarget.checked })}
          />
          <span>{copy.sourceRowConfirmationLabel}</span>
        </label>
      )}

      <section className="ena-order-window" aria-labelledby={`${idPrefix}-window-title`}>
        <h5 id={`${idPrefix}-window-title`}>{copy.windowTitle}</h5>
        <fieldset disabled={disabled}>
          <legend>{copy.windowModeLegend}</legend>
          <label>
            <input
              type="radio"
              name={`${idPrefix}-window-scope`}
              checked={finiteWindow}
              onChange={() => setValue({
                windowSizeBack: Number.isSafeInteger(finiteWindowFallback) && finiteWindowFallback >= 1
                  ? finiteWindowFallback
                  : 1,
              })}
            />
            <span>{copy.finiteWindowLabel}</span>
          </label>
          <label>
            <input
              type="radio"
              name={`${idPrefix}-window-scope`}
              checked={entireHorizon}
              onChange={() => setValue({ windowSizeBack: Number.POSITIVE_INFINITY })}
            />
            <span>{copy.entireHorizonLabel}</span>
          </label>
        </fieldset>
        <label htmlFor={`${idPrefix}-window-size`}>
          <span>{copy.windowSizeLabel}</span>
          <input
            id={`${idPrefix}-window-size`}
            type="number"
            min={1}
            step={1}
            value={finiteWindow && Number.isFinite(value.windowSizeBack) ? value.windowSizeBack : ""}
            disabled={disabled || !finiteWindow}
            aria-invalid={finiteWindow && !validFiniteWindow}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isSafeInteger(next) && next >= 1) setValue({ windowSizeBack: next });
            }}
          />
        </label>
        {finiteWindow && !validFiniteWindow ? <p role="alert">{copy.invalidWindowSize}</p> : null}
      </section>

      <section className="ena-order-locked-contract" data-locked-contract="ordered">
        <h5>{copy.lockedTitle}</h5>
        <dl>
          <div><dt>{copy.modelLabel}</dt><dd>{copy.modelValue}</dd></div>
          <div><dt>{copy.windowTypeLabel}</dt><dd>{copy.windowTypeValue}</dd></div>
          <div><dt>{copy.forwardLabel}</dt><dd>{copy.forwardValue}</dd></div>
          <div><dt>{copy.weightLabel}</dt><dd>{copy.weightValue}</dd></div>
          <div><dt>{copy.rotationLabel}</dt><dd>{copy.rotationValue}</dd></div>
          <div><dt>{copy.referenceLabel}</dt><dd>{copy.referenceValue}</dd></div>
        </dl>
      </section>

      <section className="ena-order-preview" aria-labelledby={`${idPrefix}-preview-title`}>
        <h5 id={`${idPrefix}-preview-title`}>{copy.previewTitle}</h5>
        <p aria-live="polite">
          {previewState.kind === "ready"
            ? copy.previewReady
            : previewState.kind === "rejected"
              ? copy.previewRejected
              : copy.previewNeedsConfiguration}
        </p>
        {previewState.preview ? (
          <>
            <section aria-label={copy.resolvedPolicyTitle}>
              <h6>{copy.resolvedPolicyTitle}</h6>
              {previewState.preview.resolvedPolicy.kind === "columns" ? (
                <dl>
                  <div><dt>{copy.directionLabel}</dt><dd>{copy.directionAscending}</dd></div>
                  <div><dt>{copy.missingLabel}</dt><dd>{copy.missingReject}</dd></div>
                  <div><dt>{copy.tiesLabel}</dt><dd>{copy.tiesReject}</dd></div>
                  <div><dt>{copy.stableLabel}</dt><dd>{copy.stableYes}</dd></div>
                </dl>
              ) : (
                <>
                  <p>{copy.sourceOrderValue}</p>
                  <dl>
                    <div><dt>{copy.stableLabel}</dt><dd>{copy.stableYes}</dd></div>
                  </dl>
                </>
              )}
            </section>
            <nav
              className="ena-table-pagination"
              data-testid="open-ena-order-preview-pagination"
              data-total-rows={previewRowCount}
              data-visible-rows={visiblePreviewRows.length}
              aria-label={copy.previewTitle}
            >
              <button
                type="button"
                disabled={safePreviewPage === 0}
                onClick={() => setPreviewPage(Math.max(0, safePreviewPage - 1))}
              >
                {copy.previousPage}
              </button>
              <output aria-live="polite">
                {formatRange(copy.previewRange, {
                  start: previewRowCount === 0 ? 0 : previewStart + 1,
                  end: previewStart + visiblePreviewRows.length,
                  total: previewRowCount,
                  page: safePreviewPage + 1,
                  pages: previewPageCount,
                })}
              </output>
              <button
                type="button"
                disabled={safePreviewPage >= previewPageCount - 1}
                onClick={() => setPreviewPage(Math.min(previewPageCount - 1, safePreviewPage + 1))}
              >
                {copy.nextPage}
              </button>
            </nav>
            <div
              className="ena-order-preview-table-wrap"
              tabIndex={0}
              role="region"
              aria-label={copy.previewTitle}
              onKeyDown={(event) => {
                if (moveHorizontalScrollableRegion(event.currentTarget, event.key)) event.preventDefault();
              }}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">{copy.orderedPositionHeader}</th>
                    <th scope="col">{copy.sourceRecordHeader}</th>
                    <th scope="col">{copy.horizonOrdinalHeader}</th>
                    <th scope="col">{copy.boundaryHeader}</th>
                    <th scope="col">{copy.unitFieldsHeader}</th>
                    <th scope="col">{copy.horizonFieldsHeader}</th>
                    <th scope="col">{copy.orderFieldsHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePreviewRows.map((row) => (
                    <tr key={`${row.sourceIndex}-${row.orderedPosition}`} data-order-preview-row={row.orderedPosition}>
                      <td>{row.orderedPosition}</td>
                      <td>{row.sourceRecord}</td>
                      <td>{row.horizonOrdinal}</td>
                      <td>{boundaryLabel(row, copy)}</td>
                      <td>{formatFields(row.unitFields, copy.emptyFields)}</td>
                      <td>{formatFields(row.horizonFields, copy.emptyFields)}</td>
                      <td>{formatFields(row.orderFields, copy.emptyFields)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
