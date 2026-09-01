import type { OpenEna3dAspectRatio, OpenEna3dCamera } from "./plot3d";

export interface OpenEnaNodePosition3d {
  x: number;
  y: number;
  z: number;
}

export type OpenEnaNodeAxisRange = readonly [number, number];

export interface OpenEnaNodeDrag3dInput {
  position: OpenEnaNodePosition3d;
  deltaPixels: { x: number; y: number };
  viewport: { width: number; height: number };
  ranges: {
    x: OpenEnaNodeAxisRange;
    y: OpenEnaNodeAxisRange;
    z: OpenEnaNodeAxisRange;
  };
  camera: OpenEna3dCamera;
  aspectRatio: OpenEna3dAspectRatio;
}

type Vector3 = OpenEnaNodePosition3d;

const AXES = ["x", "y", "z"] as const;
const EPSILON = 1e-12;

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function length(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vector3) {
  const magnitude = length(vector);
  return magnitude > EPSILON && Number.isFinite(magnitude)
    ? scale(vector, 1 / magnitude)
    : null;
}

function finiteVector(vector: Vector3) {
  return AXES.every((axis) => Number.isFinite(vector[axis]));
}

function validInput(input: OpenEnaNodeDrag3dInput) {
  if (!finiteVector(input.position)
    || !finiteVector(input.camera.eye)
    || !finiteVector(input.camera.center)
    || !finiteVector(input.camera.up)
    || !finiteVector(input.aspectRatio)
    || !Number.isFinite(input.deltaPixels.x)
    || !Number.isFinite(input.deltaPixels.y)
    || !Number.isFinite(input.viewport.width)
    || !Number.isFinite(input.viewport.height)
    || input.viewport.width <= 0
    || input.viewport.height <= 0) return false;

  return AXES.every((axis) => {
    const [start, end] = input.ranges[axis];
    return Number.isFinite(start)
      && Number.isFinite(end)
      && Math.abs(end - start) > EPSILON
      && input.aspectRatio[axis] > EPSILON;
  });
}

function toScene(position: OpenEnaNodePosition3d, input: OpenEnaNodeDrag3dInput): Vector3 {
  return Object.fromEntries(AXES.map((axis) => {
    const [start, end] = input.ranges[axis];
    return [axis, ((position[axis] - start) / (end - start) - 0.5) * input.aspectRatio[axis]];
  })) as unknown as Vector3;
}

function fromScene(scene: Vector3, input: OpenEnaNodeDrag3dInput): OpenEnaNodePosition3d {
  return Object.fromEntries(AXES.map((axis) => {
    const [start, end] = input.ranges[axis];
    return [axis, start + (scene[axis] / input.aspectRatio[axis] + 0.5) * (end - start)];
  })) as unknown as OpenEnaNodePosition3d;
}

function cameraBasis(input: OpenEnaNodeDrag3dInput) {
  const view = normalize(subtract(input.camera.center, input.camera.eye));
  if (!view) return null;
  const right = normalize(cross(view, input.camera.up));
  if (!right) return null;
  const up = normalize(cross(right, view));
  return up ? { view, right, up } : null;
}

export function openEnaNodeCameraDepth(
  position: OpenEnaNodePosition3d,
  input: OpenEnaNodeDrag3dInput,
) {
  if (!validInput({ ...input, position })) return Number.NaN;
  const basis = cameraBasis(input);
  if (!basis) return Number.NaN;
  return dot(subtract(toScene(position, input), input.camera.center), basis.view);
}

export function dragOpenEnaNodeIn3d(input: OpenEnaNodeDrag3dInput): OpenEnaNodePosition3d {
  if (!validInput(input)) return { ...input.position };
  const basis = cameraBasis(input);
  if (!basis) return { ...input.position };

  const scenePosition = toScene(input.position, input);
  const horizontal = input.deltaPixels.x / input.viewport.width;
  const vertical = -input.deltaPixels.y / input.viewport.height;
  const referenceDistance = Math.max(EPSILON, length(subtract(input.camera.eye, input.camera.center)));
  const perspectiveScale = input.camera.projection.type === "perspective"
    ? Math.max(0.1, length(subtract(scenePosition, input.camera.eye)) / referenceDistance)
    : 1;
  const movement = add(
    scale(basis.right, horizontal * perspectiveScale),
    scale(basis.up, vertical * perspectiveScale),
  );
  const resolved = fromScene(add(scenePosition, movement), input);
  return finiteVector(resolved) ? resolved : { ...input.position };
}
