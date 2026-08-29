import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { buildPairwiseGroupContrast, buildPairwiseGroupContrastExport } from "../lib/open-ena/contrasts";
import { parseCsv } from "../lib/open-ena/csv";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";

const config: OpenEnaConfig = {
  ...SAMPLE_CONFIG,
  unitColumns: ["unit"],
  conversationColumns: ["conversation"],
  groupColumn: "group",
  codes: ["A", "B", "C"],
  model: "EndPoint",
  window: "Conversation",
};

function fixture() {
  const dataset = parseCsv([
    "unit,conversation,group,A,B,C",
    "a1,ca1,Alpha,1,1,0",
    "a2,ca2,Alpha,1,0,1",
    "a3,ca3,Alpha,0,1,1",
    "a4,ca4,Alpha,1,1,1",
    "b1,cb1,Beta,1,1,0",
    "b2,cb2,Beta,1,0,1",
    "b3,cb3,Beta,0,1,1",
    "b4,cb4,Beta,1,1,1",
    "",
  ].join("\n"), { name: "group-display-synthetic.csv", source: "upload" });
  const result = analyzeDataset(dataset, config);
  const contrast = buildPairwiseGroupContrast(
    result,
    config,
    "Alpha",
    "Beta",
    result.dimensions.slice(0, 2),
    "2026-08-29T04:00:00.000Z",
  );
  return { result, contrast };
}

test("group display defaults match the official Mean/CI/Outlier/Include Hidden controls", async () => {
  const module = await import("../lib/open-ena/group-display").catch(() => null);
  assert.ok(module, "Open ENA needs a typed group display contract");
  assert.deepEqual(module.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, {
    showUnitPoints: true,
    showMean: true,
    showConfidenceIntervals: true,
    showOutlierIntervals: false,
    includeHiddenPoints: false,
  });
  assert.equal(module.openEnaGroupUnitKey("Alpha", "a1"), JSON.stringify(["Alpha", "a1"]));
});

test("Include Hidden Points changes derived summaries but never reveals a hidden unit mark", async () => {
  const module = await import("../lib/open-ena/group-display").catch(() => null);
  assert.ok(module, "Open ENA needs a presenter-derived group summary helper");
  const { result, contrast } = fixture();
  const resultBefore = structuredClone(result);
  const contrastBefore = structuredClone(contrast);
  const hiddenKey = module.openEnaGroupUnitKey("Alpha", "a1");
  const settings = {
    Alpha: { ...module.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS },
    Beta: { ...module.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS },
  };

  const visibleOnly = module.deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup: settings,
    hiddenUnitKeys: [hiddenKey],
  });
  assert.deepEqual(visibleOnly.primary.visibleUnitIds, ["a2", "a3", "a4"]);
  assert.deepEqual(visibleOnly.primary.summaryUnitIds, ["a2", "a3", "a4"]);
  assert.equal(visibleOnly.primary.hiddenUnitCount, 1);
  assert.equal(visibleOnly.contrast.primary.unitCount, 3);
  assert.equal(visibleOnly.contrast.primary.meanConfidenceIntervals?.x.sampleSize, 3);
  const visibleOutlier = (visibleOnly.contrast.primary as typeof visibleOnly.contrast.primary & {
    outlierIntervals?: { x: { sampleSize: number }; y: { sampleSize: number } };
  }).outlierIntervals;
  assert.equal(visibleOutlier?.x.sampleSize, 3);
  assert.equal(visibleOutlier?.y.sampleSize, 3);
  assert.notDeepEqual(visibleOnly.contrast.primary.meanPoint, contrast.primary.meanPoint);
  assert.notDeepEqual(visibleOnly.contrast.primary.meanWeights, contrast.primary.meanWeights);

  const includeHidden = module.deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup: {
      ...settings,
      Alpha: { ...settings.Alpha, includeHiddenPoints: true },
    },
    hiddenUnitKeys: [hiddenKey],
  });
  assert.deepEqual(includeHidden.primary.visibleUnitIds, ["a2", "a3", "a4"]);
  assert.deepEqual(includeHidden.primary.summaryUnitIds, ["a1", "a2", "a3", "a4"]);
  assert.equal(includeHidden.contrast.primary.unitCount, 4);
  assert.equal(includeHidden.contrast.primary.meanConfidenceIntervals?.x.sampleSize, 4);
  const includedOutlier = (includeHidden.contrast.primary as typeof includeHidden.contrast.primary & {
    outlierIntervals?: { x: { sampleSize: number }; y: { sampleSize: number } };
  }).outlierIntervals;
  assert.equal(includedOutlier?.x.sampleSize, 4);
  assert.equal(includedOutlier?.y.sampleSize, 4);
  assert.deepEqual(includeHidden.contrast.primary.meanPoint, contrast.primary.meanPoint);
  assert.deepEqual(includeHidden.contrast.primary.meanWeights, contrast.primary.meanWeights);

  assert.deepEqual(result, resultBefore, "display filtering cannot mutate the fitted jENA result");
  assert.deepEqual(contrast, contrastBefore, "display filtering cannot mutate the canonical pairwise contrast");
});

