"use client";

import type { AnalysisKind } from "@/lib/open-ena/types";

export interface OpenEnaAnalysisFamilyCardCopy {
  label: string;
  description: string;
  methodBoundary: string;
}

export interface OpenEnaAnalysisFamilyControlCopy {
  legend: string;
  methodBoundaryLabel: string;
  selectedLabel: string;
  ena: OpenEnaAnalysisFamilyCardCopy;
  ona: OpenEnaAnalysisFamilyCardCopy;
}

interface OpenEnaAnalysisFamilyControlProps {
  value: AnalysisKind;
  onChange: (value: AnalysisKind) => void;
  copy: OpenEnaAnalysisFamilyControlCopy;
  disabled?: boolean;
  name?: string;
}

const ANALYSIS_FAMILIES = ["ena", "ona"] as const;

export function OpenEnaAnalysisFamilyControl({
  value,
  onChange,
  copy,
  disabled = false,
  name = "open-ena-analysis-family",
}: OpenEnaAnalysisFamilyControlProps) {
  return (
    <fieldset className="ena-analysis-family-control" data-analysis-family-control="cards">
      <legend>{copy.legend}</legend>
      <div className="ena-analysis-family-cards">
        {ANALYSIS_FAMILIES.map((family) => {
          const cardCopy = copy[family];
          const selected = value === family;
          return (
            <label
              className="ena-analysis-family-card"
              data-analysis-family={family}
              data-selected={selected ? "true" : "false"}
              key={family}
            >
              <input
                type="radio"
                name={name}
                value={family}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(family)}
              />
              <span className="ena-analysis-family-card-copy">
                <strong>{cardCopy.label}</strong>
                {selected ? <span className="ena-analysis-family-selected">{copy.selectedLabel}</span> : null}
                <span>{cardCopy.description}</span>
                <span className="ena-analysis-family-boundary">
                  <b>{copy.methodBoundaryLabel}</b>
                  <span>{cardCopy.methodBoundary}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
