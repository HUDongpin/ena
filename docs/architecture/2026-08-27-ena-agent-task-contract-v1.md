# ADR: Versioned ENA Agent Task Contract V1

**Status:** Accepted for internal root-repository use

**Date:** 2026-08-27

**Scope:** Agent task governance only; no production AI behavior change

## Context

ENA work needs task instructions that are reviewable, bounded, and explicit about repository state, evidence, scientific invariants, and the highest authorized completion state. Free-form instructions alone make it too easy to blur an implementation request into scientific approval, or to treat a local test as proof of CI, GitHub, deployment, or live behavior.

The repository also has a production AI request path. That path has different security, privacy, scientific, and provider-runtime constraints. Treating agent task governance and production model prompting as one mechanism would couple internal development controls to user-facing behavior and make both harder to audit.

## Decision: two separate planes

The project keeps two deliberately separate planes:

| Plane | Purpose | V1 implementation boundary |
| --- | --- | --- |
| Agent task-governance plane | Validate an authorized development/review task and render a stable human-readable execution contract | `lib/prompt-governance/agent-task-contract.ts` in the ENA root repository |
| Production AI runtime plane | Construct and send user-facing Open ENA provider requests | Existing runtime modules, including `lib/server/luna-client.ts`; unchanged by this decision |

`EnaAgentTaskContractV1` is an internal, versioned data contract for the first plane. It is not a production system prompt, provider adapter, or authorization service. V1 is not imported into the production AI path and does not modify `luna-client.ts`, package scripts, CI, provider configuration, or deployed behavior.

No runtime dynamic prompt compiler is introduced. The V1 compiler only converts validated task-governance JSON into a frozen normalized contract and deterministic Markdown for review. Connecting this artifact to a model/provider runtime would require a separate decision, threat model, tests, and release authorization.

## Contract and parser boundary

The schema version is exactly `ena-agent-task-contract-v1`. The contract requires every one of these fields:

- `schemaVersion`, `projectSurface`, `operationMode`, `explicitGoal`, `nonGoals`, and `targetAudience`;
- `currentRepositoryState`, containing exactly `worktree`, `branch`, `headSha`, `dirtyPathsPresent`, and `concurrentWritersKnown`;
- `authoritativeSources`, `assumptions`, `unresolvedDecisions`, `allowedActions`, and `forbiddenActions`;
- `scientificInvariants`, `acceptanceCriteria`, `requiredCommands`, `requiredEvidence`, `failureRecovery`, and `stopConditions`;
- `maximumCompletionState`.

The exact project-surface literals are `ena-public-site`, `open-ena`, `jena-js`, and `j-3dena`. Accepting `j-3dena` as a contract value does not authorize modification of the nested repository.

The exact operation-mode literals are `diagnose`, `plan`, `implement`, `independent-review`, and `release-verify`.

The exact maximum-completion-state literals are `PLANNED`, `IMPLEMENTED_UNVERIFIED`, `PARITY_CANDIDATE`, `VERIFIED_PARITY`, `PRODUCTION_CANDIDATE`, and `PRODUCTION_READY`. This field is a ceiling on what the task may claim, not evidence that the state has been achieved.

The exported JSON Schema and parser reject additional object properties. Before reading any contract or repository-state value, the parser requires every exact field to be an own, enumerable data property; inherited values, accessors, symbols, and non-plain objects fail without invoking a getter. Node's intrinsic Proxy detector rejects live and revoked Proxy-wrapped objects and arrays before `Array.isArray`, prototype inspection, key enumeration, descriptor lookup, or property reads can invoke a trap. The parser also rejects missing fields, wrong scalar or collection types, unknown enum values, blank strings, malformed Git SHAs, duplicate normalized list entries, conflicting identical allowed/forbidden actions, and oversized arrays or strings. String maxima are counted as Unicode code points, matching JSON Schema draft 2020-12 rather than JavaScript UTF-16 code units.

