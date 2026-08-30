import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/001_open_ena_billable.sql", import.meta.url), "utf8");

test("durable billing migration uses scoped daily and monthly spend buckets", () => {
  assert.match(migration, /scope_kind\s+text\s+NOT NULL/u);
  assert.match(migration, /scope_ref\s+text\s+NOT NULL/u);
  assert.match(migration, /period\s+text\s+NOT NULL/u);
  assert.match(migration, /CHECK\s*\(\s*scope_kind\s+IN\s*\('principal',\s*'global',\s*'provider'\)\s*\)/u);
  assert.match(migration, /CHECK\s*\(\s*period\s+IN\s*\('day',\s*'month'\)\s*\)/u);
  assert.match(migration, /globalDailyMicroUsd/u);
  assert.match(migration, /providerDailyMicroUsd/u);
  assert.match(migration, /globalMonthlyMicroUsd/u);
  assert.match(migration, /providerMonthlyMicroUsd/u);
});

test("reserve is serialized per stable principal and fixes server-UTC periods", () => {
  assert.match(migration, /pg_advisory_xact_lock\s*\(/u);
  assert.match(migration, /AT\s+TIME\s+ZONE\s+'UTC'/u);
  assert.match(migration, /day_start\s+date\s+NOT NULL/u);
  assert.match(migration, /month_start\s+date\s+NOT NULL/u);
  assert.match(migration, /PRIMARY KEY\s*\(\s*scope_kind,\s*scope_ref,\s*period,\s*period_start\s*\)/u);
  assert.match(migration, /FOR\s+UPDATE/u);
  assert.match(migration, /UNIQUE\s*\([^)]*idempotency_key/u);
  assert.doesNotMatch(migration, /gen_random_uuid\s*\(/u);
  assert.doesNotMatch(migration, /CREATE\s+EXTENSION/u);
  assert.doesNotMatch(migration, /chr\s*\(\s*0\s*\)/u);
  assert.match(migration, /IF\s+FOUND\s+THEN[\s\S]*?reason\s*:=\s*'idempotency-replayed'/u);
});

test("settle and release are guarded one-way transitions with spend reconciliation", () => {
  assert.match(migration, /status\s*=\s*'reserved'/u);
  assert.match(migration, /status\s*=\s*'settled'/u);
  assert.match(migration, /status\s*=\s*'released'/u);
  assert.match(migration, /actual_micro_usd/u);
  assert.match(migration, /reserved_micro_usd/u);
  assert.match(migration, /micro_usd\s*=\s*micro_usd\s*\+/u);
  assert.match(migration, /micro_usd\s*=\s*micro_usd\s*-/u);
  assert.match(migration, /RETURNING\s+\*/u);
  assert.match(migration, /'reservation-overrun'/u);
  assert.match(migration, /'actual-exceeded-reservation'/u);
  assert.match(migration, /p_actual\s+IS\s+NOT\s+NULL\s+AND\s+p_actual\s*<\s*0/u);
  assert.doesNotMatch(migration, /GREATEST\s*\(\s*COALESCE\(p_actual/u);
});

test("quota is a database-time rolling minute window and alerts are deduplicated", () => {
  assert.match(migration, /interval\s+'1 minute'/u);
  assert.match(migration, /p_limit\s+integer/u);
  assert.match(migration, /v_count\s*<=\s*v_limit/u);
  assert.doesNotMatch(migration, /p_now/u);
  assert.match(migration, /dedupe_key\s+text\s+NOT NULL/u);
  assert.match(migration, /UNIQUE\s*\([^)]*code[^)]*principal_ref[^)]*dedupe_key/u);
  assert.match(migration, /ON\s+CONFLICT\s*\([^)]*dedupe_key[^)]*\)\s+DO\s+NOTHING/u);
  assert.match(migration, /jsonb_strip_nulls\s*\(\s*jsonb_build_object/u);
  assert.match(migration, /'budget-threshold'/u);
  assert.match(migration, /jsonb_array_elements_text\s*\([^)]*alertThresholds/u);
});
