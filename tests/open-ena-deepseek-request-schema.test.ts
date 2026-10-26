import assert from "node:assert/strict";
import test from "node:test";
import { generateLunaInterpretation } from "../lib/server/deepseek-client";
import { collectOpenEnaAiEvidenceIds } from "../lib/open-ena/ai-interpretation";
import {
  getApprovedOpenEnaAiPromptArtifact,
  instantiateOpenEnaAiResponseSchema,
  OPEN_ENA_AI_PROMPT_SPEC_V1,
} from "../lib/server/open-ena-ai-prompt-governance";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";

const interpretation = {
  observedPatterns: [{ statement: "Aggregate pattern.", evidenceRefs: ["axis-1"] }],
  contextualQuestions: [],
  limitations: ["Aggregate evidence only."],
};

const configured = {
  OPEN_ENA_AI_ENABLED: "true",
  DEEPSEEK_API_KEY: "synthetic-deepseek-key",
  OPEN_ENA_AI_MODEL: "deepseek-flash",
};

test("DeepSeek explicitly requests strict adherence to the unchanged approved aggregate schema", async () => {
  const payload = interpretationRequest();
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const result = await generateLunaInterpretation(payload, {
    environment: configured,
    reservationMicroUsd: 10_000,
    fetch: async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ url, body });
      if (url.endsWith("/user/balance")) return Response.json({ is_available: true });
      return Response.json({
        status: "completed",
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(interpretation) }] }],
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, input_tokens_details: { cached_tokens: 25 } },
      });
    },
  });

  assert.deepEqual(calls.map((call) => call.url), [
    "https://api.deepseek.com/user/balance",
    "https://api.deepseek.com/responses",
  ]);
  const request = calls[1].body!;
  assert.equal(request.model, "deepseek-flash");
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, { effort: "none" });
  assert.equal(request.max_output_tokens, OPEN_ENA_AI_PROMPT_SPEC_V1.tokenBudget);
  assert.deepEqual(request.text, { format: {
    type: "json_schema",
    name: "open_ena_ai_interpretation",
    strict: true,
    schema: instantiateOpenEnaAiResponseSchema(payload.promptVersion, payload.locale, [...collectOpenEnaAiEvidenceIds(payload.evidence)]),
  } });
  assert.deepEqual(request.input, [
    { role: "system", content: getApprovedOpenEnaAiPromptArtifact(payload.promptVersion, payload.locale).systemPrompt },
    { role: "user", content: JSON.stringify(payload.evidence) },
  ]);
  assert.equal(JSON.stringify(request).includes(payload.binding.datasetHash), false);
  assert.equal(result.response.provider, "deepseek");
  assert.equal(result.response.model, "deepseek-flash");
  assert.deepEqual(result.usage, {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
    costMicroUsd: 54,
  });
});
