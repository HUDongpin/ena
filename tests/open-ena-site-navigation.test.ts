import assert from "node:assert/strict";
import test from "node:test";
import { renderWorkspaceShellV3 } from "./helpers/open-ena-workspace-v3-ui";
import { getDictionary, locales } from "../lib/i18n";
import { getPluginLabCopy } from "../lib/plugin-lab/i18n";

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

test("website entry sits after analysis modes and above Sign out without joining the mode toolbar", () => {
  for (const [locale, label] of [["en", "Website"], ["zh-hans", "网站"], ["zh-hant", "網站"]] as const) {
    const markup = renderWorkspaceShellV3(locale);
    const trigger = markup.match(/<button\b[^>]*data-ena-site-trigger="true"[^>]*>[\s\S]*?<\/button>/u)?.[0];
    assert.ok(trigger, "a visible text-labelled website control is required");
    assert.ok(trigger.includes(label));
    assert.match(trigger, /type="button"/u);
    assert.match(trigger, /popovertarget="[^"]+"/iu);
    assert.ok(markup.indexOf(trigger) > markup.indexOf('role="toolbar"'));
    assert.ok(markup.indexOf(trigger) < markup.indexOf('class="ena-rail-logout"'));
    const toolbar = markup.match(/<div\b[^>]*role="toolbar"[^>]*>([\s\S]*?)<\/div>/u)?.[1] ?? "";
    assert.ok(!toolbar.includes('data-ena-site-trigger'), "site navigation must not alter analysis arrow-key order");
  }
});
