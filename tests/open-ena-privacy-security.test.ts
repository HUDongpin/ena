import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import type { NextConfig } from "next";
import {
  createPostgresBillableStore,
  MemoryBillableStore,
  type BillableLimits,
  type BillableStore,
} from "../lib/server/open-ena-billable";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route";
import { OPEN_ENA_SESSION_COOKIE } from "../lib/open-ena-auth";
import {
  isOpenEnaAnalyticsDisabledPath,
  sanitizeOpenEnaAnalyticsUrl,
} from "../lib/analytics-consent";
import type {
  OpenEnaAiInterpretationRequest,
  OpenEnaAiInterpretationResponse,
} from "../lib/open-ena/ai-interpretation";

const projectRoot = process.cwd();
const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);
const aiComponent = readFileSync(
  new URL("../components/open-ena/OpenEnaAiInterpretation.tsx", import.meta.url),
  "utf8",
);
const i18n = readFileSync(new URL("../lib/open-ena-i18n.ts", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const footer = readFileSync(new URL("../components/Footer.tsx", import.meta.url), "utf8");
const analyticsConsent = readFileSync(new URL("../components/AnalyticsConsent.tsx", import.meta.url), "utf8");
const analyticsControl = readFileSync(new URL("../components/AnalyticsConsentControl.tsx", import.meta.url), "utf8");

const limits: BillableLimits = {
  minuteRequests: 6,
  dailyMicroUsd: 1_000,
  monthlyMicroUsd: 2_000,
  globalMonthlyMicroUsd: 3_000,
  providerMonthlyMicroUsd: 3_000,
  maxConcurrency: 2,
  maxReservationMicroUsd: 100,
  longitudinalMaxReservationMicroUsd: 100,
  alertThresholds: [80, 100],
};

const operationId = "aiop-01234567-89ab-4cde-8f01-23456789abcd";
const parsedRequest = {
  z: "last",
  a: { y: 2, x: 1 },
} as unknown as OpenEnaAiInterpretationRequest;
const generatedResponse = {
  marker: "safe-generated-response",
  provider: "openrouter",
  model: "openai/gpt-5.6-luna",
  generatedAt: "2026-08-30T00:00:00.000Z",
} as unknown as OpenEnaAiInterpretationResponse;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function aiRequest(body = JSON.stringify({ browser: "payload-order-is-not-authoritative" })) {
  return new Request("http://localhost:3000/api/open-ena/ai-interpretation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${OPEN_ENA_SESSION_COOKIE}=test-session`,
      origin: "http://localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
      "x-open-ena-ai-consent": "reviewed-aggregate-v2",
      "x-open-ena-ai-operation-id": operationId,
    },
    body,
  });
}

function aiDependencies(store: BillableStore, requireBillable = false) {
  return {
    verifyPrincipal: () => ({ principalRef: "stable-test-principal" }),
    authConfigurationReady: () => true,
    billableStore: store,
    limits,
    requireBillable,
    providerDescriptor: () => ({ provider: "openrouter", model: "openai/gpt-5.6-luna" }),
    parseRequest: () => parsedRequest,
    generate: async () => ({
      response: generatedResponse,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costMicroUsd: 2 },
      providerDispatched: true as const,
    }),
  };
}

