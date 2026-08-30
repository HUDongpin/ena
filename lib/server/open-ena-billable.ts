import { createHash, randomUUID } from "node:crypto";

export type BillableLimits = {
  minuteRequests: number;
  dailyMicroUsd: number;
  monthlyMicroUsd: number;
  globalMonthlyMicroUsd: number;
  providerMonthlyMicroUsd: number;
  maxConcurrency: number;
  maxReservationMicroUsd: number;
  longitudinalMaxReservationMicroUsd: number;
  alertThresholds: readonly number[];
};

export type Reservation = {
  id: string;
  principalRef: string;
  resource: string;
  reservedMicroUsd: number;
  /** Kept for compatibility with older injected test stores. Values are micro-USD, not cents. */
  cents: number;
  dispatched: boolean;
};

export type ReservationDenialReason =
  | "invalid-reservation"
  | "idempotency-replayed"
  | "minute-quota"
  | "daily-ceiling"
  | "monthly-ceiling"
  | "global-daily-ceiling"
  | "global-monthly-ceiling"
  | "provider-daily-ceiling"
  | "provider-monthly-ceiling"
  | "concurrency"
  | "store-failure";

export type ReservationResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; reason: ReservationDenialReason };

export type BillableAlert = {
  code: string;
  principalRef: string;
  metadata?: Record<string, string>;
};

export type AiConsentReceiptStatus = "authorized" | "completed" | "failed" | "released";

export type AiConsentReceipt = {
  id: string;
  principalRefHash: string;
  operationId: string;
  requestSha256: string;
  consentPolicyVersion: string;
  provider: string;
  model: string;
  recordedAt: string;
  status: AiConsentReceiptStatus;
  /** False for the deterministic in-memory test double; true only for SQL-backed storage. */
  durable: boolean;
};

export type AiConsentReceiptInput = {
  principalRef: string;
  operationId: string;
  requestSha256: string;
  consentPolicyVersion: string;
  provider: string;
  model: string;
};

export type AiConsentReceiptUpdate = {
  receiptId: string;
  status: Exclude<AiConsentReceiptStatus, "authorized">;
  provider: string;
  model: string;
};

const RECEIPT_OPERATION_ID = /^aiop-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RECEIPT_SHA256 = /^[0-9a-f]{64}$/u;
const RECEIPT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const RECEIPT_SAFE_TEXT = /^[A-Za-z0-9._:/@-]+$/u;

function validReceiptInput(input: AiConsentReceiptInput) {
  if (!input || typeof input !== "object") return false;
  return Boolean(
    typeof input.principalRef === "string"
      && typeof input.operationId === "string"
      && typeof input.requestSha256 === "string"
      && typeof input.consentPolicyVersion === "string"
      && typeof input.provider === "string"
      && typeof input.model === "string"
      && input.principalRef
      && input.principalRef.length <= 512
      && !/[\u0000-\u001f\u007f]/u.test(input.principalRef)
      && RECEIPT_OPERATION_ID.test(input.operationId)
      && RECEIPT_SHA256.test(input.requestSha256)
      && input.consentPolicyVersion.length >= 1
      && input.consentPolicyVersion.length <= 80
      && RECEIPT_SAFE_TEXT.test(input.consentPolicyVersion)
      && input.provider.length >= 1
      && input.provider.length <= 80
      && RECEIPT_SAFE_TEXT.test(input.provider)
      && input.model.length >= 1
      && input.model.length <= 160
      && RECEIPT_SAFE_TEXT.test(input.model),
  );
}

function validReceiptUpdate(input: AiConsentReceiptUpdate) {
  if (!input || typeof input !== "object") return false;
  const status = parseReceiptStatus(input.status);
  return Boolean(
    typeof input.receiptId === "string"
      && typeof input.status === "string"
      && typeof input.provider === "string"
      && typeof input.model === "string"
      && status !== null
      && status !== "authorized"
      && RECEIPT_UUID.test(input.receiptId)
      && input.provider.length >= 1
      && input.provider.length <= 80
      && RECEIPT_SAFE_TEXT.test(input.provider)
      && input.model.length >= 1
      && input.model.length <= 160
      && RECEIPT_SAFE_TEXT.test(input.model),
  );
}

