import type { PluginLabCiphertextV1 } from "./crypto";

export type PluginLabEnvironment = Readonly<Record<string, string | undefined>>;

export interface PluginLabConfiguration {
  databaseUrl: string;
  encryptionKey: Buffer;
  keyVersion: "v1";
  secret: string;
}

function databaseUrl(value: string | undefined, requireVerifiedTls: boolean) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname || url.pathname === "/") return null;
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    const sslMode = url.searchParams.get("sslmode");
    if (requireVerifiedTls && !loopback && sslMode !== "require" && sslMode !== "verify-ca" && sslMode !== "verify-full") return null;
    return value;
  } catch { return null; }
}

function encryptionKey(value: string | undefined) {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === value ? decoded : null;
}

export function readPluginLabConfiguration(environment: PluginLabEnvironment = process.env): PluginLabConfiguration | null {
  const url = databaseUrl(environment.ENA_PLUGIN_LAB_DATABASE_URL?.trim(), environment.NODE_ENV === "production");
  const key = encryptionKey(environment.ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1?.trim());
  const secret = environment.ENA_PLUGIN_LAB_SECRET;
  if (!url || !key || !secret || secret.length < 32 || /[\u0000-\u001f\u007f]/u.test(secret)) return null;
  return { databaseUrl: url, encryptionKey: key, keyVersion: "v1", secret };
}

export function pluginLabProposalIntakeEnabled(environment: PluginLabEnvironment = process.env) {
  return environment.ENA_PLUGIN_LAB_PROPOSALS_ENABLED === "true"
    && readPluginLabConfiguration(environment) !== null;
}

export function isPluginLabCiphertextV1(value: unknown): value is PluginLabCiphertextV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 4
    && record.keyVersion === "v1"
    && typeof record.iv === "string"
    && typeof record.ciphertext === "string"
    && typeof record.tag === "string";
}
