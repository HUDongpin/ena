import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import { buildOpenEnaWorkerRunRequest } from "../lib/open-ena/client";
import { buildAnalysisBundle } from "../lib/open-ena/export";
import {
  createOpenEnaWorkerHost,
  type OpenEnaWorkerRequest,
  type OpenEnaWorkerResponse,
  type OpenEnaWorkerScope,
} from "../lib/open-ena/jena.worker";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { buildOpenEnaOrderedResponseNodeSummary } from "../lib/open-ena/ordered-node-summary";
import {
  SAMPLE_CONFIG,
  type CanonicalOpenEnaConfig,
  type OpenEnaConfig,
  type ParsedDataset,
} from "../lib/open-ena/types";

const SOURCE_HASH = "a".repeat(64);

function onaConfig(groupColumn: string | null = "group"): CanonicalOpenEnaConfig {
  const codes = ["B", "A", "C"];
  return {
    ...SAMPLE_CONFIG,
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn,
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: createDirectionalMask(codes),
  };
}

test("ordered response-node summary preserves raw counts and binds arrays to configured code order", () => {
  const rows: Row[] = [
    { unit: "u-1", horizon: "h-1", turn: 2, group: "zeta", A: 2, B: 3, C: 0.5 },
    { unit: "u-1", horizon: "h-1", turn: 1, group: "zeta", A: 4, B: 0, C: 1.5 },
    { unit: "u-2", horizon: "h-2", turn: 1, group: "alpha", A: 1, B: 5, C: 2 },
    { unit: "u-3", horizon: "h-3", turn: 1, group: "alpha", A: 0, B: 7, C: 0 },
  ];

  const summary = buildOpenEnaOrderedResponseNodeSummary(rows, onaConfig());

  assert.deepEqual(summary, {
    schemaVersion: 1,
    codeOrder: ["B", "A", "C"],
    overallResponseCodeTotals: [15, 7, 4],
    groups: [
      { name: "alpha", unitCount: 2, responseCodeTotals: [12, 1, 2] },
      { name: "zeta", unitCount: 1, responseCodeTotals: [3, 6, 2] },
    ],
  });
  assert.doesNotMatch(JSON.stringify(summary), /u-1|u-2|u-3|h-1|h-2|h-3|sourceRow|responseRow|turn/i);
});

test("ordered response-node summary uses one stable All units group when no group is configured", () => {
  const config = onaConfig(null);
  const summary = buildOpenEnaOrderedResponseNodeSummary([
    { unit: "u-1", horizon: "h-1", turn: 1, A: 2, B: 3, C: 4 },
    { unit: "u-2", horizon: "h-2", turn: 1, A: 5, B: 6, C: 7 },
  ], config);

  assert.deepEqual(summary?.groups, [
    { name: "All units", unitCount: 2, responseCodeTotals: [9, 7, 11] },
  ]);
});

test("response-node summary is ordered-only and fails closed on invalid code binding or numeric totals", () => {
  const standard = { ...SAMPLE_CONFIG, analysisKind: "ena" as const };
  assert.equal(buildOpenEnaOrderedResponseNodeSummary([], standard), undefined);

  const mismatchedMask = onaConfig();
  mismatchedMask.directionalMask = createDirectionalMask(["A", "B", "C"]);
  assert.throws(
    () => buildOpenEnaOrderedResponseNodeSummary([], mismatchedMask),
    /code order/i,
  );
  assert.throws(
    () => buildOpenEnaOrderedResponseNodeSummary([
      { unit: "u-1", horizon: "h-1", turn: 1, group: "g", A: 1, B: "2", C: 0 },
    ], onaConfig()),
    /finite nonnegative/i,
  );
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => buildOpenEnaOrderedResponseNodeSummary([
        { unit: "u-1", horizon: "h-1", turn: 1, group: "g", A: 1, B: invalid, C: 0 },
      ], onaConfig()),
      /finite nonnegative/i,
    );
  }
  assert.throws(
    () => buildOpenEnaOrderedResponseNodeSummary([
      { unit: "u-1", horizon: "h-1", turn: 1, group: "g", A: 0, B: Number.MAX_VALUE, C: 0 },
      { unit: "u-1", horizon: "h-1", turn: 2, group: "g", A: 0, B: Number.MAX_VALUE, C: 0 },
    ], onaConfig()),
    /finite numeric range/i,
  );
});

