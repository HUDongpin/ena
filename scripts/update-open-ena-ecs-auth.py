#!/usr/bin/env python3
"""Run as root in an interactive ECS terminal. Never embeds or prints secrets."""
import datetime
import getpass
import json
import os
import pathlib
import pwd
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ENV_FILE = pathlib.Path("/etc/open-ena/runtime.env")
SERVICE = "open-ena.service"
BACKUP_ROOT = pathlib.Path("/root/open-ena-auth-backups")
ORIGIN = "https://www.ena.hk"
LOCAL = "http://127.0.0.1:3200"


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def run(args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL).decode().strip()


def property_value(name):
    return run(["systemctl", "show", SERVICE, "-p", name]).partition("=")[2]


def process_environment(pid):
    return dict(x.split("=", 1) for x in
                pathlib.Path("/proc/" + pid + "/environ").read_bytes().decode().split("\0")
                if "=" in x)


def parse_env(text):
    result = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith(("#", ";")):
            continue
        key, sep, value = line.partition("=")
        require(bool(sep), "UNSUPPORTED_ENV_FORMAT")
        values = shlex.split(value, comments=False, posix=True)
        require(len(values) <= 1, "UNSUPPORTED_ENV_VALUE")
        result[key.strip()] = values[0] if values else ""
    return result


def write_atomic(content, stat):
    fd, name = tempfile.mkstemp(prefix=".runtime-auth-", dir=str(ENV_FILE.parent))
    try:
        os.fchmod(fd, 0o600)
        os.fchown(fd, stat.st_uid, stat.st_gid)
        with os.fdopen(fd, "w") as target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.replace(name, str(ENV_FILE))
    finally:
        if os.path.exists(name):
            os.unlink(name)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(opener, path, data=None, cookie=None):
    headers = {"Host": "www.ena.hk", "Origin": ORIGIN}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(data).encode()
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(LOCAL + path, data=data, headers=headers)
    try:
        return opener.open(req, timeout=20)
    except urllib.error.HTTPError as response:
        return response


def verify(password):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with request(opener, "/api/open-ena/login",
                 {"username": "open-ena", "password": password, "locale": "en"}) as response:
        require(response.code == 303, "LOGIN_STATUS_INVALID")
        require(response.headers.get("Location") == ORIGIN + "/en/open-ena",
                "LOGIN_REJECTED")
        require("no-store" in response.headers.get("Cache-Control", ""), "LOGIN_CACHE_INVALID")
        cookie_header = response.headers.get("Set-Cookie", "")
        lower = cookie_header.lower()
        require(all(s in lower for s in
                    ("open-ena-session=", "httponly", "secure", "samesite=lax")),
                "SESSION_COOKIE_INVALID")
        cookie = cookie_header.split(";", 1)[0]
    with request(opener, "/en/open-ena", cookie=cookie) as response:
        page = response.read().decode()
        require(response.code == 200 and "open-ena-workbench" in page
                and "open-ena-login-form" not in page, "WORKSPACE_NOT_AUTHENTICATED")
    with request(opener, "/api/open-ena/logout", {"locale": "en"}, cookie) as response:
        require(response.code == 303, "LOGOUT_FAILED")
    with request(opener, "/en/open-ena", cookie=cookie) as response:
        require(response.code == 200 and "open-ena-login-form" in response.read().decode(),
                "SESSION_REVOCATION_FAILED")
    return {"login": True, "authenticated_workspace": True,
            "logout": True, "old_cookie_rejected": True}


