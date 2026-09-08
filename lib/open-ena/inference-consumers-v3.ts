import type { ENASet } from "jena-js";
import type { OpenEnaConfig } from "./types";
import { canonicalJsonV3, deepFreezeV3, snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";
import { captureExecutionPlanInputV3, type OpenEnaExecutionPlanV3 } from "./model-v3/execution-plan";
import { resultMatchesPlanV3, validateBoundResultV3 } from "./model-v3/result-binding";
import { scalarIdentityV3 } from "./model-v3/identity";
import type { ModelCapabilityV3 } from "./model-v3/diagnostics";
import type { BoundStandardResultV3, ScalarIdentityV3 } from "./model-v3/types";

/** Explicit endpoint selection. Bound trajectory comparison is supplied by the
 * longitudinal consumer, not inferred from a draft or reconstructed here. */
export interface OpenEnaEndpointControlsV3 {
  primaryGroup: ScalarIdentityV3;
  secondaryGroup: ScalarIdentityV3;
  /** Two actual supported retained coordinates; no synthetic completion axis. */
  axes: readonly [string, string];
  /** Canonical source Code columns, never the model table public aliases. */
  hiddenCodes?: readonly string[];
  hiddenGroups?: readonly ScalarIdentityV3[];
}

/** Shared runtime admission, deliberately using the runtime resource budget.
 * The caller plan is captured once before any await. Strong validation captures
 * the result synchronously and returns detached frozen science. No portable
 * bundle limit, reconstructed source proof, or Reference witness is introduced. */
export async function assertCurrentCapabilityV3(input: unknown, independentPlan: unknown, capability: ModelCapabilityV3) {
  const plan = captureExecutionPlanInputV3(independentPlan);
  let result;
  try {
    result = await validateBoundResultV3(input, plan);
  } catch (error) {
    if (error instanceof TypeError && (
      error.message === "Bound result complete binding does not match its execution plan or scientific content."
      || error.message === "ONA bound result binding is inconsistent."
    )) throw new TypeError("stale result: complete binding differs from the current independent plan", { cause: error });
    throw error;
  }
  // Validation above authenticated contents against this exact captured plan.
  if (!resultMatchesPlanV3(result, plan as OpenEnaExecutionPlanV3)) throw new TypeError("stale result: current plan binding mismatch");
  if (result.capabilityStatus[capability] !== "available") {
    const diagnostics = result.executionProvenance.diagnostics.filter((entry) => entry.blocks.includes(capability)).map((entry) => entry.id);
    throw new TypeError(`${capability} blocked${diagnostics.length ? `: ${diagnostics.join(", ")}` : " by the bound model capability"}`);
  }
  return result;
}

// Presentation controls have their own small structural budget. This does not
// constrain the independently admitted scientific result or execution plan.
const CONTROL_ITEM_LIMIT = 10_000;
const CONTROL_STRING_LIMIT = 65_536;
const CONTROL_CHARACTER_BUDGET = 1_048_576;

export function captureControlArrayV3(input: unknown, label: string, exactLength?: number, maximumLength = CONTROL_ITEM_LIMIT): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    throw new TypeError(`controls ${label} must be a plain array`);
  }
  function readLength(): number {
    const descriptor = Object.getOwnPropertyDescriptor(input, "length");
    const length: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (!descriptor || descriptor.enumerable || typeof length !== "number"
      || !Number.isSafeInteger(length) || length < 0 || length > maximumLength
      || (exactLength !== undefined && length !== exactLength)) {
      throw new TypeError(`controls ${label} length exceeds its allowed limit`);
    }
    return length;
  }
  // Admit before enumeration. A Proxy meta-trap can itself do arbitrary work;
  // once it returns, process only this fixed, bounded set of captured keys.
  const length = readLength();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== length + 1 || !keys.includes("length")) {
    throw new TypeError(`controls ${label} captured key count differs from its admitted length`);
  }
  for (const key of keys) {
    if (key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key)
      || !Number.isSafeInteger(Number(key)) || Number(key) >= length)) {
      throw new TypeError(`controls ${label} capture requires dense array indices within its admitted length`);
    }
  }
  function assertCapturedLength(): void {
    if (readLength() !== length) throw new TypeError(`controls ${label} length changed during capture`);
  }
  // Recheck before allocation and element descriptors. Keep all later work and
  // allocation tied to the admitted length, even if a descriptor trap mutates.
  assertCapturedLength();
  const captured = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    assertCapturedLength();
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`controls ${label} elements must be own enumerable data properties`);
    }
    captured[index] = descriptor.value;
  }
  assertCapturedLength();
  return captured;
}

