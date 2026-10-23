import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import OpenEnaAccountForm from "@/components/open-ena/OpenEnaAccountForm";
import { openEnaCloudEnabled } from "@/lib/server/open-ena-cloud-db";
import { openEnaAccountMailReady } from "@/lib/server/open-ena-account-mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Preserve Origin on a subsequent same-origin native login POST after client navigation.
// Action tokens are fragments (stripped by the form) and are never sent in Referer.
export const metadata: Metadata = { title: "Account | Open ENA", robots: { index: false, follow: false }, referrer: "same-origin" };

export default async function OpenEnaAccountPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const enabled = openEnaCloudEnabled(), mail = openEnaAccountMailReady(), query = await searchParams;
  return <OpenEnaAccountForm locale={locale} initialMode={query.mode === "reset" ? "forgot-password" : "register"}
    enabled={enabled} registrationAvailable={enabled && mail && process.env.OPEN_ENA_REGISTRATION_ENABLED === "true"} recoveryAvailable={enabled && mail} />;
}
