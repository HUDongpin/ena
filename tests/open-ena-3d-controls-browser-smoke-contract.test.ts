import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const smokePath = join(projectRoot, "tests", "open-ena-3d-controls-browser-smoke.mjs");
const packagePath = join(projectRoot, "package.json");
const workflowPath = join(projectRoot, ".github", "workflows", "open-ena-ci.yml");

test("the 3D controls smoke owns a production build, synthetic Endpoint fixture, and clean lifecycle", () => {
  assert.equal(existsSync(smokePath), true, "the dedicated 3D controls browser smoke is missing");
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /OPEN_ENA_3D_CONTROLS_SMOKE_ARTIFACT_DIR/u);
  assert.match(source, /OPEN_ENA_3D_CONTROLS_SMOKE_BROWSER/u);
  assert.match(source, /NEXT_DIST_DIR/u);
  assert.match(source, /\.next-3d-controls-smoke-/u);
  assert.match(source, /execFileSync\(\s*"npm",\s*\["run",\s*"build"\]/u);
  assert.match(source, /\["run",\s*"start",\s*"--",\s*"--hostname"/u);
  assert.doesNotMatch(source, /\["run",\s*"dev"/u);
  assert.match(source, /originalTsconfig/u);
  assert.match(source, /writeFileSync\(tsconfigPath, originalTsconfig/u);
  assert.match(source, /stopOwnedServer/u);
  assert.match(source, /removeOwnedDistDirectory/u);
  assert.match(source, /sourceEvidenceBefore/u);
  assert.match(source, /sourceEvidenceAfter/u);
  assert.match(source, /worktreeCleanBefore/u);
  assert.match(source, /worktreeCleanAfter/u);

  assert.match(source, /function buildEndpointFixtureCsv\(\)/u);
  for (const code of ["CODE_A", "CODE_B", "CODE_C", "CODE_D", "CODE_E"]) {
    assert.ok(source.includes(code), `the synthetic fixture omits ${code}`);
  }
  assert.match(source, /modelType:\s*"EndPoint"/u);
  assert.match(source, /open_ena_3d_controls_smoke_researcher/u);
  assert.match(source, /OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS/u);
  assert.match(source, /page\.addInitScript\(installAnalysisAudit\)/u);
  assert.ok(
    source.indexOf("page.addInitScript(installAnalysisAudit)")
      < source.indexOf('name: "Sign in"'),
    "the Worker dispatch audit must be installed before authentication and model construction",
  );
});

test("the Endpoint fixture reads Units before selecting Model type from the Windows tab", () => {
  const source = readFileSync(smokePath, "utf8");
  const unitIdentity = source.indexOf('name: /Unit identity/');
  const windowsTab = source.indexOf('getByRole("tab", { name: "Windows" })');
  const modelType = source.indexOf('getByRole("combobox", { name: "Model type" })');

  assert.ok(unitIdentity >= 0, "the smoke does not verify inferred Unit identity");
  assert.ok(windowsTab > unitIdentity, "the smoke must inspect Units before leaving that tab");
  assert.ok(modelType > windowsTab, "Model type must be located only after selecting Windows");
});

test("the smoke sanitizes CLI failures and emits portable SHA-256 evidence", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /createSafePlaywrightCliError/u);
  assert.match(source, /function redact\(value\)/u);
  assert.doesNotMatch(source, /\{ cause: caught \}/u);
  assert.match(source, /function artifactEvidence\(path\)/u);
  assert.match(source, /sha256:\s*sha256\(readFileSync\(absolutePath\)\)/u);
  assert.match(source, /smokeSourceSha256/u);
  assert.match(source, /summary\.json/u);
  assert.match(source, /page\.on\("console"/u);
  assert.match(source, /page\.on\("pageerror"/u);
  assert.match(source, /consoleErrors/u);
  assert.match(source, /pageErrors/u);
  assert.match(source, /unknownWarnings/u);
  assert.match(source, /browser console contains unclassified warnings/u);
  assert.match(source, /platformDiagnostics/u);
  assert.match(source, /Canvas2D: Multiple readback operations/u);
  assert.match(source, /GPU stall due to ReadPixels/u);
  assert.match(source, /failure\.png/u);
});

test("the smoke proves 3D Data View mouse and keyboard lifecycle without analysis reruns", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /open-ena-data-view-toggle/u);
  assert.match(source, /open-ena-3d-data-view/u);
  assert.match(source, /open-ena-3d-comparison-plot/u);
  assert.match(source, /open-ena-3d-primary-plot/u);
  assert.match(source, /open-ena-3d-secondary-plot/u);
  assert.match(source, /\.click\(\)/u);
  assert.match(source, /\.press\("Enter"\)/u);
  assert.match(source, /dataViewMouseLifecycle/u);
  assert.match(source, /dataViewKeyboardLifecycle/u);
  assert.match(source, /analysisRunCount/u);
  assert.match(source, /resultIdentity/u);
  assert.match(source, /cameraState/u);
  assert.match(source, /axisState/u);
  assert.match(source, /aspectRatioState/u);
});

test("the smoke exercises each card's native-or-fallback fullscreen and forced rejection fallback", () => {
  const source = readFileSync(smokePath, "utf8");

  for (const plotName of ["Comparison", "Primary", "Secondary"]) {
    assert.ok(source.includes(`name: "${plotName}"`), `fullscreen matrix omits ${plotName}`);
  }
  assert.match(source, /name \+ " Plot: Enter Fullscreen"/u);
  assert.match(source, /document\.fullscreenElement/u);
  assert.match(source, /data-fallback-fullscreen/u);
  assert.match(source, /requestFullscreen/u);
  assert.match(source, /forced rejection/u);
  assert.match(source, /press\("Escape"\)/u);
  assert.match(source, /Exit Fullscreen/u);
  assert.match(source, /document\.activeElement/u);
  assert.match(source, /aria-pressed/u);
  assert.match(source, /aria-controls/u);
  assert.match(source, /canvas/u);
  assert.match(source, /0\.96/u);
  assert.match(source, /resize/u);
  assert.match(source, /fullscreenAudits/u);
  assert.match(source, /fallbackAudit/u);
  assert.match(
    source,
    /name:\s*"Primary",[\s\S]{0,220}exitMethod:\s*"button",[\s\S]{0,220}forceFallback:\s*false/u,
    "native-capable Primary must use the product exit button in page-level automation",
  );
  assert.match(
    source,
    /name:\s*"Secondary",[\s\S]{0,220}exitMethod:\s*"escape",[\s\S]{0,220}forceFallback:\s*true/u,
    "the forced fallback card must prove its DOM Escape handler",
  );
});

test("the smoke verifies 390px hit testing and keeps screenshots in its evidence summary", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /width:\s*390,\s*height:\s*844/u);
  assert.match(source, /elementFromPoint/u);
  assert.match(source, /hitTest/u);
  assert.match(source, /mobileAudit/u);
  assert.match(source, /artifactEvidence\(dataViewScreenshotPath\)/u);
  assert.match(source, /artifactEvidence\(comparisonFullscreenScreenshotPath\)/u);
  assert.match(source, /artifactEvidence\(primaryFullscreenScreenshotPath\)/u);
  assert.match(source, /artifactEvidence\(secondaryFullscreenScreenshotPath\)/u);
  assert.match(source, /artifactEvidence\(mobileScreenshotPath\)/u);
  for (const screenshot of [
    "data-view-desktop.png",
    "fullscreen-comparison.png",
    "fullscreen-primary.png",
    "fullscreen-secondary-fallback.png",
    "mobile-390x844.png",
  ]) {
    assert.ok(source.includes(screenshot), `evidence matrix omits ${screenshot}`);
  }
});

