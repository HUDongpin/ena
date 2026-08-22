import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import {
  analyzeDataset,
  bindOpenEnaResultProvenance,
  compactOpenEnaSet,
} from "../lib/open-ena/analyze";
import {
  buildOpenEnaOnaAggregateEdgeExport,
  buildOpenEnaOnaDeidentifiedAuditExport,
} from "../lib/open-ena/ona-export";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { buildOpenEnaOrderedAudit } from "../lib/open-ena/ordered-audit";
import type { OpenEnaConfig, OpenEnaResult, ParsedDataset } from "../lib/open-ena/types";

function orderedFixture() {
  const codes = ["A", "B", "C"];
  const directionalMask = createDirectionalMask(codes);
  directionalMask.enabled[1][0] = false;
  const config: OpenEnaConfig = {
    analysisKind: "ona",
    unitColumns: ["student"],
    conversationColumns: ["lesson"],
    groupColumn: "condition",
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: true,
    orderPolicy: { kind: "columns", columns: ["turn"], comparators: { turn: "number" } },
    directionalMask,
  };
  const rows: Row[] = [
    { student: "SECRET-alice", lesson: "SECRET-l1", turn: 1, condition: "g1", A: 2, B: 0, C: 0 },
    { student: "SECRET-alice", lesson: "SECRET-l1", turn: 2, condition: "g1", A: 0, B: 3, C: 0 },
    { student: "SECRET-bob", lesson: "SECRET-l2", turn: 1, condition: "g2", A: 1, B: 1, C: 0 },
    { student: "SECRET-bob", lesson: "SECRET-l2", turn: 2, condition: "g2", A: 0, B: 2, C: 1 },
  ];
  const dataset: ParsedDataset = {
    name: "secret.csv",
    headers: ["student", "lesson", "turn", "condition", "A", "B", "C"],
    rows,
    sizeBytes: 42,
    source: "upload",
  };
  const full = analyzeDataset(dataset, config);
  const orderedAudit = buildOpenEnaOrderedAudit(full.set);
  assert.ok(orderedAudit);
  const result = bindOpenEnaResultProvenance({
    ...full,
    set: compactOpenEnaSet(full.set),
    orderedAudit,
  } as OpenEnaResult, dataset, "b".repeat(64), config);
  return { config, result };
}

test("aggregate ONA edge export contains only directed aggregate fields and safe CSV", () => {
  const { config, result } = orderedFixture();
  const exported = buildOpenEnaOnaAggregateEdgeExport({ result, config });

  assert.equal(exported.kind, "open-ena-ona-aggregate-edges");
  assert.equal(exported.privacy, "aggregate-only");
  assert.equal(exported.scope, "overall");
  assert.equal(exported.group, null);
  assert.equal(exported.rows.length, 9);
  assert.deepEqual(Object.keys(exported.rows[0]), [
    "scope",
    "group",
    "groundSource",
    "responseTarget",
    "diagonal",
    "maskEnabled",
    "rawAggregateCount",
    "equalUnitNormalizedMean",
    "nonzeroUnitCount",
  ]);
  assert.equal(exported.rows.every((row) => Number.isFinite(row.rawAggregateCount)), true);
  assert.equal(exported.rows.every((row) => Number.isFinite(row.equalUnitNormalizedMean)), true);
  const aToB = exported.rows.find((row) => row.groundSource === "A" && row.responseTarget === "B");
  assert.ok(aToB);
  assert.equal(aToB.rawAggregateCount, 8.5);
  assert.equal(aToB.nonzeroUnitCount, 2);
  assert.match(exported.csv, /groundSource,responseTarget/);
  assert.doesNotMatch(JSON.stringify(exported), /SECRET|ENA_UNIT|student|lesson|sourceRow|horizonOrdinal/i);

  const group = buildOpenEnaOnaAggregateEdgeExport({
    result,
    config,
    scope: { kind: "group", name: "g1" },
  });
  assert.equal(group.scope, "group");
  assert.equal(group.group, "g1");
  assert.equal(group.rows.every((row) => row.scope === "group" && row.group === "g1"), true);
  const groupAToB = group.rows.find((row) => row.groundSource === "A" && row.responseTarget === "B");
  assert.ok(groupAToB);
  assert.equal(groupAToB.rawAggregateCount, 6);
  assert.equal(groupAToB.equalUnitNormalizedMean, 1);
  assert.equal(groupAToB.nonzeroUnitCount, 1);
});

