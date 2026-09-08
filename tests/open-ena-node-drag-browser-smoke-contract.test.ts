import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const smokePath = join(projectRoot, "tests", "open-ena-node-drag-browser-smoke.mjs");
const runtimeSource = readFileSync(join(process.cwd(), "tests/helpers/open-ena-served-browser-v3.mjs"), "utf8");
const fixtureSource = readFileSync(join(process.cwd(), "tests/helpers/open-ena-native-browser-fixture-v3.mjs"), "utf8");

test("the node-drag smoke owns a served browser lifecycle and four render families", () => {
  assert.equal(existsSync(smokePath), true, "the node-drag browser smoke is missing");
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /OPEN_ENA_NODE_DRAG_SMOKE_ARTIFACT_DIR/u);
  assert.match(source, /entryUrl: `\$\{baseUrl\}\/en\/open-ena`/u);
  assert.match(runtimeSource, /NEXT_DIST_DIR/u);
  assert.match(source, /\.next-node-drag-smoke-/u);
  assert.match(runtimeSource, /OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS/u);
  assert.match(source, /stopOwnedServer/u);
  assert.match(source, /removeOwnedDistDirectory/u);
  assert.match(source, /summary\.json/u);
  for (const family of ["standard-2d", "standard-3d", "ona-2d", "ona-3d"]) {
    assert.ok(source.includes(family), `the smoke omits ${family}`);
  }
});

test("the smoke route is development-only and opt-in", () => {
  const routePath = join(projectRoot, "app", "open-ena-node-drag-smoke", "page.tsx");
  assert.equal(existsSync(routePath), true, "the isolated node-drag smoke route is missing");
  const route = readFileSync(routePath, "utf8");

  assert.match(route, /process\.env\.NODE_ENV !== "development"/u);
  assert.match(route, /process\.env\.OPEN_ENA_NODE_DRAG_SMOKE_ROUTE !== "1"/u);
  assert.match(route, /notFound\(\)/u);
  assert.match(route, /<OpenEnaWorkspace locale="en"/u);
});

test("the smoke performs real pointer drags and audits moved node geometry", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /page\.mouse\.move/u);
  assert.match(source, /page\.mouse\.down/u);
  assert.match(source, /page\.mouse\.up/u);
  assert.match(source, /data-ena-drag-code/u);
  assert.match(source, /data-ena-edge/u);
  assert.match(source, /data-ona-edge-glyph/u);
  assert.match(source, /meta\?\.role === "code-node"/u);
  assert.match(source, /node did not move/u);
  assert.match(source, /incident edge did not follow node/u);
  assert.match(source, /triptych/u);
});

test("camera, reset, export, and analytical boundaries are acceptance gates", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /empty-space camera orbit/u);
  assert.match(source, /data-ena-plot-action="recenter"/u);
  assert.match(source, /Reset node layout/u);
  assert.match(source, /data-ena-plot-action="copy-image"/u);
  assert.match(source, /canonicalResult/u);
  assert.match(source, /drag mutated analytical result/u);
  assert.match(source, /analysisRunCount/u);
  assert.match(source, /visualCopy/u);
  assert.match(fixtureSource, /Ordered Network Analysis/u);
  assert.match(source, /prepareNativeFixtureV3\(page, \{ family: "ona"/u);
  assert.match(source, /\^3D \(\?:ENA\|ONA\)/u);
  assert.match(source, /maxRetries:\s*5/u);
  assert.match(source, /retryDelay:\s*100/u);
});

test("package exposes the dedicated node-drag browser command", () => {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts?.["test:browser:open-ena-node-drag"],
    "node tests/open-ena-node-drag-browser-smoke.mjs",
  );
});


test("both 3D families require actual projected mouse hover and direct pointer drag", () => {
  const source = readFileSync(smokePath, "utf8");
  for (const marker of ["params.projection", "params.view", "params.model", "page.mouse.move(projected.x", "actualHoverHits.length === 2", "real pointer did not hit the projected native Code", "syntheticHoverInjection: false"]) assert.ok(source.includes(marker), marker);
});


test("node stages write immediate bounded evidence and never inject hover into the user path", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /checkpoints.json/);
  assert.match(source, /runtime.stage\(label, action, 30000\)/);
  assert.doesNotMatch(source, /\.emit\("plotly_hover"/);
});
