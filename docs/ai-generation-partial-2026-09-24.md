# ENA AI generation status — PARTIAL

Date: 2026-09-24\
Code: `9c8acca671e4846f822ba12e00c0417ea720de3d`\
Provider and model: DeepSeek `deepseek-flash`

## Decision

Keep AI generation at **PARTIAL**. Preserve the current strict response parser,
evidence-reference checks, bounded response handling, and explicit-operation
retry controls. A provider HTTP 200 is not an accepted ENA interpretation.
Do not label generation stable or scientifically accepted on the current evidence.

## Live stability evidence

The 2026-09-24 bounded check used the production `generateLunaInterpretation`
client directly with a 20-second timeout, 1,800 output-token cap, and a
10,000 micro-USD reservation per call. It sent frozen synthetic aggregate
requests covering four research designs in English, Traditional Chinese, and
Simplified Chinese, followed by five more independent calls for one English
endpoint request. The same-case request passed the parser 4/6 times including
its first matrix call.

| Measure | 12-case matrix | 5 same-case repeats | Total |
| --- | ---: | ---: | ---: |
| Provider HTTP 200 | 12 | 5 | 17 |
| Provider status `completed` | 11 | 5 | 16 |
| Accepted by production response parser | 5 | 3 | 8 |
| Accepted by offline scientific evaluator | 0 | 0 | 0 |

The nine parser failures were invalid JSON (4), unexpected field (2), missing
field (1), non-object value (1), and array too long (1). One invalid JSON
response was `incomplete` at the 1,800 output-token cap. The other failures
included provider responses marked `completed`.

Every parser-accepted candidate was flagged by the stricter offline evaluator
for applicable limitations and possibly unsupported or recomputed statistics.
These are automated flags, not sentence-level manual findings. All 12 frozen
compliant control candidates passed that evaluator. The offline evaluator is
**not** applied to responses in the production route, so parser acceptance
does not establish scientific acceptance.

This run exercised the direct live provider client and local evaluator. It did
not repeat the deployed browser journey, production account ledger, or browser
receipt flow. All 17 generation requests returned HTTP 200, so this run does
not indicate a credential or payment failure. No key or generated text was
retained in the local evidence files. The client's conservative peak-rate
estimate for all calls was 34,727 micro-USD (about USD 0.0347), not a provider
invoice; the combined reservation ceilings were USD 0.17.

Local, ignored evidence files:

- `output/deepseek-stability-20260924/report.json` — 12-case matrix metadata.
- `output/deepseek-stability-20260924/repeat-en-endpoint.json` — repeated-case metadata.
- `output/deepseek-stability-20260924/summary.md` — detailed local summary.

## Current protection boundary

The client rejects malformed provider bodies, incomplete response status,
non-single assistant output, JSON parse failures, schema or length violations,
and references to evidence not supplied in the request. The server preserves
its operation ID and durable accounting controls for uncertain or dispatched
requests; it must not silently retry them. The offline scientific evaluator
remains diagnostic and should not be described as a live production gate.
