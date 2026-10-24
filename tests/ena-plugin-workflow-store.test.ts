import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { createProductionWorkflowStore, createWorkflowStore } from "../lib/plugin-lab/workflow-store";

const environment = {
  ENA_PLUGIN_LAB_DATABASE_URL: "postgres://synthetic.invalid/workflow_pool_test",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 6).toString("base64url"),
  ENA_PLUGIN_LAB_SECRET: "synthetic-workflow-test-secret-with-32-characters",
};
const rateLimit = { scopeKind: "otp-source", scopeRef: "A".repeat(43), limit: 5, windowSeconds: 3600 };

test("workflow pools use the supplied configuration and redact idle connection failures", async (context) => {
  const pools: Pool[] = [];
  context.mock.method(Pool.prototype, "query", async function (this: Pool) {
    pools.push(this);
    return { rows: [{ allowed: true }] };
  });
  const diagnostics: unknown[][] = [];
  context.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  const store = await createProductionWorkflowStore(environment);
  const other = await createProductionWorkflowStore({ ...environment, ENA_PLUGIN_LAB_DATABASE_URL: "postgres://synthetic.invalid/different_workflow_pool" });
  assert.ok(store && other);
  assert.notEqual(store, other);
  assert.equal(await createProductionWorkflowStore({}), null);
  assert.equal(await createProductionWorkflowStore(environment), store);
  try {
    assert.equal(await store.consumeRateLimit(rateLimit), true);
    assert.equal(await other.consumeRateLimit(rateLimit), true);
    assert.notEqual(pools[0], pools[1]);
    assert.doesNotThrow(() => pools[0].emit("error", new Error("secret recipient, SQL values and password")));
    assert.equal(diagnostics.length, 1);
    assert.doesNotMatch(JSON.stringify(diagnostics), /secret|recipient|password|SQL/u);
  } finally { await Promise.all(pools.map((pool) => pool.end())); }
});

test("query and connection exceptions expose no secret cause", async (context) => {
  const pool = new Pool();
  context.mock.method(pool, "query", async () => { throw new Error("secret plaintext email in SQL error"); });
  context.mock.method(pool, "connect", async () => { throw new Error("secret database password"); });
  const store = createWorkflowStore(pool);
  const sanitized = (error: unknown) => error instanceof Error && error.message === "Plugin Lab workflow store is unavailable." && !Object.hasOwn(error, "cause");
  await assert.rejects(store.consumeRateLimit(rateLimit), sanitized);
  await assert.rejects(store.consumeChallenge({ challengeId: "challenge", codeHash: "f".repeat(64), now: new Date(0), sessionHash: "f".repeat(64), sessionExpiresAt: new Date(1_800_000) }), sanitized);
  await pool.end();
});

test("a failed rollback discards the connection before returning it to the pool", async (context) => {
  const pool = new Pool();
  let released: unknown;
  const client = {
    query: async (sql: string) => {
      if (sql === "ROLLBACK" || sql.startsWith("SELECT email_ref")) throw new Error("connection lost");
      return { rows: [] };
    },
    release: (value: unknown) => { released = value; },
  };
  context.mock.method(pool, "connect", async () => client as unknown as PoolClient);
  await assert.rejects(createWorkflowStore(pool).consumeChallenge({ challengeId: "challenge", codeHash: "f".repeat(64), now: new Date(0), sessionHash: "f".repeat(64), sessionExpiresAt: new Date(1_800_000) }));
  assert.equal(released, true);
  await pool.end();
});

test("legacy ownership is included as an independent SQL binding when reading a proposal", async (context) => {
  const pool = new Pool();
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  context.mock.method(pool, "query", async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: [] }; });
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const legacyProposalId = "plg_BBBBBBBBBBBBBBBBBBBBBB";
  const store = createWorkflowStore(pool);
  assert.equal(await store.readOwned(proposalId, { legacyProposalId: proposalId }), null);
  assert.equal(await store.readOwned(proposalId, { legacyProposalId }), null);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /p\.proposal_id=\$1 AND p\.proposal_id=\$2/u);
  assert.deepEqual(calls.map((call) => call.params), [[proposalId, proposalId], [proposalId, legacyProposalId]]);
  await pool.end();
});
