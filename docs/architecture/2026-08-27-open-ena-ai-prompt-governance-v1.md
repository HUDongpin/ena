# ADR: Open ENA AI prompt governance V1

- Status: Implemented locally; not a scientific, privacy/security, or release approval
- Date: 2026-08-27
- Scope: build-time/static prompt governance, deterministic offline evaluation,
  and server-side runtime dispatch

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

The artifact parser and hash boundary require the system-prompt string to arrive
already NFC-normalized and without added leading or trailing whitespace. They do
not trim or normalize prompt drift into the approved value. Consequently a leading
or trailing space/newline, decomposed Unicode sequence, or any other prompt-byte
change is rejected and cannot inherit the baseline behavior identity.

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

## Deterministic offline evaluation

The P2 evaluation plane is server-only and offline. It reuses the V1 specification,
compiler, canonical hash, artifact linter, approved registry, request-local schema
instantiator, and existing strict v2 response parser. It does not compile a new
prompt, call a model, import the provider client, inspect AI environment variables,
use credentials, access the network, write files, or alter runtime response
handling.

The frozen suite version `open-ena-ai-offline-synthetic-mock-v10` contains exactly
four fixed aggregate, role/index-only designs for each of `en`, `zh-hant`, and
`zh-hans`:

The suite identifier advances from v9 because the adversarial manifest now binds
the complete probe content rather than only the probe identity triple. The v9
advance made asserted nonfinite tokens fail
closed through punctuation, quote, bracket, and symbol wrappers, including
whitespace between a sign and infinity. A compatibility-normalized view is used
only for boolean nonfinite-token detection, so fullwidth Latin token forms cannot
bypass the gate and no normalized index is reused as an original-text span.
Non-ASCII Unicode number code points fail closed before claim or identity parsing.
The v8 advance made direct `NaN`, infinity, infinity-symbol, null, and
undefined values fail closed regardless of whether the field uses a machine name
or supported natural-language label. Identity parsing also
distinguishes adjacent label delimiters such as `axis-1` and `period-2` from signed
numbers such as `axis -1` and `period -2`; the latter cannot borrow a valid evidence
identity. The v7 advance introduced one shared identity parser that now
produces both the complete axis/period set and the only numeric identity spans that
may be exempted, identity checks apply to every observation, and protected
`NaN`/`Infinity` claims fail closed. The earlier v6 advance introduced exact
contrast-period sets, plural axes, numeric-RHS exhaustion, and unbound-number
failure; v5 introduced complete arrays, inference-scope cohort policy, executable
source registration, and source SHA manifests; v4 introduced fixture manifests;
v3 introduced locale-bound fixtures and lexical matrices. The
report and six-field receipt contracts remain V1; only receipts from the current
suite are eligible for later human review.

1. endpoint independent Mann-Whitney comparison;
2. trajectory selected-period independent Mann-Whitney comparison;
3. paired two-period Wilcoxon comparison with `later-minus-earlier` direction; and
4. repeated-period Friedman comparison with every planned Holm-Wilcoxon follow-up
   represented either as visible aggregate evidence or an explicit omission.

Each fixture freezes the exact IDs of its visible inferential members. A compliant
offline candidate must represent every one of those IDs through
`observedPatterns[*].evidenceRefs`; an empty pattern list or a partial repeated-
measures family fails. Privacy-redacted or unavailable family members are cited
only through their supplied omission records, which carry no hidden statistic,
p-value, or effect.

The module also checks each locale's ordered fixture SHA-256 list against a literal
checked-in manifest. The hash binds the case ID, design, locale, aggregate evidence,
compliant candidate, required inference IDs, limitations, coverage tags, and a
digest of the private source canaries. A custom or drifted case may be evaluated for
diagnostics, but the formal report and receipt receive
`suite-fixture-identity-mismatch`; they cannot claim a zero-failure v10 run or pass
approval eligibility under the frozen suite identity.

