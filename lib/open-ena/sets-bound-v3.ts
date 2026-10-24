import type { BoundStandardResultV3, OpenEnaAnalysisBundleV3 } from "./model-v3/types";
import { buildAnalysisBundleV3, parseAnalysisBundleV3 } from "./analysis-bundle-v3";
import { boundResultFromBundleV3 } from "./bundle-contract-v3";
import {
  canonicalJsonV3,
  deepFreezeV3,
  snapshotPlainJsonRecordV3,
} from "./model-v3/canonical-json";
import {
  assertCurrentCapabilityV3,
  captureControlArrayV3,
} from "./inference-consumers-v3";

const captures = new WeakSet<object>();
const captureBundles = new WeakMap<object, OpenEnaAnalysisBundleV3>();
function options(input: unknown) {
  const value = snapshotPlainJsonRecordV3(input, "analysis-set options");
  if (Object.keys(value).some((k) => !["id", "name", "capturedAt"].includes(k)))
    throw new TypeError("Unknown analysis-set options");
  for (const v of Object.values(value))
    if (typeof v !== "string" || !v.trim() || v.length > 4096)
      throw new TypeError("Invalid analysis-set label");
  if (
    value.capturedAt !== undefined &&
    (typeof value.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(value.capturedAt)) ||
      new Date(value.capturedAt).toISOString() !== value.capturedAt)
  )
    throw new TypeError("Analysis-set capture time must be canonical ISO");
  return value as { id?: string; name?: string; capturedAt?: string };
}

/** Retain only current Standard EndPoint derived geometry. Capturing does not
 * mint a Reference, retain raw/source rows or register any new fit witness. */
export async function captureAnalysisSetV3(
  input: unknown,
  independentPlan: unknown,
  settings: { id?: string; name?: string; capturedAt?: string } = {},
) {
  const opts = options(settings);
  const admitted = await assertCurrentCapabilityV3(
    input,
    independentPlan,
    "export-current-model",
  );
  if (admitted.configuration.analysisFamily !== "standard")
    throw new TypeError("ONA analysis-sets blocked");
  const set = deriveAnalysisSetV3(admitted as BoundStandardResultV3, opts);
  captureBundles.set(set, await buildAnalysisBundleV3(admitted));
  return set;
}

function deriveAnalysisSetV3(result: BoundStandardResultV3, opts: { id?: string; name?: string; capturedAt?: string }) {
  const
    p = result.executionProvenance;
  if (result.configuration.analysis.model.type !== "EndPoint")
    throw new TypeError("Analysis sets require EndPoint results");
  const dimensions = p.projection.estimableAxes.filter(
    (axis) =>
      result.set.points.every((row) => typeof row[axis] === "number") &&
      result.set.rotation.nodes!.every((row) => typeof row[axis] === "number"),
  );
  if (dimensions.length < 2)
    throw new TypeError(
      "Analysis sets require two supported retained dimensions",
    );
  const units = new Map(
    p.identityDictionary.units.map((e) => [e.displayLabel, e]),
  );
  const groups = new Map(
    p.identityDictionary.groups.map((e) => [e.token, e.fields[0].value]),
  );
  const membership = new Map(
    p.unitGroups.map((e) => [e.unitToken, e.groupToken]),
  );
  const codes = new Map(p.labels.codes.map((e) => [e.column, e.sourceColumn]));
  const reference = p.reference?.artifact;
  const source = reference?.source;
  const referenceSource = {
    datasetSha256:
      source?.datasetBinding.normalizedTableSha256 ??
      result.binding.datasetSha256,
    configurationSha256:
      source?.configurationSha256 ?? result.binding.configurationSha256,
    executionPlanSha256:
      source?.executionPlanSha256 ?? result.binding.executionPlanSha256,
    runtime: source?.runtime ?? {
      runtimeVersion: result.binding.runtimeVersion,
      algorithmBuildSha: result.binding.algorithmBuildSha,
      validationContractVersion: result.binding.validationContractVersion,
      runtimePolicyVersion: result.binding.runtimePolicyVersion,
      executionContractVersion: result.binding.executionContractVersion,
    },
  };
  const points = result.set.points.map((row) => {
    const unit = units.get(String(row.Unit))!;
    const group = membership.get(unit.token);
    return {
      unit: unit.fields,
      group: group ? groups.get(group)! : null,
      coordinates: Object.fromEntries(
        dimensions.map((axis) => [axis, row[axis] as number]),
      ),
    };
  });
  const edges = result.set.adjacencyKey.map((edge) => ({
    source: codes.get(edge.source)!,
    target: codes.get(edge.target)!,
    meanWeight:
      result.set.lineWeights.reduce(
        (sum, row) => sum + (row[edge.name] as number),
        0,
      ) / points.length,
  }));
  const set = deepFreezeV3({
    schemaVersion: 3 as const,
    kind: "open-ena-analysis-set" as const,
    id: opts.id ?? `open-ena-set-v3:${result.binding.scientificResultSha256}`,
    name: opts.name ?? "Bound analysis",
    capturedAt: opts.capturedAt ?? new Date().toISOString(),
    binding: result.binding,
    configuration: result.configuration,
    role: reference ? ("projected" as const) : ("fitted" as const),
    referenceSource,
    points,
    edges,
    geometry: {
      dimensions,
      codes: p.labels.codes.map((e) => e.sourceColumn),
      rotationColumns: result.set.rotation.rotationColumns,
      rotationMatrix: result.set.rotation.rotationMatrix,
      centerVector: result.set.rotation.centerVector,
      eigenvalues: result.set.rotation.eigenvalues,
      nodes: result.set.rotation.nodes!.map((node) => ({
        code: codes.get(String(node.code))!,
        coordinates: Object.fromEntries(
          dimensions.map((axis) => [axis, node[axis] as number]),
        ),
      })),
    },
  });
  captures.add(set);
  return set;
}
export type OpenEnaAnalysisSetV3 = Awaited<
  ReturnType<typeof captureAnalysisSetV3>
