import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStandardDraftV3 } from '../lib/open-ena/model-v3/compiler';
import { buildStandardExecutionPlanV3 } from '../lib/open-ena/model-v3/execution-plan';
import { runStandardPlanV3 } from '../lib/open-ena/analyze';
import type { StandardEnaDraftV3 } from '../lib/open-ena/model-v3/types';
import type { ParsedDataset } from '../lib/open-ena/types';

function fixture(scale = 1e-162) {
  const dataset: ParsedDataset = {
    name: 'underflow.csv', source: 'upload', sizeBytes: 512,
    headers: ['unit', 'horizon', 'A', 'B', 'C'],
    rows: [
      { unit: 'u1', horizon: 'h1', A: scale, B: scale, C: 10 * scale },
      { unit: 'u2', horizon: 'h2', A: 2, B: 1, C: 3 },
      { unit: 'u3', horizon: 'h3', A: 1, B: 3, C: 1 },
      { unit: 'u4', horizon: 'h4', A: 3, B: 1, C: 2 },
    ],
  };
  const draft: StandardEnaDraftV3 = {
    unitColumns: ['unit'], horizonColumns: ['horizon'], groupColumn: null,
    codes: ['A', 'B', 'C'], weighting: 'frequency', model: 'EndPoint', windowType: 'Conversation',
    movingStanza: { backward: { kind: 'finite', value: 1 }, forward: { kind: 'finite', value: 0 }, rowOrder: null },
    horizonOrder: null, rotation: { type: 'svd', centerAlignToOrigin: true },
  };
  return { dataset, draft };
}

for (const windowType of ['Conversation', 'MovingStanzaWindow'] as const) {
  test(`Standard compiler blocks partial ${windowType} edge underflow before execution`, async () => {
    const { dataset, draft } = fixture();
    draft.windowType = windowType;
    if (windowType === 'MovingStanzaWindow') {
      dataset.headers.push('rowOrder');
      dataset.rows.forEach((row, index) => { row.rowOrder = index; });
      draft.movingStanza.rowOrder = { kind: 'columns', keys: [{ column: 'rowOrder', direction: 'ascending', comparator: { type: 'number' } }] };
    }
    const compiled = await compileStandardDraftV3(dataset, 'a'.repeat(64), draft);
    assert.equal(compiled.status, 'invalid');
    const failure = compiled.diagnostics.find(d => d.id === 'STANDARD_OUTPUT_UNDERFLOW');
    assert.ok(failure);
    assert.equal(failure.severity, 'error');
    assert.ok(failure.blocks.includes('build-model'));
    assert.match(failure.detail, /rescale/i);
    await assert.rejects(buildStandardExecutionPlanV3({
      dataset, datasetSha256: 'a'.repeat(64), compileResult: compiled as never, reference: null,
    }), /compileResult/i);
  });
}

test('Standard compiler and runner retain representable subnormal edges', async () => {
  const { dataset, draft } = fixture(1e-160);
  const compiled = await compileStandardDraftV3(dataset, 'a'.repeat(64), draft);
  assert.equal(compiled.status, 'ready');
  if (compiled.status !== 'ready') throw new Error('Expected ready model');
  const plan = await buildStandardExecutionPlanV3({ dataset, datasetSha256: 'a'.repeat(64), compileResult: compiled, reference: null });
  assert.deepEqual(runStandardPlanV3(plan).set.connectionMatrix[0], [1e-320, 1e-319, 1e-319]);
});
