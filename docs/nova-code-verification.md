# Nova Code verification — 2026-11-01

Implementation is in the isolated `codex/nova-code` worktree, based on main `350b7f2`. The results below record local verification before PR publication. Deployment, production migration and real expert-mail acceptance remain separate pending steps.

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

Before enabling the hosted service: establish the approved Qwen endpoint/account, configure and test the independent secure worker, apply migration 012 with the existing encryption keys and least-privilege role, perform controlled real-mail acceptance, and confirm permission for publicly serving the downloaded font files. Follow `docs/nova-code-operations.md`. These prerequisites do not affect the delivered UI/code or the original proposal records.
