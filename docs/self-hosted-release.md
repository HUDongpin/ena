# Self-hosted release

For pushes to `main` and manual CI runs, the Verify job builds the Next.js
standalone server on Linux x64 with Node 22. Its artifact is named
`ena-linux-x64-<commit>`. It contains the runtime archive, `SHA256SUMS`, and the
result of starting the extracted archive outside the source checkout.
The smoke receipt verifies the expected commit, build ID, operating system,
architecture, and Node major version before checking the running server.

Only deploy an artifact whose exact commit passed all three CI jobs: Verify,
Browser, and Reviewed regressions. Artifact availability alone is not release
approval. The workflow packages files but does not connect to a production
server, change DNS, or apply database migrations.

The archive includes the traced runtime dependencies, public files, static
assets, and SQL migrations. Packaging rejects `.env*` files. Runtime account,
database, session, and provider configuration must be supplied separately by the
server operator; none is bundled into the artifact.

For an existing systemd deployment with incorrect static login credentials, use
the [ECS authentication runtime procedure](ecs-auth-runtime.md). It preserves the
account identity and database binding while updating the running service's
environment through an interactive operator script.

On the target Linux x64 server, verify `SHA256SUMS`, extract into a new versioned
release directory, and run `node server.js` with Node 22. Use `HOSTNAME=127.0.0.1`
and a dedicated free `PORT`, with the existing HTTPS reverse proxy in front.
Supply both canonical website origins in the application's allowed-origin
configuration. Preserve the previous release and proxy configuration for
rollback.

Before moving traffic, back up the existing production PostgreSQL database,
restore it into the isolated destination database, and apply only the required
migrations in numeric order. Reconcile account, consent, billing, and Plugin Lab
records before accepting the destination. Keep the source intact, and account
for writes made after the initial export before the final switch.

The archive smoke test verifies public pages, the login page, emitted JavaScript
and CSS, public images, native image optimization, locale redirects, security headers, and fail-closed AI
behavior without runtime configuration. It does not establish production
database migration, successful login, provider access, DNS, or TLS acceptance;
those require checks against the configured destination before cutover.
