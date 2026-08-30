"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import {
  isOpenEnaAnalyticsConsent,
  isOpenEnaAnalyticsDisabledPath,
  OPEN_ENA_ANALYTICS_CONSENT_EVENT,
  OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY,
  resolveOpenEnaAnalyticsPathname,
  type OpenEnaAnalyticsConsent,
} from "@/lib/analytics-consent";

interface AnalyticsConsentProps {
  disabled?: boolean;
}

/**
 * Do not mount the Vercel client until the visitor has opted in. Once mounted,
 * beforeSend reads the current local preference so an in-session opt-out also
 * suppresses later events without relying on a script unload primitive.
 */
export default function AnalyticsConsent({ disabled = false }: AnalyticsConsentProps) {
  const [consent, setConsent] = useState<OpenEnaAnalyticsConsent | "unknown">("unknown");
  const [browserPathname, setBrowserPathname] = useState<string | null>(null);
  const routerPathname = usePathname();
  const pathname = resolveOpenEnaAnalyticsPathname(routerPathname, browserPathname);
  // If the router has not exposed a pathname during hydration, fail closed
  // until it is known whether this is the authenticated workspace.
  const isOpenEnaWorkspace = isOpenEnaAnalyticsDisabledPath(pathname);
  const analyticsDisabled = disabled || isOpenEnaWorkspace;

  useEffect(() => {
    setBrowserPathname(window.location.pathname);
  }, [routerPathname]);

  useEffect(() => {
    if (analyticsDisabled) {
      setConsent("denied");
      return;
    }
    const readPreference = () => {
      try {
        const stored = window.localStorage.getItem(OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY);
        setConsent(isOpenEnaAnalyticsConsent(stored) ? stored : "unknown");
      } catch {
        setConsent("unknown");
      }
    };
    readPreference();
    const onPreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail === "granted" || detail === "denied") setConsent(detail);
      else readPreference();
    };
    window.addEventListener(OPEN_ENA_ANALYTICS_CONSENT_EVENT, onPreferenceChange);
    return () => window.removeEventListener(OPEN_ENA_ANALYTICS_CONSENT_EVENT, onPreferenceChange);
  }, [analyticsDisabled]);

  useEffect(() => {
    if (consent === "granted" && !analyticsDisabled) return;
    // @vercel/analytics does not expose an unload API. Remove its injected
    // script and queue on opt-out so a provider that was enabled earlier in
    // this tab is no longer retained in the page, while beforeSend remains a
    // second gate for any event already queued by the provider.
    if (typeof document !== "undefined") {
      document.querySelectorAll<HTMLScriptElement>(
        'script[src*="/_vercel/insights/"], script[src*="va.vercel-scripts.com"], script[data-sdkn^="@vercel/analytics"]',
      ).forEach((script) => script.remove());
    }
    if (typeof window !== "undefined") {
      Reflect.deleteProperty(window, "va");
      Reflect.deleteProperty(window, "vaq");
      Reflect.deleteProperty(window, "vam");
    }
  }, [consent, analyticsDisabled]);

  const beforeSend = useCallback((event: BeforeSendEvent) => {
    try {
      if (window.localStorage.getItem(OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY) !== "granted") return null;
      // Query strings can contain researcher-provided labels or identifiers.
      // Keep only the same-origin path before handing the event to Vercel.
      const url = new URL(event.url, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return { ...event, url: url.pathname };
    } catch {
      return null;
    }
  }, []);

  // Keep the provider component mounted only while the current preference is
  // granted. This makes an in-session opt-out remove the provider script as
  // well as suppressing future events in beforeSend.
  if (analyticsDisabled || consent !== "granted") return null;
  return <Analytics beforeSend={beforeSend} />;
}
