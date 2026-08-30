/**
 * Analytics is opt-in. The preference contains no account, dataset, or
 * identifier; it only controls whether the optional Vercel Web Analytics
 * client may send page-view events.
 */
export const OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY = "open-ena-analytics-consent-v1";
export const OPEN_ENA_ANALYTICS_CONSENT_EVENT = "open-ena-analytics-consent-change";

export type OpenEnaAnalyticsConsent = "granted" | "denied";

export function isOpenEnaAnalyticsConsent(value: string | null): value is OpenEnaAnalyticsConsent {
  return value === "granted" || value === "denied";
}

export function sanitizeOpenEnaAnalyticsUrl(eventUrl: string, expectedOrigin: string) {
  try {
    const origin = new URL(expectedOrigin).origin;
    const url = new URL(eventUrl, origin);
    if (url.origin !== origin) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isOpenEnaAnalyticsDisabledPath(pathname: string | null) {
  return pathname === null || /\/open-ena(?:\/|$)/u.test(pathname);
}
