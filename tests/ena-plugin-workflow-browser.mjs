// Run after a production build:
// node --import tsx tests/ena-plugin-workflow-browser.mjs
// Optional: ENA_PLUGIN_LAB_TEST_DIST_DIR=.next-plugin-workflow
// Uses the built application and its real handlers with an owned PostgreSQL cluster
// and authenticated STARTTLS SMTP sink. All identities are synthetic. No .env is loaded.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { chromium } from "playwright";
import { startPluginLabFixture, mailText } from "./support/plugin-lab-fixture.mjs";
import { getPluginWorkflowCopy } from "../lib/plugin-lab/workflow-i18n.ts";
import { createOpenEnaSessionTokenV2, OPEN_ENA_SESSION_COOKIE } from "../lib/open-ena-auth.ts";
import { encryptPluginLabText, hashPluginLabAccessCode } from "../lib/plugin-lab/crypto.ts";
import { createPostgresPluginLabStore } from "../lib/plugin-lab/store.ts";
import { pluginLabEmailRef } from "../lib/plugin-lab/workflow-security.ts";

const evidence = resolve("output/plugin-lab-workflow");
mkdirSync(evidence, { recursive: true });
const report = { status: "RUNNING", startedAt: new Date().toISOString(), checks: [], screenshots: [], errors: [], syntheticOnly: true,
  limits: ["Synthetic users and localhost services only; no production or real-mailbox delivery acceptance.", "Operator authentication uses a valid synthetic static v2 session, bypassing only the login form.", "Fixture-only cooldown/backoff timestamps are advanced after the real enforced bounds are checked, to avoid minute-long test sleeps."] };
const persist = () => writeFileSync(join(evidence, "browser-report.json"), JSON.stringify(report, null, 2));
const pass = (name, details = {}) => { report.checks.push({ name, status: "PASS", ...details }); persist(); console.log(`PASS ${name}`); };
const viewports = [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }];
let fixture, fixtureStarting, browser;
const contexts = [];
const privateValues = new Set();
function redacted(value) {
  let text = String(value ?? "");
  for (const [key, secret] of Object.entries(fixture?.environment ?? {})) if (/(?:SECRET|PASSWORD|TOKEN|KEY)/u.test(key) && secret) text = text.replaceAll(secret, "<redacted>");
  for (const secret of privateValues) if (secret) text = text.replaceAll(secret, "<redacted>");
  return text.replace(/((?:ena-plugin-lab-researcher|ena-plugin-lab-legacy|open-ena-session)=)[^;\s]+/gu, "$1<redacted>");
}
const browserErrors = [];
const unexpectedRequests = [];
const proposalPosts = [];
const replyPosts = [];
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
  if (interrupted) return; interrupted = true;
  report.status = "FAIL";
  report.errors.push({ name: "Interrupted", message: `Acceptance interrupted by ${signal}.` });
  try { if (!fixture && fixtureStarting) fixture = await fixtureStarting.catch(() => null); if (browser) await browser.close(); if (fixture) await fixture.cleanup(); }
  catch (error) { report.errors.push({ name: "CleanupError", message: redacted(error.message) }); }
  report.finishedAt = new Date().toISOString(); persist(); process.exit(130);
});

