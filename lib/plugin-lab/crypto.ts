import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const PLUGIN_LAB_STATUS_COOKIE = "ena-plugin-proposal-status";
export const PLUGIN_LAB_STATUS_MAX_AGE_SECONDS = 30 * 60;
const PROPOSAL_ID = /^plg_[A-Za-z0-9_-]{22}$/u;
const ACCESS_CODE = /^[A-Za-z0-9_-]{43}$/u;

export interface PluginLabCiphertextV1 {
  keyVersion: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

function configuredSecret(secret: string) {
  if (typeof secret !== "string" || secret.length < 32 || /[\u0000-\u001f\u007f]/u.test(secret)) {
    throw new TypeError("Plugin Lab secret must contain at least 32 safe characters.");
  }
  return secret;
}

function configuredKey(key: Buffer) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new TypeError("Plugin Lab encryption key must contain exactly 32 bytes.");
  return key;
}

function configuredBinding(binding: string) {
  if (typeof binding !== "string" || binding.length < 3 || binding.length > 240 || !/^[A-Za-z0-9._:-]+$/u.test(binding)) {
    throw new TypeError("Plugin Lab encryption binding is invalid.");
  }
  return binding;
}

export function createPluginLabProposalId() {
  return `plg_${randomBytes(16).toString("base64url")}`;
}

export function createPluginLabAccessCode() {
  return randomBytes(32).toString("base64url");
}

export function hashPluginLabAccessCode(proposalId: string, accessCode: string, secret: string) {
  if (!PROPOSAL_ID.test(proposalId) || !ACCESS_CODE.test(accessCode)) throw new TypeError("Plugin Lab access material is invalid.");
  return createHmac("sha256", configuredSecret(secret))
    .update(`ena-plugin-lab-access-v1:${proposalId}:${accessCode}`, "utf8")
    .digest("hex");
}

export function equalPluginLabAccessHash(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/u.test(left) || !/^[0-9a-f]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function encryptPluginLabText(text: string, key: Buffer, keyVersion: string, binding: string): PluginLabCiphertextV1 {
  if (typeof text !== "string" || !text || text.length > 16_384) throw new TypeError("Plugin Lab plaintext is invalid.");
  if (!/^[A-Za-z0-9._-]{1,24}$/u.test(keyVersion)) throw new TypeError("Plugin Lab key version is invalid.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", configuredKey(key), iv);
  cipher.setAAD(Buffer.from(`ena-plugin-lab-field:${keyVersion}:${configuredBinding(binding)}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Object.freeze({
    keyVersion,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  });
}

export function decryptPluginLabText(envelope: PluginLabCiphertextV1, keys: Readonly<Record<string, Buffer>>, binding: string) {
  const key = keys[envelope.keyVersion];
  if (!key) throw new TypeError("Plugin Lab encryption key version is unavailable.");
  try {
    const decodeCanonical = (value: string) => {
      if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid base64url");
      const decoded = Buffer.from(value, "base64url");
      if (decoded.toString("base64url") !== value) throw new Error("non-canonical base64url");
      return decoded;
    };
    const iv = decodeCanonical(envelope.iv);
    const ciphertext = decodeCanonical(envelope.ciphertext);
    const tag = decodeCanonical(envelope.tag);
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", configuredKey(key), iv);
    decipher.setAAD(Buffer.from(`ena-plugin-lab-field:${envelope.keyVersion}:${configuredBinding(binding)}`, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new TypeError("Plugin Lab field could not be decrypted.");
  }
}

function statusSignature(payload: string, secret: string) {
  return createHmac("sha256", configuredSecret(secret)).update(payload, "utf8").digest("base64url");
}

export function issuePluginLabStatusSession(proposalId: string, issuedAtMilliseconds: number, secret: string) {
  if (!PROPOSAL_ID.test(proposalId)) throw new TypeError("Plugin Lab proposal ID is invalid.");
  const issued = Math.floor(issuedAtMilliseconds / 1_000);
  if (!Number.isSafeInteger(issued) || issued < 1) throw new TypeError("Plugin Lab status session time is invalid.");
  const expires = issued + PLUGIN_LAB_STATUS_MAX_AGE_SECONDS;
  const nonce = randomUUID();
  const payload = `pls1.${issued}.${expires}.${proposalId}.${nonce}`;
  return `${payload}.${statusSignature(payload, secret)}`;
}

export function verifyPluginLabStatusSession(token: string | undefined, nowMilliseconds: number, secret: string): { proposalId: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== "pls1") return null;
  const [version, issuedText, expiresText, proposalId, nonce, supplied] = parts;
  if (!/^\d+$/u.test(issuedText) || !/^\d+$/u.test(expiresText) || !PROPOSAL_ID.test(proposalId)
    || !/^[0-9a-f-]{36}$/iu.test(nonce) || !/^[A-Za-z0-9_-]{43}$/u.test(supplied)) return null;
  const issued = Number(issuedText); const expires = Number(expiresText); const now = Math.floor(nowMilliseconds / 1_000);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || expires - issued !== PLUGIN_LAB_STATUS_MAX_AGE_SECONDS
    || issued > now + 60 || now >= expires) return null;
  const payload = `${version}.${issuedText}.${expiresText}.${proposalId}.${nonce}`;
  const expected = statusSignature(payload, secret);
  if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  return { proposalId };
}

export function isPluginLabProposalId(value: string) { return PROPOSAL_ID.test(value); }
export function isPluginLabAccessCode(value: string) { return ACCESS_CODE.test(value); }
