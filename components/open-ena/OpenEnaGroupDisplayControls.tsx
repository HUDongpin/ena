"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { OpenEnaGroupDisplayCopy } from "@/lib/open-ena-i18n";
import {
  DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
  openEnaGroupUnitKey,
  resolveOpenEnaGroupDisplayOptions,
  type OpenEnaGroupDisplayOptions,
  type OpenEnaGroupDisplaySettingsByGroup,
} from "@/lib/open-ena/group-display";

export interface OpenEnaGroupDisplayControlGroup {
  /** Stable machine identity. Legacy callers may omit it and continue using name. */
  id?: string;
  /** Visible identity label. Legacy callers may omit it and continue using name. */
  label?: string;
  name: string;
  color: string;
  unitIds: string[];
  /** Own-key lookup from stable Unit IDs to visible labels. */
  unitLabelsById?: Readonly<Record<string, string>>;
}

export interface GroupDisclosureCommandV3 {
  revision: number;
  action: "collapse-all" | "open-all-options";
}

export interface OpenEnaGroupDisplayControlsProps {
  groups: OpenEnaGroupDisplayControlGroup[];
  settingsByGroup: OpenEnaGroupDisplaySettingsByGroup;
  hiddenUnitKeys: readonly string[];
  view: "2d" | "3d";
  copy?: OpenEnaGroupDisplayCopy;
  disabled?: boolean;
  disclosureCommand?: GroupDisclosureCommandV3;
  onSettingsChange: (groupName: string, patch: Partial<OpenEnaGroupDisplayOptions>) => void;
  onUnitVisibilityChange: (groupName: string, unitId: string, visible: boolean) => void;
  onRevealAllHidden: () => void;
}

const DEFAULT_GROUP_DISPLAY_COPY: OpenEnaGroupDisplayCopy = {
  title: "Plotted groups and units",
  description: "Visibility and group summaries are display-only; the fitted jENA result and Stats remain unchanged.",
  showAllHiddenLabel: "Show all hidden unit points",
  showAll: (count) => `Show all (${count})`,
  visibleCount: (group, visible, total) => `${group} · ${visible} of ${total} unit points visible`,
  displaySettings: (group) => `Display settings for ${group}`,
  showUnitPoints: "Show unit points",
  showMean: "Show mean",
  showConfidenceIntervals: "Show confidence intervals",
  showOutlierIntervals: "Show outlier intervals",
  includeHiddenPoints: "Include hidden points",
  settingLabel: (setting, group) => `${setting} for ${group}`,
  outlierTwoDBoundary: "Outlier guides use rENA-compatible mean ± 1.5 × IQR on each displayed axis; they do not remove points.",
  outlierThreeDBoundary: "Outlier intervals are currently available in 2D only.",
  meanRequiredBoundary: "Enable Show mean to display its confidence or outlier interval.",
  intervalRequiresTwoUnits: "Confidence and outlier intervals require at least two units in the displayed summary population.",
  searchUnits: "Search units",
  searchUnitsLabel: (group) => `Search units in ${group}`,
  unitListWindow: (shown, matching, total) => `Showing ${shown} of ${matching} matching units (${total} total).`,
  unitVisibility: (visible, total) => `Unit visibility · ${visible}/${total}`,
  unitAction: (visible, unitId, group) => `${visible ? "Hide" : "Show"} unit ${unitId} in ${group}`,
  hide: "Hide",
  show: "Show",
  keepOneVisible: "Keep one visible unit for summaries, or enable Include hidden points first.",
  derivationError: "Group display could not be derived safely. Restore hidden units or rebuild the current result before continuing.",
  hiddenStatus: (count) => `${count} unit point${count === 1 ? " is" : "s are"} hidden.`,
  shortcut: "Manage group/unit visibility and Mean, CI, or outlier guides →",
};

const MAX_RENDERED_UNIT_ACTIONS_PER_GROUP = 200;

