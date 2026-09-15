import { canonicalJsonV3, snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";

/**
 * Presentation-only plot fields. They may update the official workbench
 * presenter, but they must never participate in the shared consumer
 * invalidation key used by confirmed inference, native contrast, or AI review.
 */
export const OPEN_ENA_WORKBENCH_PRESENTATION_CONTROL_KEYS_V3 = [
  "plotZoom",
  "flipX",
  "flipY",
  "edgeScale",
  "edgeThreshold",
  "pointScale",
  "textScale",
  "showLabels",
  "showGroupLabels",
  "showUnitLabels",
  "showPoints",
  "showNetworks",
  "showVariance",
  "showTrajectories",
  "unitCircle",
  "camera",
  "cameraPreset",
  "aspectRatio",
  "view",
  "threeDAxes",
  "selectedAxes",
  "xDimension",
  "yDimension",
  "zDimension",
] as const;

const PRESENTATION_CONTROL_KEY_SET = new Set<string>(
  OPEN_ENA_WORKBENCH_PRESENTATION_CONTROL_KEYS_V3,
);

export interface OpenEnaConsumerAuthorityInputV3 {
  binding: unknown;
  plan: string | null;
  current: boolean;
  controls: unknown;
}

export interface OpenEnaAiReviewedRequestIdentityInputV3 {
  localScientificIdentity: string | null;
  request: {
    schemaVersion: string;
    promptVersion: string;
    locale: string;
    binding: unknown;
    evidence: unknown;
  } | null;
}

export function snapshotOpenEnaConsumerAuthorityControlsV3(controls: unknown): unknown {
  if (controls === null || controls === undefined) return null;
  const record = snapshotPlainJsonRecordV3(controls, "consumer authority controls");
  const snapshot: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (PRESENTATION_CONTROL_KEY_SET.has(key)) continue;
    snapshot[key] = record[key];
  }
  return snapshot;
}

/** Shared official-workbench invalidation identity for inference, contrast, and AI. */
export function openEnaConsumerAuthorityKeyV3(input: OpenEnaConsumerAuthorityInputV3): string {
  return canonicalJsonV3({
    binding: input.binding,
    plan: input.plan,
    current: input.current,
    controls: snapshotOpenEnaConsumerAuthorityControlsV3(input.controls),
  });
}

export function openEnaAiLocalScientificIdentityV3(review: {
  binding: unknown;
  context: unknown;
  configuration: unknown;
} | null): string | null {
  if (review === null) return null;
  return canonicalJsonV3({
    binding: review.binding,
    context: review.context,
    configuration: review.configuration,
  });
}

export function openEnaAiReviewedRequestIdentityV3(
  input: OpenEnaAiReviewedRequestIdentityInputV3,
): string | null {
  if (input.request === null) return null;
  return canonicalJsonV3({
    localScientificIdentity: input.localScientificIdentity,
    schemaVersion: input.request.schemaVersion,
    promptVersion: input.request.promptVersion,
    locale: input.request.locale,
    binding: input.request.binding,
    evidence: input.request.evidence,
  });
}