function parseReceiptStatus(value: unknown): AiConsentReceiptStatus | null {
  return value === "authorized" || value === "completed" || value === "failed" || value === "released"
    ? value
    : null;
}

function parseReceiptRow(
  value: unknown,
  durable: boolean,
  fallback: Partial<AiConsentReceipt> = {},
): AiConsentReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : fallback.id;
  const principalRefHash = typeof row.principal_ref_hash === "string"
    ? row.principal_ref_hash
    : typeof row.principalRefHash === "string" ? row.principalRefHash : fallback.principalRefHash;
  const operationId = typeof row.operation_id === "string"
    ? row.operation_id
    : typeof row.operationId === "string" ? row.operationId : fallback.operationId;
  const requestHash = typeof row.request_sha256 === "string"
    ? row.request_sha256
    : typeof row.requestSha256 === "string" ? row.requestSha256 : fallback.requestSha256;
  const policy = typeof row.consent_policy_version === "string"
    ? row.consent_policy_version
    : typeof row.consentPolicyVersion === "string" ? row.consentPolicyVersion : fallback.consentPolicyVersion;
  const provider = typeof row.provider === "string" ? row.provider : fallback.provider;
  const model = typeof row.model === "string" ? row.model : fallback.model;
  const recordedAt = typeof row.recorded_at === "string"
    ? row.recorded_at
    : typeof row.recordedAt === "string" ? row.recordedAt : fallback.recordedAt;
  const status = parseReceiptStatus(row.status ?? fallback.status);
  if (
    typeof id !== "string" || !RECEIPT_UUID.test(id)
    || typeof principalRefHash !== "string" || !RECEIPT_SHA256.test(principalRefHash)
    || typeof operationId !== "string" || !RECEIPT_OPERATION_ID.test(operationId)
    || typeof requestHash !== "string" || !RECEIPT_SHA256.test(requestHash)
    || typeof policy !== "string" || policy.length < 1 || policy.length > 80 || !RECEIPT_SAFE_TEXT.test(policy)
    || typeof provider !== "string" || provider.length < 1 || provider.length > 80 || !RECEIPT_SAFE_TEXT.test(provider)
    || typeof model !== "string" || model.length < 1 || model.length > 160 || !RECEIPT_SAFE_TEXT.test(model)
    || typeof recordedAt !== "string" || Number.isNaN(Date.parse(recordedAt))
    || !status
  ) return null;
  return {
    id,
    principalRefHash,
    operationId,
    requestSha256: requestHash,
    consentPolicyVersion: policy,
    provider,
    model,
    recordedAt,
    status,
    durable,
  };
}

export type BillableStore = {
  reserve(input: {
    principalRef: string;
    resource?: string;
    microUsd: number;
    idempotencyKey: string;
    limits: BillableLimits;
  }): Promise<Reservation | null>;
  reserveDetailed?(input: {
    principalRef: string;
    resource?: string;
    microUsd: number;
    idempotencyKey: string;
    limits: BillableLimits;
    now?: Date;
  }): Promise<ReservationResult>;
  settle(reservation: Reservation, actualMicroUsd: number | null, dispatched: boolean): Promise<void>;
  release(reservation: Reservation): Promise<void>;
  consumeQuota(
    principalRef: string,
    resource?: string,
    limit?: number,
    now?: Date,
  ): Promise<boolean>;
  alert(event: BillableAlert): Promise<void>;
  recordAiConsentReceipt?(input: AiConsentReceiptInput): Promise<AiConsentReceipt | null>;
  updateAiConsentReceiptStatus?(input: AiConsentReceiptUpdate): Promise<AiConsentReceipt | null>;
};

/** Stable billing identity: a new login/session must stay in the same durable bucket. */
export function principalRefForAccount(accountId: string) {
  return createHash("sha256").update(accountId.trim(), "utf8").digest("base64url");
}

