import { captureBundleJsonV3 } from "../../../lib/open-ena/bundle-json-v3";
import { captureDraftArtifactV3 } from "../../../lib/open-ena/draft-artifact-v3";
import {
  DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
  type OpenEnaGroupDisplayOptions,
  type OpenEnaGroupDisplaySettingsByGroup,
} from "../../../lib/open-ena/group-display";
import {
  canonicalJsonV3,
  deepFreezeV3,
} from "../../../lib/open-ena/model-v3/canonical-json";
import type {
  AnalysisFamilyV3,
  BoundResultV3,
  ModelWorkspaceDraftsV3,
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "../../../lib/open-ena/model-v3/types";

type ModelDraftV3 = StandardEnaDraftV3 | OrderedNetworkDraftV3;
type ExclusionActionV3 =
  | "exclude-all-codes"
  | "exclude-code"
  | "exclude-group-configuration";

export interface ModelDraftUndoRecordV3 {
  readonly action: ExclusionActionV3;
  readonly family: AnalysisFamilyV3;
  readonly datasetSha256: string;
  /** Exact synchronous JSON representation, NOT the compiler's SHA-256. */
  readonly resultingDraftFingerprint: string;
  readonly before: ModelDraftV3;
}

export interface ModelScientificContextV3 {
  readonly datasetSha256: string;
  readonly family: AnalysisFamilyV3;
  readonly scientificRevision: number;
  readonly draftFingerprint: string;
  /** Async compile admission also expires when execution starts or terminates. */
  readonly executionEpoch: number;
}

export interface ModelRunRequestV3 extends ModelScientificContextV3 {
  readonly generation: number;
  readonly executionPlanSha256: string;
}

interface VisibilityBindingV3 {
  readonly datasetSha256: string;
  readonly family: AnalysisFamilyV3;
  /** Keep the admitted object identity; equal hash text is insufficient. */
  readonly result: BoundResultV3 | null;
}

export interface ModelFamilyDisplayStateV3 {
  allCodesSuppressed: boolean;
  /** Code keys throughout this reducer are SOURCE column names, never artifact aliases. */
  codeVisibility: Record<string, boolean>;
  codeColors: Record<string, string>;
  codeVisibilitySnapshot: {
    binding: VisibilityBindingV3;
    values: Record<string, boolean>;
  } | null;
  allGroupsSuppressed: boolean;
  /** Tokens come from the admitted result's typed Group identity dictionary. */
  groups: OpenEnaGroupDisplaySettingsByGroup;
  groupVisibilitySnapshot: {
    binding: VisibilityBindingV3;
    values: OpenEnaGroupDisplaySettingsByGroup;
  } | null;
  codeOrder: string[];
}

export type ModelDisplayStateV3 = Record<
  AnalysisFamilyV3,
  ModelFamilyDisplayStateV3
>;

export interface ModelStateV3 {
  readonly datasetSha256: string;
  readonly drafts: ModelWorkspaceDraftsV3;
  readonly display: ModelDisplayStateV3;
  readonly scientificRevision: number;
  readonly runStatus: "idle" | "running" | "obsolete" | "cancelled" | "error";
  readonly resultStatus: "none" | "current" | "stale";
  readonly runningPlanSha256: string | null;
  readonly runningRequest: ModelRunRequestV3 | null;
  readonly runGeneration: number;
  readonly executionEpoch: number;
  readonly result: BoundResultV3 | null;
  readonly undo: ModelDraftUndoRecordV3 | null;
  /** Aggregate invalidity of ALL raw editor fields in each family. A field repair
   * must not clear another field's error, even when retaining a last-valid draft. */
  readonly editorBlocked: Readonly<Record<AnalysisFamilyV3, boolean>>;
}

export type ModelStateActionV3 =
  | { type: "set-active-family"; family: AnalysisFamilyV3 }
  | { type: "set-dataset"; datasetSha256: string }
  | { type: "replace-standard-draft"; draft: StandardEnaDraftV3 }
  | { type: "replace-ona-draft"; draft: OrderedNetworkDraftV3 }
  | { type: "set-editor-blocked"; family: AnalysisFamilyV3; blocked: boolean }
  | { type: "hide-all-codes" }
  | { type: "restore-code-visibility" }
  | { type: "set-code-visible"; code: string; visible: boolean }
  | { type: "set-code-color"; code: string; color: string }
  | { type: "set-code-order"; codes: string[] }
  | { type: "set-codes"; codes: string[] }
  | { type: "hide-all-groups" }
  | { type: "restore-group-visibility" }
  | {
      type: "set-group-display";
      groupToken: string;
      patch: Partial<OpenEnaGroupDisplayOptions>;
    }
  | { type: "exclude-all-codes" }
  | { type: "exclude-code"; code: string }
  | { type: "exclude-group-configuration" }
  | { type: "undo-model-edit" }
  /** Controller must first compile and validate a ready plan for this captured context. */
  | {
      type: "mark-running";
      executionPlanSha256: string;
      context: ModelScientificContextV3;
    }
  | { type: "mark-obsolete" }
  | { type: "mark-cancelled"; request: ModelRunRequestV3 }
  | { type: "mark-error"; request: ModelRunRequestV3 }
  /** Controller must strongly validate science and carry the exact local request object. */
  | {
      type: "accept-result";
      result: BoundResultV3;
      request: ModelRunRequestV3;
    };

function assertHash(value: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError("Model state requires an exact lowercase SHA-256.");
  }
}

