import { workspaceDraftExportableV3, type WorkspaceStateV3 } from "../../components/open-ena/model-v3/workspace-controller";
import type { ModelDisplayStateV3 } from "../../components/open-ena/model-v3/model-state";
import { captureBundleJsonV3 } from "./bundle-json-v3";
import { buildAnalysisBundleV3, parseAnalysisBundleV3 } from "./analysis-bundle-v3";
import { boundResultFromBundleV3 } from "./bundle-contract-v3";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3 } from "./model-v3/canonical-json";
import { compileOnaDraftV3, compileStandardDraftV3, type StandardCompileResultV3, type OnaCompileResultV3 } from "./model-v3/compiler";
import { buildStandardExecutionPlanV3, type OpenEnaExecutionPlanV3 } from "./model-v3/execution-plan";
import { buildOnaExecutionPlanV3 } from "./model-v3/ona-adapter";
import { validateBoundResultV3 } from "./model-v3/result-binding";
import { bindReferenceToTargetV3 } from "./model-v3/reference-v2";
import { decodeReferenceV2 } from "./model-v3/reference-codec-v2";
import type { BoundResultV3, ModelWorkspaceDraftsV3, OpenEnaStandardReferenceV2 } from "./model-v3/types";
import type { ParsedDataset } from "./types";
import { captureOpenEnaCloudDataset, decodeOpenEnaCloudDataset, parseOpenEnaCloudSnapshot,
  validateOpenEnaCloudSnapshotEnvelope, type OpenEnaCloudSnapshot } from "./cloud-workspace-envelope";
import { decodeOpenEnaCloudDisplay, encodeOpenEnaCloudDisplay, type OpenEnaCloudPresentation } from "./cloud-workspace-presentation";
import { captureSavedOpenEnaAiInterpretation, type SavedOpenEnaAiInterpretation, type OpenEnaCloudExtras } from "./cloud-workspace-extras";
import { serializeAnalysisSetV3, restoreAnalysisSetV3, compareAnalysisSetsV3, type OpenEnaAnalysisSetV3 } from "./sets-bound-v3";
import { originalOpenEnaImportTextV3, importOpenEnaArtifactV3, type HistoricalImportV3 } from "./model-artifact-imports-v3";

export { defaultOpenEnaCloudPresentation } from "./cloud-workspace-presentation";
export type { OpenEnaCloudPresentation } from "./cloud-workspace-presentation";
export type { OpenEnaCloudSnapshot } from "./cloud-workspace-envelope";

export type RestoredOpenEnaCloudWorkspace = {
  dataset: ParsedDataset | null; datasetSha256: string; drafts: ModelWorkspaceDraftsV3; onaDraftInitialized: boolean;
  display: ModelDisplayStateV3; references: OpenEnaStandardReferenceV2[]; result: BoundResultV3 | null; resultStatus: "none" | "current" | "stale";
  compilation: { result: StandardCompileResultV3 | OnaCompileResultV3; plan: OpenEnaExecutionPlanV3 | null; error: string | null } | null;
  presentation: OpenEnaCloudPresentation; sourceReference: OpenEnaStandardReferenceV2 | null;
  originalSource: { name: string; text: string } | null; statisticsReport: Record<string, unknown> | null;
  aiInterpretation: SavedOpenEnaAiInterpretation | null; analysisSets: OpenEnaAnalysisSetV3[];
  setComparison: ReturnType<typeof compareAnalysisSetsV3> | null; historical: HistoricalImportV3[];
};
const restoredWorkspaces = new WeakSet<object>();
export function isRestoredOpenEnaCloudWorkspace(value: unknown): value is RestoredOpenEnaCloudWorkspace {
  return value !== null && typeof value === "object" && restoredWorkspaces.has(value);
}

