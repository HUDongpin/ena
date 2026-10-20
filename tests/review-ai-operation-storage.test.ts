import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { openEnaAiOperationStorageKey } from '../lib/open-ena/ai-operation-storage';
import { parseOpenEnaAiInterpretationRequest } from '../lib/open-ena/ai-interpretation';
import { sha256HexUtf8 } from '../lib/open-ena/plugins/sha256';
import { interpretationRequest } from './helpers/ai-interpretation-request-v2';

// Independent server-canonicalization oracle, matching the route's normalization.
function serverCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serverCanonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${serverCanonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]));
  return value;
}
test('operation digest matches the normalized server request and exposes no reviewed payload', () => {
  for (const locale of ['en', 'zh-hant', 'zh-hans'] as const) {
    const request = interpretationRequest(locale);
    const digest = createHash('sha256').update(serverCanonical(parseOpenEnaAiInterpretationRequest(request)), 'utf8').digest('hex');
    assert.equal(openEnaAiOperationStorageKey(request), `open-ena-ai-operation-v3:${digest}`);
    assert.match(openEnaAiOperationStorageKey(request), /^open-ena-ai-operation-v3:[a-f0-9]{64}$/u);
  }
});
test('reordered properties and server-normalized hash case preserve the retry identity', () => {
  const request = interpretationRequest();
  const reordered = reverseKeys(request) as typeof request;
  const uppercase = structuredClone(request); uppercase.binding.datasetHash = uppercase.binding.datasetHash.toUpperCase();
  for (const equivalent of [reordered, uppercase]) assert.equal(openEnaAiOperationStorageKey(equivalent), openEnaAiOperationStorageKey(request));
});
test('locale, source binding and analyzed timestamp separate distinct explicit requests', () => {
  const request = interpretationRequest();
  const variants = [interpretationRequest('zh-hant'), structuredClone(request), structuredClone(request)];
  variants[1].binding.datasetHash = 'c'.repeat(64);
  variants[2].binding.analyzedAt = '2026-08-22T10:00:00.000Z';
  assert.equal(new Set([request, ...variants].map(openEnaAiOperationStorageKey)).size, 4);
});
test('reused synchronous SHA256 helper agrees with independent Node crypto across padding and UTF8 boundaries', () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 1023, 49152]) {
    const value = '🧪漢a'.repeat(Math.ceil(size / 4)).slice(0, size);
    assert.equal(sha256HexUtf8(value), createHash('sha256').update(value, 'utf8').digest('hex'), `length ${size}`);
  }
});
