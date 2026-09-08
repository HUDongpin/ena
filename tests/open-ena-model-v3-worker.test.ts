import assert from "node:assert/strict";
import test from "node:test";
import { Session } from "node:inspector/promises";
import { createAccumulationStream, type AccumulationStream } from "jena-js";
import { createOpenEnaWorkerHost, type OpenEnaWorkerScope } from "../lib/open-ena/jena.worker";
import { bindingFixtureV3, rehashStandardPlanForTestV3 } from "./helpers/open-ena-model-v3-fixture";
import * as client from "../lib/open-ena/client";
import * as references from "../lib/open-ena/model-v3/reference-v2";
import { executionPlanHashPayloadV3, validateExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";

function host(options: { create?: typeof createAccumulationStream; onMessage?: (message: Record<string, unknown>) => void } = {}) {
  const messages: Record<string, unknown>[] = [];
  let listener: (event: { data: unknown }) => void = () => {};
  let streams = 0;
  const created: AccumulationStream[] = [];
  const scope = {
    addEventListener(_type: string, callback: typeof listener) { listener = callback; },
    postMessage(message: Record<string, unknown>) { messages.push(message); options.onMessage?.(message); },
  };
  createOpenEnaWorkerHost(scope as unknown as OpenEnaWorkerScope, {
    createAccumulationStream(input) { streams += 1; const stream = (options.create ?? createAccumulationStream)(input); created.push(stream); return stream; },
  });
  return {
    messages, created, send: (data: unknown) => listener({ data }), streamCount: () => streams,
    async terminal(id: string) {
      const deadline = Date.now() + 2000;
      while (!messages.some((entry) => entry.id === id && ["result-v3", "error", "cancelled"].includes(String(entry.kind))) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.ok(messages.some((entry) => entry.id === id && ["result-v3", "error", "cancelled"].includes(String(entry.kind))), "production host must terminate v3 requests");
      return messages.filter((entry) => entry.id === id);
    },
  };
}

test("production scope verifies a plan before streaming and publishes only a final bound result", async () => {
  const { plan } = await bindingFixtureV3();
  const worker = host();
  worker.send({ kind: "run-open-ena-plan-v3", id: "v3", plan, chunkSize: 2 });
  const messages = await worker.terminal("v3");
  assert.equal(messages[0].stage, "verify-plan");
  assert.equal(messages.at(-1)?.kind, "result-v3");
  assert.equal(worker.streamCount(), 1);
  assert.deepEqual([...new Set(messages.filter((entry) => entry.kind === "progress-v3").map((entry) => entry.stage))], ["verify-plan", "materialize", "accumulate", "normalize", "center", "rotate-or-project", "position-nodes", "validate-result", "complete"]);
});

test("worker reuses one actual source-network computation through readiness and binding", async () => {
  const { plan } = await bindingFixtureV3();
  const inspector = new Session();
  inspector.connect();
  try {
    await inspector.post("Profiler.enable");
    await inspector.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    const worker = host();
    worker.send({ kind: "run-open-ena-plan-v3", id: "one-evidence", plan, chunkSize: 2 });
    assert.equal((await worker.terminal("one-evidence")).at(-1)?.kind, "result-v3");
    const coverage = await inspector.post("Profiler.takePreciseCoverage");
    const sourceCalls = coverage.result.flatMap((script) => script.url.endsWith("/model-v3/diagnostics.ts")
      ? script.functions.filter((entry) => entry.functionName === "scientificNetworksV3") : []);
    assert.equal(sourceCalls.length, 1, "V8 must observe the real scientific source function");
    assert.equal(sourceCalls[0].ranges[0].count, 1, "readiness evidence must serve the later binder without recomputing the source networks");
    assert.equal(worker.streamCount(), 1);
  } finally {
    await inspector.post("Profiler.stopPreciseCoverage");
    inspector.disconnect();
  }
});

test("queued and active cancellation dispose owned streams and never publish partial science", async () => {
  const { plan } = await bindingFixtureV3();
  const worker = host({ onMessage(message) {
    if (message.id === "active" && message.stage === "accumulate" && Number(message.progress) > 0.1) worker.send({ kind: "cancel", id: "active" });
  } });
  worker.send({ kind: "run-open-ena-plan-v3", id: "active", plan, chunkSize: 1 });
  worker.send({ kind: "run-open-ena-plan-v3", id: "queued", plan, chunkSize: 1 });
  worker.send({ kind: "cancel", id: "queued" });
  assert.equal((await worker.terminal("queued")).at(-1)?.kind, "cancelled");
  assert.equal((await worker.terminal("active")).at(-1)?.kind, "cancelled");
  assert.equal(worker.streamCount(), 1);
  assert.ok(worker.created.every((stream) => stream.state.isDisposed));
  assert.equal(worker.messages.some((message) => message.kind === "result-v3"), false);
});

test("duplicate request ids cannot allocate a second stream", async () => {
  const { plan } = await bindingFixtureV3();
  const worker = host();
  const request = { kind: "run-open-ena-plan-v3", id: "duplicate", plan, chunkSize: 2 };
  worker.send(request); worker.send(request);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(worker.messages.filter((message) => message.kind === "error").length, 1);
  assert.equal(worker.messages.filter((message) => message.kind === "result-v3").length, 1);
  assert.equal(worker.streamCount(), 1);
});

test("runtime counter overruns fail inside the production allocation hook and dispose", async () => {
  const { plan } = await bindingFixtureV3();
  const worker = host({ create(options) {
    return createAccumulationStream({ ...options, onResources(state) { options.onResources?.({ ...state, numericCells: 25_000_001 }); } });
  } });
  worker.send({ kind: "run-open-ena-plan-v3", id: "overrun", plan, chunkSize: 2 });
  const messages = await worker.terminal("overrun");
  assert.match(String(messages.at(-1)?.message), /resource|allocation/i);
  assert.equal(messages.some((message) => message.kind === "result-v3"), false);
  assert.ok(worker.created[0].state.isDisposed);
});

test("v3 rejects alternate scientific request sources before stream allocation", async () => {
  const { plan } = await bindingFixtureV3();
  for (const override of [{ dataset: {} }, { draft: {} }, { reference: {} }, { alreadyValidated: true }]) {
    const worker = host();
    worker.send({ kind: "run-open-ena-plan-v3", id: "override", plan, chunkSize: 1, ...override });
    assert.equal((await worker.terminal("override")).at(-1)?.kind, "error");
    assert.equal(worker.streamCount(), 0);
  }
});

test("forward Infinity flush can cancel and oversized operational chunks are capped", async () => {
  const { plan } = await bindingFixtureV3(undefined, (draft, data) => {
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza = { backward: { kind: "finite", value: 1 }, forward: { kind: "infinity" }, rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] } };
    data.rows = data.rows.map((row, index) => ({ ...row, time: index }));
  });
  let finishChunk = 0;
  const worker = host({ create(options) {
    const stream = createAccumulationStream(options);
    const finish = stream.finishAsync!.bind(stream);
    stream.finishAsync = (control) => {
      finishChunk = control.chunkSize;
      return finish({ ...control, yieldControl: async () => { worker.send({ kind: "cancel", id: "infinite" }); await control.yieldControl(); } });
    };
    return stream;
  } });
  worker.send({ kind: "run-open-ena-plan-v3", id: "infinite", plan, chunkSize: Number.MAX_SAFE_INTEGER });
  assert.equal((await worker.terminal("infinite")).at(-1)?.kind, "cancelled");
  assert.equal(finishChunk, 2000);
  assert.ok(worker.created[0].state.isDisposed);
});

