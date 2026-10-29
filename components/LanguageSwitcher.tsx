"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { localeMeta, locales, type Locale } from "@/lib/i18n";
import { buildLocalePath } from "@/lib/locale-path";

interface LanguageSwitcherProps {
  locale: Locale;
  label: string;
  align?: "left" | "right";
  onSelect?: () => void;
  navigationFocusRef?: RefObject<HTMLButtonElement | null>;
}

// Set only by browser click handlers; carries no form data and is never persisted.
// The incoming [locale] layout consumes the intent after its controls mount.
let pendingNavigationFocus: { from: string; to: string; align: "left" | "right" } | null = null;

export function LanguageSwitcherFallback({ locale, label }: Pick<LanguageSwitcherProps, "locale" | "label">) {
  return (
    <button type="button" className="language-button" aria-label={label} disabled>
      <span dir={localeMeta[locale].dir}>{localeMeta[locale].label}</span>
      <span className="language-chevron" aria-hidden="true">⌄</span>
    </button>
  );
}

export default function LanguageSwitcher({
  locale,
  label,
  align = "right",
  onSelect,
  navigationFocusRef,
}: LanguageSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => locales.indexOf(locale));
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const menuId = useId();
  const currentMeta = localeMeta[locale];
  const currentHref = `${pathname}${queryString ? `?${queryString}` : ""}`;

  useEffect(() => {
    const intent = pendingNavigationFocus;
    if (!intent || currentHref === intent.from) return;
    if (currentHref !== intent.to) { pendingNavigationFocus = null; return; }
    if (intent.align !== align) return;
    pendingNavigationFocus = null;
    (navigationFocusRef?.current ?? buttonRef.current)?.focus();
  }, [currentHref, align, navigationFocusRef]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  function openMenu() {
    setActiveIndex(locales.indexOf(locale));
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let nextIndex = activeIndex;
    switch (event.key) {
      case "ArrowDown": nextIndex = (activeIndex + 1) % locales.length; break;
      case "ArrowUp": nextIndex = (activeIndex + locales.length - 1) % locales.length; break;
      case "Home": nextIndex = 0; break;
      case "End": nextIndex = locales.length - 1; break;
      case " ":
        event.preventDefault();
        optionRefs.current[activeIndex]?.click();
        return;
      default: return;
    }
    event.preventDefault();
    setActiveIndex(nextIndex);
  }

  return (
    <div ref={containerRef} className="language-switcher" onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    }}>
      <button
        ref={buttonRef}
        type="button"
        className="language-button focus-ring"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onPointerDown={(event) => { if (open) event.preventDefault(); }}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span dir={currentMeta.dir}>{currentMeta.label}</span>
        <span className="language-chevron" data-open={open ? "true" : "false"} aria-hidden="true">⌄</span>
      </button>

      <div
        id={menuId}
        className="language-menu"
        data-align={align}
        data-open={open ? "true" : "false"}
        hidden={!open}
        role="listbox"
        aria-label={label}
        onKeyDown={handleMenuKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <div className="language-options">
          {locales.map((item, index) => {
            const meta = localeMeta[item];
            const active = item === locale;

            return (
              <Link
                key={item}
                ref={(element) => { optionRefs.current[index] = element; }}
                href={buildLocalePath(pathname, queryString, item)}
                hrefLang={meta.htmlLang}
                role="option"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                tabIndex={index === activeIndex ? 0 : -1}
                className="language-option focus-ring"
                onFocus={() => setActiveIndex(index)}
                onClick={(event) => {
                  pendingNavigationFocus = !active && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
                    ? { from: currentHref, to: buildLocalePath(pathname, queryString, item), align } : null;
                  closeMenu();
                  onSelect?.();
                }}
              >
                <span dir={meta.dir}>{meta.label}</span>
                {active && <span aria-hidden="true">✓</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
