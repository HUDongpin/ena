import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { inferConfig, parseCsv } from "../lib/open-ena/csv";

test("Yu 0712-style headers infer composite units and horizons without merging names across groups", () => {
  const dataset = parseCsv(
    [
      "Group,Lesson,Name,EC,ICT,MCO,NI,SR,SC,ATT",
      "Control,Lesson 1,Alex,1,1,0,0,0,0,0",
      "Control,Lesson 2,Alex,1,0,1,0,0,0,0",
      "Experimental,Lesson 1,Alex,0,0,0,1,1,0,0",
      "Experimental,Lesson 2,Alex,0,0,0,1,0,1,1",
    ].join("\n") + "\n",
    { name: "yu-ena-coded-data-0712.csv", source: "upload" },
  );

  const config = inferConfig(dataset);

  assert.deepEqual(config.unitColumns, ["Group", "Name"]);
  assert.deepEqual(config.conversationColumns, ["Group", "Name", "Lesson"]);
  assert.equal(config.groupColumn, "Group");
  assert.deepEqual(config.codes, ["EC", "ICT", "MCO", "NI", "SR", "SC", "ATT"]);
  assert.equal(
    config.rotation,
    "mean",
    "official webENA automatically uses Means Rotation for an eligible two-group endpoint comparison",
  );

  const result = analyzeDataset(dataset, config);
  assert.deepEqual(
    new Set(result.set.points.map((point) => point.ENA_UNIT)),
    new Set(["Control::Alex", "Experimental::Alex"]),
  );
});

test("CSV inference enables official Means Rotation only for exactly two complete non-empty groups", () => {
  const datasetForGroups = (groups: string[], includeGroupColumn = true) => parseCsv(
    [
      includeGroupColumn ? "unit,conversation,group,A,B,C" : "unit,conversation,A,B,C",
      ...groups.map((group, index) => includeGroupColumn
        ? `u${index + 1},c${index + 1},${group},1,1,1`
        : `u${index + 1},c${index + 1},1,1,1`),
    ].join("\n") + "\n",
    { name: "official-rotation-inference.csv", source: "upload" },
  );

  assert.equal(inferConfig(datasetForGroups(["Experimental", "Control"])).rotation, "mean");
  assert.equal(inferConfig(datasetForGroups(["Experimental", "Experimental"])).rotation, "svd");
  assert.equal(inferConfig(datasetForGroups(["Experimental", "Control", "Third"])).rotation, "svd");
  assert.equal(inferConfig(datasetForGroups(["Experimental", "Control", ""])).rotation, "svd");
  assert.equal(inferConfig(datasetForGroups(["", ""])).rotation, "svd");
  assert.equal(inferConfig(datasetForGroups(["Experimental", "Control"], false)).rotation, "svd");
});
