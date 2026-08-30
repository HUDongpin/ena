import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const NORMAL_TEXT_MINIMUM = 4.5;
const UI_COMPONENT_MINIMUM = 3;

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const body = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, "u"))?.[1];
  assert.ok(body, `missing CSS rule for ${selector}`);
  return body;
}

function declaration(body: string, property: string) {
  const value = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "u"))?.[1]?.trim();
  assert.ok(value, `missing ${property} declaration`);
  return value;
}

function customProperty(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const value = css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`, "u"))?.[1]?.trim();
  assert.ok(value, `missing ${name} custom property`);
  return value;
}

function resolveColor(value: string): string {
  const variable = value.match(/^var\((--[^)]+)\)$/u)?.[1];
  if (variable) return resolveColor(customProperty(variable));
  if (value === "white") return "#fff";
  if (value === "black") return "#000";
  const mix = value.match(
    /^color-mix\(in srgb,\s*(var\(--[^)]+\)|#[0-9a-f]{3,6}|white|black)\s+([0-9.]+)%,\s*(var\(--[^)]+\)|#[0-9a-f]{3,6}|white|black)\)$/iu,
  );
  if (!mix) return value;
  const first = rgb(resolveColor(mix[1]));
  const second = rgb(resolveColor(mix[3]));
  const firstWeight = Number(mix[2]) / 100;
  return `#${first.map((channel, index) => (
    Math.round(channel * firstWeight + second[index] * (1 - firstWeight))
      .toString(16)
      .padStart(2, "0")
  )).join("")}`;
}

function rgb(hex: string): [number, number, number] {
  const normalized = hex.length === 4
    ? `#${[...hex.slice(1)].map((digit) => digit.repeat(2)).join("")}`
    : hex;
  assert.match(normalized, /^#[0-9a-f]{6}$/iu, `expected a resolved hex color, received ${hex}`);
  return [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)) as [number, number, number];
}

function relativeLuminance(color: string) {
  const [red, green, blue] = rgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function assertNormalTextContrast(label: string, foreground: string, background: string) {
  const ratio = contrastRatio(resolveColor(foreground), resolveColor(background));
  assert.ok(
    ratio >= NORMAL_TEXT_MINIMUM,
    `${label} contrast ${ratio.toFixed(2)}:1 must be at least ${NORMAL_TEXT_MINIMUM}:1`,
  );
}

function assertUiContrast(label: string, foreground: string, background: string) {
  const ratio = contrastRatio(resolveColor(foreground), resolveColor(background));
  assert.ok(
    ratio >= UI_COMPONENT_MINIMUM,
    `${label} contrast ${ratio.toFixed(2)}:1 must be at least ${UI_COMPONENT_MINIMUM}:1`,
  );
}

test("the login collaboration email remains readable on its white panel", () => {
  const linkRule = ruleBody(".open-ena-login-collaboration a");
  assertNormalTextContrast(
    "login collaboration email",
    declaration(linkRule, "color"),
    "#fff",
  );
});

test("the active 2D or 3D ENA label remains readable on the selected-state fill", () => {
  const activeRule = ruleBody('.ena-view-toggle button[aria-pressed="true"]');
  assertNormalTextContrast(
    "active ENA view label",
    declaration(activeRule, "color"),
    declaration(activeRule, "background"),
  );
});

test("inactive, hover, and disabled ENA view labels retain normal-text contrast", () => {
  const defaultRule = ruleBody(".ena-view-toggle button");
  const hoverRule = ruleBody('.ena-view-toggle button:not([aria-pressed="true"]):hover');
  assertNormalTextContrast(
    "inactive or disabled ENA view label",
    declaration(defaultRule, "color"),
    "#edf2f1",
  );
  assertNormalTextContrast(
    "hovered ENA view label",
    declaration(hoverRule, "color"),
    declaration(hoverRule, "background"),
  );
});

test("the ENA view focus indicator remains visible against selected and unselected surfaces", () => {
  const focusRule = ruleBody(".ena-view-toggle button:focus-visible");
  const outlineColor = declaration(focusRule, "outline").match(/(?:color-mix\(.+\)|var\(--[^)]+\)|#[0-9a-f]{3,6})$/iu)?.[0];
  assert.ok(outlineColor, "focus outline must declare a resolvable color");
  assertUiContrast("focus outline against selected fill", outlineColor, "var(--accent)");
  assertUiContrast("focus outline against the unselected shell", outlineColor, "#edf2f1");
});

test("the plot scale caption passes on both nested plot-heading surfaces", () => {
  const captionRule = ruleBody(".open-ena-group-contrast .ena-set-scale-caption");
  const foreground = declaration(captionRule, "color");
  assertNormalTextContrast("plot scale caption on the desktop shell", foreground, "#edf1f2");
  assertNormalTextContrast("plot scale caption on the plot card", foreground, "#fbfdfd");
});

test("group caption colors preserve their identity while meeting normal-text contrast", async () => {
  const { readableOpenEnaTextColor } = await import("../lib/open-ena/color-contrast");
  const auditedPlotSurfaces = ["#edf1f2", "#fbfdfd"];
  const officialGroupColors = [
    "#cc423a", "#218ebf", "#56bd7c", "#ef691b", "#9d5dbb", "#fbc848",
    "#d0386c", "#f18e9f", "#9a9eab", "#ff8c39", "#346b88",
  ];
  const readableColors = officialGroupColors.map((color) => readableOpenEnaTextColor(color, "#edf1f2"));

  for (const [index, foreground] of readableColors.entries()) {
    for (const background of auditedPlotSurfaces) {
      assertNormalTextContrast(
        `group caption ${officialGroupColors[index]} on ${background}`,
        foreground,
        background,
      );
    }
  }
  assert.equal(new Set(readableColors).size, readableColors.length, "caption hues must remain distinguishable");
  assert.notEqual(readableColors[0], readableColors[1], "audited baseline and scaffolded labels need distinct colors");
});

test("the Local privacy label passes on the dark analysis rail", () => {
  const privacyRule = ruleBody(".ena-rail-privacy");
  assertNormalTextContrast(
    "Local privacy label",
    declaration(privacyRule, "color"),
    "#182533",
  );
});
