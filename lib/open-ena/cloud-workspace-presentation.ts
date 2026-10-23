import type { ModelDisplayStateV3, ModelFamilyDisplayStateV3 } from "../../components/open-ena/model-v3/model-state";
import type { OpenEnaGroupDisplayOptions } from "./group-display";
import type { BoundResultV3 } from "./model-v3/types";
import type { OpenEna3dCamera, OpenEna3dAspectRatio } from "./plot3d";
import type { CameraPreset, OpenEnaMode, OpenEnaView } from "./types";

export type OpenEnaCloudPresentation = {
  mode: OpenEnaMode; view: OpenEnaView; primaryGroupName: string; secondaryGroupName: string;
  axes: string[]; threeDAxes: string[]; camera: OpenEna3dCamera | null; aspectRatio: OpenEna3dAspectRatio | null; cameraPreset: CameraPreset;
  nodePositions: Array<[string, Array<[string, number]>]>; visibleHorizons: string[] | null; hiddenUnitKeys: string[];
  showPoints: boolean; showNetworks: boolean; showLabels: boolean; showGroupLabels: boolean; showUnitLabels: boolean;
  showVariance: boolean; showTrajectories: boolean; showGroupCentroidPaths: boolean; endpointsOnly: boolean; unitCircle: boolean;
  flipX: boolean; flipY: boolean; edgeThreshold: number; edgeScale: number; pointScale: number; plotZoom: number; textScale: number;
  inferenceDesign: "independent" | "paired" | "repeated"; selectedPeriods: string[];
};

export function defaultOpenEnaCloudPresentation(): OpenEnaCloudPresentation {
  return { mode: "data", view: "2d", primaryGroupName: "", secondaryGroupName: "", axes: [], threeDAxes: [],
    camera: null, aspectRatio: null, cameraPreset: "isometric", nodePositions: [], visibleHorizons: null, hiddenUnitKeys: [],
    showPoints: true, showNetworks: true, showLabels: true, showGroupLabels: true, showUnitLabels: false, showVariance: true,
    showTrajectories: false, showGroupCentroidPaths: true, endpointsOnly: false, unitCircle: false, flipX: false, flipY: false,
    edgeThreshold: 0, edgeScale: 1, pointScale: 1, plotZoom: 1, textScale: 1, inferenceDesign: "independent", selectedPeriods: [] };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid cloud presentation object.");
  return value as Record<string, unknown>;
}
function strings(value: unknown, max = 20_000): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((v) => typeof v === "string" && v.length <= 4096);
}
function entries(value: unknown, check: (v: unknown) => boolean): Array<[string, unknown]> {
  if (!Array.isArray(value) || value.length > 20_000 || value.some((entry) => !Array.isArray(entry) || entry.length !== 2
    || typeof entry[0] !== "string" || entry[0].length > 4096 || !check(entry[1]))
    || new Set(value.map((v) => v[0])).size !== value.length) throw new TypeError("Invalid cloud display entries.");
  return value as Array<[string, unknown]>;
}
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000;
const vector = (value: unknown) => {
  const v = object(value);
  return Object.keys(v).length === 3 && ["x", "y", "z"].every((key) => finite(v[key]));
};

export function validateOpenEnaCloudPresentation(input: unknown): OpenEnaCloudPresentation {
  const value = object(input), defaults = defaultOpenEnaCloudPresentation();
  if (Object.keys(value).length !== Object.keys(defaults).length || Object.keys(defaults).some((key) => !Object.hasOwn(value, key))) throw new TypeError("Invalid cloud presentation shape.");
  for (const [key, fallback] of Object.entries(defaults)) {
    if (typeof fallback === "boolean" && typeof value[key] !== "boolean") throw new TypeError("Invalid cloud display flag.");
  }
  if (!["data", "model", "plot", "stats", "ai"].includes(String(value.mode)) || !["2d", "3d"].includes(String(value.view))
    || !["isometric", "xy", "xz", "yz", "yx", "zx", "zy"].includes(String(value.cameraPreset))
    || !["independent", "paired", "repeated"].includes(String(value.inferenceDesign))) throw new TypeError("Invalid cloud display selection.");
  if (typeof value.primaryGroupName !== "string" || value.primaryGroupName.length > 4096
    || typeof value.secondaryGroupName !== "string" || value.secondaryGroupName.length > 4096
    || !strings(value.axes, 2) || !strings(value.threeDAxes, 3) || !strings(value.hiddenUnitKeys)
    || !strings(value.selectedPeriods) || (value.visibleHorizons !== null && !strings(value.visibleHorizons))) throw new TypeError("Invalid cloud display identities.");
  for (const key of ["edgeThreshold", "edgeScale", "pointScale", "plotZoom", "textScale"]) {
    if (!finite(value[key]) || Number(value[key]) < (key === "edgeThreshold" ? 0 : 0.01)
      || Number(value[key]) > 1000) throw new TypeError("Invalid cloud display scale.");
  }
  if (value.camera !== null) {
    const camera = object(value.camera), projection = object(camera.projection);
    if (Object.keys(camera).length !== 4 || !vector(camera.eye) || !vector(camera.center) || !vector(camera.up)
      || Object.keys(projection).length !== 1 || !["perspective", "orthographic"].includes(String(projection.type))) throw new TypeError("Invalid cloud camera.");
  }
  if (value.aspectRatio !== null && (!vector(value.aspectRatio) || Object.values(value.aspectRatio as object).some((v) => Number(v) <= 0))) throw new TypeError("Invalid cloud aspect ratio.");
  entries(value.nodePositions, (coordinates) => { entries(coordinates, finite); return true; });
  return value as unknown as OpenEnaCloudPresentation;
}