test("an empty visible summary population fails closed unless Include Hidden Points is enabled", async () => {
  const module = await import("../lib/open-ena/group-display");
  const { result, contrast } = fixture();
  const hiddenUnitKeys = contrast.primary.unitIds.map((unitId) => (
    module.openEnaGroupUnitKey(contrast.primary.name, unitId)
  ));

  assert.throws(() => module.deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup: {},
    hiddenUnitKeys,
  }), /requires at least one visible unit/u);

  const included = module.deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup: {
      [contrast.primary.name]: {
        ...module.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
        includeHiddenPoints: true,
      },
    },
    hiddenUnitKeys,
  });
  assert.equal(included.primary.visibleUnitIds.length, 0);
  assert.deepEqual(included.primary.summaryUnitIds, contrast.primary.unitIds);
  assert.equal(included.contrast.primary.unitCount, contrast.primary.unitCount);
});

test("display-derived interval guides may expand but never shrink the canonical 2D frame", async () => {
  const module = await import("../lib/open-ena/group-display");
  const { result, contrast } = fixture();
  assert.ok(contrast.officialPlotFrame);
  const constrained = structuredClone(contrast);
  constrained.officialPlotFrame = {
    ...contrast.officialPlotFrame,
    maxPosition: 0.01,
    extremePosition: 0.012,
  };
  const display = module.deriveOpenEnaGroupDisplay({
    result,
    contrast: constrained,
    settingsByGroup: {},
    hiddenUnitKeys: [module.openEnaGroupUnitKey("Alpha", "a1")],
  });
  assert.ok(display.contrast.officialPlotFrame);
  assert.equal(
    display.contrast.officialPlotFrame.pointScaleFactor,
    constrained.officialPlotFrame.pointScaleFactor,
    "display summaries keep the canonical point-coordinate scale",
  );
  assert.ok(
    display.contrast.officialPlotFrame.maxPosition > constrained.officialPlotFrame.maxPosition,
    "derived confidence/outlier bounds must remain visible instead of being clipped by an undersized canonical frame",
  );
  assert.ok(display.contrast.officialPlotFrame.extremePosition >= display.contrast.officialPlotFrame.maxPosition * 1.2);
});

test("Model Units exposes accessible per-group settings and per-unit hide/show actions", async () => {
  const module = await import("../components/open-ena/OpenEnaGroupDisplayControls").catch(() => null);
  assert.ok(module?.default, "Model Units needs a group and unit display control surface");
  const Renderable = module.default as unknown as ComponentType<Record<string, unknown>>;
  const hiddenKey = JSON.stringify(["Alpha", "a1"]);
  const props = {
    groups: [
      { name: "Alpha", color: "#cc423a", unitIds: ["a1", "a2"] },
      { name: "Beta", color: "#218ebf", unitIds: ["b1", "b2"] },
    ],
    settingsByGroup: {
      Alpha: { ...((await import("../lib/open-ena/group-display")).DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS) },
      Beta: { ...((await import("../lib/open-ena/group-display")).DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS) },
    },
    hiddenUnitKeys: [hiddenKey],
    view: "2d",
    disabled: false,
    onSettingsChange: () => {},
    onUnitVisibilityChange: () => {},
    onRevealAllHidden: () => {},
  };
  const markup = renderToStaticMarkup(createElement(Renderable, props));

  assert.match(markup, /data-testid="open-ena-group-display-controls"/);
  assert.match(markup, />Plotted groups and units</);
  assert.match(markup, /Alpha · 1 of 2 unit points visible/);
  assert.match(markup, /Beta · 2 of 2 unit points visible/);
  for (const label of [
    "Show unit points for Alpha",
    "Show mean for Alpha",
    "Show confidence intervals for Alpha",
    "Show outlier intervals for Alpha",
    "Include hidden points for Alpha",
  ]) {
    assert.match(markup, new RegExp(`aria-label="${label}"`));
  }
  assert.match(markup, /aria-label="Show unit a1 in Alpha"/);
  assert.match(markup, /aria-label="Hide unit a2 in Alpha"/);
  assert.match(markup, /aria-label="Hide unit a2 in Alpha"[^>]*aria-disabled="true"[^>]*aria-describedby=/);
  assert.match(markup, /Keep one visible unit for summaries/);
  assert.match(markup, /aria-label="Show confidence intervals for Alpha"[^>]*aria-describedby=[^>]*disabled/);
  assert.match(markup, /Confidence and outlier intervals require at least two units/);
  assert.match(markup, /aria-label="Show all hidden unit points"/);
  assert.match(markup, /aria-live="polite"/);

  const threeD = renderToStaticMarkup(createElement(Renderable, { ...props, view: "3d" }));
  assert.match(threeD, /aria-label="Show outlier intervals for Alpha"[^>]*disabled/);
  assert.match(threeD, /Outlier intervals are currently available in 2D only/);
});

