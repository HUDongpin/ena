import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { OpenEnaPrincipal } from "@/lib/open-ena-auth";
import { encryptPluginLabText, issuePluginLabStatusSession, PLUGIN_LAB_STATUS_COOKIE } from "@/lib/plugin-lab/crypto";
import type { PluginLabStore } from "@/lib/plugin-lab/store";
import {
  createPluginLabRequestPublicConsentPostHandler,
} from "@/lib/server/plugin-lab-operator-route";
import { createPluginLabPublicConsentPostHandler } from "@/lib/server/plugin-lab-public-consent-route";
import { readPluginLabPublicSummaries, readPluginLabStatusForSession } from "@/lib/server/plugin-lab-read";

const environment = {
  NODE_ENV: "production",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:secret@db.example/ena?sslmode=verify-full",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 6).toString("base64url"),
  ENA_PLUGIN_LAB_SECRET: "plugin-lab-public-summary-secret-32-characters",
};
const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
const publicProjectionSha256 = "f".repeat(64);
const consentBody = (action: "confirm" | "withdraw", digest = publicProjectionSha256) => ({ action, proposalId, publicProjectionSha256: digest });
const principal: OpenEnaPrincipal = { principalRef: "operator", jti: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", issuedAtSeconds: 1, expiresAtSeconds: 2_000_000_000 };

function fakeStore(overrides: Partial<PluginLabStore> = {}): PluginLabStore {
  return {
    consumeRateLimit: async () => true, createProposal: async () => undefined,
    accessHashFor: async () => null, readStatus: async () => null, listForOperator: async () => [],
    transition: async () => false, rotateAccessHash: async () => false,
    confirmEmail: async () => false, previewRetention: async () => [],
    requestPublicConsent: async () => false, setPublicConsent: async () => false,
    listPublicSummaries: async () => [],
    ...overrides,
  };
}

test("operator moderation requests consent but cannot directly publish a summary", async () => {
  const writes: Array<{ id: string; actorRef: string }> = [];
  const { createPluginLabOperatorCsrf } = await import("@/lib/server/plugin-lab-operator-route");
  const handler = createPluginLabRequestPublicConsentPostHandler({ environment, verifyOperator: async () => principal, storeFactory: async () => fakeStore({ requestPublicConsent: async (id, actorRef) => { writes.push({ id, actorRef }); return true; } }) });
  const response = await handler(new Request(`https://www.ena.hk/api/plugin-lab/operator/proposals/${proposalId}/public-consent`, {
    method: "POST",
    headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: "open-ena-session=v2", "x-plugin-lab-csrf": createPluginLabOperatorCsrf(principal, environment.ENA_PLUGIN_LAB_SECRET) },
    body: JSON.stringify({ action: "request" }),
  }), proposalId);
  assert.equal(response.status, 200);
  assert.equal(writes[0]?.id, proposalId);
  assert.match(writes[0]?.actorRef ?? "", /^[A-Za-z0-9_-]{43}$/u);
  assert.doesNotMatch(JSON.stringify(writes), /operator-principal/u);
  assert.deepEqual(await response.json(), { proposalId, publicConsentStatus: "requested", publicModerationStatus: "approved" });
});

test("researcher consent requires the private status session and supports confirm or withdraw", async () => {
  const writes: string[] = [];
  const session = issuePluginLabStatusSession(proposalId, 1_800_000_000_000, environment.ENA_PLUGIN_LAB_SECRET);
  const handler = createPluginLabPublicConsentPostHandler({ environment, now: () => 1_800_000_001_000, storeFactory: async () => fakeStore({ setPublicConsent: async (id, action, actorRef, digest) => { assert.equal(digest, publicProjectionSha256); writes.push(`${id}:${action}:${actorRef}`); return true; } }) });
  const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/public-consent", {
    method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: `${PLUGIN_LAB_STATUS_COOKIE}=${session}` },
    body: JSON.stringify(consentBody("confirm")),
  }));
  assert.equal(response.status, 200);
  assert.match(writes[0] ?? "", new RegExp(`^${proposalId}:confirm:[A-Za-z0-9_-]{43}$`, "u"));

  const denied = await handler(new Request("https://www.ena.hk/api/plugin-lab/public-consent", {
    method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/json" }, body: JSON.stringify({ action: "confirm" }),
  }));
  assert.equal(denied.status, 401);
  assert.equal(writes.length, 1);
});

