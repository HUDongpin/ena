"""Local operator tests: temporary files, synthetic credentials, no ECS access."""
import contextlib
import base64
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import threading
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock
from urllib.parse import parse_qs


SPEC = importlib.util.spec_from_file_location(
    "ecs_auth_operator",
    Path(__file__).resolve().parents[1] / "scripts/update-open-ena-ecs-auth.py",
)
operator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operator)
PASSWORD = 'synthetic-password "with quotes" \\ and $characters'
SESSION_SECRET = "synthetic-session-secret-kept-stable-0123456789"
DATABASE = "postgresql://synthetic:fixture@127.0.0.1:5433/openena"
ORIGINAL = (
    "# Keep this operator comment\n"
    "UNRELATED_SETTING=keep-me\n"
    'OPEN_ENA_USERNAME="previous-user"\n'
    'OPEN_ENA_PASSWORD="previous-synthetic-password"\n'
    'OPEN_ENA_ACCOUNT_ID="stable-test-account"\n'
    f'OPEN_ENA_SESSION_SECRET="{SESSION_SECRET}"\n'
    f'OPEN_ENA_AUTH_DATABASE_URL="{DATABASE}"\n'
    'OPEN_ENA_PUBLIC_ORIGIN="https://old.example.test"\n'
)


@contextlib.contextmanager
def http_fixture(*, reject_login=False, retain_session=False, proxy=False,
                 expected_username=None, accept_previous_session=False):
    state = types.SimpleNamespace(requests=[], authenticated=False)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            self.handle_request()

        def do_POST(self):
            self.handle_request()

        def handle_request(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
            state.requests.append((self.path, parse_qs(body), dict(self.headers)))
            if proxy:
                self.send_response(502)
                self.end_headers()
                return
            if self.path == "/api/open-ena/login":
                rejected = reject_login or (expected_username is not None
                    and parse_qs(body).get("username") != [expected_username])
                state.authenticated = not rejected
                self.send_response(303)
                self.send_header(
                    "Location",
                    operator.ORIGIN + ("/en?auth=invalid" if rejected else "/en/open-ena"),
                )
                self.send_header("Cache-Control", "no-store")
                if not rejected:
                    self.send_header(
                        "Set-Cookie",
                        "open-ena-session=synthetic-cookie; HttpOnly; Secure; SameSite=Lax",
                    )
                self.end_headers()
            elif self.path == "/api/open-ena/logout":
                if not retain_session:
                    state.authenticated = False
                self.send_response(303)
                self.send_header("Location", operator.ORIGIN + "/en/open-ena")
                self.end_headers()
            elif self.path == "/en/open-ena":
                authenticated = (
                    state.authenticated
                    and self.headers.get("Cookie") == "open-ena-session=synthetic-cookie"
                ) or (accept_previous_session
                      and self.headers.get("Cookie", "").startswith("open-ena-session=v2."))
                self.send_response(200)
                self.end_headers()
                marker = "open-ena-workbench" if authenticated else "open-ena-login-form"
                self.wfile.write(f'<main id="{marker}"></main>'.encode())
            else:
                self.send_response(404)
                self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()
    state.url = f"http://127.0.0.1:{server.server_port}"
    try:
        yield state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


class OperatorLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.env_file = root / "runtime.env"
        self.env_file.write_text(ORIGINAL)
        self.env_file.chmod(0o600)
        self.backups = root / "backups"
        self.output = io.StringIO()
        self.stack.enter_context(contextlib.redirect_stdout(self.output))
        self.stack.enter_context(mock.patch.object(operator, "ENV_FILE", self.env_file))
        self.stack.enter_context(mock.patch.object(operator, "BACKUP_ROOT", self.backups))
        self.stack.enter_context(mock.patch.object(operator.os, "geteuid", return_value=0))
        self.stack.enter_context(
            mock.patch.object(operator.sys, "stdin", types.SimpleNamespace(isatty=lambda: True))
        )
        self.stack.enter_context(
            mock.patch.object(
                operator.pwd, "getpwnam",
                return_value=types.SimpleNamespace(pw_uid=os.getuid(), pw_gid=os.getgid()),
            )
        )
        self.preflight = self.stack.enter_context(
            mock.patch.object(operator.subprocess, "run", return_value=types.SimpleNamespace(returncode=0))
        )
        self.active_env = operator.parse_env(ORIGINAL)

        def systemctl(args):
            if args == ["systemctl", "restart", operator.SERVICE]:
                self.active_env = operator.parse_env(self.env_file.read_text())
                return ""
            if args == ["systemctl", "is-active", "open-ena-postgresql.service"]:
                return "active"
            raise AssertionError(f"Unexpected system command: {args}")

        self.run = self.stack.enter_context(
            mock.patch.object(operator, "run", side_effect=systemctl)
        )
        self.password_prompt = self.stack.enter_context(
            mock.patch.object(operator.getpass, "getpass", return_value=PASSWORD)
        )
        self.confirm = self.stack.enter_context(mock.patch("builtins.input", return_value="APPLY"))
        pids = iter(["123", "456"])
        properties = {
            "EnvironmentFiles": str(self.env_file) + " (ignore_errors=no)",
            "WorkingDirectory": "/srv/open-ena/current",
            "ExecStart": "{ argv[]=/opt/node/bin/node server.js ; }",
            "User": "openena",
        }
        self.stack.enter_context(mock.patch.object(
            operator, "property_value",
            side_effect=lambda name: next(pids) if name == "MainPID" else properties[name],
        ))
        self.process_environment = self.stack.enter_context(mock.patch.object(
            operator, "process_environment",
            side_effect=lambda pid: self.active_env.copy(),
        ))

    def restart_calls(self):
        return [
            call for call in self.run.call_args_list
            if call.args[0] == ["systemctl", "restart", operator.SERVICE]
        ]

    def test_success_preserves_identity_and_database_with_private_backup(self):
        with http_fixture() as server, mock.patch.object(operator, "LOCAL", server.url):
            operator.main()
        updated = operator.parse_env(self.env_file.read_text())
        self.assertEqual(updated["OPEN_ENA_USERNAME"], "open-ena")
        self.assertEqual(updated["OPEN_ENA_PASSWORD"], PASSWORD)
        self.assertEqual(updated["OPEN_ENA_ACCOUNT_ID"], "stable-test-account")
        self.assertEqual(updated["OPEN_ENA_SESSION_SECRET"], SESSION_SECRET)
        self.assertEqual(updated["OPEN_ENA_AUTH_DATABASE_URL"], DATABASE)
        self.assertEqual(updated["UNRELATED_SETTING"], "keep-me")
        self.assertIn("# Keep this operator comment\n", self.env_file.read_text())
        self.assertEqual(updated["OPEN_ENA_PUBLIC_ORIGIN"], operator.ORIGIN)
        origins = set(
            (updated["OPEN_ENA_ALLOWED_ORIGINS"] + "," + updated["OPEN_ENA_ADDITIONAL_ORIGINS"])
            .split(",")
        )
        self.assertEqual(origins, {
            "https://ena.hk", "https://www.ena.hk",
            "https://open-ena.com", "https://www.open-ena.com",
        })
        backup, = self.backups.iterdir()
        self.assertEqual((backup / "runtime.env").read_text(), ORIGINAL)
        self.assertEqual(stat.S_IMODE((backup / "runtime.env").stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.env_file.stat().st_mode), 0o600)
        self.assertEqual(len(self.restart_calls()), 1)
        self.assertEqual(self.active_env, updated)
        self.process_environment.assert_called_once_with("456")
        receipt = json.loads((backup / "receipt.json").read_text())
        self.assertEqual(receipt["status"], "PASS")
        self.assertTrue(all(receipt["checks"].values()))
        for secret in (PASSWORD, SESSION_SECRET, DATABASE):
            self.assertNotIn(secret, self.output.getvalue())
            self.assertNotIn(secret, (backup / "receipt.json").read_text())
        self.assertEqual(self.preflight.call_args.kwargs["env"]["OPEN_ENA_AUTH_DATABASE_URL"], DATABASE)

    def test_verification_failure_restores_original_and_restarts_again(self):
        with http_fixture(reject_login=True) as server:
            with mock.patch.object(operator, "LOCAL", server.url):
                with self.assertRaisesRegex(RuntimeError, "^LOGIN_REJECTED$"):
                    operator.main()
        self.assertEqual(self.env_file.read_text(), ORIGINAL)
        self.assertEqual(self.active_env, operator.parse_env(ORIGINAL))
        self.assertEqual(len(self.restart_calls()), 2)
        backup, = self.backups.iterdir()
        self.assertEqual((backup / "runtime.env").read_text(), ORIGINAL)
        self.assertFalse((backup / "receipt.json").exists())
        self.assertIn("original runtime.env restored", self.output.getvalue())

    def test_new_login_name_rotates_sessions_and_rejects_previous_credentials(self):
        with http_fixture(expected_username="research-owner") as server:
            with mock.patch.object(operator, "LOCAL", server.url):
                operator.main(username="research-owner", rotate_sessions=True)
        updated = operator.parse_env(self.env_file.read_text())
        self.assertEqual(updated["OPEN_ENA_USERNAME"], "research-owner")
        self.assertEqual(updated["OPEN_ENA_PASSWORD"], PASSWORD)
        self.assertNotEqual(updated["OPEN_ENA_SESSION_SECRET"], SESSION_SECRET)
        self.assertGreaterEqual(len(updated["OPEN_ENA_SESSION_SECRET"]), 32)
        self.assertEqual(updated["OPEN_ENA_ACCOUNT_ID"], "stable-test-account")
        self.assertEqual(updated["OPEN_ENA_AUTH_DATABASE_URL"], DATABASE)
        self.assertEqual(updated["UNRELATED_SETTING"], "keep-me")
        logins = [body["username"][0] for path, body, _ in server.requests if path == "/api/open-ena/login"]
        self.assertEqual(logins, ["research-owner", "previous-user"])
        backup, = self.backups.iterdir()
        receipt = json.loads((backup / "receipt.json").read_text())
        self.assertTrue(receipt["previous_login_disabled"])
        self.assertTrue(receipt["previous_sessions_invalidated"])
        self.assertFalse(receipt["session_secret_preserved"])
        self.assertNotIn(updated["OPEN_ENA_SESSION_SECRET"], self.output.getvalue())
        self.assertNotIn(PASSWORD, self.output.getvalue())

    def test_invalid_new_login_name_stops_before_password_or_mutation(self):
        with self.assertRaisesRegex(RuntimeError, "^USERNAME_INVALID$"):
            operator.main(username="invalid\nusername", rotate_sessions=True)
        self.assertEqual(self.env_file.read_text(), ORIGINAL)
        self.password_prompt.assert_not_called()

    def test_old_login_still_accepted_rolls_back_the_rotation(self):
        with http_fixture() as server, mock.patch.object(operator, "LOCAL", server.url):
            with self.assertRaisesRegex(RuntimeError, "^PREVIOUS_LOGIN_STILL_VALID$"):
                operator.main(username="research-owner", rotate_sessions=True)
        self.assertEqual(self.env_file.read_text(), ORIGINAL)
        self.assertEqual(len(self.restart_calls()), 2)
        backup, = self.backups.iterdir()
        self.assertFalse((backup / "receipt.json").exists())

    def test_previous_session_still_accepted_rolls_back_the_rotation(self):
        with http_fixture(expected_username="research-owner", accept_previous_session=True) as server:
            with mock.patch.object(operator, "LOCAL", server.url):
                with self.assertRaisesRegex(RuntimeError, "^PREVIOUS_SESSION_STILL_VALID$"):
                    operator.main(username="research-owner", rotate_sessions=True)
        self.assertEqual(self.env_file.read_text(), ORIGINAL)
        self.assertEqual(len(self.restart_calls()), 2)
        backup, = self.backups.iterdir()
        self.assertFalse((backup / "receipt.json").exists())

    def test_rotation_requires_a_new_password_before_writing(self):
        self.password_prompt.return_value = "previous-synthetic-password"
        with self.assertRaisesRegex(RuntimeError, "^NEW_PASSWORD_REQUIRED$"):
            operator.main(username="research-owner", rotate_sessions=True)
        self.assertEqual(self.env_file.read_text(), ORIGINAL)
        self.assertFalse(self.backups.exists())
        self.assertFalse(self.restart_calls())

    def test_previous_token_matches_the_application_v2_signature_contract(self):
        environment = operator.parse_env(ORIGINAL)
        environment["OPEN_ENA_ACCOUNT_ID"] = "  stable-test-account  "
        cookie = operator.signed_previous_session(environment)
        payload, supplied = cookie.removeprefix("open-ena-session=").rsplit(".", 1)
        version, issued, jti, principal = payload.split(".")
        encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
        self.assertEqual(version, "v2")
        self.assertTrue(issued.isdigit())
        self.assertRegex(jti, r"^[0-9a-f-]{36}$")
        self.assertEqual(principal, encode(hashlib.sha256(b"stable-test-account").digest()))
        self.assertEqual(supplied, encode(hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).digest()))

    def test_missing_account_stops_before_mutation(self):
        original = ORIGINAL.replace('OPEN_ENA_ACCOUNT_ID="stable-test-account"\n', "")
        self.env_file.write_text(original)
        with self.assertRaisesRegex(RuntimeError, "^ACCOUNT_ID_MISSING$"):
            operator.main()
        self.assertEqual(self.env_file.read_text(), original)
        self.assertFalse(self.backups.exists())
        self.password_prompt.assert_not_called()
        self.run.assert_not_called()

    def test_short_secret_stops_before_mutation(self):
        original = ORIGINAL.replace(SESSION_SECRET, "too-short")
        self.env_file.write_text(original)
        with self.assertRaisesRegex(RuntimeError, "^SESSION_SECRET_INVALID$"):
            operator.main()
        self.assertEqual(self.env_file.read_text(), original)
        self.assertFalse(self.backups.exists())
        self.password_prompt.assert_not_called()
        self.run.assert_not_called()

    def test_concurrent_change_is_preserved_without_backup_or_restart(self):
        concurrent = ORIGINAL + "CONCURRENT_SETTING=keep-this-change\n"

        def apply_after_concurrent_edit(_prompt):
            self.env_file.write_text(concurrent)
            return "APPLY"

        self.confirm.side_effect = apply_after_concurrent_edit
        with self.assertRaisesRegex(RuntimeError, "^CONCURRENT_ENV_CHANGE$"):
            operator.main()
        self.assertEqual(self.env_file.read_text(), concurrent)
        self.assertFalse(self.backups.exists())
        self.assertEqual(self.restart_calls(), [])
        self.process_environment.assert_not_called()


