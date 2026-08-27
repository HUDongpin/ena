# ADR: Open ENA AI prompt governance V1

- Status: Implemented locally; not a scientific, privacy/security, or release approval
- Date: 2026-08-27
- Scope: build-time/static prompt governance and server-side runtime dispatch

## Context

Open ENA AI v2 already sends a reviewed, aggregate-only prompt to OpenRouter. The
runtime behavior must remain unchanged: the provider receives the same system
prompt bytes for English, Traditional Chinese, and Simplified Chinese; the user
message remains exactly `JSON.stringify(request.evidence)`; and the response
schema remains strict while its evidence-reference enum is derived only from the
current request's aggregate evidence IDs.

Keeping the prompt and response schema as private functions in the provider
client made their approval identity implicit. It also made an accidental text or
schema edit difficult to distinguish from the already-approved v2 behavior.

## Decision

Open ENA uses two separate planes.

1. The governance plane defines strict prompt specifications, immutable prompt
   artifacts, evaluation receipts, a deterministic compiler, canonical hashes,
   static hard-gate linting, and explicit approval bindings.
2. The runtime plane accepts a validated v2 request, retrieves an already-approved
   artifact from a closed server-only registry, instantiates only the request-local
   evidence-ID enum in the approved base response schema, and sends the existing
   provider request.

The runtime does not compile, rewrite, evaluate, approve, or select prompts from
request text. It has no prompt tools, memory, autonomous loop, arbitrary network
retrieval, or LLM-based prompt compiler. Locale is a fixed registry key, not a
field in the approved artifact and not text supplied to a prompt template at
request time.

## Versioned contracts

The governance module exports three closed V1 contracts with strict JSON Schemas
and strict parsers:

- `EnaPromptSpecV1` identifies the aggregate-inference-review purpose, compatible
  request and response versions, aggregate-only data class, forbidden data
  classes, scientific boundary codes, no-tool policy, strict-JSON output, and the
  1,800-token budget.
- `EnaPromptArtifactV1` contains the prompt/compiler/spec versions, system prompt,
  strict base response schema, content SHA-256, and approval metadata.
- `EnaPromptEvalReceiptV1` records an artifact hash, evaluation-suite version,
  hard-gate failures, scientific review, and privacy/security review.

Every parser rejects unknown, inherited, accessor, symbol, sparse-array, unsafe
control/bidirectional-text, duplicate, unbounded, enum/type, and malformed-hash
inputs. Parsed values are normalized and deeply frozen. The approved base response
schema is closed at every response object layer. JSON object keys must already be
trimmed and NFC-normalized; normalized-key collisions are rejected independent of
insertion order, and special keys such as `__proto__` are copied with own-data
property descriptors so they cannot alter a clone's prototype. Public lint and
assert boundaries first take an accessor-free descriptor snapshot and report a
malformed-input hard gate without invoking getters.

## Canonical behavior hash

`contentSha256` is lowercase SHA-256 over UTF-8 bytes of a stable canonical JSON
payload. Object keys are sorted by Unicode code-unit order; array order is retained
after parser normalization. The behavior payload contains:

- behavior-payload version;
- prompt, compiler, and source-spec versions;
- the full normalized source specification, including request/response
  compatibility, data classes, scientific boundaries, tool/output policy, and
  token budget;
- the byte-exact system prompt; and
- the strict base response JSON Schema.

Approval status is deliberately excluded. Moving an artifact between draft,
evaluated, approved, or revoked does not change its behavior identity. Any prompt,
schema, compatibility, policy, or token-budget change does change the hash.

The existing v2 prompt version is independently bound to one checked-in expected
hash per locale. Recomputing a valid hash after changing prompt behavior is not
enough: reusing the v2 prompt version still fails the approved hash binding. A
behavior change requires an explicit new prompt version and new reviewed binding.

## Approval and evaluation are separate state machines

Compilation always returns `approvalStatus: "draft"`. Lint results and evaluation
receipts never mutate or promote an artifact. Even a receipt with both review
fields set to `pass` is evidence only; it is not approval and cannot add an
artifact to the runtime registry.

Runtime dispatch requires all of the following independently:

- the exact registered prompt-version and locale key;
- a structurally valid, deeply frozen artifact;
- a correct canonical content hash;
- an exact match to the checked-in locale hash binding; and
- an explicitly authored `approvalStatus: "approved"` in the private static
  registry.

Draft, evaluated, revoked, malformed, unknown-version, unknown-locale, or
hash-mismatched artifacts fail closed. Receipt status is not consulted by the
dispatcher and cannot create approval. Approval metadata is not authority: a
caller-created clone of a valid draft still fails even if the caller changes its
unhashed status field to `approved`. The public approval assertion recognizes only
the exact immutable object held by the private registry for that locale.

## Static linter boundaries

The V1 linter uses compiler-owned directive lines, exact version/schema checks,
the closed base response schema, and canonical hashes. It does not claim to infer
the meaning of arbitrary prose. Hard gates cover:

- aggregate-only, evidence-bound advisory review;
- no recomputation, replacement, invention, method alteration, or silent changes
  to browser-confirmed inferential cells;
- no causal, learning-gain, improvement, treatment-impact, or
  practical-importance claims;
- a request-local evidence reference for every observed pattern;
- missingness, zero handling, ties, multiplicity, independence/clustering,
  accumulated-trajectory, MR1, and arbitrary-axis limitations;
