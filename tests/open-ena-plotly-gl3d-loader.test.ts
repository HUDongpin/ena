import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = join(import.meta.dirname, "..");

import {
  getPlotlyGl3d,
  resetPlotlyGl3dLoaderForTests,
  schedulePlotlyGl3dRole,
} from "../components/open-ena/plotly-gl3d-loader";

test("GL3D loader caches one in-flight module promise", async () => {
  resetPlotlyGl3dLoaderForTests();
  const api = {
    react: async () => {},
    relayout: async () => {},
    purge: () => {},
    toImage: async () => "",
    Plots: { resize: async () => {} },
  };
  let resolveLoad!: (value: { default: typeof api }) => void;
  const pendingLoad = new Promise<{ default: typeof api }>((resolve) => {
    resolveLoad = resolve;
  });
  const load = () => pendingLoad;
  const first = getPlotlyGl3d(load);
  const second = getPlotlyGl3d(load);
  assert.strictEqual(first, second);
  resolveLoad({ default: api });
  assert.strictEqual(await first, api);
});

test("triptych scheduling starts comparison immediately and side plots in later tasks", async () => {
  const events: string[] = [];
  const run = (role: "comparison" | "primary" | "secondary") => {
    events.push(role);
    return Promise.resolve();
  };

  await schedulePlotlyGl3dRole("comparison", run);
  assert.deepEqual(events, ["comparison"]);

  const primary = schedulePlotlyGl3dRole("primary", run);
  const secondary = schedulePlotlyGl3dRole("secondary", run);
  assert.deepEqual(events, ["comparison"]);
  await Promise.all([primary, secondary]);
  assert.deepEqual(events, ["comparison", "primary", "secondary"]);
});

test("secondary scheduled before primary waits for primary completion", async () => {
  resetPlotlyGl3dLoaderForTests();
  const events: string[] = [];
  const secondary = schedulePlotlyGl3dRole("secondary", async () => { events.push("secondary"); });
  const primary = schedulePlotlyGl3dRole("primary", async () => {
    events.push("primary-start");
    await Promise.resolve();
    events.push("primary-ready");
  });
  await Promise.all([primary, secondary]);
  assert.deepEqual(events, ["primary-start", "primary-ready", "secondary"]);
});

test("failed injected GL3D loads clear the cache so a later call retries", async () => {
  resetPlotlyGl3dLoaderForTests();
  let attempts = 0;
  const load = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("transient load failure");
    return { default: { react: async () => {}, relayout: async () => {}, purge: () => {}, toImage: async () => "", Plots: { resize: async () => {} } } };
  };
  await assert.rejects(getPlotlyGl3d(load), /transient load failure/);
  const recovered = await getPlotlyGl3d(load);
  assert.equal(attempts, 2);
  assert.equal(typeof recovered.react, "function");
});

test("PERF triptych contract stages comparison, primary, then secondary and marks all three ready", () => {
  const groupContrast = readFileSync(join(projectRoot, "components/open-ena/OpenEna3DGroupContrast.tsx"), "utf8");
  const plot = readFileSync(join(projectRoot, "components/open-ena/OpenEnaInteractive3DPlot.tsx"), "utf8");

  assert.match(groupContrast, /stage === "comparison" \? "primary" : stage/);
  assert.match(groupContrast, /stage === "primary" \? "secondary" : stage/);
  assert.match(groupContrast, /stage === "secondary" \? "all" : stage/);
  assert.match(groupContrast, /const comparisonReady = useCallback\(/);
  assert.match(groupContrast, /const primaryReady = useCallback\(/);
  assert.match(groupContrast, /const secondaryReady = useCallback\(/);
  assert.match(groupContrast, /data-ena-all-three-ready=\{centerMode === "plot" && readyRoles\.size === 3/);
  assert.match(groupContrast, /const comparisonError = useCallback\(/);
  assert.match(groupContrast, /const primaryError = useCallback\(/);
  assert.match(groupContrast, /const secondaryError = useCallback\(/);
  assert.match(groupContrast, /sidePlaceholder\("primary", contrast\.primary\.name\)/);
  assert.match(groupContrast, /sidePlaceholder\("secondary", contrast\.secondary\.name\)/);
  assert.match(groupContrast, /copy\.plot\.threeDLoading/);
  assert.match(plot, /let active = true/);
  assert.match(plot, /if \(!active\) return/);
  assert.match(plot, /readyNotifiedRef\.current/);
  assert.match(plot, /onReady\?\.\(\)/);
  assert.match(plot, /onError\?\.\(\)/);
  assert.match(plot, /data-ena-plot-status=\{status\}/);
});

test("triptych ready state follows live child status and invalidates comparison for data mode", () => {
  const groupContrast = readFileSync(join(projectRoot, "components/open-ena/OpenEna3DGroupContrast.tsx"), "utf8");
  const plot = readFileSync(join(projectRoot, "components/open-ena/OpenEnaInteractive3DPlot.tsx"), "utf8");

  assert.match(groupContrast, /onStatusChange=\{comparisonStatus\}/);
  assert.match(groupContrast, /status === "ready"/);
  assert.match(groupContrast, /if \(status === "ready"\)[\s\S]*?else next\.delete/);
  assert.match(groupContrast, /centerMode === "data"[\s\S]*?next\.delete\("comparison"\)/);
  assert.match(groupContrast, /Primary and Secondary stay mounted in Data View/);
  assert.match(groupContrast, /data-ena-all-three-ready=\{centerMode === "plot" && readyRoles\.size === 3/);
  assert.match(plot, /onStatusChange\?\.\(status\)/);
});
