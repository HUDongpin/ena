"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";

const websiteLabels: Record<Locale, string> = {
  en: "Website", "zh-hant": "網站", "zh-hans": "网站", es: "Sitio web",
  fr: "Site web", pt: "Site", de: "Website", ar: "الموقع", ko: "웹사이트",
  ja: "サイト", hi: "वेबसाइट", ru: "Сайт", id: "Situs", bn: "ওয়েবসাইট",
};

export default function OpenEnaSiteNavigation({ locale }: { locale: Locale }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const dictionary = getDictionary(locale);
  const label = websiteLabels[locale];
  const links = [
    { path: "", label: dictionary.nav.home },
    { path: "/mission", label: dictionary.nav.mission },
    { path: "/plugins", label: getPluginLabCopy(locale).navLabel },
    { path: "/news", label: dictionary.nav.news },
    { path: "/academy", label: dictionary.nav.academy },
    { path: "/about", label: dictionary.nav.about },
  ];

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu?.matches(":popover-open")) return;

    // The top layer escapes the rail's overflow clipping. Account for CSS zoom
    // as well as ordinary viewport resizing when translating viewport pixels.
    const scale = menu.getBoundingClientRect().width / menu.offsetWidth || 1;
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const margin = 8;
    menu.style.maxWidth = `${Math.max(0, width - margin * 2) / scale}px`;
    menu.style.maxHeight = `${Math.max(0, height - margin * 2) / scale}px`;

    const anchor = trigger.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const style = getComputedStyle(trigger);
    const compact = style.flexDirection === "row";
    const rtl = style.direction === "rtl";
    const preferredLeft = compact
      ? (rtl ? anchor.right - box.width : anchor.left)
      : (rtl ? anchor.left - box.width - margin : anchor.right + margin);
    const preferredTop = compact ? anchor.bottom + margin : anchor.bottom - box.height;
    const left = Math.max(margin, Math.min(preferredLeft, width - box.width - margin));
    const top = Math.max(margin, Math.min(preferredTop, height - box.height - margin));
    menu.style.left = `${left / scale}px`;
    menu.style.top = `${top / scale}px`;
  }, []);

  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(positionMenu);
    if (triggerRef.current) observer.observe(triggerRef.current);
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", positionMenu, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, positionMenu]);

  function closeAfterNavigation() {
    menuRef.current?.hidePopover();
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="ena-site-navigation" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
        menuRef.current?.hidePopover();
      }
    }}>
      <button ref={triggerRef} type="button" className="ena-site-trigger"
        data-ena-site-trigger="true" popoverTarget={menuId} aria-controls={menuId}
        aria-expanded={open}>
        <svg className="ena-site-globe" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </svg>
        <span>{label}</span>
        <svg className="ena-site-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
      </button>
      <nav ref={menuRef} id={menuId} popover="auto" className="ena-site-menu"
        data-ena-site-navigation="true" data-open={open} aria-label={label}
        onToggle={(event) => {
          if (event.newState === "open") positionMenu();
          setOpen(event.newState === "open");
        }}>
        {links.map((link) => (
          <a key={link.path} href={`/${locale}${link.path}`} target="_blank" rel="noopener noreferrer"
            aria-label={`${link.label} — ${dictionary.common.externalLink}`}
            title={dictionary.common.externalLink} onClick={closeAfterNavigation}
            onAuxClick={(event) => { if (event.button === 1) closeAfterNavigation(); }}>
            <span>{link.label}</span>
            <svg className="ena-site-new-tab" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M8 4.5H5A1.5 1.5 0 0 0 3.5 6v9A1.5 1.5 0 0 0 5 16.5h9a1.5 1.5 0 0 0 1.5-1.5v-3" />
              <path d="M11.5 3.5h5v5m0-5-7 7" />
            </svg>
          </a>
        ))}
      </nav>
    </div>
  );
}
