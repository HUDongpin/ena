import assert from "node:assert/strict";
import test from "node:test";
import { generateLunaInterpretation, LunaClientError, OPEN_ENA_AI_MAX_COMPLETION_TOKENS } from "../lib/server/deepseek-client";
import {
  OPEN_ENA_PROVIDER_DISCLOSURE_KEYS,
  OPEN_ENA_PROVIDER_METADATA_ECHO_KEYS,
  projectOpenEnaProviderInterpretation,
} from "../lib/server/open-ena-ai-provider-projection";
import {
  collectOpenEnaAiEvidenceIds,
  OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
  parseOpenEnaAiInterpretationResponse,
  type OpenEnaAiInterpretationRequestV2,
} from "../lib/open-ena/ai-interpretation";
import {
  OPEN_ENA_AI_APPROVED_ARTIFACT_SHA256_BY_LOCALE_V2,
  getApprovedOpenEnaAiPromptArtifact,
} from "../lib/server/open-ena-ai-prompt-governance";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";

const key = "synthetic-deepseek-key";
const clean = {
  observedPatterns: [{ statement: "合成观察。", evidenceRefs: ["axis-1"] }],
  contextualQuestions: [] as string[],
  limitations: ["仅限汇总证据。"],
};

function responseBody(output: string, outputTokens = 20) {
  return {
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: output }] }],
    usage: { input_tokens: 10, output_tokens: outputTokens, total_tokens: 10 + outputTokens },
  };
}

async function dispatch(
  locale: OpenEnaAiInterpretationRequestV2["locale"],
  output: string,
  edgeCount = 1,
) {
  const request = interpretationRequest(locale, { edgeCount });
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const entries: unknown[][] = [];
  const environment = process.env as Record<string, string | undefined>;
  const original = console.error;
  const nodeEnv = environment.NODE_ENV;
  console.error = (...values: unknown[]) => { entries.push(values); };
  environment.NODE_ENV = "production";
  let result: Awaited<ReturnType<typeof generateLunaInterpretation>> | null = null;
  let caught: LunaClientError | null = null;
  try {
    result = await generateLunaInterpretation(request, {
      environment: { OPEN_ENA_AI_ENABLED: "true", DEEPSEEK_API_KEY: key },
      clock: () => new Date("2026-10-26T03:00:00.000Z"),
      fetch: async (input, init) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
        calls.push({ url, body });
        if (url.endsWith("/user/balance")) return Response.json({ is_available: true });
        return Response.json(responseBody(output));
      },
    });
  } catch (error) {
    assert.ok(error instanceof LunaClientError);
    caught = error;
  } finally {
    console.error = original;
    if (nodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = nodeEnv;
  }
  const paid = calls.filter((call) => call.url.endsWith("/responses"));
  assert.equal(paid.length, 1, "one user action dispatches one provider response");
  return { request, result, caught, entries, paid: paid[0], serialized: JSON.stringify(entries) };
}

function evidenceIds(request: OpenEnaAiInterpretationRequestV2) {
  return [...collectOpenEnaAiEvidenceIds(request.evidence)];
}

function wrapped(request: OpenEnaAiInterpretationRequestV2, interpretation: unknown) {
  return {
    schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
    promptVersion: request.promptVersion,
    binding: request.binding,
    provider: "deepseek" as const,
    model: "deepseek-flash",
    generatedAt: "2026-10-26T03:00:00.000Z",
    interpretation,
  };
}

test("provider repair allowlists stay closed", () => {
  assert.deepEqual([...OPEN_ENA_PROVIDER_METADATA_ECHO_KEYS], [
    "$schema",
    "additionalProperties",
    "name",
    "promptVersion",
    "responseFormatNote",
    "schemaVersion",
    "type",
  ]);
  assert.deepEqual([...OPEN_ENA_PROVIDER_DISCLOSURE_KEYS], [
    "disclosure",
    "limitationNote",
    "missingnessDisclosure",
    "supplementalNote",
  ]);
});

