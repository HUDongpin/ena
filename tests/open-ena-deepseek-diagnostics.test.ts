import assert from "node:assert/strict";
import test from "node:test";
import { generateLunaInterpretation, LunaClientError } from "../lib/server/deepseek-client";
import { OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2 } from "../lib/open-ena/ai-interpretation";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";

const key = "synthetic-deepseek-key";
const valid = { observedPatterns: [{ statement: "合成证据。", evidenceRefs: ["axis-1"] }], contextualQuestions: [], limitations: ["仅限汇总证据。"] };
async function failure(output: string, options: { status?: string; incomplete?: string; http?: number; outputTokens?: number } = {}) {
  const outputTokens = options.outputTokens ?? 5;
  const body = { status: options.status ?? "completed", ...(options.incomplete ? { incomplete_details: { reason: options.incomplete } } : {}),
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: output }] }],
    usage: { input_tokens: 10, output_tokens: outputTokens, total_tokens: 10 + outputTokens } };
  const environment = process.env as Record<string, string | undefined>;
  const entries: unknown[][] = [], original = console.error, nodeEnv = environment.NODE_ENV;
  console.error = (...values: unknown[]) => { entries.push(values); };
  environment.NODE_ENV = "production";
  let caught: LunaClientError | null = null;
  let paidDispatches = 0;
  try {
    await generateLunaInterpretation({ ...interpretationRequest(), locale: "zh-hans" }, {
      environment: { OPEN_ENA_AI_ENABLED: "true", DEEPSEEK_API_KEY: key },
      fetch: async (input) => {
        if (String(input).endsWith("/user/balance")) return Response.json({ is_available: true });
        paidDispatches += 1;
        return Response.json(body, { status: options.http ?? 200 });
      },
    });
  } catch (error) { assert.ok(error instanceof LunaClientError); caught = error; }
  finally { console.error = original; if (nodeEnv === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = nodeEnv; }
  assert.ok(caught, "malformed output must remain rejected");
  assert.equal(paidDispatches, 1, "a contract failure must not trigger another paid dispatch");
  assert.equal(entries.length, 1);
  assert.equal(typeof entries[0][1], "string", "failure needs bounded structured diagnostics");
  const diagnostic = JSON.parse(entries[0][1] as string);
  assert.equal(diagnostic.locale, "zh-hans");
  assert.equal(diagnostic.promptVersion, interpretationRequest().promptVersion);
  assert.equal(diagnostic.model, "deepseek-flash");
  assert.equal(diagnostic.httpStatus, options.http ?? 200);
  if ((options.http ?? 200) === 200) {
    assert.equal(diagnostic.responseBytes, Buffer.byteLength(JSON.stringify(body)));
    assert.equal(diagnostic.outputTokens, outputTokens);
    assert.equal(caught.providerDispatched, true);
    assert.equal(caught.usage?.completionTokens, outputTokens, "unusable responses remain accountable");
  }
  return { diagnostic, serialized: JSON.stringify(entries), error: caught };
}

test("DeepSeek JSON syntax diagnostics contain contract location without text or secrets", async () => {
  const { diagnostic, serialized } = await failure('{"private-output-user-name":"private-message",');
  assert.equal(diagnostic.stage, "responses-contract-json");
  assert.equal(diagnostic.rule, "json-syntax");
  assert.equal(diagnostic.field, "interpretation");
  assert.equal(diagnostic.responseStatus, "completed");
  assert.ok(!serialized.includes("private-output-user-name") && !serialized.includes("private-message") && !serialized.includes(key));
});

test("DeepSeek unexpected keys report the closed object without copying provider field names", async () => {
  const { diagnostic, serialized } = await failure(JSON.stringify({ ...valid, "private-participant-name": "private-data" }));
  assert.equal(diagnostic.rule, "unexpected-field");
  assert.equal(diagnostic.field, "interpretation");
  assert.ok(!serialized.includes("private-participant-name") && !serialized.includes("private-data"));
});

test("DeepSeek missing required keys have an allowlisted field path", async () => {
  const { diagnostic } = await failure(JSON.stringify({ observedPatterns: [], contextualQuestions: [] }));
  assert.equal(diagnostic.rule, "required-field");
  assert.equal(diagnostic.field, "interpretation.limitations");
});

