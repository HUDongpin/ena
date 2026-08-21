const coordinatorInferenceAuthorities = new WeakSet<object>();

/**
 * Internal coordinator seam. The authority is deliberately process-local and
 * value-free: it is not serialized into bundles, exports, DOM, logs, or AI
 * evidence, and therefore cannot be recreated by cloning otherwise valid JSON.
 */
export function markOpenEnaInferenceCoordinatorAuthorityV2<T extends object>(value: T): T {
  if (!Object.isFrozen(value)) {
    throw new Error("Inference coordinator authority must be frozen before registration.");
  }
  coordinatorInferenceAuthorities.add(value);
  return value;
}

export function assertOpenEnaInferenceCoordinatorAuthorityV2(
  value: unknown,
): asserts value is object {
  if (value === null
    || typeof value !== "object"
    || !coordinatorInferenceAuthorities.has(value)) {
    throw new Error("Inference consumer authority mismatch.");
  }
}
