import { buildExecutionIdentityDictionaryV3, scalarIdentityV3 } from "../../../lib/open-ena/model-v3/identity";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";
import type { ParsedDataset } from "../../../lib/open-ena/types";
import type { ModelStateV3 } from "./model-state";
import { modelScientificContextV3 } from "./model-state";
import type { OpenEnaUnitsPreviewV3 } from "./OpenEnaUnitsPanelV3";
import type { OpenEnaHorizonsPreviewV3 } from "./OpenEnaHorizonsPanelV3";
import type { WorkspaceCompilationV3 } from "./workspace-controller";

/** Source previews are explicitly diagnostic evidence, independent of Ready. */
export async function buildWorkspacePreviewsV3(dataset: ParsedDataset, model: ModelStateV3, compilation: WorkspaceCompilationV3 | null): Promise<{
  units: OpenEnaUnitsPreviewV3; horizons: OpenEnaHorizonsPreviewV3;
}> {
  const context = modelScientificContextV3(model), draft = model.drafts[context.family];
  const rows = structuredClone(dataset.rows);
  try {
    const dictionary = await buildExecutionIdentityDictionaryV3(rows, draft.unitColumns, draft.horizonColumns, draft.groupColumn);
    const key = (row: typeof rows[number], columns: readonly string[]) => canonicalJsonV3({ fields: columns.map((column) => ({ column, value: scalarIdentityV3(row[column], column) })) });
    const units = new Map(dictionary.units.map((entry) => [entry.canonicalJson, entry.token]));
    const horizons = new Map(dictionary.horizons.map((entry) => [entry.canonicalJson, entry.token]));
    const groups = new Map(dictionary.groups.map((entry) => [entry.canonicalJson, entry.token]));
    const assignments = new Map<string, Set<string | null>>();
    const observations = new Map<string, { unitToken: string; horizonToken: string; rowCount: number }>();
    for (const row of rows) {
      const unitToken = units.get(key(row, draft.unitColumns))!, horizonToken = horizons.get(key(row, draft.horizonColumns))!;
      const groupToken = draft.groupColumn ? groups.get(key(row, [draft.groupColumn]))! : null;
      const assignment = assignments.get(unitToken) ?? new Set(); assignment.add(groupToken); assignments.set(unitToken, assignment);
      const pair = canonicalJsonV3([unitToken, horizonToken]);
      const before = observations.get(pair); observations.set(pair, { unitToken, horizonToken, rowCount: (before?.rowCount ?? 0) + 1 });
    }
    const ordering = compilation?.plan?.horizonOrdering;
    return {
      units: { availability: "available", context, units: dictionary.units, groups: dictionary.groups,
        unitGroups: [...assignments].filter(([, groups]) => groups.size === 1).map(([unitToken, groups]) => ({ unitToken, groupToken: [...groups][0] })),
        groupStability: { availability: "available", status: [...assignments.values()].every((groups) => groups.size === 1) ? "stable" : "unstable" } },
      horizons: { availability: "available", context, rowCount: rows.length, units: dictionary.units, horizons: dictionary.horizons, observations: [...observations.values()],
        resolvedOrder: ordering?.type === "trajectory-horizon-order" ? { availability: "available", unitSequences: ordering.unitSequences } : { availability: "unavailable" } },
    };
  } catch { return { units: { availability: "unavailable", context }, horizons: { availability: "unavailable", context } }; }
}
