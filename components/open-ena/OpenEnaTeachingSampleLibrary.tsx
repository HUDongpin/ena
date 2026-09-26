"use client";

import { useId } from "react";
import {
  TEACHING_SAMPLE_CATALOG,
  TEACHING_SAMPLE_KINDS,
  type TeachingSampleKind,
} from "@/lib/open-ena/teaching-sample-guide";
import type { OpenEnaExportFamily } from "@/lib/open-ena/export-applicability";

export interface OpenEnaTeachingSampleLibraryCopy {
  readonly libraryLabel: string;
  readonly familyLabel: string;
  readonly rowShapeLabel: string;
  readonly expectedOutputLabel: string;
  readonly loadSample: string;
  readonly loadTrajectorySample: string;
  readonly loadOnaSample: string;
  readonly families: Readonly<Record<OpenEnaExportFamily, string>>;
  readonly rowShapes: Readonly<Record<TeachingSampleKind, string>>;
  readonly expectedOutputs: Readonly<Record<TeachingSampleKind, string>>;
}

function sampleAction(kind: TeachingSampleKind, copy: OpenEnaTeachingSampleLibraryCopy): string {
  switch (kind) {
    case "endpoint":
      return copy.loadSample;
    case "trajectory":
      return copy.loadTrajectorySample;
    case "ona":
      return copy.loadOnaSample;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function sampleIcon(kind: TeachingSampleKind): string {
  switch (kind) {
    case "endpoint":
      return "◇";
    case "trajectory":
      return "↗";
    case "ona":
      return "→";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function OpenEnaTeachingSampleLibrary({
  copy,
  disabled,
  onLoad,
}: {
  readonly copy: OpenEnaTeachingSampleLibraryCopy;
  readonly disabled: boolean;
  readonly onLoad: (kind: TeachingSampleKind) => void;
}) {
  const baseId = useId();
  return (
    <div className="ena-teaching-sample-library" role="group" aria-label={copy.libraryLabel} data-testid="open-ena-teaching-sample-library">
      {TEACHING_SAMPLE_KINDS.map((kind) => {
        const entry = TEACHING_SAMPLE_CATALOG[kind];
        const descriptionId = `${baseId}-${kind}`;
        return (
          <div key={kind} className="ena-teaching-sample" data-teaching-sample={kind}>
            <button
              type="button"
              className="ena-action-button ena-action-secondary"
              aria-describedby={descriptionId}
              disabled={disabled}
              onClick={() => onLoad(kind)}
            >
              <span aria-hidden="true">{sampleIcon(kind)}</span>
              {sampleAction(kind, copy)}
            </button>
            <p id={descriptionId} className="ena-teaching-sample-disclosure">
              <span>{copy.familyLabel}: {copy.families[entry.family]}</span>
              <span>{copy.rowShapeLabel}: {copy.rowShapes[kind]}</span>
              <span>{copy.expectedOutputLabel}: {copy.expectedOutputs[kind]}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