The suite also freezes exactly 118 unique adversarial probes per locale. For a
candidate probe, the literal SHA-256 manifest binds its order, ID, kind, expected
issue code, case ID, and the SHA-256 of the exact candidate JSON bytes. For an
artifact probe, it binds the order, ID, kind, expected issue code, explicit mutation
descriptor, and SHA-256 of the canonical mutated artifact's compiler-owned content;
independent approval status remains excluded from behavior identity. The evaluator itself,
not only its tests, adds `suite-probe-count-mismatch` for a wrong total,
`suite-probe-id-duplicate` for duplicate IDs, and
`suite-probe-content-mismatch` for any ordered content-manifest drift. Removing,
duplicating, renaming, reordering, rebinding, or repurposing a probe therefore
cannot retain a zero-failure receipt under the same suite version.

Across those fixtures the suite exercises ties, small samples, zero differences,
missing pairs and complete blocks, minimum-aggregate privacy omission, an
unavailable/not-estimable Holm member, accumulated-trajectory path dependence,
MR1 circularity, arbitrary axis signs, and unverified independence/clustering.
The repeated fixture's omission objects contain only role, test, period, reason,
and request-local ID fields: they contain no hidden p-value, effect, rank sum, or
statistic. Its compliant response must state that the complete Holm vector cannot
be reconstructed after privacy redaction.

Each compliant canned interpretation is an explicitly offline test fixture; no
canned answer exists in the production prompt or any model run. Each locale has
distinct, deeply frozen compliant copy and its request carries that exact locale;
a locale/case mismatch fails the suite. Every fixture first passes the production
v2 response parser, including strict object shape, nonempty limitations, and
request-local evidence references. Each locale also has a frozen adversarial
statement matrix covering numeric rewrites, causal/learning-gain, treatment-effect
and practical-importance claims, sensitive student identifiers, and injection
compliance in that locale. Common structural adversarial outputs additionally
cover forged evidence IDs, missing limitations, extra or invalid fields, HTML,
invalid JSON, excessive size, overlong strings and arrays, recomputation language,
invented or altered statistics, incomplete visible-inference coverage, sensitive-
data echoes, and prompt-injection echoes. Artifact probes separately cover a one-
byte prompt change, leading/trailing spaces and newlines, non-NFC prompt text,
stale hash, stale prompt version, and response-schema drift.

