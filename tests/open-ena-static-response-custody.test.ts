import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
// @ts-expect-error Dependency-free Node ESM browser harness helper.
import { installOwnedStaticResponseCaptureV3, readOwnedStaticResponseRecordsV3, verifyOriginalStaticResponseV3, STATIC_RESPONSE_CUSTODY_HEADER_V3, STATIC_RESPONSE_CUSTODY_LIMITS_V3 } from "./helpers/open-ena-static-response-custody-v3.mjs";

const bytes = Buffer.from("original immutable worker import\n".repeat(30));
const sha256 = createHash("sha256").update(bytes).digest("hex");
type CaptureOptions = { encoding?: string; status?: number; payload?: Buffer; limits?: Partial<Record<"encodedBytes" | "inFlightBytes" | "decodedBytes" | "records" | "journalBytes", number>>; requests?: number };

async function capture(options: CaptureOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ena-static-custody-"));
  const journal = join(directory, "responses.ndjson");
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
    return { records: readOwnedStaticResponseRecordsV3(journal), id, status, requestTarget: "/_next/static/worker.js", expectedSha256: sha256, requests };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    restore(); rmSync(directory, { recursive: true, force: true });
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
