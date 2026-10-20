# Update the ECS login credentials

Use `scripts/update-open-ena-ecs-auth.py` when the deployed service is healthy
but its static login credentials differ from the intended `open-ena` account.
The operator edits the runtime environment consumed by systemd and restarts the
service. Changing Vercel settings does not update this ECS process.

This script targets the existing deployment layout:

| Setting | Expected value |
| --- | --- |
| Service and operating-system user | `open-ena.service`, `openena` |
| Environment file | `/etc/open-ena/runtime.env` |
| Working directory | `/srv/open-ena/current` |
| Start command | `/opt/node/bin/node server.js` |
| PostgreSQL service | `open-ena-postgresql.service` |
| Auth database URL | Local host, port `5433`, database `openena` |
| Application listener | `127.0.0.1:3200` |
| Public origin | `https://www.ena.hk` |

Copy the reviewed script to a root-owned directory on the ECS, restrict its
permissions, then run it in an interactive terminal:

```sh
sudo chmod 600 /root/update-open-ena-ecs-auth.py
sudo python3 /root/update-open-ena-ecs-auth.py
```

The script first checks the service binding and existing authentication schema.
It runs the PostgreSQL check as the service's operating-system user, including
its supplementary groups, so a Unix-socket connection with peer authentication
uses the same identity as the application. It does not create databases, change
database credentials, or apply migrations.

Enter the intended password twice at the hidden prompts, then type `APPLY`.
The password must contain at least 12 characters. Do not put it in a command
argument, paste it into a saved Cloud Assistant command, or commit it.

The update sets `OPEN_ENA_USERNAME=open-ena`, the entered password, the public
origin, and the HTTPS allowlists for the bare and `www` forms of `ena.hk` and
`open-ena.com`. It preserves the exact existing account ID, session secret, auth
database URL, and unrelated environment entries. A missing account ID or a
session secret shorter than 32 characters stops preflight without changing the
service.

Before writing, it checks for a concurrent environment-file change and saves a
restricted backup under `/root/open-ena-auth-backups/<UTC timestamp>/`. It
atomically replaces the environment file with mode `0600`, restarts only
`open-ena.service`, checks the new process's effective environment, and verifies:

1. Login returns the expected redirect and a secure session cookie.
2. The cookie grants access to the authenticated workbench.
3. Logout succeeds and replaying the old cookie returns the login form.

Verification uses the loopback listener with the public `Host` and `Origin`.
Inherited HTTP proxies are disabled for these requests. Cookies remain in memory;
the JSON receipt records only status, check results, and non-secret metadata.

A failure after the environment write restores the previous file and restarts
the same service. This includes a rejected or rate-limited verification login.
Keep the reported `STOPPED` code; do not reset authentication throttles to force
the check to pass. If rollback itself fails, inspect service health before
another attempt.

`PASS` establishes the loopback login flow for the restarted process. Separately
verify login, workspace access, and logout at `https://www.ena.hk` before claiming
public acceptance. Committing or merging this script does not execute it on ECS.

Run the focused tests without connecting to ECS:

```sh
python3 -B -m unittest discover -s tests -p 'test_ecs_auth_operator.py' -v
```
