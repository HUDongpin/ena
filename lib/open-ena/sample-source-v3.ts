import { parseCsv } from "./csv";
import { prepareTypedCsvSourceV3 } from "./source-preparation-v3";
import { sha256TextV3 } from "./model-v3/canonical-json";
import { migrateLegacyOpenEnaConfigToDraftV3 } from "./model-v3/migration";
import type { ModelWorkspaceDraftsV3 } from "./model-v3/types";
import { SAMPLE_CONFIG, TRAJECTORY_SAMPLE_CONFIG, SAMPLE_DATASET_URL, TRAJECTORY_SAMPLE_DATASET_URL } from "./types";

export const SAMPLE_SOURCE_DESCRIPTORS_V3 = Object.freeze({
  endpoint: { url: SAMPLE_DATASET_URL, sha256: "2aafd9920a0e576a584ea9d7c32cd3190e435199a065f61497b03d7c9cebff3b", config: SAMPLE_CONFIG },
  trajectory: { version: "native-period-horizons-v1", url: TRAJECTORY_SAMPLE_DATASET_URL, sha256: "573dbe1104d73878b4b310fb4592e09078c240a489f28637d4308dfd520766bd", config: TRAJECTORY_SAMPLE_CONFIG },
});

/** Explicit versioned teaching-source preparation. It neither creates a source
 * order receipt nor executes a worker; the sample button owns that one-shot intent. */
export async function prepareTeachingSampleV3(text: string, kind: keyof typeof SAMPLE_SOURCE_DESCRIPTORS_V3, confirmedAt: Date) {
  const descriptor = SAMPLE_SOURCE_DESCRIPTORS_V3[kind];
  if (await sha256TextV3(text) !== descriptor.sha256) throw new Error("The sample bytes changed; review its versioned source typing descriptor.");
  const source = parseCsv(text, { name: descriptor.url.split("/").at(-1)!, source: "sample" });
  const numeric = new Set([...descriptor.config.codes, "line_number"]);
  const value = await prepareTypedCsvSourceV3(text, source, Object.fromEntries(source.headers.map((column) => [column, numeric.has(column) ? "number" : "text"])), confirmedAt);
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(descriptor.config);
  const drafts: ModelWorkspaceDraftsV3 = { schemaVersion: 3, activeFamily: "standard", standard: { ...migrated.standard,
    // Sample-specific native declaration. Conversation accumulation already
    // partitions Unit × Horizon; Period is shared across fitted Units. This is
    // not a generic migration or MovingStanzaWindow simplification.
    ...(kind === "trajectory" ? { horizonColumns: ["Period"] } : {}),
    movingStanza: { ...migrated.standard.movingStanza, rowOrder: { kind: "columns", keys: [{ column: "line_number", direction: "ascending", comparator: { type: "number" } }] } },
    horizonOrder: kind === "trajectory" ? { kind: "columns", keys: [{ column: "Period", direction: "ascending", comparator: { type: "ordered-category", levels: ["TP1", "TP2", "TP3"].map((period) => ({ type: "string", value: period })) } }] } : null }, ona: migrated.ona };
  return { ...value, drafts, original: { text, name: source.name } };
}
