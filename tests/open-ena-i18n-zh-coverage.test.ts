import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getOpenEnaLongitudinalV3Copy } from "../components/open-ena/OpenEnaLongitudinalWorkbenchV3";
import { restoredWorkbenchCopy } from "../components/open-ena/workbench-restoration-copy";
import { getDictionary } from "../lib/i18n";
import { getOpenEnaAuthCopy } from "../lib/open-ena-auth-copy";
import { getOpenEnaHomeCopy } from "../lib/open-ena-home-copy";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

/**
 * Whole-string matches that stay identical to English on purpose: product and
 * model tokens, statistical proper names, typed source literals, and symbols.
 *
 * PR #78 owns the AI-interpretation failure/retry/error region
 * (failureUnavailable, failureNetwork, failureInvalidOutput, evidenceBoundary,
 * evidenceBoundaryRetained, previousInterpretation,
 * plus the existing retry / sessionRecovery / signInAgain / errorTitle cluster).
 * This audit does not edit that region. Those keys are already translated on
 * main; if a later merge leaves one identical to English, allowlist its path
 * here instead of rewriting it.
 */
const IDENTICAL_VALUE_ALLOWLIST = new Set([
  "openEna.views.twoD", // 2D ENA
  "openEna.views.threeD", // 3D ENA
  "openEna.modelV3.tabs.scientificSummary.rotation.svd", // SVD
  "openEna.modelV3.windows.svd", // SVD
  "openEna.modelV3.order.booleanValues.true", // typed source token
  "openEna.modelV3.order.booleanValues.false", // typed source token
  "openEna.modelV3.workspace.data.teachingSamples.families.ona", // ONA
  "openEna.ona.workspace.twoD", // 2D ONA
  "openEna.ona.order.emptyFields", // —
  "openEna.stats.inference.n", // sample-size symbol
  "openEna.stats.inference.qStatistic", // Friedman Q
  "openEna.stats.inference.kendallsW", // Kendall’s W
  "openEna.stats.ui.pearsonR", // Pearson r
  "openEna.stats.ui.spearmanRho", // Spearman ρ
  "home.figureLabels.twoD", // 2D ENA
  "restored.comparisonCards.n", // N
]);

/**
 * Unambiguous simplified/traditional pairs. Characters that are ordinary in
 * both orthographies (只/隻, 系/係, 面/麵, 后/後, 台/臺, 准/準, …) are omitted.
 */
