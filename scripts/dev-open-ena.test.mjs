import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, symlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  validateLocalEnvironment,
  checkLocalDatabase,
  assertPortAvailable,
  createLocalProxy,
  ensureLocalRuntimeDependencies,
  localApplicationEnvironment,
} from "./dev-open-ena.mjs";

const config = () => ({
  OPEN_ENA_USERNAME: "local-researcher",
  OPEN_ENA_PASSWORD: "synthetic-local-password",
  OPEN_ENA_SESSION_SECRET: "synthetic-local-session-secret-0123456789",
  OPEN_ENA_ACCOUNT_ID: "local-test-account",
  OPEN_ENA_AUTH_DATABASE_URL: "postgresql://local_app:synthetic-db-password@127.0.0.1:55435/openena_local",
  OPEN_ENA_PUBLIC_ORIGIN: "http://127.0.0.1:3186",
  OPEN_ENA_ALLOWED_ORIGINS: "http://127.0.0.1:3186",
  OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-ena-client-ip",
});

test("external development output resolves packages from its own worktree", async () => {
  const base = await mkdtemp(join(tmpdir(), "ena-local-resolution-"));
  const root = join(base, "project");
  const external = join(base, "external", "cache");
  try {
    for (const folder of [join(root,"node_modules/fixture"),join(base,"external/node_modules/fixture"),join(root,".next"),join(external,"dev/server")]) await mkdir(folder,{recursive:true});
    await writeFile(join(root,"node_modules/fixture/package.json"),'{"name":"fixture","main":"index.js"}');
    await writeFile(join(root,"node_modules/fixture/index.js"),'module.exports="correct-worktree";');
    await writeFile(join(base,"external/node_modules/fixture/package.json"),'{"name":"fixture","main":"index.js"}');
    await writeFile(join(base,"external/node_modules/fixture/index.js"),'module.exports="wrong-neighbor";');
    await symlink(external,join(root,".next/local-dev"),"dir");
    await ensureLocalRuntimeDependencies(root);
    const requireFromOutput = createRequire(join(await realpath(external),"dev/server/probe.cjs"));
    assert.equal(requireFromOutput("fixture"),"correct-worktree");
    await ensureLocalRuntimeDependencies(root);
  } finally { await rm(base,{recursive:true,force:true}); }
});

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function close(server) {
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

test("missing authentication configuration names the keys without disclosing values", () => {
  const env = config();
  delete env.OPEN_ENA_ACCOUNT_ID;
  assert.throws(() => validateLocalEnvironment(env), error => {
    assert.match(error.message, /OPEN_ENA_ACCOUNT_ID/);
    assert.doesNotMatch(error.message, /synthetic-local-password|synthetic-db-password/);
    return true;
  });
});

test("Next env loading cannot restore cloud features, external services or production aliases", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ena-local-env-"));
  try {
    await writeFile(join(directory, ".env.local"), [
      "OPEN_ENA_ADDITIONAL_ORIGINS=https://production.example",
      "OPEN_ENA_CLOUD_PROJECTS_ENABLED=true",
      "OPEN_ENA_AI_ENABLED=true",
      "ENA_PLUGIN_LAB_PROPOSALS_ENABLED=true",
      "ENA_PLUGIN_LAB_DATABASE_URL=postgresql://remote.invalid/plugins",
      "ENA_PLUGIN_LAB_SECRET=synthetic-external-secret",
      "ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1=synthetic-external-key",
      "OPEN_ENA_BILLABLE_DATABASE_URL=postgresql://remote.invalid/billing",
      "OPEN_ENA_LONGITUDINAL_COMPUTE_URL=https://remote.invalid/compute",
      "OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN=synthetic-compute-token",
      "DEEPSEEK_API_KEY=synthetic-provider-key",
      "RESEND_API_KEY=synthetic-email-key",
    ].join("\n"));
    const require = createRequire(import.meta.url);
    const envLoader = require.resolve("@next/env");
    const blocked = ["ENA_PLUGIN_LAB_DATABASE_URL", "ENA_PLUGIN_LAB_SECRET", "ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1", "OPEN_ENA_BILLABLE_DATABASE_URL", "OPEN_ENA_LONGITUDINAL_COMPUTE_URL", "OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN", "DEEPSEEK_API_KEY", "RESEND_API_KEY"];
    const script = `require(${JSON.stringify(envLoader)}).loadEnvConfig(process.argv[1],true,{info(){},error(){}}); console.log(JSON.stringify({origins:process.env.OPEN_ENA_ADDITIONAL_ORIGINS,cloud:process.env.OPEN_ENA_CLOUD_PROJECTS_ENABLED,ai:process.env.OPEN_ENA_AI_ENABLED,plugins:process.env.ENA_PLUGIN_LAB_PROPOSALS_ENABLED,externalServicesBlank:${JSON.stringify(blocked)}.every(key => process.env[key] === '')}))`;
    const environment = localApplicationEnvironment(config(), {
      ...process.env, OPEN_ENA_ADDITIONAL_ORIGINS: "https://inherited.example",
      OPEN_ENA_CLOUD_PROJECTS_ENABLED: "true", OPEN_ENA_AI_ENABLED: "true",
    });
    delete environment.__NEXT_PROCESSED_ENV;
    const result = JSON.parse(execFileSync(process.execPath, ["-e", script, directory], { env: environment, encoding: "utf8" }));
    assert.deepEqual(result, { origins: "http://127.0.0.1:3186", cloud: "false", ai: "false", plugins: "false", externalServicesBlank: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("local startup refuses production databases, origin aliases and invalid secrets", () => {
  assert.doesNotThrow(() => validateLocalEnvironment(config()));
  for (const overrides of [
    { OPEN_ENA_AUTH_DATABASE_URL: "postgresql://user:secret@remote.example/openena" },
    { OPEN_ENA_AUTH_DATABASE_URL: config().OPEN_ENA_AUTH_DATABASE_URL + "?host=remote.example" },
    { OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk" },
    { OPEN_ENA_ALLOWED_ORIGINS: "http://127.0.0.1:3186,https://www.ena.hk" },
    { OPEN_ENA_ADDITIONAL_ORIGINS: "https://www.open-ena.com" },
    { OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for" },
    { OPEN_ENA_PASSWORD: "short" },
    { OPEN_ENA_SESSION_SECRET: "short" },
  ]) assert.throws(() => validateLocalEnvironment({ ...config(), ...overrides }));
});

test("occupied ports fail without stopping or replacing the other listener", async () => {
  const other = createServer((req, res) => res.end("keep me"));
  const port = await listen(other);
  try {
    await assert.rejects(assertPortAvailable(port), /PORT_IN_USE/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "keep me");
  } finally { await close(other); }
});

test("a stopped database produces a bounded, redacted connectivity error", async () => {
  const vacant = createServer();
  const port = await listen(vacant);
  await close(vacant);
  await assert.rejects(checkLocalDatabase({
    ...config(),
    OPEN_ENA_AUTH_DATABASE_URL: `postgresql://local_app:do-not-log-this@127.0.0.1:${port}/openena_local`,
  }), error => {
    assert.match(error.message, /LOCAL_DATABASE_UNAVAILABLE/);
    assert.doesNotMatch(error.message, /do-not-log-this|postgresql:\/\//);
    return true;
  });
});

test("HTTP proxy overwrites spoofed client attribution and preserves form bodies and cookies", async () => {
  const backend = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("set-cookie", "synthetic=session; HttpOnly; SameSite=Lax; Path=/");
    res.end(JSON.stringify({ headers: req.headers, body }));
  });
  const backendPort = await listen(backend);
  const proxy = createLocalProxy({ backendPort });
  const port = await listen(proxy);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/open-ena/login`, {
      method: "POST",
      headers: { "x-ena-client-ip": "203.0.113.99", "x-forwarded-for": "203.0.113.99", origin: "http://127.0.0.1:3186", "content-type": "application/x-www-form-urlencoded" },
      body: "username=test&password=synthetic",
    });
    const result = await response.json();
    assert.equal(result.headers["x-ena-client-ip"], "127.0.0.1");
    assert.equal(result.headers["x-forwarded-for"], "127.0.0.1");
    assert.equal(result.headers.origin, "http://127.0.0.1:3186");
    assert.equal(result.body, "username=test&password=synthetic");
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  } finally { await close(proxy); await close(backend); }
});

test("WebSocket upgrade forwards bidirectional traffic with trusted source attribution", async () => {
  const backend = createServer();
  backend.on("upgrade", (req, socket, head) => {
    assert.equal(req.headers["x-ena-client-ip"], "127.0.0.1");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
    if (head.length) socket.write(head);
    socket.pipe(socket);
  });
  const backendPort = await listen(backend);
  const proxy = createLocalProxy({ backendPort });
  const port = await listen(proxy);
  let downstream;
  try {
    const req = request({ host: "127.0.0.1", port, path: "/_next/webpack-hmr", headers: { connection: "Upgrade", upgrade: "websocket", "x-ena-client-ip": "203.0.113.99" } });
    const upgraded = once(req, "upgrade");
    req.end();
    const [, socket] = await upgraded;
    downstream = socket;
    const echoed = once(socket, "data");
    socket.write("hmr-ping");
    assert.equal((await echoed)[0].toString(), "hmr-ping");
  } finally { downstream?.destroy(); await close(proxy); await close(backend); }
});

test("a stopped application returns a non-sensitive 502 through the proxy", async () => {
  const vacant = createServer();
  const backendPort = await listen(vacant);
  await close(vacant);
  const proxy = createLocalProxy({ backendPort });
  const port = await listen(proxy);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 502);
    assert.match(await response.text(), /Local Open ENA is starting or unavailable/);
  } finally { await close(proxy); }
});
