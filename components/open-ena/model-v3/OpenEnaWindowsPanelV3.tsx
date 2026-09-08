"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  isCompilerOwnedReadyResultV3,
  type OnaCompileResultV3,
  type StandardCompileResultV3,
} from "../../../lib/open-ena/model-v3/compiler";
import type {
  AnalysisFamilyV3,
  BackwardExtentV3,
  ForwardExtentV3,
  ModelWorkspaceDraftsV3,
  StandardModelTypeV3,
  StandardRotationTypeV3,
  StandardWindowTypeV3,
} from "../../../lib/open-ena/model-v3/types";
import {
  confirmationMatchesContextV3,
  createOrderPolicyEditorRawStateV3,
  OpenEnaOrderPolicyEditorV3,
  orderPolicyFromRawStateV3,
  type OpenEnaOrderPolicyEditorV3Copy,
  type OrderPolicyEditorRawStateV3,
  type SourceOrderConfirmationContextV3,
} from "./OpenEnaOrderPolicyEditorV3";
import type { OpenEnaModelPanelFieldsV3 } from "./OpenEnaModelTabsV3";
import {
  modelScientificContextV3,
  type ModelScientificContextV3,
  type ModelStateActionV3,
  type ModelStateV3,
} from "./model-state";

export type WindowExtentDirectionV3 = "backward" | "forward";
export type WindowExtentParseErrorV3 =
  | "required"
  | "integer"
  | "minimumBackward"
  | "minimumForward"
  | "safeInteger";

export type WindowExtentParseResultV3 =
  | { readonly status: "valid"; readonly extent: BackwardExtentV3 | ForwardExtentV3 }
  | { readonly status: "invalid"; readonly reason: WindowExtentParseErrorV3 };

/** Strict UI parser. Raw text stays outside the schema-v3 draft until this succeeds. */
export function parseWindowExtentInputV3(
  rawValue: string,
  direction: WindowExtentDirectionV3,
): WindowExtentParseResultV3 {
  if (rawValue.length === 0 || /^\s+$/u.test(rawValue)) {
    return { status: "invalid", reason: "required" };
  }
  if (rawValue === "Infinity") {
    return { status: "valid", extent: { kind: "infinity" } };
  }
  if (/^-\d+$/u.test(rawValue)) {
    return {
      status: "invalid",
      reason: direction === "backward" ? "minimumBackward" : "minimumForward",
    };
  }
  if (!/^\d+$/u.test(rawValue)) {
    return { status: "invalid", reason: "integer" };
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    return { status: "invalid", reason: "safeInteger" };
  }
  if (direction === "backward" && value < 1) {
    return { status: "invalid", reason: "minimumBackward" };
  }
  if (direction === "forward" && value < 0) {
    return { status: "invalid", reason: "minimumForward" };
  }
  return { status: "valid", extent: { kind: "finite", value } };
}

export interface WindowExtentRawStateV3 {
  readonly mode: "finite" | "infinity";
  /** Retained verbatim while Entire Horizon is active. */
  readonly finiteText: string;
}

export interface OpenEnaWindowsPanelRawStateV3 {
  readonly standard: {
    readonly backward: WindowExtentRawStateV3;
    readonly forward: WindowExtentRawStateV3;
    readonly rowOrder: OrderPolicyEditorRawStateV3;
  };
  readonly ona: {
    readonly backward: WindowExtentRawStateV3;
    readonly rowOrder: OrderPolicyEditorRawStateV3;
  };
}

export interface OpenEnaWindowFieldBlockersV3 {
  readonly backward: boolean;
  readonly forward: boolean;
  readonly rowOrder: boolean;
}

export interface OpenEnaReferenceOptionV3 {
  /** A display option supplied by the process-local Reference registry owner. */
  readonly referenceId: string;
  readonly contentSha256: string;
  readonly displayName: string;
}

export type OpenEnaReferenceCompatibilityReasonV3 =
  | "normalization"
  | "unit-fields"
  | "horizon-fields"
  | "weighting"
  | "window-type"
  | "window-extents"
  | "row-order"
  | "codes"
  | "basis"
  | "identity";

/**
 * Context-bound read view supplied by the future Workspace owner. It carries no
 * artifact registration, source-fit witness, import, or execution authority.
 */
