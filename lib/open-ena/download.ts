/** Add Excel's UTF-8 signature only when publishing a CSV download. Internal
 * serializers and hash-bound artifacts keep their original BOM-free contents. */
export function createOpenEnaTextDownloadBlob(contents: string, type: string): Blob {
  if (type.split(";", 1)[0].trim().toLowerCase() !== "text/csv") {
    return new Blob([contents], { type });
  }
  return new Blob([contents.startsWith("\ufeff") ? contents : `\ufeff${contents}`], {
    type: "text/csv;charset=utf-8",
  });
}
