"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { OpenEnaPluginManifestV1 } from "@/lib/open-ena/plugins/types";
import {
  getPluginLabCopy,
  pluginContentForLocale,
  pluginContributionLabel,
  pluginLifecycleLabel,
  pluginReviewStatusLabel,
  pluginScientificEvidenceLabel,
} from "@/lib/plugin-lab/i18n";

export default function PluginCatalogBrowser({ plugins, locale }: {
  plugins: readonly OpenEnaPluginManifestV1[];
  locale: Locale;
}) {
  const displayPlugins = [...plugins].sort((left, right) => Number(right.slug === "longitudinal-ena") - Number(left.slug === "longitudinal-ena"));
  const [selectedId, setSelectedId] = useState(displayPlugins[0]?.pluginId);
  const id = useId();
  const copy = getPluginLabCopy(locale);
  const plugin = plugins.find((entry) => entry.pluginId === selectedId) ?? displayPlugins[0];
  if (!plugin) return null;
  const localized = pluginContentForLocale(plugin, locale);
  const panelId = `${id}-detail`;
  const titleId = `${id}-title`;

  return (
    <section className="plugin-browser-section" aria-labelledby={`${id}-catalog`}>
      <header className="plugin-browser-heading">
        <h2 id={`${id}-catalog`}>{copy.catalogTitle}</h2>
        <p>{copy.catalogIntro}</p>
      </header>
      <div className="plugin-browser">
        <div className="plugin-browser-selector" role="group" aria-label={copy.choosePlugin}>
          {displayPlugins.map((entry) => {
            const content = pluginContentForLocale(entry, locale);
            return (
              <button
                key={entry.pluginId}
                type="button"
                className="plugin-browser-choice"
                aria-pressed={entry.pluginId === plugin.pluginId}
                aria-controls={panelId}
                lang={content.fallback ? "en" : undefined}
                onClick={() => setSelectedId(entry.pluginId)}
              >
                <span className="plugin-browser-choice-name">{content.content.name}</span>
                <span className="plugin-browser-choice-meta">
                  <span>{pluginContributionLabel(entry.contributionKinds[0], locale)}</span>
                  <span>{pluginLifecycleLabel(entry.lifecycle, locale)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <section className="plugin-browser-detail" id={panelId} aria-labelledby={titleId} lang={localized.fallback ? "en" : undefined}>
          <header className="plugin-browser-detail-heading">
            <div>
              <h3 id={titleId}>{localized.content.name}</h3>
              <p>{localized.content.tagline}</p>
            </div>
            <span className="plugin-browser-version">{copy.version} <code>{plugin.version}</code></span>
          </header>
          <dl className="plugin-browser-facts">
            <div><dt>{copy.productStatus}</dt><dd>{pluginLifecycleLabel(plugin.lifecycle, locale)}</dd></div>
            <div><dt>{copy.changesAnalysis}</dt><dd data-answer={plugin.changesAnalysis ? "yes" : "no"}>{plugin.changesAnalysis ? copy.yes : copy.no}</dd></div>
            <div><dt>{copy.scientificEvidence}</dt><dd>{pluginScientificEvidenceLabel(plugin.scientificEvidence, locale)}</dd></div>
            <div><dt>{copy.engineeringAssurance}</dt><dd><ul className="plugin-browser-checks">
              <li>{copy.automatedTests}: {pluginReviewStatusLabel(plugin.engineeringAssurance.automatedTests, locale)}</li>
              <li>{copy.browserRuntime}: {pluginReviewStatusLabel(plugin.engineeringAssurance.browserRuntime, locale)}</li>
              <li>{copy.securityPrivacy}: {pluginReviewStatusLabel(plugin.engineeringAssurance.securityPrivacyReview, locale)}</li>
            </ul></dd></div>
          </dl>
          <div className="plugin-browser-research">
            <h4>{copy.researchQuestion}</h4>
            <p>{localized.content.researchQuestion}</p>
          </div>
          <div className="plugin-browser-limitations">
            <h4>{copy.limitations}</h4>
            <ul>{localized.content.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
          </div>
          <div className="plugin-browser-actions">
            <Link className="button button-primary" href={`/${locale}/plugins/${plugin.slug}`} prefetch={false}>{copy.viewFullDetails}<span aria-hidden="true"> →</span></Link>
            <Link className="button button-secondary" href={`/${locale}/open-ena`} prefetch={false}>{copy.tryPlugin}</Link>
          </div>
        </section>
      </div>
    </section>
  );
}
