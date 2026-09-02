import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

test("code color picker SSR renders an accessible paired-preset dialog shell", async () => {
  const module = await import("../components/open-ena/OpenEnaCodeColorPicker");
  const markup = renderToStaticMarkup(createElement(module.default, {
    code: "goal",
    value: { primary: "#cc423a", complementary: "#56bd7c" },
    copy: getOpenEnaCopy("en").model.codeColorPicker,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }));

  assert.equal((markup.match(/<dialog\b/gu) ?? []).length, 1);
  assert.match(markup, /aria-modal="true"/u);
  assert.match(markup, /aria-labelledby="[^"]+"/u);
  assert.equal((markup.match(/data-ena-code-color-preset=/gu) ?? []).length, 6);
  assert.match(markup, /aria-pressed="true"/u);
  assert.equal((markup.match(/data-ena-code-color-hex=/gu) ?? []).length, 2);
  assert.match(markup, />Cancel</u);
  assert.match(markup, />OK</u);
  assert.doesNotMatch(markup, /type="color"/u);
});

test("code color picker preserves the transactional native and fallback dialog contract", () => {
  const source = readFileSync(
    new URL("../components/open-ena/OpenEnaCodeColorPicker.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useState\(\(\) => openEnaCodeColorPair\(value\.primary, value\.complementary\)\)/u);
  assert.match(source, /\.showModal\(\)/u);
  assert.match(source, /event\.preventDefault\(\);\s*onCancel\(\)/u);
  assert.match(source, /event\.target !== dialog/u);
  assert.match(source, /fallback[\s\S]{0,800}onCancel\(\)/u);
  assert.match(source, /FOCUSABLE_SELECTOR/u);
  assert.match(source, /dataset\.enaDialogFallback/u);
  assert.match(source, /returnFocusRef\.current\?\.focus\(\)/u);
  assert.match(source, /normalizeOpenEnaCodeColorPair\(draft\)[\s\S]{0,180}onConfirm/u);
  assert.match(source, /<div key=\{field\} data-active=\{activeTarget === field\}>/u);
  assert.match(source, /<label htmlFor=\{fieldId\}>\{copy\[field\]\}<\/label>/u);
  assert.match(source, /aria-describedby=\{!valid \? errorId : undefined\}/u);
  assert.match(source, /<p id=\{errorId\} className="ena-code-color-error" role="alert">/u);
});
