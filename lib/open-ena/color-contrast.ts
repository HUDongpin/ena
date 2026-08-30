type RgbColor = readonly [number, number, number];

function parseHexColor(value: string): RgbColor | null {
  const trimmed = value.trim();
  const normalized = /^#[0-9a-f]{3}$/iu.test(trimmed)
    ? `#${[...trimmed.slice(1)].map((digit) => digit.repeat(2)).join("")}`
    : trimmed;
  if (!/^#[0-9a-f]{6}$/iu.test(normalized)) return null;
  return [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)) as [number, number, number];
}

function relativeLuminance([red, green, blue]: RgbColor) {
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

function contrastRatio(foreground: RgbColor, background: RgbColor) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function toHex([red, green, blue]: RgbColor) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function mixColor(source: RgbColor, target: RgbColor, amount: number): RgbColor {
  return source.map((channel, index) => (
    Math.round(channel + (target[index] - channel) * amount)
  )) as [number, number, number];
}

/**
 * Keep a presentation color's hue while moving it only as far toward black or
 * white as normal-text contrast requires on its actual solid surface.
 */
export function readableOpenEnaTextColor(
  foreground: string,
  background: string,
  minimumContrast = 4.5,
) {
  const parsedBackground = parseHexColor(background) ?? [255, 255, 255] as const;
  const black = [0, 0, 0] as const;
  const white = [255, 255, 255] as const;
  const target = contrastRatio(black, parsedBackground) >= contrastRatio(white, parsedBackground)
    ? black
    : white;
  const parsedForeground = parseHexColor(foreground);
  if (!parsedForeground) return toHex(target);
  if (contrastRatio(parsedForeground, parsedBackground) >= minimumContrast) {
    return toHex(parsedForeground);
  }

  for (let step = 1; step <= 255; step += 1) {
    const candidate = mixColor(parsedForeground, target, step / 255);
    if (contrastRatio(candidate, parsedBackground) >= minimumContrast) return toHex(candidate);
  }
  return toHex(target);
}
