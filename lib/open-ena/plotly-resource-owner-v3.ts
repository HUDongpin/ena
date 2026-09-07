type GlContext = Pick<WebGLRenderingContext, "isContextLost" | "getExtension">;
export interface OpenEnaOwnedGlSceneV3 {
  canvas: { remove(): void };
  gl: GlContext;
  _stopped?: boolean;
}

/** One interactive application root only. Never claims Plotly's shared static
 * export context. Pinned Plotly 3.7.0 setViewport stops the previous glplot but
 * leaves its canvas and GL caches alive; purge also stops rather than loses GL.
 * Ownership is captured from this root's actual scene, not all document canvases.
 */
export function createOpenEnaPlotlyResourceOwnerV3(current: () => OpenEnaOwnedGlSceneV3 | null) {
  const owned = new Set<OpenEnaOwnedGlSceneV3>();
  let pending = 0, closing = false;
  let cleanup: (() => void) | null = null;
  let resolveClose: (() => void) | null = null;
  let closePromise: Promise<void> | null = null;
  const capture = () => { const scene = current(); if (scene) owned.add(scene); return scene; };
  const settle = () => {
    if (pending) return;
    const active = capture();
    if (closing && cleanup) { cleanup(); cleanup = null; }
    for (const scene of owned) {
      // The vendor's stopped flag establishes that render/listener disposal has
      // finished. A pending operation may still use the old scene, so this only
      // runs after ALL operations (including toImage) have settled.
      if ((!closing && scene === active) || !scene._stopped) continue;
      if (!scene.gl.isContextLost()) scene.gl.getExtension("WEBGL_lose_context")?.loseContext();
      scene.canvas.remove();
      owned.delete(scene);
    }
    if (closing) resolveClose?.();
  };
  return {
    async run<T>(operation: () => Promise<T> | T): Promise<T> {
      if (closing) throw new Error("Plot root is closed.");
      capture(); pending++;
      try { return await operation(); }
      finally { capture(); pending--; settle(); }
    },
    close(purge: () => void): Promise<void> {
      if (closePromise) return closePromise;
      closing = true; cleanup = purge;
      closePromise = new Promise<void>(resolve => { resolveClose = resolve; });
      settle();
      return closePromise;
    },
  };
}