export async function captureOpenEnaCloudWorkspace(input: {
  state: WorkspaceStateV3; currentPlan: OpenEnaExecutionPlanV3 | null; presentation: OpenEnaCloudPresentation;
  sourceReference?: OpenEnaStandardReferenceV2 | null; originalSource?: { name: string; text: string } | null;
  statisticsReport?: Record<string, unknown> | null;
  aiInterpretation?: SavedOpenEnaAiInterpretation | null; analysisSets?: readonly OpenEnaAnalysisSetV3[];
  setComparison?: ReturnType<typeof compareAnalysisSetsV3> | null;
}): Promise<OpenEnaCloudSnapshot> {
  const { state } = input;
  if (state.model.runStatus === "running") throw new TypeError("Wait for the running analysis before saving this project.");
  for (const activeFamily of ["standard", "ona"] as const) {
    if (!workspaceDraftExportableV3({ ...state, model: { ...state.model, drafts: { ...state.model.drafts, activeFamily } } })) {
      throw new TypeError("unfinished-model-input");
    }
  }
  const dataset = state.dataset ? captureOpenEnaCloudDataset(state.dataset) : null;
  // Capture the full save point before the first await. Subsequent UI edits belong to the next save.
  const captured = captureBundleJsonV3({ dataset, datasetSha256: state.model.datasetSha256,
    drafts: state.model.drafts, onaDraftInitialized: state.model.onaDraftInitialized, display: encodeOpenEnaCloudDisplay(state.model.display),
    references: state.references, result: state.model.result, resultStatus: state.model.resultStatus,
    presentation: input.presentation, sourceReference: input.sourceReference ?? null, originalSource: input.originalSource ?? null,
    statisticsReport: input.statisticsReport ?? null,
    aiInterpretation: input.aiInterpretation ? captureSavedOpenEnaAiInterpretation(input.aiInterpretation) : null,
    analysisSets: (input.analysisSets ?? []).map(serializeAnalysisSetV3),
    setComparison: input.setComparison ? { primaryId: input.setComparison.primary.setId, secondaryId: input.setComparison.secondary.setId, axes: input.setComparison.axes } : null,
    historicalImports: state.historical.map(originalOpenEnaImportTextV3) }) as {
      dataset: typeof dataset; datasetSha256: string; drafts: ModelWorkspaceDraftsV3; onaDraftInitialized: boolean;
      display: OpenEnaCloudSnapshot["display"]; references: OpenEnaStandardReferenceV2[]; result: BoundResultV3 | null;
      resultStatus: OpenEnaCloudSnapshot["resultStatus"]; presentation: OpenEnaCloudPresentation; sourceReference: OpenEnaStandardReferenceV2 | null;
      originalSource: OpenEnaCloudSnapshot["originalSource"]; statisticsReport: Record<string, unknown> | null;
    } & OpenEnaCloudExtras;
  const currentPlan = input.currentPlan;
  if (captured.result && captured.resultStatus === "current" && !currentPlan) throw new TypeError("Current analysis plan is still being checked. Try saving again.");
  const { result, ...fields } = captured;
  const payload = { schemaVersion: 2 as const, kind: "open-ena-cloud-project" as const, ...fields,
    dataset: captured.dataset ? { ...captured.dataset, tableSha256: await sha256CanonicalJsonV3({ headers: captured.dataset.headers, cells: captured.dataset.cells }) } : null,
    analysis: result ? await buildAnalysisBundleV3(result, captured.resultStatus === "current" && currentPlan ? { expectedPlan: currentPlan } : {}) : null };
  return deepFreezeV3(await validateOpenEnaCloudSnapshotEnvelope({ ...payload, integritySha256: await sha256CanonicalJsonV3(payload) }));
}

async function compileRestored(snapshot: OpenEnaCloudSnapshot, dataset: ParsedDataset | null, references: OpenEnaStandardReferenceV2[]) {
  if (!dataset) return null;
  const family = snapshot.drafts.activeFamily;
  const compiled = family === "standard" ? await compileStandardDraftV3(dataset, snapshot.datasetSha256, snapshot.drafts.standard)
    : await compileOnaDraftV3(dataset, snapshot.datasetSha256, snapshot.drafts.ona);
  let plan: OpenEnaExecutionPlanV3 | null = null, error: string | null = null;
  if (compiled.status === "ready") {
    try {
      if (compiled.canonicalConfiguration.analysisFamily === "standard") {
        const standard = compiled as Extract<StandardCompileResultV3, { status: "ready" }>;
        const rotation = standard.canonicalConfiguration.analysis.rotation;
        const source = rotation.type === "reference" ? references.find((r) => r.referenceId === rotation.referenceId && r.contentSha256 === rotation.expectedContentSha256) : null;
        const reference = rotation.type === "reference" ? await bindReferenceToTargetV3(source, standard.canonicalConfiguration) : null;
        plan = await buildStandardExecutionPlanV3({ dataset, datasetSha256: snapshot.datasetSha256, compileResult: standard, reference });
      } else plan = await buildOnaExecutionPlanV3(dataset, snapshot.datasetSha256, compiled.canonicalConfiguration);
    } catch { error = "The saved model requires review before it can run."; }
  }
  return { result: compiled, plan, error };
}

