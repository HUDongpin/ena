import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { locales } from "../lib/i18n";
import {
  createOpenEnaWorkspaceAxes,
  resetOpenEnaWorkspaceAxisSurface,
  updateOpenEnaWorkspace3dAxis,
} from "../lib/open-ena/plot3d";
import {
  buildOpenEnaResultTableViewModel,
  OPEN_ENA_RESULT_TABLE_KEYS,
  openEnaResultTableAvailability,
  openEnaResultTableFocusTarget,
  resolveOpenEnaResultTableRovingKey,
  type OpenEnaResultTableKey,
} from "../lib/open-ena/export";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import * as openEnaI18nModule from "../lib/open-ena-i18n";
import {
  OpenEnaResultTables,
  OpenEnaResultTablesView,
} from "../components/open-ena/OpenEnaWorkspace";
import * as workspaceModule from "../components/open-ena/OpenEnaWorkspace";
import * as longitudinalV3Module from "../components/open-ena/OpenEnaLongitudinalWorkbenchV3";

const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

type WorkspaceAxes = {
  twoD: readonly [string, string] | null;
  threeD: readonly [string, string, string] | null;
};

test("Open ENA fallback disclosure is absent for localized routes and explicit for every other locale", () => {
  const getFallbackNotice = Reflect.get(openEnaI18nModule, "getOpenEnaFallbackNotice");
  assert.equal(typeof getFallbackNotice, "function", "the shared pure fallback helper must be exported");
  for (const locale of locales) {
    const notice = getFallbackNotice(locale);
    if (["en", "zh-hant", "zh-hans"].includes(locale)) assert.equal(notice, null);
    else {
      assert.ok(notice);
      assert.match(notice, /English interface/i);
      assert.match(notice, new RegExp(`\\b${locale}\\b`, "i"));
    }
  }
});

test("workspace lifecycle, fallback, unavailable tabs, and mobile trajectory CSS remain bounded", () => {
  const inlineProgressRule = styles.match(/\.ena-inline-progress\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*(\d+);[^}]*\}/u);
  assert.ok(inlineProgressRule, "inline progress must establish its own stacking context");
  assert.ok(Number(inlineProgressRule[1]) > 7, "inline progress must stay above group plot actions");

  assert.match(workspace, /className="ena-persistent-ai-lifecycle"/);
  assert.match(
    styles,
    /\.ena-persistent-analysis-panel,\s*\.ena-persistent-ai-lifecycle\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/u,
    "both persistent wrappers must preserve the control-panel height and scroll contract",
  );
  assert.match(
    styles,
    /\.ena-longitudinal-v3-analysis-controls > \.ena-persistent-analysis-panel > \.ena-control-content,\s*\.ena-longitudinal-v3-analysis-controls > \.ena-persistent-ai-lifecycle > \.ena-control-content\s*\{/u,
    "V3 normalization must match the actual persistent-wrapper DOM depth",
  );
  assert.match(styles, /\.ena-result-tabs button\[aria-disabled="true"\]\s*\{[^}]*cursor:\s*not-allowed;/u);
  assert.match(styles, /\.ena-result-table-unavailable-notes\s*\{[^}]*border:/u);
  assert.match(styles, /\.ena-result-table-not-applicable\s*\{[^}]*border:/u);

  assert.match(styles, /\.open-ena-fallback-notice\s*\{[^}]*max-width:/u);
  assert.match(styles, /\.open-ena-page:has\(> \.open-ena-fallback-notice\)\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/u);
  assert.match(styles, /\.open-ena-page:has\(> \.open-ena-fallback-notice\) > \.open-ena-workbench\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/u);
  assert.match(
    styles,
    /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.open-ena-page:has\(> \.open-ena-fallback-notice\)\s*\{[^}]*grid-template-rows:\s*auto auto;[^}]*\}[\s\S]*?\.open-ena-page:has\(> \.open-ena-fallback-notice\) > \.open-ena-workbench\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*100dvh;/u,
    "the higher-specificity fallback layout must preserve the existing mobile auto-height contract",
  );
  assert.match(
    styles,
    /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.open-ena-longitudinal-trajectory\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/u,
  );
});

