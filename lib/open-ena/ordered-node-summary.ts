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
  responseCodeTotals: number[][];
}

/**
 * Add one finite value to a non-overlapping floating-point expansion. This is
 * the error-free partials step used by robust summation algorithms: every bit
 * lost by the rounded high word is retained in a low word for the final sum.
 */
function addFiniteCount(partials: number[], value: number, label: string) {
  let next = value;
  let retained = 0;
  for (const partial of partials) {
    let highWord = next;
    let lowWord = partial;
    if (Math.abs(highWord) < Math.abs(lowWord)) {
      [highWord, lowWord] = [lowWord, highWord];
    }
    const high = highWord + lowWord;
    if (!Number.isFinite(high)) {
      throw new Error(`ONA ${label} exceeds the finite numeric range.`);
    }
    const low = lowWord - (high - highWord);
    if (low !== 0) {
      partials[retained] = low;
      retained += 1;
    }
    next = high;
  }
  partials.length = retained;
  if (next !== 0) partials.push(next);
}

/** Finish the expansion with the correctly directed half-even fix at a tie. */
function finiteCountTotal(partials: readonly number[], label: string) {
  const remaining = [...partials];
  if (remaining.length === 0) return 0;

  let high = remaining.pop()!;
  let low = 0;
  while (remaining.length > 0) {
    const previousHigh = high;
    const next = remaining.pop()!;
    high = previousHigh + next;
    if (!Number.isFinite(high)) {
      throw new Error(`ONA ${label} exceeds the finite numeric range.`);
    }
    low = next - (high - previousHigh);
    if (low !== 0) break;
  }
  const nextPartial = remaining[remaining.length - 1];
  if (nextPartial !== undefined
    && ((low < 0 && nextPartial < 0) || (low > 0 && nextPartial > 0))) {
    const doubledLow = low * 2;
    const adjusted = high + doubledLow;
    if (!Number.isFinite(adjusted)) {
      throw new Error(`ONA ${label} exceeds the finite numeric range.`);
    }
    if (adjusted - high === doubledLow) high = adjusted;
  }
  return high;
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

  const overallResponseCodeTotals = codeOrder.map(() => [] as number[]);
  const groupByName = new Map<string, MutableGroupSummary>();

  for (const [rowIndex, row] of rows.entries()) {
    const groupName = stableGroupName(row, config.groupColumn);
    let group = groupByName.get(groupName);
    if (!group) {
      group = {
        name: groupName,
        unitIdentities: new Set<string>(),
        responseCodeTotals: codeOrder.map(() => [] as number[]),
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
      addFiniteCount(
        overallResponseCodeTotals[codeIndex],
        value,
        `overall response total for code “${code}”`,
      );
      addFiniteCount(
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
      responseCodeTotals: group.responseCodeTotals.map((partials, codeIndex) => finiteCountTotal(
        partials,
        `group “${group.name}” response total for code “${codeOrder[codeIndex]}”`,
      )),
    }));

  return {
    schemaVersion: 1,
    codeOrder,
    overallResponseCodeTotals: overallResponseCodeTotals.map((partials, codeIndex) => finiteCountTotal(
      partials,
      `overall response total for code “${codeOrder[codeIndex]}”`,
    )),
    groups,
  };
}
