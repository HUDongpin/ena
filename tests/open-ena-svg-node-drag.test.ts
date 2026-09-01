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

test("shared SVG draggable node exposes a stable invisible hit target without changing node size", () => {
  const markup = renderToStaticMarkup(createElement(
    "svg",
    { viewBox: "0 0 100 100" },
    createElement(OpenEnaSvgDraggableNode, {
      code: "Evidence",
      radius: 5,
      toDimensions: () => new Map([["SVD1", 1], ["SVD2", 2]]),
      onNodeMove: () => {},
      children: createElement("circle", { r: 5, "data-ena-visible-node": "true" }),
    }),
  ));

  assert.match(markup, /<g[^>]*data-ena-node-draggable="true"[^>]*data-ena-node-dragging="false"/);
  assert.match(markup, /<circle[^>]*r="12"[^>]*class="ena-node-drag-hit-target"[^>]*aria-hidden="true"/);
  assert.match(markup, /<circle[^>]*r="5"[^>]*data-ena-visible-node="true"/);
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

test("SVG drag CSS provides grab feedback and a non-visible pointer target", () => {
  const styles = source("app/globals.css");

  assert.match(styles, /\.ena-svg-draggable-node\s*\{[^}]*cursor:\s*grab/);
  assert.match(styles, /\.ena-svg-draggable-node\[data-ena-node-dragging="true"\]\s*\{[^}]*cursor:\s*grabbing/);
  assert.match(styles, /\.ena-node-drag-hit-target\s*\{[^}]*fill:\s*transparent[^}]*stroke:\s*transparent[^}]*pointer-events:\s*all[^}]*touch-action:\s*none/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*?\.ena-svg-draggable-node/);
});
