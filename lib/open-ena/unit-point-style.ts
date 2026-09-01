export type OpenEnaUnitPointStyle =
  | "solid"
  | "inner-ring"
  | "center-dot"
  | "horizontal-bar"
  | "plus"
  | "cross";

const OPEN_ENA_UNIT_POINT_STYLES: readonly OpenEnaUnitPointStyle[] = [
  "solid",
  "inner-ring",
  "center-dot",
  "horizontal-bar",
  "plus",
  "cross",
];

export interface OpenEnaUnitPointGlyphColors {
  foreground: string;
  halo: string | null;
}

const DARK_GLYPH = "#102126";
const LIGHT_GLYPH = "#ffffff";

function normalizedHexColor(value: string) {
  const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].length === 3
    ? [...match[1]].map((digit) => digit.repeat(2)).join("")
    : match[1];
  return `#${hex.toLowerCase()}`;
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(left: string, right: string) {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05)
    / (Math.min(leftLuminance, rightLuminance) + 0.05);
}

export function openEnaUnitPointGlyphColors(fill: string): OpenEnaUnitPointGlyphColors {
  const normalized = normalizedHexColor(fill);
  if (!normalized) return { foreground: LIGHT_GLYPH, halo: DARK_GLYPH };
  return contrastRatio(normalized, DARK_GLYPH) >= contrastRatio(normalized, LIGHT_GLYPH)
    ? { foreground: DARK_GLYPH, halo: null }
    : { foreground: LIGHT_GLYPH, halo: null };
}

export function openEnaUnitPointStyleAssignments(
  groupNames: readonly string[],
): ReadonlyMap<string, OpenEnaUnitPointStyle> {
  const names = [...new Set(groupNames)].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  return new Map(names.map((name, index) => [
    name,
    OPEN_ENA_UNIT_POINT_STYLES[index % OPEN_ENA_UNIT_POINT_STYLES.length],
  ]));
}
