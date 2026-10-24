import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPluginWorkflowCopy } from "@/lib/plugin-lab/workflow-i18n";
import PluginProposalStatus from "@/components/plugin-lab/PluginProposalStatus";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const typed = isLocale(locale) ? locale : "en";
  return { title: getPluginWorkflowCopy(typed).myProposals, robots: { index: false, follow: false } };
}

export default async function PluginStatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound(); const copy = getPluginWorkflowCopy(locale);
  return <div className="container plugin-workflow-page" lang={copy.fallback ? "en" : undefined} dir={copy.fallback ? "ltr" : undefined}>
    <header><p className="eyebrow">ENA Plugin Lab</p><h1>{copy.myProposals}</h1><p>{copy.statusIntro}</p></header>
    {copy.fallback ? <p className="plugin-language-note">{copy.fallbackNotice}</p> : null}
    <PluginProposalStatus locale={locale} />
  </div>;
}