test("persistent rail and V3 control seams retain hidden lifecycle children across modes", () => {
  const PersistentRailPanels = Reflect.get(workspaceModule, "OpenEnaPersistentRailPanels");
  const LongitudinalControlsSlot = Reflect.get(longitudinalV3Module, "OpenEnaLongitudinalV3ControlsSlot");
  assert.equal(typeof PersistentRailPanels, "function", "the persistent rail lifecycle seam must be exported");
  assert.equal(typeof LongitudinalControlsSlot, "function", "the V3 dual-controls seam must be exported");
  const renderRail = (mode: "plot" | "ai" | "model") => renderToStaticMarkup(createElement(
    PersistentRailPanels as ComponentType<Record<string, unknown>>,
    {
      mode,
      analysisPanel: createElement("span", { "data-marker": `${mode}-analysis` }),
      aiPanel: createElement("span", { "data-marker": "persistent-ai-response" }),
    },
  ));
  const railShapes = [renderRail("plot"), renderRail("ai"), renderRail("model")];
  for (const html of railShapes) {
    assert.equal((html.match(/data-marker="persistent-ai-response"/gu) ?? []).length, 1);
    assert.ok(html.indexOf("open-ena-persistent-analysis-panel") < html.indexOf("open-ena-persistent-ai-lifecycle"));
  }
  assert.match(railShapes[0], /data-testid="open-ena-persistent-ai-lifecycle"[^>]*hidden/);
  assert.match(railShapes[1], /data-testid="open-ena-persistent-analysis-panel"[^>]*hidden/);
  assert.doesNotMatch(
    railShapes[1].match(/data-testid="open-ena-persistent-ai-lifecycle"[^>]*>/u)?.[0] ?? "",
    /hidden/u,
  );

  const trajectoryControls = createElement(
    "div",
    { "data-marker": "trajectory-controls" },
    ...Array.from({ length: 11 }, (_, index) => createElement("span", {
      key: index,
      "data-trajectory-step": index + 1,
    })),
  );
  const renderV3Slot = (analysisControlsMode: "plot" | "model") => renderToStaticMarkup(createElement(
    LongitudinalControlsSlot as ComponentType<Record<string, unknown>>,
    {
      analysisControlsMode,
      analysisControls: createElement("div", { "data-marker": "analysis-controls" }),
      trajectoryControls,
    },
  ));
  const plotSlot = renderV3Slot("plot");
  const modelSlot = renderV3Slot("model");
  for (const html of [plotSlot, modelSlot]) {
    assert.equal((html.match(/data-trajectory-step=/gu) ?? []).length, 11);
    assert.equal((html.match(/data-marker="analysis-controls"/gu) ?? []).length, 1);
  }
  assert.match(plotSlot, /data-testid="open-ena-longitudinal-v3-analysis-controls"[^>]*hidden/);
  assert.match(modelSlot, /data-testid="open-ena-longitudinal-v3-trajectory-controls"[^>]*hidden/);

  const nestedSlot = renderToStaticMarkup(createElement(
    LongitudinalControlsSlot as ComponentType<Record<string, unknown>>,
    {
      analysisControlsMode: "model",
      analysisControls: createElement(
        PersistentRailPanels as ComponentType<Record<string, unknown>>,
        {
          mode: "model",
          analysisPanel: createElement("div", { className: "ena-control-content" }),
          aiPanel: createElement("div", { className: "ena-control-content" }),
        },
      ),
      trajectoryControls,
    },
  ));
  assert.match(
    nestedSlot,
    /ena-longitudinal-v3-analysis-controls[\s\S]*?ena-persistent-analysis-panel[\s\S]*?ena-control-content[\s\S]*?ena-persistent-ai-lifecycle[\s\S]*?ena-control-content/,
    "SSR must expose the two persistent wrapper layers that the V3 CSS targets",
  );
});