- all user-message strings as untrusted data;
- exclusion of raw rows, names, unit/entity/conversation identifiers,
  participant coordinates, secrets, dataset hashes, and local bindings;
- no tools, persistent memory, autonomous loops, or arbitrary network access; and
- strict JSON only, with no XML/Markdown wrapper, code fence, ceremonial
  completion marker, or hidden chain-of-thought request.

The no-tool and no-autonomy guarantees are structural: the prompt specification
permits no tools, the static artifact has no tool configuration, the linter rejects
instructions that introduce those capabilities, and the provider client performs
one bounded completion request exactly as before.

## Source-idea disposition

The attached external prompt material was treated only as a set of design ideas,
not as text to reproduce. The disposition below is independently phrased for ENA
and is normative for this implementation.

| Idea category | Disposition | ENA governance treatment |
| --- | --- | --- |
| Explicit goals, declared assumptions, and unresolved decisions | Retain | Keep these concepts in the separate agent/task-governance plane so scope and uncertainty are visible; do not inject project-management prose into the provider system prompt. |
| Clarifications that materially affect scientific or privacy behavior | ENA-specific rewrite | Express them as versioned compatibility, aggregate-data, scientific-boundary, and forbidden-data contracts with testable hard gates. |
| Acceptance criteria, allowed action, failure recovery, and stop boundaries | ENA-specific rewrite | Encode deterministic checks and fail-closed tests. Provider dispatch stops on unknown versions/locales, malformed artifacts, non-approved status, or hash drift. |
| External branding, named personas, or ornamental template identity | Delete / default off | No third-party brand or persona becomes part of the ENA artifact, registry, evaluation receipt, or provider request. |
| XML wrappers, Markdown fences, and ceremonial completion markers | Delete / default off | Strict JSON is the only runtime output format; the linter rejects wrapper and completion-marker instructions. |
| Fixed candidate answers, model self-scoring, or simulated review/run claims | Delete / default off | Evaluation must produce separately inspectable evidence. It cannot embed a predetermined answer, claim a run that did not occur, or approve its own output. |
| Implicit scientific authority or review-as-approval | Delete / default off | Scientific and privacy/security review remain human-controlled evidence states, and explicit artifact approval remains a separate registry decision. |

Licensing and provenance are preserve-first boundaries: no wording, branded
structure, examples, or other expressive material from the external attachment is
copied into the prompt artifacts or this ADR. Any future reuse would require a
documented source, license basis, and independent review before inclusion.

## Request-local response schema

The approved artifact stores a static strict base schema. At runtime, the schema
instantiator accepts only a prompt-version key, locale key, and evidence IDs. It
resolves private registry authority internally; callers cannot pass an artifact or
approval metadata. It then validates and sorts the already-sanitized request-local
evidence IDs, clones the relevant schema path, and adds only the `enum` for
`observedPatterns[*].evidenceRefs[*]`. It neither mutates the artifact nor includes
request labels, study context, raw data, bindings, or other user text.

No real study data, provider response, credential, dataset hash, local binding, or
participant-level value belongs in a prompt artifact or evaluation receipt.

## Compatibility and future versions

P1 supports only:

- prompt `open-ena-aggregate-inference-review-v2`;
- request `open-ena-ai-interpretation-request-v2`;
- response `open-ena-ai-interpretation-response-v2`;
- data class `aggregate-evidence-v2`;
- `toolPolicy: "none"`;
- `outputFormat: "strict-json"`; and
- token budget `1800`.

A future v3 must be introduced as a separately versioned artifact and registry
binding. It must run through synthetic/adversarial evaluation, scientific review,
privacy/security review, and a shadow comparison against v2 before any explicit
approval decision. It must not silently replace, mutate, or inherit approval from
v2.

## P0 baseline and residual gaps

| Evidence plane | Current bounded status |
| --- | --- |
| Existing v2 behavior | Already supplies the aggregate-only evidence boundary, browser-confirmed inference/no-recomputation rule, causal and practical-importance limits, required statistical limitations, untrusted-string treatment, sensitive-data exclusions, request-local evidence citations, and strict JSON response contract. |
| Governance added here | Adds strict versioned contracts/parsers, deterministic compilation, canonical content hashes, exact per-locale approval bindings, typed static hard gates, approved-only dispatch, immutable request-local schema instantiation, byte-exact characterization tests, and an explicit evaluation-versus-approval separation. |
| Live-provider behavior evaluation | Not performed. This task makes no real provider call and does not establish natural-response quality, robustness, or parity. |
| Human authority | No human scientific review or privacy/security approval receipt is created by this commit. Automated lint/test success is not approval. |
| Future prompt candidate | No v3 artifact or candidate behavior exists. A future candidate must be separately versioned, evaluated, shadowed, reviewed, and explicitly approved. |
| Release evidence | No deployment, provider-configuration change, production request, or live-browser proof is included. Local tests and typecheck establish only local implementation evidence. |
| Public request/response API | Intentionally unchanged. The v2 request and response schemas, consent/auth boundaries, provider body, and user-facing behavior remain the compatibility baseline. |

## Consequences

The existing provider-visible behavior is byte-compatible while prompt changes
become reviewable, content-addressed changes. Runtime failure is conservative:
registry or hash drift blocks provider dispatch instead of falling back to an
unapproved prompt. The cost is intentional duplication between the human-readable
approved baseline tests and the compiler-owned static prompt registry, which makes
unreviewed drift visible.