function readUnsignedInteger(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
) {
  const raw = environment[name];
  if (raw === undefined || !/^(?:0|[1-9][0-9]*)$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function readAlertThresholds(raw: string | undefined) {
  if (!raw) return null;
  const values = raw.split(",").map((entry) => Number(entry.trim()));
  if (
    values.length === 0
    || values.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 100)
  ) return null;
  return [...new Set(values)].sort((left, right) => left - right);
}

export function parseBillablePolicy(
  environment: Readonly<Record<string, string | undefined>>,
): BillableLimits | null {
  if (environment.OPEN_ENA_BILLING_POLICY_VERSION !== "v1") return null;
  const accountId = environment.OPEN_ENA_ACCOUNT_ID?.trim();
  const minuteRequests = readUnsignedInteger(environment, "OPEN_ENA_BILLABLE_REQUESTS_PER_MINUTE");
  const dailyMicroUsd = readUnsignedInteger(environment, "OPEN_ENA_AI_DAILY_MICRO_USD");
  const monthlyMicroUsd = readUnsignedInteger(environment, "OPEN_ENA_AI_MONTHLY_MICRO_USD");
  const globalMonthlyMicroUsd = readUnsignedInteger(environment, "OPEN_ENA_GLOBAL_MONTHLY_MICRO_USD");
  const providerMonthlyMicroUsd = readUnsignedInteger(environment, "OPEN_ENA_PROVIDER_MONTHLY_MICRO_USD");
  const maxConcurrency = readUnsignedInteger(environment, "OPEN_ENA_BILLABLE_MAX_CONCURRENCY");
  const maxReservationMicroUsd = readUnsignedInteger(environment, "OPEN_ENA_AI_MAX_RESERVATION_MICRO_USD");
  const longitudinalMaxReservationMicroUsd = readUnsignedInteger(
    environment,
    "OPEN_ENA_LONGITUDINAL_MAX_RESERVATION_MICRO_USD",
  );
  const alertThresholds = readAlertThresholds(environment.OPEN_ENA_SECURITY_ALERT_THRESHOLDS);
  if (
    !accountId
    || minuteRequests === null
    || dailyMicroUsd === null
    || monthlyMicroUsd === null
    || globalMonthlyMicroUsd === null
    || providerMonthlyMicroUsd === null
    || maxConcurrency === null
    || maxReservationMicroUsd === null
    || longitudinalMaxReservationMicroUsd === null
    || !alertThresholds
    || maxReservationMicroUsd < 1
    || longitudinalMaxReservationMicroUsd < 1
  ) return null;
  return {
    minuteRequests,
    dailyMicroUsd,
    monthlyMicroUsd,
    globalMonthlyMicroUsd,
    providerMonthlyMicroUsd,
    maxConcurrency,
    maxReservationMicroUsd,
    longitudinalMaxReservationMicroUsd,
    alertThresholds,
  };
}

const utcDayKey = (date: Date) => date.toISOString().slice(0, 10);
const utcMonthKey = (date: Date) => date.toISOString().slice(0, 7);
const usageKey = (...parts: string[]) => parts.join("\0");
export function providerRefForResource(resource: string) {
  if (resource === "ai-interpretation") return "openrouter";
  if (resource === "longitudinal") return "persistent-compute";
  return `resource:${resource}`;
}

type MemoryReservation = {
  reservation: Reservation;
  dayKey: string;
  monthKey: string;
  status: "reserved" | "settled" | "released";
};

const SAFE_ALERT_METADATA_KEYS = new Set(["reason", "resource", "scope", "threshold"]);
function sanitizedAlertMetadata(metadata: Record<string, string> | undefined) {
  return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key, value]) => (
    SAFE_ALERT_METADATA_KEYS.has(key)
    && typeof value === "string"
    && value.length <= 128
    && /^[A-Za-z0-9_.:%-]*$/u.test(value)
  )));
}

/**
 * Deterministic test double for the durable store. Production never constructs it.
 * Its accounting mirrors the SQL contract, including global cross-principal buckets.
 */