The follow-on semantic check is intentionally conservative and covers declared
English, Traditional Chinese, and Simplified Chinese patterns only. An explicit
claim to have recomputed a statistic fails even when the stated value was supplied.
A numerical statistical restatement is accepted only when its statistic label maps
to the matching authoritative field in specifically cited evidence and uses an
exact-value connector (for example, `pRaw` cannot borrow `pHolm`, sample size, tie
count, or a period index). Every cited record that owns the claimed field must
support the exact value. Explicit axis roles must equal—not merely overlap—the
roles of cited axis-bound evidence; explicit period qualifiers must match the cited
contrast's complete period set, not a subset. Singular, plural, ordinal, and the
declared latent-dimension axis forms are parsed once into both the identity set and
the exact digit spans allowed by numeric exhaustion, preventing one parser from
silently consuming a number omitted by another. Every observation with an explicit
identity is checked, even when it contains no statistic or protected field. Multi-axis or
multi-period prose that cannot be bound unambiguously fails
closed and should be split into separate observations. A correct value from another
axis cannot satisfy the claim, even when both axes happen to share that value.
The closed numeric mapping also covers disclosed inference and descriptive sample,
matched/missing, used/excluded, entity, sign, zero, ranked, complete-cohort,
period, degrees-of-freedom, tie, and period-index fields. Array-valued selected
period indices are parsed and compared as the complete ordered array; matching only
the first value is insufficient. A scalar claim cannot hide additional numeric
values later in its right-hand side. Any remaining digit that is not consumed by a
validated field/array claim, an explicit axis/period identity, or the literal MR1
boundary fails closed; this intentionally rejects unbound descriptive numbers.
Any asserted value paired with `NaN`, signed or unsigned infinity (including the
infinity symbol), null, or undefined fails closed before field-name parsing, even
when punctuation, quotes, brackets, or sign whitespace wraps that value. A
compatibility-normalized detection-only view catches fullwidth Latin token forms
without supplying indexes to any claim parser.
This prevents unsupported natural-language aliases and presentation wrappers from
bypassing the finite-value gate; every supplied numeric value is finite. Adjacent
ASCII identity delimiters remain valid, but whitespace-separated negative axis or
period numbers are not treated as labels. Unicode numeric code points outside the
closed ASCII numeric grammar fail closed rather than being normalized into an
apparently supported claim or identity.
Method/test and difference-direction assertions,
including the declared common `used/applied` and `computed as` forms, must match
the cited record. Declared analytic-cohort assertions bind only to the authoritative
inference scope policy and cannot borrow the descriptive trajectory policy. An uncited,
absent, cross-field, cross-axis, cross-period, or wrong-layer value fails. Threshold
or approximation forms using `<`, `>`, `<=`, `>=`, `≤`, `≥`, or `≈` fail closed:
the verifier neither creates a significance threshold nor invents an approximation
tolerance. The checker also uses bounded sentence-level patterns for causal,
learning-gain, improvement, treatment-effect, practical-importance, sensitive-
data, and injection claims, plus narrow negation handling and localized limitation-
concept checks. This is a deterministic guardrail, not semantic understanding:
unlisted paraphrases, mixed-language text, and languages outside the three declared
locales remain outside lexical coverage; more complex negation can be misclassified;
and benign prose can trigger it. A pass therefore reports only zero violations in
the frozen declared matrix, not zero semantic violations generally, live-model
obedience, scientific correctness, or natural-response quality. It is deliberately
not installed in production response handling in P2.

Private synthetic source canaries verify that hostile labels do not enter provider
evidence and that echoes are rejected. Canary text is absent from reports and
receipts; a SHA-256 digest binds the canaries into each fixture hash so their
behavior cannot drift invisibly under the suite version. Fixtures contain no raw
study rows or real identifiers, hashes, bindings, credentials, or provider output.

## Offline report, receipt, and approval eligibility

Detailed P2 evidence lives in a separate deeply frozen
`OpenEnaAiOfflineEvaluationReportV1`. It records the artifact content hash,
four-design results, fixture hashes, adversarial kill results, automated failures,
scope limitations, and the literal `authorizationEffect: "none"`. It contains no
timestamp, host path, random identifier, environment/model/provider state, canary
text, or approval status, so repeated runs over the same inputs have identical
canonical JSON.

`EnaPromptEvalReceiptV1` remains exactly the six-field V1 contract. P2 may emit an
empty `hardGateFailures` array, but its receipts always set `scientificReview` and
`privacySecurityReview` to `pending`; automated execution has no authority to fill
human review evidence. `assertOpenEnaAiPromptEligibleForApproval` is a separate
validate-or-throw helper requiring the receipt to match an explicitly expected
artifact SHA-256, the current frozen offline suite version, zero automated
failures, and both independent reviews to be `pass`. It accepts no registry and
performs no mutation, promotion, or approval write. A stale-suite receipt or a
receipt for another artifact is ineligible. This helper checks receipt fields; it
does not authenticate who performed a review or establish receipt provenance, so
a matching pass/pass object remains only candidate evidence for an independently
authorized approval process. Eligibility is necessary evidence for a future
approval decision, never the decision itself.

Draft and approved artifacts with the same behavior hash evaluate identically.
Evaluation metadata is excluded from content identity, and evaluation never grants
the private object identity required by runtime registry dispatch.

## Read-only verifier and CI visibility

`npm run prompt:verify` runs first in the root `verify` chain. Its ESM entry point
resolves checked-in sources from `import.meta.url`, so direct execution is
independent of the caller's working directory. It verifies all three locale hash
bindings, approved registry authority, deterministic recompilation, specification
and schema linting, request-local evidence enum instantiation, the four-design
suite, and every declared adversarial kill. Each locale selects its own four
locale-bound cases and adversarial statement matrix, then instantiates and compares
the enum for all four fixture-specific evidence-ID sets, not a shared English case
set or a representative evidence set. It prints canonical deterministic JSON
containing reports and exact pending receipts and returns nonzero on any automated
hard-gate failure.

