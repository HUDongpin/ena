// Owned local Next.js/PostgreSQL fixture for HTTP and browser acceptance.
// Start after npm run build. Send "stop" on stdin or SIGTERM to clean it up.
import { execFileSync, spawn } from "node:child_process";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync, openSync, closeSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { cleanupOwnedEphemeralPostgres } from "./owned-ephemeral-postgres.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceArgument = process.argv.indexOf("--evidence-dir");
const evidence = resolve(evidenceArgument >= 0 ? process.argv[evidenceArgument + 1] : join(repository, "output/cloud-projects-20261024"));
mkdirSync(evidence, { recursive: true });
const prefix = "ena-cloud-browser-", root = mkdtempSync(join(tmpdir(), prefix)), dataDirectory = join(root, "data");
const mailFile = join(root, "mail.jsonl"), logFile = join(evidence, "local-server.log");
writeFileSync(mailFile, "", { mode: 0o600 });
const reservePort = () => new Promise((resolvePort, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close((error) => error ? reject(error) : resolvePort(port)); });
});
let database, app, proxy, started = false, stopping = false, appLog;
const cleanup = async (requestedExitCode = 0) => {
  if (stopping) return; stopping = true;
  const exitCode = typeof requestedExitCode === "number" ? requestedExitCode : 0;
  try {
    if (proxy) { proxy.closeAllConnections(); await new Promise((r) => proxy.close(r)); }
    if (app && app.exitCode === null) {
      app.kill("SIGTERM");
      await Promise.race([new Promise((r) => app.once("exit", r)), new Promise((r) => setTimeout(r, 5000))]);
      if (app.exitCode === null) app.kill("SIGKILL");
    }
    if (database) await database.end();
    if (appLog !== undefined) closeSync(appLog);
    const result = await cleanupOwnedEphemeralPostgres({ rootDirectory: root, dataDirectory, rootPrefix: prefix, startAttempted: started });
    writeFileSync(join(evidence, "local-cleanup.json"), JSON.stringify({ status: "PASS", ...result, finishedAt: new Date().toISOString() }, null, 2));
    process.exit(exitCode);
  } catch (error) { console.error("Owned fixture cleanup failed:", error?.name); process.exit(1); }
};
process.on("SIGTERM", cleanup); process.on("SIGINT", cleanup);
process.stdin.setEncoding("utf8"); process.stdin.on("data", (text) => { if (text.trim() === "stop") void cleanup(); });

try {
  execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 30_000 });
  const pgPort = await reservePort(), appPort = await reservePort(), port = await reservePort();
  started = true;
  execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(root, "postgres.log"), "--options", `-h 127.0.0.1 -p ${pgPort} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 30_000 });
  database = new Pool({ host: "127.0.0.1", port: pgPort, user: "postgres", database: "postgres", max: 3 });
  await database.query("CREATE ROLE openena LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO openena");
  for (const name of ["001_open_ena_billable.sql", "002_open_ena_auth_security.sql", "003_open_ena_ai_consent.sql",
    "004_open_ena_disposable_accounts.sql", "005_ena_plugin_lab.sql", "006_open_ena_billable_leases.sql", "007_open_ena_ai_consent_idempotency.sql",
    "008_open_ena_disposable_expiry_after_lock.sql", "009_open_ena_login_failure_windows.sql", "010_open_ena_registered_projects.sql"]) {
    await database.query(readFileSync(join(repository, "migrations", name), "utf8"));
  }
  await database.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON open_ena_auth_attempt_windows,open_ena_revoked_sessions,open_ena_disposable_accounts,open_ena_login_failure_windows TO openena;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO openena`);
  const originA = `http://ena-cloud.localhost:${port}`, originB = `http://open-ena-cloud.localhost:${port}`;
  appLog = openSync(logFile, "w", 0o600);
  const environment = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: "en_US.UTF-8", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    OPEN_ENA_USERNAME: "synthetic-legacy-owner", OPEN_ENA_PASSWORD: "synthetic legacy password 20261024",
    OPEN_ENA_SESSION_SECRET: randomBytes(32).toString("hex"), OPEN_ENA_ACCOUNT_ID: "synthetic-cloud-fixture-owner",
    OPEN_ENA_AUTH_DATABASE_URL: `postgresql://openena@127.0.0.1:${pgPort}/postgres`,
    OPEN_ENA_PUBLIC_ORIGIN: originA, OPEN_ENA_ADDITIONAL_ORIGINS: `${originB},https://www.ena.hk,https://www.open-ena.com`,
    OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-ena-client-ip", OPEN_ENA_CLOUD_PROJECTS_ENABLED: "true", OPEN_ENA_REGISTRATION_ENABLED: "true",
    OPEN_ENA_PROJECT_ENCRYPTION_KEY: randomBytes(32).toString("hex"), OPEN_ENA_AI_ENABLED: "false",
    RESEND_API_KEY: "re_synthetic_cloud_fixture_only_20261024", OPEN_ENA_ACCOUNT_MAIL_FROM: "Open ENA <accounts@mail.open-ena.com>",
    OPEN_ENA_TEST_MAIL_FILE: mailFile, NODE_OPTIONS: `--import=${join(repository, "tests/support/open-ena-cloud-mail-recorder.mjs")}`,
  };
  app = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: repository, env: environment, stdio: ["ignore", appLog, appLog],
  });
  let ready = false;
  for (let count = 0; count < 80; count++) {
    if (app.exitCode !== null) throw new Error("Next application exited before readiness.");
    try { ready = (await fetch(`http://127.0.0.1:${appPort}/en/open-ena`, { signal: AbortSignal.timeout(2000) })).status === 200; }
    catch { /* The owned child is still starting. */ }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error("Next application readiness failed.");
  proxy = createHttpServer((incoming, outgoing) => {
    const upstream = httpRequest({ hostname: "127.0.0.1", port: appPort, path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, "x-ena-client-ip": incoming.socket.remoteAddress ?? "127.0.0.1" } }, (response) => {
      outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
    });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(503); outgoing.end("Owned fixture unavailable"); });
    incoming.pipe(upstream);
  });
  await new Promise((resolveListen, reject) => { proxy.once("error", reject); proxy.listen(port, "127.0.0.1", resolveListen); });
  const info = { fixture: "synthetic-only", originA, originB, port, appPort, pgPort, mailFile, logFile, rootDirectory: root, pid: process.pid, appPid: app.pid };
  writeFileSync(join(evidence, "local-fixture.json"), JSON.stringify(info, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: "READY", originA, originB, fixtureFile: join(evidence, "local-fixture.json"), realEmailSending: false }));
} catch (error) {
  console.error("Owned cloud fixture failed:", error?.message);
  await cleanup(1);
}