test("axis initialization never fabricates result dimensions and requires three distinct axes for 3D", () => {
  assert.deepEqual(createOpenEnaWorkspaceAxes([]), { twoD: null, threeD: null });
  assert.deepEqual(createOpenEnaWorkspaceAxes(["Only"]), {
    twoD: ["Only", "Only"],
    threeD: null,
  });
  assert.deepEqual(createOpenEnaWorkspaceAxes(["Axis 1", "Axis 2"]), {
    twoD: ["Axis 1", "Axis 2"],
    threeD: null,
  });
  assert.deepEqual(createOpenEnaWorkspaceAxes(["Axis 1", "Axis 1", "Axis 2", "Axis 2"]), {
    twoD: ["Axis 1", "Axis 2"],
    threeD: null,
  });
  assert.deepEqual(createOpenEnaWorkspaceAxes(["Axis 1", "Axis 1", "Axis 2", "Axis 3"]), {
    twoD: ["Axis 1", "Axis 2"],
    threeD: ["Axis 1", "Axis 2", "Axis 3"],
  });
});

test("generic 3D axis transitions are immutable, inventory-bound, and preserve 2D inference identity", () => {
  const inventory = ["SVD1", "SVD2", "SVD3", "SVD4"] as const;
  const initial = createOpenEnaWorkspaceAxes(inventory) as WorkspaceAxes;
  const inferenceIdentityBefore = JSON.stringify({ axes: initial.twoD, kind: "endpoint-independent" });
  const changed3d = updateOpenEnaWorkspace3dAxis(initial, "x", "SVD2", inventory) as WorkspaceAxes;

  assert.deepEqual(initial, {
    twoD: ["SVD1", "SVD2"],
    threeD: ["SVD1", "SVD2", "SVD3"],
  }, "the prior state must not be mutated");
  assert.deepEqual(changed3d.twoD, initial.twoD);
  assert.deepEqual(changed3d.threeD, ["SVD2", "SVD1", "SVD3"]);
  assert.notStrictEqual(changed3d, initial);
  assert.notStrictEqual(changed3d.twoD, initial.twoD);
  assert.notStrictEqual(changed3d.threeD, initial.threeD);
  assert.equal(
    JSON.stringify({ axes: changed3d.twoD, kind: "endpoint-independent" }),
    inferenceIdentityBefore,
    "changing generic 3D axes must not alter inference request/key inputs",
  );

  for (const invalidDimension of ["", "   ", "PRIVATE-NON-MEMBER"]) {
    const rejected = updateOpenEnaWorkspace3dAxis(
      changed3d,
      "z",
      invalidDimension,
      inventory,
    ) as WorkspaceAxes;
    assert.deepEqual(rejected, changed3d);
    assert.notStrictEqual(rejected, changed3d);
    assert.notStrictEqual(rejected.twoD, changed3d.twoD);
    assert.notStrictEqual(rejected.threeD, changed3d.threeD);
  }

  const reset3d = resetOpenEnaWorkspaceAxisSurface(changed3d, "3d", ["MR1", "SVD2", "SVD3"]) as WorkspaceAxes;
  assert.deepEqual(reset3d.twoD, changed3d.twoD);
  assert.deepEqual(reset3d.threeD, ["MR1", "SVD2", "SVD3"]);
  const reset2d = resetOpenEnaWorkspaceAxisSurface(changed3d, "2d", ["MR1", "SVD2", "SVD3"]) as WorkspaceAxes;
  assert.deepEqual(reset2d.twoD, ["MR1", "SVD2"]);
  assert.deepEqual(reset2d.threeD, changed3d.threeD);
  const resetLowDimension3d = resetOpenEnaWorkspaceAxisSurface(changed3d, "3d", ["MR1", "SVD2"]) as WorkspaceAxes;
  assert.deepEqual(resetLowDimension3d.twoD, changed3d.twoD);
  assert.equal(resetLowDimension3d.threeD, null);
});

