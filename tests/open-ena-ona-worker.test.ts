import assert from "node:assert/strict";
import test from "node:test";
import { createAccumulationStream, type Row } from "jena-js";
import { buildOpenEnaAnalysisPlan } from "../lib/open-ena/analyze";
import { buildOpenEnaWorkerRunRequest } from "../lib/open-ena/client";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import {
  createOpenEnaWorkerHost,
  type OpenEnaWorkerRequest,
  type OpenEnaWorkerResponse,
  type OpenEnaWorkerScope,
} from "../lib/open-ena/jena.worker";
import { SAMPLE_CONFIG, type OpenEnaConfig, type ParsedDataset } from "../lib/open-ena/types";

function dataset(rows: Row[]): ParsedDataset {
  return {
    name: "worker.csv",
    headers: ["unit", "horizon", "turn", "group", "A", "B", "C"],
    rows,
    sizeBytes: 0,
    source: "upload",
  };
}

function config(analysisKind: "ena" | "ona"): OpenEnaConfig {
  const codes = ["A", "B", "C"];
  const shared: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    analysisKind,
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes,
    rotation: "svd",
  };
  return analysisKind === "ena" ? shared : {
    ...shared,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    referenceRotationId: null,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: createDirectionalMask(codes),
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
    assert.ok(this.listener, "worker host must register its message listener");
    this.listener({ data: message });
  }

  async waitFor(predicate: (message: OpenEnaWorkerResponse) => boolean, timeoutMs = 3_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = this.responses.find(predicate);
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`Timed out waiting for worker response: ${JSON.stringify(this.responses)}`);
  }
}

const rows: Row[] = [
  { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 2, B: 0, C: 1 },
  { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 3, C: 0 },
  { unit: "u2", horizon: "h2", turn: 1, group: "g2", A: 1, B: 1, C: 0 },
  { unit: "u2", horizon: "h2", turn: 2, group: "g2", A: 0, B: 0, C: 2 },
];

test("client request construction snapshots one immutable analysis plan", () => {
  const source = dataset(rows);
  const mutableConfig = config("ona");
  const request = buildOpenEnaWorkerRunRequest(source, mutableConfig, {
    id: "snapshot",
    reference: null,
    chunkSize: 7,
  });

  mutableConfig.codes[0] = "mutated";
  mutableConfig.directionalMask!.enabled[0][1] = false;
  source.rows[0].A = 99;

  assert.equal(request.kind, "run");
  assert.deepEqual(request.plan.configuration.codes, ["A", "B", "C"]);
  assert.equal(request.plan.configuration.directionalMask?.enabled[0][1], true);
  assert.equal(request.plan.options.rows[0].A, 2);
  assert.equal(request.chunkSize, 7);
});

test("worker uses full ONA materialization but strips source rows and keeps ordered audit rows", async () => {
  const scope = new MemoryScope();
  createOpenEnaWorkerHost(scope);
  const plan = buildOpenEnaAnalysisPlan(dataset(rows), config("ona"));

  scope.send({ kind: "run", id: "ona", plan, reference: null, chunkSize: 1 });
  const response = await scope.waitFor((message) => message.id === "ona" && message.kind === "result");
  assert.equal(response.kind, "result");
  if (response.kind !== "result") return;

  assert.equal(response.result.set.networkType, "ordered");
  assert.equal(response.result.set.rawRows.length, 0);
  assert.equal(response.result.set.metaData.length, 0);
  assert.equal(response.result.set.rowConnectionCounts.length, rows.length);
  assert.equal(response.result.set.rowWindowProvenance?.length, rows.length);
  assert.deepEqual(
    response.result.executionProvenance?.ordering?.responseRowSourceIndices,
    [0, 1, 2, 3],
  );
});

test("worker keeps the standard ENA model-only payload unchanged", async () => {
  const scope = new MemoryScope();
  createOpenEnaWorkerHost(scope);
  const plan = buildOpenEnaAnalysisPlan(dataset(rows.map((row) => ({
    ...row,
    A: Number(row.A) > 0 ? 1 : 0,
    B: Number(row.B) > 0 ? 1 : 0,
    C: Number(row.C) > 0 ? 1 : 0,
  }))), config("ena"));

  scope.send({ kind: "run", id: "ena", plan, reference: null, chunkSize: 2 });
  const response = await scope.waitFor((message) => message.id === "ena" && message.kind === "result");
  assert.equal(response.kind, "result");
  if (response.kind !== "result") return;

  assert.equal(response.result.set.networkType, undefined);
  assert.deepEqual(response.result.set.rawRows, []);
  assert.deepEqual(response.result.set.rowConnectionCounts, []);
  assert.deepEqual(response.result.set.metaData, []);
});

test("worker rejects duplicate ids and cancels a queued id exactly once", async () => {
  const scope = new MemoryScope();
  createOpenEnaWorkerHost(scope);
  const repeatedRows = Array.from({ length: 50 }, (_, index): Row => ({
    unit: `u${index % 2}`,
    horizon: "h1",
    turn: index + 1,
    group: `g${index % 2}`,
    A: index % 3 === 0 ? 1 : 0,
    B: index % 3 === 1 ? 1 : 0,
    C: index % 3 === 2 ? 1 : 0,
  }));
  const plan = buildOpenEnaAnalysisPlan(dataset(repeatedRows), config("ona"));

  scope.send({ kind: "run", id: "active", plan, reference: null, chunkSize: 1 });
  scope.send({ kind: "run", id: "queued", plan, reference: null, chunkSize: 1 });
  scope.send({ kind: "run", id: "queued", plan, reference: null, chunkSize: 1 });
  const duplicate = await scope.waitFor((message) => message.id === "queued" && message.kind === "error");
  assert.equal(duplicate.kind, "error");
  assert.match(duplicate.kind === "error" ? duplicate.message : "", /already active or queued/i);

  scope.send({ kind: "cancel", id: "queued" });
  await scope.waitFor((message) => message.id === "queued" && message.kind === "cancelled");
  await scope.waitFor((message) => message.id === "active" && message.kind === "result");
  assert.equal(scope.responses.filter((message) => message.id === "queued" && message.kind === "cancelled").length, 1);
  assert.equal(scope.responses.some((message) => message.id === "queued" && message.kind === "result"), false);
});

test("active cancellation disposes its accumulation stream", async () => {
  const scope = new MemoryScope();
  const streams: Array<ReturnType<typeof createAccumulationStream>> = [];
  createOpenEnaWorkerHost(scope, {
    createAccumulationStream(options) {
      const stream = createAccumulationStream(options);
      streams.push(stream);
      return stream;
    },
  });
  const repeatedRows = Array.from({ length: 100 }, (_, index): Row => ({
    unit: "u1",
    horizon: "h1",
    turn: index + 1,
    group: "g1",
    A: index % 3 === 0 ? 1 : 0,
    B: index % 3 === 1 ? 1 : 0,
    C: index % 3 === 2 ? 1 : 0,
  }));
  const plan = buildOpenEnaAnalysisPlan(dataset(repeatedRows), config("ona"));

  scope.send({ kind: "run", id: "cancel-me", plan, reference: null, chunkSize: 1 });
  scope.send({ kind: "cancel", id: "cancel-me" });
  await scope.waitFor((message) => message.id === "cancel-me" && message.kind === "cancelled");

  assert.equal(streams.length, 1);
  assert.equal(streams[0].state.isDisposed, true);
  assert.equal(scope.responses.some((message) => message.id === "cancel-me" && message.kind === "result"), false);
});
