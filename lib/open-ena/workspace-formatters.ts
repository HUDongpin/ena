import type { Locale } from "../i18n";
import type { OpenEnaCopy, OpenEnaModelV3Copy } from "../open-ena-i18n";
import { workspaceMessage } from "./workspace-messages";
import type { OpenEnaWorkerStageV3 } from "./model-v3/types";

type Messages = Pick<OpenEnaModelV3Copy, "diagnosticMessages" | "suggestedActions">;
type Diagnostics = Pick<OpenEnaModelV3Copy["tabs"]["diagnostics"], "localize" | "suggestedAction">;

const workerStages = {
  "verify-plan": "Verifying the plan",
  "materialize": "Preparing data",
  "accumulate": "Accumulating connections",
  "normalize": "Normalizing networks",
  "center": "Centering coordinates",
  "rotate-or-project": "Rotating or projecting coordinates",
  "position-nodes": "Positioning nodes",
  "validate-result": "Validating results",
  "complete": "Complete",
} satisfies Record<OpenEnaWorkerStageV3, string>;

/** Format localized UI templates with untouched user identifiers and analytical values. */
export function formatWorkspaceCopy(locale: Locale, copy: OpenEnaCopy, messages: Messages, diagnostics: Diagnostics): OpenEnaCopy {
  const t = (template: string, values?: Record<string, string | number>) => workspaceMessage(locale, template, values);
  const groupRole = (role: string) => role === "primary" ? copy.modelV3.workspace.dataView.primary : role === "secondary" ? copy.modelV3.workspace.dataView.secondary : role;
  const referenceReasons = {
    normalization: t("Normalization"),
    "unit-fields": copy.modelV3.units.units,
    "horizon-fields": t("Horizon fields"),
    weighting: copy.modelV3.windows.weighting,
    "window-type": t("Window type"),
    "window-extents": t("Window extents"),
    "row-order": copy.modelV3.windows.rowOrder,
    codes: copy.modelV3.tabs.tabs.codes,
    basis: copy.modelV3.windows.basis,
    identity: t("Identity"),
  };
  const presetLabels = { all: copy.ona.mask.allLabel, none: copy.ona.mask.noneLabel, diagonal: copy.ona.mask.diagonalLabel, "off-diagonal": copy.ona.mask.offDiagonalLabel };
  return {
    ...copy,
    plotExport: {
      ...copy.plotExport,
      identityOmittedPoint: (index) => t("Analytic unit point {index}; identifier omitted from this SVG export.", { index }),
    },
    groupDisplay: {
      ...copy.groupDisplay,
      showAll: (count) => t("Show all ({count})", { count }),
      visibleCount: (group, visible, total) => t("{group} · {visible} of {total} unit points visible", { group, visible, total }),
      displaySettings: (group) => t("Display settings for {group}", { group }),
      settingLabel: (setting, group) => t("{setting} for {group}", { setting, group }),
      searchUnitsLabel: (group) => t("Search units in {group}", { group }),
      unitListWindow: (shown, matching, total) => t("Showing {shown} of {matching} matching units ({total} total).", { shown, matching, total }),
      unitVisibility: (visible, total) => t("Unit visibility · {visible}/{total}", { visible, total }),
      unitAction: (visible, unitId, group) => visible ? t("Hide unit {unitId} in {group}", { unitId, group }) : t("Show unit {unitId} in {group}", { unitId, group }),
      hiddenStatus: (count) => t("Hidden unit points: {count}", { count }),
    },
    resultTables: {
      ...copy.resultTables,
      notApplicableNote: (table, reason) => t("{table} — {reason}", { table, reason }),
      tableAriaLabel: (table) => t("{table} table", { table }),
      exportAriaLabel: (table) => t("Export {table} as CSV", { table }),
      showingAllRows: (count) => t("Showing all {count} rows.", { count: count.toLocaleString(locale) }),
      showingPreviewRows: (shown, total) => t("Showing {shown} of {total} rows. The CSV export contains all rows.", { shown: shown.toLocaleString(locale), total: total.toLocaleString(locale) }),
    },
    modelV3: {
      ...copy.modelV3,
      ...messages,
      tabs: {
        ...copy.modelV3.tabs,
        tabDiagnosticLabel: ({ label, errors, warnings }) => t("{label} · Errors: {errors} · Warnings: {warnings}", { label, errors, warnings }),
        status: {
          ...copy.modelV3.tabs.status,
          summary: ({ configuration, result }) => t("{configuration}. {result}.", { configuration, result }),
        },
        scientificSummary: {
          ...copy.modelV3.tabs.scientificSummary,
          count: (value) => String(value),
        },
        diagnostics: {
          ...copy.modelV3.tabs.diagnostics,
          localize: (input) => diagnostics.localize(input),
          evidenceTotal: (totalCount) => t("{totalCount} affected rows", { totalCount }),
          evidenceSample: (sample, index) => {
            const label = t("Evidence sample {index}", { index: index + 1 });
            const row = sample.rowIndex === undefined ? "" : t("row {number}", { number: sample.rowIndex + 1 });
            return [label, sample.codeColumn ?? sample.identity, row].filter(Boolean).join(" · ");
          },
          suggestedAction: (input) => diagnostics.suggestedAction(input),
        },
      },
      units: {
        ...copy.modelV3.units,
        addRemoveFields: (label) => t("Add or remove {label} fields", { label }),
        removeField: (field, label) => t("Remove {field} from {label}", { field, label }),
        unitCount: (count) => t("{count} Units", { count }),
        groupCount: (count) => t("{count} Groups", { count }),
        unavailableGroupField: (field) => t("{field} (unavailable current field)", { field }),
        unavailableMeansLevel: (label) => t("{label} (unavailable current level)", { label }),
        meansDirection: (negative, positive) => t("{negative} to {positive}", { negative, positive }),
      },
      horizons: {
        ...copy.modelV3.horizons,
        addRemoveFields: (label) => t("Add or remove {label} fields", { label }),
        removeField: (field, label) => t("Remove {field} from {label}", { field, label }),
        unitCount: (count) => t("{count} Units", { count }),
        horizonCount: (count) => t("{count} Horizons", { count }),
        observationCount: (count) => t("{count} Unit by Horizon observations", { count }),
        sharedHorizons: (count) => t("{count} shared Horizons", { count }),
        singleRowObservations: (count) => t("{count} single-row observations", { count }),
        extremeObservations: (minimum, maximum) => t("Observed rows range from {minimum} to {maximum}", { minimum, maximum }),
        boundedRows: (shown, total) => t("Showing {shown} of {total} observations", { shown, total }),
        sequence: (unit, steps) => t("{unit}: {steps}", { unit, steps }),
        boundedSequences: (shown, total) => t("Showing {shown} of {total} Unit sequences", { shown, total }),
      },
      windows: {
        ...copy.modelV3.windows,
        backwardFinite: (preceding) => t("Includes the current row and at most {preceding} preceding rows within its Horizon.", { preceding }),
        forwardFinite: (following) => t("Adds at most {following} following rows within its Horizon; the current row is excluded from this count.", { following }),
        unavailableReference: (name) => t("{name} (unavailable current Reference)", { name }),
        basisSummary: (codeCount, edgeCount, axisCount) => t("{codeCount} Codes, {edgeCount} edges, {axisCount} axes", { codeCount, edgeCount, axisCount }),
        targetProjectionSummary: (rank, variance) => t("Target rank {rank}; fixed-axis variance {variance}", { rank, variance }),
        referenceCompatibilityReason: (reason) => t("Reference compatibility: {reason}", { reason: referenceReasons[reason] }),
        resourceRows: (value) => t("{value} rows", { value }),
        resourceDimensions: (value) => t("{value} adjacency dimensions", { value }),
        resourceVisits: (value) => t("{value} estimated window visits", { value }),
        resourcePeak: (value) => t("{value} estimated peak bytes", { value }),
        resourceRotation: (value) => t("{value} estimated rotation work units", { value }),
      },
      codes: {
        ...copy.modelV3.codes,
        familyChanged: (family) => t("Analysis family changed to {family}. Independent settings restored.", { family: family === "ona" ? "ONA" : t("Standard") }),
        positiveCount: (count) => t("{count} positive rows", { count }),
        chooseColor: (code) => t("Choose color for {code}", { code }),
        hideCode: (code) => t("Hide {code} node", { code }),
        showCode: (code) => t("Show {code} node", { code }),
        excludeCode: (code) => t("Exclude {code} Code", { code }),
        reorderCode: (code) => t("Reorder {code}", { code }),
        addCode: (code) => t("Select {code} as a Code", { code }),
      },
      order: {
        ...copy.modelV3.order,
        removeKey: (index) => t("Remove order key {index}", { index: index + 1 }),
        moveKeyUp: (index) => t("Move order key {index} up", { index: index + 1 }),
        moveKeyDown: (index) => t("Move order key {index} down", { index: index + 1 }),
        keyLabel: (index) => t("Order key {index}", { index: index + 1 }),
        missingField: (field) => t("{field} (unavailable current field)", { field }),
        removeCategoryLevel: (index) => t("Remove category level {index}", { index: index + 1 }),
        moveCategoryLevelUp: (index) => t("Move category level {index} up", { index: index + 1 }),
        moveCategoryLevelDown: (index) => t("Move category level {index} down", { index: index + 1 }),
      },
      workspace: {
        ...copy.modelV3.workspace,
        workerStage: (stageId) => t("Worker stage: {stageId}", {
          stageId: Object.hasOwn(workerStages, stageId) ? t(workerStages[stageId as OpenEnaWorkerStageV3]) : stageId,
        }),
        failures: {
          ...copy.modelV3.workspace.failures,
          codedDataTooLarge: ({ limitMiB }) => t("Coded data exceeds the {limitMiB} MB limit ({limitMiB} MiB, {limitMiB} × 1,024 × 1,024 bytes).", { limitMiB }),
          artifactTooLarge: ({ limitMiB }) => t("The imported artifact exceeds the {limitMiB} MiB limit.", { limitMiB }),
          presetTooLarge: ({ limitMiB }) => t("The presentation preset exceeds the {limitMiB} MiB limit.", { limitMiB }),
        },
        dataView: {
          ...copy.modelV3.workspace.dataView,
          recordCount: (count) => t("Data View records: {count}", { count: count.toLocaleString(locale) }),
        },
        data: {
          ...copy.modelV3.workspace.data,
          firstSuccess: {
            ...copy.modelV3.workspace.data.firstSuccess,
            drafts: (family) => t("Eligible drafts prefilled for {family}", { family }),
          },
          sourceTypeLabel: (column) => t("Source type: {column}", { column }),
          missingCells: (count) => t("{count} missing cells", { count }),
          collisions: (count) => t("{count} potential identity collisions", { count }),
          invalidCells: (count) => t("{count} invalid cells.", { count }),
          datasetSummary: (name, rows, hash, kind) => t("{name} · {rows} rows · {hash} · {kind}", { name, rows, hash, kind: kind ?? t("unrecorded") }),
          historicalArtifact: (hash) => t("Historical, read-only artifact {hash}", { hash }),
          boundedRows: (shown, total) => t("Showing the first {shown} of {total} rows. Exports retain all rows.", { shown, total }),
        },
        plot: {
          ...copy.modelV3.workspace.plot,
          displayHorizon: (label) => t("Display {label}", { label }),
          axis: (index) => t("Axis {index}", { index }),
          dataViewComparisonRecords: (primary, secondary) => t("{primary} and {secondary} · comparison records", { primary, secondary }),
          plotActionsLabel: (plot) => t("{plot} actions", { plot }),
          plotActionLabel: (plot, action) => t("{plot}: {action}", { plot, action }),
          panelActionsLabel: (plot) => t("{plot} panel actions", { plot }),
          restorePlot: (plot) => t("Restore {plot}", { plot }),
          scaledCaption: (multiplier) => t("(scaled {multiplier}x)", { multiplier }),
          sideScaledDescription: (group, multiplier) => t("{group}, scaled {multiplier} times", { group, multiplier }),
          comparisonScaledDescription: (groups, multiplier) => {
              if (groups.length === 2) return t("{primary} minus {secondary}, scaled {multiplier} times", { primary: groups[0], secondary: groups[1], multiplier });
              if (groups.length === 1) return t("{group}, scaled {multiplier} times", { group: groups[0], multiplier });
              return t("No selected group network, scaled {multiplier} times", { multiplier });
            },
          sharedScale: (value) => t("Shared scale {value}", { value }),
          differenceScale: (value) => t("Difference scale {value}", { value }),
          scaledMultiplier: (value) => t("scaled {value}x", { value }),
          analyticUnits: (count) => t("{count} analytic units", { count }),
          squareSummaryPrimary: (name) => t("Square summary · Primary: {name}", { name }),
          squareSummarySecondary: (name) => t("Square summary · Secondary: {name}", { name }),
          solidPrimaryStronger: (name) => t("Solid {name} color: Primary is stronger (+)", { name }),
          solidSecondaryStronger: (name) => t("Solid {name} color: Secondary is stronger (−)", { name }),
          dashedConfidenceLegend: (names) => t("Dashed guides: separate marginal 95% Student-t intervals for {names}; not a joint region or test", { names }),
          shortDashedOutlierLegend: (names) => t("Short-dashed guides: rENA-compatible mean-centered 1.5 × IQR display intervals for {names}; not automatic exclusion or a test", { names }),
          comparisonDenominator: (definition, value) => t("Comparison denominator: {definition} ({value}).", { definition, value }),
          sidePanelDenominator: (definition, value) => t("Side-panel denominator: {definition} ({value}).", { definition, value }),
          edgeScaleDefinition: (definition) => definition === "maximum absolute Primary-minus-Secondary edge difference"
              ? t("maximum absolute Primary-minus-Secondary edge difference")
              : definition === "shared maximum absolute Primary or Secondary mean edge weight"
                ? t("shared maximum absolute Primary or Secondary mean edge weight")
                : definition,
          thresholdNote: (percent, scale, primary, secondary) => t("Threshold uses {percent}% of the comparison signed-difference scale ({scale}). Signed difference is Primary minus Secondary: positive values are {primary} minus {secondary}. This descriptive comparison does not imply significance.", { percent, scale, primary, secondary }),
          signedDifferenceEdge: (source, target, difference, strongerName, role) => t("{source} ↔ {target}: signed Primary-minus-Secondary difference {difference}; {strongerName} {role} group is stronger", { source, target, difference, strongerName, role: groupRole(role) }),
          groupMeanWeightEdge: (source, target, groupName, role, weight) => t("{source} ↔ {target}: {groupName} {role} group mean weight {weight}", { source, target, groupName, role: groupRole(role), weight }),
          namedUnitPoint: (groupName, unitLabel) => t("{groupName} unit {unitLabel}", { groupName, unitLabel }),
          roleUnitPoint: (role, index) => t("{role} unit point {index}", { role: groupRole(role), index }),
          codeNodeLabel: (codeLabel) => t("{codeLabel} code node", { codeLabel }),
          signedNetworkTitle: (first, second) => t("Signed group-network difference, {first} minus {second}", { first, second }),
          singleGroupNetworkTitle: (name) => t("{name} group network", { name }),
          signedNetworkDescription: (xAxis, yAxis, confidence, outlier) => t("Two-dimensional signed group comparison on {xAxis} and {yAxis}. Each connection is drawn once in the stable color of the stronger selected group; width encodes the absolute Primary-minus-Secondary difference.{confidence}{outlier}", { xAxis, yAxis, confidence, outlier }),
          pointSamplingDescription: (shown, eligible) => t(" Rendering {shown} sampled unit marks from {eligible} visible analytic-unit points.", { shown, eligible }),
          analyticUnitMarksHidden: (count) => t(" Analytic-unit marks hidden by group or unit display controls: {count}.", { count }),
        },
        artifacts: {
          ...copy.modelV3.workspace.artifacts,
          captureSet: (count) => t("Capture analysis set ({count}/6)", { count }),
          presetInferenceAxesWithheld: (dimensions) => t("The confirmed interpretation's axes are kept. The preset's other display settings were applied. Plotted dimensions {dimensions} were not used.", { dimensions }),
        },
        shell: {
          ...copy.modelV3.workspace.shell,
          runtimePrivacy: (version) => t("ENA computation powered by jENA v{version} (GPL-3.0-only); ENA.HK provides the interface, plotting, and exports. Source data stays in this workspace's browser memory unless you intentionally export it.", { version }),
        },
        empty: {
          ...copy.modelV3.workspace.empty,
          dataReady: (rows) => t("{rows} coded rows ready for review", { rows: rows.toLocaleString(locale) }),
        },
      },
    },
    ona: {
      ...copy.ona,
      workspace: {
        ...copy.ona.workspace,
        rebuilding: (progress, stage) => stage === "accumulate"
          ? t("Rebuilding ordered network with jENA · {progress}% · accumulating ordered contributions", { progress })
          : t("Rebuilding ordered network with jENA · {progress}% · normalizing, rotating, and projecting the ONA model", { progress }),
      },
      plotTools: {
        ...copy.ona.plotTools,
        settingLabel: (label) => t("{label} setting", { label }),
        enableLabel: (label) => t("Enable {label}", { label }),
        disableLabel: (label) => t("Disable {label}", { label }),
        timesValue: (value) => t("{value} times", { value }),
        pixelsValue: (value) => t("{value} pixels", { value }),
        minimumEdgeWeightValue: (percent) => t("{percent} percent of the strongest edge", { percent }),
        fitPlotValue: (zoom) => t("Fit plot; current zoom {zoom} times", { zoom }),
      },
      mask: {
        ...copy.ona.mask,
        cellLabel: (ground, response, diagonal) => diagonal
          ? t("{ground} ground/source to {response} response/target; self-connection", { ground, response })
          : t("{ground} ground/source to {response} response/target", { ground, response }),
        cellAnnouncement: (ground, response, enabled) => enabled ? t("{ground} to {response} enabled.", { ground, response }) : t("{ground} to {response} disabled.", { ground, response }),
        bulkAnnouncement: (preset, enabled, total) => t("{preset} preset applied; {enabled} of {total} directions enabled.", { preset: presetLabels[preset], enabled, total }),
      },
      plot: {
        ...copy.ona.plot,
        unitPointDescription: ({ unit, group, xDimension, xValue, yDimension, yValue }) => t("Analytic unit {unit} · Group {group} · horizontal axis {xDimension} {xValue} · vertical axis {yDimension} {yValue}", { unit, group, xDimension, xValue, yDimension, yValue }),
        groupPointDescription: ({ number, group, color, style }) => t("{number}. {group}; color {color}; {style} circle marker", { number, group, color, style }),
      },
    },
    model: {
      ...copy.model,
      codeColorPicker: Object.freeze<OpenEnaCopy["model"]["codeColorPicker"]>({
        ...copy.model.codeColorPicker,
        chooseColor: (code) => t("Choose color for {code}", { code }),
        dialogTitle: (code) => t("Code color for {code}", { code }),
        saturationBrightnessValue: (saturation, brightness) => t("Saturation {saturation}%, brightness {brightness}%", { saturation, brightness }),
        presetLabel: (index, primary, complementary) => t("Preset {index}: Primary {primary}, Complementary {complementary}", { index, primary, complementary }),
      }),
    },
    workspace: {
      ...copy.workspace,
      jenaSourceAriaLabel: (version, commit) => t("jENA {version} corresponding source at commit {commit}; opens in a new tab", { version, commit }),
    },
  };
}