export type OpenEnaReferenceSelectionPreviewV3 =
  | { readonly availability: "unavailable"; readonly context?: ModelScientificContextV3 }
  | {
      readonly availability: "available";
      readonly context: ModelScientificContextV3;
      readonly referenceId: string;
      readonly contentSha256: string;
      readonly displayName: string;
      readonly sourceFit: {
        readonly method: "svd" | "means";
        readonly population: "endpoint-units";
        readonly observationCount: number;
      };
      readonly basis: {
        readonly codeCount: number;
        readonly edgeCount: number;
        readonly rotationColumns: readonly string[];
      };
      readonly fixedCentering: { readonly centerAlignToOrigin: boolean };
      readonly compatibility:
        | { readonly status: "compatible"; readonly reasons: readonly OpenEnaReferenceCompatibilityReasonV3[] }
        | { readonly status: "incompatible"; readonly reasons: readonly OpenEnaReferenceCompatibilityReasonV3[] };
      readonly targetProjection:
        | { readonly status: "not-adopted" }
        | {
            readonly status: "available";
            readonly rank: number;
            readonly variance: readonly number[];
          };
    };

export type OpenEnaWindowsPreflightV3 = {
  readonly context: ModelScientificContextV3;
  readonly result: StandardCompileResultV3 | OnaCompileResultV3;
};

export type OpenEnaWindowsSourcePreviewV3 =
  | { readonly availability: "unavailable"; readonly context?: ModelScientificContextV3 }
  | {
      readonly availability: "available";
      readonly context: ModelScientificContextV3;
      readonly rowCount: number;
    };

export interface OpenEnaWindowsPanelV3Copy {
  readonly model: string;
  readonly models: Readonly<Record<StandardModelTypeV3, string>>;
  readonly window: string;
  readonly movingStanza: string;
  readonly conversation: string;
  readonly conversationExplanation: string;
  readonly backward: string;
  readonly forward: string;
  readonly finite: string;
  readonly entireHorizon: string;
  readonly finiteValue: string;
  readonly backwardCurrentOnly: string;
  readonly backwardFinite: (preceding: number) => string;
  readonly backwardInfinite: string;
  readonly forwardNone: string;
  readonly forwardFinite: (following: number) => string;
  readonly forwardInfinite: string;
  readonly extentErrors: Readonly<Record<WindowExtentParseErrorV3, string>>;
  readonly rowOrder: string;
  readonly weighting: string;
  readonly binary: string;
  readonly binaryHelp: string;
  readonly frequency: string;
  readonly frequencyHelp: string;
  readonly rotation: string;
  readonly svd: string;
  readonly means: string;
  readonly reference: string;
  readonly centerAlign: string;
  readonly meansInUnits: string;
  readonly goToMeans: string;
  readonly meansTrajectoryInvalid: string;
  readonly chooseSvd: string;
  readonly chooseReference: string;
  readonly returnToEndpoint: string;
  readonly referenceSelection: string;
  readonly noReference: string;
  readonly unavailableReference: (name: string) => string;
  readonly referenceRequired: string;
  readonly referencePreviewUnavailable: string;
  readonly referenceIncompatible: string;
  readonly referenceCompatible: string;
  readonly referenceFacts: string;
  readonly referenceName: string;
  readonly referenceHash: string;
  readonly sourceFit: string;
  readonly sourceFitMethods: Readonly<Record<"svd" | "means", string>>;
  readonly sourcePopulation: string;
  readonly sourcePopulations: Readonly<Record<"endpoint-units", string>>;
  readonly sourceObservations: string;
  readonly basis: string;
  readonly basisSummary: (codes: number, edges: number, axes: number) => string;
  readonly fixedCentering: string;
  readonly centeredAtOrigin: string;
  readonly centeredAtSourceMean: string;
  readonly targetProjection: string;
  readonly targetProjectionPending: string;
  readonly targetProjectionSummary: (rank: number, variance: string) => string;
  readonly compatibilityReasons: string;
  readonly referenceCompatibilityReason: (reason: OpenEnaReferenceCompatibilityReasonV3) => string;
  readonly resources: string;
  readonly resourcesUnavailable: string;
  readonly resourcesInvalidRaw: string;
  readonly resourcesInvalidDraft: string;
  readonly resourceStatus: string;
  readonly resourceRows: (value: number) => string;
  readonly resourceDimensions: (value: number) => string;
  readonly resourceVisits: (value: number) => string;
  readonly resourcePeak: (value: number) => string;
  readonly resourceRotation: (value: number) => string;
  readonly resourceNoTruncation: string;
  readonly onaContract: string;
  readonly onaForwardFixed: string;
  readonly onaWeightingFixed: string;
  readonly onaModelFixed: string;
  readonly onaRotationFixed: string;
}

