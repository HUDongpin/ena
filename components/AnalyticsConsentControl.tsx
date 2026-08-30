"use client";

import { useEffect, useState } from "react";
import {
  isOpenEnaAnalyticsConsent,
  OPEN_ENA_ANALYTICS_CONSENT_EVENT,
  OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY,
  type OpenEnaAnalyticsConsent,
} from "@/lib/analytics-consent";

type AnalyticsConsentControlCopy = {
  enable: string;
  disable: string;
  enabled: string;
  disabled: string;
  undecided: string;
};

interface AnalyticsConsentControlProps {
  copy: AnalyticsConsentControlCopy;
}

export default function AnalyticsConsentControl({ copy }: AnalyticsConsentControlProps) {
  const [consent, setConsent] = useState<OpenEnaAnalyticsConsent | "unknown">("unknown");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY);
      setConsent(isOpenEnaAnalyticsConsent(stored) ? stored : "unknown");
    } catch {
      setConsent("unknown");
    }
  }, []);

  function update(next: OpenEnaAnalyticsConsent) {
    try {
      window.localStorage.setItem(OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY, next);
    } catch {
      // A restricted storage context still gets an in-memory, current-page choice.
    }
    setConsent(next);
    window.dispatchEvent(new CustomEvent(OPEN_ENA_ANALYTICS_CONSENT_EVENT, { detail: next }));
  }

  return (
    <div className="footer-analytics-consent" data-ena-analytics-consent="explicit">
      <span role="status" aria-live="polite">
        {consent === "granted" ? copy.enabled : consent === "denied" ? copy.disabled : copy.undecided}
      </span>
      {consent === "granted" ? (
        <button type="button" onClick={() => update("denied")}>{copy.disable}</button>
      ) : (
        <button type="button" onClick={() => update("granted")}>{copy.enable}</button>
      )}
    </div>
  );
}
