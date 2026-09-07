export interface PlotlyDisposalContract {
  schemaVersion: 1;
  package: string;
  version: string;
  distribution: string;
  license: string;
  resolved: string;
  integrity: string;
  upstreamSha256: string;
  patchedSha256: string;
  packageJsonSha256: string;
  licenseSha256: string;
  changes: Array<{ purpose: string; before: string; after: string }>;
}
export const plotlyDisposalContract: Readonly<PlotlyDisposalContract>;
export function patchPlotlyDisposalBytes(bytes: Uint8Array): { bytes: Buffer; changed: boolean };
export function verifyPlotlyDisposal(root: string, options?: { apply?: boolean }): {
  package: string;
  version: string;
  resolved: string;
  integrity: string;
  upstreamSha256: string;
  installedSha256: string;
  packageJsonSha256: string;
  licenseSha256: string;
  correction: string;
  changed: boolean;
};
