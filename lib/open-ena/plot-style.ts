/**
 * jENA 0.6.2's published default plotting palette. Keeping this in the host
 * application avoids letting individual renderers drift away from the runtime
 * whose analytical and visual conventions Open ENA follows.
 */
export const JENA_GROUP_COLORS = [
  "#3366cc",
  "#dc3912",
  "#ff9900",
  "#109618",
  "#990099",
  "#0099c6",
  "#dd4477",
  "#66aa00",
] as const;

export const JENA_PRIMARY_COLOR = JENA_GROUP_COLORS[0];
export const JENA_SECONDARY_COLOR = JENA_GROUP_COLORS[1];

export const DEFAULT_CODE_COLOR = "#000000";

export type OpenEnaCodeColors = Readonly<Record<string, string>>;

const SIX_DIGIT_HEX_COLOR = /^#[0-9a-f]{6}$/iu;

export function codeColorFor(colors: OpenEnaCodeColors | undefined, code: string) {
  const color = colors?.[code];
  return typeof color === "string" && SIX_DIGIT_HEX_COLOR.test(color)
    ? color.toLowerCase()
    : DEFAULT_CODE_COLOR;
}

export function updateCodeColor(
  colors: OpenEnaCodeColors,
  code: string,
  color: string,
): Record<string, string> {
  return {
    ...colors,
    [code]: codeColorFor({ [code]: color }, code),
  };
}
