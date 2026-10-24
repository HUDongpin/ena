# Complete cloud workspace state

**Goal:** Save and restore completed AI interpretations, retained comparison sets and historical imports across both Open ENA domains.

**Design:** Extend the encrypted project payload to schema 2 while retaining schema 1 reads. No database or credential change is needed. Completed AI records retain their reviewed request, response and audit metadata as readable historical records; opening a project never grants fresh consent or dispatches a request. Comparison sets retain validated analysis bundles and reconstruct their derived geometry for historical comparison. Historical imports retain the original admitted text and pass through the existing importer again, preserving the received-file hash and review requirements.

- [x] Add failing codec regressions for all three extensions, comparison selection, old snapshots and tampered content.
- [x] Add bounded extension validation, comparison bundle serialization and original import text retention; restore idle workspace state.
- [x] Connect completed AI callbacks and restored records to the workspace, include all changes in dirty tracking, and limit browser-only warnings to unfinished work.
- [x] Exercise the real UI across independent browser origins, including resaving, pending requests, stale science and historical review. Extend HTTP integration coverage.
- [x] Run relevant tests, type checking, build and code review; fix concrete findings.
- [ ] Follow the already authorized PR/CI/merge/release flow and verify both public domains against the released commit.

**Validation:** `node --import tsx --test tests/open-ena-cloud-workspace.test.ts`, bound-consumer/import regression tests, the AI retention browser tests, a complete-state cloud browser test, full application tests/type checking/build and CI. Production verification uses only designated synthetic data and test identities, preserving existing users and projects.
