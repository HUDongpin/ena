export interface XlsxWriterContract {
  schemaVersion: 1;
  package: string;
  version: string;
  license: string;
  resolved: string;
  integrity: string;
  packageJsonSha256: string;
  licenseSha256: string;
  purpose: string;
  targets: Array<{ path: string; upstreamSha256: string; patchedSha256: string; before: string; after: string; previousSha256?: string; followup?: { before: string; after: string } }>;
}
export const xlsxWriterContract: Readonly<XlsxWriterContract>;
export function patchXlsxWriterBytes(bytes: Uint8Array, targetPath: string): { bytes: Uint8Array; changed: boolean };
export function verifyXlsxWriter(root: string, options?: { apply?: boolean }): {
  package: string;
  version: string;
  resolved: string;
  integrity: string;
  packageJsonSha256: string;
  licenseSha256: string;
  correction: string;
  distributions: Array<{ path: string; upstreamSha256: string; installedSha256: string; changed: boolean }>;
};
