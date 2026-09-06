"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { analyzePlanInWorkerV3, type AnalyzePlanWorkerOptionsV3 } from "../../../lib/open-ena/client";
import { compileStandardDraftV3, compileOnaDraftV3, type StandardCompileResultV3, type OnaCompileResultV3 } from "../../../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3, isStandardExecutionPlanV3, type OpenEnaExecutionPlanV3 } from "../../../lib/open-ena/model-v3/execution-plan";
import { buildOnaExecutionPlanV3 } from "../../../lib/open-ena/model-v3/ona-adapter";
import { validateBoundResultV3 } from "../../../lib/open-ena/model-v3/result-binding";
import { analyzePlanWithReferenceSourceV3 } from "../../../lib/open-ena/model-v3/reference-v2";
import { bindReferenceToTargetV3, decodeReferenceV2 } from "../../../lib/open-ena/model-v3/reference-codec-v2";
import { canonicalJsonV3 } from "../../../lib/open-ena/model-v3/canonical-json";
import { workspaceDraftsFromArtifactV3 } from "../../../lib/open-ena/model-v3/migration";
import { importOpenEnaArtifactV3, type OpenEnaImportResultV3 } from "../../../lib/open-ena/model-artifact-imports-v3";
import type { ParsedDataset } from "../../../lib/open-ena/types";
import type { BoundResultV3, ModelWorkspaceDraftsV3, OpenEnaStandardReferenceV2, ReferenceSourceWitnessV3 } from "../../../lib/open-ena/model-v3/types";
import { createModelStateV3, modelScientificContextV3, modelStateReducerV3, type ModelStateActionV3, type ModelStateV3, type ModelScientificContextV3, type ModelRunRequestV3 } from "./model-state";
import { createWindowsPanelRawStateV3, windowFieldBlockersV3, parseWindowExtentInputV3, type OpenEnaWindowsPanelRawStateV3 } from "./OpenEnaWindowsPanelV3";
import { createOrderPolicyEditorRawStateV3, orderPolicyFromRawStateV3, confirmationMatchesContextV3, type OrderPolicyEditorRawStateV3 } from "./OpenEnaOrderPolicyEditorV3";

export interface WorkspaceRawEditorsV3 {
  readonly windows: OpenEnaWindowsPanelRawStateV3;
  readonly horizonOrder: OrderPolicyEditorRawStateV3;
}
export interface WorkspaceCompilationV3 {
  readonly context: ModelScientificContextV3;
  readonly result: StandardCompileResultV3 | OnaCompileResultV3;
  readonly plan: OpenEnaExecutionPlanV3 | null;
  readonly error: string | null;
}
export interface WorkspaceStateV3 {
  readonly dataset: ParsedDataset | null;
  readonly model: ModelStateV3;
  readonly raw: WorkspaceRawEditorsV3;
  readonly compilation: WorkspaceCompilationV3 | null;
  readonly references: readonly OpenEnaStandardReferenceV2[];
  readonly preview: OpenEnaImportResultV3 | null;
  readonly historical: readonly OpenEnaImportResultV3[];
  readonly sourceWitness: ReferenceSourceWitnessV3 | null;
  readonly presetHiddenGroups: { readonly resultHash: string; readonly tokens: readonly string[] } | null;
  readonly progress: { readonly value: number; readonly stage: string } | null;
  readonly colorCompanions: Readonly<Record<"standard" | "ona", Readonly<Record<string, string>>>>;
  readonly autoRunIntent: ModelScientificContextV3 | null;
  readonly error: string | null;
}
export type WorkspaceActionV3 =
  | { type: "model"; action: ModelStateActionV3 }
  | { type: "windows-raw"; value: OpenEnaWindowsPanelRawStateV3 }
  | { type: "horizon-raw"; value: OrderPolicyEditorRawStateV3 }
  | { type: "install-source"; dataset: ParsedDataset; datasetSha256: string; drafts: ModelWorkspaceDraftsV3; autoRun?: boolean }
  | { type: "clear-auto-run-intent" }
  | { type: "clear-preset-group-hiding" }
  | { type: "apply-display-preset"; context: ModelScientificContextV3; resultHash: string; codeVisibility: Record<string, boolean>; codeColors: Record<string, string>; hiddenGroupTokens: string[] }
  | { type: "progress"; request: ModelRunRequestV3; value: number; stage: string }
  | { type: "confirm-code-color"; context: ModelScientificContextV3; code: string; color: string; complementary?: string }
  | { type: "compiled"; value: WorkspaceCompilationV3 }
  | { type: "preview"; value: OpenEnaImportResultV3 }
  | { type: "cancel-preview" }
  | { type: "accept-draft-preview"; preview: OpenEnaImportResultV3 }
  | { type: "keep-historical"; preview: OpenEnaImportResultV3 }
  | { type: "register-reference"; preview: OpenEnaImportResultV3; reference: OpenEnaStandardReferenceV2 }
  | { type: "completed"; request: ModelRunRequestV3; result: BoundResultV3; sourceWitness: ReferenceSourceWitnessV3 | null }
  | { type: "error"; message: string | null };

