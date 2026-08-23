import assert from "node:assert/strict";
import test from "node:test";

import { cloneTrajectoryPlotlyInputV3 } from "../lib/open-ena/longitudinal-v3-display";

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
