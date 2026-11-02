# Nova Code verification and deployment acceptance

The first sections preserve the 2026-11-01 local verification from the isolated `codex/nova-code` worktree, based on main `350b7f2`, before PR publication. At that cutoff, deployment, production migration and real expert-mail acceptance were pending. The dated sections below record the subsequent same-host deployment and completed acceptance on 2026-11-02.

## Implemented behavior

The Plugin Lab entry is the approved Nova Code shell, with the original Open ENA logo, baby-blue palette, four concrete model choices, four effort levels, text-only context addition, verified-email recovery, owned session URLs, responsive preview/files/checks and contact-only Donate. Old catalog/proposal/detail/operator routes remain available. Buy Me a Coffee remains a future replacement after the owner completes the account.

The separate worker implements model tool calls, validated TypeScript draft files, checkpoint recovery, cancellation, bounded repair, secure-container execution, private artifacts and version-bound expert requests. Failed/unfinished source and checks are visible separately from checked artifacts. Generated code never executes in the web process or as a host fallback.

## Verification results

| Check | Result | Evidence boundary |
|---|---|---|
| `npm run build` | Pass, exit 0 | Final application compilation, TypeScript and route generation |
| `npm run test:app` | 3,792 passed; 0 failed; 15 skipped; 3,807 total | Includes 13 secure-container tests skipped for unavailable infrastructure, plus 2 existing skips |
| `npm run test:nova` | 84 passed; 0 failed; 13 skipped; 97 total | Includes real ephemeral PostgreSQL store and API/runner integration; providers/container results injected where stated |
| Expanded browser suite | Pass | Desktop/mobile, actual rendered UI and real font routes; session/model/run responses are explicitly synthetic fixtures |
| DeepSeek Flash and Pro | Both pass live tool call and continuation | Synthetic prompt only; no plugin code execution or immutable upstream alias guarantee |
| Qwen | Incomplete | Owner ALI QWEN credential found; Beijing TLS connection timed out; Singapore returned authentication failure. No colleague credential used. |
| Anthropic fonts | All four WOFF2 files downloaded, parsed and loaded through actual local app routes | Public download/rendering is not redistribution permission; binaries stay in ignored output |
| Secure container | Not verified on a live runtime | 13 opt-in smoke/adversarial cases remain skipped until a dedicated Linux gVisor/Kata worker is available |
| Expert delivery | Local synthetic sender/outbox tests pass | No real mailbox receipt claimed |

The test suites overlap; counts are not additive.

Browser checks cover account changes before and between writes, identity-bound retries, ambiguous responses through re-verification, a failed final-event refresh, full-page task restoration, source escaping, preview export source/nonce validation, failed draft diagnostics, stale review rejection, donation focus/Escape, and real font responses. Independent reviews reproduced and closed the account race, lost-refresh/retry issues, quota race, hidden expert requests, and sandbox completion/realm-boundary issues. Real sandbox execution remains an explicit activation prerequisite.

## Local evidence and remaining activation work

`output/nova-code/browser/` contains screenshots and `font-loading.json`; `output/nova-code/fonts/` contains the four official files, original source URLs, metadata and SHA-256 records. `output/nova-code/provider-verification-summary.json` records the redacted live model outcomes. `output/` is ignored and contains no saved API keys.

Before enabling the hosted service: establish the approved Qwen endpoint/account, configure and test the approved secure worker profile, apply migration 012 to the database configured by Plugin Lab with the existing encryption keys and least-privilege role, and perform controlled real-mail acceptance. Public font serving additionally requires redistribution permission; leaving `ENA_NOVA_FONT_DIRECTORY` unset uses system/local fallbacks. Follow `docs/nova-code-operations.md`. These prerequisites do not affect the delivered UI/code or the original proposal records.

## Approved same-host deployment profile — 2026-11-02

The owner explicitly authorized using the existing ECS for Nova with gVisor and requested actual resource-peak, limit and website-impact verification. This adds an approved deployment profile; it does not revise the historical test results above into live passes. The separate-host deployment remains available.

