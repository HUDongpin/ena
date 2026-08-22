"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export type OpenEnaDataViewContext = "comparison" | "primary" | "secondary";
export type OpenEnaDataViewCell = string | number | boolean | null | undefined;

export interface OpenEnaDataViewColumn {
  key: string;
  label: string;
  kind: "provenance" | "metadata" | "code" | "directed-edge";
  align?: "left" | "center" | "right";
}

export interface OpenEnaDataViewRow {
  id: string;
  values: Readonly<Record<string, OpenEnaDataViewCell>>;
}

export interface OpenEnaDataViewContextOption {
  value: OpenEnaDataViewContext;
  label: string;
}

export interface OpenEnaDataViewProps {
  columns: ReadonlyArray<OpenEnaDataViewColumn>;
  rows: ReadonlyArray<OpenEnaDataViewRow>;
  context: OpenEnaDataViewContext;
  onContextChange: (context: OpenEnaDataViewContext) => void;
  onReturnToComparison: () => void;
  onExportCsv: () => void;
  contextOptions?: ReadonlyArray<OpenEnaDataViewContextOption>;
  maxTableHeight?: CSSProperties["maxHeight"];
  emptyMessage?: ReactNode;
  notice?: ReactNode;
  copy?: Partial<OpenEnaDataViewCopy>;
  exportClassification?: "derived" | "local-identity-bearing-view";
}

export interface OpenEnaDataViewCopy {
  ariaLabel: string;
  title: string;
  returnLabel: string;
  returnAriaLabel: string;
  contextLabel: string;
  record: string;
  records: string;
  exportLabel: string;
  exportAriaLabel: string;
  tableAriaLabel: string;
  previousPage: string;
  nextPage: string;
  rowsShown: string;
  columnsShown: string;
  rowPaginationLabel: string;
  columnPaginationLabel: string;
  provenanceGroup: string;
  metadataGroup: string;
  codeGroup: string;
  directedEdgeGroup: string;
  yes: string;
  no: string;
}

const DEFAULT_COPY: OpenEnaDataViewCopy = {
  ariaLabel: "Data View center surface",
  title: "Data View",
  returnLabel: "Return to Comparison",
  returnAriaLabel: "Return to Comparison Plot",
  contextLabel: "Show units in",
  record: "Data View record",
  records: "Data View records",
  exportLabel: "Export CSV ↓",
  exportAriaLabel: "Export Data View records as CSV",
  tableAriaLabel: "Data View records",
  previousPage: "Previous page",
  nextPage: "Next page",
  rowsShown: "Rows {start}–{end} of {total} · Page {page} of {pages}",
  columnsShown: "Variable columns {start}–{end} of {total} · Page {page} of {pages}",
  rowPaginationLabel: "Data View row pages",
  columnPaginationLabel: "Data View variable-column pages",
  provenanceGroup: "Ordered provenance",
  metadataGroup: "Metadata",
  codeGroup: "Codes",
  directedEdgeGroup: "Directed contributions",
  yes: "Yes",
  no: "No",
};

const DEFAULT_CONTEXT_OPTIONS: ReadonlyArray<OpenEnaDataViewContextOption> = [
  { value: "comparison", label: "Comparison" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
];
const ROW_PAGE_SIZE = 100;
const VARIABLE_COLUMN_PAGE_SIZE = 32;

function formatRange(
  template: string,
  values: Readonly<Record<"start" | "end" | "total" | "page" | "pages", number>>,
) {
  return template.replace(/\{(start|end|total|page|pages)\}/gu, (_placeholder, key: keyof typeof values) => (
    String(values[key])
  ));
}

function displayCell(value: OpenEnaDataViewCell, copy: OpenEnaDataViewCopy) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? copy.yes : copy.no;
  return String(value);
}