const SCRIPT_PAIRS = [
  ["国", "國"], ["这", "這"], ["为", "為"], ["对", "對"], ["时", "時"], ["会", "會"],
  ["过", "過"], ["还", "還"], ["来", "來"], ["说", "說"], ["经", "經"], ["现", "現"],
  ["实", "實"], ["开", "開"], ["关", "關"], ["门", "門"], ["问", "問"], ["题", "題"],
  ["应", "應"], ["该", "該"], ["从", "從"], ["点", "點"], ["线", "線"], ["网", "網"],
  ["络", "絡"], ["图", "圖"], ["数", "數"], ["据", "據"], ["计", "計"], ["设", "設"],
  ["认", "認"], ["证", "證"], ["验", "驗"], ["选", "選"], ["择", "擇"], ["标", "標"],
  ["签", "簽"], ["显", "顯"], ["隐", "隱"], ["载", "載"], ["导", "導"], ["无", "無"],
  ["确", "確"], ["请", "請"], ["须", "須"], ["检", "檢"], ["视", "視"], ["户", "戶"],
  ["账", "賬"], ["号", "號"], ["码", "碼"], ["组", "組"], ["织", "織"], ["统", "統"],
  ["样", "樣"], ["学", "學"], ["习", "習"], ["练", "練"], ["变", "變"], ["异", "異"],
  ["误", "誤"], ["错", "錯"], ["败", "敗"], ["连", "連"], ["结", "結"], ["构", "構"],
  ["单", "單"], ["话", "話"], ["轨", "軌"], ["积", "積"], ["离", "離"], ["识", "識"],
  ["拟", "擬"], ["优", "優"], ["权", "權"], ["转", "轉"], ["换", "換"], ["轴", "軸"],
  ["缩", "縮"], ["复", "復"], ["贴", "貼"], ["闭", "閉"], ["启", "啟"], ["动", "動"],
  ["运", "運"], ["环", "環"], ["览", "覽"], ["预", "預"], ["历", "歷"], ["当", "當"],
  ["论", "論"], ["断", "斷"], ["释", "釋"], ["读", "讀"], ["辅", "輔"], ["维", "維"],
  ["较", "較"], ["宽", "寬"], ["备", "備"], ["暂", "暫"], ["传", "傳"], ["录", "錄"],
  ["联", "聯"], ["资", "資"], ["区", "區"], ["绘", "繪"], ["详", "詳"], ["创", "創"],
  ["质", "質"], ["队", "隊"], ["纳", "納"], ["体", "體"], ["径", "徑"], ["锁", "鎖"],
  ["顺", "順"], ["头", "頭"], ["颜", "顏"], ["饱", "飽"], ["进", "進"], ["补", "補"],
  ["义", "義"], ["编", "編"], ["汉", "漢"], ["个", "個"], ["发", "發"], ["么", "麼"],
  ["龙", "龍"], ["马", "馬"], ["鸟", "鳥"], ["鱼", "魚"], ["页", "頁"], ["风", "風"],
  ["飞", "飛"], ["车", "車"], ["东", "東"], ["长", "長"], ["贝", "貝"], ["见", "見"],
  ["观", "觀"], ["觉", "覺"], ["让", "讓"], ["议", "議"], ["语", "語"], ["词", "詞"],
  ["调", "調"], ["试", "試"], ["课", "課"], ["谁", "誰"], ["谢", "謝"], ["许", "許"],
  ["译", "譯"], ["书", "書"], ["买", "買"], ["卖", "賣"], ["价", "價"], ["费", "費"],
  ["员", "員"], ["则", "則"], ["刚", "剛"], ["万", "萬"], ["专", "專"], ["业", "業"],
  ["条", "條"], ["笔", "筆"], ["团", "團"], ["总", "總"], ["栏", "欄"],
] as const;

const SIMPLIFIED_ONLY = new Set(SCRIPT_PAIRS.map(([simplified]) => simplified));
const TRADITIONAL_ONLY = new Set(SCRIPT_PAIRS.map(([, traditional]) => traditional));

type CopyNode = unknown;

interface CopyViolation {
  locale: "zh-hant" | "zh-hans";
  path: string;
  detail: string;
}

function isRecord(value: CopyNode): value is Record<string, CopyNode> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walkCopy(
  english: CopyNode,
  localized: CopyNode,
  path: string,
  locale: CopyViolation["locale"],
  missing: CopyViolation[],
  empty: CopyViolation[],
  identical: CopyViolation[],
  strings: Array<[string, string]>,
) {
  if (typeof english === "function") {
    if (typeof localized !== "function") {
      missing.push({ locale, path, detail: `expected function, received ${typeof localized}` });
      return;
    }
    if (english === localized && !IDENTICAL_VALUE_ALLOWLIST.has(path)) {
      identical.push({ locale, path, detail: "inherited English function" });
    }
    return;
  }
  if (typeof english === "string") {
    if (typeof localized !== "string") {
      missing.push({ locale, path, detail: `expected string, received ${typeof localized}` });
      return;
    }
    strings.push([path, localized]);
    if (localized.trim() === "") empty.push({ locale, path, detail: "empty string" });
    if (english === localized && !IDENTICAL_VALUE_ALLOWLIST.has(path)) {
      identical.push({ locale, path, detail: JSON.stringify(english) });
    }
    return;
  }
  if (Array.isArray(english)) {
    if (!Array.isArray(localized)) {
      missing.push({ locale, path, detail: "expected array" });
      return;
    }
    english.forEach((item, index) => {
      const next = `${path}[${index}]`;
      if (localized[index] === undefined) missing.push({ locale, path: next, detail: "missing item" });
      else walkCopy(item, localized[index], next, locale, missing, empty, identical, strings);
    });
    return;
  }
  if (isRecord(english)) {
    if (!isRecord(localized)) {
      missing.push({ locale, path, detail: "expected object" });
      return;
    }
    for (const key of Object.keys(english)) {
      const next = path ? `${path}.${key}` : key;
      if (!(key in localized)) missing.push({ locale, path: next, detail: "missing key" });
      else walkCopy(english[key], localized[key], next, locale, missing, empty, identical, strings);
    }
  }
}