The same-host profile requires a separate service user, Nova-only Docker daemon/socket/data root, one active execution, no host or `runc` fallback, and an aggregate limited parent cgroup that contains the worker, daemon, runtime helpers and containers. The effective CPU/memory/PID limits and process membership must be read back on the actual kernel/service-manager combination. Configuring a unit is not proof that all child workloads are limited.

Acceptance records must distinguish the installation/build, real secure-container suite and controlled-generation windows from their baseline. Observe host available memory, Nova aggregate memory/CPU/PIDs and OOM/throttle counters, website RSS/restarts and HTTP status/latency, and the existing Docker container states. Maxima from periodic reads are sampled peaks; kernel memory high-water values may predate the window. Record unavailable metrics, actual sampling gaps and the real workload. These observations support a bounded deployment conclusion, not a worst-case capacity or zero-impact claim. Live provider responses, completed durable runs/artifacts, actual notification delivery and mailbox confirmation remain separate evidence.

## Actual same-host acceptance — 2026-11-02, 04:57 UTC

The following updates the deployment evidence as of 12:57 Asia/Taipei; the historical local-results table above is unchanged. The web release is `8d4ab4b1099dabd727b846928169ab79f6608fda`. The active worker uses `/srv/nova-worker/releases/8d4-cohost-69ff0ded`, with deployment-time uncommitted patch SHA-256 `69ff0ded952ae06faa011aab0b4c4ea68462779c30162edabef8f5f971813d38`; this identifies the historical deployment patch, not a Git commit or the full follow-up PR diff.

| Check | Actual result and scope | Local evidence under `output/nova-cohost-20261102/` |
|---|---|---|
| Secure execution | Real gVisor boundary probe and 13/13 smoke/adversarial cases passed, 0 failed or skipped, with worker umask 0077 | `revision2/sandbox-tests-receipt.json` |
| Live providers | Beijing Qwen Flash/Max and DeepSeek Flash/Pro all passed real tool calls and continuation, using synthetic protocol prompts | `revision2/worker-four-provider-receipt.json` |
| Production queue generation | One operator-created synthetic Qwen Flash/low run finished in 7 steps, 0 repairs and 1 queue attempt; one private draft with five files passed real-container and trusted invariance checks | `revision2/generation-poll-receipt.json` |
| Production notification | One version-bound expert request produced a settled `sent` notification in 1 attempt; actual recipient confirmation remains pending | `revision2/notification-poll-receipt.json` |
| Aggregate limits | Running parent cgroup: 1 GiB memory, one logical CPU, 256 tasks. Child containers: 256 MiB, one CPU, 64 PIDs. CPU enforcement probe passed; the child memory limit was confirmed by the exact memcg OOM event and memsw failcnt 120 | `revision2/controlled-start-receipt.json`, `revision2/resource-limit-receipt.json`, `revision2/memory-limit-reconciliation.json` |

The memory reconciliation preserves the original automatic `NOT_PROVEN_OR_FAILED` result: the probe required `memory.failcnt` growth but omitted the separately enforced `memory.memsw.failcnt`. The exact child-cgroup kernel event supplies the missing evidence; neither the original script nor configured limits were changed to obtain that conclusion. This test did not deliberately saturate the aggregate 1 GiB limit.

The 900-second controlled observation window, 04:36:17–04:51:17 UTC, covers the external provider checks, worker startup and real generation. Nova parent memory reached a **sampled** peak of 364040192 bytes (347.18 MiB); host available memory stayed at or above 1710448640 bytes (1.593 GiB). The website had no observed PID change or restart, loopback/public HTTP checks each returned 200 in 30/30 samples, and the 14 existing containers present at this window's start retained their observed states. See `monitor/controlled.json`. The observer's `loadGenerated` describes only its own health probes; it does not mean that the external generation workload was absent. This window ended before the expert request and send events at 04:53:24 and 04:53:31 UTC, so it does not establish notification-window resource behavior. Short samples, including the reported 104.8% single-core CPU sample, are distinct from the enforced quota and the separate CPU-window probe; none establishes zero website impact or worst-case capacity.

At this cutoff, **the worker is active for controlled acceptance, public web generation remains disabled, and inbox receipt and final enablement/readback remain pending**. `ENA_NOVA_FONT_DIRECTORY` remains unset; no downloaded Anthropic font files were authorized for public distribution. The generated artifact remains a private draft. This operator/store exercise does not establish a newly authenticated researcher's browser submission journey. `revision2/acceptance-progress.md` maps the receipts, and `deployment-state.json` records their hashes and remaining steps.


