import type { AnalysisKind } from "./types";

export type OpenEnaNodePositionMethod = "undirected" | "directed";
export type OpenEnaNodeDimensionPosition = ReadonlyMap<string, number>;
export type OpenEnaNodeLayoutPositions = ReadonlyMap<string, OpenEnaNodeDimensionPosition>;

export interface OpenEnaNodeLayoutState {
  fingerprint: string;
  positions: OpenEnaNodeLayoutPositions;
}

export interface OpenEnaNodeLayoutFingerprintInput {
  analysisKind: AnalysisKind;
  analyzedAt: string;
  sourceDatasetNormalizedUtf8TextSha256: string | null;
  referenceId: string | null;
  codes: readonly string[];
  dimensions: readonly string[];
  nodePositionMethod: OpenEnaNodePositionMethod;
}

const OPEN_ENA_NODE_LAYOUT_FINGERPRINT_VERSION = "open-ena-node-layout-v1";

export function createOpenEnaNodeLayoutFingerprint(
  input: OpenEnaNodeLayoutFingerprintInput,
) {
  return `${OPEN_ENA_NODE_LAYOUT_FINGERPRINT_VERSION}:${JSON.stringify({
    analysisKind: input.analysisKind,
    analyzedAt: input.analyzedAt,
    sourceDatasetNormalizedUtf8TextSha256: input.sourceDatasetNormalizedUtf8TextSha256,
    referenceId: input.referenceId,
    codes: [...input.codes],
    dimensions: [...input.dimensions],
    nodePositionMethod: input.nodePositionMethod,
  })}`;
}

export function createOpenEnaNodeLayoutState(fingerprint: string): OpenEnaNodeLayoutState {
  return {
    fingerprint,
    positions: new Map(),
  };
}

function validDimensionEntries(dimensions: OpenEnaNodeDimensionPosition) {
  const entries = [...dimensions.entries()];
  if (entries.length === 0) return null;
  if (entries.some(([dimension, value]) => !dimension.trim() || !Number.isFinite(value))) return null;
  return entries;
}

export function moveOpenEnaNode(
  state: OpenEnaNodeLayoutState,
  fingerprint: string,
  code: string,
  dimensions: OpenEnaNodeDimensionPosition,
): OpenEnaNodeLayoutState {
  if (fingerprint !== state.fingerprint || !code.trim()) return state;
  const entries = validDimensionEntries(dimensions);
  if (!entries) return state;

  const previous = state.positions.get(code);
  const nextDimensions = new Map(previous);
  let changed = false;
  for (const [dimension, value] of entries) {
    if (nextDimensions.get(dimension) !== value) changed = true;
    nextDimensions.set(dimension, value);
  }
  if (!changed) return state;

  const positions = new Map(state.positions);
  positions.set(code, nextDimensions);
  return {
    fingerprint: state.fingerprint,
    positions,
  };
}

export function resetOpenEnaNodeLayout(state: OpenEnaNodeLayoutState): OpenEnaNodeLayoutState {
  return state.positions.size === 0 ? state : createOpenEnaNodeLayoutState(state.fingerprint);
}

export function resolveOpenEnaNodeDimensions(
  canonical: OpenEnaNodeDimensionPosition,
  override?: OpenEnaNodeDimensionPosition,
) {
  if (!override || override.size === 0) return new Map(canonical);
  const resolved = new Map(canonical);
  for (const [dimension, value] of override) {
    if (dimension.trim() && Number.isFinite(value)) resolved.set(dimension, value);
  }
  return resolved;
}

export function openEnaNodeLayoutOverrideCount(state: OpenEnaNodeLayoutState) {
  return state.positions.size;
}
