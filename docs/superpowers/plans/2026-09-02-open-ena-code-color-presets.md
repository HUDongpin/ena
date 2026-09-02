# Open ENA Code Node Color Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace each native code-node color input with the approved official-webENA-inspired paired Color Presets dialog while keeping Primary as the only rendered and exported node color.

**Architecture:** Put deterministic palette, hex, HSV, plane, and complementary-reference behavior in one pure module; put one controlled transactional modal in a focused client component; keep `OpenEnaWorkspace` as the owner of rendered Primary colors and workspace-local Complementary references. Extend the existing production browser smoke so Cancel, OK, custom editing, focus, responsive geometry, plot propagation, and zero analysis dispatches are proved in the real workbench.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.8, native `<dialog>`, Pointer Events, SVG/CSS gradients, Node test runner with `tsx`, Playwright/Chromium, existing Open ENA i18n and renderer/export contracts.

---

## Execution Preconditions and Dirty-Worktree Guardrail

The approved design is committed at `3ad4076`. At plan-writing time, these separate earlier-task files are intentionally unstaged:

- `app/globals.css`
- `tests/open-ena-a11y-perf-browser-smoke-contract.test.ts`
- `tests/open-ena-a11y-perf-browser-smoke.mjs`
- `tests/open-ena-official-model-tabs-parity.test.ts`

The first, third, and fourth entries include the earlier field-path add-button repair. Do not stage, overwrite, revert, stash, or fold those earlier hunks into Color Presets commits. This plan avoids changing the existing a11y smoke contract and official-model parity test; it creates dedicated Color Presets contract tests instead. When a task touches `app/globals.css` or the browser smoke, stage only the new Color Presets hunks with `git add -p` and inspect the cached patch before committing.

## File Map

- Create `lib/open-ena/code-color-presets.ts`: immutable official pairs, copy contract, strict hex handling, RGB/HSV math, plane/keyboard clamping, pair matching, and deterministic Complementary resolution.
- Create `tests/open-ena-code-color-presets.test.ts`: pure behavior, immutability, boundary, round-trip, contrast, and normalization tests.
- Modify `lib/open-ena-i18n.ts`: attach structured picker copy to `model` for every locale; explicit native strings for English, Traditional Chinese, and Simplified Chinese.
- Create `tests/open-ena-code-color-presets-copy.test.ts`: all-locale non-empty copy and exact English/Chinese assertions.
- Create `components/open-ena/OpenEnaCodeColorPicker.tsx`: modal draft transaction, six paired presets, active Primary/Complementary editor, saturation/value plane, hue rail, hex validation, dismissal, and focus return.
- Create `tests/open-ena-code-color-picker.test.ts`: SSR semantics and source-level interaction/lifecycle contract.
- Modify `components/open-ena/OpenEnaWorkspace.tsx`: replace native inputs with dialog triggers; own Complementary map and active code; commit Primary through existing palette flow; reset both maps on source replacement.
- Modify `tests/open-ena-code-colors.test.ts`: replace obsolete native-input assertions with trigger, transaction, no-rebuild, renderer, and export boundaries.
- Modify `app/globals.css`: compact trigger, official preset geometry, custom field, hue rail, modal/fallback, focus, and 390px layout.
- Create `tests/open-ena-code-color-presets-css.test.ts`: exact desktop/mobile geometry and no native swatch selectors.
- Modify `tests/open-ena-a11y-perf-browser-smoke.mjs`: real dialog transaction, plot propagation, no worker dispatch, desktop/mobile geometry, focus, validation, and clean console/page ledger.
- Create `tests/open-ena-code-color-presets-browser-smoke-contract.test.ts`: ensure CI smoke retains every required Color Presets check.

### Task 1: Lock the pure palette and color-math contract

**Files:**
- Create: `tests/open-ena-code-color-presets.test.ts`
- Create: `lib/open-ena/code-color-presets.ts`

- [ ] **Step 1: Write the failing pure tests**

Create `tests/open-ena-code-color-presets.test.ts` with these concrete cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_ENA_CODE_COLOR_PRESETS,
  matchOpenEnaCodeColorPreset,
  normalizeOpenEnaCodeColorPair,
  normalizeOpenEnaHexColor,
  openEnaCodeColorFromPlane,
  openEnaCodeColorPair,
  openEnaHexToHsv,
  openEnaHsvToHex,
  preferredOpenEnaComplementary,
  shiftOpenEnaHsv,
} from "../lib/open-ena/code-color-presets";

test("locks the six official Color Presets in row-major order", () => {
  assert.deepEqual(OPEN_ENA_CODE_COLOR_PRESETS, [
    { primary: "#cc423a", complementary: "#56bd7c" },
    { primary: "#218ebf", complementary: "#ef691b" },
    { primary: "#9d5dbb", complementary: "#fbc848" },
    { primary: "#56bd7c", complementary: "#d0386c" },
    { primary: "#f18e9f", complementary: "#9a9eab" },
    { primary: "#ff8c39", complementary: "#346b88" },
  ]);
  assert.equal(Object.isFrozen(OPEN_ENA_CODE_COLOR_PRESETS), true);
  assert.ok(OPEN_ENA_CODE_COLOR_PRESETS.every(Object.isFrozen));
});

test("normalizes only complete six-digit hex colors", () => {
  assert.equal(normalizeOpenEnaHexColor("#12AB34"), "#12ab34");
  for (const invalid of ["#123", "12ab34", " #12ab34", "#12ab34 ", "red", "rgb(1,2,3)", "#12ab34ff", ""]) {
    assert.equal(normalizeOpenEnaHexColor(invalid), null);
  }
});

test("round-trips representative RGB colors through HSV", () => {
  for (const color of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#cc423a", "#56bd7c", "#346b88"]) {
    const hsv = openEnaHexToHsv(color);
    assert.ok(hsv);
    assert.equal(openEnaHsvToHex(hsv), color);
  }
  assert.equal(openEnaHsvToHex({ h: 0, s: 100, v: 100 }), "#ff0000");
  assert.equal(openEnaHsvToHex({ h: 120, s: 100, v: 100 }), "#00ff00");
  assert.equal(openEnaHsvToHex({ h: 240, s: 100, v: 100 }), "#0000ff");
});

test("clamps plane and keyboard movement and fails closed on non-finite input", () => {
  assert.equal(openEnaCodeColorFromPlane(0, 1, 0), "#ff0000");
  assert.equal(openEnaCodeColorFromPlane(0, 0, 0), "#ffffff");
  assert.equal(openEnaCodeColorFromPlane(0, 1, 1), "#000000");
  assert.equal(openEnaCodeColorFromPlane(120, 9, -4), "#00ff00");
  assert.equal(openEnaCodeColorFromPlane(Number.NaN, 0.5, 0.5), null);
  assert.deepEqual(
    shiftOpenEnaHsv({ h: 359, s: 99, v: 1 }, { h: 10, s: 10, v: -10 }),
    { h: 360, s: 100, v: 0 },
  );
});

test("matches both halves of a preset and chooses deterministic custom contrast", () => {
  assert.equal(matchOpenEnaCodeColorPreset({ primary: "#CC423A", complementary: "#56BD7C" }), 0);
  assert.equal(matchOpenEnaCodeColorPreset({ primary: "#cc423a", complementary: "#ffffff" }), -1);
  assert.equal(preferredOpenEnaComplementary("#000000"), "#ffffff");
  assert.equal(preferredOpenEnaComplementary("#ffffff"), "#000000");
  assert.equal(preferredOpenEnaComplementary("#cc423a"), "#56bd7c");
});

