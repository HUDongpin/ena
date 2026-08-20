import type { CSSProperties } from "react";

export interface OpenEnaPersistentPlotToolsProps {
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

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const rangeProgressStyle = (value: number, minimum: number, maximum: number) => ({
  "--ena-range-progress": `${clamp(((value - minimum) / (maximum - minimum)) * 100, 0, 100)}%`,
} as CSSProperties);

function OfficialBinaryToggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ena-official-binary-toggle" role="group" aria-label={`${label} setting`}>
      <button
        type="button"
        className="ena-official-switch-label"
        aria-label={`Enable ${label}`}
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        On
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
        aria-label={`Disable ${label}`}
        aria-pressed={!checked}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        Off
      </button>
    </div>
  );
}

export default function OpenEnaPersistentPlotTools({
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

  return (
    <section
      className="ena-persistent-plot-tools"
      data-testid="open-ena-persistent-plot-tools"
      aria-label="Plot Tools"
      onKeyDown={(event) => {
        if (settingsOpen && event.key === "Escape") {
          event.preventDefault();
          onSettingsOpenChange(false);
        }
      }}
    >
      <header className="ena-persistent-plot-tools-header">
        <strong>Plot Tools</strong>
        <button
          type="button"
          className="ena-plot-settings-trigger"
          aria-label="Plot Settings"
          aria-expanded={settingsOpen}
          aria-controls="ena-official-plot-settings"
          title="Plot Settings"
          disabled={disabled}
          onClick={() => onSettingsOpenChange(!settingsOpen)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65-2-3.46-2.49 1a7.2 7.2 0 0 0-1.69-.98L15 3.25h-4l-.4 2.68c-.61.25-1.17.58-1.69.98l-2.49-1-2 3.46 2.11 1.65c-.05.32-.08.66-.08.98s.03.66.08.98l-2.11 1.65 2 3.46 2.49-1c.52.4 1.08.73 1.69.98l.4 2.68h4l.4-2.68c.61-.25 1.17-.58 1.69-.98l2.49 1 2-3.46-2.15-1.65ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z" />
          </svg>
        </button>
      </header>

      <div className="ena-persistent-plot-tools-scroll" data-ena-plot-tools-surface="frequent">
        <div className="ena-official-tool-row" data-ena-plot-tool="edge-scale">
          <span>Scale edge weights:</span>
          <div className="ena-official-tool-control">
            <input
              type="range"
              min="0.1"
              max="4"
              step="0.1"
              value={edgeScale}
              style={rangeProgressStyle(edgeScale, 0.1, 4)}
              disabled={disabled}
              aria-label="Edge Weights"
              aria-valuetext={`${edgeScale.toFixed(1)} times`}
              onChange={(event) => onEdgeScaleChange(Number(event.target.value))}
            />
            <input
              type="number"
              min="0.1"
              max="4"
              step="0.1"
              value={edgeScale}
              disabled={disabled}
              aria-label="Edge Weights value"
              onChange={(event) => onEdgeScaleChange(clamp(Number(event.target.value), 0.1, 4))}
            />
            <button type="button" aria-label="Reset Edge Weights" title="Reset Edge Weights" disabled={disabled} onClick={() => onEdgeScaleChange(1)}>↻</button>
          </div>
        </div>

        <div className="ena-official-tool-row" data-ena-plot-tool="text-size">
          <span>Text size:</span>
          <div className="ena-official-tool-control">
            <input
              type="range"
              min="9"
              max="21"
              step="1"
              value={textSize}
              style={rangeProgressStyle(textSize, 9, 21)}
              disabled={disabled}
              aria-label="Text Size"
              aria-valuetext={`${textSize} pixels`}
              onChange={(event) => onTextScaleChange(clamp((Number(event.target.value) - 1) / 12, 8 / 12, 20 / 12))}
            />
            <input
              type="number"
              min="9"
              max="21"
              step="1"
              value={textSize}
              disabled={disabled}
              aria-label="Text Size value"
              onChange={(event) => onTextScaleChange(clamp((Number(event.target.value) - 1) / 12, 8 / 12, 20 / 12))}
            />
            <button type="button" aria-label="Reset Text Size" title="Reset Text Size" disabled={disabled} onClick={() => onTextScaleChange(1)}>↻</button>
          </div>
        </div>

        <div className="ena-official-toggle-row" data-ena-plot-tool="code-labels">
          <span>Code labels:</span>
          <OfficialBinaryToggle label="Code labels" checked={showLabels} onChange={onShowLabelsChange} disabled={disabled} />
        </div>

        <div className="ena-official-toggle-row" data-ena-plot-tool="unit-circle">
          <span>Unit circle:</span>
          <OfficialBinaryToggle label="Unit circle" checked={unitCircle} onChange={onUnitCircleChange} disabled={disabled} />
        </div>

        <div className="ena-plot-actions ena-plot-flips" role="group" aria-label="Axis direction">
          <button
            type="button"
            data-ena-plot-tool="flip-x"
            aria-pressed={flipX}
            disabled={disabled}
            onClick={() => onFlipXChange(!flipX)}
          >
            Flip X-Axis
          </button>
          <button
            type="button"
            data-ena-plot-tool="flip-y"
            aria-pressed={flipY}
            disabled={disabled}
            onClick={() => onFlipYChange(!flipY)}
          >
            Flip Y-Axis
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <aside
          id="ena-official-plot-settings"
          className="ena-official-plot-settings"
          role="dialog"
          aria-label="Plot Settings"
          aria-modal="false"
        >
          <header>
            <strong>Plot Settings</strong>
            <button type="button" aria-label="Close Plot Settings" title="Close" onClick={() => onSettingsOpenChange(false)}>×</button>
          </header>
          <div className="ena-official-plot-settings-scroll">
            <section aria-labelledby="ena-plot-settings-network">
              <h4 id="ena-plot-settings-network">Network Graph</h4>
              <label className="ena-field ena-range-field" data-ena-plot-tool="minimum-edge-weight">
                <span>Minimum edge weight <output>{Math.round(edgeThreshold * 100)}%</output></span>
                <input
                  type="range"
                  min="0"
                  max="0.95"
                  step="0.05"
                  value={edgeThreshold}
                  disabled={disabled}
                  aria-label="Minimum edge weight"
                  aria-valuetext={`${Math.round(edgeThreshold * 100)} percent of the strongest edge`}
                  onChange={(event) => onEdgeThresholdChange(Number(event.target.value))}
                />
              </label>
            </section>
            <section aria-labelledby="ena-plot-settings-points">
              <h4 id="ena-plot-settings-points">Plotted Points</h4>
              <div className="ena-official-toggle-row" data-ena-plot-tool="group-labels">
                <span>Group labels:</span>
                <OfficialBinaryToggle label="Group labels" checked={showGroupLabels} onChange={onShowGroupLabelsChange} disabled={disabled} />
              </div>
              <div className="ena-official-toggle-row" data-ena-plot-tool="unit-points">
                <span>Unit points:</span>
                <OfficialBinaryToggle label="Unit points" checked={showPoints} onChange={onShowPointsChange} disabled={disabled} />
              </div>
              <label className="ena-field ena-range-field" data-ena-plot-tool="unit-scale">
                <span>Scale unit circles <output>{pointScale.toFixed(1)}×</output></span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={pointScale}
                  disabled={disabled}
                  aria-label="Scale unit circles"
                  aria-valuetext={`${pointScale.toFixed(1)} times`}
                  onChange={(event) => onPointScaleChange(Number(event.target.value))}
                />
              </label>
              <div className="ena-official-toggle-row" data-ena-plot-tool="unit-labels">
                <span>Unit labels:</span>
                <OfficialBinaryToggle label="Unit labels" checked={showUnitLabels} onChange={onShowUnitLabelsChange} disabled={disabled} />
              </div>
            </section>
            <section aria-labelledby="ena-plot-settings-advanced">
              <h4 id="ena-plot-settings-advanced">Advanced</h4>
              <div className="ena-plot-actions" role="group" aria-label="Plot zoom">
                <button type="button" disabled={disabled || plotZoom <= 0.6} aria-label="Zoom out" onClick={() => onPlotZoomChange(clamp(Number((plotZoom - 0.2).toFixed(1)), 0.6, 2.4))}>−</button>
                <button type="button" disabled={disabled} aria-label={`Fit plot; current zoom ${plotZoom.toFixed(1)} times`} onClick={() => onPlotZoomChange(1)}>Fit · {plotZoom.toFixed(1)}×</button>
                <button type="button" disabled={disabled || plotZoom >= 2.4} aria-label="Zoom in" onClick={() => onPlotZoomChange(clamp(Number((plotZoom + 0.2).toFixed(1)), 0.6, 2.4))}>+</button>
              </div>
              <button type="button" className="ena-reset-all-plot-tools" onClick={onReset} disabled={disabled} aria-label="Reset all plot tools">Reset all</button>
            </section>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
