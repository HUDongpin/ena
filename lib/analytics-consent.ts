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

/**
 * Next can temporarily expose a null pathname during compatibility-mode
 * hydration. Keep the server render closed, then use the browser's same-origin
 * pathname once mounted so public pages do not remain disabled indefinitely.
 */
export function resolveOpenEnaAnalyticsPathname(
  routerPathname: string | null,
  browserPathname: string | null,
) {
  return routerPathname ?? browserPathname;
}

export function isOpenEnaAnalyticsDisabledPath(pathname: string | null) {
  return pathname === null || /\/open-ena(?:\/|$)/u.test(pathname);
}
