import assert from "node:assert/strict";
import test from "node:test";
import { performPlotImageExportV3 } from "../lib/open-ena/plot-image-export-v3";

const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
const image = { png, dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
test("declined export never materializes or writes image data", async () => {
  let rendered = 0, written = 0;
  const status = await performPlotImageExportV3({ acquire: () => null, active: () => true, render: async () => { rendered++; return image; }, download: () => { written++; } });
  assert.equal(status, "denied"); assert.equal(rendered, 0); assert.equal(written, 0);
});
test("changed current model while image awaits cannot reach any destination", async () => {
  let current = true, release!: () => void, rendered = false, written = 0;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const promise = performPlotImageExportV3({ acquire: () => () => current, active: () => true, render: async () => { rendered = true; await barrier; return image; }, writePng: async () => { written++; }, download: () => { written++; } });
  assert.equal(rendered, true); current = false; release();
  assert.equal(await promise, "obsolete"); assert.equal(written, 0);
});
test("a present clipboard rejection is an error and never triggers a download fallback", async () => {
  let downloaded = 0;
  await assert.rejects(performPlotImageExportV3({ acquire: () => () => true, active: () => true, render: async () => image, writePng: async () => { throw new Error("denied by browser"); }, download: () => { downloaded++; } }), /denied by browser/);
  assert.equal(downloaded, 0);
});
test("no clipboard produces the actual generated PNG download; a supported PNG clipboard uses the same Blob", async () => {
  let received: Blob | null = null;
  assert.equal(await performPlotImageExportV3({ acquire: () => () => true, active: () => true, render: async () => image, download: value => { received = value; } }), "downloaded");
  assert.equal(received, png);
  assert.equal(await performPlotImageExportV3({ acquire: () => () => true, active: () => true, render: async () => image, writePng: async value => { received = value; }, download: () => { throw new Error("unexpected fallback"); } }), "copied");
  assert.equal(received, png);
});
test("unmounted or replaced action suppresses stale completion after a destination promise", async () => {
  let active = true, release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const promise = performPlotImageExportV3({ acquire: () => () => true, active: () => active, render: async () => image, writePng: async () => { await barrier; }, download: () => {} });
  await Promise.resolve(); active = false; release(); assert.equal(await promise, "obsolete");
});
