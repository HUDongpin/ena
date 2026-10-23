import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { OpenEnaAuthSecurityQuery } from "./open-ena-auth-security-store";

export type OpenEnaUserPassword = { salt: Buffer; hash: Buffer };
const SCRYPT_OPTIONS = { N: 131_072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 } as const;
const DUMMY_SALT = Buffer.from("22c473585124776cc4e89640ab103ba3", "hex");
let activeDerivations = 0;

/** ASCII email addresses are case-insensitive account identifiers; passwords are never trimmed. */
export function normalizeOpenEnaEmail(input: unknown): string | null {
  if (typeof input !== "string" || /[\u0000-\u001f\u007f]/u.test(input)) return null;
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(value)) return null;
  const local = value.split("@", 1)[0];
  return local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") ? value : null;
}

export function validOpenEnaUserPassword(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 && [...value].length >= 15
    && [...value].length <= 128 && !/[\u0000-\u001f\u007f]/u.test(value);
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Bound memory even when requests for different accounts pass the durable source limiter.
  if (activeDerivations >= 2) throw new Error("Password verification is temporarily busy.");
  activeDerivations += 1;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 32, SCRYPT_OPTIONS, (error, hash) => error ? reject(error) : resolve(Buffer.from(hash)));
    });
  } finally { activeDerivations -= 1; }
}

export async function hashOpenEnaUserPassword(password: string): Promise<OpenEnaUserPassword> {
  if (!validOpenEnaUserPassword(password)) throw new TypeError("Password must contain 15–128 characters.");
  const salt = randomBytes(16);
  return { salt, hash: await derive(password, salt) };
}

export async function verifyOpenEnaUserPassword(password: string, material: OpenEnaUserPassword | null): Promise<boolean> {
  if (typeof password !== "string" || password.length > 256) return false;
  if (material && (!Buffer.isBuffer(material.salt) || material.salt.length !== 16
    || !Buffer.isBuffer(material.hash) || material.hash.length !== 32)) {
    throw new TypeError("Invalid registered password material.");
  }
  const candidate = await derive(password, material?.salt ?? DUMMY_SALT);
  return material !== null && timingSafeEqual(candidate, material.hash);
}

export async function verifyRegisteredOpenEnaCredentials(
  query: OpenEnaAuthSecurityQuery,
  submittedEmail: string,
  password: string,
): Promise<{ userId: string; sessionVersion: number } | null> {
  const email = normalizeOpenEnaEmail(submittedEmail);
  if (!email) return null;
  const result = await query(
    "SELECT id, password_salt, password_hash, session_version, disabled_at FROM open_ena_users WHERE email = $1",
    [email],
  );
  const row = result.rows[0];
  const valid = await verifyOpenEnaUserPassword(password, row
    ? { salt: row.password_salt as Buffer, hash: row.password_hash as Buffer } : null);
  if (!row || !valid || row.disabled_at !== null) return null;
  if (typeof row.id !== "string" || !Number.isSafeInteger(row.session_version) || Number(row.session_version) < 1) {
    throw new TypeError("Invalid registered account record.");
  }
  return { userId: row.id, sessionVersion: Number(row.session_version) };
}
