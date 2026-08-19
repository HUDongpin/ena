import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const componentPath = join(process.cwd(), "components", "open-ena", "OpenEnaLongitudinalTrajectory.tsx");

const view = {
  status: "available",
  reason: null,
  axes: ["SVD1", "SVD2"],
  coordinateExtent: { minX: -1, maxX: 1, minY: -0.8, maxY: 0.9 },
  nodes: [
    { code: "Evidence", x: -0.7, y: 0.35 },
    { code: "Reflection", x: 0.1, y: 0.75 },
    { code: "Revision", x: 0.65, y: -0.4 },
  ],
  entityPeriods: [
    { entityId: "private-student-a", group: "Studio", time: "T1", timeIndex: 0, x: -0.5, y: 0.1, sourcePointCount: 2 },
    { entityId: "private-student-a", group: "Studio", time: "T2", timeIndex: 1, x: -0.2, y: 0.3, sourcePointCount: 2 },
    { entityId: "private-student-b", group: "Seminar", time: "T1", timeIndex: 0, x: 0.42, y: -0.25, sourcePointCount: 1 },
    { entityId: "private-student-b", group: "Seminar", time: "T3", timeIndex: 2, x: 0.58, y: 0.18, sourcePointCount: 1 },
  ],
  groups: [
    {
      name: "Studio",
      entityCount: 2,
      periods: [
        { group: "Studio", time: "T1", timeIndex: 0, nTotal: 2, nUsed: 2, nExcluded: 0, centroid: { x: -0.42, y: 0.08 }, dx: null, dy: null, stepDistance: null, cumulativeDistance: 0 },
        { group: "Studio", time: "T2", timeIndex: 1, nTotal: 2, nUsed: 2, nExcluded: 0, centroid: { x: -0.18, y: 0.31 }, dx: 0.24, dy: 0.23, stepDistance: 0.332, cumulativeDistance: 0.332 },
        { group: "Studio", time: "T3", timeIndex: 2, nTotal: 1, nUsed: 1, nExcluded: 0, centroid: { x: 0.04, y: 0.43 }, dx: 0.22, dy: 0.12, stepDistance: 0.251, cumulativeDistance: 0.583 },
      ],
      segments: [
        { group: "Studio", fromTime: "T1", toTime: "T2", fromTimeIndex: 0, toTimeIndex: 1, x1: -0.42, y1: 0.08, x2: -0.18, y2: 0.31, dx: 0.24, dy: 0.23, distance: 0.332, cumulativeDistance: 0.332 },
        { group: "Studio", fromTime: "T2", toTime: "T3", fromTimeIndex: 1, toTimeIndex: 2, x1: -0.18, y1: 0.31, x2: 0.04, y2: 0.43, dx: 0.22, dy: 0.12, distance: 0.251, cumulativeDistance: 0.583 },
      ],
      cumulativeDistance: 0.583,
    },
    {
      name: "Seminar",
      entityCount: 1,
      periods: [
        { group: "Seminar", time: "T1", timeIndex: 0, nTotal: 1, nUsed: 1, nExcluded: 0, centroid: { x: 0.42, y: -0.25 }, dx: null, dy: null, stepDistance: null, cumulativeDistance: 0 },
        { group: "Seminar", time: "T2", timeIndex: 1, nTotal: 0, nUsed: 0, nExcluded: 1, centroid: null, dx: null, dy: null, stepDistance: null, cumulativeDistance: 0 },
        { group: "Seminar", time: "T3", timeIndex: 2, nTotal: 1, nUsed: 1, nExcluded: 0, centroid: { x: 0.58, y: 0.18 }, dx: null, dy: null, stepDistance: null, cumulativeDistance: 0 },
      ],
      segments: [],
      cumulativeDistance: 0,
    },
  ],
  periodDiagnostics: [] as unknown[],
  timeOrder: ["T1", "T2", "T3"],
  cohortPolicy: "available",
  availableEntityCount: 3,
  completeEntityCount: 1,
  includedEntityCount: 3,
  geometry: {
    variance: { SVD1: 0.412, SVD2: 0.273 },
  },
  provenance: {},
};
view.periodDiagnostics = [
  ...view.groups[0].periods,
  ...view.groups[1].periods,
];

