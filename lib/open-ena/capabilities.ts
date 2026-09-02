import { canonicalizeOpenEnaConfig } from "./network-config";
import type { AnalysisKind, OpenEnaConfig, OpenEnaResult, OpenEnaView } from "./types";

export type OpenEnaCapability =
  | "analysis-sets"
  | "reference-rotation"
  | "group-contrast"
  | "trajectory"
  | "3d"
  | "inference"
  | "ai-interpretation";

export type OpenEnaCapabilityErrorCode =
  | "ona-feature-not-verified"
  | "analysis-network-invalid"
  | "analysis-network-mismatch";

export class OpenEnaCapabilityError extends Error {
  readonly name = "OpenEnaCapabilityError";

  constructor(
    readonly code: OpenEnaCapabilityErrorCode,
    readonly feature: OpenEnaCapability | "analysis",
    message: string,
  ) {
    super(message);
  }
}

export const OPEN_ENA_CAPABILITIES = {
  ena: {
    analysisSets: true,
    referenceRotation: true,
    groupContrast: true,
    trajectory: true,
    threeDimensionalPlot: true,
    inference: true,
    aiInterpretation: true,
  },
  ona: {
    analysisSets: false,
    referenceRotation: false,
    groupContrast: false,
    trajectory: false,
    threeDimensionalPlot: true,
    inference: false,
    aiInterpretation: false,
  },
} as const;

export type OpenEnaDataViewUnavailableReason =
  | "active-group-contrast-required"
  | "active-3d-group-contrast-required";

export interface OpenEnaDataViewAvailability {
  enabled: boolean;
  reason: OpenEnaDataViewUnavailableReason | null;
}

export interface OpenEnaDataViewUnavailableCopy {
  title: string;
  ariaLabel: string;
}

const OPEN_ENA_DATA_VIEW_UNAVAILABLE_COPY: Readonly<Record<
  OpenEnaDataViewUnavailableReason,
  Readonly<OpenEnaDataViewUnavailableCopy>
>> = {
  "active-group-contrast-required": {
    title: "Data View requires an active group comparison.",
    ariaLabel: "Data View unavailable. Select two groups for a comparison first.",
  },
  "active-3d-group-contrast-required": {
    title: "Data View requires an active 3D group comparison.",
    ariaLabel: "Data View unavailable. Select two groups for a 3D comparison first.",
  },
};

export type OpenEnaCenterSurface = "plot" | "data";

export interface OpenEnaDataViewCenterSurface {
  effectiveCenterSurface: OpenEnaCenterSurface;
  dataViewPressed: boolean;
}

export function openEnaDataViewAvailability(input: {
  view: OpenEnaView;
  completedResultKind: AnalysisKind | null;
  hasActiveGroupContrast: boolean;
}): OpenEnaDataViewAvailability {
  if (input.completedResultKind === "ona") {
    return { enabled: true, reason: null };
  }
  if (input.completedResultKind === "ena" && input.hasActiveGroupContrast) {
    return { enabled: true, reason: null };
  }
  return input.view === "3d"
    ? { enabled: false, reason: "active-3d-group-contrast-required" }
    : { enabled: false, reason: "active-group-contrast-required" };
}

export function openEnaDataViewUnavailableCopy(
  reason: OpenEnaDataViewUnavailableReason | null,
): Readonly<OpenEnaDataViewUnavailableCopy> | null {
  return reason === null ? null : OPEN_ENA_DATA_VIEW_UNAVAILABLE_COPY[reason];
}

export function openEnaDataViewCenterSurface(input: {
  requestedCenterSurface: OpenEnaCenterSurface;
  dataViewEnabled: boolean;
}): OpenEnaDataViewCenterSurface {
  const effectiveCenterSurface = input.requestedCenterSurface === "data" && input.dataViewEnabled
    ? "data"
    : "plot";
  return {
    effectiveCenterSurface,
    dataViewPressed: effectiveCenterSurface === "data",
  };
}

function mismatch(message: string): never {
  throw new OpenEnaCapabilityError("analysis-network-mismatch", "analysis", message);
}

