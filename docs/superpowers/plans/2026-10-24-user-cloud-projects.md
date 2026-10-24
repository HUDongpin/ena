# Registered Accounts and Cloud Projects Implementation Plan

> For agentic workers: execute this plan in the current isolated worktree using `executing-plans`. The user has authorized implementation and selected email/password registration with verification and recovery. Routine reversible implementation choices do not require another approval.

**Goal:** A verified account can save and reopen its own data, models, and results from either public domain.

**Architecture:** Extend the existing PostgreSQL authentication service with registered users and versioned sessions. Add encrypted, owner-scoped workspace snapshots, a strict restore boundary, and a small cloud-project control surface in the existing workbench.

**Tech Stack:** Next.js/React, TypeScript, Node crypto, PostgreSQL, existing jENA validators, Resend HTTP API.

## 1. Foundation and identity

- [x] Preserve the dirty checkout; create `codex/user-cloud-projects` from `origin/main` in a managed worktree.
- [x] Inspect deployed auth, source/result contracts, and current migration role boundaries.
- [x] Install locked dependencies and run existing auth/domain regression tests (54 passed).
- [ ] Add `tests/open-ena-registered-auth.test.ts`: session signatures/expiry, account binding, session-version invalidation, password hashing/validation, normalized email, and legacy token compatibility. Run with `node --import tsx --test tests/open-ena-registered-auth.test.ts` before implementing.
- [ ] Add `lib/server/open-ena-users.ts` for password and database account operations and v4 token support in `lib/open-ena-auth.ts`; extend `lib/server/open-ena-auth-security-store.ts` and `lib/server/open-ena-login-route.ts` without changing old-session semantics.
- [ ] Add `migrations/010_open_ena_registered_projects.sql`, including RLS and indexed ownership, and a real PostgreSQL test in `tests/open-ena-cloud-postgres.test.ts` using an owned temporary cluster and a non-owner application role.

## 2. Account lifecycle

- [ ] Add account-action tests for verification-before-activation, token expiry/reuse, reset invalidation, bounded request parsing, origin rejection, mail failure, and per-source/email throttles.
- [ ] Implement `lib/server/open-ena-account-routes.ts`, `lib/server/open-ena-account-mail.ts`, and `/api/open-ena/account/[action]` routes. Store action-token hashes, never raw tokens.
- [ ] Implement localized registration/recovery/complete-action UI and add register/recovery links to the login screen. Update source-data privacy language to describe explicit cloud saves.
- [ ] Check actual Resend domain readiness read-only. Keep live delivery evidence distinct from the injected test mail recorder.

## 3. Private projects

- [ ] Test owner A/B isolation, no-session/legacy-session rejection, encryption binding, create replay, optimistic revision conflict, concurrent quota enforcement, archive/restore, and oversized/invalid snapshots before implementation.
- [ ] Implement `lib/server/open-ena-projects.ts`, `lib/server/open-ena-project-routes.ts`, and project list/item API routes with transaction-local RLS context and parameterized queries.
- [ ] Add a bounded shared project contract in `lib/open-ena/cloud-project-contract.ts` and versioned snapshot validation/restoration in `lib/open-ena/cloud-workspace.ts`.

## 4. Workspace integration

- [ ] Add real Standard and ONA save/reopen tests; compare source rows, model drafts, result hashes, references, and plot settings. Include stale/tampered-result rejection and no-automatic-rerun assertions.
- [ ] Add a validated restore operation to the workspace controller and wire primary presentation state into snapshots.
- [ ] Implement `components/open-ena/OpenEnaCloudProjects.tsx` and localized copy. Provide list/create/save/open/rename/archive/restore, explicit source-data disclosure, unsaved-change protection, and conflict recovery.
- [ ] Test across two independent domain cookie jars and two synthetic accounts against the same local application/database.

## 5. Verify and deliver

- [ ] Run the new account/project/snapshot tests, existing auth and model regressions, TypeScript, production build, and applicable repository checks.
- [ ] Run browser registration, verification, recovery, cross-origin project reopening, conflict, and keyboard/narrow-layout checks with synthetic data and recorded local mail.
- [ ] Review the final diff for ownership bypass, raw-data logging, token leakage, scientific-authority shortcuts, and regression risks.
- [ ] Record the exact verified changes, migration/configuration prerequisites, local evidence, and any remaining live-service limitation. Preserve all unrelated work.
