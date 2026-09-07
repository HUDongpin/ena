import { canonicalJsonV3 } from "./model-v3/canonical-json";

/** Exact echoes of owned display relayouts are not new user camera inputs.
 * Overlapping async operations own separate tokens; a different user update
 * remains observable even while rendering is in flight. */
export function createOpenEnaPlotViewSyncV3() {
  const pending = new Map<object, string>();
  return {
    owns(update: unknown): boolean {
      let key: string;
      try { key = canonicalJsonV3(update); } catch { return false; }
      return [...pending.values()].includes(key);
    },
    async apply<T extends Record<string, unknown>, R>(update: T, operation: (captured: T) => R | Promise<R>): Promise<R> {
      const captured = structuredClone(update), token = {};
      pending.set(token, canonicalJsonV3(captured));
      try { return await operation(captured); }
      finally { pending.delete(token); }
    },
  };
}