const defaultProps = {
  trajectory: view,
  showIndividualPaths: true,
  showGroupCentroidPaths: true,
  showPoints: true,
  showLabels: true,
  showVariance: true,
  pointScale: 1,
  plotZoom: 1,
  flipX: false,
  flipY: false,
};

async function render(overrides: Record<string, unknown> = {}) {
  assert.ok(existsSync(componentPath), "the isolated longitudinal trajectory component must exist");
  const { default: OpenEnaLongitudinalTrajectory } = await import("../components/open-ena/OpenEnaLongitudinalTrajectory");
  return renderToStaticMarkup(createElement(OpenEnaLongitudinalTrajectory, {
    ...defaultProps,
    ...overrides,
  } as never));
}

test("renders one accessible fixed-geometry 2D longitudinal research figure", async () => {
  const markup = await render();

  assert.match(markup, /<figure[^>]*data-testid="open-ena-longitudinal-trajectory"[^>]*tabindex="0"/);
  assert.match(markup, /aria-label="Group-centroid trajectory plot\. Scroll horizontally on small screens\."/);
  assert.match(markup, /<svg[^>]*viewBox="0 0 920 590"[^>]*role="img"[^>]*aria-labelledby="[^"]+"/);
  assert.match(markup, /<title[^>]*>Group-centroid longitudinal trajectory/);
  assert.match(markup, /<desc[^>]*>[^<]*fixed two-dimensional jENA geometry/i);
  assert.match(markup, /data-ena-dimensions="2"/);
  assert.match(markup, /Available cohort/);
  assert.match(markup, /Descriptive only/);
  assert.match(markup, /Available entities<\/dt><dd>3<\/dd>/);
  assert.match(markup, /Complete entities<\/dt><dd>1<\/dd>/);
  assert.match(markup, /Included entities<\/dt><dd>3<\/dd>/);
  assert.match(markup, /SVD1 · 41\.2%/);
  assert.match(markup, /SVD2 · 27\.3%/);
  assert.match(markup, />Evidence<\/text>/);
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|-Infinity)\b/);
});