async function newContext() {
  const context = await browser.newContext({ viewport: viewports[2], acceptDownloads: true });
  contexts.push(context);
  await context.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== fixture.origin) { unexpectedRequests.push(new URL(request.url()).origin); await route.abort(); return; }
    await route.continue();
  });
  context.on("page", page => {
    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("request", request => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/plugin-lab/proposals") proposalPosts.push(request);
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/replies")) replyPosts.push(request);
    });
  });
  return context;
}
async function http(context, path, { method = "GET", data, headers = {} } = {}) {
  return context.request.fetch(`${fixture.origin}${path}`, { method, data, maxRedirects: 0, headers: { origin: fixture.origin, ...headers } });
}
async function countProposals() { return Number((await fixture.database.query("SELECT count(*) AS count FROM ena_plugin_proposals")).rows[0].count); }
async function resetCooldown(email) {
  await fixture.database.query("UPDATE ena_plugin_workflow_email_contacts SET last_challenge_at=clock_timestamp()-interval '61 seconds' WHERE email_ref=$1", [pluginLabEmailRef(email, fixture.environment.ENA_PLUGIN_LAB_SECRET)]);
}
function latestCode(email, afterIndex = 0) {
  const message = fixture.messages.slice(afterIndex).findLast(message => message.recipients.includes(email) && /\b\d{6}\b/u.test(mailText(message)));
  assert.ok(message?.secure, "The application delivered the OTP over authenticated TLS");
  const code = /\b(\d{6})\b/u.exec(mailText(message))?.[1];
  assert.ok(code, "The owned SMTP sink received an OTP");
  privateValues.add(code);
  return code;
}
async function verifyInUi(page, email, locale, { wrongCode = false } = {}) {
  const copy = getPluginWorkflowCopy(locale);
  await page.locator("#plugin-email").fill(email);
  const start = fixture.messages.length;
  const requestPromise = page.waitForResponse(response => response.url().endsWith("/api/plugin-lab/email-code/request") && response.request().method() === "POST");
  await page.getByRole("button", { name: copy.sendCode, exact: true }).click();
  const requested = await requestPromise;
  assert.equal(requested.status(), 202, "OTP request succeeded through the built application");
  const challenge = await requested.json();
  privateValues.add(challenge.challengeId);
  const code = latestCode(email, start);
  const input = page.locator("#plugin-email-code");
  await input.waitFor();
  assert.equal(await page.getByRole("button", { name: copy.verifyEmail, exact: true }).getAttribute("type"), "button");
  if (wrongCode) {
    await input.fill(code === "000000" ? "111111" : "000000");
    const invalidPromise = page.waitForResponse(response => response.url().endsWith("/api/plugin-lab/email-code/verify"));
    await input.press("Enter");
    assert.equal((await invalidPromise).status(), 400);
    await page.locator("#plugin-email-error").waitFor();
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    const cooldown = await http(page.context(), "/api/plugin-lab/email-code/request", { method: "POST", data: { email, locale } });
    assert.equal(cooldown.status(), 429, "Real cooldown rejects an immediate duplicate request");
  }
  await input.fill(code);
  const verifyPromise = page.waitForResponse(response => response.url().endsWith("/api/plugin-lab/email-code/verify"));
  await input.press("Enter");
  const verified = await verifyPromise;
  assert.equal(verified.status(), 200);
  const reused = await http(page.context(), "/api/plugin-lab/email-code/verify", { method: "POST", data: { challengeId: challenge.challengeId, code } });
  assert.equal(reused.status(), 400, "A consumed OTP cannot be replayed");
  assert.equal(new URL(page.url()).search, "", "No access data enters the URL");
}
async function verifyByHttp(context, email, locale = "en") {
  const start = fixture.messages.length;
  const requested = await http(context, "/api/plugin-lab/email-code/request", { method: "POST", data: { email, locale } });
  assert.equal(requested.status(), 202);
  const { challengeId } = await requested.json();
  privateValues.add(challengeId);
  const code = latestCode(email, start);
  const verified = await http(context, "/api/plugin-lab/email-code/verify", { method: "POST", data: { challengeId, code } });
  assert.equal(verified.status(), 200);
}
async function screenshotMatrix(page, locale, stage) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => ({ width: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(layout.doc <= layout.width + 1 && layout.body <= layout.width + 1, `${locale} ${stage} ${viewport.width}px has no horizontal overflow: ${JSON.stringify(layout)}`);
    const path = join(evidence, `${stage}-${locale}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path, fullPage: false });
    report.screenshots.push({ locale, stage, viewport, path });
    if (viewport.width === 360) await page.screenshot({ path: path.replace(".png", "-full.png"), fullPage: true });
  }
  persist();
}
async function assertLabels(page) {
  const unlabeled = await page.locator("main input, main textarea, main select").evaluateAll(elements => elements.filter(element => {
    if (element.type === "hidden" || !element.getClientRects().length) return false;
    return !element.labels?.length && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby");
  }).map(element => element.id || element.name || element.tagName));
  assert.deepEqual(unlabeled, [], "Every visible input has a programmatic label");
}
async function fillIdea(page, locale) {
  const data = {
    en: { title: "Compare discussion networks across lessons", researchQuestion: "How do students connect evidence and explanation across two synthetic lessons?", proposedChange: "Show aligned network views and a clear difference plot for each lesson." },
    "zh-hans": { title: "比较不同课次中的讨论网络", researchQuestion: "学生在两节合成示例课中如何连接证据与解释？", proposedChange: "展示对齐的网络视图，并为每节课提供清晰的差异图。" },
    "zh-hant": { title: "比較不同課次中的討論網絡", researchQuestion: "學生在兩節合成示例課中如何連結證據與解釋？", proposedChange: "展示對齊的網絡視圖，並為每節課提供清晰的差異圖。" },
  }[locale];
  for (const [name, value] of Object.entries(data)) await page.locator(`#plugin-${name}`).fill(value);
  await page.locator("#plugin-dataSafetyConfirmed").check();
  await page.locator("#plugin-privacyConsent").check();
  return data;
}
async function saveReceipt(page, locale) {
  const copy = getPluginWorkflowCopy(locale);
  await page.getByRole("heading", { name: copy.proposalReceived, exact: true }).waitFor();
  const id = await page.locator(".plugin-receipt code").innerText();
  assert.match(id, /^plg_[A-Za-z0-9_-]{22}$/u);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: copy.downloadReceipt, exact: true }).click();
  const download = await downloadPromise;
  const receiptPath = join(evidence, `receipt-${locale}.txt`);
  await download.saveAs(receiptPath);
  const receipt = readFileSync(receiptPath, "utf8");
  assert.ok(receipt.includes(id) && receipt.includes(`/${locale}/plugins/status`));
  assert.doesNotMatch(receipt, /(?:\?|#)(?:code|token|session)|@example\./iu);
  await screenshotMatrix(page, locale, "receipt");
  return id;
}

try {
  fixtureStarting = startPluginLabFixture({ evidenceDirectory: evidence, distDirectory: process.env.ENA_PLUGIN_LAB_TEST_DIST_DIR || ".next" });
  fixture = await fixtureStarting;
  if (interrupted) throw new Error("Acceptance interrupted during fixture startup.");
  const apiRoute = await fetch(`${fixture.origin}/api/plugin-lab/session`, { redirect: "manual" });
  assert.equal(apiRoute.status, 401, "The Plugin Lab API must reach its handler without a legacy alias redirect");
  assert.equal(apiRoute.headers.get("location"), null);
  browser = await chromium.launch({ headless: true });
  pass("Owned PostgreSQL + authenticated STARTTLS + built Next app start without project .env");
  const owner = await newContext();
  const page = await owner.newPage();
  const copy = getPluginWorkflowCopy("en");
  await page.goto(`${fixture.origin}/en/plugins/propose`);
  await page.locator("#plugin-title").waitFor();
  assert.equal(await page.locator("input[name=visibility]:checked").inputValue(), "private");
  assert.equal(await page.locator("#plugin-privacyConsent").isChecked(), false);
  assert.equal(await page.locator("#plugin-dataSafetyConfirmed").isChecked(), false);
  await page.getByRole("button", { name: copy.submit, exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === "plugin-title");
  assert.equal(await page.locator("#plugin-title").getAttribute("aria-invalid"), "true");
  const idea = await fillIdea(page, "en");
  await assertLabels(page);
  await page.locator("#plugin-title").focus(); await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "plugin-researchQuestion");
  pass("Private defaults, unchecked consent, field error focus, labels and keyboard order");
  await page.locator("#plugin-email").fill("researcher@example.org");
  await screenshotMatrix(page, "en", "proposal");
  await verifyInUi(page, "researcher@example.org", "en", { wrongCode: true });
  await page.getByText(`✓ ${copy.verified}`, { exact: true }).waitFor();
  assert.equal(await countProposals(), 0);
  assert.equal(proposalPosts.length, 0);
  assert.equal(await page.locator("#plugin-title").inputValue(), idea.title);
  pass("Invalid OTP and resend cooldown are enforced; valid OTP is single-use and never auto-submits");

  let loseResponse = true;
  const attempts = [];
  await page.route("**/api/plugin-lab/proposals", async route => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
    const response = await route.fetch();
    if (loseResponse) { loseResponse = false; assert.equal(response.status(), 201); await route.abort("failed"); }
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: copy.submit, exact: true }).click();
  await page.getByRole("button", { name: copy.retrySubmission, exact: true }).waitFor();
  assert.equal(await countProposals(), 1, "The first write committed before the response was lost");
  assert.equal(await page.locator("#plugin-title").inputValue(), idea.title);
  assert.equal(await page.locator("#plugin-title").isDisabled(), true);
  await page.screenshot({ path: join(evidence, "submission-response-lost.png"), fullPage: true });
  await page.getByRole("button", { name: copy.retrySubmission, exact: true }).click();
  const proposalId = await saveReceipt(page, "en");
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[1], attempts[0], "Retry preserves the exact idempotency key and request body");
  assert.equal(await countProposals(), 1);
  pass("Lost submit response retains draft; exact retry yields one immutable proposal and downloadable receipt");

  await resetCooldown("researcher@example.org");
  const returning = await newContext();
  const statusPage = await returning.newPage();
  await statusPage.goto(`${fixture.origin}/en/plugins/status`);
  const beforeReturn = proposalPosts.length;
  await verifyInUi(statusPage, "researcher@example.org", "en");
  await statusPage.getByRole("heading", { name: idea.title, exact: true }).waitFor();
  assert.equal(proposalPosts.length, beforeReturn);
  await assertLabels(statusPage);
  await screenshotMatrix(statusPage, "en", "status-received");
  pass("Fresh browser session recovers the owned proposal using email verification");

  const operatorContext = await newContext();
  const operatorToken = createOpenEnaSessionTokenV2(Date.now(), fixture.environment);
  privateValues.add(operatorToken);
  await operatorContext.addCookies([{ name: OPEN_ENA_SESSION_COOKIE, value: operatorToken, url: fixture.origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
  const operatorPage = await operatorContext.newPage();
  await operatorPage.goto(`${fixture.origin}/en/plugins/operator`);
  let card = operatorPage.locator(".plugin-operator-card").filter({ hasText: proposalId });
  await card.waitFor();
  async function operatorTransition(to, message = "") {
    await card.locator("select[name=to]").selectOption(to);
    await card.locator("[name=reason]").fill("Synthetic internal reviewer note not visible to researchers.");
    await card.locator("textarea[name=researcherMessage]").fill(message);
    const responsePromise = operatorPage.waitForResponse(response => response.url().endsWith(`/proposals/${proposalId}/transition`));
    await card.getByRole("button", { name: copy.recordTransition, exact: true }).click();
    assert.equal((await responsePromise).status(), 200);
    await operatorPage.waitForFunction(({ id, state }) => {
      const row = [...document.querySelectorAll(".plugin-operator-card")].find(element => element.textContent?.includes(id));
      return row && !row.querySelector(`select[name=to] option[value="${state}"]`);
    }, { id: proposalId, state: to });
    card = operatorPage.locator(".plugin-operator-card").filter({ hasText: proposalId });
  }
  await operatorTransition("under-review");
  const question = "Please clarify how the two synthetic lessons should be aligned for comparison.";
  await operatorTransition("needs-information", question);
  await operatorPage.screenshot({ path: join(evidence, "operator-information-request.png"), fullPage: true });
  await statusPage.getByRole("button", { name: copy.refresh, exact: true }).click();
  await statusPage.locator("#plugin-reply").waitFor();
  assert.equal(await statusPage.getByText(question, { exact: true }).count(), 1);
  assert.doesNotMatch(await statusPage.locator("main").innerText(), /Synthetic internal reviewer note/u);
  await screenshotMatrix(statusPage, "en", "status-needs-information");
  const reply = "Use the same synthetic code labels and align lesson windows by the discussion start.";
  await statusPage.locator("#plugin-reply").fill(reply);
  let loseReply = true;
  const replyAttempts = [];
  await statusPage.route(`**/api/plugin-lab/proposals/${proposalId}/replies`, async route => {
    replyAttempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
    const response = await route.fetch();
    if (loseReply) { loseReply = false; assert.equal(response.status(), 201); await route.abort("failed"); }
    else await route.fulfill({ response });
  });
  await statusPage.getByRole("button", { name: copy.sendReply, exact: true }).click();
  await statusPage.getByRole("button", { name: copy.retryReply, exact: true }).waitFor();
  assert.equal(await statusPage.locator("#plugin-reply").inputValue(), reply);
  assert.equal(await statusPage.locator("#plugin-reply").isDisabled(), true);
  await statusPage.getByRole("button", { name: copy.retryReply, exact: true }).click();
  await statusPage.locator('.plugin-conversation [data-actor="researcher"] p').filter({ hasText: reply }).waitFor();
  await statusPage.locator("#plugin-reply").waitFor({ state: "detached" });
  assert.equal(replyAttempts.length, 2);
  assert.deepEqual(replyAttempts[0], replyAttempts[1]);
  const persisted = await fixture.database.query("SELECT state,awaiting_reply_review FROM ena_plugin_proposals WHERE proposal_id=$1", [proposalId]);
  assert.deepEqual(persisted.rows[0], { state: "under-review", awaiting_reply_review: true });
  const messageCount = await fixture.database.query("SELECT actor,count(*)::integer AS count FROM ena_plugin_workflow_messages WHERE proposal_id=$1 GROUP BY actor ORDER BY actor", [proposalId]);
  assert.deepEqual(messageCount.rows, [{ actor: "operator", count: 1 }, { actor: "researcher", count: 1 }]);
  await operatorPage.reload();
  await operatorPage.getByLabel(copy.awaitingOnly, { exact: true }).check();
  await operatorPage.getByText(reply, { exact: true }).waitFor();
  pass("Operator asks for information; researcher sees only public question; reply replay commits once and returns to review");

  const workerHeaders = { authorization: `Bearer ${fixture.environment.ENA_PLUGIN_LAB_WORKER_TOKEN}` };
  const unauthorizedWorker = await http(returning, "/api/plugin-lab/notifications/deliver", { method: "POST" });
  assert.equal(unauthorizedWorker.status(), 401);
  fixture.rejectMail(true);
  const failedDelivery = await http(operatorContext, "/api/plugin-lab/notifications/deliver", { method: "POST", headers: workerHeaders });
  assert.equal(failedDelivery.status(), 200);
  const failedResult = await failedDelivery.json();
  assert.ok(failedResult.failed > 0 && failedResult.sent === 0);
  const failures = await fixture.database.query("SELECT status,attempts,last_error_code FROM ena_plugin_workflow_notifications WHERE attempts>0");
  assert.ok(failures.rows.every(row => row.status === "pending" && row.attempts === 1 && row.last_error_code === "delivery-failed"));
  assert.equal(await countProposals(), 1);
  fixture.rejectMail(false);
  await fixture.database.query("UPDATE ena_plugin_workflow_notifications SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE status='pending'");
  for (let batch = 0; batch < 5; batch++) {
    const delivered = await http(operatorContext, "/api/plugin-lab/notifications/deliver", { method: "POST", headers: workerHeaders });
    assert.equal(delivered.status(), 200);
    const result = await delivered.json(); assert.equal(result.failed, 0);
    if (!result.claimed) break;
  }
  const deliveryCounts = await fixture.database.query("SELECT status,count(*)::integer AS count FROM ena_plugin_workflow_notifications GROUP BY status");
  assert.deepEqual(deliveryCounts.rows, [{ status: "sent", count: 5 }]);
  const notificationMessages = fixture.messages.filter(message => mailText(message).includes(proposalId));
  assert.equal(notificationMessages.length, 5);
  for (const message of notificationMessages) {
    const text = mailText(message); assert.ok(message.secure);
    assert.doesNotMatch(text, /Synthetic internal reviewer note|Use the same synthetic code|Please clarify how|\?(?:code|token|session)=/u);
  }
  pass("Outbox rejects unauthenticated workers, retains failed delivery, then retries all five notifications over TLS");

  const other = await newContext();
  await verifyByHttp(other, "other-researcher@example.org");
  assert.deepEqual((await (await http(other, "/api/plugin-lab/proposals")).json()).proposals, []);
  assert.equal((await http(other, `/api/plugin-lab/proposals/${proposalId}`)).status(), 404);
  assert.equal((await http(other, `/api/plugin-lab/proposals/${proposalId}/replies`, { method: "POST", data: { text: "Synthetic unauthorized reply." }, headers: { "idempotency-key": randomUUID() } })).status(), 404);
  assert.equal((await http(other, `/api/plugin-lab/operator/proposals/${proposalId}/transition`, { method: "POST", data: { from: "under-review", to: "withdrawn", reason: "Synthetic unauthorized transition." } })).status(), 401);
  pass("A separately verified researcher cannot read, reply to, or administer another owner's proposal");

  const legacyId = "plg_LLLLLLLLLLLLLLLLLLLLLL";
  const legacyCode = "L".repeat(43);
  privateValues.add(legacyCode);
  const key = Buffer.from(fixture.environment.ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1, "base64url");
  const legacySubmission = { email: "legacy@example.org", name: null, affiliation: null, title: "Synthetic legacy proposal", researchQuestion: "How can a prior idea be followed up?", currentGap: "A historical workflow without an email session.", proposedChange: "Preserve scoped access.", unchangedBoundary: "Existing analytical models remain unchanged.", publicSummary: "A synthetic legacy summary.", privateDetails: "Synthetic details only.", referenceLinks: [], visibility: "private", track: "academic", dataSafetyConfirmed: true, privacyConsent: true };
  const projectionText = JSON.stringify({ title: legacySubmission.title, publicSummary: legacySubmission.publicSummary });
  const legacyStore = createPostgresPluginLabStore((sql, params) => fixture.database.query(sql, params));
  await legacyStore.createProposal({ proposalId: legacyId, accessHash: hashPluginLabAccessCode(legacyId, legacyCode, fixture.environment.ENA_PLUGIN_LAB_SECRET), payloadCipher: encryptPluginLabText(JSON.stringify(legacySubmission), key, "v1", `proposal-payload:${legacyId}`), publicProjectionCipher: encryptPluginLabText(projectionText, key, "v1", `public-projection:${legacyId}`), publicProjectionSha256: createHash("sha256").update(projectionText).digest("hex"), track: "academic", visibility: "private", submittedLocale: "en" });
  const legacyContext = await newContext();
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(`${fixture.origin}/en/plugins/status`);
  await legacyPage.getByText(copy.legacyTitle, { exact: true }).click();
  await legacyPage.locator("#plugin-legacy-id").fill(legacyId);
  await legacyPage.locator("#plugin-legacy-code").fill(legacyCode);
  await legacyPage.getByRole("button", { name: copy.viewStatus, exact: true }).click();
  await legacyPage.getByRole("heading", { name: legacySubmission.title, exact: true }).waitFor();
  assert.equal((await (await http(legacyContext, "/api/plugin-lab/proposals")).json()).proposals.length, 1);
  assert.equal((await http(legacyContext, `/api/plugin-lab/proposals/${proposalId}`)).status(), 404);
  assert.equal((await http(legacyContext, "/api/plugin-lab/session")).status(), 401);
  assert.equal((await http(legacyContext, "/api/plugin-lab/proposals", { method: "POST", data: { schemaVersion: 2 }, headers: { "idempotency-key": randomUUID() } })).status(), 401);
  assert.equal(new URL(legacyPage.url()).search, "");
  await legacyPage.screenshot({ path: join(evidence, "legacy-scoped-status.png"), fullPage: true });
  pass("An older ID/access code opens only its proposal without verifying email or exposing credentials in URLs");

  for (const locale of ["zh-hans", "zh-hant"]) {
    const localCopy = getPluginWorkflowCopy(locale);
    const localContext = await newContext();
    const localPage = await localContext.newPage();
    await localPage.goto(`${fixture.origin}/${locale}/plugins/propose`);
    const localIdea = await fillIdea(localPage, locale);
    await localPage.locator("#plugin-email").fill(`${locale}@example.org`);
    await assertLabels(localPage);
    await screenshotMatrix(localPage, locale, "proposal");
    const beforeVerify = await countProposals();
    await verifyInUi(localPage, `${locale}@example.org`, locale);
    await localPage.getByText(`✓ ${localCopy.verified}`, { exact: true }).waitFor();
    assert.equal(await countProposals(), beforeVerify);
    await localPage.getByRole("button", { name: localCopy.submit, exact: true }).click();
    await saveReceipt(localPage, locale);
    await localPage.getByRole("link", { name: localCopy.myProposals, exact: true }).click();
    await localPage.getByRole("heading", { name: localIdea.title, exact: true }).waitFor();
    await screenshotMatrix(localPage, locale, "status-received");
    pass(`${locale} complete form, email verification, receipt and owned status journey at three responsive sizes`);
  }

  for (const locale of ["en", "zh-hans", "zh-hant"]) {
    await operatorPage.goto(`${fixture.origin}/${locale}/plugins/operator`);
    await operatorPage.getByRole("heading", { name: getPluginWorkflowCopy(locale).operatorTitle, exact: true }).waitFor();
    await operatorPage.locator(".plugin-operator-card").first().waitFor();
    await assertLabels(operatorPage);
    await screenshotMatrix(operatorPage, locale, "operator");
  }
  pass("Localized operator inbox, filters, messages and delivery status remain labeled and responsive at all nine locale/viewport pairs");

  const failureContext = await newContext();
  const failurePage = await failureContext.newPage();
  await failurePage.goto(`${fixture.origin}/en/plugins/propose`);
  const failedIdea = await fillIdea(failurePage, "en");
  await failurePage.locator("#plugin-email").fill("smtp-failure@example.org");
  fixture.rejectMail(true);
  const failedOtpPromise = failurePage.waitForResponse(response => response.url().endsWith("/api/plugin-lab/email-code/request"));
  await failurePage.getByRole("button", { name: copy.sendCode, exact: true }).click();
  assert.equal((await failedOtpPromise).status(), 503);
  await failurePage.locator("#plugin-email-error").waitFor();
  assert.equal(await failurePage.locator("#plugin-title").inputValue(), failedIdea.title);
  assert.equal(await failurePage.locator("#plugin-email-code").count(), 0);
  const invalidated = await fixture.database.query("SELECT invalidated_at IS NOT NULL AS invalidated FROM ena_plugin_workflow_challenges WHERE email_ref=$1", [pluginLabEmailRef("smtp-failure@example.org", fixture.environment.ENA_PLUGIN_LAB_SECRET)]);
  assert.equal(invalidated.rows[0].invalidated, true);
  fixture.rejectMail(false);
  pass("SMTP failure keeps the draft, exposes an actionable error and invalidates the unsent challenge");

  const expiryContext = await newContext();
  await verifyByHttp(expiryContext, "expired-session@example.org");
  const expiryPage = await expiryContext.newPage();
  await expiryPage.goto(`${fixture.origin}/en/plugins/propose`);
  await expiryPage.getByText(`✓ ${copy.verified}`, { exact: true }).waitFor();
  const expiryIdea = await fillIdea(expiryPage, "en");
  const beforeExpirySubmit = await countProposals();
  await fixture.database.query("UPDATE ena_plugin_workflow_sessions SET revoked_at=clock_timestamp() WHERE email_ref=$1", [pluginLabEmailRef("expired-session@example.org", fixture.environment.ENA_PLUGIN_LAB_SECRET)]);
  const expiredPost = expiryPage.waitForResponse(response => response.url().endsWith("/api/plugin-lab/proposals") && response.request().method() === "POST");
  await expiryPage.getByRole("button", { name: copy.submit, exact: true }).click();
  assert.equal((await expiredPost).status(), 401);
  await expiryPage.getByRole("button", { name: copy.sendCode, exact: true }).waitFor();
  assert.equal(await expiryPage.locator("#plugin-title").inputValue(), expiryIdea.title);
  assert.equal(await expiryPage.locator("#plugin-title").isDisabled(), false);
  assert.equal(await countProposals(), beforeExpirySubmit);
  await resetCooldown("expired-session@example.org");
  await verifyInUi(expiryPage, "expired-session@example.org", "en");
  await expiryPage.getByText(`✓ ${copy.verified}`, { exact: true }).waitFor();
  assert.equal(await countProposals(), beforeExpirySubmit, "Re-verification does not submit a retained draft");
  await expiryPage.getByRole("button", { name: copy.submit, exact: true }).click();
  await expiryPage.getByRole("heading", { name: copy.proposalReceived, exact: true }).waitFor();
  assert.equal(await countProposals(), beforeExpirySubmit + 1);
  pass("Expired researcher session preserves the draft; re-verification requires a separate explicit submission");

  assert.deepEqual(browserErrors, []);
  assert.deepEqual(unexpectedRequests, []);
  assert.ok(fixture.smtpStatistics.authenticatedTls > 0);
  report.smtp = { ...fixture.smtpStatistics, capturedInMemoryOnly: true };
  report.proposalCount = await countProposals();
  report.browser = await browser.version();
  pass("No browser runtime errors or external service requests; screenshots have no horizontal overflow");
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.errors.push({ name: error?.name ?? "Error", message: redacted(error?.message ?? String(error)), stack: redacted(error?.stack) });
  process.exitCode = 1;
  console.error("Plugin Lab browser acceptance failed:", redacted(error?.message ?? String(error)));
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.close();
  if (fixture) {
    try { await fixture.cleanup(); }
    catch (error) { report.status = "FAIL"; report.errors.push({ name: "CleanupError", message: redacted(error.message) }); process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString(); persist();
  console.log(`Plugin Lab browser acceptance: ${report.status}; ${report.checks.length} checks; evidence ${evidence}`);
}
