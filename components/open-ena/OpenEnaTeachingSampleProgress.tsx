"use client";

import {
  type TeachingSampleBuildPhase,
  type TeachingSampleKind,
  type TeachingSampleProgressStep,
  type TeachingSampleProgressStepId,
} from "@/lib/open-ena/teaching-sample-guide";

export interface OpenEnaTeachingSampleProgressCopy {
  readonly title: string;
  readonly loaded: string;
  readonly drafts: (family: string) => string;
  readonly gates: string;
  readonly gatesClear: string;
  readonly gatesPending: string;
  readonly build: string;
  readonly buildRunning: string;
  readonly buildDone: string;
  readonly complete: string;
  readonly incomplete: string;
  readonly analysisSetNote: string;
  readonly onaContractNote: string;
  readonly trajectoryNote: string;
}

export interface OpenEnaTeachingSampleGateLabel {
  readonly id: string;
  readonly label: string;
}

function noteForKind(kind: TeachingSampleKind, copy: OpenEnaTeachingSampleProgressCopy): string | null {
  switch (kind) {
    case "endpoint":
      return null;
    case "trajectory":
      return copy.trajectoryNote;
    case "ona":
      return copy.onaContractNote;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function stepLabel(
  id: TeachingSampleProgressStepId,
  copy: OpenEnaTeachingSampleProgressCopy,
  familyLabel: string,
  buildPhase: TeachingSampleBuildPhase,
): string {
  switch (id) {
    case "load":
      return copy.loaded;
    case "drafts":
      return copy.drafts(familyLabel);
    case "gates":
      return copy.gates;
    case "build":
      switch (buildPhase) {
        case "pending":
          return copy.build;
        case "running":
          return copy.buildRunning;
        case "succeeded":
          return copy.buildDone;
        default: {
          const exhaustive: never = buildPhase;
          return exhaustive;
        }
      }
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

export function OpenEnaTeachingSampleProgress({
  kind,
  familyLabel,
  steps,
  buildPhase,
  admissionSettled,
  remainingGates,
  copy,
  testId = "open-ena-teaching-sample-progress",
}: {
  readonly kind: TeachingSampleKind;
  readonly familyLabel: string;
  readonly steps: readonly TeachingSampleProgressStep[];
  readonly buildPhase: TeachingSampleBuildPhase;
  readonly admissionSettled: boolean;
  readonly remainingGates: readonly OpenEnaTeachingSampleGateLabel[];
  readonly copy: OpenEnaTeachingSampleProgressCopy;
  readonly testId?: string;
}) {
  const note = noteForKind(kind, copy);
  const showAnalysisSetNote = kind === "trajectory" || kind === "ona";
  return (
    <section className="ena-teaching-sample-progress" data-testid={testId} data-teaching-sample={kind} aria-label={copy.title}>
      <p className="ena-panel-kicker">{copy.title}</p>
      <ol>
        {steps.map((step) => (
          <li key={step.id} data-progress-step={step.id} data-done={step.done ? "true" : "false"}>
            <span className="sr-only">{step.done ? copy.complete : copy.incomplete}</span>
            {stepLabel(step.id, copy, familyLabel, buildPhase)}
            {step.id === "gates" && !admissionSettled ? <span className="ena-teaching-sample-progress-detail">{copy.gatesPending}</span> : null}
            {step.id === "gates" && admissionSettled && remainingGates.length === 0 ? <span className="ena-teaching-sample-progress-detail">{copy.gatesClear}</span> : null}
            {step.id === "gates" && admissionSettled && remainingGates.length > 0 ? (
              <ul>
                {remainingGates.map((gate) => <li key={gate.id} data-unmet-predicate={gate.id}>{gate.label}</li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      {note ? <p>{note}</p> : null}
      {showAnalysisSetNote ? <p>{copy.analysisSetNote}</p> : null}
    </section>
  );
}
