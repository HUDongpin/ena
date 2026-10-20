import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'tsup';
import { describe, expect, it } from 'vitest';
import { cohensD, dimensionSummary, ena, enaCorrelations, enaStats, groupSummary, type ENASet } from '../src/index.js';
import { pearsonCorrelation } from '../src/core/matrix.js';

function frequencySet(scale = 1): ENASet {
  return ena({
    rows: [1, 2, 3, 4, 5, 6].map((value, index) => ({
      unit: `u${index}`, horizon: `h${index}`, group: index < 3 ? 'left' : 'right',
      A: 1, B: 1, C: value * scale,
    })),
    units: ['unit'], conversation: ['horizon'], metadata: ['group'],
    codes: ['A', 'B', 'C'], weightBy: 'sum', dimensions: 3,
  });
}

describe('review: statistics preserve dimensionless quantities across finite scales', () => {
  it('retains Welch degrees of freedom for a real small-scale Frequency model', () => {
    const stats = enaStats(frequencySet(1e-100), { dims: ['SVD1'], by: 'group' });
    expect(stats.tests?.[0]?.statistic).toBeCloseTo(-3 * Math.sqrt(3 / 2), 12);
    expect(stats.tests?.[0]?.df).toBeCloseTo(4, 12);
  });

  for (const scale of [1e-200, 1e-100, 1, 1e100, 1e200]) {
    it(`keeps Cohen's d and Pearson invariant at scale ${scale}`, () => {
      const left = [1, 2, 3].map(value => value * scale);
      const right = [4, 5, 6].map(value => value * scale);
      expect(cohensD(left, right)).toBeCloseTo(3, 12);
      expect(pearsonCorrelation(left, right)).toBeCloseTo(1, 12);
      expect(pearsonCorrelation(left, [...right].reverse())).toBeCloseTo(-1, 12);
    });

    it(`keeps fitted point-centroid correlations invariant at scale ${scale}`, () => {
      const original = frequencySet();
      const axes = original.rotation.rotationColumns;
      const scaled: ENASet = {
        ...original,
        points: original.points.map(row => ({ ...row, ...Object.fromEntries(axes.map(axis => [axis, Number(row[axis]) * scale])) })),
        centroids: original.centroids!.map(row => ({ ...row, ...Object.fromEntries(axes.map(axis => [axis, Number(row[axis]) * scale])) })),
      };
      const baseline = enaCorrelations(original, ['SVD1'])[0]!;
      const actual = enaCorrelations(scaled, ['SVD1'])[0]!;
      expect(actual.pearson).toBeCloseTo(baseline.pearson, 12);
      expect(actual.spearman).toBeCloseTo(baseline.spearman, 12);
      expect(actual.pearsonLower).toBeCloseTo(baseline.pearsonLower, 12);
      expect(actual.pearsonUpper).toBeCloseTo(baseline.pearsonUpper, 12);
    });

    it(`keeps Welch t/df and ANOVA F invariant at scale ${scale}`, () => {
      const set = frequencySet();
      // Statistical coordinates are a change of measurement units. The
      // expected t, df and F follow directly from [1,2,3,4,5,6].
      set.points = set.points.map((row, index) => ({ ...row, SVD1: (index + 1) * scale }));
      const welch = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
      expect(welch.statistic).toBeCloseTo(-3 * Math.sqrt(3 / 2), 12);
      expect(welch.df).toBeCloseTo(4, 12);
      set.points = set.points.map((row, index) => ({ ...row, group: String(Math.floor(index / 2)) }));
      const anova = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
      expect(anova.statistic).toBeCloseTo(16, 12);
      expect(anova.dfBetween).toBe(2);
      expect(anova.dfWithin).toBe(3);
    });
  }

  it('retains representable standard deviations when the variance itself is outside the finite range', () => {
    for (const scale of [1e-200, 1e200]) {
      const set = frequencySet();
      set.points = set.points.map((row, index) => ({ ...row, SVD1: (index + 1) * scale }));
      const summary = dimensionSummary(set, ['SVD1'])[0]!;
      expect(summary.sd / scale).toBeCloseTo(Math.sqrt(3.5), 12);
      expect(summary.mean / scale).toBeCloseTo(3.5, 12);
      expect(summary.variance).toBe(scale < 1 ? 0 : Infinity);
    }
  });

  it('retains exact represented differences around a common offset', () => {
    const e = Number.EPSILON;
    const left = [1, 1 + e, 1 + 2 * e];
    const right = [1 + 3 * e, 1 + 4 * e, 1 + 5 * e];
    expect(pearsonCorrelation(left, [1, 2, 3])).toBeCloseTo(1, 14);
    expect(pearsonCorrelation([1e16, 1e16 + 2, 1e16 + 4], [1, 2, 3])).toBeCloseTo(1, 14);
    expect(cohensD(left, right)).toBeCloseTo(3, 14);
    const set = frequencySet();
    set.points = set.points.slice(0, 3).map((row, index) => ({ ...row, SVD1: left[index]! }));
    const summary = dimensionSummary(set, ['SVD1'])[0]!;
    expect(summary.sd).toBe(e);
    expect(summary.variance).toBe(e * e);
  });

  it('retains small within-group dispersion beside a distant constant group', () => {
    const left = [1, 1, 1];
    const right = [1e-200, 2e-200, 3e-200];
    expect(cohensD(left, right) / 1e200).toBeCloseTo(Math.SQRT2, 12);
    const set = frequencySet();
    set.points = set.points.map((row, index) => ({ ...row, SVD1: [...left, ...right][index]! }));
    const welch = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
    expect(welch.statistic / 1e200).toBeCloseTo(Math.sqrt(3), 12);
    expect(welch.df).toBeCloseTo(2, 12);
  });

  it('does not let an all-zero group suppress a small-scale ANOVA', () => {
    for (const scale of [1e-200, 1, 1e200]) {
      const set = frequencySet();
      set.points = set.points.map((row, index) => ({ ...row, SVD1: [0, 0, 1, 2, 4, 6][index]! * scale, group: String(Math.floor(index / 2)) }));
      const anova = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
      expect(anova.statistic).toBeCloseTo(15.8, 12);
    }
  });

  it('keeps summary variance consistent with centered deviations near a rounded mean', () => {
    const e = Number.EPSILON;
    const set = frequencySet();
    set.points = set.points.slice(0, 4).map((row, index) => ({ ...row, SVD1: 1 + index * e }));
    const summary = dimensionSummary(set, ['SVD1'])[0]!;
    expect(summary.variance / (e * e)).toBeCloseTo(5 / 3, 14);
    expect(summary.sd * summary.sd).toBe(summary.variance);
  });

  it('keeps Cohen’s d finite when the absolute pooled SD overflows', () => {
    expect(cohensD([-Number.MAX_VALUE, Number.MAX_VALUE], [0, Number.MAX_VALUE])).toBeCloseTo(1 / Math.sqrt(5), 14);
  });

  it('compares groups before separately rounding their means back to the common offset', () => {
    const e = Number.EPSILON;
    expect(cohensD([1, 1 + e], [1 + e, 1 + 2 * e])).toBeCloseTo(Math.SQRT2, 14);
    const set = frequencySet();
    set.points = set.points.slice(0, 4).map((row, index) => ({ ...row, SVD1: [1, 1 + e, 1 + e, 1 + 2 * e][index]!, group: String(Math.floor(index / 2)) }));
    const welch = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
    expect(welch.statistic).toBeCloseTo(-Math.SQRT2, 14);
    expect(welch.df).toBeCloseTo(2, 14);
    set.points = frequencySet().points.map((row, index) => ({ ...row, SVD1: 1 + index * e, group: String(Math.floor(index / 2)) }));
    expect(enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!.statistic).toBeCloseTo(16, 12);
  });

  it('preserves independent small within-group variation in ANOVA', () => {
    for (const epsilon of [1e-20, 1e-16]) {
      const set = frequencySet();
      set.points = set.points.map((row, index) => ({ ...row, SVD1: [1, 1, -epsilon, epsilon, -1, -1][index]!, group: String(Math.floor(index / 2)) }));
      const anova = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
      expect(anova.statistic * epsilon * epsilon).toBeCloseTo(3, 12);
      expect(anova.dfBetween).toBe(2);
      expect(anova.dfWithin).toBe(3);
    }
  });

  it('does not round subnormal group deviations before computing dimensionless ratios', () => {
    const m = Number.MIN_VALUE;
    expect(cohensD([0, m], [m, 2 * m])).toBeCloseTo(Math.SQRT2, 14);
    const set = frequencySet();
    set.points = set.points.slice(0, 4).map((row, index) => ({ ...row, SVD1: [0, m, m, 2 * m][index]!, group: String(Math.floor(index / 2)) }));
    const welch = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
    expect(welch.statistic).toBeCloseTo(-Math.SQRT2, 14);
    expect(welch.df).toBeCloseTo(2, 14);
  });

  it('does not restore an overflowing standard error before computing Welch t', () => {
    const m = Number.MAX_VALUE;
    const set = frequencySet();
    set.points = set.points.slice(0, 4).map((row, index) => ({ ...row, SVD1: [-m, m, 0, m][index]!, group: String(Math.floor(index / 2)) }));
    const welch = enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
    expect(welch.statistic).toBeCloseTo(-1 / Math.sqrt(5), 14);
    expect(welch.df).toBeCloseTo(25 / 17, 14);
  });

  it('handles finite coordinates whose pairwise difference overflows', () => {
    const set = frequencySet();
    const input = [-Number.MAX_VALUE, 0, Number.MAX_VALUE];
    set.points = set.points.slice(0, 3).map((row, index) => ({ ...row, SVD1: input[index]! }));
    set.centroids = set.points.map(row => ({ ...row }));
    const result = enaCorrelations(set, ['SVD1'])[0]!;
    expect(result.pearson).toBeCloseTo(1, 14);
    expect(result.spearman).toBeCloseTo(1, 14);
  });

  it('separates overflowing distances without changing representable tiny ranks', () => {
    const m = Number.MAX_VALUE;
    const tiny = Number.MIN_VALUE;
    for (const [points, centroids] of [
      [[-m, -m / 2, 0, m / 2, m], [-m / 2, -m / 4, 0, m / 4, m / 2]],
      [[-m, m, 0, tiny, 2 * tiny], [-m / 2, m / 2, 0, tiny, 2 * tiny]],
    ]) {
      const set = frequencySet();
      set.points = set.points.slice(0, 5).map((row, index) => ({ ...row, SVD1: points![index]! }));
      set.centroids = set.points.map((row, index) => ({ ...row, SVD1: centroids![index]! }));
      expect(enaCorrelations(set, ['SVD1'])[0]!.spearman).toBeCloseTo(1, 14);
    }
  });

  it('keeps a representable group mean even when its sum overflows', () => {
    const set = frequencySet();
    set.points = set.points.slice(0, 2).map(row => ({ ...row, SVD1: 1e308 }));
    expect(groupSummary(set, 'group', ['SVD1'])[0]!.means.SVD1).toBe(1e308);
  });

  it('returns undefined statistics promptly for non-finite API input', async () => {
    // Bundle fresh source with a declared package devDependency, then probe
    // from an isolated directory without requiring a workspace TS loader.
    const directory = mkdtempSync(join(tmpdir(), 'jena-statistics-probe-'));
    try {
      await build({
        entry: { probe: fileURLToPath(new URL('../src/core/matrix.ts', import.meta.url)) },
        outDir: directory, format: ['esm'], outExtension: () => ({ js: '.mjs' }),
        bundle: true, splitting: false, dts: false, config: false, silent: true,
      });
      // Isolate the malformed-input probe so an accidental nonterminating
      // exponent loop fails this regression instead of hanging the runner.
      const script = `import { cohensD } from ${JSON.stringify(pathToFileURL(join(directory, 'probe.mjs')).href)};
        if (!Number.isNaN(cohensD([1, 2], [Infinity, 1]))) process.exit(1);`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: directory, timeout: 1500 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('preserves undefined constant and insufficient-population statistics', () => {
    expect(cohensD([1, 1], [1, 1])).toBeNaN();
    expect(cohensD([1], [2])).toBeNaN();
    expect(pearsonCorrelation([1, 1], [2, 3])).toBeNaN();
    expect(pearsonCorrelation([1], [2])).toBeNaN();
  });
});
