"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { NovaEffort, NovaEvent, NovaModel, NovaModelKey, NovaSession, NovaSessionSummary } from "@/lib/nova/types";
import { novaIdentityTag } from "@/lib/nova/identity";
import { DEFAULT_NOVA_EFFORT, DEFAULT_NOVA_MODEL, NOVA_MODELS } from "@/lib/nova/models";
import type { VerifiedEmailSession } from "@/components/plugin-lab/workflow-client";
import { NOVA_PREFERENCES_KEY, novaSessionIdFromSearch, novaWrite, novaWriteAmbiguous, parseNovaPreferences, type NovaWrite } from "./client";
import { getNovaCopy } from "./copy";

async function json(response: Response) { try { return await response.json(); } catch { return {}; } }
export function useNova(locale: Locale) {
  const copy = getNovaCopy(locale);
  const [identity, setIdentity] = useState<VerifiedEmailSession | null>(null);
  const [email, setEmail] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [models, setModels] = useState<NovaModel[]>(() => NOVA_MODELS.map((model) => ({ ...model, available: false })));
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [modelKey, setModelKey] = useState<NovaModelKey>(DEFAULT_NOVA_MODEL);
  const [effort, setEffort] = useState<NovaEffort>(DEFAULT_NOVA_EFFORT);
  const [draft, setDraft] = useState("");
  const [sessions, setSessions] = useState<NovaSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<NovaSession | null>(null);
  const [events, setEvents] = useState<NovaEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const writeErrorCode = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<NovaWrite | null>(null);
  const pendingRef = useRef<NovaWrite | null>(null);
  const owner = useRef("");
  const lastOwner = useRef("");
  const generation = useRef(0);
  const operation = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const requestedSessionRef = useRef<string | null>(null);
  const copyRef = useRef(copy); copyRef.current = copy;
  const setAttempt = useCallback((value: NovaWrite | null) => { pendingRef.current = value; setPending(value); }, []);
  const identityHeaders = useCallback(async (capturedOwner: string, serial: number, signal?: AbortSignal) => {
    if (!capturedOwner) return null;
    const tag = await novaIdentityTag(capturedOwner);
    // Crypto yields: account or selected-session changes must invalidate this request too.
    if (signal?.aborted || serial !== generation.current || capturedOwner !== owner.current) return null;
    return { "x-nova-identity": tag };
  }, []);

  const updateSessionUrl = useCallback((id: string | null) => {
    const url = new URL(window.location.href); url.searchParams.delete("session");
    if (id) url.searchParams.set("session", id);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const unavailableSession = useCallback(() => {
    generation.current += 1; selectedRef.current = null; requestedSessionRef.current = null;
    setSelectedId(null); setSession(null); setEvents([]); setLoading(false); updateSessionUrl(null); setRefreshTick((value) => value + 1);
    setError(copyRef.current.sessionUnavailable);
  }, [updateSessionUrl]);

  const changeIdentity = useCallback((value: VerifiedEmailSession | null) => {
    const next = value?.email.trim().toLowerCase() ?? "";
    if (next !== owner.current) {
      generation.current += 1; setSession(null); setSessions([]); setEvents([]); setLoading(false);
      if (next && lastOwner.current && next !== lastOwner.current) {
        setDraft(""); setAttempt(null); selectedRef.current = null; requestedSessionRef.current = null; setSelectedId(null); updateSessionUrl(null); setError("");
      }
      owner.current = next;
      if (next) lastOwner.current = next;
    }
    setIdentity(value);
    if (value) {
      setEmail(value.email); setAuthOpen(false);
      // A fresh page has no previous account in memory: the owned API decides whether
      // this opaque URL reference belongs to the newly verified identity.
      if (requestedSessionRef.current && !selectedRef.current) {
        selectedRef.current = requestedSessionRef.current; setSelectedId(requestedSessionRef.current); requestedSessionRef.current = null;
      }
    }
  }, [setAttempt, updateSessionUrl]);

  const discoverIdentity = useCallback(async () => {
    const serial = generation.current;
    try {
      const response = await fetch("/api/plugin-lab/session", { cache: "no-store" });
      const data = await json(response);
      if (serial !== generation.current) return;
      if (response.ok && typeof data.email === "string" && typeof data.expiresAt === "string") changeIdentity({ email: data.email, expiresAt: data.expiresAt });
      else if (response.status === 401) { changeIdentity(null); if (requestedSessionRef.current || selectedRef.current) setAuthOpen(true); }
    } catch { /* A failed identity check does not assert a new account. API authorization remains authoritative. */ }
  }, [changeIdentity]);

  useEffect(() => {
    requestedSessionRef.current = novaSessionIdFromSearch(window.location.search);
    if (new URLSearchParams(window.location.search).has("session") && !requestedSessionRef.current) updateSessionUrl(null);
    try { const saved = parseNovaPreferences(window.localStorage.getItem(NOVA_PREFERENCES_KEY));
      if (saved) { setModelKey(saved.modelKey); setEffort(saved.effort); }
    } catch { /* Storage may be disabled; use the default preferences. */ }
    const controller = new AbortController();
    void fetch("/api/nova/models", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await json(response);
      if (response.ok && Array.isArray(data.models)) { setModels(data.models); setEnabled(data.enabled === true && data.runtimeConfigured !== false); }
      else setEnabled(false);
    }).catch(() => { if (!controller.signal.aborted) setEnabled(false); });
    void discoverIdentity();
    const onFocus = () => { void discoverIdentity(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 10000);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [discoverIdentity, updateSessionUrl]);

  function preference(nextModel: NovaModelKey, nextEffort: NovaEffort) {
    setModelKey(nextModel); setEffort(nextEffort);
    try { window.localStorage.setItem(NOVA_PREFERENCES_KEY, JSON.stringify({ modelKey: nextModel, effort: nextEffort })); } catch { /* Preferences are optional. */ }
  }

  const loadList = useCallback(async (signal?: AbortSignal) => {
    const serial = generation.current; const currentOwner = owner.current;
    if (!currentOwner) return;
    try {
      const headers = await identityHeaders(currentOwner, serial, signal); if (!headers) return;
      const response = await fetch("/api/nova/sessions", { cache: "no-store", signal, headers }); const data = await json(response);
      if (signal?.aborted || serial !== generation.current || currentOwner !== owner.current) return;
      if (response.status === 401) { changeIdentity(null); setAuthOpen(true); setError(copyRef.current.expired); return; }
      if (response.ok && Array.isArray(data.sessions)) setSessions(data.sessions);
      else setError(copyRef.current.unavailable);
    } catch { if (!signal?.aborted && serial === generation.current) setError(copyRef.current.unavailable); }
  }, [changeIdentity, identityHeaders]);

  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController(); void loadList(controller.signal);
    return () => controller.abort();
  }, [identity?.email, loadList, refreshTick]);

  useEffect(() => {
    if (!selectedId || !identity) return;
    const controller = new AbortController();
    const serial = generation.current; const capturedOwner = owner.current; let cursor = 0; let refreshPending = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const valid = () => !controller.signal.aborted && generation.current === serial && owner.current === capturedOwner;
    async function readSession() {
      const headers = await identityHeaders(capturedOwner, serial, controller.signal); if (!headers) return false;
      const response = await fetch(`/api/nova/sessions/${selectedId}`, { cache: "no-store", signal: controller.signal, headers }); const data = await json(response);
      if (!valid()) return false;
      if (response.status === 401) { changeIdentity(null); setAuthOpen(true); setError(copyRef.current.expired); return false; }
      if (response.status === 404) { unavailableSession(); return false; }
      if (!response.ok || !data.session) { setError(copyRef.current.requestFailed); return false; }
      setSession(data.session); if (!pendingRef.current) setError(""); return true;
    }
    async function poll(initial = false) {
      try {
        if (initial) { setLoading(true); refreshPending = !await readSession(); }
        if (!valid()) return;
        const headers = await identityHeaders(capturedOwner, serial, controller.signal); if (!headers) return;
        const response = await fetch(`/api/nova/sessions/${selectedId}/events?after=${cursor}`, { cache: "no-store", signal: controller.signal, headers }); const data = await json(response);
        if (!valid()) return;
        if (response.status === 401) { changeIdentity(null); setAuthOpen(true); setError(copyRef.current.expired); return; }
        if (response.status === 404) { unavailableSession(); return; }
        if (response.ok && Array.isArray(data.events)) {
          const incoming: NovaEvent[] = data.events;
          if (incoming.length || refreshPending) {
            refreshPending = true;
            // Do not acknowledge events until their session snapshot is visible. A failed
            // final refresh must be retried even when no later events are produced.
            if (!await readSession()) return;
            refreshPending = false;
            setEvents((previous) => [...previous, ...incoming.filter((item) => !previous.some((old) => old.cursor === item.cursor))].slice(-200));
            if (incoming.length) void loadList(controller.signal);
          }
          cursor = typeof data.cursor === "number" ? data.cursor : cursor;
        }
      } catch { if (valid()) setError(copyRef.current.unavailable); }
      finally { if (valid()) { setLoading(false); timer = setTimeout(() => void poll(), 2000); } }
    }
    void poll(true);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [selectedId, identity?.email, changeIdentity, loadList, identityHeaders, refreshTick, unavailableSession]);

  function select(id: string | null) {
    if (operation.current || pendingRef.current?.ambiguous) return;
    generation.current += 1; requestedSessionRef.current = null; selectedRef.current = id; setSelectedId(id); updateSessionUrl(id); setSession(null); setEvents([]); setError("");
  }

  async function write(path: string, value: unknown): Promise<{ session?: NovaSession; run?: unknown } | null> {
    writeErrorCode.current = null;
    if (!owner.current) { writeErrorCode.current = "researcher-required"; setAuthOpen(true); return null; }
    let attempt: NovaWrite;
    try { attempt = novaWrite(pendingRef.current, path, value, owner.current, () => crypto.randomUUID()); }
    catch { writeErrorCode.current = "pending-write"; setError(copyRef.current.pending); return null; }
    const serial = generation.current; setAttempt(attempt);
    try {
      const headers = await identityHeaders(attempt.owner, serial); if (!headers) return null;
      const response = await fetch(path, { method: "POST", headers: { ...headers, "content-type": "application/json", "idempotency-key": attempt.key }, body: attempt.body });
      const data = await json(response);
      if (serial !== generation.current || attempt.owner !== owner.current) return null;
      if (!response.ok || !data.session) {
        writeErrorCode.current = typeof data.code === "string" ? data.code : "request-failed";
        const ambiguous = attempt.ambiguous || novaWriteAmbiguous(response.status, data.code) || response.ok;
        setAttempt({ ...attempt, ambiguous });
        if (response.status === 401) { changeIdentity(null); setAuthOpen(true); setError(copyRef.current.expired); }
        else if (data.code === "stale-expert-request") { setError(copyRef.current.reviewChanged); setRefreshTick((value) => value + 1); }
        else setError(ambiguous ? copyRef.current.pending : copyRef.current.requestFailed);
        return null;
      }
      setAttempt(null); setError(""); setSession(data.session);
      selectedRef.current = data.session.id; requestedSessionRef.current = null; setSelectedId(data.session.id); updateSessionUrl(data.session.id);
      void loadList(); return data;
    } catch {
      if (serial === generation.current) { writeErrorCode.current = "network-error"; setAttempt({ ...attempt, ambiguous: true }); setError(copyRef.current.pending); }
      return null;
    }
  }

  async function perform(action: () => Promise<unknown>) {
    if (operation.current) return;
    operation.current = true; setBusy(true);
    try { await action(); } finally { operation.current = false; setBusy(false); }
  }

  async function send() {
    if (!draft.trim()) return;
    if (!identity) { setAuthOpen(true); return; }
    const content = draft.trim(); const submittingOwner = owner.current; const serial = generation.current;
    await perform(async () => {
      if (serial !== generation.current || submittingOwner !== owner.current) return;
      let id = selectedRef.current;
      if (!id) { const created = await write("/api/nova/sessions", { locale }); if (!created?.session) return; id = created.session.id; }
      if (serial !== generation.current || submittingOwner !== owner.current) return;
      const result = await write(`/api/nova/sessions/${id}/messages`, { content, modelKey, effort });
      if (result && serial === generation.current && submittingOwner === owner.current) setDraft((current) => current.trim() === content ? "" : current);
    });
  }
  async function retryPending() {
    const attempt = pendingRef.current; if (!attempt) return;
    await perform(async () => {
      const result = await write(attempt.path, JSON.parse(attempt.body));
      if (result?.run) { const sent = JSON.parse(attempt.body).content; setDraft((current) => current.trim() === sent ? "" : current); }
    });
  }
  async function mutate(suffix: string, body: unknown) {
    if (!selectedRef.current) return;
    let completed = false;
    await perform(async () => { completed = !!await write(`/api/nova/sessions/${selectedRef.current}/${suffix}`, body); });
    return completed;
  }
  async function signOut() {
    await perform(async () => {
      try {
        const response = await fetch("/api/plugin-lab/session", { method: "DELETE" });
        if (!response.ok) { setError(copyRef.current.requestFailed); return; }
        changeIdentity(null); lastOwner.current = ""; setEmail(""); setDraft(""); setAttempt(null); selectedRef.current = null; requestedSessionRef.current = null; setSelectedId(null); updateSessionUrl(null); setAuthOpen(false); setError("");
      } catch { setError(copyRef.current.requestFailed); }
    });
  }
  async function download(artifactId: string) {
    if (!selectedRef.current) return;
    const serial = generation.current; const capturedOwner = owner.current; const sessionId = selectedRef.current;
    try {
      const headers = await identityHeaders(capturedOwner, serial); if (!headers) return;
      const response = await fetch(`/api/nova/sessions/${sessionId}/artifacts/${artifactId}?download=1`, { cache: "no-store", headers });
      if (serial !== generation.current) return;
      if (response.status === 401) { changeIdentity(null); setAuthOpen(true); return; }
      if (!response.ok) throw new Error("download-failed");
      const blob = await response.blob(); if (serial !== generation.current) return;
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url;
      const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/u)?.[1];
      anchor.download = filename || "nova-plugin-draft.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (serial === generation.current) setError(copyRef.current.downloadFailed); }
  }
  return { identity, email, setEmail, changeIdentity, authOpen, setAuthOpen, models, enabled, modelKey, effort, preference, draft, setDraft, sessions, selectedId, session, events, busy, loading, error, pending, select, send, mutate, retryPending, signOut, download, lastWriteError: () => writeErrorCode.current };
}
