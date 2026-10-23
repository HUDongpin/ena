# Registered accounts and private cloud projects

## Outcome and scope

The owner requested email/password registration, email verification, password recovery, and a private cloud project space shared by `www.ena.hk` and `www.open-ena.com`. A verified user signs in separately on each domain and sees the same owned projects. This is one feature: durable identities own durable workspace snapshots.

The implementation uses the shared application and PostgreSQL deployment. Existing owner/disposable sessions and local-only analysis continue to work. Existing uncommitted work in the main checkout is preserved; this change starts from production/main `5b64d16b321ff1e3392d2c256261c1bdaa3e4b0e` in an isolated worktree.

## Decisions

- Extend the existing PostgreSQL authentication boundary. Replacing it with hosted authentication would introduce a second identity authority and a migration dependency; a separate application/database per domain would defeat shared ownership.
- Use an email verification link followed by password creation. An unverified registration never owns an active account or fixes someone else's password. Recovery links are short-lived and single-use. Reusing a consumed link fails.
- Send account messages using Resend through a server-only API key and an explicitly configured verified sender. No mail credentials or action tokens appear in logs, normal receipts, client bundles, or Git. Unit/integration tests inject a local mail recorder; they never send real mail.
- Registered accounts get signed v4 sessions carrying a stable user ID and a session version. Password reset increments that version, invalidating every previously issued registered-user session. Existing revocation checks still apply to individual logout.
- Keep cookies host-only, Secure in production, HttpOnly, SameSite=Lax. Shared account/project access does not require sharing cookies or adding a cross-domain single-sign-on protocol.
- New identities are distinct from the existing configured owner account. No old shared-account data is assigned to an individual implicitly.

## Database and service boundaries

An additive migration creates registered users, expiring account actions, account-request rate limits, and private projects. It does not rewrite existing authentication, billing, or plugin tables. The application role gets only the required privileges; no public table grants or database-owner credentials are used.

Project ownership comes exclusively from a verified session. Every project operation uses an owner predicate and a transaction-local owner context enforced by PostgreSQL row security. IDs from URLs never grant access. A second user sees a missing project instead of another user's metadata. Quota updates serialize on the owner row, and writes require an expected revision to prevent cross-tab overwrites.

Project content is encrypted with AES-256-GCM and a dedicated server key, bound to the user, project ID, and revision. Titles and bounded list metadata remain queryable. The initial bounded service permits 50 projects and 200 MiB of retained project content per account; each snapshot is capped at 16 MiB, consistent with the existing portable JSON admission boundary. Archived projects remain owned, recoverable, and counted toward storage. To free storage, the owner can explicitly confirm permanent deletion of an already archived project; deletion also checks the current revision and ownership.

## Workspace snapshot and restoration

A versioned project snapshot contains the normalized imported data, dataset provenance, both Standard/ONA drafts, validated references, the last analysis result, model display choices, and primary plot settings. Saving is explicit. The save interface explains that the private cloud copy includes source data. Pure local analysis does not upload raw data.

Restoration validates the snapshot envelope, plain JSON limits, dataset/draft shapes, reference artifacts, and result integrity. A fresh execution plan is compiled from the stored data/configuration before a restored result is granted current/source-backed authority. Historical or stale results remain historical or stale. Restoration never starts an analysis or paid AI request automatically. Nonportable in-flight requests are not resumed.

Saved statistical reports remain available as read-only tables and downloads. AI narratives, captured comparison sets, historical imports, pending actions, and undo history are outside this snapshot. The save dialog discloses the scope; browser-only work retains its own discard warning after a successful save. Unfinished visible raw model input prevents saving instead of silently retaining an older typed value. Raw edits and preset display overlays participate in dirty tracking.

The UI provides owned project listing, creation from the current workspace, save, open, rename, archive, and restore. Successful save displays the stored revision/time. A failed save leaves the current workspace intact. An obsolete write returns a conflict and offers reopening or saving a copy; it never silently replaces a newer server revision. Opening another project warns before replacing unsaved local work.

## Security and product acceptance

Registration/recovery requests are bounded and throttled per trusted source and normalized email reference. Passwords use salted scrypt with bounded concurrency; unknown-account verification performs equivalent derivation. Responses do not disclose whether an email already has an account. Email links carry a high-entropy action token in the URL fragment, then send it in a same-origin POST; referrer and caching policies prevent incidental disclosure.

All mutations validate an explicitly allowed Origin. Project reads require a valid registered session. Disabled users, expired/revoked sessions, invalid tokens, database outages, and missing encryption/mail settings fail closed. Password reset, project ownership, concurrent writes, storage limits, and both configured domains receive direct behavioral tests.

English, Simplified Chinese, and Traditional Chinese account/project copy follows the existing workspace language policy. Narrow layouts and keyboard navigation are checked in a browser. Validation includes an owned temporary PostgreSQL instance, real application HTTP routes, two synthetic users, both domain origins, workspace save/reopen, and existing auth/model regression tests.

## Delivery boundary

Code, migrations, local verification, and operator configuration instructions are prepared as a reviewable change. Production migration, enabling registration, credential placement, and deployment are separate release actions. Live sender readiness and live email delivery are reported separately from synthetic mail tests. Existing data/backups and unrelated changes are preserved.