test("resolves and confirms pairs without mutating caller input", () => {
  const resolved = openEnaCodeColorPair("#000000");
  assert.deepEqual(resolved, { primary: "#000000", complementary: "#ffffff" });
  const candidate = { primary: "#218EBF", complementary: "#EF691B" };
  const snapshot = structuredClone(candidate);
  assert.deepEqual(normalizeOpenEnaCodeColorPair(candidate), { primary: "#218ebf", complementary: "#ef691b" });
  assert.deepEqual(candidate, snapshot);
  assert.equal(normalizeOpenEnaCodeColorPair({ ...candidate, primary: "invalid" }), null);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --import tsx --test tests/open-ena-code-color-presets.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/open-ena/code-color-presets.ts`.

- [ ] **Step 3: Implement the pure module**

Create `lib/open-ena/code-color-presets.ts` with these exact public types and algorithms:

```ts
export interface OpenEnaCodeColorPair {
  primary: string;
  complementary: string;
}

export interface OpenEnaHsvColor {
  h: number;
  s: number;
  v: number;
}

export interface OpenEnaCodeColorPickerCopy {
  chooseColor: (code: string) => string;
  dialogTitle: (code: string) => string;
  colorPresets: string;
  customColor: string;
  primary: string;
  complementary: string;
  cancel: string;
  confirm: string;
  saturationValue: string;
  hue: string;
  invalidHex: string;
  presetLabel: (index: number, primary: string, complementary: string) => string;
}

export const OPEN_ENA_CODE_COLOR_PRESETS = Object.freeze([
  Object.freeze({ primary: "#cc423a", complementary: "#56bd7c" }),
  Object.freeze({ primary: "#218ebf", complementary: "#ef691b" }),
  Object.freeze({ primary: "#9d5dbb", complementary: "#fbc848" }),
  Object.freeze({ primary: "#56bd7c", complementary: "#d0386c" }),
  Object.freeze({ primary: "#f18e9f", complementary: "#9a9eab" }),
  Object.freeze({ primary: "#ff8c39", complementary: "#346b88" }),
]) satisfies readonly Readonly<OpenEnaCodeColorPair>[];

const HEX = /^#[0-9a-f]{6}$/iu;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeOpenEnaHexColor(value: unknown): string | null {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : null;
}

export function openEnaHexToHsv(value: unknown): OpenEnaHsvColor | null {
  const hex = normalizeOpenEnaHexColor(value);
  if (!hex) return null;
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}

export function openEnaHsvToHex(value: OpenEnaHsvColor): string | null {
  if (![value.h, value.s, value.v].every(Number.isFinite)) return null;
  const h = clamp(value.h, 0, 360) % 360;
  const s = clamp(value.s, 0, 100) / 100;
  const v = clamp(value.v, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let channels: [number, number, number];
  if (h < 60) channels = [c, x, 0];
  else if (h < 120) channels = [x, c, 0];
  else if (h < 180) channels = [0, c, x];
  else if (h < 240) channels = [0, x, c];
  else if (h < 300) channels = [x, 0, c];
  else channels = [c, 0, x];
  return `#${channels.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function openEnaCodeColorFromPlane(hue: number, xRatio: number, yRatio: number): string | null {
  if (![hue, xRatio, yRatio].every(Number.isFinite)) return null;
  return openEnaHsvToHex({ h: clamp(hue, 0, 360), s: clamp(xRatio, 0, 1) * 100, v: (1 - clamp(yRatio, 0, 1)) * 100 });
}

export function shiftOpenEnaHsv(
  value: OpenEnaHsvColor,
  delta: Partial<OpenEnaHsvColor>,
): OpenEnaHsvColor | null {
  const next = { h: value.h + (delta.h ?? 0), s: value.s + (delta.s ?? 0), v: value.v + (delta.v ?? 0) };
  if (![next.h, next.s, next.v].every(Number.isFinite)) return null;
  return { h: clamp(next.h, 0, 360), s: clamp(next.s, 0, 100), v: clamp(next.v, 0, 100) };
}

export function matchOpenEnaCodeColorPreset(value: OpenEnaCodeColorPair): number {
  const primary = normalizeOpenEnaHexColor(value.primary);
  const complementary = normalizeOpenEnaHexColor(value.complementary);
  return OPEN_ENA_CODE_COLOR_PRESETS.findIndex((preset) => preset.primary === primary && preset.complementary === complementary);
}

function luminance(hex: string) {
  const weights = [0.2126, 0.7152, 0.0722] as const;
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * weights[index]!, 0);
}

export function preferredOpenEnaComplementary(primaryValue: unknown): string {
  const primary = normalizeOpenEnaHexColor(primaryValue) ?? "#000000";
  const preset = OPEN_ENA_CODE_COLOR_PRESETS.find((candidate) => candidate.primary === primary);
  if (preset) return preset.complementary;
  const l = luminance(primary);
  const whiteContrast = 1.05 / (l + 0.05);
  const blackContrast = (l + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#ffffff" : "#000000";
}

export function openEnaCodeColorPair(primaryValue: unknown, complementaryValue?: unknown): OpenEnaCodeColorPair {
  const primary = normalizeOpenEnaHexColor(primaryValue) ?? "#000000";
  const complementary = normalizeOpenEnaHexColor(complementaryValue) ?? preferredOpenEnaComplementary(primary);
  return { primary, complementary };
}

export function normalizeOpenEnaCodeColorPair(value: OpenEnaCodeColorPair): OpenEnaCodeColorPair | null {
  const primary = normalizeOpenEnaHexColor(value.primary);
  const complementary = normalizeOpenEnaHexColor(value.complementary);
  return primary && complementary ? { primary, complementary } : null;
}
```

- [ ] **Step 4: Run the pure test and verify GREEN**

Run the same Node test command. Expected: 6 tests PASS, 0 failures.

- [ ] **Step 5: Commit the pure layer**

```bash
git add lib/open-ena/code-color-presets.ts tests/open-ena-code-color-presets.test.ts
git diff --cached --check
git commit -m "feat: define Open ENA code color presets"
```

### Task 2: Add complete localized picker copy

**Files:**
- Create: `tests/open-ena-code-color-presets-copy.test.ts`
- Modify: `lib/open-ena-i18n.ts:540-580,1888-1925,2908-2912,2972-2997`

- [ ] **Step 1: Write the failing localization test**

Create a test that imports `locales` and `getOpenEnaCopy`, asserts every string/function result is non-empty, and locks the three explicit locale sets:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { locales } from "../lib/i18n";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

test("every locale exposes complete code Color Presets copy", () => {
  for (const locale of locales) {
    const copy = getOpenEnaCopy(locale).model.codeColorPicker;
    for (const value of [copy.colorPresets, copy.customColor, copy.primary, copy.complementary, copy.cancel, copy.confirm, copy.saturationValue, copy.hue, copy.invalidHex]) {
      assert.ok(value.trim(), `${locale} has blank Color Presets copy`);
    }
    assert.ok(copy.chooseColor("goal").includes("goal"));
    assert.ok(copy.dialogTitle("goal").includes("goal"));
    assert.ok(copy.presetLabel(1, "#cc423a", "#56bd7c").includes("#cc423a"));
  }
});

test("English and Chinese picker labels are explicit and native", () => {
  const en = getOpenEnaCopy("en").model.codeColorPicker;
  assert.equal(en.chooseColor("goal"), "Choose color for goal");
  assert.equal(en.dialogTitle("goal"), "Code color for goal");
  assert.deepEqual(
    [en.colorPresets, en.customColor, en.primary, en.complementary, en.cancel, en.confirm, en.saturationValue, en.hue, en.invalidHex],
    ["Color Presets:", "Custom Color:", "Primary", "Complementary", "Cancel", "OK", "Saturation and brightness", "Hue", "Enter a six-digit hexadecimal color such as #cc423a."],
  );
  assert.equal(en.presetLabel(1, "#cc423a", "#56bd7c"), "Preset 1: Primary #cc423a, Complementary #56bd7c");
  assert.equal(getOpenEnaCopy("zh-hant").model.codeColorPicker.colorPresets, "顏色預設：");
  assert.equal(getOpenEnaCopy("zh-hant").model.codeColorPicker.complementary, "互補色");
  assert.equal(getOpenEnaCopy("zh-hans").model.codeColorPicker.colorPresets, "颜色预设：");
  assert.equal(getOpenEnaCopy("zh-hans").model.codeColorPicker.complementary, "互补色");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run `node --import tsx --test tests/open-ena-code-color-presets-copy.test.ts`.

Expected: TypeScript/runtime failure because `model.codeColorPicker` does not exist.

- [ ] **Step 3: Extend the copy type and dictionaries**

Import `type OpenEnaCodeColorPickerCopy` from the pure module and add `codeColorPicker: OpenEnaCodeColorPickerCopy` after `codeColor` in the `model` type. Add this English object beside `codeColor`:

```ts
codeColorPicker: {
  chooseColor: (code) => `Choose color for ${code}`,
  dialogTitle: (code) => `Code color for ${code}`,
  colorPresets: "Color Presets:",
  customColor: "Custom Color:",
  primary: "Primary",
  complementary: "Complementary",
  cancel: "Cancel",
  confirm: "OK",
  saturationValue: "Saturation and brightness",
  hue: "Hue",
  invalidHex: "Enter a six-digit hexadecimal color such as #cc423a.",
  presetLabel: (index, primary, complementary) => `Preset ${index}: Primary ${primary}, Complementary ${complementary}`,
},
```

Add full `Object.assign` overrides for `zhHant.model.codeColorPicker` and `zhHans.model.codeColorPicker`, using:

```ts
const codeColorPickerZhHant: OpenEnaCodeColorPickerCopy = {
  chooseColor: (code) => `選擇 ${code} 的顏色`, dialogTitle: (code) => `${code} 的編碼顏色`,
  colorPresets: "顏色預設：", customColor: "自訂顏色：", primary: "主色", complementary: "互補色",
  cancel: "取消", confirm: "確定", saturationValue: "飽和度與亮度", hue: "色相",
  invalidHex: "請輸入六位十六進位顏色，例如 #cc423a。",
  presetLabel: (index, primary, complementary) => `預設 ${index}：主色 ${primary}，互補色 ${complementary}`,
};
const codeColorPickerZhHans: OpenEnaCodeColorPickerCopy = {
  chooseColor: (code) => `选择 ${code} 的颜色`, dialogTitle: (code) => `${code} 的编码颜色`,
  colorPresets: "颜色预设：", customColor: "自定义颜色：", primary: "主色", complementary: "互补色",
  cancel: "取消", confirm: "确定", saturationValue: "饱和度与亮度", hue: "色相",
  invalidHex: "请输入六位十六进制颜色，例如 #cc423a。",
  presetLabel: (index, primary, complementary) => `预设 ${index}：主色 ${primary}，互补色 ${complementary}`,
};
```

Assign those objects together with the existing `codeColor` overrides. Other locale copies inherit the complete English object through the existing Open ENA fallback composition.

- [ ] **Step 4: Run localization and type checks**

Run:

```bash
node --import tsx --test tests/open-ena-code-color-presets-copy.test.ts
npx tsc --noEmit --pretty false
```

Expected: localization tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit localized copy**

```bash
git add lib/open-ena-i18n.ts tests/open-ena-code-color-presets-copy.test.ts
git diff --cached --check
git commit -m "feat: localize Open ENA color presets"
```

### Task 3: Build the transactional modal and paired presets

**Files:**
- Create: `components/open-ena/OpenEnaCodeColorPicker.tsx`
- Create: `tests/open-ena-code-color-picker.test.ts`

- [ ] **Step 1: Write the failing semantic component test**

Server-render the new component with the English copy and assert the real dialog, six buttons, pair selection, hex fields, transactional actions, and absence of native color input:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

test("renders one labelled transactional Color Presets dialog", async () => {
  const { default: Picker } = await import("../components/open-ena/OpenEnaCodeColorPicker");
  const markup = renderToStaticMarkup(createElement(Picker, {
    code: "goal",
    value: { primary: "#cc423a", complementary: "#56bd7c" },
    copy: getOpenEnaCopy("en").model.codeColorPicker,
    onCancel: () => {}, onConfirm: () => {},
  }));
  assert.match(markup, /<dialog[^>]*aria-modal="true"/u);
  assert.match(markup, /aria-labelledby="[^"]+"/u);
  assert.equal((markup.match(/data-ena-code-color-preset=/gu) ?? []).length, 6);
  assert.match(markup, /aria-pressed="true"/u);
  assert.equal((markup.match(/data-ena-code-color-hex=/gu) ?? []).length, 2);
  assert.match(markup, />Cancel</u);
  assert.match(markup, />OK</u);
  assert.doesNotMatch(markup, /type="color"/u);
});

test("source keeps selection transactional and returns focus", () => {
  const source = readFileSync(join(process.cwd(), "components/open-ena/OpenEnaCodeColorPicker.tsx"), "utf8");
  assert.match(source, /useState\(\(\) => openEnaCodeColorPair\(value\.primary, value\.complementary\)\)/u);
  assert.match(source, /showModal\(\)/u);
  assert.match(source, /event\.preventDefault\(\)[\s\S]*onCancel\(\)/u);
  assert.match(source, /event\.target !== dialog[\s\S]*onCancel\(\)/u);
  assert.match(source, /FOCUSABLE_SELECTOR[\s\S]*data\.enaDialogFallback/u);
  assert.match(source, /returnFocusRef\.current\?\.focus\(\)/u);
  assert.match(source, /normalizeOpenEnaCodeColorPair\(draft\)[\s\S]*onConfirm/u);
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run `node --import tsx --test tests/open-ena-code-color-picker.test.ts`.

Expected: FAIL with module-not-found for `OpenEnaCodeColorPicker.tsx`.

- [ ] **Step 3: Implement the modal transaction and preset/hex UI**

Create a client component that:

```tsx
"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  OPEN_ENA_CODE_COLOR_PRESETS,
  matchOpenEnaCodeColorPreset,
  normalizeOpenEnaCodeColorPair,
  normalizeOpenEnaHexColor,
  openEnaCodeColorPair,
  type OpenEnaCodeColorPair,
  type OpenEnaCodeColorPickerCopy,
} from "@/lib/open-ena/code-color-presets";

interface Props {
  code: string;
  value: OpenEnaCodeColorPair;
  copy: OpenEnaCodeColorPickerCopy;
  onCancel: () => void;
  onConfirm: (value: OpenEnaCodeColorPair) => void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function OpenEnaCodeColorPicker({ code, value, copy, onCancel, onConfirm }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState(() => openEnaCodeColorPair(value.primary, value.complementary));
  const [activeTarget, setActiveTarget] = useState<keyof OpenEnaCodeColorPair>("primary");
  const normalized = normalizeOpenEnaCodeColorPair(draft);
  const selectedPreset = matchOpenEnaCodeColorPreset(draft);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else {
        dialog.setAttribute("open", "");
        dialog.dataset.enaDialogFallback = "true";
      }
    } catch {
      dialog.setAttribute("open", "");
      dialog.dataset.enaDialogFallback = "true";
    }
    dialog.querySelector<HTMLElement>('[data-ena-code-color-hex="primary"]')?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, []);

  const updateField = (field: keyof OpenEnaCodeColorPair, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const confirm = () => {
    const next = normalizeOpenEnaCodeColorPair(draft);
    if (next) onConfirm(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.dataset.enaDialogFallback !== "true") return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
    } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="ena-code-color-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onClick={(event) => {
        const dialog = dialogRef.current;
        if (!dialog || event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const fallback = dialog.dataset.enaDialogFallback === "true";
        if (fallback || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onCancel();
      }}
    >
      <div className="ena-code-color-sheet">
      <h2 id={titleId} className="sr-only">{copy.dialogTitle(code)}</h2>
      <p id={descriptionId} className="sr-only">{copy.colorPresets} {copy.customColor}</p>
      <div className="ena-code-color-dialog-grid">
        <section className="ena-code-color-presets" aria-labelledby={`${titleId}-presets`}>
          <h3 id={`${titleId}-presets`}>{copy.colorPresets}</h3>
          <div className="ena-code-color-preset-grid">
            {OPEN_ENA_CODE_COLOR_PRESETS.map((preset, index) => (
              <button
                key={`${preset.primary}-${preset.complementary}`}
                type="button"
                data-ena-code-color-preset={index + 1}
                aria-label={copy.presetLabel(index + 1, preset.primary, preset.complementary)}
                aria-pressed={selectedPreset === index}
                onClick={() => setDraft({ ...preset })}
              >
                <span style={{ backgroundColor: preset.primary }} aria-hidden="true" />
                <span style={{ backgroundColor: preset.complementary }} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
        <section className="ena-code-color-custom" aria-labelledby={`${titleId}-custom`}>
          <h3 id={`${titleId}-custom`}>{copy.customColor}</h3>
          {(["primary", "complementary"] as const).map((field) => {
            const valid = normalizeOpenEnaHexColor(draft[field]);
            return (
              <label key={field} data-active={activeTarget === field}>
                <span>{copy[field]}</span>
                <span className="ena-code-color-value-row">
                  <button type="button" aria-pressed={activeTarget === field} onClick={() => setActiveTarget(field)} style={{ backgroundColor: valid ?? "transparent" }} />
                  <input
                    data-ena-code-color-hex={field}
                    value={draft[field]}
                    aria-invalid={!valid}
                    onFocus={() => setActiveTarget(field)}
                    onChange={(event) => updateField(field, event.target.value)}
                  />
                </span>
              </label>
            );
          })}
          {!normalized ? <p className="ena-code-color-error" role="alert">{copy.invalidHex}</p> : null}
        </section>
      </div>
      <footer className="ena-code-color-actions">
        <button type="button" className="ena-inline-link" onClick={onCancel}>{copy.cancel}</button>
        <button type="button" className="ena-code-color-confirm" disabled={!normalized} onClick={confirm}>{copy.confirm}</button>
      </footer>
      </div>
    </dialog>
  );
}
```

This checkpoint already provides a complete preset-and-hex transaction. It is not wired into Workspace until Task 5; Task 4 adds the approved saturation/value and hue interaction before that integration.

- [ ] **Step 4: Run the component and pure tests**

Run:

```bash
node --import tsx --test tests/open-ena-code-color-picker.test.ts tests/open-ena-code-color-presets.test.ts
```

Expected: both files PASS.

- [ ] **Step 5: Commit the transactional shell**

```bash
git add components/open-ena/OpenEnaCodeColorPicker.tsx tests/open-ena-code-color-picker.test.ts
git diff --cached --check
git commit -m "feat: add transactional code color dialog"
```

### Task 4: Add the saturation/value plane and hue interaction

**Files:**
- Modify: `components/open-ena/OpenEnaCodeColorPicker.tsx`
- Modify: `tests/open-ena-code-color-picker.test.ts`

- [ ] **Step 1: Add failing custom-editor source and SSR assertions**

Add assertions for `data-ena-code-color-plane`, `data-ena-code-color-hue`, `role="slider"`, pointer capture, active-target updates, arrow keys, and the absence of canvas/native color inputs:

```ts
assert.match(markup, /data-ena-code-color-plane="true"/u);
assert.match(markup, /data-ena-code-color-hue="true"/u);
assert.match(markup, /role="slider"/u);
assert.match(source, /setPointerCapture\(event\.pointerId\)/u);
assert.match(source, /hasPointerCapture\(event\.pointerId\)/u);
assert.match(source, /event\.shiftKey \? 10 : 1/u);
assert.match(source, /openEnaCodeColorFromPlane/u);
assert.match(source, /openEnaHsvToHex/u);
assert.doesNotMatch(markup, /<canvas|type="color"/u);
```

- [ ] **Step 2: Run the component test and verify RED**

Expected: FAIL because the editor div has no plane/hue controls or pointer logic.

- [ ] **Step 3: Insert the real editor above the two hex fields**

Derive the active target's HSV from its last valid hex (falling back to `value[activeTarget]`). Add a captured-pointer updater:

```tsx
const activeHex = normalizeOpenEnaHexColor(draft[activeTarget])
  ?? normalizeOpenEnaHexColor(value[activeTarget])
  ?? "#000000";
const activeHsv = openEnaHexToHsv(activeHex) ?? { h: 0, s: 0, v: 0 };

const setActiveHex = (hex: string | null) => {
  if (hex) setDraft((current) => ({ ...current, [activeTarget]: hex }));
};
const updatePlane = (element: HTMLElement, clientX: number, clientY: number) => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  setActiveHex(openEnaCodeColorFromPlane(activeHsv.h, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height));
};
```

Render this exact interaction shape inside `.ena-code-color-editor`:

```tsx
<div className="ena-code-color-editor" data-active-target={activeTarget}>
  <div
    className="ena-code-color-plane"
    data-ena-code-color-plane="true"
    role="slider"
    tabIndex={0}
    aria-label={`${copy[activeTarget]} ${copy.saturationValue}`}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(activeHsv.s)}
    aria-valuetext={`${Math.round(activeHsv.s)}% saturation, ${Math.round(activeHsv.v)}% brightness`}
    style={{ "--ena-picker-hue": openEnaHsvToHex({ h: activeHsv.h, s: 100, v: 100 }) ?? "#ff0000" } as CSSProperties}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updatePlane(event.currentTarget, event.clientX, event.clientY); }}
    onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePlane(event.currentTarget, event.clientX, event.clientY); }}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 10 : 1;
      const delta = event.key === "ArrowLeft" ? { s: -step }
        : event.key === "ArrowRight" ? { s: step }
          : event.key === "ArrowUp" ? { v: step }
            : event.key === "ArrowDown" ? { v: -step }
              : null;
      if (!delta) return;
      event.preventDefault();
      const next = shiftOpenEnaHsv(activeHsv, delta);
      if (next) setActiveHex(openEnaHsvToHex(next));
    }}
  >
    <span className="ena-code-color-plane-picker" style={{ left: `${activeHsv.s}%`, top: `${100 - activeHsv.v}%` }} aria-hidden="true" />
  </div>
  <input
    className="ena-code-color-hue"
    data-ena-code-color-hue="true"
    type="range"
    min="0"
    max="360"
    step="1"
    value={Math.round(activeHsv.h)}
    aria-label={`${copy[activeTarget]} ${copy.hue}`}
    onChange={(event) => setActiveHex(openEnaHsvToHex({ ...activeHsv, h: Number(event.target.value) }))}
  />
</div>
```

Import `type CSSProperties` from React and import `openEnaCodeColorFromPlane`, `openEnaHexToHsv`, `openEnaHsvToHex`, and `shiftOpenEnaHsv` from the pure module.

- [ ] **Step 4: Run component, math, and type checks**

Run:

```bash
node --import tsx --test tests/open-ena-code-color-picker.test.ts tests/open-ena-code-color-presets.test.ts
npx tsc --noEmit --pretty false
```

Expected: PASS and exit 0.

- [ ] **Step 5: Commit custom editing**

```bash
git add components/open-ena/OpenEnaCodeColorPicker.tsx tests/open-ena-code-color-picker.test.ts
git diff --cached --check
git commit -m "feat: edit custom Open ENA code colors"
```

### Task 5: Integrate the picker without changing analysis or exports

**Files:**
- Modify: `components/open-ena/OpenEnaWorkspace.tsx:1-155,486-505,1637-1641,1681-1685,1731-1736,2324-2360`
- Modify: `tests/open-ena-code-colors.test.ts:12-93`

- [ ] **Step 1: Replace obsolete native-input assertions with failing integration assertions**

Require an active code, companion map, product-owned button, one dialog instance, confirmation-only Primary update, all three reset sites, and absence of Complementary from renderers/exports:

```ts
test("Codes rows open the product Color Presets dialog without invalidating the model", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
  assert.match(workspace, /const \[codeColorCompanions, setCodeColorCompanions\] = useState<Record<string, string>>\(\{\}\)/u);
  assert.match(workspace, /const \[activeCodeColor, setActiveCodeColor\] = useState<string \| null>\(null\)/u);
  assert.match(workspace, /<button[\s\S]*?className="ena-code-color-control"[\s\S]*?aria-haspopup="dialog"/u);
  assert.match(workspace, /data-ena-code-color-trigger=\{header\}/u);
  assert.match(workspace, /<OpenEnaCodeColorPicker[\s\S]*?onConfirm=\{\(pair\) =>/u);
  assert.match(workspace, /updateCodeColor\(current, activeCodeColor, pair\.primary\)/u);
  assert.match(workspace, /setCodeColorCompanions\(\(current\) => \(\{ \.\.\.current, \[activeCodeColor\]: pair\.complementary \}\)\)/u);
  assert.equal((workspace.match(/setCodeColorCompanions\(\{\}\)/gu) ?? []).length, 3);
  assert.equal((workspace.match(/setActiveCodeColor\(null\)/gu) ?? []).length >= 4, true);
  assert.doesNotMatch(workspace, /type="color"/u);
  assert.doesNotMatch(workspace, /codeColorCompanions=\{|complementaryColors=\{/u);
  assert.doesNotMatch(workspace, /buildAnalysisBundle\([\s\S]{0,1200}?codeColorCompanions/u);
  assert.doesNotMatch(workspace, /onConfirm=\{\(pair\) =>[\s\S]{0,500}?updateConfig/u);
});
```

Keep the existing tests that prove `DEFAULT_CODE_COLOR`, strict six-digit values, renderer propagation, and `buildAnalysisBundle(...codeColors)`.

- [ ] **Step 2: Run focused integration tests and verify RED**

Run:

```bash
node --import tsx --test tests/open-ena-code-colors.test.ts tests/open-ena-code-color-picker.test.ts tests/open-ena-official-model-tabs-parity.test.ts tests/open-ena-plot-encoding.test.ts
```

Expected: the new integration test fails on missing Workspace state/button/dialog; existing renderer tests remain green.

- [ ] **Step 3: Add imports, state, reset, and confirmation logic**

Import the picker and `openEnaCodeColorPair`. Add:

```ts
const [codeColors, setCodeColors] = useState<Record<string, string>>({});
const [codeColorCompanions, setCodeColorCompanions] = useState<Record<string, string>>({});
const [activeCodeColor, setActiveCodeColor] = useState<string | null>(null);
```

At every existing `setCodeColors({})` source-replacement site, immediately add:

```ts
setCodeColorCompanions({});
setActiveCodeColor(null);
```

Replace each native input/label with:

```tsx
<button
  type="button"
  className="ena-code-color-control"
  aria-label={copy.model.codeColorPicker.chooseColor(header)}
  aria-haspopup="dialog"
  aria-expanded={activeCodeColor === header}
  data-ena-code-color-trigger={header}
  data-ena-code-color-primary={codeColorFor(codeColors, header)}
  title={copy.model.codeColorPicker.chooseColor(header)}
  disabled={loading || sourceBusy}
  onClick={() => setActiveCodeColor(header)}
>
  <span className="ena-code-color-swatch" style={{ backgroundColor: codeColorFor(codeColors, header) }} aria-hidden="true" />
</button>
```

Render one picker after `.ena-official-code-list`:

```tsx
{activeCodeColor ? (
  <OpenEnaCodeColorPicker
    code={activeCodeColor}
    value={openEnaCodeColorPair(
      codeColorFor(codeColors, activeCodeColor),
      codeColorCompanions[activeCodeColor],
    )}
    copy={copy.model.codeColorPicker}
    onCancel={() => setActiveCodeColor(null)}
    onConfirm={(pair) => {
      setCodeColors((current) => updateCodeColor(current, activeCodeColor, pair.primary));
      setCodeColorCompanions((current) => ({ ...current, [activeCodeColor]: pair.complementary }));
      setActiveCodeColor(null);
    }}
  />
) : null}
```

- [ ] **Step 4: Run integration, renderer, export, and type checks**

Run:

```bash
node --import tsx --test \
  tests/open-ena-code-colors.test.ts \
  tests/open-ena-code-color-picker.test.ts \
  tests/open-ena-official-model-tabs-parity.test.ts \
  tests/open-ena-plot-encoding.test.ts \
  tests/open-ena-3d-view.test.ts \
  tests/open-ena-ona-ordered-plot.test.ts \
  tests/open-ena-functional.test.ts
npx tsc --noEmit --pretty false
```

Expected: all selected tests PASS; TypeScript exits 0.

- [ ] **Step 5: Commit Workspace integration**

```bash
git add components/open-ena/OpenEnaWorkspace.tsx tests/open-ena-code-colors.test.ts
git diff --cached --check
git commit -m "feat: connect code nodes to color presets"
```

### Task 6: Match official geometry and mobile containment

**Files:**
- Create: `tests/open-ena-code-color-presets-css.test.ts`
- Modify: `app/globals.css:3138-3205,9682 before End marker or adjacent scoped Model styles`

- [ ] **Step 1: Write the failing CSS contract**

Read `app/globals.css` and assert exact trigger, dialog, pair, plane, hue, action, backdrop, and mobile contracts:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

test("Color Presets CSS locks official desktop geometry and Open ENA tokens", () => {
  assert.match(css, /\.ena-code-color-control\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/u);
  assert.match(css, /\.ena-code-color-swatch\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;/u);
  assert.match(css, /\.ena-code-color-sheet\s*\{[^}]*width:\s*348px;[^}]*max-width:\s*calc\(100vw - 24px\);/u);
  assert.match(css, /\.ena-code-color-preset-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*75px\);/u);
  assert.match(css, /\.ena-code-color-preset-grid button\s*\{[^}]*width:\s*75px;[^}]*height:\s*45px;/u);
  assert.match(css, /\.ena-code-color-preset-grid button > span:first-child\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/u);
  assert.match(css, /\.ena-code-color-preset-grid button > span:last-child\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;/u);
  assert.match(css, /\.ena-code-color-preset-grid button\[aria-pressed="true"\]\s*\{[^}]*background:\s*#dbdbdb;/u);
  assert.match(css, /\.ena-code-color-plane\s*\{[^}]*width:\s*150px;[^}]*height:\s*150px;/u);
  assert.match(css, /\.ena-code-color-hue\s*\{[^}]*width:\s*20px;[^}]*height:\s*150px;/u);
  assert.match(css, /\.ena-code-color-confirm\s*\{[^}]*background:\s*var\(--ena-accent\);/u);
  assert.match(css, /\.ena-code-color-dialog::backdrop/u);
  assert.match(css, /\.ena-code-color-dialog\[data-ena-dialog-fallback="true"\]\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/u);
  assert.doesNotMatch(css, /\.ena-code-color-input::-(?:webkit|moz)-color-swatch/iu);
});

test("Color Presets CSS becomes one contained column at 520px", () => {
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?\.ena-code-color-dialog-grid\s*\{[^}]*grid-template-columns:\s*1fr;/u);
  assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*?\.ena-code-color-sheet\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\);[^}]*overflow-y:\s*auto;/u);
});
```

- [ ] **Step 2: Run the CSS test and verify RED**

Run `node --import tsx --test tests/open-ena-code-color-presets-css.test.ts`.

Expected: FAIL on missing dialog/preset classes and obsolete native swatch rules.

- [ ] **Step 3: Replace native swatch CSS and add scoped dialog styles**

Remove `.ena-code-color-input` and browser swatch pseudo-element rules. Keep the existing 28px control cadence and add a 20px swatch. Add complete dialog styles with:

```css
.ena-code-color-control {
  display: grid;
  width: 28px;
  height: 28px;
  min-height: 28px;
  place-items: center;
  justify-self: end;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.ena-code-color-swatch {
  display: block;
  width: 20px;
  height: 20px;
  border: 1px solid #a9bab8;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px #fff;
}
.ena-code-color-control:focus-visible {
  outline: 2px solid var(--ena-accent-strong);
  outline-offset: 2px;
}
.ena-code-color-dialog {
  border: 0;
  padding: 0;
  background: transparent;
}
.ena-code-color-dialog::backdrop { background: rgba(15, 23, 42, 0.45); }
.ena-code-color-dialog[data-ena-dialog-fallback="true"] {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  width: 100vw;
  max-width: none;
  height: 100dvh;
  max-height: none;
  place-items: center;
  margin: 0;
  background: rgba(15, 23, 42, 0.45);
}
.ena-code-color-sheet {
  width: 348px;
  max-width: calc(100vw - 24px);
  max-height: calc(100dvh - 24px);
  border-radius: 4px;
  padding: 10px 8px 8px;
  color: #3f3f3f;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.32);
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
}
.ena-code-color-dialog-grid { display: grid; grid-template-columns: 165px 180px; align-items: start; }
.ena-code-color-dialog h3 { margin: 0 0 8px; color: #666; font-size: 13px; line-height: 1.2; }
.ena-code-color-preset-grid { display: grid; grid-template-columns: repeat(2, 75px); gap: 23px 0; }
.ena-code-color-preset-grid button { position: relative; width: 75px; height: 45px; border: 0; border-radius: 35px; padding: 0; background: transparent; cursor: pointer; }
.ena-code-color-preset-grid button[aria-pressed="true"] { background: #dbdbdb; }
.ena-code-color-preset-grid button > span { position: absolute; top: 50%; border: 3px solid #fff; border-radius: 50%; transform: translateY(-50%); }
.ena-code-color-preset-grid button > span:first-child { left: 8px; z-index: 2; width: 40px; height: 40px; }
.ena-code-color-preset-grid button > span:last-child { left: 30px; width: 34px; height: 34px; }
.ena-code-color-editor { display: grid; grid-template-columns: 150px 20px; gap: 1px; }
.ena-code-color-plane { position: relative; width: 150px; height: 150px; background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, var(--ena-picker-hue)); cursor: crosshair; touch-action: none; }
.ena-code-color-plane-picker { position: absolute; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px #000; transform: translate(-50%, -50%); pointer-events: none; }
.ena-code-color-hue { width: 20px; height: 150px; margin: 0; writing-mode: vertical-lr; direction: rtl; appearance: slider-vertical; accent-color: var(--ena-accent-strong); }
.ena-code-color-value-row { display: grid; grid-template-columns: 25px minmax(0, 1fr); }
.ena-code-color-value-row > button { border: 1px solid #ccc; border-radius: 4px 0 0 4px; }
.ena-code-color-value-row input { width: 100%; min-width: 0; border: 1px solid #ccc; padding: 2px 5px; font: inherit; }
.ena-code-color-custom label[data-active="true"] { outline: 2px solid var(--ena-accent-strong); outline-offset: 2px; }
.ena-code-color-error { margin: 4px 0 0; color: #b42318; font-size: 11px; }
.ena-code-color-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.ena-code-color-confirm { min-width: 88px; min-height: 36px; border: 0; border-radius: 2px; color: #0f172a; background: var(--ena-accent); font-weight: 800; }
.ena-code-color-confirm:hover:not(:disabled) { background: var(--ena-accent-hover); }
.ena-code-color-confirm:disabled { cursor: not-allowed; opacity: 0.55; }
```

Use the existing global `.sr-only` utility on the hidden dialog title and description; do not add a duplicate visually-hidden class. Add these exact mobile rules:

```css
@media (max-width: 520px) {
  .ena-code-color-sheet {
    width: calc(100vw - 24px);
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
  }
  .ena-code-color-dialog-grid {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 18px;
  }
  .ena-code-color-presets,
  .ena-code-color-custom {
    width: min(100%, 180px);
  }
  .ena-code-color-preset-grid {
    justify-content: center;
  }
}
```

- [ ] **Step 4: Run CSS, component, official-model, and type checks**

Run:

```bash
node --import tsx --test \
  tests/open-ena-code-color-presets-css.test.ts \
  tests/open-ena-code-color-picker.test.ts \
  tests/open-ena-code-colors.test.ts \
  tests/open-ena-official-model-tabs-parity.test.ts
npx tsc --noEmit --pretty false
```

Expected: PASS and exit 0.

- [ ] **Step 5: Stage only Color Presets CSS and commit**

Because `app/globals.css` has an earlier unstaged field-path fix, do not run `git add app/globals.css`.

```bash
git add tests/open-ena-code-color-presets-css.test.ts
git add -p app/globals.css
git diff --cached -- app/globals.css
git diff --cached --check
```

Expected cached CSS: only `.ena-code-color-*` and the 520px picker media rule. It must not contain `.ena-official-field-path`, `.ena-official-field-path-add`, `unpaintedBeforeAddPx`, or the earlier 30→40px add-button change.

Then commit:

```bash
git commit -m "feat: style Open ENA color presets"
```

### Task 7: Extend the production browser smoke

**Files:**
- Create: `tests/open-ena-code-color-presets-browser-smoke-contract.test.ts`
- Modify: `tests/open-ena-a11y-perf-browser-smoke.mjs:320-450,549-593`

- [ ] **Step 1: Write the failing smoke-contract test**

Require a dedicated audit function and concrete user-visible assertions:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "tests/open-ena-a11y-perf-browser-smoke.mjs"), "utf8");

test("production smoke proves the complete code Color Presets transaction", () => {
  assert.match(source, /async function auditCodeColorPresets/u);
  assert.match(source, /Choose color for/u);
  assert.match(source, /Code color for/u);
  assert.match(source, /Preset 2: Primary #218ebf, Complementary #ef691b/u);
  assert.match(source, /data-ena-code-color-primary/u);
  assert.match(source, /data-ena-code-color-preset/u);
  assert.match(source, /data-ena-code-color-plane/u);
  assert.match(source, /data-ena-code-color-hue/u);
  assert.match(source, /Enter a six-digit hexadecimal color/u);
  assert.match(source, /workerPosts/u);
  assert.match(source, /data-ena-code-node/u);
  assert.match(source, /setViewportSize\(\{ width: 390, height: 844 \}\)/u);
  assert.match(source, /documentElement\.scrollWidth <= documentElement\.clientWidth \+ 1/u);
  assert.match(source, /activeElement === trigger/u);
  assert.match(source, /consoleErrors/u);
  assert.match(source, /pageErrors/u);
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run `node --import tsx --test tests/open-ena-code-color-presets-browser-smoke-contract.test.ts`.

Expected: FAIL because `auditCodeColorPresets` and the required checks are absent.

- [ ] **Step 3: Add a reversible real-browser audit**

Add `auditCodeColorPresets(page, codes)` after `auditOfficialModelTabs`. It must:

1. install a reversible `Worker.prototype.postMessage` counter after the sample result already exists;
2. identify the first `Choose color for …` trigger and its `data-ena-code-color-primary` value;
3. open the labelled dialog and assert six presets plus exact 40/34 circle geometry;
4. click preset 2, Cancel, and assert the trigger Primary is unchanged;
5. reopen, select preset 2, OK, and assert the trigger Primary becomes `#218ebf`;
6. assert every matching `[data-ena-code]` rendered code-node fill contains `#218ebf` or `rgb(33, 142, 191)`;
7. assert the Worker dispatch count remains zero;
8. reopen, focus Complementary, enter invalid Primary, verify OK disabled and the error visible, then press Escape and assert focus returned;
9. resize to 390×844, reopen, assert one-column layout, full viewport containment, and no document horizontal overflow; close and restore 1440×900;
10. return exact metrics for the summary.

Use this concrete implementation shape:

```js
async function auditCodeColorPresets(page, codes) {
  const desktopViewport = page.viewportSize();
  assert.ok(desktopViewport, "Color Presets audit requires an explicit viewport");
  await page.evaluate(() => {
    window.__enaCodeColorWorkerPosts = 0;
    window.__enaCodeColorOriginalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      window.__enaCodeColorWorkerPosts += 1;
      return window.__enaCodeColorOriginalPostMessage.apply(this, args);
    };
  });
  const triggers = codes.getByRole("button", { name: /^Choose color for /u });
  assert.ok(await triggers.count() > 0, "Codes has no Color Presets trigger");
  const trigger = triggers.first();
  const code = await trigger.getAttribute("data-ena-code-color-trigger");
  assert.ok(code, "Color Presets trigger has no code identity");
  const readNodeColors = async () => await page.locator("[data-ena-code]").evaluateAll(
    (elements, activeCode) => elements
      .filter((element) => element.getAttribute("data-ena-code") === activeCode)
      .map((element) => `${element.getAttribute("fill") ?? ""}|${getComputedStyle(element).fill}`.toLowerCase()),
    code,
  );
  const originalPrimary = await trigger.getAttribute("data-ena-code-color-primary");
  const originalNodeColors = await readNodeColors();
  let desktopGeometry = null;
  let mobileGeometry = null;
  try {
    await trigger.click();
    let dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
    await dialog.waitFor({ state: "visible" });
    const presets = dialog.locator("[data-ena-code-color-preset]");
    assert.equal(await presets.count(), 6);
    desktopGeometry = await dialog.evaluate((root) => {
      const sheet = root.querySelector(".ena-code-color-sheet");
      const pair = root.querySelector('[data-ena-code-color-preset="1"]');
      const circles = pair ? [...pair.querySelectorAll("span")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }) : [];
      const sheetRect = sheet?.getBoundingClientRect();
      return { sheet: sheetRect ? { width: sheetRect.width, height: sheetRect.height } : null, circles };
    });
    assert.ok(desktopGeometry.sheet?.width >= 347 && desktopGeometry.sheet.width <= 349);
    assert.deepEqual(desktopGeometry.circles, [{ width: 40, height: 40 }, { width: 34, height: 34 }]);

    await dialog.getByRole("button", { name: "Preset 2: Primary #218ebf, Complementary #ef691b", exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.getAttribute("data-ena-code-color-primary"), originalPrimary);
    assert.deepEqual(await readNodeColors(), originalNodeColors, "Cancel changed a rendered code node");

    await trigger.click();
    dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
    await dialog.getByRole("button", { name: "Preset 2: Primary #218ebf, Complementary #ef691b", exact: true }).click();
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await page.waitForFunction(
      (element) => element?.getAttribute("data-ena-code-color-primary") === "#218ebf",
      await trigger.elementHandle(),
    );
    const changedNodeColors = await readNodeColors();
    assert.ok(changedNodeColors.length > 0, "the selected code has no rendered node");
    assert.ok(changedNodeColors.every((value) => value.includes("#218ebf") || value.includes("rgb(33, 142, 191)")), "Primary did not reach every rendered code node");
    assert.equal(await page.evaluate(() => window.__enaCodeColorWorkerPosts), 0, "color confirmation dispatched analysis work");

    await trigger.click();
    dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
    const plane = dialog.locator('[data-ena-code-color-plane="true"]');
    const hue = dialog.locator('[data-ena-code-color-hue="true"]');
    await hue.fill("120");
    await plane.click({ position: { x: 110, y: 35 } });
    await plane.press("ArrowRight");
    assert.match(await dialog.locator('[data-ena-code-color-hex="primary"]').inputValue(), /^#[0-9a-f]{6}$/u);
    const complementary = dialog.locator('[data-ena-code-color-hex="complementary"]');
    await complementary.fill("#346b88");
    const primary = dialog.locator('[data-ena-code-color-hex="primary"]');
    await primary.fill("#123");
    assert.equal(await dialog.getByRole("button", { name: "OK", exact: true }).isDisabled(), true);
    await dialog.getByText("Enter a six-digit hexadecimal color such as #cc423a.", { exact: true }).waitFor({ state: "visible" });
    await dialog.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, "Escape did not restore trigger focus");

    await trigger.click();
    dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
    await page.mouse.click(2, 2);
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.getAttribute("data-ena-code-color-primary"), "#218ebf", "backdrop dismissal committed a draft");

    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    dialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
    mobileGeometry = await dialog.evaluate((root) => {
      const documentElement = document.documentElement;
      const sheet = root.querySelector(".ena-code-color-sheet");
      const grid = root.querySelector(".ena-code-color-dialog-grid");
      const rect = sheet?.getBoundingClientRect();
      return {
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
        contained: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
        noHorizontalOverflow: documentElement.scrollWidth <= documentElement.clientWidth + 1,
      };
    });
    assert.equal(mobileGeometry.gridColumns?.split(" ").length, 1);
    assert.equal(mobileGeometry.contained, true);
    assert.equal(mobileGeometry.noHorizontalOverflow, true);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    return { code, originalPrimary, committedPrimary: "#218ebf", desktopGeometry, mobileGeometry, workerPosts: 0 };
  } finally {
    const openDialog = page.getByRole("dialog", { name: `Code color for ${code}`, exact: true });
    if (await openDialog.isVisible().catch(() => false)) await openDialog.press("Escape").catch(() => {});
    await page.setViewportSize(desktopViewport);
    await page.evaluate(() => {
      if (window.__enaCodeColorOriginalPostMessage) Worker.prototype.postMessage = window.__enaCodeColorOriginalPostMessage;
      delete window.__enaCodeColorOriginalPostMessage;
      delete window.__enaCodeColorWorkerPosts;
    });
  }
}
```

Use `try/finally` to restore `Worker.prototype.postMessage`, close any open dialog, and restore the desktop viewport even when an assertion fails. Call the function from `auditOfficialModelTabs` after the existing Manage Codes check and include its return value as `codeColorPresets` in `modelParity`.

- [ ] **Step 4: Update obsolete smoke code-color checks**

Replace lines 435-438 that query `input[type="color"]` with the new trigger and dialog audit. Do not weaken the existing Units/Horizons/Windows/Codes geometry, scientific identity, console, or page-error assertions.

```js
const codeColorPresets = await auditCodeColorPresets(page, codes);
const codesGeometry = await panelGeometry(codes);
// ...keep the existing panel geometry assembly...
return { tabMetrics, unitGeometry, removedField, initialGroup, alternateGroup, panels, codeColorPresets };
```

- [ ] **Step 5: Run static contracts and the real production smoke**

First run:

```bash
node --import tsx --test \
  tests/open-ena-code-color-presets-browser-smoke-contract.test.ts \
  tests/open-ena-a11y-perf-browser-smoke-contract.test.ts \
  tests/open-ena-ci-browser-contract.test.ts
```

Expected: PASS.

Then run with task-scoped temp/cache paths:

```bash
mkdir -p .tmp/code-color-presets-tmp .tmp/code-color-presets-npm-cache
TMPDIR="$PWD/.tmp/code-color-presets-tmp" \
NPM_CONFIG_CACHE="$PWD/.tmp/code-color-presets-npm-cache" \
OPEN_ENA_A11Y_PERF_SMOKE_ARTIFACT_DIR="$PWD/output/playwright/open-ena-code-color-presets" \
node tests/open-ena-a11y-perf-browser-smoke.mjs
```

Expected: exit 0, summary status `PASS`, four isolated runs, no console/page errors, zero code-color Worker posts, and mobile containment true.

- [ ] **Step 6: Stage only the new browser audit and commit**

The smoke already contains earlier unstaged add-button geometry checks. Do not stage the whole file.

```bash
git add tests/open-ena-code-color-presets-browser-smoke-contract.test.ts
git add -p tests/open-ena-a11y-perf-browser-smoke.mjs
git diff --cached -- tests/open-ena-a11y-perf-browser-smoke.mjs
git diff --cached --check
```

Expected cached smoke patch: `auditCodeColorPresets`, its call/return, and removal of the obsolete native color-input query. It must not contain `addButtonWidthPx`, `unpaintedBeforeAddPx`, `unpaintedAfterAddPx`, or the earlier 30→40px add-button audit.

Commit:

```bash
git commit -m "test: verify Open ENA color presets in browser"
```

### Task 8: Complete the requirement-by-requirement verification audit

**Files:**
- Verify: `docs/superpowers/specs/2026-09-02-open-ena-code-color-presets-design.md`
- Verify: all files in the File Map

- [ ] **Step 1: Run the focused regression matrix**

```bash
node --import tsx --test \
  tests/open-ena-code-color-presets.test.ts \
  tests/open-ena-code-color-presets-copy.test.ts \
  tests/open-ena-code-color-picker.test.ts \
  tests/open-ena-code-color-presets-css.test.ts \
  tests/open-ena-code-color-presets-browser-smoke-contract.test.ts \
  tests/open-ena-code-colors.test.ts \
  tests/open-ena-official-model-tabs-parity.test.ts \
  tests/open-ena-plot-encoding.test.ts \
  tests/open-ena-3d-view.test.ts \
  tests/open-ena-ona-ordered-plot.test.ts \
  tests/open-ena-functional.test.ts \
  tests/open-ena-a11y-perf-browser-smoke-contract.test.ts \
  tests/open-ena-ci-browser-contract.test.ts
```

Expected: all tests PASS, 0 failures, 0 skips attributable to Color Presets.

- [ ] **Step 2: Run the repository-authoritative gate**

```bash
mkdir -p .tmp/code-color-presets-verify-tmp .tmp/code-color-presets-verify-cache
TMPDIR="$PWD/.tmp/code-color-presets-verify-tmp" \
NPM_CONFIG_CACHE="$PWD/.tmp/code-color-presets-verify-cache" \
npm run verify
```

Expected: final exit code 0 after prompt verification, vendor verification, jENA tests/build/pack, application tests, typecheck, and Next.js production build.

- [ ] **Step 3: Perform a fresh local visual acceptance**

Use the `playwright` skill against a served authenticated local `/en/open-ena` page. Load the teaching sample, open Model → Codes, and capture task-owned desktop and 390px screenshots under `output/playwright/open-ena-code-color-presets/`. Verify the screenshot against the approved reference for:

- six pairs and row-major order;
- selected gray pill;
- 40px/34px overlapping circles;
- 150px saturation/value plane and 20px hue rail;
- Primary/Complementary values;
- Cancel/OK layout;
- Baby Blue OK action;
- desktop centering and mobile containment.

Do not save authentication state or screenshots containing private/sample identifiers beyond the repository's synthetic teaching sample.

- [ ] **Step 4: Audit export and scientific boundaries**

Confirm from fresh code and browser evidence:

- `codeColors` remains code-to-string in bundle output;
- no `complementary`, `codeColorCompanions`, or pair object enters `lib/open-ena/export.ts`, renderer props, jENA config, or model identity;
- node outlines remain white;
- edge and group colors are unchanged;
- color confirmation produces zero analysis Worker posts;
- Cancel/Escape/backdrop do not change the trigger or rendered node;
- OK changes every rendered node surface that already consumed `codeColors`.

- [ ] **Step 5: Audit Git scope and dirty-file custody**

Move only the task-created cache/temp directories out of the worktree before reading final status:

```bash
task_cleanup_root=$(mktemp -d /private/tmp/open-ena-code-color-presets.XXXXXX)
mv "$PWD/.tmp/code-color-presets-tmp" "$task_cleanup_root/browser-tmp"
mv "$PWD/.tmp/code-color-presets-npm-cache" "$task_cleanup_root/browser-cache"
mv "$PWD/.tmp/code-color-presets-verify-tmp" "$task_cleanup_root/verify-tmp"
mv "$PWD/.tmp/code-color-presets-verify-cache" "$task_cleanup_root/verify-cache"
```

Then run:

```bash
git --no-optional-locks status --short --branch
git --no-optional-locks diff --check
git --no-optional-locks log --oneline --decorate -10
git --no-optional-locks diff 3ad4076..HEAD --stat
```

Verify that Color Presets commits contain only task-owned hunks. The four earlier unstaged add-button files must remain present and unclaimed unless the user separately authorizes their commit. Do not push, deploy, merge, delete branches, or clean unrelated files.

- [ ] **Step 6: Report exact evidence layers**

Report separately:

- design/spec commit;
- Color Presets implementation commits;
- focused test counts;
- production browser smoke status and artifact path;
- full `npm run verify` exit code;
- local served browser result;
- remaining unstaged earlier-task files;
- no push/deployment/production claim.

Do not mark the active goal complete until every Completion Criteria item in the approved spec has direct current evidence.
