/** UTF-8 BOM (U+FEFF). Excel on Windows uses it to open Chinese CSV as UTF-8. */
export const CSV_UTF8_BOM = "\uFEFF";

export const CSV_DOWNLOAD_MEDIA_TYPE = "text/csv;charset=utf-8";

/** True when a download media type is CSV, including a bare `text/csv`. */
export function isCsvDownloadMediaType(type: string): boolean {
  return type.split(";", 1)[0]?.trim().toLowerCase() === "text/csv";
}

/**
 * Prefix a CSV download with one UTF-8 BOM and the charset parameter.
 * Non-CSV payloads are returned unchanged. A BOM already present is kept once.
 * Call this at the download boundary: `rowsToCsv` and hashed archive members stay BOM-free.
 */
export function csvDownloadPayload(contents: string, type: string): { contents: string; type: string } {
  if (!isCsvDownloadMediaType(type)) return { contents, type };
  const body = contents.startsWith(CSV_UTF8_BOM) ? contents.slice(CSV_UTF8_BOM.length) : contents;
  return { contents: `${CSV_UTF8_BOM}${body}`, type: CSV_DOWNLOAD_MEDIA_TYPE };
}

