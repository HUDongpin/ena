"use client";

import { usePathname } from "next/navigation";

// The Home page owns its complete shared shell. Other routes keep the ENA shell.
export default function HomeAwareChrome({ locale, children, header, footer, backToTop, skipLink }: {
  locale: string;
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  backToTop: React.ReactNode;
  skipLink: React.ReactNode;
}) {
  const path = usePathname().replace(/\/$/, "");
  if (path === `/${locale}`) return <>{children}</>;
  return <>
    {skipLink}
    {header}
    <main id="main-content">{children}</main>
    {footer}
    {backToTop}
  </>;
}
