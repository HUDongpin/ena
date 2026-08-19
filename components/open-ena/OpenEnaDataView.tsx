import type { CSSProperties, ReactNode } from "react";

export type OpenEnaDataViewContext = "comparison" | "primary" | "secondary";
export type OpenEnaDataViewCell = string | number | boolean | null | undefined;

export interface OpenEnaDataViewColumn {
  key: string;
  label: string;
  kind: "metadata" | "code";
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
}

const DEFAULT_CONTEXT_OPTIONS: ReadonlyArray<OpenEnaDataViewContextOption> = [
  { value: "comparison", label: "Comparison" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
];

function displayCell(value: OpenEnaDataViewCell) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
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
}: OpenEnaDataViewProps) {
  const metadataColumns = columns.filter((column) => column.kind === "metadata");
  const codeColumns = columns.filter((column) => column.kind === "code");
  const orderedColumns = [...metadataColumns, ...codeColumns];
  const recordCount = rows.length.toLocaleString("en-US");

  return (
    <section
      className="ena-data-view"
      data-testid="open-ena-data-view"
      aria-label="Data View center surface"
    >
      <header
        className="ena-data-view-header"
        style={{ backgroundColor: "#212121", color: "#ffffff" }}
      >
        <span aria-hidden="true">▦</span>
        <strong>Data View</strong>
        <button type="button" onClick={onReturnToComparison} aria-label="Return to Comparison Plot">
          Return to Comparison
        </button>
      </header>

      <div className="ena-data-view-toolbar">
        <label className="ena-field">
          <span>Show units in</span>
          <select
            value={context}
            aria-label="Show units in plot context"
            onChange={(event) => onContextChange(event.target.value as OpenEnaDataViewContext)}
          >
            {contextOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <output aria-live="polite">{recordCount} Data View {rows.length === 1 ? "record" : "records"}</output>
        <button type="button" onClick={onExportCsv} disabled={rows.length === 0} aria-label="Export Data View records as CSV">
          Export CSV ↓
        </button>
      </div>

      <div
        className="ena-data-view-scroll"
        data-testid="open-ena-data-view-scroll"
        style={{ maxHeight: maxTableHeight, overflow: "auto", overscrollBehavior: "contain" }}
      >
        {orderedColumns.length > 0 ? (
          <table className="ena-data-view-table" aria-label="Data View records">
            <thead>
              <tr>
                {metadataColumns.length > 0 ? <th scope="colgroup" colSpan={metadataColumns.length}>Metadata</th> : null}
                {codeColumns.length > 0 ? <th scope="colgroup" colSpan={codeColumns.length}>Codes</th> : null}
              </tr>
              <tr>
                {orderedColumns.map((column) => (
                  <th key={column.key} scope="col" style={{ textAlign: column.align ?? "left" }}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-record-id={row.id}>
                  {orderedColumns.map((column, columnIndex) => {
                    const content = displayCell(row.values[column.key]);
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
