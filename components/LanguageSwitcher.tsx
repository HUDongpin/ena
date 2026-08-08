"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMeta = localeMeta[locale];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="language-switcher">
      <button
        type="button"
        className="language-button focus-ring"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <span dir={currentMeta.dir}>{currentMeta.label}</span>
        <span className="language-chevron" data-open={open ? "true" : "false"} aria-hidden="true">⌄</span>
      </button>

      <div
        className="language-menu"
        data-align={align}
        data-open={open ? "true" : "false"}
        hidden={!open}
        role="listbox"
        aria-label={label}
      >
        <div className="language-options">
          {locales.map((item) => {
            const meta = localeMeta[item];
            const active = item === locale;

            return (
              <Link
                key={item}
                href={buildLocalePath(pathname, queryString, item)}
                hrefLang={meta.htmlLang}
                role="option"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                className="language-option focus-ring"
                onClick={() => {
                  setOpen(false);
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
