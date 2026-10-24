"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { getPluginWorkflowCopy, pluginWorkflowError, pluginWorkflowTemplate } from "@/lib/plugin-lab/workflow-i18n";
import { sameWorkflowEmail, validWorkflowEmail, verifiedForEmail, workflowJson, type VerifiedEmailSession } from "./workflow-client";

export default function PluginEmailVerification({ locale, email, onEmailChange, session, onSessionChange, fieldError, lockedEmail = false, disabled = false, checkSession = true }: {
  locale: Locale; email: string; onEmailChange: (email: string) => void;
  session: VerifiedEmailSession | null; onSessionChange: (session: VerifiedEmailSession | null) => void;
  fieldError?: string; lockedEmail?: boolean; disabled?: boolean; checkSession?: boolean;
}) {
  const copy = getPluginWorkflowCopy(locale);
  const [challenge, setChallenge] = useState<{ id: string; email: string; expiresAt: number } | null>(null);
  const [code, setCode] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState<"request" | "verify" | "session" | null>(checkSession ? "session" : null);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"email" | "code" | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const callbacks = useRef({ onEmailChange, onSessionChange, email });
  callbacks.current = { onEmailChange, onSessionChange, email };
  const isVerified = verifiedForEmail(session, email, now);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const remainingSeconds = Math.max(0, Math.ceil(((challenge?.expiresAt ?? 0) - now) / 1000));

  useEffect(() => {
    if (!checkSession) return;
    let active = true;
    const serial = operation.current;
    void (async () => {
      try {
        const response = await fetch("/api/plugin-lab/session", { cache: "no-store" });
        const result = await workflowJson(response);
        if (active && serial === operation.current && response.ok && typeof result.email === "string" && typeof result.expiresAt === "string") {
          const current = callbacks.current;
          if (!current.email || sameWorkflowEmail(current.email, result.email)) {
            current.onEmailChange(result.email);
            current.onSessionChange({ email: result.email, expiresAt: result.expiresAt });
          }
        }
      } catch { /* Session discovery is optional; explicit verification stays available. */ }
      finally { if (active && serial === operation.current) setBusy(null); }
    })();
    return () => { active = false; };
  }, [checkSession]);

  useEffect(() => {
    if (!challenge && !retryAt && !session) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge, retryAt, session]);

  useEffect(() => {
    if (session && Date.parse(session.expiresAt) <= now) {
      callbacks.current.onSessionChange(null);
      setError(copy.sessionExpired); setErrorField(null);
    }
  }, [session, now, copy.sessionExpired]);

  function changeEmail(value: string) {
    operation.current += 1;
    setChallenge(null); setCode(""); setError(""); setErrorField(null); setBusy(null);
    onEmailChange(value);
    if (session && !sameWorkflowEmail(session.email, value)) onSessionChange(null);
  }

  async function requestCode() {
    if (busy || disabled || retrySeconds) return;
    if (!validWorkflowEmail(email)) { setError(copy.emailInvalid); setErrorField("email"); emailRef.current?.focus(); return; }
    const serial = ++operation.current;
    const requestedEmail = email.trim().toLowerCase();
    setBusy("request"); setError(""); setErrorField(null);
    try {
      const response = await fetch("/api/plugin-lab/email-code/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: requestedEmail, locale }) });
      const result = await workflowJson(response);
      if (serial !== operation.current) return;
      const currentTime = Date.now(); setNow(currentTime);
      if (!response.ok || typeof result.challengeId !== "string") {
        if (response.status === 429) setRetryAt(currentTime + (Number(result.retryAfter) || 60) * 1000);
        setError(pluginWorkflowError(result.code, locale)); setErrorField(result.code === "invalid-email" ? "email" : null); return;
      }
      setChallenge({ id: result.challengeId, email: requestedEmail, expiresAt: currentTime + (Number(result.expiresIn) || 600) * 1000 });
      setRetryAt(currentTime + (Number(result.retryAfter) || 60) * 1000); setCode("");
      window.setTimeout(() => codeRef.current?.focus(), 0);
    } catch { if (serial === operation.current) setError(copy.emailUnavailable); }
    finally { if (serial === operation.current) setBusy(null); }
  }

  async function verify() {
    if (busy || disabled || !challenge || !remainingSeconds) return;
    if (!/^\d{6}$/u.test(code)) { setError(copy.codeInvalid); setErrorField("code"); codeRef.current?.focus(); return; }
    const serial = ++operation.current;
    setBusy("verify"); setError(""); setErrorField(null);
    try {
      const response = await fetch("/api/plugin-lab/email-code/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId: challenge.id, code }) });
      const result = await workflowJson(response);
      if (serial !== operation.current) return;
      if (!response.ok || result.verified !== true || typeof result.email !== "string" || typeof result.expiresAt !== "string") {
        setError(pluginWorkflowError(result.code, locale)); setErrorField(result.code === "invalid-code" ? "code" : null);
        if (response.status === 429) setRetryAt(Date.now() + (Number(result.retryAfter) || 60) * 1000);
        return;
      }
      if (!sameWorkflowEmail(result.email, challenge.email) || !sameWorkflowEmail(result.email, callbacks.current.email)) return;
      onSessionChange({ email: result.email, expiresAt: result.expiresAt });
      setChallenge(null); setCode(""); setNow(Date.now());
      // Verification deliberately never calls a proposal submission handler.
    } catch { if (serial === operation.current) setError(copy.unavailable); }
    finally { if (serial === operation.current) setBusy(null); }
  }

  return <div className="plugin-email-verification">
    <label className="plugin-field" htmlFor="plugin-email"><span>{copy.email} *</span><input ref={emailRef} id="plugin-email" name="email" type="email" value={email} onChange={(event) => changeEmail(event.target.value)} autoComplete="email" maxLength={254} required readOnly={lockedEmail} disabled={disabled} aria-invalid={!!fieldError || errorField === "email"} aria-describedby={`plugin-email-help${fieldError ? " plugin-email-field-error" : ""}${errorField === "email" ? " plugin-email-error" : ""}`} /></label>
    {fieldError ? <p className="plugin-field-error" id="plugin-email-field-error">{fieldError}</p> : null}
    <p className="plugin-field-help" id="plugin-email-help">{copy.verifyHint}</p>
    {isVerified ? <p className="plugin-verified" role="status">✓ {copy.verified}</p> : <>
      <button type="button" className="button button-secondary" disabled={!!busy || disabled || retrySeconds > 0} onClick={requestCode}>{busy === "session" ? copy.checkingSession : busy === "request" ? copy.sendingCode : retrySeconds ? pluginWorkflowTemplate(copy.resendIn, { seconds: retrySeconds }) : challenge ? copy.resendCode : copy.sendCode}</button>
      {challenge ? <div className="plugin-code-entry">
        <p role="status">{pluginWorkflowTemplate(copy.codeSent, { email: challenge.email })}</p>
        <label className="plugin-field" htmlFor="plugin-email-code"><span>{copy.codeLabel}</span><input ref={codeRef} id="plugin-email-code" name="emailCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/gu, "")); if (errorField === "code") { setError(""); setErrorField(null); } }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void verify(); } }} disabled={disabled || busy === "verify" || !remainingSeconds} aria-invalid={errorField === "code"} aria-describedby={`plugin-code-expiry${errorField === "code" ? " plugin-email-error" : ""}`} /></label>
        <p className="plugin-field-help" id="plugin-code-expiry">{remainingSeconds ? pluginWorkflowTemplate(copy.codeExpires, { minutes: Math.floor(remainingSeconds / 60), seconds: String(remainingSeconds % 60).padStart(2, "0") }) : copy.codeExpired}</p>
        <button type="button" className="button button-secondary" disabled={!!busy || disabled || !remainingSeconds} onClick={verify}>{busy === "verify" ? copy.verifying : copy.verifyEmail}</button>
      </div> : null}
    </>}
    {error ? <p className="plugin-form-error" id="plugin-email-error" role="alert">{error}</p> : null}
  </div>;
}
