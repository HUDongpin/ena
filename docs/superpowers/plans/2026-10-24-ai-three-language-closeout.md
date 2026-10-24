# Open ENA AI and onboarding closeout

Owner-approved implementation scope, 2026-10-24. Baseline: `a60c93b`.

## Outcomes

1. Reproduce and fix Chinese AI JSON/structure failures with bounded, private diagnostics and regression evidence. Keep DeepSeek, strict response/evidence validation, one dispatch per user action, and usage accounting on rejected outputs.
2. Close #57 through English, Simplified Chinese and Traditional Chinese generation/recovery acceptance. Add a stable in-workspace language control without navigation/remount or loss of unsaved work. Retain the latest completed AI record when parameters/language change, clearly label stale/history and original language, revoke consent, reject late responses, and add explicit AI clear with null persistence.
3. Close #60 using the existing verified-email registration path. Explain analysis, private cloud projects, registration/verification, separate login on both domains, and explicit data sharing. Show accurate unavailable-registration copy. Preserve the public/login layout.

## Compatibility and boundaries

- Keep AI/account/project HTTP routes and cloud schema 2. Retained display is never execution, consent or retry authority.
- Any prompt or token-budget change requires a new immutable prompt version and reviewed binding; historical records remain readable. A rollback artifact must understand newly stored prompt versions.
- Work in an isolated branch, preserving unrelated local edits. No Yu scientific gates, dependency upgrades, quota expansion, model/provider replacement or unrelated PR cleanup.
- Credentials remain in approved secret storage or process memory. Real user text must not enter diagnostics. Synthetic response material may be retained only after a credential scan.

## Validation and release

- Test-first regressions for JSON/schema/evidence failures and diagnostic redaction; UI tests for all recovery classes, rate-limit waits, ownership/duplicate/late-response protections, retention, language changes and clear/save/reopen.
- Existing cloud round trips, schema 1/2, comparison sets and historical imports remain covered. Run prompt governance, relevant browser checks and `npm run verify`; retain the two existing Yu skips accurately.
- Release candidate: three consecutive real generations in each of en/zh-hans/zh-hant on the same synthetic evidence, all 9 accepted and language-correct. Log every attempt; a failed candidate is not accepted.
- Final exact commit must pass Verify, Browser and Reviewed regressions. Back up and rehearse recovery, deploy its Linux artifact, then make one real generation per locale per domain (6), including Chinese cross-domain save/restore equality.
- Verify registration and actual verification-mail inbox arrival on both domains, three-language entry copy, desktop/narrow viewport and keyboard paths. Keep simulated failure checks separate from actual provider evidence.
- Archive synthetic projects, disable temporary accounts and remove temporary credentials. Close the Chinese bug and #57/#60 only after their individual acceptance evidence is complete.
