import assert from "node:assert/strict";
import test from "node:test";
import { createPluginLabProposalPostHandler, createPluginLabRequestSourceRef } from "@/lib/server/plugin-lab-proposal-route";
import { createPluginLabStatusSessionPostHandler } from "@/lib/server/plugin-lab-status-route";
import { hashPluginLabAccessCode } from "@/lib/plugin-lab/crypto";
import type { PluginLabStore } from "@/lib/plugin-lab/store";

const environment = {
  NODE_ENV: "production",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://test:test@127.0.0.1/synthetic",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 7).toString("base64url"),
  ENA_PLUGIN_LAB_SECRET: "synthetic-plugin-lab-secret-for-review-only",
  ENA_PLUGIN_LAB_PROPOSALS_ENABLED: "true",
};
const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
const accessCode = "B".repeat(43);
function store() {
  const counts = new Map<string, number>();
  return {
    consumeRateLimit: async ({ scopeKind, scopeRef, limit }) => {
      const key = `${scopeKind}:${scopeRef}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count <= limit;
    },
    createProposal: async () => undefined,
    accessHashFor: async () => hashPluginLabAccessCode(proposalId, accessCode, environment.ENA_PLUGIN_LAB_SECRET),
    readStatus: async () => null,
    listForOperator: async () => [],
    transition: async () => false,
    rotateAccessHash: async () => false,
    confirmEmail: async () => false,
    previewRetention: async () => [],
    requestPublicConsent: async () => false,
    setPublicConsent: async () => false,
    listPublicSummaries: async () => [],
  } satisfies PluginLabStore;
}
function attackerHeaders(attempt: number) {
  return {
    origin: environment.OPEN_ENA_PUBLIC_ORIGIN,
    "x-vercel-forwarded-for": `203.0.113.${attempt}`,
    "x-forwarded-for": `203.0.113.${attempt}, 10.0.0.1`,
    "cf-connecting-ip": `203.0.113.${attempt}`,
    "x-real-ip": `203.0.113.${attempt}`,
    "user-agent": `Synthetic browser ${attempt}`,
  };
}
function submission(attempt: number) {
  return {
    email: `researcher${attempt}@example.org`, name: "Researcher", affiliation: "University",
    title: "A proposed ENA extension", researchQuestion: "How can this ENA relationship be studied?",
    currentGap: "The current tool does not implement this specified capability.",
    proposedChange: "Create a reviewed presentation and analysis contract.",
    unchangedBoundary: "Keep original code meanings and provenance unchanged.",
    publicSummary: "A proposal for a reviewed ENA extension.", privateDetails: "Synthetic context.",
    referenceLinks: "https://example.org", visibility: "private", track: "academic",
    dataSafetyConfirmed: "yes", privacyConsent: "yes",
  };
}

test("untrusted forwarding headers and user agents cannot reset proposal submission throttling", async () => {
  const durable = store();
  const handler = createPluginLabProposalPostHandler({ environment, storeFactory: async () => durable });
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/proposals", {
      method: "POST", body: JSON.stringify(submission(attempt)),
      headers: { ...attackerHeaders(attempt), "content-type": "application/json" },
    }));
    assert.equal(response.status, attempt <= 5 ? 201 : 429);
  }
});

test("only the configured single valid proxy address contributes to attribution", () => {
  const trusted = { ...environment, OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-owned-client-ip" };
  const ref = (address?: string) => createPluginLabRequestSourceRef(new Request("https://www.ena.hk", {
    headers: { ...attackerHeaders(1), ...(address === undefined ? {} : { "x-owned-client-ip": address }) },
  }), environment.ENA_PLUGIN_LAB_SECRET, "submission-source", trusted);
  for (const malformed of ["203.0.113.8, 10.0.0.1", "999.999.999.999", "deadbeef", "not-an-ip"]) {
    assert.equal(ref(malformed), ref());
  }
  assert.notEqual(ref("203.0.113.8"), ref());
  assert.notEqual(ref("203.0.113.8"), ref("203.0.113.9"));
  assert.equal(ref("2001:DB8::8"), ref("2001:db8::8"));
});

test("untrusted forwarding headers and user agents cannot reset proposal access throttling", async () => {
  const durable = store();
  const handler = createPluginLabStatusSessionPostHandler({ environment, storeFactory: async () => durable });
  for (let attempt = 1; attempt <= 11; attempt += 1) {
    const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/status-session", {
      method: "POST", body: new URLSearchParams({ locale: "en", proposalId, accessCode }).toString(),
      headers: { ...attackerHeaders(attempt), "content-type": "application/x-www-form-urlencoded" },
    }));
    assert.equal(response.status, attempt <= 10 ? 303 : 403);
  }
});
