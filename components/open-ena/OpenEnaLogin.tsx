import Image from "next/image";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import {
  getOpenEnaAuthCopy,
  OPEN_ENA_CONTACT_EMAIL,
} from "@/lib/open-ena-auth-copy";
import { isOpenEnaLocalizedLocale } from "@/lib/open-ena-i18n";
import OpenEnaFallbackNotice from "./OpenEnaFallbackNotice";

interface OpenEnaLoginProps {
  locale: Locale;
  error: boolean;
  configurationReady: boolean;
}

export function OpenEnaLoginFrame({ locale, children }: { locale: Locale; children: ReactNode }) {
  const localized = isOpenEnaLocalizedLocale(locale);
  return (
    <div
      className="open-ena-login-page"
      lang={localized ? undefined : "en"}
      dir={localized ? undefined : "ltr"}
    >
      {children}
    </div>
  );
}

export default function OpenEnaLogin({ locale, error, configurationReady }: OpenEnaLoginProps) {
  const copy = getOpenEnaAuthCopy(locale);
  const [noticeBeforeEmail, noticeAfterEmail = ""] = copy.collaborationNotice.split(
    OPEN_ENA_CONTACT_EMAIL,
  );

  return (
    <OpenEnaLoginFrame locale={locale}>
      <OpenEnaFallbackNotice locale={locale} />
      <section className="open-ena-login-shell" aria-labelledby="open-ena-login-title">
        <div className="open-ena-login-context">
          <div className="open-ena-login-brand" dir="ltr">
            <Image src="/ena-mark.svg" width={54} height={54} alt="" />
            <div>
              <strong>OPEN ENA</strong>
              <span>ENA.HK</span>
            </div>
          </div>

          <div className="open-ena-login-network" aria-hidden="true">
            <svg viewBox="0 0 420 270" role="img">
              <g className="open-ena-login-edges">
                <path d="M76 164 172 78 260 122 346 58" />
                <path d="M76 164 192 214 260 122 350 204" />
                <path d="M172 78 192 214M260 122 346 58M260 122 350 204" />
              </g>
              <g className="open-ena-login-nodes">
                <circle cx="76" cy="164" r="17" />
                <circle cx="172" cy="78" r="15" />
                <circle cx="192" cy="214" r="14" />
                <circle cx="260" cy="122" r="20" />
                <circle cx="346" cy="58" r="13" />
                <circle cx="350" cy="204" r="16" />
              </g>
            </svg>
          </div>

          <div className="open-ena-login-context-copy">
            <p>{copy.workspaceLabel}</p>
            <ol aria-label={copy.workspaceLabel}>
              {copy.researchFlow.map((item, index) => (
                <li key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="open-ena-login-panel">
          <div className="open-ena-login-heading">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 id="open-ena-login-title">{copy.title}</h1>
            <p>{copy.intro}</p>
          </div>

          {configurationReady ? (
            <form action="/api/open-ena/login" method="post" className="open-ena-login-form">
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="open-ena-username">{copy.username}</label>
            <input
              id="open-ena-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder={copy.usernamePlaceholder}
              aria-invalid={error}
              aria-describedby={error ? "open-ena-login-error" : undefined}
              required
              autoFocus
            />

            <label htmlFor="open-ena-password">{copy.password}</label>
            <input
              id="open-ena-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder={copy.passwordPlaceholder}
              aria-invalid={error}
              aria-describedby={error ? "open-ena-login-error" : undefined}
              required
            />

            {error ? (
              <p id="open-ena-login-error" className="open-ena-login-error" role="alert">
                {copy.invalidCredentials}
              </p>
            ) : null}

            <button type="submit" className="open-ena-login-submit">
              {copy.signIn}
              <span aria-hidden="true">→</span>
            </button>
            </form>
          ) : (
            <p className="open-ena-login-error" role="alert">
              {copy.unavailable}
            </p>
          )}

          <div className="open-ena-login-notes">
            <p className="open-ena-login-collaboration">
              {noticeBeforeEmail}
              <a href="mailto:sandy0692@gmail.com">{OPEN_ENA_CONTACT_EMAIL}</a>
              {noticeAfterEmail}
            </p>
            <p className="open-ena-login-privacy">
              <span aria-hidden="true">●</span>
              {copy.privacyNote}
            </p>
          </div>
        </div>
      </section>
    </OpenEnaLoginFrame>
  );
}
