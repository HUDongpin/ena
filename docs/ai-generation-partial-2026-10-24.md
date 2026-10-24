# Multilingual AI output-contract investigation — PARTIAL

Baseline: `a60c93b`. Investigation date: 2026-10-24 (Hong Kong).
Provider/model: DeepSeek `deepseek-flash`. Evidence: the fixed synthetic
aggregate request from the October 24 complete-cloud acceptance.

## Release decision

No output-contract repair candidate met the required acceptance standard.
The planned nine-generation release matrix has not been run on an accepted
candidate. This work must not be described as a Chinese AI fix or a completed
three-item production release. Issue #108 remains open.

The owner subsequently authorized a narrower release of the verified workspace
language switch, retained/clearable AI records, first-visit guidance, and bounded
diagnostics. That scope does not require the unpassed provider-success matrix
as an admission gate and does not claim a Chinese-generation repair. Production
acceptance for those released behaviors is recorded separately; #108 stays open
until the output contract is repaired and real multilingual generation passes.

The production provider transport, approved V2 prompt bytes and hashes,
1,800-token budget and strict interpretation/evidence contract remain unchanged.
The implementation adds bounded diagnostics and rejects non-string prose at
the new-generation boundary; historical-record readers retain their behavior.
These safeguards improve diagnosis and rejection, not provider success rates.

## Recorded experiments

Each row used the same synthetic evidence and made one request per supported
language. Every completed interpretation response was HTTP 200 and below the
token cap. The application accepted only complete contract-valid output.

| Diagnostic configuration | Accepted / attempted | Rejections observed |
| --- | --- | --- |
| Unchanged V2 baseline | 0 / 3 | Extra top-level fields; more than eight references in an observation |
| Add `strict: true` to native format | 2 / 3 | Reference-count overflow |
| Append explicit output-shape/count instructions | 2 / 3 | Extra top-level field |
| Combine explicit instructions and `strict` | 1 / 3 | Extra top-level fields and reference overflow |
| JSON-object format with the same explicit instructions | 2 / 3 | Extra top-level field |
| Structural schema subset, retaining all application checks | 0 / 3 | Extra field; observation/limitation counts over their bounds |
| Temperature zero, otherwise unchanged V2 | 2 / 3 | Extra top-level field |

These are **21 diagnostic calls across seven different configurations**, not a
stability estimate or a passed release matrix. Failed candidates were retained;
none was promoted or retried until a favorable result could replace a failure.

Two additional synthetic canaries tested narrower boundaries. A one-key closed
enum schema on Responses passed. A strict function-argument canary on
`/beta/chat/completions` returned a disallowed enum value and extra nested/top-level
keys. No tool was executed, no follow-up request was made, and that experimental
protocol was not added to the application.

## Findings and limits

The reproduced failures are completed provider outputs that violate the
requested contract. They do not establish truncation as the cause. The provider
echoes the schema, but this does not prove it enforced every constraint. The
underlying cause of inconsistent enforcement is not established.

DeepSeek documents the Responses format and compatibility separately from beta
strict function schemas. The latter explicitly has a limited keyword subset;
this is not proof that Responses shares that subset. See the
[Responses reference](https://api-docs.deepseek.com/api/create-response/),
[compatibility guide](https://api-docs.deepseek.com/guides/responses_api/), and
[strict function documentation](https://api-docs.deepseek.com/guides/tool_calls/).

The original production `responses-contract-json` failure cannot be attributed
to a specific cause because its original response was not retained. New
diagnostics report only normalized language/version/model, status, measured
size/usage, and fixed failure rules/field paths. They identify the first rejected
condition, not a complete list of defects. Real user text and upstream exception
messages are excluded.

An independent review also reproduced prose-type coercion: object, number and
boolean values could become text through the historical normalizer. Newly
generated provider responses now reject those types before normalization;
valid Chinese strings and independently validated usage are preserved.

Ignored local evidence is under `output/ai-closeout-20261024/`, including
`provider-investigation-summary.json`, the seven experiment directories and the
two canary receipts. Synthetic response captures passed a credential scan.
Parser acceptance is structural evidence, not scientific acceptance of an AI
interpretation. No real participant data was used.
