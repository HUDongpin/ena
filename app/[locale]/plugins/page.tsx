import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PluginCard from "@/components/plugin-lab/PluginCard";
import { isLocale, type Locale } from "@/lib/i18n";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";
import { OPEN_ENA_PLUGIN_CATALOG } from "@/lib/open-ena/plugins/catalog";
import { pageMetadata } from "@/lib/metadata";
import { readPluginLabPublicSummaries } from "@/lib/server/plugin-lab-read";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const typed = isLocale(locale) ? locale : "en"; const copy = getPluginLabCopy(typed);
  return pageMetadata({ locale: typed, path: "/plugins", title: "ENA Plugin Lab", description: copy.intro });
}

export default async function PluginLabPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound(); const typed = locale as Locale; const copy = getPluginLabCopy(typed);
  const publicSummaries = await readPluginLabPublicSummaries();
  return <div className="plugin-lab-page" lang={copy.contentFallback ? "en" : undefined}>
    {copy.contentFallback ? <p className="container plugin-language-note">{copy.fallbackNotice}</p> : null}
    <section className="container plugin-lab-hero"><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.intro}</p><div className="button-row"><Link className="button button-primary" href={`/${typed}/plugins/propose`}>{copy.propose}</Link><Link className="button button-secondary" href={`/${typed}/plugins/status`}>{copy.status}</Link></div></section>
    <aside className="container plugin-boundary-note"><strong>{copy.independentBoundaryTitle}</strong><p>{copy.independentBoundary}</p></aside>
    <section className="container plugin-catalog" aria-labelledby="plugin-catalog-title"><div className="section-heading"><p className="eyebrow">ENA Plugins</p><h2 id="plugin-catalog-title">{copy.catalogTitle}</h2><p>{copy.catalogIntro}</p></div><div className="plugin-grid">{OPEN_ENA_PLUGIN_CATALOG.map((plugin) => <PluginCard key={plugin.pluginId} plugin={plugin} locale={typed} copy={copy} />)}</div></section>
    <section className="container plugin-cocreate"><div><p className="eyebrow">{copy.coCreateEyebrow}</p><h2>{copy.coCreateTitle}</h2><p>{copy.coCreateText}</p><ul><li>{copy.publicTrack}</li><li>{copy.privateTrack}</li></ul></div><Link className="button button-primary" href={`/${typed}/plugins/propose`}>{copy.propose}</Link></section>
    <section className="container plugin-process" aria-labelledby="plugin-process-title"><h2 id="plugin-process-title">{copy.processTitle}</h2><ol>{copy.process.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol></section>
    {publicSummaries.length ? <section className="container plugin-public-roadmap" aria-labelledby="plugin-public-roadmap-title"><div className="section-heading"><p className="eyebrow">{copy.communityProposals}</p><h2 id="plugin-public-roadmap-title">{copy.selectedIdeas}</h2><p>{copy.selectedIdeasIntro}</p></div><div className="plugin-grid">{publicSummaries.map((summary) => <article className="plugin-card" key={summary.proposalId}><p className="plugin-card-meta"><span>{copy.communityProposal}</span><span>{copy.selectedLabel}</span></p><h3>{summary.title}</h3><p>{summary.publicSummary}</p><p><code>{summary.proposalId}</code> · {copy.updatedLabel} {summary.updatedAt.slice(0, 10)}</p></article>)}</div></section> : null}
  </div>;
}