test("projection does not mutate provider JSON or duplicate an existing limitation", () => {
  const ids = new Set(["axis-1"]);
  const input = {
    ...clean,
    schemaVersion: "echo",
    supplementalNote: clean.limitations[0],
    observedPatterns: [{ statement: "合成观察。", evidenceRefs: ["axis-1"], schemaVersion: "echo" }],
  };
  const frozen = structuredClone(input);
  const projected = projectOpenEnaProviderInterpretation(input, ids);
  assert.deepEqual(input, frozen);
  assert.deepEqual(projected, clean);
  assert.deepEqual(projectOpenEnaProviderInterpretation({ ...clean, supplementalNote: " \n\t" }, ids), clean);
});

test("approved v2 prompt bytes and hashes stay bound", () => {
  assert.equal(OPEN_ENA_AI_MAX_COMPLETION_TOKENS, 1_800);
  assert.deepEqual(OPEN_ENA_AI_APPROVED_ARTIFACT_SHA256_BY_LOCALE_V2, {
    en: "c765ce2284f5f820898b66ad29369f86e68402dc67175bb9c93ae0b297c5d783",
    "zh-hant": "3539adc465912e0af5abcecd4b78e800c8b5528c3f1940cb3fccf8006c8bc316",
    "zh-hans": "642a0e0048d898417139d5755794afaefa11e0dbd707ea1895d5d7ba3c807e66",
  });
});

test("the outbound v2 request keeps the approved prompt, evidence payload, and token cap", async () => {
  const { request, paid } = await dispatch("zh-hans", JSON.stringify(clean));
  const body = paid.body!;
  const input = body.input as Array<{ role: string; content: string }>;
  const format = (body.text as { format: Record<string, unknown> }).format;
  const artifact = getApprovedOpenEnaAiPromptArtifact(request.promptVersion, request.locale);
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 1_800);
  assert.equal(Object.hasOwn(body, "temperature"), false);
  assert.equal(format.type, "json_schema");
  assert.equal(Object.hasOwn(format, "strict"), false);
  assert.equal(input[0].content, artifact.systemPrompt);
  assert.equal(input[1].content, JSON.stringify(request.evidence));
  assert.equal(artifact.contentSha256, OPEN_ENA_AI_APPROVED_ARTIFACT_SHA256_BY_LOCALE_V2["zh-hans"]);
});

test("the strict response parser still rejects extra fields and reference overflow", () => {
  const request = interpretationRequest("en", { edgeCount: 3 });
  const ids = evidenceIds(request);
  assert.equal(ids.length, 9);
  assert.throws(
    () => parseOpenEnaAiInterpretationResponse(wrapped(request, { ...clean, schemaVersion: "echo" }), request),
    /unexpected field/i,
  );
  assert.throws(
    () => parseOpenEnaAiInterpretationResponse(wrapped(request, {
      ...clean,
      observedPatterns: [{ statement: "合成观察。", evidenceRefs: ids }],
    }), request),
    /exceeds its allowed length/i,
  );
  assert.deepEqual(
    parseOpenEnaAiInterpretationResponse(wrapped(request, clean), request).interpretation,
    clean,
  );
});

test("Simplified Chinese schema echoes are removed and the closed interpretation is accepted", async () => {
  for (const extra of ["schemaVersion", "type", "responseFormatNote"] as const) {
    const { result, caught, serialized } = await dispatch("zh-hans", JSON.stringify({ ...clean, [extra]: "PRIVATE_SCHEMA_ECHO" }));
    assert.equal(caught, null, `${extra} must be repaired without a second dispatch`);
    assert.deepEqual(result?.response.interpretation, clean);
    assert.equal(result?.response.promptVersion, "open-ena-aggregate-inference-review-v2");
    assert.ok(!serialized.includes("PRIVATE_SCHEMA_ECHO") && !serialized.includes(key));
    assert.ok(!JSON.stringify(result?.response.interpretation).includes("PRIVATE_SCHEMA_ECHO"));
  }
});

