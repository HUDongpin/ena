# Registered accounts and private cloud projects

This feature gives a verified email address one account and one private project
collection across `www.ena.hk` and `www.open-ena.com`. Users sign in on each
domain separately; cookies remain host-only. The existing configured owner and
disposable accounts retain their existing behavior.

## What a project saves

Save is explicit. A project contains the normalized source table, optional
original CSV, both ENA and ONA model drafts, validated references, the last
analysis result, its saved statistical report when available, and plot/display
settings. Restoring checks integrity and reconstructs the execution plan before
granting a result current status. It does not run an analysis or AI request.
Saved statistics remain a readable/downloadable report; new statistical
inference or AI requests require recomputation in the current session.

AI narratives, captured comparison sets, historical imports, pending actions,
and undo history are not part of the snapshot. The save dialog states this
scope; browser-only artifacts and pending work keep a separate discard warning
even after a successful save. Unfinished raw model input blocks cloud saving
rather than silently saving its previous typed value.

There are at most 50 projects and 200 MiB of retained content per account, with
a 16 MiB snapshot limit. Archive is reversible and retains storage. Permanent
deletion is available only for an already archived project, requires explicit
confirmation, checks its revision, and releases its storage. Conflicting saves
offer reopening or saving a copy; they do not overwrite a newer revision.

## Operator configuration and release sequence

Follow [the existing release procedure](self-hosted-release.md), including the
exact-commit CI requirements and backup/rollback steps. This document does not
authorize a production release. The shared ECS runtime reads
`/etc/open-ena/runtime.env`; changing Vercel environment settings does not change
that runtime.

1. Preserve the existing runtime environment, database backup, previous release,
   account identity, session secret, and origin/proxy configuration. Restore the
   database backup into an isolated database to verify recovery.
2. Apply `migrations/010_open_ena_registered_projects.sql` as the database
   operator after migrations 001–009. This additive migration creates users,
   one-time actions, request limits, and encrypted projects. It does not assign
   old owner-account data to a registered user. The `openena` application role
   must remain a non-owner, non-superuser without `BYPASSRLS`.
3. Supply the following runtime settings through a restricted secret channel.
   Preserve unrelated entries; never put secret values in command arguments,
   Cloud Assistant command history, Git, screenshots, or receipts.

| Variable | Required value or purpose |
| --- | --- |
| `OPEN_ENA_CLOUD_PROJECTS_ENABLED` | `true` enables registered login, recovery, and private projects |
| `OPEN_ENA_REGISTRATION_ENABLED` | Keep `false` until acceptance; set `true` to accept new accounts |
| `OPEN_ENA_AUTH_DATABASE_URL` | Existing shared PostgreSQL database and restricted application role |
| `OPEN_ENA_SESSION_SECRET` | Preserve the existing signing secret |
| `OPEN_ENA_PROJECT_ENCRYPTION_KEY` | Dedicated, cryptographically random 32-byte key encoded as 64 hexadecimal characters |
| `RESEND_API_KEY` | Sending access restricted to the verified account-mail domain |
| `OPEN_ENA_ACCOUNT_MAIL_FROM` | `Open ENA <accounts@mail.open-ena.com>` |
| `OPEN_ENA_ACCOUNT_MAIL_REPLY_TO` | Optional; owner requested `hudongpin@126.com` |
| `OPEN_ENA_PUBLIC_ORIGIN` | Existing canonical origin, `https://www.ena.hk` |
| `OPEN_ENA_ADDITIONAL_ORIGINS` | Preserve both sites' exact allowed HTTPS origins, including `https://www.open-ena.com` |
| `OPEN_ENA_TRUSTED_CLIENT_IP_HEADER` | Existing proxy-overwritten `x-ena-client-ip` |

Back up the encryption key separately in the approved secret store together
with the database recovery procedure. Losing or replacing it makes retained
project ciphertext unreadable. This version does not implement key rotation;
do not generate a new key during a routine deploy or rollback. Project content
is encrypted with AES-256-GCM; titles, ownership, sizes, and timestamps are
server metadata. This is server-managed encryption, not end-to-end encryption.

4. Ensure the reverse proxy accepts the project JSON envelope (at least 17 MiB
   on `/api/open-ena/projects` and its item routes). The application enforces
   the lower snapshot limit and bounded JSON complexity. Keep the trusted IP
   header overwrite; do not trust a client-supplied forwarding header.
5. Start the reviewed Linux standalone artifact and verify the migrated schema,
   restricted-role access, sender configuration, and both HTTPS origins. Turn
   registration on for the controlled verification, create two designated test
   accounts, and check verification mail delivery, login, cross-domain project
   reopening, cross-user isolation, reset invalidation, conflicts, and logout.
   Provider acceptance alone is not inbox delivery.
6. Record the exact release commit, migration, configuration presence (redacted),
   provider delivery status, and public browser results. Retain backups and the
   old release until release acceptance is complete.

For rollback, first disable new registration, restore the previous application
and preserved environment as required, and keep migration 010 and its data.
Do not drop the new tables or discard the encryption key. Existing users'
project availability depends on running a compatible cloud-enabled version.

## Authentication and ownership boundaries

Verification links expire after 24 hours and reset links after 30 minutes. The
database stores only token hashes. Links carry tokens in the fragment; the
account page removes the fragment and submits it in a same-origin POST.
Passwords use salted scrypt with bounded concurrency. Recovery increments the
account's session version, invalidating old sessions on both domains.

Project access derives the owner from the verified session, then checks both an
explicit owner predicate and forced PostgreSQL row security. Mutations require
an allowed Origin and expected revision. The UI also supplies its expected
account identifier so a tab opened under one account cannot save its old data
into a replacement account signed in elsewhere. Responses are not cached.

## Repeatable local verification

The integration fixture requires Node, dependencies, a built application, and
PostgreSQL command-line tools. It creates and cleans up its own temporary
PostgreSQL cluster, runs the real Next.js server, and records mail locally.
It cannot send real email. Do not copy its synthetic credentials or local mail
recorder into production configuration.

```sh
npm run build
npm run test:app
npm run typecheck:app
node tests/support/open-ena-cloud-local-server.mjs
```

In another terminal, use the fixture file printed by the server:

```sh
node --import tsx tests/open-ena-cloud-http-integration.mts \
  --fixture output/cloud-projects-20261024/local-fixture.json
```

The HTTP receipt covers two accounts, single-use verification, both origins,
source/model/result restoration, ownership, stale-account tabs, conflicting
saves, password reset, archive/restore/delete, and logout. Open the two local
origins in a browser for visual and keyboard checks. Send `stop` to the fixture
process on stdin to stop the owned application and remove its temporary data.
Local checks do not establish production, real-user, mail-delivery, load, or
physical-mobile-device acceptance.
