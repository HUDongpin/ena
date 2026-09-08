type GlContext = Pick<WebGLRenderingContext, "isContextLost" | "getExtension">;
export interface OpenEnaOwnedGlSceneV3 {
  canvas: { remove(): void };
  gl: GlContext;
  _stopped?: boolean;
}

/** Owns one interactive root, never Plotly's shared static export context.
 * Pinned Plotly 3.7.0 setViewport stops old glplots without retiring their GL
 * caches/canvases. Serialize this root's operations so every replacement is
 * captured before the next operation can replace it, including across awaits.
 */
export function createOpenEnaPlotlyResourceOwnerV3(current: () => OpenEnaOwnedGlSceneV3 | null) {
  const owned = new Set<OpenEnaOwnedGlSceneV3>();
  let tail = Promise.resolve();
  let closing = false;
  let closePromise: Promise<void> | null = null;
  const capture = () => { const scene = current(); if (scene) owned.add(scene); return scene; };
  const retire = (all = false) => {
    const active = capture();
    const failures: unknown[] = [];
    for (const scene of owned) {
      if (!all && scene === active) continue;
      try {
        if (!scene._stopped) throw new Error("Plotly has not stopped a retired scene.");
        if (!scene.gl.isContextLost()) {
          const extension = scene.gl.getExtension("WEBGL_lose_context");
          if (!extension) throw new Error("GL context retirement is unavailable.");
          extension.loseContext();
        }
        // DOM removal is not the resource-release mechanism. It follows the
        // stopped-scene ownership check and explicit native context retirement.
        scene.canvas.remove();
        owned.delete(scene);
      } catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Plot context retirement failed.");
  };
  return {
    run<T>(operation: () => Promise<T> | T): Promise<T> {
      if (closing) return Promise.reject(new Error("Plot root is closed."));
      const result = tail.then(async () => {
        capture();
        let value!: T, failure: unknown, failed = false;
        try { value = await operation(); }
        catch (error) { failure = error; failed = true; }
        try { retire(); }
        catch (cleanupError) {
          if (failed) throw new AggregateError([failure, cleanupError], "Plot operation and retirement failed.", { cause: failure });
          throw cleanupError;
        }
        if (failed) throw failure;
        return value;
      });
      // A failed operation does not strand the queue or swallow its own error.
      tail = result.then(() => {}, () => {});
      return result;
    },
    close(purge: () => void): Promise<void> {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = tail.then(() => {
        capture();
        purge();
        retire(true);
      });
      return closePromise;
    },
  };
}

/** Capture the live view when this queued transaction starts, and pass it into
 * react itself. An obsolete render can then exit without publishing a preset.
 * Only a different actual user-view revision supersedes the selected view.
 */
export function runOpenEnaPlotlyViewTransactionV3<T>(owner: ReturnType<typeof createOpenEnaPlotlyResourceOwnerV3>, options: {
  active(): boolean;
  revision(): number;
  prepare(): T;
  render(view: T): Promise<unknown>;
  currentUserView(view: T): T;
  apply(view: T): Promise<unknown>;
}): Promise<T | null> {
  return owner.run(async () => {
    if (!options.active()) return null;
    const before = options.revision();
    let view = options.prepare();
    await options.render(view);
    if (!options.active()) return null;
    if (options.revision() !== before) view = options.currentUserView(view);
    const applying = options.revision();
    await options.apply(view);
    if (!options.active()) return null;
    return options.revision() === applying ? view : options.currentUserView(view);
  });
}
