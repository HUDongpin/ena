"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { localeMeta, locales, type Locale } from "@/lib/i18n";
import { buildLocalePath } from "@/lib/locale-path";

interface LanguageSwitcherProps {
  locale: Locale;
  label: string;
  align?: "left" | "right";
  onSelect?: () => void;
}

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
                onClick={() => {
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
