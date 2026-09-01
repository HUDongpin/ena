import assert from "node:assert/strict";
import test from "node:test";
import {
  dragOpenEnaNodeIn3d,
  openEnaNodeCameraDepth,
  type OpenEnaNodeDrag3dInput,
} from "../lib/open-ena/node-drag-3d";
import { cameraForPreset } from "../lib/open-ena/plot3d";

const ranges = {
  x: [-5, 5] as const,
  y: [-5, 5] as const,
  z: [-5, 5] as const,
};

function input(overrides: Partial<OpenEnaNodeDrag3dInput> = {}): OpenEnaNodeDrag3dInput {
  return {
    position: { x: 1, y: 2, z: 3 },
    deltaPixels: { x: 100, y: -50 },
    viewport: { width: 1000, height: 500 },
    ranges,
    camera: cameraForPreset("xy"),
    aspectRatio: { x: 1, y: 1, z: 1 },
    ...overrides,
  };
}

test("XY drag changes X and Y in cursor direction but preserves Z", () => {
  const next = dragOpenEnaNodeIn3d(input());
  assert.ok(next.x > 1);
  assert.ok(next.y > 2);
  assert.equal(next.z, 3);
});

test("every orthographic plane preserves its camera-depth axis", () => {
  const cases = [
    ["xy", "z"],
    ["yx", "z"],
    ["xz", "y"],
    ["zx", "y"],
    ["yz", "x"],
    ["zy", "x"],
  ] as const;

  for (const [preset, preserved] of cases) {
    const start = input({ camera: cameraForPreset(preset) });
    const next = dragOpenEnaNodeIn3d(start);
    assert.equal(next[preserved], start.position[preserved], `${preset} must preserve ${preserved}`);
    assert.notDeepEqual(next, start.position, `${preset} must move in its visible plane`);
  }
});

test("isometric drag preserves camera-space depth", () => {
  const start = input({ camera: cameraForPreset("isometric") });
  const beforeDepth = openEnaNodeCameraDepth(start.position, start);
  const next = dragOpenEnaNodeIn3d(start);
  const afterDepth = openEnaNodeCameraDepth(next, start);

  assert.ok(Math.abs(afterDepth - beforeDepth) < 1e-12);
  assert.notDeepEqual(next, start.position);
});

test("perspective motion scales with node distance while orthographic motion does not", () => {
  const camera = cameraForPreset("isometric");
  const near = input({ position: { x: 0.3, y: 0.3, z: 0.3 }, camera });
  const far = input({ position: { x: -4, y: -4, z: -4 }, camera });
  const nearNext = dragOpenEnaNodeIn3d(near);
  const farNext = dragOpenEnaNodeIn3d(far);
  const movement = (start: OpenEnaNodeDrag3dInput, next: typeof nearNext) => Math.hypot(
    next.x - start.position.x,
    next.y - start.position.y,
    next.z - start.position.z,
  );

  assert.ok(movement(far, farNext) > movement(near, nearNext));
});

test("reversed scene ranges reverse only the corresponding display direction", () => {
  const normal = dragOpenEnaNodeIn3d(input({ deltaPixels: { x: 100, y: 0 } }));
  const flipped = dragOpenEnaNodeIn3d(input({
    deltaPixels: { x: 100, y: 0 },
    ranges: { ...ranges, x: [5, -5] },
  }));

  assert.ok(normal.x > 1);
  assert.ok(flipped.x < 1);
  assert.equal(normal.y, flipped.y);
  assert.equal(normal.z, flipped.z);
});

test("invalid viewport, ranges, camera, and pointer deltas fail closed", () => {
  const candidates = [
    input({ viewport: { width: 0, height: 500 } }),
    input({ ranges: { ...ranges, x: [2, 2] } }),
    input({ deltaPixels: { x: Number.NaN, y: 1 } }),
    input({ camera: { ...cameraForPreset("xy"), eye: { x: Number.POSITIVE_INFINITY, y: 0, z: 1 } } }),
  ];

  for (const candidate of candidates) {
    assert.deepEqual(dragOpenEnaNodeIn3d(candidate), candidate.position);
  }
});