function assertFamily(value: AnalysisFamilyV3): void {
  if (value !== "standard" && value !== "ona")
    throw new TypeError("Unsupported model family.");
}

function captureDraft<T extends ModelDraftV3>(
  draft: T,
  family: AnalysisFamilyV3,
): T {
  const captured = captureDraftArtifactV3(draft);
  if (captured.analysisFamily !== family)
    throw new TypeError("Draft family mismatch.");
  return deepFreezeV3(captured.draft as T);
}

function fingerprint(draft: ModelDraftV3): string {
  return `model-draft-json-v3:${canonicalJsonV3(draft)}`;
}

function defaultDisplay(codes: readonly string[]): ModelFamilyDisplayStateV3 {
  return deepFreezeV3({
    allCodesSuppressed: false,
    codeVisibility: Object.fromEntries(codes.map((code) => [code, true])),
    codeColors: {},
    codeVisibilitySnapshot: null,
    allGroupsSuppressed: false,
    groups: {},
    groupVisibilitySnapshot: null,
    codeOrder: [...codes],
  });
}

/** Captures drafts only. No whole-state serialization, scientific fitting, or ownership registration. */
export function createModelStateV3(
  drafts: ModelWorkspaceDraftsV3,
  datasetSha256: string,
): ModelStateV3 {
  assertHash(datasetSha256);
  const input = captureBundleJsonV3(drafts) as ModelWorkspaceDraftsV3;
  const keys = Object.keys(input);
  if (
    keys.length !== 4 ||
    !["schemaVersion", "activeFamily", "standard", "ona"].every((key) =>
      Object.hasOwn(input, key),
    ) ||
    input.schemaVersion !== 3
  ) {
    throw new TypeError("Model workspace has an invalid draft shape.");
  }
  assertFamily(input.activeFamily);
  const captured = Object.freeze({
    schemaVersion: 3 as const,
    activeFamily: input.activeFamily,
    standard: captureDraft(input.standard, "standard"),
    ona: captureDraft(input.ona, "ona"),
  });
  return Object.freeze({
    datasetSha256,
    drafts: captured,
    display: Object.freeze({
      standard: defaultDisplay(captured.standard.codes),
      ona: defaultDisplay(captured.ona.codes),
    }),
    scientificRevision: 0,
    runStatus: "idle",
    resultStatus: "none",
    runningPlanSha256: null,
    runningRequest: null,
    runGeneration: 0,
    executionEpoch: 0,
    result: null,
    undo: null,
    editorBlocked: Object.freeze({ standard: false, ona: false }),
  });
}

/** Capture before asynchronous compilation; a late compile cannot start a run for a newer edit. */
export function modelScientificContextV3(
  state: ModelStateV3,
): ModelScientificContextV3 {
  return Object.freeze({
    datasetSha256: state.datasetSha256,
    family: state.drafts.activeFamily,
    scientificRevision: state.scientificRevision,
    draftFingerprint: fingerprint(state.drafts[state.drafts.activeFamily]),
    executionEpoch: state.executionEpoch,
  });
}

