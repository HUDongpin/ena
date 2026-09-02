import assert from "node:assert/strict";
import test from "node:test";
import type { OpenEnaPrincipal } from "@/lib/open-ena-auth";
import { encryptPluginLabText, issuePluginLabStatusSession } from "@/lib/plugin-lab/crypto";
import type { PluginLabStore } from "@/lib/plugin-lab/store";
import {
  readPluginLabOperatorInbox,
  readPluginLabStatusForSession,
} from "@/lib/server/plugin-lab-read";

const environment = {
  ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:secret@db.example/ena",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 4).toString("base64url"),
  ENA_PLUGIN_LAB_SECRET: "plugin-lab-read-secret-with-at-least-32-characters",
};
const now = 1_800_000_000_000;
const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";

const status = {
  proposalId, state: "received" as const,
  createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z",
  events: [{ state: "received" as const, messageCode: "proposal-received", recordedAt: "2026-09-02T00:00:00.000Z" }],
};

function store(overrides: Partial<PluginLabStore> = {}): PluginLabStore {
  return {
    consumeRateLimit: async () => true, createProposal: async () => undefined,
    accessHashFor: async () => null, readStatus: async () => status, listForOperator: async () => [],
    transition: async () => false, rotateAccessHash: async () => false,
    confirmEmail: async () => false, previewRetention: async () => [],
    requestPublicConsent: async () => false, setPublicConsent: async () => false,
    listPublicSummaries: async () => [],
    ...overrides,
  };
}

test("status read accepts only a valid bound short-lived session", async () => {
  const token = issuePluginLabStatusSession(proposalId, now, environment.ENA_PLUGIN_LAB_SECRET);
  const valid = await readPluginLabStatusForSession(token, { environment, now: () => now + 1_000, storeFactory: async () => store() });
  assert.deepEqual(valid, status);
  assert.equal(await readPluginLabStatusForSession(`${token}x`, { environment, now: () => now + 1_000, storeFactory: async () => store() }), null);
});

test("operator inbox decrypts stored proposal fields only after verified v2 authority", async () => {
  const key = Buffer.alloc(32, 4);
  const submission = {
    email: "researcher@example.org", name: "Researcher", affiliation: null,
    title: "Private title", researchQuestion: "How does the network change?", currentGap: "A gap exists.",
    proposedChange: "Add the specified method.", unchangedBoundary: "Keep codes unchanged.",
    publicSummary: "A moderated summary.", privateDetails: "Private details.", referenceLinks: [],
    visibility: "private", track: "academic", dataSafetyConfirmed: true, privacyConsent: true,
  };
  const cipher = encryptPluginLabText(JSON.stringify(submission), key, "v1", `proposal-payload:${proposalId}`);
  const principal: OpenEnaPrincipal = { principalRef: "operator", jti: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", issuedAtSeconds: 1, expiresAtSeconds: 2_000_000_000 };
  const inbox = await readPluginLabOperatorInbox("valid-v2", {
    environment,
    verifyOperator: async () => principal,
    storeFactory: async () => store({ listForOperator: async () => [{ ...status, payloadCipher: cipher, track: "academic", visibility: "private", emailConfirmed: false, publicConsentStatus: "not-requested", publicModerationStatus: "pending" }] }),
  });
  assert.equal(inbox?.records[0].submission.email, "researcher@example.org");
  assert.equal(inbox?.records[0].submission.privateDetails, "Private details.");
  assert.match(inbox?.csrf ?? "", /^[A-Za-z0-9_-]{43}$/u);
  assert.doesNotMatch(JSON.stringify(inbox), /payloadCipher|publicProjectionCipher|ciphertext|"iv"|"tag"/u);

  assert.equal(await readPluginLabOperatorInbox("disposable-v3", {
    environment,
    verifyOperator: async () => null,
    storeFactory: async () => { throw new Error("must not run"); },
  }), null);
});
