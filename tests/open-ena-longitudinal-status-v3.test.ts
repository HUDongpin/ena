import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getOpenEnaLongitudinalV3Copy } from "../components/open-ena/OpenEnaLongitudinalWorkbenchV3";

const statuses = ["initializing", "ready", "preparing", "running", "remote-confirmation", "remote-recovery", "complete", "error"] as const;
const component = readFileSync(new URL("../components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", import.meta.url), "utf8");

for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
  test(`${locale} translates every execution status with a distinct completion label`, () => {
    const copy = getOpenEnaLongitudinalV3Copy(locale);
    const labels = Reflect.get(copy, "workbenchStatus") as Record<string, string> | undefined;
    assert.ok(labels, "every locale needs a typed, complete execution-status mapping");
    assert.deepEqual(Object.keys(labels).sort(), [...statuses].sort());
    for (const status of statuses) {
      assert.ok(labels[status]?.trim());
      assert.notEqual(labels[status], status);
      if (locale !== "en") assert.match(labels[status]!, /[\p{Script=Han}]/u);
    }
    assert.notEqual(labels.complete, copy.complete, "execution completion cannot reuse the cohort label");
  });
}

test("visible live status uses the locale mapping instead of an internal state fallback", () => {
  assert.equal(/<strong>\{copy\.workbenchStatus\[status\]\}<\/strong>/.test(component), true);
  assert.doesNotMatch(component, /status === "ready" \? copy\.ready : status/);
});

test("initial binding preparation also uses the complete locale status mapping", () => {
  assert.equal(/<p role="status">\{error \?\? copy\.workbenchStatus\[status\]\}<\/p>/.test(component), true);
});

test("standalone trajectory CSV downloads pass through the UTF-8 text download boundary", () => {
  const download = component.slice(component.indexOf("function downloadBlob("), component.indexOf("/** Decode Plotly's data URL"));
  assert.equal(/typeof value === "string"\s*\? createOpenEnaTextDownloadBlob\(value, type\)/.test(download), true);
});
