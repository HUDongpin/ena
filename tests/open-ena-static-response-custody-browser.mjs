#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { installOwnedStaticResponseCaptureV3, readOwnedStaticResponseRecordsV3, verifyOriginalStaticResponseV3, STATIC_RESPONSE_CUSTODY_HEADER_V3 } from "./helpers/open-ena-static-response-custody-v3.mjs";

const sources = new Map([
  ["/_next/static/worker.js", 'importScripts("/_next/static/a.js", "/_next/static/b.js", "/_next/static/c.js"); postMessage("done");'],
  ...["a", "b", "c"].map(name => [`/_next/static/${name}.js`, `globalThis.${name}=true;`.repeat(300)]),
]);
const hashes = new Map([...sources].map(([path, body]) => [path, createHash("sha256").update(body).digest("hex")]));
const directory = mkdtempSync(join(tmpdir(), "ena-worker-custody-")), journal = join(directory, "responses.ndjson");
const restore = installOwnedStaticResponseCaptureV3(journal);
const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  response.setHeader("Content-Type", request.url === "/" ? "text/html" : "application/javascript");
  response.end(request.url === "/" ? '<script>window.runWorker=()=>new Promise(resolve=>{const worker=new Worker("/_next/static/worker.js");worker.onmessage=()=>{worker.terminate();resolve()}})</script>' : sources.get(request.url));
});
let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(), responses = [], closures = [], requests = new WeakMap();
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/_next/static/")) requests.set(request, {}); });
  page.on("requestfinished", request => { const entry = requests.get(request); if (entry) entry.requestFinishedAt = new Date().toISOString(); });
  page.on("requestfailed", request => { const entry = requests.get(request); if (entry) Object.assign(entry, { requestFailedAt: new Date().toISOString(), requestFailure: request.failure()?.errorText ?? "unknown" }); });
  page.on("worker", worker => closures.push(new Promise(resolve => worker.once("close", resolve))));
  page.on("response", response => { if (new URL(response.url()).pathname.startsWith("/_next/static/")) responses.push(response); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (let run = 0; run < 8; run++) { await page.evaluate(() => window.runWorker()); await closures.at(-1); }
  const records = readOwnedStaticResponseRecordsV3(journal);
  const failures = [], proofs = [];
  for (const response of responses) {
    const url = new URL(response.url());
    assert.equal(response.status(), 200);
    try { assert.equal(createHash("sha256").update(await response.body()).digest("hex"), hashes.get(url.pathname)); }
    catch (error) {
      assert.match(error.message, /Target page, context or browser has been closed|No resource with given identifier|Response body is unavailable/u);
      failures.push(error.message);
      const request = requests.get(response.request());
      assert.ok(request?.requestFinishedAt, `No browser requestfinished event for ${url.pathname}`);
      assert.equal(request.requestFailedAt, undefined);
      assert.equal(request.requestFailure, undefined);
      proofs.push(verifyOriginalStaticResponseV3({ records, request, id: response.headers()[STATIC_RESPONSE_CUSTODY_HEADER_V3], requestTarget: url.pathname + url.search, status: response.status(), expectedSha256: hashes.get(url.pathname) }));
    }
  }
  assert.equal(page.isClosed(), false);
  assert.equal(closures.length, 8);
  assert.equal(responses.length, 32);
  assert.ok(records.length < responses.length, "The Worker regression must actually reuse cached original responses");
  assert.ok(failures.length > 0, "The fixture did not reproduce the closed Worker CDP response-body failure");
  assert.equal(readOwnedStaticResponseRecordsV3(journal).length, records.length, "Verifying original responses must not refetch any asset");
  console.log(JSON.stringify({ status: "PASS", workersClosed: closures.length, pageClosed: page.isClosed(), browserResponses: responses.length, browserRequestsFinished: responses.filter(response => requests.get(response.request())?.requestFinishedAt).length, browserRequestsFailed: responses.filter(response => requests.get(response.request())?.requestFailedAt).length, originalResponses: records.length, browserBodyFailures: failures.length, verifiedOriginalResponses: proofs.length, captureSource: proofs[0].source, exampleBodyFailure: failures[0], cachePolicy: "browser-default", assetRefetches: 0 }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  restore(); rmSync(directory, { recursive: true, force: true });
}