test("deidentified ONA audit export uses opaque ordinals and p² contributions without execution mappings", () => {
  const { config, result } = orderedFixture();
  const ordering = result.executionProvenance!.ordering!;
  result.executionProvenance!.ordering = new Proxy(ordering, {
    get(target, property, receiver) {
      if (property === "responseRowSourceIndices") {
        throw new Error("audit export attempted to read the identity join mapping");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const exported = buildOpenEnaOnaDeidentifiedAuditExport({ result, config });

  assert.equal(exported.kind, "open-ena-ona-deidentified-audit");
  assert.equal(exported.privacy, "deidentified-row-audit");
  assert.match(exported.warning, /re-identification risk/i);
  assert.equal(exported.rows.length, 4);
  assert.deepEqual(Object.keys(exported.rows[0]), [
    "responseOrdinal",
    "opaqueHorizonOrdinal",
    "previousResponseOrdinal",
    "priorRowCount",
    "edge_1: A → A contribution",
    "edge_2: B → A contribution",
    "edge_3: C → A contribution",
    "edge_4: A → B contribution",
    "edge_5: B → B contribution",
    "edge_6: C → B contribution",
    "edge_7: A → C contribution",
    "edge_8: B → C contribution",
    "edge_9: C → C contribution",
  ]);
  assert.equal(exported.rows[0].responseOrdinal, 1);
  assert.equal(exported.rows[0].opaqueHorizonOrdinal, 1);
  assert.equal(exported.rows[1].previousResponseOrdinal, 1);
  assert.equal(exported.rows[1]["edge_4: A → B contribution"], 6);
  assert.match(exported.csv, /responseOrdinal,opaqueHorizonOrdinal,previousResponseOrdinal,priorRowCount/);
  assert.doesNotMatch(JSON.stringify(exported), /SECRET|ENA_UNIT|student|lesson|condition|responseRowSourceIndices|metadata/i);
});

test("safe ONA exports fail closed on stale configurations and malformed or nonfinite audit evidence", () => {
  const { config, result } = orderedFixture();
  assert.throws(
    () => buildOpenEnaOnaAggregateEdgeExport({
      result,
      config: { ...config, windowSizeBack: 9 },
    }),
    /configuration|completed/i,
  );

  const nonfinite = structuredClone(result);
  nonfinite.orderedAudit!.edgeValues[0][0] = Number.POSITIVE_INFINITY;
  assert.throws(
    () => buildOpenEnaOnaDeidentifiedAuditExport({ result: nonfinite, config }),
    /finite/i,
  );

  const crossHorizon = structuredClone(result);
  crossHorizon.orderedAudit!.previousResponseRowIndices[2] = 1;
  crossHorizon.orderedAudit!.priorRowCounts[2] = 1;
  assert.throws(
    () => buildOpenEnaOnaDeidentifiedAuditExport({ result: crossHorizon, config }),
    /horizon/i,
  );

  const duplicate = structuredClone(result);
  duplicate.orderedAudit!.responseRowIndices[1] = duplicate.orderedAudit!.responseRowIndices[0];
  assert.throws(
    () => buildOpenEnaOnaDeidentifiedAuditExport({ result: duplicate, config }),
    /complete unique/i,
  );

  const finiteTamper = structuredClone(result);
  finiteTamper.orderedAudit!.edgeValues[0][0] += 1;
  assert.throws(
    () => buildOpenEnaOnaDeidentifiedAuditExport({ result: finiteTamper, config }),
    /aggregate|completed|total/i,
  );

  const skippedPredecessor = structuredClone(result);
  skippedPredecessor.orderedAudit!.previousResponseRowIndices[1] = null;
  skippedPredecessor.orderedAudit!.priorRowCounts[1] = 0;
  assert.throws(
    () => buildOpenEnaOnaDeidentifiedAuditExport({ result: skippedPredecessor, config }),
    /previous|predecessor|immediate/i,
  );
});
