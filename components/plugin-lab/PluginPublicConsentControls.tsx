"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { getPluginProposalStatusCopy } from "@/lib/plugin-lab/i18n";

export default function PluginPublicConsentControls({ title, publicSummary, locale, consentStatus }: { title: string; publicSummary: string; locale: Locale; consentStatus: "requested" | "confirmed" }) {
  const copy = getPluginProposalStatusCopy(locale);
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function decide(action: "confirm" | "withdraw") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/${locale}/plugins/status/consent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error(await response.text());
      router.refresh();
    } catch { setError(copy.consentError); }
    finally { setBusy(false); }
  }
  return <section className="plugin-public-consent" aria-labelledby="plugin-public-consent-title" lang={copy.fallback ? "en" : undefined}><p className="eyebrow">{copy.publicationRequested}</p><h2 id="plugin-public-consent-title">{copy.reviewProjection}</h2><p>{copy.projectionExplanation}</p><div className="plugin-public-preview"><h3>{title}</h3><p>{publicSummary}</p></div><p>{copy.cacheWarning}</p>{error ? <p className="plugin-form-error" role="alert">{error}</p> : null}<div className="button-row">{consentStatus === "requested" ? <button type="button" className="button button-primary" disabled={busy} onClick={() => decide("confirm")}>{copy.confirmPublication}</button> : null}<button type="button" className="button button-secondary" disabled={busy} onClick={() => decide("withdraw")}>{consentStatus === "confirmed" ? copy.withdrawPublication : copy.keepPrivate}</button></div></section>;
}