function captureControls(input: unknown) {
  const value = snapshotPlainJsonRecordV3(input, "endpoint controls");
  const keys = new Set(["primaryGroup", "secondaryGroup", "axes", "hiddenCodes", "hiddenGroups"]);
  if (Object.keys(value).some((key) => !keys.has(key))) throw new TypeError("Unknown endpoint controls");
  let characters = 0;
  function text(value: unknown): string {
    if (typeof value !== "string") throw new TypeError("controls axes/Code labels require strings");
    characters += value.length;
    if (value.length > CONTROL_STRING_LIMIT || characters > CONTROL_CHARACTER_BUDGET) throw new TypeError("controls string budget exceeded");
    return value;
  }
  function identity(input: unknown): ScalarIdentityV3 {
    const value = snapshotPlainJsonRecordV3(input, "Group controls identity");
    const scalar = scalarIdentityV3(value.value, "Group controls identity");
    if (Object.keys(value).length !== 2 || value.type !== scalar.type) throw new TypeError("Group controls require an exact typed scalar identity");
    if (scalar.type === "string") text(scalar.value);
    return scalar;
  }
  const axes = captureControlArrayV3(value.axes, "axes", 2).map(text);
  if (axes[0] === axes[1]) throw new TypeError("Choose two distinct available axes");
  const hiddenCodes = value.hiddenCodes === undefined ? [] : captureControlArrayV3(value.hiddenCodes, "hidden Codes").map(text);
  const hiddenGroups = value.hiddenGroups === undefined ? [] : captureControlArrayV3(value.hiddenGroups, "hidden Groups").map(identity);
  return deepFreezeV3({ primaryGroup: identity(value.primaryGroup), secondaryGroup: identity(value.secondaryGroup), axes: axes as [string, string], hiddenCodes, hiddenGroups });
}

/** Public aliases in a validated result already encode typed Unit/Group/Horizon
 * collisions losslessly. This configuration describes ONLY that row adapter;
 * canonical source configuration and all hashes remain on the v3 envelope. */
function adapterConfiguration(result: BoundStandardResultV3): OpenEnaConfig {
  const { configuration: config, set, executionProvenance: p } = result;
  const extent = (value: number | "Infinity") => value === "Infinity" ? Infinity : value;
  return {
    unitColumns: [...set.units], conversationColumns: [...set.conversation], groupColumn: config.units.group.type === "none" ? null : "Group", codes: [...set.codes],
    model: config.analysis.model.type, window: config.window.type,
    windowSizeBack: config.window.type === "Conversation" ? 1 : extent(set.functionParams.windowSizeBack),
    windowSizeForward: config.window.type === "Conversation" ? 0 : extent(set.functionParams.windowSizeForward),
    weightBy: p.weighting.runtime, rotation: p.projection.type === "means" ? "mean" : p.projection.type,
    referenceRotationId: result.binding.referenceId, centerAlignToOrigin: p.projection.centerAlignToOrigin,
  };
}