function catalog(locale: "en" | "zh-hant" | "zh-hans") {
  const dictionary = getDictionary(locale);
  return {
    openEna: getOpenEnaCopy(locale),
    auth: getOpenEnaAuthCopy(locale),
    home: getOpenEnaHomeCopy(locale),
    restored: restoredWorkbenchCopy(locale),
    shell: {
      nav: dictionary.nav,
      common: dictionary.common,
      footer: dictionary.footer,
    },
  };
}

function compareLocale(locale: "zh-hant" | "zh-hans") {
  const missing: CopyViolation[] = [];
  const empty: CopyViolation[] = [];
  const identical: CopyViolation[] = [];
  const strings: Array<[string, string]> = [];
  walkCopy(catalog("en"), catalog(locale), "", locale, missing, empty, identical, strings);
  return { missing, empty, identical, strings };
}

function formatViolations(violations: CopyViolation[]) {
  return violations.map((item) => `${item.locale} ${item.path}: ${item.detail}`).join("\n");
}

const traditional = compareLocale("zh-hant");
const simplified = compareLocale("zh-hans");

test("zh-Hant and zh-Hans Open ENA copy has every English key and no empty strings", () => {
  const missing = [...traditional.missing, ...simplified.missing];
  const empty = [...traditional.empty, ...simplified.empty];
  assert.deepEqual(missing, [], formatViolations(missing));
  assert.deepEqual(empty, [], formatViolations(empty));
});

test("zh-Hant and zh-Hans values are not leftover English outside the token allowlist", () => {
  const identical = [...traditional.identical, ...simplified.identical];
  assert.deepEqual(identical, [], formatViolations(identical));
});

test("zh-Hant strings avoid simplified-only characters and zh-Hans strings avoid traditional-only characters", () => {
  const violations: CopyViolation[] = [];
  for (const [path, text] of traditional.strings) {
    const found = [...SIMPLIFIED_ONLY].filter((character) => text.includes(character));
    if (found.length > 0) violations.push({ locale: "zh-hant", path, detail: `${found.join("")} in ${JSON.stringify(text.slice(0, 80))}` });
  }
  for (const [path, text] of simplified.strings) {
    const found = [...TRADITIONAL_ONLY].filter((character) => text.includes(character));
    if (found.length > 0) violations.push({ locale: "zh-hans", path, detail: `${found.join("")} in ${JSON.stringify(text.slice(0, 80))}` });
  }
  assert.deepEqual(violations, [], formatViolations(violations));
});

test("live Open ENA plot surfaces do not hardcode the English axis-flip label", () => {
  // OpenEnaSetComparison still hardcodes this label, but the workspace no longer
  // mounts it. Shared header "Primary navigation" / "Mobile navigation" stay
  // deferred because every locale uses that header.
  for (const relativePath of [
    "components/open-ena/OpenEnaPlot.tsx",
    "components/open-ena/OpenEnaGroupContrast.tsx",
  ]) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    assert.doesNotMatch(source, / · flipped/, relativePath);
  }
});

/**
 * User-visible English left in the live plot and longitudinal audit chrome
 * after PR #80. English catalog values stay the same; components read these
 * keys and fall back to the English literal when no copy is passed.
 */
