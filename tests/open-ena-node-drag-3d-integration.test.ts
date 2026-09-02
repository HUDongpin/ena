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
  assert.match(interactive, /compileOpenEna3dPlotSpec\([\s\S]*nodeLayout/);
  assert.match(triptych, /nodeLayout\?: OpenEnaNodeLayoutPositions/);
  assert.match(triptych, /onNodeMove\?: \(code: string, dimensions: OpenEnaNodeDimensionPosition\) => void/);
  assert.match(triptych, /const sharedPlotProps = \{[\s\S]*nodeLayout,[\s\S]*onNodeMove,/);
});

test("ONA 3D is a reachable overall, Primary, and Secondary workspace", () => {
  const layoutPath = join(projectRoot, "components/open-ena/OpenEna3DOrderedResultLayout.tsx");
  assert.ok(existsSync(layoutPath), "ONA 3D result layout must exist");
  const layout = readFileSync(layoutPath, "utf8");
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");

  assert.equal((layout.match(/<OpenEnaInteractive3DPlot/g) ?? []).length, 3);
  assert.match(layout, /analysisKind="ona"/);
  assert.match(layout, /orderedScope=\{\{ kind: "overall" \}\}/);
  assert.match(layout, /orderedScope=\{\{ kind: "group", name: primaryGroup\.name \}\}/);
  assert.match(layout, /orderedScope=\{\{ kind: "group", name: secondaryGroup\.name \}\}/);
  assert.match(layout, /nodeLayout/);
  assert.match(layout, /onNodeMove/);
  assert.match(workspace, /import OpenEna3DOrderedResultLayout/);
  assert.match(workspace, /completedResultKind === "ona"[\s\S]*view === "3d"[\s\S]*<OpenEna3DOrderedResultLayout/);
  assert.match(workspace, /<OpenEna3DOrderedResultLayout[\s\S]*nodeLayout=\{activeNodeLayout\.positions\}[\s\S]*onNodeMove=\{moveNode\}/);
  assert.match(workspace, /data-ena-plot-action="reset-node-layout"[\s\S]*onClick=\{resetNodeLayout\}/);
  assert.match(workspace, /const threeDViewLabel = completedResultKind === "ona"[\s\S]*?copy\.ona\.workspace\.threeD[\s\S]*?: copy\.views\.threeD/);
  assert.match(workspace, /<strong>\{threeDViewLabel\}<\/strong>/);
});
