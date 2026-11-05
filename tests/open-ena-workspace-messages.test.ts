import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { locales } from "../lib/i18n";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { workspaceMessage } from "../lib/open-ena/workspace-messages";

function collectStrings(value: unknown, result: Set<string>) {
  if (typeof value === "string") result.add(value);
  else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, result);
  }
}

test("each additional workspace locale covers static copy, shares the complete message set and preserves placeholders", () => {
  const staticText = new Set<string>();
  collectStrings(getOpenEnaCopy("en"), staticText);
  let referenceKeys: string[] | undefined;
  const placeholders = (text: string) => (text.match(/\{\w+\}/gu) ?? []).sort();
  for (const locale of locales.filter(item => !["en", "zh-hant", "zh-hans"].includes(item))) {
    const messages: Record<string, string> = JSON.parse(readFileSync(
      new URL(`../lib/open-ena/workspace-locales/${locale}.json`, import.meta.url), "utf8",
    ));
    const keys = Object.keys(messages).sort();
    referenceKeys ??= keys;
    assert.deepEqual(keys, referenceKeys, locale);
    for (const text of staticText) assert.ok(Object.hasOwn(messages, text), `${locale}: ${text}`);
    for (const [template, translation] of Object.entries(messages)) {
      assert.ok(translation.length || !template.length, `${locale}: ${template}`);
      assert.deepEqual(placeholders(translation), placeholders(template), `${locale}: ${template}`);
    }
    assert.equal(workspaceMessage(locale, "Group: {group}", { group: "x $& {name}" }).includes("x $& {name}"), true);
  }
});
