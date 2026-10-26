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

The matrix completed **9/9 PASS** on frozen candidate `bb5b65153d40b0f70078f182b3b65c6703ae7a15`, from **16:44:40 to 16:46:52 Taipei time (UTC+08:00), 26 October 2026**. Exactly nine interpretation POSTs were dispatched; no retries, repairs, fallback models, or replacement successes were used.

| Locale | Consecutive results | Accepted |
| --- | --- | --- |
| English (`en`) | PASS / PASS / PASS | 3/3 |
| Simplified Chinese (`zh-hans`) | PASS / PASS / PASS | 3/3 |
| Traditional Chinese (`zh-hant`) | PASS / PASS / PASS | 3/3 |

Every response was HTTP 200 with `finish_reason: stop` and the exact pinned model ID. All nine strict-content, preservation and usage audits passed. Output lengths were **460–948 tokens**, below 1,800; elapsed times were **11.737–18.852 seconds**, below 20 seconds. Total recorded usage was 18,180 input and 6,390 output tokens. No invoice or currency cost is inferred from those counters.

The root independently recomputed the plan/raw/accepted hashes, checked all source hashes and private file permissions, and compared each parsed raw interpretation with its accepted artifact. Every interpretation was identical; no words, observations, reference associations, questions or limitations were dropped or rewritten. Source snapshots before and after the run were identical. A second independent read-only review checked all nine raw/accepted/per-case receipts, the plan hash and all six critical source hashes; all 47 observations and 55 limitations were preserved, with no duplicate or unknown references.

- [Frozen plan](evidence/qwen-candidate-20261026/live-nine-plan.json)
- [Complete redacted nine-call receipt](evidence/qwen-candidate-20261026/live-nine-receipt.json)
- [Compact result summary](evidence/qwen-candidate-20261026/live-nine-summary.json)

Receipt SHA-256: `7671389865936ea5c522a8fbeedc536eb33fab39a8b8f498b0f065e98ebc77b8`.

Raw synthetic responses and accepted interpretations remain in the private local `output/qwen-fixed-nine-20261026` directory (directory mode 0700, files 0600); raw provider text and credentials are not committed. No additional provider request was made for the offline evidence checks.

Final local verification before the run passed 108 focused tests (42 candidate/runner tests plus 66 existing provider/payload/prompt checks), non-incremental TypeScript, approved prompt verification and diff checks. Independent review reproduced and fixed a nested JSON credential-redaction defect before any real generation; its negative control saves zero sensitive raw responses.

This result satisfies the requested fixed-evidence nine-call gate for **this independent Qwen candidate**. It is not a general reliability estimate, an application integration acceptance, a production deployment, or a six-call dual-domain result. PR #118's earlier DeepSeek 5/9 result is preserved and is not relabeled as passing.

## Integration boundary

The production provider enum, request route, environment configuration, billing provider ownership, consent text and public UI remain unchanged. The existing interpretation-content parser is exported for direct reuse without changing its implementation or historical response reader. A successful standalone matrix would still require separate application integration and release verification before any production switch.

## References

- [Alibaba structured output and supported schema keywords](https://help.aliyun.com/en/model-studio/qwen-structured-output)
- [Alibaba API key and region guidance](https://www.alibabacloud.com/help/en/model-studio/get-api-key)
- [Preserved DeepSeek nine-call receipt](https://github.com/HUDongpin/ena/blob/29a05be7acfcfd4d748219aba1a9c6a5a780dc87/docs/evidence/ai-contract-repair-20261026/live-nine-receipt.json)
