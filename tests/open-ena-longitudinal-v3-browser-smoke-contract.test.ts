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
  assert.match(source, /trajectoryPresenterScreenshotPath/u);
  assert.match(source, /open-ena-longitudinal-v3-workbench/u);
  assert.match(source, /\["isometric",\s*"xy",\s*"xz",\s*"yz",\s*"yx",\s*"zx",\s*"zy"\]/u);
  assert.match(source, /\["xy",\s*"xz",\s*"yz",\s*"yx",\s*"zx",\s*"zy"\]/u);
  assert.match(source, /\{\s*width:\s*1440,\s*height:\s*1000/u);
  assert.match(source, /\{\s*width:\s*1024,\s*height:\s*768/u);
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
  assert.match(source, /clippedInteractiveControls/u);
  assert.match(source, /getBoundingClientRect\(\)/u);
  assert.match(source, /codesPresent/u);
  assert.match(source, /centroidSquares/u);
  assert.match(source, /lineOnlyTrajectories/u);
  assert.match(source, /errorBarTraceCount === 0/u);
  assert.match(source, /unknownTraceRoles\.length === 0/u);
  assert.match(source, /fullscreenPlotAudit/u);
  assert.match(source, /sceneDomain/u);
  assert.match(source, /audit\.canvas\.width >= audit\.plot\.width/u);
  assert.match(source, /current\.taskRequestCount === args\.expectedTaskRequestCount/u);
  assert.match(source, /assertScientificInvariants\("camera preset " \+ preset\)/u);
  assert.match(source, /execFileSync\(\s*"npm",\s*\["run",\s*"build"\]/u);
  assert.match(source, /\["run",\s*"start",\s*"--",\s*"--hostname"/u);
  assert.doesNotMatch(source, /\["run",\s*"dev"/u);
  assert.match(source, /OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS/u);
});

test("the Production smoke waits for the trajectory sample panel instead of racing post-login mode initialization", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /const trajectorySampleButton =/u);
  assert.match(source, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/u);
  assert.match(
    source,
    /trajectorySampleButton\s*\.waitFor\(\{ state: "visible", timeout: 5_000 \}\)/u,
  );
  assert.match(source, /assertBrowser\(dataPanelVisible/u);
});

test("the smoke converts child-process failures into sanitized errors without retaining the original cause", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /createSafePlaywrightCliError/u);
  assert.doesNotMatch(source, /\{ cause: caught \}/u);
});

test("the browser smoke keeps a trajectory result in its dedicated presenter after Model navigation", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /const trajectoryBoundaryAudit =/u);
  assert.match(source, /trajectoryBoundaryAudit\.genericSurfaceCount === 0/u);
  assert.match(source, /trajectoryBoundaryAudit\.ordinaryPresenterCount === 0/u);
  assert.doesNotMatch(source, /genericEnaAudit\.networkEdges > 0/u);
  assert.doesNotMatch(source, /generic-ena-model\.png/u);
});

test("the browser smoke proves every non-Plot rail panel is visible inside one immutable trajectory presenter", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /const nonPlotPanelExpectations = \[/u);
  for (const mode of ["Data", "Model", "Stats & Export", "AI"]) {
    assert.ok(source.includes(`railLabel: "${mode}"`), `missing ${mode} navigation assertion`);
  }
  assert.match(source, /open-ena-longitudinal-v3-analysis-controls/u);
  assert.match(source, /slotMode === expectation\.mode/u);
  assert.match(source, /panelHeading\.includes\(expectation\.heading\)/u);
  assert.match(source, /workbenchCount === 1/u);
  assert.match(source, /genericSurfaceCount === 0/u);
  assert.match(source, /ordinaryPresenterCount === 0/u);
  assert.match(source, /bundleResultHash === args\.expectedResultHash/u);
  assert.match(source, /taskRequestCount === args\.expectedTaskRequestCount/u);
});

