import assert from "node:assert/strict";
import test from "node:test";
import { createAccumulationStream, type Row } from "jena-js";
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

test("client request construction snapshots one dataset/config source of truth", () => {
  const source = dataset(rows.map((row) => ({ ...row })));
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
  assert.deepEqual(request.config.codes, ["A", "B", "C"]);
  assert.equal(request.config.directionalMask?.enabled[0][1], true);
  assert.equal(request.dataset.rows[0].A, 2);
  assert.equal("plan" in request, false);
  assert.equal("options" in request, false);
  assert.equal("executionProvenance" in request, false);
  assert.equal(request.chunkSize, 7);
});

test("worker replaces identity-bearing ONA rows with a compact de-identified ordered audit", async () => {
  const scope = new MemoryScope();
  createOpenEnaWorkerHost(scope);
  const request = buildOpenEnaWorkerRunRequest(dataset(rows), config("ona"), {
    id: "ona",
    reference: null,
    chunkSize: 1,
  });

  scope.send(request);
  const response = await scope.waitFor((message) => message.id === "ona" && message.kind === "result");
  assert.equal(response.kind, "result");
  if (response.kind !== "result") return;

  assert.equal(response.result.set.networkType, "ordered");
  assert.equal(new Set(response.result.set.points.map((row) => String(row.ENA_UNIT))).size, 2);
  assert.equal(response.result.set.rawRows.length, 0);
  assert.equal(response.result.set.metaData.length, 0);
  assert.deepEqual(response.result.set.rowConnectionCounts, []);
  assert.deepEqual(response.result.set.rowWindowProvenance, []);
  assert.deepEqual(response.result.orderedAudit, {
    schemaVersion: 1,
    codeOrder: ["A", "B", "C"],
    edgeOrder: "response-major-ground-minor",
    responseRowIndices: [0, 1, 2, 3],
    previousResponseRowIndices: [null, 0, null, 2],
    priorRowCounts: [0, 1, 0, 1],
    horizonOrdinals: [0, 0, 1, 1],
    edgeValues: [
      [0, 0, 1, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 6, 0, 3, 0, 0, 0],
      [0, 0.5, 0, 0.5, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 2, 2, 0],
    ],
  });
  assert.doesNotMatch(JSON.stringify(response.result.orderedAudit), /"u1"|"u2"|"h1"|"h2"|"g1"|"g2"|horizonIdentity/);
  assert.equal(
    response.result.orderedAudit?.edgeValues.reduce((cells, row) => cells + row.length, 0),
    rows.length * 3 * 3,
  );
  assert.equal(response.result.orderedAudit?.edgeValues.every(Array.isArray), true);
  assert.deepEqual(
    response.result.executionProvenance?.ordering?.responseRowSourceIndices,
    [0, 1, 2, 3],
  );
});

test("worker keeps the standard ENA model-only payload unchanged", async () => {
  const scope = new MemoryScope();
  createOpenEnaWorkerHost(scope);
  const source = dataset(rows.map((row) => ({
    ...row,
    A: Number(row.A) > 0 ? 1 : 0,
    B: Number(row.B) > 0 ? 1 : 0,
    C: Number(row.C) > 0 ? 1 : 0,
  })));
  const request = buildOpenEnaWorkerRunRequest(source, config("ena"), {
    id: "ena",
    reference: null,
    chunkSize: 2,
  });

  scope.send(request);
  const response = await scope.waitFor((message) => message.id === "ena" && message.kind === "result");
  assert.equal(response.kind, "result");
  if (response.kind !== "result") return;

  assert.equal(response.result.set.networkType, undefined);
  assert.deepEqual(response.result.set.rawRows, []);
  assert.deepEqual(response.result.set.rowConnectionCounts, []);
  assert.deepEqual(response.result.set.metaData, []);
  assert.equal(response.result.orderedAudit, undefined);
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
  const activeRequest = buildOpenEnaWorkerRunRequest(dataset(repeatedRows), config("ona"), {
    id: "active",
    reference: null,
    chunkSize: 1,
  });
  const queuedRequest = buildOpenEnaWorkerRunRequest(dataset(repeatedRows), config("ona"), {
    id: "queued",
    reference: null,
    chunkSize: 1,
  });

  scope.send(activeRequest);
  scope.send(queuedRequest);
  scope.send(queuedRequest);
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
  const request = buildOpenEnaWorkerRunRequest(dataset(repeatedRows), config("ona"), {
    id: "cancel-me",
    reference: null,
    chunkSize: 1,
  });

  scope.send(request);
  scope.send({ kind: "cancel", id: "cancel-me" });
  await scope.waitFor((message) => message.id === "cancel-me" && message.kind === "cancelled");

  assert.equal(streams.length, 1);
  assert.equal(streams[0].state.isDisposed, true);
  assert.equal(scope.responses.some((message) => message.id === "cancel-me" && message.kind === "result"), false);
});

test("worker rejects the removed externally supplied plan shape before opening a stream", async () => {
  const scope = new MemoryScope();
  let streamCreations = 0;
  createOpenEnaWorkerHost(scope, {
    createAccumulationStream(options) {
      streamCreations += 1;
      return createAccumulationStream(options);
    },
  });
  const legacyPlanOnly = {
    kind: "run",
    id: "legacy-plan",
    plan: { options: { centerAlignToOrigin: false } },
    reference: null,
    chunkSize: 1,
  } as unknown as OpenEnaWorkerRequest;

  scope.send(legacyPlanOnly);
  const response = await scope.waitFor((message) => message.id === "legacy-plan" && message.kind === "error");
  assert.equal(response.kind, "error");
  const injectedOptions = {
    ...buildOpenEnaWorkerRunRequest(dataset(rows), config("ona"), {
      id: "injected-options",
      reference: null,
      chunkSize: 1,
    }),
    options: { unitsUsed: ["u1"], centerAlignToOrigin: false },
  } as unknown as OpenEnaWorkerRequest;
  scope.send(injectedOptions);
  const injectedResponse = await scope.waitFor((message) => (
    message.id === "injected-options" && message.kind === "error"
  ));
  assert.equal(injectedResponse.kind, "error");
  assert.equal(streamCreations, 0);
});
