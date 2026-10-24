import { captureBundleJsonV3 } from "./bundle-json-v3";
import { deepFreezeV3 } from "./model-v3/canonical-json";
import { parseOpenEnaAiInterpretationRequest, parseOpenEnaAiInterpretationResponse,
  type OpenEnaAiInterpretationRequest, type OpenEnaAiInterpretationResponse } from "./ai-interpretation";
import type { SerializedOpenEnaAnalysisSetV3 } from "./sets-bound-v3";

export type OpenEnaAiAuditReceipt = {
  id: string; durable: string; status: string; recordedAt: string; operationId: string;
  requestSha256: string; consentPolicyVersion: string; provider: string; model: string;
};
export type SavedOpenEnaAiInterpretation = {
  request: OpenEnaAiInterpretationRequest; response: OpenEnaAiInterpretationResponse;
  localScientificIdentity: string; auditReceipt: OpenEnaAiAuditReceipt | null;
};
export type OpenEnaCloudExtras = {
  aiInterpretation: SavedOpenEnaAiInterpretation | null;
  analysisSets: SerializedOpenEnaAnalysisSetV3[];
  setComparison: { primaryId: string; secondaryId: string; axes: [string, string] } | null;
  historicalImports: string[];
};

function exact(value: unknown, keys: string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))) throw new TypeError(`Invalid saved ${label}.`);
}

/** Stored evidence is readable history. It does not restore consent, an
 * operation identifier for retry, or authority to make a fresh AI request. */
export function captureSavedOpenEnaAiInterpretation(input: unknown): SavedOpenEnaAiInterpretation {
  const value = captureBundleJsonV3(input);
  exact(value, ["request", "response", "localScientificIdentity", "auditReceipt"], "AI interpretation");
  // Native trajectory identities include fitted Unit ordering. They share the
  // checked 16 MiB record/project budget rather than an unrelated smaller cap.
  if (typeof value.localScientificIdentity !== "string" || !value.localScientificIdentity.length) throw new TypeError("Invalid saved AI source identity.");
  const request = parseOpenEnaAiInterpretationRequest(value.request);
  const response = parseOpenEnaAiInterpretationResponse(value.response, request);
  if (value.auditReceipt !== null) {
    exact(value.auditReceipt, ["id", "durable", "status", "recordedAt", "operationId", "requestSha256", "consentPolicyVersion", "provider", "model"], "AI audit receipt");
    if (Object.values(value.auditReceipt).some((v) => typeof v !== "string" || v.length > 4096)) throw new TypeError("Invalid saved AI audit receipt.");
  }
  return deepFreezeV3({ request, response, localScientificIdentity: value.localScientificIdentity,
    auditReceipt: value.auditReceipt as OpenEnaAiAuditReceipt | null });
}

/** Cheap server admission. Bundle and import science is checked on restoration. */
export function validateOpenEnaCloudExtras(value: OpenEnaCloudExtras): void {
  if (value.aiInterpretation !== null) captureSavedOpenEnaAiInterpretation(value.aiInterpretation);
  if (!Array.isArray(value.analysisSets) || value.analysisSets.length > 6) throw new TypeError("Invalid saved comparison sets.");
  for (const set of value.analysisSets) {
    exact(set, ["id", "name", "capturedAt", "analysis"], "comparison set");
    if ([set.id, set.name, set.capturedAt].some((s) => typeof s !== "string" || !s.trim() || s.length > 4096)
      || !set.analysis || set.analysis.kind !== "open-ena-analysis-bundle" || set.analysis.schemaVersion !== 3) throw new TypeError("Invalid saved comparison set.");
  }
  if (new Set(value.analysisSets.map((set) => set.id)).size !== value.analysisSets.length) throw new TypeError("Duplicate saved comparison sets.");
  if (value.setComparison !== null) {
    exact(value.setComparison, ["primaryId", "secondaryId", "axes"], "comparison selection");
    const selection = value.setComparison;
    if (selection.primaryId === selection.secondaryId || ![selection.primaryId, selection.secondaryId].every((id) => value.analysisSets.some((set) => set.id === id))
      || !Array.isArray(selection.axes) || selection.axes.length !== 2 || selection.axes[0] === selection.axes[1]
      || selection.axes.some((axis) => typeof axis !== "string" || axis.length > 4096)) throw new TypeError("Invalid saved comparison selection.");
  }
  if (!Array.isArray(value.historicalImports) || value.historicalImports.some((text) => typeof text !== "string" || !text.length)) throw new TypeError("Invalid saved historical imports.");
}
