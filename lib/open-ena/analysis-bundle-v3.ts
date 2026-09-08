import type { OpenEnaExecutionPlanV3 } from "./model-v3/execution-plan";
import type {
  BoundResultV3,
  OpenEnaAnalysisBundleV3,
  PresentationArtifactV3,
} from "./model-v3/types";
import {
  canonicalJsonV3,
  deepFreezeV3,
  sha256CanonicalJsonV3,
  sha256TextV3,
} from "./model-v3/canonical-json";
import { validateBoundResultV3 } from "./model-v3/result-binding";
import { captureBundleJsonV3, parseBundleJsonV3 } from "./bundle-json-v3";
import {
  assertPortableBundleContractV3,
  boundResultFromBundleV3,
  unavailableBundleStatisticsV3,
} from "./bundle-contract-v3";
import { buildMethodsReportV3 } from "./methods-v3";

export interface AnalysisBundleValidationOptionsV3 {
  /** Independent source-backed plan, never reconstructed from bundle claims. */
  expectedPlan?: OpenEnaExecutionPlanV3;
}
export interface BuildAnalysisBundleOptionsV3 extends AnalysisBundleValidationOptionsV3 {
  presentation?: PresentationArtifactV3;
}

/** Hashes content, not provenance authenticity. Also useful to verify external encoders. */
export async function buildBundleIntegrityV3(
  input: Omit<OpenEnaAnalysisBundleV3, "integrity">,
): Promise<OpenEnaAnalysisBundleV3["integrity"]> {
  const captured = captureBundleJsonV3(input) as Omit<
    OpenEnaAnalysisBundleV3,
    "integrity"
  >;
  const { integrity: _ignored, ...components } =
    captured as OpenEnaAnalysisBundleV3;
  const entries = Object.entries(components).filter(
    ([key]) => !["schemaVersion", "kind"].includes(key),
  );
  const componentHashes = Object.fromEntries(
    await Promise.all(
      entries.map(async ([key, value]) => [
        key,
        key === "methodsReportMarkdown"
          ? await sha256TextV3(String(value))
          : await sha256CanonicalJsonV3(value),
      ]),
    ),
  ) as unknown as OpenEnaAnalysisBundleV3["integrity"]["componentHashes"];
  return {
    componentHashes,
    bundleContentSha256: await sha256CanonicalJsonV3({
      ...components,
      componentHashes,
    }),
  };
}

function independentValidation(
  result: BoundResultV3,
  options: AnalysisBundleValidationOptionsV3,
) {
  // Calling before the first await makes the strong validator capture the caller's plan now.
  return options.expectedPlan
    ? validateBoundResultV3(result, options.expectedPlan).then(
        () => ({ error: null }),
        (error: unknown) => ({ error }),
      )
    : Promise.resolve({ error: null });
}

/** Builds a portable historical artifact from captured result science only.
 * Default verification is internal; current/source authority requires expectedPlan.
 */
export async function buildAnalysisBundleV3(
  input: BoundResultV3,
  options: BuildAnalysisBundleOptionsV3 = {},
): Promise<OpenEnaAnalysisBundleV3> {
  const result = captureBundleJsonV3(input) as BoundResultV3;
  const expectedKeys = [
    "schemaVersion",
    "kind",
    "binding",
    "configuration",
    "executionProvenance",
    "set",
    "capabilityStatus",
    "createdAt",
    ...("orderedAudit" in result
      ? ["orderedAudit", "orderedResponseNodeSummary"]
      : []),
  ].sort();
  if (
    canonicalJsonV3(Object.keys(result).sort()) !==
      canonicalJsonV3(expectedKeys) ||
    result.schemaVersion !== 3 ||
    result.kind !== "open-ena-bound-result"
  )
    throw new TypeError(
      "Bundle contract requires an exact bound result envelope.",
    );
  const presentation =
    options.presentation === undefined
      ? undefined
      : (captureBundleJsonV3(options.presentation) as PresentationArtifactV3);
  const {
    connectionCounts,
    lineWeights,
    pointsForProjection,
    points,
    rotation,
    ...modelData
  } = result.set;
  const components = {
    schemaVersion: 3 as const,
    kind: "open-ena-analysis-bundle" as const,
    manifest: result.binding,
    createdAt: result.createdAt,
    configuration: result.configuration,
    executionProvenance: result.executionProvenance,
    tables: {
      connectionCounts,
      lineWeights,
      pointsForProjection,
      points,
      trajectories: modelData.trajectories ?? [],
    },
    modelData,
    rotation,
    statistics: unavailableBundleStatisticsV3(),
    capabilityStatus: result.capabilityStatus,
    diagnostics: {
      warnings: result.executionProvenance.diagnostics,
      execution: [],
    },
    ...(presentation ? { presentation } : {}),
    methodsReportMarkdown: buildMethodsReportV3(result),
    ...("orderedAudit" in result
      ? {
          orderedAudit: result.orderedAudit,
          orderedResponseNodeSummary: result.orderedResponseNodeSummary,
        }
      : {}),
  };
  const independent = independentValidation(result, options);
  const integrity = await buildBundleIntegrityV3(
    components as Omit<OpenEnaAnalysisBundleV3, "integrity">,
  );
  // Include the final wrapper in exactly the same capture and text admission
  // used when the parser later recomputes integrity.
  const bundle = captureBundleJsonV3({
    ...components,
    integrity,
  }) as OpenEnaAnalysisBundleV3;
  await assertPortableBundleContractV3(bundle);
  const outcome = await independent;
  if (outcome.error) throw outcome.error;
  return deepFreezeV3(bundle);
}

/** No runs, state changes, source witness, or currentness are produced by parsing.
 * Hashes and internal scientific consistency do not authenticate external source truth.
 */
export async function parseAnalysisBundleV3(
  text: string,
  options: AnalysisBundleValidationOptionsV3 = {},
): Promise<OpenEnaAnalysisBundleV3> {
  const bundle = parseBundleJsonV3(text) as OpenEnaAnalysisBundleV3;
  const independent = options.expectedPlan
    ? independentValidation(boundResultFromBundleV3(bundle), options)
    : Promise.resolve({ error: null });
  // Validate the actual envelope before treating its components as a supported family.
  await assertPortableBundleContractV3(bundle);
  const integrity = await buildBundleIntegrityV3(bundle);
  if (canonicalJsonV3(bundle.integrity) !== canonicalJsonV3(integrity))
    throw new TypeError("Bundle component or content integrity hash mismatch.");
  const outcome = await independent;
  if (outcome.error) throw outcome.error;
  return deepFreezeV3(bundle);
}
