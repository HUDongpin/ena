import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createPluginLabRequestSourceRef,
  createPluginLabProposalPostHandler,
  PLUGIN_LAB_PROPOSAL_MAX_REQUEST_BYTES,
} from "@/lib/server/plugin-lab-proposal-route";
import { createPluginLabStatusSessionPostHandler } from "@/lib/server/plugin-lab-status-route";
import type { PluginLabStore } from "@/lib/plugin-lab/store";

const projectRoot = process.cwd();
const key = Buffer.alloc(32, 9).toString("base64url");
const environment = {
  NODE_ENV: "production",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:secret@db.example/ena?sslmode=verify-full",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: key,
  ENA_PLUGIN_LAB_SECRET: "plugin-lab-production-secret-with-32-characters",
  ENA_PLUGIN_LAB_PROPOSALS_ENABLED: "true",
};

function validBody() {
  return {
    email: "researcher@example.org", name: "Researcher", affiliation: "University",
    title: "A proposed ENA extension", researchQuestion: "How can this ENA relationship be studied?",
    currentGap: "The current tool does not implement this specified capability.",
    proposedChange: "Create a reviewed presentation and analysis contract.",
    unchangedBoundary: "Keep the original code meanings and provenance unchanged.",
    publicSummary: "A proposal for a reviewed ENA extension.",
    privateDetails: "Additional unpublished context for the review team.",
    referenceLinks: "https://doi.org/10.1000/example", visibility: "private", track: "academic",
    dataSafetyConfirmed: "yes", privacyConsent: "yes",
  };
}

function request(body: string, headers: HeadersInit = {}) {
  return new Request("https://www.ena.hk/api/plugin-lab/proposals", {
    method: "POST", body,
    headers: { origin: "https://www.ena.hk", "content-type": "application/json", ...headers },
  });
}

function fakeStore(overrides: Partial<PluginLabStore> = {}): PluginLabStore {
  return {
    consumeRateLimit: async () => true,
    createProposal: async () => undefined,
    accessHashFor: async () => null,
    readStatus: async () => null,
    listForOperator: async () => [],
    transition: async () => false,
    rotateAccessHash: async () => false,
    confirmEmail: async () => false,
    previewRetention: async () => [],
    requestPublicConsent: async () => false,
    setPublicConsent: async () => false,
    listPublicSummaries: async () => [],
    ...overrides,
  };
}

test("proposal submission validates origin and request size before storage", async () => {
  let storeRequested = false;
  const handler = createPluginLabProposalPostHandler({ environment, storeFactory: async () => { storeRequested = true; return fakeStore(); } });
  const crossOrigin = await handler(request(JSON.stringify(validBody()), { origin: "https://attacker.example" }));
  assert.equal(crossOrigin.status, 403);
  assert.equal(storeRequested, false);

  const oversized = await handler(request("x".repeat(PLUGIN_LAB_PROPOSAL_MAX_REQUEST_BYTES + 1)));
  assert.equal(oversized.status, 413);
  assert.equal(storeRequested, false);
});

