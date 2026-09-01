import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function sourceSegment(value: string, startMarker: string, endMarker: string) {
  const start = value.indexOf(startMarker);
  assert.notEqual(start, -1, `source must include ${startMarker}`);
  const end = value.indexOf(endMarker, start);
  assert.notEqual(end, -1, `source must keep ${endMarker} after ${startMarker}`);
  return value.slice(start, end);
}

function firstCssRuleBody(value: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = value.match(new RegExp(`(?:^|\\n)[\\t ]*${escapedSelector}\\s*\\{([^}]*)\\}`, "u"))?.[1] ?? "";
  assert.ok(body, `styles must define ${selector}`);
  return body;
}

function topLevelCssTracks(value: string) {
  const tracks: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of value.trim()) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (/\s/u.test(character) && depth === 0) {
      if (current) tracks.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current) tracks.push(current);
  return tracks;
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const groupContrast = source("components/open-ena/OpenEnaGroupContrast.tsx");
const copy = source("lib/open-ena-i18n.ts");
const styles = source("app/globals.css");

test("v2.0.7-inspired desktop shell gives the research workbench the full vertical canvas", () => {
  assert.ok(
    !/className="ena-workbench-topbar"/.test(workspace),
    "brand chrome must live in the left rail, not in a standalone top bar",
  );
  assert.ok(
    !/className="ena-workbench-statusbar"/.test(workspace),
    "run status may remain visible, but it must not consume a standalone full-width shell row",
  );
  assert.ok(
    !/className="ena-workbench-footer"/.test(workspace),
    "runtime and privacy notes must not consume a standalone full-width shell row",
  );

  const workbenchRule = firstCssRuleBody(styles, ".open-ena-workbench");
  assert.match(workbenchRule, /height:\s*100dvh\s*;/, "the desktop workbench remains viewport-owned");
  assert.doesNotMatch(
    workbenchRule,
    /grid-template-rows:[^;]*(?:54px|31px)/,
    "legacy top-brand and status tracks must not reduce the research surface",
  );
  assert.match(
    styles,
    /\.open-ena-page:has\(> \.open-ena-fallback-notice\) > \.open-ena-workbench\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/u,
    "desktop fallback notice layout must leave the workbench in the remaining grid track",
  );
  assert.match(
    styles,
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.open-ena-page:has\(> \.open-ena-fallback-notice\) > \.open-ena-workbench\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*100dvh;/u,
    "mobile fallback notice layout must retain the auto-height workbench contract",
  );
});