export interface OpenEnaWindowsPanelV3Props {
  readonly copy: OpenEnaWindowsPanelV3Copy;
  readonly orderCopy: OpenEnaOrderPolicyEditorV3Copy;
  readonly state: ModelStateV3;
  readonly fields: OpenEnaModelPanelFieldsV3;
  /** Dataset fields eligible for an explicit within-Horizon row comparator. */
  readonly columnOptions: readonly string[];
  readonly rawState: OpenEnaWindowsPanelRawStateV3;
  readonly onRawStateChange: (value: OpenEnaWindowsPanelRawStateV3) => void;
  /** Family-bound complete Windows-field snapshot. The owner combines it with other active editors. */
  readonly onBlockersChange: (
    family: AnalysisFamilyV3,
    value: OpenEnaWindowFieldBlockersV3,
  ) => void;
  readonly onNavigateToMeansContrast: () => void;
  readonly sourcePreview: OpenEnaWindowsSourcePreviewV3;
  readonly preflight: OpenEnaWindowsPreflightV3 | null;
  readonly referenceOptions: readonly OpenEnaReferenceOptionV3[];
  readonly referencePreview: OpenEnaReferenceSelectionPreviewV3;
  readonly dispatch: (action: ModelStateActionV3) => void;
  readonly now?: () => Date;
}

function extentToRaw(extent: BackwardExtentV3 | ForwardExtentV3): WindowExtentRawStateV3 {
  return extent.kind === "infinity"
    ? { mode: "infinity", finiteText: "" }
    : { mode: "finite", finiteText: String(extent.value) };
}

/** Create once in the durable editor owner; imports/reset explicitly replace it. */
export function createWindowsPanelRawStateV3(
  drafts: ModelWorkspaceDraftsV3,
): OpenEnaWindowsPanelRawStateV3 {
  return {
    standard: {
      backward: extentToRaw(drafts.standard.movingStanza.backward),
      forward: extentToRaw(drafts.standard.movingStanza.forward),
      rowOrder: createOrderPolicyEditorRawStateV3(drafts.standard.movingStanza.rowOrder),
    },
    ona: {
      backward: extentToRaw(drafts.ona.backward),
      rowOrder: createOrderPolicyEditorRawStateV3(drafts.ona.rowOrder),
    },
  };
}

function sameContext(
  left: ModelScientificContextV3,
  right: ModelScientificContextV3,
): boolean {
  return left.datasetSha256 === right.datasetSha256
    && left.family === right.family
    && left.scientificRevision === right.scientificRevision
    && left.draftFingerprint === right.draftFingerprint
    && left.executionEpoch === right.executionEpoch;
}

function finiteRawResult(
  raw: WindowExtentRawStateV3,
  direction: WindowExtentDirectionV3,
): WindowExtentParseResultV3 {
  if (raw.mode === "infinity") {
    return { status: "valid", extent: { kind: "infinity" } };
  }
  const parsed = parseWindowExtentInputV3(raw.finiteText, direction);
  return parsed.status === "valid" && parsed.extent.kind === "finite"
    ? parsed
    : parsed.status === "invalid"
      ? parsed
      : { status: "invalid", reason: "integer" };
}

function rowOrderIsBlocked(
  raw: OrderPolicyEditorRawStateV3,
  value: ModelStateV3["drafts"]["standard"]["movingStanza"]["rowOrder"],
  horizonColumns: readonly string[],
  context: SourceOrderConfirmationContextV3 | null,
): boolean {
  if (raw.mode === "columns") {
    return orderPolicyFromRawStateV3(raw, horizonColumns) === null;
  }
  return context === null
    || value?.kind !== "source-order-confirmed"
    || !confirmationMatchesContextV3(value.confirmation, context);
}

function sourceConfirmationContext(
  state: ModelStateV3,
  sourcePreview: OpenEnaWindowsSourcePreviewV3,
  horizonColumns: readonly string[],
): SourceOrderConfirmationContextV3 | null {
  const scientificContext = modelScientificContextV3(state);
  return sourcePreview.availability === "available"
    && sourcePreview.context !== undefined
    && sourcePreview.rowCount !== undefined
    && Number.isSafeInteger(sourcePreview.rowCount)
    && sourcePreview.rowCount >= 0
    && sameContext(sourcePreview.context, scientificContext)
    ? {
        scientificContext,
        rowCount: sourcePreview.rowCount,
        relevantColumns: [...horizonColumns],
      }
    : null;
}

