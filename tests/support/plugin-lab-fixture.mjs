// Owned local acceptance fixture: a built Next app, temporary PostgreSQL, and TLS SMTP.
// No project .env files are loaded. Keys, SMTP credentials, OTPs and cookies stay in memory
// or inside the owned temporary root, which is removed only after verified shutdown.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { SMTPServer } from "smtp-server";
import { cleanupOwnedEphemeralPostgres } from "./owned-ephemeral-postgres.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reservePort = () => new Promise((accept, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(error => error ? reject(error) : accept(port));
  });
});

export async function startPluginLabFixture({ evidenceDirectory, distDirectory = ".next" } = {}) {
  const evidence = resolve(evidenceDirectory ?? join(repository, "output/plugin-lab-workflow"));
  const dist = resolve(repository, distDirectory);
  if (!existsSync(join(dist, "BUILD_ID"))) throw new Error("Build the application before starting the owned Plugin Lab fixture.");
  mkdirSync(evidence, { recursive: true });
  const prefix = "ena-plugin-browser-";
  const root = mkdtempSync(join(tmpdir(), prefix));
  const dataDirectory = join(root, "data");
  const appRoot = join(root, "application");
  const messages = [];
  const smtpStatistics = { connections: 0, authenticatedTls: 0, accepted: 0, rejected: 0 };
  let database, smtp, app, appLog, startAttempted = false, closing = null;
  let rejectMail = false;
  const cleanup = () => closing ??= (async () => {
    if (app && (app.exitCode === null && app.signalCode === null)) {
      app.kill("SIGTERM");
      await Promise.race([new Promise(r => app.once("exit", r)), delay(5_000)]);
      if ((app.exitCode === null && app.signalCode === null)) {
        app.kill("SIGKILL");
        await Promise.race([new Promise(r => app.once("exit", r)), delay(5_000)]);
      }
      if ((app.exitCode === null && app.signalCode === null)) throw new Error("Owned Next child could not be stopped; temporary root retained.");
    }
    if (smtp) await new Promise(r => smtp.close(r));
    if (database) await database.end();
    if (appLog !== undefined) closeSync(appLog);
    const result = await cleanupOwnedEphemeralPostgres({ rootDirectory: root, dataDirectory, rootPrefix: prefix, startAttempted });
    writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ status: "PASS", ...result, finishedAt: new Date().toISOString() }, null, 2));
  })();
  try {
    const [pgPort, appPort, smtpPort] = await Promise.all([reservePort(), reservePort(), reservePort()]);
    execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 30_000 });
    startAttempted = true;
    execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(root, "postgres.log"), "--options", `-h 127.0.0.1 -p ${pgPort} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 30_000 });
    database = new Pool({ host: "127.0.0.1", port: pgPort, user: "postgres", database: "postgres", max: 4, statement_timeout: 5_000 });
    await database.query("CREATE ROLE pluginfixture LOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO pluginfixture");
    for (const migration of ["002_open_ena_auth_security.sql", "005_ena_plugin_lab.sql", "011_ena_plugin_workflow.sql"]) {
      await database.query(readFileSync(join(repository, "migrations", migration), "utf8"));
    }
    await database.query(`
      GRANT SELECT,INSERT,UPDATE ON ena_plugin_proposals,ena_plugin_proposal_access_tokens,ena_plugin_proposal_rate_limits,
        ena_plugin_workflow_email_contacts,ena_plugin_workflow_challenges,ena_plugin_workflow_sessions,
        ena_plugin_workflow_rate_limits,ena_plugin_workflow_notifications TO pluginfixture;
      GRANT SELECT,INSERT ON ena_plugin_proposal_events,ena_plugin_proposal_publication_events,
        ena_plugin_workflow_verification_events,ena_plugin_workflow_messages,ena_plugin_workflow_requests TO pluginfixture;
      GRANT SELECT,DELETE ON open_ena_revoked_sessions TO pluginfixture;
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO pluginfixture;
      GRANT EXECUTE ON FUNCTION open_ena_session_is_revoked(text) TO pluginfixture
    `);
    const keyFile = join(root, "smtp-key.pem"), certFile = join(root, "smtp-cert.pem");
    const opensslConfig = join(root, "smtp-certificate.cnf");
    writeFileSync(opensslConfig, "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n", { mode: 0o600 });
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1", "-keyout", keyFile, "-out", certFile, "-config", opensslConfig], { stdio: "pipe", timeout: 30_000 });
    const smtpPassword = randomBytes(32).toString("base64url");
    smtp = new SMTPServer({
      secure: false, name: "localhost", key: readFileSync(keyFile), cert: readFileSync(certFile),
      authOptional: false, allowInsecureAuth: false, disabledCommands: ["XCLIENT"], logger: false,
      onConnect(_session, callback) { smtpStatistics.connections++; callback(); },
      onAuth(auth, session, callback) {
        if (!session.secure || auth.username !== "plugin-fixture" || auth.password !== smtpPassword) return callback(new Error("Synthetic authentication failed."));
        smtpStatistics.authenticatedTls++; callback(null, { user: "plugin-fixture" });
      },
      onRcptTo(address, _session, callback) {
        if (!/@example\.(?:org|net|com)$/u.test(address.address)) return callback(new Error("Synthetic recipients only."));
        callback();
      },
      onData(stream, session, callback) {
        const chunks = []; let size = 0;
        stream.on("data", chunk => { size += chunk.length; if (size <= 128_000) chunks.push(chunk); });
        stream.on("end", () => {
          if (rejectMail || size > 128_000) { smtpStatistics.rejected++; const error = new Error("Synthetic mail delivery unavailable."); error.responseCode = 451; callback(error); return; }
          smtpStatistics.accepted++;
          messages.push({ recipients: session.envelope.rcptTo.map(item => item.address), raw: Buffer.concat(chunks).toString("utf8"), secure: session.secure, receivedAt: Date.now() });
          callback();
        });
        stream.on("error", callback);
      },
    });
    smtp.on("error", () => { /* The caller observes SMTP failure through the application contract. */ });
    await new Promise((accept, reject) => { smtp.once("error", reject); smtp.listen(smtpPort, "127.0.0.1", accept); });
    // Playwright shares Secure cookies with its API context on localhost, while Chromium also supports loopback IPs.
    const origin = `http://localhost:${appPort}`;
    const environment = {
      PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      LANG: "en_US.UTF-8", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      OPEN_ENA_USERNAME: "synthetic-plugin-operator", OPEN_ENA_PASSWORD: randomBytes(32).toString("base64url"),
      OPEN_ENA_ACCOUNT_ID: "synthetic-plugin-fixture-owner", OPEN_ENA_SESSION_SECRET: randomBytes(32).toString("base64url"),
      OPEN_ENA_AUTH_DATABASE_URL: `postgresql://pluginfixture@127.0.0.1:${pgPort}/postgres`,
      OPEN_ENA_PUBLIC_ORIGIN: origin, OPEN_ENA_AI_ENABLED: "false",
      ENA_PLUGIN_LAB_DATABASE_URL: `postgresql://pluginfixture@127.0.0.1:${pgPort}/postgres`,
      ENA_PLUGIN_LAB_SECRET: randomBytes(32).toString("base64url"), ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: randomBytes(32).toString("base64url"),
      ENA_PLUGIN_LAB_PROPOSALS_ENABLED: "true", ENA_PLUGIN_LAB_SMTP_HOST: "localhost", ENA_PLUGIN_LAB_SMTP_PORT: String(smtpPort),
      ENA_PLUGIN_LAB_SMTP_USER: "plugin-fixture", ENA_PLUGIN_LAB_SMTP_PASSWORD: smtpPassword,
      ENA_PLUGIN_LAB_MAIL_FROM: "plugins@example.org", ENA_PLUGIN_LAB_OPERATOR_EMAIL: "operator@example.org",
      ENA_PLUGIN_LAB_WORKER_TOKEN: randomBytes(32).toString("base64url"), NODE_EXTRA_CA_CERTS: certFile,
    };
    mkdirSync(appRoot);
    symlinkSync(dist, join(appRoot, ".next"), "dir");
    symlinkSync(join(repository, "public"), join(appRoot, "public"), "dir");
    symlinkSync(join(repository, "node_modules"), join(appRoot, "node_modules"), "dir");
    writeFileSync(join(appRoot, "package.json"), '{"name":"owned-plugin-lab-fixture","private":true,"type":"module"}');
    writeFileSync(join(appRoot, "next.config.mjs"), 'export default { distDir: ".next", poweredByHeader: false };\n');
    appLog = openSync(join(evidence, "next-server.log"), "w", 0o600);
    app = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "start", appRoot, "--hostname", "127.0.0.1", "--port", String(appPort)], {
      cwd: appRoot, env: environment, stdio: ["ignore", appLog, appLog],
    });
    let ready = false;
    for (let index = 0; index < 100; index++) {
      if ((app.exitCode !== null || app.signalCode !== null)) throw new Error("Owned Next process exited before readiness; inspect next-server.log.");
      try { ready = (await fetch(`${origin}/en/plugins/propose`, { signal: AbortSignal.timeout(2_000) })).status === 200; } catch { /* Await owned process startup. */ }
      if (ready) break;
      await delay(250);
    }
    if (!ready) throw new Error("Owned Next application did not become ready.");
    writeFileSync(join(evidence, "fixture.json"), JSON.stringify({ syntheticOnly: true, builtApplication: true, separateApplicationRoot: true, repositoryEnvLoaded: false, database: "owned ephemeral PostgreSQL / nonsuperuser application role", smtp: "owned loopback STARTTLS with authentication and a verified ephemeral CA", origin, buildId: readFileSync(join(dist, "BUILD_ID"), "utf8").trim(), startedAt: new Date().toISOString() }, null, 2));
    return { origin, evidence, database, environment, messages, smtpStatistics, cleanup, rejectMail(value) { rejectMail = value; } };
  } catch (error) { await cleanup(); throw error; }
}

export function mailText(message) {
  const split = message.raw.indexOf("\r\n\r\n");
  const headers = message.raw.slice(0, split);
  const body = message.raw.slice(split + 4);
  if (/Content-Transfer-Encoding: base64/iu.test(headers)) return Buffer.from(body.replace(/\s/gu, ""), "base64").toString("utf8");
  if (/Content-Transfer-Encoding: quoted-printable/iu.test(headers)) {
    const joined = body.replace(/=\r?\n/gu, "");
    const bytes = [];
    for (let index = 0; index < joined.length; index++) {
      if (joined[index] === "=" && /^[A-Fa-f\d]{2}$/u.test(joined.slice(index + 1, index + 3))) { bytes.push(parseInt(joined.slice(index + 1, index + 3), 16)); index += 2; }
      else bytes.push(...Buffer.from(joined[index]));
    }
    return Buffer.from(bytes).toString("utf8");
  }
  return body;
}
