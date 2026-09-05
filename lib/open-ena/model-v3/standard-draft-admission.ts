import { deepFreezeV3 } from "./canonical-json";
import { exactStandardResourceEstimateV3 } from "./compiler-dataset";
import { buildStandardSourceProofPayloadV3 } from "./execution-plan";
import { decodeCanonicalStandardConfigV3 } from "./schema";
import { canonicalJsonByteLengthV3, estimateStandardOperationalAdmissionV3 } from "./standard-closure-resource-budget";
import { OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 } from "./types";
import type { DatasetBindingV3, StandardEnaDraftV3 } from "./types";
import type { ParsedDataset } from "../types";

type AdmissionDraftV3 = Omit<StandardEnaDraftV3, "rotation"> & { rotation: StandardEnaDraftV3["rotation"] | { type: "reference"; referenceId: unknown; expectedContentSha256: unknown } };

function standardCanonicalFromDraftV3(draft: AdmissionDraftV3): unknown {
  const rotation = draft.rotation.type === "svd"
    ? { type: "svd", centerAlignToOrigin: draft.rotation.centerAlignToOrigin }
    : draft.rotation.type === "means"
      ? {
          type: "means",
          centerAlignToOrigin: draft.rotation.centerAlignToOrigin,
          contrast: {
            groupColumn: draft.groupColumn,
            negativeLevel: draft.rotation.negativeLevel,
            positiveLevel: draft.rotation.positiveLevel,
          },
        }
      : {
          type: "reference",
          referenceId: draft.rotation.referenceId,
          expectedContentSha256: draft.rotation.expectedContentSha256,
        };
  return {
    schemaVersion: 3,
    analysisFamily: "standard",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: {
      columns: draft.unitColumns,
      group: draft.groupColumn === null
        ? { type: "none" }
        : { type: "stable-metadata", column: draft.groupColumn },
    },
    horizons: { columns: draft.horizonColumns },
    codes: draft.codes.map((column) => ({ column, displayLabel: column })),
    weighting: { type: draft.weighting },
    window: draft.windowType === "Conversation"
      ? { type: "Conversation" }
      : {
          type: "MovingStanzaWindow",
          backward: draft.movingStanza.backward,
          forward: draft.movingStanza.forward,
          rowOrder: draft.movingStanza.rowOrder,
        },
    analysis: draft.model === "EndPoint"
      ? { model: { type: "EndPoint" }, rotation }
      : { model: { type: draft.model, horizonOrder: draft.horizonOrder }, rotation },
  };
}


/** Mandatory, internally derived admission before source networks or rank work.
 * The prepared compiler retains this one selected-source capture; no callback
 * or caller-provided declaration can replace its resource authority. */
export function admitStandardDraftScienceV3(dataset: ParsedDataset, binding: DatasetBindingV3, draft: AdmissionDraftV3) {
  const canonicalConfiguration = deepFreezeV3(decodeCanonicalStandardConfigV3(standardCanonicalFromDraftV3(draft)));
  const resourceEstimate = exactStandardResourceEstimateV3(dataset, canonicalConfiguration);
  if (resourceEstimate.blocked) throw new TypeError("Exact Standard baseline exceeds the fixed resource budget.");
  const sourceProofPayload = buildStandardSourceProofPayloadV3(dataset, binding, canonicalConfiguration);
  const operationalAdmission = estimateStandardOperationalAdmissionV3(canonicalConfiguration, resourceEstimate, canonicalJsonByteLengthV3(sourceProofPayload));
  return deepFreezeV3({ canonicalConfiguration, resourceEstimate, sourceProofPayload, operationalAdmission });
}
