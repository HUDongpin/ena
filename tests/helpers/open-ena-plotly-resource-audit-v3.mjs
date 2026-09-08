import assert from "node:assert/strict";

// Passive observation only: native calls and return values are unchanged. No
// context-loss extension, render mutation, identity, or private text is exposed.
export function installPlotlyResourceAuditV3() {
  const contexts = [], known = new WeakMap();
  let imagePending = false;
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const kind of ["Buffer", "Texture", "Program", "Shader", "Framebuffer", "Renderbuffer"]) {
      const create = prototype["create" + kind];
      prototype["create" + kind] = function (...args) {
        const object = Reflect.apply(create, this, args), entry = known.get(this);
        if (object && entry) (entry.objects[kind] ??= []).push(new WeakRef(object));
        return object;
      };
    }
  }
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = Reflect.apply(getContext, this, args);
    if (gl && ["webgl", "webgl2", "experimental-webgl"].includes(args[0]) && !known.has(gl)) {
      const entry = { id: contexts.length + 1, canvas: new WeakRef(this), gl: new WeakRef(gl), imageContext: imagePending && !this.isConnected, objects: {}, losses: 0, currentLosses: 0 };
      known.set(gl, entry); contexts.push(entry);
      this.addEventListener("webglcontextlost", () => {
        entry.losses++;
        if (this.closest('[data-ena-plotly-root="true"]')?._fullLayout?.scene?._scene?.glplot?.canvas === this) entry.currentLosses++;
      });
    }
    return gl;
  };
  window.__openEnaGlResourceAudit = {
    image(active) { imagePending = active; },
    snapshot() {
      const rows = contexts.map(entry => {
        const canvas = entry.canvas.deref(), gl = entry.gl.deref();
        const current = !!canvas && canvas.closest('[data-ena-plotly-root="true"]')?._fullLayout?.scene?._scene?.glplot?.canvas === canvas;
        const lost = gl ? gl.isContextLost() : null;
        const liveObjects = Object.fromEntries(Object.entries(entry.objects).map(([kind, refs]) => [kind, gl && !lost ? refs.reduce((n, ref) => { const object = ref.deref(); return n + (object && gl["is" + kind](object) ? 1 : 0); }, 0) : 0]));
        return { id: entry.id, collected: !canvas || !gl, attached: canvas?.isConnected ?? false, current, lost, imageContext: entry.imageContext, losses: entry.losses, currentLosses: entry.currentLosses, liveObjects };
      });
      return { created: rows.length, current: rows.filter(row => row.current).length, attached: rows.filter(row => row.attached).length, retiredAttached: rows.filter(row => !row.current && row.attached && !row.imageContext).length, retiredUnlost: rows.filter(row => !row.current && !row.imageContext && !row.collected && row.lost === false).length, currentLosses: rows.reduce((n, row) => n + row.currentLosses, 0), imageContexts: rows.filter(row => row.imageContext).length, rows };
    },
  };
}

