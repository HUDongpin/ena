import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
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
  assert.match(nextConfig, /source: "\/:locale\/plugin-lab", destination: "\/:locale\/plugins"/);
  assert.doesNotMatch(nextConfig, /source: "\/zh-Hant"/);
  assert.doesNotMatch(nextConfig, /source: "\/zh-Hans"/);

  const proxy = readFileSync(join(projectRoot, "proxy.ts"), "utf8");
  assert.match(proxy, /export function proxy/);
  assert.match(proxy, /canonicalizeChineseLocalePathname/);
});
