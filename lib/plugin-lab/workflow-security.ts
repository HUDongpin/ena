import { createHmac, randomBytes, randomInt } from "node:crypto";

export const PLUGIN_LAB_RESEARCHER_COOKIE = "ena-plugin-lab-researcher";
export const PLUGIN_LAB_LEGACY_COOKIE = "ena-plugin-lab-legacy";
export const PLUGIN_LAB_RESEARCHER_MAX_AGE = 30 * 60;
export const PLUGIN_LAB_CODE_MAX_AGE = 10 * 60;

export function normalizePluginLabEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) && !/[\u0000-\u001f\u007f]/u.test(email) ? email : null;
}

export function pluginLabEmailRef(email: string, secret: string) {
  return createHmac("sha256", secret).update(`plugin-lab-email-v1:${email}`).digest("base64url");
}

export function pluginLabWorkflowHash(purpose: string, value: string, secret: string) {
  return createHmac("sha256", secret).update(`plugin-lab-${purpose}-v1:${value}`).digest("hex");
}

export function pluginLabActorRef(kind: string, value: string, secret: string) {
  return createHmac("sha256", secret).update(`plugin-lab-actor-${kind}:${value}`).digest("base64url");
}

export function createPluginLabEmailCode() { return String(randomInt(0, 1_000_000)).padStart(6, "0"); }
export function createPluginLabOpaqueToken() { return randomBytes(32).toString("base64url"); }
export function isPluginLabOpaqueToken(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value); }

export function pluginLabCookie(headers: Headers, name: string) {
  return (headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function pluginLabSessionCookie(name: string, token: string, maxAge = PLUGIN_LAB_RESEARCHER_MAX_AGE) {
  return `${name}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}
