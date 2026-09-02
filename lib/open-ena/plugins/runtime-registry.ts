import { compileOpenEna3dPlotSpec, type CompileOpenEna3dPlotInput, type OpenEna3dPlotSpec } from "@/lib/open-ena/plot3d";
import { JENA_RUNTIME_VERSION, type OpenEnaResult } from "@/lib/open-ena/types";
import { OPEN_ENA_PLUGIN_CATALOG } from "./catalog";
import {
  OPEN_ENA_PLUGIN_CORE_API_VERSION,
  OPEN_ENA_PLUGIN_RESULT_SCHEMA_VERSION,
  deepFreezeOpenEnaPluginValue,
  openEnaPluginContextOwnsResult,
  type OpenEnaPluginContextV1,
} from "./runtime-context";
import type { OpenEnaPluginManifestV1 } from "./types";

export type OpenEnaPluginAvailabilityReason =
  | "plugin-unknown"
  | "plugin-disabled"
  | "plugin-revoked"
  | "registry-mismatch"
  | "contract-incompatible"
  | "result-schema-incompatible"
  | "capability-incompatible"
  | "result-stale"
  | "analysis-incompatible"
  | "model-incompatible"
  | "dimensions-insufficient"
  | "runtime-incompatible"
  | "scientific-result-changed";

export type OpenEnaPluginAvailability =
  | { enabled: true; reasonCode: null }
  | { enabled: false; reasonCode: OpenEnaPluginAvailabilityReason };

export class OpenEnaPluginRuntimeError extends Error {
  readonly name = "OpenEnaPluginRuntimeError";
  constructor(readonly code: OpenEnaPluginAvailabilityReason) {
    super(`Open ENA plugin runtime refused execution: ${code}.`);
  }
}

type FrozenDisplayInput = Omit<CompileOpenEna3dPlotInput, "result" | "nodeLayout">;

export interface OpenEna3dPresenterSnapshotV1 {
  schemaVersion: "ena.hk/3d-presenter-snapshot/v1";
  result: Readonly<{
    modelType: OpenEnaResult["set"]["modelType"];
    networkType: "standard";
    codes: readonly string[];
    points: readonly unknown[];
    nodes: readonly unknown[];
    adjacencyKey: readonly unknown[];
    variance: Readonly<Record<string, number>>;
    groups: readonly unknown[];
    dimensions: readonly string[];
  }>;
  display: Readonly<FrozenDisplayInput>;
  nodeLayoutEntries: readonly (readonly [string, readonly (readonly [string, number])[]])[];
}

