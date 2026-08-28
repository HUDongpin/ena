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

test("the browser harness credentials are unconditional synthetic literals", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.doesNotMatch(source, /OPEN_ENA_3D_CONTROLS_SMOKE_USERNAME/u);
  assert.doesNotMatch(source, /OPEN_ENA_3D_CONTROLS_SMOKE_PASSWORD/u);
  assert.match(source, /const username = "open_ena_3d_controls_smoke_researcher";/u);
  assert.match(source, /const password = "open_ena_3d_controls_smoke_password_2026";/u);
  assert.match(source, /OPEN_ENA_3D_CONTROLS_SMOKE_ARTIFACT_DIR/u);
  assert.match(source, /OPEN_ENA_3D_CONTROLS_SMOKE_BROWSER/u);
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
  assert.doesNotMatch(source, /consoleWarnings:\s*0/u);
  assert.match(source, /consoleWarningsTotal/u);
  assert.match(source, /unknownConsoleWarnings/u);
  assert.match(source, /classifiedPlatformWarnings/u);
});

test("each run removes only its explicit stale evidence allowlist before producing new evidence", () => {
  const source = readFileSync(smokePath, "utf8");
  const cleanup = source.match(
    /function removeOwnedEvidenceFiles\(\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";

  assert.notEqual(cleanup, "", "the smoke lacks an owned evidence pre-run cleanup");
  for (const file of [
    "summary.json",
    "failure.png",
    "next-server.log",
    "data-view-desktop.png",
    "fullscreen-comparison.png",
    "fullscreen-primary.png",
    "fullscreen-secondary-fallback.png",
    "mobile-390x844.png",
  ]) {
    assert.ok(source.includes(file), `the stale-evidence allowlist omits ${file}`);
  }
  assert.match(cleanup, /assert\.equal\(dirname\(evidencePath\), artifactDirectory\)/u);
  assert.match(cleanup, /rmSync\(evidencePath, \{ force: true \}\)/u);
  assert.doesNotMatch(cleanup, /recursive/u);
  assert.doesNotMatch(source, /rmSync\(artifactDirectory/u);
  assert.ok(
    source.indexOf("removeOwnedEvidenceFiles();") < source.indexOf("const sourceEvidenceBefore"),
    "stale evidence must be removed before source/run validation can abort",
  );
  assert.match(source, /existsSync\(failureScreenshotPath\),\s*false/u);
  assert.ok(
    source.indexOf("existsSync(failureScreenshotPath), false")
      < source.indexOf("writeFileSync(\n  summaryPath"),
    "failure.png must be rejected before a PASS summary is written",
  );
});

test("final server log custody follows cleanup, on-disk sanitization, receipt, then summary write", () => {
  const source = readFileSync(smokePath, "utf8");
  const sanitizer = source.match(
    /function sanitizeFinalServerLog\(\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  const remover = source.match(
    /function removeUnsafeServerLog\(\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";

  assert.notEqual(sanitizer, "", "the final server-log sanitizer is missing");
  assert.match(sanitizer, /readFileSync\(serverLogPath, "utf8"\)/u);
  assert.match(sanitizer, /redact\(/u);
  assert.match(sanitizer, /writeFileSync\(serverLogPath,/u);
  assert.match(sanitizer, /finalBytes/u);
  for (const secret of ["username", "password", "sessionSecret"]) {
    assert.ok(sanitizer.includes(`finalBytes.includes(${secret})`), `final log does not reject ${secret}`);
  }
  assert.match(remover, /assert\.equal\(dirname\(serverLogPath\), artifactDirectory\)/u);
  assert.match(remover, /rmSync\(serverLogPath, \{ force: true \}\)/u);
  assert.doesNotMatch(remover, /recursive/u);
  assert.doesNotMatch(source, /serverLog:\s*artifactEvidence\(serverLogPath\)/u);

  const cleanup = source.lastIndexOf("await cleanupOwnedResources()");
  const sanitize = source.lastIndexOf("sanitizeFinalServerLog()");
  const receipt = source.lastIndexOf("artifactEvidence(serverLogPath)");
  const summaryWrite = source.lastIndexOf("writeFileSync(\n  summaryPath");
  assert.ok(cleanup >= 0 && cleanup < sanitize, "log sanitization precedes process cleanup");
  assert.ok(sanitize < receipt, "server-log receipt precedes final on-disk sanitization");
  assert.ok(receipt < summaryWrite, "summary is written before the final server-log receipt");
  assert.match(source, /catch \(sanitizationError\)[\s\S]{0,500}removeUnsafeServerLog\(\)/u);

  const signalHandler = source.match(
    /async function handleSignal\(signal\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  assert.match(signalHandler, /await cleanupOwnedResources\(\)/u);
  assert.match(signalHandler, /sanitizeFinalServerLog\(\)/u);
  assert.match(signalHandler, /if \(cleanupFailure\)[\s\S]{0,500}removeUnsafeServerLog\(\)/u);
  assert.match(source, /let cleanupSucceeded = false/u);
  assert.match(source, /cleanupSucceeded = true/u);
  assert.match(source, /catch \(cleanupError\)[\s\S]{0,500}removeUnsafeServerLog\(\)/u);
  assert.match(
    source,
    /catch \(cleanupError\)[\s\S]{0,700}if \(primaryFailure\)[\s\S]{0,350}else \{\s*primaryFailure = cleanupError;/u,
    "cleanup failure must not overwrite an earlier product failure",
  );
  assert.match(source, /if \(cleanupSucceeded\) \{/u);
  assert.doesNotMatch(source, /assert\.doesNotMatch\(serverLog/u);
});

test("cleanup restores source configuration and removes its dist even when server shutdown fails", () => {
  const source = readFileSync(smokePath, "utf8");
  const cleanup = source.match(
    /function cleanupOwnedResources\(\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";

  assert.match(cleanup, /await stopOwnedServer\(ownedServer\)/u);
  assert.match(cleanup, /finally \{/u);
  assert.match(cleanup, /writeFileSync\(tsconfigPath, originalTsconfig/u);
  assert.match(cleanup, /removeOwnedDistDirectory\(\)/u);
  assert.match(cleanup, /cleanupErrors/u);
});

test("PASS fails closed on unknown artifact inventory and declares the final seven files", () => {
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /readdirSync\(artifactDirectory/u);
  assert.match(source, /function assertArtifactInventoryBeforeSummary\(\)/u);
  assert.match(source, /finalExpectedFiles/u);
  assert.match(source, /artifactInventory/u);
  assert.match(source, /assert\.deepEqual\(actualFiles, expectedFiles/u);
  assert.match(source, /assert\.deepEqual\(finalFiles, artifactInventory\.finalExpectedFiles/u);
  assert.doesNotMatch(source, /rmSync\([^\n]*unknown/iu);
});

test("Playwright CLI state lives in an owned temporary working directory outside evidence", () => {
  const source = readFileSync(smokePath, "utf8");
  const remover = source.match(
    /function removePlaywrightWorkingDirectory\(\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";

  assert.match(source, /mkdtempSync\(join\(tmpdir\(\), "open-ena-3d-controls-playwright-"\)\)/u);
  assert.match(source, /cwd:\s*ensurePlaywrightWorkingDirectory\(\)/u);
  assert.doesNotMatch(source, /cwd:\s*artifactDirectory/u);
  assert.match(remover, /assert\.equal\(dirname\(playwrightWorkingDirectory\), tmpdir\(\)\)/u);
  assert.match(remover, /startsWith\("open-ena-3d-controls-playwright-"\)/u);
  assert.match(remover, /recursive:\s*true/u);
  const cleanup = source.match(
    /function cleanupOwnedResources\(\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  assert.match(cleanup, /removePlaywrightWorkingDirectory\(\)/u);
});

test("initial navigation is captured only after the Worker audit init script is installed", () => {
  const source = readFileSync(smokePath, "utf8");
  const authenticate = source.match(
    /async function authenticateBuildAndOpen3d\(page, args\) \{[\s\S]*?\n\}/u,
  )?.[0] ?? "";

  assert.match(source, /runCli\(\["open", "about:blank", "--browser", smokeBrowser\]/u);
  assert.match(source, /entryUrl:\s*baseUrl \+ "\/en\/open-ena"/u);
  assert.doesNotMatch(source, /page\.evaluate\(installAnalysisAudit\)/u);
  const capture = authenticate.indexOf("beginBrowserMessageCapture(page)");
  const init = authenticate.indexOf("page.addInitScript(installAnalysisAudit)");
  const navigate = authenticate.indexOf("page.goto(args.entryUrl");
  const login = authenticate.indexOf('name: "Account name"');
  assert.ok(capture >= 0 && capture < init, "initial diagnostics must begin before init-script setup");
  assert.ok(init < navigate, "Worker audit must be installed before initial app navigation");
  assert.ok(navigate < login, "login interaction must wait for the captured initial app load");
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
  assert.match(source, /rangeState/u);
  assert.match(source, /runtimeCameraState/u);
  assert.match(source, /runtimeAspectRatioState/u);
  assert.match(source, /getCamera\(\)/u);
  assert.match(source, /getAspectratio\(\)/u);
  assert.match(source, /canonicalNumber/u);
  assert.match(source, /runtime camera contains a non-finite vector/u);
  assert.match(source, /runtime camera projection is invalid/u);
  assert.match(source, /runtime aspect ratio contains a non-finite vector/u);
  assert.match(source, /finalScientificState:\s*stateAfter/u);
  assert.match(source, /data-smoke-mount-token/u);
  assert.match(source, /elementHandle\(\)/u);
  assert.match(source, /node === currentNode/u);
  for (const checkpoint of [
    "during mouse Data View",
    "after mouse restore",
    "during keyboard Data View",
    "after keyboard restore",
  ]) {
    assert.ok(source.includes(checkpoint), `side-panel identity is not checked ${checkpoint}`);
  }
  assert.match(source, /sidePanelsPreserved:\s*true/u);
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
  assert.match(source, /Native fullscreen could not close\. Press Escape to exit\./u);
  assert.match(source, /Promise\.reject\(new Error\("forced native exit rejection"\)\)/u);
  assert.match(source, /document\.fullscreenElement === target/u);
  assert.match(source, /not-applicable-native-unavailable/u);
  assert.doesNotMatch(source, /Primary rejected-exit guidance requires native fullscreen/u);
  assert.match(source, /rejected native exit moved focus away from the Exit button/u);
  assert.match(source, /rejectedExitGuidanceVerified = true/u);
  assert.match(source, /rejectedExitGuidanceVerified,/u);
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
      < workflow.indexOf("name: open-ena-3d-controls-evidence-")
      && workflow.indexOf("name: open-ena-3d-controls-evidence-")
        < workflow.indexOf("npm run test:browser:longitudinal-v3"),
    "3D evidence must upload before the broader longitudinal smoke can time out",
  );
  assert.match(workflow, /if-no-files-found:\s*error/u);
  assert.match(workflow, /retention-days:\s*14/u);
});