test("tampered plans produce one error before any numerical stream is created", async () => {
  const { plan } = await bindingFixtureV3();
  const worker = host();
  const tampered = structuredClone(plan);
  (tampered.rows[0].codeValues as Record<string, number>)[plan.codeDictionary.codes[0].token] = 999;
  worker.send({ kind: "run-open-ena-plan-v3", id: "bad", plan: tampered, chunkSize: 2 });
  const messages = await worker.terminal("bad");
  assert.equal(messages.filter((entry) => entry.kind === "error").length, 1);
  assert.equal(worker.streamCount(), 0);
});

test("coherently rehashed all-zero Code plans cannot bypass scientific readiness", async () => {
  const { plan } = await bindingFixtureV3(undefined, (draft, data) => {
    draft.codes.push("D"); data.headers.push("D"); data.rows.forEach((row, index) => { row.D = index + 1; });
  });
  const changed = structuredClone(plan);
  changed.sourceProof.rows.forEach((row) => { (row.values as Record<string, unknown>).A = 0; });
  const code = changed.codeDictionary.codes.find((entry) => entry.sourceColumn === "A")!.token;
  changed.rows.forEach((row) => { (row.codeValues as Record<string, number>)[code] = 0; });
  const { sourceProofSha256: _old, ...proof } = changed.sourceProof;
  const rehashed = { ...changed, sourceProof: { ...proof, sourceProofSha256: await sha256CanonicalJsonV3(proof) } };
  const candidate = { ...rehashed, header: { ...rehashed.header, executionPlanSha256: await sha256CanonicalJsonV3(executionPlanHashPayloadV3(rehashed)) } };
  await validateExecutionPlanV3(candidate);
  const worker = host();
  worker.send({ kind: "run-open-ena-plan-v3", id: "zero-code", plan: candidate, chunkSize: 1 });
  assert.match(String((await worker.terminal("zero-code")).at(-1)?.message), /STANDARD_CODE_ALL_ZERO/);
  assert.equal(worker.streamCount(), 0);
});