test("standard ENA identity-bearing exports require one explicit confirmation while aggregate exports stay direct", async () => {
  assert.match(workspace, /export function confirmOpenEnaIdentityBearingExport/u);
  const workspaceModule = await import("../components/open-ena/OpenEnaWorkspace") as Record<string, unknown>;
  const confirmExport = workspaceModule.confirmOpenEnaIdentityBearingExport as undefined | ((
    confirm: (message: string) => boolean,
    message: string,
    publish: () => void,
  ) => boolean);
  assert.equal(typeof confirmExport, "function");
  if (!confirmExport) return;

  let confirmationCount = 0;
  let downloadCount = 0;
  assert.equal(confirmExport(() => { confirmationCount += 1; return false; }, "warning", () => { downloadCount += 1; }), false);
  assert.deepEqual({ confirmationCount, downloadCount }, { confirmationCount: 1, downloadCount: 0 });
  assert.equal(confirmExport(() => { confirmationCount += 1; return true; }, "warning", () => { downloadCount += 1; }), true);
  assert.deepEqual({ confirmationCount, downloadCount }, { confirmationCount: 2, downloadCount: 1 });

  assert.match(workspace, /copy\.stats\.identityExportWarning/u);
  assert.match(workspace, /copy\.stats\.identityExportConfirmation/u);
  const dataView = readFileSync(
    new URL("../components/open-ena/OpenEnaDataView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /exportClassification=\{ordered\s*\?\s*"local-identity-bearing-view"\s*:\s*"identity-bearing-derived"\}/u);
  assert.match(dataView, /data-export-classification=\{exportClassification\}/u);
  assert.match(workspace, /buildSetComparisonExport[\s\S]{0,900}confirmOpenEnaIdentityBearingExport/u);
  assert.match(workspace, /buildPairwiseGroupContrastExport[\s\S]{0,1500}confirmOpenEnaIdentityBearingExport/u);
  assert.match(workspace, /buildAnalysisBundle[\s\S]{0,1700}confirmOpenEnaIdentityBearingExport/u);
  assert.match(workspace, /function exportPlotSvg\(\)[\s\S]{0,220}confirmCurrentIdentityBearingExport/u);
  assert.match(workspace, /function exportPlotPng\(\)[\s\S]{0,220}confirmCurrentIdentityBearingExport/u);
  assert.match(workspace, /methodsReport && confirmCurrentIdentityBearingExport/u);
  assert.match(workspace, /manifest && confirmCurrentIdentityBearingExport/u);

  const aggregateOna = workspace.slice(
    workspace.indexOf("const exportAggregate"),
    workspace.indexOf("const exportAudit"),
  );
  assert.doesNotMatch(aggregateOna, /confirmOpenEnaIdentityBearingExport|window\.confirm/u);
  assert.match(i18n, /identityExportWarning/u);
  assert.match(i18n, /identityExportConfirmation/u);
});

test("AI consent discloses the actual gateway/model and bounded retention, region, and receipt facts before opt-in", () => {
  assert.match(aiComponent, /data-ena-ai-provider-disclosure="pre-consent"/u);
  assert.match(aiComponent, /providerDescriptor\.provider/u);
  assert.match(aiComponent, /providerDescriptor\.model/u);
  for (const field of [
    "providerDisclosure",
    "dataScopeDisclosure",
    "retentionDisclosure",
    "regionDisclosure",
    "auditReceiptDisclosure",
  ]) assert.match(aiComponent, new RegExp(`copy\\.${field}`, "u"));
  assert.match(i18n, /OpenRouter/u);
  assert.match(i18n, /metadata/iu);
  assert.match(i18n, /zero.data.retention|ZDR/iu);
  assert.match(i18n, /processing region/iu);
  assert.match(i18n, /durable/iu);
  assert.match(i18n, /provider, data, retention, region, and receipt disclosures/iu);
  assert.match(i18n, /Every AI generation requests ZDR-only routing and denies provider data collection/u);
  assert.match(i18n, /fails instead of falling back to a non-ZDR provider/u);
  assert.match(i18n, /每次 AI 生成都要求僅使用 ZDR 端點並拒絕供應商資料收集/u);
  assert.match(i18n, /不會降級至非 ZDR 供應商/u);
  assert.match(i18n, /每次 AI 生成都要求仅使用 ZDR 端点并拒绝供应商数据收集/u);
  assert.match(i18n, /不会降级到非 ZDR 供应商/u);
  assert.match(readme, /provider\.zdr=true/u);
  assert.match(readme, /provider\.data_collection="deny"/u);
  assert.match(readme, /fails closed rather than falling back to a\s+non-ZDR or data-collecting endpoint/u);
});

test("successful AI responses expose a minimal consent receipt and the UI renders its durable provenance", async () => {
  const store = new MemoryBillableStore();
  const handler = createOpenEnaAiInterpretationPostHandler(aiDependencies(store) as never);
  const response = await handler(aiRequest());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-open-ena-ai-receipt-id") ?? "", /^[0-9a-f-]{36}$/u);
  assert.equal(response.headers.get("x-open-ena-ai-operation-id"), operationId);
  const expectedHash = createHash("sha256").update(canonicalJson(parsedRequest), "utf8").digest("hex");
  assert.equal(response.headers.get("x-open-ena-ai-request-sha256"), expectedHash);
  assert.equal(response.headers.get("x-open-ena-ai-consent-policy"), "reviewed-aggregate-v2");
  assert.equal(response.headers.get("x-open-ena-ai-receipt-durable"), "false");
  assert.equal(response.headers.get("x-open-ena-ai-receipt-status"), "completed");
  assert.equal(response.headers.get("x-open-ena-ai-receipt-provider"), generatedResponse.provider);
  assert.equal(response.headers.get("x-open-ena-ai-receipt-model"), generatedResponse.model);
  assert.equal(Number.isNaN(Date.parse(response.headers.get("x-open-ena-ai-receipt-recorded-at") ?? "")), false);
  assert.match(aiComponent, /data-ena-ai-audit-receipt="durable-consent"/u);
  assert.match(aiComponent, /requestSha256/u);
  assert.match(aiComponent, /consentPolicyVersion/u);
  assert.match(aiComponent, /recordedAt/u);
  assert.match(aiComponent, /durable/u);
});

test("production AI dispatch fails closed and releases its reservation when durable receipt capability is absent", async () => {
  let providerCalls = 0;
  let releases = 0;
  const reservation = {
    id: "00000000-0000-4000-8000-000000000001",
    principalRef: "stable-test-principal",
    resource: "ai-interpretation",
    reservedMicroUsd: 100,
    cents: 100,
    dispatched: false,
  };
  const store: BillableStore = {
    reserve: async () => reservation,
    reserveDetailed: async () => ({ ok: true, reservation }),
    settle: async () => {},
    release: async () => { releases += 1; },
    consumeQuota: async () => true,
    alert: async () => {},
  };
  const dependencies = aiDependencies(store, true);
  dependencies.generate = async () => {
    providerCalls += 1;
    return {
      response: generatedResponse,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costMicroUsd: 2 },
      providerDispatched: true as const,
    };
  };
  const handler = createOpenEnaAiInterpretationPostHandler(dependencies as never);
  const response = await handler(aiRequest());
  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0);
  assert.equal(releases, 1);
});