def main():
    require(os.geteuid() == 0, "ROOT_REQUIRED")
    require(sys.stdin.isatty(), "INTERACTIVE_TERMINAL_REQUIRED")
    require(ENV_FILE.is_file() and not ENV_FILE.is_symlink(), "ENV_FILE_INVALID")
    files = property_value("EnvironmentFiles")
    require(files == str(ENV_FILE) + " (ignore_errors=no)", "SERVICE_ENV_CHANGED")
    original = ENV_FILE.read_text()
    stat = ENV_FILE.stat()
    env = parse_env(original)
    account_id = env.get("OPEN_ENA_ACCOUNT_ID", "")
    require(bool(account_id.strip()), "ACCOUNT_ID_MISSING")
    require(len(env.get("OPEN_ENA_SESSION_SECRET", "")) >= 32, "SESSION_SECRET_INVALID")
    db = urllib.parse.urlparse(env.get("OPEN_ENA_AUTH_DATABASE_URL", ""))
    require(db.hostname in ("localhost", "127.0.0.1", "::1")
            and db.port == 5433 and db.path == "/openena", "DATABASE_BINDING_CHANGED")
    require(run(["systemctl", "is-active", "open-ena-postgresql.service"]) == "active",
            "POSTGRES_NOT_ACTIVE")
    cwd = property_value("WorkingDirectory")
    require(cwd == "/srv/open-ena/current", "SERVICE_DIRECTORY_CHANGED")
    start = property_value("ExecStart")
    require("argv[]=/opt/node/bin/node server.js ;" in start, "SERVICE_EXECUTABLE_CHANGED")
    db_check = """
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.OPEN_ENA_AUTH_DATABASE_URL,
 connectionTimeoutMillis:5000});
(async()=>{try {
 const r=await p.query(`SELECT
 to_regprocedure('public.open_ena_consume_login_attempt(text,text,integer,integer,integer)') IS NOT NULL AS login,
 to_regprocedure('public.open_ena_revoke_session(text,bigint)') IS NOT NULL AS revoke,
 to_regprocedure('public.open_ena_session_is_revoked(text)') IS NOT NULL AS check`);
 if(!Object.values(r.rows[0]).every(Boolean)) process.exitCode=2;
} catch(e) {process.exitCode=3;} finally {await p.end();}})();
"""
    child_env = dict(os.environ)
    child_env["OPEN_ENA_AUTH_DATABASE_URL"] = env["OPEN_ENA_AUTH_DATABASE_URL"]
    app_user = property_value("User")
    require(app_user == "openena", "SERVICE_USER_CHANGED")
    account = pwd.getpwnam(app_user)

    def as_app_user():
        os.initgroups(app_user, account.pw_gid)
        os.setgid(account.pw_gid)
        os.setuid(account.pw_uid)

    check = subprocess.run(["/opt/node/bin/node", "-e", db_check], cwd=cwd,
                           env=child_env, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=15,
                           preexec_fn=as_app_user)
    require(check.returncode == 0, "AUTH_DATABASE_PREFLIGHT_FAILED")
    print("Preflight passed: service, stable account, local Postgres and auth schema.")
    password = getpass.getpass("Enter the requested Open ENA password (hidden): ")
    require(len(password) >= 12 and "\n" not in password and "\0" not in password,
            "PASSWORD_INVALID")
    require(password == getpass.getpass("Confirm password (hidden): "), "PASSWORD_MISMATCH")
    print("Will update /etc/open-ena/runtime.env, retain the account/database,")
    print("retain the valid session secret, and restart only open-ena.service.")
    require(input("Type APPLY to commit this change: ").strip() == "APPLY", "CANCELLED")
    require(ENV_FILE.read_text() == original, "CONCURRENT_ENV_CHANGE")
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = BACKUP_ROOT / now
    backup.mkdir(parents=True, mode=0o700)
    backup.chmod(0o700)
    shutil.copy2(str(ENV_FILE), str(backup / "runtime.env"))
    (backup / "runtime.env").chmod(0o600)
    updates = {
        "OPEN_ENA_USERNAME": "open-ena",
        "OPEN_ENA_PASSWORD": password,
        "OPEN_ENA_SESSION_SECRET": env["OPEN_ENA_SESSION_SECRET"],
        "OPEN_ENA_ACCOUNT_ID": account_id,
        "OPEN_ENA_PUBLIC_ORIGIN": ORIGIN,
        "OPEN_ENA_ALLOWED_ORIGINS": "https://www.ena.hk,https://ena.hk",
        "OPEN_ENA_ADDITIONAL_ORIGINS": "https://www.open-ena.com,https://open-ena.com",
        "OPEN_ENA_AUTH_DATABASE_URL": env["OPEN_ENA_AUTH_DATABASE_URL"],
    }
    lines = [line for line in original.splitlines()
             if line.partition("=")[0].strip() not in updates]
    for key, value in updates.items():
        lines.append(key + '="' + value.replace("\\", "\\\\").replace('"', '\\"') + '"')
    updated = "\n".join(lines) + "\n"
    require(all(parse_env(updated)[k] == v for k, v in updates.items()),
            "ENV_SERIALIZATION_FAILED")
    old_pid = property_value("MainPID")
    try:
        write_atomic(updated, stat)
        run(["systemctl", "restart", SERVICE])
        ready = False
        for _ in range(20):
            try:
                with request(urllib.request.build_opener(
                        urllib.request.ProxyHandler({}), NoRedirect()), "/en/open-ena") as response:
                    if response.code == 200:
                        ready = True
                        break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1)
        require(ready, "SERVICE_NOT_READY")
        pid = property_value("MainPID")
        require(pid != old_pid and int(pid) > 0, "SERVICE_NOT_RESTARTED")
        active = process_environment(pid)
        require(all(active.get(k) == v for k, v in updates.items()), "RUNTIME_ENV_MISMATCH")
        checks = verify(password)
        receipt = {"status": "PASS", "service": SERVICE, "environment_file": str(ENV_FILE),
                   "account_id_preserved": True, "database_host": db.hostname,
                   "database_port": db.port, "database_name": db.path.lstrip("/"),
                   "session_secret_preserved": updates["OPEN_ENA_SESSION_SECRET"]
                   == env.get("OPEN_ENA_SESSION_SECRET"),
                   "session_secret_length": len(updates["OPEN_ENA_SESSION_SECRET"]),
                   "old_pid": old_pid, "new_pid": pid, "checks": checks,
                   "backup": str(backup), "verification_scope": "ECS loopback HTTP"}
        (backup / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt, indent=2))
    except Exception:
        write_atomic(original, stat)
        run(["systemctl", "restart", SERVICE])
        print("Verification failed; original runtime.env restored and service restarted.")
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        safe = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        print("STOPPED: " + safe, file=sys.stderr)
        sys.exit(1)