test("rehashed false resource estimates fail exact recomputation before allocation", async () => {
  const { plan } = await bindingFixtureV3();
  const changed = { ...plan, header: { ...plan.header, resourceEstimate: { ...plan.header.resourceEstimate, estimatedNumericCells: 1 } } };
  const candidate = structuredClone(changed);
  await rehashStandardPlanForTestV3(candidate);
  const worker = host();
  worker.send({ kind: "run-open-ena-plan-v3", id: "estimate", plan: candidate, chunkSize: 1 });
  assert.equal((await worker.terminal("estimate")).at(-1)?.kind, "error");
  assert.equal(worker.streamCount(), 0);
});

test("v3 client uses only a captured plan, rejects wrong-plan delivery, and terminates its worker", async () => {
  const run = Reflect.get(client, "analyzePlanInWorkerV3");
  assert.equal(typeof run, "function", "Task 15 must expose the strict v3 client");
  const { plan } = await bindingFixtureV3();
  const requests: Record<string, unknown>[] = [];
  let terminated = 0;
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror = null;
    postMessage(request: Record<string, unknown>) {
      requests.push(request);
      queueMicrotask(() => this.onmessage?.({ data: { kind: "result-v3", id: request.id, executionPlanSha256: "b".repeat(64), result: {} } }));
    }
    terminate() { terminated += 1; }
  }
  const previous = globalThis.Worker;
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  try {
    await assert.rejects(() => run(plan), /plan|binding|hash/i);
    assert.deepEqual(Object.keys(requests[0]).sort(), ["chunkSize", "id", "kind", "plan"]);
    assert.equal(requests[0].chunkSize, 2000);
    assert.equal(terminated, 1);
  } finally { globalThis.Worker = previous; }
});

test("client timeout remains60seconds and cancels/terminates its active request", async (context) => {
  const { plan } = await bindingFixtureV3();
  const requests: Record<string, unknown>[] = [];
  let started: () => void = () => {};
  const ready = new Promise<void>((resolve) => { started = resolve; });
  let terminated = 0;
  class FakeWorker {
    onmessage = null; onerror = null;
    postMessage(request: Record<string, unknown>) { requests.push(request); if (request.kind !== "cancel") started(); }
    terminate() { terminated += 1; }
  }
  const previous = globalThis.Worker;
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  context.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const promise = client.analyzePlanInWorkerV3(plan);
    const rejection = assert.rejects(promise, /60 seconds/);
    await ready;
    context.mock.timers.tick(59_999);
    assert.equal(terminated, 0);
    context.mock.timers.tick(1);
    await rejection;
    assert.equal(terminated, 1);
    assert.equal(requests.at(-1)?.kind, "cancel");
  } finally { context.mock.timers.reset(); globalThis.Worker = previous; }
});

test("abort during async result validation rejects the result and ignores late deliveries", async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const { bindResultV3 } = await import("../lib/open-ena/model-v3/result-binding");
  const { runStandardPlanV3 } = await import("../lib/open-ena/analyze");
  const result = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: 5, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
  const controller = new AbortController();
  let terminated = 0;
  let instance: FakeWorker | undefined;
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror = null;
    constructor() { instance = this; }
    postMessage(request: Record<string, unknown>) {
      if (request.kind === "cancel") return;
      this.onmessage?.({ data: { kind: "result-v3", id: "obsolete-id", executionPlanSha256: plan.header.executionPlanSha256, result } });
      this.onmessage?.({ data: { kind: "result-v3", id: request.id, executionPlanSha256: plan.header.executionPlanSha256, result } });
      controller.abort();
    }
    terminate() { terminated += 1; }
  }
  const previous = globalThis.Worker;
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  try {
    await assert.rejects(() => client.analyzePlanInWorkerV3(plan, { signal: controller.signal }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.equal(terminated, 1);
    assert.doesNotThrow(() => instance!.onmessage?.({ get data() { throw new Error("late result must not be read"); } }));
  } finally { globalThis.Worker = previous; }
});

