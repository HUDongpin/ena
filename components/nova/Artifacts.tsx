"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NovaArtifactVersion, NovaSession } from "@/lib/nova/types";
import { buildNovaPreviewDocument, parseNovaPreviewExport } from "@/lib/nova/preview";
import { novaFileChanges, novaDraftSelection, NOVA_WORKING_DRAFT } from "./client";
import type { NovaCopy } from "./copy";
import { Icon } from "./Icon";

export function ArtifactPreview({ artifact, copy }: { artifact: NovaArtifactVersion; copy: NovaCopy }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [nonce] = useState(() => crypto.randomUUID().replace(/-/gu, ""));
  const document = useMemo(() => { try { return buildNovaPreviewDocument(artifact.output, nonce); } catch { return null; } }, [artifact.output, nonce]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== iframe.current?.contentWindow || event.origin !== "null") return;
      const payload = parseNovaPreviewExport(event.data, nonce); if (!payload) return;
      const url = URL.createObjectURL(new Blob([payload.content], { type: payload.mime }));
      const link = window.document.createElement("a"); link.href = url; link.download = payload.filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [nonce]);
  // The preview runs only the trusted renderer. Generated files are never interpreted here.
  return document ? <iframe ref={iframe} title={`${copy.preview}: ${artifact.output.title}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} className="nova-preview-frame"/> : <p role="alert">{copy.renderError}</p>;
}
export default function Artifacts({ session, copy, selectedArtifactId, onSelect, onRestore, onDownload, disabled, canRequestReview, onRequestReview, onClose }: { session: NovaSession | null; copy: NovaCopy; selectedArtifactId: string | null; onSelect: (id: string) => void; onRestore: (id: string) => void; onDownload: (id: string) => void; disabled: boolean; canRequestReview: boolean; onRequestReview: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<"preview" | "files" | "checks">("preview");
  const [filePath, setFilePath] = useState("");
  const [diff, setDiff] = useState(false);
  const { artifact, workingRun, isWorking, selectedId } = novaDraftSelection(session, selectedArtifactId);
  const previous = artifact && session?.artifacts.filter((item) => item.version < artifact.version).sort((a, b) => b.version - a.version)[0];
  const files = isWorking ? workingRun?.draftFiles ?? [] : artifact?.files ?? [];
  const checks = isWorking ? workingRun?.draftChecks ?? [] : artifact?.checks ?? [];
  const file = files.find((item) => item.path === filePath) ?? files[0];
  useEffect(() => { setFilePath(""); }, [session?.id]);
  useEffect(() => { setDiff(false); }, [selectedId]);
  const changes = artifact ? novaFileChanges(artifact, previous).filter((item) => item.status !== "unchanged") : [];
  return <section className="nova-artifacts" aria-label={copy.previewTitle}>
    <header className="nova-artifact-header"><h2>{copy.previewTitle}</h2><button className="nova-icon-button nova-preview-close" aria-label={copy.close} onClick={onClose}><Icon name="close"/></button>
      <div className="nova-tabs" role="tablist" aria-label={copy.previewTitle}>{(["preview", "files", "checks"] as const).map((key) => <button key={key} id={`nova-tab-${key}`} role="tab" aria-controls={`nova-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const tabs = ["preview", "files", "checks"] as const; const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3; setTab(tabs[next]); window.requestAnimationFrame(() => document.getElementById(`nova-tab-${tabs[next]}`)?.focus()); }} onClick={() => setTab(key)}>{copy[key]}</button>)}</div>
    </header>
    {artifact || workingRun ? <div className="nova-version-toolbar"><label>{copy.versions}<select aria-label={copy.versions} value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}>{workingRun ? <option value={NOVA_WORKING_DRAFT}>{copy.workingDraft}</option> : null}{[...(session?.artifacts ?? [])].sort((a, b) => b.version - a.version).map((item) => <option key={item.id} value={item.id}>v{item.version}{item.id === session?.activeArtifactId ? ` · ${workingRun ? copy.checkedDraft : copy.currentVersion}` : ""}</option>)}</select></label>{artifact && artifact.id !== session?.activeArtifactId ? <button className="nova-text-button" disabled={disabled} onClick={() => onRestore(artifact.id)}><Icon name="retry" size={15}/>{copy.restore}</button> : <span>{isWorking && workingRun ? copy.statuses[workingRun.status] : copy.draft}</span>}</div> : null}
    <div id={`nova-panel-${tab}`} className="nova-artifact-panel" role="tabpanel" aria-labelledby={`nova-tab-${tab}`} tabIndex={0}>
      {tab === "preview" ? artifact ? <><div className="nova-preview-card"><ArtifactPreview key={artifact.id} artifact={artifact} copy={copy}/></div><div className="nova-preview-footer"><Icon name="shield" size={17}/><span>{copy.sandbox}</span><span>{copy.publishedBoundary}</span></div></> : <div className="nova-empty-preview"><Icon name="box" size={42}/><p>{isWorking ? copy.workingPreview : copy.previewEmpty}</p></div> : null}
      {tab === "files" ? files.length ? <><div className="nova-file-toolbar"><label className="nova-file-select"><span className="nova-sr-only">{copy.files}</span><select value={file?.path ?? ""} onChange={(event) => setFilePath(event.target.value)}>{files.map((item) => <option key={item.path} value={item.path}>{item.path}</option>)}</select></label>{artifact ? <label className="nova-checkbox"><input type="checkbox" checked={diff} onChange={(event) => setDiff(event.target.checked)}/>{copy.diff}</label> : null}</div>{diff && artifact ? <div className="nova-diffs">{changes.length ? changes.map((change) => <section key={change.path}><h3><code>{change.path}</code><span>{copy[change.status]}</span></h3>{change.before !== undefined ? <details><summary>{copy.previous}</summary><pre className="nova-code nova-code-before"><code>{change.before}</code></pre></details> : null}{change.after !== undefined ? <details open><summary>{copy.selected}</summary><pre className="nova-code"><code>{change.after}</code></pre></details> : null}</section>) : <p>{copy.noChanges}</p>}</div> : <pre className="nova-code"><code>{file?.content}</code></pre>}</> : <p className="nova-empty-copy">{isWorking ? copy.workingFilesEmpty : copy.fileEmpty}</p> : null}
      {tab === "checks" ? checks.length ? <ul className="nova-checks">{checks.map((check, index) => <li key={`${check.name}-${index}`}><span className={check.passed ? "nova-check-pass" : "nova-check-fail"}><Icon name={check.passed ? "check" : "close"} size={17}/></span><div><strong>{check.name}</strong><span className="nova-sr-only">{check.passed ? copy.pass : copy.fail}</span><p>{check.detail}</p></div></li>)}</ul> : <p className="nova-empty-copy">{isWorking ? copy.workingChecksEmpty : copy.checksEmpty}</p> : null}
    </div>
    {isWorking ? <div className="nova-artifact-bottom nova-working-summary"><Icon name="file" size={18}/><span>{file?.path}</span><small>{copy.workingDraft}</small></div> : null}
    {artifact && artifact.id !== session?.activeArtifactId ? <p className="nova-review-hint">{copy.restoreForReview}</p> : null}
    {artifact ? <div className="nova-artifact-bottom"><Icon name="file" size={18}/><span>{file?.path ?? artifact.manifest.entry}</span><button className="nova-button nova-review-button" disabled={!canRequestReview || artifact.id !== session?.activeArtifactId} onClick={onRequestReview} title={artifact.id !== session?.activeArtifactId ? copy.restoreForReview : copy.requestReview}>{copy.requestReview}</button><button className="nova-icon-button" aria-label={copy.exportDraft} onClick={() => onDownload(artifact.id)}><Icon name="download" size={18}/></button></div> : null}
  </section>;
}
