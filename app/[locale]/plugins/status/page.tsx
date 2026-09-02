import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isLocale, type Locale } from "@/lib/i18n";
import { getPluginLabCopy, getPluginProposalStatusCopy, pluginProposalMessageLabel, pluginProposalStateLabel } from "@/lib/plugin-lab/i18n";
import { PLUGIN_LAB_STATUS_COOKIE } from "@/lib/plugin-lab/crypto";
import { readPluginLabStatusForSession } from "@/lib/server/plugin-lab-read";
import PluginPublicConsentControls from "@/components/plugin-lab/PluginPublicConsentControls";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const typed = isLocale(locale) ? locale : "en";
  return { title: getPluginLabCopy(typed).status, robots: { index: false, follow: false } };
}

export default async function PluginStatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound(); const typed = locale as Locale; const copy = getPluginLabCopy(typed); const statusCopy = getPluginProposalStatusCopy(typed);
  const token = (await cookies()).get(PLUGIN_LAB_STATUS_COOKIE)?.value;
  const status = await readPluginLabStatusForSession(token);
  return <div className="container plugin-workflow-page"><header><p className="eyebrow">{statusCopy.privateAccess}</p><h1>{copy.status}</h1><p>{statusCopy.accessIntro}</p>{statusCopy.fallback ? <p className="plugin-language-note">{statusCopy.fallbackNotice}</p> : null}</header><div lang={statusCopy.fallback ? "en" : undefined}>{status ? <section className="plugin-status-result" aria-labelledby="plugin-status-result-title"><p className="eyebrow">{status.proposalId}</p><h2 id="plugin-status-result-title">{statusCopy.currentStatus}: {pluginProposalStateLabel(status.state, typed)}</h2><p>{statusCopy.lastUpdated}: <time dateTime={status.updatedAt}>{status.updatedAt}</time></p><ol>{status.events.map((event, index) => <li key={`${event.recordedAt}:${index}`}><strong>{pluginProposalStateLabel(event.state, typed)}</strong><span>{pluginProposalMessageLabel(event.messageCode, typed)}</span><time dateTime={event.recordedAt}>{event.recordedAt}</time></li>)}</ol>{"publicPreview" in status && status.publicPreview && (status.publicConsentStatus === "requested" || status.publicConsentStatus === "confirmed") ? <PluginPublicConsentControls title={status.publicPreview.title} publicSummary={status.publicPreview.publicSummary} locale={typed} consentStatus={status.publicConsentStatus} /> : null}<aside className="plugin-boundary-note"><strong>{statusCopy.statusBoundaryTitle}</strong><p>{statusCopy.statusBoundaryText}</p></aside></section> : <form className="plugin-status-form" action="/api/plugin-lab/status-session" method="post"><input type="hidden" name="locale" value={locale} /><label>{statusCopy.proposalId}<input name="proposalId" autoComplete="off" required /></label><label>{statusCopy.accessCode}<input name="accessCode" type="password" autoComplete="off" required /></label><button className="button button-primary" type="submit">{statusCopy.viewStatus}</button></form>}</div></div>;
}
