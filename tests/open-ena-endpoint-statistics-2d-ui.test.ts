import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as panels from "../components/open-ena/model-v3/OpenEnaNativeStatsPanelV3";
import { restoredWorkbenchCopy } from "../components/open-ena/workbench-restoration-copy";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

test("a rank-one endpoint reports the two-axis boundary instead of calculating forever", () => {
  const Goodness = Reflect.get(panels, "OpenEnaEndpointGoodness2D") as ComponentType<Record<string, unknown>>;
  assert.equal(typeof Goodness, "function");
  const html = renderToStaticMarkup(createElement(Goodness, { goodness: null, current: true, axisCount: 1,
    copy: getOpenEnaCopy("en").stats, cardCopy: restoredWorkbenchCopy("en").comparisonCards,
    nativeCopy: panels.nativeStatsCopyV3 }));
  assert.match(html, /requires two supported axes/);
  assert.doesNotMatch(html, /Calculating/);
});

test("2D Welch cards show n, moments, df and raw p; plotted sign affects coordinates only", () => {
  const Cards = Reflect.get(panels, "OpenEnaEndpointWelchCards2D") as ComponentType<Record<string, unknown>>;
  assert.equal(typeof Cards, "function");
  const rows = [{ axis: "SVD2", status: "available", nPrimary: 3, nSecondary: 3,
    meanPrimary: 2, meanSecondary: 3, sdPrimary: 1, sdSecondary: 1,
    t: -1.224744871391589, df: 4, p: 0.2878641347266908, cohensD: 1 }];
  const before = JSON.stringify(rows);
  const html = renderToStaticMarkup(createElement(Cards, { rows, copy: restoredWorkbenchCopy("en").comparisonCards, axisSigns: { SVD2: -1 } }));
  assert.match(html, /Welch/); assert.match(html, /0\.2879/); assert.match(html, /1\.2247/);
  assert.match(html, />-2</); assert.match(html, />-3</); assert.match(html, /Standard deviation/);
  assert.equal(JSON.stringify(rows), before);
});
test("2D nonparametric cards expose webENA minimum U and absolute r without changing signed inference", () => {
  const Cards = Reflect.get(panels, "OpenEnaEndpointMannWhitneyCards2D") as ComponentType<Record<string, unknown>>;
  assert.equal(typeof Cards, "function");
  const rows = [{ axis: "SVD2", status: "available", nPrimary: 45, nSecondary: 42,
    uPrimary: 964, uSecondary: 926, pRaw: 0.8751, pHolm: 1,
    rankBiserialPrimaryVsSecondary: 0.02010582010582, medianPrimary: 0.0006, medianSecondary: 0 }];
  const before = JSON.stringify(rows);
  const html = renderToStaticMarkup(createElement(Cards, { rows, copy: restoredWorkbenchCopy("en").comparisonCards, axisSigns: { SVD2: -1 } }));
  assert.match(html, />926</); assert.match(html, /0\.8751/); assert.match(html, /0\.0201/); assert.match(html, /-0\.0006/);
  assert.match(html, /minimum/i); assert.match(html, /absolute/i);
  assert.equal(JSON.stringify(rows), before);
});
