import type { BoundResultV3, PresentationArtifactV3 } from "./model-v3/types";
import { retainedBoundPlotAxesV3 } from "./bound-presentation-v3";
import { applyPresentationV3 } from "./presentation-artifact-v3";
import { assertPresentationArtifactContractV3 } from "./bundle-contract-v3";
import { canonicalJsonV3 } from "./model-v3/canonical-json";

export type WorkspacePresetTwoDAxisDecisionV3 = "apply-axes" | "keep-confirmed-axes";

/** 2D preset axes apply as an evidence change unless a confirmed inference is
 * already current and the preset axes differ from those confirmed axes. */
export function workspacePresetTwoDAxisDecisionV3(
  confirmedInference: boolean,
  currentAxes: readonly string[],
  presetAxes: readonly [string, string],
): WorkspacePresetTwoDAxisDecisionV3 {
  const axesDiffer = currentAxes.length !== 2 || presetAxes[0] !== currentAxes[0] || presetAxes[1] !== currentAxes[1];
  return confirmedInference && axesDiffer ? "keep-confirmed-axes" : "apply-axes";
}

/** Detached presets have no scientific authority. A matching hash alone is
 * insufficient: validate every public identity against this exact bound result. */
export function prepareWorkspacePresentationV3(result: BoundResultV3, preset: PresentationArtifactV3) {
  const checked = applyPresentationV3(result.binding.scientificResultSha256, preset);
  if (checked.status !== "applied") return { status: "unapplied-preset" as const, presentation: checked.presentation };
  const value = checked.presentation;
  assertPresentationArtifactContractV3(value, result);
  if (value.groupColors?.length || value.layerOptions?.showMeans !== undefined || value.layerOptions?.showIntervals !== undefined)
    throw new TypeError("This preset includes Group colors or global Mean/interval controls not represented by the Workspace preset editor; it remains unapplied.");
  if (value.dimensions.length > 3 || value.dimensions.some((axis) => !retainedBoundPlotAxesV3(result).includes(axis)))
    throw new TypeError("Preset axes must be supported fitted coordinates.");
  if (Object.values(value.codeColors).some((color) => !/^#[0-9a-f]{6}$/iu.test(color)))
    throw new TypeError("Workspace preset Code colors require six-digit hexadecimal values.");
  const sources = new Map(result.executionProvenance.labels.codes.map((code) => [code.column, code.sourceColumn]));
  const hidden = new Set(value.hiddenCodes);
  const hiddenGroups = new Set(value.hiddenGroups.map((group) => canonicalJsonV3(group)));
  return {
    status: "applied" as const,
    presentation: value,
    codeVisibility: Object.fromEntries([...sources].map(([publicCode, source]) => [source, !hidden.has(publicCode)])),
    codeColors: Object.fromEntries(Object.entries(value.codeColors).map(([code, color]) => [sources.get(code)!, color])),
    hiddenGroupTokens: result.executionProvenance.identityDictionary.groups.filter((group) => hiddenGroups.has(canonicalJsonV3(group.fields[0].value))).map((group) => group.token),
    nodePositions: new Map(value.nodeOverrides.map((node) => [sources.get(node.code)!, new Map(Object.entries(node.coordinates))])),
  };
}