const PLOT_CHROME_KEYS = [
  "openEna.modelV3.workspace.plot.legendAria",
  "openEna.modelV3.workspace.plot.squareCentroidLegend",
  "openEna.modelV3.workspace.plot.squareCentroidLegendText",
  "openEna.modelV3.workspace.plot.edgeColumn",
  "openEna.modelV3.workspace.plot.squareSummary",
  "openEna.modelV3.workspace.plot.strongestSignedEdgeDifferences",
  "openEna.modelV3.workspace.plot.connectionColumn",
  "openEna.modelV3.workspace.plot.primaryWeightColumn",
  "openEna.modelV3.workspace.plot.secondaryWeightColumn",
  "openEna.modelV3.workspace.plot.signedDifferenceColumn",
  "openEna.modelV3.workspace.plot.strongerGroupColumn",
  "openEna.workspace.exactFittedCoordinates",
  "openEna.workspace.marginalConfidenceCaption",
  "openEna.workspace.confidenceAxisColumn",
  "openEna.workspace.confidenceMeanColumn",
  "openEna.workspace.confidenceLowerColumn",
  "openEna.workspace.confidenceUpperColumn",
  "openEna.workspace.confidenceDfColumn",
  "openEna.workspace.confidenceStatusColumn",
  "openEna.workspace.confidenceStatusEstimable",
  "openEna.workspace.marginalConfidenceBoundary",
  "openEna.workspace.pluginReceipt",
] as const;

const LONGITUDINAL_AUDIT_KEYS = [
  "longitudinalV3.sourceRows",
  "longitudinalV3.participants",
  "longitudinalV3.participantPeriods",
  "longitudinalV3.duplicateRows",
  "longitudinalV3.duplicatedPeriods",
  "longitudinalV3.identityConfirmed",
  "longitudinalV3.yes",
  "longitudinalV3.no",
  "longitudinalV3.cohortLabel",
  "longitudinalV3.estimandLabel",
  "longitudinalV3.resultHash",
  "longitudinalV3.pathCaption",
  "longitudinalV3.pathGroup",
  "longitudinalV3.pathPeriod",
  "longitudinalV3.pathRows",
  "longitudinalV3.pathParticipantPeriods",
  "longitudinalV3.pathIncluded",
  "longitudinalV3.pathDuplicate",
  "longitudinalV3.path3dStep",
  "longitudinalV3.pathFullStep",
  "longitudinalV3.path3dCumulative",
  "longitudinalV3.pathFullCumulative",
  "longitudinalV3.pathElapsed",
  "longitudinalV3.path3dSpeed",
  "longitudinalV3.pathFullSpeed",
  "longitudinalV3.inferenceCaption",
  "longitudinalV3.requestColumn",
  "longitudinalV3.testColumn",
  "longitudinalV3.axisMetricColumn",
  "longitudinalV3.estimandColumn",
  "longitudinalV3.effectColumn",
  "longitudinalV3.statisticColumn",
  "longitudinalV3.rawPColumn",
  "longitudinalV3.holmPColumn",
  "longitudinalV3.methodColumn",
  "longitudinalV3.tiesColumn",
  "longitudinalV3.zerosColumn",
  "longitudinalV3.statusReasonColumn",
  "longitudinalV3.noDiagnostics",
  "longitudinalV3.provenanceCaption",
  "longitudinalV3.datasetHash",
  "longitudinalV3.specHash",
  "longitudinalV3.sourceResultHash",
  "longitudinalV3.requestHash",
  "longitudinalV3.runId",
  "longitudinalV3.jenaBuild",
  "longitudinalV3.jenaVersion",
  "longitudinalV3.jenaCommit",
  "longitudinalV3.jenaIntegrity",
  "longitudinalV3.executionTarget",
  "longitudinalV3.evidence",
  "longitudinalV3.permutationPlans",
  "longitudinalV3.resamplingPlans",
] as const;

function longitudinalAuditStrings(locale: "en" | "zh-hant" | "zh-hans") {
  const copy = getOpenEnaLongitudinalV3Copy(locale);
  return LONGITUDINAL_AUDIT_KEYS.map((path) => {
    const key = path.slice("longitudinalV3.".length) as keyof typeof copy;
    const value = copy[key];
    return [path, typeof value === "string" ? value : ""] as const;
  });
}