test("Traditional Chinese disclosure fields are preserved as limitations", async () => {
  const note = "合成披露，仅用于合约测试。";
  for (const extra of ["supplementalNote", "missingnessDisclosure"] as const) {
    const { result, caught, serialized } = await dispatch("zh-hant", JSON.stringify({ ...clean, [extra]: note }));
    assert.equal(caught, null, `${extra} must be preserved inside the closed contract`);
    assert.deepEqual(result?.response.interpretation, {
      ...clean,
      limitations: [...clean.limitations, note],
    });
    assert.ok(!serialized.includes(note) && !serialized.includes(extra));
  }
});

test("English reference overflow is partitioned without dropping supplied evidence", async () => {
  const requestIds = evidenceIds(interpretationRequest("en", { edgeCount: 3 }));
  assert.equal(requestIds.length, 9);
  const statement = "Synthetic aggregate pattern.";
  const { result, caught, serialized } = await dispatch("en", JSON.stringify({
    ...clean,
    observedPatterns: [{ statement, evidenceRefs: requestIds }],
  }), 3);
  assert.equal(caught, null, "nine supplied references must fit the closed contract in one dispatch");
  assert.deepEqual(result?.response.interpretation.observedPatterns, [
    { statement, evidenceRefs: requestIds.slice(0, 8) },
    { statement, evidenceRefs: requestIds.slice(8) },
  ]);
  assert.deepEqual(result?.response.interpretation.limitations, clean.limitations);
  assert.ok(!serialized.includes(statement) && !serialized.includes(requestIds[8]));
});

test("duplicate citations that push one pattern past eight references collapse without dropping distinct ids", async () => {
  const ids = evidenceIds(interpretationRequest("en", { edgeCount: 3 }));
  const repeated = [ids[0], ...ids, ids[0]];
  assert.ok(repeated.length > 8);
  const { result, caught } = await dispatch("en", JSON.stringify({
    ...clean,
    observedPatterns: [{ statement: "Synthetic aggregate pattern.", evidenceRefs: repeated }],
  }), 3);
  assert.equal(caught, null);
  assert.deepEqual(result?.response.interpretation.observedPatterns, [
    { statement: "Synthetic aggregate pattern.", evidenceRefs: ids.slice(0, 8) },
    { statement: "Synthetic aggregate pattern.", evidenceRefs: ids.slice(8) },
  ]);
});

test("within-limit duplicate references stay rejected", async () => {
  const { caught, entries, serialized } = await dispatch("en", JSON.stringify({
    ...clean,
    observedPatterns: [{ statement: "合成观察。", evidenceRefs: ["axis-1", "axis-1"] }],
  }));
  assert.ok(caught);
  const diagnostic = JSON.parse(entries[0][1] as string);
  assert.equal(diagnostic.rule, "duplicate");
  assert.equal(diagnostic.field, "interpretation.observedPatterns[].evidenceRefs");
  assert.ok(!serialized.includes("axis-1"));
});

test("an unlisted extra field is still rejected and is not copied into diagnostics", async () => {
  const { caught, entries, serialized } = await dispatch("zh-hans", JSON.stringify({
    ...clean,
    "private-participant-name": "private-data",
  }));
  assert.ok(caught);
  assert.equal(entries.length, 1);
  const diagnostic = JSON.parse(entries[0][1] as string);
  assert.equal(diagnostic.rule, "unexpected-field");
  assert.equal(diagnostic.field, "interpretation");
  assert.equal(diagnostic.stage, "responses-contract-structure");
  assert.ok(!serialized.includes("private-participant-name") && !serialized.includes("private-data"));
});

