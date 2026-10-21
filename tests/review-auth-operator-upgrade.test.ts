import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { runOpenEnaProductionAuthOperator } from "../scripts/run-open-ena-production-auth-operator.mjs";

const legacy = "-- synthetic legacy migration\nSELECT 4;";
const upgrade = "-- synthetic expiry upgrade\nSELECT 8;";
const loginUpgrade = "-- synthetic source reservation upgrade\nSELECT 9;";
const environment = { OPEN_ENA_AUTH_DATABASE_URL: "postgresql://synthetic.invalid/auth", OPEN_ENA_BILLABLE_DATABASE_URL: "postgresql://synthetic.invalid/auth" };
const keys = ["migration_001_tables", "migration_001_function", "migration_002_tables", "migration_002_functions", "migration_003_table", "migration_003_function", "migration_004_table", "migration_004_function", "migration_004_columns", "migration_004_constraints", "migration_004_index", "migration_004_function_contract", "migration_008_function_contract", "migration_009_function_contract"];
function fixture(options: { existing?: boolean; partial?: boolean; upgraded?: boolean; upgradeError?: boolean; loginUpgraded?: boolean; loginUpgradeError?: boolean } = {}) {
  const queries: string[] = [];
  const input = { mode: "migration" as const, environment, migrationSql: legacy, expiryMigrationSql: upgrade, loginMigrationSql: loginUpgrade, dependencies: { now: () => 1_800_000_000_000, databaseFactory: async () => ({ query: async (sql: string) => { queries.push(sql); if (sql.includes("AS disposable_table_present")) return { rows: [{ disposable_table_present: options.existing === true || options.partial === true, disposable_function_present: options.existing === true }] }; if (sql === upgrade && options.upgradeError) throw new Error("Synthetic unsupported function body"); if (sql === loginUpgrade && options.loginUpgradeError) throw new Error("Synthetic source reservation migration failure"); if (sql.includes("migration_001_tables")) return { rows: [{ ...Object.fromEntries(keys.map(key => [key, true])), migration_008_function_contract: options.upgraded !== false, migration_009_function_contract: options.loginUpgraded !== false }] }; return { rows: [] }; }, close: async () => {} }), fetch: async () => { throw new Error("Migration must never contact HTTP"); }, randomBytes: () => { throw new Error("Migration must never create credentials"); } } };
  return { queries, input };
}
function code(expected: string) { return (error: unknown) => { assert.equal((error as { code: string }).code, expected); return true; }; }

test("fresh operator migration applies 004, 008, and 009 in one transaction and identifies all three exact inputs", async () => {
  const { input, queries } = fixture(); const receipt = await runOpenEnaProductionAuthOperator(input);
  assert.deepEqual(queries.filter(sql => [legacy, upgrade, loginUpgrade].includes(sql)), [legacy, upgrade, loginUpgrade]);
  assert.ok(queries.indexOf("BEGIN") < queries.indexOf(legacy)); assert.ok(queries.indexOf(loginUpgrade) < queries.indexOf("COMMIT"));
  assert.deepEqual(receipt.migration.files.map((entry: { id: string; applied: boolean }) => [entry.id, entry.applied]), [["004_open_ena_disposable_accounts", true], ["008_open_ena_disposable_expiry_after_lock", true], ["009_open_ena_login_source_reservations", true]]);
  assert.deepEqual(receipt.migration.files.map((entry: { sha256: string }) => entry.sha256), [legacy, upgrade, loginUpgrade].map(sql => createHash("sha256").update(sql).digest("hex")));
});

test("existing operator migration applies 008 and 009 so known or unknown function attributes are not overwritten by 004", async () => {
  const { input, queries } = fixture({ existing: true }); const receipt = await runOpenEnaProductionAuthOperator(input);
  assert.deepEqual(queries.filter(sql => [legacy, upgrade, loginUpgrade].includes(sql)), [upgrade, loginUpgrade]);
  assert.deepEqual(receipt.migration.files.map((entry: { applied: boolean }) => entry.applied), [false, true, true]);
  assert.equal(receipt.migration.applied, false, "legacy 004 receipt must not claim skipped SQL was applied");
});

test("partial disposable schema fails closed before any auth migration", async () => {
  const { input, queries } = fixture({ partial: true }); await assert.rejects(runOpenEnaProductionAuthOperator(input), code("MIGRATION_POSTCONDITION_FAILED"));
  assert.equal(queries.includes(legacy), false); assert.equal(queries.includes(upgrade), false); assert.equal(queries.at(-1), "ROLLBACK");
});

test("unsupported existing function causes atomic rollback without replaying legacy SQL", async () => {
  const { input, queries } = fixture({ existing: true, upgradeError: true }); await assert.rejects(runOpenEnaProductionAuthOperator(input), code("DATABASE_MIGRATION_FAILED"));
  assert.equal(queries.includes(legacy), false); assert.equal(queries.includes(upgrade), true); assert.equal(queries.at(-1), "ROLLBACK");
});

test("missing upgraded function postcondition cannot emit a successful operator receipt", async () => {
  const { input, queries } = fixture({ upgraded: false }); await assert.rejects(runOpenEnaProductionAuthOperator(input), code("MIGRATION_POSTCONDITION_FAILED"));
  assert.equal(queries.includes("COMMIT"), false); assert.equal(queries.at(-1), "ROLLBACK");
});

test("migration input must include the expiry upgrade before opening the database", async () => {
  const { input, queries } = fixture(); await assert.rejects(runOpenEnaProductionAuthOperator({ ...input, expiryMigrationSql: undefined }), code("MIGRATION_INPUT_INVALID")); assert.equal(queries.length, 0);
});


test("a source reservation migration failure rolls back the whole auth upgrade", async () => {
  const { input, queries } = fixture({ loginUpgradeError: true });
  await assert.rejects(runOpenEnaProductionAuthOperator(input), code("DATABASE_MIGRATION_FAILED"));
  assert.deepEqual(queries.filter(sql => [legacy, upgrade, loginUpgrade].includes(sql)), [legacy, upgrade, loginUpgrade]);
  assert.equal(queries.includes("COMMIT"), false);
  assert.equal(queries.at(-1), "ROLLBACK");
});

test("missing reservation or refund contract cannot emit a successful operator receipt", async () => {
  const { input, queries } = fixture({ loginUpgraded: false });
  await assert.rejects(runOpenEnaProductionAuthOperator(input), code("MIGRATION_POSTCONDITION_FAILED"));
  assert.equal(queries.includes("COMMIT"), false);
  assert.equal(queries.at(-1), "ROLLBACK");
});

test("migration input must include the source reservation upgrade before opening the database", async () => {
  const { input, queries } = fixture();
  await assert.rejects(runOpenEnaProductionAuthOperator({ ...input, loginMigrationSql: undefined }), code("MIGRATION_INPUT_INVALID"));
  assert.equal(queries.length, 0);
});

test("proof mode refuses source reservation migration input before opening the database", async () => {
  const { input, queries } = fixture();
  await assert.rejects(runOpenEnaProductionAuthOperator({ ...input, mode: "proof", migrationSql: undefined, expiryMigrationSql: undefined }), code("PROOF_MODE_MIGRATION_INPUT_FORBIDDEN"));
  assert.equal(queries.length, 0);
});
