import {
  OPEN_ENA_EXPORT_FAMILY_NAMES,
  type OpenEnaExportFamily,
} from "./export-applicability";

/** Teaching samples a non-expert can load from an empty Data rail. */
export const TEACHING_SAMPLE_KINDS = ["endpoint", "trajectory", "ona"] as const;
export type TeachingSampleKind = (typeof TEACHING_SAMPLE_KINDS)[number];

export const TEACHING_SAMPLE_EXPECTED_OUTPUTS = ["endpoint-fit", "separate-trajectory", "ona-ready"] as const;
export type TeachingSampleExpectedOutput = (typeof TEACHING_SAMPLE_EXPECTED_OUTPUTS)[number];

export interface TeachingSampleCatalogEntry {
  readonly kind: TeachingSampleKind;
  readonly family: OpenEnaExportFamily;
  readonly expectedOutput: TeachingSampleExpectedOutput;
}

/**
 * Intended family for each teaching sample.
 * Accumulated trajectory stays in the shared family vocabulary and has no sample of its own.
 */
export const TEACHING_SAMPLE_CATALOG = {
  endpoint: { kind: "endpoint", family: "endpoint", expectedOutput: "endpoint-fit" },
  trajectory: { kind: "trajectory", family: "separate", expectedOutput: "separate-trajectory" },
  ona: { kind: "ona", family: "ona", expectedOutput: "ona-ready" },
} as const satisfies Record<TeachingSampleKind, TeachingSampleCatalogEntry>;

export function teachingSampleFamilyName(kind: TeachingSampleKind): string {
  return OPEN_ENA_EXPORT_FAMILY_NAMES[TEACHING_SAMPLE_CATALOG[kind].family];
}

/** `loadSample(true)` remains the trajectory call; `false` remains Endpoint. */
export function teachingSampleKindFromLoadRequest(value: boolean | TeachingSampleKind): TeachingSampleKind {
  if (value === true) return "trajectory";
  if (value === false) return "endpoint";
  switch (value) {
    case "endpoint":
    case "trajectory":
    case "ona":
      return value;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

export const TEACHING_SAMPLE_PROGRESS_STEPS = ["load", "drafts", "gates", "build"] as const;
export type TeachingSampleProgressStepId = (typeof TEACHING_SAMPLE_PROGRESS_STEPS)[number];

export const TEACHING_SAMPLE_BUILD_PHASES = ["pending", "running", "succeeded"] as const;
export type TeachingSampleBuildPhase = (typeof TEACHING_SAMPLE_BUILD_PHASES)[number];

export interface TeachingSampleProgressStep {
  readonly id: TeachingSampleProgressStepId;
  readonly done: boolean;
}

export interface TeachingSampleProgressInput {
  readonly loaded: boolean;
  /** True after the sample install wrote its prefilled drafts. Later edits do not undo this step. */
  readonly draftsPrefilled: boolean;
  /** False while the current draft has not yet returned from the existing compiler. */
  readonly admissionSettled: boolean;
  /** Count of gates that already block Rebuild/Run. Admission rules are not changed here. */
  readonly remainingGateCount: number;
  readonly buildPhase: TeachingSampleBuildPhase;
}

/** Ordered first-success path: load, prefilled drafts, remaining gates, then Build. */
export function teachingSampleFirstSuccessProgress(
  input: TeachingSampleProgressInput,
): readonly TeachingSampleProgressStep[] {
  const gatesDone = input.admissionSettled && input.remainingGateCount === 0;
  return [
    { id: "load", done: input.loaded },
    { id: "drafts", done: input.draftsPrefilled },
    { id: "gates", done: gatesDone },
    { id: "build", done: input.buildPhase === "succeeded" },
  ];
}
