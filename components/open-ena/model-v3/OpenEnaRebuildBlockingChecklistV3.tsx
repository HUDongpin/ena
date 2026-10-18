"use client";

import type { MouseEvent } from "react";
import type { AnalysisFamilyV3 } from "../../../lib/open-ena/model-v3/types";
import {
  modelDiagnosticFieldTargetV3,
  type ModelDiagnosticFieldTargetV3,
  type ModelUiDiagnosticLocalizationInputV3,
  type ModelUiDiagnosticV3,
} from "./OpenEnaModelDiagnosticsV3";

export const OPEN_ENA_REBUILD_BLOCKING_CHECKLIST_ID = "open-ena-rebuild-blocking-checklist";

const TAB_ORDER = ["units", "horizons", "windows", "codes"] as const;

export const MODEL_REBUILD_RAW_BLOCKER_FIELDS_V3 = [
  "backward",
  "forward",
  "rowOrder",
  "horizonOrder",
] as const;

export type ModelRebuildRawBlockerFieldV3 = typeof MODEL_REBUILD_RAW_BLOCKER_FIELDS_V3[number];

export interface ModelRebuildRawBlockersV3 {
  readonly backward: boolean;
  readonly forward: boolean;
  readonly rowOrder: boolean;
  readonly horizonOrder: boolean;
}

export interface OpenEnaRebuildBlockingChecklistCopyV3 {
  readonly title: string;
  readonly description: string;
  readonly raw: Readonly<Record<ModelRebuildRawBlockerFieldV3, string>>;
}

export type ModelRebuildBlockingChecklistItemV3 =
  | {
      readonly kind: "diagnostic";
      readonly predicateId: string;
      readonly diagnostic: ModelUiDiagnosticV3;
      readonly target: ModelDiagnosticFieldTargetV3 | null;
    }
  | {
      readonly kind: "raw";
      readonly predicateId: string;
      readonly field: ModelRebuildRawBlockerFieldV3;
      readonly target: ModelDiagnosticFieldTargetV3;
    };

function blocksRebuildV3(diagnostic: ModelUiDiagnosticV3): boolean {
  return diagnostic.blocks.includes("build-model");
}

function tabRankV3(target: ModelDiagnosticFieldTargetV3 | null): number {
  if (target === null) return TAB_ORDER.length;
  const index = TAB_ORDER.indexOf(target.tab);
  return index === -1 ? TAB_ORDER.length : index;
}