test("consent rejects stale proposal identity for confirm and withdraw before accessing the store", async () => {
  const session = issuePluginLabStatusSession("plg_BBBBBBBBBBBBBBBBBBBBBB", 1_800_000_000_000, environment.ENA_PLUGIN_LAB_SECRET);
  let storeRequested = false;
  const handler = createPluginLabPublicConsentPostHandler({ environment, now: () => 1_800_000_001_000,
    storeFactory: async () => { storeRequested = true; return fakeStore(); } });
  for (const action of ["confirm", "withdraw"] as const) {
    const response = await handler(new Request("https://www.ena.hk/en/plugins/status/consent", {
      method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: `${PLUGIN_LAB_STATUS_COOKIE}=${session}` },
      body: JSON.stringify(consentBody(action)),
    }));
    assert.equal(response.status, 409);
  }
  assert.equal(storeRequested, false);
});

test("consent requires an exact, well-formed proposal and projection binding", async () => {
  const session = issuePluginLabStatusSession(proposalId, 1_800_000_000_000, environment.ENA_PLUGIN_LAB_SECRET);
  let storeRequested = false;
  const handler = createPluginLabPublicConsentPostHandler({ environment, now: () => 1_800_000_001_000,
    storeFactory: async () => { storeRequested = true; return fakeStore(); } });
  for (const body of [
    { action: "confirm" },
    { action: "confirm", proposalId },
    { action: "withdraw", publicProjectionSha256 },
    { ...consentBody("confirm"), proposalId: "invalid" },
    { ...consentBody("confirm"), proposalId: null },
    { ...consentBody("confirm"), publicProjectionSha256: "f".repeat(63) },
    { ...consentBody("confirm"), publicProjectionSha256: "F".repeat(64) },
    { ...consentBody("confirm"), publicProjectionSha256: null },
    { ...consentBody("confirm"), action: "publish" },
    { ...consentBody("confirm"), extra: true },
  ]) {
    const response = await handler(new Request("https://www.ena.hk/en/plugins/status/consent", {
      method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: `${PLUGIN_LAB_STATUS_COOKIE}=${session}` },
      body: JSON.stringify(body),
    }));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(storeRequested, false);
});

test("same-proposal consent rejects an outdated projection and accepts the current reviewed digest", async () => {
  const session = issuePluginLabStatusSession(proposalId, 1_800_000_000_000, environment.ENA_PLUGIN_LAB_SECRET);
  const currentDigest = "a".repeat(64);
  const writes: string[] = [];
  const handler = createPluginLabPublicConsentPostHandler({ environment, now: () => 1_800_000_001_000,
    storeFactory: async () => fakeStore({ setPublicConsent: async (id, action, _actor, digest) => {
      assert.equal(id, proposalId);
      if (digest !== currentDigest) return false;
      writes.push(action); return true;
    } }) });
  const decide = (action: "confirm" | "withdraw", digest: string) => handler(new Request("https://www.ena.hk/en/plugins/status/consent", {
    method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: `${PLUGIN_LAB_STATUS_COOKIE}=${session}` },
    body: JSON.stringify(consentBody(action, digest)),
  }));
  for (const action of ["confirm", "withdraw"] as const) assert.equal((await decide(action, publicProjectionSha256)).status, 409);
  assert.deepEqual(writes, []);
  for (const action of ["confirm", "withdraw"] as const) assert.equal((await decide(action, currentDigest)).status, 200);
  assert.deepEqual(writes, ["confirm", "withdraw"]);
});

for (const declaredLength of [undefined, "8"] as const) {
  test(`researcher consent cancels oversized streams with ${declaredLength ? "false" : "no"} Content-Length`, async () => {
    const session = issuePluginLabStatusSession(proposalId, 1_800_000_000_000, environment.ENA_PLUGIN_LAB_SECRET);
    let bytesRead = 0;
    let cancelled = false;
    let storeRequested = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (bytesRead === 1024 * 1024) { controller.close(); return; }
        bytesRead += 1024;
        controller.enqueue(new Uint8Array(1024).fill(120));
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const handler = createPluginLabPublicConsentPostHandler({
      environment, now: () => 1_800_000_001_000,
      storeFactory: async () => { storeRequested = true; return fakeStore(); },
    });
    const headers = new Headers({ origin: "https://www.ena.hk", "content-type": "application/json", cookie: `${PLUGIN_LAB_STATUS_COOKIE}=${session}` });
    if (declaredLength) headers.set("content-length", declaredLength);
    const response = await handler(new Request("https://www.ena.hk/en/plugins/status/consent", {
      method: "POST", body: stream, headers, duplex: "half",
    } as RequestInit & { duplex: "half" }));
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Invalid consent request.");
    assert.equal(cancelled, true);
    assert.equal(bytesRead, 3 * 1024);
    assert.equal(storeRequested, false);
  });
}