export async function restoreOpenEnaCloudWorkspace(text: string): Promise<RestoredOpenEnaCloudWorkspace> {
  const snapshot = await parseOpenEnaCloudSnapshot(text);
  const dataset = snapshot.dataset ? decodeOpenEnaCloudDataset(snapshot.dataset) : null;
  const references = await Promise.all(snapshot.references.map((reference) => decodeReferenceV2(reference)));
  const compilation = await compileRestored(snapshot, dataset, references);
  let result: BoundResultV3 | null = null, resultStatus: RestoredOpenEnaCloudWorkspace["resultStatus"] = "none";
  if (snapshot.analysis) {
    const bundle = await parseAnalysisBundleV3(canonicalJsonV3(snapshot.analysis));
    result = boundResultFromBundleV3(bundle); resultStatus = "stale";
    if (snapshot.resultStatus === "current" && compilation?.plan) {
      try { result = await validateBoundResultV3(result, compilation.plan); resultStatus = "current"; }
      catch { /* A valid historical result never gains currentness from an envelope flag or matching hash alone. */ }
    }
  }
  const sourceReference = snapshot.sourceReference ? await decodeReferenceV2(snapshot.sourceReference) : null;
  if (sourceReference && (!result || sourceReference.source.executionPlanSha256 !== result.binding.executionPlanSha256
    || sourceReference.source.configurationSha256 !== result.binding.configurationSha256)) throw new TypeError("Saved Reference does not belong to the saved analysis.");
  if (snapshot.statisticsReport && (!result || canonicalJsonV3(snapshot.statisticsReport.binding) !== canonicalJsonV3(result.binding))) throw new TypeError("Saved statistics do not belong to the saved analysis.");
  const aiInterpretation = snapshot.schemaVersion === 2 && snapshot.aiInterpretation ? captureSavedOpenEnaAiInterpretation(snapshot.aiInterpretation) : null;
  const analysisSets = snapshot.schemaVersion === 2 ? await Promise.all(snapshot.analysisSets.map(restoreAnalysisSetV3)) : [];
  const selection = snapshot.schemaVersion === 2 ? snapshot.setComparison : null;
  const setComparison = selection ? compareAnalysisSetsV3(analysisSets.find((set) => set.id === selection.primaryId)!,
    analysisSets.find((set) => set.id === selection.secondaryId)!, selection.axes) : null;
  const historical: HistoricalImportV3[] = [];
  for (const text of snapshot.schemaVersion === 2 ? snapshot.historicalImports : []) {
    const artifact = await importOpenEnaArtifactV3(text);
    if (artifact.kind !== "historical-result") throw new TypeError("Saved historical import is not an analysis result.");
    if (historical.some((existing) => existing.receivedArtifactSha256 === artifact.receivedArtifactSha256)) throw new TypeError("Duplicate saved historical import.");
    historical.push(artifact);
  }
  const restored: RestoredOpenEnaCloudWorkspace = deepFreezeV3({ dataset, datasetSha256: snapshot.datasetSha256,
    drafts: snapshot.drafts, onaDraftInitialized: snapshot.onaDraftInitialized, references, result, resultStatus, compilation,
    display: decodeOpenEnaCloudDisplay(snapshot.display, snapshot.datasetSha256, result), presentation: snapshot.presentation,
    sourceReference, originalSource: snapshot.originalSource, statisticsReport: snapshot.statisticsReport,
    aiInterpretation, analysisSets, setComparison, historical });
  restoredWorkspaces.add(restored);
  return restored;
}