interface OpenEnaTrusted3dPluginModule {
  pluginId: string;
  version: string;
  manifest: OpenEnaPluginManifestV1;
  compile(snapshot: OpenEna3dPresenterSnapshotV1): OpenEna3dPlotSpec;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createOpenEna3dPresenterSnapshotV1(input: CompileOpenEna3dPlotInput, context?: OpenEnaPluginContextV1): OpenEna3dPresenterSnapshotV1 {
  const { result, nodeLayout, ...display } = input;
  const scientific = context && openEnaPluginContextOwnsResult(context, result) ? context.scientificResult : null;
  const snapshot: OpenEna3dPresenterSnapshotV1 = {
    schemaVersion: "ena.hk/3d-presenter-snapshot/v1",
    result: {
      modelType: result.set.modelType,
      networkType: "standard",
      codes: scientific?.codes ?? jsonClone(result.set.codes),
      points: scientific?.points ?? jsonClone(result.set.points),
      nodes: scientific?.rotation.nodes ?? jsonClone(result.set.rotation.nodes ?? []),
      adjacencyKey: scientific?.adjacencyKey ?? jsonClone(result.set.adjacencyKey),
      variance: scientific?.variance ?? jsonClone(result.set.variance),
      groups: scientific?.groups ?? jsonClone(result.groups),
      dimensions: scientific?.dimensions ?? jsonClone(result.dimensions),
    },
    display: jsonClone(display),
    nodeLayoutEntries: nodeLayout
      ? [...nodeLayout.entries()].map(([code, dimensions]) => [code, [...dimensions.entries()]] as const)
      : [],
  };
  return deepFreezeOpenEnaPluginValue(snapshot) as OpenEna3dPresenterSnapshotV1;
}

function compileSanitized3dSnapshot(snapshot: OpenEna3dPresenterSnapshotV1) {
  const nodeLayout = new Map(snapshot.nodeLayoutEntries.map(([code, dimensions]) => [code, new Map(dimensions)]));
  const sanitizedResult = {
    set: {
      modelType: snapshot.result.modelType,
      networkType: snapshot.result.networkType,
      codes: snapshot.result.codes,
      points: snapshot.result.points,
      rotation: { nodes: snapshot.result.nodes },
      adjacencyKey: snapshot.result.adjacencyKey,
      variance: snapshot.result.variance,
      functionParams: { networkType: snapshot.result.networkType },
    },
    groups: snapshot.result.groups,
    dimensions: snapshot.result.dimensions,
  } as unknown as OpenEnaResult;
  return compileOpenEna3dPlotSpec({
    ...snapshot.display,
    result: sanitizedResult,
    nodeLayout,
  });
}

const threeDEnaManifest = OPEN_ENA_PLUGIN_CATALOG.find((entry) => entry.pluginId === "ena-hk/3d-ena");
if (!threeDEnaManifest) throw new TypeError("The built-in 3D ENA plugin manifest is missing.");

export const OPEN_ENA_RUNTIME_PLUGIN_REGISTRY: Readonly<Record<string, OpenEnaTrusted3dPluginModule>> = Object.freeze({
  "ena-hk/3d-ena": Object.freeze({
    pluginId: "ena-hk/3d-ena",
    version: threeDEnaManifest.version,
    manifest: threeDEnaManifest,
    compile: compileSanitized3dSnapshot,
  }),
});

function registryModule(pluginId: string): OpenEnaTrusted3dPluginModule | null {
  const module = OPEN_ENA_RUNTIME_PLUGIN_REGISTRY[pluginId];
  if (!module) return null;
  if (module.pluginId !== pluginId || module.manifest.pluginId !== pluginId || module.version !== module.manifest.version) return null;
  return module;
}

export function parseOpenEnaDisabledPluginIds(raw: string | undefined) {
  if (!raw) return [];
  return Object.freeze([...new Set(raw.split(",").map((entry) => entry.trim()).filter((entry) => Object.hasOwn(OPEN_ENA_RUNTIME_PLUGIN_REGISTRY, entry)))]);
}

export function openEnaRuntimePluginAvailability(
  pluginId: string,
  context: OpenEnaPluginContextV1,
  disabledPluginIds: readonly string[],
): OpenEnaPluginAvailability {
  const registered = OPEN_ENA_RUNTIME_PLUGIN_REGISTRY[pluginId];
  if (!registered) return { enabled: false, reasonCode: "plugin-unknown" };
  const module = registryModule(pluginId);
  if (!module) return { enabled: false, reasonCode: "registry-mismatch" };
  if (disabledPluginIds.includes(pluginId)) return { enabled: false, reasonCode: "plugin-disabled" };
  if (module.manifest.lifecycle === "revoked" || module.manifest.lifecycle === "deprecated") return { enabled: false, reasonCode: "plugin-revoked" };
  if (context.schemaVersion !== "ena.hk/plugin-context/v1" || context.coreApiVersion !== OPEN_ENA_PLUGIN_CORE_API_VERSION || module.manifest.compatibility.coreApi !== context.coreApiVersion) return { enabled: false, reasonCode: "contract-incompatible" };
  if (context.resultSchemaVersion !== OPEN_ENA_PLUGIN_RESULT_SCHEMA_VERSION || !module.manifest.compatibility.resultSchemaVersions.includes(context.resultSchemaVersion)) return { enabled: false, reasonCode: "result-schema-incompatible" };
  if (module.manifest.compatibility.requiredCapabilities.some((capability) => !context.capabilities.includes(capability))) return { enabled: false, reasonCode: "capability-incompatible" };
  if (context.stale) return { enabled: false, reasonCode: "result-stale" };
  if (!module.manifest.compatibility.analysisKinds.includes(context.analysisKind)) return { enabled: false, reasonCode: "analysis-incompatible" };
  if (!module.manifest.compatibility.modelTypes.includes(context.modelType)) return { enabled: false, reasonCode: "model-incompatible" };
  if (context.dimensions.length < module.manifest.compatibility.minimumDimensions || context.selectedDimensions.length < module.manifest.compatibility.minimumDimensions || new Set(context.selectedDimensions).size !== context.selectedDimensions.length) return { enabled: false, reasonCode: "dimensions-insufficient" };
  if (!module.manifest.compatibility.jenaVersions.includes(JENA_RUNTIME_VERSION)) return { enabled: false, reasonCode: "runtime-incompatible" };
  return { enabled: true, reasonCode: null };
}

export function compileOpenEnaTrusted3dPlugin(
  pluginId: string,
  context: OpenEnaPluginContextV1,
  input: CompileOpenEna3dPlotInput,
  disabledPluginIds: readonly string[],
) {
  const availability = openEnaRuntimePluginAvailability(pluginId, context, disabledPluginIds);
  if (!availability.enabled) throw new OpenEnaPluginRuntimeError(availability.reasonCode);
  const module = registryModule(pluginId);
  if (!module) throw new OpenEnaPluginRuntimeError("registry-mismatch");
  if (context.analysisKind !== "ena" || input.result.set.modelType !== context.modelType) throw new OpenEnaPluginRuntimeError("analysis-incompatible");
  const requested = [input.xDimension, input.yDimension, input.zDimension];
  if (requested.some((dimension, index) => dimension !== context.selectedDimensions[index])) throw new OpenEnaPluginRuntimeError("dimensions-insufficient");
  if (!openEnaPluginContextOwnsResult(context, input.result)) throw new OpenEnaPluginRuntimeError("scientific-result-changed");
  const output = module.compile(createOpenEna3dPresenterSnapshotV1(input, context));
  if (!openEnaPluginContextOwnsResult(context, input.result)) throw new OpenEnaPluginRuntimeError("scientific-result-changed");
  return output;
}