test("public roadmap projection decrypts only consented store rows and exposes no contact or private details", async () => {
  const submission = {
    email: "private@example.org", name: "Private Name", affiliation: "Private University",
    title: "Public title", researchQuestion: "Question", currentGap: "Gap", proposedChange: "Change",
    unchangedBoundary: "Boundary", publicSummary: "Public moderated summary", privateDetails: "Never publish this",
    referenceLinks: [], visibility: "public-after-review", track: "academic", dataSafetyConfirmed: true, privacyConsent: true,
  };
  const publicProjectionPlaintext = JSON.stringify({ title: submission.title, publicSummary: submission.publicSummary });
  const publicProjectionCipher = encryptPluginLabText(publicProjectionPlaintext, Buffer.alloc(32, 6), "v1", `public-projection:${proposalId}`);
  const publicProjectionSha256 = createHash("sha256").update(publicProjectionPlaintext, "utf8").digest("hex");
  const summaries = await readPluginLabPublicSummaries({ environment, storeFactory: async () => fakeStore({ listPublicSummaries: async () => [{ proposalId, publicProjectionCipher, publicProjectionSha256, updatedAt: "2026-09-02T00:00:00.000Z" }] }) });
  assert.deepEqual(summaries, [{ proposalId, title: "Public title", publicSummary: "Public moderated summary", updatedAt: "2026-09-02T00:00:00.000Z" }]);
  assert.doesNotMatch(JSON.stringify(summaries), /private@example|Private Name|Private University|Never publish/iu);
  assert.deepEqual(await readPluginLabPublicSummaries({ environment, storeFactory: async () => fakeStore({ listPublicSummaries: async () => [{ proposalId, publicProjectionCipher, publicProjectionSha256: "0".repeat(64), updatedAt: "2026-09-02T00:00:00.000Z" }] }) }), []);
});

test("renewed consent publishes immediately and confirmed consent can remove the next public projection", async () => {
  const key = Buffer.alloc(32, 6);
  const publicProjectionPlaintext = JSON.stringify({ title: "Public title", publicSummary: "Public summary" });
  const publicProjectionCipher = encryptPluginLabText(publicProjectionPlaintext, key, "v1", `public-projection:${proposalId}`);
  const publicProjectionSha256 = createHash("sha256").update(publicProjectionPlaintext, "utf8").digest("hex");
  let publicConsentStatus: "requested" | "confirmed" | "withdrawn" = "requested";
  let proposalState: "selected" | "withdrawn" = "selected";
  const mutableStore = fakeStore({
    readStatus: async () => ({
      proposalId,
      state: proposalState,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      events: [],
      publicProjectionCipher,
      publicProjectionSha256,
      visibility: "public-after-review",
      emailConfirmed: true,
      publicConsentStatus,
      publicModerationStatus: "approved",
    }),
    setPublicConsent: async (_id, action, _actor, digest) => {
      if (digest !== publicProjectionSha256) return false;
      if (action === "confirm" && proposalState === "selected" && publicConsentStatus === "requested") { publicConsentStatus = "confirmed"; return true; }
      if (action === "withdraw" && (publicConsentStatus === "requested" || publicConsentStatus === "confirmed")) { publicConsentStatus = "withdrawn"; return true; }
      return false;
    },
    listPublicSummaries: async () => publicConsentStatus === "confirmed"
      ? [{ proposalId, publicProjectionCipher, publicProjectionSha256, updatedAt: "2026-09-02T00:00:00.000Z" }]
      : [],
  });
  const session = issuePluginLabStatusSession(proposalId, 1_800_000_000_000, environment.ENA_PLUGIN_LAB_SECRET);
  const statusDependencies = { environment, now: () => 1_800_000_001_000, storeFactory: async () => mutableStore };
  const handler = createPluginLabPublicConsentPostHandler(statusDependencies);
  const decide = (action: "confirm" | "withdraw") => handler(new Request("https://www.ena.hk/en/plugins/status/consent", {
    method: "POST",
    headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: `${PLUGIN_LAB_STATUS_COOKIE}=${session}` },
    body: JSON.stringify(consentBody(action, publicProjectionSha256)),
  }));

  const preview = await readPluginLabStatusForSession(session, statusDependencies);
  assert.ok(preview && "publicPreview" in preview);
  assert.deepEqual(preview.publicPreview, { title: "Public title", publicSummary: "Public summary", publicProjectionSha256 });
  assert.equal((await decide("confirm")).status, 200);
  assert.equal((await readPluginLabPublicSummaries(statusDependencies)).length, 1);
  const confirmed = await readPluginLabStatusForSession(session, statusDependencies);
  assert.equal(confirmed?.publicConsentStatus, "confirmed");
  assert.equal("publicPreview" in (confirmed ?? {}), true);
  assert.equal((await decide("withdraw")).status, 200);
  assert.deepEqual(await readPluginLabPublicSummaries(statusDependencies), []);

  publicConsentStatus = "requested";
  proposalState = "withdrawn";
  assert.equal((await decide("confirm")).status, 409);
  const withdrawnStatus = await readPluginLabStatusForSession(session, statusDependencies);
  assert.equal("publicPreview" in (withdrawnStatus ?? {}), false);
});