test("result-table availability exposes typed reasons for endpoint, trajectory, and projection results", () => {
  const endpoint = openEnaResultTableAvailability({
    modelType: "EndPoint",
    projectionReference: false,
  });
  assert.equal(endpoint.trajectories.available, false);
  assert.equal(endpoint.trajectories.reason, "endpoint-model");
  assert.equal(endpoint.centroids.available, true);

  for (const modelType of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const trajectory = openEnaResultTableAvailability({
      modelType,
      projectionReference: false,
    });
    assert.equal(trajectory.trajectories.available, true);
    assert.equal(trajectory.trajectories.reason, null);
  }

  const projected = openEnaResultTableAvailability({
    modelType: "EndPoint",
    projectionReference: true,
  });
  assert.equal(projected.centroids.available, false);
  assert.equal(projected.centroids.reason, "projection-reference");
  for (const key of [
    "coordinates",
    "lineWeights",
    "connectionCounts",
    "nodePositions",
    "adjacencyKey",
  ] as const) assert.equal(projected[key].available, true, `${key} must remain available`);
  for (const tableAvailability of Object.values(projected)) {
    if (tableAvailability.available) assert.equal(tableAvailability.reason, null);
    else assert.ok(tableAvailability.reason);
  }
});

test("result-table focus navigation wraps across available and unavailable tabs", () => {
  const keys = [...OPEN_ENA_RESULT_TABLE_KEYS];

  assert.equal(openEnaResultTableFocusTarget(keys, "coordinates", "ArrowRight"), "lineWeights");
  assert.equal(openEnaResultTableFocusTarget(keys, "adjacencyKey", "ArrowRight"), "coordinates");
  assert.equal(openEnaResultTableFocusTarget(keys, "coordinates", "ArrowLeft"), "adjacencyKey");
  assert.equal(openEnaResultTableFocusTarget(keys, "coordinates", "ArrowDown"), "lineWeights");
  assert.equal(openEnaResultTableFocusTarget(keys, "coordinates", "ArrowUp"), "adjacencyKey");
  assert.equal(openEnaResultTableFocusTarget(keys, "centroids", "Home"), "coordinates");
  assert.equal(openEnaResultTableFocusTarget(keys, "centroids", "End"), "adjacencyKey");
  assert.equal(
    openEnaResultTableFocusTarget(keys, "trajectories", "ArrowRight"),
    "centroids",
    "unavailable tabs remain focus-navigation stops",
  );
  assert.equal(openEnaResultTableFocusTarget(keys, "trajectories", "ArrowLeft"), "connectionCounts");
  assert.equal(openEnaResultTableFocusTarget(keys, "coordinates", "Enter"), null);
  assert.equal(openEnaResultTableFocusTarget(keys, "coordinates", " "), null);
});

test("result-table roving state preserves unavailable focus and falls back only when the key disappears", () => {
  const tables = {
    coordinates: [{ unit: "u1", x: 1 }],
    lineWeights: [],
    connectionCounts: [],
    trajectories: [],
    centroids: [],
    nodePositions: [],
    adjacencyKey: [],
  };
  const availability = openEnaResultTableAvailability({
    modelType: "EndPoint",
    projectionReference: false,
  });
  const selectedAvailable = buildOpenEnaResultTableViewModel({
    selectedKey: "coordinates",
    tables,
    availability,
    copy: getOpenEnaCopy("en").resultTables,
  });
  const selectedUnavailable = buildOpenEnaResultTableViewModel({
    selectedKey: "trajectories",
    tables,
    availability,
    copy: getOpenEnaCopy("en").resultTables,
  });

  assert.equal(resolveOpenEnaResultTableRovingKey(selectedAvailable.tabs, null), "coordinates");
  assert.equal(resolveOpenEnaResultTableRovingKey(selectedAvailable.tabs, "trajectories"), "trajectories");
  assert.equal(
    resolveOpenEnaResultTableRovingKey(
      selectedAvailable.tabs.filter((tab) => tab.key !== "trajectories"),
      "trajectories",
    ),
    "coordinates",
  );
  assert.equal(resolveOpenEnaResultTableRovingKey(selectedUnavailable.tabs, null), "coordinates");
});

