"use client";

import { usePathname } from "next/navigation";

// The Home page owns its complete shared shell. Other routes keep the ENA shell.
export default function HomeAwareChrome({ locale, children, header, footer, backToTop, skipLabel }: {
  locale: string;
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  backToTop: React.ReactNode;
  skipLabel: string;
}) {
  const path = usePathname().replace(/\/$/, "");
  if (path === `/${locale}`) return <>{children}</>;
  return <>
    <a href="#main-content" className="skip-link">{skipLabel}</a>
    {header}
    <main id="main-content">{children}</main>
    {footer}
    {backToTop}
  </>;
}
