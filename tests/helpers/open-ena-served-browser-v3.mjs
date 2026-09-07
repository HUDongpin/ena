// Shared owned production runtime for affected browser regressions. Never accepts an external server.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { OwnedSmokeLifecycle } from "./open-ena-models-v3-lifecycle.mjs";
const require = createRequire(import.meta.url);
const hash = value => createHash("sha256").update(value).digest("hex");
export function literalGit(root, args) {
  const pointer = statSync(join(root, ".git")).isDirectory() ? join(root, ".git") : readFileSync(join(root, ".git"), "utf8").trim().replace(/^gitdir: /u, "");
  return execFileSync("git", ["--no-optional-locks", `--git-dir=${resolve(root, pointer)}`, `--work-tree=${root}`, "-c", `core.worktree=${root}`, "-c", "core.fsmonitor=false", ...args], { cwd: root, encoding: "utf8", timeout: 10000 }).trim();
}
function sourceManifest(root) {
  const stages = new Map(literalGit(root, ["ls-files", "--stage", "-z"]).split("\0").filter(Boolean).map(entry => { const [metadata, path] = entry.split("\t"); return [path, metadata]; }));
  return [...new Set(literalGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0"))].filter(Boolean).sort().map(path => {
    const stage = stages.get(path) ?? "";
    if (stage.startsWith("160000 ")) return { path, mode: "160000", gitlinkOid: stage.split(" ")[1] };
    assert.ok(statSync(join(root, path)).isFile());
    return { path, mode: (statSync(join(root, path)).mode & 0o777).toString(8), sha256: hash(readFileSync(join(root, path))) };
  });
}
function treeManifest(path, prefix = "") {
  return readdirSync(path).sort().flatMap(name => { const relative = join(prefix, name); const full = join(path, name); return statSync(full).isDirectory() ? treeManifest(full, relative) : [{ path: relative, sha256: hash(readFileSync(full)) }]; });
}
async function port() {
  return new Promise((yes, no) => { const server = createServer(); server.once("error", no); server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(error => error ? no(error) : yes(value)); }); });
}
/** Cleanup uses its own bounded wait even when the run lifecycle is aborted. */
export async function settleAssetReadsBoundedV3(reads, timeoutMs = 5000) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000);
  let settled = 0, timer;
  const startedAt = new Date().toISOString();
  const pendingReads = reads.map(read => Promise.resolve(read).then(() => { settled++; }, () => { settled++; }));
  try {
    const timedOut = await Promise.race([Promise.all(pendingReads).then(() => false), new Promise(resolve => { timer = setTimeout(() => resolve(true), timeoutMs); })]);
    return { startedAt, finishedAt: new Date().toISOString(), total: reads.length, settled, pending: reads.length - settled, timedOut };
  } finally { clearTimeout(timer); }
}
export async function createServedBrowserV3({ root, directory, credentials, redact, serverLogPath, disableBrowserCache = false }) {
  mkdirSync(directory, { recursive: true });
  const safe = value => redact(value).replace(/ws:\/\/[^\s]+\/devtools\/browser\/[^\s]+/g, "[redacted browser endpoint]").replace(/postgresql:\/\/[^\s]+/g, "[redacted database endpoint]");
  const json = (name, value) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n");
  const receipt = { status: "running", sourceGitSha: literalGit(root, ["rev-parse", "HEAD"]), sourceParentSha: literalGit(root, ["rev-parse", "HEAD^"]), harnessPid: process.pid, node: process.version, servedAssets: [], stages: [], consoleErrors: [], consoleWarnings: [], pageErrors: [] };
  const lifecycle = new OwnedSmokeLifecycle({ directory, redact: safe, overallMs: 1800000, onUpdate: state => { receipt.lifecycle = state; if (state.reason) { receipt.status = "fail"; receipt.failure = state.reason.message; } json("receipt.json", receipt); } });
  let browser, page, databaseEntry, browserEntry, serverEntry, closing;
  const database = join(directory, "postgres"), profile = join(directory, "browser-profile");
  const env = { ...process.env, NEXT_DIST_DIR: ".next", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", OPEN_ENA_USERNAME: credentials.username, OPEN_ENA_PASSWORD: credentials.password, OPEN_ENA_SESSION_SECRET: credentials.secret, OPEN_ENA_ACCOUNT_ID: credentials.account ?? "task38-local-account", OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS: "1", npm_config_cache: join(directory, "npm-cache") };
  const child = (label, command, args, timeout = 60000) => lifecycle.command(label, command, args, { cwd: root, env, logName: `${label}.log` }, timeout);
  const assetReads = [];
  receipt.assetReadState = { scheduled: 0, settled: 0, inFlight: 0, drains: [] };
  const drainAssetReads = async (label = "static assets before navigation") => lifecycle.stage(label, async () => {
    const drain = { label, startedAt: new Date().toISOString(), scheduledBefore: receipt.assetReadState.scheduled, settledBefore: receipt.assetReadState.settled, inFlightBefore: receipt.assetReadState.inFlight, status: "running" };
    receipt.assetReadState.drains.push(drain); json("receipt.json", receipt);
    try {
      let observed = -1;
      while (observed !== assetReads.length) {
        lifecycle.signal.throwIfAborted(); observed = assetReads.length;
        await Promise.allSettled(assetReads.slice(0, observed));
      }
      lifecycle.signal.throwIfAborted();
      if (receipt.servedAssets.some(asset => asset.error || asset.status !== 200)) throw new Error("Required static asset response failed before navigation; inspect assetReadState and servedAssets");
      drain.status = "pass";
    } catch (error) { drain.status = "fail"; throw error; }
    finally { Object.assign(drain, { settledAt: new Date().toISOString(), scheduledAfter: receipt.assetReadState.scheduled, settledAfter: receipt.assetReadState.settled, inFlightAfter: receipt.assetReadState.inFlight }); json("receipt.json", receipt); }
  }, 30000);
  const close = (failure) => closing ??= (async () => {
    if (failure) { receipt.failure = safe(failure.stack ?? failure); lifecycle.cancel(receipt.failure); }
    receipt.assetReadState.cleanupSettlement = await settleAssetReadsBoundedV3(assetReads);
    receipt.cleanup = await lifecycle.cleanup();
    if (receipt.assetReadState.cleanupSettlement.timedOut) receipt.cleanup.errors.push({ name: "static asset read settlement", message: `Timed out with ${receipt.assetReadState.cleanupSettlement.pending} required asset reads pending; owned process cleanup still ran` });
    for (const [name, path, entry] of [["postgres", database, databaseEntry], ["browser profile", profile, browserEntry]]) {
      if (!entry || entry.released) rmSync(path, { recursive: true, force: true });
      else receipt.cleanup.errors.push({ name, message: "owned process not stopped; resource preserved" });
    }
    receipt.lifecycle = lifecycle.snapshot();
    try {
      assert.equal(literalGit(root, ["rev-parse", "HEAD"]), receipt.sourceGitSha, "Git HEAD changed during browser gate");
      assert.deepEqual(sourceManifest(root), receipt.source, "source changed during browser gate");
      if (receipt.servedAssets.some(asset => asset.error || asset.status !== 200)) throw new Error("A served static asset response could not be verified");
    } catch (error) { receipt.cleanup.errors.push({ name: "source and served asset custody", message: safe(error.message) }); }
    if (serverLogPath && serverEntry) writeFileSync(serverLogPath, safe(serverEntry.output));
    receipt.status = failure || lifecycle.reason || receipt.cleanup.errors.length ? "fail" : "pass";
    json("receipt.json", receipt); lifecycle.dispose();
    if (receipt.cleanup.errors.length) throw new Error("Owned regression runtime cleanup failed; inspect custody receipt");
  })();
  const waitHttp = (url, label) => lifecycle.stage(label, async () => {
    while (true) {
      lifecycle.signal.throwIfAborted();
      try { const response = await fetch(url, { redirect: "manual", signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(3000)]) }); await response.body?.cancel(); if (response.status < 500) return; } catch { lifecycle.signal.throwIfAborted(); }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, 90000);
  try {
    receipt.source = sourceManifest(root); json("source-before.json", receipt.source); receipt.sourceContentSha256 = hash(JSON.stringify(receipt.source));
    await child("npm-version", "npm", ["--version"]); receipt.npm = readFileSync(join(directory, "npm-version.log"), "utf8").trim();
    await child("npm-path", "which", ["npm"]); receipt.npmPath = readFileSync(join(directory, "npm-path.log"), "utf8").trim();
    receipt.build = await child("build", "npm", ["run", "build"], 600000);
    assert.deepEqual(sourceManifest(root), receipt.source, "source changed during owned production build");
    const files = treeManifest(join(root, ".next")).filter(x => !x.path.startsWith("cache/") && !x.path.startsWith("diagnostics/") && !["trace", "trace-build"].includes(x.path));
    json("build-files.json", files); receipt.build.contentSha256 = hash(JSON.stringify(files)); receipt.build.buildId = readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim();
    await child("initdb", "initdb", ["--pgdata", database, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"]);
    const databasePort = await port();
    databaseEntry = lifecycle.spawnOwned("postgres", "postgres", ["-D", database, "-h", "127.0.0.1", "-p", String(databasePort), "-c", "unix_socket_directories="], { cwd: root, env });
    receipt.database = { port: databasePort, directory: database, pid: databaseEntry.child.pid };
    await lifecycle.stage("postgres readiness", async () => {
      for (let attempt = 0; ; attempt++) {
        try { await child(`postgres-ready-${attempt}`, "pg_isready", ["--host", "127.0.0.1", "--port", String(databasePort), "--username", "postgres"], 5000); break; }
        catch (error) { lifecycle.signal.throwIfAborted(); if (databaseEntry.child.exitCode !== null) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
      }
    }, 60000);
    await child("auth-migration", "psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--host", "127.0.0.1", "--port", String(databasePort), "--username", "postgres", "--dbname", "postgres", "--file", join(root, "migrations/002_open_ena_auth_security.sql")]);
    const serverPort = await port(), baseUrl = `http://127.0.0.1:${serverPort}`;
    serverEntry = lifecycle.spawnOwned("server", process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(serverPort)], { cwd: root, env: { ...env, OPEN_ENA_AUTH_DATABASE_URL: `postgresql://postgres@127.0.0.1:${databasePort}/postgres`, OPEN_ENA_PUBLIC_ORIGIN: baseUrl, OPEN_ENA_ALLOWED_ORIGINS: baseUrl } });
    receipt.server = { port: serverPort, baseUrl, pid: serverEntry.child.pid };
    await waitHttp(`${baseUrl}/en/open-ena`, "server readiness");
    const { chromium } = await import("playwright");
    const metadata = JSON.parse(readFileSync(join(dirname(require.resolve("playwright-core/package.json")), "browsers.json"), "utf8")).browsers.find(x => x.name === "chromium");
    assert.equal(require("playwright/package.json").version, "1.62.1"); assert.equal(metadata.revision, "1234");
    const browserPort = await port();
    const args = ["--headless", "--hide-scrollbars", "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--disable-breakpad", "--disable-crash-reporter", "--password-store=basic", "--use-mock-keychain", "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`];
    browserEntry = lifecycle.spawnOwned("browser", chromium.executablePath(), args, { cwd: root, env });
    receipt.browser = { port: browserPort, pid: browserEntry.child.pid, executablePath: chromium.executablePath(), args, revision: metadata.revision, packageVersion: "1.62.1" };
    lifecycle.addCleanup("browser connection", () => browser?.close());
    await waitHttp(`http://127.0.0.1:${browserPort}/json/version`, "browser readiness");
    browser = await lifecycle.stage("connect browser", () => chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`, { timeout: 30000 }), 30000);
    receipt.browser.version = browser.version(); assert.equal(browser.version(), metadata.browserVersion);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__openEnaNativeAudit = { requests: [], responses: [] };
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); this.addEventListener("message", event => { if (event.data?.kind === "result-v3") window.__openEnaNativeAudit.responses.push(structuredClone(event.data)); }); }
        postMessage(message, ...args) { if (message?.kind === "run-open-ena-plan-v3") window.__openEnaNativeAudit.requests.push(structuredClone(message)); return super.postMessage(message, ...args); }
      };
    });
    const observedPages = new WeakSet();
    let observedPageCount = 0;
    receipt.assetNavigations = [];
    const observePage = page => {
      if (observedPages.has(page)) return;
      observedPages.add(page);
      const pageId = ++observedPageCount;
      let navigationSequence = 0;
      const assetRequests = new WeakMap();
      page.on("framenavigated", frame => { if (frame === page.mainFrame()) receipt.assetNavigations.push({ pageId, navigationSequence: ++navigationSequence, url: safe(frame.url()), at: new Date().toISOString() }); });
      page.on("request", request => {
        if (!new URL(request.url()).pathname.startsWith("/_next/static/")) return;
        assetRequests.set(request, { pageId, navigationSequence, requestedAt: new Date().toISOString(), url: safe(request.url()), resourceType: request.resourceType(), frameUrl: safe(request.frame().url()), pageUrl: safe(page.url()) });
      });
      page.on("requestfinished", request => { const entry = assetRequests.get(request); if (entry) entry.requestFinishedAt = new Date().toISOString(); });
      page.on("requestfailed", request => { const entry = assetRequests.get(request); if (entry) { entry.requestFailedAt = new Date().toISOString(); entry.requestFailure = safe(request.failure()?.errorText ?? "unknown"); } });
      page.on("console", message => { if (message.type() === "error") receipt.consoleErrors.push(safe(message.text())); if (message.type() === "warning") receipt.consoleWarnings.push(safe(message.text())); });
      page.on("pageerror", error => receipt.pageErrors.push(safe(error.message)));
      page.on("response", response => {
        const path = new URL(response.url()).pathname;
        if (path.startsWith("/_next/static/")) {
          const sequence = ++receipt.assetReadState.scheduled;
          receipt.assetReadState.inFlight++;
          const scheduledAt = new Date().toISOString();
          const request = assetRequests.get(response.request()) ?? { pageId };
          const responseStatus = response.status();
          Object.assign(request, { responseAt: scheduledAt, responseFrameUrl: safe(response.frame().url()), responsePageUrl: safe(page.url()) });
          assetReads.push(response.body().then(bytes => {
            const entry = { path, sequence, request, scheduledAt, settledAt: new Date().toISOString(), status: response.status(), sha256: hash(bytes) };
            const buildEntry = files.find(file => file.path === path.replace("/_next/", ""));
            if (!buildEntry || buildEntry.sha256 !== entry.sha256) entry.error = "served bytes differ from owned build";
            receipt.servedAssets.push(entry);
          }).catch(error => receipt.servedAssets.push({ path, sequence, request, status: responseStatus, scheduledAt, settledAt: new Date().toISOString(), error: safe(error.message) })).finally(() => { receipt.assetReadState.settled++; receipt.assetReadState.inFlight--; }));
        }
      });
    };
    context.on("page", observePage);
    page = await context.newPage(); page.setDefaultTimeout(15000); observePage(page);
    receipt.browser.cachePolicy = disableBrowserCache ? "disabled-for-owned-correctness-run" : "browser-default";
    if (disableBrowserCache) {
      const cdp = await context.newCDPSession(page);
      receipt.browser.cdpAssetResponses = [];
      receipt.browser.cdpCacheEvents = [];
      const responseReceived = event => {
        if (new URL(event.response.url).pathname.startsWith("/_next/static/")) receipt.browser.cdpAssetResponses.push({ requestId: event.requestId, at: new Date().toISOString(), timestamp: event.timestamp, type: event.type, url: safe(event.response.url), status: event.response.status, fromDiskCache: event.response.fromDiskCache ?? false, fromServiceWorker: event.response.fromServiceWorker ?? false, fromPrefetchCache: event.response.fromPrefetchCache ?? false, timing: event.response.timing ?? null });
      };
      const servedFromCache = event => receipt.browser.cdpCacheEvents.push({ requestId: event.requestId, at: new Date().toISOString() });
      cdp.on("Network.responseReceived", responseReceived); cdp.on("Network.requestServedFromCache", servedFromCache);
      lifecycle.addCleanup("owned page cache observer", async () => { cdp.off("Network.responseReceived", responseReceived); cdp.off("Network.requestServedFromCache", servedFromCache); await cdp.detach(); });
      await lifecycle.stage("disable owned browser cache before navigation", async () => { await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }); receipt.browser.cachePolicyAppliedAt = new Date().toISOString(); }, 15000);
    }
    return { baseUrl, browser, page, lifecycle, receipt, close, observePage, drainAssetReads, async stage(label, action, timeout = 300000) { const entry = { label, status: "running" }; receipt.stages.push(entry); try { const value = await lifecycle.stage(label, action, timeout); entry.status = "pass"; return value; } catch (error) { entry.status = "fail"; entry.error = safe(error.message); throw error; } finally { json("receipt.json", receipt); } } };
  } catch (error) { await close(error); throw error; }
}
