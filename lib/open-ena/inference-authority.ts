import type { OpenEnaInferenceTrajectoryMappingV2 } from "./inference-v2";

export interface OpenEnaInferenceCoordinatorAuthorityContextV2 {
  groupNames: readonly string[];
  groupColumn: string | null;
  trajectoryMapping: OpenEnaInferenceTrajectoryMappingV2 | null;
}

interface OpenEnaInferenceCoordinatorAuthorityTrajectoryMappingSnapshotV2 {
  readonly contractVersion: 1;
  readonly repeatedEntityColumns: readonly string[];
  readonly identityConfirmed: true;
  readonly timeColumn: string;
  readonly timeOrder: readonly string[];
}

interface OpenEnaInferenceCoordinatorAuthoritySnapshotV2 {
  groupNames: readonly string[];
  groupColumn: string | null;
  trajectoryMapping: OpenEnaInferenceCoordinatorAuthorityTrajectoryMappingSnapshotV2 | null;
}

const coordinatorInferenceAuthorities = new WeakMap<
  object,
  OpenEnaInferenceCoordinatorAuthoritySnapshotV2
>();
const AUTHORITY_MISMATCH = "Inference consumer authority mismatch.";
const CURRENT_CONTEXT_MISMATCH = "Inference consumer current context mismatch.";

function canonicalGroupNames(groupNames: readonly string[]) {
  return [...groupNames].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
}

function snapshotTrajectoryMapping(
  mapping: OpenEnaInferenceTrajectoryMappingV2 | null,
): OpenEnaInferenceCoordinatorAuthorityTrajectoryMappingSnapshotV2 | null {
  if (mapping === null) return null;
  return Object.freeze({
    contractVersion: mapping.contractVersion,
    repeatedEntityColumns: Object.freeze([...mapping.repeatedEntityColumns]),
    identityConfirmed: mapping.identityConfirmed,
    timeColumn: mapping.timeColumn,
    timeOrder: Object.freeze([...mapping.timeOrder]),
  });
}

function snapshotAuthorityContext(
  context: OpenEnaInferenceCoordinatorAuthorityContextV2,
): OpenEnaInferenceCoordinatorAuthoritySnapshotV2 {
  return Object.freeze({
    groupNames: Object.freeze(canonicalGroupNames(context.groupNames)),
    groupColumn: context.groupColumn,
    trajectoryMapping: snapshotTrajectoryMapping(context.trajectoryMapping),
  });
}

function sameOrdered(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every((entry, index) => entry === right[index]);
}

function sameTrajectoryMapping(
  left: OpenEnaInferenceCoordinatorAuthorityTrajectoryMappingSnapshotV2 | null,
  right: OpenEnaInferenceTrajectoryMappingV2 | null,
) {
  if (left === null || right === null) return left === right;
  return left.contractVersion === right.contractVersion
    && left.identityConfirmed === right.identityConfirmed
    && left.timeColumn === right.timeColumn
    && sameOrdered(left.repeatedEntityColumns, right.repeatedEntityColumns)
    && sameOrdered(left.timeOrder, right.timeOrder);
}

/**
 * Internal coordinator seam. Its aggregate group/mapping context is deliberately
 * process-local, contains no participant-level evidence, and is never serialized
 * into bundles, exports, DOM, logs, or AI evidence. Cloning otherwise valid JSON
 * therefore cannot recreate this authority.
 */
export function markOpenEnaInferenceCoordinatorAuthorityV2<T extends object>(
  value: T,
  context: OpenEnaInferenceCoordinatorAuthorityContextV2,
): T {
  if (!Object.isFrozen(value)) {
    throw new Error("Inference coordinator authority must be frozen before registration.");
  }
  coordinatorInferenceAuthorities.set(value, snapshotAuthorityContext(context));
  return value;
}

export function assertOpenEnaInferenceCoordinatorAuthorityV2(
  value: unknown,
): asserts value is object {
  if (value === null
    || typeof value !== "object"
    || !coordinatorInferenceAuthorities.has(value)) {
    throw new Error(AUTHORITY_MISMATCH);
  }
}

/**
 * Compares the current producer context with the private context captured by
 * the coordinator. Values remain process-local and mismatch errors never echo
 * group, period, identity-column, or other source-derived labels.
 */
export function assertOpenEnaInferenceCoordinatorCurrentContextAuthorityV2(
  value: unknown,
  context: OpenEnaInferenceCoordinatorAuthorityContextV2,
): void {
  assertOpenEnaInferenceCoordinatorAuthorityV2(value);
  const registered = coordinatorInferenceAuthorities.get(value);
  if (!registered) throw new Error(AUTHORITY_MISMATCH);
  const currentGroupNames = canonicalGroupNames(context.groupNames);
  if (registered.groupColumn !== context.groupColumn
    || !sameOrdered(registered.groupNames, currentGroupNames)
    || !sameTrajectoryMapping(registered.trajectoryMapping, context.trajectoryMapping)) {
    throw new Error(CURRENT_CONTEXT_MISMATCH);
  }
}