function dataset(rows: Row[]): ParsedDataset {
  return {
    name: "ordered-node-summary.csv",
    headers: ["unit", "horizon", "turn", "group", "A", "B", "C"],
    rows,
    sizeBytes: 0,
    source: "upload",
  };
}

class MemoryScope implements OpenEnaWorkerScope {
  responses: OpenEnaWorkerResponse[] = [];
  private listener: ((event: { data: OpenEnaWorkerRequest }) => void) | null = null;

  addEventListener(_type: "message", listener: (event: { data: OpenEnaWorkerRequest }) => void) {
    this.listener = listener;
  }

  postMessage(message: OpenEnaWorkerResponse) {
    this.responses.push(message);
  }

  send(message: OpenEnaWorkerRequest) {
    assert.ok(this.listener);
    this.listener({ data: message });
  }

  async result(id: string) {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const response = this.responses.find((message) => message.id === id && (
        message.kind === "result" || message.kind === "error"
      ));
      if (response) return response;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`Timed out waiting for worker result: ${JSON.stringify(this.responses)}`);
  }
}

test("worker retains only the de-identified response-node summary after ONA compaction and generic bundles exclude it", async () => {
  const sourceRows: Row[] = [
    { unit: "private-u1", horizon: "private-h1", turn: 2, group: "group-z", A: "0", B: "3", C: "0" },
    { unit: "private-u1", horizon: "private-h1", turn: 1, group: "group-z", A: "2", B: "0", C: "0" },
    { unit: "private-u2", horizon: "private-h2", turn: 1, group: "group-a", A: "1", B: "1", C: "1" },
  ];
  const source = dataset(sourceRows);
  const config = onaConfig() as OpenEnaConfig;
  const scope = new MemoryScope();
  createOpenEnaWorkerHost(scope);
  scope.send(buildOpenEnaWorkerRunRequest(source, config, {
    id: "ordered-summary",
    reference: null,
    chunkSize: 1,
  }));

  const response = await scope.result("ordered-summary");
  assert.equal(response.kind, "result");
  if (response.kind !== "result") return;
  assert.deepEqual(response.result.orderedResponseNodeSummary, {
    schemaVersion: 1,
    codeOrder: ["B", "A", "C"],
    overallResponseCodeTotals: [4, 3, 1],
    groups: [
      { name: "group-a", unitCount: 1, responseCodeTotals: [1, 1, 1] },
      { name: "group-z", unitCount: 1, responseCodeTotals: [3, 2, 0] },
    ],
  });
  assert.deepEqual(response.result.set.rawRows, []);
  assert.deepEqual(response.result.set.rowConnectionCounts, []);
  assert.deepEqual(response.result.set.rowWindowProvenance, []);
  const summaryText = JSON.stringify(response.result.orderedResponseNodeSummary);
  assert.doesNotMatch(summaryText, /private-u1|private-u2|private-h1|private-h2|"turn"|sourceRow|responseRow|rawRow|unitId|horizon/i);

  const bundle = buildAnalysisBundle(source, config, response.result, SOURCE_HASH);
  assert.equal("orderedResponseNodeSummary" in bundle, false);
  assert.doesNotMatch(JSON.stringify(bundle), /orderedResponseNodeSummary/);
});

test("standard worker results do not carry an ordered response-node summary", async () => {
  const source = dataset([
    { unit: "u1", horizon: "h1", turn: 1, group: "g", A: 1, B: 1, C: 1 },
  ]);
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    analysisKind: "ena",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    rotation: "svd",
  };
  const scope = new MemoryScope();
  createOpenEnaWorkerHost(scope);
  scope.send(buildOpenEnaWorkerRunRequest(source, config, {
    id: "standard-summary",
    reference: null,
    chunkSize: 1,
  }));

  const response = await scope.result("standard-summary");
  assert.equal(response.kind, "result");
  if (response.kind !== "result") return;
  assert.equal(response.result.orderedResponseNodeSummary, undefined);
});
