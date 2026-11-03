# Nova provider reliability implementation plan

> Provider classification and runner/store integration are separate tasks. This plan covers implementation and local verification; production activation requires a coordinated web/worker release.

**Goal:** Retain safe, useful provider failure diagnostics and automatically retry at most once per explicit run attempt when no returned tool has executed.

**Architecture:** The provider adapter classifies failures using fixed reasons and bounded numeric metadata. The runner owns retry decisions and persists the decision before dispatch, counting every request against existing effort limits. The existing encrypted store retains the latest diagnostic and emits an append-only safe event; existing chat messages show the reason and recovery action.

**Tech stack:** TypeScript, Node test runner, PostgreSQL encrypted checkpoint store; no new dependencies or schema migration.

## Decisions

- Keep the already-tested nullable/repeated Qwen metadata compatibility fix, without claiming it caused the earlier incident.
- Prefer runner-controlled retry over hidden adapter retries: lease checks, step budgets and durable markers remain authoritative.
- Retry only explicitly classified response protocol failures and incomplete streams; no automatic retry for authentication, configuration, cancellation, timeout, transport, token-limit, refusal or response-size limits.
- One retry allowance per explicit attempt, not per model step. Preserve model, effort and provider messages. Failed response fragments never enter messages or run tools.
- Checkpoint fields: optional `providerRetryCount` (0/1), `providerRetryState` (`scheduled`, `in-flight`, `spent`) and `attemptDeadlineAt` (epoch milliseconds). Missing fields remain compatible with older checkpoints.
- Persist `scheduled` with the first failure; persist `in-flight` together with the next charged step before dispatch; commit a successfully parsed response and `spent` together before tools. Recovery of an `in-flight` retry fails conservatively with the draft intact.
- Persist the attempt deadline across worker reclaim. Clear new attempt fields on explicit manual retry/resume, user continuation, expert continuation and artifact restore, alongside existing step/repair resets.
- Store the latest sanitized diagnostic plus step/retry disposition on the run. Append a lowercase-hyphen event containing only a fixed reason; never raw response text, reasoning, credentials, tool IDs or arguments.

## Tasks and acceptance

- [x] Provider tests first: malformed JSON/envelopes/tool fields, conflicting IDs, incomplete stream, limits and hostile values receive distinct redacted diagnostics; only the declared reasons are retryable. Preserve existing compatibility tests.
- [x] Runner tests first: transient failure recovers to a checked draft; sustained or later failure stops after the one allowance; previous file/check tools execute once; model/context stay identical; max steps, cancellation, lease loss and deadline prevent another request.
- [x] Crash recovery tests: scheduled retry may dispatch once; in-flight retry does not dispatch again; spent allowance survives recovery; expired absolute deadline preserves files/checks and stops.
- [x] Store integration tests: diagnostics/events and retry/deadline state survive real PostgreSQL transactions and reclaim, exact diagnostic fields are projected, and explicit continuation resets the attempt state.
- [x] Implement the minimal provider, types, runner and store changes to make these tests pass.
- [x] Run relevant Nova tests, TypeScript checking and a focused review; document behavior and the scope of synthetic/local validation.

Production enablement is a separate release action. A local deterministic provider response and injected sandbox establish retry/control behavior; neither is a new live Qwen or gVisor acceptance result.

## Verification result

Targeted tests were observed failing before implementation. The provider, retry/runner, real PostgreSQL store and API-to-export flows now pass. A focused review found and closed the terminal-diagnosis transaction gap; a separate regression closes cancellation during the awaited final lease check. Full Nova regression and TypeScript results are recorded under `output/nova-reliability-20261102`. Live gVisor probes remain opt-in and were not executed; no live-provider or deployment acceptance is asserted.
