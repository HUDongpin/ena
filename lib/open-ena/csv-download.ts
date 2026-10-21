/** UTF-8 BOM (U+FEFF). Excel on Windows uses it to open Chinese CSV as UTF-8. */
export const CSV_UTF8_BOM = "\uFEFF";

export const CSV_DOWNLOAD_MEDIA_TYPE = "text/csv;charset=utf-8";

const CSV_MEDIA_TYPE = /^text\/csv\b/i;

/** True when a download media type is CSV, including a bare `text/csv`. */
export function isCsvDownloadMediaType(type: string): boolean {
  return CSV_MEDIA_TYPE.test(type.trim());
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

const UTF8_BOM_BYTES = [0xef, 0xbb, 0xbf] as const;

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3
    && bytes[0] === UTF8_BOM_BYTES[0]
    && bytes[1] === UTF8_BOM_BYTES[1]
    && bytes[2] === UTF8_BOM_BYTES[2];
}

/** Same single-BOM rule for CSV downloads that are already encoded bytes. */
export function csvDownloadBytes(bytes: Uint8Array, type: string): { bytes: Uint8Array; type: string } {
  if (!isCsvDownloadMediaType(type)) return { bytes, type };
  const body = hasUtf8Bom(bytes) ? bytes.subarray(3) : bytes;
  const prefixed = new Uint8Array(UTF8_BOM_BYTES.length + body.length);
  prefixed.set(UTF8_BOM_BYTES, 0);
  prefixed.set(body, UTF8_BOM_BYTES.length);
  return { bytes: prefixed, type: CSV_DOWNLOAD_MEDIA_TYPE };
}

