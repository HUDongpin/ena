import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaSvgDraggableNode from "../components/open-ena/OpenEnaSvgDraggableNode";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

test("shared SVG drag target contains only code text at its independent position", () => {
  const markup = renderToStaticMarkup(createElement(
    "svg",
    { viewBox: "0 0 100 100" },
    createElement(OpenEnaSvgDraggableNode, {
      code: "Evidence",
      position: new Map([["SVD1", 1], ["SVD2", 2]]),
      offset: { x: 30, y: -10 },
      toDimensions: () => new Map([["SVD1", 1], ["SVD2", 2]]),
      onNodeMove: () => {},
      children: createElement("text", { "data-ena-label": "true" }, "Evidence"),
    }),
  ));

  assert.match(markup, /<g[^>]*data-ena-node-draggable="true"[^>]*data-ena-node-dragging="false"/);
  assert.doesNotMatch(markup, /<circle/);
  assert.match(markup, /data-ena-label-position="Evidence"/);
  assert.match(markup, /transform="translate\(30 -10\)"/);
  assert.match(markup, /<text[^>]*>Evidence<\/text>/);

});

test("shared SVG drag source captures one pointer, coalesces frames, and cleans every exit", () => {
  const component = source("components/open-ena/OpenEnaSvgDraggableNode.tsx");

  assert.match(component, /event\.button !== 0/);
  assert.match(component, /setPointerCapture\(event\.pointerId\)/);
  assert.match(component, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(component, /requestAnimationFrame\(flushPendingMove\)/);
  assert.match(component, /cancelAnimationFrame\(frameRef\.current\)/);
  assert.match(component, /onPointerMove=\{handlePointerMove\}/);
  assert.match(component, /onPointerUp=\{finishPointerDrag\}/);
  assert.match(component, /onPointerCancel=\{cancelPointerDrag\}/);
  assert.match(component, /onLostPointerCapture=\{cancelPointerDrag\}/);
  assert.match(component, /useEffect\(\(\) => \(\) => \{/);
});

test("SVG code text provides grab feedback without a node hit target", () => {
  const styles = source("app/globals.css");

  assert.match(styles, /\.ena-svg-draggable-node\s*\{[^}]*cursor:\s*grab/);
  assert.match(styles, /\.ena-svg-draggable-node\[data-ena-node-dragging="true"\]\s*\{[^}]*cursor:\s*grabbing/);
  assert.match(styles, /\.ena-svg-draggable-node text\s*\{[^}]*pointer-events:\s*bounding-box[^}]*user-select:\s*none[^}]*touch-action:\s*none/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*?\.ena-svg-draggable-node/);
});