export default function OpenEnaDataView({
  columns,
  rows,
  context,
  onContextChange,
  onReturnToComparison,
  onExportCsv,
  contextOptions = DEFAULT_CONTEXT_OPTIONS,
  maxTableHeight = "min(64vh, 680px)",
  emptyMessage = "No Data View records match this context.",
  notice,
  copy: copyOverrides,
  exportClassification = "derived",
}: OpenEnaDataViewProps) {
  const copy = { ...DEFAULT_COPY, ...copyOverrides };
  const [rowPage, setRowPage] = useState(0);
  const [variableColumnPage, setVariableColumnPage] = useState(0);
  const provenanceColumns = columns.filter((column) => column.kind === "provenance");
  const metadataColumns = columns.filter((column) => column.kind === "metadata");
  const codeColumns = columns.filter((column) => column.kind === "code");
  const directedEdgeColumns = columns.filter((column) => column.kind === "directed-edge");
  const variableColumns = [...codeColumns, ...directedEdgeColumns];
  const rowPageCount = Math.max(1, Math.ceil(rows.length / ROW_PAGE_SIZE));
  const variableColumnPageCount = Math.max(1, Math.ceil(variableColumns.length / VARIABLE_COLUMN_PAGE_SIZE));
  const safeRowPage = Math.min(rowPage, rowPageCount - 1);
  const safeVariableColumnPage = Math.min(variableColumnPage, variableColumnPageCount - 1);
  const rowStart = safeRowPage * ROW_PAGE_SIZE;
  const variableColumnStart = safeVariableColumnPage * VARIABLE_COLUMN_PAGE_SIZE;
  const visibleRows = rows.slice(rowStart, rowStart + ROW_PAGE_SIZE);
  const visibleVariableColumns = variableColumns.slice(
    variableColumnStart,
    variableColumnStart + VARIABLE_COLUMN_PAGE_SIZE,
  );
  const visibleCodeColumns = visibleVariableColumns.filter((column) => column.kind === "code");
  const visibleDirectedEdgeColumns = visibleVariableColumns.filter((column) => column.kind === "directed-edge");
  const orderedColumns = [
    ...provenanceColumns,
    ...metadataColumns,
    ...visibleVariableColumns,
  ];
  const recordCount = rows.length.toLocaleString("en-US");

  useEffect(() => setRowPage(0), [context, rows]);
  useEffect(() => setVariableColumnPage(0), [columns]);

  return (
    <section
      className="ena-data-view"
      data-testid="open-ena-data-view"
      data-export-classification={exportClassification}
      aria-label={copy.ariaLabel}
    >
      <header
        className="ena-data-view-header"
        style={{ backgroundColor: "#212121", color: "#ffffff" }}
      >
        <span aria-hidden="true">▦</span>
        <strong>{copy.title}</strong>
        <button type="button" onClick={onReturnToComparison} aria-label={copy.returnAriaLabel}>
          {copy.returnLabel}
        </button>
      </header>

      <div className="ena-data-view-toolbar">
        <label className="ena-field">
          <span>{copy.contextLabel}</span>
          <select
            value={context}
            aria-label={copy.contextLabel}
            onChange={(event) => onContextChange(event.target.value as OpenEnaDataViewContext)}
          >
            {contextOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <output aria-live="polite">{recordCount} {rows.length === 1 ? copy.record : copy.records}</output>
        <button type="button" onClick={onExportCsv} disabled={rows.length === 0} aria-label={copy.exportAriaLabel}>
          {copy.exportLabel}
        </button>
      </div>
      {notice ? <div className="ena-data-view-notice" role="note">{notice}</div> : null}
      <div
        className="ena-data-view-pagination"
        data-testid="open-ena-data-view-pagination"
        data-total-rows={rows.length}
        data-visible-rows={visibleRows.length}
        data-total-variable-columns={variableColumns.length}
        data-visible-variable-columns={visibleVariableColumns.length}
      >
        <nav aria-label={copy.rowPaginationLabel}>
          <button
            type="button"
            disabled={safeRowPage === 0}
            onClick={() => setRowPage(Math.max(0, safeRowPage - 1))}
          >
            {copy.previousPage}
          </button>
          <output aria-live="polite">
            {formatRange(copy.rowsShown, {
              start: rows.length === 0 ? 0 : rowStart + 1,
              end: rowStart + visibleRows.length,
              total: rows.length,
              page: safeRowPage + 1,
              pages: rowPageCount,
            })}
          </output>
          <button
            type="button"
            disabled={safeRowPage >= rowPageCount - 1}
            onClick={() => setRowPage(Math.min(rowPageCount - 1, safeRowPage + 1))}
          >
            {copy.nextPage}
          </button>
        </nav>
        {variableColumns.length > VARIABLE_COLUMN_PAGE_SIZE ? (
          <nav aria-label={copy.columnPaginationLabel}>
            <button
              type="button"
              disabled={safeVariableColumnPage === 0}
              onClick={() => setVariableColumnPage(Math.max(0, safeVariableColumnPage - 1))}
            >
              {copy.previousPage}
            </button>
            <output aria-live="polite">
              {formatRange(copy.columnsShown, {
                start: variableColumns.length === 0 ? 0 : variableColumnStart + 1,
                end: variableColumnStart + visibleVariableColumns.length,
                total: variableColumns.length,
                page: safeVariableColumnPage + 1,
                pages: variableColumnPageCount,
              })}
            </output>
            <button
              type="button"
              disabled={safeVariableColumnPage >= variableColumnPageCount - 1}
              onClick={() => setVariableColumnPage(Math.min(variableColumnPageCount - 1, safeVariableColumnPage + 1))}
            >
              {copy.nextPage}
            </button>
          </nav>
        ) : null}
      </div>

      <div
        className="ena-data-view-scroll"
        data-testid="open-ena-data-view-scroll"
        style={{ maxHeight: maxTableHeight, overflow: "auto", overscrollBehavior: "contain" }}
      >
        {orderedColumns.length > 0 ? (
          <table className="ena-data-view-table" aria-label={copy.tableAriaLabel}>
            <thead>
              <tr>
                {provenanceColumns.length > 0 ? <th scope="colgroup" colSpan={provenanceColumns.length}>{copy.provenanceGroup}</th> : null}
                {metadataColumns.length > 0 ? <th scope="colgroup" colSpan={metadataColumns.length}>{copy.metadataGroup}</th> : null}
                {visibleCodeColumns.length > 0 ? <th scope="colgroup" colSpan={visibleCodeColumns.length}>{copy.codeGroup}</th> : null}
                {visibleDirectedEdgeColumns.length > 0 ? <th scope="colgroup" colSpan={visibleDirectedEdgeColumns.length}>{copy.directedEdgeGroup}</th> : null}
              </tr>
              <tr>
                {orderedColumns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    data-view-variable-column={column.kind === "code" || column.kind === "directed-edge" ? column.key : undefined}
                    style={{ textAlign: column.align ?? "left" }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} data-record-id={row.id}>
                  {orderedColumns.map((column, columnIndex) => {
                    const content = displayCell(row.values[column.key], copy);
                    const style = { textAlign: column.align ?? "left" } as const;
                    return columnIndex === 0
                      ? <th key={column.key} scope="row" style={style}>{content}</th>
                      : <td key={column.key} style={style}>{content}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {rows.length === 0 ? <p role="status">{emptyMessage}</p> : null}
      </div>
    </section>
  );
}
