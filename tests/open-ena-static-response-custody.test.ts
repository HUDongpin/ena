import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
// @ts-expect-error Dependency-free Node ESM browser harness helper.
import { installOwnedStaticResponseCaptureV3, prepareOwnedStaticResponseCaptureV3, readOwnedStaticResponseRecordsV3, verifyBrowserStaticRequestCompletionV3, verifyOriginalStaticResponseV3, STATIC_RESPONSE_CUSTODY_HEADER_V3, STATIC_RESPONSE_CUSTODY_LIMITS_V3 } from "./helpers/open-ena-static-response-custody-v3.mjs";

const bytes = Buffer.from("original immutable worker import\n".repeat(30));
const sha256 = createHash("sha256").update(bytes).digest("hex");
type CaptureOptions = { encoding?: string; status?: number; payload?: Buffer; limits?: Partial<Record<"encodedBytes" | "inFlightBytes" | "decodedBytes" | "records" | "journalBytes", number>>; requests?: number; journal?: string };

async function capture(options: CaptureOptions = {}) {
  const directory = options.journal ? dirname(options.journal) : mkdtempSync(join(tmpdir(), "ena-static-custody-"));
  const journal = options.journal ?? join(directory, "responses.ndjson");
  const restore = installOwnedStaticResponseCaptureV3(journal, { ...STATIC_RESPONSE_CUSTODY_LIMITS_V3, ...options.limits });
  let requests = 0;
  const server = http.createServer((_, response) => {
    requests++;
    response.statusCode = options.status ?? 200;
    response.setHeader("Content-Type", "application/javascript");
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (options.encoding) response.setHeader("Content-Encoding", options.encoding);
    const payload = options.payload ?? bytes;
    response.write(payload.subarray(0, 3));
    response.end(payload.subarray(3));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    let id: string | null = null, status = 0;
    for (let index = 0; index < (options.requests ?? 1); index++) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/_next/static/worker.js`);
      id = response.headers.get(STATIC_RESPONSE_CUSTODY_HEADER_V3); status = response.status;
      assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), options.encoding ? bytes : options.payload ?? bytes);
    }
    // Unit requestfinished fixture; the browser companion records the real events.
    return { records: readOwnedStaticResponseRecordsV3(journal), id, status, requestTarget: "/_next/static/worker.js", expectedSha256: sha256, requests, request: { requestFinishedAt: new Date().toISOString() } };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    restore(); if (!options.journal) rmSync(directory, { recursive: true, force: true });
  }
}

test("original streamed responses retain exact decoded bytes and unchanged cache headers without refetch", async () => {
  for (const [encoding, payload] of [[undefined, bytes], ["gzip", gzipSync(bytes)], ["br", brotliCompressSync(bytes)], ["deflate", deflateSync(bytes)]] as const) {
    const captured = await capture({ encoding, payload });
    const proof = verifyOriginalStaticResponseV3(captured);
    assert.equal(proof.source, "owned-server-original-response");
    assert.equal(proof.sha256, sha256);
    assert.equal(proof.decodedBytes, bytes.length);
    assert.equal(proof.encodedBytes, payload.length);
    assert.equal(captured.requests, 1);
  }
});

test("a matching successful server response requires confirmed browser completion without failure", async () => {
  const captured = await capture();
  for (const request of [
    undefined, {}, { requestFinishedAt: "" },
    { requestFailedAt: new Date().toISOString(), requestFailure: "net::ERR_ABORTED" },
    { ...captured.request, requestFailedAt: new Date().toISOString(), requestFailure: "net::ERR_ABORTED" },
    { ...captured.request, requestFailure: "net::ERR_FAILED" },
  ]) assert.throws(() => verifyOriginalStaticResponseV3({ ...captured, request }), /Browser static request/u);
});

test("a later failure on the shared browser request invalidates an earlier original-response proof", async () => {
  const captured = await capture();
  verifyOriginalStaticResponseV3(captured);
  verifyBrowserStaticRequestCompletionV3(captured.request);
  Object.assign(captured.request, { requestFailedAt: new Date().toISOString(), requestFailure: "net::ERR_ABORTED" });
  assert.throws(() => verifyOriginalStaticResponseV3(captured), /Browser static request/u);
  assert.throws(() => verifyBrowserStaticRequestCompletionV3(captured.request), /Browser static request/u);
});

test("capture runs under one output parent preserve separate exclusive journals and preloads", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ena-repeat-custody-"));
  try {
    writeFileSync(join(directory, "static-response-preload.mjs"), "earlier preload\n", { flag: "wx" });
    writeFileSync(join(directory, "original-static-responses.ndjson"), "earlier journal\n", { flag: "wx" });
    const first = prepareOwnedStaticResponseCaptureV3(directory);
    const firstRun = await capture({ journal: join(directory, first.journal) });
    const firstJournal = readFileSync(join(directory, first.journal), "utf8");
    const second = prepareOwnedStaticResponseCaptureV3(directory);
    const secondRun = await capture({ journal: join(directory, second.journal) });
    assert.notEqual(first.directory, second.directory);
    for (const prepared of [first, second]) {
      assert.equal(dirname(prepared.journal), prepared.directory);
      assert.equal(dirname(prepared.preload), prepared.directory);
      assert.match(readFileSync(join(directory, prepared.preload), "utf8"), /installOwnedStaticResponseCaptureV3/u);
      assert.throws(() => writeFileSync(join(directory, prepared.preload), "overwrite", { flag: "wx" }), { code: "EEXIST" });
      assert.throws(() => installOwnedStaticResponseCaptureV3(join(directory, prepared.journal)), { code: "EEXIST" });
    }
    assert.notEqual(firstRun.id, secondRun.id);
    assert.equal(firstRun.records.length, 1);
    assert.equal(secondRun.records.length, 1);
    assert.equal(readFileSync(join(directory, first.journal), "utf8"), firstJournal);
    assert.equal(readFileSync(join(directory, "static-response-preload.mjs"), "utf8"), "earlier preload\n");
    assert.equal(readFileSync(join(directory, "original-static-responses.ndjson"), "utf8"), "earlier journal\n");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("missing, wrong, duplicate or mismatched original responses cannot replace a browser body", async () => {
  const captured = await capture();
  for (const change of [
    { id: undefined }, { id: randomUUID() }, { records: [] },
    { records: [...captured.records, ...captured.records] },
    { requestTarget: "/_next/static/another-worker.js" }, { status: 404 },
    { expectedSha256: "0".repeat(64) },
    { records: [{ ...captured.records[0], sha256: "0".repeat(64) }] },
    { records: [{ ...captured.records[0], status: 404 }] },
    { records: [{ ...captured.records[0], complete: false }] },
  ]) assert.throws(() => verifyOriginalStaticResponseV3({ ...captured, ...change }));
  const failedStatus = await capture({ status: 404 });
  assert.throws(() => verifyOriginalStaticResponseV3(failedStatus));
  const changedBytes = await capture({ payload: Buffer.from("different original response bytes") });
  assert.notEqual(changedBytes.records[0].sha256, sha256);
  assert.throws(() => verifyOriginalStaticResponseV3(changedBytes));
});

test("encoded, in-flight, decoded and count retention limits fail closed", async () => {
  for (const limits of [{ encodedBytes: 3 }, { inFlightBytes: 3 }]) {
    const captured = await capture({ limits });
    assert.match(captured.records[0].error, /byte limit/u);
    assert.throws(() => verifyOriginalStaticResponseV3(captured));
  }
  const decompressed = await capture({ encoding: "gzip", payload: gzipSync(bytes), limits: { decodedBytes: 3 } });
  assert.ok(decompressed.records[0].error);
  assert.equal(decompressed.records[0].sha256, undefined);
  assert.throws(() => verifyOriginalStaticResponseV3(decompressed));
  const counted = await capture({ limits: { records: 1 }, requests: 3 });
  assert.equal(counted.records.length, 2);
  assert.match(counted.records[1].error, /record limit/u);
  assert.throws(() => verifyOriginalStaticResponseV3(counted));
});
