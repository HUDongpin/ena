"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import OpenEnaWorkspace from "./OpenEnaWorkspace";
import type { OpenEnaCloudWorkbenchBridge } from "@/lib/open-ena/cloud-workbench-bridge";
import { restoreOpenEnaCloudWorkspace, type RestoredOpenEnaCloudWorkspace } from "@/lib/open-ena/cloud-workspace";
import { getOpenEnaCloudCopy, openEnaCloudErrorCopy } from "@/lib/open-ena/cloud-copy";
import { type OpenEnaCloudProject, type OpenEnaCloudProjectList, type OpenEnaCloudProjectSummary } from "@/lib/open-ena/cloud-project-contract";

class CloudRequestError extends Error { constructor(readonly code: string) { super(code); } }
async function request<T>(path: string, accountId: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(45_000),
    headers: { Accept: "application/json", "X-Open-ENA-Account": accountId, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new CloudRequestError(value.error ?? "unavailable");
  return value;
}

type Props = ComponentProps<typeof OpenEnaWorkspace> & { accountId: string; accountEmail?: string };
export default function OpenEnaCloudProjects({ accountId, accountEmail, ...workspaceProps }: Props) {
  const { locale } = workspaceProps, copy = getOpenEnaCloudCopy(locale), id = useId();
  const bridge = useRef<OpenEnaCloudWorkbenchBridge | null>(null), dialog = useRef<HTMLDialogElement>(null);
  const controlsElement = useRef<HTMLElement>(null);
  const [panelOpen, setPanelOpen] = useState(false), [workspaceKey, setWorkspaceKey] = useState(0);
  const [initialCloud, setInitialCloud] = useState<RestoredOpenEnaCloudWorkspace>();
  const [current, setCurrent] = useState<OpenEnaCloudProjectSummary | null>(null), [title, setTitle] = useState(copy.untitled);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [localOnlyWork, setLocalOnlyWork] = useState(false);
  const [error, setError] = useState(""), [errorCode, setErrorCode] = useState(""), [notice, setNotice] = useState("");
  const [archived, setArchived] = useState(false), [listing, setListing] = useState<OpenEnaCloudProjectList | null>(null);
  const changed = useRef(0), listGeneration = useRef(0), alive = useRef(true);
  const pendingCreate = useRef<{ id: string; fingerprint: string } | null>(null);
  const dirtyChange = useCallback(() => { changed.current += 1; setDirty(true); }, []);
  const localOnlyChange = useCallback((hasWork: boolean) => { changed.current += 1; setLocalOnlyWork(hasWork); }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    const element = controlsElement.current, workspace = element?.closest<HTMLElement>(".open-ena-page");
    if (!element || !workspace) return;
    const update = () => workspace.style.setProperty("--ena-cloud-toolbar-height", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, [workspaceKey]);
  useEffect(() => {
    if (panelOpen && !dialog.current?.open) dialog.current?.showModal();
    else if (!panelOpen && dialog.current?.open) dialog.current?.close();
  }, [panelOpen]);
  useEffect(() => {
    if (!dirty && !localOnlyWork) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, localOnlyWork]);
  const fail = useCallback((failure: unknown) => {
    const code = failure instanceof CloudRequestError ? failure.code : "unavailable";
    setErrorCode(code); setError(openEnaCloudErrorCopy(code, copy));
  }, [copy]);
  const refresh = useCallback(async () => {
    const generation = ++listGeneration.current;
    setLoading(true);
    try {
      const data = await request<OpenEnaCloudProjectList>(`/api/open-ena/projects${archived ? "?archived=true" : ""}`, accountId);
      if (alive.current && generation === listGeneration.current) setListing(data);
    } catch (failure) { if (alive.current && generation === listGeneration.current) fail(failure); }
    finally { if (alive.current && generation === listGeneration.current) setLoading(false); }
  }, [accountId, archived, fail]);
  useEffect(() => { if (panelOpen) void refresh(); }, [panelOpen, refresh]);
  function openPanel() {
    if (!current && title === copy.untitled && bridge.current?.defaultTitle) setTitle(bridge.current.defaultTitle.slice(0, 120));
    setPanelOpen(true);
  }
  async function save(asNew = false) {
    if (busy || !bridge.current) return;
    if (bridge.current.running) { setError(copy.waitForAnalysis); return; }
    const name = title.trim();
    if (!name) { openPanel(); return; }
    setBusy(true); setError(""); setErrorCode(""); setNotice("");
    const revision = changed.current;
    try {
      const snapshot = await bridge.current.capture().catch((failure: unknown) => {
        if (failure instanceof TypeError) throw new CloudRequestError(failure.message === "unfinished-model-input"
          ? "unfinished-model-input" : /limit|size/iu.test(failure.message) ? "too-large" : "invalid-snapshot");
        throw failure;
      });
      const create = asNew || !current;
      const fingerprint = `${name}:${snapshot.integritySha256}`;
      if (create && pendingCreate.current?.fingerprint !== fingerprint) pendingCreate.current = { id: crypto.randomUUID(), fingerprint };
      const stored = await request<OpenEnaCloudProjectSummary>(create ? "/api/open-ena/projects" : `/api/open-ena/projects/${current!.id}`,
        accountId, create ? "POST" : "PUT", { ...(create ? { id: pendingCreate.current!.id } : { revision: current!.revision }), title: name, snapshot });
      if (!alive.current) return;
      pendingCreate.current = null; setCurrent(stored); setNotice(copy.cloudSaved);
      if (changed.current === revision) setDirty(false);
      if (panelOpen) void refresh();
    } catch (failure) {
      if (!alive.current) return;
      fail(failure);
    } finally { if (alive.current) setBusy(false); }
  }
  async function openProject(project: OpenEnaCloudProjectSummary) {
    if (busy || ((dirty || localOnlyWork) && !window.confirm(localOnlyWork ? copy.localOnlyWarning : copy.openWarning))) return;
    setBusy(true); setError(""); setErrorCode(""); setNotice("");
    const revision = changed.current;
    try {
      const saved = await request<OpenEnaCloudProject>(`/api/open-ena/projects/${project.id}`, accountId);
      const restored = await restoreOpenEnaCloudWorkspace(saved.snapshot);
      if (!alive.current || (changed.current !== revision && !window.confirm(copy.localOnlyWarning))) return;
      setInitialCloud(restored); setCurrent(saved); setTitle(saved.title); setDirty(false); setLocalOnlyWork(false); setNotice(copy.projectLoaded);
      changed.current += 1; pendingCreate.current = null; setWorkspaceKey((value) => value + 1); setPanelOpen(false);
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof CloudRequestError) fail(failure);
      else { setErrorCode("invalid-snapshot"); setError(copy.invalidSnapshot); }
    } finally { if (alive.current) setBusy(false); }
  }
  function newWorkspace() {
    if (busy || ((dirty || localOnlyWork) && !window.confirm(localOnlyWork ? copy.localOnlyWarning : copy.openWarning))) return;
    setInitialCloud(undefined); setCurrent(null); setTitle(copy.untitled); setDirty(false); setLocalOnlyWork(false); setNotice(""); setError(""); setErrorCode("");
    changed.current += 1; pendingCreate.current = null; setWorkspaceKey((value) => value + 1); setPanelOpen(false);
  }
  async function archiveProject(project: OpenEnaCloudProjectSummary) {
    if (busy || (!project.archived && !window.confirm(copy.archiveWarning))) return;
    setBusy(true); setError(""); setErrorCode("");
    try {
      const saved = await request<OpenEnaCloudProjectSummary>(`/api/open-ena/projects/${project.id}`, accountId, "PATCH", { revision: project.revision, archived: !project.archived });
      if (!alive.current) return;
      if (current?.id === project.id) {
        if (saved.archived) { setCurrent(null); setDirty(true); changed.current += 1; }
        else setCurrent(saved);
      }
      setNotice(saved.archived ? copy.archiveDone : copy.restoreDone); void refresh();
    } catch (failure) { if (alive.current) fail(failure); }
    finally { if (alive.current) setBusy(false); }
  }
  async function renameProject(project: OpenEnaCloudProjectSummary) {
    if (busy) return;
    const next = window.prompt(copy.projectTitle, project.title)?.trim();
    if (!next || next === project.title) return;
    setBusy(true); setError(""); setErrorCode("");
    try {
      const saved = await request<OpenEnaCloudProjectSummary>(`/api/open-ena/projects/${project.id}`, accountId, "PATCH", { revision: project.revision, title: next });
      if (!alive.current) return;
      if (current?.id === project.id) { setCurrent(saved); setTitle(saved.title); }
      void refresh();
    } catch (failure) { if (alive.current) fail(failure); }
    finally { if (alive.current) setBusy(false); }
  }
  async function deleteProject(project: OpenEnaCloudProjectSummary) {
    if (busy || !project.archived || !window.confirm(copy.deleteWarning.replace("{name}", project.title))) return;
    setBusy(true); setError(""); setErrorCode("");
    try {
      await request(`/api/open-ena/projects/${project.id}`, accountId, "DELETE", { revision: project.revision });
      if (!alive.current) return;
      if (current?.id === project.id) { setCurrent(null); setDirty(true); changed.current += 1; }
      setNotice(copy.deleteDone); void refresh();
    } catch (failure) { if (alive.current) fail(failure); }
    finally { if (alive.current) setBusy(false); }
  }
  const time = (value: string) => new Date(value).toLocaleString(locale === "zh-hans" ? "zh-CN" : locale === "zh-hant" ? "zh-HK" : "en");
  const savedLabel = current ? copy.saved.replace("{time}", time(current.updatedAt)).replace("{revision}", String(current.revision)) : copy.local;
  const used = listing ? copy.storage.replace("{count}", String(listing.projectCount)).replace("{limit}", String(listing.limits.projects))
    .replace("{used}", (listing.usedBytes / 1024 / 1024).toFixed(1)).replace("{total}", String(listing.limits.bytes / 1024 / 1024)) : "";
  const controls = <section ref={controlsElement} className="open-ena-cloud-controls" aria-label={copy.cloudProjects}>
    <div className="open-ena-cloud-bar">
      <button type="button" onClick={openPanel} aria-haspopup="dialog">{copy.cloudProjects}</button>
      <div className="open-ena-cloud-current"><strong>{current?.title ?? copy.local}</strong><span>{dirty ? copy.unsaved : savedLabel}{localOnlyWork ? ` · ${copy.localOnlyLabel}` : ""}</span></div>
      <button type="button" className="open-ena-cloud-save" onClick={() => current ? void save() : openPanel()} disabled={busy}>{busy ? copy.working : copy.save}</button>
    </div>
    <div className="open-ena-cloud-status" aria-live="polite">{error ? <p role="alert">{error}
      {errorCode === "unauthenticated" || errorCode === "registered-account-required" || errorCode === "account-changed" ? <> <Link href={`/${locale}/open-ena?reauth=1`}>{copy.signIn}</Link></> : null}
      {errorCode === "conflict" ? <> <button type="button" onClick={() => void save(true)} disabled={busy}>{copy.saveCopy}</button> <button type="button" onClick={() => current && void openProject(current)} disabled={busy}>{copy.open}</button></> : null}
    </p> : notice ? <span className="sr-only">{notice}</span> : null}</div>
    <dialog ref={dialog} className="open-ena-project-dialog" aria-labelledby={`${id}-title`} onCancel={() => setPanelOpen(false)} onClose={() => setPanelOpen(false)}>
      <header><div><h2 id={`${id}-title`}>{copy.cloudProjects}</h2><p>{accountEmail ?? copy.cloudReady}</p></div><button type="button" onClick={() => setPanelOpen(false)}>{copy.close}</button></header>
      <div className="open-ena-project-save-form">
        <label htmlFor={`${id}-name`}>{copy.projectTitle}</label><input id={`${id}-name`} value={title} maxLength={120} onChange={(event) => { setTitle(event.target.value); dirtyChange(); }} disabled={busy} />
        <p>{copy.disclosure}</p><p>{copy.localOnlyDisclosure}</p><div className="open-ena-project-actions"><button type="button" className="open-ena-cloud-save" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? copy.working : copy.save}</button>
          {current ? <button type="button" disabled={busy || !title.trim()} onClick={() => void save(true)}>{copy.saveCopy}</button> : null}
          <button type="button" disabled={busy} onClick={newWorkspace}>{copy.newWorkspace}</button></div>
      </div>
      {error ? <p className="open-ena-login-error" role="alert">{error}</p> : notice ? <p role="status">{notice}</p> : null}
      <div className="open-ena-project-list-heading"><div className="open-ena-project-tabs"><button type="button" aria-pressed={!archived} onClick={() => setArchived(false)}>{copy.showActive}</button><button type="button" aria-pressed={archived} onClick={() => setArchived(true)}>{copy.archived}</button></div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>{copy.refresh}</button></div>
      {loading ? <p role="status">{copy.loading}</p> : <ul className="open-ena-project-list">{listing?.projects.length ? listing.projects.map((project) => <li key={project.id}>
        <div><strong>{project.title}</strong><small>{time(project.updatedAt)} · v{project.revision} · {(project.bytes / 1024).toFixed(0)} KiB</small></div>
        <div className="open-ena-project-actions"><button type="button" disabled={busy || project.archived} onClick={() => void openProject(project)} aria-label={`${copy.open} ${project.title}`}>{copy.open}</button>
          {!project.archived ? <button type="button" disabled={busy} onClick={() => void renameProject(project)} aria-label={`${copy.rename} ${project.title}`}>{copy.rename}</button> : null}
          <button type="button" disabled={busy} onClick={() => void archiveProject(project)} aria-label={`${project.archived ? copy.restore : copy.archive} ${project.title}`}>{project.archived ? copy.restore : copy.archive}</button>
          {project.archived ? <button type="button" className="open-ena-project-delete" disabled={busy} onClick={() => void deleteProject(project)} aria-label={`${copy.deleteProject} ${project.title}`}>{copy.deleteProject}</button> : null}</div>
      </li>) : <li className="open-ena-project-empty">{copy.empty}</li>}</ul>}
      <footer><p>{used}</p><p>{copy.limits}</p></footer>
    </dialog>
  </section>;
  return <OpenEnaWorkspace {...workspaceProps} key={workspaceKey} initialCloudWorkspace={initialCloud} cloudBridge={bridge} cloudControls={controls} onCloudChange={dirtyChange} onLocalOnlyWorkChange={localOnlyChange} />;
}
