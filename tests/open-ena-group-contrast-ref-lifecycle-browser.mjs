import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const projectRoot = process.cwd();
const outputDir = process.env.TASK32_OUTPUT_DIR ?? "/tmp/open-ena-task32-q3-ref-lifecycle";
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
const { chromium } = require("playwright");
const testSource = await readFile(`${projectRoot}/tests/open-ena-group-contrast-plot.test.ts`, "utf8");
const fixture = testSource.slice(testSource.indexOf("const contrast ="), testSource.indexOf("async function render("));
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import GroupContrast from './components/open-ena/OpenEnaGroupContrast';
${fixture}
window.refProbe = {
  cleanupA: { attached: 0, cleaned: 0, nulls: 0 },
  cleanupB: { attached: 0, cleaned: 0, nulls: 0 },
  voidA: { attached: 0, nulls: 0 },
  voidB: { attached: 0, nulls: 0 },
};
const cleanupA = (node) => { if (node) { window.refProbe.cleanupA.attached++; return () => window.refProbe.cleanupA.cleaned++; } window.refProbe.cleanupA.nulls++; };
const cleanupB = (node) => { if (node) { window.refProbe.cleanupB.attached++; return () => window.refProbe.cleanupB.cleaned++; } window.refProbe.cleanupB.nulls++; };
const voidA = (node) => { node ? window.refProbe.voidA.attached++ : window.refProbe.voidA.nulls++; };
const voidB = (node) => { node ? window.refProbe.voidB.attached++ : window.refProbe.voidB.nulls++; };
const objectA = React.createRef();
const objectB = React.createRef();
const refs = { cleanupA, cleanupB, voidA, voidB, objectA, objectB };
const root = createRoot(document.getElementById('root'));
window.renderRefMode = (mode) => root.render(<GroupContrast {...defaultProps} svgRef={refs[mode]} />);
window.objectRefState = () => ({ a: objectA.current instanceof SVGSVGElement, b: objectB.current instanceof SVGSVGElement });
window.unmountRefProbe = () => root.unmount();
window.renderRefMode('cleanupA');`;
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: projectRoot }, bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = { errors: [] };
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => observations.errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => {
    const NativeResizeObserver = window.ResizeObserver;
    window.lifecycleProbe = { observersCreated: 0, observerDisconnects: 0, observedNodes: 0, resizeListeners: new Set() };
    window.ResizeObserver = class InstrumentedResizeObserver {
      constructor(callback) { this.inner = new NativeResizeObserver(callback); window.lifecycleProbe.observersCreated++; }
      observe(node, options) { window.lifecycleProbe.observedNodes++; return this.inner.observe(node, options); }
      unobserve(node) { return this.inner.unobserve(node); }
      disconnect() { window.lifecycleProbe.observerDisconnects++; return this.inner.disconnect(); }
    };
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = (type, listener, options) => {
      if (type === "resize") window.lifecycleProbe.resizeListeners.add(listener);
      return add(type, listener, options);
    };
    window.removeEventListener = (type, listener, options) => {
      if (type === "resize") window.lifecycleProbe.resizeListeners.delete(listener);
      return remove(type, listener, options);
    };
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.refProbe.cleanupA.attached === 1);
  assert.equal(await page.evaluate(() => window.lifecycleProbe.observersCreated), 1);
  assert.equal(await page.evaluate(() => window.lifecycleProbe.resizeListeners.size), 1);

  await page.evaluate(() => window.renderRefMode("cleanupB"));
  await page.waitForFunction(() => window.refProbe.cleanupA.cleaned === 1 && window.refProbe.cleanupB.attached === 1);
  assert.equal(await page.evaluate(() => window.refProbe.cleanupA.nulls), 0, "cleanup-returning ref replacement uses its cleanup instead of a null call");

  await page.evaluate(() => window.renderRefMode("voidA"));
  await page.waitForFunction(() => window.refProbe.cleanupB.cleaned === 1 && window.refProbe.voidA.attached === 1);
  assert.equal(await page.evaluate(() => window.refProbe.cleanupB.nulls), 0);

  await page.evaluate(() => window.renderRefMode("voidB"));
  await page.waitForFunction(() => window.refProbe.voidA.nulls === 1 && window.refProbe.voidB.attached === 1);

  await page.evaluate(() => window.renderRefMode("objectA"));
  await page.waitForFunction(() => window.refProbe.voidB.nulls === 1 && window.objectRefState().a);
  await page.evaluate(() => window.renderRefMode("objectB"));
  await page.waitForFunction(() => !window.objectRefState().a && window.objectRefState().b);

  await page.evaluate(() => window.renderRefMode("cleanupA"));
  await page.waitForFunction(() => !window.objectRefState().b && window.refProbe.cleanupA.attached === 2);
  await page.evaluate(() => window.unmountRefProbe());
  await page.waitForFunction(() => window.refProbe.cleanupA.cleaned === 2);

  observations.refs = await page.evaluate(() => structuredClone(window.refProbe));
  observations.objectsAfterUnmount = await page.evaluate(() => window.objectRefState());
  observations.lifecycle = await page.evaluate(() => ({
    observersCreated: window.lifecycleProbe.observersCreated,
    observerDisconnects: window.lifecycleProbe.observerDisconnects,
    observedNodes: window.lifecycleProbe.observedNodes,
    resizeListenerCount: window.lifecycleProbe.resizeListeners.size,
  }));
  assert.deepEqual(observations.refs.cleanupA, { attached: 2, cleaned: 2, nulls: 0 });
  assert.deepEqual(observations.refs.cleanupB, { attached: 1, cleaned: 1, nulls: 0 });
  assert.deepEqual(observations.refs.voidA, { attached: 1, nulls: 1 });
  assert.deepEqual(observations.refs.voidB, { attached: 1, nulls: 1 });
  assert.deepEqual(observations.objectsAfterUnmount, { a: false, b: false });
  assert.deepEqual(observations.lifecycle, { observersCreated: 1, observerDisconnects: 1, observedNodes: 1, resizeListenerCount: 0 });
  assert.deepEqual(observations.errors, []);
  await writeFile(`${outputDir}/results.json`, `${JSON.stringify(observations, null, 2)}\n`);
  console.log("Task32 Q3 actual GroupContrast ref lifecycle: cleanup callbacks, void callbacks, object refs, replacement, observer and listener teardown PASS.");
} finally {
  await browser.close();
}
