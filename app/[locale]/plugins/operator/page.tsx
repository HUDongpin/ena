import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { isLocale } from "@/lib/i18n";
import { OPEN_ENA_SESSION_COOKIE } from "@/lib/open-ena-auth";
import { readPluginLabOperatorInbox } from "@/lib/server/plugin-lab-read";
import PluginOperatorInbox from "@/components/plugin-lab/PluginOperatorInbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ENA Plugin Lab Operator", robots: { index: false, follow: false } }; // noindex private workflow

export default async function PluginOperatorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  const session = (await cookies()).get(OPEN_ENA_SESSION_COOKIE)?.value;
  const inbox = await readPluginLabOperatorInbox(session);
  return <div className="container plugin-workflow-page plugin-operator-page"><header><p className="eyebrow">Restricted operator surface</p><h1>Plugin proposal inbox</h1><p>This surface requires Dr. Peter Hu's static Open ENA operator session. Disposable test accounts cannot administer proposals.</p></header>{inbox ? <PluginOperatorInbox records={inbox.records} csrf={inbox.csrf} locale={locale} /> : <aside className="plugin-boundary-note"><strong>Operator access unavailable</strong><p>Sign in to Open ENA with the static operator account, then return here. Invalid, revoked, disposable, or unconfigured sessions fail closed.</p><Link className="button button-secondary" href={`/${locale}/open-ena`}>Open ENA sign in</Link></aside>}</div>;
}
