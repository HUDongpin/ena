import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);

type WorkspaceAxes = {
  twoD: readonly [string, string];
  threeD: readonly [string, string, string];
};

test("generic 3D axis transitions are immutable and preserve 2D inference identity", async () => {
  const axesModule = await import("../lib/open-ena/plot3d") as unknown as {
    createOpenEnaWorkspaceAxes: (dimensions: readonly string[]) => WorkspaceAxes;
    updateOpenEnaWorkspace3dAxis: (
      axes: WorkspaceAxes,
      axis: "x" | "y" | "z",
      dimension: string,
    ) => WorkspaceAxes;
    resetOpenEnaWorkspaceAxisSurface: (
      axes: WorkspaceAxes,
      surface: "2d" | "3d",
      dimensions: readonly string[],
    ) => WorkspaceAxes;
  };

  assert.equal(typeof axesModule.createOpenEnaWorkspaceAxes, "function");
  assert.equal(typeof axesModule.updateOpenEnaWorkspace3dAxis, "function");
  assert.equal(typeof axesModule.resetOpenEnaWorkspaceAxisSurface, "function");

  const initial = axesModule.createOpenEnaWorkspaceAxes(["SVD1", "SVD2", "SVD3", "SVD4"]);
  const inferenceIdentityBefore = JSON.stringify({ axes: initial.twoD, kind: "endpoint-independent" });
  const changed3d = axesModule.updateOpenEnaWorkspace3dAxis(initial, "x", "SVD2");

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

  const reset3d = axesModule.resetOpenEnaWorkspaceAxisSurface(changed3d, "3d", ["MR1", "SVD2", "SVD3"]);
  assert.deepEqual(reset3d.twoD, changed3d.twoD);
  assert.deepEqual(reset3d.threeD, ["MR1", "SVD2", "SVD3"]);
  const reset2d = axesModule.resetOpenEnaWorkspaceAxisSurface(changed3d, "2d", ["MR1", "SVD2", "SVD3"]);
  assert.deepEqual(reset2d.twoD, ["MR1", "SVD2"]);
  assert.deepEqual(reset2d.threeD, changed3d.threeD);
});

test("result-table availability is explicit for endpoint, trajectory, and projection results", async () => {
  type TableKey =
    | "coordinates"
    | "lineWeights"
    | "connectionCounts"
    | "trajectories"
    | "centroids"
    | "nodePositions"
    | "adjacencyKey";
  type Availability = Record<TableKey, { available: boolean; reason: string | null }>;
  const exportModule = await import("../lib/open-ena/export") as unknown as {
    openEnaResultTableAvailability: (context: {
      modelType: "EndPoint" | "SeparateTrajectory" | "AccumulatedTrajectory";
      projectionReference: boolean;
    }) => Availability;
  };

  assert.equal(typeof exportModule.openEnaResultTableAvailability, "function");
  const endpoint = exportModule.openEnaResultTableAvailability({
    modelType: "EndPoint",
    projectionReference: false,
  });
  assert.equal(endpoint.trajectories.available, false);
  assert.match(endpoint.trajectories.reason ?? "", /not applicable/i);
  assert.equal(endpoint.centroids.available, true);

  for (const modelType of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const trajectory = exportModule.openEnaResultTableAvailability({
      modelType,
      projectionReference: false,
    });
    assert.equal(trajectory.trajectories.available, true);
    assert.equal(trajectory.trajectories.reason, null);
  }

  const projected = exportModule.openEnaResultTableAvailability({
    modelType: "EndPoint",
    projectionReference: true,
  });
  assert.equal(projected.centroids.available, false);
  assert.match(projected.centroids.reason ?? "", /not applicable/i);
  for (const key of [
    "coordinates",
    "lineWeights",
    "connectionCounts",
    "nodePositions",
    "adjacencyKey",
  ] as const) assert.equal(projected[key].available, true, `${key} must remain available`);
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

  assert.match(workspace, /const \[threeDXDimension, setThreeDXDimension\] = useState\("SVD1"\)/);
  assert.match(workspace, /const \[threeDYDimension, setThreeDYDimension\] = useState\("SVD2"\)/);
  assert.match(workspace, /const \[threeDZDimension, setThreeDZDimension\] = useState\("SVD3"\)/);
  assert.match(workspace, /const groupContrastAxes = useMemo\([\s\S]*?\[xDimension, yDimension\]/);
  for (const block of [inferenceRequest, inferenceKeyAndCurrent, aiEvidence]) {
    assert.doesNotMatch(block, /threeD(?:X|Y|Z)Dimension/);
  }
  assert.match(runAnalysis, /setXDimension\(x\)[\s\S]*?setYDimension\(y\)/);
  assert.match(runAnalysis, /setThreeDXDimension\(x\)[\s\S]*?setThreeDYDimension\(y\)[\s\S]*?setThreeDZDimension\(z\)/);
  assert.match(resetPlot, /view === "3d"[\s\S]*?resetOpenEnaWorkspaceAxisSurface/);

  const threeDControls = workspace.match(
    /className="ena-three-d-axis-controls"[\s\S]*?<\/section>/,
  )?.[0] ?? "";
  assert.match(threeDControls, /threeDXDimension/);
  assert.match(threeDControls, /threeDYDimension/);
  assert.match(threeDControls, /threeDZDimension/);
  assert.doesNotMatch(threeDControls, /\bxDimension\b|\byDimension\b|\bzDimension\b/);

  const generic3d = workspace.match(
    /<OpenEna3DGroupContrast[\s\S]*?<OpenEnaInteractive3DPlot[\s\S]*?\/>/,
  )?.[0] ?? "";
  assert.match(generic3d, /xDimension=\{threeDXDimension\}/);
  assert.match(generic3d, /yDimension=\{threeDYDimension\}/);
  assert.match(generic3d, /zDimension=\{threeDZDimension\}/);
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
  assert.match(resultTables, /disabled=\{!availability\[key\]\.available\}/);
  assert.match(resultTables, /availability\[key\]\.available \? tableMap\[key\]\.length : "N\/A"/);
  assert.match(resultTables, /not applicable/i);
  assert.match(resultTables, /const canExportResultTable = [^;]*available[^;]*rows\.length > 0/);
  assert.match(resultTables, /disabled=\{!canExportResultTable\}/);
  assert.match(resultTables, /if \(!canExportResultTable\) return;/);
});
