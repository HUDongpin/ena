#!/usr/bin/env node
// Browser fixtures exercise UI behavior only; they are not live-provider or worker evidence.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { tsImport } from "tsx/esm/api";
const { locales, localeMeta } = await tsImport("../lib/i18n.ts", import.meta.url);
const { getNovaCopy } = await tsImport("../components/nova/copy.ts", import.meta.url);
const { NOVA_SYNTHETIC_CONTEXT } = await tsImport("../lib/nova/sdk.ts", import.meta.url);
const { novaIdentityTag } = await tsImport("../lib/nova/identity.ts", import.meta.url);

const base = new URL(process.env.NOVA_UI_BASE_URL || "http://127.0.0.1:3000");
if (base.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(base.hostname) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("Use a loopback-only NOVA_UI_BASE_URL origin");
const output = resolve(process.env.NOVA_UI_OUTPUT || "/tmp/nova-ui-browser"); await mkdir(output, { recursive: true });
const now = "2026-11-01T12:00:00.000Z";
const models = [
  { key: "qwen-flash", provider: "qwen", label: "Qwen3.8 Flash", apiModel: "qwen3.8-flash", version: "flash", available: true },
  { key: "qwen-max", provider: "qwen", label: "Qwen3.8 Max 0902", apiModel: "qwen3.8-max-0902", version: "max", available: true },
  { key: "deepseek-flash", provider: "deepseek", label: "DeepSeek V4.1 Flash 1017", apiModel: "deepseek-flash", version: "flash", available: true },
  { key: "deepseek-pro", provider: "deepseek", label: "DeepSeek V4 Pro 0813", apiModel: "deepseek-v4-pro", version: "pro", available: true },
];
const artifact = { id: "00000000-0000-4000-8000-000000000004", runId: "00000000-0000-4000-8000-000000000003", version: 1, createdAt: now, status: "draft", sourceHash: "a".repeat(64), fixtureHash: "b".repeat(64), files: [{ path: "src/plugin.ts", content: 'export default () => ({ title: "Fixture view" });\n// <script>literal source, not executable</script>' }], manifest: { schemaVersion: "open-ena.nova-draft/v1", name: "Fixture comparison", version: "0.1.0", kind: "presenter", entry: "src/plugin.ts", changesAnalysis: false, networkAccess: false }, checks: [{ name: "Fixture shape", passed: true, detail: "Synthetic browser fixture only." }], output: { title: "Fixture comparison", network: structuredClone(NOVA_SYNTHETIC_CONTEXT.network), exports: ["svg", "json"] } };
function makeSession() { return { id: "00000000-0000-4000-8000-000000000001", title: "Fixture comparison", locale: "en", createdAt: now, updatedAt: now, messages: [], runs: [], artifacts: [], expertRequests: [], activeArtifactId: null }; }
async function installFixtures(page) {
  const state = { identity: null, discoveryIdentity: undefined, session: null, writes: [], privateRequests: [], rejectedIdentities: [], failNextMessage: false, messageFailures: [], messageStatus: "ready", draftFiles: null, draftChecks: null, events: [], eventAfters: [], finalEventOnPoll: false, failSessionReads: 0, failedSessionReads: 0, switchOwnerAfterCreate: null };
  const respond = (route, value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
  await page.route("**/api/plugin-lab/session", (route) => {
    if (route.request().method() === "DELETE") { state.identity = null; return respond(route, { ok: true }); }
    const discovered = state.discoveryIdentity === undefined ? state.identity : state.discoveryIdentity;
    return respond(route, discovered || { code: "researcher-required" }, discovered ? 200 : 401);
  });
  await page.route("**/api/plugin-lab/email-code/request", (route) => respond(route, { challengeId: "fixture-code", expiresIn: 600, retryAfter: 0 }));
  await page.route("**/api/plugin-lab/email-code/verify", (route) => { state.identity = { email: "fixture@example.org", expiresAt: "2099-01-01T00:00:00.000Z" }; return respond(route, { ...state.identity, verified: true }); });
  await page.route("**/api/nova/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/nova/fonts/")) return route.fallback();
    if (path.endsWith("/models")) return respond(route, { models, enabled: true, runtimeConfigured: true });
    const identityTag = request.headers()["x-nova-identity"];
    state.privateRequests.push({ path, identityTag, method: request.method() });
    if (!state.identity) return respond(route, { code: "researcher-required" }, 401);
    if (identityTag !== await novaIdentityTag(state.identity.email)) { state.rejectedIdentities.push({ path, identityTag }); return respond(route, { code: "identity-mismatch" }, 401); }
    if (request.method() === "POST") { state.writes.push({ path, key: request.headers()["idempotency-key"], body: request.postDataJSON() }); }
    if (path === "/api/nova/sessions") { if (request.method() === "POST") { state.session ||= makeSession(); if (state.switchOwnerAfterCreate) state.identity = state.switchOwnerAfterCreate; return respond(route, { session: state.session }, 201); } return respond(route, { sessions: state.session ? [{ id: state.session.id, title: state.session.title, createdAt: now, updatedAt: now, status: state.session.runs.at(-1)?.status || null }] : [] }); }
    if (path.endsWith("/events")) {
      const after = Number(new URL(request.url()).searchParams.get("after")); state.eventAfters.push(after);
      if (state.finalEventOnPoll && state.session?.runs.length) {
        state.finalEventOnPoll = false; state.session.runs[0].status = "ready";
        state.session.messages.push({ id: "final-ready", role: "assistant", content: "Final event delivered ready draft", createdAt: now });
        state.session.artifacts = [artifact]; state.session.activeArtifactId = artifact.id;
        state.events = [{ cursor: 1, sessionId: state.session.id, type: "artifact", detail: "ready", createdAt: now }];
        state.failSessionReads = 1;
      }
      return respond(route, { events: state.events.filter((event) => event.cursor > after), cursor: state.events.at(-1)?.cursor || 0 });
    }
    if (path.endsWith("/messages")) {
      if (state.failNextMessage) { state.failNextMessage = false; return route.abort("failed"); }
      const failure = state.messageFailures.shift();
      if (failure === "network") return route.abort("failed");
      if (failure) { if (failure === 401) state.identity = null; return respond(route, { code: failure === 401 ? "researcher-required" : failure === 429 ? "rate-limited" : "invalid-request" }, failure); }
      const data = request.postDataJSON(); const run = { id: artifact.runId, sessionId: state.session.id, status: state.messageStatus, model: models.find((model) => model.key === data.modelKey), effort: data.effort, createdAt: now, updatedAt: now, messageId: "fixture-message", baseArtifactId: null, stepCount: 2, repairCount: 0, ...(state.draftFiles ? { draftFiles: structuredClone(state.draftFiles), draftChecks: structuredClone(state.draftChecks || []) } : {}) };
      state.session.messages = [{ id: "fixture-message", role: "user", content: data.content, createdAt: now }, { id: "fixture-assistant", role: "assistant", content: state.messageStatus === "ready" ? "The synthetic test fixture is ready for preview." : state.messageStatus === "failed" ? "Fixture draft failed compilation." : "Fixture is building", createdAt: now }]; state.session.runs = [run]; state.session.artifacts = state.messageStatus === "ready" ? [artifact] : []; state.session.activeArtifactId = state.messageStatus === "ready" ? artifact.id : null;
      return respond(route, { session: state.session, run }, 202);
    }
    if (path.endsWith("/expert") && request.method() === "POST") {
      const data = request.postDataJSON();
      if (data.runId !== state.session.runs.at(-1)?.id || data.artifactId !== state.session.activeArtifactId) return respond(route, { code: "stale-expert-request" }, 409);
      state.session.expertRequests.push({ id: "fixture-expert", runId: data.runId, artifactId: data.artifactId, question: data.question, context: "Synthetic test", status: "requested", notificationStatus: "pending", createdAt: now });
      return respond(route, { session: state.session }, 202);
    }
    if (state.session && path === `/api/nova/sessions/${state.session.id}` && request.method() === "POST") {
      state.session.title = request.postDataJSON().title;
      return respond(route, { session: state.session });
    }
    if (state.failSessionReads > 0) { state.failSessionReads--; state.failedSessionReads++; return respond(route, { code: "service-unavailable" }, 503); }
    if (!state.session || !path.includes(state.session.id)) return respond(route, { code: "not-found" }, 404);
    return respond(route, { session: state.session });
  });
  return state;
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  const state = await installFixtures(page);
  await page.goto(`${base.origin}/en/plugin`, { waitUntil: "networkidle" });
  assert.equal(new URL(page.url()).pathname, "/en/plugins");
  await page.getByRole("heading", { name: "What would you like to build?" }).waitFor();
  if (await page.locator(".nova-workbench").evaluate((element) => element.classList.contains("nova-web-fonts"))) {
    const faces = await page.evaluate(async () => {
      for (const family of ["Nova Anthropic Sans Served", "Nova Anthropic Mono Served"]) for (const style of ["normal", "italic"]) await document.fonts.load(`${style} 400 16px "${family}"`);
      await document.fonts.ready;
      return Array.from(document.fonts).filter((font) => font.family.includes("Served")).map((font) => ({ family: font.family, style: font.style, weight: font.weight, status: font.status }));
    });
    assert.equal(faces.length, 4); assert.ok(faces.every((face) => face.status === "loaded"));
    assert.match(await page.locator(".nova-workbench").evaluate((element) => getComputedStyle(element).fontFamily), /Nova Anthropic Sans Served/);
    const responses = [];
    for (const style of ["sans-roman", "sans-italic", "mono-roman", "mono-italic"]) {
      const response = await page.request.get(`${base.origin}/api/nova/fonts/${style}`);
      assert.equal(response.status(), 200); assert.equal(response.headers()["content-type"], "font/woff2");
      assert.equal(response.headers()["x-content-type-options"], "nosniff"); assert.match(response.headers()["cache-control"], /^private,/);
      responses.push({ style, status: response.status(), bytes: (await response.body()).length, contentType: response.headers()["content-type"] });
    }
    await writeFile(`${output}/font-loading.json`, JSON.stringify({ source: "Existing application CSS faces and configured local font route; no FontFace injection", faces, responses }, null, 2));
  }
  assert.equal(await page.getByRole("main").count(), 1);
  assert.equal(await page.locator(".nova-header img").getAttribute("src"), "/unified-home/logo-open-ena.svg");
  assert.equal(await page.locator(".nova-recent li").count(), 0);
  await page.screenshot({ path: `${output}/initial-desktop.png`, fullPage: true, animations: "disabled" });
  const donate = page.getByRole("button", { name: "Donate", exact: true }); await donate.click();
  await page.getByRole("dialog", { name: "Support Open ENA" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Contact by email" }).getAttribute("href"), "mailto:hudongpin@126.com?subject=Open%20ENA%20Donation%20Inquiry");
  await page.screenshot({ path: `${output}/donation-desktop.png`, fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await donate.evaluate((element) => element === document.activeElement), true);
  await page.getByLabel("Choose model").click();
  await page.screenshot({ path: `${output}/model-menu-desktop.png`, fullPage: true, animations: "disabled" });
  assert.equal(await page.locator('.nova-model-popover input[type="radio"]').count(), 4);
  await page.locator(".nova-model-popover strong").click();
  assert.equal(await page.locator(".nova-model-picker").getAttribute("open"), "");
  await page.locator(".nova-header").click({ position: { x: 450, y: 20 } });
  assert.equal(await page.locator(".nova-model-picker").getAttribute("open"), null);
  await page.getByLabel("Choose model").click();
  await page.getByLabel("Choose model").press("Escape");
  assert.equal(await page.locator(".nova-model-picker").getAttribute("open"), null);
  assert.equal(await page.locator(".nova-header").getByText("Code", { exact: true }).count(), 0);
  await page.getByLabel("Choose model").click();
  await page.getByLabel("DeepSeek V4.1 Flash 1017", { exact: true }).check();
  await page.getByLabel("Effort", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Add context", exact: true }).click();
  await page.getByLabel("Additional context", { exact: true }).fill("Use synthetic examples. Reference: https://example.org/ena-reference");
  await page.getByRole("button", { name: "Add to draft", exact: true }).click();
  assert.match(await page.locator("#nova-prompt").inputValue(), /Additional context:\nUse synthetic examples/);
  assert.equal(state.writes.length, 0, "adding context never submits a request");
  await page.getByRole("textbox", { name: "Ask Nova to build an ENA plugin…" }).fill("Build my private synthetic example");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog", { name: "Verify your email to keep building" }).waitFor();
  assert.equal(await page.locator("#nova-prompt").inputValue(), "Build my private synthetic example");
  await page.locator("#plugin-email").fill("fixture@example.org");
  await page.locator(".plugin-email-verification").getByRole("button").first().click();
  await page.locator("#plugin-email-code").fill("123456");
  await page.locator(".plugin-code-entry").getByRole("button").click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.locator("#nova-prompt").inputValue(), "Build my private synthetic example");
  assert.equal(state.writes.length, 0, "verification itself must not submit a message");
  state.failNextMessage = true;
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "Retry request", exact: true }).waitFor();
  const failed = state.writes.find((write) => write.path.endsWith("/messages")); assert.ok(failed.key);
  await page.getByRole("button", { name: "Retry request", exact: true }).click();
  await page.getByText("The synthetic test fixture is ready for preview.").waitFor();
  const retried = state.writes.filter((write) => write.path.endsWith("/messages")).at(-1);
  assert.equal(retried.key, failed.key); assert.deepEqual(retried.body, failed.body);
  assert.equal(retried.body.modelKey, "deepseek-flash"); assert.equal(retried.body.effort, "high");
  assert.equal(await page.locator("#nova-prompt").inputValue(), "");
  assert.equal(new URL(page.url()).searchParams.get("session"), state.session.id);
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.locator("#nova-prompt").fill("Unsent draft");
  const recent = page.locator(".nova-recent");
  await recent.getByRole("button", { name: state.session.title }).click({ button: "right" });
  const rename = page.getByRole("dialog", { name: "Rename session" });
  assert.equal(await rename.getByRole("textbox").inputValue(), state.session.title);
  await rename.getByRole("textbox").fill("   ");
  assert.equal(await rename.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
  await rename.getByRole("textbox").fill("  Renamed fixture  ");
  await rename.getByRole("textbox").press("Enter");
  await rename.waitFor({ state: "detached" });
  assert.equal(new URL(page.url()).searchParams.has("session"), false);
  assert.equal(await page.locator("#nova-prompt").inputValue(), "Unsent draft");
  await recent.getByRole("button", { name: "Renamed fixture" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "Renamed fixture", exact: true }).waitFor();
  await page.getByText("The synthetic test fixture is ready for preview.", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("session"), state.session.id, "full reload restores the selected owned task");
  assert.equal(await page.locator(".nova-preview-frame").getAttribute("sandbox"), "allow-scripts");
  await page.frameLocator(".nova-preview-frame").getByRole("button", { name: "Export SVG", exact: true }).waitFor();
  let downloads = 0; page.on("download", () => downloads++);
  await page.evaluate(() => window.postMessage({ type: "nova:export", nonce: "spoofednonce123456", format: "svg", filename: "nova-plugin.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, "*"));
  const previewFrame = page.frames().find((frame) => frame.parentFrame());
  await previewFrame.evaluate(() => parent.postMessage({ type: "nova:export", nonce: "wrongnonce1234567", format: "svg", filename: "nova-plugin.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, "*"));
  await page.waitForTimeout(100); assert.equal(downloads, 0, "source and nonce spoofing must not download");
  const downloaded = page.waitForEvent("download"); await page.frameLocator(".nova-preview-frame").getByRole("button", { name: "Export SVG", exact: true }).click();
  assert.equal((await downloaded).suggestedFilename(), "nova-plugin.svg");
  await previewFrame.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/active-desktop.png`, fullPage: true, animations: "disabled" });
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  assert.match(await page.locator(".nova-code").innerText(), /<script>literal source/);
  assert.equal(await page.locator(".nova-code script").count(), 0);
  await page.getByRole("tab", { name: "Checks", exact: true }).click();
  await page.getByText("Synthetic browser fixture only.").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open preview", exact: true }).click();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await page.frameLocator(".nova-preview-frame").getByRole("button", { name: "Export SVG", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/active-mobile-preview.png`, fullPage: true, animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: "Open preview", exact: true }).evaluate((element) => element === document.activeElement), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Review submits the exact candidate captured at dialog open and never silently rebinds it.
  await page.getByRole("button", { name: "Request review", exact: true }).click();
  await page.getByRole("dialog", { name: "Ask Dr. Hu", exact: true }).waitFor();
  assert.match(await page.locator(".nova-review-version").innerText(), /v1/);
  const reviewQuestion = "Review this exact synthetic candidate";
  await page.locator("#nova-expert-question").fill(reviewQuestion);
  const newer = { ...structuredClone(artifact), id: "00000000-0000-4000-8000-000000000005", version: 2 };
  state.session.artifacts.push(newer); state.session.activeArtifactId = newer.id;
  await page.getByRole("button", { name: "Request expert input", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(await page.locator("#nova-expert-question").inputValue(), reviewQuestion);
  assert.equal(state.session.expertRequests.length, 0);
  const rejectedReview = state.writes.filter((write) => write.path.endsWith("/expert")).at(-1);
  assert.deepEqual(rejectedReview.body, { question: reviewQuestion, runId: artifact.runId, artifactId: artifact.id });
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Request review", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".nova-review-version")?.textContent.includes("v2"));
  assert.equal(await page.locator("#nova-expert-question").inputValue(), reviewQuestion);
  await page.getByRole("button", { name: "Request expert input", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(state.session.expertRequests.length, 1);
  assert.equal(state.session.expertRequests[0].artifactId, newer.id);
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  assert.equal(Object.keys(stored).filter((key) => key.startsWith("open-ena.nova")).length, 1);
  assert.ok(!JSON.stringify(stored).includes("Build my private synthetic example"));
  // An externally switched identity must erase the old account's session surface.
  state.identity = { email: "different@example.org", expiresAt: "2099-01-01T00:00:00.000Z" }; state.session = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("heading", { name: "What would you like to build?" }).waitFor();
  assert.equal(await page.getByText("The synthetic test fixture is ready for preview.").count(), 0);
  assert.equal(await page.locator(".nova-recent li").count(), 0);
  assert.equal(new URL(page.url()).searchParams.has("session"), false, "account switch clears the previous task URL");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/initial-mobile.png`, fullPage: true, animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile page should not overflow horizontally");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Donate", exact: true }).click();
  await page.getByRole("dialog", { name: "Support Open ENA" }).waitFor();
  await page.screenshot({ path: `${output}/donation-mobile.png`, fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.goto(`${base.origin}/zh-hans/plugins`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "你想构建什么？" }).waitFor();
  for (const locale of locales) {
    await page.locator(".nova-language summary").click();
    await page.locator(`.nova-language a[hreflang="${localeMeta[locale].htmlLang}"]`).click();
    await page.waitForURL(`${base.origin}/${locale}/plugins`);
    const copy = getNovaCopy(locale);
    await page.getByRole("heading", { name: copy.greeting, exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: copy.placeholder }).getAttribute("placeholder"), copy.placeholder);
    assert.equal(await page.locator(".nova-workbench").getAttribute("dir"), localeMeta[locale].dir);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `mobile overflow in ${locale}`);
  }
  assert.deepEqual(errors, []);
  assert.ok(state.privateRequests.every((request) => /^[a-f0-9]{64}$/.test(request.identityTag || "")), "all private reads and writes carry a captured account digest");

  // A cookie switch that discovery has not observed must not move Alice's draft into Bob's account.
  for (const stage of ["before-create", "between-create-and-message"]) {
    const racePage = await browser.newPage(); const race = await installFixtures(racePage);
    const alice = { email: "alice@example.org", expiresAt: "2099-01-01T00:00:00.000Z" };
    const bob = { email: "bob@example.org", expiresAt: "2099-01-01T00:00:00.000Z" };
    race.identity = alice; race.discoveryIdentity = alice;
    await racePage.goto(`${base.origin}/en/plugins`, { waitUntil: "networkidle" });
    await racePage.locator("#nova-prompt").fill("Alice private draft must never be stored for Bob");
    if (stage === "before-create") race.identity = bob; else race.switchOwnerAfterCreate = bob;
    await racePage.getByRole("button", { name: "Send message", exact: true }).click();
    await racePage.getByRole("dialog", { name: "Verify your email to keep building" }).waitFor();
    assert.equal(race.writes.filter((write) => write.path.endsWith("/messages")).length, 0);
    assert.ok(race.rejectedIdentities.length, "mismatched cookie account must be rejected");
    const aliceTag = await novaIdentityTag(alice.email);
    assert.ok(race.privateRequests.every((request) => request.identityTag === aliceTag), "both create and message keep the initiating Alice identity");
    assert.equal(await racePage.locator("#nova-prompt").inputValue(), "Alice private draft must never be stored for Bob");
    race.discoveryIdentity = bob;
    await racePage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await racePage.waitForFunction(() => document.querySelector("#nova-prompt")?.value === "");
    await racePage.close();
  }

  // A final event followed by one failed session read must be replayed, not acknowledged early.
  const missingPage = await browser.newPage(); const missing = await installFixtures(missingPage);
  missing.identity = { email: "other@example.org", expiresAt: "2099-01-01T00:00:00.000Z" };
  await missingPage.goto(`${base.origin}/en/plugins?session=00000000-0000-4000-8000-000000000099`, { waitUntil: "networkidle" });
  await missingPage.getByText("This session is unavailable in this account. Start a new session or choose one from your list.", { exact: true }).waitFor();
  assert.equal(new URL(missingPage.url()).searchParams.has("session"), false);
  assert.equal(await missingPage.getByRole("heading", { name: "What would you like to build?" }).count(), 1);
  await missingPage.goto(`${base.origin}/en/plugins?session=not-a-uuid`, { waitUntil: "networkidle" });
  assert.equal(new URL(missingPage.url()).searchParams.has("session"), false);
  assert.ok(!missing.privateRequests.some((request) => request.path.includes("not-a-uuid")));
  await missingPage.close();
  const cursorPage = await browser.newPage(); const cursor = await installFixtures(cursorPage);
  cursor.identity = { email: "fixture@example.org", expiresAt: "2099-01-01T00:00:00.000Z" };
  cursor.messageStatus = "building"; cursor.finalEventOnPoll = true;
  await cursorPage.goto(`${base.origin}/en/plugins`, { waitUntil: "networkidle" });
  await cursorPage.locator("#nova-prompt").fill("Build a final-event recovery fixture");
  await cursorPage.getByRole("button", { name: "Send message", exact: true }).click();
  await cursorPage.getByText("Final event delivered ready draft", { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(cursor.failedSessionReads, 1);
  assert.equal(cursor.events.length, 1, "only one final event is produced");
  assert.ok(cursor.eventAfters.filter((after) => after === 0).length >= 2, "unrefreshed final event is requested again");
  await cursorPage.close();

  // Failed first drafts expose literal files and actual failures without a ready preview.
  const failedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const failedDraft = await installFixtures(failedPage);
  failedDraft.identity = { email: "fixture@example.org", expiresAt: "2099-01-01T00:00:00.000Z" };
  failedDraft.messageStatus = "failed";
  failedDraft.draftFiles = [{ path: "src/plugin.ts", content: 'export default () => { broken syntax; }; // <script>literal failed source</script>' }];
  failedDraft.draftChecks = [{ name: "TypeScript compilation", passed: false, detail: "Synthetic compiler failure: expected an expression." }];
  await failedPage.goto(`${base.origin}/en/plugins`, { waitUntil: "networkidle" });
  await failedPage.locator("#nova-prompt").fill("Build a failed-source fixture");
  await failedPage.getByRole("button", { name: "Send message", exact: true }).click();
  await failedPage.getByText("Fixture draft failed compilation.", { exact: true }).waitFor();
  assert.equal(await failedPage.getByLabel("Version", { exact: true }).inputValue(), "current-working-draft");
  assert.equal(await failedPage.locator(".nova-preview-frame").count(), 0);
  assert.equal(await failedPage.getByRole("button", { name: "Export draft", exact: true }).isDisabled(), true);
  assert.equal(await failedPage.getByRole("button", { name: "Request review", exact: true }).count(), 0);
  await failedPage.getByRole("tab", { name: "Files", exact: true }).click();
  assert.match(await failedPage.locator(".nova-code").innerText(), /<script>literal failed source/);
  assert.equal(await failedPage.locator(".nova-code script").count(), 0);
  await failedPage.getByRole("tab", { name: "Checks", exact: true }).click();
  await failedPage.getByText("Synthetic compiler failure: expected an expression.", { exact: true }).waitFor();
  assert.equal(await failedPage.locator(".nova-check-fail").count(), 1);
  await failedPage.screenshot({ path: `${output}/failed-draft-checks-desktop.png`, fullPage: true, animations: "disabled" });
  const failedRun = structuredClone(failedDraft.session.runs[0]);
  failedDraft.session.runs[0].status = "building";
  failedDraft.session.runs[0].draftFiles = [{ path: "src/plugin.ts", content: 'export default () => ({ title: "Revised unchecked source" });' }];
  failedDraft.session.runs[0].draftChecks = [];
  failedDraft.events.push({ cursor: 1, sessionId: failedDraft.session.id, type: "run", detail: "Source revised; old checks invalidated", createdAt: now });
  await failedPage.getByText("No checks are recorded for these current files yet.", { exact: true }).waitFor({ timeout: 8000 });
  assert.equal(await failedPage.getByText("Synthetic compiler failure: expected an expression.", { exact: true }).count(), 0);
  await failedPage.getByRole("tab", { name: "Files", exact: true }).click();
  assert.match(await failedPage.locator(".nova-code").innerText(), /Revised unchecked source/);
  await failedPage.getByRole("tab", { name: "Preview", exact: true }).click();
  await failedPage.getByText("This working draft has no checked preview yet. Open Files or Checks to inspect the current result.", { exact: true }).waitFor();
  assert.equal(await failedPage.locator(".nova-preview-frame").count(), 0);
  await failedPage.close();

  // Re-entering a failed revision keeps the old passed version available only by explicit selection.
  const versionPage = await browser.newPage(); const versions = await installFixtures(versionPage);
  versions.identity = { email: "fixture@example.org", expiresAt: "2099-01-01T00:00:00.000Z" };
  versions.session = { ...makeSession(), artifacts: [structuredClone(artifact)], activeArtifactId: artifact.id, runs: [{ ...failedRun, status: "ready", draftFiles: undefined, draftChecks: undefined }, { ...failedRun, id: "00000000-0000-4000-8000-000000000006" }] };
  await versionPage.goto(`${base.origin}/en/plugins?session=${versions.session.id}`, { waitUntil: "networkidle" });
  await versionPage.getByLabel("Version", { exact: true }).waitFor();
  assert.equal(await versionPage.getByLabel("Version", { exact: true }).inputValue(), "current-working-draft");
  assert.equal(await versionPage.locator(".nova-preview-frame").count(), 0);
  await versionPage.getByLabel("Version", { exact: true }).selectOption(artifact.id);
  await versionPage.locator(".nova-preview-frame").waitFor();
  await versionPage.getByRole("tab", { name: "Checks", exact: true }).click();
  await versionPage.getByText("Synthetic browser fixture only.", { exact: true }).waitFor();
  assert.equal(await versionPage.locator(".nova-check-fail").count(), 0);
  await versionPage.getByLabel("Version", { exact: true }).selectOption("current-working-draft");
  await versionPage.getByText("Synthetic compiler failure: expected an expression.", { exact: true }).waitFor();
  await versionPage.getByLabel("Version", { exact: true }).selectOption(artifact.id);
  const checkedRevision = { ...structuredClone(artifact), id: "00000000-0000-4000-8000-000000000007", runId: versions.session.runs.at(-1).id, version: 2 };
  versions.session.runs.at(-1).status = "ready"; versions.session.artifacts.push(checkedRevision); versions.session.activeArtifactId = checkedRevision.id;
  versions.events.push({ cursor: 1, sessionId: versions.session.id, type: "artifact", detail: "Checked revision ready", createdAt: now });
  await versionPage.waitForFunction((id) => document.querySelector('select[aria-label="Version"]')?.value === id, checkedRevision.id, { timeout: 8000 });
  assert.equal(await versionPage.getByRole("option", { name: "Current working draft", exact: true }).count(), 0);
  await versionPage.close();

  // Definite rejections of a retry cannot prove the original uncertain attempt was never stored.
  const retryPage = await browser.newPage(); const retries = await installFixtures(retryPage);
  retries.identity = { email: "fixture@example.org", expiresAt: "2099-01-01T00:00:00.000Z" };
  retries.messageFailures = ["network", 429, 400, 401];
  await retryPage.goto(`${base.origin}/en/plugins`, { waitUntil: "networkidle" });
  await retryPage.locator("#nova-prompt").fill("Keep this exact uncertain request");
  await retryPage.getByRole("button", { name: "Send message", exact: true }).click();
  await retryPage.getByRole("button", { name: "Retry request", exact: true }).waitFor();
  for (const status of [429, 400, 401]) {
    const response = retryPage.waitForResponse((value) => value.url().endsWith("/messages") && value.status() === status);
    await retryPage.getByRole("button", { name: "Retry request", exact: true }).click(); await response;
    await retryPage.waitForFunction(() => document.querySelector("#nova-prompt")?.readOnly === true);
    assert.equal(await retryPage.getByRole("button", { name: "New session", exact: true }).isDisabled(), true);
  }
  await retryPage.getByRole("dialog", { name: "Verify your email to keep building" }).waitFor();
  await retryPage.locator(".plugin-email-verification").getByRole("button").first().click();
  await retryPage.locator("#plugin-email-code").fill("123456");
  await retryPage.locator(".plugin-code-entry").getByRole("button").click();
  await retryPage.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await retryPage.locator("#nova-prompt").evaluate((input) => input.readOnly), true);
  await retryPage.getByRole("button", { name: "Retry request", exact: true }).click();
  await retryPage.getByText("The synthetic test fixture is ready for preview.", { exact: true }).waitFor();
  const attempts = retries.writes.filter((write) => write.path.endsWith("/messages"));
  assert.equal(attempts.length, 5); assert.equal(new Set(attempts.map((write) => write.key)).size, 1);
  assert.ok(attempts.every((write) => JSON.stringify(write.body) === JSON.stringify(attempts[0].body)));
  assert.equal(await retryPage.locator("#nova-prompt").evaluate((input) => input.readOnly), false);
  await retryPage.close();
  console.log(JSON.stringify({ status: "passed", evidence: "Synthetic browser fixtures; no live provider or sandbox worker", output }, null, 2));
} finally { await browser.close(); }
