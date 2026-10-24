import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture.ts";
import { runStandardPlanV3 } from "../lib/open-ena/analyze.ts";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding.ts";
import { createWorkspaceStateV3, emptyWorkspaceDraftsV3 } from "../components/open-ena/model-v3/workspace-controller.ts";
import { captureOpenEnaCloudWorkspace, defaultOpenEnaCloudPresentation, restoreOpenEnaCloudWorkspace } from "../lib/open-ena/cloud-workspace.ts";
import type { ParsedDataset } from "../lib/open-ena/types.ts";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types.ts";

const argument = process.argv.indexOf("--fixture");
const fixtureFile = resolve(argument >= 0 ? process.argv[argument + 1] : "output/cloud-projects-20261024/local-fixture.json");
const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
assert.equal(fixture.fixture, "synthetic-only");
assert.equal(dirname(fixture.rootDirectory), tmpdir()); assert.ok(basename(fixture.rootDirectory).startsWith("ena-cloud-browser-"));
assert.equal(fixture.mailFile, join(fixture.rootDirectory, "mail.jsonl"));
for (const origin of [fixture.originA, fixture.originB]) {
  const parsed = new URL(origin); assert.equal(parsed.protocol, "http:"); assert.ok(["localhost", "127.0.0.1", "ena-cloud.localhost", "open-ena-cloud.localhost"].includes(parsed.hostname));
}
assert.ok(Number.isInteger(fixture.appPort) && fixture.appPort > 0 && fixture.appPort < 65536);
const base = `http://127.0.0.1:${fixture.appPort}`, originA = fixture.originA as string, originB = fixture.originB as string;
const suffix = randomUUID().slice(0, 8), emailA = `http-one-${suffix}@example.test`, emailB = `http-two-${suffix}@example.test`;
const password = "synthetic HTTP acceptance password", newPassword = "synthetic replacement HTTP password";
const checks: Array<{ name: string; passed: true }> = [];
const check = (name: string) => { checks.push({ name, passed: true }); console.log("PASS", name); };
const body = async (response: Response) => response.json() as Promise<any>;
async function call(path: string, options: { method?: string; origin?: string; cookie?: string; account?: string; json?: unknown; form?: Record<string, string> } = {}) {
  return fetch(`${base}${path}`, { method: options.method ?? "GET", redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: { origin: options.origin ?? originA, "x-ena-client-ip": "203.0.113.19", ...(options.cookie ? { cookie: options.cookie,
      "x-open-ena-account": options.account ?? options.cookie.split("=", 2)[1].split(".")[3] } : {}),
      ...(options.json !== undefined ? { "content-type": "application/json" } : options.form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    ...(options.json !== undefined ? { body: JSON.stringify(options.json) } : options.form ? { body: new URLSearchParams(options.form) } : {}) });
}
function mailToken(email: string, action: "verify" | "reset") {
  const messages = readFileSync(fixture.mailFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const message = messages.findLast((m) => m.to.includes(email) && m.text.includes(`#action=${action}&token=`));
  assert.ok(message, "the isolated mail recorder received the requested action");
  const link = new URL(message.text.match(/https?:\/\/\S+/u)[0]);
  assert.ok([originA, originB].includes(link.origin));
  const token = new URLSearchParams(link.hash.slice(1)).get("token")!;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  return token;
}
async function login(email: string, secret: string, origin = originA) {
  const response = await call("/api/open-ena/login", { method: "POST", origin, form: { username: email, password: secret, locale: "en" } });
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), `${origin}/en/open-ena`);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/u); assert.match(cookie, /Secure/u); assert.doesNotMatch(cookie, /Domain=/iu);
  return cookie.split(";", 1)[0];
}

