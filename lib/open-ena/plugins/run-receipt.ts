import type { OpenEnaPluginManifestV1 } from "./types";
import { canonicalOpenEnaPluginValue } from "./runtime-context";

export interface OpenEnaPluginRunReceiptV1 {
  schemaVersion: "ena.hk/plugin-run-receipt/v1";
  pluginId: string;
  pluginVersion: string;
  manifestSha256: string;
  parentResultBindingSha256: string;
  postPluginResultBindingSha256: string;
  outputSha256: string;
  dataAccessTier: OpenEnaPluginManifestV1["permissions"]["dataAccessTier"];
  changesAnalysis: boolean;
  scientificResult: "unchanged-parent-result" | "derived-plugin-result";
  settings: Readonly<{ axes: readonly string[]; camera: string; flipX: boolean; flipY: boolean }>;
  limitations: readonly string[];
  recordedAt: string;
  runId: string;
}

async function sha256(value: unknown) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalOpenEnaPluginValue(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export async function createOpenEnaPluginRunReceiptV1(input: {
  manifest: OpenEnaPluginManifestV1;
  parentScientificResult: unknown;
  currentScientificResult: unknown;
  output: unknown;
  settings: { axes: readonly string[]; camera: string; flipX: boolean; flipY: boolean };
  now?: string;
  runId?: string;
}): Promise<OpenEnaPluginRunReceiptV1> {
  const recordedAt = input.now ?? new Date().toISOString();
  const runId = input.runId ?? globalThis.crypto.randomUUID();
  if (Number.isNaN(Date.parse(recordedAt)) || !/^[0-9a-f-]{36}$/iu.test(runId)) throw new TypeError("Plugin run receipt identity is invalid.");
  const parentRecord = input.parentScientificResult && typeof input.parentScientificResult === "object" && !Array.isArray(input.parentScientificResult)
    ? input.parentScientificResult as Record<string, unknown>
    : null;
  if (!parentRecord || typeof parentRecord.sourceDatasetSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(parentRecord.sourceDatasetSha256)) {
    throw new TypeError("Plugin run receipt requires verified source provenance.");
  }
  const parentResultBindingSha256 = await sha256(input.parentScientificResult);
  const postPluginResultBindingSha256 = await sha256(input.currentScientificResult);
  if (!input.manifest.changesAnalysis && parentResultBindingSha256 !== postPluginResultBindingSha256) {
    throw new TypeError("Plugin scientific result changed during display-only execution.");
  }
  const receipt: OpenEnaPluginRunReceiptV1 = {
    schemaVersion: "ena.hk/plugin-run-receipt/v1",
    pluginId: input.manifest.pluginId,
    pluginVersion: input.manifest.version,
    manifestSha256: await sha256(input.manifest),
    parentResultBindingSha256,
    postPluginResultBindingSha256,
    outputSha256: await sha256(input.output),
    dataAccessTier: input.manifest.permissions.dataAccessTier,
    changesAnalysis: input.manifest.changesAnalysis,
    scientificResult: input.manifest.changesAnalysis ? "derived-plugin-result" : "unchanged-parent-result",
    settings: { axes: [...input.settings.axes], camera: input.settings.camera, flipX: input.settings.flipX, flipY: input.settings.flipY },
    limitations: [...input.manifest.scientificBoundary.nonClaims],
    recordedAt,
    runId,
  };
  return deepFreeze(receipt) as OpenEnaPluginRunReceiptV1;
}
