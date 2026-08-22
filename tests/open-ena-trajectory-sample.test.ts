import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import {
  buildLongitudinalGroupCentroidView,
  inferLongitudinalMappingDefaults,
} from "../lib/open-ena/longitudinal";
import {
  TRAJECTORY_SAMPLE_CONFIG,
  TRAJECTORY_SAMPLE_DATASET_URL,
} from "../lib/open-ena/types";

const projectRoot = process.cwd();

test("the bundled 2D trajectory sample produces complete TP1 to TP3 group and individual paths", async () => {
  assert.equal(TRAJECTORY_SAMPLE_DATASET_URL, "/data/academy/ena-2d-trajectory-teaching-sample.csv");
  const text = readFileSync(join(projectRoot, "public", TRAJECTORY_SAMPLE_DATASET_URL), "utf8");
  const dataset = parseCsv(text, { name: "ena-2d-trajectory-teaching-sample.csv", source: "sample" });
  assert.equal(dataset.rows.length, 54);

  const result = analyzeDataset(dataset, TRAJECTORY_SAMPLE_CONFIG);
  assert.equal(result.set.modelType, "SeparateTrajectory");
  assert.equal(result.set.points.length, 18);
  assert.deepEqual(inferLongitudinalMappingDefaults(TRAJECTORY_SAMPLE_CONFIG), {
    repeatedEntityColumn: "Speaker",
    timeColumn: "Period",
  });

  const view = buildLongitudinalGroupCentroidView(result, TRAJECTORY_SAMPLE_CONFIG, dataset, {
    repeatedEntityColumns: ["Speaker"],
    identityConfirmed: true,
    timeColumn: "Period",
    timeOrder: ["TP1", "TP2", "TP3"],
    cohortPolicy: "complete",
    axes: ["SVD1", "SVD2"],
    datasetNormalizedUtf8TextSha256: null,
  });

  assert.deepEqual(view.timeOrder, ["TP1", "TP2", "TP3"]);
  assert.equal(view.availableEntityCount, 6);
  assert.equal(view.completeEntityCount, 6);
  assert.equal(view.includedEntityCount, 6);
  assert.deepEqual(view.groups.map((group) => group.name), ["G1", "G2"]);
  assert.deepEqual(view.groups.map((group) => group.segments.length), [2, 2]);
  assert.equal(view.groups.flatMap((group) => group.segments).length, 4);
  assert.equal(view.entityPeriods.length, 18);
  assert.ok(view.groups.every((group) => group.segments.every((segment) => segment.distance > 0)));
  const [firstGroup, secondGroup] = view.groups;
  assert.ok(
    firstGroup.periods.some((period, index) => {
      const other = secondGroup.periods[index];
      if (!period.centroid || !other.centroid) return false;
      return Math.hypot(
        period.centroid.x - other.centroid.x,
        period.centroid.y - other.centroid.y,
      ) > 1e-6;
    }),
    "the two teaching groups must produce visibly distinct centroid trajectories",
  );
  assert.ok(
    view.groups.some((group) => view.timeOrder.some((time) => (
      new Set(
        view.entityPeriods
          .filter((period) => period.group === group.name && period.time === time)
          .map((period) => `${period.x.toFixed(8)}|${period.y.toFixed(8)}`),
      ).size > 1
    ))),
    "the teaching sample must expose real within-group individual path variation",
  );

  const { default: OpenEnaLongitudinalTrajectory } = await import(
    "../components/open-ena/OpenEnaLongitudinalTrajectory"
  );
  const markup = renderToStaticMarkup(createElement(OpenEnaLongitudinalTrajectory, {
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
  }));

  assert.equal((markup.match(/class="ena-group-centroid-path"/g) ?? []).length, 2);
  assert.equal((markup.match(/class="ena-group-centroid-direction-arrow"/g) ?? []).length, 4);
  assert.equal((markup.match(/class="ena-individual-trajectory-path"/g) ?? []).length, 6);
  assert.equal(
    (markup.match(/data-ena-time-index-sequence="0,1,2"/g) ?? []).length,
    8,
    "all six individual paths and both group-centroid paths must span TP1 through TP3",
  );
  assert.equal(
    (markup.match(/class="ena-individual-direction-arrow"/g) ?? []).length,
    12,
    "each learner needs one visible direction arrow for both TP transitions",
  );
  assert.match(markup, />TP1<\/text>/);
  assert.match(markup, />TP2<\/text>/);
  assert.match(markup, />TP3<\/text>/);
});

test("the Data panel exposes the synthetic TP1 to TP3 sample without enabling native RData upload", () => {
  const workspace = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");
  const copy = readFileSync(join(projectRoot, "lib", "open-ena-i18n.ts"), "utf8");

  assert.match(workspace, /loadTrajectorySample/);
  assert.match(workspace, /copy\.data\.trajectorySample/);
  assert.match(copy, /trajectorySample:\s*"Load 2D trajectory sample"/);
  assert.match(copy, /TP1(?:–|-)TP3/);
  assert.doesNotMatch(workspace, /accept="[^"]*\.RData/i);
});
