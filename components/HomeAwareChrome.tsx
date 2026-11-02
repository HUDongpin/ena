"use client";

import { usePathname } from "next/navigation";

// Home and Nova own their main landmarks. Nova also owns its complete app shell.
export default function HomeAwareChrome({ locale, children, header, footer, backToTop, skipLink }: {
  locale: string;
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  backToTop: React.ReactNode;
  skipLink: React.ReactNode;
}) {
  const path = usePathname().replace(/\/$/, "");
  if (path === `/${locale}/plugins`) return <>{skipLink}{children}</>;
  if (path === `/${locale}`) return <>{skipLink}{header}{children}</>;
  return <>
    {skipLink}
    {header}
    <main id="main-content">{children}</main>
    {footer}
    {backToTop}
  </>;
}
