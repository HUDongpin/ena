import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_NOVA_EFFORT, DEFAULT_NOVA_MODEL, getNovaModels, getNovaProviderConfig, isNovaEffort, isNovaModelKey, novaEffortPolicy, resolveNovaModel } from "../lib/nova/models";

test("Nova exposes exactly the four approved real models with explicit versions", () => {
  assert.equal(DEFAULT_NOVA_MODEL, "qwen-max");
  assert.equal(DEFAULT_NOVA_EFFORT, "medium");
  assert.deepEqual(getNovaModels({}).map(m => [m.key, m.apiModel]), [
    ["qwen-flash", "qwen3.8-flash"], ["qwen-max", "qwen3.8-max-0902"],
    ["deepseek-flash", "deepseek-flash"], ["deepseek-pro", "deepseek-v4-pro"],
  ]);
  assert.ok(getNovaModels({}).every(m => !m.available && m.unavailableReason));
  assert.equal(resolveNovaModel("deepseek-pro", {}).version, "DeepSeek-V4-Pro-0813");
  assert.equal(isNovaModelKey("__proto__"), false);
  assert.equal(isNovaEffort("ultra"), false);
});

test("provider secrets stay out of model projections and disabling Nova is authoritative", () => {
  const environment = { ENA_NOVA_ENABLED: "true", ENA_NOVA_QWEN_API_KEY: "synthetic-key-nova", DEEPSEEK_API_KEY: "synthetic-key-deepseek" };
  assert.ok(getNovaModels(environment).every(m => m.available));
  assert.ok(!JSON.stringify(getNovaModels(environment)).includes("synthetic-key"));
  assert.ok(getNovaModels({ ...environment, ENA_NOVA_ENABLED: "false" }).every(m => !m.available));
  assert.equal(getNovaProviderConfig("qwen", environment)?.baseUrl, "https://dashscope-intl.aliyuncs.com/compatible-mode/v1");
});

test("provider endpoints reject credentials, redirects-as-config, queries and lookalike hosts", () => {
  const env = { ENA_NOVA_QWEN_API_KEY: "synthetic-key" };
  for (const endpoint of ["http://dashscope.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com.evil.test/compatible-mode/v1", "https://user@dashscope.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1?secret=yes", "https://dashscope.aliyuncs.com/arbitrary", "https://dashscope.aliyuncs.com:9443/compatible-mode/v1"]) {
    assert.equal(getNovaProviderConfig("qwen", { ...env, ENA_NOVA_QWEN_BASE_URL: endpoint }), null, endpoint);
  }
  assert.ok(getNovaProviderConfig("qwen", { ...env, ENA_NOVA_QWEN_BASE_URL: "https://workspace-1.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1/" }));
  assert.equal(getNovaProviderConfig("deepseek", { DEEPSEEK_API_KEY: "synthetic", ENA_NOVA_DEEPSEEK_BASE_URL: "https://evil.test" }), null);
});

test("server model changes require accurate label and version together", () => {
  const env = { ENA_NOVA_ENABLED: "true", ENA_NOVA_QWEN_API_KEY: "synthetic", ENA_NOVA_QWEN_MAX_MODEL: "future-model" };
  assert.equal(resolveNovaModel("qwen-max", env).available, false);
  const model = resolveNovaModel("qwen-max", { ...env, ENA_NOVA_QWEN_MAX_LABEL: "Future verified model", ENA_NOVA_QWEN_MAX_VERSION: "future-snapshot" });
  assert.equal(model.available, true);
  assert.equal(model.apiModel, "future-model");
});

test("four effort levels preserve the provider-specific mapping and bounded repair budgets", () => {
  assert.deepEqual(["low", "medium", "high", "xhigh"].map(e => novaEffortPolicy(e as "low").thinkingBudget), [4096, 16384, 65536, 262144]);
  assert.deepEqual(["low", "medium", "high", "xhigh"].map(e => novaEffortPolicy(e as "low").deepseekEffort), ["low", "high", "high", "max"]);
  assert.deepEqual(["low", "medium", "high", "xhigh"].map(e => novaEffortPolicy(e as "low").maxRepairs), [1, 2, 3, 4]);
  assert.ok(novaEffortPolicy("medium").maxSteps > 0);
  assert.throws(() => novaEffortPolicy("invalid" as "low"));
});