test("zh-Hant and zh-Hans translate the remaining plot and longitudinal audit chrome", () => {
  // Only the new audit keys are walked. The rest of the V3 dictionary already
  // mixes scripts in zh-Hant and is outside this follow-up.
  const present = new Map<string, string>([
    ...traditional.strings,
    ...simplified.strings,
    ...longitudinalAuditStrings("zh-hant"),
    ...longitudinalAuditStrings("zh-hans"),
  ]);
  const violations: CopyViolation[] = [];
  for (const path of PLOT_CHROME_KEYS) {
    if (!present.has(path)) violations.push({ locale: "zh-hant", path, detail: "chrome key missing from walked catalogs" });
  }
  for (const locale of ["zh-hant", "zh-hans"] as const) {
    for (const [path, text] of longitudinalAuditStrings(locale)) {
      if (text.trim() === "") violations.push({ locale, path, detail: "empty audit string" });
      else if (text === getOpenEnaLongitudinalV3Copy("en")[path.slice("longitudinalV3.".length) as keyof ReturnType<typeof getOpenEnaLongitudinalV3Copy>]
        && !IDENTICAL_VALUE_ALLOWLIST.has(path)) {
        violations.push({ locale, path, detail: JSON.stringify(text) });
      }
      const wrongScript = locale === "zh-hant" ? SIMPLIFIED_ONLY : TRADITIONAL_ONLY;
      const found = [...wrongScript].filter((character) => text.includes(character));
      if (found.length > 0) violations.push({ locale, path, detail: `${found.join("")} in ${JSON.stringify(text.slice(0, 80))}` });
    }
  }
  assert.deepEqual(violations, [], formatViolations(violations));
});

function jsxSource(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/{2}.*$/gm, "")
    .replace(/const DEFAULT_GROUP_CONTRAST_UI_COPY = \{[\s\S]*?\} as const;/, "")
    .replace(/const english = \{[\s\S]*?\n\};/, "");
}

/**
 * Issue #62 follow-up. English wording stays in the catalog; components read
 * these keys. Locked terms: https://github.com/HUDongpin/ena/issues/62#issuecomment-6283563279
 */
const CONTRAST_RESIDUE_KEYS = [
  "openEna.modelV3.workspace.plot.solidPrimaryStronger",
  "openEna.modelV3.workspace.plot.solidSecondaryStronger",
  "openEna.modelV3.workspace.plot.equalMeanWeight",
  "openEna.modelV3.workspace.plot.dashedConfidenceLegend",
  "openEna.modelV3.workspace.plot.shortDashedOutlierLegend",
  "openEna.modelV3.workspace.plot.nameJoin",
  "openEna.modelV3.workspace.plot.comparisonDenominator",
  "openEna.modelV3.workspace.plot.sidePanelDenominator",
  "openEna.modelV3.workspace.plot.thresholdNote",
  "openEna.modelV3.workspace.plot.emptyThresholdRow",
  "openEna.modelV3.workspace.plot.equalWeight",
  "openEna.modelV3.workspace.plot.signedDifferenceEdge",
  "openEna.modelV3.workspace.plot.groupMeanWeightEdge",
  "openEna.modelV3.workspace.plot.namedUnitPoint",
  "openEna.modelV3.workspace.plot.roleUnitPoint",
  "openEna.modelV3.workspace.plot.codeNodeLabel",
  "openEna.modelV3.workspace.plot.unnamedCode",
  "openEna.modelV3.workspace.plot.primaryRole",
  "openEna.modelV3.workspace.plot.secondaryRole",
  "openEna.modelV3.workspace.plot.signedNetworkTitle",
  "openEna.modelV3.workspace.plot.singleGroupNetworkTitle",
  "openEna.modelV3.workspace.plot.noGroupNetworkTitle",
  "openEna.modelV3.workspace.plot.signedNetworkDescription",
  "openEna.modelV3.workspace.plot.signedConfidenceClause",
  "openEna.modelV3.workspace.plot.signedOutlierClause",
  "openEna.modelV3.workspace.plot.groupMeanNetworkDescription",
  "openEna.modelV3.workspace.plot.pointSamplingDescription",
  "openEna.modelV3.workspace.plot.unitPointsHidden",
  "openEna.modelV3.workspace.plot.analyticUnitMarksHidden",
] as const;

