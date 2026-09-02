import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PluginProposalForm from "@/components/plugin-lab/PluginProposalForm";
import { isLocale, type Locale } from "@/lib/i18n";
import { getPluginLabCopy, getPluginProposalFormCopy } from "@/lib/plugin-lab/i18n";
import { pluginLabProposalIntakeEnabled } from "@/lib/plugin-lab/config";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const typed = isLocale(locale) ? locale : "en";
  return { title: getPluginLabCopy(typed).propose, robots: { index: false, follow: false } };
}

export default async function ProposePluginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound(); const typed = locale as Locale; const copy = getPluginLabCopy(typed);
  const formCopy = getPluginProposalFormCopy(typed);
  const enabled = pluginLabProposalIntakeEnabled();
  return <div className="container plugin-workflow-page"><header><p className="eyebrow">{copy.coCreateEyebrow}</p><h1>{copy.propose}</h1><p>{copy.coCreateText}</p></header><div lang={formCopy.fallback ? "en" : undefined}>{formCopy.fallback ? <p className="plugin-language-note">{formCopy.fallbackNotice}</p> : null}<aside className="plugin-boundary-note"><strong>{formCopy.beforeSubmitTitle}</strong><p>{formCopy.beforeSubmitText}</p></aside>{enabled ? <PluginProposalForm locale={typed} /> : <aside className="plugin-boundary-note" role="status"><strong>{formCopy.intakeClosedTitle}</strong><p>{formCopy.intakeClosedText}</p></aside>}</div></div>;
}
