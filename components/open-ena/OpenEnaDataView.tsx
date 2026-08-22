import type { CSSProperties, ReactNode } from "react";

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
  const provenanceColumns = columns.filter((column) => column.kind === "provenance");
  const metadataColumns = columns.filter((column) => column.kind === "metadata");
  const codeColumns = columns.filter((column) => column.kind === "code");
  const directedEdgeColumns = columns.filter((column) => column.kind === "directed-edge");
  const orderedColumns = [
    ...provenanceColumns,
    ...metadataColumns,
    ...codeColumns,
    ...directedEdgeColumns,
  ];
  const recordCount = rows.length.toLocaleString("en-US");

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
            aria-label="Show units in plot context"
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
                {codeColumns.length > 0 ? <th scope="colgroup" colSpan={codeColumns.length}>{copy.codeGroup}</th> : null}
                {directedEdgeColumns.length > 0 ? <th scope="colgroup" colSpan={directedEdgeColumns.length}>{copy.directedEdgeGroup}</th> : null}
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
