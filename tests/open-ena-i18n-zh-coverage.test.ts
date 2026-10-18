import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
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
  // mounts it. Header "Primary navigation" / "Mobile navigation", plot legends,
  // contrast tables, and the longitudinal v3 audit chrome are deferred.
  for (const relativePath of [
    "components/open-ena/OpenEnaPlot.tsx",
    "components/open-ena/OpenEnaGroupContrast.tsx",
  ]) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    assert.doesNotMatch(source, / · flipped/, relativePath);
  }
});
