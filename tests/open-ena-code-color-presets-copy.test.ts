import assert from "node:assert/strict";
import test from "node:test";
import { locales } from "../lib/i18n";
import { getOpenEnaCopy, openEnaLocalizedLocales } from "../lib/open-ena-i18n";

const formatterInputs = ["goal", 7, "#123456", "#abcdef"] as const;

test("every locale exposes complete Open ENA code color picker copy", () => {
  for (const locale of locales) {
    const picker = getOpenEnaCopy(locale).model.codeColorPicker;
    for (const value of [
      picker.colorPresets,
      picker.customColor,
      picker.primary,
      picker.complementary,
      picker.cancel,
      picker.confirm,
      picker.saturationValue,
      picker.saturation,
      picker.brightness,
      picker.hue,
      picker.invalidHex,
    ]) {
      assert.notEqual(value.trim(), "", `${locale} picker copy must be nonblank`);
    }
    assert.match(picker.chooseColor("goal"), /goal/);
    assert.match(picker.dialogTitle("goal"), /goal/);
    assert.match(picker.presetLabel(1, "#cc423a", "#56bd7c"), /#cc423a/);
    assert.notEqual(picker.saturationBrightnessValue(37, 64).trim(), "", `${locale} saturation/brightness value must be nonblank`);
  }

  assert.equal(Object.isFrozen(getOpenEnaCopy("en").model.codeColorPicker), true);
  assert.equal(Object.isFrozen(getOpenEnaCopy("zh-hant").model.codeColorPicker), true);
  assert.equal(Object.isFrozen(getOpenEnaCopy("zh-hans").model.codeColorPicker), true);

  const fallback = getOpenEnaCopy("es");
  assert.throws(
    () => {
      (fallback.model.codeColorPicker as unknown as { confirm: string }).confirm = "mutated";
    },
    TypeError,
  );
  assert.equal(getOpenEnaCopy("en").model.codeColorPicker.confirm, "OK");
  assert.equal(fallback.model.codeColorPicker.confirm, "OK");
});

test("localized and fallback Open ENA code color picker copy stays exact", () => {
  const expected = {
    en: {
      static: ["Color Presets:", "Custom Color:", "Primary", "Complementary", "Cancel", "OK", "Saturation and brightness", "Saturation", "Brightness", "Hue", "Enter a six-digit hexadecimal color such as #cc423a."],
      formatted: ["Choose color for goal", "Code color for goal", "Preset 7: Primary #123456, Complementary #abcdef", "Saturation 37%, brightness 64%"],
    },
    "zh-hant": {
      static: ["顏色預設：", "自訂顏色：", "主色", "互補色", "取消", "確定", "飽和度與亮度", "飽和度", "亮度", "色相", "請輸入六位十六進位顏色，例如 #cc423a。"],
      formatted: ["選擇 goal 的顏色", "goal 的編碼顏色", "預設 7：主色 #123456，互補色 #abcdef", "飽和度 37%，亮度 64%"],
    },
    "zh-hans": {
      static: ["颜色预设：", "自定义颜色：", "主色", "互补色", "取消", "确定", "饱和度与亮度", "饱和度", "亮度", "色相", "请输入六位十六进制颜色，例如 #cc423a。"],
      formatted: ["选择 goal 的颜色", "goal 的编码颜色", "预设 7：主色 #123456，互补色 #abcdef", "饱和度 37%，亮度 64%"],
    },
  } as const;

  for (const locale of openEnaLocalizedLocales) {
    const picker = getOpenEnaCopy(locale).model.codeColorPicker;
    assert.deepEqual([picker.colorPresets, picker.customColor, picker.primary, picker.complementary, picker.cancel, picker.confirm, picker.saturationValue, picker.saturation, picker.brightness, picker.hue, picker.invalidHex], expected[locale].static);
    assert.deepEqual([picker.chooseColor(formatterInputs[0]), picker.dialogTitle(formatterInputs[0]), picker.presetLabel(formatterInputs[1], formatterInputs[2], formatterInputs[3]), picker.saturationBrightnessValue(37, 64)], expected[locale].formatted);
  }

  for (const locale of locales) {
    if ((openEnaLocalizedLocales as readonly string[]).includes(locale)) continue;
    const picker = getOpenEnaCopy(locale).model.codeColorPicker;
    assert.deepEqual([picker.colorPresets, picker.customColor, picker.primary, picker.complementary, picker.cancel, picker.confirm, picker.saturationValue, picker.saturation, picker.brightness, picker.hue, picker.invalidHex], expected.en.static);
    assert.deepEqual([picker.chooseColor(formatterInputs[0]), picker.dialogTitle(formatterInputs[0]), picker.presetLabel(formatterInputs[1], formatterInputs[2], formatterInputs[3]), picker.saturationBrightnessValue(37, 64)], expected.en.formatted);
  }
});
