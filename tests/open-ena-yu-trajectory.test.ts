import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { inferConfig, parseCsv } from "../lib/open-ena/csv";
import { buildLongitudinalGroupCentroidView } from "../lib/open-ena/longitudinal";
import * as longitudinalApi from "../lib/open-ena/longitudinal";
import type { OpenEnaConfig } from "../lib/open-ena/types";

function yuStyleDataset() {
  return parseCsv(
    [
      "Group,Lesson,Name,EC,ICT,MCO,NI,SR,SC,ATT",
      "Control,Lesson 1,Student 1,1,1,0,0,0,0,0",
      "Control,Lesson 2,Student 1,1,0,1,0,0,0,0",
      "Control,Lesson 1,Student 2,0,1,1,0,0,0,1",
      "Control,Lesson 2,Student 2,1,0,0,1,0,1,0",
      "Experimental,Lesson 1,Student 1,0,0,1,1,1,0,0",
      "Experimental,Lesson 2,Student 1,0,1,0,1,0,1,1",
      "Experimental,Lesson 1,Student 2,1,1,0,0,0,1,0",
      "Experimental,Lesson 2,Student 2,1,1,1,0,1,0,0",
    ].join("\n") + "\n",
    { name: "Yu_ena_coded_data_0712.csv", source: "upload" },
  );
}

test("Yu 0712 headers infer group-scoped people, lesson horizons, and binary codes", () => {
  const config = inferConfig(yuStyleDataset());

  assert.deepEqual(config.unitColumns, ["Group", "Name"]);
  assert.deepEqual(config.conversationColumns, ["Group", "Name", "Lesson"]);
  assert.equal(config.groupColumn, "Group");
  assert.deepEqual(config.codes, ["EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"]);
});

test("trajectory mapping defaults prefer the person and time fields over composite namespace fields", () => {
  const config = inferConfig(yuStyleDataset());
  const api = longitudinalApi as typeof longitudinalApi & {
    inferLongitudinalMappingDefaults?: (value: OpenEnaConfig) => {
      repeatedEntityColumn: string;
      timeColumn: string;
    };
  };

  assert.equal(typeof api.inferLongitudinalMappingDefaults, "function");
  if (!api.inferLongitudinalMappingDefaults) return;
  assert.deepEqual(api.inferLongitudinalMappingDefaults(config), {
    repeatedEntityColumn: "Name",
    timeColumn: "Lesson",
  });
});

test("trajectory analysis treats same-looking student names as group-local repeated entities", () => {
  const dataset = yuStyleDataset();
  const inferred = inferConfig(dataset);
  const config: OpenEnaConfig = {
    ...inferred,
    model: "SeparateTrajectory",
    window: "Conversation",
    rotation: "svd",
  };
  const result = analyzeDataset(dataset, config);
  const view = buildLongitudinalGroupCentroidView(result, config, dataset, {
    repeatedEntityColumn: "Name",
    timeColumn: "Lesson",
    timeOrder: ["Lesson 1", "Lesson 2"],
    cohortPolicy: "complete",
    axes: ["SVD1", "SVD2"],
    datasetNormalizedUtf8TextSha256: null,
  });

  assert.equal(view.availableEntityCount, 4);
  assert.equal(view.completeEntityCount, 4);
  assert.equal(view.includedEntityCount, 4);
  assert.equal(new Set(view.entityPeriods.map((period) => period.entityId)).size, 4);
  assert.deepEqual(view.groups.map((group) => group.name), ["Control", "Experimental"]);
  assert.deepEqual(view.groups.map((group) => group.entityCount), [2, 2]);
  assert.deepEqual(
    view.groups.map((group) => group.periods.map((period) => period.includedEntityCount)),
    [[2, 2], [2, 2]],
  );
  assert.deepEqual(view.groups.map((group) => group.segments.length), [1, 1]);
  assert.ok(view.groups.every((group) => group.segments[0].distance > 0));
});

test("trajectory mappings reject a comparison group as the repeated entity", () => {
  const dataset = yuStyleDataset();
  const config: OpenEnaConfig = {
    ...inferConfig(dataset),
    model: "SeparateTrajectory",
    window: "Conversation",
    rotation: "svd",
  };
  const result = analyzeDataset(dataset, config);

  assert.throws(() => buildLongitudinalGroupCentroidView(result, config, dataset, {
    repeatedEntityColumn: "Group",
    timeColumn: "Lesson",
    timeOrder: ["Lesson 1", "Lesson 2"],
    cohortPolicy: "complete",
    axes: ["SVD1", "SVD2"],
    datasetNormalizedUtf8TextSha256: null,
  }), /repeated.entity.*group|group.*repeated.entity|must be distinct/i);
});
