import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { pluginContentForLocale, pluginContributionLabel, pluginLifecycleLabel, pluginScientificEvidenceLabel, type PluginLabCopy } from "@/lib/plugin-lab/i18n";
import type { OpenEnaPluginManifestV1 } from "@/lib/open-ena/plugins/types";

export default function PluginCard({ plugin, locale, copy }: { plugin: OpenEnaPluginManifestV1; locale: Locale; copy: PluginLabCopy }) {
  const localized = pluginContentForLocale(plugin, locale);
  return (
    <article className="plugin-card" lang={localized.fallback ? "en" : undefined}>
      <div className="plugin-card-meta">
        <span>{pluginContributionLabel(plugin.contributionKinds[0], locale)}</span>
        <span>{pluginLifecycleLabel(plugin.lifecycle, locale)}</span>
      </div>
      <h3><Link href={`/${locale}/plugins/${plugin.slug}`}>{localized.content.name}</Link></h3>
      <p>{localized.content.tagline}</p>
      <dl className="plugin-card-facts">
        <div><dt>{copy.changesAnalysis}</dt><dd data-answer={plugin.changesAnalysis ? "yes" : "no"}>{plugin.changesAnalysis ? copy.yes : copy.no}</dd></div>
        <div><dt>{copy.scientificEvidence}</dt><dd>{pluginScientificEvidenceLabel(plugin.scientificEvidence, locale)}</dd></div>
        <div><dt>{copy.version}</dt><dd><code>{plugin.version}</code></dd></div>
      </dl>
      {localized.fallback ? <p className="plugin-language-note">{localized.fallbackNotice}</p> : null}
      <Link className="plugin-card-link" href={`/${locale}/plugins/${plugin.slug}`}>{copy.explore}<span aria-hidden="true"> →</span></Link>
    </article>
  );
}