test("production AI dispatch requires both receipt creation and terminal-status persistence", async () => {
  let providerCalls = 0;
  let releases = 0;
  const reservation = {
    id: "00000000-0000-4000-8000-000000000002",
    principalRef: "stable-test-principal",
    resource: "ai-interpretation",
    reservedMicroUsd: 100,
    cents: 100,
    dispatched: false,
  };
  const store: BillableStore = {
    reserve: async () => reservation,
    reserveDetailed: async () => ({ ok: true, reservation }),
    settle: async () => {},
    release: async () => { releases += 1; },
    consumeQuota: async () => true,
    alert: async () => {},
    recordAiConsentReceipt: async () => ({
      id: "00000000-0000-4000-8000-000000000003",
      principalRefHash: "a".repeat(64),
      operationId,
      requestSha256: "b".repeat(64),
      consentPolicyVersion: "reviewed-aggregate-v2",
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      recordedAt: new Date().toISOString(),
      status: "authorized",
      durable: true,
    }),
  };
  const dependencies = aiDependencies(store, true);
  dependencies.generate = async () => {
    providerCalls += 1;
    return {
      response: generatedResponse,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costMicroUsd: 2 },
      providerDispatched: true as const,
    };
  };
  const response = await createOpenEnaAiInterpretationPostHandler(dependencies as never)(aiRequest());
  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0);
  assert.equal(releases, 1);
});

