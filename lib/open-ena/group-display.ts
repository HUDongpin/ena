import {
  buildPairwiseGroupContrast,
  WEB_ENA_MAX_POSITION_MODIFIER,
  type OpenEnaPairwiseContrast,
  type OpenEnaPairwiseContrastSide,
} from "./contrasts";
import type { OpenEnaResult } from "./types";

export interface OpenEnaGroupDisplayOptions {
  showUnitPoints: boolean;
  showMean: boolean;
  showConfidenceIntervals: boolean;
  showOutlierIntervals: boolean;
  includeHiddenPoints: boolean;
}

export const DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS: Readonly<OpenEnaGroupDisplayOptions> = Object.freeze({
  showUnitPoints: true,
  showMean: true,
  showConfidenceIntervals: true,
  showOutlierIntervals: false,
  includeHiddenPoints: false,
});

export type OpenEnaGroupDisplaySettingsByGroup = Record<string, OpenEnaGroupDisplayOptions>;

export interface OpenEnaResolvedGroupDisplaySide {
  name: string;
  settings: OpenEnaGroupDisplayOptions;
  totalUnitCount: number;
  validUnitCount: number;
  hiddenUnitCount: number;
  visibleUnitIds: string[];
  summaryUnitIds: string[];
}

export interface OpenEnaDerivedGroupDisplay {
  contrast: OpenEnaPairwiseContrast;
  primary: OpenEnaResolvedGroupDisplaySide;
  secondary: OpenEnaResolvedGroupDisplaySide;
  hiddenUnitKeys: string[];
}

export function openEnaGroupUnitKey(groupName: string, unitId: string) {
  return JSON.stringify([groupName, unitId]);
}

export function resolveOpenEnaGroupDisplayOptions(
  settingsByGroup: OpenEnaGroupDisplaySettingsByGroup,
  groupName: string,
): OpenEnaGroupDisplayOptions {
  return {
    ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
    ...settingsByGroup[groupName],
  };
}

function resolveSide(
  side: OpenEnaPairwiseContrastSide,
  settingsByGroup: OpenEnaGroupDisplaySettingsByGroup,
  hiddenUnitKeys: ReadonlySet<string>,
): OpenEnaResolvedGroupDisplaySide {
  const settings = resolveOpenEnaGroupDisplayOptions(settingsByGroup, side.name);
  const visibleUnitIds = side.unitIds.filter((unitId) => (
    !hiddenUnitKeys.has(openEnaGroupUnitKey(side.name, unitId))
  ));
  return {
    name: side.name,
    settings,
    totalUnitCount: side.unitIds.length,
    validUnitCount: side.points.filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)).length,
    hiddenUnitCount: side.unitIds.length - visibleUnitIds.length,
    visibleUnitIds,
    summaryUnitIds: settings.includeHiddenPoints ? [...side.unitIds] : [...visibleUnitIds],
  };
}

export function deriveOpenEnaGroupDisplay({
  result,
  contrast,
  settingsByGroup,
  hiddenUnitKeys,
}: {
  result: OpenEnaResult;
  contrast: OpenEnaPairwiseContrast;
  settingsByGroup: OpenEnaGroupDisplaySettingsByGroup;
  hiddenUnitKeys: readonly string[];
}): OpenEnaDerivedGroupDisplay {
  const hidden = new Set(hiddenUnitKeys);
  const primary = resolveSide(contrast.primary, settingsByGroup, hidden);
  const secondary = resolveSide(contrast.secondary, settingsByGroup, hidden);
  if (!primary.summaryUnitIds.length || !secondary.summaryUnitIds.length) {
    throw new Error("Each displayed group summary requires at least one visible unit, or Include Hidden Points must be enabled.");
  }

  const summaryUnitsByGroup = new Map([
    [primary.name, new Set(primary.summaryUnitIds)],
    [secondary.name, new Set(secondary.summaryUnitIds)],
  ]);
  const keepSummaryRow = (row: Record<string, unknown>) => {
    const groupName = String(row[contrast.groupColumn] ?? "");
    const selectedUnits = summaryUnitsByGroup.get(groupName);
    return !selectedUnits || selectedUnits.has(String(row.ENA_UNIT ?? ""));
  };
  const displayResult: OpenEnaResult = {
    ...result,
    set: {
      ...result.set,
      points: result.set.points.filter(keepSummaryRow),
      lineWeights: result.set.lineWeights.filter(keepSummaryRow),
    },
  };
  const displayContrast = buildPairwiseGroupContrast(
    displayResult,
    contrast.configuration,
    contrast.primary.name,
    contrast.secondary.name,
    contrast.axes,
    contrast.createdAt,
  );

  // A display-only unit filter keeps the canonical point-coordinate scale but
  // may expand the paper envelope so derived CI/outlier guides are not clipped.
  // It never shrinks the full-result frame or rewrites fitted provenance.
  displayContrast.coordinateExtent = { ...contrast.coordinateExtent };
  if (contrast.officialPlotFrame) {
    const canonicalFrame = contrast.officialPlotFrame;
    const derivedFrame = displayContrast.officialPlotFrame;
    const derivedMaximumInCanonicalScale = derivedFrame && derivedFrame.pointScaleFactor > 0
      ? (derivedFrame.maxPosition / derivedFrame.pointScaleFactor) * canonicalFrame.pointScaleFactor
      : 0;
    const maxPosition = Math.max(canonicalFrame.maxPosition, derivedMaximumInCanonicalScale);
    displayContrast.officialPlotFrame = {
      ...canonicalFrame,
      maxPosition,
      extremePosition: Math.max(
        canonicalFrame.extremePosition,
        maxPosition * WEB_ENA_MAX_POSITION_MODIFIER,
      ),
    };
  }
  displayContrast.declaredGroups = contrast.declaredGroups.map((group) => ({ ...group }));
  displayContrast.resultProvenance = structuredClone(contrast.resultProvenance);
  displayContrast.geometry = structuredClone(contrast.geometry);

  return {
    contrast: displayContrast,
    primary,
    secondary,
    hiddenUnitKeys: [...hidden],
  };
}
