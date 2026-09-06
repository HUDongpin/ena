import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  getOpenEnaCopy,
  localizeModelDiagnosticV3,
  localizeModelSuggestedActionV3,
  openEnaLocalizedLocales,
} from "../lib/open-ena-i18n";
import {
  MODEL_DIAGNOSTIC_IDS_V3,
  MODEL_SUGGESTED_ACTION_IDS_V3,
} from "../lib/open-ena/model-v3/diagnostics";
import { ONA_COMPILER_DIAGNOSTIC_IDS_V3 } from "../lib/open-ena/model-v3/ona-compiler-preflight";

const root = process.cwd();

function shape(value: unknown): unknown {
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, shape(item)]));
  }
  return typeof value;
}

test("every native Open ENA locale exposes the complete Models v3 copy contract", () => {
  assert.deepEqual(openEnaLocalizedLocales, ["en", "zh-hant", "zh-hans"]);
  const baseline = shape(getOpenEnaCopy("en").modelV3);
  for (const locale of openEnaLocalizedLocales) {
    const modelV3 = getOpenEnaCopy(locale).modelV3;
    assert.deepEqual(shape(modelV3), baseline, locale);
    assert.equal(JSON.stringify(modelV3).includes("undefined"), false, locale);
  }
  assert.equal(getOpenEnaCopy("zh-hant").modelV3.tabs.tabs.units, "單位");
  assert.equal(getOpenEnaCopy("zh-hans").modelV3.tabs.tabs.windows, "窗口");
});

test("Models v3 diagnostic and suggested-action catalogs cover every exported ID", () => {
  const expectedDiagnostics = [...MODEL_DIAGNOSTIC_IDS_V3, ...ONA_COMPILER_DIAGNOSTIC_IDS_V3].sort();
  for (const locale of openEnaLocalizedLocales) {
    const modelV3 = getOpenEnaCopy(locale).modelV3;
    assert.deepEqual(Object.keys(modelV3.diagnosticMessages).sort(), expectedDiagnostics, locale);
    assert.deepEqual(Object.keys(modelV3.suggestedActions).sort(), [...MODEL_SUGGESTED_ACTION_IDS_V3].sort(), locale);
  }
});

test("diagnostics localize by exported ID and bounded structured metadata without compiler-English fallback", () => {
  const zh = getOpenEnaCopy("zh-hant").modelV3;
  const localized = localizeModelDiagnosticV3(zh, {
    id: "ONA_CODE_ALL_ZERO",
    severity: "error",
    scope: "codes",
    fieldPath: "codes.Answer",
    evidence: { totalCount: 12, sampleLimit: 5, truncated: true },
  });
  assert.match(localized.summary, /代碼/u);
  assert.match(localized.detail, /Answer/u);
  assert.match(localized.detail, /12/u);
  assert.doesNotMatch(localized.summary, /all zero|compiler|Review/u);
  assert.throws(() => localizeModelDiagnosticV3(zh, { id: "UNKNOWN" as never, severity: "error", scope: "codes" }), /Unknown Models v3 diagnostic ID/u);
});

test("suggested-action labels and confirmations use the selected locale and preserve structured identities", () => {
  const zh = getOpenEnaCopy("zh-hans").modelV3;
  const localized = localizeModelSuggestedActionV3(zh, { id: "exclude-code", patch: { type: "exclude-code", code: "CoDe-A" } });
  assert.match(localized.label, /排除/u);
  assert.match(localized.confirmation, /CoDe-A/u);
  assert.doesNotMatch(localized.confirmation, /Confirm|Apply/u);
});

test("Workspace uses the selected Models v3 catalog at every reached v3 copy entrypoint", () => {
  const source = readFileSync(join(root, "components/open-ena/OpenEnaWorkspace.tsx"), "utf8");
  assert.doesNotMatch(source, /import \{ tabsCopy, unitsCopy, horizonsCopy, windowsCopy, codesCopy, orderCopy \}/u);
  assert.match(source, /const modelV3Copy = copy\.modelV3;/u);
  assert.match(source, /copy=\{modelV3Copy\.units\}/u);
  assert.match(source, /copy=\{modelV3Copy\.horizons\}/u);
  assert.match(source, /copy=\{modelV3Copy\.windows\}/u);
  assert.match(source, /copy=\{modelV3Copy\.codes\}/u);
  assert.match(source, /orderCopy=\{modelV3Copy\.order\}/u);
  assert.match(source, /nativeCopy=\{modelV3Copy\.nativeStats\}/u);
  assert.match(source, /copy=\{modelV3Copy\.importPreview\}/u);
  assert.doesNotMatch(source, /found\?\.summary|found\?\.detail|`Review \$\{/u);
});
