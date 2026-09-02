import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const smokePath = join(process.cwd(), "tests/open-ena-a11y-perf-browser-smoke.mjs");
const source = readFileSync(smokePath, "utf8");

test("production browser smoke covers the complete transactional Code Color Presets workflow", () => {
  const codeColorAudit = source.match(
    /async function auditCodeColorPresets\(page, codes\) \{[\s\S]*?\n\}\n\nasync function auditOfficialModelTabs/u,
  )?.[0];
  const officialModelTabsAudit = source.match(
    /async function auditOfficialModelTabs\(page, rail\) \{[\s\S]*?\n\}\n\nasync function readGeometry/u,
  )?.[0];
  const trajectoryCascadeAudit = source.match(
    /async function auditTrajectoryCodeColorCascade\(page, rail\) \{[\s\S]*?\n\}\n\nasync function runA11y/u,
  )?.[0];
  const runA11yAudit = source.match(
    /async function runA11y\(page, baseUrl\) \{[\s\S]*?\n\}\n\nasync function runPerformance/u,
  )?.[0];
  assert.ok(codeColorAudit, "auditCodeColorPresets function body is unavailable");
  assert.ok(officialModelTabsAudit, "auditOfficialModelTabs function body is unavailable");
  assert.ok(trajectoryCascadeAudit, "auditTrajectoryCodeColorCascade function body is unavailable");
  assert.ok(runA11yAudit, "runA11y function body is unavailable");
  assert.match(
    officialModelTabsAudit,
    /const codeColorPresets = await auditCodeColorPresets\(page, codes\);/u,
  );
  assert.match(
    officialModelTabsAudit,
    /return\s*\{[\s\S]*?headingBottomBorderWidthPx,[\s\S]*?tabMetrics,[\s\S]*?panels,[\s\S]*?codeColorPresets,[\s\S]*?\};/u,
  );
  assert.match(source, /Choose color for /u);
  assert.match(source, /Code color for /u);
  assert.match(source, /Preset 2: Primary #218ebf, Complementary #ef691b/u);
  for (const hook of [
    'data-ena-code-color-primary',
    'data-ena-code-color-preset',
    'data-ena-code-color-plane',
    'data-ena-code-color-hue',
    'data-ena-code-color-axis="saturation"',
    'data-ena-code-color-axis="brightness"',
    'data-ena-code',
  ]) {
    assert.match(source, new RegExp(hook, "u"), `smoke is missing ${hook}`);
  }
  assert.match(source, /Enter a six-digit hexadecimal color such as #cc423a\./u);
  assert.match(source, /workerPosts/u);
  assert.match(source, /\{ width: 390, height: 844 \}/u);
  assert.match(source, /document\.documentElement\.scrollWidth\s*<=\s*document\.documentElement\.clientWidth/u);
  assert.match(source, /document\.activeElement/u);
  assert.match(codeColorAudit, /Worker\.prototype\.postMessage/u);
  assert.match(codeColorAudit, /finally\s*\{/u);
  assert.match(codeColorAudit, /delete window\.__openEnaCodeColorPresetSmoke/u);
  assert.match(codeColorAudit, /setViewportSize\(desktopViewport\)/u);
  assert.match(codeColorAudit, /assert\.ok\(triggerCount >= 2,/u);
  assert.match(codeColorAudit, /const alternate = triggers\.nth\(1\);/u);
  assert.match(codeColorAudit, /assert\.equal\(alternateTriggerBlocked, true,/u);
  assert.match(codeColorAudit, /return \{[\s\S]*?triggerCount,[\s\S]*?alternateTriggerBlocked,/u);
  assert.doesNotMatch(codeColorAudit, /if \(triggerCount/u);
  assert.doesNotMatch(codeColorAudit, /alternateTriggerBlocked = triggerCount < 2/u);
  assert.match(codeColorAudit, /HTMLDialogElement\.prototype\.showModal/u);
  assert.match(codeColorAudit, /originalShowModal/u);
  assert.match(codeColorAudit, /data-ena-dialog-fallback/u);
  assert.match(codeColorAudit, /fallback\.forced/u);
  assert.match(codeColorAudit, /fallback\.modal/u);
  assert.match(codeColorAudit, /fallback\.position/u);
  assert.match(codeColorAudit, /fallback\.viewportCovered/u);
  assert.match(codeColorAudit, /getComputedStyle\(element\)\.position/u);
  assert.match(codeColorAudit, /Math\.abs\(rect\.left\) <= 1/u);
  assert.match(codeColorAudit, /Math\.abs\(rect\.top\) <= 1/u);
  assert.match(codeColorAudit, /assert\.equal\(fallback\.modal, "true"/u);
  assert.match(codeColorAudit, /assert\.equal\(fallback\.position, "fixed"/u);
  assert.match(codeColorAudit, /assert\.equal\(fallback\.viewportCovered, true/u);
  assert.match(codeColorAudit, /fallback\.forwardWrap/u);
  assert.match(codeColorAudit, /fallback\.reverseWrap/u);
  assert.match(codeColorAudit, /fallback\.escape/u);
  assert.match(codeColorAudit, /fallback\.backdrop/u);
  assert.match(codeColorAudit, /fallback\.commit/u);
  assert.match(codeColorAudit, /fallback\.restore/u);
  assert.match(codeColorAudit, /document\.body\.style\.overflow/u);
  assert.match(
    codeColorAudit,
    /HTMLDialogElement\.prototype\.showModal = audit\.originalShowModal/u,
  );
  assert.match(codeColorAudit, /document\.activeElement === first/u);
  assert.match(codeColorAudit, /document\.activeElement === last/u);
  assert.match(codeColorAudit, /assert\.equal\(fallback\.restore\.workerPosts, 0/u);
  assert.match(source, /consoleErrors/u);
  assert.match(source, /pageErrors/u);
  assert.match(source, /blackSaturation/u);
  assert.match(source, /blueAfterBlack/u);
  assert.match(source, /hueEndValue/u);
  assert.match(source, /primaryAfterComplementaryEdit/u);
  assert.match(source, /complementaryAfterEscape/u);
  assert.match(source, /#ef691b/u);
  assert.match(source, /Preset 1: Primary #cc423a, Complementary #56bd7c/u);
  assert.match(source, /backdropDraftPrimary/u);
  assert.match(source, /backdropDraftComplementary/u);
  assert.match(source, /complementaryAfterBackdrop/u);
  assert.match(source, /backdrop dismissal committed the draft Complementary color/u);
  assert.match(source, /assert\.notEqual\(continuity\.complementaryAfterBackdrop, "#56bd7c"\)/u);
  assert.match(source, /escapeNodeColorsPreserved/u);
  assert.match(source, /backdropNodeColorsPreserved/u);
  assert.match(source, /Escape changed the rendered committed node colors/u);
  assert.match(source, /backdrop dismissal changed the rendered committed node colors/u);
  assert.match(source, /"360"/u);
  assert.match(trajectoryCascadeAudit, /Load 3D trajectory sample/u);
  assert.match(trajectoryCascadeAudit, /Download Model/u);
  assert.match(trajectoryCascadeAudit, /endpointDownloadEnabled/u);
  assert.match(trajectoryCascadeAudit, /ena-longitudinal-v3-controls/u);
  assert.match(trajectoryCascadeAudit, /data-ena-code-color-trigger/u);
  assert.match(trajectoryCascadeAudit, /data-ena-code-color-preset="2"/u);
  assert.match(trajectoryCascadeAudit, /data-ena-code-color-hue/u);
  assert.match(trajectoryCascadeAudit, /borderTopWidth/u);
  assert.match(trajectoryCascadeAudit, /backgroundImage/u);
  assert.match(trajectoryCascadeAudit, /rgb\(219, 219, 219\)/u);
  assert.match(trajectoryCascadeAudit, /rgb\(137, 207, 240\)/u);
  assert.match(trajectoryCascadeAudit, /rgb\(163, 38, 38\)/u);
  assert.match(trajectoryCascadeAudit, /lineHeight/u);
  assert.match(
    runA11yAudit,
    /const trajectoryCodeColorCascade = await auditTrajectoryCodeColorCascade\(page, rail\);/u,
  );
  assert.match(
    runA11yAudit,
    /return \{ modelParity, modelSliders, plotSliders, geometry, scientificIdentity, trajectoryCodeColorCascade, consoleErrors, pageErrors \};/u,
  );
  const fontReset = runA11yAudit.indexOf('document.documentElement.style.fontSize = "";');
  const trajectoryCall = runA11yAudit.indexOf("await auditTrajectoryCodeColorCascade(page, rail)");
  const finalReturn = runA11yAudit.lastIndexOf("return { modelParity");
  assert.ok(fontReset >= 0 && fontReset < trajectoryCall && trajectoryCall < finalReturn,
    "trajectory cascade audit must run after font restoration and before the final A11Y return");
  assert.ok(
    runA11yAudit.indexOf("font-size change altered scientific identity") < trajectoryCall,
    "endpoint scientific identity must be checked before loading the trajectory fixture",
  );
  assert.doesNotMatch(source, /input\[type="color"\]/u);
});
