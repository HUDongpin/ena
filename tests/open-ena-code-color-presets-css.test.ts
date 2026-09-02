import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const hueSpectrum = /linear-gradient\(to bottom,\s*#ff0000 0%,\s*#ff00ff 16\.67%,\s*#0000ff 33\.33%,\s*#00ffff 50%,\s*#00ff00 66\.67%,\s*#ffff00 83\.33%,\s*#ff0000 100%\)/u;

function rule(selector: string) {
  const escaped = selector
    .replaceAll("\\", "\\\\")
    .replaceAll(".", "\\.")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "u"));
  assert.ok(match, `missing ${selector} rule`);
  return match?.[1] ?? "";
}

function dialogRule(selector: string) {
  return rule(`.ena-code-color-dialog ${selector}`);
}

function exactRuleCount(selector: string) {
  const escaped = selector
    .replaceAll(".", "\\.")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  return (css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{`, "gu")) ?? []).length;
}

test("Open ENA code-color desktop geometry preserves the official paired-preset editor", () => {
  const triggerSelector = ".ena-official-code-row .ena-code-color-control";
  const trigger = rule(triggerSelector);
  assert.equal(exactRuleCount(triggerSelector), 1, "the color trigger must have one authoritative official-row rule");
  assert.match(trigger, /display:\s*grid;/u);
  assert.match(trigger, /width:\s*28px;/u);
  assert.match(trigger, /height:\s*28px;/u);
  assert.match(trigger, /min-height:\s*28px;/u);
  assert.match(trigger, /border:\s*0;/u);
  assert.match(trigger, /border-radius:\s*0;/u);
  assert.match(trigger, /padding:\s*0;/u);
  assert.match(trigger, /color:\s*inherit;/u);
  assert.match(trigger, /background:\s*transparent;/u);
  assert.match(trigger, /font:\s*inherit;/u);
  assert.match(rule(".ena-official-code-row .ena-code-color-control:disabled"), /opacity:\s*0\.55;/u);
  const triggerSwatch = rule(".ena-official-code-row .ena-code-color-swatch");
  assert.match(triggerSwatch, /width:\s*20px;[\s\S]*height:\s*20px;/u);
  assert.match(triggerSwatch, /border:\s*1px\s+solid\s+#a9bab8;/u);
  assert.match(triggerSwatch, /border-radius:\s*3px;/u);
  assert.match(triggerSwatch, /box-shadow:\s*inset\s+0\s+0\s+0\s+1px\s+#fff;/u);

  const sheet = rule(".ena-code-color-sheet");
  assert.match(sheet, /width:\s*348px;/u);
  assert.match(sheet, /max-width:\s*calc\(100vw - 24px\);/u);
  assert.match(sheet, /max-height:\s*calc\(100dvh - 24px\);/u);
  assert.match(sheet, /overscroll-behavior:\s*contain;/u);
  assert.match(sheet, /box-shadow:\s*0\s+10px\s+30px\s+rgba\(15,\s*23,\s*42,\s*0\.32\);/u);
  assert.match(rule(".ena-code-color-dialog-grid"), /grid-template-columns:\s*165px\s+minmax\(0,\s*1fr\);/u);
  const h3 = dialogRule(".ena-code-color-sheet h3");
  assert.match(h3, /margin:\s*0\s+0\s+8px;/u);
  assert.match(h3, /display:\s*block;/u);
  assert.match(h3, /align-items:\s*normal;/u);
  assert.match(h3, /gap:\s*normal;/u);
  assert.match(h3, /color:\s*#666;/u);
  assert.match(h3, /font-size:\s*13px;/u);
  assert.match(h3, /line-height:\s*1\.2;/u);
  const presetGrid = rule(".ena-code-color-preset-grid");
  assert.match(presetGrid, /grid-template-columns:\s*repeat\(2,\s*75px\);/u);
  assert.match(presetGrid, /gap:\s*23px\s+0;/u);
  const presetButton = dialogRule(".ena-code-color-preset-grid button");
  assert.match(presetButton, /width:\s*75px;[\s\S]*height:\s*45px;/u);
  assert.match(presetButton, /min-height:\s*0;/u);
  assert.match(presetButton, /border:\s*0;/u);
  assert.match(presetButton, /border-radius:\s*35px;/u);
  assert.match(presetButton, /padding:\s*0;/u);
  assert.match(presetButton, /color:\s*inherit;/u);
  assert.match(presetButton, /background:\s*transparent;/u);
  assert.match(presetButton, /font:\s*inherit;/u);
  const presetSwatch = dialogRule(".ena-code-color-preset-grid button span");
  assert.match(presetSwatch, /position:\s*absolute;/u);
  assert.match(presetSwatch, /top:\s*50%;/u);
  assert.match(presetSwatch, /border:\s*3px\s+solid\s+#fff;/u);
  assert.match(presetSwatch, /border-radius:\s*50%;/u);
  assert.match(presetSwatch, /transform:\s*translateY\(-50%\);/u);
  const primaryPresetSwatch = dialogRule(".ena-code-color-preset-grid button span:first-child");
  assert.match(primaryPresetSwatch, /left:\s*8px;/u);
  assert.match(primaryPresetSwatch, /z-index:\s*2;/u);
  assert.match(primaryPresetSwatch, /width:\s*40px;[\s\S]*height:\s*40px;/u);
  const companionPresetSwatch = dialogRule(".ena-code-color-preset-grid button span:last-child");
  assert.match(companionPresetSwatch, /left:\s*30px;/u);
  assert.match(companionPresetSwatch, /width:\s*34px;[\s\S]*height:\s*34px;/u);
  assert.match(dialogRule(".ena-code-color-preset-grid button[aria-pressed=\"true\"]"), /background:\s*#dbdbdb;/u);

  const plane = rule(".ena-code-color-plane");
  assert.match(plane, /width:\s*150px;[\s\S]*height:\s*150px;/u);
  assert.match(plane, /linear-gradient\(to right, #fff, transparent\)/u);
  assert.match(plane, /linear-gradient\(to bottom, transparent, #000\)/u);
  assert.match(plane, /touch-action:\s*none;/u);
  assert.match(plane, /cursor:\s*crosshair;/u);
  const marker = rule(".ena-code-color-plane-picker");
  assert.match(marker, /width:\s*14px;[\s\S]*height:\s*14px;/u);
  assert.match(marker, /border:\s*2px\s+solid\s+#fff;/u);
  assert.match(marker, /border-radius:\s*50%;/u);
  assert.match(marker, /transform:\s*translate\(-50%,\s*-50%\);/u);
  assert.match(marker, /pointer-events:\s*none;/u);
  const hue = dialogRule(".ena-code-color-custom .ena-code-color-editor input.ena-code-color-hue");
  assert.match(hue, /width:\s*20px;[\s\S]*height:\s*150px;[\s\S]*writing-mode:\s*vertical-lr;[\s\S]*direction:\s*rtl;[\s\S]*appearance:\s*slider-vertical;/u);
  assert.match(hue, /min-width:\s*0;/u);
  assert.match(hue, /min-height:\s*0;/u);
  assert.match(hue, /border:\s*0;/u);
  assert.match(hue, /border-radius:\s*0;/u);
  assert.match(hue, /padding:\s*0;/u);
  assert.match(hue, /font:\s*inherit;/u);
  assert.match(hue, hueSpectrum);
  for (const selector of [
    ".ena-code-color-custom .ena-code-color-editor input.ena-code-color-hue::-webkit-slider-runnable-track",
    ".ena-code-color-custom .ena-code-color-editor input.ena-code-color-hue::-moz-range-track",
  ]) {
    const track = dialogRule(selector);
    assert.match(track, /width:\s*20px;/u);
    assert.match(track, /height:\s*150px;/u);
    assert.match(track, /border:\s*0;/u);
    assert.match(track, /border-radius:\s*0;/u);
    assert.match(track, hueSpectrum);
  }

  const customLabel = dialogRule(".ena-code-color-dialog-grid section.ena-code-color-custom label");
  assert.match(customLabel, /display:\s*block;/u);
  assert.match(customLabel, /min-height:\s*0;/u);
  assert.match(customLabel, /border:\s*0;/u);
  assert.match(customLabel, /padding:\s*0;/u);
  assert.match(customLabel, /color:\s*#3f3f3f;/u);
  assert.match(customLabel, /background:\s*transparent;/u);
  assert.match(customLabel, /font-size:\s*11px;/u);
  assert.match(customLabel, /font-weight:\s*700;/u);
  const valueButton = dialogRule(".ena-code-color-custom .ena-code-color-value-row > button");
  assert.match(valueButton, /min-height:\s*25px;/u);
  assert.match(valueButton, /border:\s*1px\s+solid\s+#a9bab8;/u);
  assert.match(valueButton, /border-radius:\s*3px;/u);
  assert.match(valueButton, /padding:\s*0;/u);
  assert.match(valueButton, /font:\s*inherit;/u);
  const valueInput = dialogRule(".ena-code-color-custom .ena-code-color-value-row input[type=\"text\"]");
  assert.match(valueInput, /min-height:\s*25px;/u);
  assert.match(valueInput, /border:\s*1px\s+solid\s+#a9bab8;/u);
  assert.match(valueInput, /border-radius:\s*3px;/u);
  assert.match(valueInput, /padding:\s*3px\s+5px;/u);
  assert.match(valueInput, /color:\s*#3f3f3f;/u);
  assert.match(valueInput, /background:\s*#fff;/u);
  assert.match(valueInput, /font:\s*12px\/1/u);

  const axis = rule(".ena-code-color-plane-axis");
  assert.match(axis, /position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*pointer-events:\s*none;/u);
  assert.match(dialogRule(".ena-code-color-plane-axis:focus-visible"), /(outline|box-shadow):/u);
  const dialog = rule(".ena-code-color-dialog");
  assert.match(dialog, /border:\s*0;/u);
  assert.match(dialog, /padding:\s*0;/u);
  assert.match(dialog, /background:\s*transparent;/u);
  const error = dialogRule(".ena-code-color-error");
  assert.match(error, /margin:\s*7px\s+0\s+0;/u);
  assert.match(error, /color:\s*#a32626;/u);
  assert.match(error, /font-size:\s*11px;/u);
  assert.match(error, /line-height:\s*1\.3;/u);
  const fallback = rule(".ena-code-color-dialog[data-ena-dialog-fallback=\"true\"]");
  assert.match(fallback, /position:\s*fixed;/u);
  assert.match(fallback, /inset:\s*0;/u);
  assert.match(fallback, /z-index:\s*1000;/u);
  assert.match(fallback, /display:\s*grid;/u);
  assert.match(fallback, /width:\s*100vw;/u);
  assert.match(fallback, /height:\s*100dvh;/u);
  assert.match(fallback, /max-width:\s*none;/u);
  assert.match(fallback, /max-height:\s*none;/u);
  assert.match(fallback, /margin:\s*0;/u);
  assert.match(fallback, /place-items:\s*center;/u);
  assert.match(fallback, /background:\s*rgba\(15,\s*23,\s*42,\s*0\.45\);/u);
  const actions = rule(".ena-code-color-actions");
  assert.match(actions, /margin-top:\s*14px;/u);
  const cancel = dialogRule(".ena-code-color-sheet .ena-code-color-actions button.ena-inline-link");
  assert.match(cancel, /min-height:\s*0;/u);
  assert.match(cancel, /border:\s*0;/u);
  assert.match(cancel, /padding:\s*0;/u);
  assert.match(cancel, /background:\s*transparent;/u);
  assert.match(cancel, /margin-top:\s*0;/u);
  assert.match(cancel, /font-size:\s*calc\(0\.75rem \+ var\(--ena-font-step, 1px\)\);/u);
  const confirm = dialogRule(".ena-code-color-sheet .ena-code-color-actions .ena-code-color-confirm");
  assert.match(confirm, /min-width:\s*88px;/u);
  assert.match(confirm, /min-height:\s*36px;/u);
  assert.match(confirm, /border:\s*0;/u);
  assert.match(confirm, /border-radius:\s*2px;/u);
  assert.match(confirm, /color:\s*#0f172a;/u);
  assert.match(confirm, /background:\s*var\(--ena-accent\);/u);
  assert.match(confirm, /font-weight:\s*800;/u);
  assert.match(dialogRule(".ena-code-color-sheet .ena-code-color-actions .ena-code-color-confirm:hover:not\(:disabled\)"), /background:\s*var\(--ena-accent-hover\);/u);
  assert.match(dialogRule(".ena-code-color-sheet .ena-code-color-actions .ena-code-color-confirm:disabled"), /cursor:\s*not-allowed;/u);
  assert.match(rule(".ena-code-color-dialog::backdrop"), /background:\s*rgba\(15,\s*23,\s*42,\s*0\.45\);/u);
  const forcedColorsStart = css.indexOf("@media (forced-colors: active)");
  assert.notEqual(forcedColorsStart, -1, "missing forced-colors overrides");
  const forcedColors = css.slice(forcedColorsStart, css.indexOf("/* End Open ENA code Color Presets dialog. */", forcedColorsStart));
  const forcedColorRuleHeaders = [...forcedColors.matchAll(/([^{}]+)\{[^{}]*forced-color-adjust:\s*none;[^{}]*\}/gu)]
    .map((match) => match[1].trim());
  const commonForcedColorHeader = forcedColorRuleHeaders.find((header) => header.includes(".ena-official-code-row .ena-code-color-swatch"));
  assert.ok(commonForcedColorHeader, "missing common literal-surface forced-colors rule");
  assert.doesNotMatch(commonForcedColorHeader, /::/u, "ordinary literal surfaces must not share a rule with vendor pseudos");
  for (const ordinarySurface of [
    ".ena-official-code-row .ena-code-color-swatch",
    ".ena-code-color-dialog .ena-code-color-preset-grid button span",
    ".ena-code-color-dialog .ena-code-color-plane",
    ".ena-code-color-dialog .ena-code-color-plane-picker",
    ".ena-code-color-dialog .ena-code-color-custom .ena-code-color-editor input.ena-code-color-hue",
  ]) {
    assert.match(commonForcedColorHeader, new RegExp(ordinarySurface.replaceAll(".", "\\."), "u"));
  }
  assert.ok(
    forcedColorRuleHeaders.some((header) => /^\.ena-code-color-dialog \.ena-code-color-custom \.ena-code-color-editor input\.ena-code-color-hue::-webkit-slider-runnable-track$/u.test(header)),
    "WebKit hue track must own its forced-colors rule",
  );
  assert.ok(
    forcedColorRuleHeaders.some((header) => /^\.ena-code-color-dialog \.ena-code-color-custom \.ena-code-color-editor input\.ena-code-color-hue::-moz-range-track$/u.test(header)),
    "Mozilla hue track must own its forced-colors rule",
  );
  for (const literalSurface of [
    ".ena-official-code-row .ena-code-color-swatch",
    ".ena-code-color-dialog .ena-code-color-preset-grid button span",
    ".ena-code-color-dialog .ena-code-color-plane",
    ".ena-code-color-dialog .ena-code-color-plane-picker",
    ".ena-code-color-dialog .ena-code-color-custom .ena-code-color-editor input.ena-code-color-hue",
    ".ena-code-color-dialog .ena-code-color-custom .ena-code-color-editor input.ena-code-color-hue::-webkit-slider-runnable-track",
    ".ena-code-color-dialog .ena-code-color-custom .ena-code-color-editor input.ena-code-color-hue::-moz-range-track",
  ]) {
    const escapedSurface = literalSurface
      .replaceAll(".", "\\.")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]");
    assert.match(forcedColors, new RegExp(`${escapedSurface}[\\s\\S]{0,700}?forced-color-adjust:\\s*none;`, "u"));
  }
  assert.match(forcedColors, /\.ena-code-color-dialog \.ena-code-color-plane-axis:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+Highlight;[^}]*outline-offset:/u);
  assert.match(forcedColors, /\.ena-official-code-row \.ena-code-color-control:focus-visible,[\s\S]*?\.ena-code-color-dialog \.ena-code-color-preset-grid button:focus-visible[\s\S]*?\{[^}]*outline:\s*2px\s+solid\s+Highlight;/u);
  for (const unscopedControlSelector of [
    ".ena-code-color-control",
    ".ena-code-color-preset-grid button",
    ".ena-code-color-preset-grid button span",
    ".ena-code-color-preset-grid button:focus-visible",
    ".ena-code-color-hue",
    ".ena-code-color-hue::-webkit-slider-runnable-track",
    ".ena-code-color-hue::-moz-range-track",
    ".ena-code-color-custom label",
    ".ena-code-color-value-row > button",
    ".ena-code-color-value-row input",
    ".ena-code-color-value-row input:focus-visible",
    ".ena-code-color-actions .ena-inline-link",
    ".ena-code-color-confirm",
    ".ena-code-color-confirm:hover:not(:disabled)",
    ".ena-code-color-confirm:disabled",
    ".ena-code-color-plane-axis:focus-visible",
    ".ena-code-color-error",
  ]) {
    assert.equal(exactRuleCount(unscopedControlSelector), 0, `${unscopedControlSelector} must be component-bounded`);
  }
  assert.match(rule(".ena-code-color-custom > div[data-active=\"true\"]"), /outline:\s*2px\s+solid\s+var\(--ena-accent-strong\);/u);
  assert.doesNotMatch(css, /label\[data-active=/u);
  assert.doesNotMatch(css, /\.ena-code-color-input(?:\s|:|\{|,)/u);
  assert.doesNotMatch(css, /::-webkit-color-swatch|::-moz-color-swatch/u);
});

test("Open ENA code-color mobile sheet is contained and vertically scrollable", () => {
  const mobile = [...css.matchAll(/@media\s*\(max-width:\s*520px\)\s*\{([\s\S]*?)\n\}/gu)]
    .map((match) => match[1])
    .find((block) => block.includes(".ena-code-color-sheet")) ?? "";
  assert.ok(mobile, "missing narrow code-color media query");
  assert.match(mobile, /\.ena-code-color-sheet\s*\{[^}]*width:\s*calc\(100vw - 24px\);[^}]*max-height:\s*calc\(100dvh - 24px\);[^}]*overflow-y:\s*auto;/u);
  assert.match(mobile, /\.ena-code-color-dialog-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*justify-items:\s*center;[^}]*gap:\s*18px;/u);
  assert.match(mobile, /\.ena-code-color-presets,[\s\S]*?\.ena-code-color-custom\s*\{[^}]*width:\s*min\(100%,\s*180px\);/u);
  assert.match(mobile, /\.ena-code-color-preset-grid\s*\{[^}]*justify-content:\s*center;/u);
});
