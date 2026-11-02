import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NovaWorkbench from "@/components/nova/NovaWorkbench";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { novaWebFontsEnabled } from "@/lib/nova/fonts";
import { getNovaCopy } from "@/components/nova/copy";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const typed = isLocale(locale) ? locale : "en";
  return { ...pageMetadata({ locale: typed, path: "/plugins", title: "Nova Code · Open ENA Plugin Lab", description: getNovaCopy(typed).intro }), robots: { index: false, follow: false } };
}
export default async function PluginLabPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  return <NovaWorkbench locale={locale} useWebFonts={novaWebFontsEnabled()}/>;
}
