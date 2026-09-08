import { canonicalJsonV3 } from "./model-v3/canonical-json";

export function openEnaPlotViewFieldsV3(update: Record<string, unknown>) {
  const keys = Object.keys(update);
  return {
    camera: keys.some(key => key === "scene.camera" || key.startsWith("scene.camera.")),
    aspect: keys.some(key => key === "scene.aspectmode" || key === "scene.aspectratio" || key.startsWith("scene.aspectratio.")),
  };
}

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