export function emptyWorkspaceDraftsV3(): ModelWorkspaceDraftsV3 {
  return workspaceDraftsFromArtifactV3({
    unitColumns: [], horizonColumns: [], groupColumn: null, codes: [],
    weighting: "binary", model: "EndPoint", windowType: "MovingStanzaWindow",
    movingStanza: { backward: { kind: "finite", value: 5 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true },
  });
}
export function sameScientificContextV3(a: ModelScientificContextV3, b: ModelScientificContextV3, includeEpoch = true): boolean {
  return a.datasetSha256 === b.datasetSha256 && a.family === b.family
    && a.scientificRevision === b.scientificRevision && a.draftFingerprint === b.draftFingerprint
    && (!includeEpoch || a.executionEpoch === b.executionEpoch);
}
function rawEditors(drafts: ModelWorkspaceDraftsV3): WorkspaceRawEditorsV3 {
  return { windows: createWindowsPanelRawStateV3(drafts), horizonOrder: createOrderPolicyEditorRawStateV3(drafts.standard.horizonOrder) };
}

/** Synchronous ALL-active-field calculation. Child effects cannot clear this ledger. */
export function workspaceRawBlockersV3(state: Pick<WorkspaceStateV3, "model" | "raw" | "dataset">) {
  const model = state.model, draft = model.drafts.standard, context = modelScientificContextV3(model);
  const columns = state.dataset?.headers ?? [];
  const windows = windowFieldBlockersV3(model, state.raw.windows, state.dataset
    ? { availability: "available", context, rowCount: state.dataset.rows.length }
    : { availability: "unavailable" }, columns);
  const raw = state.raw.horizonOrder;
  const horizonContext = state.dataset ? { scientificContext: context, rowCount: state.dataset.rows.length,
    relevantColumns: [...new Set([...draft.unitColumns, ...draft.horizonColumns])] } : null;
  const horizonOrder = model.drafts.activeFamily === "standard" && draft.model !== "EndPoint" && (
    raw.mode === "columns" ? orderPolicyFromRawStateV3(raw, columns) === null
      : horizonContext === null || draft.horizonOrder?.kind !== "source-order-confirmed"
        || !confirmationMatchesContextV3(draft.horizonOrder.confirmation, horizonContext)
  );
  return { ...windows, horizonOrder };
}
function reconcileRaw(state: WorkspaceStateV3): WorkspaceStateV3 {
  const blocked = Object.values(workspaceRawBlockersV3(state)).some(Boolean);
  const model = modelStateReducerV3(state.model, { type: "set-editor-blocked", family: state.model.drafts.activeFamily, blocked });
  const next = model === state.model ? state : { ...state, model };
  return next.autoRunIntent && !sameScientificContextV3(next.autoRunIntent, modelScientificContextV3(model))
    ? { ...next, autoRunIntent: null } : next;
}

/** Portable invalid typed drafts remain exportable. Only unresolved visible text
 * that the exact draft grammar cannot express prevents a faithful draft export. */
export function workspaceDraftExportableV3(state: WorkspaceStateV3): boolean {
  const family = state.model.drafts.activeFamily;
  const raw = state.raw.windows[family];
  const extents = family === "standard"
    ? [[state.raw.windows.standard.backward, "backward"], [state.raw.windows.standard.forward, "forward"]] as const
    : [[raw.backward, "backward"]] as const;
  for (const [extent, direction] of extents) {
    if (extent.mode === "finite" && parseWindowExtentInputV3(extent.finiteText, direction).status === "invalid") {
      // A literal finite number (even a scientifically invalid negative integer)
      // is representable if it is exactly the typed draft's visible value.
      const typed = family === "standard" ? state.model.drafts.standard.movingStanza[direction] : state.model.drafts.ona.backward;
      if (typed.kind !== "finite" || extent.finiteText !== String(typed.value)) return false;
    }
  }
  const orders = family === "standard" ? [raw.rowOrder, state.raw.horizonOrder] : [raw.rowOrder];
  return orders.every((order) => order.mode !== "columns" || order.rows.length === 0
    || orderPolicyFromRawStateV3(order, state.dataset?.headers ?? []) !== null);
}

export function createWorkspaceStateV3(input?: { dataset: ParsedDataset; datasetSha256: string; drafts: ModelWorkspaceDraftsV3 }): WorkspaceStateV3 {
  const drafts = input?.drafts ?? emptyWorkspaceDraftsV3();
  return reconcileRaw({ dataset: input?.dataset ?? null, model: createModelStateV3(drafts, input?.datasetSha256 ?? "0".repeat(64)),
    raw: rawEditors(drafts), compilation: null, references: [], preview: null, historical: [], sourceWitness: null, presetHiddenGroups: null, progress: null, colorCompanions: { standard: {}, ona: {} }, error: null, autoRunIntent: null });
}

export function workspaceReducerV3(state: WorkspaceStateV3, action: WorkspaceActionV3): WorkspaceStateV3 {
  switch (action.type) {
    case "model": return reconcileRaw({ ...state, progress: action.action.type === "mark-running" ? null : state.progress, model: modelStateReducerV3(state.model, action.action) });
    case "windows-raw": return reconcileRaw({ ...state, raw: { ...state.raw, windows: action.value } });
    case "horizon-raw": return reconcileRaw({ ...state, raw: { ...state.raw, horizonOrder: action.value } });
    case "install-source": {
      let model = modelStateReducerV3(state.model, { type: "adopt-dataset", datasetSha256: action.datasetSha256 });
      model = modelStateReducerV3(model, { type: "replace-standard-draft", draft: action.drafts.standard });
      model = modelStateReducerV3(model, { type: "replace-ona-draft", draft: action.drafts.ona });
      model = modelStateReducerV3(model, { type: "set-active-family", family: action.drafts.activeFamily });
      const next = reconcileRaw({ ...state, dataset: action.dataset, model, presetHiddenGroups: null, raw: rawEditors(action.drafts), compilation: null, preview: null, error: null, autoRunIntent: null });
      return { ...next, autoRunIntent: action.autoRun ? modelScientificContextV3(next.model) : null };
    }
    case "clear-auto-run-intent": return state.autoRunIntent ? { ...state, autoRunIntent: null } : state;
    case "clear-preset-group-hiding": return { ...state, presetHiddenGroups: null };
    case "apply-display-preset": {
      if (!sameScientificContextV3(action.context, modelScientificContextV3(state.model)) || state.model.result?.binding.scientificResultSha256 !== action.resultHash || state.model.result.configuration.analysisFamily !== action.context.family) return state;
      if (Object.keys(action.codeVisibility).some((code) => !state.model.drafts[action.context.family].codes.includes(code)) || Object.keys(action.codeColors).some((code) => !state.model.drafts[action.context.family].codes.includes(code))) return state;
      if (state.model.display[action.context.family].allCodesSuppressed || state.model.display[action.context.family].allGroupsSuppressed) return state;
      let model = state.model;
      for (const [code, visible] of Object.entries(action.codeVisibility)) model = modelStateReducerV3(model, { type: "set-code-visible", code, visible });
      for (const [code, color] of Object.entries(action.codeColors)) model = modelStateReducerV3(model, { type: "set-code-color", code, color });
      return { ...state, model, presetHiddenGroups: { resultHash: action.resultHash, tokens: [...action.hiddenGroupTokens] } };
    }
    case "confirm-code-color": return sameScientificContextV3(action.context, modelScientificContextV3(state.model)) && state.model.drafts[state.model.drafts.activeFamily].codes.includes(action.code)
      ? { ...state, model: modelStateReducerV3(state.model, { type: "set-code-color", code: action.code, color: action.color }),
        colorCompanions: action.complementary === undefined ? state.colorCompanions : { ...state.colorCompanions, [action.context.family]: { ...state.colorCompanions[action.context.family], [action.code]: action.complementary } } } : state;
    case "progress": return state.model.runStatus === "running" && state.model.runningRequest === action.request
      ? { ...state, progress: { value: action.value, stage: action.stage } } : state;
    case "compiled": return sameScientificContextV3(action.value.context, modelScientificContextV3(state.model))
      ? { ...state, compilation: action.value } : state;
    case "preview": return { ...state, preview: action.value, error: null };
    case "cancel-preview": return state.preview ? { ...state, preview: null } : state;
    case "accept-draft-preview": {
      if (state.preview !== action.preview) return state;
      const preview = action.preview;
      const drafts = preview.kind === "draft" ? preview.draft
        : preview.kind === "historical-result" ? preview.loadConfigurationAction.draft : null;
      if (!drafts) return state;
      const family = drafts.activeFamily;
      let model = modelStateReducerV3(state.model, family === "standard"
        ? { type: "replace-standard-draft", draft: drafts.standard }
        : { type: "replace-ona-draft", draft: drafts.ona });
      model = modelStateReducerV3(model, { type: "set-active-family", family });
      const replacement = rawEditors(drafts);
      return reconcileRaw({ ...state, model, preview: null, autoRunIntent: null, raw: {
        windows: { ...state.raw.windows, [family]: replacement.windows[family] },
        horizonOrder: family === "standard" ? replacement.horizonOrder : state.raw.horizonOrder,
      } });
    }
    case "keep-historical": return state.preview === action.preview && action.preview.kind === "historical-result"
      ? { ...state, historical: [...state.historical, action.preview], preview: null } : state;
    case "register-reference": return state.preview === action.preview && action.preview.kind === "reference-candidate"
      ? { ...state, preview: null, references: state.references.some((r) => r.contentSha256 === action.reference.contentSha256)
        ? state.references : [...state.references, action.reference] } : state;
    case "completed": {
      const model = modelStateReducerV3(state.model, { type: "accept-result", request: action.request, result: action.result });
      return model === state.model ? state : { ...state, model, sourceWitness: action.sourceWitness, error: null };
    }
    case "error": return { ...state, error: action.message };
  }
}

export type WorkspaceWorkerV3 = (plan: OpenEnaExecutionPlanV3, options: AnalyzePlanWorkerOptionsV3) => Promise<{ result: BoundResultV3; sourceWitness: ReferenceSourceWitnessV3 | null }>;
const productionWorkerV3: WorkspaceWorkerV3 = async (plan, options) => {
  if (isStandardExecutionPlanV3(plan) && plan.configuration.analysis.model.type === "EndPoint"
    && plan.configuration.analysis.rotation.type !== "reference") return analyzePlanWithReferenceSourceV3(plan, options);
  return { result: await analyzePlanInWorkerV3(plan, options), sourceWitness: null };
};

export function useOpenEnaWorkspaceV3(options: { initial?: Parameters<typeof createWorkspaceStateV3>[0]; worker?: WorkspaceWorkerV3 } = {}) {
  const [state, reactDispatch] = useReducer(workspaceReducerV3, options.initial, createWorkspaceStateV3);
  const importGeneration = useRef(0);
  const [importPending, setImportPending] = useState(false);
  const dispatch = useCallback((action: WorkspaceActionV3) => {
    if (action.type === "cancel-preview" || action.type === "install-source") {
      importGeneration.current++;
      setImportPending(false);
    }
    reactDispatch(action);
  }, []);
  const latest = useRef(state); latest.current = state;
  const pendingPlans = useRef(new Map<string, OpenEnaExecutionPlanV3>());
  const context = modelScientificContextV3(state.model);
  const contextKey = canonicalJsonV3(context);
  const referenceKey = state.references.map((r) => r.contentSha256).join();
  const worker = options.worker ?? productionWorkerV3;
  useEffect(() => {
    const captured = latest.current;
    if (!captured.dataset || captured.model.runStatus === "running") return;
    const context = modelScientificContextV3(captured.model);
    let active = true;
    void (async () => {
      const family = captured.model.drafts.activeFamily;
      const result = family === "standard"
        ? await compileStandardDraftV3(captured.dataset!, context.datasetSha256, captured.model.drafts.standard)
        : await compileOnaDraftV3(captured.dataset!, context.datasetSha256, captured.model.drafts.ona);
      let plan: OpenEnaExecutionPlanV3 | null = null, error: string | null = null;
      if (result.status === "ready" && !captured.model.editorBlocked[family]) {
        try {
          if (result.canonicalConfiguration.analysisFamily === "standard") {
            // The family discriminant lives in canonicalConfiguration; this
            // checked branch retains the actual compiler-owned object.
            const standard = result as Extract<StandardCompileResultV3, { status: "ready" }>;
            const rotation = standard.canonicalConfiguration.analysis.rotation;
            const source = rotation.type === "reference" ? captured.references.find((r) => r.referenceId === rotation.referenceId && r.contentSha256 === rotation.expectedContentSha256) : null;
            const reference = rotation.type === "reference" ? await bindReferenceToTargetV3(source, standard.canonicalConfiguration) : null;
            plan = await buildStandardExecutionPlanV3({ dataset: captured.dataset!, datasetSha256: context.datasetSha256, compileResult: standard, reference });
          } else plan = await buildOnaExecutionPlanV3(captured.dataset!, context.datasetSha256, result.canonicalConfiguration);
        } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
      }
      if (active) dispatch({ type: "compiled", value: { context, result, plan, error } });
    })().catch((error: unknown) => { if (active) dispatch({ type: "error", message: error instanceof Error ? error.message : String(error) }); });
    return () => { active = false; };
  }, [contextKey, referenceKey]);

  const request = state.model.runningRequest;
  useEffect(() => {
    if (state.model.runStatus !== "running" || request === null) return;
    const plan = pendingPlans.current.get(request.executionPlanSha256);
    if (!plan) { dispatch({ type: "model", action: { type: "mark-error", request } }); return; }
    const abort = new AbortController();
    // This is the EXACT request adopted by React's reducer, never a cloned ticket.
    void worker(plan, { signal: abort.signal, onProgress: (progress) => dispatch({ type: "progress", request, value: progress.progress, stage: progress.stage }) }).then(async (output) => {
      const result = await validateBoundResultV3(output.result, plan);
      if (!abort.signal.aborted) dispatch({ type: "completed", request, result, sourceWitness: output.sourceWitness });
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      dispatch({ type: "model", action: { type: "mark-error", request } });
      if (latest.current.model.runningRequest === request && latest.current.model.runStatus === "running")
        dispatch({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
    return () => { abort.abort(); pendingPlans.current.delete(request.executionPlanSha256); };
  }, [request, state.model.runStatus, worker]);

  const run = useCallback(() => {
    const current = latest.current, compiled = current.compilation;
    if (!compiled?.plan || !sameScientificContextV3(compiled.context, modelScientificContextV3(current.model))
      || Object.values(workspaceRawBlockersV3(current)).some(Boolean) || current.model.runStatus === "running") return;
    pendingPlans.current.set(compiled.plan.header.executionPlanSha256, compiled.plan);
    dispatch({ type: "model", action: { type: "mark-running", context: compiled.context, executionPlanSha256: compiled.plan.header.executionPlanSha256 } });
  }, []);
  const preview = useCallback(async (text: string | Promise<string>) => {
    dispatch({ type: "clear-auto-run-intent" });
    const generation = ++importGeneration.current;
    setImportPending(true);
    try {
      const bytes = await text;
      if (generation !== importGeneration.current) return;
      const value = await importOpenEnaArtifactV3(bytes);
      if (generation !== importGeneration.current) return;
      dispatch({ type: "preview", value });
      return value;
    } finally { if (generation === importGeneration.current) setImportPending(false); }
  }, []);
  const addReference = useCallback(async () => {
    const preview = latest.current.preview;
    if (preview?.kind !== "reference-candidate") return;
    // Legacy candidates remain inspectable with missing provenance; only the
    // native validator can add a computationally usable v2 reference.
    const reference = await decodeReferenceV2(preview.candidate);
    dispatch({ type: "register-reference", preview, reference });
  }, []);
  const currentCompilation = state.compilation && sameScientificContextV3(state.compilation.context, context) ? state.compilation : null;
  const currentPlan = state.compilation?.plan && sameScientificContextV3(state.compilation.context, context, false)
    && !Object.values(workspaceRawBlockersV3(state)).some(Boolean) ? state.compilation.plan : null;
  useEffect(() => {
    if (state.autoRunIntent && currentCompilation?.plan && sameScientificContextV3(state.autoRunIntent, modelScientificContextV3(state.model))) run();
  }, [state.autoRunIntent, currentCompilation, run]);
  return { state, dispatch, run, preview, addReference, importPending, context, currentCompilation, currentPlan,
    canRun: Boolean(currentCompilation?.plan && state.model.runStatus !== "running" && !Object.values(workspaceRawBlockersV3(state)).some(Boolean)),
    cancel: () => { const request = latest.current.model.runningRequest; if (request) dispatch({ type: "model", action: { type: "mark-cancelled", request } }); },
    dispatchModel: useCallback((action: ModelStateActionV3) => dispatch({ type: "model", action }), []),
  };
}