export async function buildInferenceInputV3(input: unknown, independentPlan: unknown, options: OpenEnaEndpointControlsV3) {
  // Capture controls before starting asynchronous validation; never reread them.
  const controls = captureControls(options);
  const validated = await assertCurrentCapabilityV3(input, independentPlan, "group-inference");
  if (validated.configuration.analysisFamily !== "standard") throw new TypeError("group-inference blocked for ONA");
  const result = validated as BoundStandardResultV3;
  if (result.configuration.analysis.model.type !== "EndPoint") throw new TypeError("This bound inference/contrast entrypoint requires EndPoint; bound trajectory context is required by the longitudinal consumer");
  const p = result.executionProvenance;
  const groups = p.identityDictionary.groups;
  // Index every declared typed identity once. Visibility may contain all
  // Groups or repeated entries; neither case should rescan the inventory.
  const groupsByIdentity = new Map(groups.map((entry) => [canonicalJsonV3(entry.fields[0].value), entry]));
  const group = (value: ScalarIdentityV3) => groupsByIdentity.get(canonicalJsonV3(value));
  const primary = group(controls.primaryGroup), secondary = group(controls.secondaryGroup);
  if (!primary || !secondary || primary.token === secondary.token) throw new TypeError("Choose two distinct typed Group identities from the bound result");
  const supportedAxes = p.projection.estimableAxes.filter((axis) =>
    result.set.points.every((point) => typeof point[axis] === "number" && Number.isFinite(point[axis]))
    && result.set.rotation.nodes!.every((node) => typeof node[axis] === "number" && Number.isFinite(node[axis])));
  if (controls.axes.some((axis) => !supportedAxes.includes(axis))) throw new TypeError("This request requires two distinct supported axes with retained coordinates; single-axis inference is not supported by this endpoint interface");
  const canonicalCodes = new Set(result.configuration.codes.map((code) => code.column));
  if (controls.hiddenCodes.some((code) => !canonicalCodes.has(code)) || controls.hiddenGroups.some((entry) => !group(entry))) throw new TypeError("Visibility controls must name canonical source Codes and typed Groups");
  const reference = p.reference;
  const meanDerived = p.meansBinding !== null || reference?.artifact.fit.method === "means";
  const provenance = {
    projectionAuthority: reference ? "fixed-reference-target-projection" as const : "target-fitted" as const,
    varianceMeaning: reference ? "target variance along fixed reference axes" as const : "fitted-space variance" as const,
    meansBinding: p.meansBinding,
    reference: reference?.artifact ?? null,
    interpretation: meanDerived
      ? "Means MR1 separation is descriptive by construction; a test of that constructed separation is not independent confirmation. Reference target tests describe target coordinates on fixed source axes."
      : "Post-projection group comparisons use the full bound endpoint Unit population and do not establish causality or verify independence.",
  };
  return deepFreezeV3({
    result, binding: result.binding, configuration: result.configuration, provenance, controls, supportedAxes,
    groupSelection: { primary: primary.displayLabel, secondary: secondary.displayLabel },
  });
}

export type OpenEnaInferenceInputV3 = Awaited<ReturnType<typeof buildInferenceInputV3>>;

/** Pure row-shape conversion after the public strong gate. No fit, filtering,
 * population reduction or scientific coordinate/weight conversion occurs. */
export function endpointScientificAdapterV3(input: OpenEnaInferenceInputV3) {
  return boundScientificAdapterV3(input.result, input.supportedAxes);
}

/** Internal row adapter shared by strongly admitted endpoint and trajectory consumers. */
export function boundScientificAdapterV3(result: BoundStandardResultV3, supportedAxes: readonly string[]) {
  const p = result.executionProvenance;
  const extent = (value: number | "Infinity") => value === "Infinity" ? Infinity : value;
  const set: ENASet = { ...result.set, functionParams: { ...result.set.functionParams, windowSizeBack: extent(result.set.functionParams.windowSizeBack), windowSizeForward: extent(result.set.functionParams.windowSizeForward) } };
  const counts = new Map<string, number>();
  for (const row of set.points) counts.set(String(row.Group), (counts.get(String(row.Group)) ?? 0) + 1);
  return {
    adapterConfiguration: adapterConfiguration(result),
    set, dimensions: [...supportedAxes], analyzedAt: result.createdAt,
    groups: p.identityDictionary.groups.map((group) => ({ name: group.displayLabel, count: counts.get(group.displayLabel) ?? 0, pointCount: counts.get(group.displayLabel) ?? 0 })),
  };
}
