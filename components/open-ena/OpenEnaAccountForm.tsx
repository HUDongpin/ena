"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Locale } from "@/lib/i18n";
import { getOpenEnaCloudCopy, openEnaCloudErrorCopy } from "@/lib/open-ena/cloud-copy";
import OpenEnaFallbackNotice from "./OpenEnaFallbackNotice";

type Mode = "register" | "forgot-password" | "verify" | "reset-password";
export default function OpenEnaAccountForm({ locale, initialMode, enabled, registrationAvailable, recoveryAvailable }: {
  locale: Locale; initialMode: "register" | "forgot-password"; enabled: boolean; registrationAvailable: boolean; recoveryAvailable: boolean;
}) {
  const copy = getOpenEnaCloudCopy(locale), id = useId();
  const [mode, setMode] = useState<Mode>(initialMode), [token, setToken] = useState("");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  useEffect(() => {
    const consumeLink = () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1)), action = fragment.get("action"), secret = fragment.get("token");
      if (fragment.has("token")) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (action === "verify" || action === "reset") {
        setMode(action === "verify" ? "verify" : "reset-password"); setSuccess(""); setPassword(""); setConfirmation(""); setError("");
        if (secret && /^[A-Za-z0-9_-]{43}$/u.test(secret)) setToken(secret);
        else { setToken(""); setError(copy.invalidToken); }
      }
    };
    consumeLink();
    window.addEventListener("hashchange", consumeLink);
    return () => window.removeEventListener("hashchange", consumeLink);
  }, [copy.invalidToken]);
  const complete = mode === "verify" || mode === "reset-password";
  const available = complete ? enabled && Boolean(token) : mode === "register" ? registrationAvailable : recoveryAvailable;
  const title = mode === "register" ? copy.registerTitle : mode === "verify" ? copy.verifyTitle : copy.resetTitle;
  const intro = mode === "register" ? copy.registerIntro : mode === "verify" ? copy.verifyIntro : mode === "reset-password" ? copy.resetLinkIntro : copy.resetIntro;
  const submitLabel = mode === "register" ? copy.sendVerification : mode === "forgot-password" ? copy.sendReset : mode === "verify" ? copy.finishRegistration : copy.finishReset;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !available) return;
    setError(""); setSuccess("");
    if (complete && password !== confirmation) { setError(copy.passwordMismatch); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/open-ena/account/${mode}`, { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(complete ? { token, password } : { email, locale }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) { setError(openEnaCloudErrorCopy(result.error, copy)); return; }
      setSuccess(mode === "verify" ? copy.verified : mode === "reset-password" ? copy.resetDone : copy.requestSent);
      setPassword(""); setConfirmation(""); if (complete) setToken("");
    } catch { setError(copy.unavailable); }
    finally { setBusy(false); }
  }
  function switchMode(next: "register" | "forgot-password") {
    // Next's native History integration also updates the language switcher's
    // search params. Keep only the public entry mode in the URL, never an action token.
    const query = new URLSearchParams(window.location.search);
    if (next === "forgot-password") query.set("mode", "reset");
    else query.delete("mode");
    const search = query.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    setMode(next); setError(""); setSuccess(""); setToken(""); setPassword(""); setConfirmation("");
  }
  return <div className="open-ena-account-page" lang={locale === "zh-hans" ? "zh-Hans" : locale === "zh-hant" ? "zh-Hant" : "en"}>
    <OpenEnaFallbackNotice locale={locale} />
    <section className="open-ena-account-card" aria-labelledby={`${id}-title`}>
      <Link href={`/${locale}`}><Image src="/logo-open-ena.svg" alt="Open ENA" width={210} height={68} priority /></Link>
      <h1 id={`${id}-title`}>{title}</h1><p>{intro}</p>
      {success ? <div className="open-ena-account-success" role="status">{success}</div> : <form onSubmit={submit} className="open-ena-login-form">
        {!complete ? <><label htmlFor={`${id}-email`}>{copy.email}</label><input id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254}
          value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy || !available} aria-describedby={`${id}-email-hint`} />
          <p id={`${id}-email-hint`} className="open-ena-account-hint">{copy.emailHint}</p></>
          : <><label htmlFor={`${id}-password`}>{copy.password}</label><input id={`${id}-password`} name="password" type="password" autoComplete="new-password"
            minLength={15} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy || !available} aria-describedby={`${id}-password-hint`} />
            <p id={`${id}-password-hint`} className="open-ena-account-hint">{copy.passwordHelp}</p>
            <label htmlFor={`${id}-confirmation`}>{copy.confirmPassword}</label><input id={`${id}-confirmation`} name="confirmation" type="password" autoComplete="new-password"
              minLength={15} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy || !available} /></>}
        {!available && !error ? <p role="status">{copy.unavailable}</p> : null}
        <button className="open-ena-login-submit" type="submit" disabled={busy || !available}>{busy ? copy.working : submitLabel}</button>
      </form>}
      {error ? <p className="open-ena-login-error" role="alert">{error}</p> : null}
      <nav className="open-ena-account-links" aria-label={copy.returnToSignIn}>
        <Link href={`/${locale}/open-ena${success && complete ? "?reauth=1" : ""}`}>{success && complete ? copy.signIn : copy.returnToSignIn}</Link>
        <button type="button" onClick={() => switchMode(mode === "forgot-password" || mode === "reset-password" ? "register" : "forgot-password")} disabled={busy}>
          {mode === "forgot-password" || mode === "reset-password" ? copy.register : copy.recover}</button>
        {complete && !success ? <button type="button" onClick={() => switchMode(mode === "verify" ? "register" : "forgot-password")} disabled={busy}>{mode === "verify" ? copy.sendVerification : copy.sendReset}</button> : null}
      </nav>
    </section>
  </div>;
}
