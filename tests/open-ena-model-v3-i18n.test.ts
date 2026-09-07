import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  getOpenEnaCopy,
  formatOpenEnaWorkspaceFailureV3,
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

test("actual plot actions, statuses, scale captions, and method boundaries are locale-owned", () => {
  const en = getOpenEnaCopy("en").modelV3.workspace.plot;
  const hant = getOpenEnaCopy("zh-hant").modelV3.workspace.plot;
  const hans = getOpenEnaCopy("zh-hans").modelV3.workspace.plot;
  assert.equal(en.plotActionLabel(en.comparisonPlot, en.copyImage), "Comparison Plot: Copy image");
  assert.equal(hant.plotActionLabel(hant.comparisonPlot, hant.copyImage), "比較圖：複製圖像");
  assert.equal(hans.plotActionLabel(hans.secondaryPlot, hans.zoomOut), "次图：缩小");
  assert.equal(hant.restorePlot(hant.primaryPlot), "還原主要圖");
  assert.equal(hans.restorePlot(hans.secondaryPlot), "恢复次图");
  assert.equal(hant.copyCancelled, "已取消複製");
  assert.equal(hans.svgCopied, "已将 SVG 复制为文本");
  assert.equal(hant.sideScaledDescription("Literal-Group-ID", "1.25"), "Literal-Group-ID，縮放 1.25 倍");
  assert.equal(hans.comparisonScaledDescription(["Group-A", "Group-B"], "2.00"), "Group-A 减 Group-B，缩放 2.00 倍");
  assert.match(hant.methodBoundary, /主要群組減去次要群組/u);
  assert.match(hans.methodBoundary, /主组减去次组/u);
  assert.doesNotMatch(`${hant.copyImageTitle} ${hant.scaledCaption("1.0")} ${hant.methodBoundary}`, /Copy plot|scaled|Each connection/u);
  assert.doesNotMatch(`${hans.copyImageTitle} ${hans.scaledCaption("1.0")} ${hans.methodBoundary}`, /Copy plot|scaled|Each connection/u);
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
  assert.match(source, /copy=\{workspaceCopy\.dataView\}/u);
  assert.match(source, /plotCopy=\{copy\.ona\.plot\}/u);
  assert.match(source, /workspaceCopy\.ai\.wireLimitations/u);
  assert.match(source, /workspaceCopy\.stats\.onaMeaning/u);
  assert.match(source, /workspaceCopy\.result\.cohortMeaning/u);
  assert.doesNotMatch(source, /\{activeAiReview\.wireLimitations\}|\{onaView\.meaning\}|\{historicalData\.sourceIndexMeaning\}|\{longitudinal\.provenance\.cohortMeaning\}/u);
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

test("native Data View and eligible AI explanations are complete locale-owned contracts", () => {
  const en = getOpenEnaCopy("en").modelV3.workspace;
  const hant = getOpenEnaCopy("zh-hant").modelV3.workspace;
  const hans = getOpenEnaCopy("zh-hans").modelV3.workspace;
  assert.equal(en.dataView.codeGroup, "Normalized undirected edges");
  assert.equal(en.dataView.directedEdgeGroup, "Normalized directed edges");
  assert.equal(hant.dataView.codeGroup, "正規化無向邊");
  assert.equal(hans.dataView.directedEdgeGroup, "归一化有向边");
  assert.equal(hant.dataView.recordCount(7), "共 7 筆資料檢視記錄");
  assert.equal(hans.dataView.recordCount(7), "共 7 条数据视图记录");
  for (const copy of [en, hant, hans]) {
    assert.match(copy.ai.wireLimitations, /V2/u);
    assert.match(copy.ai.wireLimitations, /N < 3/u);
    assert.match(copy.ai.wireLimitations, copy === en ? /aggregate evidence only[\s\S]*typed identities[\s\S]*full binding[\s\S]*partial fitted precedence[\s\S]*observed continuity[\s\S]*rank comparisons[\s\S]*equal weight/u : /彙總證據|汇总证据/u);
  }
  assert.doesNotMatch(`${hant.dataView.title} ${hant.dataView.sourceIndexMeaning} ${hant.ai.wireLimitations}`, /Return to|Global retained|The V2 wire/u);
  assert.doesNotMatch(`${hans.dataView.title} ${hans.dataView.sourceIndexMeaning} ${hans.ai.wireLimitations}`, /Return to|Global retained|The V2 wire/u);
});

test("known Workspace failures retain structured reasons and render in the current locale", () => {
  const oversized = { id: "coded-data-too-large", limitMiB: 5 } as const;
  assert.match(formatOpenEnaWorkspaceFailureV3(getOpenEnaCopy("en").modelV3.workspace, oversized), /5 MB.*5 MiB.*1,024/u);
  assert.match(formatOpenEnaWorkspaceFailureV3(getOpenEnaCopy("zh-hant").modelV3.workspace, oversized), /編碼資料.*5 MiB/u);
  assert.match(formatOpenEnaWorkspaceFailureV3(getOpenEnaCopy("zh-hans").modelV3.workspace, oversized), /编码数据.*5 MiB/u);
  const en = getOpenEnaCopy("en").modelV3.workspace;
  assert.match(formatOpenEnaWorkspaceFailureV3(en, { id: "artifact-too-large", limitMiB: 16 }), /artifact.*16 MiB/u);
  assert.match(formatOpenEnaWorkspaceFailureV3(en, { id: "preset-too-large", limitMiB: 16 }), /preset.*16 MiB/u);
  assert.match(formatOpenEnaWorkspaceFailureV3(en, { id: "sample-unavailable" }), /sample.*unavailable/u);
});

test("diagnostic guidance preserves multi-case scientific meanings", () => {
  for (const locale of openEnaLocalizedLocales) {
    const copy = getOpenEnaCopy(locale).modelV3;
    const noConnection = localizeModelDiagnosticV3(copy, { id: "ONA_NO_ENABLED_CONNECTION", severity: "error", scope: "codes" });
    for (const concept of locale === "en" ? [/Code values/u, /Horizon boundaries/u, /response order/u, /backward-window/u, /directional mask/u] : locale === "zh-hant" ? [/代碼/u, /視域/u, /回應順序/u, /向後窗口/u, /方向遮罩/u] : [/代码/u, /视域/u, /回应顺序/u, /向后窗口/u, /方向遮罩/u]) assert.match(noConnection.detail, concept);
    assert.doesNotMatch(noConnection.detail, /Enable a mask cell|啟用遮罩儲存格|启用遮罩单元格/u);
  }
  const en = getOpenEnaCopy("en").modelV3;
  const noGlobal = localizeModelDiagnosticV3(en, { id: "STANDARD_NO_GLOBAL_COOCCURRENCE", severity: "warning", scope: "codes" });
  assert.match(noGlobal.detail, /fixed Reference.*valid projection.*warning/u);
  const rankZero = localizeModelDiagnosticV3(en, { id: "ONA_TARGET_RANK_ZERO", severity: "warning", scope: "rotation" });
  assert.match(rankZero.detail, /descriptive geometry remains available.*does not block/u);
});

test("Simplified Chinese dynamic scientific counters use simplified classifiers", () => {
  const copy = getOpenEnaCopy("zh-hans").modelV3;
  assert.equal(copy.units.unitCount(2), "2 个单位");
  assert.equal(copy.units.groupCount(2), "2 个组");
  assert.equal(copy.horizons.horizonCount(2), "2 个视域");
  assert.equal(copy.horizons.observationCount(2), "2 个单位 × 视域观测");
  assert.equal(copy.horizons.sharedHorizons(2), "2 个共享视域");
  assert.equal(copy.horizons.singleRowObservations(2), "2 个单行观测");
  assert.doesNotMatch([copy.units.unitCount(2), copy.units.groupCount(2), copy.horizons.horizonCount(2), copy.horizons.observationCount(2)].join(" "), /個/u);
});


test("native Data View return action uses existing localized visual and accessible names", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
  for (const field of ["workspaceCopy.dataView.returnLabel", "workspaceCopy.dataView.returnAriaLabel", "copy.ona.dataView.returnLabel", "copy.ona.dataView.returnAriaLabel"]) assert.ok(source.includes(field));
  assert.match(source, /aria-label=\{centerSurface === "data"/);
});
