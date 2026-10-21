import { createHmac } from "node:crypto";
import type { OpenEnaAuthEnvironment } from "@/lib/open-ena-auth";

const TRUSTED_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/u;

export type TrustedClientAddress =
  | { ok: true; address: string }
  | { ok: false };

function canonicalIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const numbers: string[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/u.test(part)) return null;
    const number = Number(part);
    if (number > 255) return null;
    numbers.push(String(number));
  }
  return numbers.join(".");
}

function parseIpv6Side(side: string) {
  if (side === "") return [] as number[];
  const groups = side.split(":");
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function canonicalIpv6(value: string) {
  let text = value.toLowerCase();
  const mapped = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/u.exec(text);
  if (mapped) {
    const dotted = canonicalIpv4(mapped[2] ?? "");
    if (!dotted) return null;
    const [first, second, third, fourth] = dotted.split(".").map(Number);
    const high = (((first ?? 0) << 8) | (second ?? 0)).toString(16);
    const low = (((third ?? 0) << 8) | (fourth ?? 0)).toString(16);
    text = `${mapped[1]}${high}:${low}`;
  }
  if (text.includes(":::")) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;

  let groups: number[] | null;
  if (halves.length === 1) {
    groups = parseIpv6Side(halves[0] ?? "");
    if (!groups || groups.length !== 8) return null;
  } else {
    const left = parseIpv6Side(halves[0] ?? "");
    const right = parseIpv6Side(halves[1] ?? "");
    if (!left || !right || left.length + right.length >= 8) return null;
    groups = [
      ...left,
      ...Array<number>(8 - left.length - right.length).fill(0),
      ...right,
    ];
  }
  if (groups.some((group) => group < 0 || group > 0xffff)) return null;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const high = groups[6] ?? 0;
    const low = groups[7] ?? 0;
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  let bestStart = -1;
  let bestLength = 0;
  let index = 0;
  while (index < groups.length) {
    if (groups[index] !== 0) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < groups.length && groups[index] === 0) index += 1;
    const length = index - start;
    if (length > bestLength) {
      bestStart = start;
      bestLength = length;
    }
  }
  const parts = groups.map((group) => group.toString(16));
  if (bestLength < 2) return parts.join(":");
  const left = parts.slice(0, bestStart).join(":");
  const right = parts.slice(bestStart + bestLength).join(":");
  if (!left && !right) return "::";
  if (!left) return `::${right}`;
  if (!right) return `${left}::`;
  return `${left}::${right}`;
}

/** One canonical IP, or null when the value is missing, chained, or ambiguous. */
export function canonicalClientIp(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /[\s,%]/u.test(trimmed)) return null;
  if (!trimmed.includes(":")) return canonicalIpv4(trimmed);
  return canonicalIpv6(trimmed);
}

/**
 * Reads only the configured reverse-proxy client address.
 * Forwarded chains and any other header are not a source identity.
 */
export function readTrustedClientAddress(
  headers: Headers,
  environment: OpenEnaAuthEnvironment,
): TrustedClientAddress {
  const headerName = environment.OPEN_ENA_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase() ?? "";
  if (!TRUSTED_HEADER_NAME.test(headerName)) return { ok: false };
  const raw = headers.get(headerName);
  if (raw === null) return { ok: false };
  const address = canonicalClientIp(raw);
  if (!address) return { ok: false };
  return { ok: true, address };
}

function loginMac(environment: OpenEnaAuthEnvironment, material: string) {
  const secret = environment.OPEN_ENA_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update(material, "utf8").digest("base64url");
}

/** Namespaces a trusted address by deployment account without creating an account bucket. */
export function openEnaLoginSourceRef(
  address: string,
  environment: OpenEnaAuthEnvironment,
) {
  const accountId = environment.OPEN_ENA_ACCOUNT_ID?.trim();
  if (!accountId || !address) return null;
  return loginMac(environment, `open-ena-login-source:v1:${accountId}:${address}`);
}

/**
 * Pair identity uses the same trimmed, case-sensitive username string that
 * static and disposable authentication compare. The source is part of the
 * pair, so one address cannot exhaust another address's username.
 */
export function openEnaLoginPairRef(
  username: string,
  sourceRef: string,
  environment: OpenEnaAuthEnvironment,
) {
  if (!sourceRef) return null;
  return loginMac(
    environment,
    `open-ena-login-pair:v1:${sourceRef}:${username.trim()}`,
  );
}
