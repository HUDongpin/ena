# Multilingual output-contract repair — candidate record

Date: 2026-10-26. Baseline: current `main` after the merged #110 diagnostics.
Issue: #108. This note does not close that issue.

No participant text, credentials, or provider prose are recorded here.
Fixture strings in the tests are synthetic.

## Root cause

The October 24 bounded repro, and the seven-configuration record in
`docs/ai-generation-partial-2026-10-24.md`, show completed DeepSeek
`deepseek-flash` responses (HTTP 200, under the 1,800-token cap) that still
violate the closed interpretation contract. The failures that were actually
retained are extra object keys and arrays over their bounds, including more
than eight references on one observation. Raising the token cap is not
supported by those cases.

DeepSeek's Responses `json_schema` format asks for conformance, but those
completed payloads show it does not reliably enforce `additionalProperties`
or `maxItems`. The original production `responses-contract-json` body was
not retained, so that syntax failure still has no demonstrated cause.
Truncation is distinguishable when the provider marks `max_output_tokens`
or the completion itself reaches the 1,800-token cap with invalid JSON.
It was not the cause of the retained extra-key and reference-count cases.

## Candidates

| Candidate | Result |
| --- | --- |
| Unchanged V2, `strict: true`, appended count instructions, both together, JSON-object format, structural schema subset, temperature 0 | Already recorded on 2026-10-24. 21 synthetic calls, every configuration failed at least one language. Not re-run. None promoted. |
| Second provider call that asks the model to repair the JSON | Not adopted. One dispatch per user action, and a dispatched request must not be silently retried. |
| Higher token cap | Not adopted. Retained failures were completed and under the cap. |
| Loosen `parseOpenEnaAiInterpretationResponse` | Not adopted. The strict parser still rejects extra fields, unknown evidence ids, non-string prose, and over-long arrays. Historical V2 records stay on that parser. |
| New prompt version | Not promoted. One-shot instruction changes already failed to reach 3/3, and there is no live matrix for a new binding. Approved V2 prompt bytes and locale hashes are unchanged. |
| Closed projection, then the unchanged strict parser | Adopted for the production DeepSeek client only. |

`strict` is not a documented Responses `text.format` field; unsupported
parameters are ignored. The earlier `strict: true` run is not evidence that
Responses enforced the schema.

## Adopted projection

`projectOpenEnaProviderInterpretation` runs only on new DeepSeek output,
before the non-string prose guard and `parseOpenEnaAiInterpretationResponse`.

- Metadata is removed only when its value exactly matches the current V2
  contract: `additionalProperties: false`, `type: "object"`,
  `name: "open_ena_ai_interpretation"`,
  `promptVersion: "open-ena-aggregate-inference-review-v2"`, or
  `schemaVersion: "open-ena-ai-interpretation-response-v2"`.
  Other values, including prose or objects under those keys, are rejected.
  `$schema` is rejected because the outbound V2 response schema has no such
  field; no URI or version aliases are accepted.
- Top-level disclosure strings (`disclosure`, `limitationNote`,
  `missingnessDisclosure`, `responseFormatNote`, `supplementalNote`) are appended to
  `limitations` when they fit. They are not truncated, coerced from
  non-strings, or dropped when the limitation list is already full.
  An empty string is removed. A duplicate of an existing limitation is not
  repeated.
- Disclosures inside an observed pattern are rejected. Moving such prose to
  a global limitation would lose which pattern and evidence it qualifies;
  the projection does not rewrite scientific statements or invent links.
- A reference list longer than eight may collapse duplicates, in first-seen
  order, only when every id was supplied and at most eight distinct ids remain.
  The observation count, order, statement, and complete distinct evidence set
  are retained. Lists with more than eight distinct ids remain strict-parser
  failures: splitting observations can change which claim an ordinal disclosure
  such as "Observation 2" qualifies. Unknown, malformed, or non-string refs are
  not filtered out to make a list fit. Within-limit duplicates still reject.
- Any other extra key, a ninth observation, a ninth limitation, or a
  seventh contextual question is still rejected.
- The stored record is whatever the strict parser returns. The raw provider
  object is not saved.

Diagnostics stay allowlisted. JSON syntax below the token cap, missing
fields, extra fields, type failures, array and text size, truncation at
the output-token cap, and evidence-reference failures use separate rules.
Logs still omit provider prose, field values, and credentials. A contract
failure does not start a second paid request. Rejected responses still
carry provider usage.

The independent review reproduced three accepted-output defects in the original
candidate: missingness prose under `responseFormatNote` disappeared,
pattern-level disclosures became detached global limitations, and reference
partitioning renumbered observations without updating ordinal disclosures.
Regression tests failed before the corresponding corrections (7 failures for
metadata/disclosure handling, then 2 for reference partitioning). The final
contract suite passes 21/21. Production-client mocks verify retained disclosure
words or fail-closed rejection, one response dispatch, retained usage, and
redacted diagnostics. Lists with more than eight distinct references remain an
unrepaired provider failure; these tests do not establish live reliability.

## Live matrix

The owner has authorized one fixed nine-call candidate validation on 2026-10-26:
three consecutive real generations for each of `en`, `zh-hans`, and `zh-hant`,
using `tests/fixtures/ai-live-fixed-synthetic-request-20261026.json`. This is the
same synthetic teaching evidence used by the earlier diagnostic matrix. Only
the locale changes; model, V2 prompt bytes, 1,800-token cap, and 20-second
provider deadline remain fixed. Every result is retained; no success-only
selection or implicit retry is permitted.

The runner is `scripts/verify-open-ena-ai-live-matrix.ts`. Without `--run-nine`
it performs a local preflight only. Credentials are supplied through process
memory and never included in the fixture, receipt, source, or logs.

Run result is pending. #108 remains open. No production deployment or
post-deployment six-call dual-domain check is authorized in this change.
