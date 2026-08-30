import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const smokePath = join(process.cwd(), "tests", "open-ena-inference-browser-smoke.mjs");

test("inference smoke waits for the rebuilt trajectory V3 workbench to become ready", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /rebuild the same fixture as Separate trajectory/u);
  const trajectoryPhase = source.match(
    /const trajectoryModel = runBrowserPhase\("rebuild the same fixture as Separate trajectory", `([\s\S]*?)`\);/u,
  )?.[1];
  assert.ok(trajectoryPhase, "the trajectory rebuild phase could not be located");
  assert.match(
    trajectoryPhase,
    /getByRole\("heading", \{ name: "Define the ENA model", exact: true \}\)\.waitFor\(\{ state: "visible"/u,
    "the trajectory rebuild smoke must wait for the Model panel to mount",
  );
  assert.match(
    trajectoryPhase,
    /const windowsTab = page\.getByRole\("tab", \{ name: "Windows", exact: true \}\);[\s\S]*?windowsTab\.waitFor\(\{ state: "visible"/u,
    "the trajectory rebuild smoke must wait for the Windows tab to mount",
  );
  assert.match(
    trajectoryPhase,
    /const modelType = page\.getByRole\("combobox", \{ name: "Model type" \}\);[\s\S]*?modelType\.waitFor\(\{ state: "visible"/u,
    "the trajectory rebuild smoke must wait for the Model type control to mount",
  );
  assert.match(
    trajectoryPhase,
    /const trajectoryWorkbench = page\.locator\('\[data-testid="open-ena-longitudinal-v3-workbench"\]'\);[\s\S]*?trajectoryWorkbench\.waitFor\(\{ state: "visible"/u,
    "the rebuilt model smoke must wait for the dedicated V3 workbench to mount",
  );
  assert.match(
    trajectoryPhase,
    /trajectoryWorkbench[\s\S]*?section\[data-trajectory-step="10"\] \.ena-longitudinal-v3-run-status \[data-state="ready"\][\s\S]*?waitFor\(\{ state: "visible"/u,
    "the rebuilt model smoke must wait for V3 initialization to become ready",
  );
  assert.match(
    trajectoryPhase,
    /const selectedModelType = await modelType\.inputValue\(\);[\s\S]*?return \{ modelType: selectedModelType \};/u,
    "the trajectory rebuild smoke must retain the selected model type before the Model panel is unmounted",
  );
  assert.doesNotMatch(
    trajectoryPhase,
    /Download Model/u,
    "the trajectory rebuild phase must not depend on the endpoint-only Download Model toolbar",
  );
});