Unsafe control, bidirectional, and formatting code points are checked on the raw string before NFC normalization or trimming, so a leading or trailing forbidden character cannot be normalized away. The parser and schema share one Unicode policy: reject every General Category `C` code point (including lone UTF-16 surrogates and every `Cf` formatting control), U+2028/U+2029, and the non-variation-selector default-ignorable characters U+034F, U+115F–U+1160, U+17B4–U+17B5, U+3164, and U+FFA0. Valid astral characters and variation selectors such as U+FE0F and U+E0100 remain permitted. This prevents distinct JavaScript strings containing lone surrogates from collapsing to the same UTF-8 replacement-character bytes in a persisted receipt. Ordinary outer spaces remain permitted input and are trimmed during normalization.

Text validation first rejects a value whose UTF-16 length proves that it cannot fit the declared code-point maximum, then uses an early-stopping code-point iterator to enforce length and the Unicode policy without allocating a whole-string array. Unknown-property diagnostics count in one bounded-display pass and retain at most eight escaped property names; they report the complete count without sorting or retaining every unknown name. These are parser resource bounds, not a general denial-of-service guarantee for the JavaScript process. The parser returns a new deeply frozen object in a fixed key order and does not infer omitted values.

The Markdown renderer uses a fixed section order, escapes caller text, and emits neither an XML wrapper nor a ceremonial completion marker. Backtick and tilde fence characters are escaped along with HTML-like, heading, emphasis, and link punctuation. A leading caller-supplied hyphen is escaped so `---` cannot become a thematic break and `- nested` cannot introduce nested list structure. Valid untrusted text therefore cannot absorb or restructure later sections. The Markdown is a task receipt, not proof of execution or completion.

## Source precedence

Applicable sources are interpreted in this order:

1. Explicit owner/user instructions and the current task's authorization boundary.
2. Repository-local binding instructions and approved scientific, architecture, privacy, and release specifications.
3. Current direct evidence for the state being claimed, observed separately at the local-worktree, local-test, CI, GitHub, deployment, and live-behavior planes.
4. The contract's `authoritativeSources`, in the order supplied, when they do not conflict with a higher source.
5. Versioned operation-mode governance templates.
6. Explicitly recorded assumptions.

A lower-precedence source cannot broaden an authorization, waive an invariant, or convert absent evidence into a decision. Current empirical evidence governs current-state claims, but it cannot override a normative scientific or authorization decision. A conflict or missing decision is recorded in `unresolvedDecisions` and handled through `stopConditions`; the compiler does not resolve it.

## Operation-mode governance

`allowedActions` remains a JSON string array, but V1 does not accept permission prose. Every item must be one exact machine-action ID from the exported `ENA_AGENT_ALLOWED_ACTIONS_V1` set:

- repository and source inspection: `inspect-repository-state`, `inspect-authoritative-sources`, and `run-read-only-diagnostics`;
- authorized local implementation: `edit-authorized-scope`, `run-local-verification`, and `create-local-commit`;
- independent review: `inspect-review-candidate` and `run-independent-verification`;
- release evidence inspection: `inspect-local-implementation-evidence`, `inspect-local-test-evidence`, `inspect-ci-evidence`, `inspect-github-evidence`, `inspect-deployment-evidence`, and `inspect-live-behavior-evidence`;
- reporting: `report-findings-and-gaps`.

The vocabulary is closed because an English denylist cannot reliably recognize synonyms, euphemisms, negation, new verbs, or cross-plane claims. V1 therefore does not pretend to understand permission prose. Unknown strings—including create/delete, push, merge, deploy/redeploy, publish, approval, provider-configuration, and evidence-substitution language—fail in the parser before mode governance. Whitespace-wrapped variants also fail; an accepted ID is preserved byte-for-byte.

Compilation then applies the exported `ENA_AGENT_OPERATION_ALLOWED_ACTIONS_V1` matrix:

| Operation mode | Permitted V1 capabilities | Additional rule |
| --- | --- | --- |
| `diagnose` | `inspect-repository-state`, `inspect-authoritative-sources`, `run-read-only-diagnostics`, `report-findings-and-gaps` | Maximum completion state must be `PLANNED` |
| `plan` | `inspect-repository-state`, `inspect-authoritative-sources`, `report-findings-and-gaps` | No mutation capability exists |
| `implement` | `inspect-repository-state`, `inspect-authoritative-sources`, `edit-authorized-scope`, `run-local-verification`, `create-local-commit`, `report-findings-and-gaps` | Local commit is the highest repository-state mutation; no push, merge, deployment, or publication capability exists |
| `independent-review` | `inspect-authoritative-sources`, `inspect-review-candidate`, `run-independent-verification`, `report-findings-and-gaps` | No candidate mutation or approval capability exists |
| `release-verify` | `run-independent-verification`, the six separate evidence-inspection capabilities, and `report-findings-and-gaps` | Verification remains read-only; no mutation, remote promotion, provider-configuration, approval, or cross-plane proof capability exists |

A token may be globally valid but invalid for the selected operation mode; compilation rejects it with the mode and array index. Valid caller tokens remain unchanged and are never removed or expanded. First-class templates for `diagnose`, `implement`, `independent-review`, and `release-verify` reference the same matrix and may add only explanatory prohibitions, scientific guardrails, evidence requirements, and stop conditions.

`forbiddenActions` deliberately remains bounded explanatory text. It can constrain a task further, but it cannot grant a capability, override the matrix, or compensate for an unknown `allowedActions` token. Adding a new positive capability requires an explicit V1 schema/type/matrix change and review rather than a new prose interpretation.

`requiredCommands` is also non-authorizing. V1 keeps the plan's `string[]` exchange shape, but accepts only a closed syntactic classifier: selected read-only Git inspection commands, repository-relative ripgrep inspection, focused `node --import tsx --test` files under `tests/`, and an explicit set of repository verification commands such as `test`, `typecheck`, `build`, `verify`, `prompt:verify`, and the two browser-test entry points. Shell composition, substitution, quoting, redirection, unknown options, mutation subcommands, deployment scripts, absolute ripgrep paths, and parent-directory traversal fail closed. Every accepted command receives a fixed effect class—repository inspection, source inspection, or local verification—and that effect must already be covered by an explicit `allowedActions` capability permitted for the selected operation mode. A command can never add authority, and this module never executes it. The classifier is a deterministic governance check, not a shell parser or a guarantee about the implementation of a repository's npm scripts; executing any accepted command remains bounded by the task's existing authorization and environment controls.

Every explanatory list has a schema and parser maximum of 64 items. Parsing establishes that input-shape bound but does not promise that a mode-governed compilation can add its required template entries within the same limit. During compilation, required and caller entries are deterministically de-duplicated and the compiler preflights each governed field (`forbiddenActions`, `scientificInvariants`, `requiredEvidence`, and `stopConditions`). A merged field of exactly 64 items is valid; a larger result is rejected with the mode, field, and merged count before any compiled contract is returned. This is an explicit semantic compiler constraint because the required reserve varies by operation mode and by caller/template overlap; every successfully compiled contract is parsed again and therefore remains valid against the exported schema.

## No scientific or release authority

The contract describes constraints; it does not create scientific authority. Neither parsing nor compilation may select or revise an ENA method, threshold, interpretation, parity judgment, release decision, or production authorization. `scientificInvariants` preserve caller-supplied constraints, while mode templates add only generic guardrails against inference.

Likewise, listing a command or evidence category does not prove that the command ran or that the evidence exists. Compilation preserves the explicit maximum completion state even when all evidence categories are named. A higher completion state requires independently verified evidence and the applicable authorization outside this module.

## Licensing and provenance boundary

The implementation re-authors general governance principles as project-specific types, validation rules, and documentation. It does not copy third-party prompt text or attachment wording. Third-party prompt material may be incorporated only with documented permission or a compatible license, provenance, and a separate review of attribution and redistribution obligations. In the absence of that permission, the project may use general ideas but must express them independently.

## Consequences

- Internal tasks gain a deterministic, testable contract without changing product runtime behavior.
- Strictness makes malformed or ambiguous tasks fail early and requires callers to state unknowns explicitly.
- Mode defaults are intentionally conservative and cannot grant new actions.
- Adding a field, enum literal, evidence plane, or authority rule requires a schema/version decision and focused public-interface tests.
- Future production integration is out of scope and cannot be inferred from this ADR or from the existence of the compiler.