const LONGITUDINAL_CONTROL_KEYS = [
  "longitudinalV3.identityHeading",
  "longitudinalV3.axisFlipsLegend",
  "longitudinalV3.flipAxis",
  "longitudinalV3.independentPermutation",
  "longitudinalV3.pairedPermutation",
  "longitudinalV3.accumulatedOrderLocked",
  "longitudinalV3.periodGap",
  "longitudinalV3.predictedTime",
  "longitudinalV3.predictedMemory",
  "longitudinalV3.hardDeadline",
  "longitudinalV3.staleOverlay",
  "longitudinalV3.notRun",
  "longitudinalV3.emptyPlotSummary",
  "longitudinalV3.sourceRowsWord",
] as const;

function invokeCopy(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "function") return null;
  const probe = ["Studio", "Seminar", "20", "+0.600", "primary", "Evidence", "Reflection", "", ""];
  const rendered = value.length <= 1
    ? value(probe[0])
    : value(...probe.slice(0, value.length));
  return typeof rendered === "string" ? rendered : null;
}

function catalogString(locale: "en" | "zh-hant" | "zh-hans", path: string) {
  if (path.startsWith("longitudinalV3.")) {
    const copy = getOpenEnaLongitudinalV3Copy(locale);
    return invokeCopy(copy[path.slice("longitudinalV3.".length) as keyof typeof copy]);
  }
  const plot = getOpenEnaCopy(locale).modelV3.workspace.plot as unknown as Record<string, unknown>;
  return invokeCopy(plot[path.slice("openEna.modelV3.workspace.plot.".length)]);
}

