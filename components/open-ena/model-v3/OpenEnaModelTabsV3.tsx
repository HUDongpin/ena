"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ModelSuggestedActionV3 } from "../../../lib/open-ena/model-v3/diagnostics";
import type {
  AnalysisFamilyV3,
  StandardModelTypeV3,
  StandardRotationTypeV3,
  StandardWindowTypeV3,
} from "../../../lib/open-ena/model-v3/types";
import {
  OpenEnaModelDiagnosticsV3,
  modelDiagnosticTabV3,
  modelFieldIdV3,
  type ModelDiagnosticFieldTargetV3,
  type ModelUiDiagnosticV3,
  type OpenEnaModelDiagnosticsV3Copy,
  type OpenEnaModelTabV3,
} from "./OpenEnaModelDiagnosticsV3";
import type {
  ModelScientificContextV3,
  ModelStateV3,
} from "./model-state";

export const OPEN_ENA_MODEL_TABS_V3 = Object.freeze([
  "units",
  "horizons",
  "windows",
  "codes",
] as const);

export interface OpenEnaModelTabsV3Copy {
  readonly tabListLabel: string;
  readonly tabs: Readonly<Record<OpenEnaModelTabV3, string>>;
  readonly tabDiagnosticLabel: (input: {
    readonly tab: OpenEnaModelTabV3;
    readonly label: string;
    readonly errors: number;
    readonly warnings: number;
  }) => string;
  readonly help: Readonly<Record<OpenEnaModelTabV3, {
    readonly buttonLabel: string;
    readonly heading: string;
    readonly description: string;
  }>>;
  readonly status: {
    readonly label: string;
    readonly configuration: Readonly<Record<"incomplete" | "ready", string>>;
    readonly result: Readonly<Record<
      "none" | "running" | "current" | "stale" | "error" | "obsolete" | "cancelled",
      string
    >>;
    readonly summary: (input: { readonly configuration: string; readonly result: string }) => string;
  };
  readonly scientificSummary: {
    readonly label: string;
    readonly fieldLabels: Readonly<Record<
      "family" | "model" | "window" | "weighting" | "rotation"
        | "units" | "horizons" | "groups" | "codes",
      string
    >>;
    readonly family: Readonly<Record<AnalysisFamilyV3, string>>;
    readonly model: Readonly<Record<StandardModelTypeV3, string>>;
    readonly window: Readonly<Record<StandardWindowTypeV3, string>>;
    readonly weighting: Readonly<Record<"binary" | "frequency" | "frequency-sum", string>>;
    readonly rotation: Readonly<Record<StandardRotationTypeV3, string>>;
    readonly count: (value: number) => string;
    readonly unavailable: string;
  };
  readonly diagnostics: OpenEnaModelDiagnosticsV3Copy;
}

export type OpenEnaModelSummaryCountV3 =
  | { readonly availability: "available"; readonly value: number }
  | { readonly availability: "unavailable" };

export type OpenEnaModelSummaryConfigurationV3 =
  | {
      readonly family: "standard";
      readonly model: StandardModelTypeV3;
      readonly window: StandardWindowTypeV3;
      readonly weighting: "binary" | "frequency";
      /** Preserve selected draft combinations, including invalid trajectory Means. */
      readonly rotation: StandardRotationTypeV3;
    }
  | {
      readonly family: "ona";
      readonly model: "EndPoint";
      readonly window: "MovingStanzaWindow";
      readonly weighting: "frequency-sum";
      readonly rotation: "svd";
    };

export interface OpenEnaModelScientificSummaryV3 {
  /** Prevents a summary retained from a prior dataset/draft/run epoch being relabeled current. */
  readonly context: ModelScientificContextV3;
  readonly configuration: OpenEnaModelSummaryConfigurationV3;
  readonly counts: Readonly<Record<
    "units" | "horizons" | "groups" | "codes",
    OpenEnaModelSummaryCountV3
  >>;
}

export interface OpenEnaModelPanelFieldsV3 {
  readonly id: (fieldPath: string) => string;
}

export interface OpenEnaModelTabsV3Props {
  readonly copy: OpenEnaModelTabsV3Copy;
  readonly diagnostics: readonly ModelUiDiagnosticV3[];
  readonly scientificContext: ModelScientificContextV3;
  readonly scientificSummary: OpenEnaModelScientificSummaryV3;
  readonly status: Readonly<Pick<ModelStateV3, "runStatus" | "resultStatus">> & {
    /** Supplied only after the compiler/controller has completed strict admission. */
    readonly configurationReadiness: "incomplete" | "ready";
    readonly editorBlocked: boolean;
  };
  readonly initialTab?: OpenEnaModelTabV3;
  readonly renderPanel: (
    tab: OpenEnaModelTabV3,
    fields: OpenEnaModelPanelFieldsV3,
  ) => ReactNode;
  readonly onTabChange?: (tab: OpenEnaModelTabV3) => void;
  readonly onSuggestedAction: (
    action: ModelSuggestedActionV3,
    context: ModelScientificContextV3,
  ) => void;
}