export class MemoryBillableStore implements BillableStore {
  private readonly reservationsByKey = new Map<string, MemoryReservation>();
  private readonly reservationsById = new Map<string, MemoryReservation>();
  private readonly principalSpend = new Map<string, number>();
  private readonly globalSpend = new Map<string, number>();
  private readonly providerSpend = new Map<string, number>();
  private readonly active = new Map<string, number>();
  private readonly windows = new Map<string, { started: number; count: number }>();
  private readonly alertDedupe = new Set<string>();
  private readonly aiConsentReceipts = new Map<string, AiConsentReceipt>();
  private readonly aiConsentReceiptKeys = new Map<string, string>();
  readonly alerts: BillableAlert[] = [];

  private amount(map: Map<string, number>, key: string) {
    return map.get(key) ?? 0;
  }

  private adjust(map: Map<string, number>, key: string, delta: number) {
    map.set(key, Math.max(0, this.amount(map, key) + delta));
  }

  private decrementActive(principalRef: string, resource: string) {
    const key = principalRef;
    this.active.set(key, Math.max(0, this.amount(this.active, key) - 1));
  }

  async reserveDetailed(input: {
    principalRef: string;
    resource?: string;
    microUsd: number;
    idempotencyKey: string;
    limits: BillableLimits;
    now?: Date;
  }): Promise<ReservationResult> {
    const resource = input.resource ?? "default";
    const idempotencyKey = usageKey(input.principalRef, resource, input.idempotencyKey);
    const prior = this.reservationsByKey.get(idempotencyKey);
    if (prior) return { ok: false, reason: "idempotency-replayed" };
    if (
      !input.principalRef
      || !input.idempotencyKey
      || !Number.isSafeInteger(input.microUsd)
      || input.microUsd < 0
    ) return { ok: false, reason: "invalid-reservation" };

    const now = input.now ?? new Date();
    const dayKey = utcDayKey(now);
    const monthKey = utcMonthKey(now);
    const principalDay = usageKey(input.principalRef, "day", dayKey);
    const principalMonth = usageKey(input.principalRef, "month", monthKey);
    const globalMonth = usageKey("global", monthKey);
    const providerRef = providerRefForResource(resource);
    const providerMonth = usageKey(providerRef, monthKey);
    const activeKey = input.principalRef;
    if (this.amount(this.active, activeKey) >= input.limits.maxConcurrency) {
      return { ok: false, reason: "concurrency" };
    }
    if (this.amount(this.principalSpend, principalDay) + input.microUsd > input.limits.dailyMicroUsd) {
      return { ok: false, reason: "daily-ceiling" };
    }
    if (this.amount(this.principalSpend, principalMonth) + input.microUsd > input.limits.monthlyMicroUsd) {
      return { ok: false, reason: "monthly-ceiling" };
    }
    if (this.amount(this.globalSpend, globalMonth) + input.microUsd > input.limits.globalMonthlyMicroUsd) {
      return { ok: false, reason: "global-monthly-ceiling" };
    }
    if (this.amount(this.providerSpend, providerMonth) + input.microUsd > input.limits.providerMonthlyMicroUsd) {
      return { ok: false, reason: "provider-monthly-ceiling" };
    }

    const reservation: Reservation = {
      id: randomUUID(),
      principalRef: input.principalRef,
      resource,
      reservedMicroUsd: input.microUsd,
      cents: input.microUsd,
      dispatched: false,
    };
    const record: MemoryReservation = { reservation, dayKey, monthKey, status: "reserved" };
    this.reservationsByKey.set(idempotencyKey, record);
    this.reservationsById.set(reservation.id, record);
    this.adjust(this.principalSpend, principalDay, input.microUsd);
    this.adjust(this.principalSpend, principalMonth, input.microUsd);
    this.adjust(this.globalSpend, globalMonth, input.microUsd);
    this.adjust(this.providerSpend, providerMonth, input.microUsd);
    this.adjust(this.active, activeKey, 1);
    const thresholdScopes = [
      ["principal-day", this.amount(this.principalSpend, principalDay), input.limits.dailyMicroUsd],
      ["principal-month", this.amount(this.principalSpend, principalMonth), input.limits.monthlyMicroUsd],
      ["global-month", this.amount(this.globalSpend, globalMonth), input.limits.globalMonthlyMicroUsd],
      ["provider-month", this.amount(this.providerSpend, providerMonth), input.limits.providerMonthlyMicroUsd],
    ] as const;
    for (const threshold of input.limits.alertThresholds) {
      for (const [scope, used, ceiling] of thresholdScopes) {
        if (ceiling > 0 && (used / ceiling) * 100 >= threshold) {
          await this.alert({
            code: "budget-threshold",
            principalRef: input.principalRef,
            metadata: { resource, scope, threshold: String(threshold) },
          });
        }
      }
    }
    return { ok: true, reservation };
  }