export async function checkPlotlyResourceLifecycleV3(page, record) {
  const audit = [];
  const snapshot = async (phase, extra = {}) => {
    const value = await page.evaluate(() => window.__openEnaGlResourceAudit.snapshot());
    audit.push({ phase, ...value, ...extra }); record(audit);
    return value;
  };
  const ready = async projection => {
    await page.waitForFunction(expected => {
      const roots = [...document.querySelectorAll('[data-ena-plotly-root="true"]')];
      return roots.length === 3 && roots.every(root => root.closest('[data-ena-interactive-camera="true"]')?.getAttribute("aria-busy") === "false" && (!expected || root._fullLayout?.scene?._scene?.getCamera?.().projection.type === expected));
    }, projection, { timeout: 15000 });
  };
  const bounded = (value, count = 3) => {
    assert.equal(value.current, count, "actual current GL scene count");
    assert.equal(value.attached, count, "replaced GL canvases must be detached");
    assert.equal(value.retiredUnlost, 0, "retired app contexts must release their native resources");
    assert.equal(value.currentLosses, 0, "active GL scenes must never be retired");
    assert.ok(value.imageContexts <= 1, "pinned static export context must be reused");
  };
  await page.evaluate(() => {
    const r = window.__openEnaNativeAudit.responses.at(-1).result;
    window.__openEnaResourceScience = JSON.stringify({ binding: r.binding, set: r.set, configuration: r.configuration, provenance: r.executionProvenance });
  });
  await page.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const camera = page.getByRole("group", { name: "Camera Position", exact: true });
  await ready(); await snapshot("before-cycles");
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const projection of ["orthographic", "perspective"]) {
      await camera.getByRole("radio", { name: projection === "orthographic" ? /X-Y plane/ : /Default 3D Camera/ }).check();
      await ready(projection);
      const value = await snapshot(`cycle-${cycle}-${projection}`);
      bounded(value);
    }
  }
  const threshold = page.getByRole("slider", { name: "Edge threshold", exact: true });
  const original = await threshold.inputValue(), previous = audit.at(-1).created;
  for (const value of ["0.2", "0.3", "0.4", original]) {
    await threshold.fill(value); await ready("perspective");
    const row = await snapshot("same-projection-" + value); bounded(row);
    assert.equal(row.created, previous, "same-projection repaints must reuse GL scenes");
  }
  const imageBefore = audit.at(-1).created;
  const sharedBefore = audit.at(-1).rows.find(row => row.imageContext).liveObjects;
  let sameImageHash = null;
  for (const [role, reject] of [["overall", false], ["overall", true], ["overall", false], ["primary", false], ["secondary", false], ["overall", false]]) {
    const panel = page.getByTestId("open-ena-ona-3d-" + role + "-plot");
    const expectedImage = await panel.locator('[data-ena-plotly-root="true"]').evaluate(root => ({ width: Math.round(root.clientWidth) * Math.min(3, Math.max(2, devicePixelRatio || 1)), height: Math.round(root.clientHeight) * Math.min(3, Math.max(2, devicePixelRatio || 1)) }));
    await page.evaluate(reject => {
      window.__openEnaGlResourceAudit.image(true);
      window.__openEnaGlPngResult = null;
      window.__openEnaGlOriginalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async items => {
        const blob = await items[0].getType("image/png"), bytes = new Uint8Array(await blob.arrayBuffer());
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const view = new DataView(bytes.buffer);
        window.__openEnaGlPngResult = { bytes: bytes.length, valid: [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b), width: view.getUint32(16), height: view.getUint32(20), sha256: [...digest].map(n => n.toString(16).padStart(2,"0")).join("") };
        if (reject) throw new Error("synthetic clipboard rejection");
      } } });
    }, reject);
    let imageAudit = null;
    const approve = dialog => dialog.accept(); page.once("dialog", approve);
    try {
      await panel.locator('button[data-ena-plot-action="copy-image"]').click();
      await page.waitForFunction(() => window.__openEnaGlPngResult !== null);
      await panel.locator('button[data-ena-plot-action="copy-image"]:enabled').waitFor();
      const png = await page.evaluate(() => window.__openEnaGlPngResult);
      imageAudit = png;
      assert.equal(png.valid, true); assert.ok(png.bytes > 1000);
      assert.equal(png.width, expectedImage.width); assert.equal(png.height, expectedImage.height);
      if (role === "overall") { if (sameImageHash) assert.equal(png.sha256, sameImageHash, "same view PNG must retain exact content across rejection and cross-root use"); else sameImageHash = png.sha256; }
    } finally {
      page.off("dialog", approve);
      await page.evaluate(() => {
        window.__openEnaGlResourceAudit.image(false);
        const descriptor = window.__openEnaGlOriginalClipboard;
        if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor); else delete navigator.clipboard;
      });
    }
    const row = await snapshot(role + (reject ? "-png-rejected" : "-png-success"), { png: imageAudit }); bounded(row);
    assert.equal(row.created, imageBefore, "PNG success/rejection must reuse the warmed static context");
    const shared = row.rows.find(context => context.imageContext);
    assert.equal(shared.lost, false, "shared static export context must remain reusable");
    for (const [kind, count] of Object.entries(shared.liveObjects)) assert.ok(count <= (sharedBefore[kind] ?? 0), "same PNG must not accumulate live " + kind);
  }
  await page.locator(".ena-visual-toolbar").getByRole("button", { name: /2D ONA/ }).click();
  await page.getByTestId("open-ena-ordered-result-layout").waitFor();
  bounded(await snapshot("unmounted"), 0);
  await page.locator(".ena-visual-toolbar").getByRole("button", { name: /3D ONA/ }).click(); await ready();
  bounded(await snapshot("remounted"));
  assert.equal(await page.evaluate(() => {
    const r = window.__openEnaNativeAudit.responses.at(-1).result;
    return window.__openEnaNativeAudit.requests.length === 1 && document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current" && window.__openEnaResourceScience === JSON.stringify({ binding: r.binding, set: r.set, configuration: r.configuration, provenance: r.executionProvenance });
  }), true, "resource actions must preserve current native science and Worker count");
  return { status: "PASS", snapshots: audit.length, currentLosses: 0, sciencePreserved: true };
}