test("controlled result-table view keeps selection stable while unavailable roving focus survives rerender", () => {
  const tables = {
    coordinates: [{ unit: "u1", x: 1 }],
    lineWeights: [],
    connectionCounts: [],
    trajectories: [],
    centroids: [],
    nodePositions: [],
    adjacencyKey: [],
  };
  const availability = openEnaResultTableAvailability({
    modelType: "EndPoint",
    projectionReference: false,
  });
  const buildModel = () => buildOpenEnaResultTableViewModel({
    selectedKey: "coordinates",
    tables,
    availability,
    copy: getOpenEnaCopy("en").resultTables,
  });
  const modelA = buildModel();
  const rovingA = resolveOpenEnaResultTableRovingKey(modelA.tabs, null);
  const rovingB = resolveOpenEnaResultTableRovingKey(modelA.tabs, "trajectories");
  const modelRerender = buildModel();
  const rovingAfterRerender = resolveOpenEnaResultTableRovingKey(modelRerender.tabs, rovingB);
  const renderView = (model: typeof modelA, rovingKey: OpenEnaResultTableKey | null) => renderToStaticMarkup(createElement(
    OpenEnaResultTablesView,
    {
      model,
      rovingKey,
      onRovingKeyChange: () => {},
      onSelect: () => {},
      onExport: () => {},
    },
  ));
  const htmlA = renderView(modelA, rovingA);
  const htmlB = renderView(modelA, rovingB);
  const htmlRerender = renderView(modelRerender, rovingAfterRerender);
  const rovingTabId = (html: string) => (
    (html.match(/<button[^>]*role="tab"[^>]*tabindex="0"[^>]*>/u)?.[0] ?? "")
      .match(/id="([^"]+)"/u)?.[1] ?? null
  );

  assert.equal(rovingTabId(htmlA), "open-ena-result-table-tab-coordinates");
  assert.equal(rovingTabId(htmlB), "open-ena-result-table-tab-trajectories");
  assert.equal(rovingTabId(htmlRerender), "open-ena-result-table-tab-trajectories");
  assert.ok(htmlB.includes('aria-labelledby="open-ena-result-table-tab-coordinates"'));
  assert.ok(htmlB.includes('aria-describedby="open-ena-result-table-reason-trajectories"'));
  assert.ok(htmlB.includes("Not applicable to endpoint models."));
});

