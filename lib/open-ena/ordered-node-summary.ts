import type { Row } from "jena-js";
import { typedTupleIdentity, validateDirectionalMask } from "./network-config";
import type {
  OpenEnaConfig,
  OpenEnaOrderedResponseNodeGroupSummary,
  OpenEnaOrderedResponseNodeSummary,
} from "./types";

const ALL_UNITS_GROUP = "All units";

interface MutableGroupSummary {
  name: string;
  unitIdentities: Set<string>;
  responseCodeTotals: number[];
}

function addFiniteCount(total: number, value: number, label: string) {
  const next = total + value;
  if (!Number.isFinite(next)) {
    throw new Error(`ONA ${label} exceeds the finite numeric range.`);
  }
  return next;
}

function stableGroupName(row: Row, groupColumn: string | null) {
  if (groupColumn === null) return ALL_UNITS_GROUP;
  const value = row[groupColumn];
  if (value === null || value === undefined || value === "") {
    throw new Error(`ONA response-node summary requires a stable value for group column “${groupColumn}”.`);
  }
  return String(value);
}

function compareGroupNames(left: MutableGroupSummary, right: MutableGroupSummary) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

/**
 * Summarize raw response-node activity without retaining row-level identity.
 * Callers must pass the canonical rows from the executed analysis plan: their
 * order is irrelevant to totals, while their code cells have already crossed
 * the lossless ONA numeric-coercion boundary.
 */
export function buildOpenEnaOrderedResponseNodeSummary(
  rows: readonly Row[],
  config: OpenEnaConfig,
): OpenEnaOrderedResponseNodeSummary | undefined {
  if (config.analysisKind !== "ona") return undefined;

  const codeOrder = [...config.codes];
  const maskErrors = validateDirectionalMask(config.directionalMask, codeOrder);
  if (maskErrors.length > 0) {
    throw new Error(`ONA response-node summary code order is not strictly bound: ${maskErrors.join(" ")}`);
  }
  if (config.unitColumns.length === 0) {
    throw new Error("ONA response-node summary requires at least one analytic-unit column.");
  }

  const overallResponseCodeTotals = codeOrder.map(() => 0);
  const groupByName = new Map<string, MutableGroupSummary>();

  for (const [rowIndex, row] of rows.entries()) {
    const groupName = stableGroupName(row, config.groupColumn);
    let group = groupByName.get(groupName);
    if (!group) {
      group = {
        name: groupName,
        unitIdentities: new Set<string>(),
        responseCodeTotals: codeOrder.map(() => 0),
      };
      groupByName.set(groupName, group);
    }
    group.unitIdentities.add(typedTupleIdentity(
      row,
      config.unitColumns,
      "ONA response-node summary unit column",
    ));

    for (let codeIndex = 0; codeIndex < codeOrder.length; codeIndex += 1) {
      const code = codeOrder[codeIndex];
      const value = row[code];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(
          `ONA response-node summary code “${code}” at ordered row ${rowIndex + 1} must be a finite nonnegative number.`,
        );
      }
      overallResponseCodeTotals[codeIndex] = addFiniteCount(
        overallResponseCodeTotals[codeIndex],
        value,
        `overall response total for code “${code}”`,
      );
      group.responseCodeTotals[codeIndex] = addFiniteCount(
        group.responseCodeTotals[codeIndex],
        value,
        `group response total for code “${code}”`,
      );
    }
  }

  const groups: OpenEnaOrderedResponseNodeGroupSummary[] = [...groupByName.values()]
    .sort(compareGroupNames)
    .map((group) => ({
      name: group.name,
      unitCount: group.unitIdentities.size,
      responseCodeTotals: [...group.responseCodeTotals],
    }));

  return {
    schemaVersion: 1,
    codeOrder,
    overallResponseCodeTotals,
    groups,
  };
}
