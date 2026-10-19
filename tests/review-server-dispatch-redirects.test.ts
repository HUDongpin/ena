import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { generateLunaInterpretation, LunaClientError } from "../lib/server/deepseek-client";
import { createOpenEnaLongitudinalPostHandlerV3 } from "../lib/server/open-ena-longitudinal-route";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}

const interpretation = { observedPatterns: [{ statement: "Synthetic aggregate pattern.", evidenceRefs: ["axis-1"] }], contextualQuestions: [], limitations: ["Aggregate evidence only."] };
const providerBody = { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(interpretation) }] }] };

for (const status of [307, 308]) {
  test(`DeepSeek ${status} cannot forward the reviewed aggregate to another origin`, async () => {
    const received: Array<{ method: string | undefined; bodyBytes: number; includesAggregate: boolean }> = [];
    const target = await listen((request, response) => { const chunks: Buffer[] = []; request.on("data", (chunk) => chunks.push(chunk)); request.on("end", () => { const body = Buffer.concat(chunks); received.push({ method: request.method, bodyBytes: body.length, includesAggregate: body.toString("utf8").includes("descriptive-primary") }); response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(providerBody)); }); });
    const provider = await listen((request, response) => {
      if (request.url === "/user/balance") response.writeHead(200, { "content-type": "application/json" }).end('{"is_available":true}');
      else response.writeHead(status, { location: `${target.origin}/unapproved` }).end();
    });
    try {
      let failure: unknown;
      try {
        await generateLunaInterpretation(interpretationRequest(), {
          environment: { OPEN_ENA_AI_ENABLED: "true", DEEPSEEK_API_KEY: "synthetic-redirect-key" },
          // Only substitute the initial approved endpoint with an owned loopback
          // server. Native Fetch handles every redirect, header and body below.
          fetch: (input, init) => { const url = new URL(String(input)); assert.equal(url.origin, "https://api.deepseek.com"); return fetch(`${provider.origin}${url.pathname}`, init); },
        });
      } catch (error) { failure = error; }
      assert.deepEqual(received, [], "no aggregate POST may reach the unapproved redirect destination");
      assert.ok(failure instanceof LunaClientError);
      assert.equal(failure.providerDispatched, true, "the original approved endpoint was contacted; its billing outcome remains uncertain");
    } finally { await provider.close(); await target.close(); }
  });
}

test("DeepSeek rejects a redirected balance check before sending any reviewed aggregate", async () => {
  let redirectedCalls = 0;
  let responsesCalls = 0;
  const target = await listen((_request, response) => { redirectedCalls++; response.writeHead(200, { "content-type": "application/json" }).end('{"is_available":true}'); });
  const provider = await listen((request, response) => {
    if (request.url === "/user/balance") response.writeHead(302, { location: `${target.origin}/unapproved` }).end();
    else { responsesCalls++; response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(providerBody)); }
  });
  try {
    let failure: unknown;
    try {
      await generateLunaInterpretation(interpretationRequest(), { environment: { OPEN_ENA_AI_ENABLED: "true", DEEPSEEK_API_KEY: "synthetic-redirect-key" }, fetch: (input, init) => { const url = new URL(String(input)); assert.equal(url.origin, "https://api.deepseek.com"); return fetch(`${provider.origin}${url.pathname}`, init); } });
    } catch (error) { failure = error; }
    assert.equal(redirectedCalls, 0);
    assert.equal(responsesCalls, 0);
    assert.ok(failure instanceof LunaClientError);
    assert.equal(failure.providerDispatched, false);
  } finally { await provider.close(); await target.close(); }
});

function capability(origin: string) {
  const job = `${origin}/v1/jobs/synthetic-job`;
  return { schemaVersion: "3dena.longitudinal-compute-capability.v2", jobId: "synthetic-job", capabilityToken: "synthetic-capability-token-32-bytes", expiresAt: "2027-01-01T00:00:00Z", urls: { schemaVersion: "3dena.longitudinal-compute-status-urls.v2", statusUrl: job, eventsUrl: `${job}/events`, resultUrl: `${job}/result`, artifactUrl: `${job}/artifact`, cancelUrl: job, deleteUrl: job } };
}

async function submission() {
  const request = await validOpenEnaLongitudinalRequestV3(20, 200);
  request.execution.target = "persistent-compute-service";
  return new Request("https://review.invalid/api/open-ena/longitudinal", { method: "POST", headers: { origin: "https://review.invalid", "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: "3dena.open-ena-longitudinal-remote-submit.v3", executionAttemptId: "attempt-0123456789abcdef0123456789abcdef", processingPolicyConfirmed: true, request }) });
}

const serviceToken = "synthetic-service-token-for-redirect-regression";
function route(origin: string) {
  return createOpenEnaLongitudinalPostHandlerV3({ environment: { OPEN_ENA_PUBLIC_ORIGIN: "https://review.invalid", OPEN_ENA_LONGITUDINAL_COMPUTE_URL: origin, OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN: serviceToken }, verifyPrincipal: () => ({ principalRef: "synthetic-principal" }), consumeQuota: () => true });
}

for (const status of [301, 302, 303, 307, 308]) {
  test(`longitudinal ${status} cannot forward the server service token to another origin`, async () => {
    const received: Array<{ token: string | string[] | undefined; method: string | undefined; bodyBytes: number }> = [];
    const target = await listen((request, response) => { let bytes = 0; request.on("data", (chunk: Buffer) => { bytes += chunk.length; }); request.on("end", () => { received.push({ token: request.headers["x-3dena-service-token"], method: request.method, bodyBytes: bytes }); response.writeHead(400).end(); }); });
    const provider = await listen((_request, response) => response.writeHead(status, { location: `${target.origin}/unapproved` }).end());
    try {
      const response = await route(provider.origin)(await submission());
      assert.deepEqual(received, [], "no service credential or derived data may reach the redirect destination");
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /synthetic-service-token/u);
    } finally { await provider.close(); await target.close(); }
  });
}

test("a direct longitudinal response still passes the actual privacy and scientific validators", async () => {
  let calls = 0;
  const provider = await listen((request, response) => { calls++; assert.equal(request.method, "POST"); assert.equal(request.headers["x-3dena-service-token"], serviceToken); response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify(capability(provider.origin))); });
  try { assert.equal((await route(provider.origin)(await submission())).status, 202); assert.equal(calls, 1); }
  finally { await provider.close(); }
});
