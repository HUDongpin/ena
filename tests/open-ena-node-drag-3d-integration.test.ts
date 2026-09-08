import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

test("interactive Plotly presenter distinguishes code-node drag from camera orbit", () => {
  const interactive = source("components/open-ena/OpenEnaInteractive3DPlot.tsx");
  const loader = source("components/open-ena/plotly-gl3d-loader.ts");

  assert.match(interactive, /plotly_hover/);
  assert.match(interactive, /plotly_unhover/);
  assert.match(interactive, /meta\.role === "code-node"/);
  assert.match(interactive, /dragOpenEnaNodeIn3d/);
  assert.match(interactive, /onPointerDownCapture=\{beginNodeDrag\}/);
  assert.match(interactive, /onPointerMoveCapture=\{moveDraggedNode\}/);
  assert.match(interactive, /onPointerUpCapture=\{finishNodeDrag\}/);
  assert.match(interactive, /onPointerCancelCapture=\{cancelNodeDrag\}/);
  assert.match(interactive, /setPointerCapture\(event\.pointerId\)/);
  assert.match(interactive, /requestAnimationFrame\(flushNodeMove\)/);
  assert.match(interactive, /new Map\(\[\[xDimension, next\.x\], \[yDimension, next\.y\], \[zDimension, next\.z\]\]\)/);
  assert.match(interactive, /data-ena-node-dragging=\{nodeDragging\}/);
  assert.match(loader, /plotly_hover/);
  assert.match(loader, /plotly_unhover/);
});

test("one 3D layout and movement callback flow through standard and ordered compilers", () => {
  const interactive = source("components/open-ena/OpenEnaInteractive3DPlot.tsx");
  const triptych = source("components/open-ena/OpenEna3DGroupContrast.tsx");

  assert.match(interactive, /analysisKind\?: "ena" \| "ona"/);
  assert.match(interactive, /nodeLayout\?: OpenEnaNodeLayoutPositions/);
  assert.match(interactive, /onNodeMove\?: \(code: string, dimensions: OpenEnaNodeDimensionPosition\) => void/);
  assert.match(interactive, /analysisKind === "ona"[\s\S]*compileOpenEnaOrdered3dPlotSpec/);
  assert.match(interactive, /compileOpenEnaTrusted3dPlugin\([\s\S]*pluginInput[\s\S]*nodeLayout/);
  assert.match(triptych, /nodeLayout\?: OpenEnaNodeLayoutPositions/);
  assert.match(triptych, /onNodeMove\?: \(code: string, dimensions: OpenEnaNodeDimensionPosition\) => void/);
  assert.match(triptych, /const sharedPlotProps = \{[\s\S]*nodeLayout,[\s\S]*onNodeMove,/);
});

test("native ONA 3D receives result-bound node positions and the shared presentation map", () => {

  assert.match(v3, /<OpenEna3DOrderedResultLayout \{\.\.\.plotProps\}/);
  assert.match(v3, /nodeLayout, onNodeMove: moveNode/);
  assert.match(v3, /codeSourceByRenderedCode/);
  assert.match(moduleV3("components/open-ena/OpenEna3DOrderedResultLayout.tsx"), /onNodeMove/);

});
