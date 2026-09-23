import {
  OPEN_ENA_AI_PROMPT_VERSION_V2,
  OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2,
  parseOpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationRequestV2,
} from "../../lib/open-ena/ai-interpretation";

function stableEvidenceKey(evidence: unknown) {
  const text = JSON.stringify(evidence);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function interpretationRequest(
  locale: OpenEnaAiInterpretationRequestV2["locale"] = "en",
): OpenEnaAiInterpretationRequestV2 {
  const request: OpenEnaAiInterpretationRequestV2 = {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V2,
    locale,
    binding: {
      analyzedAt: "2026-08-21T10:00:00.000Z",
      datasetHash: "b".repeat(64),
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      modelType: "EndPoint",
      axes: ["Confidential axis one", "Confidential axis two"],
      evidenceKey: "fnv1a32-00000000",
    },
    evidence: {
      kind: "endpoint-independent",
      modelType: "EndPoint",
      scope: {
        kind: "endpoint-independent",
        groupRoles: ["primary", "secondary"],
      },
      descriptive: {
        axes: [
          { id: "axis-1", role: "axis-1", varianceShare: 0.51 },
          { id: "axis-2", role: "axis-2", varianceShare: 0.32 },
        ],
        groups: [
          {
            id: "descriptive-primary",
            role: "primary",
            n: 7,
            meanCoordinates: { "axis-1": 0.234567891234, "axis-2": -0.1 },
          },
          {
            id: "descriptive-secondary",
            role: "secondary",
            n: 8,
            meanCoordinates: { "axis-1": -0.2, "axis-2": 0.1 },
          },
        ],
        edges: [{
          id: "edge-difference-1",
          sourceCodeRole: "code-1",
          targetCodeRole: "code-2",
          primaryWeight: 0.4,
          secondaryWeight: 0.2,
          signedDifference: 0.2,
        }],
        trajectory: null,
      },
      inference: [{
        id: "comparison-axis-1",
        axisRole: "axis-1",
        familyRole: "comparison-family",
        status: "available",
        pRaw: 0.012345678901234,
        pHolm: 0.024691357802468,
        resolvedPMethod: "exact-classic",
        continuityCorrectionApplied: false,
        tieGroupCount: 0,
        tiedObservationCount: 0,
        warnings: [],
        test: "mann-whitney-u",
        groupRoles: ["primary", "secondary"],
        nPrimary: 7,
        nSecondary: 8,
        uPrimary: 12,
        uSecondary: 44,
        rankBiserialPrimaryVsSecondary: -0.5714285714285714,
      }, {
        id: "comparison-axis-2",
        axisRole: "axis-2",
        familyRole: "comparison-family",
        status: "available",
        pRaw: 0.3,
        pHolm: 0.3,
        resolvedPMethod: "exact-classic",
        continuityCorrectionApplied: false,
        tieGroupCount: 0,
        tiedObservationCount: 0,
        warnings: [],
        test: "mann-whitney-u",
        groupRoles: ["primary", "secondary"],
        nPrimary: 7,
        nSecondary: 8,
        uPrimary: 44,
        uSecondary: 12,
        rankBiserialPrimaryVsSecondary: 0.5714285714285714,
      }],
      inferenceOmissions: [],
      boundaries: [
        "aggregate-only",
        "researcher-confirmed-inference-not-recomputed",
        "no-causal-claims",
        "p-values-do-not-establish-learning-gain",
        "p-values-do-not-establish-practical-importance",
        "axis-sign-arbitrary",
        "holm-multiplicity",
        "missingness-reported",
        "independent-entity-assumption",
        "cluster-independence-unverified",
      ],
    },
  };
  return parseOpenEnaAiInterpretationRequest({
    ...request,
    binding: {
      ...request.binding,
      evidenceKey: stableEvidenceKey(request.evidence),
    },
  }) as OpenEnaAiInterpretationRequestV2;
}