test("the left rail owns the ENA mark and a visible runtime version", () => {
  const rail = sourceSegment(
    workspace,
    '<nav className="ena-tool-rail"',
    "</nav>",
  );

  assert.match(rail, /data-ena-rail-brand=/, "the rail needs one semantic brand owner");
  assert.match(rail, /(?:src=)?["']\/ena-mark\.svg["']/, "the existing ENA mark moves into the rail");
  assert.match(rail, /data-ena-rail-version=/, "the rail needs a semantic version owner");
  assert.match(
    rail,
    /JENA_RAIL_DISPLAY_VERSION/,
    "the displayed rail version stays derived from the actual jENA runtime rather than duplicated copy",
  );
});

test("Open ENA preserves the four remaining analysis icons and adds AI after Stats", () => {
  const iconBlock = sourceSegment(
    workspace,
    "const modeIcons:",
    "async function sha256Hex",
  );
  const actualIcons = [...iconBlock.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((match) => match[0]);
  assert.deepEqual(actualIcons.slice(0, 4), [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM4 10h16M9 5.5v13" /></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="m8 7 7.8-.8M7.4 8.7l3.5 7.4m5.6-8.2-3.4 8.2" /></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V4.5M4 19.5h16" /><path d="m6.5 15 4-4 3 2 5-6" /></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11h3v8zm6 0V5h3v14zm6 0V8h3v11z" /></svg>',
  ], "the four remaining inline SVGs retain their exact markup and order");
  assert.equal(
    actualIcons[4],
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="4" /><path d="m7.5 15 2.2-6 2.2 6M8.2 13h3M15 9v6" /></svg>',
    "the fifth mode uses the dedicated AI logo",
  );

  const modeKeys = ["data", "model", "plot", "stats", "ai"] as const;
  const modePositions = modeKeys.map((mode) => iconBlock.indexOf(`${mode}: (`));
  for (let index = 0; index < modePositions.length; index += 1) {
    assert.ok(modePositions[index] >= 0, `${modeKeys[index]} must retain its inline icon`);
    if (index > 0) {
      assert.ok(modePositions[index] > modePositions[index - 1], `${modeKeys[index]} must follow ${modeKeys[index - 1]}`);
    }
  }

  assert.ok(
    /modes:\s*\{\s*data:\s*"Data",\s*model:\s*"Model",\s*plot:\s*"Plot Tools",\s*stats:\s*"Stats & Export",\s*ai:\s*"AI"\s*\}/.test(copy),
    "the four remaining analysis modes and downstream AI interpretation remain explicit",
  );
});

test("desktop grid uses a compact rail, an approximately 380px control panel, and one flexible research surface", () => {
  const gridRule = firstCssRuleBody(styles, ".ena-workbench-grid");
  const columns = gridRule.match(/grid-template-columns:\s*([^;]+)/)?.[1] ?? "";
  assert.ok(columns, "the desktop workbench must declare its shell tracks");
  const tracks = topLevelCssTracks(columns);

  assert.equal(tracks.length, 3, "rail, left controls, and the remaining research surface are the three top-level tracks");
  assert.equal(tracks[0], "var(--ena-rail-width)", "the desktop reference rail remains compact via the shared variable");

  const controlWidth = Number(tracks[1]?.match(/^(\d+(?:\.\d+)?)px$/)?.[1]);
  assert.ok(
    Number.isFinite(controlWidth) && controlWidth >= 360 && controlWidth <= 400,
    `the desktop left panel must stay near 380px; received ${tracks[1] ?? "no track"}`,
  );
  assert.match(tracks[2] ?? "", /^(?:minmax\(0,\s*1fr\)|1fr)$/i, "the research surface receives all remaining width");

  const researchRule = firstCssRuleBody(styles, ".ena-visual-workspace");
  assert.doesNotMatch(
    researchRule,
    /grid-column:\s*3\s*\/\s*5/,
    "the research surface must not simulate a fourth top-level track by spanning legacy columns",
  );
});

test("GroupContrast keeps Comparison central and Primary, Secondary, then Plot Tools in the persistent right stack", () => {
  const comparisonPosition = groupContrast.indexOf("<h3>Comparison Plot</h3>");
  const primaryPosition = groupContrast.indexOf("<h3>Primary Plot</h3>", comparisonPosition);
  const secondaryPosition = groupContrast.indexOf("<h3>Secondary Plot</h3>", primaryPosition);
  const toolsPosition = groupContrast.indexOf("{rightTools}", secondaryPosition);

  assert.ok(comparisonPosition >= 0, "the center region owns Comparison Plot");
  assert.ok(primaryPosition > comparisonPosition, "Primary Plot follows the center surface in reading order");
  assert.ok(secondaryPosition > primaryPosition, "Secondary Plot follows Primary Plot");
  assert.ok(toolsPosition > secondaryPosition, "persistent Plot Tools follow the two right-stack plots");
  assert.match(groupContrast, /data-ena-workbench-region="center"/);
  assert.match(groupContrast, /data-ena-workbench-region="right-stack"/);
  assert.match(workspace, /rightTools=\{persistentPlotTools\}/, "the workspace supplies the controlled persistent Plot Tools surface");
});

test("Comparison, Primary, and Secondary plot titles and markers use black ink", () => {
  assert.match(
    workspace,
    /className=\{`ena-visual-toolbar\$\{view === "2d" && activeGroupContrast\s*\?\s*" ena-visual-toolbar-group-contrast"\s*:\s*""\}`\}/,
    "the shared Comparison Plot heading needs a contrast-only styling hook",
  );

  const plotHeadingClass = 'className="ena-set-plot-heading ena-group-contrast-plot-heading"';
  assert.equal(
    (groupContrast.match(new RegExp(plotHeadingClass, "g")) ?? []).length,
    5,
    "Comparison plus the rendered and empty Primary/Secondary states need the scoped plot-heading class",
  );
  for (const title of ["Comparison Plot", "Primary Plot", "Secondary Plot"]) {
    assert.match(
      groupContrast,
      new RegExp(`${plotHeadingClass}[\\s\\S]{0,160}<h3>${title}<\\/h3>`),
      `${title} needs the scoped black-title hook`,
    );
  }
  assert.match(
    groupContrast,
    /<header className="ena-set-plot-heading">\s*<div>\s*<h3>Data View<\/h3>/,
    "Data View remains outside the requested black plot-heading treatment",
  );

  assert.match(
    firstCssRuleBody(styles, ".ena-visual-toolbar.ena-visual-toolbar-group-contrast > div:first-child"),
    /border-inline-start-color:\s*#000(?:000)?\s*;/,
    "the wide Comparison Plot marker must be black",
  );
  assert.match(
    firstCssRuleBody(styles, ".ena-visual-toolbar.ena-visual-toolbar-group-contrast p"),
    /color:\s*#000(?:000)?\s*;/,
    "the wide Comparison Plot title must be black",
  );
  assert.match(
    firstCssRuleBody(styles, ".open-ena-group-contrast .ena-group-contrast-plot-heading"),
    /border-inline-start-color:\s*#000(?:000)?\s*;/,
    "the compact plot-title markers must be black",
  );
  assert.match(
    firstCssRuleBody(styles, ".open-ena-group-contrast .ena-group-contrast-plot-heading h3"),
    /color:\s*#000(?:000)?\s*;/,
    "the compact plot titles must be black",
  );
  assert.match(
    firstCssRuleBody(styles, ".open-ena-group-contrast .ena-set-side-plots .ena-group-contrast-plot-heading::before"),
    /background:\s*#000(?:000)?\s*;/,
    "the wide Primary and Secondary plot markers must be black",
  );
});

test("Data View replaces only the center plot and never displaces the right comparison context", () => {
  const center = sourceSegment(
    groupContrast,
    'data-testid="open-ena-group-center-surface"',
    'data-ena-workbench-region="right-stack"',
  );
  assert.match(center, /centerMode\s*===\s*"data"/);
  assert.match(center, /\{dataView\s*\?\?/);
  assert.match(center, /<h3>Comparison Plot<\/h3>/, "Comparison Plot remains the alternate center state");

  const right = groupContrast.slice(groupContrast.indexOf('data-ena-workbench-region="right-stack"'));
  assert.match(right, /<h3>Primary Plot<\/h3>/);
  assert.match(right, /<h3>Secondary Plot<\/h3>/);
  assert.match(right, /\{rightTools\}/);
  assert.doesNotMatch(right, /centerMode\s*===\s*"data"/, "the Data View condition is scoped to the center region only");
});

test("Open ENA scopes the compact Helvetica workbench typography without changing analytical contracts", () => {
  assert.ok(
    /\.open-ena-workbench\s*\{[\s\S]*?font-family:\s*["']Helvetica Neue["']\s*,\s*Helvetica\s*,\s*Arial\s*,\s*sans-serif\s*;/.test(styles),
    "the research workbench needs its own Helvetica stack without changing the rest of ENA.HK",
  );
});

test("the current-result surface has one official-style comparison heading rather than a stacked local preamble", () => {
  assert.doesNotMatch(
    groupContrast,
    /<header className="ena-set-comparison-header">/,
    "the pairwise renderer must not consume a second heading row above Comparison, Primary, and Secondary",
  );
  assert.match(
    groupContrast,
    /aria-label="Primary \/ Secondary Group Comparison"/,
    "removing the redundant visual preamble must retain an accessible section name",
  );
  assert.match(
    workspace,
    /activeGroupContrast\s*\?\s*copy\.workspace\.comparison/,
    "the shared visual toolbar becomes the single current-result Comparison plot heading",
  );
});

test("Data View is the official-style bottom research bar while plot evidence stays out of the primary canvas", () => {
  assert.match(
    groupContrast,
    /data-ena-center-mode=\{centerMode\}/,
    "the current-result section must expose its plot/data state to presentation CSS",
  );
  assert.match(
    styles,
    /\.ena-visual-toolbar\s+\[data-testid="open-ena-data-view-toggle"\]\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*0;[\s\S]*?background:\s*#(?:1d2122|202425);[\s\S]*?\}/,
    "the one existing Data View action becomes the full-width bottom bar instead of another top-toolbar button",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\[data-ena-center-mode="plot"\][\s\S]*?\.ena-set-signed-legend[\s\S]*?display:\s*none;/,
    "the research plot must not expose the local legend/table appendix ahead of the official bottom Data View bar",
  );
});

test("the plot toolbar contains view and export actions, not a model-type launcher", () => {
  const toolbarActions = sourceSegment(
    workspace,
    '<div className="ena-visual-toolbar-actions">',
    '{view === "3d" && result && threeDDimensions ? (',
  );

  assert.doesNotMatch(toolbarActions, /trajectory-analysis-button|launchTrajectoryAnalysis|copy\.longitudinal\.launch/);
  assert.doesNotMatch(
    toolbarActions,
    /SeparateTrajectory|AccumulatedTrajectory|setModelTab|updateConfig/,
    "plot actions must never mutate or navigate the model configuration workflow",
  );
  assert.doesNotMatch(styles, /\.ena-trajectory-analysis-button/);
  assert.doesNotMatch(workspace, /className="ena-workbench-topbar"|className="ena-workbench-statusbar"/);
  assert.equal(
    (workspace.match(/showTrajectories=\{false\}/g) ?? []).length,
    2,
    "generic 3D presenters must remain endpoint-only and never inherit V3 trajectory rendering",
  );
});

test("the trajectory configuration shortcut stays in the responsive Model heading flow", () => {
  const modelPanel = sourceSegment(
    workspace,
    "function renderModelPanel()",
    "function renderLongitudinalPanel()",
  );
  const shortcutRule = styles.match(/\.ena-trajectory-model-shortcut\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(
    modelPanel,
    /<div className="ena-panel-heading">[\s\S]{0,1600}data-testid="open-ena-configure-trajectory-model"[\s\S]{0,1000}<\/div>\s*<OpenEnaAnalysisFamilyControl[\s\S]{0,500}<div className="ena-model-tabs"/,
    "the shortcut belongs after the Model description and before its tablist",
  );
  assert.match(shortcutRule, /max-width:\s*100%/);
  assert.match(shortcutRule, /white-space:\s*normal/);
  assert.doesNotMatch(shortcutRule, /position:\s*absolute/);
  assert.ok(
    (styles.match(/\.ena-panel-heading\s*>\s*p:last-of-type/g) ?? []).length >= 2,
    "both heading typography rules must keep matching the description after the shortcut is appended",
  );
  assert.doesNotMatch(styles, /\.ena-panel-heading\s*>\s*p:last-child/);
  assert.match(
    styles,
    /@media \(max-width:\s*640px\)[\s\S]*?\.ena-trajectory-model-shortcut\s*\{[^}]*width:\s*100%;/,
    "the localized shortcut must use a full-width mobile hit target",
  );
});

test("the visible comparison caption keeps only the official Units and Horizon definitions", () => {
  assert.match(
    groupContrast,
    /<span className="sr-only ena-set-method-boundary">[\s\S]*?Each connection is drawn once[\s\S]*?<\/span>/,
    "the detailed statistical boundary remains available to assistive technology without occupying the plot footer",
  );
  assert.match(
    groupContrast,
    /className="ena-set-plot-definitions"[\s\S]*?<span><strong>Units:<\/strong>[\s\S]*?<span><strong>Horizon:<\/strong>/,
    "Units and Horizon remain the two visible plot definitions in official reading order",
  );
  assert.match(
    styles,
    /\.ena-set-plot-definitions\s*\{[\s\S]*?display:\s*grid;[\s\S]*?\}/,
    "the official definitions occupy two compact caption rows",
  );
});

test("the persistent right stack fills its available height down to the Data View bar", () => {
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-side-plots\s*\{[\s\S]*?grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\);[\s\S]*?align-content:\s*stretch;[\s\S]*?\}/,
    "Primary and Secondary keep their intrinsic plot frames while Plot Tools consumes the remaining right-stack height",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-right-tools\s*\{[\s\S]*?height:\s*100%;[\s\S]*?\}/,
    "the right Plot Tools card reaches the shared bottom research boundary",
  );
});

test("the base shell and Plot Tools retain the ENA.HK Baby Blue accent beneath scoped plot overrides", () => {
  assert.match(
    styles,
    /\.ena-visual-toolbar\s*>\s*div:first-child\s*\{[\s\S]*?border-inline-start:\s*3px\s+solid\s+var\(--ena-accent\);[\s\S]*?\}/,
    "the shared toolbar keeps Baby Blue as its non-contrast default",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-plot-heading\s*\{[\s\S]*?border-inline-start:\s*3px\s+solid\s+var\(--ena-accent\);[\s\S]*?\}/,
    "the shared plot-card heading keeps Baby Blue as its non-contrast default",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-plot-heading\s+h3\s*\{[\s\S]*?color:\s*var\(--ena-accent-strong\);[\s\S]*?\}/,
    "the shared plot-card title keeps the accessible dark Baby Blue fallback",
  );
  assert.match(
    styles,
    /\.ena-persistent-plot-tools-header\s*\{[\s\S]*?border-inline-start:\s*3px\s+solid\s+var\(--ena-accent\);[\s\S]*?color:\s*var\(--ena-accent-strong\);[\s\S]*?\}/,
    "the persistent Plot Tools heading uses the same Baby Blue accent family",
  );
});

test("desktop Plot Tools preserve the official two-slider rhythm and paired toggle row", () => {
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-right-tools\s+\.ena-persistent-plot-tools-scroll\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?row-gap:\s*13px;[\s\S]*?padding:\s*11px\s+8px\s+9px;/,
    "the two frequent toggles share one official desktop row below the two spaced sliders",
  );
  assert.match(
    styles,
    /\.ena-persistent-plot-tools-scroll\s*>\s*\.ena-official-tool-row\s*\{[\s\S]*?min-height:\s*31px;[\s\S]*?grid-column:\s*1\s*\/\s*-1;[\s\S]*?grid-template-columns:\s*85px\s+minmax\(0,\s*1fr\);/,
    "each slider keeps the measured label, track, value, and reset alignment",
  );
  assert.match(
    styles,
    /\.ena-persistent-plot-tools-scroll\s*>\s*\.ena-official-toggle-row\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?min-height:\s*34px;/,
    "Code labels and Unit circle each stack their label over the official On/Off control",
  );
  assert.match(
    styles,
    /\.ena-official-tool-control\s+input\[type="range"\]\s*\{[\s\S]*?-webkit-appearance:\s*none;[\s\S]*?height:\s*14px;/,
    "frequent sliders use the official compact Material track instead of the browser-native control",
  );
  assert.match(styles, /::-webkit-slider-runnable-track\s*\{[\s\S]*?height:\s*2px;[\s\S]*?--ena-range-progress/);
  assert.match(styles, /::-webkit-slider-thumb\s*\{[\s\S]*?width:\s*14px;[\s\S]*?height:\s*14px;/);
});

test("desktop comparison papers use the measured official canvas proportions and gutters", () => {
  assert.match(
    groupContrast,
    /const MAIN_WIDTH = 920;\s*const MAIN_HEIGHT = 723;\s*const MINI_WIDTH = 440;\s*const MINI_HEIGHT = 223;/,
    "the model-space scene keeps one isotropic projector while its two viewport aspect ratios match the measured official papers",
  );
  assert.match(
    styles,
    /@media \(min-width:\s*1400px\)[\s\S]*?\.open-ena-set-comparison\.open-ena-group-contrast\s*\{[\s\S]*?padding:\s*0\s+24px\s+41px;[\s\S]*?\}/,
    "the desktop research canvas must use the official 24px outer gutters and leave room for the bottom drawer",
  );
  assert.match(
    styles,
    /@media \(min-width:\s*1400px\)[\s\S]*?\.open-ena-group-contrast\s+\.ena-set-comparison-layout\s*\{[\s\S]*?grid-template-columns:\s*65%\s+35%;[\s\S]*?gap:\s*0;[\s\S]*?\}/,
    "the research surface owns the observed center/right proportion rather than a generic 2fr/1fr split",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.open-ena-set-comparison-svg\s*\{[\s\S]*?height:\s*calc\(100dvh\s*-\s*90px\);[\s\S]*?padding:\s*12px;[\s\S]*?\}/,
    "the comparison paper must expose the official 12px inner plot gutter",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.open-ena-set-mini-svg\s*\{[\s\S]*?height:\s*236px;[\s\S]*?margin-top:\s*11px;[\s\S]*?padding:\s*5px;[\s\S]*?\}/,
    "each side paper must expose the measured 440 by 223 inner plot canvas",
  );
});

test("official plot papers, model download, and group-label settings keep the observed visual grammar", () => {
  assert.match(
    styles,
    /@media \(min-width:\s*1400px\)[\s\S]*?\.open-ena-group-contrast\s+\.ena-set-main-plot,[\s\S]*?\.open-ena-group-contrast\s+\.ena-set-side-plots\s*>\s*figure,[\s\S]*?overflow:\s*visible;/,
    "the three SVG paper shadows must not be clipped by their semantic figure wrappers",
  );
  assert.match(styles, /\.open-ena-group-contrast\s+\.open-ena-set-comparison-svg\s*\{[\s\S]*?box-shadow:\s*0\s+2px\s+5px\s+rgba\(36,\s*55,\s*60,\s*0\.2\);/);
  assert.match(
    styles,
    /\.ena-download-model-button\s*\{[\s\S]*?color:\s*var\(--nav-deep\);[\s\S]*?background:\s*var\(--ena-accent\);/,
    "Download Model must use the filled Baby Blue action with readable dark text",
  );
  assert.match(workspace, /className="ena-download-model-button-icon"/);
  assert.match(workspace, /const \[showGroupLabels,\s*setShowGroupLabels\]\s*=\s*useState\(true\)/);
  assert.match(workspace, /showGroupLabels=\{showGroupLabels\}/);
  assert.match(groupContrast, /showGroupLabels:\s*boolean/);
  assert.match(groupContrast, /className="ena-set-group-label"/);
  assert.match(source("components/open-ena/OpenEnaPersistentPlotTools.tsx"), /data-ena-plot-tool="group-labels"/);
});

test("1920 desktop paper geometry and research background retain the measured official pixels", () => {
  assert.match(styles, /\.ena-visual-toolbar\s*\{[\s\S]*?background:\s*#edf1f2;/);
  assert.match(styles, /@media \(min-width:\s*1400px\)[\s\S]*?\.ena-visual-toolbar\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(styles, /\.open-ena-group-contrast\s+\[data-testid="open-ena-group-center-surface"\]\s*\{[\s\S]*?padding-inline:\s*5px\s+11px;/);
  assert.match(styles, /\.open-ena-group-contrast\s+\.ena-set-main-plot\s*\{[\s\S]*?height:\s*calc\(100dvh\s*-\s*90px\);/);
  assert.match(styles, /\.open-ena-group-contrast\s+\.ena-set-side-plots\s*\{[\s\S]*?margin-top:\s*-28px;[\s\S]*?padding:\s*0\s+28px\s+0\s+18px;/);
  assert.match(styles, /\.open-ena-set-comparison\.open-ena-group-contrast\s*\{[\s\S]*?background:\s*#edf1f2;/);
});

test("the center title is visually single-owned and plot actions use the official vertical edge rail", () => {
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-main-plot\s*>\s*\.ena-set-plot-heading\s+h3\s*\{[\s\S]*?clip-path:\s*inset\(50%\);[\s\S]*?\}/,
    "the semantic in-figure Comparison heading remains in the DOM but does not duplicate the visible workspace heading",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-official-plot-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?flex-direction:\s*column;[\s\S]*?\}/,
    "existing zoom, recenter, switch, and copy handlers must move to a vertical plot-edge rail",
  );
  assert.match(
    groupContrast,
    /\{!compact\s*\?\s*\([\s\S]*?<text[\s\S]*?\{xAxisLabel\}[\s\S]*?<text[\s\S]*?\{yAxisLabel\}[\s\S]*?\)\s*:\s*null\}/,
    "compact plots keep their axis lines and metadata while omitting the two collision-prone visible axis labels",
  );
});

test("main axes use the official two-line labels without changing axis metadata", () => {
  assert.match(
    groupContrast,
    /className="ena-set-axis-label ena-set-axis-label-x"[\s\S]*?<tspan[\s\S]*?>\{xAxisLabel\}\{flipX[\s\S]*?<\/tspan>[\s\S]*?\(\{xVariance\.toFixed\(2\)\}%\)/,
    "the main x-axis visible name and variance are rendered as separate official-style lines",
  );
  assert.match(
    groupContrast,
    /className="ena-set-axis-label ena-set-axis-label-y"[\s\S]*?<tspan[\s\S]*?>\{yAxisLabel\}\{flipY[\s\S]*?<\/tspan>[\s\S]*?\(\{yVariance\.toFixed\(2\)\}%\)/,
    "the main y-axis visible name and variance are rendered as separate official-style lines",
  );
  assert.match(groupContrast, /function officialAxisLabel\(axis: string\)\s*\{\s*return axis === "MR1" \? "GMR1" : axis;\s*\}/);
  assert.match(groupContrast, /data-ena-axis-x=\{xAxis\}/);
  assert.match(groupContrast, /data-ena-axis-y=\{yAxis\}/);
  assert.match(groupContrast, /data-ena-axis-x-variance=\{dataNumber\(xVarianceShare\)\}/);
  assert.match(groupContrast, /data-ena-axis-y-variance=\{dataNumber\(yVarianceShare\)\}/);
});

test("copied plot images preserve the live official renderer styles", () => {
  const copyPlotImage = sourceSegment(
    groupContrast,
    "async function copyPlotImage",
    "function formatMultiplier",
  );

  assert.match(copyPlotImage, /\.ena-set-zero-axes line\s*\{\s*stroke:\s*#333;\s*stroke-width:\s*0\.5;\s*\}/);
  assert.match(copyPlotImage, /\.ena-set-result-node\s*\{\s*fill:\s*#4d4d4d;\s*stroke:\s*#4d4d4d;\s*stroke-width:\s*0;\s*\}/);
  assert.match(
    copyPlotImage,
    /\.ena-set-result-label\s*\{[^}]*fill:\s*#111;[^}]*paint-order:\s*normal;[^}]*stroke:\s*none;[^}]*font-family:\s*"Helvetica Neue", Helvetica, Arial, sans-serif;[^}]*font-size:\s*calc\(10px \* var\(--ena-plot-text-scale, 1\) \+ var\(--ena-font-step, 1px\)\);[^}]*font-weight:\s*600;[^}]*\}/,
    "copied SVG and PNG node labels must keep the live text scale without reintroducing a white halo",
  );
});

test("plot papers use color-coded group captions and official scale notation", () => {
  assert.match(groupContrast, /className="ena-set-series-caption"/);
  assert.match(groupContrast, /className="ena-set-series-primary"/);
  assert.match(groupContrast, /className="ena-set-series-secondary"/);
  assert.match(groupContrast, /className="ena-set-scale-caption"[\s\S]*?formatOfficialMultiplier\(props\.edgeScale\)/);
  assert.match(
    groupContrast,
    /className="sr-only">\{primaryPanelSide\.name\} · \{primaryPanelSide\.unitCount\} analytic units<\/span>/,
    "unit counts remain available to assistive technology while the visible title follows webENA",
  );
  assert.match(
    groupContrast,
    /className="sr-only">\{secondaryPanelSide\.name\} · \{secondaryPanelSide\.unitCount\} analytic units<\/span>/,
  );
  assert.doesNotMatch(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-plot-heading\s+span\s*\{/,
    "a broad heading-span rule must not shrink the visible caption or action glyphs",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-set-plot-heading-tools\s*>\s*span\s*\{[\s\S]*?font-size:\s*calc\(0\.51rem \+ var\(--ena-font-step, 1px\)\);/,
    "only the hidden technical metadata span retains the compact technical size",
  );
  assert.match(
    styles,
    /\.open-ena-group-contrast\s+\.ena-official-plot-actions\s+button\s*>\s*span\s*\{[\s\S]*?font-size:\s*inherit;/,
    "the vertical plot-action glyphs inherit the official button size",
  );
});

test("the local 2D and in-place 3D controls sit immediately before Download Model in the plot-title toolbar", () => {
  const controls = sourceSegment(
    workspace,
    '<aside className="ena-control-panel"',
    '<div className="ena-visual-workspace"',
  );
  const toolbar = sourceSegment(
    workspace,
    '<div className={`ena-visual-toolbar${view === "2d" && activeGroupContrast ? " ena-visual-toolbar-group-contrast" : ""}`}>',
    '{view === "3d" && result && threeDDimensions ? (',
  );

  assert.doesNotMatch(controls, /className="ena-view-toggle"/, "the view switch no longer belongs to the Model control panel");
  assert.match(toolbar, /className="ena-analysis-toolbar-cluster"[\s\S]*?className="ena-view-toggle"/);
  assert.match(toolbar, /aria-pressed=\{view === "2d"\}/);
  assert.match(toolbar, /aria-pressed=\{view === "3d"\}/);
  assert.match(toolbar, /selectVisualizationView\("3d"\)/);
  assert.doesNotMatch(toolbar, /<a\b|href=\{siteConfig\.threeDenaUrl\}/);

  const viewToggleIndex = toolbar.indexOf('className="ena-view-toggle"');
  const downloadIndex = toolbar.indexOf('className="ena-compact-toolbar-button ena-download-model-button"');
  assert.ok(viewToggleIndex >= 0 && downloadIndex > viewToggleIndex,
    "2D/3D must immediately precede Download Model in reading and keyboard order");
  assert.match(
    styles,
    /\.ena-analysis-toolbar-cluster\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*stretch;[^}]*gap:\s*6px;/,
    "the two controls must render as one adjacent toolbar group",
  );
  const responsiveToolbarBase = sourceSegment(
    styles,
    ".ena-analysis-toolbar-cluster",
    "@media (min-width: 1400px)",
  );
  assert.match(
    responsiveToolbarBase,
    /\.ena-download-model-button-icon\s*\{[^}]*width:\s*13px;[^}]*height:\s*13px;[^}]*fill:\s*none;[^}]*stroke:\s*currentColor;/,
    "the download icon must remain compact before the desktop-only breakpoint",
  );
  assert.match(
    styles,
    /@media \(min-width:\s*1400px\)[\s\S]*?\.ena-analysis-toolbar-cluster\s*\{[^}]*position:\s*static;[^}]*height:\s*auto;[^}]*flex-wrap:\s*wrap;/,
    "the desktop group stays in semantic normal flow and wraps enlarged actions",
  );
});

test("the scrollable control panel reserves pointer clearance above the fixed 2D and 3D switch", () => {
  const controlContent = firstCssRuleBody(styles, ".ena-control-content");
  assert.match(controlContent, /padding:\s*18px 18px 80px;/);
  assert.match(controlContent, /scroll-padding-bottom:\s*80px;/);
});

test("narrow desktop side-card actions remain inside the plot instead of falling beneath Comparison", () => {
  assert.match(
    styles,
    /@media \(max-width:\s*1399px\) and \(min-width:\s*901px\)\s*\{[\s\S]*?\.open-ena-group-contrast \.ena-set-side-plots \.ena-set-plot-heading-tools\s*>\s*span\s*\{[\s\S]*?clip-path:\s*inset\(50%\);[\s\S]*?\.open-ena-group-contrast \.ena-set-side-plots \.ena-official-plot-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*5px;[\s\S]*?flex-direction:\s*column;/,
    "at 1280px the technical metadata and viewport actions must leave the visible Switch/Hide/Remove toolbar inside the side-card header",
  );
});

test("mobile side-card actions remain pointer-reachable inside the horizontally scrollable figure", () => {
  assert.match(
    styles,
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.open-ena-group-contrast \.ena-set-side-plots \.ena-set-plot-heading-tools\s*\{[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*flex-start;[\s\S]*?\.open-ena-group-contrast \.ena-set-side-plots \.ena-set-plot-heading-tools\s*>\s*span\s*\{[\s\S]*?clip-path:\s*inset\(50%\);[\s\S]*?\.open-ena-group-contrast \.ena-set-side-plots \.ena-official-plot-actions\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*5px;[\s\S]*?flex-direction:\s*column;/,
    "at 390px Switch/Hide/Remove must remain in the card while viewport actions leave the flex row",
  );
});
