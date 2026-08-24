import assert from "node:assert/strict";
import test from "node:test";

import { cameraForDisplay } from "../components/open-ena/OpenEnaLongitudinalWorkbenchV3";
import { cameraForPreset } from "../lib/open-ena/plot3d";
import type { CameraPreset } from "../lib/open-ena/types";

test("trajectory 3D camera presets preserve their Plotly projection mode", () => {
  const presets: CameraPreset[] = ["isometric", "xy", "xz", "yz", "yx", "zx", "zy"];

  for (const preset of presets) {
    const expected = cameraForPreset(preset);
    const actual = cameraForDisplay(preset);
    assert.deepEqual(actual, expected);
  }
  assert.equal(cameraForDisplay("isometric").projection.type, "perspective");
  for (const preset of presets.slice(1)) {
    assert.equal(cameraForDisplay(preset).projection.type, "orthographic");
  }
  assert.equal(new Set(presets.map((preset) => JSON.stringify(cameraForDisplay(preset)))).size, presets.length);
});
