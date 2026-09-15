import type {
  BackwardExtentV3,
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "./types";
import type { OpenEnaDirectionalMask } from "../types";

/** Seeded all-true masks stay below compiler-scale adjacency allocation. */
export const MAX_SEEDED_ONA_MASK_CODES_V3 = 256;

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
  if (codes.length === 0 || codes.length > MAX_SEEDED_ONA_MASK_CODES_V3) {
    return null;
  }
  return {
    schemaVersion: 1,
    codeOrder: [...codes],
    enabled: codes.map(() => codes.map(() => true)),
  };
}

function cloneTransferableOnaRowOrderV3(
  rowOrder: StandardEnaDraftV3["movingStanza"]["rowOrder"],
): OrderedNetworkDraftV3["rowOrder"] {
  if (rowOrder === null || rowOrder.kind !== "columns") return null;
  const keys = rowOrder.keys.map((key) => structuredClone(key));
  const [first, ...rest] = keys;
  return { kind: "columns", keys: [first, ...rest] };
}

function isDefaultEmptyOnaBackwardV3(extent: BackwardExtentV3): boolean {
  return extent.kind === "finite" && extent.value === 1;
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
    && draft.directionalMask === null
    && isDefaultEmptyOnaBackwardV3(draft.backward);
}

/**
 * Apply the fixed ONA scientific contract onto shared Standard mappings.
 * End Point, SVD, Frequency-sum, and forward=0 live in the compiler, not the draft.
 * The draft stores researcher mappings plus backward-only extent, row order, and mask.
 * Standard source-order receipts are family-bound and are not copied.
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
    rowOrder: cloneTransferableOnaRowOrderV3(standard.movingStanza.rowOrder),
    directionalMask: defaultOnaDirectionalMaskV3(codes),
  };
}
