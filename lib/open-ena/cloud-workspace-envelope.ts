import { captureBundleJsonV3, parseBundleJsonV3 } from "./bundle-json-v3";
import { captureDraftArtifactV3 } from "./draft-artifact-v3";
import { canonicalJsonV3, sha256CanonicalJsonV3 } from "./model-v3/canonical-json";
import type { ModelWorkspaceDraftsV3, OpenEnaAnalysisBundleV3, OpenEnaStandardReferenceV2 } from "./model-v3/types";
import { datasetHashKindFor, type ParsedDataset, type DatasetHashKind } from "./types";
import { decodeOpenEnaCloudDisplay, validateOpenEnaCloudPresentation, type OpenEnaCloudDisplay, type OpenEnaCloudPresentation } from "./cloud-workspace-presentation";
import { validateOpenEnaCloudExtras, type OpenEnaCloudExtras } from "./cloud-workspace-extras";

type Cell = string | number | boolean | null;
export type OpenEnaCloudDataset = { name: string; headers: string[]; cells: Cell[][]; sizeBytes: number;
  source: "sample" | "upload"; hashKind: DatasetHashKind; tableSha256: string };
export type OpenEnaCloudSnapshot = {
  kind: "open-ena-cloud-project"; dataset: OpenEnaCloudDataset | null; datasetSha256: string;
  drafts: ModelWorkspaceDraftsV3; onaDraftInitialized: boolean; display: OpenEnaCloudDisplay;
  references: OpenEnaStandardReferenceV2[]; analysis: OpenEnaAnalysisBundleV3 | null; resultStatus: "none" | "current" | "stale";
  presentation: OpenEnaCloudPresentation; sourceReference: OpenEnaStandardReferenceV2 | null;
  originalSource: { name: string; text: string } | null; statisticsReport: Record<string, unknown> | null;
  integritySha256: string;
} & ({ schemaVersion: 1 } | ({ schemaVersion: 2 } & OpenEnaCloudExtras));
const SHA = /^[a-f0-9]{64}$/u;
const rootKeys = ["schemaVersion", "kind", "dataset", "datasetSha256", "drafts", "onaDraftInitialized", "display", "references", "analysis",
  "resultStatus", "presentation", "sourceReference", "originalSource", "statisticsReport", "integritySha256"];

export function captureOpenEnaCloudDataset(dataset: ParsedDataset): Omit<OpenEnaCloudDataset, "tableSha256"> {
  const headers = [...dataset.headers];
  const cells = dataset.rows.map((row) => headers.map((header) => {
    const descriptor = Object.getOwnPropertyDescriptor(row, header);
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Cloud data requires explicit scalar table cells.");
    return descriptor.value as Cell;
  }));
  return captureBundleJsonV3({ name: dataset.name, headers, cells, sizeBytes: dataset.sizeBytes,
    source: dataset.source, hashKind: datasetHashKindFor(dataset) }) as Omit<OpenEnaCloudDataset, "tableSha256">;
}

export function decodeOpenEnaCloudDataset(value: OpenEnaCloudDataset): ParsedDataset {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 7 || typeof value.name !== "string"
    || !value.name.trim() || value.name.length > 1024 || !Array.isArray(value.headers) || value.headers.length > 1024
    || value.headers.length < 1 || value.headers.some((s) => typeof s !== "string" || !s.length || s.length > 4096)
    || new Set(value.headers).size !== value.headers.length || !Array.isArray(value.cells) || value.cells.length > 20_000
    || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 0 || value.sizeBytes > 128 * 1024 * 1024
    || !["sample", "upload"].includes(value.source) || !SHA.test(value.tableSha256)) throw new TypeError("Invalid cloud dataset.");
  datasetHashKindFor(value);
  if (value.cells.some((row) => !Array.isArray(row) || row.length !== value.headers.length || row.some((cell) => cell !== null
    && typeof cell !== "string" && typeof cell !== "boolean" && !(typeof cell === "number" && Number.isFinite(cell))))) throw new TypeError("Invalid cloud table cells.");
  return { name: value.name, headers: [...value.headers], rows: value.cells.map((cells) => Object.fromEntries(value.headers.map((header, i) => [header, cells[i]]))),
    sizeBytes: value.sizeBytes, source: value.source, hashKind: value.hashKind };
}

