"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PluginProposalState, PluginProposalSubmission } from "@/lib/plugin-lab/proposal";

interface OperatorRecord {
  proposalId: string;
  state: PluginProposalState;
  createdAt: string;
  updatedAt: string;
  track: string;
  visibility: string;
  emailConfirmed: boolean;
  publicConsentStatus: string;
  publicModerationStatus: string;
  submission: PluginProposalSubmission;
}

const nextStates: Readonly<Record<PluginProposalState, readonly PluginProposalState[]>> = {
  received: ["under-review", "withdrawn"],
  "under-review": ["needs-information", "selected", "not-selected", "withdrawn"],
  "needs-information": ["under-review", "selected", "not-selected", "withdrawn"],
  selected: ["withdrawn"],
  "not-selected": [],
  withdrawn: [],
};

export default function PluginOperatorInbox({ records, csrf, locale }: { records: readonly OperatorRecord[]; csrf: string; locale: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [rotatedCode, setRotatedCode] = useState<{ proposalId: string; accessCode: string } | null>(null);
  const [retentionPreview, setRetentionPreview] = useState<readonly { proposalId: string; state: string; updatedAt: string }[] | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  async function transition(record: OperatorRecord, form: FormData) {
    const to = String(form.get("to") ?? ""); const reason = String(form.get("reason") ?? "");
    setBusyId(record.proposalId); setError("");
    try {
      const response = await fetch(`/api/plugin-lab/operator/proposals/${encodeURIComponent(record.proposalId)}/transition`, {
        method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf },
        body: JSON.stringify({ from: record.state, to, reason }),
      });
      if (!response.ok) throw new Error(await response.text());
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Operator update failed."); }
    finally { setBusyId(""); }
  }

  async function rotate(record: OperatorRecord) {
    setBusyId(record.proposalId); setError(""); setRotatedCode(null);
    try {
      const response = await fetch(`/api/plugin-lab/operator/proposals/${encodeURIComponent(record.proposalId)}/access-code`, {
        method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf }, body: JSON.stringify({ action: "rotate" }),
      });
      const result = await response.json() as { accessCode?: string };
      if (!response.ok || !result.accessCode) throw new Error("Access-code rotation failed.");
      setRotatedCode({ proposalId: record.proposalId, accessCode: result.accessCode });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Access-code rotation failed."); }
    finally { setBusyId(""); }
  }

  async function requestPublicConsent(record: OperatorRecord) {
    setBusyId(record.proposalId); setError("");
    try {
      const response = await fetch(`/api/plugin-lab/operator/proposals/${encodeURIComponent(record.proposalId)}/public-consent`, {
        method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf }, body: JSON.stringify({ action: "request" }),
      });
      if (!response.ok) throw new Error(await response.text());
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Public-summary review could not be recorded."); }
    finally { setBusyId(""); }
  }

  async function confirmManualEmail(record: OperatorRecord) {
    setBusyId(record.proposalId); setError("");
    try {
      const response = await fetch(`/api/plugin-lab/operator/proposals/${encodeURIComponent(record.proposalId)}/email-confirmation`, {
        method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf }, body: JSON.stringify({ action: "confirm-email" }),
      });
      if (!response.ok) throw new Error(await response.text());
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Email confirmation could not be recorded."); }
    finally { setBusyId(""); }
  }

  async function previewRetention() {
    setBusyId("retention-preview"); setError("");
    const before = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000).toISOString();
    try {
      const response = await fetch("/api/plugin-lab/operator/retention-preview", {
        method: "POST", headers: { "content-type": "application/json", "x-plugin-lab-csrf": csrf }, body: JSON.stringify({ action: "preview", before }),
      });
      const result = await response.json() as { candidates?: readonly { proposalId: string; state: string; updatedAt: string }[] };
      if (!response.ok || !result.candidates) throw new Error("Retention preview failed.");
      setRetentionPreview(result.candidates);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Retention preview failed."); }
    finally { setBusyId(""); }
  }

  async function copyManualEmail(record: OperatorRecord) {
    const message = [
      "Subject: ENA Plugin Lab proposal status",
      "",
      `Proposal ID: ${record.proposalId}`,
      `Current status: ${record.state}`,
      `Status page: https://www.ena.hk/${locale}/plugins/status`,
      "",
      "Please use the access code previously supplied to you. This message does not reproduce private proposal details.",
      "Please reply from this address so the operator can record email confirmation before any public-summary consent request.",
    ].join("\n");
    try { await navigator.clipboard.writeText(message); setCopyStatus(`Email template copied for ${record.proposalId}.`); }
    catch { setCopyStatus("Copy was unavailable. No private proposal text was exposed."); }
  }

  return <div className="plugin-operator-inbox">
    {error ? <p className="plugin-form-error" role="alert">{error}</p> : null}
    {copyStatus ? <p role="status">{copyStatus}</p> : null}
    <aside className="plugin-boundary-note"><strong>Retention preview</strong><p>This read-only check lists terminal proposals not updated for 180 days. It never deletes or decrypts proposal content.</p><button type="button" className="button button-secondary" disabled={busyId === "retention-preview"} onClick={previewRetention}>Preview retention candidates</button>{retentionPreview ? <div role="status"><p>{retentionPreview.length} candidate{retentionPreview.length === 1 ? "" : "s"}; no deletion was performed.</p>{retentionPreview.length ? <ul>{retentionPreview.map((candidate) => <li key={candidate.proposalId}><code>{candidate.proposalId}</code> · {candidate.state} · {candidate.updatedAt}</li>)}</ul> : null}</div> : null}</aside>
    {rotatedCode ? <aside className="plugin-receipt" role="status"><strong>Copy this replacement code now.</strong><p>Proposal: <code>{rotatedCode.proposalId}</code></p><p>Access code: <code>{rotatedCode.accessCode}</code></p><p>The prior code is no longer valid. Do not paste private proposal details into the manual email.</p></aside> : null}
    {records.length === 0 ? <p>No proposals are available.</p> : records.map((record) => <article className="plugin-operator-card" key={record.proposalId}>
      <header><div><p className="eyebrow">{record.proposalId}</p><h2>{record.submission.title}</h2></div><span className="plugin-operator-state">{record.state}</span></header>
      <dl className="plugin-operator-facts"><div><dt>Contact</dt><dd>{record.submission.name ?? "Not supplied"} · {record.submission.email}</dd></div><div><dt>Email confirmed</dt><dd>{record.emailConfirmed ? "yes" : "no"}</dd></div><div><dt>Track</dt><dd>{record.track}</dd></div><div><dt>Visibility</dt><dd>{record.visibility}</dd></div><div><dt>Moderation</dt><dd>{record.publicModerationStatus}</dd></div><div><dt>Public consent</dt><dd>{record.publicConsentStatus}</dd></div><div><dt>Updated</dt><dd>{record.updatedAt}</dd></div></dl>
      <details><summary>Review proposal details</summary><h3>Research question</h3><p>{record.submission.researchQuestion}</p><h3>Current gap</h3><p>{record.submission.currentGap}</p><h3>Proposed change</h3><p>{record.submission.proposedChange}</p><h3>Must remain unchanged</h3><p>{record.submission.unchangedBoundary}</p><h3>Eligible public summary</h3><p>{record.submission.publicSummary}</p><h3>Private details</h3><p>{record.submission.privateDetails}</p>{record.submission.referenceLinks.length ? <ul>{record.submission.referenceLinks.map((link) => <li key={link}><a href={link} target="_blank" rel="noreferrer">{link}</a></li>)}</ul> : null}</details>
      <div className="plugin-operator-actions"><button type="button" className="button button-secondary" onClick={() => copyManualEmail(record)}>Copy manual email</button><button type="button" className="button button-secondary" disabled={busyId === record.proposalId} onClick={() => rotate(record)}>Rotate access code</button>{record.state === "selected" && record.visibility === "public-after-review" && !record.emailConfirmed ? <button type="button" className="button button-secondary" disabled={busyId === record.proposalId} onClick={() => confirmManualEmail(record)}>Record verified email reply</button> : null}{record.state === "selected" && record.visibility === "public-after-review" && record.emailConfirmed && record.publicModerationStatus === "pending" && record.publicConsentStatus === "not-requested" ? <button type="button" className="button button-secondary" disabled={busyId === record.proposalId} onClick={() => requestPublicConsent(record)}>Approve summary and request consent</button> : null}</div>
      {nextStates[record.state].length ? <form action={(form) => transition(record, form)} className="plugin-operator-transition"><label>Next state<select name="to" required defaultValue=""> <option value="" disabled>Select…</option>{nextStates[record.state].map((state) => <option key={state} value={state}>{state}</option>)}</select></label><label>Internal reason<textarea name="reason" maxLength={500} required /></label><button type="submit" className="button button-primary" disabled={busyId === record.proposalId}>Record transition</button></form> : <p>This proposal state is terminal.</p>}
    </article>)}
  </div>;
}