test("group display controls preserve dependent preferences and prevent an empty summary population", async () => {
  const module = await import("../components/open-ena/OpenEnaGroupDisplayControls");
  const displayModule = await import("../lib/open-ena/group-display");
  const Renderable = module.default as unknown as ComponentType<Record<string, unknown>>;
  const common = {
    groups: [{ name: "Alpha", color: "#cc423a", unitIds: ["a1", "a2"] }],
    view: "2d",
    disabled: false,
    onSettingsChange: () => {},
    onUnitVisibilityChange: () => {},
    onRevealAllHidden: () => {},
  };
  const meanOff = renderToStaticMarkup(createElement(Renderable, {
    ...common,
    settingsByGroup: {
      Alpha: {
        ...displayModule.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
        showMean: false,
        showConfidenceIntervals: true,
        showOutlierIntervals: true,
      },
    },
    hiddenUnitKeys: [],
  }));
  const ciSwitch = meanOff.match(/<input\b[^>]*aria-label="Show confidence intervals for Alpha"[^>]*>/u)?.[0] ?? "";
  const outlierSwitch = meanOff.match(/<input\b[^>]*aria-label="Show outlier intervals for Alpha"[^>]*>/u)?.[0] ?? "";
  assert.match(ciSwitch, /checked/u, "the user's CI preference stays on while Mean suppresses its guide");
  assert.match(ciSwitch, /disabled/u);
  assert.match(outlierSwitch, /checked/u, "the user's outlier preference stays on while Mean suppresses its guide");
  assert.match(outlierSwitch, /disabled/u);

  const allHidden = renderToStaticMarkup(createElement(Renderable, {
    ...common,
    settingsByGroup: {
      Alpha: {
        ...displayModule.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
        includeHiddenPoints: true,
      },
    },
    hiddenUnitKeys: [
      displayModule.openEnaGroupUnitKey("Alpha", "a1"),
      displayModule.openEnaGroupUnitKey("Alpha", "a2"),
    ],
  }));
  const includeHiddenSwitch = allHidden.match(/<input\b[^>]*aria-label="Include hidden points for Alpha"[^>]*>/u)?.[0] ?? "";
  assert.match(includeHiddenSwitch, /checked/u);
  assert.match(includeHiddenSwitch, /disabled/u, "the only valid summary population cannot be turned off");
  assert.match(
    allHidden.match(/<button\b[^>]*aria-label="Show unit a1 in Alpha"[^>]*>/u)?.[0] ?? "",
    /aria-disabled="false"/u,
  );
  assert.doesNotMatch(
    allHidden.match(/<button\b[^>]*aria-label="Show all hidden unit points"[^>]*>/u)?.[0] ?? "",
    /disabled/u,
  );
});

test("English, Traditional Chinese, and Simplified Chinese copy localizes visible and accessible group controls", async () => {
  const module = await import("../components/open-ena/OpenEnaGroupDisplayControls");
  const displayModule = await import("../lib/open-ena/group-display");
  const Renderable = module.default as unknown as ComponentType<Record<string, unknown>>;
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const copy = getOpenEnaCopy(locale).groupDisplay;
    const markup = renderToStaticMarkup(createElement(Renderable, {
      groups: [{ name: "Alpha", color: "#cc423a", unitIds: ["a1"] }],
      settingsByGroup: { Alpha: { ...displayModule.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } },
      hiddenUnitKeys: [],
      view: "3d",
      copy,
      disabled: false,
      onSettingsChange: () => {},
      onUnitVisibilityChange: () => {},
      onRevealAllHidden: () => {},
    }));
    assert.match(markup, new RegExp(copy.title));
    assert.match(markup, new RegExp(`aria-label="${copy.settingLabel(copy.showMean, "Alpha")}"`));
    assert.match(markup, new RegExp(`aria-label="${copy.unitAction(true, "a1", "Alpha")}"`));
    assert.match(markup, new RegExp(copy.outlierThreeDBoundary));
  }
});