test("memory and PostgreSQL stores implement the same privacy-minimal consent receipt contract", async () => {
  type ReceiptStore = BillableStore & {
    recordAiConsentReceipt?: (input: Record<string, string>) => Promise<Record<string, unknown> | null>;
    updateAiConsentReceiptStatus?: (input: Record<string, string>) => Promise<Record<string, unknown> | null>;
  };
  const memory = new MemoryBillableStore() as unknown as ReceiptStore;
  assert.equal(typeof memory.recordAiConsentReceipt, "function");
  assert.equal(typeof memory.updateAiConsentReceiptStatus, "function");
  if (!memory.recordAiConsentReceipt || !memory.updateAiConsentReceiptStatus) return;
  const recorded = await memory.recordAiConsentReceipt({
    principalRef: "raw-principal-never-store-this",
    operationId,
    requestSha256: "a".repeat(64),
    consentPolicyVersion: "reviewed-aggregate-v2",
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
  });
  assert.ok(recorded);
  assert.equal(recorded.durable, false);
  assert.equal(recorded.status, "authorized");
  assert.notEqual(recorded.principalRefHash, "raw-principal-never-store-this");
  assert.equal("prompt" in recorded, false);
  assert.equal("response" in recorded, false);
  assert.equal("dataset" in recorded, false);
  const completed = await memory.updateAiConsentReceiptStatus({
    receiptId: String(recorded.id),
    status: "completed",
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
  });
  assert.equal(completed?.status, "completed");
  const replayed = await memory.recordAiConsentReceipt({
    principalRef: "raw-principal-never-store-this",
    operationId,
    requestSha256: "a".repeat(64),
    consentPolicyVersion: "reviewed-aggregate-v2",
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
  });
  assert.equal(replayed?.id, recorded.id, "receipt identity must be idempotent for one operation");
  assert.equal(await memory.updateAiConsentReceiptStatus({
    receiptId: String(recorded.id),
    status: "failed",
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
  }), null, "terminal receipt states must not be rewritten");

  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const postgres = createPostgresBillableStore(async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("record_ai_consent")) return { rows: [{ receipt: { ...recorded, durable: true } }] };
    if (sql.includes("update_ai_consent")) return { rows: [{ receipt: { ...completed, durable: true } }] };
    return { rows: [] };
  }) as ReceiptStore;
  assert.equal(typeof postgres.recordAiConsentReceipt, "function");
  assert.equal(typeof postgres.updateAiConsentReceiptStatus, "function");
  if (!postgres.recordAiConsentReceipt || !postgres.updateAiConsentReceiptStatus) return;
  await postgres.recordAiConsentReceipt({
    principalRef: "raw-principal-never-store-this",
    operationId,
    requestSha256: "a".repeat(64),
    consentPolicyVersion: "reviewed-aggregate-v2",
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
  });
  assert.match(calls[0]!.sql, /open_ena_record_ai_consent_receipt/u);
  assert.match(calls[0]!.sql, /AS receipt/u);
  assert.notEqual(calls[0]!.params[0], "raw-principal-never-store-this");
});