export function windowFieldBlockersV3(
  state: ModelStateV3,
  rawState: OpenEnaWindowsPanelRawStateV3,
  sourcePreview: OpenEnaWindowsSourcePreviewV3,
  columnOptions: readonly string[],
): OpenEnaWindowFieldBlockersV3 {
  const family = state.drafts.activeFamily;
  if (family === "standard") {
    const draft = state.drafts.standard;
    if (draft.windowType === "Conversation") {
      return { backward: false, forward: false, rowOrder: false };
    }
    const context = sourceConfirmationContext(state, sourcePreview, draft.horizonColumns);
    return {
      backward: finiteRawResult(rawState.standard.backward, "backward").status === "invalid",
      forward: finiteRawResult(rawState.standard.forward, "forward").status === "invalid",
      rowOrder: rowOrderIsBlocked(
        rawState.standard.rowOrder,
        draft.movingStanza.rowOrder,
        columnOptions,
        context,
      ),
    };
  }
  const draft = state.drafts.ona;
  const context = sourceConfirmationContext(state, sourcePreview, draft.horizonColumns);
  return {
    backward: finiteRawResult(rawState.ona.backward, "backward").status === "invalid",
    forward: false,
    rowOrder: rowOrderIsBlocked(
      rawState.ona.rowOrder,
      draft.rowOrder,
      columnOptions,
      context,
    ),
  };
}

function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function optionKey(option: Pick<OpenEnaReferenceOptionV3, "referenceId" | "contentSha256">): string {
  return `${option.referenceId}\u001f${option.contentSha256}`;
}

const UNAVAILABLE_REFERENCE_VALUE = "__open_ena_current_reference__";

interface ExtentControlProps {
  readonly label: string;
  readonly fieldId: string;
  readonly direction: WindowExtentDirectionV3;
  readonly raw: WindowExtentRawStateV3;
  readonly copy: OpenEnaWindowsPanelV3Copy;
  readonly onChange: (raw: WindowExtentRawStateV3, extent: BackwardExtentV3 | ForwardExtentV3 | null) => void;
}

function ExtentControlV3({
  label,
  fieldId,
  direction,
  raw,
  copy,
  onChange,
}: ExtentControlProps) {
  const radioName = useId();
  const errorId = `${fieldId}-error`;
  const interpretationId = `${fieldId}-interpretation`;
  const parsed = finiteRawResult(raw, direction);
  const error = parsed.status === "invalid" ? copy.extentErrors[parsed.reason] : null;
  let interpretation: string | null = null;
  if (parsed.status === "valid") {
    if (parsed.extent.kind === "infinity") {
      interpretation = direction === "backward" ? copy.backwardInfinite : copy.forwardInfinite;
    } else if (direction === "backward") {
      interpretation = parsed.extent.value === 1
        ? copy.backwardCurrentOnly
        : copy.backwardFinite(parsed.extent.value - 1);
    } else {
      interpretation = parsed.extent.value === 0
        ? copy.forwardNone
        : copy.forwardFinite(parsed.extent.value);
    }
  }

  function selectMode(mode: WindowExtentRawStateV3["mode"]): void {
    const next = { ...raw, mode };
    const result = finiteRawResult(next, direction);
    onChange(next, result.status === "valid" ? result.extent : null);
  }

  function replaceText(finiteText: string): void {
    const next = { ...raw, finiteText };
    const result = finiteRawResult(next, direction);
    onChange(next, result.status === "valid" ? result.extent : null);
  }

  return (
    <fieldset
      id={fieldId}
      className="ena-model-windows-v3-extent"
      aria-describedby={error !== null ? errorId : interpretation !== null ? interpretationId : undefined}
    >
      <legend>{label}</legend>
      <label>
        <input
          type="radio"
          name={radioName}
          checked={raw.mode === "finite"}
          onChange={() => selectMode("finite")}
        />
        {copy.finite}
      </label>
      <label>
        <input
          type="radio"
          name={radioName}
          checked={raw.mode === "infinity"}
          onChange={() => selectMode("infinity")}
        />
        {copy.entireHorizon}
      </label>
      {raw.mode === "finite" ? (
        <label>
          <span>{copy.finiteValue}</span>
          <input
            value={raw.finiteText}
            inputMode="numeric"
            pattern="[0-9]*"
            aria-invalid={error !== null}
            aria-describedby={error !== null ? errorId : interpretation !== null ? interpretationId : undefined}
            onChange={(event) => replaceText(event.target.value)}
          />
        </label>
      ) : null}
      {error !== null ? <p id={errorId} role="alert">{error}</p> : null}
      {interpretation !== null ? <p id={interpretationId}>{interpretation}</p> : null}
    </fieldset>
  );
}