test("a non-string disclosure is not coerced into limitation text", async () => {
  const { caught, entries, serialized } = await dispatch("zh-hant", JSON.stringify({
    ...clean,
    supplementalNote: { hidden: "private-disclosure" },
  }));
  assert.ok(caught);
  const diagnostic = JSON.parse(entries[0][1] as string);
  assert.equal(diagnostic.rule, "unexpected-field");
  assert.ok(!serialized.includes("private-disclosure"));
});

test("a disclosure is rejected instead of truncated when limitations are already full", async () => {
  const note = "合成披露，不能截断。";
  const { caught, entries, serialized } = await dispatch("zh-hant", JSON.stringify({
    ...clean,
    limitations: Array.from({ length: 8 }, (_, index) => `合成限制 ${index + 1}`),
    supplementalNote: note,
  }));
  assert.ok(caught);
  const diagnostic = JSON.parse(entries[0][1] as string);
  assert.equal(diagnostic.rule, "array-length");
  assert.equal(diagnostic.field, "interpretation.limitations");
  assert.equal(diagnostic.stage, "responses-contract-limitation");
  assert.ok(!serialized.includes(note));
});

test("an overlong disclosure is a text-length failure and is not shortened", async () => {
  const note = "合".repeat(601);
  const { caught, entries, serialized } = await dispatch("zh-hans", JSON.stringify({
    ...clean,
    missingnessDisclosure: note,
  }));
  assert.ok(caught);
  const diagnostic = JSON.parse(entries[0][1] as string);
  assert.equal(diagnostic.rule, "text-length");
  assert.equal(diagnostic.field, "interpretation.limitations");
  assert.ok(!serialized.includes(note));
});

test("reference overflow that does not fit in eight patterns stays rejected", async () => {
  const ids = evidenceIds(interpretationRequest("en", { edgeCount: 3 }));
  const patterns = [
    { statement: "Synthetic aggregate pattern.", evidenceRefs: ids },
    ...Array.from({ length: 7 }, (_, index) => ({
      statement: `Synthetic pattern ${index + 2}.`,
      evidenceRefs: ["axis-1"],
    })),
  ];
  assert.equal(patterns.length, 8);
  const { caught, entries, serialized } = await dispatch("en", JSON.stringify({ ...clean, observedPatterns: patterns }), 3);
  assert.ok(caught);
  const diagnostic = JSON.parse(entries[0][1] as string);
  assert.equal(diagnostic.rule, "array-length");
  assert.equal(diagnostic.field, "interpretation.observedPatterns[].evidenceRefs");
  assert.ok(!serialized.includes("Synthetic aggregate pattern."));
});

test("nine observations, nine limitations, and seven questions stay size failures", async () => {
  const observations = await dispatch("en", JSON.stringify({
    ...clean,
    observedPatterns: Array.from({ length: 9 }, () => clean.observedPatterns[0]),
  }));
  const observationDiagnostic = JSON.parse(observations.entries[0][1] as string);
  assert.equal(observationDiagnostic.rule, "array-length");
  assert.equal(observationDiagnostic.field, "interpretation.observedPatterns");

  const limitations = await dispatch("en", JSON.stringify({
    ...clean,
    limitations: Array.from({ length: 9 }, (_, index) => `合成限制 ${index + 1}`),
  }));
  const limitationDiagnostic = JSON.parse(limitations.entries[0][1] as string);
  assert.equal(limitationDiagnostic.rule, "array-length");
  assert.equal(limitationDiagnostic.field, "interpretation.limitations");

  const questions = await dispatch("en", JSON.stringify({
    ...clean,
    contextualQuestions: Array.from({ length: 7 }, (_, index) => `合成问题 ${index + 1}`),
  }));
  const questionDiagnostic = JSON.parse(questions.entries[0][1] as string);
  assert.equal(questionDiagnostic.rule, "array-length");
  assert.equal(questionDiagnostic.field, "interpretation.contextualQuestions");
});
