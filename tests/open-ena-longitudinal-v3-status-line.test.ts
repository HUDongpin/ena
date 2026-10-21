import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OpenEnaLongitudinalWorkbenchStatusLine,
  getOpenEnaLongitudinalV3Copy,
} from "../components/open-ena/OpenEnaLongitudinalWorkbenchV3";

const STATUSES = [
  "initializing",
  "ready",
  "preparing",
  "running",
  "remote-confirmation",
  "remote-recovery",
  "complete",
  "error",
] as const;

const EXPECTED = {
  en: {
    initializing: "Preparing the fitted-result binding…",
    ready: "Ready to run",
    preparing: "Preparing the trajectory task",
    running: "Running trajectory analysis",
    "remote-confirmation": "Waiting for persistent-compute confirmation",
    "remote-recovery": "Persistent compute stopped before finishing",
    complete: "Trajectory analysis finished",
    error: "Trajectory analysis failed",
  },
  "zh-hans": {
    initializing: "正在准备拟合结果绑定……",
    ready: "可以运行",
    preparing: "正在准备",
    running: "正在运行",
    "remote-confirmation": "等待确认持久计算",
    "remote-recovery": "持久计算未能完成",
    complete: "已完成",
    error: "出错",
  },
  "zh-hant": {
    initializing: "正在準備擬合結果綁定……",
    ready: "可以運行",
    preparing: "正在準備",
    running: "正在執行",
    "remote-confirmation": "等待確認持久計算",
    "remote-recovery": "持久計算未能完成",
    complete: "已完成",
    error: "出錯",
  },
} as const;

test("each trajectory workbench status renders localized live-region text", () => {
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    const copy = getOpenEnaLongitudinalV3Copy(locale);
    assert.notEqual(copy.runStateComplete, copy.complete, `${locale} run completion must not reuse the complete-cohort label`);
    for (const status of STATUSES) {
      const html = renderToStaticMarkup(createElement(OpenEnaLongitudinalWorkbenchStatusLine, {
        copy,
        status,
        progress: status === "preparing" || status === "running" ? 0.4 : undefined,
        cacheHit: status === "complete",
      }));
      const expected = EXPECTED[locale][status];
      assert.match(html, /role="status"/);
      assert.match(html, /aria-live="polite"/);
      assert.match(html, new RegExp(`data-state="${status}"`));
      assert.match(html, new RegExp(`<strong>${expected}</strong>`));
      assert.doesNotMatch(html, new RegExp(`<strong>${status}</strong>`));
      if (locale !== "en") assert.notEqual(expected, EXPECTED.en[status]);
      if (status === "preparing" || status === "running") assert.match(html, /<progress/);
      else assert.doesNotMatch(html, /<progress/);
      if (status === "complete") assert.match(html, new RegExp(copy.cacheHit));
    }
  }
});
