"use client";

import { usePathname } from "next/navigation";

// Home owns its main landmark and footer; every public page shares the header.
export default function HomeAwareChrome({ locale, children, header, footer, backToTop, skipLink }: {
  locale: string;
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  backToTop: React.ReactNode;
  skipLink: React.ReactNode;
}) {
  const path = usePathname().replace(/\/$/, "");
  if (path === `/${locale}`) return <>{skipLink}{header}{children}</>;
  return <>
    {skipLink}
    {header}
    <main id="main-content">{children}</main>
    {footer}
    {backToTop}
  </>;
}