  async reserve(input: {
    principalRef: string;
    resource?: string;
    microUsd: number;
    idempotencyKey: string;
    limits: BillableLimits;
  }) {
    const result = await this.reserveDetailed(input);
    return result.ok ? result.reservation : null;
  }

  async settle(reservation: Reservation, actualMicroUsd: number | null, dispatched: boolean) {
    const record = this.reservationsById.get(reservation.id);
    if (!record || record.status !== "reserved") return;
    if (
      actualMicroUsd !== null
      && (!Number.isSafeInteger(actualMicroUsd) || actualMicroUsd < 0)
    ) throw new TypeError("Actual billable usage must be a non-negative integer number of micro-USD.");
    const chargedMicroUsd = actualMicroUsd ?? record.reservation.reservedMicroUsd;
    const delta = chargedMicroUsd - record.reservation.reservedMicroUsd;
    this.adjust(
      this.principalSpend,
      usageKey(record.reservation.principalRef, "day", record.dayKey),
      delta,
    );
    this.adjust(
      this.principalSpend,
      usageKey(record.reservation.principalRef, "month", record.monthKey),
      delta,
    );
    this.adjust(this.globalSpend, usageKey("global", record.monthKey), delta);
    this.adjust(
      this.providerSpend,
      usageKey(providerRefForResource(record.reservation.resource), record.monthKey),
      delta,
    );
    record.status = "settled";
    record.reservation.dispatched = dispatched;
    this.decrementActive(record.reservation.principalRef, record.reservation.resource);
    if (delta > 0) {
      await this.alert({
        code: "reservation-overrun",
        principalRef: record.reservation.principalRef,
        metadata: {
          reason: "actual-exceeded-reservation",
          resource: record.reservation.resource,
        },
      });
    }
  }

  async release(reservation: Reservation) {
    const record = this.reservationsById.get(reservation.id);
    if (!record || record.status !== "reserved") return;
    this.adjust(
      this.principalSpend,
      usageKey(record.reservation.principalRef, "day", record.dayKey),
      -record.reservation.reservedMicroUsd,
    );
    this.adjust(
      this.principalSpend,
      usageKey(record.reservation.principalRef, "month", record.monthKey),
      -record.reservation.reservedMicroUsd,
    );
    this.adjust(
      this.globalSpend,
      usageKey("global", record.monthKey),
      -record.reservation.reservedMicroUsd,
    );
    this.adjust(
      this.providerSpend,
      usageKey(providerRefForResource(record.reservation.resource), record.monthKey),
      -record.reservation.reservedMicroUsd,
    );
    record.status = "released";
    this.decrementActive(record.reservation.principalRef, record.reservation.resource);
  }

  async consumeQuota(
    principalRef: string,
    resource = "default",
    limit = 6,
    now = new Date(),
  ) {
    if (!principalRef || !Number.isSafeInteger(limit) || limit < 0) return false;
    const key = usageKey(principalRef, resource);
    const timestamp = now.getTime();
    const window = this.windows.get(key);
    if (!window || timestamp - window.started >= 60_000) {
      this.windows.set(key, { started: timestamp, count: 1 });
      return limit >= 1;
    }
    if (window.count >= limit) return false;
    window.count += 1;
    return true;
  }

