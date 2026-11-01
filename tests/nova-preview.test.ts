import assert from "node:assert/strict";
import test from "node:test";
import { buildNovaPreviewDocument, parseNovaPreviewExport } from "../lib/nova/preview";
import { NOVA_SYNTHETIC_CONTEXT } from "../lib/nova/sdk";
import type { NovaPluginOutput } from "../lib/nova/types";

const nonce = "9bf61cd0-015a-45d3-882e-ea3653ad6830";
function sample(): NovaPluginOutput { return { title: "Group comparison", network: structuredClone(NOVA_SYNTHETIC_CONTEXT.network), table: structuredClone(NOVA_SYNTHETIC_CONTEXT.table), exports: ["svg", "csv", "json"] }; }

test("preview renders only validated data inside a no-network nonce-bound document", () => {
  const output = sample();
  output.title = '</script><script>alert("owned")</script>';
  output.network!.nodes[0].label = '<img src=x onerror=alert(1)>';
  const html = buildNovaPreviewDocument(output, nonce);
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes(`script-src 'nonce-${nonce}'`));
  assert.ok(!html.includes(output.title));
  assert.ok(!html.includes(output.network!.nodes[0].label));
  assert.equal((html.match(/<script\b/gu) ?? []).length, 2);
  assert.ok(html.includes("textContent"));
  assert.ok(html.includes("Synthetic sample"));
  assert.throws(() => buildNovaPreviewDocument(output, '" onload="bad'));
});

test("preview refuses forged scientific weights rather than displaying them", () => {
  const output = sample();
  output.network!.edges[0].weight += 1;
  assert.throws(() => buildNovaPreviewDocument(output, nonce), /invariant/u);
});

test("export bridge checks nonce, permitted extensions, payload bounds and SVG activity", () => {
  const input = { type: "nova:export", nonce, format: "svg", filename: "nova-plugin.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"><text>Evidence</text></svg>' };
  assert.deepEqual(parseNovaPreviewExport(input, nonce), { filename: "nova-plugin.svg", content: input.content, mime: "image/svg+xml" });
  for (const bad of [{...input,nonce:"other"},{...input,filename:"../private.svg"},{...input,filename:"download.html"},{...input,format:"html"},{...input,content:'<svg onload="alert(1)"></svg>'},{...input,content:'<svg><foreignObject>html</foreignObject></svg>'},{...input,content:'<svg><use href="https://example.com" /></svg>'},{...input,content:"x".repeat(2_000_001)}]) assert.equal(parseNovaPreviewExport(bad, nonce), null);
  assert.equal(parseNovaPreviewExport({ ...input, format: "json", filename: "nova-plugin.json", content: "not-json" }, nonce), null);
});