>;

export type SerializedOpenEnaAnalysisSetV3 = {
  id: string; name: string; capturedAt: string; analysis: OpenEnaAnalysisBundleV3;
};

/** Keep the internally validated historical bundle, never an executable plan. */
export function serializeAnalysisSetV3(set: OpenEnaAnalysisSetV3): SerializedOpenEnaAnalysisSetV3 {
  const analysis = captureBundles.get(set);
  if (!captures.has(set) || !analysis) throw new TypeError("Analysis-set capture authority required");
  return deepFreezeV3({ id: set.id, name: set.name, capturedAt: set.capturedAt, analysis });
}

/** Reconstruct historical geometry from the checked bundle. This grants only
 * retained-set comparison, never current-result, fit or Reference authority. */
export async function restoreAnalysisSetV3(value: SerializedOpenEnaAnalysisSetV3): Promise<OpenEnaAnalysisSetV3> {
  const input = snapshotPlainJsonRecordV3(value, "saved analysis set");
  if (Object.keys(input).length !== 4 || !["id", "name", "capturedAt", "analysis"].every((key) => Object.hasOwn(input, key))) {
    throw new TypeError("Invalid saved analysis set");
  }
  const opts = options({ id: input.id, name: input.name, capturedAt: input.capturedAt });
  const analysis = await parseAnalysisBundleV3(canonicalJsonV3(input.analysis));
  const result = boundResultFromBundleV3(analysis);
  if (result.configuration.analysisFamily !== "standard") throw new TypeError("ONA analysis-sets blocked");
  const set = deriveAnalysisSetV3(result as BoundStandardResultV3, opts);
  captureBundles.set(set, analysis);
  return set;
}

/** Historical retained-set comparison: each set was admitted at capture; this
 * operation makes no claim that either is the currently edited model. */
export function compareAnalysisSetsV3(
  primary: OpenEnaAnalysisSetV3,
  secondary: OpenEnaAnalysisSetV3,
  selectedAxes?: readonly [string, string],
) {
  if (!captures.has(primary) || !captures.has(secondary))
    throw new TypeError("Analysis-set capture authority required");
  if (primary.id === secondary.id)
    throw new TypeError("Select distinct analysis sets");
  if (
    canonicalJsonV3(primary.referenceSource) !==
      canonicalJsonV3(secondary.referenceSource) ||
    canonicalJsonV3(primary.geometry) !== canonicalJsonV3(secondary.geometry)
  )
    throw new TypeError(
      "Analysis sets require the same fitted source and exact compatible geometry",
    );
  const axes = captureControlArrayV3(
    selectedAxes ?? primary.geometry.dimensions.slice(0, 2),
    "set axes",
    2,
  );
  if (
    axes[0] === axes[1] ||
    axes.some(
      (axis) =>
        typeof axis !== "string" || !primary.geometry.dimensions.includes(axis),
    )
  )
    throw new TypeError("Analysis sets require two distinct retained axes");
  const names = axes as [string, string];
  const side = (set: OpenEnaAnalysisSetV3) => ({
    setId: set.id,
    unitCount: set.points.length,
    points: set.points,
    meanPoint: Object.fromEntries(
      names.map((axis) => [
        axis,
        set.points.reduce((sum, p) => sum + p.coordinates[axis], 0) /
          set.points.length,
      ]),
    ),
  });
  return deepFreezeV3({
    schemaVersion: 3 as const,
    kind: "open-ena-analysis-set-comparison" as const,
    currentness: "retained-at-capture" as const,
    referenceSource: primary.referenceSource,
    geometry: primary.geometry,
    axes: names,
    primary: side(primary),
    secondary: side(secondary),
    edges: primary.edges.map((edge, index) => ({
      ...edge,
      primaryWeight: edge.meanWeight,
      secondaryWeight: secondary.edges[index].meanWeight,
      signedDifference: edge.meanWeight - secondary.edges[index].meanWeight,
    })),
  });
}
export function upsertAnalysisSetV3(
  sets: readonly OpenEnaAnalysisSetV3[],
  captured: OpenEnaAnalysisSetV3,
) {
  const index = sets.findIndex((set) => set.id === captured.id);
  if (index < 0) {
    if (sets.length >= 6)
      throw new TypeError("At most 6 analysis sets may be retained");
    return [...sets, captured];
  }
  return sets.map((set, i) => (i === index ? captured : set));
}