test("package and Open ENA CI expose the bounded 3D controls browser gate", () => {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    pkg.scripts?.["test:browser:open-ena-3d-controls"],
    "node tests/open-ena-3d-controls-browser-smoke.mjs",
  );

  const workflow = readFileSync(workflowPath, "utf8");
  assert.match(workflow, /OPEN_ENA_3D_CONTROLS_SMOKE_BROWSER:\s*chromium/u);
  assert.match(workflow, /OPEN_ENA_3D_CONTROLS_SMOKE_ARTIFACT_DIR:/u);
  assert.match(workflow, /npm run test:browser:open-ena-3d-controls/u);
  assert.match(workflow, /timeout-minutes:\s*45/u);
  assert.match(workflow, /if:\s*always\(\)/u);
  assert.match(workflow, /open-ena-3d-controls-evidence-/u);
  assert.match(workflow, /open-ena-playwright-daemon-3d-controls/u);
  assert.ok(
    workflow.indexOf("npm run test:browser:open-ena-3d-controls")
      < workflow.indexOf("npm run test:browser:longitudinal-v3"),
    "the focused 3D controls gate must run before the broader longitudinal smoke",
  );
  assert.match(workflow, /if-no-files-found:\s*error/u);
  assert.match(workflow, /retention-days:\s*14/u);
});
