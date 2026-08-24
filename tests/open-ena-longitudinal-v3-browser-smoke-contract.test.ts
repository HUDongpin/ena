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
  assert.match(source, /"chromium"/u);
  assert.match(source, /gitHead/u);
  assert.match(source, /gitTree/u);
  assert.match(source, /worktreeCleanBefore/u);
  assert.match(source, /worktreeCleanAfter/u);
  assert.match(source, /smokeSourceSha256/u);
  assert.match(source, /cameraScreenshots/u);
  assert.match(source, /genericEnaScreenshotPath/u);
  assert.match(source, /open-ena-longitudinal-v3-workbench/u);
  assert.match(source, /\["isometric",\s*"xy",\s*"xz",\s*"yz",\s*"yx",\s*"zx",\s*"zy"\]/u);
  assert.match(source, /\["xy",\s*"xz",\s*"yz",\s*"yx",\s*"zx",\s*"zy"\]/u);
  assert.match(source, /\{\s*width:\s*1440,\s*height:\s*1000/u);
  assert.match(source, /\{\s*width:\s*820,\s*height:\s*1180/u);
  assert.match(source, /\{\s*width:\s*390,\s*height:\s*844/u);
  assert.match(source, /page\.on\("console"/u);
  assert.match(source, /page\.on\("pageerror"/u);
  assert.match(source, /strictFirefoxPreloadWarning/u);
  assert.match(source, /strictNextFontPath/u);
  assert.match(source, /window\.location\.origin/u);
  assert.match(source, /resourceHref\.startsWith\(currentOrigin \+ "\/"\)/u);
  assert.match(source, /reportingHref !== currentHref/u);
  assert.match(source, /declaredFontPreloads\.has\(resourceHref\)/u);
  assert.match(source, /link\[rel="preload"\]\[as="font"\]\[type="font\/woff2"\]/u);
  assert.match(source, /nextFontPreloadDiagnosticUrls/u);
  assert.match(source, /platformDiagnostics: browserErrors\.platformDiagnostics/u);
  assert.match(source, /continueLocal\s*\.waitFor\(\{ state: "visible"/u);
  assert.match(source, /expectedCameraStates/u);
  assert.match(source, /page\.mouse\.down\(\{ button: "left" \}\)/u);
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

test("GitHub CI runs the complete longitudinal application smoke in bundled Chromium and retains its evidence", () => {
  const workflow = readFileSync(
    join(process.cwd(), ".github", "workflows", "open-ena-ci.yml"),
    "utf8",
  );
  assert.match(workflow, /OPEN_ENA_LONGITUDINAL_SMOKE_BROWSER:\s*chromium/u);
  assert.match(workflow, /npm run test:browser:longitudinal-v3/u);
  assert.match(workflow, /actions\/upload-artifact@/u);
  assert.match(workflow, /open-ena-longitudinal-v3-evidence/u);
  assert.match(workflow, /if-no-files-found:\s*error/u);
});

test("GitHub CI installs both the repository Chromium and the browser owned by the pinned Playwright CLI", () => {
  const workflow = readFileSync(
    join(process.cwd(), ".github", "workflows", "open-ena-ci.yml"),
    "utf8",
  );
  assert.match(workflow, /npx playwright install --with-deps chromium/u);
  assert.match(
    workflow,
    /npx --yes --package @playwright\/cli@0\.1\.18 playwright-cli install-browser chromium/u,
  );
});

test("GitHub CI excludes hidden Playwright CLI session state from uploaded evidence", () => {
  const workflow = readFileSync(
    join(process.cwd(), ".github", "workflows", "open-ena-ci.yml"),
    "utf8",
  );
  assert.doesNotMatch(workflow, /include-hidden-files\s*:/u);
});

test("the seven camera checks assert their visible selected labels and retain those labels", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(
    source,
    /const expectedCameraLabels = \{\s*isometric:\s*"ISOMETRIC",\s*xy:\s*"XY",\s*xz:\s*"XZ",\s*yz:\s*"YZ",\s*yx:\s*"YX",\s*zx:\s*"ZX",\s*zy:\s*"ZY",?\s*\}/u,
  );
  assert.match(source, /selectedOptions\[0\]\?\.textContent\?\.trim\(\)/u);
  assert.match(source, /cameraSelection\.visible/u);
  assert.match(source, /cameraSelection\.label === args\.expectedCameraLabels\[preset\]/u);
  assert.match(source, /cameraLabels\[preset\] = cameraSelection\.label/u);
  assert.match(source, /cameraLabels:\s*displayAudit\.cameraLabels/u);
});

test("camera interaction evidence reads the live Plotly camera with a declarative fallback", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /const sceneInteraction = plot\.locator\("#scene"\)/u);
  assert.match(source, /const cameraDragFractions = \[/u);
  assert.match(source, /to:\s*\{ x:\s*0\.75, y:\s*0\.7 \}/u);
  assert.match(source, /to:\s*\{ x:\s*0\.25, y:\s*0\.3 \}/u);
  assert.match(source, /const sceneBox = await sceneInteraction\.boundingBox\(\)/u);
  assert.doesNotMatch(source, /const plotBox = await plot\.boundingBox\(\)/u);
  assert.match(source, /const readRuntimeCamera = async \(\) => await plot\.evaluate/u);
  assert.match(
    source,
    /typeof scene\?\._scene\?\.getCamera === "function"\s*\? scene\._scene\.getCamera\(\)\s*:\s*scene\?\.camera/u,
  );
  assert.match(source, /const beforeDrag = await readRuntimeCamera\(\)/u);
  assert.match(source, /const attemptAfter = await waitForRuntimeCameraChange\(attemptBefore\)/u);
  assert.match(source, /afterDrag = attemptAfter/u);
  assert.match(source, /const current = await readRuntimeCamera\(\)/u);
  assert.match(source, /const restoredAfterDrag = await waitForRuntimeCamera\(/u);
  assert.match(source, /cameraStates\[preset\] = await waitForRuntimeCamera\(/u);
  assert.match(source, /dragAttempts\.push\(/u);
  assert.match(source, /assertBrowser\(dragVerified,/u);
  assert.match(source, /cameraInteraction:\s*\{/u);
  assert.match(source, /afterDrag,/u);
});

test("the summary converts every screenshot path into a portable integrity receipt", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /function artifactEvidence\(path\)/u);
  assert.match(source, /file:\s*portableFile/u);
  assert.match(source, /bytes:\s*statSync\(absolutePath\)\.size/u);
  assert.match(source, /sha256:\s*sha256\(readFileSync\(absolutePath\)\)/u);
  assert.match(source, /genericEnaScreenshot:\s*artifactEvidence\(genericEnaScreenshotPath\)/u);
  assert.match(source, /cameraScreenshots:\s*Object\.fromEntries/u);
  assert.match(source, /\[preset, artifactEvidence\(path\)\]/u);
  assert.match(source, /pageScreenshot:\s*artifactEvidence\(pagePath\)/u);
  assert.match(source, /plotScreenshot:\s*artifactEvidence\(plotPath\)/u);
  assert.match(source, /screenshot:\s*artifactEvidence\(responsiveAudit\.fullscreenPath\)/u);
});

test("download receipts resolve beneath the portable artifact root and retain integrity metadata", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /const downloadDirectory = join\(artifactDirectory, "downloads"\)/u);
  assert.match(
    source,
    /const downloadEvidence = Object\.fromEntries\(\s*Object\.entries\(downloads\)\.map\(\(\[kind, path\]\) => \[kind, artifactEvidence\(path\)\]\),?\s*\)/u,
  );
  assert.ok(source.includes("assert.match(receipt.file, /^downloads\\//u"));
  assert.match(source, /assert\.ok\(receipt\.bytes > 0/u);
  assert.ok(source.includes("assert.match(receipt.sha256, /^[a-f0-9]{64}$/u"));
  assert.match(source, /downloads:\s*downloadEvidence/u);
  assert.doesNotMatch(source, /file:\s*basename\(path\)/u);
});

test("the summary records the invoked Playwright CLI and actual browser runtime identities", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(
    source,
    /const playwrightCliVersion = runCli\(\["--version"\],\s*"resolve Playwright CLI",\s*120_000\)\.trim\(\)/u,
  );
  assert.match(source, /page\.context\(\)\.browser\(\)\?\.version\(\)/u);
  assert.match(source, /navigator\.userAgent/u);
  assert.match(source, /playwrightCliVersion,/u);
  assert.match(source, /runtimeBrowserVersion:\s*browserRuntimeEvidence\.version/u);
  assert.match(source, /runtimeBrowserUserAgent:\s*browserRuntimeEvidence\.userAgent/u);
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
