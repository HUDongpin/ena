"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { type Dictionary, type Locale } from "@/lib/i18n";
import LanguageSwitcher, { LanguageSwitcherFallback } from "./LanguageSwitcher";
import Logo from "./Logo";

interface HeaderProps {
  locale: Locale;
  dictionary: Dictionary;
}

function normalizePath(path: string) {
  return path.replace(/\/$/, "") || "/";
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
      <div className="container header-inner">
        <Logo locale={locale} />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href.endsWith("/about") ? false : undefined}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="nav-link focus-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="desktop-language">
          <Suspense fallback={<LanguageSwitcherFallback locale={locale} label={dictionary.nav.language} />}>
            <LanguageSwitcher locale={locale} label={dictionary.nav.language} />
          </Suspense>
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
              prefetch={item.href.endsWith("/about") ? false : undefined}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="mobile-nav-link focus-ring"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="mobile-locales" aria-label={dictionary.nav.language}>
            <Suspense fallback={<LanguageSwitcherFallback locale={locale} label={dictionary.nav.language} />}>
              <LanguageSwitcher
                locale={locale}
                label={dictionary.nav.language}
                align="left"
                onSelect={() => setOpen(false)}
              />
            </Suspense>
          </div>
        </nav>
      </div>
    </header>
  );
}