const receipt: Record<string, unknown> = { fixture: "synthetic-only", startedAt: new Date().toISOString(), realEmailSending: false, checks };
try {
  const page = await call("/en/open-ena");
  assert.equal(page.status, 200); assert.match(await page.text(), /Create an account/u);
  for (const [email, origin] of [[emailA, originA], [emailB, originB]]) {
    assert.equal((await call("/api/open-ena/account/register", { method: "POST", origin, json: { email, locale: "en" } })).status, 202);
    const token = mailToken(email, "verify");
    assert.equal((await call("/api/open-ena/account/verify", { method: "POST", origin, json: { token, password } })).status, 200);
    assert.equal((await call("/api/open-ena/account/verify", { method: "POST", origin, json: { token, password } })).status, 400);
  }
  check("two real Next.js registration and single-use verification flows");
  const cookieA = await login(emailA.toUpperCase(), password), cookieAOther = await login(emailA, password, originB), cookieB = await login(emailB, password, originB);
  const workspace = await call("/en/open-ena", { cookie: cookieA });
  assert.equal(workspace.status, 200);
  const html = await workspace.text(); assert.match(html, /open-ena-workspace-v3/u); assert.match(html, /My cloud projects/u); assert.ok(html.includes(emailA));
  check("registered account has a private cloud workbench on both origins");
  let dataset!: ParsedDataset, draft!: StandardEnaDraftV3;
  const { plan, compiled } = await bindingFixtureV3("a".repeat(64), (d, data) => { dataset = structuredClone(data); draft = structuredClone(d); });
  const result = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0,
    numericCellsAllocated: 120, peakBytesObservedOrBounded: 10_240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
  const initial = createWorkspaceStateV3({ dataset, datasetSha256: "a".repeat(64), drafts: { ...emptyWorkspaceDraftsV3(), standard: draft } });
  const snapshot = await captureOpenEnaCloudWorkspace({ state: { ...initial, model: { ...initial.model, result, resultStatus: "current" } }, currentPlan: plan,
    presentation: { ...defaultOpenEnaCloudPresentation(), mode: "plot", edgeScale: 2 } });
  const projectId = randomUUID();
  const created = await call("/api/open-ena/projects", { method: "POST", cookie: cookieA, json: { id: projectId, title: "HTTP cross-origin model", snapshot } });
  assert.equal(created.status, 201); assert.equal((await body(created)).revision, 1);
  const loaded = await call(`/api/open-ena/projects/${projectId}`, { origin: originB, cookie: cookieAOther });
  assert.equal(loaded.status, 200); assert.equal(loaded.headers.get("cache-control"), "private, no-store");
  const saved = await body(loaded), restored = await restoreOpenEnaCloudWorkspace(saved.snapshot);
  assert.equal(restored.resultStatus, "current"); assert.equal(restored.result?.binding.scientificResultSha256, result.binding.scientificResultSha256);
  assert.deepEqual(restored.dataset?.rows, dataset.rows); assert.deepEqual(restored.drafts.standard, draft); assert.equal(restored.presentation.edgeScale, 2);
  check("saved source rows, model, result hash and display settings reopen across origins");
  assert.equal((await body(await call("/api/open-ena/projects", { cookie: cookieB, origin: originB }))).projects.length, 0);
  assert.equal((await call(`/api/open-ena/projects/${projectId}`, { cookie: cookieB, origin: originB })).status, 404);
  assert.equal((await call(`/api/open-ena/projects/${projectId}`, { method: "PUT", cookie: cookieB, origin: originB, json: { title: "forged", revision: 1, snapshot } })).status, 404);
  assert.equal((await call("/api/open-ena/projects", { method: "POST", cookie: cookieA, json: { id: randomUUID(), title: "forged", snapshot, ownerId: "forged" } })).status, 400);
  assert.equal((await call(`/api/open-ena/projects/${projectId}`, { method: "PUT", cookie: cookieA, origin: "https://untrusted.example", json: { title: "forged", revision: 1, snapshot } })).status, 403);
  check("another user and an untrusted origin cannot read or overwrite a project");
  const oldTab = await call("/api/open-ena/projects", { method: "POST", cookie: cookieB, account: cookieA.split("=", 2)[1].split(".")[3], json: { id: randomUUID(), title: "Previous account data", snapshot } });
  assert.equal(oldTab.status, 409); assert.deepEqual(await body(oldTab), { error: "account-changed" });
  check("a stale tab cannot transfer the previous account's workspace into a newly signed-in account");
  const concurrent = await Promise.all([
    call(`/api/open-ena/projects/${projectId}`, { method: "PUT", cookie: cookieA, origin: originA, json: { title: "Window A", revision: 1, snapshot } }),
    call(`/api/open-ena/projects/${projectId}`, { method: "PUT", cookie: cookieAOther, origin: originB, json: { title: "Window B", revision: 1, snapshot } }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  check("concurrent real HTTP saves retain one version and return a conflict");
  assert.equal((await call("/api/open-ena/account/forgot-password", { method: "POST", json: { email: emailA, locale: "en" } })).status, 202);
  const reset = mailToken(emailA, "reset");
  assert.equal((await call("/api/open-ena/account/reset-password", { method: "POST", origin: originB, json: { token: reset, password: newPassword } })).status, 200);
  assert.equal((await call("/api/open-ena/projects", { cookie: cookieA })).status, 401);
  assert.equal((await call("/api/open-ena/projects", { cookie: cookieAOther, origin: originB })).status, 401);
  const renewed = await login(emailA, newPassword), renewedOther = await login(emailA, newPassword, originB);
  check("password reset invalidates the old sessions on both origins");
  assert.equal((await call(`/api/open-ena/projects/${projectId}`, { method: "DELETE", cookie: renewed, json: { revision: 2 } })).status, 409);
  const archived = await body(await call(`/api/open-ena/projects/${projectId}`, { method: "PATCH", cookie: renewed, json: { revision: 2, archived: true } }));
  assert.equal(archived.archived, true); assert.equal(archived.revision, 3);
  const restoredMeta = await body(await call(`/api/open-ena/projects/${projectId}`, { method: "PATCH", cookie: renewedOther, origin: originB, json: { revision: 3, archived: false } }));
  assert.equal(restoredMeta.revision, 4);
  assert.equal((await call(`/api/open-ena/projects/${projectId}`, { method: "PATCH", cookie: renewed, json: { revision: 4, archived: true } })).status, 200);
  assert.equal((await call(`/api/open-ena/projects/${projectId}`, { method: "DELETE", cookie: cookieB, json: { revision: 5 } })).status, 404);
  assert.equal((await call(`/api/open-ena/projects/${projectId}`, { method: "DELETE", cookie: renewed, json: { revision: 5 } })).status, 200);
  assert.equal((await body(await call("/api/open-ena/projects", { cookie: renewed }))).usedBytes, 0);
  check("archive, restore and owner-only confirmed-delete API recover storage");
  const logout = await call("/api/open-ena/logout", { method: "POST", cookie: renewed, form: { locale: "en" } });
  assert.equal(logout.status, 303);
  assert.equal((await call("/api/open-ena/projects", { cookie: renewed })).status, 401);
  assert.equal((await call("/api/open-ena/projects", { cookie: renewedOther, origin: originB })).status, 200);
  check("logout revokes only its own registered-user session");
  receipt.status = "PASS";
} catch (error) {
  receipt.status = "FAIL"; receipt.failure = error instanceof Error ? { name: error.name, message: error.message } : { name: "Unknown" };
  console.error("HTTP acceptance failed:", receipt.failure); process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString();
  writeFileSync(join(dirname(fixtureFile), "http-integration-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
}