function contextMatches(
  state: ModelStateV3,
  context: ModelScientificContextV3,
): boolean {
  return (
    context.datasetSha256 === state.datasetSha256 &&
    context.family === state.drafts.activeFamily &&
    context.scientificRevision === state.scientificRevision &&
    context.executionEpoch === state.executionEpoch &&
    context.draftFingerprint ===
      fingerprint(state.drafts[state.drafts.activeFamily])
  );
}

function scientificEdit(
  state: ModelStateV3,
  patch: Partial<ModelStateV3>,
): ModelStateV3 {
  return Object.freeze({
    ...state,
    ...patch,
    scientificRevision: state.scientificRevision + 1,
    executionEpoch:
      state.executionEpoch + (state.runStatus === "running" ? 1 : 0),
    runStatus: state.runStatus === "running" ? "obsolete" : state.runStatus,
    resultStatus: state.result ? "stale" : "none",
  });
}

function updateDisplay(
  state: ModelStateV3,
  family: AnalysisFamilyV3,
  display: ModelFamilyDisplayStateV3,
): ModelStateV3 {
  // Freeze only newly created display data. Bound results remain the exact admitted objects.
  Object.freeze(display.codeVisibility);
  Object.freeze(display.codeColors);
  Object.values(display.groups).forEach(Object.freeze);
  Object.freeze(display.groups);
  Object.freeze(display.codeOrder);
  Object.freeze(display);
  return Object.freeze({
    ...state,
    display: Object.freeze({ ...state.display, [family]: display }),
  });
}

function clearSnapshots(
  display: ModelFamilyDisplayStateV3,
): ModelFamilyDisplayStateV3 {
  return {
    ...display,
    allCodesSuppressed: false,
    codeVisibilitySnapshot: null,
    allGroupsSuppressed: false,
    groupVisibilitySnapshot: null,
  };
}

function changeDraft(
  state: ModelStateV3,
  family: AnalysisFamilyV3,
  draft: ModelDraftV3,
  action: ExclusionActionV3 | null,
): ModelStateV3 {
  const before = state.drafts[family];
  const captured = captureDraft(draft, family);
  const resultingDraftFingerprint = fingerprint(captured);
  if (resultingDraftFingerprint === fingerprint(before)) return state;
  const drafts = Object.freeze({ ...state.drafts, [family]: captured });
  const undo = action
    ? Object.freeze({
        action,
        family,
        datasetSha256: state.datasetSha256,
        resultingDraftFingerprint,
        before,
      })
    : null;
  const selected = new Set(captured.codes);
  const previous = state.display[family];
  const retained = [
    ...new Set(previous.codeOrder.filter((code) => selected.has(code))),
  ];
  const retainedSet = new Set(retained);
  // Duplicate selections are editable invalid drafts. Reordering requires a distinct exact permutation.
  const codeOrder =
    selected.size === captured.codes.length
      ? [
          ...retained,
          ...captured.codes.filter((code) => !retainedSet.has(code)),
        ]
      : [...captured.codes];
  const codeVisibility = {
    ...previous.codeVisibility,
    ...Object.fromEntries(
      captured.codes
        .filter((code) => !Object.hasOwn(previous.codeVisibility, code))
        .map((code) => [code, true]),
    ),
  };
  const displayed = updateDisplay(state, family, {
    ...previous,
    codeOrder,
    codeVisibility,
  });
  if (family !== state.drafts.activeFamily)
    return Object.freeze({ ...displayed, drafts });
  return scientificEdit(displayed, { drafts, undo });
}

function excludeCodes(
  state: ModelStateV3,
  code: string | null,
  action: ExclusionActionV3,
): ModelStateV3 {
  const family = state.drafts.activeFamily;
  if (family === "standard") {
    const draft = state.drafts.standard;
    return changeDraft(
      state,
      family,
      {
        ...draft,
        codes:
          code === null ? [] : draft.codes.filter((value) => value !== code),
      },
      action,
    );
  }
  const draft = state.drafts.ona;
  const kept = draft.codes.flatMap((value, index) =>
    code !== null && value !== code ? [index] : [],
  );
  const codes = kept.map((index) => draft.codes[index]);
  const mask = draft.directionalMask;
  return changeDraft(
    state,
    family,
    {
      ...draft,
      codes,
      directionalMask:
        mask === null
          ? null
          : {
              schemaVersion: 1,
              codeOrder: [...codes],
              enabled: kept.map((row) =>
                kept.map((column) => mask.enabled[row][column]),
              ),
            },
    },
    action,
  );
}

