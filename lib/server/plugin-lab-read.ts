import { createHash } from "node:crypto";
import type { OpenEnaAuthEnvironment, OpenEnaPrincipal } from "@/lib/open-ena-auth";
import { verifyProductionOpenEnaSessionTokenV2 } from "@/lib/server/open-ena-auth-security-store";
import { readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { decryptPluginLabText, verifyPluginLabStatusSession } from "@/lib/plugin-lab/crypto";
import { parsePluginProposalSubmission } from "@/lib/plugin-lab/proposal";
import { createProductionPluginLabStore, type PluginLabStore } from "@/lib/plugin-lab/store";
import { createPluginLabOperatorCsrf } from "./plugin-lab-operator-route";

type Environment = PluginLabEnvironment & OpenEnaAuthEnvironment;
type CommonDependencies = { environment?: Environment; storeFactory?: () => Promise<PluginLabStore | null> };

async function storeFor(dependencies: CommonDependencies, environment: Environment) {
  try { return await (dependencies.storeFactory?.() ?? createProductionPluginLabStore(environment)); } catch { return null; }
}

export async function readPluginLabStatusForSession(
  token: string | undefined,
  dependencies: CommonDependencies & { now?: () => number } = {},
) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  const configuration = readPluginLabConfiguration(environment); if (!configuration) return null;
  const session = verifyPluginLabStatusSession(token, (dependencies.now ?? Date.now)(), configuration.secret); if (!session) return null;
  const store = await storeFor(dependencies, environment); if (!store) return null;
  try {
    const status = await store.readStatus(session.proposalId);
    if (!status) return null;
    const { payloadCipher: _payloadCipher, publicProjectionCipher, publicProjectionSha256, ...safeStatus } = status;
    if (!publicProjectionCipher || status.state !== "selected" || status.visibility !== "public-after-review" || status.emailConfirmed !== true
      || (status.publicConsentStatus !== "requested" && status.publicConsentStatus !== "confirmed") || status.publicModerationStatus !== "approved") return safeStatus;
    const publicPreview = decryptVerifiedPublicProjection(status.proposalId, publicProjectionCipher, publicProjectionSha256, configuration.keyVersion, configuration.encryptionKey);
    return { ...safeStatus, publicPreview };
  } catch { return null; }
}

function parseStoredSubmission(serialized: string) {
  const record = JSON.parse(serialized) as Record<string, unknown>;
  return parsePluginProposalSubmission({
    ...record,
    referenceLinks: Array.isArray(record.referenceLinks) ? record.referenceLinks.join("\n") : record.referenceLinks,
    dataSafetyConfirmed: record.dataSafetyConfirmed === true ? "yes" : record.dataSafetyConfirmed,
    privacyConsent: record.privacyConsent === true ? "yes" : record.privacyConsent,
  });
}

function parseStoredPublicProjection(serialized: string) {
  const value = JSON.parse(serialized) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("Invalid public projection.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || typeof record.title !== "string" || typeof record.publicSummary !== "string"
    || !record.title.trim() || record.title.length > 160 || !record.publicSummary.trim() || record.publicSummary.length > 1_200) throw new TypeError("Invalid public projection.");
  return { title: record.title, publicSummary: record.publicSummary };
}

function decryptVerifiedPublicProjection(
  proposalId: string,
  cipher: Parameters<typeof decryptPluginLabText>[0],
  expectedSha256: string | undefined,
  keyVersion: string,
  encryptionKey: Buffer,
) {
  if (!expectedSha256 || !/^[0-9a-f]{64}$/u.test(expectedSha256)) throw new TypeError("Invalid public projection binding.");
  const plaintext = decryptPluginLabText(cipher, { [keyVersion]: encryptionKey }, `public-projection:${proposalId}`);
  const actual = createHash("sha256").update(plaintext, "utf8").digest("hex");
  if (actual !== expectedSha256) throw new TypeError("Public projection binding mismatch.");
  return parseStoredPublicProjection(plaintext);
}

export async function readPluginLabOperatorInbox(
  token: string | undefined,
  dependencies: CommonDependencies & {
    verifyOperator?: (token: string | undefined) => Promise<OpenEnaPrincipal | null>;
  } = {},
) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  const configuration = readPluginLabConfiguration(environment); if (!configuration) return null;
  const principal = dependencies.verifyOperator
    ? await dependencies.verifyOperator(token)
    : await verifyProductionOpenEnaSessionTokenV2(token, Date.now(), environment);
  if (!principal) return null;
  const store = await storeFor(dependencies, environment); if (!store) return null;
  try {
    const records = await store.listForOperator();
    return {
      csrf: createPluginLabOperatorCsrf(principal, configuration.secret),
      records: records.map((record) => {
        const { payloadCipher, publicProjectionCipher: _publicProjectionCipher, ...safeRecord } = record;
        return {
          ...safeRecord,
          submission: parseStoredSubmission(decryptPluginLabText(payloadCipher, { [configuration.keyVersion]: configuration.encryptionKey }, `proposal-payload:${record.proposalId}`)),
        };
      }),
    };
  } catch { return null; }
}

export async function readPluginLabPublicSummaries(dependencies: CommonDependencies = {}) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  const configuration = readPluginLabConfiguration(environment); if (!configuration) return [];
  const store = await storeFor(dependencies, environment); if (!store) return [];
  try {
    const records = await store.listPublicSummaries();
    return records.map((record) => {
      const projection = decryptVerifiedPublicProjection(record.proposalId, record.publicProjectionCipher, record.publicProjectionSha256, configuration.keyVersion, configuration.encryptionKey);
      return { proposalId: record.proposalId, ...projection, updatedAt: record.updatedAt };
    });
  } catch { return []; }
}