test("result-table view model and static markup keep localized unavailable tabs explicit and linked", () => {
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const localizedCopy = getOpenEnaCopy(locale);
    const copy = localizedCopy.resultTables;
    assert.equal(Object.keys(copy.labels).length, OPEN_ENA_RESULT_TABLE_KEYS.length);
    assert.equal(Object.keys(copy.exportLabels).length, OPEN_ENA_RESULT_TABLE_KEYS.length);
    assert.equal(typeof copy.notApplicableShort, "string");
    assert.ok(copy.notApplicableShort.length > 0);
    assert.ok(copy.unavailableReasons["endpoint-model"].length > 0);
    assert.ok(copy.unavailableReasons["projection-reference"].length > 0);
    assert.equal(
      typeof localizedCopy.plot.threeDRequiresThreeDimensions,
      "string",
      `${locale} must expose the low-dimension 3D unavailability reason`,
    );
    assert.ok(localizedCopy.plot.threeDRequiresThreeDimensions?.length > 0);
  }
  assert.equal(getOpenEnaCopy("en").resultTables.notApplicableShort, "N/A");
  assert.equal(getOpenEnaCopy("zh-hant").resultTables.notApplicableShort, "不適用");
  assert.equal(getOpenEnaCopy("zh-hans").resultTables.notApplicableShort, "不适用");

  const tables = {
    coordinates: [{ unit: "u1", x: 1 }],
    lineWeights: [],
    connectionCounts: [],
    trajectories: [],
    centroids: [],
    nodePositions: [],
    adjacencyKey: [],
  };
  const availability = openEnaResultTableAvailability({
    modelType: "EndPoint",
    projectionReference: false,
  });
  const copy = getOpenEnaCopy("zh-hant").resultTables;
  const model = buildOpenEnaResultTableViewModel({
    selectedKey: "trajectories",
    tables,
    availability,
    copy,
    idPrefix: "open-ena-result-table",
    previewLimit: 100,
  });
  assert.equal(model.tabs.length, 7);
  assert.equal(model.tabs.find((tab: { key: string }) => tab.key === "trajectories")?.disabled, true);
  assert.equal(model.tabs.filter((tab) => tab.tabIndex === 0).length, 1);
  assert.equal(model.tabs.find((tab) => tab.key === "coordinates")?.tabIndex, 0);
  assert.equal(model.tabs.find((tab) => tab.key === "trajectories")?.tabIndex, -1);
  assert.equal(model.panel.id, "open-ena-result-table-panel");
  assert.equal(model.panel.labelledBy, "open-ena-result-table-tab-trajectories");
  assert.equal(model.panel.available, false);
  assert.equal(model.export.disabled, true);

  const html = renderToStaticMarkup(createElement(
    OpenEnaResultTables,
    { model, onSelect: () => {}, onExport: () => {} },
  ));
  const renderedTabs = html.match(/<button[^>]*role="tab"[^>]*>/gu) ?? [];
  assert.equal(renderedTabs.length, 7);
  assert.equal(renderedTabs.filter((tag) => tag.includes('tabindex="0"')).length, 1);
  assert.ok(html.includes('id="open-ena-result-table-tab-trajectories"'));
  assert.ok(html.includes('aria-controls="open-ena-result-table-panel"'));
  assert.ok(html.includes('role="tabpanel"'));
  assert.ok(html.includes('id="open-ena-result-table-panel"'));
  assert.ok(html.includes('aria-labelledby="open-ena-result-table-tab-trajectories"'));
  assert.ok(html.includes('aria-describedby="open-ena-result-table-reason-trajectories"'));
  assert.ok(html.includes('id="open-ena-result-table-reason-trajectories"'));
  assert.ok(html.includes("不適用於端點模型。"));
  assert.ok(html.includes("不適用"));
  const unavailableTab = html.match(/<button[^>]*id="open-ena-result-table-tab-trajectories"[^>]*>/u)?.[0] ?? "";
  assert.ok(unavailableTab.includes('aria-disabled="true"'));
  assert.ok(unavailableTab.includes('aria-describedby="open-ena-result-table-reason-trajectories"'));
  assert.ok(unavailableTab.includes('tabindex="-1"'));
  assert.doesNotMatch(unavailableTab, /\sdisabled(?:=|\s|>)/u);
});

