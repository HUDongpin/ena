"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import type { PluginProposalState, PluginProposalSubmission } from "@/lib/plugin-lab/proposal";
import { pluginProposalStateLabel } from "@/lib/plugin-lab/i18n";
import { getPluginWorkflowCopy, pluginWorkflowDate, pluginWorkflowTemplate } from "@/lib/plugin-lab/workflow-i18n";
import { workflowJson } from "./workflow-client";

interface OperatorRecord {
  proposalId: string; state: PluginProposalState; createdAt: string; updatedAt: string;
  track: string; visibility: string; emailConfirmed: boolean; publicConsentStatus: string; publicModerationStatus: string;
  submission: PluginProposalSubmission;
  awaitingReplyReview: boolean;
  messages: readonly { messageId: string; actor: string; text: string; createdAt: string }[];
  notifications: readonly { id: string; kind: string; target: string; status: "pending" | "sending" | "sent" | "failed"; attempts: number; createdAt: string; sentAt?: string | null }[];
}
const nextStates: Readonly<Record<PluginProposalState, readonly PluginProposalState[]>> = {
  received: ["under-review", "withdrawn"], "under-review": ["needs-information", "selected", "not-selected", "withdrawn"],
  "needs-information": ["under-review", "selected", "not-selected", "withdrawn"], selected: ["withdrawn"], "not-selected": [], withdrawn: [],
};

function OperatorTransition({ record, locale, disabled, onSave }: { record: OperatorRecord; locale: Locale; disabled: boolean; onSave: (record: OperatorRecord, to: string, reason: string, researcherMessage: string) => Promise<boolean> }) {
  const copy = getPluginWorkflowCopy(locale);
  const [to, setTo] = useState(""); const [reason, setReason] = useState(""); const [message, setMessage] = useState("");
  const messageRequired = to === "needs-information" || to === "not-selected";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onSave(record, to, reason, message)) { setTo(""); setReason(""); setMessage(""); }
  }
  return <form onSubmit={submit} className="plugin-operator-transition">
    <label>{copy.nextState}<select name="to" required value={to} disabled={disabled} onChange={(event) => { setTo(event.target.value); setMessage(""); }}><option value="" disabled>{copy.selectState}</option>{nextStates[record.state].map((state) => <option key={state} value={state}>{pluginProposalStateLabel(state, locale)}</option>)}</select></label>
    <label>{copy.internalReason}<input type="text" name="reason" maxLength={500} required value={reason} disabled={disabled} onChange={(event) => setReason(event.target.value)} aria-describedby={`reason-help-${record.proposalId}`} /><span className="plugin-field-help" id={`reason-help-${record.proposalId}`}>{copy.internalReasonHint}</span></label>
    <label className="plugin-researcher-message">{copy.researcherMessage}{messageRequired ? " *" : ` (${copy.optional})`}<textarea name="researcherMessage" maxLength={5000} rows={3} required={messageRequired} value={message} disabled={disabled} onChange={(event) => setMessage(event.target.value)} aria-describedby={`message-help-${record.proposalId}`} /><span className="plugin-field-help" id={`message-help-${record.proposalId}`}>{copy.researcherMessageHint}</span></label>
    <button type="submit" className="button button-primary" disabled={disabled}>{copy.recordTransition}</button>
  </form>;
}