type EncodedVisibility<T> = { datasetSha256: string; family: "standard" | "ona"; resultHash: string | null; values: Array<[string, T]> } | null;
type EncodedFamilyDisplay = {
  allCodesSuppressed: boolean; codeVisibility: Array<[string, boolean]>; codeColors: Array<[string, string]>;
  allGroupsSuppressed: boolean; groups: Array<[string, OpenEnaGroupDisplayOptions]>; codeOrder: string[];
  previousCodes: EncodedVisibility<boolean>; previousGroups: EncodedVisibility<OpenEnaGroupDisplayOptions>;
};
export type OpenEnaCloudDisplay = Record<"standard" | "ona", EncodedFamilyDisplay>;

export function encodeOpenEnaCloudDisplay(display: ModelDisplayStateV3): OpenEnaCloudDisplay {
  const encode = (value: ModelFamilyDisplayStateV3): EncodedFamilyDisplay => ({
    allCodesSuppressed: value.allCodesSuppressed, codeVisibility: Object.entries(value.codeVisibility), codeColors: Object.entries(value.codeColors),
    allGroupsSuppressed: value.allGroupsSuppressed, groups: Object.entries(value.groups), codeOrder: [...value.codeOrder],
    previousCodes: value.codeVisibilitySnapshot ? { datasetSha256: value.codeVisibilitySnapshot.binding.datasetSha256,
      family: value.codeVisibilitySnapshot.binding.family, resultHash: value.codeVisibilitySnapshot.binding.result?.binding.scientificResultSha256 ?? null,
      values: Object.entries(value.codeVisibilitySnapshot.values) } : null,
    previousGroups: value.groupVisibilitySnapshot ? { datasetSha256: value.groupVisibilitySnapshot.binding.datasetSha256,
      family: value.groupVisibilitySnapshot.binding.family, resultHash: value.groupVisibilitySnapshot.binding.result?.binding.scientificResultSha256 ?? null,
      values: Object.entries(value.groupVisibilitySnapshot.values) } : null,
  });
  return { standard: encode(display.standard), ona: encode(display.ona) };
}

function group(value: unknown): boolean {
  const row = object(value), keys = ["showUnitPoints", "showMean", "showConfidenceIntervals", "showOutlierIntervals", "includeHiddenPoints"];
  return Object.keys(row).length === keys.length && keys.every((key) => typeof row[key] === "boolean");
}

export function decodeOpenEnaCloudDisplay(input: unknown, datasetSha256: string, result: BoundResultV3 | null): ModelDisplayStateV3 {
  const record = object(input);
  if (Object.keys(record).length !== 2 || !record.standard || !record.ona) throw new TypeError("Invalid cloud display families.");
  const decode = (family: "standard" | "ona"): ModelFamilyDisplayStateV3 => {
    const value = object(record[family]);
    const keys = ["allCodesSuppressed", "codeVisibility", "codeColors", "allGroupsSuppressed", "groups", "codeOrder", "previousCodes", "previousGroups"];
    if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))
      || typeof value.allCodesSuppressed !== "boolean" || typeof value.allGroupsSuppressed !== "boolean" || !strings(value.codeOrder)) throw new TypeError("Invalid cloud family display.");
    const visibility = entries(value.codeVisibility, (v) => typeof v === "boolean") as Array<[string, boolean]>;
    const colors = entries(value.codeColors, (v) => typeof v === "string" && /^#[a-f0-9]{6}$/iu.test(v)) as Array<[string, string]>;
    const groups = entries(value.groups, group) as Array<[string, OpenEnaGroupDisplayOptions]>;
    const previous = <T>(item: unknown, check: (v: unknown) => boolean) => {
      if (item === null) return null;
      const old = object(item);
      if (Object.keys(old).length !== 4 || !/^[a-f0-9]{64}$/u.test(String(old.datasetSha256))
        || !["standard", "ona"].includes(String(old.family)) || (old.resultHash !== null && !/^[a-f0-9]{64}$/u.test(String(old.resultHash)))) throw new TypeError("Invalid visibility snapshot.");
      const pairs = entries(old.values, check) as Array<[string, T]>;
      if (old.datasetSha256 !== datasetSha256 || old.family !== family || old.resultHash !== (result?.binding.scientificResultSha256 ?? null)) return null;
      return { binding: { datasetSha256, family, result }, values: Object.fromEntries(pairs) };
    };
    return { allCodesSuppressed: value.allCodesSuppressed, codeVisibility: Object.fromEntries(visibility), codeColors: Object.fromEntries(colors),
      allGroupsSuppressed: value.allGroupsSuppressed, groups: Object.fromEntries(groups), codeOrder: value.codeOrder,
      codeVisibilitySnapshot: previous<boolean>(value.previousCodes, (v) => typeof v === "boolean"),
      groupVisibilitySnapshot: previous<OpenEnaGroupDisplayOptions>(value.previousGroups, group) };
  };
  return { standard: decode("standard"), ona: decode("ona") };
}
