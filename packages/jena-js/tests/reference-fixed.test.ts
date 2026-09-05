import { expect, it } from 'vitest';
import { accumulateData, makeSet } from '../src/index.js';
import type { RotationSet } from '../src/types.js';

function fixture() {
  const data = accumulateData({
    rows: [{ unit: 'a', horizon: 'a', A: 1, B: 1, C: 0 }, { unit: 'b', horizon: 'b', A: 1, B: 0, C: 1 }, { unit: 'c', horizon: 'c', A: 0, B: 1, C: 1 }],
    units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'], networkType: 'standard', window: 'Conversation', weightBy: 'sum'
  });
  const rotationSet: RotationSet = {
    codes: data.codes, adjacencyKey: data.adjacencyKey,
    rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], rotationColumns: ['SVD1', 'SVD2', 'SVD3'],
    eigenvalues: [1, 1, 1], centerVector: [1 / 3, 1 / 3, 1 / 3],
    nodes: [{ code: 'A', SVD1: 10, SVD2: 20, SVD3: 30 }, { code: 'B', SVD1: 40, SVD2: 50, SVD3: 60 }, { code: 'C', SVD1: 70, SVD2: 80, SVD3: 90 }]
  };
  return { data, rotationSet };
}
const fixed = 'reference-fixed';

it('fixed Reference nodes produce incidence-weighted centroids without target least-squares positions', () => {
  const { data, rotationSet } = fixture();
  const set = makeSet(data, { rotationSet, nodePositionMethod: fixed, dimensions: 3 });
  expect(set.rotation).toEqual(rotationSet);
  expect(set.centroids?.map((row) => [row.SVD1, row.SVD2, row.SVD3])).toEqual([[25, 35, 45], [40, 50, 60], [55, 65, 75]]);
  const legacy = makeSet(data, { rotationSet, dimensions: 3 });
  expect(legacy.centroids).not.toEqual(set.centroids);
});

it('fixed Reference rejects missing nodes, bad Code identities, nonfinite coordinates and simultaneous target rotation', () => {
  const { data, rotationSet } = fixture();
  for (const modify of [
    (ref: RotationSet) => { delete ref.nodes; },
    (ref: RotationSet) => { ref.nodes![0]!.code = 'B'; },
    (ref: RotationSet) => { ref.nodes![0]!.SVD1 = NaN; },
    (ref: RotationSet) => { delete ref.nodes![0]!.SVD3; },
    (ref: RotationSet) => { ref.codes.reverse(); }
  ]) {
    const ref = structuredClone(rotationSet);
    modify(ref);
    expect(() => makeSet(data, { rotationSet: ref, nodePositionMethod: fixed, dimensions: 3 })).toThrow(/Reference/i);
  }
  expect(() => makeSet(data, { nodePositionMethod: fixed, dimensions: 3 })).toThrow(/Reference/i);
  expect(() => makeSet(data, { rotationSet, rotation: { method: 'svd' }, nodePositionMethod: fixed, dimensions: 3 })).toThrow(/Reference/i);
});

it('fixed Reference supports zero target networks with finite fixed centroids', () => {
  const { data, rotationSet } = fixture();
  data.connectionMatrix = data.connectionMatrix.map((row) => row.map(() => 0));
  const set = makeSet(data, { rotationSet, nodePositionMethod: fixed, dimensions: 3 });
  expect(set.points.map((row) => [row.SVD1, row.SVD2, row.SVD3])).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  expect(set.centroids?.map((row) => [row.SVD1, row.SVD2, row.SVD3])).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
});

it('fixed Reference rejects ordered data', () => {
  const { rotationSet } = fixture();
  const data = accumulateData({ rows: [{ unit: 'a', horizon: 'h', A: 1, B: 1, C: 1 }], units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'], networkType: 'ordered', weightBy: 'sum' });
  expect(() => makeSet(data, { rotationSet, nodePositionMethod: fixed, dimensions: 3 })).toThrow(/Ordered.*rotationSet/);
});

it('fixed Reference rejects nonfinite supplied node coordinates outside the requested display axes', () => {
  const { data, rotationSet } = fixture();
  for (const coordinate of [NaN, Infinity]) {
    const reference = structuredClone(rotationSet);
    reference.nodes![0]!.SVD3 = coordinate;
    expect(() => makeSet(data, { rotationSet: reference, nodePositionMethod: fixed, dimensions: 2 })).toThrow(/Reference.*finite/);
  }
});

it('fixed Reference rejects a sparse Code identity array with an unchanged length', () => {
  const { data, rotationSet } = fixture();
  const reference = structuredClone(rotationSet);
  delete reference.codes[1];
  expect(reference.codes.length).toBe(data.codes.length);
  expect(() => makeSet(data, { rotationSet: reference, nodePositionMethod: fixed, dimensions: 2 })).toThrow(/Reference.*identity/);
});

it('fixed Reference rejects a sparse fixed node array with an unchanged length', () => {
  const { data, rotationSet } = fixture();
  const reference = structuredClone(rotationSet);
  delete reference.nodes![1];
  expect(reference.nodes).toHaveLength(data.codes.length);
  expect(() => makeSet(data, { rotationSet: reference, nodePositionMethod: fixed, dimensions: 2 })).toThrow(/Reference.*dense/);
});

it('fixed Reference permits absent undisplayed node coordinates for a 2D projection', () => {
  const { data, rotationSet } = fixture();
  for (const node of rotationSet.nodes!) delete node.SVD3;
  const set = makeSet(data, { rotationSet, nodePositionMethod: fixed, dimensions: 2 });
  expect(set.rotation.nodes).toEqual(rotationSet.nodes);
  expect(set.centroids?.map((row) => [row.SVD1, row.SVD2])).toEqual([[25, 35], [40, 50], [55, 65]]);
  expect(() => makeSet(data, { rotationSet, nodePositionMethod: fixed, dimensions: 3 })).toThrow(/Reference.*complete/);
});

it('fixed Reference retains a full six-axis basis when four fitted Code nodes only have three coordinates', () => {
  const data = accumulateData({
    rows: [
      { unit: 'a', horizon: 'a', A: 1, B: 1, C: 0, D: 0 },
      { unit: 'b', horizon: 'b', A: 1, B: 0, C: 1, D: 0 },
      { unit: 'c', horizon: 'c', A: 0, B: 0, C: 1, D: 1 },
      { unit: 'd', horizon: 'd', A: 1, B: 0, C: 0, D: 1 }
    ],
    units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C', 'D'], networkType: 'standard', window: 'Conversation', weightBy: 'sum'
  });
  const rotationSet = makeSet(data, { dimensions: 3 }).rotation;
  expect(rotationSet.rotationColumns).toHaveLength(6);
  expect(rotationSet.nodes?.every((node) => Object.keys(node).length === 4)).toBe(true);
  expect(makeSet(data, { rotationSet, nodePositionMethod: fixed, dimensions: 3 }).rotation).toEqual(rotationSet);
});
