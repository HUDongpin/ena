import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createOpenEnaWorkspaceAxes,
  resetOpenEnaWorkspaceAxisSurface,
  updateOpenEnaWorkspace3dAxis,
} from "../lib/open-ena/plot3d";
import {
  buildOpenEnaResultTableViewModel,
  OPEN_ENA_RESULT_TABLE_KEYS,
  openEnaResultTableAvailability,
} from "../lib/open-ena/export";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { OpenEnaResultTables } from "../components/open-ena/OpenEnaWorkspace";

const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);

type WorkspaceAxes = {
  twoD: readonly [string, string] | null;
  threeD: readonly [string, string, string] | null;
};

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
  assert.ok(model.tabs.filter((tab) => !tab.disabled).every((tab) => tab.tabIndex === 0));
  assert.ok(model.tabs.filter((tab) => tab.disabled).every((tab) => tab.tabIndex === -1));
  assert.equal(model.panel.id, "open-ena-result-table-panel");
  assert.equal(model.panel.labelledBy, "open-ena-result-table-tab-trajectories");
  assert.equal(model.panel.available, false);
  assert.equal(model.export.disabled, true);

  const html = renderToStaticMarkup(createElement(
    OpenEnaResultTables,
    { model, onSelect: () => {}, onExport: () => {} },
  ));
  assert.equal((html.match(/role="tab"/gu) ?? []).length, 7);
  assert.ok(html.includes('id="open-ena-result-table-tab-trajectories"'));
  assert.ok(html.includes('aria-controls="open-ena-result-table-panel"'));
  assert.ok(html.includes('role="tabpanel"'));
  assert.ok(html.includes('id="open-ena-result-table-panel"'));
  assert.ok(html.includes('aria-labelledby="open-ena-result-table-tab-trajectories"'));
  assert.ok(html.includes('aria-describedby="open-ena-result-table-reason-trajectories"'));
  assert.ok(html.includes('id="open-ena-result-table-reason-trajectories"'));
  assert.ok(html.includes("不適用於端點模型。"));
  assert.ok(html.includes("不適用"));
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
    /aria-describedby=\{result && completedResultKind !== "ona" && !genericThreeDAvailable/,
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
});
