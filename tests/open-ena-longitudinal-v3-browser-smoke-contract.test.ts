import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const smokePath = join(process.cwd(), "tests", "open-ena-longitudinal-v3-browser-smoke.mjs");
const source = readFileSync(smokePath, "utf8");
const requires = (tokens: string[]) => { for (const token of tokens) assert.ok(source.includes(token), `missing preserved longitudinal coverage: ${token}`); };

// The retired component names, Plotly 2D ranges and V2 ZIP grammar are intentionally
// replaced by actual native equivalents. These are completeness guards; only the
// complete served command can establish scientific and interaction acceptance.
test("owned production runtime and clean source custody remain required", () => {
  requires(["createServedBrowserV3", "literalGit", "sourceEvidenceBefore.clean", "sourceEvidenceAfter.clean", "smokeSourceSha256", "runtime.close(primaryFailure)", "failureScreenshotPath", "artifactEvidence"]);
  assert.doesNotMatch(source, /allow.dirty|test:browser:models|run", "dev/u);
  const runtime = readFileSync(join(process.cwd(), "tests/helpers/open-ena-served-browser-v3.mjs"), "utf8");
  for (const token of ["OwnedSmokeLifecycle", '\"run\", \"build\"', "sourceContentSha256", "served bytes differ from owned build", "1.62.1", "1234", "observePage"]) assert.ok(runtime.includes(token));
});
test("native authentication sample and one fitted Worker plan/result remain authoritative", () => {
  requires(["document.fonts.ready", 'waitForLoadState("networkidle")', "Load trajectory sample", "nativeFixtureIdentitiesV3", "run-open-ena-plan-v3", "result-v3", "executionPlanSha256", "datasetSha256", "scientificResultSha256", "assert.equal(science.taskRequestCount, 1)", "SeparateTrajectory", "resolvedHorizonOrder.unitSequences", "per-Unit fitted order"]);
  assert.doesNotMatch(source, /message\?\.request\?\.pathTask|Load 3D trajectory sample|open-ena-longitudinal-v3-workbench/u);
});
test("three separately downloaded native rank designs preserve controls rows followups and ledger", () => {
  requires(["Trajectory inference design", "Run confirmed inference", "Export native statistics", "mann-whitney", "wilcoxon-signed-rank", "friedman", "value.controls", "value.inference.ledger", "value.inference.followupRows.length > 0", "rankDownloads.push"]);
});
test("explicit independent whole-path statistics retain all selected-period metrics and permutation inference", () => {
  requires(["histories in these two Groups are independent", "Run whole-path comparison", "Whole-path comparison current", "orderedHorizons.length * 5 + (orderedHorizons.length - 1) * 4", "assert.equal(path.repetitions, 500)", "assert.equal(path.seed, 2026)", "test.holmAdjustedPValue", "permutationPlanSha256", "all-period-complete"]);
});
test("aggregate and explicit participant bundles preserve every standalone byte and privacy boundary", () => {
  requires(["Export trajectory bundle", "Include participant data in this export", "participants.json", "manifest.json", "plot-specification.json", "trajectory-inference.csv", "member.byteLength", "member.sha256", "member.mimeType", "verifyStandaloneDownloads", "noParticipantFacts", "aggregate-path-comparison-complete-cohort", "participant opt-in changed aggregate descriptor"]);
  for (const family of ["independent-period", "paired-periods", "repeated-periods", "path-comparison"]) assert.ok(source.includes(family));
  assert.doesNotMatch(source, /3dena.longitudinal-provenance-manifest|provenance-manifest.json/u);
});
test("native trajectory geometry retains Codes square centroids black paths direction and zero edges", () => {
  requires(["codesPresent", "centroidSquares", 't.marker?.symbol === "square" && t.marker?.size === 7', "blackTrajectories", "lineOnlyTrajectories", "directionArrowTraceCount > 0", "networkEdgeTraceCount, 0", "errorBarTraceCount === 0", "unknownTraceRoles.length === 0", "display action changed bound fitted coordinates"]);
});
test("all seven camera poses and actual mouse orbit preserve bound science", () => {
  requires(['["isometric", "xy", "xz", "yz", "yx", "zx", "zy"]', "cameraMatches", "expectedCameraStates", "readRuntimeCamera", "waitForRuntimeCameraChange", "scene?._scene?.getCamera", 'page.mouse.down({ button: "left" })', "steps: 20", "assertBrowser(dragVerified", "cameraScreenshots", 'assertScientificInvariants("camera preset " + preset)']);
});
test("all six actual SVG projections and 2D zoom fit SVG and PNG exports remain exercised", () => {
  requires(['["xy", "xz", "yz", "yx", "zx", "zy"]', "nativeProjectionControl", "nativeSvgAudit", "svg.open-ena-main-svg", "Zoom in", "Zoom out", "Fit plot", "native 2D inverse zoom", "native 2D Fit plot", "Export PNG", "Export SVG", "native-2d-plot.png", "137,80,78,71,13,10,26,10"]);
  assert.doesNotMatch(source, /root\?\._fullLayout\?\.xaxis\?\.range/u);
});
test("perspective and orthographic zoom recenter preserve original numerical assertions", () => {
  requires(["perspectiveZoomInDistance < perspectiveBaselineDistance", "perspectiveZoomOutDistance > perspectiveZoomInDistance", "cameraOrientationApproximatelyEqual(perspectiveZoomIn, perspectiveBaseline)", "cameraApproximatelyEqual(perspectiveRecenter, perspectiveBaseline)", "orthographicZoomIn.x > orthographicBaseline.x", "orthographicZoomOut.x < orthographicZoomIn.x", "aspectApproximatelyEqual(orthographicRecenter, orthographicBaseline)"]);
});
test("PNG copy no-API fallback remains a genuine Blob download with strict bytes and status", () => {
  requires(['Object.defineProperty(navigator, "clipboard"', 'value: undefined', 'page.waitForEvent("download", { timeout: 120_000 })', "copyAnchorClickCount === 1", 'copyAnchorHref?.startsWith("blob:")', "Image downloaded", "pngSignature", "pngByteLength", "open-ena-3d-comparison.png"]);
});
test("actual pending clipboard write covers denial disabled actions Exit rejection and recovery", () => {
  requires(['items[0].getType("image/png")' , "audit.resolve = resolve; audit.reject = reject", "pending.pngs[0].signature", "dialog.dismiss()", "supported clipboard rejection silently fell back", 'pending.actions.filter(a => a.action !== "fullscreen" && a.disabled).length, 4', "intentional isolated clipboard write rejection", "recoveryStatus"]);
  assert.doesNotMatch(source, /setAttribute\([^)]*(?:ready|data-status)/u);
});
test("rail navigation preserves native mounted plot AI consent and zero automatic AI posts", () => {
  requires(["__openEnaAiLifecycleAudit", "aiPostCount: 0", "currentAiRoot === baseline.aiRoot", "currentConsent === baseline.consent", "audit.consentChecked, audit.consentEnabled", "audit.aiPostCount, audit.baselineAiPostCount", '"AI-assisted interpretation", "Model", "AI-assisted interpretation", "Data", "Stats & Export", "Plot Tools"']);
});
test("fallback fullscreen retains outside-tree modal isolation focus traversal Escape and exact restoration", () => {
  requires(["exerciseFallbackFullscreenAccessibility", 'Object.getOwnPropertyDescriptor(shell, "requestFullscreen")', 'Object.defineProperty(shell, "requestFullscreen"', "outsideSnapshots", "shellPathNonInert", "outsideTreeIsolated", 'getAttribute("aria-modal") === "true"', "document.activeElement === audit.exitButton", "pendingActions.every((control) => control.disabled)", 'settledState.focusableDescriptors.at(-1)?.action === "fullscreen"', 'page.keyboard.press("Shift+Tab")', 'page.keyboard.press("Tab")', "backgroundCandidate.focus()", 'page.keyboard.press("Escape")', "outsideTreeRestored", "requestFullscreenRestored"]);
});
test("native and fallback fullscreen retain full canvas geometry and positive separate SVD3 shaft label arrow", () => {
  requires(["readFullscreenPlotLayout", "assertFullscreenPlotLayout", "audit.buttonBoxes.length === 5", 'audit.toolbar.position === "absolute"', "rightInset >= 6 && rightInset <= 22", "Math.abs(toolbarCenter - shellCenter) <= 2", "audit.plot.height >= audit.shell.height * 0.96", "webglRuntimeReady", "audit.canvas.pixelWidth >= audit.canvas.width * audit.plotGlPixelRatio * 0.9", "sceneDomain", 'trace.meta?.role === "axis"', 'trace.meta?.role === "axis-label"', "arrowTipContinuesShaft", "arrowTip > shaftTip", "rangeHeadroomRatio >= 0.01", '"fallback fullscreen layout", "fallback"', '"fullscreen layout", "native"']);
});
test("desktop tablet mobile and native fullscreen retain screenshots and no document overflow", () => {
  requires(["width: 1440, height: 1000", "width: 1024, height: 768", "width: 390, height: 844", "clippedInteractiveControls", "getBoundingClientRect()", "overflow.documentScrollWidth <= overflow.documentClientWidth + 1", "overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1", "shellPath", "fullscreenPath", "document.fullscreenElement === shell"]);
});
test("runtime warnings retain source-verified Canvas2D and narrow font classification", () => {
  requires(["classifyChromiumCanvasReadbackDiagnostic", "strictFirefoxPreloadWarning", "strictNextFontPath", 'resourceHref.startsWith(currentOrigin + "/")', "reportingHref !== currentHref", "declaredFontPreloads.has(resourceHref)", "verifyChromiumCanvasReadbackSource", "vectorize-text: Unrecognized textAlign:", "chunkSha256", "sourceLineSha256", "canvas2dReadbackDiagnostics.length <= 1", "browserErrors.consoleErrors, []", "browserErrors.consoleWarnings, []", "browserErrors.pageErrors, []"]);
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
  assert.match(source, /chromiumAngleReadPixelsDiagnostics\.count <= 4/u);
  assert.match(source, /chromiumAngleReadPixelsDiagnostics\.repeatSuppressionCount <= 1/u);
  assert.match(source, /chromiumAngleReadPixelsDiagnostics\.sourcePaths\.length <= 1/u);
  assert.doesNotMatch(source, /warningText\.includes\("GL Driver Message/u);
});
test("GitHub CI runs the complete longitudinal application smoke in bundled Chromium and retains its evidence", () => {
  const workflow = readFileSync(
    join(process.cwd(), ".github", "workflows", "open-ena-ci.yml"),
    "utf8",
  );
  assert.match(workflow, /OPEN_ENA_LONGITUDINAL_SMOKE_BROWSER:\s*chromium/u);
  assert.match(workflow, /npm run test:browser:longitudinal-v3/u);
  assert.match(workflow, /id:\s*open_ena_longitudinal_smoke/u);
  assert.match(workflow, /actions\/upload-artifact@/u);
  assert.match(workflow, /open-ena-longitudinal-v3-evidence/u);
  assert.match(
    workflow,
    /if:\s*\$\{\{\s*always\(\)\s*&&\s*!cancelled\(\)\s*&&\s*steps\.open_ena_longitudinal_smoke\.outcome\s*!=\s*'skipped'\s*\}\}/u,
    "longitudinal evidence upload must not turn a skipped smoke into a second failure",
  );
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

test("the original full longitudinal npm entry remains unchanged", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  assert.equal(pkg.scripts["test:browser:longitudinal-v3"], "node tests/open-ena-longitudinal-v3-browser-smoke.mjs");
});

test("display Horizon filtering checks absent-step connectors and restores SVG without recomputation", () => { requires(["native SVG connected across an absent fitted step", "filteredSvg.paths.every(path => path.to === path.from + 1)", "restoring Horizon filter changed original SVG geometry"]); });

test("required asset reads are explicitly drained before authentication navigation", () => {
  requires(['runtime.drainAssetReads("initial required static assets before Sign in")']);
  const helper = readFileSync(join(process.cwd(), "tests/helpers/open-ena-served-browser-v3.mjs"), "utf8");
  for (const token of ["scheduledBefore", "settledBefore", "inFlightBefore", "inFlightAfter", "lifecycle.signal.throwIfAborted()", "Required static asset response failed before navigation"]) assert.ok(helper.includes(token));
});

test("cache disabling is explicit only for longitudinal correctness and records actual CDP response provenance", () => {
  requires(["disableBrowserCache: true"]);
  const helper = readFileSync(join(process.cwd(), "tests/helpers/open-ena-served-browser-v3.mjs"), "utf8");
  for (const token of ["disableBrowserCache = false", "Network.setCacheDisabled", "fromDiskCache", "fromServiceWorker", "Network.requestServedFromCache", "await cdp.detach()"]) assert.ok(helper.includes(token));
});

test("stale image lease waits on actual image rendering and refuses outputs after model controls change", () => { requires(["HTMLImageElement.prototype", "audit.release = () => callback.call(this, event)", 'model.selectOption("EndPoint")', "stale model materialized PNG output after awaited rendering", "audit.modelRuns, 1"]); });

test("rendered path and independent rank downloads must exactly agree with aggregate export", () => { requires(["native rendered path rows differ from the actual exported path tests", "bundled.scientificContextSha256, savedRank.context.scientificContextSha256", "compareAllowed(bundled[table], savedRank.inference[table]", "compareAllowed(bundled.ledger, savedRank.inference.ledger"]); });

test("pending fallback uses actual clipboard promise and denial never starts serialization", () => { requires(["forced fallback during genuinely pending image action", "denied identity approval started image serialization", "pending fallback Tab escaped dialog", "pending fallback Shift+Tab escaped dialog"]); });

test("asset settlement timeout cannot prevent owned process cleanup", async () => {
  const helper = await import("./helpers/open-ena-served-browser-v3.mjs");
  assert.equal(typeof helper.settleAssetReadsBoundedV3, "function");
  const started = Date.now();
  const stalled = await helper.settleAssetReadsBoundedV3([Promise.resolve(), new Promise(() => {})], 20);
  assert.equal(stalled.timedOut, true); assert.equal(stalled.pending, 1); assert.equal(stalled.settled, 1);
  assert.ok(Date.now() - started < 1000);
  const complete = await helper.settleAssetReadsBoundedV3([Promise.resolve(), Promise.reject(new Error("observed error"))], 100);
  assert.equal(complete.timedOut, false); assert.equal(complete.pending, 0); assert.equal(complete.settled, 2);
});