test("independent individual and centroid layers render together with non-color group encodings", async () => {
  const both = await render();
  assert.match(both, /class="ena-individual-trajectory-path"/);
  assert.match(both, /class="ena-group-centroid-path"/);
  assert.match(both, /data-ena-group-shape="circle"/);
  assert.match(both, /data-ena-group-shape="diamond"/);
  assert.match(both, /data-ena-line-style="solid"/);
  assert.doesNotMatch(both, /class="ena-(?:individual-trajectory|group-centroid)-path"[^>]*stroke-dasharray=/);
  assert.match(both, /class="ena-individual-trajectory-path"[^>]*stroke="#3366cc"[^>]*data-ena-group-index="0"/);
  assert.match(both, /data-ena-group-shape="diamond"[^>]*style="color:#dc3912"/);
  assert.match(both, /marker-end="url\(#/);

  const centroidsOnly = await render({ showIndividualPaths: false });
  assert.doesNotMatch(centroidsOnly, /ena-individual-trajectory-path/);
  assert.match(centroidsOnly, /ena-group-centroid-path/);

  const individualsOnly = await render({ showGroupCentroidPaths: false });
  assert.match(individualsOnly, /ena-individual-trajectory-path/);
  assert.doesNotMatch(individualsOnly, /class="ena-group-centroid-path"/);
  assert.doesNotMatch(individualsOnly, /Larger outlined marker|Arrow = observed time direction|<marker /);

  const pointsOnly = await render({ showIndividualPaths: false, showGroupCentroidPaths: false });
  assert.match(pointsOnly, /Studio: circle marker<\/span>/);
  assert.doesNotMatch(pointsOnly, /Studio: circle marker, solid path/);
});

test("missing periods are explicit gaps and are never bridged", async () => {
  const markup = await render();
  assert.match(markup, /Seminar · T2<\/th><td>0<\/td><td>1<\/td><td>Gap<\/td>/);
  assert.match(markup, /No segment bridges a missing period/);
  assert.doesNotMatch(markup, /data-ena-from-time="T1"[^>]*data-ena-to-time="T3"/);
  assert.match(markup, /<caption>Group-by-period centroid diagnostics<\/caption>/);
  assert.match(markup, /<th[^>]*scope="col"[^>]*>n used<\/th>/);
  assert.match(markup, /<th[^>]*scope="col"[^>]*>n excluded<\/th>/);
  assert.match(markup, /<th[^>]*scope="row"[^>]*>Seminar · T2<\/th>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?Gap/);
});

test("zero adjacent contributor overlap is disclosed as a discontinuity", async () => {
  const noOverlapView = structuredClone(view);
  const period = noOverlapView.groups[0].periods[1] as unknown as {
    contributorOverlapWithPrevious: number;
    continuityStatus: string;
  };
  period.contributorOverlapWithPrevious = 0;
  period.continuityStatus = "no-contributor-overlap";
  noOverlapView.groups[0].segments = noOverlapView.groups[0].segments.filter((segment) => segment.toTime !== "T2");
  const markup = await render({ trajectory: noOverlapView });
  assert.match(markup, /Studio · T2<\/th><td>2<\/td><td>0<\/td><td>No shared contributors<\/td>/);
  assert.match(markup, /zero shared repeated entities/);
  assert.doesNotMatch(markup, /data-ena-from-time="T1"[^>]*data-ena-to-time="T2"/);
});

test("plot presenter state controls labels, points, flips, zoom, and variance without exposing identities", async () => {
  const markup = await render({
    showPoints: false,
    showLabels: false,
    showVariance: false,
    pointScale: 1.7,
    plotZoom: 1.8,
    flipX: true,
    flipY: true,
  });

  assert.match(markup, /data-ena-flip-x="true"/);
  assert.match(markup, /data-ena-flip-y="true"/);
  assert.match(markup, /data-ena-plot-zoom="1\.8"/);
  assert.match(markup, /SVD1 · flipped/);
  assert.match(markup, /SVD2 · flipped/);
  assert.doesNotMatch(markup, /data-ena-individual-point/);
  assert.doesNotMatch(markup, />Evidence<\/text>|>T1<\/text>|41\.2%|27\.3%/);
  assert.doesNotMatch(markup, /private-student|entityId/i);
});

test("individual identifiers stay out of markup and graphical marks are deterministically bounded", async () => {
  const largeView = structuredClone(view);
  largeView.entityPeriods = Array.from({ length: 2_500 }, (_, index) => ({
    entityId: `private-entity-${index}`,
    group: index % 2 ? "Studio" : "Seminar",
    time: `T${index % 3 + 1}`,
    timeIndex: index % 3,
    x: (index % 100) / 100 - 0.5,
    y: (index % 80) / 80 - 0.5,
    sourcePointCount: 1,
  }));
  largeView.entityPeriods[2_499].group = "Small retained group";
  const first = await render({ trajectory: largeView });
  const second = await render({ trajectory: largeView });

  assert.equal(first, second, "bounded selection and SVG identifiers must be deterministic during static rendering");
  assert.match(first, /data-ena-entity-marks-total="2500"/);
  const shown = Number(first.match(/data-ena-entity-marks-shown="(\d+)"/)?.[1] ?? Number.NaN);
  assert.ok(Number.isFinite(shown) && shown > 0 && shown <= 2_000);
  assert.ok((first.match(/data-ena-individual-point="true"/g) ?? []).length <= 2_000);
  assert.match(first, /Individual plot marks are sampled:/);
  assert.match(first, /<desc[^>]*>[^<]*Individual plot marks are sampled:/);
  assert.match(first, /data-ena-sampling-strategy="deterministic-stratified-by-group"/);
  assert.match(first, /groupCentroidPathsComplete/);
  assert.match(first, /data-ena-individual-segments-total="[^"]+"/);
  assert.match(first, /data-ena-individual-segments-shown="[^"]+"/);
  assert.match(first, /Small retained group/, "stratified sampling must retain a mark from a small group");
  assert.doesNotMatch(first, /private-entity-/);
});

test("scientific group-centroid paths are never silently sampled", async () => {
  const manyPeriods = structuredClone(view);
  const periodCount = 2_102;
  manyPeriods.timeOrder = Array.from({ length: periodCount }, (_, index) => `T${index + 1}`);
  manyPeriods.groups = [{
    name: "Studio",
    entityCount: 1,
    periods: manyPeriods.timeOrder.map((time, index) => ({
      group: "Studio",
      time,
      timeIndex: index,
      nTotal: 1,
      nUsed: 1,
      nExcluded: 0,
      centroid: { x: index / periodCount, y: index / periodCount },
      dx: index ? 1 / periodCount : null,
      dy: index ? 1 / periodCount : null,
      stepDistance: index ? Math.SQRT2 / periodCount : null,
      cumulativeDistance: index * Math.SQRT2 / periodCount,
    })),
    segments: manyPeriods.timeOrder.slice(1).map((time, index) => ({
      group: "Studio",
      fromTime: manyPeriods.timeOrder[index],
      toTime: time,
      fromTimeIndex: index,
      toTimeIndex: index + 1,
      x1: index / periodCount,
      y1: index / periodCount,
      x2: (index + 1) / periodCount,
      y2: (index + 1) / periodCount,
      dx: 1 / periodCount,
      dy: 1 / periodCount,
      distance: Math.SQRT2 / periodCount,
      cumulativeDistance: (index + 1) * Math.SQRT2 / periodCount,
    })),
    cumulativeDistance: (periodCount - 1) * Math.SQRT2 / periodCount,
  }] as never;
  manyPeriods.periodDiagnostics = manyPeriods.groups[0].periods;

  const markup = await render({ trajectory: manyPeriods, showPoints: false, showIndividualPaths: false });
  assert.equal((markup.match(/class="ena-group-centroid-path"/g) ?? []).length, periodCount - 1);
  assert.equal((markup.match(/data-ena-group-centroid="true"/g) ?? []).length, periodCount);
  assert.match(markup, new RegExp(`data-ena-centroid-segments-total="${periodCount - 1}"`));
  assert.match(markup, new RegExp(`data-ena-centroid-segments-shown="${periodCount - 1}"`));
  assert.doesNotMatch(markup, /Group-centroid plot marks are sampled/);
});

test("the longitudinal figure has an accessible legend, table, and isolated responsive CSS", async () => {
  const markup = await render();
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const marker = "/* Longitudinal group-centroid trajectories: fixed 2D jENA geometry. */";
  const markerIndex = css.lastIndexOf(marker);

  assert.match(markup, /aria-label="Longitudinal trajectory legend"/);
  assert.match(markup, /Studio: circle marker, solid path/);
  assert.match(markup, /Seminar: diamond marker, solid path/);
  assert.match(markup, /Larger outlined marker = group-period centroid/);
  assert.match(markup, /Arrow = selected period direction/);
  assert.match(markup, /No endpoint Mann–Whitney or Welch test is applied/);
  assert.ok(markerIndex >= 0, "longitudinal styles must be appended in their own isolated section");
  const longitudinalCss = css.slice(markerIndex);
  assert.match(longitudinalCss, /\.open-ena-longitudinal-trajectory\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
  assert.match(longitudinalCss, /\.ena-longitudinal-table-wrap\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(longitudinalCss, /\.open-ena-longitudinal-trajectory:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(longitudinalCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.open-ena-longitudinal-trajectory\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.match(longitudinalCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.open-ena-longitudinal-svg\s*\{[\s\S]*?width:\s*700px;[\s\S]*?max-width:\s*none;/);
});

test("visible and accessible prose accepts locale copy from the Open ENA translation layer", async () => {
  const { getOpenEnaCopy } = await import("../lib/open-ena-i18n");
  const localized = getOpenEnaCopy("zh-hant").longitudinal;
  const markup = await render({
    copy: {
      ...localized,
      figureAriaLabel: "群組質心軌跡圖；小螢幕可水平捲動。",
      geometryView: "軌跡幾何視圖",
      diagnosticsCaption: "群組與期間質心診斷",
      nUsed: "使用數",
      nExcluded: "排除數",
      status: "狀態",
      gap: "缺口",
      observed: "已觀察",
      gapRule: "缺失期間或相鄰期間沒有共同重複實體時，均不連線。",
      legendAriaLabel: "縱向軌跡圖例",
    },
  });

  assert.match(markup, /aria-label="群組質心軌跡圖；小螢幕可水平捲動。"/);
  assert.match(markup, /<title[^>]*>縱向群組質心路徑<\/title>/);
  assert.match(markup, /軌跡幾何視圖/);
  assert.match(markup, /群組與期間質心診斷/);
  assert.match(markup, /沒有共同重複實體時，均不連線。/);
  assert.match(markup, /aria-label="縱向軌跡圖例"/);
  assert.match(markup, /箭頭＝所選期間方向/);
});
