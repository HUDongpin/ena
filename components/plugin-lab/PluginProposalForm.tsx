"use client";

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import type { Locale } from "@/lib/i18n";
import { getPluginWorkflowCopy, pluginWorkflowError } from "@/lib/plugin-lab/workflow-i18n";
import PluginEmailVerification from "./PluginEmailVerification";
import { usePluginProposalSession } from "./PluginProposalSession";
import { focusFirstWorkflowError, proposalPayload, proposalTextLimits, validateProposalDraft, verifiedForEmail, workflowAttempt, workflowJson, workflowWriteIsAmbiguous, type DraftErrors, type ProposalDraft, type ProposalTextField, type WorkflowAttempt } from "./workflow-client";

export default function PluginProposalForm({ locale }: { locale: Locale }) {
  const copy = getPluginWorkflowCopy(locale);
  const { draft, setDraft, session, setSession, receipt, setReceipt, busy, setBusy, pending, setPending, attempt, busyRef } = usePluginProposalSession();
  const [errors, setErrors] = useState<DraftErrors>({});
  const [focusErrors, setFocusErrors] = useState(0);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const receiptRef = useRef<HTMLHeadingElement>(null);
  const locked = busy || pending;

  useEffect(() => { if (focusErrors) focusFirstWorkflowError(formRef.current); }, [focusErrors]);
  useEffect(() => { if (receipt) receiptRef.current?.focus(); }, [receipt]);

  function update<K extends keyof ProposalDraft>(field: K, value: ProposalDraft[K]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const validation = validateProposalDraft(draft, locale);
    if (!verifiedForEmail(session, draft.email)) validation.email ??= copy.verifyFirst;
    setErrors(validation); setError("");
    if (Object.keys(validation).length) { setFocusErrors((value) => value + 1); return; }
    let current: WorkflowAttempt;
    try { current = workflowAttempt(attempt.current, JSON.stringify(proposalPayload(draft)), () => crypto.randomUUID()); }
    catch { setError(copy.pendingSubmission); return; }
    attempt.current = current;
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch("/api/plugin-lab/proposals", { method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-locale": locale, "idempotency-key": current.key }, body: current.body });
      const result = await workflowJson(response);
      if (response.ok && typeof result.proposalId === "string" && result.state === "received") { setReceipt({ proposalId: result.proposalId }); return; }
      current.ambiguous ||= workflowWriteIsAmbiguous(response.status, result.code) || response.ok;
      setPending(current.ambiguous);
      if (response.status === 401 || result.code === "verification-required") {
        setSession(null); setErrors({ email: copy.sessionExpired }); setFocusErrors((value) => value + 1);
      }
      if (result.fieldErrors && typeof result.fieldErrors === "object") {
        const mapped: DraftErrors = {};
        for (const field of Object.keys(result.fieldErrors)) if (Object.hasOwn(draft, field)) mapped[field as keyof ProposalDraft] = field === "email" ? copy.emailInvalid : copy.invalidField;
        setErrors(mapped); setFocusErrors((value) => value + 1);
      }
      setError(pluginWorkflowError(result.code, locale));
    } catch { current.ambiguous = true; setPending(true); setError(copy.unavailable); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function downloadReceipt() {
    if (!receipt) return;
    const text = ["ENA Plugin Lab", `${copy.proposalId}: ${receipt.proposalId}`, `${copy.currentStatus}: ${copy.receiptState}`, new URL(`/${locale}/plugins/status`, window.location.origin).toString(), "", copy.receiptNote].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ena-plugin-${receipt.proposalId}.txt`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function field(name: ProposalTextField, label: string, options: { required?: boolean; helper?: string; rows?: number } = {}) {
    const describedBy = [options.helper ? `plugin-${name}-help` : "", errors[name] ? `plugin-${name}-error` : ""].filter(Boolean).join(" ") || undefined;
    const attributes = { id: `plugin-${name}`, name, maxLength: proposalTextLimits[name], value: draft[name], onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(name, event.target.value), required: options.required, disabled: locked, "aria-invalid": !!errors[name], "aria-describedby": describedBy };
    return <div className="plugin-field"><label htmlFor={`plugin-${name}`}>{label}{options.required ? " *" : ""}</label>{options.rows ? <textarea {...attributes} rows={options.rows} /> : <input {...attributes} type="text" autoComplete={name === "name" ? "name" : name === "affiliation" ? "organization" : "off"} />}{options.helper ? <p className="plugin-field-help" id={`plugin-${name}-help`}>{options.helper}</p> : null}{errors[name] ? <p className="plugin-field-error" id={`plugin-${name}-error`}>{errors[name]}</p> : null}</div>;
  }

  if (receipt) return <section className="plugin-receipt" aria-live="polite" lang={copy.fallback ? "en" : undefined}>
    <h2 ref={receiptRef} tabIndex={-1}>{copy.proposalReceived}</h2><p>{copy.receiptIntro}</p>
    <dl><div><dt>{copy.proposalId}</dt><dd><code>{receipt.proposalId}</code></dd></div></dl>
    <div className="button-row"><button type="button" className="button button-secondary" onClick={downloadReceipt}>{copy.downloadReceipt}</button><a className="button button-primary" href={`/${locale}/plugins/status`}>{copy.myProposals}</a></div><p className="plugin-field-help">{copy.receiptNote}</p>
  </section>;

  return <form ref={formRef} className="plugin-proposal-form" onSubmit={submit} noValidate lang={copy.fallback ? "en" : undefined} aria-busy={busy}>
    <p className="plugin-field-help">{copy.requiredHint}</p>
    <section className="plugin-form-section" aria-labelledby="plugin-idea-heading"><h2 id="plugin-idea-heading">1. {copy.yourIdea}</h2>
      {field("title", copy.proposalTitle, { required: true, helper: copy.titleExample })}
      {field("researchQuestion", copy.researchQuestion, { required: true, rows: 3, helper: copy.questionExample })}
      {field("proposedChange", copy.proposedChange, { required: true, rows: 3, helper: copy.changeExample })}
    </section>
    <section className="plugin-form-section" aria-labelledby="plugin-contact-heading"><h2 id="plugin-contact-heading">2. {copy.contact}</h2>
      <PluginEmailVerification locale={locale} email={draft.email} onEmailChange={(email) => update("email", email)} session={session} onSessionChange={(next) => { setSession(next); if (next) { setErrors((previous) => ({ ...previous, email: undefined })); setError(""); } }} fieldError={errors.email} lockedEmail={pending} disabled={busy} />
      <div className="plugin-form-columns">{field("name", copy.nameOptional)}{field("affiliation", copy.affiliationOptional)}</div>
    </section>
    <details className="plugin-form-section plugin-extra-details"><summary>3. {copy.extras}</summary><div className="plugin-details-body">
      {field("currentGap", copy.currentGap, { rows: 3 })}{field("unchangedBoundary", copy.unchangedBoundary, { rows: 3 })}{field("privateDetails", copy.privateDetails, { rows: 4 })}{field("referenceLinks", copy.referenceLinks, { rows: 2, helper: copy.linksHint })}
      <div className="plugin-field"><label htmlFor="plugin-track">{copy.collaborationTrack}</label><select id="plugin-track" name="track" value={draft.track} disabled={locked} onChange={(event) => update("track", event.target.value as ProposalDraft["track"])}><option value="unsure">{copy.unsure}</option><option value="academic">{copy.academic}</option><option value="commissioned">{copy.commissioned}</option></select></div>
    </div></details>
    <fieldset className="plugin-visibility" disabled={locked}><legend>{copy.reviewVisibility}</legend><label><input type="radio" name="visibility" value="private" checked={draft.visibility === "private"} onChange={() => update("visibility", "private")} />{copy.visibilityPrivate}</label><label><input type="radio" name="visibility" value="public-after-review" checked={draft.visibility === "public-after-review"} onChange={() => update("visibility", "public-after-review")} />{copy.visibilityPublic}</label><p className="plugin-field-help">{copy.visibilityHint}</p></fieldset>
    {draft.visibility === "public-after-review" ? field("publicSummary", copy.publicSummary, { required: true, rows: 3 }) : null}
    <aside className="plugin-form-callout"><p>{copy.safetyNotice}</p></aside>
    {(["dataSafetyConfirmed", "privacyConsent"] as const).map((name) => <div key={name}><label className="plugin-form-check" htmlFor={`plugin-${name}`}><input id={`plugin-${name}`} name={name} type="checkbox" checked={draft[name]} disabled={locked} required onChange={(event) => update(name, event.target.checked)} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `plugin-${name}-error` : undefined} />{name === "dataSafetyConfirmed" ? copy.dataSafetyConfirmation : copy.privacyConsent}</label>{errors[name] ? <p className="plugin-field-error" id={`plugin-${name}-error`}>{errors[name]}</p> : null}</div>)}
    {pending ? <aside className="plugin-pending-write" role="status"><p>{copy.pendingSubmission}</p><a href={`/${locale}/plugins/status`} target="_blank" rel="noopener noreferrer">{copy.myProposals}</a></aside> : null}
    {error ? <p className="plugin-form-error" role="alert">{error}</p> : null}
    <div className="button-row"><button className="button button-primary" disabled={busy} type="submit">{busy ? copy.submitting : pending ? copy.retrySubmission : copy.submit}</button><a href={`/${locale}/plugins`}>{copy.backCatalog}</a></div>
  </form>;
}
