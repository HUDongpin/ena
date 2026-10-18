"use client";

import { useState, type ReactNode } from "react";

type Mode = "sets" | "data" | "model" | "plot" | "stats";

const modes: Array<{ id: Mode; label: string }> = [
  { id: "sets", label: "Sets" },
  { id: "data", label: "Data" },
  { id: "model", label: "Model" },
  { id: "plot", label: "Plot" },
  { id: "stats", label: "Stats" },
];

function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === "sets") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v5H4zm0 8h16v5H4z" /><path d="M7 8h.01M7 16h.01" /></svg>;
  }
  if (mode === "data") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM4 10h16M9 5.5v13" /></svg>;
  }
  if (mode === "model") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="m8 7 7.8-.8M7.4 8.7l3.5 7.4m5.6-8.2-3.4 8.2" /></svg>;
  }
  if (mode === "plot") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V4.5M4 19.5h16" /><path d="m6.5 15 4-4 3 2 5-6" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11h3v8zm6 0V5h3v14zm6 0V8h3v11z" /></svg>;
}

function PanelHeading({ index, label, title, children }: { index: string; label: string; title: string; children: ReactNode }) {
  return (
    <div className="preview-panel-heading">
      <p>{index} · {label}</p>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function SetsPanel() {
  return (
    <div className="preview-control-content">
      <PanelHeading index="00" label="Sets" title="Shared-space sets">
        Capture fitted and projected endpoint models for transparent comparison in one fixed geometry.
      </PanelHeading>
      <ol className="preview-workflow" aria-label="Shared-space comparison workflow">
        <li><span>1</span><div><strong>Capture a fitted endpoint</strong><p>Install its generated reference for reuse.</p></div></li>
        <li><span>2</span><div><strong>Build a target in that reference</strong><p>Open another coded dataset and reuse the geometry.</p></div></li>
        <li><span>3</span><div><strong>Capture the projected endpoint</strong><p>Retain reference lineage without raw rows.</p></div></li>
        <li><span>4</span><div><strong>Choose Primary and Secondary</strong><p>Compare compatible sets in the shared space.</p></div></li>
      </ol>
      <button className="preview-primary-action" type="button" disabled>Capture current model</button>
      <p className="preview-disabled-note">Available after a jENA model is built.</p>
      <div className="preview-empty-card">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v4H5zm0 7h14v4H5z" /><path d="M8 9h.01M8 16h.01" /></svg>
        <strong>No captured sets</strong>
        <p>Fitted and projected snapshots will appear here.</p>
      </div>
    </div>
  );
}

function DataPanel() {
  return (
    <div className="preview-control-content">
      <PanelHeading index="01" label="Dataset" title="Open coded data">
        Prepare CSV or XLSX rows for a browser-local ENA workflow.
      </PanelHeading>
      <div className="preview-action-stack">
        <button type="button" className="preview-primary-action" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-7 4-4 4 4" /><path d="M5 15v4h14v-4" /></svg>
          Open CSV or XLSX
        </button>
        <button type="button" className="preview-secondary-action" disabled>Load teaching sample</button>
      </div>
      <div className="preview-local-note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
        <p><strong>Local-first by design</strong><br />Source data will stay in browser memory unless deliberately exported.</p>
      </div>
      <div className="preview-dataset-placeholder">
        <span>Dataset</span>
        <strong>No coded data open</strong>
        <dl><div><dt>Rows</dt><dd>—</dd></div><div><dt>Fields</dt><dd>—</dd></div><div><dt>Hash</dt><dd>—</dd></div></dl>
      </div>
      <p className="preview-disabled-note">Dataset handling is intentionally not connected in this UI milestone.</p>
    </div>
  );
}

function ModelPanel() {
  return (
    <div className="preview-control-content">
      <PanelHeading index="02" label="Model" title="Configure jENA">
        Define analytic units, conversations, moving windows, and codes before fitting the model.
      </PanelHeading>
      <div className="preview-tabs" role="tablist" aria-label="Model configuration steps">
        {['Units', 'Horizons', 'Windows', 'Codes'].map((tab, index) => (
          <button key={tab} type="button" role="tab" aria-selected={index === 0} disabled>{tab}</button>
        ))}
      </div>
      <div className="preview-fieldset">
        <span>Analytic unit columns</span>
        {['Name', 'Group', 'Conversation', 'Time'].map((field, index) => (
          <label key={field}><input type="checkbox" checked={index < 2} disabled />{field}</label>
        ))}
      </div>
      <label className="preview-field"><span>Model type</span><select disabled><option>Endpoint</option></select></label>
      <label className="preview-field"><span>Rotation</span><select disabled><option>Mean rotation</option></select></label>
      <button className="preview-primary-action" type="button" disabled>Build model with jENA</button>
      <p className="preview-disabled-note">Runtime integration follows the parent ENA 3D ENA and ONA update.</p>
    </div>
  );
}

function PlotPanel() {
  const controls = [
    ["Show points", true],
    ["Show networks", true],
    ["Show labels", true],
    ["Show unit labels", false],
    ["Show variance", false],
  ] as const;
  return (
    <div className="preview-control-content">
      <PanelHeading index="03" label="Plot" title="Visual encoding">
        Inspect a shared ENA space and prepare clear, reproducible figures.
      </PanelHeading>
      <div className="preview-switches">
        {controls.map(([label, checked]) => (
          <label key={label}><span>{label}</span><input type="checkbox" checked={checked} disabled /></label>
        ))}
      </div>
      <label className="preview-field"><span>X axis</span><select disabled><option>MR1</option></select></label>
      <label className="preview-field"><span>Y axis</span><select disabled><option>SVD2</option></select></label>
      <label className="preview-range"><span>Edge scale <output>1.0×</output></span><input type="range" min="0" max="4" value="2" disabled /></label>
      <label className="preview-range"><span>Point scale <output>1.0×</output></span><input type="range" min="0" max="4" value="2" disabled /></label>
      <div className="preview-button-row"><button type="button" disabled>Flip X</button><button type="button" disabled>Flip Y</button><button type="button" disabled>Reset</button></div>
    </div>
  );
}

function StatsPanel() {
  return (
    <div className="preview-control-content">
      <PanelHeading index="04" label="Stats" title="Inference & diagnostics">
        Keep model fit, variance, and group comparison evidence beside the network.
      </PanelHeading>
      <div className="preview-tabs preview-stats-tabs" role="tablist" aria-label="Statistical views">
        {['Comparison', 'Goodness', 'Variance'].map((tab, index) => (
          <button key={tab} type="button" role="tab" aria-selected={index === 0} disabled>{tab}</button>
        ))}
      </div>
      <div className="preview-stat-grid">
        <article><span>Groups</span><strong>—</strong><small>Awaiting model</small></article>
        <article><span>Units</span><strong>—</strong><small>Awaiting model</small></article>
        <article><span>Dimensions</span><strong>—</strong><small>Awaiting model</small></article>
        <article><span>Explained</span><strong>—</strong><small>Awaiting model</small></article>
      </div>
      <div className="preview-empty-card">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11h3v8zm6 0V5h3v14zm6 0V8h3v11z" /></svg>
        <strong>No inferential result</strong>
        <p>Build a model before reviewing diagnostics or exporting methods.</p>
      </div>
      <button className="preview-secondary-action" type="button" disabled>Export methods report</button>
    </div>
  );
}

function ControlPanel({ mode }: { mode: Mode }) {
  if (mode === "data") return <DataPanel />;
  if (mode === "model") return <ModelPanel />;
  if (mode === "plot") return <PlotPanel />;
  if (mode === "stats") return <StatsPanel />;
  return <SetsPanel />;
}

function ResearchPlot({ compact = false, secondary = false }: { compact?: boolean; secondary?: boolean }) {
  const suffix = compact ? (secondary ? "secondary" : "primary") : "main";
  return (
    <svg className={compact ? "preview-mini-plot" : "preview-main-plot"} viewBox="0 0 640 430" role="img" aria-labelledby={`plot-title-${suffix} plot-desc-${suffix}`}>
      <title id={`plot-title-${suffix}`}>{compact ? `${secondary ? "Secondary" : "Primary"} illustrative ENA plot` : "Illustrative ENA comparison plot"}</title>
      <desc id={`plot-desc-${suffix}`}>A static network of five codes with weighted edges and two illustrative groups. It is not computed from user data.</desc>
      <g className="preview-plot-grid" fill="none" stroke="#E3EBEF" strokeWidth="1">
        {[-2, -1, 0, 1, 2].map((n) => <path key={`v-${n}`} d={`M${320 + n * 100} 35v350`} />)}
        {[-1, 0, 1].map((n) => <path key={`h-${n}`} d={`M70 ${215 + n * 90}h500`} />)}
      </g>
      <g className="preview-plot-axes" fill="none" stroke="#81909D" strokeWidth="1.4">
        <path d="M70 215h500M320 35v350" />
      </g>
      <g fill="#667786" fontFamily="Inter, Helvetica Neue, Arial, sans-serif" fontSize="11">
        <text x="526" y="205">MR1</text><text x="329" y="52">SVD2</text>
      </g>
      <g fill="none" strokeLinecap="round" opacity={compact ? .85 : 1}>
        <path d="M180 160 290 105" stroke="#89CFF0" strokeWidth="11" />
        <path d="M290 105 445 165" stroke="#24364A" strokeWidth="4" />
        <path d="M180 160 245 292" stroke="#24364A" strokeWidth="7" />
        <path d="M245 292 420 310" stroke="#89CFF0" strokeWidth="6" />
        <path d="M445 165 420 310" stroke="#24364A" strokeWidth="10" />
        <path d="M290 105 420 310" stroke="#89CFF0" strokeWidth="4" />
        <path d="M180 160 445 165" stroke="#24364A" strokeWidth="2.6" opacity=".65" />
      </g>
      {!compact && (
        <g opacity=".62">
          <g fill="#89CFF0"><circle cx="260" cy="175" r="5" /><circle cx="306" cy="190" r="5" /><circle cx="345" cy="164" r="5" /><circle cx="371" cy="205" r="5" /></g>
          <g fill="#25384D"><rect x="276" y="238" width="9" height="9" /><rect x="323" y="259" width="9" height="9" /><rect x="365" y="240" width="9" height="9" /><rect x="402" y="267" width="9" height="9" /></g>
          <path d="M319 187 342 250" stroke="#89CFF0" strokeWidth="3" strokeDasharray="7 6" />
        </g>
      )}
      <g stroke="#0F172A" strokeWidth="2.4">
        <circle cx="180" cy="160" r="14" fill="#FFFFFF" /><circle cx="290" cy="105" r="14" fill="#FFFFFF" /><circle cx="445" cy="165" r="14" fill="#89CFF0" /><circle cx="245" cy="292" r="14" fill="#FFFFFF" /><circle cx="420" cy="310" r="14" fill="#89CFF0" />
      </g>
      {!compact && (
        <g fill="#22354A" fontFamily="Inter, Helvetica Neue, Arial, sans-serif" fontSize="13" fontWeight="700">
          <text x="139" y="141">Evidence</text><text x="271" y="77">Ideas</text><text x="448" y="143">Discourse</text><text x="192" y="327">Reflection</text><text x="409" y="345">Agency</text>
        </g>
      )}
    </svg>
  );
}

export default function OpenEnaPreview() {
  const [mode, setMode] = useState<Mode>("sets");
  const activeModeLabel = modes.find((item) => item.id === mode)?.label ?? "Sets";

  return (
    <section id="workspace" className="workspace-section" aria-labelledby="workspace-title">
      <div className="section-heading workspace-heading">
        <div>
          <p className="eyebrow">INTERFACE PREVIEW</p>
          <h2 id="workspace-title">The Open ENA workbench, faithfully framed.</h2>
        </div>
        <p>Its analysis engine is deliberately disconnected while 3D ENA and ONA continue to evolve in the parent ENA project.</p>
      </div>
      <div className="preview-boundary" role="note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10v6m0-9h.01" /></svg>
        <div><strong>Static UI milestone</strong><span>Mode switching below demonstrates interface states only. The network is illustrative and no data is loaded, processed, retained, or exported.</span></div>
      </div>

      <div className="open-ena-preview" data-ui-preview="static">
        <nav className="preview-tool-rail" aria-label="Preview analysis modes">
          <div className="preview-rail-brand">
            <img src="/unified-home/logo-open-ena-mark.svg" alt="" width="42" height="42" />
            <span>OPEN ENA</span>
            <small>jENA target 0.6.2</small>
          </div>
          <div className="preview-rail-modes">
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={mode === item.id ? "step" : undefined}
                aria-label={`Show ${item.label} interface panel`}
                onClick={() => setMode(item.id)}
              >
                <ModeIcon mode={item.id} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="preview-rail-status"><span aria-hidden="true" /><strong>UI Preview</strong><small>Local</small></div>
        </nav>

        <p className="sr-only" aria-live="polite">Showing the {activeModeLabel} interface preview.</p>
        <aside className="preview-control-panel" aria-label={`${activeModeLabel} interface preview`}>
          <ControlPanel mode={mode} />
        </aside>

        <div className="preview-visual-workspace">
          <div className="preview-visual-toolbar">
            <div><p>Comparison plot</p><span>Illustrative sample · SVD research space</span></div>
            <div className="preview-toolbar-actions">
              <button type="button" disabled>Data View</button>
              <div role="group" aria-label="Visualization dimensions"><button type="button" aria-pressed="true" disabled>2D</button><button type="button" disabled>3D <small>later</small></button></div>
              <button type="button" disabled>Download Model</button>
            </div>
          </div>

          <div className="preview-analysis-layout">
            <figure className="preview-comparison-plot">
              <figcaption><div><strong>COMPARISON PLOT</strong><span>Illustrative network · not an analysis result</span></div><small>2D research space</small></figcaption>
              <ResearchPlot />
              <div className="preview-legend"><span><i className="legend-circle" />Illustrative group A</span><span><i className="legend-square" />Illustrative group B</span></div>
            </figure>

            <div className="preview-side-column">
              <figure><figcaption><div><strong>PRIMARY PLOT</strong><span>Illustrative group A</span></div><small>n = —</small></figcaption><ResearchPlot compact /></figure>
              <figure><figcaption><div><strong>SECONDARY PLOT</strong><span>Illustrative group B</span></div><small>n = —</small></figcaption><ResearchPlot compact secondary /></figure>
              <section className="preview-plot-tools" aria-label="Static plot controls">
                <header><span>PLOT TOOLS</span><small>Preview</small></header>
                <label><span>Edge scale <output>1.0×</output></span><input type="range" min="0" max="4" value="2" disabled /></label>
                <label><span>Point scale <output>1.0×</output></span><input type="range" min="0" max="4" value="2" disabled /></label>
                <div><button type="button" disabled>−</button><button type="button" disabled>Fit</button><button type="button" disabled>+</button></div>
              </section>
            </div>
          </div>
          <div className="preview-data-view"><strong>Data View</strong><span>No coded rows loaded in this static preview.</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg></div>
        </div>
      </div>
    </section>
  );
}