The verifier also binds, by repository-relative source file and exact test name,
existing offline tests for timeout, cancellation, HTTP 429, HTTP 402, network
failure, oversize and malformed completions, reviewed-aggregate consent, binding
change/revocation, stale asynchronous generation, and prompt-like source-label
projection into role/index-only provider evidence. Their status is reported
only as `bound` or `missing`: source binding does not claim that a provider was
called, a deployment was exercised, or the named test ran inside the verifier.
Binding recognizes only active top-level calls imported from `node:test`, using a
TypeScript syntax tree; comments and inert string literals cannot satisfy it. A
registration must have an inline function or arrow callback containing an eagerly
executed call, construction, or throw outside any nested uninvoked function. Bare
calls, empty/no-op callbacks, callbacks that only return a function, non-literal
options, spread/computed options, explicit `skip`/`todo`/`only` options, and runtime
`skip`/`todo` calls remain `missing`. This deliberately rejects obvious placeholders
but does not prove assertion quality or behavior coverage; it remains source-
registration inventory, not an execution receipt. The root test command supplies
the separate execution plane.
The four bound contract-test source files are additionally pinned by literal
SHA-256 values. Any source edit—including replacing assertions with a syntactically
executable no-op—changes every affected entry to `missing` until the manifest and
evaluation-suite version are explicitly reviewed and advanced. This source hash is
an integrity/versioning control; it still does not turn static inspection into test
execution evidence.
Invalid JSON, forged evidence references, and missing limitations are additionally
executed directly by the fixed offline evaluation suite.

The existing CI workflow still executes the root `verify` command once; its final
step is named to make prompt-governance coverage visible. No secret, provider
configuration, duplicate workflow execution, or deployment action was added.

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
| Fixed candidate answers, model self-scoring, or simulated review/run claims | Delete / default off | The production prompt and model-run path contain no predetermined or canned answer. Deterministic compliant and adversarial answers exist only as labeled offline fixtures; they cannot be presented as model output, claim a run that did not occur, or approve themselves. |
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
| Governance added here | Adds strict versioned contracts/parsers, deterministic compilation, canonical content hashes, exact per-locale approval bindings, typed static hard gates, approved-only dispatch, immutable request-local schema instantiation, byte-exact characterization tests, the deterministic four-design offline suite and adversarial verifier, exact pending receipts, and explicit evaluation-versus-approval separation. |
| Live-provider behavior evaluation | Not performed. This task makes no real provider call and does not establish natural-response quality, robustness, or parity. |
| Human authority | No authorized human scientific or privacy/security review is performed. Generated receipts retain both review fields as `pending`; automated lint/evaluation success and approval eligibility are not approval. |
| Future prompt candidate | No v3 artifact or candidate behavior exists. A future candidate must be separately versioned, evaluated, shadowed, reviewed, and explicitly approved. |
| Release evidence | No deployment, provider-configuration change, production request, or live-browser proof is included. Local tests and typecheck establish only local implementation evidence. |
| Public request/response API | Intentionally unchanged. The v2 request and response schemas, consent/auth boundaries, provider body, and user-facing behavior remain the compatibility baseline. |

## Consequences

The existing provider-visible behavior is byte-compatible while prompt changes
become reviewable, content-addressed changes. Runtime failure is conservative:
registry or hash drift blocks provider dispatch instead of falling back to an
unapproved prompt. Offline verification makes static contracts and declared canned
mutations repeatable, but it deliberately leaves live-model behavior and human
scientific/privacy judgment unresolved. The cost is intentional duplication
between human-readable baseline tests, fixed offline fixtures, and compiler-owned
registry bindings, which makes unreviewed drift visible.