function GroupSwitch({
  label,
  visibleLabel,
  checked,
  disabled,
  describedBy,
  onChange,
}: {
  label: string;
  visibleLabel: string;
  checked: boolean;
  disabled: boolean;
  describedBy?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="ena-group-display-switch">
      <span>{visibleLabel}</span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        aria-describedby={describedBy}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export default function OpenEnaGroupDisplayControls({
  groups,
  settingsByGroup,
  hiddenUnitKeys,
  view,
  copy = DEFAULT_GROUP_DISPLAY_COPY,
  disabled = false,
  disclosureCommand,
  onSettingsChange,
  onUnitVisibilityChange,
  onRevealAllHidden,
}: OpenEnaGroupDisplayControlsProps) {
  const headingId = useId();
  const [unitQueries, setUnitQueries] = useState<Record<string, string>>({});
  const [openByGroup, setOpenByGroup] = useState<Record<string, boolean>>({});
  const lastDisclosureCommand = useRef<GroupDisclosureCommandV3 | null>(null);
  const groupIds = groups.map((group) => group.id ?? group.name);
  const groupIdentity = JSON.stringify(groupIds);

  useEffect(() => {
    const priorCommand = lastDisclosureCommand.current;
    const explicitCommand = disclosureCommand !== undefined
      && (priorCommand?.revision !== disclosureCommand.revision
        || priorCommand.action !== disclosureCommand.action);
    const commandForNewGroups = explicitCommand ? disclosureCommand : priorCommand;
    setOpenByGroup((current) => Object.fromEntries(groupIds.map((groupId) => [
      groupId,
      explicitCommand
        ? disclosureCommand.action === "open-all-options"
        : Object.hasOwn(current, groupId)
          ? current[groupId]
          : commandForNewGroups?.action === "open-all-options",
    ])));
    if (explicitCommand) lastDisclosureCommand.current = disclosureCommand;
  }, [disclosureCommand?.action, disclosureCommand?.revision, groupIdentity]);

  const hidden = new Set(hiddenUnitKeys);
  const hiddenCount = groups.reduce((count, group) => (
    count + group.unitIds.filter((unitId) => hidden.has(openEnaGroupUnitKey(group.id ?? group.name, unitId))).length
  ), 0);

  return (
    <section
      className="ena-group-display-controls"
      data-testid="open-ena-group-display-controls"
      aria-labelledby={headingId}
    >
      <header className="ena-group-display-controls-heading">
        <div>
          <h3 id={headingId}>{copy.title}</h3>
          <p>{copy.description}</p>
        </div>
        <button
          type="button"
          className="ena-inline-link"
          aria-label={copy.showAllHiddenLabel}
          disabled={disabled || hiddenCount === 0}
          onClick={onRevealAllHidden}
        >
          {copy.showAll(hiddenCount)}
        </button>
      </header>

      <div className="ena-group-display-list">
        {groups.map((group, groupIndex) => {
          const groupId = group.id ?? group.name;
          const groupLabel = group.label ?? group.name;
          const unitLabels = new Map(Object.entries(group.unitLabelsById ?? {}));
          const unitLabel = (unitId: string) => unitLabels.get(unitId) ?? unitId;
          const settings = resolveOpenEnaGroupDisplayOptions(settingsByGroup, groupId);
          const visibleUnitIds = group.unitIds.filter((unitId) => (
            !hidden.has(openEnaGroupUnitKey(groupId, unitId))
          ));
          const individuallyVisibleCount = visibleUnitIds.length;
          const unitQuery = unitQueries[groupId] ?? "";
          const normalizedUnitQuery = unitQuery.trim().toLocaleLowerCase();
          const matchingUnitIds = normalizedUnitQuery
            ? group.unitIds.filter((unitId) => unitLabel(unitId).toLocaleLowerCase().includes(normalizedUnitQuery))
            : group.unitIds;
          const renderedUnitIds = matchingUnitIds.slice(0, MAX_RENDERED_UNIT_ACTIONS_PER_GROUP);
          const plottedCount = settings.showUnitPoints ? individuallyVisibleCount : 0;
          const summaryUnitCount = settings.includeHiddenPoints
            ? group.unitIds.length
            : individuallyVisibleCount;
          const meanRequiredId = `${headingId}-group-${groupIndex}-mean-required`;
          const intervalSampleId = `${headingId}-group-${groupIndex}-interval-sample`;
          const outlierBoundaryId = `${headingId}-group-${groupIndex}-outlier-boundary`;
          const keepOneVisibleId = `${headingId}-group-${groupIndex}-keep-one-visible`;
          const intervalDependencyIds = [
            !settings.showMean ? meanRequiredId : "",
            summaryUnitCount < 2 ? intervalSampleId : "",
          ].filter(Boolean).join(" ") || undefined;
          const outlierDescriptionIds = [
            intervalDependencyIds,
            outlierBoundaryId,
          ].filter(Boolean).join(" ");
          const outlierDisabled = disabled
            || view === "3d"
            || !settings.showMean
            || summaryUnitCount < 2;
          const includeHiddenDisabled = disabled
            || (settings.includeHiddenPoints && individuallyVisibleCount === 0);
          return (
            <details
              key={groupId}
              className="ena-group-display-group"
              open={openByGroup[groupId] ?? false}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setOpenByGroup((current) => current[groupId] === open
                  ? current
                  : { ...current, [groupId]: open });
              }}
            >
              <summary aria-label={copy.visibleCount(groupLabel, plottedCount, group.unitIds.length)}>
                <i
                  className="ena-group-display-swatch"
                  aria-hidden="true"
                  style={{ "--ena-group-display-color": group.color } as CSSProperties}
                />
                <span className="ena-group-display-name">{groupLabel}</span>
                <span className="sr-only">{copy.visibleCount(groupLabel, plottedCount, group.unitIds.length)}</span>
                <span className="ena-group-display-mean-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 12h16M12 4v16" />
                    <rect x="9" y="9" width="6" height="6" />
                  </svg>
                </span>
              </summary>

              <div className="ena-group-display-settings" role="group" aria-label={copy.displaySettings(groupLabel)}>
                <GroupSwitch
                  label={copy.settingLabel(copy.showUnitPoints, groupLabel)}
                  visibleLabel={copy.showUnitPoints}
                  checked={settings.showUnitPoints}
                  disabled={disabled}
                  onChange={(checked) => onSettingsChange(groupId, { showUnitPoints: checked })}
                />
                <GroupSwitch
                  label={copy.settingLabel(copy.showMean, groupLabel)}
                  visibleLabel={copy.showMean}
                  checked={settings.showMean}
                  disabled={disabled}
                  onChange={(checked) => onSettingsChange(groupId, { showMean: checked })}
                />
                <GroupSwitch
                  label={copy.settingLabel(copy.showConfidenceIntervals, groupLabel)}
                  visibleLabel={copy.showConfidenceIntervals}
                  checked={settings.showConfidenceIntervals}
                  disabled={disabled || !settings.showMean || summaryUnitCount < 2}
                  describedBy={intervalDependencyIds}
                  onChange={(checked) => onSettingsChange(groupId, { showConfidenceIntervals: checked })}
                />
                <GroupSwitch
                  label={copy.settingLabel(copy.showOutlierIntervals, groupLabel)}
                  visibleLabel={copy.showOutlierIntervals}
                  checked={settings.showOutlierIntervals}
                  disabled={outlierDisabled}
                  describedBy={outlierDescriptionIds}
                  onChange={(checked) => onSettingsChange(groupId, { showOutlierIntervals: checked })}
                />
                <GroupSwitch
                  label={copy.settingLabel(copy.includeHiddenPoints, groupLabel)}
                  visibleLabel={copy.includeHiddenPoints}
                  checked={settings.includeHiddenPoints}
                  disabled={includeHiddenDisabled}
                  onChange={(checked) => onSettingsChange(groupId, { includeHiddenPoints: checked })}
                />
                {view === "3d" ? (
                  <p id={outlierBoundaryId} className="ena-group-display-boundary" role="note">
                    {copy.outlierThreeDBoundary}
                  </p>
                ) : (
                  <p id={outlierBoundaryId} className="ena-group-display-boundary" role="note">
                    {copy.outlierTwoDBoundary}
                  </p>
                )}
                {!settings.showMean ? (
                  <p id={meanRequiredId} className="ena-group-display-boundary" role="note">
                    {copy.meanRequiredBoundary}
                  </p>
                ) : null}
                {summaryUnitCount < 2 ? (
                  <p id={intervalSampleId} className="ena-group-display-boundary" role="note">
                    {copy.intervalRequiresTwoUnits}
                  </p>
                ) : null}
              </div>

              <details className="ena-group-display-units">
                <summary>{copy.unitVisibility(individuallyVisibleCount, group.unitIds.length)}</summary>
                {group.unitIds.length > MAX_RENDERED_UNIT_ACTIONS_PER_GROUP ? (
                  <label className="ena-group-display-unit-search">
                    <span>{copy.searchUnits}</span>
                    <input
                      type="search"
                      aria-label={copy.searchUnitsLabel(groupLabel)}
                      value={unitQuery}
                      disabled={disabled}
                      onChange={(event) => setUnitQueries((current) => ({
                        ...current,
                        [groupId]: event.target.value,
                      }))}
                    />
                  </label>
                ) : null}
                {group.unitIds.length > MAX_RENDERED_UNIT_ACTIONS_PER_GROUP || normalizedUnitQuery ? (
                  <p className="ena-group-display-unit-window" role="status">
                    {copy.unitListWindow(renderedUnitIds.length, matchingUnitIds.length, group.unitIds.length)}
                  </p>
                ) : null}
                <ul>
                  {renderedUnitIds.map((unitId) => {
                    const isVisible = !hidden.has(openEnaGroupUnitKey(groupId, unitId));
                    const visibleUnitLabel = unitLabel(unitId);
                    const hidesLastSummaryUnit = isVisible
                      && individuallyVisibleCount <= 1
                      && !settings.includeHiddenPoints;
                    return (
                      <li key={unitId}>
                        <span>{visibleUnitLabel}</span>
                        <button
                          type="button"
                          aria-label={copy.unitAction(isVisible, visibleUnitLabel, groupLabel)}
                          aria-disabled={disabled || hidesLastSummaryUnit}
                          aria-describedby={hidesLastSummaryUnit ? keepOneVisibleId : undefined}
                          disabled={disabled}
                          title={hidesLastSummaryUnit
                            ? copy.keepOneVisible
                            : undefined}
                          onClick={() => {
                            if (!disabled && !hidesLastSummaryUnit) {
                              onUnitVisibilityChange(groupId, unitId, !isVisible);
                            }
                          }}
                        >
                          {isVisible ? copy.hide : copy.show}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {individuallyVisibleCount <= 1 && !settings.includeHiddenPoints ? (
                  <p id={keepOneVisibleId} className="ena-group-display-boundary" role="note">
                    {copy.keepOneVisible}
                  </p>
                ) : null}
              </details>
            </details>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">
        {copy.hiddenStatus(hiddenCount)}
      </p>
    </section>
  );
}

export { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS };
