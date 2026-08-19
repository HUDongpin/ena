import type { Row } from "jena-js";
import type { OpenEnaConfig, ParsedDataset } from "./types";

export interface SourceEvidenceRow {
  /** One-based parsed data-record order after the header. Not a physical line number. */
  recordNumber: number;
  row: Row;
}

function activeCodeValue(value: Row[string]) {
  if (value === 1 || value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function filterSourceEvidence(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  filters: { query: string; activeCodesOnly: boolean },
): SourceEvidenceRow[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return dataset.rows.flatMap((row, index) => {
    if (filters.activeCodesOnly && !config.codes.some((code) => activeCodeValue(row[code]))) return [];
    if (
      query
      && !dataset.headers.some((header) => String(row[header] ?? "").toLocaleLowerCase().includes(query))
    ) return [];
    return [{ recordNumber: index + 1, row }];
  });
}
