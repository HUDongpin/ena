import { deepFreezeV3 } from "./canonical-json";
import type {
  BackwardExtentV3,
  CanonicalRowOrderV3,
  ForwardExtentV3,
  ModelWorkspaceDraftsV3,
  OrderComparatorV3,
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "./types";
import { analysisKindFor } from "../network-config";
import type {
  OpenEnaConfig,
  OpenEnaDirectionalMask,
  OpenEnaOrderComparator,
} from "../types";

export type MigrationReviewReasonV3 =
  | "row-order"
  | "horizon-order"
  | "means-direction"
  | "reference-content-hash"
  | "ona-directional-mask"
  | "ona-text-collation";

export interface MigratedModelDraftV3 extends ModelWorkspaceDraftsV3 {
  readonly requiresReview: readonly MigrationReviewReasonV3[];
  readonly autoRun: false;
}

function stringListV3(value: readonly string[], label: string): string[] {
  if (!Array.isArray(value)
    || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
    || new Set(value).size !== value.length) {
    throw new TypeError(`${label} must contain distinct nonblank strings.`);
  }
  return [...value];
}

function extentV3(value: number, backward: boolean): BackwardExtentV3 | ForwardExtentV3 {
  if (value === Number.POSITIVE_INFINITY) return { kind: "infinity" };
  const minimum = backward ? 1 : 0;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`Legacy ${backward ? "backward" : "forward"} extent is invalid.`);
  }
  return { kind: "finite", value };
}

function cloneMaskV3(mask: OpenEnaDirectionalMask | null | undefined): OpenEnaDirectionalMask | null {
  if (mask == null) return null;
  if (mask.schemaVersion !== 1
    || !Array.isArray(mask.codeOrder)
    || !Array.isArray(mask.enabled)) {
    throw new TypeError("Legacy ONA directional mask is malformed.");
  }
  const codeOrder = stringListV3(mask.codeOrder, "Legacy ONA mask codeOrder");
  if (mask.enabled.length !== codeOrder.length) {
    throw new TypeError("Legacy ONA directional mask must be square.");
  }
  const enabled = mask.enabled.map((row) => {
    if (!Array.isArray(row)
      || row.length !== codeOrder.length
      || row.some((cell) => typeof cell !== "boolean")) {
      throw new TypeError("Legacy ONA directional mask must be a square Boolean matrix.");
    }
    return [...row];
  });
  return { schemaVersion: 1, codeOrder, enabled };
}