test("owned Reference bridge mints only after a real production worker delivery and rechecks currentness", async () => {
  const run = Reflect.get(references, "analyzePlanWithReferenceSourceV3");
  assert.equal(typeof run, "function", "Reference source capture must own its worker execution");
  const { plan } = await bindingFixtureV3();
  let streamCount = 0;
  let terminated = 0;
  class InProcessWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror = null;
    listener: (event: { data: unknown }) => void = () => {};
    constructor() {
      createOpenEnaWorkerHost({
        addEventListener: (_type, listener) => { this.listener = listener as typeof this.listener; },
        postMessage: (data) => queueMicrotask(() => this.onmessage?.({ data: structuredClone(data) })),
      }, { createAccumulationStream(options) { streamCount += 1; return createAccumulationStream(options); } });
    }
    postMessage(data: unknown) { this.listener({ data: structuredClone(data) }); }
    terminate() { terminated += 1; }
  }
  const previous = globalThis.Worker;
  globalThis.Worker = InProcessWorker as unknown as typeof Worker;
  try {
    const { result, sourceWitness } = await run(plan);
    assert.equal(streamCount, 1);
    assert.equal(terminated, 1);
    const artifact = await references.buildReferenceV2(sourceWitness, { displayName: "Worker source", currentPlan: plan });
    assert.equal(artifact.source.executionPlanSha256, result.binding.executionPlanSha256);
    const changed = await bindingFixtureV3("c".repeat(64));
    await assert.rejects(() => references.buildReferenceV2(sourceWitness, { displayName: "Stale", currentPlan: changed.plan }), /stale|current/i);
    await assert.rejects(() => references.buildReferenceV2(result as never, { displayName: "Forged", currentPlan: plan }), /witness|target-fitted/i);
    await assert.rejects(() => run(plan, { workerFactory: () => result } as never), /option|transport|shape/i);
  } finally { globalThis.Worker = previous; }
});

for (const means of [false, true]) test(`worker retains actual ${means ? "Means" : "SVD"} full fit and Reference projection diagnostics`, async () => {
  const { plan } = await bindingFixtureV3(undefined, (draft) => {
    if (means) draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
  });
  const witness = await references.fitReferenceSourceV3(plan);
  const artifact = await references.buildReferenceV2(witness, { displayName: "Fixed source", currentPlan: plan });
  const { plan: target } = await bindingFixtureV3("d".repeat(64), (draft, data) => {
    draft.rotation = { type: "reference", referenceId: artifact.referenceId, expectedContentSha256: artifact.contentSha256 };
    data.rows = [
      { unit: "zeroA", horizon: "h1", time: 1, group: "Control", A: 1, B: 0, C: 0 },
      { unit: "zeroC", horizon: "h2", time: 2, group: "Treatment", A: 0, B: 0, C: 1 },
      { unit: "signalAB", horizon: "h3", time: 3, group: "Other", A: 1, B: 1, C: 0 },
    ];
  }, artifact);
  const worker = host();
  worker.send({ kind: "run-open-ena-plan-v3", id: "projection", plan: target, chunkSize: 1 });
  const messages = await worker.terminal("projection");
  assert.equal(messages.at(-1)?.kind, "result-v3", String(messages.at(-1)?.message));
  const result = messages.at(-1)!.result as import("../lib/open-ena/model-v3/types").BoundStandardResultV3;
  assert.equal(result.executionProvenance.projection.rank, 1);
  assert.equal(result.executionProvenance.projection.targetProjectionRank, 1);
  assert.equal(result.executionProvenance.populations.sourceFit?.rank, artifact.fit.rank);
  assert.deepEqual(result.executionProvenance.projection.estimableAxes, artifact.fit.estimableAxes);
  assert.equal(result.executionProvenance.diagnostics.some((entry) => entry.id === "STANDARD_REFERENCE_TARGET_DEGENERATE"), false);
  assert.deepEqual(result.executionProvenance.resources.referenceAdmission, target.reference!.admission);
  assert.equal(result.capabilityStatus["export-reference"], "blocked");
  const { validateBoundResultV3 } = await import("../lib/open-ena/model-v3/result-binding");
  await validateBoundResultV3(result, target);
  const { standardRuntimeDiagnosticsV3 } = await import("../lib/open-ena/analyze");
  const { scientificResultHashPayloadV3 } = await import("../lib/open-ena/model-v3/result-binding");
  const forged = JSON.parse(JSON.stringify(result));
  forged.executionProvenance.projection.rank = 0;
  forged.executionProvenance.projection.targetProjectionRank = 0;
  forged.executionProvenance.diagnostics = [
    ...forged.executionProvenance.diagnostics.filter((entry: { id: string }) => entry.id !== "STANDARD_REFERENCE_TARGET_DEGENERATE"),
    ...standardRuntimeDiagnosticsV3("reference", 0, null),
  ];
  forged.binding.scientificResultSha256 = await sha256CanonicalJsonV3(scientificResultHashPayloadV3(forged));
  await assert.rejects(() => validateBoundResultV3(forged, target), /rank|fixed projection/i);
});

