import assert from "node:assert/strict";
import test from "node:test";
import { renderWorkspaceShellV3 } from "./helpers/open-ena-workspace-v3-ui";
import { getDictionary, locales } from "../lib/i18n";
import { getPluginLabCopy } from "../lib/plugin-lab/i18n";
import { getOpenEnaAttributionCopy } from "../lib/open-ena-attribution";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

test("workspace website navigation opens exactly the six localized website destinations in new tabs", () => {
  for (const locale of locales) {
    const markup = renderWorkspaceShellV3(locale);
    const navigation = markup.match(/<nav\b[^>]*data-ena-site-navigation="true"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];
    assert.ok(navigation, `${locale}: the workspace needs a website navigation landmark`);
    const dictionary = getDictionary(locale);
    const labels = [dictionary.nav.home, dictionary.nav.mission, getPluginLabCopy(locale).navLabel,
      dictionary.nav.news, dictionary.nav.academy, dictionary.nav.about];
    const paths = ["", "/mission", "/plugins", "/news", "/academy", "/about"];
    const links = [...navigation.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gu)];
    assert.equal(links.length, 6);
    links.forEach(([, attributes, content], index) => {
      assert.ok(attributes.includes(`href="/${locale}${paths[index]}"`));
      assert.match(attributes, /target="_blank"/u);
      assert.match(attributes, /rel="noopener noreferrer"/u);
      assert.ok(content.includes(escapeHtml(labels[index])));
      assert.ok(attributes.includes(escapeHtml(dictionary.common.externalLink)), "announce new-tab behavior");
    });
  }
});

test("Disclaimer precedes Website after analysis modes without joining the mode toolbar", () => {
  for (const locale of locales) {
    const markup = renderWorkspaceShellV3(locale);
    const trigger = markup.match(/<button\b[^>]*data-ena-site-trigger="true"[^>]*>[\s\S]*?<\/button>/u)?.[0];
    assert.ok(trigger, "a visible text-labelled website control is required");
    const disclaimer = markup.match(/<button\b[^>]*data-ena-disclaimer-trigger="true"[^>]*>[\s\S]*?<\/button>/u)?.[0];
    assert.ok(disclaimer, `${locale}: a visible Disclaimer control is required`);
    assert.ok(disclaimer.includes(escapeHtml(getOpenEnaAttributionCopy(locale).disclaimerLabel)));
    assert.match(trigger, /type="button"/u);
    assert.match(trigger, /popovertarget="[^"]+"/iu);
    assert.match(disclaimer, /type="button"/u);
    assert.match(disclaimer, /popovertarget="[^"]+"/iu);
    assert.match(disclaimer, /aria-expanded="false"/u);
    assert.ok(markup.indexOf(disclaimer) > markup.indexOf('role="toolbar"'));
    assert.ok(markup.indexOf(disclaimer) < markup.indexOf(trigger));
    assert.ok(markup.indexOf(trigger) < markup.indexOf('class="ena-rail-logout"'));
    assert.doesNotMatch(markup, /class="ena-rail-(?:meta|privacy)"/u, "the visible LOCAL footer and its reserved strip remain absent");
    const toolbar = markup.match(/<div\b[^>]*role="toolbar"[^>]*>([\s\S]*?)<\/div>/u)?.[1] ?? "";
    assert.doesNotMatch(toolbar, /data-ena-(?:site|disclaimer)-trigger/u, "utility controls must not alter analysis arrow-key order");
    const popup = markup.match(/<[a-z]+\b[^>]*data-ena-disclaimer-popup="true"[^>]*>/u)?.[0];
    assert.ok(popup, `${locale}: the Disclaimer popup is mounted`);
    assert.match(popup, /popover="auto"/u);
    assert.match(popup, /role="dialog"/u);
    assert.match(popup, /aria-modal="false"/u);
    assert.match(popup, /aria-labelledby="[^"]+"/u);
    assert.match(markup, /data-open-ena-attribution="popup"/u);
    assert.doesNotMatch(markup, /data-open-ena-attribution="workspace"/u);
    const brand = markup.match(/<div\b[^>]*data-ena-rail-brand="true"[^>]*>[\s\S]*?<\/div>/u)?.[0];
    assert.ok(brand);
    assert.match(brand, /src="\/unified-home\/logo-open-ena-mark\.svg"/u, "retain the current Open ENA mark");
    assert.doesNotMatch(brand, /src="\/ena-mark\.svg"/u);
  }
});
