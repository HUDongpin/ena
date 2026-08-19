export interface OpenEnaPersistentPlotToolsProps {
  edgeScale: number;
  edgeThreshold: number;
  pointScale: number;
  textScale?: number;
  showLabels: boolean;
  showUnitLabels: boolean;
  showPoints: boolean;
  flipX: boolean;
  flipY: boolean;
  plotZoom: number;
  onEdgeScaleChange: (value: number) => void;
  onEdgeThresholdChange: (value: number) => void;
  onPointScaleChange: (value: number) => void;
  onTextScaleChange?: (value: number) => void;
  onShowLabelsChange: (checked: boolean) => void;
  onShowUnitLabelsChange: (checked: boolean) => void;
  onShowPointsChange: (checked: boolean) => void;
  onFlipXChange: (flipped: boolean) => void;
  onFlipYChange: (flipped: boolean) => void;
  onPlotZoomChange: (value: number) => void;
  onReset: () => void;
  disabled?: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

export default function OpenEnaPersistentPlotTools({
  edgeScale,
  edgeThreshold,
  pointScale,
  textScale = 1,
  showLabels,
  showUnitLabels,
  showPoints,
  flipX,
  flipY,
  plotZoom,
  onEdgeScaleChange,
  onEdgeThresholdChange,
  onPointScaleChange,
  onTextScaleChange = () => {},
  onShowLabelsChange,
  onShowUnitLabelsChange,
  onShowPointsChange,
  onFlipXChange,
  onFlipYChange,
  onPlotZoomChange,
  onReset,
  disabled = false,
}: OpenEnaPersistentPlotToolsProps) {
  return (
    <section
      className="ena-persistent-plot-tools"
      data-testid="open-ena-persistent-plot-tools"
      aria-label="Plot Tools"
    >
      <header className="ena-persistent-plot-tools-header">
        <strong>Plot Tools</strong>
        <button type="button" onClick={onReset} disabled={disabled} aria-label="Reset all plot tools">
          Reset
        </button>
      </header>

      <div className="ena-persistent-plot-tools-scroll">
        <label className="ena-field ena-range-field" data-ena-plot-tool="edge-scale">
          <span>Scale edge weights <output>{edgeScale.toFixed(1)}×</output></span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={edgeScale}
            disabled={disabled}
            aria-label="Scale edge weights"
            aria-valuetext={`${edgeScale.toFixed(1)} times`}
            onChange={(event) => onEdgeScaleChange(Number(event.target.value))}
          />
        </label>

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

        <label className="ena-field ena-range-field" data-ena-plot-tool="text-size">
          <span>Text size <output>{Math.round(12 * textScale)} px</output></span>
          <input
            type="range"
            min="0.8"
            max="1.5"
            step="0.1"
            value={textScale}
            disabled={disabled}
            aria-label="Text size"
            aria-valuetext={`${Math.round(12 * textScale)} pixels`}
            onChange={(event) => onTextScaleChange(Number(event.target.value))}
          />
        </label>

        <div className="ena-switch-stack" role="group" aria-label="Plot visibility">
          <label className="ena-switch-row" data-ena-plot-tool="code-labels">
            <span>Code labels</span>
            <input
              type="checkbox"
              checked={showLabels}
              disabled={disabled}
              onChange={(event) => onShowLabelsChange(event.target.checked)}
            />
          </label>
          <label className="ena-switch-row" data-ena-plot-tool="unit-labels">
            <span>Unit labels</span>
            <input
              type="checkbox"
              checked={showUnitLabels}
              disabled={disabled}
              onChange={(event) => onShowUnitLabelsChange(event.target.checked)}
            />
          </label>
          <label className="ena-switch-row" data-ena-plot-tool="unit-points">
            <span>Unit circles</span>
            <input
              type="checkbox"
              checked={showPoints}
              disabled={disabled}
              onChange={(event) => onShowPointsChange(event.target.checked)}
            />
          </label>
        </div>

        <div className="ena-plot-actions" role="group" aria-label="Plot zoom">
          <button
            type="button"
            disabled={disabled || plotZoom <= 0.6}
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => onPlotZoomChange(clamp(Number((plotZoom - 0.2).toFixed(1)), 0.6, 2.4))}
          >
            −
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Fit plot; current zoom ${plotZoom.toFixed(1)} times`}
            title="Fit plot"
            onClick={() => onPlotZoomChange(1)}
          >
            Fit · {plotZoom.toFixed(1)}×
          </button>
          <button
            type="button"
            disabled={disabled || plotZoom >= 2.4}
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => onPlotZoomChange(clamp(Number((plotZoom + 0.2).toFixed(1)), 0.6, 2.4))}
          >
            +
          </button>
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
    </section>
  );
}
