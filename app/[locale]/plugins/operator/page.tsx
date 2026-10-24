import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { isLocale } from "@/lib/i18n";
import { OPEN_ENA_SESSION_COOKIE } from "@/lib/open-ena-auth";
import { readPluginLabWorkflowOperatorInbox } from "@/lib/server/plugin-lab-workflow-operator";
import { getPluginWorkflowCopy } from "@/lib/plugin-lab/workflow-i18n";
import PluginOperatorInbox from "@/components/plugin-lab/PluginOperatorInbox";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getPluginWorkflowCopy(isLocale(locale) ? locale : "en").operatorTitle, robots: { index: false, follow: false } };
}

export default async function PluginOperatorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound(); const copy = getPluginWorkflowCopy(locale);
  const session = (await cookies()).get(OPEN_ENA_SESSION_COOKIE)?.value;
  const inbox = await readPluginLabWorkflowOperatorInbox(session, {});
  return <div className="container plugin-workflow-page plugin-operator-page" lang={copy.fallback ? "en" : undefined} dir={copy.fallback ? "ltr" : undefined}>
    <header><p className="eyebrow">{copy.operatorEyebrow}</p><h1>{copy.operatorTitle}</h1><p>{copy.operatorIntro}</p></header>
    {copy.fallback ? <p className="plugin-language-note">{copy.fallbackNotice}</p> : null}
    {inbox ? <PluginOperatorInbox records={inbox.records} csrf={inbox.csrf} locale={locale} /> : <aside className="plugin-boundary-note"><strong>{copy.operatorUnavailable}</strong><p>{copy.operatorAccessHint}</p><Link className="button button-secondary" href={`/${locale}/open-ena`}>{copy.openSignIn}</Link></aside>}
  </div>;
}
