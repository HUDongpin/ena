import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import nextConfigObject from "../next.config";
import { locales } from "../lib/i18n";
import { canonicalizeChineseLocalePathname } from "../lib/canonical-locale-pathname";

const projectRoot = process.cwd();

test("mixed-case Chinese locale prefixes canonicalize without looping on lowercase slugs", () => {
  assert.equal(canonicalizeChineseLocalePathname("/zh-Hant"), "/zh-hant");
  assert.equal(canonicalizeChineseLocalePathname("/zh-Hant/open-ena"), "/zh-hant/open-ena");
  assert.equal(canonicalizeChineseLocalePathname("/zh-Hans/plugins/foo"), "/zh-hans/plugins/foo");
  assert.equal(canonicalizeChineseLocalePathname("/ZH-HANT/open-ena"), "/zh-hant/open-ena");
  assert.equal(canonicalizeChineseLocalePathname("/zh-hant"), null);
  assert.equal(canonicalizeChineseLocalePathname("/zh-hant/open-ena"), null);
  assert.equal(canonicalizeChineseLocalePathname("/zh-hans"), null);
  assert.equal(canonicalizeChineseLocalePathname("/en/open-ena"), null);
  assert.equal(canonicalizeChineseLocalePathname("/plugin-lab"), null);
});

test("next.config keeps plugin-lab aliases and does not case-fold zh-hant via redirects", () => {
  const nextConfig = readFileSync(join(projectRoot, "next.config.ts"), "utf8");
  assert.match(nextConfig, /source: "\/plugin-lab", destination: "\/en\/plugins"/);
  assert.match(nextConfig, /source: "\/:locale\([^\"]+\)\/plugin-lab", destination: "\/:locale\/plugins"/);
  assert.doesNotMatch(nextConfig, /source: "\/zh-Hant"/);
  assert.doesNotMatch(nextConfig, /source: "\/zh-Hans"/);

  const proxy = readFileSync(join(projectRoot, "proxy.ts"), "utf8");
  assert.match(proxy, /export function proxy/);
  assert.match(proxy, /canonicalizeChineseLocalePathname/);
});

test("legacy Plugin Lab redirects match supported languages but never API endpoints", async () => {
  const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp");
  const aliases = (await nextConfigObject.redirects!()).filter((rule) => rule.source.includes("plugin-lab"));
  const matches = (path: string) => aliases.some((rule) => pathToRegexp(rule.source).test(path));
  for (const locale of locales) {
    assert.equal(matches(`/${locale}/plugin-lab`), true);
    assert.equal(matches(`/${locale}/plugin-lab/propose`), true);
  }
  for (const path of ["/api/plugin-lab/proposals", "/api/plugin-lab/email-code/request", "/api/plugin-lab/status-session", "/api/plugin-lab/notifications/deliver"]) assert.equal(matches(path), false, path);
});