  async alert(event: BillableAlert) {
    const metadata = sanitizedAlertMetadata(event.metadata);
    const bucket = event.code === "budget-threshold"
      ? new Date().toISOString().slice(0, 7)
      : new Date().toISOString().slice(0, 13);
    const dedupeKey = usageKey(
      event.code,
      event.principalRef,
      bucket,
      JSON.stringify(metadata),
    );
    if (this.alertDedupe.has(dedupeKey)) return;
    this.alertDedupe.add(dedupeKey);
    this.alerts.push({ code: event.code, principalRef: event.principalRef, metadata });
  }

  async recordAiConsentReceipt(input: AiConsentReceiptInput): Promise<AiConsentReceipt | null> {
    if (!validReceiptInput(input)) return null;
    const principalRefHash = createHash("sha256").update(input.principalRef, "utf8").digest("hex");
    const receiptKey = usageKey(principalRefHash, input.operationId);
    const existingId = this.aiConsentReceiptKeys.get(receiptKey);
    if (existingId) {
      const existing = this.aiConsentReceipts.get(existingId);
      if (existing) return { ...existing };
      this.aiConsentReceiptKeys.delete(receiptKey);
    }
    const id = randomUUID();
    const receipt = parseReceiptRow({
      id,
      principalRefHash,
      operationId: input.operationId,
      requestSha256: input.requestSha256,
      consentPolicyVersion: input.consentPolicyVersion,
      provider: input.provider,
      model: input.model,
      recordedAt: new Date().toISOString(),
      status: "authorized",
    }, false);
    if (!receipt) return null;
    this.aiConsentReceipts.set(id, receipt);
    this.aiConsentReceiptKeys.set(receiptKey, id);
    return { ...receipt };
  }

  async updateAiConsentReceiptStatus(input: AiConsentReceiptUpdate): Promise<AiConsentReceipt | null> {
    if (!validReceiptUpdate(input)) return null;
    const prior = this.aiConsentReceipts.get(input.receiptId);
    if (!prior) return null;
    if (prior.status !== "authorized" && prior.status !== input.status) return null;
    const next = parseReceiptRow({
      ...prior,
      status: input.status,
      provider: input.provider,
      model: input.model,
    }, false);
    if (!next) return null;
    this.aiConsentReceipts.set(input.receiptId, next);
    return { ...next };
  }
}

export type Query = (
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

let productionStorePromise: Promise<BillableStore | null> | null = null;

export async function createProductionBillableStore(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  injectedQuery?: Query,
): Promise<BillableStore | null> {
  if (injectedQuery) return createPostgresBillableStore(injectedQuery);
  if (productionStorePromise) return productionStorePromise;
  const url = environment.OPEN_ENA_BILLABLE_DATABASE_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
      || !parsed.hostname
    ) return null;
  } catch {
    return null;
  }
  const pending = import("pg")
    .then(({ Pool }) => {
      const pool = new Pool({
        connectionString: url,
        max: 5,
        connectionTimeoutMillis: 2_000,
        idleTimeoutMillis: 30_000,
        statement_timeout: 5_000,
      });
      return createPostgresBillableStore(async (sql, params) => {
        const result = await pool.query(sql, params as unknown[]);
        return { rows: result.rows as Array<Record<string, unknown>> };
      });
    })
    .catch(() => null);
  productionStorePromise = pending;
  const store = await pending;
  if (!store && productionStorePromise === pending) productionStorePromise = null;
  return store;
}

function rowReservation(value: unknown): Reservation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reservedMicroUsd = Number(row.reserved_micro_usd ?? row.cents);
  if (
    typeof row.id !== "string"
    || typeof row.principal_ref !== "string"
    || !Number.isSafeInteger(reservedMicroUsd)
    || reservedMicroUsd < 0
  ) return null;
  return {
    id: row.id,
    principalRef: row.principal_ref,
    resource: typeof row.resource === "string" ? row.resource : "default",
    reservedMicroUsd,
    cents: reservedMicroUsd,
    dispatched: row.dispatched === true,
  };
}