test("successful proposal submission stores ciphertext and returns a one-time access receipt", async () => {
  const writes: unknown[] = [];
  const handler = createPluginLabProposalPostHandler({
    environment,
    storeFactory: async () => fakeStore({ createProposal: async (input) => { writes.push(input); } }),
  });
  const response = await handler(request(JSON.stringify(validBody()), { "x-plugin-lab-locale": "zh-hant" }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const receipt = await response.json() as { proposalId: string; accessCode: string };
  assert.match(receipt.proposalId, /^plg_[A-Za-z0-9_-]{22}$/u);
  assert.match(receipt.accessCode, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(writes.length, 1);
  const serialized = JSON.stringify(writes[0]);
  assert.doesNotMatch(serialized, /researcher@example\.org|unpublished context|University/u);
  assert.doesNotMatch(serialized, new RegExp(receipt.accessCode, "u"));
  assert.match(serialized, /ciphertext|accessHash/u);
  assert.equal((writes[0] as { submittedLocale: string }).submittedLocale, "zh-hant");
});

test("rate-limit source references prefer a normalized proxy address without storing it", () => {
  const secret = environment.ENA_PLUGIN_LAB_SECRET;
  const first = new Request("https://www.ena.hk/api/plugin-lab/proposals", { headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1", "user-agent": "Browser A" } });
  const sameAddress = new Request("https://www.ena.hk/api/plugin-lab/proposals", { headers: { "x-forwarded-for": "203.0.113.8", "user-agent": "Browser B" } });
  const second = new Request("https://www.ena.hk/api/plugin-lab/proposals", { headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "Browser A" } });
  assert.equal(createPluginLabRequestSourceRef(first, secret, "submission-source"), createPluginLabRequestSourceRef(sameAddress, secret, "submission-source"));
  assert.notEqual(createPluginLabRequestSourceRef(first, secret, "submission-source"), createPluginLabRequestSourceRef(second, secret, "submission-source"));
  assert.doesNotMatch(createPluginLabRequestSourceRef(first, secret, "submission-source"), /203\.0\.113/u);
});

test("proposal submission fails closed for missing configuration, throttling, and store errors", async () => {
  const missing = createPluginLabProposalPostHandler({ environment: {}, storeFactory: async () => fakeStore() });
  assert.equal((await missing(request(JSON.stringify(validBody())))).status, 503);

  const limited = createPluginLabProposalPostHandler({ environment, storeFactory: async () => fakeStore({ consumeRateLimit: async () => false }) });
  assert.equal((await limited(request(JSON.stringify(validBody())))).status, 429);

  const failed = createPluginLabProposalPostHandler({ environment, storeFactory: async () => fakeStore({ createProposal: async () => { throw new Error("postgresql://secret"); } }) });
  const response = await failed(request(JSON.stringify(validBody())));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /postgres|secret|researcher/iu);
});

test("status access exchanges a valid code for a secure path-scoped cookie", async () => {
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const { hashPluginLabAccessCode } = await import("@/lib/plugin-lab/crypto");
  const accessCode = "B".repeat(43);
  const storedHash = hashPluginLabAccessCode(proposalId, accessCode, environment.ENA_PLUGIN_LAB_SECRET);
  const handler = createPluginLabStatusSessionPostHandler({
    environment,
    now: () => 1_800_000_000_000,
    storeFactory: async () => fakeStore({ accessHashFor: async () => storedHash }),
  });
  const body = new URLSearchParams({ locale: "en", proposalId, accessCode }).toString();
  const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/status-session", {
    method: "POST", body,
    headers: { origin: "https://www.ena.hk", "content-type": "application/x-www-form-urlencoded" },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://www.ena.hk/en/plugins/status");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /ena-plugin-proposal-status=/u);
  assert.match(cookie, /HttpOnly/iu);
  assert.match(cookie, /Secure/iu);
  assert.match(cookie, /SameSite=lax/iu);
  assert.match(cookie, /Path=\/en\/plugins\/status/iu);
  assert.doesNotMatch(cookie, new RegExp(accessCode, "u"));
});

test("status access uses one generic denial for unknown proposals and wrong codes", async () => {
  const handler = createPluginLabStatusSessionPostHandler({ environment, storeFactory: async () => fakeStore() });
  const body = new URLSearchParams({ locale: "en", proposalId: "plg_AAAAAAAAAAAAAAAAAAAAAA", accessCode: "B".repeat(43) }).toString();
  const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/status-session", {
    method: "POST", body,
    headers: { origin: "https://www.ena.hk", "content-type": "application/x-www-form-urlencoded" },
  }));
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Proposal access was not accepted.");
});

test("migration 005 owns five bounded Plugin Lab tables without raw IP or executable content", () => {
  const migration = readFileSync(join(projectRoot, "migrations", "005_ena_plugin_lab.sql"), "utf8");
  for (const table of ["ena_plugin_proposals", "ena_plugin_proposal_events", "ena_plugin_proposal_publication_events", "ena_plugin_proposal_access_tokens", "ena_plugin_proposal_rate_limits"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
  }
  assert.match(migration, /access_hash/u);
  assert.match(migration, /payload_cipher/u);
  assert.match(migration, /public_projection_sha256/u);
  assert.match(migration, /REVOKE UPDATE, DELETE ON ena_plugin_proposal_publication_events FROM PUBLIC/u);
  assert.match(migration, /email_confirmed_at/u);
  assert.match(migration, /email_confirmed_by/u);
  assert.doesNotMatch(migration, /raw_ip|ip_address|password|executable_url/iu);
});
