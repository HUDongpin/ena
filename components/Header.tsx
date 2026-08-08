"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  localeMeta,
  locales,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";
import Logo from "./Logo";

interface HeaderProps {
  locale: Locale;
  dictionary: Dictionary;
}

function normalizePath(path: string) {
  return path.replace(/\/$/, "") || "/";
}

function localizedPath(pathname: string, locale: Locale) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return `/${locale}`;
  segments[0] = locale;
  return `/${segments.join("/")}`;
}

export default function Header({ locale, dictionary }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);
  const navItems = [
    { href: `/${locale}`, label: dictionary.nav.home },
    { href: `/${locale}/mission`, label: dictionary.nav.mission },
    { href: `/${locale}/news`, label: dictionary.nav.news },
    { href: `/${locale}/academy`, label: dictionary.nav.academy },
    { href: `/${locale}/about`, label: dictionary.nav.about },
  ];

  function isActive(href: string) {
    const normalizedHref = normalizePath(href);
    if (normalizedHref === `/${locale}`) return currentPath === normalizedHref;
    return currentPath === normalizedHref || currentPath.startsWith(`${normalizedHref}/`);
  }

  return (
    <header className="site-header">
      <div className="status-strip" aria-hidden="true" />
      <div className="container header-inner">
        <Logo locale={locale} />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="nav-link focus-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="locale-links" aria-label={dictionary.nav.language}>
          {locales.map((item) => (
            <Link
              key={item}
              href={localizedPath(pathname, item)}
              hrefLang={localeMeta[item].htmlLang}
              aria-current={item === locale ? "true" : undefined}
              className="locale-link focus-ring"
            >
              {localeMeta[item].shortLabel}
            </Link>
          ))}
        </div>
        <button
          type="button"
          className="menu-button focus-ring"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span>{open ? dictionary.nav.close : dictionary.nav.menu}</span>
          <span className="menu-glyph" aria-hidden="true">
            <i />
            <i />
          </span>
        </button>
      </div>
      <div id="mobile-navigation" className="mobile-panel" hidden={!open}>
        <nav className="container mobile-nav" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="mobile-nav-link focus-ring"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="mobile-locales" aria-label={dictionary.nav.language}>
            {locales.map((item) => (
              <Link
                key={item}
                href={localizedPath(pathname, item)}
                hrefLang={localeMeta[item].htmlLang}
                aria-current={item === locale ? "true" : undefined}
                className="mobile-locale-link focus-ring"
                onClick={() => setOpen(false)}
              >
                {localeMeta[item].label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
