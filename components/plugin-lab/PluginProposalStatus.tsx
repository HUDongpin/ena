"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import type { PluginProposalDetailView, PluginProposalSummaryView } from "@/lib/plugin-lab/workflow-view";
import { pluginProposalMessageLabel, pluginProposalStateLabel } from "@/lib/plugin-lab/i18n";
import { getPluginWorkflowCopy, pluginWorkflowDate, pluginWorkflowError, pluginWorkflowNextStep } from "@/lib/plugin-lab/workflow-i18n";
import PluginEmailVerification from "./PluginEmailVerification";
import PluginPublicConsentControls from "./PluginPublicConsentControls";
import { containsWorkflowCredential, workflowAttempt, workflowJson, workflowWriteIsAmbiguous, type VerifiedEmailSession, type WorkflowAttempt } from "./workflow-client";

export default function PluginProposalStatus({ locale }: { locale: Locale }) {
  const copy = getPluginWorkflowCopy(locale);
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<VerifiedEmailSession | null>(null);
  const [access, setAccess] = useState<"email" | "legacy" | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [proposals, setProposals] = useState<PluginProposalSummaryView[]>([]);
  const [detail, setDetail] = useState<PluginProposalDetailView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [busy, setBusy] = useState<"load" | "legacy" | "signout" | "reply" | null>("load");
  const operation = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [legacyId, setLegacyId] = useState("");
  const [legacyCode, setLegacyCode] = useState("");
  const [legacyError, setLegacyError] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const replyAttempts = useRef<Record<string, WorkflowAttempt>>({});
  const [replyError, setReplyError] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function expired() { setAuthRequired(true); setSession(null); setError(copy.sessionExpired); }
  function choose(id: string | null) { selectedRef.current = id; setSelected(id); setReplyError(""); setReplyPending(!!(id && replyAttempts.current[id]?.ambiguous)); }

  async function readDetail(id: string, serial: number) {
    const response = await fetch(`/api/plugin-lab/proposals/${encodeURIComponent(id)}`, { cache: "no-store" });
    const result = await workflowJson(response);
    if (serial !== operation.current) return;
    if (response.status === 401) { expired(); return; }
    if (!response.ok || !result.proposal) { setError(pluginWorkflowError(result.code, locale)); return; }
    const proposal = result.proposal as PluginProposalDetailView;
    if (proposal.proposalId !== id) { setError(copy.notFound); return; }
    setDetail(proposal); setAuthRequired(false); choose(id);
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }

  async function loadProposals(preferredId: string | null = selectedRef.current) {
    const serial = ++operation.current;
    setBusy("load"); setError("");
    try {
      const response = await fetch("/api/plugin-lab/proposals", { cache: "no-store" });
      const result = await workflowJson(response);
      if (serial !== operation.current) return;
      if (response.status === 401) { if (access) expired(); else { setAuthRequired(true); setSession(null); } return; }
      if (!response.ok || !Array.isArray(result.proposals)) { setError(pluginWorkflowError(result.code, locale)); return; }
      const records = result.proposals as PluginProposalSummaryView[];
      setProposals(records); setAccess(result.access === "legacy" ? "legacy" : "email"); setAuthRequired(false);
      const id = preferredId && records.some((record) => record.proposalId === preferredId) ? preferredId : records.length === 1 ? records[0].proposalId : null;
      if (id) await readDetail(id, serial);
      else { choose(null); setDetail(null); }
    } catch { if (serial === operation.current) setError(copy.unavailable); }
    finally { if (serial === operation.current) setBusy(null); }
  }

  useEffect(() => { void loadProposals(); return () => { operation.current += 1; }; }, []); // Initial discovery also supports legacy cookies.

  async function openProposal(id: string) {
    const serial = ++operation.current; setBusy("load"); setError(""); setNotice("");
    try { await readDetail(id, serial); }
    catch { if (serial === operation.current) setError(copy.unavailable); }
    finally { if (serial === operation.current) setBusy(null); }
  }

  function verified(next: VerifiedEmailSession | null) {
    setSession(next);
    if (next) { setEmail(next.email); void loadProposals(); }
  }

  async function legacyLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (!legacyId.trim() || !legacyCode.trim()) { setLegacyError(copy.legacyInvalid); return; }
    setBusy("legacy"); setLegacyError("");
    try {
      const response = await fetch("/api/plugin-lab/status-session", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ proposalId: legacyId.trim(), accessCode: legacyCode.trim(), locale }) });
      const result = await workflowJson(response);
      if (!response.ok || typeof result.proposalId !== "string") { setLegacyError(pluginWorkflowError(result.code ?? "invalid-access", locale)); return; }
      setLegacyCode(""); await loadProposals(result.proposalId);
    } catch { setLegacyError(copy.unavailable); }
    finally { setBusy(null); }
  }

  async function signOut() {
    if (busy) return;
    setBusy("signout"); setError("");
    try {
      const response = await fetch("/api/plugin-lab/session", { method: "DELETE" });
      if (!response.ok) { setError(copy.requestFailed); return; }
      operation.current += 1; setAuthRequired(true); setSession(null); setAccess(null); setProposals([]); setDetail(null); choose(null); setEmail(""); setLegacyId(""); setLegacyCode(""); setReplies({}); replyAttempts.current = {}; setNotice("");
    } catch { setError(copy.unavailable); }
    finally { setBusy(null); }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !detail || detail.state !== "needs-information") return;
    const id = detail.proposalId;
    const text = (replies[id] ?? "").trim();
    if (!text || text.length > 5000 || containsWorkflowCredential(text) || /[\u0000-\u001f\u007f]/u.test(text.replace(/\r?\n/gu, ""))) { setReplyError(copy.replyInvalid); replyRef.current?.focus(); return; }
    let current: WorkflowAttempt;
    try { current = workflowAttempt(replyAttempts.current[id] ?? null, JSON.stringify({ text }), () => crypto.randomUUID()); }
    catch { setReplyError(copy.pendingReply); return; }
    replyAttempts.current[id] = current;
    setBusy("reply"); setReplyError(""); setNotice("");
    try {
      const response = await fetch(`/api/plugin-lab/proposals/${encodeURIComponent(id)}/replies`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": current.key }, body: current.body });
      const result = await workflowJson(response);
      if (response.ok && result.proposalId === id) {
        setReplies((drafts) => ({ ...drafts, [id]: "" })); delete replyAttempts.current[id]; setReplyPending(false); setNotice(copy.replySent);
        setDetail((previous) => previous?.proposalId === id ? { ...previous, state: "under-review" } : previous);
        await loadProposals(id); return;
      }
      current.ambiguous ||= workflowWriteIsAmbiguous(response.status, result.code) || response.ok;
      setReplyPending(current.ambiguous);
      if (response.status === 401 || result.code === "verification-required") expired();
      setReplyError(pluginWorkflowError(result.code, locale));
    } catch { current.ambiguous = true; setReplyPending(true); setReplyError(copy.unavailable); }
    finally { setBusy(null); }
  }

  function submittedDetails(proposal: PluginProposalDetailView) {
    const submission = proposal.submission;
    const fields = [[copy.researchQuestion, submission.researchQuestion], [copy.proposedChange, submission.proposedChange], [copy.currentGap, submission.currentGap], [copy.unchangedBoundary, submission.unchangedBoundary], [copy.privateDetails, submission.privateDetails], [copy.publicSummary, submission.publicSummary], [copy.email, submission.email], [copy.nameOptional, submission.name], [copy.affiliationOptional, submission.affiliation], [copy.reviewVisibility, submission.visibility === "private" ? copy.visibilityPrivate : copy.visibilityPublic], [copy.collaborationTrack, submission.track === "academic" ? copy.academic : submission.track === "commissioned" ? copy.commissioned : copy.unsure]];
    return <details className="plugin-submitted-details"><summary>{copy.originalSubmission}</summary><dl>{fields.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{submission.referenceLinks.length ? <ul>{submission.referenceLinks.map((link) => <li key={link}><a href={link} target="_blank" rel="noopener noreferrer">{link}</a></li>)}</ul> : null}</details>;
  }

  return <div className="plugin-researcher-status" lang={copy.fallback ? "en" : undefined} aria-busy={!!busy}>
    {error ? <p className="plugin-form-error" role="alert">{error}</p> : null}
    {notice && !authRequired ? <p className="plugin-verified" role="status">{notice}</p> : null}
    {authRequired ? <section className="plugin-access-panel" aria-label={copy.privateAccess}>
      <PluginEmailVerification locale={locale} email={email} onEmailChange={setEmail} session={session} onSessionChange={verified} disabled={!!busy} />
      <details className="plugin-legacy-access"><summary>{copy.legacyTitle}</summary><p>{copy.legacyIntro}</p><form className="plugin-status-form" onSubmit={legacyLogin} noValidate>
        <label htmlFor="plugin-legacy-id">{copy.proposalId}<input id="plugin-legacy-id" name="proposalId" autoComplete="off" value={legacyId} onChange={(event) => setLegacyId(event.target.value)} required aria-invalid={!!legacyError} aria-describedby={legacyError ? "plugin-legacy-error" : undefined} /></label>
        <label htmlFor="plugin-legacy-code">{copy.accessCode}<input id="plugin-legacy-code" name="accessCode" type="password" autoComplete="off" value={legacyCode} onChange={(event) => setLegacyCode(event.target.value)} required aria-invalid={!!legacyError} aria-describedby={legacyError ? "plugin-legacy-error" : undefined} /></label>
        {legacyError ? <p className="plugin-form-error" id="plugin-legacy-error" role="alert">{legacyError}</p> : null}<button className="button button-secondary" disabled={!!busy} type="submit">{busy === "legacy" ? copy.opening : copy.viewStatus}</button>
      </form></details>
    </section> : <>
      <div className="plugin-status-toolbar"><div>{access === "legacy" ? <span>{copy.legacyAccess}</span> : null}{selected && proposals.length > 1 ? <button className="plugin-text-button" type="button" disabled={!!busy} onClick={() => { choose(null); setDetail(null); setNotice(""); }}>{copy.allProposals}</button> : null}</div><div className="button-row"><button className="button button-secondary" type="button" disabled={!!busy} onClick={() => void loadProposals()}>{busy === "load" ? copy.refreshing : copy.refresh}</button>{access ? <button className="plugin-text-button" type="button" disabled={!!busy} onClick={signOut}>{busy === "signout" ? copy.signingOut : copy.signOut}</button> : null}</div></div>
      {busy === "load" && !detail && !proposals.length ? <p role="status">{copy.loading}</p> : null}
      {!busy && access && !proposals.length ? <div className="plugin-empty-state"><p>{copy.noProposals}</p><a className="button button-primary" href={`/${locale}/plugins/propose`}>{copy.newIdea}</a></div> : null}
      {!selected && proposals.length ? <ul className="plugin-proposal-list">{proposals.map((proposal) => <li key={proposal.proposalId}><div><h2><button type="button" className="plugin-text-button" disabled={!!busy} onClick={() => openProposal(proposal.proposalId)}>{proposal.title}</button></h2><code>{proposal.proposalId}</code><p><time dateTime={proposal.updatedAt}>{pluginWorkflowDate(proposal.updatedAt, locale)}</time></p></div><span className="plugin-operator-state">{pluginProposalStateLabel(proposal.state, locale)}</span></li>)}</ul> : null}
      {selected && detail ? <article className="plugin-status-result">
        <header className="plugin-status-heading"><p className="eyebrow">{detail.proposalId}</p><h2 ref={headingRef} tabIndex={-1}>{detail.title}</h2><span className="plugin-operator-state">{pluginProposalStateLabel(detail.state, locale)}</span><p className="plugin-field-help">{copy.lastUpdated}: <time dateTime={detail.updatedAt}>{pluginWorkflowDate(detail.updatedAt, locale)}</time></p></header>
        <aside className="plugin-next-step"><strong>{copy.nextStep}</strong><p>{pluginWorkflowNextStep(detail.state, locale)}</p></aside>
        <section className="plugin-conversation" aria-labelledby="plugin-conversation-title"><h3 id="plugin-conversation-title">{copy.conversation}</h3>{detail.messages.length ? <ol>{detail.messages.map((message) => <li key={message.messageId} data-actor={message.actor}><div><strong>{message.actor === "operator" ? copy.team : copy.researcher}</strong><time dateTime={message.createdAt}>{pluginWorkflowDate(message.createdAt, locale)}</time></div><p>{message.text}</p></li>)}</ol> : <p className="plugin-field-help">{copy.noMessages}</p>}</section>
        {detail.state === "needs-information" ? <form className="plugin-reply-form" onSubmit={reply} noValidate><h3>{copy.replyTitle}</h3><p>{copy.replyIntro}</p><label className="plugin-field" htmlFor="plugin-reply"><span>{copy.replyLabel}</span><textarea ref={replyRef} id="plugin-reply" name="text" rows={5} maxLength={5000} required value={replies[detail.proposalId] ?? ""} disabled={!!busy || replyPending} onChange={(event) => { setReplies((drafts) => ({ ...drafts, [detail.proposalId]: event.target.value })); setReplyError(""); }} aria-invalid={!!replyError} aria-describedby={`plugin-reply-help${replyError ? " plugin-reply-error" : ""}`} /></label><p className="plugin-field-help" id="plugin-reply-help">{copy.replyLimit}</p>{replyPending ? <p role="status">{copy.pendingReply}</p> : null}{replyError ? <p className="plugin-form-error" id="plugin-reply-error" role="alert">{replyError}</p> : null}<button type="submit" className="button button-primary" disabled={!!busy}>{busy === "reply" ? copy.sendingReply : replyPending ? copy.retryReply : copy.sendReply}</button></form> : null}
        {detail.publicPreview && (detail.publicConsentStatus === "requested" || detail.publicConsentStatus === "confirmed") ? <PluginPublicConsentControls proposalId={detail.proposalId} publicProjectionSha256={detail.publicPreview.publicProjectionSha256} title={detail.publicPreview.title} publicSummary={detail.publicPreview.publicSummary} locale={locale} consentStatus={detail.publicConsentStatus} onUpdated={() => loadProposals(detail.proposalId)} /> : null}
        {submittedDetails(detail)}
        <section className="plugin-status-timeline" aria-labelledby="plugin-timeline-title"><h3 id="plugin-timeline-title">{copy.timeline}</h3><ol>{detail.events.map((event, index) => <li key={`${event.recordedAt}-${index}`}><strong>{pluginProposalMessageLabel(event.messageCode, locale)}</strong><span>{pluginProposalStateLabel(event.state, locale)}</span><time dateTime={event.recordedAt}>{pluginWorkflowDate(event.recordedAt, locale)}</time></li>)}</ol></section>
      </article> : null}
    </>}
    <p className="plugin-back-link"><a href={`/${locale}/plugins`}>{copy.backCatalog}</a></p>
  </div>;
}
