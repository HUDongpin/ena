# Local Open ENA authentication

`npm run dev:open-ena` runs a local static-account workspace with the same
origin checks, trusted client attribution and PostgreSQL session revocation
used by the application. It does not configure a deployed service or copy
credentials from another checkout.

## Prerequisites

Use Node.js 22 or newer, npm, and PostgreSQL 16 on macOS or Linux. Run
`npm ci` in the checkout first. The launcher uses POSIX process groups to stop
its own application children; native Windows execution is not supported.

The local entry is `http://127.0.0.1:3186`; Next.js listens internally on 3187.
This dedicated development profile expects PostgreSQL at
`127.0.0.1:55435/openena_local`. Keep these three ports free before starting
the corresponding services. The launcher never stops an existing listener.

For a new, empty local PostgreSQL cluster, choose a private directory outside
the repository and use your installed PostgreSQL tools, for example:

```sh
export OPEN_ENA_DEV_PGDATA="$HOME/.local/share/open-ena/postgres"
initdb -D "$OPEN_ENA_DEV_PGDATA" -U postgres --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwprompt
pg_ctl -D "$OPEN_ENA_DEV_PGDATA" -l "$OPEN_ENA_DEV_PGDATA/server.log" -o "-h 127.0.0.1 -p 55435" start
```

Create the parent directory if necessary. Do not initialize over an existing
cluster. An existing PostgreSQL 16 instance or container with the same loopback
binding can also be used; keep its data and credentials under your own management.

## Initialize a dedicated authentication database

Connect as the local administrator. Use password prompts or a private `.pgpass`
file instead of putting passwords in command arguments. On a **new** database:

```sh
export PGHOST=127.0.0.1 PGPORT=55435 PGUSER=postgres
createdb openena_local
psql -d openena_local -v ON_ERROR_STOP=1 -c 'CREATE ROLE open_ena_local_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
psql -d openena_local -c '\password open_ena_local_app'
for migration in 002_open_ena_auth_security.sql 004_open_ena_disposable_accounts.sql 008_open_ena_disposable_expiry_after_lock.sql 009_open_ena_login_failure_windows.sql; do
  psql -d openena_local -v ON_ERROR_STOP=1 -f "migrations/$migration" || break
done
```

Stop if any command fails. For an existing database, inspect its applied schema
before applying missing migrations; replaying 004 would replace the upgraded
008 function. These four migrations cover static/disposable login and revocation,
not registered accounts, cloud projects, billing or Plugin Lab.

Grant the application role only the permissions needed for authentication:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE openena_local TO open_ena_local_app;
GRANT USAGE ON SCHEMA public TO open_ena_local_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  open_ena_auth_attempt_windows, open_ena_revoked_sessions,
  open_ena_login_failure_windows TO open_ena_local_app;
GRANT SELECT, UPDATE ON open_ena_disposable_accounts TO open_ena_local_app;
GRANT EXECUTE ON FUNCTION
  open_ena_consume_login_attempt(text,text,integer,integer,integer),
  open_ena_login_failure_guard(text,text,integer,integer,integer),
  open_ena_record_login_failure(text,text,integer,integer,integer),
  open_ena_clear_login_pair(text,text),
  open_ena_prune_login_failure_windows(integer),
  open_ena_consume_disposable_account(text,bytea),
  open_ena_revoke_session(text,bigint),
  open_ena_session_is_revoked(text)
TO open_ena_local_app;
```

## Configure and start

Create `.env.development.local` **in this checkout**, with permissions `0600`.
It is ignored by Git. Use a dedicated local username and password, a stable
local account identifier and a random session secret of at least 32 characters.
Passwords must be at least 12 characters; URL-encode the database password in
the connection string. Do not copy production credentials into this file.

```dotenv
OPEN_ENA_USERNAME=local-researcher
OPEN_ENA_PASSWORD=<local password, at least 12 characters>
OPEN_ENA_ACCOUNT_ID=<stable local account identifier>
OPEN_ENA_SESSION_SECRET=<random local signing secret, at least 32 characters>
OPEN_ENA_AUTH_DATABASE_URL=postgresql://open_ena_local_app:<encoded database password>@127.0.0.1:55435/openena_local
OPEN_ENA_PUBLIC_ORIGIN=http://127.0.0.1:3186
OPEN_ENA_ALLOWED_ORIGINS=http://127.0.0.1:3186
OPEN_ENA_TRUSTED_CLIENT_IP_HEADER=x-ena-client-ip
```

Replace the placeholders in a private editor; quote values containing spaces
or `#` using dotenv syntax. Omit `OPEN_ENA_ADDITIONAL_ORIGINS` entirely. The
launcher keeps this profile's origins local and disables AI calls, cloud
projects and Plugin Lab proposal intake.

```sh
chmod 600 .env.development.local
npm run dev:open-ena -- --check
npm run dev:open-ena
```

Open `http://127.0.0.1:3186/en/open-ena`, `/zh-hans/open-ena` or
`/zh-hant/open-ena`. The proxy overwrites `X-ENA-Client-IP` from the connection
address and forwards development WebSocket traffic. Direct browser login to
the internal 3187 listener is not supported. Next.js uses its built-in Webpack
development mode and writes output and temporary files under `.next/local-dev`.
Existing production builds in `.next` remain separate.

If development output is moved to another disk using a symlink, the launcher
anchors its `node_modules` lookup to this checkout. This prevents compiled files
from loading an ancestor project's different Next.js version. An existing
dependency link to a different checkout is rejected.

`Ctrl+C` stops only this proxy and its application process group. PostgreSQL and
its data remain. Stop your local database separately with your normal service
manager or `pg_ctl -D "$OPEN_ENA_DEV_PGDATA" -m fast stop`; restart it with the
same data directory. Credentials and the account identifier survive restarts.

## Diagnostics

Run `npm run test:dev:open-ena` for the launcher tests. `--check` requires both
application ports to be free and reports configuration key names rather than
values. Database connection failures report `LOCAL_DATABASE_UNAVAILABLE`; schema
or permission failures report `LOCAL_DATABASE_SCHEMA_OR_PERMISSIONS_INVALID`.
`PORT_IN_USE` leaves the existing listener alone. A temporary browser 502 means
the proxy is available while Next.js is starting or unavailable.

`output/local-open-ena/runner.json` contains the runner PID, child PID, checkout
and origin, without credentials. Verify those bindings before stopping a
background process; do not use broad `pkill node` or remove database data.
