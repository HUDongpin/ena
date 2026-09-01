export type OpenEnaUnitPointStyle =
  | "solid"
  | "inner-ring"
  | "center-dot"
  | "horizontal-bar"
  | "plus"
  | "cross";

const OPEN_ENA_UNIT_POINT_STYLES: readonly OpenEnaUnitPointStyle[] = [
  "solid",
  "inner-ring",
  "center-dot",
  "horizontal-bar",
  "plus",
  "cross",
];

export function openEnaUnitPointStyleAssignments(
  groupNames: readonly string[],
): ReadonlyMap<string, OpenEnaUnitPointStyle> {
  const names = [...new Set(groupNames)].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  return new Map(names.map((name, index) => [
    name,
    OPEN_ENA_UNIT_POINT_STYLES[index % OPEN_ENA_UNIT_POINT_STYLES.length],
  ]));
}
