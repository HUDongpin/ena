import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresPluginLabStore } from "@/lib/plugin-lab/store";

test("public-summary gates require selected state, verified email, moderation, and renewed consent", async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const store = createPostgresPluginLabStore(async (sql, params = []) => {
    calls.push({ sql, params });
    if (/SELECT p\.proposal_id, p\.public_projection_cipher/u.test(sql)) {
      return { rows: [{ proposal_id: proposalId, public_projection_cipher: {}, public_projection_sha256: "f".repeat(64), updated_at: "2026-09-02T00:00:00.000Z" }] };
    }
    return { rows: [{ proposal_id: proposalId }] };
  });

  assert.equal(await store.confirmEmail(proposalId, "A".repeat(43)), true);
  assert.equal(await store.requestPublicConsent(proposalId, "B".repeat(43)), true);
  await store.listPublicSummaries();

  assert.match(calls[0].sql, /state = 'selected'[\s\S]*visibility = 'public-after-review'[\s\S]*email_confirmed_at IS NULL/u);
  assert.deepEqual(calls[0].params, [proposalId, "A".repeat(43)]);
  assert.match(calls[1].sql, /email_confirmed_at IS NOT NULL[\s\S]*public_moderation_status = 'pending'[\s\S]*public_consent_status = 'not-requested'/u);
  assert.match(calls[1].sql, /INSERT INTO ena_plugin_proposal_publication_events/u);
  assert.ok(calls[1].params.includes("B".repeat(43)));
  assert.match(calls[2].sql, /email_confirmed_at IS NOT NULL[\s\S]*public_moderation_status = 'approved'[\s\S]*public_consent_status = 'confirmed'/u);
});

test("confirmed public consent can be withdrawn but cannot be re-confirmed without a new request", async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const store = createPostgresPluginLabStore(async (sql, params = []) => { calls.push({ sql, params }); return { rows: [{ proposal_id: proposalId }] }; });
  assert.equal(await store.setPublicConsent(proposalId, "withdraw", "C".repeat(43)), true);
  assert.deepEqual(calls[0].params, [proposalId, "withdrawn", ["requested", "confirmed"], "C".repeat(43)]);
  assert.match(calls[0].sql, /public_consent_status = ANY\(\$3::text\[\]\)/u);
  assert.match(calls[0].sql, /state = 'selected'[\s\S]*visibility = 'public-after-review'[\s\S]*email_confirmed_at IS NOT NULL/u);
  assert.match(calls[0].sql, /INSERT INTO ena_plugin_proposal_publication_events/u);
});

test("publication consent confirmation appends an actor- and projection-bound audit event", async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const store = createPostgresPluginLabStore(async (sql, params = []) => { calls.push({ sql, params }); return { rows: [{ proposal_id: proposalId }] }; });
  assert.equal(await store.setPublicConsent(proposalId, "confirm", "E".repeat(43)), true);
  assert.deepEqual(calls[0].params, [proposalId, "confirmed", ["requested"], "E".repeat(43)]);
  assert.match(calls[0].sql, /'consent-confirmed'/u);
  assert.match(calls[0].sql, /public_projection_sha256/u);
  assert.match(calls[0].sql, /'proposer', \$4/u);
});

test("withdrawing a selected proposal atomically withdraws publication consent and appends both audit families", async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const store = createPostgresPluginLabStore(async (sql, params = []) => { calls.push({ sql, params }); return { rows: [{ proposal_id: proposalId }] }; });
  assert.equal(await store.transition({ proposalId, from: "selected", to: "withdrawn", actorRef: "D".repeat(43), messageCode: "proposal-withdrawn", reasonCipher: { keyVersion: "v1", iv: "A", ciphertext: "B", tag: "C" } }), true);
  assert.match(calls[0].sql, /public_consent_status = CASE[\s\S]*'withdrawn'/u);
  assert.match(calls[0].sql, /INSERT INTO ena_plugin_proposal_events/u);
  assert.match(calls[0].sql, /INSERT INTO ena_plugin_proposal_publication_events/u);
});

test("retention preview selects only old terminal proposals and is strictly bounded", async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const store = createPostgresPluginLabStore(async (sql, params = []) => {
    calls.push({ sql, params });
    return { rows: [{ proposal_id: "plg_AAAAAAAAAAAAAAAAAAAAAA", state: "withdrawn", updated_at: "2026-01-01T00:00:00.000Z" }] };
  });
  const before = "2026-03-06T00:00:00.000Z";
  assert.deepEqual(await store.previewRetention({ before, limit: 200 }), [{ proposalId: "plg_AAAAAAAAAAAAAAAAAAAAAA", state: "withdrawn", updatedAt: "2026-01-01T00:00:00.000Z" }]);
  assert.match(calls[0].sql, /state IN \('not-selected', 'withdrawn'\)[\s\S]*updated_at < \$1::timestamptz[\s\S]*LIMIT \$2/u);
  assert.deepEqual(calls[0].params, [before, 200]);
  assert.doesNotMatch(calls[0].sql, /DELETE|payload_cipher/iu);
});
