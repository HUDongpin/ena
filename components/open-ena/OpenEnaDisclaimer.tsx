"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import OpenEnaAttribution from "@/components/OpenEnaAttribution";
import { getDictionary, getLocaleMeta, type Locale } from "@/lib/i18n";
import { getOpenEnaAttributionCopy } from "@/lib/open-ena-attribution";

export default function OpenEnaDisclaimer({ locale }: { locale: Locale }) {
  const popupId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = getOpenEnaAttributionCopy(locale).disclaimerLabel;
  const meta = getLocaleMeta(locale);

  const positionPopup = useCallback(() => {
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    if (!trigger || !popup?.matches(":popover-open")) return;

    // Match Website's top-layer positioning, including the workbench's CSS zoom.
    const scale = popup.getBoundingClientRect().width / popup.offsetWidth || 1;
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const margin = 8;
    popup.style.maxWidth = `${Math.max(0, width - margin * 2) / scale}px`;
    popup.style.maxHeight = `${Math.max(0, height - margin * 2) / scale}px`;

    const anchor = trigger.getBoundingClientRect();
    const box = popup.getBoundingClientRect();
    const style = getComputedStyle(trigger);
    const compact = style.flexDirection === "row";
    const rtl = style.direction === "rtl";
    const preferredLeft = compact
      ? (rtl ? anchor.right - box.width : anchor.left)
      : (rtl ? anchor.left - box.width - margin : anchor.right + margin);
    const preferredTop = compact ? anchor.bottom + margin : anchor.bottom - box.height;
    const left = Math.max(margin, Math.min(preferredLeft, width - box.width - margin));
    const top = Math.max(margin, Math.min(preferredTop, height - box.height - margin));
    popup.style.left = `${left / scale}px`;
    popup.style.top = `${top / scale}px`;
  }, []);

  const closePopup = useCallback(() => {
    popupRef.current?.hidePopover();
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(positionPopup);
    if (triggerRef.current) observer.observe(triggerRef.current);
    if (popupRef.current) observer.observe(popupRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePopup();
    };
    window.addEventListener("resize", positionPopup);
    document.addEventListener("scroll", positionPopup, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionPopup);
      document.removeEventListener("scroll", positionPopup, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, positionPopup, closePopup]);

  return (
    <div className="ena-site-navigation ena-disclaimer" lang={meta.htmlLang} dir={meta.dir}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          popupRef.current?.hidePopover();
        }
      }}>
      <button ref={triggerRef} type="button" className="ena-site-trigger ena-disclaimer-trigger"
        data-ena-disclaimer-trigger="true" popoverTarget={popupId} aria-controls={popupId}
        aria-expanded={open} aria-haspopup="dialog">
        <svg className="ena-site-globe" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6m0-10v.5" />
        </svg>
        <span>{label}</span>
        <svg className="ena-site-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
      </button>
      <section ref={popupRef} id={popupId} popover="auto" className="ena-disclaimer-popup"
        data-ena-disclaimer-popup="true" data-open={open} role="dialog" aria-modal="false"
        aria-labelledby={titleId} onToggle={(event) => {
          const opening = event.newState === "open";
          if (opening) positionPopup();
          setOpen(opening);
        }}>
        <div className="ena-disclaimer-heading">
          <h2 id={titleId}>{label}</h2>
          <button ref={closeRef} type="button" className="ena-disclaimer-close"
            aria-label={getDictionary(locale).nav.close} onClick={closePopup}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <OpenEnaAttribution locale={locale} aboutHref={`/${locale}/about`} variant="popup" />
      </section>
    </div>
  );
}
