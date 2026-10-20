import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { createProductionBillableStore } from "../lib/server/open-ena-billable";

test("an idle billing connection failure cannot crash the application or disclose database details", async (t) => {
  let pool: Pool | undefined;
  // Only database I/O is replaced: construct the actual production pg.Pool and
  // exercise its real EventEmitter failure boundary, without opening a socket.
  t.mock.method(Pool.prototype, "query", async function (this: Pool) {
    pool = this;
    return { rows: [{ allowed: true }] };
  });
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  const store = await createProductionBillableStore({
    OPEN_ENA_BILLABLE_DATABASE_URL: "postgres://synthetic.invalid/billable_pool_test",
  });
  assert.ok(store);
  assert.equal(await store.consumeQuota("synthetic-principal"), true);
  assert.ok(pool);
  const error = Object.assign(new Error("private connection and account details"), { code: "57P01" });
  try {
    assert.doesNotThrow(() => pool!.emit("error", error));
    assert.equal(await store.consumeQuota("synthetic-principal"), true, "the pool must remain available for later queries");
    assert.equal(diagnostics.length, 1);
    assert.doesNotMatch(JSON.stringify(diagnostics), /private connection|account details|synthetic-principal/u);
  } finally {
    await pool.end();
  }
});
