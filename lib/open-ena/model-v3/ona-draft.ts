import type {
  BackwardExtentV3,
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "./types";
import type { OpenEnaDirectionalMask } from "../types";

function cloneBackwardExtentV3(extent: BackwardExtentV3): BackwardExtentV3 {
  if (extent.kind === "infinity") return { kind: "infinity" };
  return {
    kind: "finite",
    value: extent.value < 1 ? 1 : extent.value,
  };
}

function defaultOnaDirectionalMaskV3(
  codes: readonly string[],
): OpenEnaDirectionalMask | null {
  if (codes.length === 0) return null;
  return {
    schemaVersion: 1,
    codeOrder: [...codes],
    enabled: codes.map(() => codes.map(() => true)),
  };
}

/** True when the ONA sibling has never received researcher or seeded contract fields. */
export function isUnseededOrderedNetworkDraftV3(
  draft: OrderedNetworkDraftV3,
): boolean {
  return draft.unitColumns.length === 0
    && draft.horizonColumns.length === 0
    && draft.groupColumn === null
    && draft.codes.length === 0
    && draft.rowOrder === null
    && draft.directionalMask === null;
}

/**
 * Apply the fixed ONA scientific contract onto shared Standard mappings.
 * End Point, SVD, Frequency-sum, and forward=0 live in the compiler, not the draft.
 * The draft stores researcher mappings plus backward-only extent, row order, and mask.
 */
export function seedOrderedNetworkDraftFromStandardV3(
  standard: StandardEnaDraftV3,
): OrderedNetworkDraftV3 {
  const codes = [...standard.codes];
  return {
    unitColumns: [...standard.unitColumns],
    horizonColumns: [...standard.horizonColumns],
    groupColumn: standard.groupColumn,
    codes,
    backward: cloneBackwardExtentV3(standard.movingStanza.backward),
    rowOrder: standard.movingStanza.rowOrder,
    directionalMask: defaultOnaDirectionalMaskV3(codes),
  };
}