test("Workspace isolates generic 3D axes from inference, 2D, and AI evidence consumers", () => {
  const inferenceRequest = workspace.match(
    /const inferenceRequest\s*=\s*useMemo\([\s\S]*?(?=\n  const inferencePreviewState)/,
  )?.[0] ?? "";
  const inferenceKeyAndCurrent = workspace.match(
    /const inferenceRequestKey\s*=\s*useMemo\([\s\S]*?const currentInference[^;]*;/,
  )?.[0] ?? "";
  const aiEvidence = workspace.match(
    /const aiInterpretationRequest\s*=\s*useMemo\([\s\S]*?(?=\n  const |\n  function )/,
  )?.[0] ?? "";
  const runAnalysis = workspace.match(
    /async function runAnalysis\([\s\S]*?(?=\n  async function loadSample)/,
  )?.[0] ?? "";
  const resetPlot = workspace.match(
    /function resetPlot\(\)[\s\S]*?(?=\n  function serializedPlotSvg)/,
  )?.[0] ?? "";

  assert.match(workspace, /const \[threeDDimensions, setThreeDDimensions\] = useState<OpenEnaWorkspaceAxes\["threeD"\]>\(null\)/);
  assert.match(workspace, /const groupContrastAxes = useMemo\([\s\S]*?\[xDimension, yDimension\]/);
  for (const block of [inferenceRequest, inferenceKeyAndCurrent, aiEvidence]) {
    assert.doesNotMatch(block, /threeD(?:X|Y|Z)Dimension/);
  }
  assert.match(runAnalysis, /setThreeDDimensions\(initialAxes\.threeD\)/);
  assert.match(resetPlot, /view === "3d"[\s\S]*?resetOpenEnaWorkspaceAxisSurface/);
  assert.match(workspace, /const genericThreeDAvailable = result !== null && threeDDimensions !== null/);
  assert.match(workspace, /disabled=\{[^}]*!genericThreeDAvailable[^}]*\}/);
  assert.match(
    workspace,
    /aria-describedby=\{result && !genericThreeDAvailable/,
  );
  assert.match(workspace, /copy\.plot\.threeDRequiresThreeDimensions/);
  assert.match(
    workspace,
    /function clearCompletedResult\(\)[\s\S]*?setResult\(null\)[\s\S]*?setResultConfig\(null\)[\s\S]*?setThreeDDimensions\(null\)[\s\S]*?setView\("2d"\)/,
  );
  assert.equal(
    [...workspace.matchAll(/setResult\(null\)/gu)].length,
    1,
    "every completed-result clear path must revoke the owned 3D tuple through one helper",
  );

  const threeDControls = workspace.match(
    /className="ena-three-d-axis-controls"[\s\S]*?<\/section>/,
  )?.[0] ?? "";
  assert.match(threeDControls, /threeDDimensions\[0\]/);
  assert.match(threeDControls, /threeDDimensions\[1\]/);
  assert.match(threeDControls, /threeDDimensions\[2\]/);
  assert.doesNotMatch(threeDControls, /\bxDimension\b|\byDimension\b|\bzDimension\b/);

  const generic3d = workspace.match(
    /threeDDimensions && activeGroupContrast[\s\S]*?<OpenEna3DGroupContrast[\s\S]*?<OpenEnaInteractive3DPlot[\s\S]*?\/>/,
  )?.[0] ?? "";
  assert.match(generic3d, /xDimension=\{threeDDimensions\[0\]\}/);
  assert.match(generic3d, /yDimension=\{threeDDimensions\[1\]\}/);
  assert.match(generic3d, /zDimension=\{threeDDimensions\[2\]\}/);
  assert.match(generic3d, /showTrajectories=\{false\}/);

  assert.match(workspace, /Shared \{xDimension\} × \{yDimension\} space/);
  assert.match(workspace, /methodsDimensions: \[xDimension, yDimension\]/);
});

test("Workspace keeps unavailable result tabs visible and guards CSV export", () => {
  const resultTables = workspace.match(
    /function renderResultTables\(\)[\s\S]*?(?=\n  function renderResultData)/,
  )?.[0] ?? "";

  assert.match(resultTables, /openEnaResultTableAvailability\(/);
  assert.doesNotMatch(resultTables, /\.filter\([^\n]*projectionReference/);
  assert.match(resultTables, /buildOpenEnaResultTableViewModel\(/);
  assert.match(resultTables, /<OpenEnaResultTables/);
  assert.match(resultTables, /if \(!resultTableViewModel\.export\.disabled\)/);
  assert.doesNotMatch(resultTables, /rowsToCsv\(tableMap\[resultTable\] as Row\[\]\)/);

  const wrapper = workspace.match(
    /export function OpenEnaResultTables\([\s\S]*?(?=\nexport function OpenEnaResultTablesView)/,
  )?.[0] ?? "";
  const presenter = workspace.match(
    /export function OpenEnaResultTablesView\([\s\S]*?(?=\nconst modeIcons)/,
  )?.[0] ?? "";
  assert.match(wrapper, /useState/);
  assert.match(wrapper, /useEffect/);
  assert.match(wrapper, /resolveOpenEnaResultTableRovingKey\(/);
  assert.match(wrapper, /rovingKey=\{resolvedRovingKey\}/);
  assert.match(presenter, /onFocus=\{\(\) => onRovingKeyChange\(tab\.key\)\}/);
  assert.match(presenter, /onKeyDown=/);
  assert.match(presenter, /openEnaResultTableFocusTarget\(/);
  assert.match(presenter, /onRovingKeyChange\(targetKey\)[\s\S]*?\.focus\(\)/);
  assert.match(presenter, /ownerDocument\.getElementById\([^)]*\)\?\.focus\(\)/);
  assert.doesNotMatch(presenter, /\n\s+disabled=\{tab\.disabled\}/);
  assert.match(presenter, /if \(!tab\.disabled\) onSelect\(tab\.key\)/);
});