test("the browser smoke preserves one stateful AI subtree across Plot, AI, Model, AI, and Plot", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /aiPostCount:\s*0/u);
  assert.match(source, /__openEnaAiLifecycleAudit/u);
  assert.match(source, /open-ena-persistent-ai-lifecycle/u);
  assert.match(source, /\.ena-ai-interpretation/u);
  assert.match(source, /data-ena-ai-consent="explicit"/u);
  assert.match(source, /currentAiRoot === audit\.aiRoot/u);
  assert.match(source, /currentConsent === audit\.consent/u);
  assert.match(source, /aiPostCount === audit\.baselineAiPostCount/u);
  assert.match(source, /name: "Model", exact: true/u);
  assert.match(source, /name: "AI-assisted interpretation", exact: true/u);
  assert.match(source, /analysisSlot\.waitFor\(\{ state: "hidden"/u);
  assert.match(source, /trajectorySlot\.waitFor\(\{ state: "visible"/u);
  assert.doesNotMatch(
    source,
    /getByTestId\("open-ena-longitudinal-v3-analysis-controls"\)\.count\(\) === 0/u,
    "Plot mode must hide, not unmount, the persistent analysis subtree",
  );
});

test("the browser smoke locates the AI rail control by its full accessible name", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(
    source,
    /railLabel: "AI", accessibleName: "AI-assisted interpretation", mode: "ai"/u,
    "AI is the visible rail label, while the button's explicit aria-label is AI-assisted interpretation",
  );
  assert.match(
    source,
    /getByRole\("button", \{ name: expectation\.accessibleName, exact: true \}\)/u,
    "the smoke must use the product's actual accessible name instead of its shorter visible text",
  );
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

test("failure screenshots use an explicit non-hidden path inside the uploaded artifact directory", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(
    source,
    /const failureScreenshotPath = join\(artifactDirectory, "failure\.png"\)/u,
  );
  assert.match(
    source,
    /runCli\(\s*\["screenshot",\s*"--filename",\s*failureScreenshotPath\],\s*"capture failure screenshot"/u,
  );
  assert.doesNotMatch(source, /runCli\(\["screenshot"\],\s*"capture failure screenshot"/u);
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
  assert.match(source, /trajectoryPresenterScreenshot:\s*artifactEvidence\(trajectoryPresenterScreenshotPath\)/u);
  assert.match(source, /cameraScreenshots:\s*Object\.fromEntries/u);
  assert.match(source, /\[preset, artifactEvidence\(path\)\]/u);
  assert.match(source, /pageScreenshot:\s*artifactEvidence\(pagePath\)/u);
  assert.match(source, /plotScreenshot:\s*artifactEvidence\(plotPath\)/u);
  assert.match(source, /screenshot:\s*artifactEvidence\(responsiveAudit\.fullscreenPath\)/u);
});

test("fullscreen geometry proves five right-middle actions overlay a full-height SVD3 canvas", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /async function readFullscreenPlotLayout\(page\)/u);
  assert.match(source, /function assertFullscreenPlotLayout\(audit, label\)/u);
  assert.match(source, /audit\.buttonBoxes\.length === 5/u);
  assert.match(source, /audit\.toolbar\.position === "absolute"/u);
  assert.match(source, /audit\.toolbar\.flexDirection === "column"/u);
  assert.match(source, /rightInset >= 6 && rightInset <= 22/u);
  assert.match(source, /Math\.abs\(toolbarCenter - shellCenter\) <= 2/u);
  assert.match(source, /button\.top >= audit\.toolbar\.top - 1/u);
  assert.match(source, /button\.top >= buttons\[index - 1\]\.bottom - 1/u);
  assert.match(source, /Math\.abs\(audit\.plot\.top - audit\.shell\.top\) <= 2/u);
  assert.match(source, /audit\.plot\.height >= audit\.shell\.height \* 0\.96/u);
  assert.match(source, /audit\.toolbar\.scrollHeight <= audit\.toolbar\.clientHeight \+ 1/u);
  assert.match(source, /!boxesOverlap\(audit\.toolbar, audit\.legend\)/u);
  assert.match(source, /!boxesOverlap\(audit\.toolbar, audit\.modebar\)/u);
  assert.match(source, /trace\.meta\?\.role === "axis-shaft"/u);
  assert.match(source, /trace\.meta\?\.role === "axis-arrowhead"/u);
  assert.match(source, /svd3Axis\.shaftPresent && audit\.svd3Axis\.arrowheadPresent && audit\.svd3Axis\.labelPresent/u);
  assert.match(source, /assertFullscreenPlotLayout\(fallbackLayoutAudit, "fallback fullscreen layout"\)/u);
  assert.match(source, /assertFullscreenPlotLayout\(fullscreenPlotAudit, "fullscreen layout"\)/u);
  assert.match(
    source,
    /\[readFullscreenPlotLayout, assertFullscreenPlotLayout\]/u,
    "the serialized browser phases must receive both shared layout helpers",
  );
  assert.doesNotMatch(source, /plot\.height >= fullscreenPlotAudit\.shell\.height - fullscreenPlotAudit\.toolbarHeight/u);
});

test("the 390px responsive audit proves the wrapped toolbar and Plotly canvas stay inside one shell", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /const boxFor = \(element\) =>/u);
  assert.match(source, /shellBox:\s*boxFor\(shell\)/u);
  assert.match(source, /toolbarBox:\s*boxFor\(toolbar\)/u);
  assert.match(source, /plotBox:\s*boxFor\(plot\)/u);
  assert.match(source, /toolbarRowCount/u);
  assert.match(source, /viewport\.width === 390/u);
  assert.match(source, /overflow\.toolbarRowCount >= 2/u);
  assert.match(source, /overflow\.toolbarBox\.bottom <= overflow\.plotBox\.top \+ 1/u);
  assert.match(source, /overflow\.plotBox\.bottom <= overflow\.shellBox\.bottom \+ 1/u);
  assert.match(source, /page\.locator\("\.ena-longitudinal-v3-plot-shell"\)\.screenshot\(\{ path: shellPath \}\)/u);
  assert.match(source, /shellScreenshot:\s*artifactEvidence\(shellPath\)/u);
  assert.match(source, /overflow\.documentScrollWidth <= overflow\.documentClientWidth \+ 1/u);
  assert.match(source, /overflow\.bodyScrollWidth <= overflow\.bodyClientWidth \+ 1/u);
});