function rawFieldPathV3(family: AnalysisFamilyV3, field: ModelRebuildRawBlockerFieldV3): string {
  switch (field) {
    case "horizonOrder":
      return "horizonOrder";
    case "rowOrder":
      return family === "ona" ? "rowOrder" : "movingStanza.rowOrder";
    case "backward":
      return family === "ona" ? "backward" : "movingStanza.backward";
    case "forward":
      return "movingStanza.forward";
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}

function rawPredicateIdV3(field: ModelRebuildRawBlockerFieldV3): string {
  switch (field) {
    case "backward":
      return "raw-backward";
    case "forward":
      return "raw-forward";
    case "rowOrder":
      return "raw-row-order";
    case "horizonOrder":
      return "raw-horizon-order";
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}

function diagnosticPredicateIdV3(diagnostic: ModelUiDiagnosticV3, occurrence: number): string {
  const base = `${diagnostic.id}:${diagnostic.fieldPath ?? "global"}`;
  return occurrence === 0 ? base : `${base}#${occurrence}`;
}

/**
 * Ordered presentation of gates that already block Rebuild/Run.
 * `blocks: ["build-model"]` and the synchronous raw-editor ledger stay authoritative.
 */
export function modelRebuildBlockingChecklistV3(input: {
  readonly family: AnalysisFamilyV3;
  readonly diagnostics: readonly ModelUiDiagnosticV3[];
  readonly rawBlockers?: ModelRebuildRawBlockersV3;
}): readonly ModelRebuildBlockingChecklistItemV3[] {
  const drafts: Array<{
    readonly tabRank: number;
    readonly group: number;
    readonly index: number;
    readonly item: ModelRebuildBlockingChecklistItemV3;
  }> = [];
  const coveredFieldIds = new Set<string>();
  const predicateCounts = new Map<string, number>();
  let diagnosticIndex = 0;
  for (const diagnostic of input.diagnostics) {
    if (!blocksRebuildV3(diagnostic)) continue;
    const target = modelDiagnosticFieldTargetV3(input.family, diagnostic);
    if (target !== null) coveredFieldIds.add(target.fieldId);
    const base = `${diagnostic.id}:${diagnostic.fieldPath ?? "global"}`;
    const occurrence = predicateCounts.get(base) ?? 0;
    predicateCounts.set(base, occurrence + 1);
    drafts.push({
      tabRank: tabRankV3(target),
      group: 1,
      index: diagnosticIndex,
      item: {
        kind: "diagnostic",
        predicateId: diagnosticPredicateIdV3(diagnostic, occurrence),
        diagnostic,
        target,
      },
    });
    diagnosticIndex += 1;
  }
  const rawBlockers = input.rawBlockers;
  if (rawBlockers !== undefined) {
    MODEL_REBUILD_RAW_BLOCKER_FIELDS_V3.forEach((field, index) => {
      if (!rawBlockers[field]) return;
      const target = modelDiagnosticFieldTargetV3(input.family, rawFieldPathV3(input.family, field));
      if (target === null || coveredFieldIds.has(target.fieldId)) return;
      drafts.push({
        tabRank: tabRankV3(target),
        group: 0,
        index,
        item: {
          kind: "raw",
          predicateId: rawPredicateIdV3(field),
          field,
          target,
        },
      });
    });
  }
  drafts.sort((left, right) => left.tabRank - right.tabRank || left.group - right.group || left.index - right.index);
  return drafts.map((entry) => entry.item);
}

function diagnosticLocalizationInputV3(
  diagnostic: ModelUiDiagnosticV3,
): ModelUiDiagnosticLocalizationInputV3 {
  return {
    id: diagnostic.id,
    severity: diagnostic.severity,
    scope: diagnostic.scope,
    ...(diagnostic.fieldPath === undefined ? {} : { fieldPath: diagnostic.fieldPath }),
    ...(diagnostic.evidence === undefined ? {} : {
      evidence: {
        totalCount: diagnostic.evidence.totalCount,
        sampleLimit: diagnostic.evidence.sampleLimit,
        truncated: diagnostic.evidence.truncated,
      },
    }),
  };
}

export function OpenEnaRebuildBlockingChecklistV3({
  items,
  copy,
  localizeDiagnostic,
  onNavigateField,
  id = OPEN_ENA_REBUILD_BLOCKING_CHECKLIST_ID,
}: {
  readonly items: readonly ModelRebuildBlockingChecklistItemV3[];
  readonly copy: OpenEnaRebuildBlockingChecklistCopyV3;
  readonly localizeDiagnostic: (diagnostic: ModelUiDiagnosticLocalizationInputV3) => { readonly summary: string };
  readonly onNavigateField: (target: ModelDiagnosticFieldTargetV3) => void;
  readonly id?: string;
}) {
  if (items.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className="ena-rebuild-blocking-checklist ena-unmet-prerequisite-list"
      data-testid="open-ena-rebuild-blocking-checklist"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <p id={titleId} className="ena-rebuild-blocking-checklist-title">{copy.title}</p>
      <p className="ena-rebuild-blocking-checklist-description">{copy.description}</p>
      <ol>
        {items.map((item) => {
          const label = item.kind === "raw"
            ? copy.raw[item.field]
            : localizeDiagnostic(diagnosticLocalizationInputV3(item.diagnostic)).summary;
          const target = item.target;
          return (
            <li key={item.predicateId} data-unmet-predicate={item.predicateId}>
              {target === null ? label : (
                <a
                  href={`#${target.fieldId}`}
                  onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                    event.preventDefault();
                    onNavigateField(target);
                  }}
                >
                  {label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
