# Qwen fixed-nine candidate plan

> Execution: independent synthetic provider candidate only; no deployment, production provider switch, live user data, or automatic retries.

**Goal:** Evaluate the owner's explicitly selected non-Sufeiya Alibaba Model Studio credential against the same fixed synthetic evidence used by PR #118, with three consecutive real generations per supported locale.

**Architecture:** A standalone script adapter calls Qwen Chat Completions. The candidate reuses approved V2 prompts and the existing strict interpretation-content parser, exposing that parser without changing its behavior or accepting a new provider in production records. A separate runner freezes nine attempts and keeps raw synthetic responses private and complete redacted receipts reviewable.

**Tech stack:** Existing Node.js/TypeScript tooling and native fetch; no additional runtime dependency.

## Frozen choices

- Base: `52ef99cc304e8c35c994daee236eb0839534963c`.
- Provider: Alibaba Cloud Model Studio; region: China (Beijing).
- Endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`.
- Model: `qwen3.7-plus-2026-05-26`, present in the authenticated model catalogue on 2026-10-26.
- Model discovery: one authenticated GET, HTTP 200; zero interpretation generations. Only the separate `ALI QWEN` document entry was selected; the excluded Sufeiya entry was not sent to any service. Credentials remain in process memory.
- Fixed fixture SHA-256: `06c65f11f455236448275d7327e62e153558e2c8312b81b9310e9e4d4c9fc9dd`, byte-identical to PR #118's fixed synthetic request.
- Sequence: en 1–3, zh-hans 1–3, zh-hant 1–3. All nine planned outcomes are retained, with exactly one POST per attempt and zero retries or repair calls.
- Approved V2 system prompts and evidence serialization remain unchanged. Explicit non-thinking mode, non-streamed response, 1,800 output-token cap and 20-second request/body deadline.
- Qwen strict JSON Schema transport: only the unsupported `uniqueItems` keyword is omitted from the request-local transport schema. The approved schema is not mutated. `minItems`, `maxItems`, `additionalProperties: false`, string bounds and evidence enums remain; the local parser still rejects duplicates.
- Raw Qwen content goes directly to strict type/content validation. No PR #118 projection, observation splitting, deduplication, dropped disclosures, schema loosening or invented limitations.
- Successful acceptance requires 9/9 strict passes and 9/9 independent preservation checks, not merely HTTP 200. Record actual token usage, not DeepSeek prices or invented Qwen billing totals.
- Keep PR #118's DeepSeek 5/9 receipt unchanged. A pass here would establish this bounded candidate result only, not production integration or broad stochastic reliability.

## Work and verification

- [x] Add standalone Qwen adapter and meaningful failure-first tests for transport schema, strict content, bounded body reading, timeout, usage and single-dispatch behavior.
- [x] Add a preflight-only-by-default fixed-nine runner; test order, complete failure retention, output custody and preservation failures offline.
- [x] Run focused existing strict-parser, prompt-governance and provider regressions plus TypeScript.
- [x] Independently review the frozen candidate and ensure production routes, provider labels, billing and configuration remain unchanged.
- [ ] Commit the candidate before the nine live calls; freeze source and input hashes, and use a new private output directory.
- [ ] Execute the authorized matrix once. Save the redacted receipt and document every accepted/rejected case without replacing failures.

## Source verification

Alibaba documents JSON Schema support for the Qwen3.7-Plus series, and supports `minItems`/`maxItems` while rejecting `uniqueItems` in strict mode:
https://help.aliyun.com/en/model-studio/qwen-structured-output

API keys and endpoints are region-specific:
https://www.alibabacloud.com/help/en/model-studio/get-api-key

The installed `bl` CLI was checked first. Its text command does not expose a JSON Schema `response_format` argument; its model-list command uses console authentication. This candidate therefore uses a bounded direct HTTPS adapter for the exact approved key and strict-schema request instead of relying on an unrelated CLI login or testing a weaker plain-text command.