export function openEnaAnalysisKindFromResult(result: OpenEnaResult): AnalysisKind {
  const networkType = Reflect.get(result.set, "networkType") as unknown;
  const functionNetworkType = Reflect.get(result.set.functionParams ?? {}, "networkType") as unknown;
  if (networkType !== undefined && networkType !== "standard" && networkType !== "ordered") {
    throw new OpenEnaCapabilityError(
      "analysis-network-invalid",
      "analysis",
      "The Open ENA result declares an unsupported runtime network type.",
    );
  }
  if (functionNetworkType !== undefined
    && functionNetworkType !== "standard"
    && functionNetworkType !== "ordered") {
    throw new OpenEnaCapabilityError(
      "analysis-network-invalid",
      "analysis",
      "The Open ENA result declares unsupported runtime function parameters.",
    );
  }
  const hasOrderedMarker = networkType === "ordered" || functionNetworkType === "ordered";
  if (hasOrderedMarker && (networkType !== "ordered" || functionNetworkType !== "ordered")) {
    mismatch("The Open ENA result runtime network markers disagree about ordered execution.");
  }
  const analysisKind: AnalysisKind = hasOrderedMarker ? "ona" : "ena";
  const provenance = result.executionProvenance;
  if (provenance) {
    if (provenance.analysisKind !== analysisKind
      || provenance.networkType !== (analysisKind === "ona" ? "ordered" : "standard")
      || provenance.configuration.analysisKind !== analysisKind) {
      mismatch("The Open ENA result execution provenance disagrees with its runtime network type.");
    }
  }
  if (result.provenanceBinding) {
    let boundKind: AnalysisKind;
    try {
      boundKind = canonicalizeOpenEnaConfig(result.provenanceBinding.configuration).analysisKind;
    } catch {
      mismatch("The Open ENA result has an invalid bound configuration.");
    }
    if (boundKind !== analysisKind) {
      mismatch("The Open ENA result bound configuration disagrees with its runtime network type.");
    }
  }
  return analysisKind;
}

function blockOna(feature: OpenEnaCapability): never {
  throw new OpenEnaCapabilityError(
    "ona-feature-not-verified",
    feature,
    `ONA ${feature} is not verified in this release. Ordered networks are descriptive-only.`,
  );
}

function onaCapabilityEnabled(feature: OpenEnaCapability) {
  switch (feature) {
    case "analysis-sets": return OPEN_ENA_CAPABILITIES.ona.analysisSets;
    case "reference-rotation": return OPEN_ENA_CAPABILITIES.ona.referenceRotation;
    case "group-contrast": return OPEN_ENA_CAPABILITIES.ona.groupContrast;
    case "trajectory": return OPEN_ENA_CAPABILITIES.ona.trajectory;
    case "3d": return OPEN_ENA_CAPABILITIES.ona.threeDimensionalPlot;
    case "inference": return OPEN_ENA_CAPABILITIES.ona.inference;
    case "ai-interpretation": return OPEN_ENA_CAPABILITIES.ona.aiInterpretation;
  }
}

export function assertOpenEnaCapabilityForConfig(
  config: OpenEnaConfig,
  feature: OpenEnaCapability,
) {
  if (canonicalizeOpenEnaConfig(config).analysisKind === "ona" && !onaCapabilityEnabled(feature)) {
    blockOna(feature);
  }
}

export function assertOpenEnaCapabilityForResult(
  result: OpenEnaResult,
  feature: OpenEnaCapability,
) {
  if (openEnaAnalysisKindFromResult(result) === "ona" && !onaCapabilityEnabled(feature)) {
    blockOna(feature);
  }
}

export function assertOpenEnaCapabilityForContext(
  config: OpenEnaConfig,
  result: OpenEnaResult,
  feature: OpenEnaCapability,
) {
  const configKind = canonicalizeOpenEnaConfig(config).analysisKind;
  const resultKind = openEnaAnalysisKindFromResult(result);
  if (configKind !== resultKind) {
    mismatch("The supplied Open ENA configuration disagrees with the completed runtime result.");
  }
  if (configKind === "ona" && !onaCapabilityEnabled(feature)) blockOna(feature);
}