test("the browser smoke proves fallback fullscreen is one reversible keyboard-modal session", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /async function exerciseFallbackFullscreenAccessibility\(page, args\)/u);
  assert.match(source, /page\.setViewportSize\(args\.viewport\)/u);
  assert.match(source, /Object\.getOwnPropertyDescriptor\(shell, "requestFullscreen"\)/u);
  assert.match(source, /Object\.defineProperty\(shell, "requestFullscreen"[\s\S]*?throw new Error/u);
  assert.match(source, /outsideNodes/u);
  assert.match(source, /bodyOverflow/u);
  assert.match(source, /data-fallback-fullscreen/u);
  assert.match(source, /getAttribute\("role"\) === "dialog"/u);
  assert.match(source, /getAttribute\("aria-modal"\) === "true"/u);
  assert.match(source, /getAttribute\("aria-label"\)\?\.trim\(\)\.length > 0/u);
  assert.match(source, /document\.activeElement === audit\.exitButton/u);
  assert.match(source, /document\.fullscreenElement !== audit\.shell/u);
  assert.match(source, /shellPath\.every\(\(node\) => !node\.inert && !node\.hasAttribute\("inert"\)\)/u);
  assert.match(source, /snapshot\.node\.inert === true/u);
  assert.match(source, /snapshot\.node\.hasAttribute\("inert"\)/u);
  assert.match(source, /snapshot\.node\.getAttribute\("aria-hidden"\) === "true"/u);
  assert.match(source, /const readFallbackControlSnapshot = async \(\) => await page\.evaluate/u);
  assert.match(source, /action:/u);
  assert.match(source, /index:/u);
  assert.match(source, /tag:/u);
  assert.match(source, /role:/u);
  assert.match(source, /testId:/u);
  assert.match(source, /ariaLabel:/u);
  assert.match(source, /insideShell:/u);
  assert.match(source, /active:/u);
  assert.match(source, /focusableDescriptors/u);
  assert.match(source, /currentActiveDescriptor/u);
  assert.match(source, /entryPending/u);
  assert.match(source, /entryState\.controls\.length === 5/u);
  assert.match(source, /if \(entryState\.entryPending\)/u);
  assert.match(source, /pendingActions\.length === 4/u);
  assert.match(source, /pendingActions\.every\(\(control\) => control\.disabled\)/u);
  assert.match(source, /entryState\.focusableDescriptors\.every\(\(descriptor\) => descriptor\.insideShell\)/u);
  assert.match(source, /pendingActions\.every\(\(control\) => !entryState\.focusableDescriptors\.some\(\(descriptor\) => descriptor\.action === control\.action\)\)/u);
  assert.match(source, /entryState\.currentActiveDescriptor\?\.action === "fullscreen"/u);
  assert.match(source, /pendingShiftTabDestination/u);
  assert.match(source, /sameFocusableDescriptor\(pendingShiftTabDestination, pendingRuntimeLast\)/u);
  assert.match(source, /pendingShiftTabDestination\?\.insideShell/u);
  assert.match(source, /audit\.exitButton\.focus\(\)/u);
  assert.match(source, /dataActionButtons\.length === 4 && dataActionButtons\.every\(\(button\) => !button\.disabled\)/u);
  assert.match(source, /const settledState = await readFallbackControlSnapshot\(\)/u);
  assert.match(source, /settledState\.controls\.length === 5/u);
  assert.match(source, /settledState\.controls\.every\(\(control\) => !control\.disabled\)/u);
  assert.match(source, /settledActionControls\.every\(\(control\) => settledState\.focusableDescriptors\.some\(\(descriptor\) => descriptor\.action === control\.action\)\)/u);
  assert.match(source, /settledState\.focusableDescriptors\.every\(\(descriptor\) => descriptor\.insideShell\)/u);
  assert.match(source, /settledState\.focusableDescriptors\[0\]\?\.action === "fullscreen"/u);
  assert.match(source, /page\.keyboard\.press\("Shift\+Tab"\)/u);
  assert.match(source, /sameFocusableDescriptor\(settledShiftTabDestination, settledRuntimeLast\)/u);
  assert.match(source, /settledShiftTabDestination\?\.insideShell/u);
  assert.match(source, /page\.keyboard\.press\("Tab"\)/u);
  assert.match(source, /for \(let step = 0; step < settledState\.focusableDescriptors\.length; step \+= 1\)/u);
  assert.match(source, /traversal\.every\(\(descriptor\) => descriptor\?\.insideShell\)/u);
  assert.match(source, /traversal\.at\(-1\)\?\.action === "fullscreen"/u);
  assert.doesNotMatch(source, /document\.activeElement === audit\.copyButton/u);
  assert.match(source, /backgroundCandidate\.focus\(\)/u);
  assert.match(source, /audit\.shell\.contains\(document\.activeElement\)/u);
  assert.match(source, /page\.keyboard\.press\("Escape"\)/u);
  assert.match(source, /getAttribute\("data-fallback-fullscreen"\) === null/u);
  assert.match(source, /getAttribute\("role"\) === null/u);
  assert.match(source, /getAttribute\("aria-modal"\) === null/u);
  assert.match(source, /document\.activeElement === audit\.opener/u);
  assert.match(source, /document\.body\.style\.overflow === audit\.bodyOverflow/u);
  assert.match(source, /snapshot\.node\.inert === snapshot\.inertProperty/u);
  assert.match(source, /snapshot\.node\.getAttribute\("aria-hidden"\) === snapshot\.ariaHidden/u);
  assert.match(source, /let evidence = null;[\s\S]*?try\s*\{\s*assertBrowser\(setup\.openerWasFullscreenButton/u);
  assert.match(source, /finally\s*\{/u);
  assert.match(source, /finally\s*\{\s*try\s*\{[\s\S]*?\}\s*finally\s*\{[\s\S]*?Object\.defineProperty\(shell, "requestFullscreen"/u);
  assert.match(source, /Object\.defineProperty\(shell, "requestFullscreen", audit\.requestFullscreenDescriptor\)/u);
  assert.match(source, /delete shell\.requestFullscreen/u);
  assert.match(source, /fallbackA11yAudit,/u);
});

test("the browser smoke drives every real V3 plot action across perspective, orthographic, and 2D runtimes", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /async function exerciseTrajectoryPlotActions\(page, args\)/u);
  for (const action of ["zoom-in", "zoom-out", "recenter", "copy-image"]) {
    assert.ok(source.includes(`[data-ena-plot-action="${action}"]`), `missing real ${action} button locator`);
  }
  assert.match(source, /cameraDistance/u);
  assert.match(source, /scene\?\._scene\?\.glplot\?\.getAspectratio/u);
  assert.match(source, /root\?\._fullLayout\?\.xaxis\?\.range/u);
  assert.match(source, /perspectiveZoomInDistance < perspectiveBaselineDistance/u);
  assert.match(source, /perspectiveZoomOutDistance > perspectiveZoomInDistance/u);
  assert.match(source, /cameraOrientationApproximatelyEqual\(perspectiveZoomIn, perspectiveBaseline\)/u);
  assert.match(source, /cameraApproximatelyEqual\(perspectiveZoomOut, perspectiveBaseline\)/u);
  assert.match(source, /cameraApproximatelyEqual\(perspectiveRecenter, perspectiveBaseline\)/u);
  assert.match(source, /approximatelyEqual\(perspectiveRecenterDistance, perspectiveBaselineDistance\)/u);
  assert.match(source, /orthographicZoomIn\.x > orthographicBaseline\.x/u);
  assert.match(source, /orthographicZoomOut\.x < orthographicZoomIn\.x/u);
  assert.match(source, /aspectApproximatelyEqual\(orthographicZoomOut, orthographicBaseline\)/u);
  assert.match(source, /aspectApproximatelyEqual\(orthographicRecenter, orthographicBaseline\)/u);
  assert.match(source, /twoDZoomIn\.x\[1\] - twoDZoomIn\.x\[0\]/u);
  assert.match(source, /twoDZoomOutSpan > twoDZoomInSpan/u);
  assert.match(source, /rangesApproximatelyEqual\(twoDZoomOut, twoDBaseline\)/u);
  assert.match(source, /rangesApproximatelyEqual\(twoDRecenter, twoDBaseline\)/u);
  assert.match(source, /await assertScientificInvariants\("perspective zoom in"\)/u);
  assert.match(source, /await assertScientificInvariants\("orthographic recenter"\)/u);
  assert.match(source, /await assertScientificInvariants\("2D recenter"\)/u);
  assert.match(source, /current\.taskRequestCount === args\.expectedTaskRequestCount/u);
  assert.match(source, /current\.resultHashes\[0\] === args\.expectedResultHash/u);
  assert.match(source, /Object\.defineProperty\(navigator, "clipboard"/u);
  assert.match(source, /data:image\/png/u);
  assert.match(source, /page\.waitForEvent\("download"\)/u);
  assert.match(source, /download\.suggestedFilename\(\)/u);
  assert.match(source, /3dena-longitudinal-trajectory\.png/u);
  assert.match(source, /pngSignature/u);
  assert.match(source, /pngByteLength/u);
  assert.match(source, /new Uint8Array\(chunk\)/u);
  assert.doesNotMatch(source, /chunks\.push\(Buffer\.from\(chunk\)\)|Buffer\.concat\(chunks\)/u);
  assert.match(source, /Image downloaded/u);
  assert.match(source, /toImageDataUrlFetchCount === 1/u);
  assert.match(source, /receipt:\s*artifactEvidence\(copyPath\)/u);
  assert.match(source, /projectionSelect\.selectOption\("3d"\)[\s\S]*?cameraSelect\.selectOption\("isometric"\)/u);
  assert.doesNotMatch(source, /createTrajectoryPlotlyControllerV3/u);
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

test("the Chromium Plotly Canvas2D advisory remains a strict auditable platform diagnostic", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /message\.location\(\)/u);
  assert.match(source, /strictChromiumCanvasReadbackWarning/u);
  const chunkPathLiteral = source.match(
    /const strictChromiumChunkPath = (\/\^[^\n]+\$\/u);/u,
  )?.[1];
  assert.ok(chunkPathLiteral, "the strict Chromium chunk path pattern is missing");
  const strictChromiumChunkPath = new Function(`return ${chunkPathLiteral}`)() as RegExp;
  assert.equal(strictChromiumChunkPath.test("/_next/static/chunks/1234-abcd-efgh.js"), true);
  assert.equal(
    strictChromiumChunkPath.test("/_next/static/immutable/chunks/2532syt7n1xoc.js"),
    true,
  );
  assert.equal(strictChromiumChunkPath.test("/_next/static/immutable/chunks/evil.js"), false);
  assert.equal(strictChromiumChunkPath.test("/_next/static/media/2532syt7n1xoc.js"), false);
  assert.match(source, /!sourceUrl\.startsWith\(currentOrigin \+ "\/"\)/u);
  assert.match(source, /sourceUrl\.slice\(currentOrigin\.length\)/u);
  assert.doesNotMatch(source, /new URL\(warning\.location/u);
  assert.match(source, /verifyChromiumCanvasReadbackSource/u);
  assert.match(source, /fetch\(input\.sourcePath/u);
  assert.match(source, /vectorize-text: Unrecognized textAlign:/u);
  assert.ok(source.includes('sourceLine.includes(\'getContext("2d")\')'));
  assert.ok(source.includes('sourceLine.includes(".getImageData(0,0,")'));
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/u);
  assert.match(source, /chunkSha256/u);
  assert.match(source, /sourceLineSha256/u);
  assert.match(source, /warningText:\s*warning\.text/u);
  assert.match(source, /canvas2dReadbackDiagnostics/u);
  assert.match(source, /canvas2dReadbackDiagnostics\.length <= 1/u);
  assert.match(source, /cliWarningCount/u);
  assert.match(source, /browserErrors\.platformDiagnostics\.canvas2dReadbackDiagnostics\.length/u);
  assert.doesNotMatch(source, /warning(?:Text)?\.includes\("Canvas2D/u);
});

test("only the exact Chromium ANGLE ReadPixels driver diagnostic is classified", () => {
  const source = readFileSync(smokePath, "utf8");
  const classifierSource = source.match(
    /function classifyChromiumAngleReadPixelsDiagnostic\(input\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  assert.notEqual(
    classifierSource,
    "",
    "the smoke needs one executable, self-contained classifier for the observed ANGLE driver diagnostic",
  );
  const classify = new Function(
    `${classifierSource}; return classifyChromiumAngleReadPixelsDiagnostic;`,
  )() as (input: {
    browser: string;
    currentHref: string;
    currentOrigin: string;
    warning: unknown;
  }) => unknown;
  const currentOrigin = "http://127.0.0.1:43623";
  const currentHref = `${currentOrigin}/en/open-ena`;
  const text = "[.WebGL-0x2a6400182a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels";
  const warning = {
    text,
    location: { url: currentHref, lineNumber: 0, columnNumber: 0 },
  };
  const normalizedPattern = "[.WebGL-0x<hex>]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels{optional-repeat-suppression}";

  assert.deepEqual(classify({ browser: "chromium", currentHref, currentOrigin, warning }), {
    normalizedPattern,
    repeatSuppression: false,
    sourcePath: "/en/open-ena",
    reportedLineNumber: 0,
    reportedColumnNumber: 0,
  });
  assert.deepEqual(classify({
    browser: "chromium",
    currentHref,
    currentOrigin,
    warning: {
      ...warning,
      text: `${text} (this message will no longer repeat)`,
    },
  }), {
    normalizedPattern,
    repeatSuppression: true,
    sourcePath: "/en/open-ena",
    reportedLineNumber: 0,
    reportedColumnNumber: 0,
  });

  const rejected = [
    { browser: "firefox", currentHref, currentOrigin, warning },
    { browser: "chromium", currentHref, currentOrigin, warning: text },
    { browser: "chromium", currentHref, currentOrigin, warning: { ...warning, text: text.replace("High", "Medium") } },
    { browser: "chromium", currentHref, currentOrigin, warning: { ...warning, text: `${text} unexpected suffix` } },
    { browser: "chromium", currentHref, currentOrigin, warning: { ...warning, text: text.replace("0x2a", "0xZA") } },
    { browser: "chromium", currentHref, currentOrigin, warning: { ...warning, location: { ...warning.location, url: `${currentOrigin}/other` } } },
    { browser: "chromium", currentHref, currentOrigin, warning: { ...warning, location: { ...warning.location, lineNumber: 1 } } },
    { browser: "chromium", currentHref, currentOrigin, warning: { ...warning, location: { ...warning.location, columnNumber: 1 } } },
  ];
  for (const input of rejected) assert.equal(classify(input), null);

  assert.match(source, /chromiumAngleReadPixelsDiagnostics/u);
  assert.match(source, /repeatSuppressionCount/u);
  assert.match(source, /normalizedPattern/u);
  assert.match(source, /classifyChromiumAngleReadPixelsDiagnostic/u);
  assert.match(source, /helpers\.map\(\(helper\) => helper\.toString\(\)\)/u);
  assert.match(
    source,
    /readBrowserErrors,[\s\S]*?\[classifyChromiumAngleReadPixelsDiagnostic\]/u,
    "the exact tested classifier must be injected into the serialized browser audit",
  );
  assert.match(
    source,
    /canvas2dReadbackDiagnostics\.length\s*\+\s*browserErrors\.platformDiagnostics\.chromiumAngleReadPixelsDiagnostics\.count/u,
    "the CLI warning total must account for every structured Chromium platform diagnostic",
  );
  assert.match(
    source,
    /chromiumAngleReadPixelsDiagnostics\.count <= 4/u,
    "an exact platform warning must still fail closed when it floods the console",
  );
  assert.match(source, /chromiumAngleReadPixelsDiagnostics\.repeatSuppressionCount <= 1/u);
  assert.match(source, /chromiumAngleReadPixelsDiagnostics\.sourcePaths\.length <= 1/u);
  assert.doesNotMatch(source, /warningText\.includes\("GL Driver Message/u);
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
