import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const smokePath = join(process.cwd(), "tests", "open-ena-inference-browser-smoke.mjs");

test("inference smoke waits for the rebuilt model's Download Model action to become enabled", () => {
  const source = readFileSync(smokePath, "utf8");
  assert.match(source, /rebuild the same fixture as Separate trajectory/u);
  assert.match(
    source,
    /const downloadModel = page\.getByRole\("button", \{ name: "Download Model" \}\);[\s\S]*?downloadModel\.waitFor\(\{ state: "visible"/u,
    "the rebuilt model smoke must wait for the Download Model action to remount",
  );
  assert.match(
    source,
    /const downloadModelReady = page\.locator\("\.ena-download-model-button:not\(\[disabled\]\)"\);[\s\S]*?downloadModelReady\.waitFor\(\{ state: "visible"/u,
    "the rebuilt model smoke must wait for the product's ready, enabled Download Model action",
  );
  assert.match(source, /await downloadModel\.click\(\{ trial: true, timeout: 30000 \}\)/u);
});
