# Nova Code implementation and operations

Nova Code owns `/{locale}/plugins`; the previous reviewed catalog is at `/{locale}/plugins/catalog`. Existing detail/propose/status/operator URLs and encrypted proposals remain compatible. The workspace is excluded from indexing and optional analytics. The public catalog and exact-version scientific/release boundaries remain intact.

## Product and resource status

- UI uses the existing `/unified-home/logo-open-ena.svg`, baby blue `#89CFF0`, Code only, the Nova Code product name and Nova assistant name.
- `Anthropic Sans`/`Anthropic Mono` are requested through the verified local family names with system/CJK fallbacks. At the owner's explicit request, four official variable WOFF2 files were downloaded to the ignored `output/nova-code/fonts` directory for local preview, with source URLs, SHA-256 and embedded metadata. They have not been added to the public deployment bundle: the downloaded files do not contain a redistribution license. Exact local font rendering and permission to distribute the font files are separate evidence.
- The Donate dialog is contact-only: `hudongpin@126.com`, mail subject `Open ENA Donation Inquiry`. It never sends email itself. Future task: replace this contact route with Buy Me a Coffee after the owner completes that account and supplies its real URL. Do not fabricate a payment link.
- The SDK supports synchronous TypeScript presentation/export functions over an immutable, labeled synthetic two-group fixture. It is not an arbitrary dependency loader, a production plugin installer, or a source-data upload path. Generated draft bundles need the trusted SDK/runtime; production integration still requires existing manifest/compatibility/review receipts.

For an actual local preview with the downloaded fonts, set `ENA_NOVA_FONT_DIRECTORY` to the absolute downloaded directory when starting the app. The server exposes only the four fixed WOFF2 names through bounded font routes and sends a boolean to the client; it never reveals the directory. Without that variable, the UI makes no font-file requests and retains its local/system fallbacks. The same integration can serve owner-authorized font resources later; do not enable it publicly until the assets are cleared for that use.

## Durable store and migration

Back up and inspect the target database before applying `migrations/012_nova_code.sql`. It is additive and repeatable; it does not modify or delete existing proposal records. Reuse `ENA_PLUGIN_LAB_DATABASE_URL`, `ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1`, and `ENA_PLUGIN_LAB_SECRET`. Never regenerate existing encryption keys during release.

For the dedicated application role, grant SELECT/INSERT/UPDATE on `ena_nova_sessions`, `ena_nova_runs`, and `ena_nova_notifications`; grant SELECT/INSERT only on `ena_nova_events` and `ena_nova_receipts`. Grant USAGE/SELECT on the event cursor and notification request-cursor identity sequences. The web application requires no schema ownership or DELETE permission. Audit triggers reject updates/deletes. The role also needs its existing Plugin Lab verification/contact/rate-limit permissions.

Session/checkpoint payloads are encrypted with purpose-bound AES-GCM envelopes. Request receipts bind owner, action, subject and body. Each researcher request additionally sends `x-nova-identity`, a SHA-256 operation/account binding derived from the verified email; this is not a credential and grants no access. It prevents a cookie change in another tab from submitting an earlier account's private draft under a new owner. The session cookie remains authoritative.

Expert requests are version-bound and indexed independently from encrypted session content. The operator inbox paginates pending/history requests rather than silently limiting them to recently updated sessions. Responding to a stale run/artifact is rejected. A reply resumes development, never publication or scientific approval.

## Model and worker configuration

Keep `ENA_NOVA_ENABLED=false` until controlled acceptance. Configure the existing database/mail variables plus the Nova variables documented in `.env.example`. The current availability endpoint checks configuration only; it is not a live provider/worker health certificate. The trusted web process and worker need matching model/provider configuration for that gate. Provider calls happen only in the worker. Secrets must never use `NEXT_PUBLIC_` names or be passed into a preview/container.

The four initial definitions and effort mapping live in `lib/nova/models.ts`. Default: Qwen3.8 Max 0902 and medium. Model overrides require MODEL/LABEL/VERSION together so a new API ID cannot silently inherit a stale display label. Match Qwen's endpoint to the approved credential's region. Omitting the Nova key variables permits the existing provider-key fallbacks; setting them to blank deliberately disables that provider. Model selection is captured in each run and does not change mid-run.

Follow `scripts/nova-sandbox/README.md` for the Linux x64 worker, immutable image build, mandatory secure runtime and service-manager entry point. A separate host remains the default. On 2026-11-02 the owner also explicitly approved deploying the worker on the existing ECS, using a separate service user, a Nova-only Docker daemon/socket/data root, gVisor, single execution concurrency and a limited parent cgroup containing the worker, daemon, runtime helpers and containers. This profile requires effective limit and membership readback plus resource and website-impact acceptance; a second process on the shared unrestricted Docker daemon does not satisfy it.

`npm run nova:worker` always runs separately from Next.js. Generated code executes only inside the approved secure container, never in the web process or through a host fallback when the secure runtime is missing. The web user must not gain Docker access. Working queues/checkpoints survive page closure; lease expiry permits bounded recovery. Every new continuation has bounded effort, while crash recovery retains its counters. Existing mail configuration and the operator mailbox are reused; the worker drains notifications, or an authenticated scheduler may call `/api/nova/notifications/deliver`.

## Checks and evidence

```sh
npm run test:nova
npm run test:app
npm run typecheck:app
npm run build
# Against an owned localhost app; the browser harness uses explicitly synthetic API fixtures.
NOVA_UI_BASE_URL=http://127.0.0.1:3120 npm run test:browser:nova
# On the isolated worker with its secure image/runtime: see the live-test opt-in in the test file.
ENA_NOVA_TEST_SECURE_SANDBOX=true node --import tsx --test tests/nova-sandbox-live.test.ts
# Explicit, billed, synthetic-prompt protocol check. It does not execute generated tools/code.
npm run nova:check-providers -- --live --model=qwen-max
```

The PostgreSQL flow test uses real local database transactions and authentication records with injected provider/container results. The UI browser test verifies actual rendered controls and the trusted iframe renderer with synthetic session responses. These establish distinct evidence layers; neither proves live model availability, genuine secure-container execution, real mailbox receipt, or deployment acceptance.

Before enabling a deployed worker, run all four configured live-model protocol checks, opt into the real secure-container smoke/adversarial suite, and verify a controlled expert notification separately. SMTP acceptance is not inbox receipt. The operator must confirm the verified model region, real sender and authorized font resources.

For the explicitly approved same-host profile, capture a baseline before installation and observe dependency/image installation, real container tests and controlled generation. Record aggregate Nova cgroup CPU/memory/PID limits and usage, OOM/throttle counters, host available memory, website process RSS/restarts and HTTP status/latency, and the pre-existing Docker container states. Installation and build processes also belong within the approved resource boundary. Save the actual workload and sampling period with the results; report sampled resource peaks separately from kernel historical high-water values. No missing metric, unobserved load level or small observed latency difference establishes zero website impact. The recorded acceptance must identify any unavailable evidence or failed limit test.

## Pause and rollback

Set `ENA_NOVA_ENABLED=false` to prevent new model-backed work. Stop the dedicated worker to stop further execution; its signal handler aborts active provider/container work and retains recoverable checkpoints. Existing owned sessions/artifacts and old proposal workflows remain available. Preserve the additive schema, encryption keys and stored drafts. Roll back only to a compatible application; do not drop tables or reset the existing Plugin Lab workflow.