function reconcileOnaMaskBySourceV3(
  mask: NonNullable<OrderedNetworkDraftV3["directionalMask"]>,
  codes: readonly string[],
): NonNullable<OrderedNetworkDraftV3["directionalMask"]> {
  const oldIndices = new Map<string, number[]>();
  mask.codeOrder.forEach((code, index) => {
    const indices = oldIndices.get(code) ?? [];
    indices.push(index);
    oldIndices.set(code, indices);
  });
  const occurrences = new Map<string, number>();
  const retainedIndices = codes.map((code) => {
    const occurrence = occurrences.get(code) ?? 0;
    occurrences.set(code, occurrence + 1);
    return oldIndices.get(code)?.[occurrence] ?? null;
  });
  return {
    schemaVersion: 1,
    codeOrder: [...codes],
    enabled: retainedIndices.map((sourceIndex) =>
      retainedIndices.map((targetIndex) =>
        sourceIndex === null || targetIndex === null
          ? true
          : mask.enabled[sourceIndex][targetIndex],
      ),
    ),
  };
}

function setCodes(state: ModelStateV3, value: unknown): ModelStateV3 {
  const codes = captureBundleJsonV3(value) as unknown;
  if (
    !Array.isArray(codes) ||
    codes.some((code) => typeof code !== "string" || code.length === 0)
  ) {
    throw new TypeError(
      "Codes must be a dense array of nonempty source-column names.",
    );
  }
  const family = state.drafts.activeFamily;
  if (family === "standard") {
    return changeDraft(
      state,
      family,
      { ...state.drafts.standard, codes },
      null,
    );
  }
  const draft = state.drafts.ona;
  return changeDraft(
    state,
    family,
    {
      ...draft,
      codes,
      directionalMask:
        draft.directionalMask === null
          ? null
          : reconcileOnaMaskBySourceV3(draft.directionalMask, codes),
    },
    null,
  );
}

function visibilityBinding(state: ModelStateV3): VisibilityBindingV3 {
  return Object.freeze({
    datasetSha256: state.datasetSha256,
    family: state.drafts.activeFamily,
    result: state.result,
  });
}

function visibilityMatches(
  state: ModelStateV3,
  binding: VisibilityBindingV3,
): boolean {
  return (
    binding.datasetSha256 === state.datasetSha256 &&
    binding.family === state.drafts.activeFamily &&
    binding.result === state.result
  );
}

function currentDisplayResult(state: ModelStateV3): BoundResultV3 | null {
  return state.result?.binding.datasetSha256 === state.datasetSha256 &&
    state.result.configuration.analysisFamily === state.drafts.activeFamily
    ? state.result
    : null;
}

function assertCode(state: ModelStateV3, code: string): void {
  if (!state.drafts[state.drafts.activeFamily].codes.includes(code))
    throw new TypeError("Display requires a selected source Code.");
}

function pendingRequestMatches(
  state: ModelStateV3,
  request: ModelRunRequestV3,
): boolean {
  return (
    state.runStatus === "running" &&
    request === state.runningRequest &&
    !state.editorBlocked[state.drafts.activeFamily] &&
    contextMatches(state, request)
  );
}

/** Pure local state transitions. Run/result actions are trusted controller messages,
 * not an untrusted artifact validator or a compiler/Reference/inference capability.
 * Task31 must validate plans/results, cancel obsolete workers and retain request identity. */
