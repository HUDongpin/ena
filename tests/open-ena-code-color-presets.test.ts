import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OPEN_ENA_CODE_COLOR_PRESETS,
  OpenEnaCodeColorPair,
  matchOpenEnaCodeColorPreset,
  normalizeOpenEnaCodeColorPair,
  normalizeOpenEnaHexColor,
  openEnaCodeColorFromPlane,
  openEnaCodeColorPair,
  openEnaHexToHsv,
  openEnaHsvToHex,
  preferredOpenEnaComplementary,
  shiftOpenEnaHsv,
} from '../lib/open-ena/code-color-presets';

test('defines the deeply frozen row-major preset palette', () => {
  const acceptsReadonlyPalette = (palette: ReadonlyArray<Readonly<OpenEnaCodeColorPair>>) => palette;
  acceptsReadonlyPalette(OPEN_ENA_CODE_COLOR_PRESETS);
  assert.deepEqual(OPEN_ENA_CODE_COLOR_PRESETS, [
    { primary: '#cc423a', complementary: '#56bd7c' },
    { primary: '#218ebf', complementary: '#ef691b' },
    { primary: '#9d5dbb', complementary: '#fbc848' },
    { primary: '#56bd7c', complementary: '#d0386c' },
    { primary: '#f18e9f', complementary: '#9a9eab' },
    { primary: '#ff8c39', complementary: '#346b88' },
  ]);
  assert.ok(Object.isFrozen(OPEN_ENA_CODE_COLOR_PRESETS));
  for (const preset of OPEN_ENA_CODE_COLOR_PRESETS) assert.ok(Object.isFrozen(preset));
  assert.throws(() => {
    (OPEN_ENA_CODE_COLOR_PRESETS as unknown as Array<{ primary: string }>)[0].primary = '#000000';
  }, TypeError);
});

test('normalizes only complete six-digit hex colors', () => {
  assert.equal(normalizeOpenEnaHexColor('#ABCDEF'), '#abcdef');
  for (const value of ['#123', '123456', ' #123456', '#123456 ', 'red', 'rgb(0,0,0)', '#12345678', '']) {
    assert.equal(normalizeOpenEnaHexColor(value), null, String(value));
  }
  assert.equal(normalizeOpenEnaHexColor(null), null);
  assert.equal(normalizeOpenEnaHexColor(123), null);
});

test('round-trips representative RGB colors through HSV', () => {
  assert.equal(openEnaHexToHsv('#123'), null);
  assert.equal(openEnaHexToHsv('not-a-color'), null);
  for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#cc423a', '#56bd7c', '#218ebf']) {
    assert.equal(openEnaHsvToHex(openEnaHexToHsv(hex)!), hex);
  }
  assert.deepEqual(openEnaHexToHsv('#ff0000'), { h: 0, s: 100, v: 100 });
  assert.deepEqual(openEnaHexToHsv('#00ff00'), { h: 120, s: 100, v: 100 });
  assert.deepEqual(openEnaHexToHsv('#0000ff'), { h: 240, s: 100, v: 100 });
  assert.equal(openEnaHsvToHex({ h: 0, s: 100, v: 100 }), '#ff0000');
  assert.equal(openEnaHsvToHex({ h: 120, s: 100, v: 100 }), '#00ff00');
  assert.equal(openEnaHsvToHex({ h: 240, s: 100, v: 100 }), '#0000ff');
  assert.equal(openEnaHsvToHex({ h: 360, s: 100, v: 100 }), '#ff0000');
  for (const value of [
    { h: NaN, s: 50, v: 50 },
    { h: 0, s: Infinity, v: 50 },
    { h: 0, s: 50, v: -Infinity },
  ]) assert.equal(openEnaHsvToHex(value), null);
  assert.equal(openEnaHsvToHex({ h: -20, s: 150, v: -10 }), '#000000');
  assert.equal(openEnaHsvToHex({ h: 420, s: 100, v: 100 }), '#ff0000');
});

test('maps the picker plane and shifts HSV with clamping and finite validation', () => {
  assert.equal(openEnaCodeColorFromPlane(0, 0, 0), '#ffffff');
  assert.equal(openEnaCodeColorFromPlane(0, 1, 0), '#ff0000');
  assert.equal(openEnaCodeColorFromPlane(120, 1, 1), '#000000');
  assert.equal(openEnaCodeColorFromPlane(-30, 2, -1), '#ff0000');
  for (const values of [[NaN, 0.5, 0.5], [0, Infinity, 0.5], [0, 0.5, -Infinity]]) {
    assert.equal(openEnaCodeColorFromPlane(...(values as [number, number, number])), null);
  }
  const source = { h: 10, s: 20, v: 30 };
  const delta = { h: -30, s: 100, v: 100 };
  assert.deepEqual(shiftOpenEnaHsv(source, delta), { h: 0, s: 100, v: 100 });
  assert.deepEqual(source, { h: 10, s: 20, v: 30 });
  assert.deepEqual(delta, { h: -30, s: 100, v: 100 });
  assert.deepEqual(shiftOpenEnaHsv(source, {}), { h: 10, s: 20, v: 30 });
  assert.equal(shiftOpenEnaHsv({ h: 10, s: 20, v: 30 }, { h: NaN }), null);
  assert.equal(shiftOpenEnaHsv({ h: Infinity, s: 20, v: 30 }, {}), null);
});

test('matches paired presets and chooses deterministic custom companions', () => {
  assert.equal(matchOpenEnaCodeColorPreset({ primary: '#CC423A', complementary: '#56BD7C' }), 0);
  assert.equal(matchOpenEnaCodeColorPreset({ primary: '#cc423a', complementary: '#ffffff' }), -1);
  assert.equal(preferredOpenEnaComplementary('#CC423A'), '#56bd7c');
  assert.equal(preferredOpenEnaComplementary('#000000'), '#ffffff');
  assert.equal(preferredOpenEnaComplementary('#ffffff'), '#000000');
  assert.equal(preferredOpenEnaComplementary('#777777'), '#000000');
});

test('resolves and normalizes pairs without mutating caller input', () => {
  const supplied = { primary: '#ABCDEF', complementary: '#123456' };
  const normalized = normalizeOpenEnaCodeColorPair(supplied);
  assert.deepEqual(normalized, { primary: '#abcdef', complementary: '#123456' });
  assert.deepEqual(supplied, { primary: '#ABCDEF', complementary: '#123456' });
  assert.notEqual(normalized, supplied);
  assert.deepEqual(openEnaCodeColorPair('#CC423A'), { primary: '#cc423a', complementary: '#56bd7c' });
  assert.deepEqual(openEnaCodeColorPair('bad', '#ABCDEF'), { primary: '#000000', complementary: '#abcdef' });
  assert.deepEqual(openEnaCodeColorPair('#ffffff', 'bad'), { primary: '#ffffff', complementary: '#000000' });
  assert.equal(normalizeOpenEnaCodeColorPair({ primary: 'bad', complementary: '#fff' }), null);
  assert.equal(normalizeOpenEnaCodeColorPair({ primary: '#218EBF', complementary: 'invalid' }), null);
});