export default function PluginOperatorInbox({ records, csrf, locale }: { records: readonly OperatorRecord[]; csrf: string; locale: Locale }) {
  const copy = getPluginWorkflowCopy(locale);
  const router = useRouter();
  const [busyId, setBusyId] = useState(""); const busyRef = useRef(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""); const [state, setState] = useState(""); const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [rotatedCode, setRotatedCode] = useState<{ proposalId: string; accessCode: string } | null>(null);
  const [retentionPreview, setRetentionPreview] = useState<readonly { proposalId: string; state: string; updatedAt: string }[] | null>(null);
  const filtered = records.filter((record) => (!state || record.state === state) && (!awaitingOnly || record.awaitingReplyReview) && `${record.submission.title} ${record.proposalId}`.toLowerCase().includes(search.trim().toLowerCase()));

  // Serialize operations across cards so late responses cannot replace another result.
  function beginOperation(id: string) { if (busyRef.current) return false; busyRef.current = true; setBusyId(id); setError(""); setNotice(""); return true; }
  function finishOperation() { busyRef.current = false; setBusyId(""); }

  async function transition(record: OperatorRecord, to: string, reason: string, researcherMessage: string) {
    if (!beginOperation(record.proposalId)) return false;
    try {
      const response = await fetch(`/api/plugin-lab/operator/proposals/${encodeURIComponent(record.proposalId)}/transition`, { method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf }, body: JSON.stringify({ from: record.state, to, reason, researcherMessage }) });
      if (!response.ok) { setError(copy.transitionFailed); return false; }
      setNotice(copy.transitionSaved); router.refresh(); return true;
    } catch { setError(copy.transitionFailed); return false; }
    finally { finishOperation(); }
  }

  async function action(record: OperatorRecord, endpoint: string, value: string) {
    if (!beginOperation(record.proposalId)) return;
    if (endpoint === "access-code") setRotatedCode(null);
    try {
      const response = await fetch(`/api/plugin-lab/operator/proposals/${encodeURIComponent(record.proposalId)}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf }, body: JSON.stringify({ action: value }) });
      const result = await workflowJson(response);
      if (!response.ok) { setError(copy.transitionFailed); return; }
      if (endpoint === "access-code" && typeof result.accessCode === "string") setRotatedCode({ proposalId: record.proposalId, accessCode: result.accessCode });
      else router.refresh();
    } catch { setError(copy.transitionFailed); }
    finally { finishOperation(); }
  }

  async function previewRetention() {
    if (!beginOperation("retention-preview")) return;
    try {
      const before = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch("/api/plugin-lab/operator/retention-preview", { method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf }, body: JSON.stringify({ action: "preview", before }) });
      const result = await workflowJson(response);
      if (!response.ok || !Array.isArray(result.candidates)) { setError(copy.requestFailed); return; }
      setRetentionPreview(result.candidates as { proposalId: string; state: string; updatedAt: string }[]);
    } catch { setError(copy.requestFailed); }
    finally { finishOperation(); }
  }

  async function copyManualEmail(record: OperatorRecord) {
    const message = ["ENA Plugin Lab", `${copy.proposalId}: ${record.proposalId}`, `${copy.currentStatus}: ${pluginProposalStateLabel(record.state, locale)}`, `${copy.myProposals}: https://www.ena.hk/${locale}/plugins/status`, "", copy.statusIntro, copy.legacyIntro].join("\n");
    try { await navigator.clipboard.writeText(message); setNotice(copy.copied); }
    catch { setNotice(copy.copyUnavailable); }
  }
  function consentLabel(value: string) {
    return ({ pending: copy.pendingLabel, approved: copy.approvedLabel, "not-requested": copy.notRequestedLabel, requested: copy.requestedLabel, confirmed: copy.confirmedLabel, withdrawn: copy.withdrawnLabel } as Record<string, string>)[value] ?? copy.noValue;
  }

  return <div className="plugin-operator-inbox" lang={copy.fallback ? "en" : undefined}>
    <div className="plugin-operator-filters"><label>{copy.search}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>{copy.stateFilter}<select value={state} onChange={(event) => setState(event.target.value)}><option value="">{copy.allStates}</option>{Object.keys(nextStates).map((value) => <option key={value} value={value}>{pluginProposalStateLabel(value as PluginProposalState, locale)}</option>)}</select></label><label className="plugin-form-check"><input type="checkbox" checked={awaitingOnly} onChange={(event) => setAwaitingOnly(event.target.checked)} />{copy.awaitingOnly}</label></div>
    {error ? <p className="plugin-form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {rotatedCode ? <aside className="plugin-receipt" role="status"><strong>{copy.replacementCode}</strong><p>{copy.proposalId}: <code>{rotatedCode.proposalId}</code></p><p>{copy.accessCode}: <code>{rotatedCode.accessCode}</code></p><p>{copy.replacementHint}</p></aside> : null}
    {!filtered.length ? <p>{copy.noMatches}</p> : filtered.map((record) => <article className="plugin-operator-card" key={record.proposalId}>
      <header><div><p className="eyebrow">{record.proposalId}</p><h2>{record.submission.title}</h2></div><span className="plugin-operator-state">{pluginProposalStateLabel(record.state, locale)}</span></header>
      {record.awaitingReplyReview ? <p className="plugin-awaiting-reply">{copy.awaitingOnly}</p> : null}
      <dl className="plugin-operator-facts"><div><dt>{copy.contact}</dt><dd>{record.submission.name || copy.noValue} · {record.submission.email}</dd></div><div><dt>{copy.emailConfirmedLabel}</dt><dd>{record.emailConfirmed ? copy.yes : copy.no}</dd></div><div><dt>{copy.collaborationTrack}</dt><dd>{record.track === "academic" ? copy.academic : record.track === "commissioned" ? copy.commissioned : copy.unsure}</dd></div><div><dt>{copy.reviewVisibility}</dt><dd>{record.visibility === "private" ? copy.visibilityPrivate : copy.visibilityPublic}</dd></div><div><dt>{copy.moderation}</dt><dd>{consentLabel(record.publicModerationStatus)}</dd></div><div><dt>{copy.publicConsent}</dt><dd>{consentLabel(record.publicConsentStatus)}</dd></div><div><dt>{copy.lastUpdated}</dt><dd><time dateTime={record.updatedAt}>{pluginWorkflowDate(record.updatedAt, locale)}</time></dd></div></dl>
      <details><summary>{copy.originalSubmission}</summary>{[[copy.researchQuestion, record.submission.researchQuestion], [copy.proposedChange, record.submission.proposedChange], [copy.currentGap, record.submission.currentGap], [copy.unchangedBoundary, record.submission.unchangedBoundary], [copy.publicSummary, record.submission.publicSummary], [copy.privateDetails, record.submission.privateDetails], [copy.affiliationOptional, record.submission.affiliation]].filter(([, value]) => value).map(([label, value]) => <div key={label}><h3>{label}</h3><p>{value}</p></div>)}{record.submission.referenceLinks.length ? <ul>{record.submission.referenceLinks.map((link) => <li key={link}><a href={link} target="_blank" rel="noopener noreferrer">{link}</a></li>)}</ul> : null}</details>
      <section className="plugin-conversation"><h3>{copy.conversation}</h3>{record.messages.length ? <ol>{record.messages.map((message) => <li key={message.messageId} data-actor={message.actor}><div><strong>{message.actor === "operator" ? copy.team : copy.researcherLabel}</strong><time dateTime={message.createdAt}>{pluginWorkflowDate(message.createdAt, locale)}</time></div><p>{message.text}</p></li>)}</ol> : <p className="plugin-field-help">{copy.noMessages}</p>}</section>
      {record.notifications.length ? <details className="plugin-delivery"><summary>{copy.delivery}{record.notifications.some((notification) => notification.status === "failed") ? ` · ${copy.deliveryFailure}` : ""}</summary>{record.notifications.some((notification) => notification.status === "failed") ? <p className="plugin-form-error">{copy.deliveryFailed}</p> : null}<ul>{record.notifications.map((notification) => <li key={notification.id}><span>{notification.kind === "received" ? copy.notificationReceived : notification.kind === "reply" ? copy.notificationReply : copy.notificationStatus}</span><span>{({ pending: copy.deliveryPending, sending: copy.deliverySending, sent: copy.deliverySent, failed: copy.deliveryFailure })[notification.status]}</span><span>{copy.attempts}: {notification.attempts}</span><time dateTime={notification.sentAt ?? notification.createdAt}>{pluginWorkflowDate(notification.sentAt ?? notification.createdAt, locale)}</time></li>)}</ul></details> : null}
      <div className="plugin-operator-actions"><button type="button" className="button button-secondary" onClick={() => copyManualEmail(record)}>{copy.copyEmail}</button><button type="button" className="button button-secondary" disabled={busyId !== ""} onClick={() => action(record, "access-code", "rotate")}>{copy.rotateCode}</button>{record.state === "selected" && record.visibility === "public-after-review" && !record.emailConfirmed ? <button type="button" className="button button-secondary" disabled={busyId !== ""} onClick={() => action(record, "email-confirmation", "confirm-email")}>{copy.recordVerified}</button> : null}{record.state === "selected" && record.visibility === "public-after-review" && record.emailConfirmed && record.publicModerationStatus === "pending" && record.publicConsentStatus === "not-requested" ? <button type="button" className="button button-secondary" disabled={busyId !== ""} onClick={() => action(record, "public-consent", "request")}>{copy.requestConsent}</button> : null}</div>
      {nextStates[record.state].length ? <OperatorTransition key={`${record.proposalId}:${record.state}`} record={record} locale={locale} disabled={busyId !== ""} onSave={transition} /> : <p>{copy.terminal}</p>}
    </article>)}
    <details className="plugin-retention-preview"><summary>{copy.retentionTitle}</summary><p>{copy.retentionHint}</p><button type="button" className="button button-secondary" disabled={busyId !== ""} onClick={previewRetention}>{copy.retentionAction}</button>{retentionPreview ? <div role="status"><p>{pluginWorkflowTemplate(copy.retentionResult, { count: retentionPreview.length })}</p>{retentionPreview.length ? <ul>{retentionPreview.map((candidate) => <li key={candidate.proposalId}><code>{candidate.proposalId}</code> · {pluginProposalStateLabel(candidate.state as PluginProposalState, locale)} · <time dateTime={candidate.updatedAt}>{pluginWorkflowDate(candidate.updatedAt, locale)}</time></li>)}</ul> : null}</div> : null}</details>
  </div>;
}