test("issue #62 glossary keeps Window as 窗口 and translates the remaining contrast and longitudinal control keys", () => {
  const glossary = readFileSync(join(process.cwd(), "docs", "open-ena-zh-glossary.md"), "utf8");
  assert.match(glossary, /#62/);
  assert.match(glossary, /https:\/\/github\.com\/HUDongpin\/ena\/issues\/62#issuecomment-6283563279/);
  assert.match(glossary, /\| Window \| 窗口 \| 窗口 \|/);
  assert.match(glossary, /\| Group \| 群組 \| 组 \|/);
  assert.match(glossary, /\| Edge \| 連線 \| 连线 \|/);

  const hantCatalog = readFileSync(join(process.cwd(), "lib", "open-ena-i18n.ts"), "utf8");
  const hantStrings = [...hantCatalog.matchAll(/"[^"\n]*"/g)].map((match) => match[0]);
  assert.equal(hantStrings.some((value) => value.includes("視窗")), false, "zh catalog string values must not keep 視窗");

  const violations: CopyViolation[] = [];
  for (const locale of ["zh-hant", "zh-hans"] as const) {
    for (const path of [...CONTRAST_RESIDUE_KEYS, ...LONGITUDINAL_CONTROL_KEYS]) {
      const value = catalogString(locale, path);
      const english = catalogString("en", path);
      if (value === null || english === null) violations.push({ locale, path, detail: "missing key" });
      else if (value === english && !IDENTICAL_VALUE_ALLOWLIST.has(path)) {
        violations.push({ locale, path, detail: JSON.stringify(value) });
      } else {
        const wrongScript = locale === "zh-hant" ? SIMPLIFIED_ONLY : TRADITIONAL_ONLY;
        const found = [...wrongScript].filter((character) => value.includes(character));
        if (found.length > 0) violations.push({ locale, path, detail: `${found.join("")} in ${JSON.stringify(value.slice(0, 80))}` });
        if (locale === "zh-hant" && value.includes("視窗")) violations.push({ locale, path, detail: "leftover 視窗" });
      }
    }
  }
  const hantEdge = getOpenEnaCopy("zh-hant").modelV3.workspace.plot.signedDifferenceEdge("A", "B", "+0.1", "Studio", "primary");
  const hansEdge = getOpenEnaCopy("zh-hans").modelV3.workspace.plot.signedDifferenceEdge("A", "B", "+0.1", "Studio", "primary");
  if (!hantEdge.includes("連線") && !hantEdge.includes("群組")) violations.push({ locale: "zh-hant", path: "openEna.modelV3.workspace.plot.signedDifferenceEdge", detail: hantEdge });
  if (!hansEdge.includes("连线") && !hansEdge.includes("组")) violations.push({ locale: "zh-hans", path: "openEna.modelV3.workspace.plot.signedDifferenceEdge", detail: hansEdge });
  assert.deepEqual(violations, [], formatViolations(violations));
});

test("contrast and longitudinal controls no longer hardcode the #62 English residue", () => {
  const forbidden: Record<string, RegExp[]> = {
    "components/open-ena/OpenEnaGroupContrast.tsx": [
      /Solid \{contrast\.primary\.name\} color: Primary is stronger/,
      /Solid \{contrast\.secondary\.name\} color: Secondary is stronger/,
      /Equal mean weight: no difference line drawn/,
      /Comparison denominator:/,
      /Side-panel denominator:/,
      /Threshold uses /,
      /No signed edge differences meet the current network threshold/,
      /signed Primary-minus-Secondary difference/,
      /group mean weight/,
      /code node/,
      / unit point /,
      /Unnamed code/,
      /Signed group-network difference,/,
      /Two-dimensional signed group comparison/,
      /No group network selected/,
      /Unit point marks are hidden/,
    ],
    "components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx": [
      />Identity confirmation</,
      /Axis flips \(display only\)/,
      />Independent permutation</,
      />Paired permutation</,
      /AccumulatedTrajectory order is locked/,
      />Predicted time</,
      />Predicted memory</,
      />Hard deadline</,
      /STALE · RECOMPUTE REQUIRED/,
      / · gap/,
      />Estimand</,
    ],
  };
  const violations: string[] = [];
  for (const [relativePath, patterns] of Object.entries(forbidden)) {
    const source = jsxSource(readFileSync(join(process.cwd(), relativePath), "utf8"));
    for (const pattern of patterns) {
      if (pattern.test(source)) violations.push(`${relativePath}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("live plot and longitudinal audit chrome no longer hardcode the deferred English strings", () => {
  const forbidden: Record<string, RegExp[]> = {
    "components/open-ena/OpenEnaPlot.tsx": [
      /aria-label="Plot legend"/,
      /Group means use square centroid markers/,
      /Square marker = group mean/,
      />Edge</,
    ],
    "components/open-ena/OpenEnaGroupContrast.tsx": [
      />Square summary</,
      /Strongest signed edge differences/,
      />Connection</,
      />Primary weight</,
      />Secondary weight</,
      />Signed difference</,
      />Stronger group</,
    ],
    "components/open-ena/OpenEnaInteractive3DPlot.tsx": [
      /Separate marginal 95% Student-t confidence intervals — exact fitted coordinates/,
      />Axis</,
      />Mean</,
      />Lower 95%</,
      />Upper 95%</,
      />Status</,
      /Endpoint analytic units are the observations/,
      /Plugin receipt ↓/,
    ],
    "components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx": [
      />Source rows</,
      /<dt>Participants<\/dt>/,
      />Participant-periods</,
      />Identity confirmed</,
      /<caption>Group-period centroids, changes, selected-3D\/full-space distances/,
      /<caption>Independent, paired, repeated, post-hoc, and whole-path families/,
      /<caption>Immutable scientific and execution binding/,
      />No diagnostics were emitted\.</,
    ],
  };
  const violations: string[] = [];
  for (const [relativePath, patterns] of Object.entries(forbidden)) {
    const source = jsxSource(readFileSync(join(process.cwd(), relativePath), "utf8"));
    for (const pattern of patterns) {
      if (pattern.test(source)) violations.push(`${relativePath}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});
