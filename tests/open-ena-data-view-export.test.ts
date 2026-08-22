import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenEnaDataViewExportRows } from "../lib/open-ena/data-view-export";

test("Data View export uses ordered human-readable headers and never leaks internal edge keys", () => {
  const columns = [
    { key: "orderedResponsePosition", label: "Ordered response position", kind: "provenance" as const },
    { key: "metadata:group", label: "group", kind: "metadata" as const },
    {
      key: "edge:0",
      label: "A ground/source → B response/target",
      kind: "directed-edge" as const,
    },
  ];
  const rows = [{
    id: "response-1",
    values: {
      orderedResponsePosition: 1,
      "metadata:group": "g1",
      "edge:0": 0.5,
    },
  }];

  const exported = buildOpenEnaDataViewExportRows({
    columns,
    rows,
    groupLabels: {
      provenance: "Ordered provenance",
      metadata: "Local metadata join",
      code: "Codes",
      "directed-edge": "Directed p² contributions",
    },
  });

  assert.deepEqual(Object.keys(exported[0]), [
    "Ordered provenance · Ordered response position",
    "Local metadata join · group",
    "Directed p² contributions · A ground/source → B response/target",
  ]);
  assert.equal(exported[0]["Directed p² contributions · A ground/source → B response/target"], 0.5);
  assert.equal(JSON.stringify(exported).includes("edge:0"), false);
});

test("Data View export rejects duplicate display headers instead of silently overwriting a column", () => {
  assert.throws(() => buildOpenEnaDataViewExportRows({
    columns: [
      { key: "edge:0", label: "A → B", kind: "directed-edge" },
      { key: "edge:1", label: "A → B", kind: "directed-edge" },
    ],
    rows: [{ id: "r1", values: { "edge:0": 1, "edge:1": 2 } }],
    groupLabels: {
      provenance: "Provenance",
      metadata: "Metadata",
      code: "Codes",
      "directed-edge": "Directed",
    },
  }), /unique display headers/i);
});
