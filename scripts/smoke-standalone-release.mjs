import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Run against the extracted release outside the checkout. The child receives
// no database, account, provider, or inherited application credentials.
const directory = await realpath(resolve(process.argv[2] ?? ""));
const checkout = await realpath(process.cwd());
assert(directory !== checkout && !directory.startsWith(`${checkout}${sep}`),
  "Extract the release outside the source checkout before testing it.");
await readFile(resolve(directory, "server.js"));
const expectedCommit = process.argv[3];
assert.match(expectedCommit ?? "", /^[a-f0-9]{40}$/, "Supply the expected source commit");
const release = JSON.parse(await readFile(resolve(directory, "release.json"), "utf8"));
assert.equal(release.commit, expectedCommit, "Release source commit mismatch");
assert.equal(release.platform, process.platform, "Release operating system mismatch");
assert.equal(release.arch, process.arch, "Release architecture mismatch");
assert.equal(release.node.split(".")[0], process.version.split(".")[0], "Release Node major version mismatch");
const buildId = (await readFile(resolve(directory, ".next/BUILD_ID"), "utf8")).trim();
assert(buildId.length > 0, "Release build ID is missing");
const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise((complete, reject) => socket.close((error) => error ? reject(error) : complete()));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd: directory,
  env: {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    OPEN_ENA_AI_ENABLED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
let spawnError;
server.on("error", (error) => { spawnError = error; });
server.stdout.on("data", (value) => { logs += value; });
server.stderr.on("data", (value) => { logs += value; });
const stopped = once(server, "close");
const checks = [];
const get = (path, options = {}) => fetch(`${origin}${path}`, {
  redirect: "manual", signal: AbortSignal.timeout(15000), ...options,
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnError) throw spawnError;
    assert.equal(server.exitCode, null, `Standalone server exited: ${logs}`);
    try {
      const response = await get("/en");
      ready = response.status === 200;
      await response.arrayBuffer();
      if (ready) break;
    } catch { /* Startup can briefly refuse the loopback connection. */ }
    await delay(500);
  }
  assert(ready, `Standalone server did not become ready: ${logs}`);

  let html = "";
  for (const path of ["/en", "/zh-hans", "/zh-hant", "/en/about", "/en/open-ena", "/en/plugins"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    const body = await response.text();
    assert(body.length > 1000, `${path} returned an empty page`);
    if (path === "/en") html = body;
    checks.push({ path, status: response.status, securityHeaders: true });
  }
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+(?:\?[^"#]*)?)"/g)]
    .map((match) => match[1]))];
  assert(assets.some((path) => path.includes(".js")), "No bundled JavaScript found");
  assert(assets.some((path) => path.includes(".css")), "No bundled stylesheet found");
  for (const path of [...assets, "/icon.svg", "/unified-home/logo-open-ena.svg"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert((await response.arrayBuffer()).byteLength > 0, `Empty asset: ${path}`);
    checks.push({ path, status: response.status });
  }
  const imagePath = "/_next/image?url=%2Flogos%2Fpedanova-mark-transparent.png&w=64&q=75";
  const optimizedImage = await get(imagePath, { headers: { accept: "image/webp" } });
  assert.equal(optimizedImage.status, 200, "Native image optimization must work in the extracted runtime");
  assert.equal(optimizedImage.headers.get("content-type"), "image/webp");
  assert((await optimizedImage.arrayBuffer()).byteLength > 0);
  checks.push({ path: imagePath, status: 200, nativeImageOptimization: true });
  const redirect = await get("/zh-Hant/open-ena");
  assert.equal(redirect.status, 307);
  assert.equal(new URL(redirect.headers.get("location"), origin).pathname, "/zh-hant/open-ena");
  checks.push({ path: "/zh-Hant/open-ena", status: redirect.status });

  const guarded = await get("/api/open-ena/ai-interpretation", {
    method: "POST", headers: { "content-type": "application/json", origin }, body: "{}",
  });
  assert.equal(guarded.status, 503, "AI must fail closed without runtime authentication configuration");
  assert.equal(guarded.headers.get("x-open-ena-auth-error"), "not-configured");
  assert.equal(typeof (await guarded.json()).error, "string");
  checks.push({ path: "/api/open-ena/ai-interpretation", status: 503, authError: "not-configured" });
  console.log(JSON.stringify({ passed: true, commit: release.commit, buildId,
    platform: process.platform, arch: process.arch, node: process.version, checks }, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 10000);
  timer.unref();
  await stopped;
  clearTimeout(timer);
}
