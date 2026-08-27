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
  assert.match(source, /canvas\.width >= fullscreenPlotAudit\.plot\.width/u);
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