export function createPostgresBillableStore(query: Query): BillableStore {
  return {
    async reserveDetailed(input) {
      try {
        const result = await query(
          "SELECT * FROM open_ena_reserve_billable($1,$2,$3,$4,$5)",
          [
            input.principalRef,
            input.resource ?? "default",
            input.microUsd,
            input.idempotencyKey,
            JSON.stringify({
              ...input.limits,
              provider: providerRefForResource(input.resource ?? "default"),
            }),
          ],
        );
        const row = result.rows[0];
        if (row?.allowed === false) {
          const reason = String(row.reason);
          const allowedReasons: readonly ReservationDenialReason[] = [
            "invalid-reservation",
            "idempotency-replayed",
            "minute-quota",
            "daily-ceiling",
            "monthly-ceiling",
            "global-daily-ceiling",
            "global-monthly-ceiling",
            "provider-daily-ceiling",
            "provider-monthly-ceiling",
            "concurrency",
            "store-failure",
          ];
          return {
            ok: false,
            reason: allowedReasons.includes(reason as ReservationDenialReason)
              ? reason as ReservationDenialReason
              : "store-failure",
          };
        }
        const reservation = rowReservation(row?.reservation ?? row);
        return reservation
          ? { ok: true, reservation }
          : { ok: false, reason: "store-failure" };
      } catch {
        return { ok: false, reason: "store-failure" };
      }
    },
    async reserve(input) {
      const result = await this.reserveDetailed!({ ...input });
      return result.ok ? result.reservation : null;
    },
    async settle(reservation, actualMicroUsd, dispatched) {
      await query(
        "SELECT open_ena_settle_billable($1,$2,$3)",
        [reservation.id, actualMicroUsd, dispatched],
      );
    },
    async release(reservation) {
      await query("SELECT open_ena_release_billable($1)", [reservation.id]);
    },
    async consumeQuota(principalRef, resource = "default", limit = 6) {
      if (!Number.isSafeInteger(limit) || limit < 0) return false;
      try {
        const result = await query(
          "SELECT open_ena_consume_quota($1,$2,$3) AS allowed",
          [principalRef, resource, limit],
        );
        return result.rows[0]?.allowed === true;
      } catch (error) {
        throw new Error("Durable quota store is unavailable.", { cause: error });
      }
    },
    async alert(event) {
      await query(
        "SELECT open_ena_emit_security_alert($1,$2,$3)",
        [event.code, event.principalRef, JSON.stringify(sanitizedAlertMetadata(event.metadata))],
      );
    },
    async recordAiConsentReceipt(input) {
      if (!validReceiptInput(input)) return null;
      const principalRefHash = createHash("sha256").update(input.principalRef, "utf8").digest("hex");
      const result = await query(
        "SELECT open_ena_record_ai_consent_receipt($1,$2,$3,$4,$5,$6) AS receipt",
        [principalRefHash, input.operationId, input.requestSha256, input.consentPolicyVersion, input.provider, input.model],
      );
      const row = result.rows[0];
      const receipt = row?.receipt && typeof row.receipt === "object" ? row.receipt as Record<string, unknown> : row;
      return parseReceiptRow(receipt, true, {
        principalRefHash,
        operationId: input.operationId,
        requestSha256: input.requestSha256,
        consentPolicyVersion: input.consentPolicyVersion,
        provider: input.provider,
        model: input.model,
        status: "authorized",
      });
    },
    async updateAiConsentReceiptStatus(input) {
      if (!validReceiptUpdate(input)) return null;
      const result = await query(
        "SELECT open_ena_update_ai_consent_receipt($1,$2,$3,$4) AS receipt",
        [input.receiptId, input.status, input.provider, input.model],
      );
      const row = result.rows[0];
      const receipt = row?.receipt && typeof row.receipt === "object" ? row.receipt as Record<string, unknown> : row;
      return parseReceiptRow(receipt, true, {
        id: input.receiptId,
        provider: input.provider,
        model: input.model,
        status: input.status,
      });
    },
  };
}
