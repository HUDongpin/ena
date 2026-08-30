import { useEffect, useRef, type CSSProperties } from "react";
import type { OpenEnaPersistentPlotToolsCopy } from "@/lib/open-ena-i18n";

export interface OpenEnaPersistentPlotToolsProps {
  analysisKind?: "ena" | "ona";
  title?: string;
  copy?: OpenEnaPersistentPlotToolsCopy;
  edgeScale: number;
  edgeThreshold: number;
  pointScale: number;
  textScale?: number;
  showLabels: boolean;
  showGroupLabels: boolean;
  showUnitLabels: boolean;
  showPoints: boolean;
  unitCircle: boolean;
  flipX: boolean;
  flipY: boolean;
  plotZoom: number;
  onEdgeScaleChange: (value: number) => void;
  onEdgeThresholdChange: (value: number) => void;
  onPointScaleChange: (value: number) => void;
  onTextScaleChange?: (value: number) => void;
  onShowLabelsChange: (checked: boolean) => void;
  onShowGroupLabelsChange: (checked: boolean) => void;
  onShowUnitLabelsChange: (checked: boolean) => void;
  onShowPointsChange: (checked: boolean) => void;
  onUnitCircleChange: (checked: boolean) => void;
  onFlipXChange: (flipped: boolean) => void;
  onFlipYChange: (flipped: boolean) => void;
  onPlotZoomChange: (value: number) => void;
  onReset: () => void;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

const DEFAULT_PLOT_TOOLS_COPY: OpenEnaPersistentPlotToolsCopy = {
  plotSettings: "Plot Settings",
  closePlotSettings: "Close Plot Settings",
  close: "Close",
  scaleEdgeWeights: "Scale edge weights",
  edgeWeights: "Edge Weights",
  edgeWeightsValue: "Edge Weights value",
  resetEdgeWeights: "Reset Edge Weights",
  textSize: "Text size",
  textSizeControl: "Text Size",
  textSizeValue: "Text Size value",
  resetTextSize: "Reset Text Size",
  codeLabels: "Code labels",
  unitCircle: "Unit circle",
  axisDirection: "Axis direction",
  flipXAxis: "Flip X-Axis",
  flipYAxis: "Flip Y-Axis",
  networkGraph: "Network Graph",
  minimumEdgeWeight: "Minimum edge weight",
  plottedPoints: "Plotted Points",
  groupLabels: "Group labels",
  unitPoints: "Unit points",
  scaleUnitCircles: "Scale unit circles",
  unitLabels: "Unit labels",
  advanced: "Advanced",
  plotZoom: "Plot zoom",
  zoomOut: "Zoom out",
  fit: "Fit",
  zoomIn: "Zoom in",
  resetAllPlotTools: "Reset all plot tools",
  resetAll: "Reset all",
  on: "On",
  off: "Off",
  settingLabel: (label) => `${label} setting`,
  enableLabel: (label) => `Enable ${label}`,
  disableLabel: (label) => `Disable ${label}`,
  timesValue: (value) => `${value} times`,
  pixelsValue: (value) => `${value} pixels`,
  minimumEdgeWeightValue: (percent) => `${percent} percent of the strongest edge`,
  fitPlotValue: (zoom) => `Fit plot; current zoom ${zoom} times`,
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const rangeProgressStyle = (value: number, minimum: number, maximum: number) => ({
  "--ena-range-progress": `${clamp(((value - minimum) / (maximum - minimum)) * 100, 0, 100)}%`,
} as CSSProperties);

export function scheduleOpenEnaFocusRestore<Handle>(
  target: Pick<HTMLElement, "focus" | "isConnected"> & { disabled?: boolean } | null,
  schedule: (callback: () => void) => Handle,
  cancelSchedule: (handle: Handle) => void,
) {
  if (!target) return () => {};
  let cancelled = false;
  let settled = false;
  const handle = schedule(() => {
    if (cancelled) return;
    settled = true;
    if (target.isConnected && target.disabled !== true) target.focus();
  });
  return () => {
    if (cancelled || settled) return;
    cancelled = true;
    cancelSchedule(handle);
  };
}

function OfficialBinaryToggle({
  label,
  copy,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  copy: OpenEnaPersistentPlotToolsCopy;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ena-official-binary-toggle" role="group" aria-label={copy.settingLabel(label)}>
      <button
        type="button"
        className="ena-official-switch-label"
        aria-label={copy.enableLabel(label)}
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        {copy.on}
      </button>
      <button
        type="button"
        className="ena-official-switch-track"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="ena-official-switch-handle" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="ena-official-switch-label"
        aria-label={copy.disableLabel(label)}
        aria-pressed={!checked}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        {copy.off}
      </button>
    </div>
  );
}

export default function OpenEnaPersistentPlotTools({
  analysisKind = "ena",
  title = "Plot Tools",
  copy = DEFAULT_PLOT_TOOLS_COPY,
  edgeScale,
  edgeThreshold,
  pointScale,
  textScale = 1,
  showLabels,
  showGroupLabels,
  showUnitLabels,
  showPoints,
  unitCircle,
  flipX,
  flipY,
  plotZoom,
  onEdgeScaleChange,
  onEdgeThresholdChange,
  onPointScaleChange,
  onTextScaleChange = () => {},
  onShowLabelsChange,
  onShowGroupLabelsChange,
  onShowUnitLabelsChange,
  onShowPointsChange,
  onUnitCircleChange,
  onFlipXChange,
  onFlipYChange,
  onPlotZoomChange,
  onReset,
  settingsOpen = false,
  onSettingsOpenChange = () => {},
  disabled = false,
}: OpenEnaPersistentPlotToolsProps) {
  const textSize = Math.round(12 * textScale + 1);
  const ordered = analysisKind === "ona";
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsCloseButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusCancelRef = useRef<() => void>(() => {});
  const wasSettingsOpenRef = useRef(settingsOpen);
  useEffect(() => {
    const wasOpen = wasSettingsOpenRef.current;
    wasSettingsOpenRef.current = settingsOpen;
    pendingFocusCancelRef.current();
    const focusTarget = settingsOpen
      ? settingsCloseButtonRef.current
      : wasOpen ? settingsTriggerRef.current : null;
    pendingFocusCancelRef.current = scheduleOpenEnaFocusRestore(
      focusTarget,
      (callback) => window.requestAnimationFrame(callback),
      (handle) => window.cancelAnimationFrame(handle),
    );
    return () => {
      pendingFocusCancelRef.current();
      pendingFocusCancelRef.current = () => {};
    };
  }, [settingsOpen]);

  const requestSettingsClose = () => onSettingsOpenChange(false);

  return (
    <section
      className="ena-persistent-plot-tools"
      data-testid="open-ena-persistent-plot-tools"
      data-analysis-kind={analysisKind}
      aria-label={title}
      onKeyDown={(event) => {
        if (settingsOpen && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          requestSettingsClose();
        }
      }}
    >
      <header className="ena-persistent-plot-tools-header">
        <strong>{title}</strong>
        <button
          ref={settingsTriggerRef}
          type="button"
          className="ena-plot-settings-trigger"
          aria-label={copy.plotSettings}
          aria-expanded={settingsOpen}
          aria-controls="ena-official-plot-settings"
          title={copy.plotSettings}
          disabled={disabled}
          onClick={() => {
            if (settingsOpen) requestSettingsClose();
            else onSettingsOpenChange(true);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65-2-3.46-2.49 1a7.2 7.2 0 0 0-1.69-.98L15 3.25h-4l-.4 2.68c-.61.25-1.17.58-1.69.98l-2.49-1-2 3.46 2.11 1.65c-.05.32-.08.66-.08.98s.03.66.08.98l-2.11 1.65 2 3.46 2.49-1c.52.4 1.08.73 1.69.98l.4 2.68h4l.4-2.68c.61-.25 1.17-.58 1.69-.98l2.49 1 2-3.46-2.15-1.65ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z" />
          </svg>
        </button>
      </header>

      <div
        className="ena-persistent-plot-tools-scroll"
        data-ena-plot-tools-surface="frequent"
        inert={settingsOpen}
        aria-hidden={settingsOpen ? true : undefined}
      >
        <div className="ena-official-tool-row" data-ena-plot-tool="edge-scale">
          <span>{copy.scaleEdgeWeights}:</span>
          <div className="ena-official-tool-control">
            <input
              type="range"
              min="0.1"
              max="4"
              step="0.1"
              value={edgeScale}
              style={rangeProgressStyle(edgeScale, 0.1, 4)}
              disabled={disabled}
              aria-label={copy.edgeWeights}
              aria-valuetext={copy.timesValue(edgeScale.toFixed(1))}
              onChange={(event) => onEdgeScaleChange(Number(event.target.value))}
            />
            <input
              type="number"
              min="0.1"
              max="4"
              step="0.1"
              value={edgeScale}
              disabled={disabled}
              aria-label={copy.edgeWeightsValue}
              onChange={(event) => onEdgeScaleChange(clamp(Number(event.target.value), 0.1, 4))}
            />
            <button type="button" aria-label={copy.resetEdgeWeights} title={copy.resetEdgeWeights} disabled={disabled} onClick={() => onEdgeScaleChange(1)}>↻</button>
          </div>
        </div>

        <div className="ena-official-tool-row" data-ena-plot-tool="text-size">
          <span>{copy.textSize}:</span>
          <div className="ena-official-tool-control">
            <input
              type="range"
              min="9"
              max="21"
              step="1"
              value={textSize}
              style={rangeProgressStyle(textSize, 9, 21)}
              disabled={disabled}
              aria-label={copy.textSizeControl}
              aria-valuetext={copy.pixelsValue(textSize)}
              onChange={(event) => onTextScaleChange(clamp((Number(event.target.value) - 1) / 12, 8 / 12, 20 / 12))}
            />
            <input
              type="number"
              min="9"
              max="21"
              step="1"
              value={textSize}
              disabled={disabled}
              aria-label={copy.textSizeValue}
              onChange={(event) => onTextScaleChange(clamp((Number(event.target.value) - 1) / 12, 8 / 12, 20 / 12))}
            />
            <button type="button" aria-label={copy.resetTextSize} title={copy.resetTextSize} disabled={disabled} onClick={() => onTextScaleChange(1)}>↻</button>
          </div>
        </div>

        <div className="ena-official-toggle-row" data-ena-plot-tool="code-labels">
          <span>{copy.codeLabels}:</span>
          <OfficialBinaryToggle label={copy.codeLabels} copy={copy} checked={showLabels} onChange={onShowLabelsChange} disabled={disabled} />
        </div>

        {!ordered ? (
          <div className="ena-official-toggle-row" data-ena-plot-tool="unit-circle">
            <span>{copy.unitCircle}:</span>
            <OfficialBinaryToggle label={copy.unitCircle} copy={copy} checked={unitCircle} onChange={onUnitCircleChange} disabled={disabled} />
          </div>
        ) : null}

        <div className="ena-plot-actions ena-plot-flips" role="group" aria-label={copy.axisDirection}>
          <button
            type="button"
            data-ena-plot-tool="flip-x"
            aria-pressed={flipX}
            disabled={disabled}
            onClick={() => onFlipXChange(!flipX)}
          >
            {copy.flipXAxis}
          </button>
          <button
            type="button"
            data-ena-plot-tool="flip-y"
            aria-pressed={flipY}
            disabled={disabled}
            onClick={() => onFlipYChange(!flipY)}
          >
            {copy.flipYAxis}
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <aside
          id="ena-official-plot-settings"
          className="ena-official-plot-settings"
          role="dialog"
          aria-label={copy.plotSettings}
          aria-modal="false"
        >
          <header>
            <strong>{copy.plotSettings}</strong>
            <button ref={settingsCloseButtonRef} type="button" aria-label={copy.closePlotSettings} title={copy.close} onClick={requestSettingsClose}>×</button>
          </header>
          <div className="ena-official-plot-settings-scroll">
            <section aria-labelledby="ena-plot-settings-network">
              <h4 id="ena-plot-settings-network">{copy.networkGraph}</h4>
              <label className="ena-field ena-range-field" data-ena-plot-tool="minimum-edge-weight">
                <span>{copy.minimumEdgeWeight} <output>{Math.round(edgeThreshold * 100)}%</output></span>
                <input
                  type="range"
                  min="0"
                  max="0.95"
                  step="0.05"
                  value={edgeThreshold}
                  disabled={disabled}
                  aria-label={copy.minimumEdgeWeight}
                  aria-valuetext={copy.minimumEdgeWeightValue(Math.round(edgeThreshold * 100))}
                  onChange={(event) => onEdgeThresholdChange(Number(event.target.value))}
                />
              </label>
            </section>
            <section aria-labelledby="ena-plot-settings-points">
              <h4 id="ena-plot-settings-points">{copy.plottedPoints}</h4>
              {!ordered ? (
                <div className="ena-official-toggle-row" data-ena-plot-tool="group-labels">
                  <span>{copy.groupLabels}:</span>
                  <OfficialBinaryToggle label={copy.groupLabels} copy={copy} checked={showGroupLabels} onChange={onShowGroupLabelsChange} disabled={disabled} />
                </div>
              ) : null}
              <div className="ena-official-toggle-row" data-ena-plot-tool="unit-points">
                <span>{copy.unitPoints}:</span>
                <OfficialBinaryToggle label={copy.unitPoints} copy={copy} checked={showPoints} onChange={onShowPointsChange} disabled={disabled} />
              </div>
              <label className="ena-field ena-range-field" data-ena-plot-tool="unit-scale">
                <span>{copy.scaleUnitCircles} <output>{pointScale.toFixed(1)}×</output></span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={pointScale}
                  disabled={disabled}
                  aria-label={copy.scaleUnitCircles}
                  aria-valuetext={copy.timesValue(pointScale.toFixed(1))}
                  onChange={(event) => onPointScaleChange(Number(event.target.value))}
                />
              </label>
              <div className="ena-official-toggle-row" data-ena-plot-tool="unit-labels">
                <span>{copy.unitLabels}:</span>
                <OfficialBinaryToggle label={copy.unitLabels} copy={copy} checked={showUnitLabels} onChange={onShowUnitLabelsChange} disabled={disabled} />
              </div>
            </section>
            <section aria-labelledby="ena-plot-settings-advanced">
              <h4 id="ena-plot-settings-advanced">{copy.advanced}</h4>
              <div className="ena-plot-actions" role="group" aria-label={copy.plotZoom}>
                <button type="button" disabled={disabled || plotZoom <= 0.6} aria-label={copy.zoomOut} onClick={() => onPlotZoomChange(clamp(Number((plotZoom - 0.2).toFixed(1)), 0.6, 2.4))}>−</button>
                <button type="button" disabled={disabled} aria-label={copy.fitPlotValue(plotZoom.toFixed(1))} onClick={() => onPlotZoomChange(1)}>{copy.fit} · {plotZoom.toFixed(1)}×</button>
                <button type="button" disabled={disabled || plotZoom >= 2.4} aria-label={copy.zoomIn} onClick={() => onPlotZoomChange(clamp(Number((plotZoom + 0.2).toFixed(1)), 0.6, 2.4))}>+</button>
              </div>
              <button type="button" className="ena-reset-all-plot-tools" onClick={onReset} disabled={disabled} aria-label={copy.resetAllPlotTools}>{copy.resetAll}</button>
            </section>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
