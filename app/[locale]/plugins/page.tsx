import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PluginCatalogBrowser from "@/components/plugin-lab/PluginCatalogBrowser";
import { isLocale, type Locale } from "@/lib/i18n";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";
import { OPEN_ENA_PLUGIN_CATALOG } from "@/lib/open-ena/plugins/catalog";
import { pageMetadata } from "@/lib/metadata";
import { readPluginLabPublicSummaries } from "@/lib/server/plugin-lab-read";
import { pluginLabWorkflowIntakeEnabled } from "@/lib/plugin-lab/mail";
import { getPluginWorkflowCopy } from "@/lib/plugin-lab/workflow-i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const typed = isLocale(locale) ? locale : "en"; const copy = getPluginLabCopy(typed);
  return pageMetadata({ locale: typed, path: "/plugins", title: "ENA Plugin Lab", description: copy.intro });
}

export default async function PluginLabPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound(); const typed = locale as Locale; const copy = getPluginLabCopy(typed);
  const publicSummaries = await readPluginLabPublicSummaries();
  const workflowCopy = getPluginWorkflowCopy(typed);
  const intakeEnabled = pluginLabWorkflowIntakeEnabled();
  return (
    <div className="container plugin-lab-page plugin-lab-overview" lang={copy.contentFallback ? "en" : undefined} dir={copy.contentFallback ? "ltr" : undefined}>
      {copy.contentFallback ? <p className="plugin-language-note">{copy.fallbackNotice}</p> : null}
      <header className="plugin-lab-heading">
        <div className="plugin-lab-intro">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 lang={copy.contentFallback ? typed : undefined}>{copy.navLabel}</h1>
          <p>{copy.intro}</p>
        </div>
        <div className="plugin-lab-entry">
          <div className="plugin-lab-entry-actions">
            <Link className="button button-primary" href={`/${typed}/plugins/propose`}>{copy.propose}</Link>
            <Link className="button button-secondary" href={`/${typed}/plugins/status`}>{workflowCopy.myProposals}</Link>
          </div>
          <p className="plugin-intake-helper">{intakeEnabled ? workflowCopy.intakeAvailable : workflowCopy.intakeUnavailable}</p>
        </div>
      </header>
      <PluginCatalogBrowser plugins={OPEN_ENA_PLUGIN_CATALOG} locale={typed} />
      <aside className="plugin-lab-boundary" aria-label={copy.independentBoundaryTitle}>
        <p><strong>{copy.independentBoundaryTitle}.</strong> {copy.independentBoundary}</p>
      </aside>
      <section className="plugin-lab-participate" aria-labelledby="plugin-cocreate-title">
        <h2 id="plugin-cocreate-title">{copy.coCreateEyebrow}</h2>
        <p><strong>{copy.coCreateTitle}</strong> {copy.coCreateText}</p>
        <ul className="plugin-lab-tracks"><li>{copy.publicTrack}</li><li>{copy.privateTrack}</li></ul>
        <details className="plugin-lab-process" open>
          <summary>{copy.processTitle}</summary>
          <ol>{copy.process.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
        </details>
      </section>
      {publicSummaries.length ? (
        <section className="plugin-lab-community" aria-labelledby="plugin-public-roadmap-title">
          <header><h2 id="plugin-public-roadmap-title">{copy.selectedIdeas}</h2><p>{copy.selectedIdeasIntro}</p></header>
          <ul>{publicSummaries.map((summary) => (
            <li key={summary.proposalId}>
              <article>
                <div className="plugin-lab-community-heading"><h3>{summary.title}</h3><span>{copy.communityProposal} · {copy.selectedLabel}</span></div>
                <p>{summary.publicSummary}</p>
                <p className="plugin-lab-community-meta"><code>{summary.proposalId}</code> · {copy.updatedLabel} <time dateTime={summary.updatedAt}>{summary.updatedAt.slice(0, 10)}</time></p>
              </article>
            </li>
          ))}</ul>
        </section>
      ) : null}
    </div>
  );
}
