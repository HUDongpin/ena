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

The exported JSON Schema and parser reject additional object properties. The parser also rejects non-plain/accessor-bearing objects, missing fields, wrong scalar or collection types, unknown enum values, blank strings, malformed Git SHAs, duplicate normalized list entries, conflicting identical allowed/forbidden actions, oversized arrays or strings, and unsafe control or bidirectional-formatting characters. It returns a new deeply frozen object in a fixed key order. It does not infer omitted values.

The Markdown renderer uses a fixed section order, escapes caller text, and emits neither an XML wrapper nor a ceremonial completion marker. The Markdown is a task receipt, not proof of execution or completion.

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

V1 provides first-class templates for four modes and applies only their restrictive requirements during compilation. Template processing may add prohibitions, scientific guardrails, evidence requirements, and stop conditions. It never adds to caller-supplied `allowedActions`, so defaults cannot silently expand authority.

- `diagnose` is read-only, prohibits repository mutation, and requires the explicit `PLANNED` ceiling.
- `implement` permits only caller-authorized scoped work and local verification. Its template prohibits automatic push, merge, deployment, and publication.
- `independent-review` keeps the review candidate immutable, prohibits self-approval, and reports unresolved findings instead of waiving them.
- `release-verify` keeps local implementation, local tests, CI, GitHub state, deployment state, and live behavior as six separate evidence requirements. Evidence from one plane cannot stand in for another.

`plan` remains a valid operation mode. It receives no implicit mutation authority and no mode-template promotion.

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
