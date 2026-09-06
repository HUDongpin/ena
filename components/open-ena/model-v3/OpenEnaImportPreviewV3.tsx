"use client";
import type { OpenEnaImportResultV3 } from "../../../lib/open-ena/model-artifact-imports-v3";
import type { ModelWorkspaceDraftsV3 } from "../../../lib/open-ena/model-v3/types";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";

export interface OpenEnaImportPreviewCopyV3 {
  title: string; field: string; before: string; after: string; cancel: string;
  accept: string; loadConfiguration: string; keepHistorical: string; registerReference: string;
  historical: string; noAutoRun: string; legacyReference: string;
}
export const importPreviewCopyV3: OpenEnaImportPreviewCopyV3 = {
  title: "Review imported artifact", field: "Field", before: "Current draft", after: "Imported draft", cancel: "Cancel import",
  accept: "Replace configuration", loadConfiguration: "Load configuration", keepHistorical: "Keep read-only historical result",
  registerReference: "Add Reference", historical: "This result is historical. Its configuration is loaded only by an explicit action.",
  noAutoRun: "Accepting an artifact does not start a model. References are added without selecting Rotation.",
  legacyReference: "This legacy candidate lacks the native v2 computational contract and remains available for inspection only.",
};

export function importedDraftDiffV3(current: ModelWorkspaceDraftsV3, preview: OpenEnaImportResultV3) {
  const next = preview.kind === "draft" ? preview.draft : preview.kind === "historical-result" ? preview.loadConfigurationAction.draft : null;
  if (!next) return [];
  const family = next.activeFamily;
  function flatten(value: unknown, path: string, output: Record<string, string>): void {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) flatten(child, `${path}.${key}`, output);
    } else output[path] = canonicalJsonV3(value);
  }
  const before: Record<string, string> = {}, after: Record<string, string> = {};
  flatten(current[family], family, before); flatten(next[family], family, after);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((field) => ({
    field, before: before[field] ?? "—", after: after[field] ?? "—", changed: before[field] !== after[field],
  }));
}

export function OpenEnaImportPreviewV3({ preview, drafts, copy = importPreviewCopyV3, onCancel, onAcceptDraft, onKeepHistorical, onAddReference }: {
  preview: OpenEnaImportResultV3; drafts: ModelWorkspaceDraftsV3; copy?: OpenEnaImportPreviewCopyV3;
  onCancel: () => void; onAcceptDraft: () => void; onKeepHistorical: () => void; onAddReference: () => void;
}) {
  const diff = importedDraftDiffV3(drafts, preview);
  const legacyReference = preview.kind === "reference-candidate" && preview.candidate.schemaVersion !== 2;
  return <section role="dialog" aria-modal="false" aria-labelledby="ena-import-preview-title" data-testid="ena-import-preview-v3">
    <h2 id="ena-import-preview-title">{copy.title}</h2>
    <p>{copy.noAutoRun}</p>
    {preview.kind === "historical-result" && <p>{copy.historical}</p>}
    <p>{preview.receivedArtifactSha256}</p>
    {diff.length > 0 && <table><thead><tr><th>{copy.field}</th><th>{copy.before}</th><th>{copy.after}</th></tr></thead>
      <tbody>{diff.map((row) => <tr key={row.field} data-changed={row.changed}><th>{row.field}</th><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody></table>}
    {preview.kind === "reference-candidate" && <><p>{legacyReference ? copy.legacyReference : preview.candidate.kind}</p>
      <ul>{preview.missingProvenance.map((item) => <li key={item}>{item}</li>)}</ul></>}
    <button type="button" onClick={onCancel}>{copy.cancel}</button>
    {preview.kind === "draft" && <button type="button" onClick={onAcceptDraft}>{copy.accept}</button>}
    {preview.kind === "historical-result" && <><button type="button" onClick={onKeepHistorical}>{copy.keepHistorical}</button>
      <button type="button" onClick={onAcceptDraft}>{copy.loadConfiguration}</button></>}
    {preview.kind === "reference-candidate" && <button type="button" disabled={legacyReference} title={legacyReference ? copy.legacyReference : undefined} onClick={onAddReference}>{copy.registerReference}</button>}
  </section>;
}