function emptyStandardDraftV3(): StandardEnaDraftV3 {
  return {
    unitColumns: [],
    horizonColumns: [],
    groupColumn: null,
    codes: [],
    weighting: "binary",
    model: "EndPoint",
    windowType: "Conversation",
    movingStanza: {
      backward: { kind: "finite", value: 1 },
      forward: { kind: "finite", value: 0 },
      rowOrder: null,
    },
    horizonOrder: null,
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
}

function emptyOnaDraftV3(): OrderedNetworkDraftV3 {
  return {
    unitColumns: [],
    horizonColumns: [],
    groupColumn: null,
    codes: [],
    backward: { kind: "finite", value: 1 },
    rowOrder: null,
    directionalMask: null,
  };
}

function standardRotationV3(config: OpenEnaConfig): StandardEnaDraftV3["rotation"] {
  if (config.rotation === "svd") {
    return { type: "svd", centerAlignToOrigin: config.centerAlignToOrigin };
  }
  if (config.rotation === "mean") {
    return {
      type: "means",
      centerAlignToOrigin: config.centerAlignToOrigin,
      negativeLevel: null,
      positiveLevel: null,
    };
  }
  if (config.rotation === "reference") {
    return {
      type: "reference",
      referenceId: config.referenceRotationId,
      expectedContentSha256: null,
    };
  }
  throw new TypeError("Legacy Standard rotation is unsupported.");
}

function standardDraftV3(config: OpenEnaConfig): StandardEnaDraftV3 {
  if (config.model !== "EndPoint"
    && config.model !== "SeparateTrajectory"
    && config.model !== "AccumulatedTrajectory") {
    throw new TypeError("Legacy Standard model is unsupported.");
  }
  if (config.window !== "MovingStanzaWindow" && config.window !== "Conversation") {
    throw new TypeError("Legacy Standard window is unsupported.");
  }
  return {
    unitColumns: stringListV3(config.unitColumns, "Legacy Unit columns"),
    horizonColumns: stringListV3(config.conversationColumns, "Legacy Horizon columns"),
    groupColumn: config.groupColumn,
    codes: stringListV3(config.codes, "Legacy Code columns"),
    weighting: config.weightBy === "sum" ? "frequency" : "binary",
    model: config.model,
    windowType: config.window,
    movingStanza: {
      backward: extentV3(config.windowSizeBack, true),
      forward: extentV3(config.windowSizeForward, false),
      rowOrder: null,
    },
    horizonOrder: null,
    rotation: standardRotationV3(config),
  };
}

function comparatorV3(comparator: OpenEnaOrderComparator): {
  comparator: OrderComparatorV3;
  needsTextReview: boolean;
} {
  switch (comparator) {
    case "number":
      return { comparator: { type: "number" }, needsTextReview: false };
    case "boolean":
      return {
        comparator: {
          type: "ordered-category",
          levels: [
            { type: "boolean", value: false },
            { type: "boolean", value: true },
          ],
        },
        needsTextReview: false,
      };
    case "iso-datetime":
      return {
        comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" },
        needsTextReview: false,
      };
    case "string":
      return {
        comparator: { type: "text", locale: "und", sensitivity: "variant", numeric: false },
        needsTextReview: true,
      };
    default:
      throw new TypeError("Legacy ONA order comparator is unsupported.");
  }
}

function onaOrderV3(config: OpenEnaConfig): {
  rowOrder: CanonicalRowOrderV3 | null;
  needsTextReview: boolean;
} {
  const policy = config.orderPolicy;
  if (policy == null || policy.kind === "source-row") {
    return { rowOrder: null, needsTextReview: false };
  }
  const columns = stringListV3(policy.columns, "Legacy ONA order columns");
  if (columns.length === 0) throw new TypeError("Legacy ONA order columns must be nonempty.");
  let needsTextReview = false;
  const keys = columns.map((column) => {
    const legacyComparator = policy.comparators[column];
    if (legacyComparator === undefined) {
      throw new TypeError(`Legacy ONA order column ${JSON.stringify(column)} has no comparator.`);
    }
    const mapped = comparatorV3(legacyComparator);
    needsTextReview ||= mapped.needsTextReview;
    return { column, direction: "ascending" as const, comparator: mapped.comparator };
  });
  const [first, ...rest] = keys;
  return { rowOrder: { kind: "columns", keys: [first, ...rest] }, needsTextReview };
}

function onaDraftV3(config: OpenEnaConfig): {
  draft: OrderedNetworkDraftV3;
  requiresReview: MigrationReviewReasonV3[];
} {
  const order = onaOrderV3(config);
  const directionalMask = cloneMaskV3(config.directionalMask);
  const requiresReview: MigrationReviewReasonV3[] = [];
  if (order.rowOrder === null) requiresReview.push("row-order");
  if (order.needsTextReview) requiresReview.push("ona-text-collation");
  if (directionalMask === null) requiresReview.push("ona-directional-mask");
  return {
    draft: {
      unitColumns: stringListV3(config.unitColumns, "Legacy Unit columns"),
      horizonColumns: stringListV3(config.conversationColumns, "Legacy Horizon columns"),
      groupColumn: config.groupColumn,
      codes: stringListV3(config.codes, "Legacy Code columns"),
      backward: extentV3(config.windowSizeBack, true),
      rowOrder: order.rowOrder,
      directionalMask,
    },
    requiresReview,
  };
}

function assertLegacyFamilyIsolationV3(config: OpenEnaConfig, family: "ena" | "ona"): void {
  if (family === "ena") {
    if (config.orderPolicy != null || config.directionalMask != null) {
      throw new TypeError("Legacy Standard configuration cannot carry ONA-only order or mask fields.");
    }
    if (config.weightBy !== "binary" && config.weightBy !== "sum") {
      throw new TypeError("Legacy Standard weighting is unsupported.");
    }
    return;
  }
  if (config.model !== "EndPoint"
    || config.window !== "MovingStanzaWindow"
    || config.windowSizeForward !== 0
    || config.weightBy !== "sum"
    || config.rotation !== "svd"
    || config.referenceRotationId !== null
    || config.centerAlignToOrigin !== true) {
    throw new TypeError("Legacy ONA configuration violates the fixed ONA family contract.");
  }
}

export function migrateLegacyOpenEnaConfigToDraftV3(
  config: OpenEnaConfig,
): MigratedModelDraftV3 {
  const family = analysisKindFor(config);
  assertLegacyFamilyIsolationV3(config, family);
  if (family === "ona") {
    const migrated = onaDraftV3(config);
    return deepFreezeV3({
      schemaVersion: 3,
      activeFamily: "ona",
      standard: emptyStandardDraftV3(),
      ona: migrated.draft,
      requiresReview: migrated.requiresReview,
      autoRun: false,
    });
  }
  const requiresReview: MigrationReviewReasonV3[] = [
    ...(config.window === "MovingStanzaWindow" ? ["row-order" as const] : []),
    ...(config.model === "EndPoint" ? [] : ["horizon-order" as const]),
    ...(config.rotation === "mean" ? ["means-direction" as const] : []),
    ...(config.rotation === "reference" ? ["reference-content-hash" as const] : []),
  ];
  return deepFreezeV3({
    schemaVersion: 3,
    activeFamily: "standard",
    standard: standardDraftV3(config),
    ona: emptyOnaDraftV3(),
    requiresReview,
    autoRun: false,
  });
}
