import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenEnaTrajectoryAnalysisPanelV3, trajectoryAnalysisCopyV3 } from "../components/open-ena/model-v3/OpenEnaTrajectoryAnalysisPanelV3";

test("native Workspace wires trajectory collection to genuine admitted inference and current frame", () => {
  const source = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
  assert.ok(source.includes("<OpenEnaTrajectoryAnalysisPanelV3"), "native trajectory path controls are missing from actual Workspace");
  assert.ok(source.includes("value.controls"), "rank collection must retain the admitted detached controls");
  assert.ok(source.includes("frameKey={trajectoryFrameKey}"));
});
test("unavailable trajectory state exposes disabled researcher actions and localized prerequisites", () => {
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    const copy = trajectoryAnalysisCopyV3(locale);
    const html = renderToStaticMarkup(createElement(OpenEnaTrajectoryAnalysisPanelV3, { locale, hidden: false, frameKey: "no-model", result: null, plan: null, current: false, controls: null, ranks: [], confirmIdentityExport: () => { throw new Error("render must not request export permission"); } }));
    assert.ok(html.includes(copy.run)); assert.ok(html.includes(copy.export)); assert.ok(html.includes(copy.requirements));
    assert.equal((html.match(/<button[^>]+disabled=""/g) ?? []).length, 2);
    assert.match(html, /aria-live="polite"/);
    assert.doesNotMatch(html, /checked=""/);
    for (const key of ["unavailable", "stale", "exportError", "running", "exporting", "exported", "independent", "participants"] as const) {
      assert.ok(copy[key].length > 0);
      if (locale !== "en") assert.notEqual(copy[key], trajectoryAnalysisCopyV3("en")[key]);
    }
  }
});
