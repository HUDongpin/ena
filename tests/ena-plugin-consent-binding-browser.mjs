// Run with: node --import tsx tests/ena-plugin-consent-binding-browser.mjs
// Actual component/handlers, synthetic in-memory records, intercepted browser traffic.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "playwright";
import { encryptPluginLabText, hashPluginLabAccessCode, PLUGIN_LAB_STATUS_COOKIE } from "../lib/plugin-lab/crypto.ts";
import { createPluginLabStatusSessionPostHandler } from "../lib/server/plugin-lab-status-route.ts";
import { createPluginLabPublicConsentPostHandler } from "../lib/server/plugin-lab-public-consent-route.ts";
import { readPluginLabStatusForSession, readPluginLabPublicSummaries } from "../lib/server/plugin-lab-read.ts";

const origin = "https://proposal-review.invalid";
const now = 1_800_000_000_000;
const key = Buffer.alloc(32, 19);
const environment = {
  NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: origin,
  ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://synthetic:synthetic@unused.invalid/synthetic?sslmode=verify-full",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: key.toString("base64url"),
  ENA_PLUGIN_LAB_SECRET: "synthetic-review-secret-at-least-thirty-two-characters",
};
const ids = { A: "plg_AAAAAAAAAAAAAAAAAAAAAA", B: "plg_BBBBBBBBBBBBBBBBBBBBBB" };
const codes = { A: "A".repeat(43), B: "B".repeat(43) };
function projection(proposalId, title) {
  const plaintext = JSON.stringify({ title, publicSummary: `Review the exact summary for ${title}.` });
  return {
    publicProjectionCipher: encryptPluginLabText(plaintext, key, "v1", `public-projection:${proposalId}`),
    publicProjectionSha256: createHash("sha256").update(plaintext).digest("hex"),
  };
}
const records = new Map(Object.entries(ids).map(([label, proposalId]) => [proposalId, {
  proposalId, state: "selected", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), events: [],
  visibility: "public-after-review", emailConfirmed: true, publicConsentStatus: "requested", publicModerationStatus: "approved",
  ...projection(proposalId, `Proposal ${label}`),
  accessHash: hashPluginLabAccessCode(proposalId, codes[label], environment.ENA_PLUGIN_LAB_SECRET),
}]));
const consentCalls = [];
const writes = [];
const store = {
  consumeRateLimit: async () => true, createProposal: async () => { throw new Error("Unexpected creation"); },
  accessHashFor: async id => records.get(id)?.accessHash ?? null,
  readStatus: async id => { const record = records.get(id); if (!record) return null; const { accessHash: _hash, ...status } = record; return status; },
  listForOperator: async () => [], transition: async () => false, rotateAccessHash: async () => false,
  confirmEmail: async () => false, previewRetention: async () => [], requestPublicConsent: async () => false,
  setPublicConsent: async (id, action, _actor, digest) => {
    consentCalls.push({ id, action, digest });
    const record = records.get(id);
    if (!record || record.state !== "selected" || record.visibility !== "public-after-review" || !record.emailConfirmed
      || record.publicModerationStatus !== "approved" || record.publicProjectionSha256 !== digest) return false;
    if (action === "confirm" ? record.publicConsentStatus !== "requested" : !["requested", "confirmed"].includes(record.publicConsentStatus)) return false;
    record.publicConsentStatus = action === "confirm" ? "confirmed" : "withdrawn";
    writes.push({ id, action }); return true;
  },
  listPublicSummaries: async () => [...records.values()].filter(record => record.publicConsentStatus === "confirmed"),
};
const dependencies = { environment, now: () => now + 1000, storeFactory: async () => store };
const statusHandler = createPluginLabStatusSessionPostHandler(dependencies);
const consentHandler = createPluginLabPublicConsentPostHandler(dependencies);
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import Controls from './components/plugin-lab/PluginPublicConsentControls';
const root = createRoot(document.getElementById('root')); let serial = 0;
window.mount = props => root.render(<Controls key={++serial} {...props} locale="en"/>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, write: false, bundle: true, jsx: "automatic", platform: "browser", format: "iife",
  plugins: [{ name: "router-stub", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router-stub", namespace: "review" }));
    builder.onLoad({ filter: /.*/, namespace: "review" }, () => ({ contents: "export const useRouter = () => ({refresh(){ window.reviewRefreshCount = (window.reviewRefreshCount || 0) + 1; }});", loader: "js" }));
  } }],
});
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const errors = [];
  const responses = [];
  await context.route("**/*", async route => {
    const incoming = route.request();
    assert.equal(new URL(incoming.url()).origin, origin, "No real network is permitted");
    if (incoming.method() !== "POST") {
      await route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div></body></html>' }); return;
    }
    const request = new Request(incoming.url(), { method: "POST", headers: await incoming.allHeaders(), body: incoming.postData() });
    const consent = incoming.url().endsWith("/consent");
    const response = consent ? await consentHandler(request) : await statusHandler(request);
    if (consent) responses.push(response.status);
    // Preserve the real exchange's Set-Cookie while emulating its final local page.
    const headers = Object.fromEntries(response.headers); delete headers.location;
    await route.fulfill({ status: response.status === 303 ? 200 : response.status, headers, body: await response.text() });
  });
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  for (const page of [pageA, pageB]) {
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/en/plugins/status`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
  }
  // Both tabs represent forms opened before either exchanged its access code.
  async function login(page, label) {
    await page.evaluate(async ({ label, ids, codes }) => {
      const response = await fetch("/api/plugin-lab/status-session", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ locale: "en", proposalId: ids[label], accessCode: codes[label] }) });
      if (!response.ok) throw new Error("Synthetic status exchange failed");
    }, { label, ids, codes });
  }
  async function mountCurrent(page) {
    const token = (await context.cookies()).find(cookie => cookie.name === PLUGIN_LAB_STATUS_COOKIE)?.value;
    const status = await readPluginLabStatusForSession(token, dependencies);
    assert.ok(status?.publicPreview);
    await page.evaluate(props => window.mount(props), { ...status.publicPreview, proposalId: status.proposalId, consentStatus: status.publicConsentStatus });
    await page.getByRole("heading", { name: status.publicPreview.title, exact: true }).waitFor();
  }
  async function click(page, label, expectedStatus) {
    const count = await page.evaluate(() => window.reviewRefreshCount || 0);
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForFunction(count => window.reviewRefreshCount === count + 1, count);
    assert.equal(responses.at(-1), expectedStatus);
  }
  await login(pageA, "A"); await mountCurrent(pageA);
  await login(pageB, "B"); await mountCurrent(pageB);
  await click(pageA, "Confirm publication", 409);
  await click(pageA, "Keep private", 409);
  assert.deepEqual(consentCalls, [], "A stale proposal identity must be rejected before a store write is attempted");
  assert.deepEqual(await readPluginLabPublicSummaries(dependencies), []);
  assert.equal(await pageA.getByRole("heading", { name: "Proposal A", exact: true }).count(), 1);
  await pageA.getByRole("alert").waitFor();

  await click(pageB, "Confirm publication", 200);
  assert.deepEqual((await readPluginLabPublicSummaries(dependencies)).map(record => record.title), ["Proposal B"]);
  await mountCurrent(pageB);
  await click(pageB, "Withdraw publication", 200);
  assert.deepEqual(await readPluginLabPublicSummaries(dependencies), []);

  await login(pageA, "A"); await mountCurrent(pageA);
  Object.assign(records.get(ids.A), projection(ids.A, "Revised proposal A"));
  await click(pageA, "Confirm publication", 409);
  await click(pageA, "Keep private", 409);
  assert.deepEqual(await readPluginLabPublicSummaries(dependencies), []);
  assert.equal(records.get(ids.A).publicConsentStatus, "requested");
  await mountCurrent(pageA);
  await click(pageA, "Confirm publication", 200);
  assert.deepEqual((await readPluginLabPublicSummaries(dependencies)).map(record => record.title), ["Revised proposal A"]);
  await mountCurrent(pageA);
  await click(pageA, "Withdraw publication", 200);
  assert.deepEqual(await readPluginLabPublicSummaries(dependencies), []);
  assert.deepEqual(writes, [{ id: ids.B, action: "confirm" }, { id: ids.B, action: "withdraw" }, { id: ids.A, action: "confirm" }, { id: ids.A, action: "withdraw" }]);
  assert.deepEqual(errors, []);
  console.log("Proposal consent: cross-tab and changed-projection decisions reject without mutation; current reviewed proposals confirm and withdraw. Eight browser actions passed.");
} finally { await browser.close(); }
