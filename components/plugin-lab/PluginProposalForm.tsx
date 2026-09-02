"use client";

import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import { getPluginProposalFormCopy } from "@/lib/plugin-lab/i18n";

type Receipt = { proposalId: string; accessCode: string };

export default function PluginProposalForm({ locale }: { locale: Locale }) {
  const copy = getPluginProposalFormCopy(locale);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/plugin-lab/proposals", {
        method: "POST",
        headers: { "content-type": "application/json", "x-plugin-lab-locale": locale },
        body: JSON.stringify(body),
      });
      const parsed = await response.json() as Receipt | { error?: string };
      if (!response.ok || !("proposalId" in parsed) || !("accessCode" in parsed)) throw new Error("The proposal could not be recorded.");
      setReceipt(parsed);
      event.currentTarget.reset();
    } catch {
      setError(copy.submitError);
    } finally { setBusy(false); }
  }

  if (receipt) return (
    <section className="plugin-receipt" role="status" aria-live="polite" lang={copy.fallback ? "en" : undefined}>
      {copy.fallback ? <p className="plugin-language-note">{copy.fallbackNotice}</p> : null}
      <p className="eyebrow">{copy.saveReceipt}</p>
      <h2>{copy.proposalReceived}</h2>
      <p>{copy.accessCodeOnce}</p>
      <dl><div><dt>{copy.proposalId}</dt><dd><code>{receipt.proposalId}</code></dd></div><div><dt>{copy.accessCode}</dt><dd><code>{receipt.accessCode}</code></dd></div></dl>
      <a className="button button-secondary" href={`/${locale}/plugins/status`}>{copy.checkStatus}</a>
    </section>
  );

  return (
    <form className="plugin-proposal-form" onSubmit={submit} lang={copy.fallback ? "en" : undefined}>
      {copy.fallback ? <p className="plugin-language-note">{copy.fallbackNotice}</p> : null}
      <div className="plugin-form-callout">
        <strong>{copy.safetyTitle}</strong>
        <p>{copy.safetyText}</p>
      </div>
      <label>{copy.email}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>{copy.nameOptional}<input name="name" type="text" autoComplete="name" maxLength={120} /></label>
      <label>{copy.affiliationOptional}<input name="affiliation" type="text" maxLength={160} /></label>
      <label>{copy.proposalTitle}<input name="title" type="text" maxLength={160} required /></label>
      <label>{copy.researchQuestion}<textarea name="researchQuestion" rows={4} maxLength={2000} required /></label>
      <label>{copy.currentGap}<textarea name="currentGap" rows={4} maxLength={2000} required /></label>
      <label>{copy.proposedChange}<textarea name="proposedChange" rows={4} maxLength={3000} required /></label>
      <label>{copy.unchangedBoundary}<textarea name="unchangedBoundary" rows={3} maxLength={1600} required /></label>
      <label>{copy.publicSummary}<textarea name="publicSummary" rows={3} maxLength={1200} required /></label>
      <label>{copy.privateDetails}<textarea name="privateDetails" rows={5} maxLength={5000} required /></label>
      <label>{copy.referenceLinks}<textarea name="referenceLinks" rows={2} maxLength={1600} /></label>
      <fieldset><legend>{copy.reviewVisibility}</legend><label><input type="radio" name="visibility" value="private" defaultChecked /> {copy.privateReview}</label><label><input type="radio" name="visibility" value="public-after-review" /> {copy.publicAfterReview}</label></fieldset>
      <p className="plugin-form-boundary"><strong>{copy.noNdaTitle}</strong> {copy.noNdaText}</p>
      <fieldset><legend>{copy.collaborationTrack}</legend><label><input type="radio" name="track" value="academic" /> {copy.academic}</label><label><input type="radio" name="track" value="commissioned" /> {copy.commissioned}</label><label><input type="radio" name="track" value="unsure" defaultChecked /> {copy.unsure}</label></fieldset>
      <p className="plugin-form-boundary">{copy.fundingBoundary}</p>
      <label className="plugin-form-check"><input type="checkbox" name="dataSafetyConfirmed" value="yes" required /> {copy.dataSafetyConfirmation}</label>
      <label className="plugin-form-check"><input type="checkbox" name="privacyConsent" value="yes" required /> {copy.privacyConsent}</label>
      {error ? <p className="plugin-form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" disabled={busy} type="submit">{busy ? copy.submitting : copy.submit}</button>
    </form>
  );
}
