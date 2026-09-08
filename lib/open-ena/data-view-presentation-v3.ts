import { buildHistoricalDataViewV3 } from "./data-view-export";
import type { BoundResultV3, ScalarIdentityV3 } from "./model-v3/types";
import { canonicalJsonV3 } from "./model-v3/canonical-json";
import { scalarIdentityV3 } from "./model-v3/identity";
import type { OpenEnaDataViewColumn, OpenEnaDataViewRow } from "../../components/open-ena/OpenEnaDataView";

/** Native table presentation over admitted model facts. Optional context selects
 * a typed Group for this view only; no source rows or membership are invented. */
export function buildDataViewPresentationV3(result: BoundResultV3, group: ScalarIdentityV3 | null = null) {
  const view = buildHistoricalDataViewV3(result);
  const source = new Map(result.executionProvenance.labels.codes.map((code) => [code.column, code.sourceColumn]));
  const metadata = view.rows[0] ? Object.keys(view.rows[0]) : [];
  const used = new Set(metadata);
  const edges = result.set.adjacencyKey.map((edge, index) => {
    let key = `Normalized edge ${index + 1}`; while (used.has(key)) key += " (edge)"; used.add(key);
    return { edge, key, label: `${source.get(edge.source)} ${result.configuration.analysisFamily === "ona" ? "→" : "↔"} ${source.get(edge.target)}` };
  });
  const columns: OpenEnaDataViewColumn[] = [
    ...metadata.map((key) => ({ key, label: key, kind: "metadata" as const })),
    ...edges.map(({ key, label }) => ({ key, label, kind: result.configuration.analysisFamily === "ona" ? "directed-edge" as const : "code" as const })),
  ];
  const rows: OpenEnaDataViewRow[] = view.rows.flatMap((row, index) => {
    const groupConfig = result.configuration.units.group;
    if (group !== null && (groupConfig.type === "none" || canonicalJsonV3(scalarIdentityV3(row[groupConfig.column], "Data View Group")) !== canonicalJsonV3(group))) return [];
    const weights = result.set.lineWeights[index];
    return [{ id: `bound-record-${index}`, values: { ...row, ...Object.fromEntries(edges.map(({ key, edge }) => [key, weights[edge.name]])) } }];
  });
  return { columns, rows, sourceTraversal: view.sourceTraversal, sourceIndexMeaning: view.sourceIndexMeaning };
}
