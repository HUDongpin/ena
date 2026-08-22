import {
  analysisKindFor,
  canonicalizeOpenEnaConfig,
  reconcileDirectionalMask,
} from "./network-config";
import type {
  AnalysisKind,
  OpenEnaConfig,
  OpenEnaOrderPolicy,
} from "./types";

export interface OpenEnaAnalysisFamilyDrafts {
  ena: OpenEnaConfig;
  ona: OpenEnaConfig;
}

export interface OpenEnaAnalysisFamilyTransition {
  drafts: OpenEnaAnalysisFamilyDrafts;
  activeConfig: OpenEnaConfig;
}

interface OpenEnaAnalysisFamilySwitchOptions {
  orderPolicy?: OpenEnaOrderPolicy;
}

function cloneSharedConfiguration(config: OpenEnaConfig) {
  return {
    unitColumns: [...config.unitColumns],
    conversationColumns: [...config.conversationColumns],
    groupColumn: config.groupColumn,
    codes: [...config.codes],
  };
}

function withSharedConfiguration(
  target: OpenEnaConfig,
  source: OpenEnaConfig,
): OpenEnaConfig {
  const shared = cloneSharedConfiguration(source);
  return { ...target, ...shared };
}

function standardDraft(config: OpenEnaConfig): OpenEnaConfig {
  return canonicalizeOpenEnaConfig({
    ...config,
    ...cloneSharedConfiguration(config),
    analysisKind: "ena",
    orderPolicy: null,
    directionalMask: null,
  });
}

function assertOrderedWindowSize(windowSizeBack: number) {
  if (windowSizeBack === Number.POSITIVE_INFINITY) return;
  if (!Number.isSafeInteger(windowSizeBack) || windowSizeBack < 1) {
    throw new Error("ONA windowSizeBack must be a positive safe integer or the entire-horizon Infinity value.");
  }
}

function orderedDraft(
  config: OpenEnaConfig,
  orderPolicy?: OpenEnaOrderPolicy,
): OpenEnaConfig {
  const resolvedOrderPolicy = orderPolicy ?? config.orderPolicy;
  if (!resolvedOrderPolicy) {
    throw new Error("ONA activation requires an explicit order policy before the ordered family can run.");
  }
  assertOrderedWindowSize(config.windowSizeBack);
  return canonicalizeOpenEnaConfig({
    ...config,
    ...cloneSharedConfiguration(config),
    analysisKind: "ona",
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    orderPolicy: resolvedOrderPolicy,
    directionalMask: reconcileDirectionalMask(config.directionalMask, config.codes),
  });
}

function incompleteOrderedDraft(config: OpenEnaConfig): OpenEnaConfig {
  assertOrderedWindowSize(config.windowSizeBack);
  return {
    ...config,
    ...cloneSharedConfiguration(config),
    analysisKind: "ona",
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    orderPolicy: null,
    directionalMask: reconcileDirectionalMask(config.directionalMask, config.codes),
  };
}

function cloneDrafts(drafts: OpenEnaAnalysisFamilyDrafts): OpenEnaAnalysisFamilyDrafts {
  const ena = standardDraft(drafts.ena);
  const ona = drafts.ona.orderPolicy
    ? orderedDraft(drafts.ona)
    : incompleteOrderedDraft(drafts.ona);
  return { ena, ona };
}

/**
 * Create two independent family drafts. An ENA-first workflow intentionally
 * leaves the ONA order policy incomplete; activation remains fail-closed until
 * the researcher supplies an explicit policy.
 */
export function createAnalysisFamilyDrafts(
  initialConfig: OpenEnaConfig,
): OpenEnaAnalysisFamilyDrafts {
  const kind = analysisKindFor(initialConfig);
  if (kind === "ona") {
    const ona = orderedDraft(initialConfig);
    return {
      ena: standardDraft(initialConfig),
      ona,
    };
  }
  const ena = standardDraft(initialConfig);
  return {
    ena,
    ona: incompleteOrderedDraft({
      ...ena,
      windowSizeBack: ena.windowSizeBack === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : Math.max(1, Math.trunc(ena.windowSizeBack)),
    }),
  };
}

/**
 * Store the active family, carry only shared mappings into the destination,
 * then restore the destination's family-specific draft. No caller-owned array,
 * mask, or policy is mutated.
 */
export function switchAnalysisFamily(
  familyDrafts: OpenEnaAnalysisFamilyDrafts,
  currentConfig: OpenEnaConfig,
  target: AnalysisKind,
  options: OpenEnaAnalysisFamilySwitchOptions = {},
): OpenEnaAnalysisFamilyTransition {
  const drafts = cloneDrafts(familyDrafts);
  const currentKind = analysisKindFor(currentConfig);
  const current = currentKind === "ona"
    ? orderedDraft(currentConfig)
    : standardDraft(currentConfig);
  drafts[currentKind] = current;

  const destinationBase = withSharedConfiguration(drafts[target], current);
  const activeConfig = target === "ona"
    ? orderedDraft(destinationBase, options.orderPolicy)
    : standardDraft(destinationBase);
  drafts[target] = activeConfig;

  return { drafts, activeConfig };
}
