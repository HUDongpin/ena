import type { Locale } from "../../lib/i18n";
import type { GroupNetwork } from "../../lib/open-ena/types";
import type { buildTrajectoryPresentationV3 } from "../../lib/open-ena/trajectory-presentation-v3";
import { trajectoryCopyV3 } from "../../lib/open-ena/trajectory-copy-v3";
import { groupFigureName2D } from "../../lib/open-ena/group-label-layout-2d";

function LegendSymbol({ kind, color = "#526269" }: { kind: "group" | "centroid" | "unit" | "ci"; color?: string }) {
  return <svg className="ena-trajectory-key-icon" width="26" height="18" viewBox="0 0 26 18" aria-hidden="true" focusable="false">
    {kind === "group" ? <><line x1="1" y1="9" x2="25" y2="9" stroke="#000" strokeWidth="1.5" /><rect x="9" y="5" width="8" height="8" fill="#fff" stroke={color} strokeWidth="1.4" /></>
      : kind === "centroid" ? <rect x="9" y="5" width="8" height="8" fill="#eef2f3" stroke={color} strokeWidth="1.2" />
        : kind === "unit" ? <circle cx="13" cy="9" r="3.5" fill="#eef2f3" stroke={color} strokeWidth="1.2" />
          : <line x1="3" y1="9" x2="23" y2="9" stroke={color} strokeWidth="1.5" strokeDasharray="0.1 3" strokeLinecap="round" />}
  </svg>;
}

export default function OpenEnaTrajectoryLegend({ trajectory, groups, locale = "en" }: {
  trajectory: ReturnType<typeof buildTrajectoryPresentationV3>;
  groups: readonly GroupNetwork[];
  locale?: Locale;
}) {
  const copy = trajectoryCopyV3(locale);
  const unavailable = trajectory.uncertaintyStatus === "unavailable" || trajectory.centroids.some(centroid =>
    Object.values(centroid.intervals ?? {}).some(interval => interval.status === "not-estimable"));
  return <aside className="ena-trajectory-legend" aria-label={`${copy.groups} · ${copy.periods}`} data-ena-trajectory-legend="true">
    <section><h3>{copy.groups}</h3><ul className="ena-trajectory-group-keys">{groups.map(group => <li key={group.name} title={group.name} aria-label={group.name}>
      <LegendSymbol kind="group" color={group.color} /><span className="ena-trajectory-key-label">{groupFigureName2D(group.name, trajectory.groupLabels)}</span>
    </li>)}</ul></section>
    <section><h3>{copy.periods}</h3><ul className="ena-trajectory-period-keys">{trajectory.horizonStyles.map(period => <li key={period.horizonKey} title={period.detail}>
      <span className="ena-trajectory-period-key" style={{ backgroundColor: period.color }} aria-hidden="true" /><span>{period.label}</span>
    </li>)}</ul></section>
    <div className="ena-trajectory-symbol-keys">
      <span><LegendSymbol kind="centroid" /><span>{copy.centroid}</span></span>
      <span><LegendSymbol kind="unit" /><span>{copy.units}</span></span>
      {trajectory.showConfidenceIntervals && <span data-ena-ci-legend="true"><LegendSymbol kind="ci" /><span>{copy.ci}</span></span>}
    </div>
    {trajectory.uncertaintyStatus === "pending" && trajectory.showConfidenceIntervals && <p role="status" data-ena-ci-status="pending">{copy.pending}</p>}
    {unavailable && trajectory.showConfidenceIntervals && <p role="status" data-ena-ci-status="unavailable">{copy.unavailable}</p>}
    <style>{`
      .open-ena-plot-figure:has(.ena-trajectory-figure-layout), .open-ena-interactive-3d-figure:has(.ena-trajectory-figure-layout) { container: ena-trajectory / inline-size; min-width: 0; }
      .ena-trajectory-figure-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; align-items: start; }
      .ena-trajectory-canvas { min-width: 0; position: relative; }
      .ena-trajectory-canvas > svg { display: block; width: 100%; height: auto; }
      .ena-trajectory-legend { box-sizing: border-box; border: 1px solid #d6dedf; border-radius: 4px; background: #fff; color: #263740; padding: 12px; font: 12px/1.5 Arial, Helvetica, sans-serif; max-height: 22rem; overflow: auto; min-width: 0; overflow-wrap: anywhere; }
      .ena-trajectory-legend section + section { margin-top: 14px; }
      .ena-trajectory-legend h3 { margin: 0 0 7px; font-size: 12px; font-weight: 700; color: #344b55; }
      .ena-trajectory-legend ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px 10px; }
      .ena-trajectory-legend li { display: flex; align-items: center; gap: 8px; min-width: 0; line-height: 1.45; }
      .ena-trajectory-group-keys li { display: grid; grid-template-columns: 26px minmax(0,1fr); min-height: 22px; }
      .ena-trajectory-key-icon { display: block; flex-shrink: 0; }
      .ena-trajectory-key-label { font-weight: 600; }
      .ena-trajectory-period-key { display: inline-block; width: 9px; height: 9px; border: 1px solid #65777c; border-radius: 50%; flex: 0 0 auto; }

      .ena-trajectory-symbol-keys { display: grid; gap: 7px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e6eced; }
      .ena-trajectory-symbol-keys > span { display: grid; grid-template-columns: 26px minmax(0,1fr); gap: 8px; align-items: center; line-height: 1.4; }
      .ena-trajectory-legend [role=status] { margin: 8px 0 0; font-size: 11px; }
      @container ena-trajectory (min-width: 576px) { .ena-trajectory-legend ul { grid-template-columns: repeat(3,minmax(0,1fr)); } }
      @container ena-trajectory (min-width: 992px) { .ena-trajectory-figure-layout { grid-template-columns: minmax(0,1fr) 13rem; } .ena-trajectory-legend { max-height: min(90vh,42rem); } .ena-trajectory-legend ul { grid-template-columns: minmax(0,1fr); } }
      .open-ena-interactive-3d-figure[data-ena-native-trajectory=true]:fullscreen,
      .open-ena-interactive-3d-figure[data-ena-native-trajectory=true][data-fallback-fullscreen=true] { display: flex !important; flex-direction: column; min-height: 0; }
      .open-ena-interactive-3d-figure[data-ena-native-trajectory=true]:fullscreen .ena-trajectory-figure-layout,
      .open-ena-interactive-3d-figure[data-ena-native-trajectory=true][data-fallback-fullscreen=true] .ena-trajectory-figure-layout { flex: 1; min-height: 0; overflow: auto; }
    `}</style>
  </aside>;
}
