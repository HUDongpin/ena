import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompactTrajectoryPlotlyLayoutV3,
  cloneTrajectoryPlotlyInputV3,
} from "../lib/open-ena/longitudinal-v3-display";

test("Plotly receives a mutable deep clone while the scientific display spec stays immutable", () => {
  const marker = Object.freeze({ color: "#123456", line: Object.freeze({ color: "#ffffff" }) });
  const trace = Object.freeze({ type: "scatter3d", marker });
  const source = Object.freeze({
    data: Object.freeze([trace]),
    layout: Object.freeze({ scene: Object.freeze({ bgcolor: "transparent" }) }),
    config: Object.freeze({ responsive: true }),
  });

  const cloned = cloneTrajectoryPlotlyInputV3(source);
  const clonedMarker = cloned.data[0]!.marker as Record<string, unknown>;
  clonedMarker.color = "#abcdef";
  (clonedMarker.line as Record<string, unknown>).color = "#000000";
  (cloned.layout.scene as Record<string, unknown>).bgcolor = "#f7f7f7";

  assert.equal(clonedMarker.color, "#abcdef");
  assert.equal(marker.color, "#123456");
  assert.equal(marker.line.color, "#ffffff");
  assert.equal(source.layout.scene.bgcolor, "transparent");
});

test("compact trajectory layout moves a full-width vertical legend below the plot without mutating the envelope", () => {
  const source = Object.freeze({
    data: Object.freeze([Object.freeze({ type: "scatter3d", name: "Group A" })]),
    layout: Object.freeze({
      legend: Object.freeze({ orientation: "v", x: 1.02 }),
      margin: Object.freeze({ l: 60, r: 180, t: 40, b: 40 }),
    }),
    config: Object.freeze({ responsive: true }),
  });

  const cloned = cloneTrajectoryPlotlyInputV3(source);
  const compact = applyCompactTrajectoryPlotlyLayoutV3(cloned, true);

  assert.deepEqual(compact.layout.legend, {
    orientation: "v",
    x: 0,
    xanchor: "left",
    y: -0.08,
    yanchor: "top",
    font: { size: 10 },
    tracegroupgap: 1,
  });
  assert.deepEqual(compact.layout.margin, { l: 44, r: 12, t: 52, b: 210 });
  assert.deepEqual(source.layout.legend, { orientation: "v", x: 1.02 });
  assert.deepEqual(source.layout.margin, { l: 60, r: 180, t: 40, b: 40 });
});

test("wide trajectory layout remains byte-for-byte unchanged", () => {
  const cloned = cloneTrajectoryPlotlyInputV3({
    data: [],
    layout: { legend: { orientation: "v" }, margin: { r: 180 } },
    config: {},
  });
  const before = JSON.stringify(cloned);

  assert.equal(applyCompactTrajectoryPlotlyLayoutV3(cloned, false), cloned);
  assert.equal(JSON.stringify(cloned), before);
});
