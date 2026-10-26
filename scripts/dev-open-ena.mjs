#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, stat, mkdir, writeFile, unlink, realpath, symlink } from "node:fs/promises";
import { createServer as httpServer, request } from "node:http";
import { createServer as netServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

export const LOCAL_ORIGIN = "http://127.0.0.1:3186";
const FRONT_PORT = 3186;
const BACK_PORT = 3187;
const REQUIRED = [
  "OPEN_ENA_USERNAME", "OPEN_ENA_PASSWORD", "OPEN_ENA_SESSION_SECRET",
  "OPEN_ENA_ACCOUNT_ID", "OPEN_ENA_AUTH_DATABASE_URL", "OPEN_ENA_PUBLIC_ORIGIN",
  "OPEN_ENA_ALLOWED_ORIGINS", "OPEN_ENA_TRUSTED_CLIENT_IP_HEADER",
];

export function validateLocalEnvironment(environment) {
  const missing = REQUIRED.filter(key => !environment[key]?.trim());
  if (missing.length) throw new Error(`LOCAL_CONFIG_MISSING: ${missing.join(", ")}`);
  for (const [key, minimum] of [["OPEN_ENA_PASSWORD", 12], ["OPEN_ENA_SESSION_SECRET", 32]]) {
    if (environment[key].length < minimum) throw new Error(`LOCAL_CONFIG_INVALID: ${key} (minimum ${minimum} characters)`);
  }
  let database;
  try { database = new URL(environment.OPEN_ENA_AUTH_DATABASE_URL); } catch { /* Report only the key. */ }
  if (!database || !["postgres:", "postgresql:"].includes(database.protocol)
    || database.hostname !== "127.0.0.1" || database.port !== "55435"
    || database.pathname !== "/openena_local" || database.search || database.hash) {
    throw new Error("LOCAL_CONFIG_INVALID: OPEN_ENA_AUTH_DATABASE_URL must use the dedicated loopback database (127.0.0.1:55435/openena_local)");
  }
  for (const key of ["OPEN_ENA_PUBLIC_ORIGIN", "OPEN_ENA_ALLOWED_ORIGINS"]) {
    if (environment[key] !== LOCAL_ORIGIN) throw new Error(`LOCAL_CONFIG_INVALID: ${key} must equal ${LOCAL_ORIGIN}`);
  }
  if (environment.OPEN_ENA_ADDITIONAL_ORIGINS !== undefined
    || environment.OPEN_ENA_TRUSTED_CLIENT_IP_HEADER !== "x-ena-client-ip") {
    throw new Error("LOCAL_CONFIG_INVALID: omit OPEN_ENA_ADDITIONAL_ORIGINS and use OPEN_ENA_TRUSTED_CLIENT_IP_HEADER=x-ena-client-ip");
  }
}

export async function checkLocalDatabase(environment) {
  const privileges = (table, permissions) => permissions.split(",").map(permission =>
    `has_table_privilege(current_user, to_regclass('public.${table}'), '${permission}')`).join(" AND ");
  const pool = new pg.Pool({ connectionString: environment.OPEN_ENA_AUTH_DATABASE_URL,
    connectionTimeoutMillis: 2500, query_timeout: 4000, max: 1 });
  pool.on("error", () => {});
  try {
    const { rows } = await pool.query(`SELECT
      current_database() = 'openena_local' AS local_database,
      NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AS limited_role,
      ${privileges('open_ena_auth_attempt_windows', 'SELECT,INSERT,UPDATE,DELETE')} AS attempts,
      ${privileges('open_ena_revoked_sessions', 'SELECT,INSERT,UPDATE,DELETE')} AS sessions,
      ${privileges('open_ena_disposable_accounts', 'SELECT,UPDATE')} AS disposable,
      ${privileges('open_ena_login_failure_windows', 'SELECT,INSERT,UPDATE,DELETE')} AS failures,
      has_function_privilege(current_user, to_regprocedure('public.open_ena_login_failure_guard(text,text,integer,integer,integer)'), 'EXECUTE') AS guard,
      has_function_privilege(current_user, to_regprocedure('public.open_ena_record_login_failure(text,text,integer,integer,integer)'), 'EXECUTE') AS record,
      has_function_privilege(current_user, to_regprocedure('public.open_ena_clear_login_pair(text,text)'), 'EXECUTE') AS clear,
      has_function_privilege(current_user, to_regprocedure('public.open_ena_prune_login_failure_windows(integer)'), 'EXECUTE') AS prune,
      has_function_privilege(current_user, to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)'), 'EXECUTE') AS consume,
      has_function_privilege(current_user, to_regprocedure('public.open_ena_revoke_session(text,bigint)'), 'EXECUTE') AS revoke,
      has_function_privilege(current_user, to_regprocedure('public.open_ena_session_is_revoked(text)'), 'EXECUTE') AS revocation
      FROM pg_roles WHERE rolname = current_user`);
    if (!rows[0] || !Object.values(rows[0]).every(value => value === true)) {
      throw new Error("LOCAL_DATABASE_SCHEMA_OR_PERMISSIONS_INVALID: apply local authentication migrations 002, 004, 008, 009 and application grants");
    }
  } catch (error) {
    if (error.message.startsWith("LOCAL_DATABASE_SCHEMA_OR_PERMISSIONS_INVALID:")) throw error;
    throw new Error("LOCAL_DATABASE_UNAVAILABLE: start the dedicated local PostgreSQL service; see docs/local-open-ena.md");
  } finally { await pool.end(); }
}

export async function assertPortAvailable(port) {
  const server = netServer();
  try {
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
  } catch { throw new Error(`PORT_IN_USE: 127.0.0.1:${port}; the existing process was not changed`); }
  finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
}

export function createLocalProxy({ backendPort = BACK_PORT } = {}) {
  const sockets = new Set();
  const track = socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };
  const headers = req => ({ ...req.headers,
    host: "127.0.0.1:3186",
    "x-ena-client-ip": req.socket.remoteAddress?.replace(/^::ffff:/u, "") ?? "",
    "x-forwarded-for": req.socket.remoteAddress?.replace(/^::ffff:/u, "") ?? "",
    "x-forwarded-host": "127.0.0.1:3186", "x-forwarded-proto": "http",
  });
  const upstreamRequest = req => {
    const upstream = request({ hostname: "127.0.0.1", port: backendPort, method: req.method,
      path: req.url, headers: headers(req), agent: false });
    upstream.on("socket", track);
    return upstream;
  };
  const server = httpServer((req, res) => {
    const upstream = upstreamRequest(req);
    upstream.on("response", response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
      response.on("error", () => res.destroy());
    });
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Local Open ENA is starting or unavailable. Check the local development terminal.");
    });
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });
  server.on("connection", track);
  server.on("upgrade", (req, socket, head) => {
    const upstream = upstreamRequest(req);
    upstream.on("upgrade", (response, peer, upstreamHead) => {
      track(peer);
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`
        + response.rawHeaders.reduce((lines, value, index, all) => index % 2 ? lines : `${lines}${value}: ${all[index + 1]}\r\n`, "") + "\r\n");
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) peer.write(head);
      socket.on("error", () => peer.destroy());
      peer.on("error", () => socket.destroy());
      socket.on("close", () => peer.destroy());
      peer.on("close", () => socket.destroy());
      socket.pipe(peer).pipe(socket);
    });
    upstream.on("response", response => {
      response.resume();
      socket.end(`HTTP/1.1 ${response.statusCode} Upgrade rejected\r\nConnection: close\r\n\r\n`);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    upstream.end();
  });
  server.closeAllConnections = () => { for (const socket of sockets) socket.destroy(); };
  return server;
}

function forwardRedacted(stream, output, secrets) {
  const lines = createInterface({ input: stream });
  lines.on("line", line => {
    let safe = line;
    for (const secret of secrets) if (secret) safe = safe.replaceAll(secret, "[redacted]");
    output.write(safe + "\n");
  });
}

export async function ensureLocalRuntimeDependencies(root) {
  const directory = join(root, ".next/local-dev");
  await mkdir(directory, { recursive: true });
  const expected = await realpath(join(root, "node_modules"));
  const link = join(directory, "node_modules");
  try {
    if (await realpath(link) !== expected) throw new Error("LOCAL_RUNTIME_DEPENDENCIES_MISMATCH: development output belongs to a different worktree");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await symlink(expected, link, "dir");
  }
}

export function localApplicationEnvironment(config, inherited = process.env) {
  const environment = { ...inherited };
  for (const key of Object.keys(environment)) {
    if (/^(OPEN_ENA_|ENA_PLUGIN_LAB_|DEEPSEEK_)/u.test(key)) delete environment[key];
  }
  return Object.assign(environment, Object.fromEntries(REQUIRED.map(key => [key, config[key]])), {
    NODE_ENV: "development", NEXT_DIST_DIR: ".next/local-dev", NEXT_TELEMETRY_DISABLED: "1",
    // Explicit values also win over any .env.local files loaded later by Next.
    OPEN_ENA_ADDITIONAL_ORIGINS: LOCAL_ORIGIN,
    OPEN_ENA_AI_ENABLED: "false", ENA_PLUGIN_LAB_PROPOSALS_ENABLED: "false",
    OPEN_ENA_CLOUD_PROJECTS_ENABLED: "false",
    OPEN_ENA_REGISTRATION_ENABLED: "false",
    // Several read/operator routes use store configuration without consulting
    // feature flags. Blank values prevent Next's env loader restoring those
    // services from .env.local after the launcher has checked its own profile.
    OPEN_ENA_BILLABLE_DATABASE_URL: "",
    OPEN_ENA_LONGITUDINAL_COMPUTE_URL: "", OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN: "",
    ENA_PLUGIN_LAB_DATABASE_URL: "", ENA_PLUGIN_LAB_SECRET: "",
    ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: "", ENA_PLUGIN_LAB_WORKER_TOKEN: "",
    ENA_PLUGIN_LAB_SMTP_HOST: "", ENA_PLUGIN_LAB_SMTP_PORT: "",
    ENA_PLUGIN_LAB_SMTP_USER: "", ENA_PLUGIN_LAB_SMTP_PASSWORD: "",
    DEEPSEEK_API_KEY: "", OPENROUTER_API_KEY: "", RESEND_API_KEY: "",
    OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS: "1",
  });
}

export async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const configPath = join(root, ".env.development.local");
  let config;
  try {
    const info = await stat(configPath);
    if ((info.mode & 0o777) !== 0o600) throw new Error("permissions");
    config = parseEnv(await readFile(configPath, "utf8"));
  } catch { throw new Error("LOCAL_CONFIG_FILE_REQUIRED: create .env.development.local in this worktree with permissions 0600; see docs/local-open-ena.md"); }
  validateLocalEnvironment(config);
  await assertPortAvailable(FRONT_PORT);
  await assertPortAvailable(BACK_PORT);
  await checkLocalDatabase(config);
  if (process.argv.includes("--check")) {
    console.log("PASS local configuration, dedicated database schema/permissions and available ports");
    return;
  }

  // Compiled modules resolve from their real path, including externally stored
  // caches. Anchor resolution here before an ancestor project's node_modules.
  await ensureLocalRuntimeDependencies(root);

  const environment = localApplicationEnvironment(config);
  const temporaryDirectory = join(root, ".next/local-dev/tmp");
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  environment.TMPDIR = temporaryDirectory;
  const stateDir = join(root, "output/local-open-ena");
  const statePath = join(stateDir, "runner.json");
  await mkdir(stateDir, { recursive: true });
  const proxy = createLocalProxy();
  proxy.listen(FRONT_PORT, "127.0.0.1");
  await once(proxy, "listening");
  const child = spawn("npm", ["run", "dev", "--", "--webpack", "--hostname", "127.0.0.1", "--port", String(BACK_PORT)], {
    cwd: root, env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const secrets = [config.OPEN_ENA_PASSWORD, config.OPEN_ENA_SESSION_SECRET, config.OPEN_ENA_AUTH_DATABASE_URL];
  forwardRedacted(child.stdout, process.stdout, secrets);
  forwardRedacted(child.stderr, process.stderr, secrets);
  let stopping;
  const stop = (code = 0) => stopping ??= (async () => {
    process.exitCode = code;
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
    if (child.pid) {
      const signalGroup = signal => { try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; } };
      signalGroup("SIGTERM");
      for (let attempt = 0; attempt < 30; attempt++) {
        try { process.kill(-child.pid, 0); } catch { break; }
        await delay(100);
      }
      signalGroup("SIGKILL");
    }
    const saved = JSON.parse(await readFile(statePath, "utf8").catch(() => "{}"));
    if (saved.pid === process.pid) await unlink(statePath).catch(() => {});
  })();
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  child.once("error", () => { console.error("LOCAL_APPLICATION_START_FAILED"); void stop(1); });
  child.once("exit", code => { if (!stopping) { console.error("LOCAL_APPLICATION_EXITED"); void stop(code || 1); } });
  try {
    await once(child, "spawn");
    await writeFile(statePath, JSON.stringify({ pid: process.pid, childPid: child.pid, root, origin: LOCAL_ORIGIN, startedAt: new Date().toISOString() }, null, 2) + "\n");
  } catch { await stop(1); return; }
  console.log(`Local Open ENA proxy: ${LOCAL_ORIGIN}/en/open-ena`);
  console.log("Authentication database preflight passed. Waiting for Next.js; Ctrl+C stops only this proxy and its application processes. Database data is retained.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
