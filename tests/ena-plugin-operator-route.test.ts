import assert from "node:assert/strict";
import test from "node:test";
import {
  createPluginLabConfirmEmailPostHandler,
  createPluginLabOperatorCsrf,
  createPluginLabOperatorTransitionPostHandler,
  createPluginLabRetentionPreviewPostHandler,
  createPluginLabRotateAccessPostHandler,
} from "@/lib/server/plugin-lab-operator-route";
import type { OpenEnaPrincipal } from "@/lib/open-ena-auth";
import type { PluginLabStore } from "@/lib/plugin-lab/store";

const environment = {
  NODE_ENV: "production",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:secret@db.example/ena?sslmode=verify-full",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 5).toString("base64url"),
  ENA_PLUGIN_LAB_SECRET: "plugin-lab-operator-secret-with-32-characters",
};
const principal: OpenEnaPrincipal = {
  principalRef: "operator-principal",
  jti: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  issuedAtSeconds: 1_800_000_000,
  expiresAtSeconds: 1_800_043_200,
};

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

function request(body: unknown, csrf = createPluginLabOperatorCsrf(principal, environment.ENA_PLUGIN_LAB_SECRET)) {
  return new Request("https://www.ena.hk/api/plugin-lab/operator/proposals/plg_AAAAAAAAAAAAAAAAAAAAAA/transition", {
    method: "POST",
    headers: {
      origin: "https://www.ena.hk", "content-type": "application/json",
      cookie: "open-ena-session=valid-v2-token", "x-plugin-lab-csrf": csrf,
    },
    body: JSON.stringify(body),
  });
}

test("operator transition requires verified v2 authority and a bound CSRF token before storage", async () => {
  let storeRequested = false;
  const handler = createPluginLabOperatorTransitionPostHandler({
    environment,
    verifyOperator: async () => null,
    storeFactory: async () => { storeRequested = true; return fakeStore(); },
  });
  const unauthorized = await handler(request({ from: "received", to: "under-review", reason: "Review started." }), "plg_AAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(unauthorized.status, 401);
  assert.equal(storeRequested, false);

  const csrfHandler = createPluginLabOperatorTransitionPostHandler({ environment, verifyOperator: async () => principal, storeFactory: async () => fakeStore() });
  assert.equal((await csrfHandler(request({ from: "received", to: "under-review", reason: "Review started." }, "wrong"), "plg_AAAAAAAAAAAAAAAAAAAAAA")).status, 403);
});

test("operator transition encrypts its reason and appends only a valid forward transition", async () => {
  const writes: unknown[] = [];
  const handler = createPluginLabOperatorTransitionPostHandler({
    environment,
    verifyOperator: async () => principal,
    storeFactory: async () => fakeStore({ transition: async (input) => { writes.push(input); return true; } }),
  });
  const response = await handler(request({ from: "received", to: "under-review", reason: "Review started with unpublished context." }), "plg_AAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(writes.length, 1);
  const serialized = JSON.stringify(writes[0]);
  assert.doesNotMatch(serialized, /unpublished context/u);
  assert.match(serialized, /reasonCipher/u);
  assert.match(serialized, /proposal-under-review/u);

  const invalid = await handler(request({ from: "received", to: "selected", reason: "Skip review." }), "plg_AAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(invalid.status, 400);
  assert.equal(writes.length, 1);
});

test("access-code rotation returns a new code once and stores only its hash", async () => {
  const writes: unknown[] = [];
  const handler = createPluginLabRotateAccessPostHandler({
    environment,
    verifyOperator: async () => principal,
    storeFactory: async () => fakeStore({ rotateAccessHash: async (proposalId, accessHash) => { writes.push({ proposalId, accessHash }); return true; } }),
  });
  const response = await handler(request({ action: "rotate" }), "plg_AAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(response.status, 200);
  const body = await response.json() as { accessCode: string };
  assert.match(body.accessCode, /^[A-Za-z0-9_-]{43}$/u);
  assert.doesNotMatch(JSON.stringify(writes), new RegExp(body.accessCode, "u"));
  assert.match(JSON.stringify(writes), /[0-9a-f]{64}/u);
});

test("operator state conflicts are explicit without leaking proposal details", async () => {
  const handler = createPluginLabOperatorTransitionPostHandler({ environment, verifyOperator: async () => principal, storeFactory: async () => fakeStore() });
  const response = await handler(request({ from: "received", to: "under-review", reason: "Review started." }), "plg_AAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(response.status, 409);
  assert.equal(await response.text(), "Proposal state changed; reload before retrying.");
});

test("operator records manual email confirmation before public-consent review", async () => {
  const writes: unknown[] = [];
  const handler = createPluginLabConfirmEmailPostHandler({
    environment,
    verifyOperator: async () => principal,
    storeFactory: async () => fakeStore({ confirmEmail: async (proposalId, actorRef) => { writes.push({ proposalId, actorRef }); return true; } }),
  });
  const response = await handler(request({ action: "confirm-email" }), "plg_AAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(response.status, 200);
  assert.equal(writes.length, 1);
  assert.doesNotMatch(JSON.stringify(writes), /operator-principal/u);
});

test("retention preview is read-only, bounded, and returns no encrypted payload", async () => {
  const before = "2026-03-06T00:00:00.000Z";
  const handler = createPluginLabRetentionPreviewPostHandler({
    environment,
    verifyOperator: async () => principal,
    storeFactory: async () => fakeStore({
      previewRetention: async (input) => {
        assert.deepEqual(input, { before, limit: 200 });
        return [{ proposalId: "plg_AAAAAAAAAAAAAAAAAAAAAA", state: "not-selected", updatedAt: "2026-01-01T00:00:00.000Z" }];
      },
    }),
  });
  const response = await handler(request({ action: "preview", before }));
  assert.equal(response.status, 200);
  const serialized = JSON.stringify(await response.json());
  assert.match(serialized, /not-selected/u);
  assert.doesNotMatch(serialized, /payload|cipher|email/u);
});