test("migration 003 stores only the bounded durable AI consent receipt fields", () => {
  const migrationPath = `${projectRoot}/migrations/003_open_ena_ai_consent.sql`;
  assert.equal(existsSync(migrationPath), true);
  if (!existsSync(migrationPath)) return;
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS open_ena_ai_consent_receipts/u);
  for (const field of [
    "principal_ref_hash",
    "operation_id",
    "request_sha256",
    "consent_policy_version",
    "provider",
    "model",
    "recorded_at",
    "status",
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`, "u"));
  const table = migration.match(/CREATE TABLE IF NOT EXISTS open_ena_ai_consent_receipts\s*\(([\s\S]*?)\n\);/u)?.[1] ?? "";
  assert.ok(table);
  assert.doesNotMatch(table, /\b(prompt|response|raw_rows|dataset_label|dataset_name)\b/iu);
  assert.match(migration, /clock_timestamp\(\)/u);
});

test("the footer omits analytics disclosure and status copy while preserving explicit consent controls", () => {
  for (const removedCopy of [
    /Analytics and data boundaries/iu,
    /Provider and purpose:/iu,
    /Data scope:/iu,
    /Retention, region, and receipt boundary:/iu,
    /Aggregate analytics is (?:enabled|disabled) for this browser\./iu,
    /Aggregate analytics is not enabled\./iu,
    /分析服務與資料界線/u,
    /分析服务与数据边界/u,
  ]) assert.doesNotMatch(footer, removedCopy);
  assert.match(footer, /AnalyticsConsentControl/u);
  assert.match(analyticsConsent, /beforeSend/u);
  assert.match(analyticsConsent, /localStorage/u);
  assert.match(analyticsConsent, /query strings and fragments|Query strings.*identifiers/iu);
  assert.match(analyticsConsent, /sanitizeOpenEnaAnalyticsUrl/u);
  assert.doesNotMatch(analyticsConsent, /url:\s*url\.pathname/u);
  assert.match(analyticsControl, /data-ena-analytics-consent="explicit"/u);
  assert.doesNotMatch(analyticsControl, /role="status"|copy\.(?:enabled|disabled|undecided)/u);
  assert.match(analyticsControl, /onClick=\{\(\) => update\("denied"\)\}>\{copy\.disable\}<\/button>/u);
  assert.match(analyticsControl, /onClick=\{\(\) => update\("granted"\)\}>\{copy\.enable\}<\/button>/u);
});

test("Vercel Analytics keeps an absolute same-origin URL while removing query strings and fragments", () => {
  assert.equal(
    sanitizeOpenEnaAnalyticsUrl(
      "https://www.ena.hk/en?researcher=private#section",
      "https://www.ena.hk",
    ),
    "https://www.ena.hk/en",
  );
  assert.equal(
    sanitizeOpenEnaAnalyticsUrl("/zh-hant/news?label=private", "https://www.ena.hk"),
    "https://www.ena.hk/zh-hant/news",
  );
  assert.equal(
    sanitizeOpenEnaAnalyticsUrl("https://attacker.invalid/en", "https://www.ena.hk"),
    null,
  );
  assert.equal(
    sanitizeOpenEnaAnalyticsUrl("http://[invalid", "https://www.ena.hk"),
    null,
  );

  assert.equal(isOpenEnaAnalyticsDisabledPath(null), true);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/en"), false);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/en/open-ena"), true);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/en/open-ena/results"), true);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/en/news/open-ena-methods"), false);
});

test("Next applies strict security headers and keeps unsafe-eval development-only", async () => {
  const nextConfig = (await import("../next.config")).default as NextConfig;
  assert.equal(typeof nextConfig.headers, "function");
  if (!nextConfig.headers) return;
  const configured = await nextConfig.headers();
  const global = configured.find((entry) => entry.source === "/(.*)");
  assert.ok(global);
  const headers = new Map(global.headers.map((header) => [header.key.toLowerCase(), header.value]));
  const csp = headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/u);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/u);
  assert.doesNotMatch(csp, /'unsafe-eval'/u);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/u);
  assert.match(csp, /worker-src 'self' blob:/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.match(csp, /frame-src 'none'/u);
  assert.match(csp, /object-src 'none'/u);
  assert.match(csp, /base-uri 'self'/u);
  assert.match(csp, /form-action 'self'/u);
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");
  assert.match(headers.get("permissions-policy") ?? "", /camera=\(\)/u);
  assert.match(headers.get("permissions-policy") ?? "", /microphone=\(\)/u);
  const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(source, /NODE_ENV\s*===\s*["']development["']/u);
  assert.match(source, /unsafe-eval/u);
});