class LocalHttpVerificationTests(unittest.TestCase):
    def test_login_workspace_logout_and_replay_bypass_inherited_proxies(self):
        with http_fixture() as server, http_fixture(proxy=True) as proxy:
            proxy_env = {
                key: proxy.url for key in (
                    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
                    "http_proxy", "https_proxy", "all_proxy",
                )
            }
            proxy_env.update({"NO_PROXY": "", "no_proxy": ""})
            with mock.patch.dict(os.environ, proxy_env), mock.patch.object(operator, "LOCAL", server.url):
                checks = operator.verify(PASSWORD)
            self.assertTrue(all(checks.values()))
            self.assertEqual(proxy.requests, [])
            self.assertEqual([item[0] for item in server.requests], [
                "/api/open-ena/login", "/en/open-ena",
                "/api/open-ena/logout", "/en/open-ena",
            ])
            self.assertEqual(server.requests[0][1], {
                "username": ["open-ena"], "password": [PASSWORD], "locale": ["en"],
            })
            for _, _, headers in server.requests:
                self.assertEqual(headers["Host"], "www.ena.hk")
                self.assertEqual(headers["Origin"], operator.ORIGIN)
            for _, _, headers in server.requests[1:]:
                self.assertEqual(headers["Cookie"], "open-ena-session=synthetic-cookie")
            self.assertFalse(server.authenticated)

    def test_replayed_session_must_be_rejected_after_logout(self):
        with http_fixture(retain_session=True) as server, mock.patch.object(operator, "LOCAL", server.url):
            with self.assertRaisesRegex(RuntimeError, "^SESSION_REVOCATION_FAILED$"):
                operator.verify(PASSWORD)


if __name__ == "__main__":
    unittest.main()
