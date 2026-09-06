import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenEnaNativeStatsPanelV3 } from "../components/open-ena/model-v3/OpenEnaNativeStatsPanelV3";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { moduleSourceV3, workspaceV3Source } from "./helpers/open-ena-workspace-v3-ui";

const native = moduleSourceV3("components/open-ena/model-v3/OpenEnaNativeStatsPanelV3.tsx");
test("native Stats retains the three accessible official views with Comparison initially selected", () => {
  const html = renderToStaticMarkup(createElement(OpenEnaNativeStatsPanelV3, { result: null, current: false, axes: [], inference: null, copy: getOpenEnaCopy("en").stats, children: "Researcher-confirmed comparison controls", renderTable: () => null }));
  assert.equal((html.match(/role="tab"/gu) ?? []).length, 3);
  for (const label of Object.values(getOpenEnaCopy("en").stats.tabs)) assert.ok(html.includes(label));
  assert.match(html, /aria-selected="true"[^>]*data-ena-stats-tab="comparison"/u);
  assert.match(html, /role="tabpanel"/u); assert.match(html, /data-ena-stats-panel="comparison"/u);
  assert.doesNotMatch(html, /p-value|correlation test is computed/u);
});
test("native Stats uses explicit admitted inference and preserves full local currentness independently of plot display", () => {
  assert.match(workspaceV3Source, /runOpenEnaInferenceV3\(/u);
  assert.match(workspaceV3Source, /runOpenEnaTrajectoryInferenceV3\(/u);
  assert.doesNotMatch(workspaceV3Source, /runOpenEnaInferenceV2|result\.stats|renderJenaTestContent/u);
  const key = workspaceV3Source.split("const consumerKey =")[1].split(";", 1)[0];
  assert.match(key, /binding:|currentPlan|controls/u); assert.doesNotMatch(key, /flipX|plotZoom|showLabels|edgeScale/u);
  assert.match(native, /nativeStatisticsTablesV3\(inference\)/u);
});
test("unavailable correlations remain explicit and variance uses only the selected bound axes", () => {
  assert.match(native, /Correlation goodness-of-fit statistics are unavailable/u);
  assert.match(native, /axes\.filter/u); assert.match(native, /result\.set\.variance\[axis\]/u);
  assert.doesNotMatch(native, /\.stats\.correlations|\.stats\.tests/u);
  assert.match(workspaceV3Source, /exportNativeStatisticsV3/u);
  assert.match(workspaceV3Source, /exportCurrentAnalysisV3/u);
  assert.match(workspaceV3Source, /buildMethodsReportV3/u);
});
test("Stats tab keyboard navigation and existing locale catalog remain available", () => {
  for (const key of ["Home", "End", "ArrowRight", "ArrowLeft"]) assert.ok(native.includes(`"${key}"`));
  assert.match(native, /document\.getElementById[\s\S]*?\.focus\(/u);
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) for (const value of Object.values(getOpenEnaCopy(locale).stats.ui)) assert.ok(value.trim());
});
