import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const smokePath = join(projectRoot, "tests", "open-ena-ona-3d-browser-smoke.mjs");

test("the ONA 3D browser smoke owns a synthetic production lane and privacy-bounded Yu lane", () => {
  assert.equal(existsSync(smokePath), true, "the dedicated ONA 3D browser smoke is missing");
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /OPEN_ENA_ONA_3D_SMOKE_ARTIFACT_DIR/u);
  assert.match(source, /OPEN_ENA_ONA_3D_SMOKE_BROWSER/u);
  assert.match(source, /OPEN_ENA_ONA_3D_PRIVATE_WORKBOOK/u);
  assert.match(source, /NEXT_DIST_DIR/u);
  assert.match(source, /\.next-ona-3d-smoke-/u);
  assert.match(source, /execFileSync\(\s*"npm",\s*\["run",\s*"build"\]/u);
  assert.match(source, /\["run",\s*"start",\s*"--",\s*"--hostname"/u);
  assert.doesNotMatch(source, /\["run",\s*"dev"/u);
  assert.match(source, /stopOwnedServer/u);
  assert.match(source, /removeOwnedDistDirectory/u);
  assert.match(source, /sourceEvidenceBefore/u);
  assert.match(source, /sourceEvidenceAfter/u);
  assert.match(source, /NPM_CONFIG_CACHE/u);
  assert.match(source, /key\.toLowerCase\(\) !== "npm_config_cache"/u);
  assert.match(source, /npm_config_cache:\s*taskNpmCache/u);
  assert.match(source, /join\(playwrightCwd, "npm-cache"\)/u);
  assert.doesNotMatch(source, /rmSync\([^\n]*\/Users\/dongpinhu\/\.npm/u);
  assert.match(source, /Google Chrome\.app/u);
  assert.match(source, /initdb/u);
  assert.match(source, /pg_ctl/u);
  assert.match(source, /002_open_ena_auth_security\.sql/u);
  assert.match(source, /OPEN_ENA_ACCOUNT_ID/u);
  assert.match(source, /OPEN_ENA_AUTH_DATABASE_URL/u);
  assert.match(source, /stopEphemeralPostgres/u);
  assert.match(source, /open-ena-ona-3d-postgres-/u);
});

test("the synthetic lane exercises directed ONA science, circular points, three scenes, and display-only controls", () => {
  const source = readFileSync(smokePath, "utf8");

  for (const code of ["CODE_A", "CODE_B", "CODE_C", "CODE_D", "CODE_E"]) {
    assert.ok(source.includes(code), `synthetic ONA fixture omits ${code}`);
  }
  assert.match(source, /SYNTHETIC_BASELINE/u);
  assert.match(source, /SYNTHETIC_SCAFFOLDED/u);
  assert.match(source, /rowsPerUnit:\s*3/u);
  assert.match(source, /Ordered Network Analysis \(ONA\)/u);
  assert.match(source, /getByRole\("switch", \{ name: "Network type", exact: true \}\)/u);
  assert.doesNotMatch(source, /getByRole\("radio", \{ name: \/Ordered Network Analysis/u);
  assert.match(source, /Confirmed source-record order/u);
  assert.match(source, /Edit p² directional mask/u);
  assert.match(source, /CODE_E ground\/source to CODE_A response\/target/u);
  assert.match(source, /analysisRunCount/u);
  assert.match(source, /analysisRunCount\s*===\s*1/u);
  assert.match(source, /open-ena-ona-3d-overall-plot/u);
  assert.match(source, /open-ena-ona-3d-primary-plot/u);
  assert.match(source, /open-ena-ona-3d-secondary-plot/u);
  assert.match(source, /ordered-edge-arrowhead/u);
  assert.match(source, /ordered-self-loop-shaft/u);
  assert.match(source, /orderedEdgeIndices/u);
  assert.doesNotMatch(source, /meta\?\.orderedEdges/u);
  assert.match(source, /edgeIndex\s*%\s*codeCount/u);
  assert.match(source, /Math\.floor\(edgeIndex\s*\/\s*codeCount\)/u);
  assert.match(source, /reciprocalLane/u);
  assert.match(source, /marker\.symbol/u);
  assert.match(source, /circle/u);
  const codesTab = source.indexOf('getByRole("tab", { name: "Codes" })');
  const maskButton = source.indexOf('getByRole("button", { name: "Edit p² directional mask" })');
  assert.ok(
    codesTab >= 0 && codesTab < maskButton,
    "the smoke must enter Codes before opening the directional mask",
  );
  assert.match(source, /data-ona-point-shape="circle"/u);
  assert.match(source, /wrapper\.querySelector\("circle"\)/u);
  assert.match(source, /literalContract:\s*wrappers\.filter/u);
  assert.match(source, /data-ena-camera-state/u);
  assert.match(source, /data-ena-aspect-ratio-state/u);
  assert.match(source, /open-ena-3d-axis-z/u);
  const plotToolsButton = source.indexOf('getByRole("button", { name: "Plot Tools", exact: true })');
  const edgeThresholdSlider = source.indexOf('getByRole("slider", { name: "Minimum relative edge" })');
  assert.ok(
    plotToolsButton >= 0 && plotToolsButton < edgeThresholdSlider,
    "the smoke must enter Plot Tools before operating display sliders",
  );
  assert.match(source, /Minimum relative edge/u);
  assert.match(source, /Unit point size/u);
  assert.match(source, /Default 3D Camera/u);
  assert.match(source, /Zoom In/u);
  assert.match(source, /Recenter/u);
  assert.match(source, /data-ena-plot-action="copy-image"/u);
  assert.match(source, /page\.evaluate\(\(\) => location\.origin\)/u);
  assert.doesNotMatch(source, /new URL\(args\.entryUrl\)/u);
  assert.match(source, /data-ena-plot-action="fullscreen"/u);
  assert.match(source, /fullscreen did not exit/u);
  assert.match(source, /document\.activeElement === button/u);
});

test("Data View, responsive, runtime-error, and evidence boundaries are explicit", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /open-ena-data-view-toggle/u);
  assert.match(source, /page\.mouse\.click/u);
  assert.match(source, /\.press\("Enter"\)/u);
  assert.match(source, /sidePanelsPreserved/u);
  assert.match(source, /resultIdentity/u);
  assert.match(source, /aggregateExportSha256/u);
  assert.match(source, /Export aggregate directed edges CSV/u);
  assert.match(source, /__openEnaAggregateExportText/u);
  assert.match(source, /blob\.type\.includes\("csv"\)/u);
  assert.match(source, /getByRole\("button", \{ name: \/Stats\/ \}\)/u);
  assert.match(source, /1440/u);
  assert.match(source, /1024/u);
  assert.match(source, /390/u);
  assert.match(source, /200%/u);
  assert.match(source, /scrollWidth/u);
  assert.match(source, /consoleErrors/u);
  assert.match(source, /pageErrors/u);
  assert.match(source, /unhandledrejection/u);
  assert.match(source, /summary\.json/u);
  assert.match(source, /sha256/u);
  assert.match(source, /failure\.png/u);
});

test("the Yu lane emits aggregate-only evidence without identity screenshots or tooltips", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /Yu_ena_coded_data_0712\.xlsx/u);
  assert.match(source, /data-ena-official-field-path="true"/u);
  assert.match(source, /Add or remove Unit identity fields/u);
  assert.match(source, /Add or remove Horizon identity fields/u);
  assert.match(source, /getByRole\("tab", \{ name: "Units" \}\)/u);
  assert.match(source, /getByLabel\("Comparison group"\)\.selectOption\("Group"\)/u);
  assert.match(source, /getByRole\("tab", \{ name: "Horizons" \}\)/u);
  assert.match(source, /getByRole\("checkbox", \{ name: "Lesson", exact: true \}\)\.uncheck\(\)/u);
  assert.match(source, /getByRole\("tab", \{ name: "Windows" \}\)/u);
  assert.match(
    source,
    /async function runYuPrivateLane[\s\S]{0,5000}Total rows including the current response"\)\.fill\("2"\)/u,
  );
  assert.match(source, /codeNodeCount:\s*7/u);
  assert.match(source, /aggregateOnly:\s*true/u);
  assert.match(source, /sourceRows:\s*174/u);
  assert.match(source, /units:\s*87/u);
  assert.match(source, /coverageValues\[4\] === 49/u);
  assert.match(source, /directedDimensions:\s*coverageValues\[4\]/u);
  assert.match(source, /connectionTotal:\s*rawTotal/u);
  assert.match(source, /selfConnections:\s*rawSelfConnections/u);
  assert.match(source, /zeroNetworks:\s*3/u);
  assert.doesNotMatch(source, /const uniqueEdges = new Map/u);
  assert.match(source, /Yu ONA directed arrows are missing/u);
  assert.match(source, /Yu ONA self-loops are missing/u);
  assert.match(source, /actual total:/u);
  assert.match(source, /actual zero networks:/u);
  assert.doesNotMatch(source, /wrapper\.querySelector\('\[data-ona-point-shape="circle"\]'\)/u);
  assert.doesNotMatch(source, /yu-data-view.*screenshot|screenshot.*yu-data-view/iu);
  assert.doesNotMatch(source, /hover\([^)]*Yu|Yu[^\n]*hover/iu);
});

test("package.json exposes the local ONA 3D browser gate", () => {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.["test:browser:open-ena-ona-3d"],
    "node tests/open-ena-ona-3d-browser-smoke.mjs",
  );
});