function tabIdV3(tab: OpenEnaModelTabV3): string {
  return `ena-model-tab-${tab}`;
}

function panelIdV3(tab: OpenEnaModelTabV3): string {
  return `ena-model-panel-${tab}`;
}

function resultViewV3(
  status: OpenEnaModelTabsV3Props["status"],
  configurationIncomplete: boolean,
): keyof OpenEnaModelTabsV3Copy["status"]["result"] {
  if (status.runStatus === "running") return "running";
  if (status.runStatus === "error") return "error";
  if (status.runStatus === "obsolete") return "obsolete";
  if (status.runStatus === "cancelled") return "cancelled";
  if (status.resultStatus === "current" && !configurationIncomplete) return "current";
  if (status.resultStatus === "stale" || status.resultStatus === "current") return "stale";
  return "none";
}

interface FocusRequestV3 extends ModelDiagnosticFieldTargetV3 {
  readonly sequence: number;
}

export function OpenEnaModelTabsV3({
  copy,
  diagnostics,
  scientificContext,
  scientificSummary,
  status,
  initialTab = "units",
  renderPanel,
  onTabChange,
  onSuggestedAction,
}: OpenEnaModelTabsV3Props) {
  const [activeTab, setActiveTab] = useState<OpenEnaModelTabV3>(initialTab);
  const [helpTab, setHelpTab] = useState<OpenEnaModelTabV3 | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequestV3 | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const helpDialogRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<OpenEnaModelTabV3, HTMLButtonElement>>>({});
  const sequenceRef = useRef(0);

  const counts = Object.fromEntries(OPEN_ENA_MODEL_TABS_V3.map((tab) => [
    tab,
    { errors: 0, warnings: 0 },
  ])) as Record<OpenEnaModelTabV3, { errors: number; warnings: number }>;
  for (const diagnostic of diagnostics) {
    const tab = modelDiagnosticTabV3(scientificContext.family, diagnostic);
    if (tab === null) continue;
    if (diagnostic.severity === "error") counts[tab].errors += 1;
    if (diagnostic.severity === "warning") counts[tab].warnings += 1;
  }

  const configurationIncomplete = status.configurationReadiness !== "ready"
    || status.editorBlocked
    || diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const configurationView = configurationIncomplete ? "incomplete" : "ready";
  const resultView = resultViewV3(status, configurationIncomplete);
  const statusText = copy.status.summary({
    configuration: copy.status.configuration[configurationView],
    result: copy.status.result[resultView],
  });
  const summaryMatchesContext = scientificSummary.context.datasetSha256 === scientificContext.datasetSha256
    && scientificSummary.context.family === scientificContext.family
    && scientificSummary.context.scientificRevision === scientificContext.scientificRevision
    && scientificSummary.context.draftFingerprint === scientificContext.draftFingerprint
    && scientificSummary.context.executionEpoch === scientificContext.executionEpoch
    && scientificSummary.configuration.family === scientificContext.family;
  const summaryConfiguration = summaryMatchesContext
    ? scientificSummary.configuration
    : null;
  const summaryCounts = summaryMatchesContext
    ? scientificSummary.counts
    : null;

  function summaryCount(key: keyof OpenEnaModelScientificSummaryV3["counts"]): string {
    const count = summaryCounts?.[key];
    return count?.availability === "available"
      ? copy.scientificSummary.count(count.value)
      : copy.scientificSummary.unavailable;
  }

  function selectTab(tab: OpenEnaModelTabV3): void {
    setFocusRequest(null);
    setHelpTab(null);
    setActiveTab(tab);
    onTabChange?.(tab);
  }

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: OpenEnaModelTabV3,
  ): void {
    const currentIndex = OPEN_ENA_MODEL_TABS_V3.indexOf(currentTab);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % OPEN_ENA_MODEL_TABS_V3.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + OPEN_ENA_MODEL_TABS_V3.length)
          % OPEN_ENA_MODEL_TABS_V3.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = OPEN_ENA_MODEL_TABS_V3.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = OPEN_ENA_MODEL_TABS_V3[nextIndex];
    selectTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  function closeHelp(): void {
    setHelpTab(null);
    requestAnimationFrame(() => helpButtonRef.current?.focus());
  }

  function navigateField(target: ModelDiagnosticFieldTargetV3): void {
    sequenceRef.current += 1;
    selectTab(target.tab);
    setFocusRequest({ ...target, sequence: sequenceRef.current });
  }

  useEffect(() => {
    if (helpTab !== null) helpDialogRef.current?.focus();
  }, [helpTab]);

  useEffect(() => {
    if (focusRequest === null || focusRequest.tab !== activeTab) return;
    const request = focusRequest;
    const frame = requestAnimationFrame(() => {
      document.getElementById(request.fieldId)?.focus();
      setFocusRequest((current) => (
        current?.sequence === request.sequence ? null : current
      ));
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, focusRequest]);

  const activeHelp = copy.help[activeTab];
  return (
    <div className="ena-model-v3-shell">
      <div className="ena-model-tab-and-help">
        <div className="ena-model-tabs" role="tablist" aria-label={copy.tabListLabel}>
          {OPEN_ENA_MODEL_TABS_V3.map((tab) => (
            <button
              key={tab}
              ref={(element) => {
                if (element === null) delete tabRefs.current[tab];
                else tabRefs.current[tab] = element;
              }}
              type="button"
              id={tabIdV3(tab)}
              role="tab"
              aria-controls={panelIdV3(tab)}
              aria-selected={activeTab === tab}
              aria-label={copy.tabDiagnosticLabel({
                tab,
                label: copy.tabs[tab],
                errors: counts[tab].errors,
                warnings: counts[tab].warnings,
              })}
              tabIndex={activeTab === tab ? 0 : -1}
              data-model-tab={tab}
              onClick={() => selectTab(tab)}
              onKeyDown={(event) => onTabKeyDown(event, tab)}
            >
              <span>{copy.tabs[tab]}</span>{" "}
              <span aria-hidden="true">{counts[tab].errors > 0 ? `!${counts[tab].errors}` : ""}</span>{" "}
              <span aria-hidden="true">{counts[tab].warnings > 0 ? `△${counts[tab].warnings}` : ""}</span>
            </button>
          ))}
        </div>
        <button
          ref={helpButtonRef}
          className="ena-official-icon-button ena-model-help-button"
          type="button"
          aria-label={activeHelp.buttonLabel}
          aria-expanded={helpTab === activeTab}
          aria-controls={helpTab === activeTab ? `ena-model-help-${activeTab}` : undefined}
          onClick={() => setHelpTab((current) => current === activeTab ? null : activeTab)}
        >
          <span aria-hidden="true">?</span>
        </button>
      </div>
      {helpTab === null ? null : (
        <section
          ref={helpDialogRef}
          id={`ena-model-help-${helpTab}`}
          role="dialog"
          aria-labelledby={`ena-model-help-${helpTab}-heading`}
          aria-describedby={`ena-model-help-${helpTab}-description`}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            closeHelp();
          }}
        >
          <h2 id={`ena-model-help-${helpTab}-heading`}>{copy.help[helpTab].heading}</h2>
          <p id={`ena-model-help-${helpTab}-description`}>{copy.help[helpTab].description}</p>
        </section>
      )}
      <p className="ena-model-status-v3" role="status" aria-label={copy.status.label} aria-live="polite">
        <span aria-hidden="true">{configurationIncomplete ? "!" : "✓"}</span>{" "}
        {statusText}
      </p>
      <section className="ena-model-summary-v3" aria-label={copy.scientificSummary.label}>
        <dl>
          <dt>{copy.scientificSummary.fieldLabels.family}</dt>
          <dd>{copy.scientificSummary.family[scientificContext.family]}</dd>
          <dt>{copy.scientificSummary.fieldLabels.model}</dt>
          <dd>{summaryConfiguration === null
            ? copy.scientificSummary.unavailable
            : copy.scientificSummary.model[summaryConfiguration.model]}</dd>
          <dt>{copy.scientificSummary.fieldLabels.window}</dt>
          <dd>{summaryConfiguration === null
            ? copy.scientificSummary.unavailable
            : copy.scientificSummary.window[summaryConfiguration.window]}</dd>
          <dt>{copy.scientificSummary.fieldLabels.weighting}</dt>
          <dd>{summaryConfiguration === null
            ? copy.scientificSummary.unavailable
            : copy.scientificSummary.weighting[summaryConfiguration.weighting]}</dd>
          <dt>{copy.scientificSummary.fieldLabels.rotation}</dt>
          <dd>{summaryConfiguration === null
            ? copy.scientificSummary.unavailable
            : copy.scientificSummary.rotation[summaryConfiguration.rotation]}</dd>
          <dt>{copy.scientificSummary.fieldLabels.units}</dt>
          <dd>{summaryCount("units")}</dd>
          <dt>{copy.scientificSummary.fieldLabels.horizons}</dt>
          <dd>{summaryCount("horizons")}</dd>
          <dt>{copy.scientificSummary.fieldLabels.groups}</dt>
          <dd>{summaryCount("groups")}</dd>
          <dt>{copy.scientificSummary.fieldLabels.codes}</dt>
          <dd>{summaryCount("codes")}</dd>
        </dl>
      </section>
      <section
        className="ena-model-tab-panel"
        id={panelIdV3(activeTab)}
        role="tabpanel"
        aria-labelledby={tabIdV3(activeTab)}
      >
        {renderPanel(activeTab, {
          id: (fieldPath) => modelFieldIdV3(activeTab, fieldPath),
        })}
      </section>
      <OpenEnaModelDiagnosticsV3
        diagnostics={diagnostics}
        copy={copy.diagnostics}
        scientificContext={scientificContext}
        onNavigateField={navigateField}
        onSuggestedAction={onSuggestedAction}
      />
    </div>
  );
}

export default OpenEnaModelTabsV3;
