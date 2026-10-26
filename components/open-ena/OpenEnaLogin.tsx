import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import {
  getOpenEnaAuthCopy,
  openEnaLoginNoticeText,
  OPEN_ENA_CONTACT_EMAIL,
  type OpenEnaLoginNotice,
} from "@/lib/open-ena-auth-copy";
import { isOpenEnaLocalizedLocale } from "@/lib/open-ena-i18n";
import OpenEnaFallbackNotice from "./OpenEnaFallbackNotice";
import OpenEnaPasswordInput from "./OpenEnaPasswordInput";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";
import { getOpenEnaCloudCopy } from "@/lib/open-ena/cloud-copy";

interface OpenEnaLoginProps {
  locale: Locale;
  notice: OpenEnaLoginNotice;
  configurationReady: boolean;
  cloudEnabled?: boolean;
  registrationAvailable?: boolean;
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

export function OpenEnaAuthRecoveryNotice({
  locale,
  notice,
}: {
  locale: Locale;
  notice: OpenEnaLoginNotice;
}) {
  if (notice.kind !== "logout-unavailable") return null;
  const copy = getOpenEnaAuthCopy(locale);
  return (
    <p className="open-ena-login-error" role="alert">
      {copy.logoutUnavailable}
    </p>
  );
}

export default function OpenEnaLogin({ locale, notice, configurationReady, cloudEnabled = false, registrationAvailable = false }: OpenEnaLoginProps) {
  const copy = getOpenEnaAuthCopy(locale);
  const cloudCopy = getOpenEnaCloudCopy(locale);
  const invalidCredentials = notice.kind === "invalid";
  const alertText = openEnaLoginNoticeText(copy, notice);
  const pluginCopy = getPluginLabCopy(locale);
  const [noticeBeforeEmail, noticeAfterEmail = ""] = copy.collaborationNotice.split(
    OPEN_ENA_CONTACT_EMAIL,
  );

  return (
    <OpenEnaLoginFrame locale={locale}>
      <OpenEnaFallbackNotice locale={locale} />
      <section className="open-ena-login-shell" aria-labelledby="open-ena-login-title">
        <div className="open-ena-login-context">
          <div className="open-ena-login-brand" dir="ltr" lang="en">
            <Image
              className="open-ena-login-brand-lockup"
              src="/logo-open-ena.svg"
              width={250}
              height={80}
              alt="Open ENA — Epistemic Network Analysis"
            />
          </div>

          <div className="open-ena-login-network" aria-hidden="true">
            <Image
              className="open-ena-login-network-hero"
              src="/open-ena-network-hero.svg"
              width={620}
              height={520}
              loading="lazy"
              alt=""
            />
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
            <p className="eyebrow">{cloudEnabled ? cloudCopy.cloudReady : copy.eyebrow}</p>
            <h1 id="open-ena-login-title">{copy.title}</h1>
            <p>{cloudEnabled ? cloudCopy.cloudLoginIntro : copy.intro}</p>
            {cloudEnabled ? <>
              <p data-ena-first-visit={registrationAvailable ? "registration" : "registration-unavailable"}>
                {registrationAvailable ? cloudCopy.registrationSteps : cloudCopy.registrationClosed}
              </p>
              <p>{cloudCopy.sharedAccountNotice}</p>
            </> : null}
          </div>

          {configurationReady ? (
            <form action="/api/open-ena/login" method="post" className="open-ena-login-form">
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="open-ena-username">{cloudEnabled ? cloudCopy.cloudLoginLabel : copy.username}</label>
            <input
              id="open-ena-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder={cloudEnabled ? cloudCopy.cloudLoginHint : copy.usernamePlaceholder}
              aria-invalid={invalidCredentials}
              aria-describedby={alertText ? "open-ena-login-error" : undefined}
              required
              autoFocus
            />

            <label htmlFor="open-ena-password">{copy.password}</label>
            <OpenEnaPasswordInput
              id="open-ena-password"
              name="password"
              autoComplete="current-password"
              placeholder={copy.passwordPlaceholder}
              showPasswordLabel={copy.showPassword}
              hidePasswordLabel={copy.hidePassword}
              aria-invalid={invalidCredentials}
              aria-describedby={alertText ? "open-ena-login-error" : undefined}
              required
            />

            {alertText ? (
              <p id="open-ena-login-error" className="open-ena-login-error" role="alert">
                {alertText}
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
            {cloudEnabled ? <p className="open-ena-account-links">
              {registrationAvailable ? <Link href={`/${locale}/open-ena/account`} prefetch={false}>{cloudCopy.register}</Link> : null}
              <Link href={`/${locale}/open-ena/account?mode=reset`} prefetch={false}>{cloudCopy.recover}</Link>
              {!registrationAvailable ? <a href={`mailto:${OPEN_ENA_CONTACT_EMAIL}`}>{cloudCopy.contactSupport}</a> : null}
            </p> : <p className="open-ena-login-collaboration">
              {noticeBeforeEmail}
              <a href="mailto:sandy0692@gmail.com">{OPEN_ENA_CONTACT_EMAIL}</a>
              {noticeAfterEmail}
            </p>}
            <p className="open-ena-login-collaboration" lang={pluginCopy.contentFallback ? "en" : undefined}>
              {pluginCopy.loginInvitation}{" "}
              <Link href={`/${locale}/plugins/propose`} prefetch={false}>{pluginCopy.loginProposalLink}</Link>.
            </p>
            <p className="open-ena-login-privacy">
              <span aria-hidden="true">●</span>
              {cloudEnabled ? cloudCopy.cloudPrivacy : copy.privacyNote}
            </p>
          </div>
        </div>
      </section>
    </OpenEnaLoginFrame>
  );
}