export function modelStateReducerV3(
  state: ModelStateV3,
  action: ModelStateActionV3,
): ModelStateV3 {
  const family = state.drafts.activeFamily;
  const display = state.display[family];
  switch (action.type) {
    case "set-active-family":
      assertFamily(action.family);
      return action.family === family
        ? state
        : scientificEdit(state, {
            drafts: Object.freeze({
              ...state.drafts,
              activeFamily: action.family,
            }),
            undo: null,
          });
    case "set-dataset": {
      assertHash(action.datasetSha256);
      if (action.datasetSha256 === state.datasetSha256) return state;
      const next = updateDisplay(
        updateDisplay(
          state,
          "standard",
          clearSnapshots(state.display.standard),
        ),
        "ona",
        clearSnapshots(state.display.ona),
      );
      return scientificEdit(next, {
        datasetSha256: action.datasetSha256,
        undo: null,
      });
    }
    case "replace-standard-draft":
      return changeDraft(state, "standard", action.draft, null);
    case "replace-ona-draft":
      return changeDraft(state, "ona", action.draft, null);
    case "set-editor-blocked": {
      assertFamily(action.family);
      if (typeof action.blocked !== "boolean")
        throw new TypeError("Editor blocking must be boolean.");
      if (state.editorBlocked[action.family] === action.blocked) return state;
      const editorBlocked = Object.freeze({
        ...state.editorBlocked,
        [action.family]: action.blocked,
      });
      return action.family === family
        ? scientificEdit(state, { editorBlocked, undo: null })
        : Object.freeze({ ...state, editorBlocked });
    }
    case "exclude-all-codes":
      return excludeCodes(state, null, action.type);
    case "exclude-code":
      return excludeCodes(state, action.code, action.type);
    case "exclude-group-configuration": {
      if (family === "ona")
        return changeDraft(
          state,
          family,
          { ...state.drafts.ona, groupColumn: null },
          action.type,
        );
      const draft = state.drafts.standard;
      return changeDraft(
        state,
        family,
        {
          ...draft,
          groupColumn: null,
          rotation:
            draft.rotation.type === "means"
              ? { ...draft.rotation, negativeLevel: null, positiveLevel: null }
              : draft.rotation,
        },
        action.type,
      );
    }
    case "undo-model-edit": {
      const undo = state.undo;
      if (!undo) return state;
      if (
        undo.datasetSha256 !== state.datasetSha256 ||
        undo.family !== family ||
        undo.resultingDraftFingerprint !== fingerprint(state.drafts[family])
      ) {
        return Object.freeze({ ...state, undo: null });
      }
      return changeDraft(state, family, undo.before, null);
    }
    case "hide-all-codes":
      return display.allCodesSuppressed
        ? state
        : updateDisplay(state, family, {
            ...display,
            allCodesSuppressed: true,
            codeVisibilitySnapshot: Object.freeze({
              binding: visibilityBinding(state),
              values: display.codeVisibility,
            }),
          });
    case "restore-code-visibility": {
      const snapshot = display.codeVisibilitySnapshot;
      if (!snapshot && !display.allCodesSuppressed) return state;
      return updateDisplay(state, family, {
        ...display,
        allCodesSuppressed: false,
        codeVisibilitySnapshot: null,
        codeVisibility:
          snapshot && visibilityMatches(state, snapshot.binding)
            ? snapshot.values
            : display.codeVisibility,
      });
    }
    case "set-code-visible":
      assertCode(state, action.code);
      if (typeof action.visible !== "boolean")
        throw new TypeError("Code visibility must be boolean.");
      return display.codeVisibility[action.code] === action.visible
        ? state
        : updateDisplay(state, family, {
            ...display,
            codeVisibility: {
              ...display.codeVisibility,
              [action.code]: action.visible,
            },
          });
    case "set-code-color":
      assertCode(state, action.code);
      if (
        typeof action.color !== "string" ||
        action.color.length === 0 ||
        action.color.length > 256
      )
        throw new TypeError("Code color must be a nonempty bounded string.");
      return display.codeColors[action.code] === action.color
        ? state
        : updateDisplay(state, family, {
            ...display,
            codeColors: { ...display.codeColors, [action.code]: action.color },
          });
    case "set-code-order": {
      const codes = captureBundleJsonV3(action.codes) as string[];
      const selected = state.drafts[family].codes;
      const allowed = new Set(selected);
      if (
        !Array.isArray(codes) ||
        allowed.size !== selected.length ||
        codes.length !== selected.length ||
        new Set(codes).size !== codes.length ||
        codes.some((code) => !allowed.has(code))
      )
        throw new TypeError(
          "Code display order must be an exact permutation of selected source Codes.",
        );
      return codes.every((code, i) => code === display.codeOrder[i])
        ? state
        : updateDisplay(state, family, { ...display, codeOrder: codes });
    }
    case "set-codes":
      return setCodes(state, action.codes);
    case "hide-all-groups":
      return display.allGroupsSuppressed
        ? state
        : updateDisplay(state, family, {
            ...display,
            allGroupsSuppressed: true,
            groupVisibilitySnapshot: Object.freeze({
              binding: visibilityBinding(state),
              values: display.groups,
            }),
          });
    case "restore-group-visibility": {
      const snapshot = display.groupVisibilitySnapshot;
      if (!snapshot && !display.allGroupsSuppressed) return state;
      return updateDisplay(state, family, {
        ...display,
        allGroupsSuppressed: false,
        groupVisibilitySnapshot: null,
        groups:
          snapshot && visibilityMatches(state, snapshot.binding)
            ? snapshot.values
            : display.groups,
      });
    }
    case "set-group-display": {
      const result = currentDisplayResult(state);
      if (
        !result?.executionProvenance.identityDictionary.groups.some(
          (group) => group.token === action.groupToken,
        )
      )
        throw new TypeError(
          "Group display requires an actual typed bound Group token.",
        );
      const patch = captureBundleJsonV3(
        action.patch,
      ) as Partial<OpenEnaGroupDisplayOptions>;
      if (
        patch === null ||
        typeof patch !== "object" ||
        Array.isArray(patch) ||
        Object.entries(patch).some(
          ([key, value]) =>
            !Object.hasOwn(DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, key) ||
            typeof value !== "boolean",
        )
      )
        throw new TypeError(
          "Group patch must contain only Boolean display options.",
        );
      const before =
        display.groups[action.groupToken] ??
        DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS;
      if (
        Object.entries(patch).every(
          ([key, value]) =>
            before[key as keyof OpenEnaGroupDisplayOptions] === value,
        )
      )
        return state;
      return updateDisplay(state, family, {
        ...display,
        groups: {
          ...display.groups,
          [action.groupToken]: { ...before, ...patch },
        },
      });
    }
    case "mark-running": {
      assertHash(action.executionPlanSha256);
      if (state.editorBlocked[family] || !contextMatches(state, action.context))
        return state;
      const generation = state.runGeneration + 1;
      const executionEpoch = state.executionEpoch + 1;
      const runningRequest = Object.freeze({
        ...modelScientificContextV3(state),
        executionEpoch,
        generation,
        executionPlanSha256: action.executionPlanSha256,
      });
      return Object.freeze({
        ...state,
        runStatus: "running",
        runningRequest,
        runGeneration: generation,
        executionEpoch,
        runningPlanSha256: action.executionPlanSha256,
      });
    }
    case "mark-obsolete":
      return state.runStatus === "running"
        ? Object.freeze({
            ...state,
            runStatus: "obsolete",
            executionEpoch: state.executionEpoch + 1,
          })
        : state;
    case "mark-cancelled":
    case "mark-error":
      return pendingRequestMatches(state, action.request)
        ? Object.freeze({
            ...state,
            runStatus: action.type === "mark-cancelled" ? "cancelled" : "error",
            runningRequest: null,
            runningPlanSha256: null,
            executionEpoch: state.executionEpoch + 1,
          })
        : state;
    case "accept-result": {
      if (
        !pendingRequestMatches(state, action.request) ||
        action.result.binding.executionPlanSha256 !==
          action.request.executionPlanSha256 ||
        action.result.binding.datasetSha256 !== state.datasetSha256 ||
        action.result.configuration.analysisFamily !== family
      )
        return state;
      let next = state;
      if (state.result !== action.result) {
        next = updateDisplay(
          updateDisplay(
            state,
            "standard",
            clearSnapshots(state.display.standard),
          ),
          "ona",
          clearSnapshots(state.display.ona),
        );
        next = updateDisplay(next, family, {
          ...next.display[family],
          codeVisibility: Object.fromEntries(
            state.drafts[family].codes.map((code) => [code, true]),
          ),
          groups: Object.fromEntries(
            action.result.executionProvenance.identityDictionary.groups.map(
              (group) => [
                group.token,
                { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS },
              ],
            ),
          ),
        });
      }
      return Object.freeze({
        ...next,
        result: action.result,
        resultStatus: "current",
        runStatus: "idle",
        runningRequest: null,
        runningPlanSha256: null,
        executionEpoch: state.executionEpoch + 1,
      });
    }
  }
}