function ReferencePreviewV3({
  copy,
  preview,
  compatibilityId,
}: {
  readonly copy: OpenEnaWindowsPanelV3Copy;
  readonly preview: Extract<OpenEnaReferenceSelectionPreviewV3, { availability: "available" }>;
  readonly compatibilityId: string;
}) {
  const compatibility = preview.compatibility.status === "compatible"
    ? copy.referenceCompatible
    : copy.referenceIncompatible;
  return (
    <section aria-label={copy.referenceFacts} className="ena-model-windows-v3-reference-facts">
      <dl>
        <div><dt>{copy.referenceName}</dt><dd>{preview.displayName}</dd></div>
        <div><dt>{copy.referenceHash}</dt><dd>{shortHash(preview.contentSha256)}</dd></div>
        <div><dt>{copy.sourceFit}</dt><dd>{copy.sourceFitMethods[preview.sourceFit.method]}</dd></div>
        <div><dt>{copy.sourcePopulation}</dt><dd>{copy.sourcePopulations[preview.sourceFit.population]}</dd></div>
        <div><dt>{copy.sourceObservations}</dt><dd>{preview.sourceFit.observationCount}</dd></div>
        <div><dt>{copy.basis}</dt><dd>{copy.basisSummary(
          preview.basis.codeCount,
          preview.basis.edgeCount,
          preview.basis.rotationColumns.length,
        )}</dd></div>
        <div><dt>{copy.fixedCentering}</dt><dd>{preview.fixedCentering.centerAlignToOrigin
          ? copy.centeredAtOrigin
          : copy.centeredAtSourceMean}</dd></div>
        <div><dt>{copy.targetProjection}</dt><dd>{preview.targetProjection.status === "available"
          ? copy.targetProjectionSummary(
              preview.targetProjection.rank,
              preview.targetProjection.variance.join(", "),
            )
          : copy.targetProjectionPending}</dd></div>
      </dl>
      <p id={compatibilityId} role={preview.compatibility.status === "incompatible" ? "alert" : "status"}>{compatibility}</p>
      {preview.compatibility.reasons.length > 0 ? (
        <section aria-label={copy.compatibilityReasons}>
          <ul>{preview.compatibility.reasons.map((reason, index) => (
            <li key={`${index}:${reason}`}>{copy.referenceCompatibilityReason(reason)}</li>
          ))}</ul>
        </section>
      ) : null}
    </section>
  );
}

