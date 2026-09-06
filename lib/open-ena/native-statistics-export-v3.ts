import { assertOpenEnaInferenceCoordinatorConsumerV3, assertOpenEnaTrajectoryInferenceConsumerV3,
  type OpenEnaEndpointInferenceResultV3, type OpenEnaTrajectoryInferenceResultV3 } from "./inference-v2";
import type { OpenEnaEndpointControlsV3 } from "./inference-consumers-v3";
import type { OpenEnaTrajectoryControlsV3 } from "./longitudinal-bound-v3";
import { canonicalJsonV3, deepFreezeV3 } from "./model-v3/canonical-json";

export type NativeInferenceV3 = OpenEnaEndpointInferenceResultV3 | OpenEnaTrajectoryInferenceResultV3;
/** Labels are additional presentation columns. Original statistical indexes are
 * retained, and selected-request and global-frame namespaces remain distinct. */
export function nativeStatisticsTablesV3(envelope: NativeInferenceV3) {
  const inference = envelope.inference;
  if (envelope.kind === "open-ena-endpoint-inference") return { rows: envelope.inference.rows, ledger: envelope.inference.ledger };
  const frame = envelope.context.frameIndexHorizons;
  const request = envelope.context.request;
  const selected = request.kind === "trajectory-repeated-periods" ? request.periods : null;
  const label = (map: readonly (readonly import("./model-v3/identity").IdentityFieldV3[])[] | null, index: unknown) => typeof index === "number" && map?.[index] ? canonicalJsonV3(map[index]) : null;
  const rows = (values: readonly object[], map: readonly (readonly import("./model-v3/identity").IdentityFieldV3[])[] | null, namespace: string): Array<Record<string, unknown>> => values.map((value) => {
    const row = value as Record<string, unknown>;
    return { ...row, periodIndexNamespace: namespace,
      ...(Object.hasOwn(row, "earlierPeriodIndex") ? { earlierHorizon: label(map, row.earlierPeriodIndex), laterHorizon: label(map, row.laterPeriodIndex) } : {}) };
  });
  if ("followupRows" in inference) return {
    omnibusRows: inference.omnibusRows,
    followupRows: rows(inference.followupRows, selected, "selected-request"),
    ledger: { ...inference.ledger, availableByPeriod: inference.ledger?.availableByPeriod.map((row) => ({ ...row, horizon: label(frame, row.periodIndex), periodIndexNamespace: "global-frame" })) },
  };
  return { rows: "rows" in inference ? rows(inference.rows, frame, "global-frame") : [], ledger: inference.ledger };
}

/** A separate post-model export. The unchanged model-bundle statistics grammar
 * remains unavailable; neither this file nor a parsed copy mints live receipts. */
export async function exportNativeStatisticsV3(envelope: NativeInferenceV3, result: unknown, independentPlan: unknown,
  controls: OpenEnaEndpointControlsV3 | OpenEnaTrajectoryControlsV3) {
  const admitted = envelope.kind === "open-ena-endpoint-inference"
    ? await assertOpenEnaInferenceCoordinatorConsumerV3(envelope, result, independentPlan, controls as OpenEnaEndpointControlsV3)
    : await assertOpenEnaTrajectoryInferenceConsumerV3(envelope, result, independentPlan, controls as OpenEnaTrajectoryControlsV3);
  const artifact = deepFreezeV3({ schemaVersion: 1, kind: "open-ena-native-post-model-statistics", executable: false,
    binding: admitted.binding, controls: admitted.controls,
    context: admitted.kind === "open-ena-trajectory-inference" ? {
      request: admitted.context.request, axes: admitted.context.axes,
      identityConfirmed: admitted.context.identityConfirmed,
      unitColumns: admitted.context.unitColumns, horizonColumns: admitted.context.horizonColumns,
      frameIndexHorizons: admitted.context.frameIndexHorizons,
      scientificContextSha256: admitted.scientificContextSha256,
      meaning: "Aggregate request and index labels only. The hash binds the full locally validated scientific context; per-Unit fitted sequences are omitted.",
    } : { axes: admitted.controls.axes, primaryGroup: admitted.controls.primaryGroup, secondaryGroup: admitted.controls.secondaryGroup },
    inference: admitted.inference, presentationTables: nativeStatisticsTablesV3(admitted),
    meaning: "Researcher-requested post-model inference. Imported files are historical facts, not process-local inference authority. Model bundle statistics remain unavailable." });
  return { filename: "open-ena-native-statistics.json", mimeType: "application/json", contents: JSON.stringify(artifact, null, 2) };
}