## Public enablement and confirmed receipt — 2026-11-02, 06:03 UTC

At 14:03 Asia/Taipei, public Nova generation was enabled after the owner confirmed the new production notification with the exact session and expert-request identifiers recorded in the private local receipts. The confirmation's SHA-256 matches the final enablement receipt. The confirmation-recorded timestamp is not the original mailbox delivery time.

`output/nova-cohost-20261102/revision2/web-enabled-receipt.json` records successful checks on both public domains: existing login/workspace/logout/revoked-cookie behavior, cloud entry, Nova pages and matching enabled model configuration, rejection of anonymous private-session access, and font routes remaining 404. The web worker flag stays false, unrelated keys are preserved, and generated drafts are not published. Both `ena-nova-docker.service` and `ena-nova-worker.service` changed from disabled to enabled with startup-state readback; containerd starts through the Docker dependency. This establishes configured boot persistence, not a host-reboot test.

**Public enablement and actual inbox confirmation are complete; final post-enable monitoring and external HTTP/browser readback remain pending collection. Full deployment acceptance is not yet marked complete.** At that cutoff, the worker used the explicitly identified deployment-time uncommitted revision2 patch, and the earlier operator synthetic-queue and sampling scope limits remain. The owner confirmation is in `revision2/owner-inbox-confirmation.json`; the current evidence index is `deployment-state.json` under the same output directory.


## Completed deployment acceptance — 2026-11-02, 06:10 UTC

The requested existing-ECS deployment and its bounded acceptance are complete. Final service readback at 06:08:26 UTC found the web, PostgreSQL, existing Docker, Nova containerd, Nova Docker and Nova worker active; the Nova worker retained PID 1057362 with zero restarts, and the observation service had finished successfully. External requests to both public domains returned HTTP 200 with the expected release, enabled Nova/runtime configuration and all four models available. The real browser was refreshed to the Traditional Chinese workbench and its four-model menu was opened successfully. These are configuration/UI checks, not additional model invocations or a newly verified researcher submission.

The post-enable window ran from 06:03:09 to 06:05:09 UTC for 120.002 seconds, with 120 resource samples. Nova aggregate memory had a sampled peak of 105340928 bytes (100.46 MiB), host available memory stayed at or above 2205184000 bytes (2.054 GiB), and both loopback/public health probes were HTTP 200 in 6/6 checks. The web had no observed PID change or restart, and the 14 containers present at this window's start retained their observed states. Baseline, controlled-generation, revision2 and post-enable raw samples remain on the server; their SHA-256 values were recomputed there and match the corresponding receipts. This establishes remote sample integrity, not local possession of the raw sample files.

Evidence: `output/nova-cohost-20261102/revision2/post-enable-state-receipt.json`, `post-enable-external-models.json`, `post-enable-browser-smoke.json`, and `output/nova-cohost-20261102/monitor/post-enable.json`. The complete receipt hash index and the now-empty `remainingAcceptance` list are in `output/nova-cohost-20261102/deployment-state.json`.

Completion is scoped to this request's approved same-host deployment and tests. It does not claim worst-case capacity, zero website impact, a host reboot test, or a new researcher's complete authentication/submission journey. The worker patch was uncommitted at deployment time; its runtime bytes are recorded by this follow-up source change. Font serving remains unset/404, and generated artifacts remain private drafts without automatic publication or scientific approval. Historical failure receipts, including the original memory probe result, remain preserved with their separately linked reconciliation.

## Source provenance for the worker follow-up

The provider and sandbox runtime files in this change match the deployed source manifest: `lib/nova/provider.ts` SHA-256 `10382c9d37f312c35403b359d7ee22cb5332a16756d6f96c1f40a538a3fd8c26` and `lib/nova/sandbox.ts` SHA-256 `91cf16dbe6f47c3b32d60d3e98406f7819443b9878161fef5291be1831516aea`. The follow-up adds regression coverage and deployment documentation around those same runtime bytes. The ignored `output/` receipts and their historical source state are retained locally; they are not committed with this change.
