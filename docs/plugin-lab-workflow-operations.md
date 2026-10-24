# Plugin Lab proposal workflow

Researchers verify their email without creating an Open ENA account. Submission
is a separate explicit action. The workflow keeps proposal data and correspondence
encrypted, binds reads/writes to the verified email or one legacy receipt, and
records replies, state changes and notification jobs transactionally.

## Runtime configuration

Keep `ENA_PLUGIN_LAB_PROPOSALS_ENABLED=false` until migration, configuration,
operator review and controlled end-to-end acceptance are complete.

- Preserve or supply `ENA_PLUGIN_LAB_DATABASE_URL`,
  `ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1` and `ENA_PLUGIN_LAB_SECRET` through the
  deployment's secret mechanism. Do not regenerate existing keys during release.
- Reuse ENA's existing Resend configuration: `RESEND_API_KEY` and
  `OPEN_ENA_ACCOUNT_MAIL_FROM`. When `ENA_PLUGIN_LAB_SMTP_HOST` is unset, the
  application uses `smtp.resend.com:465`, username `resend`, with this existing
  credential. No duplicate provider secret is needed.
- Set `ENA_PLUGIN_LAB_OPERATOR_EMAIL` to the designated review mailbox and
  `ENA_PLUGIN_LAB_WORKER_TOKEN` to a separate random secret of at least 32 characters.
- For a separately approved SMTP sender, set `ENA_PLUGIN_LAB_SMTP_HOST`,
  `ENA_PLUGIN_LAB_SMTP_PORT`, `ENA_PLUGIN_LAB_SMTP_USER`,
  `ENA_PLUGIN_LAB_SMTP_PASSWORD` and `ENA_PLUGIN_LAB_MAIL_FROM`. TLS certificate
  verification is mandatory, including STARTTLS on non-465 ports.
- `OPEN_ENA_PUBLIC_ORIGIN` controls notification links. Production links use HTTPS.
  Plain HTTP is accepted only for loopback development origins.
- Preserve `OPEN_ENA_TRUSTED_CLIENT_IP_HEADER` only behind a proxy that overwrites
  it. Missing attribution deliberately shares a bounded fallback quota.

New submissions are limited to three per email/day and five per trusted
source/hour. Receipt retries bypass new-submission quota consumption. Code requests
have separate email/source limits and a 60-second resend cooldown. Codes expire in
10 minutes after at most five failed attempts; researcher sessions last 30 minutes.

## Migration and compatibility

1. Back up the target Plugin Lab database and verify which migrations are already
   present. Apply `005_ena_plugin_lab.sql` only if its schema is absent, followed by
   `011_ena_plugin_workflow.sql`. Migration 011 is repeatable and preserves old data.
2. Use a dedicated application role. Grant SELECT/INSERT/UPDATE on proposals,
   access tokens, rate limits, email contacts, challenges, sessions and notification
   rows. Grant only SELECT/INSERT on proposal events, publication events, workflow
   messages, verification events and request receipts, with USAGE on their identity
   sequences. The new immutable-record triggers reject updates/deletes even by the
   table owner. The application needs no schema ownership or deletion privilege.
3. Run `npm run plugin-lab:backfill` from the verified source checkout with the
   authorized Plugin Lab environment. It is a counts-only dry run. Check unreadable
   and conflicting records before running `npm run plugin-lab:backfill -- --apply`.
   Backfill attaches email hashes; it does not assert that email was verified.
   A later successful code exchange verifies the owner's matching records.
4. Deploy the compatible application while intake remains disabled. Old encrypted
   records and receipt codes remain readable. New payloads are version 2; optional
   fields may be empty and private proposals may have no public projection.

Email verification never grants operator access. Operators retain the existing
static-account authorization and CSRF checks. Publication still requires selection,
verified email, moderation, and renewed consent to the exact title/summary digest.

## Scheduled notifications

The standalone archive includes `scripts/plugin-lab-notifications.mjs`. It calls the
authenticated internal delivery route; application code owns SMTP and database
access. Set `ENA_PLUGIN_LAB_WORKER_ORIGIN` to the application's loopback origin, then
run `node /srv/open-ena/current/scripts/plugin-lab-notifications.mjs` once per minute
using a systemd timer and the deployment's protected environment file. The service
must run as the existing application user with the same Node 22 executable. A
systemd oneshot service prevents overlapping instances of that timer.

Each invocation claims at most two jobs. Each SMTP send has a 15-second absolute
deadline that destroys its owned socket, in addition to connection/inactivity
timeouts. Claims expire after 120 seconds; five unsuccessful attempts stop retries.
Resend receives a stable idempotency header per job. Other SMTP providers may deliver
more than once after an ambiguous connection failure; SMTP acceptance is not proof
of inbox receipt.

The runner logs counts only and returns a nonzero status on a failed run. Inspect
pending/sending/failed delivery indicators in the operator inbox and the timer's
service status. Never log mail bodies, codes, credentials, recipient addresses or
private proposal text. Notification failure does not roll back a saved proposal.

## Acceptance and rollback

Run `npm run test:plugin-workflow`, `npm run verify`, and
`npm run test:browser:plugin-workflow`. The browser harness uses its own PostgreSQL
database and a TLS-protected local SMTP sink with synthetic addresses. It does not
load deployment env files. Test the configured production sender separately against
the owner's controlled mailbox and distinguish SMTP acceptance, delivery events and
confirmed inbox receipt.

Complete the normal exact-commit release checks before production activation. Then
verify submission, private lookup, an operator information request, a researcher
reply and notification processing against the configured release before opening
general intake.

To pause new proposals, set intake false while preserving the compatible application,
database and scheduler. Existing status access and replies remain available. Do not
restore the old pre-workflow binary after version-2 records exist: its readers do
not support the new payloads. Retain a compatible rollback release and all data.
No proposal deletion or retention purge is introduced by this change.
