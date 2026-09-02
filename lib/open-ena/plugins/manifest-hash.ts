import type { OpenEnaPluginManifestV1 } from "./types";
import { canonicalPluginJson, sha256HexUtf8 } from "./sha256";

export function openEnaPluginManifestHash(manifest: OpenEnaPluginManifestV1) {
  return sha256HexUtf8(canonicalPluginJson(manifest));
}

export function openEnaPluginReviewedManifestHash(manifest: unknown) {
  const normalized = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  normalized.reviewReceipts = [];
  const approval = normalized.approvalBinding as Record<string, unknown> | undefined;
  if (approval) approval.reviewedManifestSha256 = null;
  return sha256HexUtf8(canonicalPluginJson(normalized));
}
