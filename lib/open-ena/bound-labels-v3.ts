import type { BoundResultV3 } from "./model-v3/types";
import { canonicalJsonV3 } from "./model-v3/canonical-json";

/** Public semantic projection of admitted machine provenance. Source strings are
 * preserved verbatim, including legitimate reserved-looking user labels. */
export function publicBoundOrderingV3(result: BoundResultV3) {
  const p = result.executionProvenance;
  const units = new Map(
    p.identityDictionary.units.map((e) => [e.token, e.fields]),
  );
  const horizons = new Map(
    p.identityDictionary.horizons.map((e) => [e.token, e.fields]),
  );
  const row = p.ordering.resolvedRowOrder,
    order = p.ordering.resolvedHorizonOrder;
  return {
    rowOrder:
      row.type === "not-applicable"
        ? row
        : {
            type: row.type,
            requestedPolicy: row.requestedPolicy,
            mappings: row.mappings.map((e) => ({
              sourceRowIndex: e.sourceRowIndex,
              horizon: horizons.get(e.horizonToken)!,
              orderTuple: e.orderTuple,
              withinHorizonOrdinal: e.withinHorizonOrdinal,
            })),
          },
    horizonOrder:
      order.type === "not-applicable"
        ? order
        : {
            type: order.type,
            requestedPolicy: order.requestedPolicy,
            horizonTuples: order.horizonTuples.map((e) => ({
              horizon: horizons.get(e.horizonToken)!,
              orderTuple: e.orderTuple,
            })),
          },
    unitSequences:
      order.type === "not-applicable"
        ? []
        : order.unitSequences.map((e) => ({
            unit: units.get(e.unitToken)!,
            steps: e.steps.map((s) => ({
              horizon: horizons.get(s.horizonToken)!,
              trajectoryOrdinal: s.trajectoryOrdinal,
            })),
          })),
    runtimeSourceRowIndices: p.ordering.runtimeSourceRowIndices,
    implementationOrderMeaning:
      "Runtime source traversal and serialization among incomparable Horizons are implementation order, not scientific tie breakers.",
  };
}

export function publicProjectionV3(result: BoundResultV3) {
  const p = result.executionProvenance,
    reference = p.reference?.artifact;
  return {
    authority: reference
      ? ("fixed-reference-target-projection" as const)
      : ("target-fitted" as const),
    details: p.projection,
    varianceMeaning: reference
      ? "target variance along fixed reference axes"
      : "fitted-space variance",
    fitPopulation: p.populations.fit,
    targetObservationCount: p.populations.targetTokens.length,
    sourceFit: reference ? reference.fit : null,
    reference: reference
      ? {
          referenceId: reference.referenceId,
          contentSha256: reference.contentSha256,
          source: reference.source,
        }
      : null,
    meansBinding:
      "meansBinding" in p && p.meansBinding
        ? {
            groupColumn: p.meansBinding.groupColumn,
            direction: p.meansBinding.direction,
            negative: {
              level: p.meansBinding.negative.level,
              unitCount: p.meansBinding.negative.unitTokens.length,
            },
            positive: {
              level: p.meansBinding.positive.level,
              unitCount: p.meansBinding.positive.unitTokens.length,
            },
          }
        : null,
  };
}

export const typedIdentityKeyV3 = (identity: unknown) =>
  canonicalJsonV3(identity);
