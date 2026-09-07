import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const smokePath = join(projectRoot, "tests", "open-ena-ona-3d-browser-smoke.mjs");
const runtimeSource = readFileSync(join(process.cwd(), "tests/helpers/open-ena-served-browser-v3.mjs"), "utf8");
const fixtureSource = readFileSync(join(process.cwd(), "tests/helpers/open-ena-native-browser-fixture-v3.mjs"), "utf8");

test("the ONA 3D browser smoke owns a synthetic production lane and privacy-bounded Yu lane", () => {
  assert.equal(existsSync(smokePath), true, "the dedicated ONA 3D browser smoke is missing");
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /OPEN_ENA_ONA_3D_SMOKE_ARTIFACT_DIR/u);
  assert.match(source, /OPEN_ENA_ONA_3D_SMOKE_BROWSER/u);
  assert.match(source, /OPEN_ENA_ONA_3D_PRIVATE_WORKBOOK/u);
  assert.match(runtimeSource, /NEXT_DIST_DIR/u);
  assert.match(source, /\.next-ona-3d-smoke-/u);
  assert.match(runtimeSource, /"npm", \["run", "build"\]/u);
  assert.match(runtimeSource, /"start", "--hostname"/u);
  assert.doesNotMatch(source, /\["run",\s*"dev"/u);
  assert.match(source, /stopOwnedServer/u);
  assert.match(source, /removeOwnedDistDirectory/u);
  assert.match(source, /sourceEvidenceBefore/u);
  assert.match(source, /sourceEvidenceAfter/u);
  assert.match(runtimeSource, /npm_config_cache/u);
  assert.match(runtimeSource, /npm_config_cache: join\(directory, "npm-cache"\)/u);
  assert.match(runtimeSource, /npm_config_cache: join\(directory, "npm-cache"\)/u);
  assert.match(runtimeSource, /directory/u);
  assert.doesNotMatch(source, /rmSync\([^\n]*\/Users\/dongpinhu\/\.npm/u);
  assert.match(runtimeSource, /metadata.revision, "1234"/u);
  assert.match(source, /initdb/u);
  assert.match(source, /pg_ctl/u);
  assert.match(source, /002_open_ena_auth_security\.sql/u);
  assert.match(runtimeSource, /OPEN_ENA_ACCOUNT_ID/u);
  assert.match(runtimeSource, /OPEN_ENA_AUTH_DATABASE_URL/u);
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
  assert.match(fixtureSource, /getByRole\("radio"/u);
  assert.match(source, /prepareNativeFixtureV3\(page, \{ family: "ona"/u);
  assert.match(fixtureSource, /Review source-order statement/u);
  assert.match(source, /const maskCell/u);
  assert.match(source, /CODE_E → CODE_A/u);
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
  const synthetic = source.slice(source.indexOf("async function runSyntheticLane"), source.indexOf("async function runYuPrivateLane"));
  assert.ok(synthetic.indexOf('name: /^Codes(,|$)/') < synthetic.indexOf('const maskCell ='));
  assert.match(source, /data-ona-point-shape="circle"/u);
  assert.match(source, /wrapper\.querySelector\("circle"\)/u);
  assert.match(source, /literalContract:\s*wrappers\.filter/u);
  assert.match(source, /data-ena-camera-state/u);
  assert.match(source, /data-ena-aspect-ratio-state/u);
  assert.match(source, /name: `Axis \$\{index \+ 1\}`/u);
  assert.match(source, /actual 3D scene did not adopt the valid axis permutation/u);
  const plotToolsButton = source.indexOf('getByRole("button", { name: "Plot Tools", exact: true })');
  const edgeThresholdSlider = source.indexOf('getByRole("slider", { name: "Edge threshold" })');
  assert.ok(
    plotToolsButton >= 0 && plotToolsButton < edgeThresholdSlider,
    "the smoke must enter Plot Tools before operating display sliders",
  );
  assert.match(source, /Edge threshold/u);
  assert.match(source, /Point scale/u);
  assert.match(source, /Default 3D Camera/u);
  assert.match(source, /Zoom in/iu);
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
  assert.match(source, /Export ONA aggregate edges/u);
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
  for (const marker of ["sourcePreparation: false", 'units: ["Group", "Name"]', 'horizons: ["Group", "Name"]', "backward: 2", 'name: "Field"', 'selectOption("Lesson")', 'selectOption("text")', 'name: "Numeric collation"', "literalStringOrderParity", "result-v3"]) assert.ok((source + runtimeSource).includes(marker), marker);
  for (const marker of ["r.set.points.length !== 87", "sourceRows !== 174", "codes.length !== 7", "edges.length !== 49", "zeroNetworks !== 3", "rawTotal !== 811", "actualNativeBinding", "rawSelfConnections", "actualAuditRowsShown", "Full-run deidentified ordered audit", "aggregateOnly: true"]) assert.ok(source.includes(marker), marker);
  assert.match(source, /rows.length !== 49/);
  assert.match(source, /auditRows.length !== 100/);
  assert.match(source, /primary.selectOption\(""\)/);
  assert.doesNotMatch(source, /const uniqueEdges = new Map/u);
  assert.match(source, /Yu ONA directed arrows or self-loops are missing/u);
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


test("private lane failures cannot capture a private page or arbitrary diagnostics", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /browserOpened && !privateLaneActive/);
  assert.match(source, /if \(privateLaneActive\) \{/);
  assert.match(source, /private ONA diagnostic withheld/);
  assert.doesNotMatch(source, /disableBrowserCache:\s*true/);
});


test("ONA authentication cache policy restores browser default before fixture and original performance start", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /authentication-disabled-then-measurement-browser-default/);
  assert.match(source, /Network.setCacheDisabled", \{ cacheDisabled: false \}/);
  assert.match(source, /await page.__task38FinishAuthentication\(\)/);
  assert.match(source, /restoredBeforeFixture: true/);
  assert.match(source, /measurementStart: start/);
  assert.match(source, /entry.startTime >= start/);
  for (const budget of ["800_000", "2_200_000", "1_500", "5_000"]) assert.ok(source.includes(budget));
});
