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

Releases enabling registered accounts and private projects also require
[migration 010 and the cloud-project runtime procedure](open-ena-cloud-projects.md).

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
migrations in numeric order, including
`migrations/009_open_ena_login_failure_windows.sql` before this login build
serves traffic. 009 adds failure windows and does not rewrite sessions,
disposable accounts, or the previous attempt table. Grant the non-superuser
application role `SELECT, INSERT, UPDATE, DELETE` on
`open_ena_login_failure_windows` and `EXECUTE` on
`open_ena_login_failure_guard(text, text, integer, integer, integer)`,
`open_ena_record_login_failure(text, text, integer, integer, integer)`,
`open_ena_clear_login_pair(text, text)`, and
`open_ena_prune_login_failure_windows(integer)`. Confirm the proxy overwrites
`X-ENA-Client-IP` and the service sets
`OPEN_ENA_TRUSTED_CLIENT_IP_HEADER=x-ena-client-ip`. Rolling back the
application does not require dropping 009; the previous runtime keeps using
`open_ena_consume_login_attempt`. Reconcile account, consent, billing, and Plugin Lab
records before accepting the destination. Keep the source intact, and account
for writes made after the initial export before the final switch.

This check prints only booleans and does not include a database URL:

```sh
psql --set ON_ERROR_STOP=1 --no-psqlrc --command "SELECT to_regclass('public.open_ena_login_failure_windows') IS NOT NULL AS failure_windows, to_regprocedure('public.open_ena_login_failure_guard(text,text,integer,integer,integer)') IS NOT NULL AS failure_guard, to_regprocedure('public.open_ena_consume_login_attempt(text,text,integer,integer,integer)') IS NOT NULL AS legacy_attempt;"
```

The archive smoke test verifies public pages, the login page, emitted JavaScript
and CSS, public images, native image optimization, locale redirects, security headers, and fail-closed AI
behavior without runtime configuration. It does not establish production
database migration, successful login, provider access, DNS, or TLS acceptance;
those require checks against the configured destination before cutover.


## Systemd cache policy for subsequent releases and rollback

Use the versioned [Web operator template](../scripts/self-hosted/templates/web-operator.py)
and [local packet renderer](../scripts/prepare-self-hosted-release.py) for new
packets. Historical `output/...` packets are immutable evidence, not templates to
reuse: their bindings and configuration hashes predate the runtime-cache repair.
The common transaction was promoted from the 2026-11-06 packet; existing artifact,
database-backup, environment, worker-coordination and proxy checks remain in place.

The managed [30-runtime-cache.conf](../scripts/self-hosted/30-runtime-cache.conf)
must already be installed at
`/etc/systemd/system/open-ena.service.d/30-runtime-cache.conf` before admitting a
release. Its policy is:

```ini
[Service]
ReadWritePaths=
ReadWritePaths=/srv/open-ena/current/.next/cache
SuccessExitStatus=143
```

The empty assignment removes the old pinned-release exception. Keep
`ProtectSystem=strict` in the base unit. Preserve this drop-in across both forward
and backward switches of `/srv/open-ena/current`; restart resolves the cache for
that release. Do not restore an old combined unit dump over this policy during
rollback. The packet includes the exact managed file for review, but **does not
install it, reload systemd, or repair configuration automatically**. Initial
installation or an intentional policy change is a separately authorized operation;
a missing or changed policy makes the operator stop before switching.

All snapshot-based phases, including preflight and recovery admission, check:

- The exact drop-in digest, root ownership, non-writable-to-others permissions,
  absence of symlinks, and the exact effective `DropInPaths` list. Extra overrides
  require deliberate reconciliation rather than silent acceptance.
- `ReadWritePaths` is the stable `current/.next/cache` path, never a versioned
  release path (even if that pinned path currently matches). No broader writable
  exception is admitted. `ProtectSystem` stays `strict` and `NeedDaemonReload`
  must be `no`.
- D-Bus `SuccessExitStatus` contains exactly exit code 143 and no additional
  signals. Read this structured value with `busctl`: older `systemctl show`
  displays it as `[unprintable]`.
- Both deployment and rollback destination cache directories exist, have the
  expected owners/modes, and contain no substituted directory symlinks. Compiled
  code remains root-owned; only the already designated runtime data directories
  are writable by the application identity.
- For a healthy running Web, `/proc/<pid>/cwd` and the cache's effective writable
  bind mount point **and mount source** agree with the selected release. A valid
  manager configuration alone is insufficient if the process still uses an old
  or read-only mount namespace.

After activation, automatic recovery, manual rollback and final health checks,
the operator repeats the live mount check and requests the public logo through
`/_next/image` on the loopback Web port. It requires a subsequent **HIT** with
matching image content; repeated MISS, a changed body, or a bad response fails the
check. The canary alone cannot prove the systemd sandbox works. Loopback health
checks do not require `X-ENA-Release`; that header is verified through the public
Nginx origins separately.

Recovery may admit a failed/inactive Web with PID 0, or skip checking the broken
process mount before restarting the previous release. It still requires the
managed policy, unchanged environment/unit bindings, and a valid rollback cache
before touching the proxy or release link. Concurrent configuration changes stop
automatic and manual rollback; they are not overwritten to obtain a passing
receipt. A rollback is only recorded after the restored process and image cache
pass their checks.

### Preparing locally

Supply a **non-secret, separately reviewed** binding JSON containing:
`commit`, `previousCommit`, `previousWorkerRelease`, `runId`, `artifactId`,
`artifactSha256`, `artifactBytes`, `allRequiredJobsPassed`, `remoteRoot`, and
`jobs` (each job contains only `name`, `status`, `conclusion`). Use full 40-character
commit SHAs; `remoteRoot` must be a fresh `/root/ena-<release-name>/web` directory.

```sh
python3 scripts/prepare-self-hosted-release.py \
  --binding /path/to/reviewed-binding.json \
  --output output/self-hosted-packets/new-release
```

This command only creates a new **local** directory. It refuses existing output,
unknown binding fields, invalid paths and incomplete/failed job sets. It renders
six bound actions (`preflight`, `stage-release`, `backup-databases`, `activate-web`,
`final-health`, `rollback-web`), Python 3.6-compatible payloads, checked payload
hashes, the managed drop-in and a packet manifest. It does not invoke SSH, cloud
APIs, systemd, or the generated scripts.

The renderer does **not** query GitHub or independently establish CI admission:
`ciAdmissionRevalidated` remains false. Before any separately authorized release,
verify merged-main ancestry, exact commit, all required CI jobs, artifact identity
and freshness through the normal release admission process. Stage the verified
artifact and its download receipt separately under the binding's artifact
location; this renderer does not download artifacts or transport credentials.
Retain the rendered packet and manifest as immutable evidence for that release.

Before a future rollback, use the new packet's deployment/preflight/backup receipts,
which already bind this policy. Do not silently rebase a historical receipt's unit
hash to bypass a mismatch. Rolling back a deployment that predates the managed
policy requires a separately reviewed reconciliation and fresh evidence.

### Local verification

```sh
python3 -B -m unittest discover -s tests -p 'test_self_hosted_release.py' -v
```

The Verify CI job is configured to run the same tests. They use temporary files and simulated
systemd, process mounts, and HTTP responses; no production host or credentials are
used. Coverage includes the original stale-path failure, missing/changed/unsafe
drop-ins, configuration drift, fresh mounts after forward and backward switches,
failed-Web recovery, cache failure and automatic rollback, and packet round trips.
Local passing tests do not substitute for real Linux/systemd and live cache
verification during a later authorized deployment.
