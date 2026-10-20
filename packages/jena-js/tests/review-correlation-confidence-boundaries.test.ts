import { describe, expect, it } from 'vitest';
import { ena, enaCorrelations, enaStats, type Row } from '../src/index.js';

function fitted(epsilon=0, n=6) {
  const codes=['A','B','C'];
  const rows:Row[]=Array.from({length:n},(_,i)=>({unit:`u${i}`,conv:`h${i}`,...Object.fromEntries(codes.map((code,j)=>[code,j!==i%3?1:i===0?epsilon:0]))}));
  return ena({rows,codes,units:['unit'],conversation:['conv'],weightBy:'sum',windowSizeBack:1,dimensions:2});
}

describe('public model correlation Fisher intervals',()=>{
  it('keeps an exactly perfect correlation inside its Fisher-limit interval',()=>{
    const rows=enaCorrelations(fitted());
    expect(rows.some(row=>row.pearson===1)).toBe(true);
    for(const row of rows.filter(row=>row.pearson===1)){
      expect(row.pearsonLower).toBe(1);
      expect(row.pearsonUpper).toBe(1);
    }
  });
  it('does not cap a represented nearly perfect correlation at 1 minus 1e-12',()=>{
    const row=enaCorrelations(fitted(1e-7)).find(row=>row.pearson<1)!;
    expect(row.pearson).toBeGreaterThan(1-1e-12);
    expect(row.pearsonLower).toBeLessThanOrEqual(row.pearson);
    expect(row.pearsonUpper).toBeGreaterThanOrEqual(row.pearson);
    // Independent Fisher-z value: Python Decimal 100 digits with base-R qnorm.
    // The statistical approximation tolerance is wider than IEEE-754 rounding.
    expect(Math.abs(row.pearsonLower-0.99999999999999139419)).toBeLessThan(5e-15);
    expect(Math.abs(row.pearsonUpper-0.99999999999999910482)).toBeLessThan(5e-15);
  });
  it('retains finite limits for the largest representable confidence below one',()=>{
    const set=fitted(.5), confidence=1-2**-53;
    const row=enaStats(set,{confLevel:confidence}).correlations.find(row=>row.pearson<1)!;
    expect(Number.isFinite(row.pearsonLower)).toBe(true);
    expect(Number.isFinite(row.pearsonUpper)).toBe(true);
    expect(row.pearsonLower).toBeLessThan(row.pearson);
    expect(row.pearsonUpper).toBeGreaterThan(row.pearson);
    // R qnorm(2^-54) = -8.292361075813597. The stable input is the lower tail.
    expect(Math.abs(row.pearsonLower-0.49221289063857942791)).toBeLessThan(2e-8);
    expect(Math.abs(row.pearsonUpper-0.99995274837056441348)).toBeLessThan(2e-8);
  });
  it('preserves insufficient pair-count and ordinary confidence controls',()=>{
    for(const row of enaCorrelations(fitted(.5,3))){
      expect(Number.isNaN(row.pearsonLower)).toBe(true);
      expect(Number.isNaN(row.pearsonUpper)).toBe(true);
    }
    const row=enaCorrelations(fitted(.5)).find(row=>row.pearson<1)!;
    expect(row.pearsonLower).toBeCloseTo(0.98257013715221268981,8);
    expect(row.pearsonUpper).toBeCloseTo(0.99817267605493317684,8);
  });
});
