import type { Row } from "jena-js";

export type OpenEnaDataViewExportColumnKind =
  | "provenance"
  | "metadata"
  | "code"
  | "directed-edge";

export interface OpenEnaDataViewExportColumn {
  key: string;
  label: string;
  kind: OpenEnaDataViewExportColumnKind;
}

export interface OpenEnaDataViewExportRow {
  id: string;
  values: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

export function buildOpenEnaDataViewExportRows(input: {
  columns: ReadonlyArray<OpenEnaDataViewExportColumn>;
  rows: ReadonlyArray<OpenEnaDataViewExportRow>;
  groupLabels: Readonly<Record<OpenEnaDataViewExportColumnKind, string>>;
}): Row[] {
  const headers = input.columns.map((column) => {
    const group = input.groupLabels[column.kind]?.trim();
    const label = column.label.trim();
    if (!group || !label) {
      throw new Error("Data View export columns require non-empty display labels.");
    }
    return `${group} · ${label}`;
  });
  if (new Set(headers).size !== headers.length) {
    throw new Error("Data View export requires unique display headers; rename duplicate columns before export.");
  }
  return input.rows.map((row) => Object.fromEntries(input.columns.map((column, index) => [
    headers[index],
    row.values[column.key] ?? null,
  ])) as Row);
}
