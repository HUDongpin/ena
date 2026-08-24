import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const smokePath = join(process.cwd(), "tests", "open-ena-longitudinal-v3-browser-smoke.mjs");

test("the version-controlled longitudinal V3 smoke owns its server and covers the release browser matrix", () => {
  assert.equal(existsSync(smokePath), true, "the dedicated longitudinal V3 browser smoke is missing");
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /Load 2D trajectory sample/u);
  assert.match(source, /findOpenPort/u);
  assert.match(source, /stopOwnedServer/u);
  assert.match(source, /originalTsconfig/u);
  assert.match(source, /writeFileSync\(tsconfigPath, originalTsconfig/u);
  assert.match(source, /NEXT_DIST_DIR/u);
  assert.match(source, /OPEN_ENA_LONGITUDINAL_SMOKE_USERNAME/u);
  assert.match(source, /OPEN_ENA_LONGITUDINAL_SMOKE_PASSWORD/u);
  assert.match(source, /open-ena-longitudinal-v3-workbench/u);
  assert.match(source, /\["isometric",\s*"xy",\s*"xz",\s*"yz",\s*"yx",\s*"zx",\s*"zy"\]/u);
  assert.match(source, /\["xy",\s*"xz",\s*"yz",\s*"yx",\s*"zx",\s*"zy"\]/u);
  assert.match(source, /\{\s*width:\s*1440,\s*height:\s*1000/u);
  assert.match(source, /\{\s*width:\s*820,\s*height:\s*1180/u);
  assert.match(source, /\{\s*width:\s*390,\s*height:\s*844/u);
  assert.match(source, /page\.on\("console"/u);
  assert.match(source, /page\.on\("pageerror"/u);
  assert.match(source, /continueLocal\s*\.waitFor\(\{ state: "visible"/u);
  assert.match(source, /expectedCameraStates/u);
  assert.match(source, /page\.mouse\.down\(\)/u);
  assert.match(source, /page\.mouse\.move\([^)]*steps:/u);
  assert.match(source, /projection\?\.type/u);
  assert.match(source, /taskRequestCount/u);
  assert.match(source, /codesPresent/u);
  assert.match(source, /centroidSquares/u);
  assert.match(source, /lineOnlyTrajectories/u);
  assert.match(source, /errorBarTraceCount === 0/u);
  assert.match(source, /unknownTraceRoles\.length === 0/u);
  assert.match(source, /fullscreenPlotAudit/u);
  assert.match(source, /sceneDomain/u);
  assert.match(source, /canvas\.width >= fullscreenPlotAudit\.plot\.width/u);
  assert.match(source, /current\.taskRequestCount === args\.expectedTaskRequestCount/u);
  assert.match(source, /assertScientificInvariants\("camera preset " \+ preset\)/u);
  assert.match(source, /execFileSync\(\s*"npm",\s*\["run",\s*"build"\]/u);
  assert.match(source, /\["run",\s*"start",\s*"--",\s*"--hostname"/u);
  assert.doesNotMatch(source, /\["run",\s*"dev"/u);
  assert.match(source, /OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS/u);
});

test("the Next config permits a smoke-owned build directory so concurrent local servers do not share a lock", () => {
  const source = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(source, /process\.env\.NEXT_DIST_DIR/u);

  const layoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
  assert.match(layoutSource, /OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS/u);
});

test("the longitudinal V3 smoke exercises all seven trajectory downloads and verifies ZIP member receipts", () => {
  assert.equal(existsSync(smokePath), true, "the dedicated longitudinal V3 browser smoke is missing");
  const source = readFileSync(smokePath, "utf8");
  for (const label of [
    "Analysis bundle ZIP",
    "Path CSV",
    "Metadata CSV",
    "Inference CSV",
    "Analysis JSON",
    "Plotly spec JSON",
    "Participant-level ZIP (opt-in)",
  ]) assert.ok(source.includes(label), `missing download assertion for ${label}`);
  assert.doesNotMatch(source, /\["bootstrap",\s*"Bootstrap CSV"\]/u);
  assert.match(source, /bootstrapTaskCount/u);
  assert.match(source, /bootstrapTaskCount === 0/u);
  assert.match(source, /open-ena-longitudinal-v3-bootstrap/u);
  assert.match(source, /trajectory CI\/bootstrap UI is still visible/u);
  assert.match(source, /provenance-manifest\.json/u);
  assert.match(source, /member\.sha256/u);
  assert.match(source, /contentSetHash/u);
  assert.match(source, /participantLevelIncluded/u);
  assert.match(source, /aggregate Plotly export leaked participant points/u);
  assert.match(source, /aggregate Plotly export leaked individual paths/u);
  assert.match(source, /opt-in Plotly export omitted participant points/u);
  assert.match(source, /participant opt-in must produce a distinct privacy-scoped Plotly member/u);
  assert.match(source, /trajectory-bootstrap\.csv/u);
  assert.match(source, /trajectory ZIP still contains a bootstrap CSV/u);

  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.["test:browser:longitudinal-v3"],
    "node tests/open-ena-longitudinal-v3-browser-smoke.mjs",
  );
});
