import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import {
  analyzeDataset,
  bindOpenEnaResultProvenance,
  compactOpenEnaSet,
} from "../lib/open-ena/analyze";
import { buildOpenEnaOrderedAudit } from "../lib/open-ena/ordered-audit";
import {
  buildOpenEnaOnaDataView,
  validateOpenEnaOrderedAudit,
} from "../lib/open-ena/ona-data-view";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import type {
  OpenEnaConfig,
  OpenEnaResult,
  ParsedDataset,
} from "../lib/open-ena/types";

const HASH = "a".repeat(64);
const codes = ["A", "B", "C"];

function fixture() {
  const rows: Row[] = [
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", note: "second", A: 0, B: 3, C: 0 },
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", note: "first", A: 2, B: 0, C: 1 },
    { unit: "u2", horizon: "h2", turn: 2, group: "g2", note: "fourth", A: 0, B: 0, C: 2 },
    { unit: "u2", horizon: "h2", turn: 1, group: "g2", note: "third", A: 1, B: 1, C: 0 },
  ];
  const dataset: ParsedDataset = {
    name: "ordered-data-view.csv",
    headers: ["unit", "horizon", "turn", "group", "note", ...codes],
    rows,
    sizeBytes: 123,
    source: "upload",
    hashKind: "normalized-utf8-csv-text-sha256",
  };
  const config: OpenEnaConfig = {
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: true,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: createDirectionalMask(codes),
  };
  const full = analyzeDataset(dataset, config);
  const orderedAudit = buildOpenEnaOrderedAudit(full.set);
  assert.ok(orderedAudit);
  const compact: OpenEnaResult = {
    ...full,
    set: compactOpenEnaSet(full.set),
    orderedAudit,
  };
  const result = bindOpenEnaResultProvenance(compact, dataset, HASH, config);
  return { dataset, config, result };
}

function protectedDataset(dataset: ParsedDataset): ParsedDataset {
  return {
    ...dataset,
    rows: dataset.rows.map((row) => new Proxy(row, {
      get(target, key, receiver) {
        if (codes.includes(String(key))) {
          throw new Error(`ONA Data View read forbidden raw code cell ${String(key)}`);
        }
        return Reflect.get(target, key, receiver);
      },
    })),
  };
}

test("ONA Data View takes every contribution from orderedAudit and uses provenance only for a local metadata join", () => {
  const { dataset, config, result } = fixture();
  const sentinels = result.orderedAudit!.edgeValues.map((row, responseIndex) => (
    row.map((_, edgeIndex) => 10_000 + responseIndex * 100 + edgeIndex)
  ));
  result.orderedAudit!.edgeValues = sentinels;

  const view = buildOpenEnaOnaDataView({
    dataset: protectedDataset(dataset),
    datasetHash: HASH,
    result,
    resultConfig: config,
    scope: { kind: "overall" },
  });

  assert.equal(view.privacy.contributionSource, "ordered-audit");
  assert.equal(view.privacy.containsLocalIdentifiers, true);
  assert.deepEqual(view.responseRowSourceIndices, [1, 0, 3, 2]);
  assert.equal(view.rows.length, 4);
  assert.equal(view.rows[0].values.orderedResponsePosition, 1);
  assert.equal(view.rows[0].values.sourceRecordNumber, 2);
  assert.equal(view.rows[0].values["metadata:unit"], "u1");
  assert.equal(view.rows[0].values["metadata:horizon"], "h1");
  assert.equal(view.rows[0].values["metadata:turn"], 1);
  assert.equal(view.rows[0].values["edge:0"], 10_000);
  assert.equal(view.rows[1].values["edge:3"], 10_103);
  assert.equal(view.rows[1].values.predecessorResponsePositions, "1");
  assert.equal(view.columns.filter((column) => column.kind === "directed-edge").length, 9);
  assert.equal(view.columns.find((column) => column.key === "edge:3")?.label, "A → B");
  assert.equal(Object.keys(view.rows[0].values).some((key) => codes.includes(key)), false);
});

test("group-scoped ONA Data View filters only through whitelisted local metadata", () => {
  const { dataset, config, result } = fixture();
  const view = buildOpenEnaOnaDataView({
    dataset: protectedDataset(dataset),
    datasetHash: HASH,
    result,
    resultConfig: config,
    scope: { kind: "group", name: "g2" },
  });
  assert.equal(view.rows.length, 2);
  assert.deepEqual(view.rows.map((row) => row.values["metadata:group"]), ["g2", "g2"]);
  assert.deepEqual(view.rows.map((row) => row.values.sourceRecordNumber), [4, 3]);
});

test("ONA Data View fails closed on stale source/config binding and never accepts a source mapping guess", () => {
  const { dataset, config, result } = fixture();
  assert.throws(() => buildOpenEnaOnaDataView({
    dataset,
    datasetHash: "b".repeat(64),
    result,
    resultConfig: config,
    scope: { kind: "overall" },
  }), /dataset binding|SHA-256/i);

  const badMapping = structuredClone(result);
  badMapping.executionProvenance!.ordering!.responseRowSourceIndices = [0, 1, 2, 3];
  assert.throws(() => buildOpenEnaOnaDataView({
    dataset,
    datasetHash: HASH,
    result: badMapping,
    resultConfig: config,
    scope: { kind: "overall" },
  }), /source-index permutation|provenance/i);

  assert.throws(() => buildOpenEnaOnaDataView({
    dataset,
    datasetHash: HASH,
    result,
    resultConfig: { ...config, windowSizeBack: 3 },
    scope: { kind: "overall" },
  }), /configuration|binding|provenance/i);
});

test("ordered audit validation rejects malformed p² vectors, cross-horizon links, and overstated predecessor chains", () => {
  const { result } = fixture();
  const audit = result.orderedAudit!;
  assert.doesNotThrow(() => validateOpenEnaOrderedAudit(result));

  const short = structuredClone(result);
  short.orderedAudit!.edgeValues[0].pop();
  assert.throws(() => validateOpenEnaOrderedAudit(short), /p²|edge vector/i);

  const crossHorizon = structuredClone(result);
  crossHorizon.orderedAudit!.previousResponseRowIndices[2] = 1;
  crossHorizon.orderedAudit!.priorRowCounts[2] = 1;
  assert.throws(() => validateOpenEnaOrderedAudit(crossHorizon), /horizon/i);

  const longChain = structuredClone(result);
  longChain.orderedAudit!.priorRowCounts[1] = 2;
  assert.throws(() => validateOpenEnaOrderedAudit(longChain), /predecessor|prior-row/i);

  const duplicate = structuredClone(result);
  duplicate.orderedAudit!.responseRowIndices[1] = duplicate.orderedAudit!.responseRowIndices[0];
  assert.throws(() => validateOpenEnaOrderedAudit(duplicate), /complete unique/i);
  assert.equal(audit.edgeValues.length, 4);
});
