import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStandardDraftV3 } from '../lib/open-ena/model-v3/compiler';
import { buildStandardExecutionPlanV3 } from '../lib/open-ena/model-v3/execution-plan';
import { createOpenEnaWorkerHost } from '../lib/open-ena/jena.worker';
import type { OpenEnaWorkerResponse, OpenEnaWorkerScope } from '../lib/open-ena/jena.worker';
import type { StandardEnaDraftV3 } from '../lib/open-ena/model-v3/types';
import type { ParsedDataset } from '../lib/open-ena/types';

const baseDraft: StandardEnaDraftV3 = {
  unitColumns: ['unit'], horizonColumns: ['horizon'], groupColumn: null,
  codes: ['A', 'B', 'C'], weighting: 'frequency', model: 'EndPoint', windowType: 'Conversation',
  movingStanza: { backward: { kind: 'finite', value: 1 }, forward: { kind: 'finite', value: 0 }, rowOrder: null },
  horizonOrder: null, rotation: { type: 'svd', centerAlignToOrigin: true },
};

async function fit(rows: ParsedDataset['rows'], draft: StandardEnaDraftV3) {
  const dataset: ParsedDataset = {
    name: 'synthetic-centering.csv', source: 'upload', sizeBytes: rows.length * 100,
    headers: ['unit', 'horizon', 'group', 'A', 'B', 'C'], rows,
  };
  const compiled = await compileStandardDraftV3(dataset, 'a'.repeat(64), draft);
  assert.equal(compiled.status, 'ready', JSON.stringify(compiled.diagnostics));
  if (compiled.status !== 'ready') throw new Error('Expected a ready synthetic model');
  const plan = await buildStandardExecutionPlanV3({ dataset, datasetSha256: 'a'.repeat(64), compileResult: compiled, reference: null });
  let receive: Parameters<OpenEnaWorkerScope['addEventListener']>[1] = () => {};
  let finish: (message: OpenEnaWorkerResponse) => void = () => {};
  const terminal = new Promise<OpenEnaWorkerResponse>(resolve => { finish = resolve; });
  createOpenEnaWorkerHost({
    addEventListener(_type, listener) { receive = listener; },
    postMessage(message) { if (['result-v3', 'error', 'cancelled'].includes(message.kind)) finish(message); },
  });
  receive({ data: { kind: 'run-open-ena-plan-v3', id: 'stable-centering', plan, chunkSize: 500 } });
  const message = await terminal;
  assert.equal(message.kind, 'result-v3', message.kind === 'error' ? message.message : message.kind);
  if (message.kind !== 'result-v3') throw new Error('Expected a bound scientific result');
  if ('orderedAudit' in message.result) throw new Error('Expected a Standard result');
  return message.result;
}

test('admitted near-identical Means groups retain the same contrast after source-row permutation', { timeout: 30000 }, async () => {
  const delta = 1e-11;
  const patterns = [[1, 1, 0], [1, 0, 1], [0, 1, 1]];
  const rows: ParsedDataset['rows'] = [];
  for (const group of ['P', 'N']) for (let index = 0; index < 1500; index++) {
    const pattern = group === 'P' ? index % 3 : Math.floor(index / 500);
    rows.push({ unit: String(rows.length), horizon: String(rows.length), group,
      A: patterns[pattern][0], B: patterns[pattern][1], C: group === 'P' && index === 0 ? delta : patterns[pattern][2] });
  }
  const draft: StandardEnaDraftV3 = { ...baseDraft, groupColumn: 'group', rotation: {
    type: 'means', centerAlignToOrigin: true,
    negativeLevel: { type: 'string', value: 'N' }, positiveLevel: { type: 'string', value: 'P' },
  } };
  const original = await fit(rows, draft);
  const reordered = await fit([...rows].sort((a, b) => String(a.group).localeCompare(String(b.group))
    || Number(b.A) - Number(a.A) || Number(b.B) - Number(a.B) || Number(b.C) - Number(a.C)), draft);
  // The groups have identical profile multiplicities except for one tiny AC
  // and BC addition. Its O(delta^2) AB change rounds away during normalization.
  const expected = [0, Math.SQRT1_2, Math.SQRT1_2];
  const roundingBound = 4 * Number.EPSILON / delta;
  expected.forEach((value, edge) => {
    assert.ok(Math.abs(original.set.rotation.rotationMatrix[edge][0] - value) < roundingBound);
    assert.ok(Math.abs(original.set.rotation.rotationMatrix[edge][0] - reordered.set.rotation.rotationMatrix[edge][0]) < 1e-12);
  });
  original.executionProvenance.projection.variance.forEach((share, axis) => {
    assert.ok(Math.abs(share - reordered.executionProvenance.projection.variance[axis]) < 1e-12);
  });
});

for (const centerAlignToOrigin of [false, true]) for (const delta of [1e-8, 1e-12]) {
  test(`near-constant SVD completes with accurate centering (origin alignment ${centerAlignToOrigin}, delta ${delta})`, { timeout: 15000 }, async () => {
    const n = 1000;
    const rows = Array.from({ length: n }, (_, index) => ({
      unit: String(index), horizon: String(index), group: 'all', A: 1, B: 1, C: index === 0 ? 1 + delta : 1,
    }));
    const result = await fit(rows, { ...baseDraft, rotation: { type: 'svd', centerAlignToOrigin } });
    assert.equal(result.executionProvenance.projection.rank, 1);
    assert.deepEqual(result.executionProvenance.projection.estimableAxes, ['SVD1']);
    // Two unique normalized profiles have rank one, with sample eigenvalue
    // ||profile1 - profile0||^2 / n for multiplicities 1 and n - 1.
    const normalized = result.set.lineWeights.slice(0, 2).map(row => result.set.codeColumns.map(edge => Number(row[edge])));
    const expected = normalized[1].reduce((sum, value, edge) => sum + (value - normalized[0][edge]) ** 2, 0) / n;
    const eigenvalues = result.set.rotation.eigenvalues;
    assert.ok(Math.abs(eigenvalues[0] / expected - 1) < 1e-7);
    assert.ok(eigenvalues.slice(1).every(value => value / eigenvalues[0] < 1e-8));
    assert.ok(Math.abs(result.set.variance.SVD1 - 1) < 1e-8);
  });
}
