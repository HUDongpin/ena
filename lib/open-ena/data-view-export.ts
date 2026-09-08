import type { BoundResultV3 } from "./model-v3/types";
import { deepFreezeV3 } from "./model-v3/canonical-json";
import { assertCurrentCapabilityV3 } from "./inference-consumers-v3";

import type { Row } from "jena-js";

export type OpenEnaDataViewExportColumnKind =
  | "provenance"
  | "metadata"
  | "code"
  | "directed-edge";

export interface OpenEnaDataViewExportColumn {
  key: string;
  label: string;
  kind: OpenEnaDataViewExportColumnKind;
}

export interface OpenEnaDataViewExportRow {
  id: string;
  values: Readonly<
    Record<string, string | number | boolean | null | undefined>
  >;
}

export function buildOpenEnaDataViewExportRows(input: {
  columns: ReadonlyArray<OpenEnaDataViewExportColumn>;
  rows: ReadonlyArray<OpenEnaDataViewExportRow>;
  groupLabels: Readonly<Record<OpenEnaDataViewExportColumnKind, string>>;
}): Row[] {
  const headers = input.columns.map((column) => {
    const group = input.groupLabels[column.kind]?.trim();
    const label = column.label.trim();
    if (!group || !label) {
      throw new Error(
        "Data View export columns require non-empty display labels.",
      );
    }
    return `${group} · ${label}`;
  });
  if (new Set(headers).size !== headers.length) {
    throw new Error(
      "Data View export requires unique display headers; rename duplicate columns before export.",
    );
  }
  return input.rows.map(
    (row) =>
      Object.fromEntries(
        input.columns.map((column, index) => [
          headers[index],
          row.values[column.key] ?? null,
        ]),
      ) as Row,
  );
}

/** Historical formatting of already admitted science establishes no current or
 * source authority. Current export uses the independent-plan guard below. */
export function buildHistoricalDataViewV3(input: BoundResultV3) {
  const result = structuredClone(input),
    p = result.executionProvenance;
  const units = new Map(
    p.identityDictionary.units.map((e) => [e.displayLabel, e]),
  );
  const horizons = new Map(
    p.identityDictionary.horizons.map((e) => [e.displayLabel, e]),
  );
  const horizonsByToken = new Map(
    p.identityDictionary.horizons.map((e) => [e.token, e]),
  );
  const groups = new Map(p.identityDictionary.groups.map((e) => [e.token, e]));
  const unitGroups = new Map(
    p.unitGroups.map((e) => [e.unitToken, e.groupToken]),
  );
  const ordinals = new Map<string, Map<string, number>>();
  const order = p.ordering.resolvedHorizonOrder;
  if (order.type === "trajectory-horizon-order")
    for (const unit of order.unitSequences)
      ordinals.set(
        unit.unitToken,
        new Map(unit.steps.map((s) => [s.horizonToken, s.trajectoryOrdinal])),
      );
  const sourceColumns = [
    ...new Set([
      ...result.configuration.units.columns,
      ...result.configuration.horizons.columns,
      ...(result.configuration.units.group.type === "none"
        ? []
        : [result.configuration.units.group.column]),
    ]),
  ];
  const used = new Set(sourceColumns);
  function allocate(label: string) {
    let value = label,
      index = 2;
    while (used.has(value)) value = `${label} (${index++})`;
    used.add(value);
    return value;
  }
  const metadataColumns = {
    trajectoryOrdinal: allocate("Trajectory ordinal"),
    observedHorizons: allocate("Observed Horizons"),
    observedSourceRowIndices: allocate("Observed source row indices (0-based)"),
  };
  const axes = result.set.rotation.rotationColumns.filter((axis) =>
    result.set.points.every((point) => typeof point[axis] === "number"),
  );
  const coordinateColumns = Object.fromEntries(
    axes.map((axis) => [axis, allocate(axis)]),
  );
  const rows: Row[] = result.set.points.map((point) => {
    const unit = units.get(String(point.Unit));
    if (!unit) throw new TypeError("Data View point has an unknown bound Unit");
    const horizon = ordinals.size
      ? horizons.get(String(point.Horizon))
      : undefined;
    if (ordinals.size && !horizon)
      throw new TypeError("Data View trajectory lacks its observed Horizon");
    const groupToken = unitGroups.get(unit.token),
      group = groupToken ? groups.get(groupToken) : undefined;
    const values = Object.fromEntries(
      sourceColumns.map((column) => [column, null]),
    ) as Row;
    for (const field of [
      ...unit.fields,
      ...(horizon?.fields ?? []),
      ...(group?.fields ?? []),
    ])
      values[field.column] = field.value.value;
    values[metadataColumns.trajectoryOrdinal] = horizon
      ? (ordinals.get(unit.token)?.get(horizon.token) ?? null)
      : null;
    values[metadataColumns.observedHorizons] = horizon
      ? JSON.stringify([horizon.fields])
      : null;
    // Bound materialization intentionally omits raw rows and source-to-Unit
    // membership. Global traversal is not point membership or contribution.
    values[metadataColumns.observedSourceRowIndices] = null;
    for (const axis of axes) values[coordinateColumns[axis]] = point[axis];
    return values;
  });
  const rowOrder = p.ordering.resolvedRowOrder;
  const mapping = new Map(
    rowOrder.type === "within-horizon-order"
      ? rowOrder.mappings.map((e) => [e.sourceRowIndex, e])
      : [],
  );
  const sourceTraversal = p.ordering.runtimeSourceRowIndices.map(
    (sourceRowIndex, runtimeOrdinal) => {
      const entry = mapping.get(sourceRowIndex);
      return {
        sourceRowIndex,
        runtimeOrdinal,
        horizon: entry ? horizonsByToken.get(entry.horizonToken)!.fields : null,
        withinHorizonOrdinal: entry?.withinHorizonOrdinal ?? null,
      };
    },
  );
  return deepFreezeV3({
    schemaVersion: 3 as const,
    kind: "open-ena-bound-data-view" as const,
    currentness: "not-established" as const,
    binding: result.binding,
    rows,
    metadataColumns,
    coordinateColumns,
    sourceTraversal,
    sourceIndexMeaning:
      "Global retained source-row traversal uses zero-based indices. Per-point observed source membership is unavailable; these indices are not network contribution evidence. EndPoint observed Horizons are unavailable because the bound model retains no source-to-Unit membership.",
  });
}

export async function buildDataViewV3(
  result: unknown,
  independentPlan: unknown,
) {
  const bound = await assertCurrentCapabilityV3(
    result,
    independentPlan,
    "export-current-model",
  );
  return deepFreezeV3({
    ...buildHistoricalDataViewV3(bound),
    currentness: "independent-plan-validated" as const,
  });
}
export async function buildDataViewRowsV3(
  result: unknown,
  independentPlan: unknown,
): Promise<Row[]> {
  return (await buildDataViewV3(result, independentPlan)).rows;
}
