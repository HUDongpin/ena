import assert from "node:assert/strict";
import http from "node:http";
import { appendFileSync, closeSync, openSync, readFileSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

export const STATIC_RESPONSE_CUSTODY_HEADER_V3 = "x-open-ena-smoke-asset-custody";
export const STATIC_RESPONSE_CUSTODY_LIMITS_V3 = Object.freeze({
  encodedBytes: 16 * 1024 * 1024, decodedBytes: 16 * 1024 * 1024,
  inFlightBytes: 64 * 1024 * 1024, records: 10000, journalBytes: 16 * 1024 * 1024,
});
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

/** Observe original writes only. No refetch, routing, cache or Worker changes. */
export function installOwnedStaticResponseCaptureV3(journalPath, limits = STATIC_RESPONSE_CUSTODY_LIMITS_V3) {
  for (const value of Object.values(limits)) assert.ok(Number.isSafeInteger(value) && value > 0);
  const fd = openSync(journalPath, "wx", 0o600);
  const originalCreateServer = http.createServer;
  let retainedBytes = 0, records = 0, journalBytes = 0, limitRecorded = false, closed = false;
  const append = record => {
    const line = JSON.stringify(record) + "\n";
    if (journalBytes + Buffer.byteLength(line) > limits.journalBytes) throw new Error("Static response custody journal byte limit exceeded");
    appendFileSync(fd, line); journalBytes += Buffer.byteLength(line);
  };
  const observe = (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!url.pathname.startsWith("/_next/static/")) return;
    const id = randomUUID();
    response.setHeader(STATIC_RESPONSE_CUSTODY_HEADER_V3, id);
    if (++records > limits.records) {
      if (!limitRecorded) { append({ error: "Static response custody record limit exceeded" }); limitRecorded = true; }
      return;
    }
    const entry = { id, method: request.method, requestTarget: url.pathname + url.search, path: url.pathname };
    let chunks = [], size = 0, finalized = false, captureError;
    const discard = () => { retainedBytes -= size; chunks = []; size = 0; };
    const capture = (chunk, encoding) => {
      if (chunk == null || typeof chunk === "function" || captureError) return;
      const length = typeof chunk === "string" ? Buffer.byteLength(chunk, typeof encoding === "string" ? encoding : undefined) : chunk.byteLength;
      if (size + length > limits.encodedBytes || retainedBytes + length > limits.inFlightBytes) {
        captureError = "Static response custody encoded or in-flight byte limit exceeded"; discard(); return;
      }
      const bytes = Buffer.from(chunk, typeof encoding === "string" ? encoding : undefined);
      chunks.push(bytes); size += bytes.length; retainedBytes += bytes.length;
    };
    const write = response.write, end = response.end;
    response.write = function (chunk, encoding) { capture(chunk, encoding); return write.apply(this, arguments); };
    response.end = function (chunk, encoding) { capture(chunk, encoding); return end.apply(this, arguments); };
    const finalize = complete => {
      if (finalized) return; finalized = true;
      Object.assign(entry, { status: response.statusCode, complete, contentEncoding: String(response.getHeader("content-encoding") ?? "identity"), encodedBytes: size, capturedAt: new Date().toISOString() });
      try {
        assert.equal(complete, true, "Original static response did not finish");
        assert.equal(response.getHeader(STATIC_RESPONSE_CUSTODY_HEADER_V3), id, "Original static response custody ID changed");
        if (captureError) throw new Error(captureError);
        let bytes = Buffer.concat(chunks);
        for (const encoding of entry.contentEncoding.split(",").map(value => value.trim().toLowerCase()).reverse()) {
          const decode = { gzip: gunzipSync, br: brotliDecompressSync, deflate: inflateSync }[encoding];
          if (encoding !== "identity") { assert.ok(decode, `Unsupported static response encoding: ${encoding}`); bytes = decode(bytes, { maxOutputLength: limits.decodedBytes }); }
          assert.ok(bytes.length <= limits.decodedBytes, "Static response custody decoded byte limit exceeded");
        }
        Object.assign(entry, { decodedBytes: bytes.length, sha256: digest(bytes) });
      } catch (error) { entry.error = error.message; }
      finally { discard(); append(entry); }
    };
    response.once("finish", () => finalize(true));
    response.once("close", () => finalize(response.writableFinished));
  };
  const createServer = function (...args) { const server = originalCreateServer.apply(this, args); server.prependListener("request", observe); return server; };
  http.createServer = createServer; syncBuiltinESMExports();
  const close = () => { if (closed) return; closed = true; if (http.createServer === createServer) { http.createServer = originalCreateServer; syncBuiltinESMExports(); } closeSync(fd); };
  process.once("exit", close);
  return () => { process.off("exit", close); close(); };
}

export function readOwnedStaticResponseRecordsV3(journalPath) {
  assert.ok(statSync(journalPath).size <= STATIC_RESPONSE_CUSTODY_LIMITS_V3.journalBytes, "Static response custody journal is oversized");
  const lines = readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean);
  assert.ok(lines.length <= STATIC_RESPONSE_CUSTODY_LIMITS_V3.records + 1, "Static response custody has too many records");
  return lines.map(line => JSON.parse(line));
}

/** The browser-observed ID binds a lost Worker body to the original response. */
export function verifyOriginalStaticResponseV3({ records, id, requestTarget, status, expectedSha256 }) {
  assert.match(id ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u, "Missing or invalid browser-observed static response custody ID");
  const matches = records.filter(record => record.id === id);
  assert.equal(matches.length, 1, "Original static response custody record is missing or duplicated");
  const record = matches[0];
  assert.equal(record.error, undefined, record.error);
  assert.equal(record.complete, true, "Original static response is incomplete");
  assert.equal(record.method, "GET");
  assert.equal(record.requestTarget, requestTarget, "Original static response path does not match the browser response");
  assert.ok(record.path.startsWith("/_next/static/"));
  assert.equal(status, 200, "Browser static response was not successful");
  assert.equal(record.status, status, "Original static response status does not match the browser response");
  assert.match(expectedSha256 ?? "", /^[0-9a-f]{64}$/u, "Static response is absent from the immutable build");
  assert.equal(record.sha256, expectedSha256, "Original static response bytes differ from the immutable build");
  return { source: "owned-server-original-response", id, sha256: record.sha256, contentEncoding: record.contentEncoding, encodedBytes: record.encodedBytes, decodedBytes: record.decodedBytes, capturedAt: record.capturedAt };
}
