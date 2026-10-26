# Qwen fixed-evidence validation candidate

This is an independent Alibaba Cloud Model Studio experiment, not a production provider switch. PR #118's DeepSeek 5/9 result remains unchanged.

## Fixed candidate

- Selected credential source: the separate `ALI QWEN` entry in the approved project document. The Sufeiya entry is excluded. No credential values are stored in this record.
- Region and endpoint: Beijing, `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`.
- Pinned model: `qwen3.7-plus-2026-05-26`.
- Same synthetic evidence and approved English, Simplified Chinese, and Traditional Chinese V2 prompts as the preceding DeepSeek matrix.
- Fixed order: three English attempts, three Simplified Chinese attempts, three Traditional Chinese attempts. One request per case, no retries, fallbacks or success-only replacement.
- Non-thinking, non-streaming, 1,800 output-token budget and 20-second request/body deadline.
- Strict JSON Schema is sent to Qwen. Only the documented unsupported `uniqueItems` keyword is removed from the transport clone. Original prompt/schema artifacts remain unchanged; the local strict parser continues to reject duplicate or unknown references, oversized arrays, unknown fields, non-string generated prose and missing limitations.
- No projection or content repair: observation count/order, statements, evidence associations, questions and limitations must survive the independent preservation audit unchanged apart from the historical parser's whitespace normalization.
- The adapter records Qwen token usage only. It does not reuse DeepSeek prices, balance APIs, provider identifiers or billing reservations.

## Access verification

The selected credential returned HTTP 200 for the Beijing model catalogue and the pinned snapshot was present. The same GET without authentication returned HTTP 401. These checks made zero model-generation requests and do not by themselves establish generation quota or reliability.

## Execution status

The independent candidate is prepared for a single fixed nine-generation matrix. Final local verification passed 108 focused tests (including 42 candidate/runner tests and 66 existing provider/payload/prompt checks), non-incremental TypeScript, approved prompt verification and diff checks. Independent review reproduced and fixed a nested JSON credential-redaction defect before any real generation; its negative control now saves zero sensitive raw responses. The final candidate will be committed before execution. No generation has yet run, and all nine subsequent outcomes will be retained.

## Integration boundary

The production provider enum, request route, environment configuration, billing provider ownership, consent text and public UI remain unchanged. The existing interpretation-content parser is exported for direct reuse without changing its implementation or historical response reader. A successful standalone matrix would still require separate application integration and release verification before any production switch.

## References

- [Alibaba structured output and supported schema keywords](https://help.aliyun.com/en/model-studio/qwen-structured-output)
- [Alibaba API key and region guidance](https://www.alibabacloud.com/help/en/model-studio/get-api-key)
- [Preserved DeepSeek nine-call receipt](https://github.com/HUDongpin/ena/blob/29a05be7acfcfd4d748219aba1a9c6a5a780dc87/docs/evidence/ai-contract-repair-20261026/live-nine-receipt.json)
