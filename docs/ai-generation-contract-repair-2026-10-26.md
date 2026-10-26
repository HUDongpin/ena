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

- Metadata echoes are removed and not stored: `$schema`,
  `additionalProperties`, `name`, `promptVersion`, `responseFormatNote`,
  `schemaVersion`, `type`.
- Disclosure strings (`disclosure`, `limitationNote`,
  `missingnessDisclosure`, `supplementalNote`) are appended to
  `limitations` when they fit. They are not truncated, coerced from
  non-strings, or dropped when the limitation list is already full.
  An empty string is removed. A duplicate of an existing limitation is not
  repeated.
- A reference list longer than eight is partitioned, in order, only when
  every id is a supplied evidence id and the resulting pattern count is
  still at most eight. Distinct ids are kept. Unknown, malformed, or
  non-string refs are not filtered out to make the list fit. Within-limit
  duplicates are still rejected.
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

## Live matrix

Not run. This environment has no `DEEPSEEK_API_KEY`. The required gate is
still three consecutive real generations on one fixed synthetic evidence
set for `en`, `zh-Hans`, and `zh-Hant` (9/9), then the six-call dual-domain
check. Parser acceptance of fixtures is not that gate. #108 stays open.