export function validateOpenEnaCloudDrafts(value: ModelWorkspaceDraftsV3) {
  if (!value || Object.keys(value).length !== 4 || value.schemaVersion !== 3 || !["standard", "ona"].includes(value.activeFamily)) throw new TypeError("Invalid cloud model drafts.");
  if (captureDraftArtifactV3(value.standard).analysisFamily !== "standard" || captureDraftArtifactV3(value.ona).analysisFamily !== "ona") throw new TypeError("Invalid cloud model family.");
}

/** Server admission is bounded and structural. Scientific/source authority is rebuilt by the restore validator. */
export async function validateOpenEnaCloudSnapshotEnvelope(input: unknown): Promise<OpenEnaCloudSnapshot> {
  const value = captureBundleJsonV3(input) as OpenEnaCloudSnapshot;
  const keys = value?.schemaVersion === 2 ? [...rootKeys, "aiInterpretation", "analysisSets", "setComparison", "historicalImports"] : rootKeys;
  if (!value || typeof value !== "object" || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))
    || ![1, 2].includes(value.schemaVersion) || value.kind !== "open-ena-cloud-project" || !SHA.test(value.datasetSha256)
    || !SHA.test(value.integritySha256) || typeof value.onaDraftInitialized !== "boolean"
    || !["none", "current", "stale"].includes(value.resultStatus)) throw new TypeError("Invalid cloud project envelope.");
  const { integritySha256, ...payload } = value;
  if (await sha256CanonicalJsonV3(payload) !== integritySha256) throw new TypeError("Cloud project integrity hash mismatch.");
  if (value.schemaVersion === 2) validateOpenEnaCloudExtras(value);
  validateOpenEnaCloudDrafts(value.drafts);
  validateOpenEnaCloudPresentation(value.presentation);
  // Validate display grammar without recreating an undo/result ownership binding yet.
  decodeOpenEnaCloudDisplay(value.display, value.datasetSha256, null);
  if (!Array.isArray(value.references) || value.references.length > 32) throw new TypeError("Invalid cloud references.");
  if (value.dataset !== null) {
    decodeOpenEnaCloudDataset(value.dataset);
    if (await sha256CanonicalJsonV3({ headers: value.dataset.headers, cells: value.dataset.cells }) !== value.dataset.tableSha256) throw new TypeError("Cloud dataset integrity hash mismatch.");
  }
  if ((value.analysis === null) !== (value.resultStatus === "none") || (value.analysis !== null
    && (!value.analysis || value.analysis.kind !== "open-ena-analysis-bundle" || value.analysis.schemaVersion !== 3))) throw new TypeError("Invalid cloud result envelope.");
  if (value.originalSource !== null && (Object.keys(value.originalSource).length !== 2 || typeof value.originalSource.name !== "string"
    || value.originalSource.name.length > 1024 || typeof value.originalSource.text !== "string")) throw new TypeError("Invalid original source copy.");
  if (value.statisticsReport !== null && (value.statisticsReport.kind !== "open-ena-native-post-model-statistics"
    || value.statisticsReport.executable !== false || value.statisticsReport.schemaVersion !== 1)) throw new TypeError("Invalid saved statistics report.");
  return value;
}

export async function parseOpenEnaCloudSnapshot(text: string) {
  return validateOpenEnaCloudSnapshotEnvelope(parseBundleJsonV3(text));
}

export function openEnaCloudSnapshotText(snapshot: OpenEnaCloudSnapshot) { return canonicalJsonV3(snapshot); }