test("singleton Reference projection preserves supported source axes with actual rankzero", async () => {
  const { plan } = await bindingFixtureV3();
  const witness = await references.fitReferenceSourceV3(plan);
  const reference = await references.buildReferenceV2(witness, { displayName: "Source", currentPlan: plan });
  const { plan: target } = await bindingFixtureV3("e".repeat(64), (draft, data) => {
    draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 };
    data.rows = [data.rows[0]];
  }, reference);
  const worker = host();
  worker.send({ kind: "run-open-ena-plan-v3", id: "singleton", plan: target, chunkSize: 1 });
  const terminal = (await worker.terminal("singleton")).at(-1)!;
  assert.equal(terminal.kind, "result-v3", String(terminal.message));
  const result = terminal.result as import("../lib/open-ena/model-v3/types").BoundStandardResultV3;
  assert.equal(result.executionProvenance.projection.rank, 0);
  assert.deepEqual(result.executionProvenance.projection.estimableAxes, reference.fit.estimableAxes);
  assert.equal(result.executionProvenance.diagnostics.filter((entry) => entry.id === "STANDARD_REFERENCE_TARGET_DEGENERATE").length, 1);
  assert.deepEqual(result.executionProvenance.projection.variance, [0, 0, 0]);
  const { validateBoundResultV3 } = await import("../lib/open-ena/model-v3/result-binding");
  await validateBoundResultV3(result, target);
  await assert.rejects(() => references.analyzePlanWithReferenceSourceV3(target), /target-fitted|projected/i);
});

test("Reference validation preserves tolerance-level rankzero even with positive normalized variance shares", async () => {
  const { plan } = await bindingFixtureV3();
  const witness = await references.fitReferenceSourceV3(plan);
  const reference = await references.buildReferenceV2(witness, { displayName: "Source", currentPlan: plan });
  const { plan: target } = await bindingFixtureV3("f".repeat(64), (draft, data) => {
    draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 };
    data.rows = [{ ...data.rows[0], unit: "tiny1" }, { ...data.rows[0], unit: "tiny2", B: 2 + 1e-15 }];
  }, reference);
  const worker = host();
  worker.send({ kind: "run-open-ena-plan-v3", id: "tolerance", plan: target, chunkSize: 1 });
  const terminal = (await worker.terminal("tolerance")).at(-1)!;
  assert.equal(terminal.kind, "result-v3", String(terminal.message));
  const result = terminal.result as import("../lib/open-ena/model-v3/types").BoundStandardResultV3;
  assert.equal(result.executionProvenance.projection.rank, 0);
  assert.ok(result.executionProvenance.projection.variance.some((value) => value > 0));
  const { validateBoundResultV3 } = await import("../lib/open-ena/model-v3/result-binding");
  await validateBoundResultV3(result, target);
});

test("Standard plans disguised with ONA family tags never enter either numerical stream", async () => {
  const { plan } = await bindingFixtureV3();
  const worker = host();
  worker.send({ kind: "run-open-ena-plan-v3", id: "ona", plan: { ...plan, header: { ...plan.header, analysisFamily: "ona" }, configuration: { ...plan.configuration, analysisFamily: "ona" } }, chunkSize: 1 });
  assert.equal((await worker.terminal("ona")).at(-1)?.kind, "error");
  assert.equal(worker.streamCount(), 0);
});
