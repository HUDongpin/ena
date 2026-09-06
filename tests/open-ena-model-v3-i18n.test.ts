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

test("native locale catalogs do not use substring or generated-ID translation", () => {
  const catalogSource = readFileSync(join(root, "lib/open-ena-i18n.ts"), "utf8");
  assert.doesNotMatch(catalogSource, /traditionalToSimplifiedV3|MODEL_TERM_TRANSLATIONS_V3|diagnosticTitleV3/u);
});

test("native diagnostic messages are distinct, semantic, and fully localized", () => {
  for (const locale of openEnaLocalizedLocales) {
    const modelV3 = getOpenEnaCopy(locale).modelV3;
    const messages = [...MODEL_DIAGNOSTIC_IDS_V3, ...ONA_COMPILER_DIAGNOSTIC_IDS_V3].map((id) => localizeModelDiagnosticV3(modelV3, { id, severity: "error", scope: "model", fieldPath: "codes.Exact-Identity", evidence: { totalCount: 7, sampleLimit: 5, truncated: true } }));
    assert.equal(new Set(messages.map((message) => message.summary)).size, messages.length, `${locale} summaries`);
    assert.equal(new Set(messages.map((message) => message.detail)).size, messages.length, `${locale} details`);
    for (const message of messages) {
      assert.match(message.detail, /Exact-Identity/u);
      assert.match(message.detail, /7/u);
    }
  }
  const zhHant = getOpenEnaCopy("zh-hant").modelV3;
  const zhHans = getOpenEnaCopy("zh-hans").modelV3;
  assert.equal(zhHant.tabs.help.windows.description, "選擇窗口類型及其精確情境範圍。");
  assert.equal(zhHans.tabs.help.windows.description, "选择窗口类型及其精确情境范围。");
  for (const id of [...MODEL_DIAGNOSTIC_IDS_V3, ...ONA_COMPILER_DIAGNOSTIC_IDS_V3]) {
    for (const copy of [zhHant, zhHans]) {
      const message = localizeModelDiagnosticV3(copy, { id, severity: "warning", scope: "model" });
      assert.doesNotMatch(`${message.summary} ${message.detail}`, /\b(?:units|required|shared|multiple|requires|endpoint|has no path|target|degenerate|draft|resource|budget|exceeded)\b/iu, id);
    }
  }
  const en = getOpenEnaCopy("en").modelV3;
  assert.match(localizeModelDiagnosticV3(en, { id: "STANDARD_CODE_VALUE_INVALID", severity: "error", scope: "codes" }).detail, /numeric 0\/1.*Boolean false\/true.*finite nonnegative/u);
  assert.match(localizeModelDiagnosticV3(en, { id: "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS", severity: "information", scope: "horizons" }).detail, /does not block model construction/u);
  assert.match(localizeModelDiagnosticV3(en, { id: "STANDARD_SVD_ONE_DIMENSIONAL", severity: "warning", scope: "rotation" }).detail, /fitted model remains valid.*AI interpretation/u);
  assert.match(localizeModelDiagnosticV3(en, { id: "STANDARD_REFERENCE_TARGET_DEGENERATE", severity: "warning", scope: "reference" }).detail, /projection remains valid/u);
  assert.match(localizeModelDiagnosticV3(en, { id: "STANDARD_MEANS_IDENTICAL", severity: "error", scope: "rotation" }).detail, /identical typed selections.*sphere-normalized/u);
});

test("Workspace reached UI uses the typed locale catalog rather than required English literals", () => {
  const source = readFileSync(join(root, "components/open-ena/OpenEnaWorkspace.tsx"), "utf8");
  assert.match(source, /const workspaceCopy = modelV3Copy\.workspace;/u);
  for (const text of ["Configure trajectory model", "Run model", "Cancel run", "Review CSV source types", "Cancel source preparation", "Confirm types and create typed XLSX", "Model artifacts", "Download Model", "Open Stats"]) {
    assert.doesNotMatch(source, new RegExp(`>${text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}<`, "u"), text);
  }
  assert.match(source, /<option key=\{type\} value=\{type\}>\{workspaceCopy\.data\.sourceTypes\[type\]\}<\/option>/u);
});
