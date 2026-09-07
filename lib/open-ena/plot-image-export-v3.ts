export type OpenEnaImageExportLeaseV3 = () => boolean;
export interface OpenEnaPlotImageExportOperationV3 {
  acquire: () => OpenEnaImageExportLeaseV3 | null;
  active: () => boolean;
  render: () => Promise<{ png: Blob; dataUrl: string }>;
  writePng?: (png: Blob) => Promise<void>;
  writeText?: (dataUrl: string) => Promise<void>;
  download: (png: Blob) => void;
}
/** The lease is captured before rendering. An existing destination's rejection
 * remains an error; absence alone enables the user-requested PNG fallback. */
export async function performPlotImageExportV3(operation: OpenEnaPlotImageExportOperationV3): Promise<"denied" | "obsolete" | "copied" | "text-copied" | "downloaded"> {
  const lease = operation.acquire();
  if (!lease) return "denied";
  const current = () => operation.active() && lease();
  if (!current()) return "obsolete";
  const image = await operation.render();
  if (!current()) return "obsolete";
  let status: "copied" | "text-copied" | "downloaded";
  if (operation.writePng) { await operation.writePng(image.png); status = "copied"; }
  else if (operation.writeText) { await operation.writeText(image.dataUrl); status = "text-copied"; }
  else { operation.download(image.png); status = "downloaded"; }
  return current() ? status : "obsolete";
}
