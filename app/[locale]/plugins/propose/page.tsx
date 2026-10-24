import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PluginProposalForm from "@/components/plugin-lab/PluginProposalForm";
import { isLocale } from "@/lib/i18n";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";
import { getPluginWorkflowCopy } from "@/lib/plugin-lab/workflow-i18n";
import { pluginLabWorkflowIntakeEnabled } from "@/lib/plugin-lab/mail";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const typed = isLocale(locale) ? locale : "en";
  return { title: getPluginLabCopy(typed).propose, robots: { index: false, follow: false } };
}

export default async function ProposePluginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  const copy = getPluginWorkflowCopy(locale);
  const enabled = pluginLabWorkflowIntakeEnabled();
  return <div className="container plugin-workflow-page" lang={copy.fallback ? "en" : undefined} dir={copy.fallback ? "ltr" : undefined}>
    <header><p className="eyebrow">ENA Plugin Lab</p><h1>{getPluginLabCopy(locale).propose}</h1><p>{copy.formIntro}</p></header>
    {copy.fallback ? <p className="plugin-language-note">{copy.fallbackNotice}</p> : null}
    {enabled ? <PluginProposalForm locale={locale} /> : <aside className="plugin-boundary-note" role="status"><h2>{copy.closedTitle}</h2><p>{copy.closedText}</p><div className="button-row"><a className="button button-secondary" href={`/${locale}/plugins/status`}>{copy.myProposals}</a><a href={`/${locale}/plugins`}>{copy.backCatalog}</a></div></aside>}
  </div>;
}