export function OpenEnaWindowsPanelV3({
  copy,
  orderCopy,
  state,
  fields,
  columnOptions,
  rawState,
  onRawStateChange,
  onBlockersChange,
  onNavigateToMeansContrast,
  sourcePreview,
  preflight,
  referenceOptions,
  referencePreview,
  dispatch,
  now,
}: OpenEnaWindowsPanelV3Props) {
  const family = state.drafts.activeFamily;
  const scientificContext = modelScientificContextV3(state);
  const blockers = windowFieldBlockersV3(state, rawState, sourcePreview, columnOptions);
  const blockersCallback = useRef(onBlockersChange);
  blockersCallback.current = onBlockersChange;
  useEffect(() => {
    blockersCallback.current(family, { ...blockers });
  }, [family, blockers.backward, blockers.forward, blockers.rowOrder]);

  const reportOrderBlocker = useCallback((rowOrder: boolean) => {
    blockersCallback.current(family, { ...blockers, rowOrder });
  }, [family, blockers.backward, blockers.forward, blockers.rowOrder]);

  function replaceStandardDraft(patch: Partial<ModelStateV3["drafts"]["standard"]>): void {
    dispatch({
      type: "replace-standard-draft",
      draft: { ...state.drafts.standard, ...patch },
    });
  }

  function replaceOnaDraft(patch: Partial<ModelStateV3["drafts"]["ona"]>): void {
    dispatch({
      type: "replace-ona-draft",
      draft: { ...state.drafts.ona, ...patch },
    });
  }

  function replaceRawStandard(
    patch: Partial<OpenEnaWindowsPanelRawStateV3["standard"]>,
  ): void {
    onRawStateChange({
      ...rawState,
      standard: { ...rawState.standard, ...patch },
    });
  }

  function replaceRawOna(
    patch: Partial<OpenEnaWindowsPanelRawStateV3["ona"]>,
  ): void {
    onRawStateChange({
      ...rawState,
      ona: { ...rawState.ona, ...patch },
    });
  }

  function updateStandardExtent(
    direction: WindowExtentDirectionV3,
    raw: WindowExtentRawStateV3,
    extent: BackwardExtentV3 | ForwardExtentV3 | null,
  ): void {
    replaceRawStandard({ [direction]: raw });
    if (extent === null) return;
    replaceStandardDraft({
      movingStanza: {
        ...state.drafts.standard.movingStanza,
        [direction]: extent,
      },
    });
  }

  function selectRotation(type: StandardRotationTypeV3): void {
    const rotation = state.drafts.standard.rotation;
    const centerAlignToOrigin = rotation.type === "reference"
      ? true
      : rotation.centerAlignToOrigin;
    if (type === "svd") {
      replaceStandardDraft({ rotation: { type, centerAlignToOrigin } });
    } else if (type === "means") {
      replaceStandardDraft({
        rotation: {
          type,
          centerAlignToOrigin,
          negativeLevel: rotation.type === "means" ? rotation.negativeLevel : null,
          positiveLevel: rotation.type === "means" ? rotation.positiveLevel : null,
        },
      });
    } else {
      replaceStandardDraft({
        rotation: {
          type,
          referenceId: rotation.type === "reference" ? rotation.referenceId : null,
          expectedContentSha256: rotation.type === "reference"
            ? rotation.expectedContentSha256
            : null,
        },
      });
    }
  }

  const rawInvalid = blockers.backward || blockers.forward || blockers.rowOrder;
  let resources: "invalid-raw" | "invalid-draft" | "unavailable" | Exclude<OpenEnaWindowsPreflightV3["result"], { status: "invalid" }> = "unavailable";
  if (rawInvalid) {
    resources = "invalid-raw";
  } else if (preflight !== null && sameContext(preflight.context, scientificContext)) {
    if (preflight.result.status === "invalid") {
      resources = "invalid-draft";
    } else if (
      isCompilerOwnedReadyResultV3(preflight.result)
      && preflight.result.canonicalConfiguration.analysisFamily === family
    ) {
      resources = preflight.result;
    }
  }

  function renderResources() {
    let body;
    if (resources === "invalid-raw") body = <p>{copy.resourcesInvalidRaw}</p>;
    else if (resources === "invalid-draft") body = <p>{copy.resourcesInvalidDraft}</p>;
    else if (resources === "unavailable") body = <p>{copy.resourcesUnavailable}</p>;
    else {
      const estimate = resources.resourceEstimate;
      body = (
        <>
          <p role="status">{copy.resourceStatus}</p>
          <ul>
            <li>{copy.resourceRows(estimate.rows)}</li>
            <li>{copy.resourceDimensions(estimate.adjacencyDimensions)}</li>
            <li>{copy.resourceVisits(estimate.estimatedWindowVisits)}</li>
            <li>{copy.resourcePeak(estimate.estimatedPeakBytes)}</li>
            <li>{copy.resourceRotation(estimate.estimatedRotationWorkUnits)}</li>
          </ul>
        </>
      );
    }
    return (
      <details className="ena-panel-details"><summary>{copy.resources}</summary><section
        id={fields.id("resources")}
        tabIndex={-1}
        aria-label={copy.resources}
        className="ena-model-windows-v3-resources"
      >
        {body}
        <p>{copy.resourceNoTruncation}</p>
      </section></details>
    );
  }

  if (family === "ona") {
    const draft = state.drafts.ona;
    const confirmationContext = sourceConfirmationContext(state, sourcePreview, draft.horizonColumns);
    return (
      <section
        id={fields.id("window")}
        tabIndex={-1}
        className="ena-model-windows-v3"
        data-testid="open-ena-model-v3-windows-panel"
      >
        <h3>{copy.onaContract}</h3>
        <ExtentControlV3
          label={copy.backward}
          fieldId={fields.id("backward")}
          direction="backward"
          raw={rawState.ona.backward}
          copy={copy}
          onChange={(raw, extent) => {
            replaceRawOna({ backward: raw });
            if (extent !== null) replaceOnaDraft({ backward: extent });
          }}
        />
        <OpenEnaOrderPolicyEditorV3
          label={copy.rowOrder}
          fieldId={fields.id("rowOrder")}
          copy={orderCopy}
          value={draft.rowOrder}
          rawState={rawState.ona.rowOrder}
          columnOptions={columnOptions}
          confirmationContext={confirmationContext}
          onChange={(rowOrder) => replaceOnaDraft({ rowOrder })}
          onRawStateChange={(rowOrder) => replaceRawOna({ rowOrder })}
          onBlockedChange={reportOrderBlocker}
          now={now}
        />
        <ul className="ena-model-windows-v3-fixed-contract">
          <li id={fields.id("window.forward")} tabIndex={-1}>{copy.onaForwardFixed}</li>
          <li id={fields.id("weighting")} tabIndex={-1}>{copy.onaWeightingFixed}</li>
          <li id={fields.id("model")} tabIndex={-1}>{copy.onaModelFixed}</li>
          <li id={fields.id("rotation")} tabIndex={-1}>{copy.onaRotationFixed}</li>
        </ul>
        {renderResources()}
      </section>
    );
  }

  const draft = state.drafts.standard;
  const movingActive = draft.windowType === "MovingStanzaWindow";
  const confirmationContext = sourceConfirmationContext(state, sourcePreview, draft.horizonColumns);
  const meansConflict = draft.model !== "EndPoint" && draft.rotation.type === "means";
  const selectedReference = draft.rotation.type === "reference" ? draft.rotation : null;
  const selectedOption = selectedReference === null ? null : referenceOptions.find((option) => (
    option.referenceId === selectedReference.referenceId
    && option.contentSha256 === selectedReference.expectedContentSha256
  )) ?? null;
  const referenceValue = selectedOption !== null
    ? optionKey(selectedOption)
    : selectedReference?.referenceId !== null
      ? UNAVAILABLE_REFERENCE_VALUE
      : "";
  const currentReferencePreview = selectedReference !== null
    && referencePreview.availability === "available"
    && sameContext(referencePreview.context, scientificContext)
    && referencePreview.referenceId === selectedReference.referenceId
    && referencePreview.contentSha256 === selectedReference.expectedContentSha256
    ? referencePreview
    : null;
  const referenceInvalid = selectedReference !== null && (
    selectedReference.referenceId === null
    || selectedReference.expectedContentSha256 === null
    || currentReferencePreview === null
    || currentReferencePreview.compatibility.status === "incompatible"
  );
  const referenceErrorId = fields.id("reference.error");
  const rotationConflictId = fields.id("rotation.conflict");

  return (
    <section className="ena-model-windows-v3 ena-official-model-panel" data-ena-official-panel="windows" data-testid="open-ena-model-v3-windows-panel">
      <label>
        <span>{copy.model}</span>
        <select
          id={fields.id("model")}
          value={draft.model}
          onChange={(event) => replaceStandardDraft({ model: event.target.value as StandardModelTypeV3 })}
        >
          {(Object.keys(copy.models) as StandardModelTypeV3[]).map((model) => (
            <option key={model} value={model}>{copy.models[model]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{copy.window}</span>
        <select
          id={fields.id("window")}
          value={draft.windowType}
          onChange={(event) => replaceStandardDraft({ windowType: event.target.value as StandardWindowTypeV3 })}
        >
          <option value="MovingStanzaWindow">{copy.movingStanza}</option>
          <option value="Conversation">{copy.conversation}</option>
        </select>
      </label>

      {movingActive ? (
        <section className="ena-model-windows-v3-moving">
          <ExtentControlV3
            label={copy.backward}
            fieldId={fields.id("movingStanza.backward")}
            direction="backward"
            raw={rawState.standard.backward}
            copy={copy}
            onChange={(raw, extent) => updateStandardExtent("backward", raw, extent)}
          />
          <ExtentControlV3
            label={copy.forward}
            fieldId={fields.id("movingStanza.forward")}
            direction="forward"
            raw={rawState.standard.forward}
            copy={copy}
            onChange={(raw, extent) => updateStandardExtent("forward", raw, extent)}
          />
          <details className="ena-panel-details ena-row-order-disclosure" open={draft.movingStanza.rowOrder === null}>
          <summary>{copy.rowOrder}</summary>
          <OpenEnaOrderPolicyEditorV3
            label={copy.rowOrder}
            fieldId={fields.id("movingStanza.rowOrder")}
            copy={orderCopy}
            value={draft.movingStanza.rowOrder}
            rawState={rawState.standard.rowOrder}
            columnOptions={columnOptions}
            confirmationContext={confirmationContext}
            onChange={(rowOrder) => replaceStandardDraft({
              movingStanza: { ...draft.movingStanza, rowOrder },
            })}
            onRawStateChange={(rowOrder) => replaceRawStandard({ rowOrder })}
            onBlockedChange={reportOrderBlocker}
            now={now}
          />
          </details>
        </section>
      ) : <p>{copy.conversationExplanation}</p>}

      <fieldset id={fields.id("weighting")} className="ena-restored-weighting">
        <legend>{copy.weighting}</legend>
        <label>
          <input
            type="radio"
            name={`${fields.id("weighting")}-choice`}
            value="binary"
            checked={draft.weighting === "binary"}
            onChange={() => replaceStandardDraft({ weighting: "binary" })}
          />
          {copy.binary}
        </label>
        <label>
          <input
            type="radio"
            name={`${fields.id("weighting")}-choice`}
            value="frequency"
            checked={draft.weighting === "frequency"}
            onChange={() => replaceStandardDraft({ weighting: "frequency" })}
          />
          {copy.frequency}
        </label>
        <details className="ena-weighting-help"><summary aria-label={`${copy.weighting}: ${copy.binary} / ${copy.frequency}`} title={copy.weighting}>?</summary>
          <div><p>{copy.binaryHelp}</p><p>{copy.frequencyHelp}</p></div>
        </details>
      </fieldset>

      <section className="ena-model-windows-v3-rotation">
        <label>
          <span>{copy.rotation}</span>
          <select
            id={fields.id("rotation")}
            value={draft.rotation.type}
            aria-invalid={meansConflict}
            aria-describedby={meansConflict ? rotationConflictId : undefined}
            onChange={(event) => selectRotation(event.target.value as StandardRotationTypeV3)}
          >
            <option value="svd">{copy.svd}</option>
            <option value="means">{copy.means}</option>
            <option value="reference">{copy.reference}</option>
          </select>
        </label>
        {draft.rotation.type !== "reference" ? (
          <label>
            <input
              id={fields.id("rotation.centerAlignToOrigin")}
              type="checkbox"
              checked={draft.rotation.centerAlignToOrigin}
              onChange={(event) => {
                const rotation = state.drafts.standard.rotation;
                if (rotation.type === "reference") return;
                replaceStandardDraft({
                  rotation: { ...rotation, centerAlignToOrigin: event.target.checked },
                });
              }}
            />
            {copy.centerAlign}
          </label>
        ) : null}
        {draft.rotation.type === "means" ? (
          <section>
            <p>{copy.meansInUnits}</p>
            <button type="button" onClick={onNavigateToMeansContrast}>{copy.goToMeans}</button>
          </section>
        ) : null}
        {meansConflict ? (
          <section role="alert" id={rotationConflictId} tabIndex={-1}>
            <p>{copy.meansTrajectoryInvalid}</p>
            <button type="button" onClick={() => selectRotation("svd")}>{copy.chooseSvd}</button>
            <button type="button" onClick={() => selectRotation("reference")}>{copy.chooseReference}</button>
            <button type="button" onClick={() => replaceStandardDraft({ model: "EndPoint" })}>{copy.returnToEndpoint}</button>
          </section>
        ) : null}
        {selectedReference !== null ? (
          <section className="ena-model-windows-v3-reference">
            <label>
              <span>{copy.referenceSelection}</span>
              <select
                id={fields.id("reference")}
                value={referenceValue}
                aria-invalid={referenceInvalid}
                aria-describedby={referenceInvalid ? referenceErrorId : undefined}
                onChange={(event) => {
                  const option = referenceOptions.find((candidate) => optionKey(candidate) === event.target.value);
                  replaceStandardDraft({
                    rotation: {
                      type: "reference",
                      referenceId: option?.referenceId ?? null,
                      expectedContentSha256: option?.contentSha256 ?? null,
                    },
                  });
                }}
              >
                <option value="">{copy.noReference}</option>
                {selectedReference.referenceId !== null && selectedOption === null ? (
                  <option value={UNAVAILABLE_REFERENCE_VALUE} disabled>{copy.unavailableReference(selectedReference.referenceId)}</option>
                ) : null}
                {referenceOptions.map((option) => (
                  <option key={optionKey(option)} value={optionKey(option)}>{option.displayName}</option>
                ))}
              </select>
            </label>
            {selectedReference.referenceId === null || selectedReference.expectedContentSha256 === null
              ? <p id={referenceErrorId} role="alert">{copy.referenceRequired}</p>
              : currentReferencePreview === null
                ? <p id={referenceErrorId} role="alert">{copy.referencePreviewUnavailable}</p>
                : <ReferencePreviewV3
                    copy={copy}
                    preview={currentReferencePreview}
                    compatibilityId={referenceErrorId}
                  />}
            {currentReferencePreview?.compatibility.status === "incompatible" ? (
              <button type="button" onClick={() => selectRotation("svd")}>{copy.chooseSvd}</button>
            ) : null}
          </section>
        ) : null}
      </section>
      {renderResources()}
    </section>
  );
}

export default OpenEnaWindowsPanelV3;
