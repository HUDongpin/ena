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
  saturation: string;
  brightness: string;
  saturationBrightnessValue: (saturation: number, brightness: number) => string;
  hue: string;
  invalidHex: string;
  presetLabel: (index: number, primary: string, complementary: string) => string;
}

const PRESETS: OpenEnaCodeColorPair[] = [
  { primary: '#cc423a', complementary: '#56bd7c' },
  { primary: '#218ebf', complementary: '#ef691b' },
  { primary: '#9d5dbb', complementary: '#fbc848' },
  { primary: '#56bd7c', complementary: '#d0386c' },
  { primary: '#f18e9f', complementary: '#9a9eab' },
  { primary: '#ff8c39', complementary: '#346b88' },
];

export const OPEN_ENA_CODE_COLOR_PRESETS: ReadonlyArray<Readonly<OpenEnaCodeColorPair>> = Object.freeze(
  PRESETS.map((preset) => Object.freeze(preset)),
);

export function normalizeOpenEnaHexColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : null;
}

export function openEnaHexToHsv(value: unknown): OpenEnaHsvColor | null {
  const hex = normalizeOpenEnaHexColor(value);
  if (!hex) return null;
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  let h = 0;
  if (chroma !== 0) {
    if (max === r) h = 60 * (((g - b) / chroma) % 6);
    else if (max === g) h = 60 * ((b - r) / chroma + 2);
    else h = 60 * ((r - g) / chroma + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (chroma / max) * 100, v: max * 100 };
}

function finiteHsv(value: OpenEnaHsvColor): boolean {
  return Number.isFinite(value.h) && Number.isFinite(value.s) && Number.isFinite(value.v);
}

export function openEnaHsvToHex(value: OpenEnaHsvColor): string | null {
  if (!value || !finiteHsv(value)) return null;
  const h = ((Math.max(0, Math.min(360, value.h)) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, value.s)) / 100;
  const v = Math.max(0, Math.min(100, value.v)) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function openEnaCodeColorFromPlane(hue: number, xRatio: number, yRatio: number): string | null {
  if (![hue, xRatio, yRatio].every(Number.isFinite)) return null;
  return openEnaHsvToHex({
    h: Math.max(0, Math.min(360, hue)),
    s: Math.max(0, Math.min(1, xRatio)) * 100,
    v: (1 - Math.max(0, Math.min(1, yRatio))) * 100,
  });
}

export function shiftOpenEnaHsv(value: OpenEnaHsvColor, delta: Partial<OpenEnaHsvColor>): OpenEnaHsvColor | null {
  if (!value || !finiteHsv(value)) return null;
  const result = { h: value.h + (delta.h ?? 0), s: value.s + (delta.s ?? 0), v: value.v + (delta.v ?? 0) };
  if (!finiteHsv(result)) return null;
  return { h: Math.max(0, Math.min(360, result.h)), s: Math.max(0, Math.min(100, result.s)), v: Math.max(0, Math.min(100, result.v)) };
}

export function matchOpenEnaCodeColorPreset(value: OpenEnaCodeColorPair): number {
  const primary = normalizeOpenEnaHexColor(value?.primary);
  const complementary = normalizeOpenEnaHexColor(value?.complementary);
  if (!primary || !complementary) return -1;
  return OPEN_ENA_CODE_COLOR_PRESETS.findIndex((preset) => preset.primary === primary && preset.complementary === complementary);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return channels.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4), 0);
}

export function preferredOpenEnaComplementary(primaryValue: unknown): string {
  const primary = normalizeOpenEnaHexColor(primaryValue) ?? '#000000';
  const preset = OPEN_ENA_CODE_COLOR_PRESETS.find((candidate) => candidate.primary === primary);
  if (preset) return preset.complementary;
  const luminance = relativeLuminance(primary);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
}

export function openEnaCodeColorPair(primaryValue: unknown, complementaryValue?: unknown): OpenEnaCodeColorPair {
  const primary = normalizeOpenEnaHexColor(primaryValue) ?? '#000000';
  return { primary, complementary: normalizeOpenEnaHexColor(complementaryValue) ?? preferredOpenEnaComplementary(primary) };
}

export function normalizeOpenEnaCodeColorPair(value: OpenEnaCodeColorPair): OpenEnaCodeColorPair | null {
  const primary = normalizeOpenEnaHexColor(value?.primary);
  if (!primary) return null;
  const complementary = normalizeOpenEnaHexColor(value?.complementary);
  if (!complementary) return null;
  return { primary, complementary };
}