test("DeepSeek array type and length failures remain distinguishable", async () => {
  const wrongType = await failure(JSON.stringify({ ...valid, observedPatterns: "private-text" }));
  assert.equal(wrongType.diagnostic.rule, "array-type");
  assert.equal(wrongType.diagnostic.field, "interpretation.observedPatterns");
  const tooMany = await failure(JSON.stringify({ ...valid, observedPatterns: Array.from({ length: 9 }, () => valid.observedPatterns[0]) }));
  assert.equal(tooMany.diagnostic.rule, "array-length");
  assert.equal(tooMany.diagnostic.field, "interpretation.observedPatterns");
});

test("DeepSeek rejects unseen evidence references without logging them", async () => {
  const { diagnostic, serialized } = await failure(JSON.stringify({ ...valid, observedPatterns: [{ statement: "合成。", evidenceRefs: ["private-evidence"] }] }));
  assert.equal(diagnostic.rule, "evidence-reference");
  assert.equal(diagnostic.field, "interpretation.observedPatterns[].evidenceRefs");
  assert.ok(!serialized.includes("private-evidence"));
});

test("DeepSeek still rejects reference overflow that cites evidence outside the request", async () => {
  const { diagnostic, serialized } = await failure(JSON.stringify({
    ...valid,
    observedPatterns: [{ statement: "合成。", evidenceRefs: Array.from({ length: 9 }, (_, i) => `edge-difference-${i + 1}`) }],
  }));
  assert.equal(diagnostic.rule, "array-length");
  assert.equal(diagnostic.field, "interpretation.observedPatterns[].evidenceRefs");
  assert.ok(!serialized.includes("edge-difference-9"));
});

test("DeepSeek classifies a malformed evidence id as a reference failure", async () => {
  const { diagnostic, serialized } = await failure(JSON.stringify({
    ...valid,
    observedPatterns: [{ statement: "合成。", evidenceRefs: ["BadRef"] }],
  }));
  assert.equal(diagnostic.stage, "responses-contract-evidence-ref");
  assert.equal(diagnostic.rule, "evidence-reference");
  assert.equal(diagnostic.field, "interpretation.observedPatterns[].evidenceRefs");
  assert.ok(!serialized.includes("BadRef"));
});

test("DeepSeek classifies token-cap JSON syntax as truncation and keeps shorter syntax distinct", async () => {
  const capped = await failure('{"observedPatterns":', { outputTokens: 1_800 });
  assert.equal(capped.diagnostic.rule, "truncation");
  assert.equal(capped.diagnostic.stage, "responses-shape");
  assert.equal(capped.diagnostic.field, "interpretation");
  assert.equal(capped.diagnostic.responseStatus, "completed");
  assert.ok(!capped.serialized.includes("observedPatterns"));
});

test("DeepSeek rejects non-string prose even when a schema echo is also present", async () => {
  const { diagnostic, serialized } = await failure(JSON.stringify({
    ...valid,
    schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
    observedPatterns: [{ statement: { private: "private-prose" }, evidenceRefs: ["axis-1"] }],
  }));
  assert.equal(diagnostic.rule, "string-type");
  assert.equal(diagnostic.field, "interpretation.observedPatterns[].statement");
  assert.ok(!serialized.includes("private-prose") && !serialized.includes("echo"));
});

test("DeepSeek incomplete output reports bounded finish metadata and preserves usage", async () => {
  const { diagnostic } = await failure(JSON.stringify(valid), { status: "incomplete", incomplete: "max_output_tokens" });
  assert.equal(diagnostic.stage, "responses-shape");
  assert.equal(diagnostic.responseStatus, "incomplete");
  assert.equal(diagnostic.incompleteReason, "max_output_tokens");
  assert.equal(diagnostic.rule, "response-shape");
});

test("DeepSeek arbitrary status and incomplete reason cannot enter diagnostics", async () => {
  const { diagnostic, serialized } = await failure(JSON.stringify(valid), { status: "private-status", incomplete: "private-reason" });
  assert.equal(diagnostic.responseStatus, "unknown");
  assert.equal(diagnostic.incompleteReason, "unknown");
  assert.ok(!serialized.includes("private-status") && !serialized.includes("private-reason"));
});