test("large unit groups keep a bounded initial DOM and expose a search route to every unit", async () => {
  const module = await import("../components/open-ena/OpenEnaGroupDisplayControls");
  const Renderable = module.default as unknown as ComponentType<Record<string, unknown>>;
  const unitIds = Array.from({ length: 250 }, (_, index) => `unit-${String(index + 1).padStart(3, "0")}`);
  const markup = renderToStaticMarkup(createElement(Renderable, {
    groups: [{ name: "Large", color: "#cc423a", unitIds }],
    settingsByGroup: {},
    hiddenUnitKeys: [],
    view: "2d",
    disabled: false,
    onSettingsChange: () => {},
    onUnitVisibilityChange: () => {},
    onRevealAllHidden: () => {},
  }));

  assert.match(markup, /aria-label="Search units in Large"/);
  assert.equal((markup.match(/aria-label="Hide unit unit-/g) ?? []).length, 200);
  assert.match(markup, /Showing 200 of 250 matching units \(250 total\)\./);
  assert.doesNotMatch(markup, /Hide unit unit-250 in Large/);
});

test("Workspace owns one identity-keyed display state and passes it to both 2D and 3D group presenters", () => {
  const workspace = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /OpenEnaGroupDisplayControls/);
  assert.match(workspace, /deriveOpenEnaGroupDisplay/);
  assert.match(workspace, /groupDisplayDerivation/);
  assert.match(workspace, /data-ena-group-display-error="true"/);
  assert.doesNotMatch(workspace, /contrast=\{activeGroupDisplay\?\.contrast \?\? activeGroupContrast\}/);
  assert.match(workspace, /groupDisplaySettingsByGroup/);
  assert.match(workspace, /hiddenUnitKeys/);
  assert.match(workspace, /activeGroupDisplay/);
  assert.match(workspace, /const groupDisplayExportContrast = groupDisplayError/);
  assert.match(workspace, /derivedGroupDisplay\?\.contrast \?\? groupContrast/);
  assert.match(workspace, /buildPairwiseGroupContrastExport\(groupDisplayExportContrast/);
  assert.match(workspace, /pairwiseGroupContrastEdgesToCsv\(groupDisplayExportContrast\)/);
  assert.match(workspace, /groupDisplayPresentation/);
  assert.match(workspace, /allowedHiddenUnitKeys/);
  assert.match(
    workspace,
    /groupDisplaySettingsByGroup:\s*groupDisplayPresentation\.settingsByGroup/,
    "contrast export must resolve defaults for only the selected pair",
  );
  assert.match(
    workspace,
    /hiddenUnitKeys:\s*groupDisplayPresentation\.hiddenUnitKeys/,
    "contrast export must not leak hidden identifiers from non-selected groups",
  );
  assert.ok(
    (workspace.match(/groupDisplay=\{activeGroupDisplay\}/g) ?? []).length >= 2,
    "the 2D and 3D group presenters must consume the same display state",
  );
  assert.match(workspace, /setHiddenUnitKeys\(\[\]\)/);
  assert.match(workspace, /data-ena-group-display-result-key/);
});

test("group contrast presentation export records hidden-point and summary-display policy without changing canonical inference", async () => {
  const { contrast } = fixture();
  const module = await import("../lib/open-ena/group-display");
  const hiddenKey = module.openEnaGroupUnitKey("Alpha", "a1");
  const settingsByGroup = {
    Alpha: { ...module.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, showOutlierIntervals: true },
    Beta: { ...module.DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, showConfidenceIntervals: false },
  };
  const bundle = buildPairwiseGroupContrastExport(contrast, {
    groupDisplaySettingsByGroup: settingsByGroup,
    hiddenUnitKeys: [hiddenKey],
  } as unknown as Parameters<typeof buildPairwiseGroupContrastExport>[1]);
  const presentation = bundle.presentation as typeof bundle.presentation & {
    groupDisplay?: {
      settingsByGroup: typeof settingsByGroup;
      hiddenUnitKeys: string[];
      summaryPopulationPolicy: string;
      fittedResultMutation: boolean;
      inferenceMutation: boolean;
    };
  };

  assert.deepEqual(presentation?.groupDisplay?.settingsByGroup, settingsByGroup);
  assert.deepEqual(presentation?.groupDisplay?.hiddenUnitKeys, [hiddenKey]);
  assert.equal(presentation?.groupDisplay?.summaryPopulationPolicy, "include hidden units per group only when Include Hidden Points is enabled");
  assert.equal(presentation?.groupDisplay?.fittedResultMutation, false);
  assert.equal(presentation?.groupDisplay?.inferenceMutation, false);
  assert.equal(bundle.inference, null);
});
