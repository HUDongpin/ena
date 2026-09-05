import { captureBundleJsonV3 } from "./bundle-json-v3";
import { decodeCanonicalRowOrderV3 } from "./model-v3/schema";
import type {
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "./model-v3/types";

type DraftFamilyV3 = "standard" | "ona";
type DraftRecordV3 = Record<string, unknown>;

const STANDARD_DRAFT_KEYS = [
  "unitColumns", "horizonColumns", "groupColumn", "codes", "weighting",
  "model", "windowType", "movingStanza", "horizonOrder", "rotation",
] as const;
const ONA_DRAFT_KEYS = [
  "unitColumns", "horizonColumns", "groupColumn", "codes", "backward",
  "rowOrder", "directionalMask",
] as const;

function record(value: unknown, label: string): DraftRecordV3 {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain draft object.`);
  }
  return value as DraftRecordV3;
}

function exactShape(value: DraftRecordV3, keys: readonly string[], label: string): void {
  const actual = Object.keys(value);
  const allowed = new Set(keys);
  if (actual.length !== keys.length
    || actual.some((key) => !allowed.has(key))
    || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} has an invalid or mixed-family draft shape.`);
  }
}

function stringArray(value: unknown, label: string): void {
  if (!Array.isArray(value)
    || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new TypeError(`${label} must be an array of nonempty strings.`);
  }
}

function nullableString(value: unknown, label: string): void {
  if (value !== null && (typeof value !== "string" || value.length === 0)) {
    throw new TypeError(`${label} must be null or a nonempty string.`);
  }
}

function extent(value: unknown, label: string): void {
  const input = record(value, label);
  if (input.kind === "infinity") {
    exactShape(input, ["kind"], label);
    return;
  }
  if (input.kind === "finite") {
    exactShape(input, ["kind", "value"], label);
    if (typeof input.value !== "number" || !Number.isSafeInteger(input.value)) {
      throw new TypeError(`${label}.value must be a finite safe integer.`);
    }
    return;
  }
  throw new TypeError(`${label}.kind is unsupported.`);
}

function nullableOrder(value: unknown, label: string): void {
  if (value !== null) {
    try {
      decodeCanonicalRowOrderV3(value);
    } catch (error) {
      throw new TypeError(`${label} has invalid draft order grammar.`, { cause: error });
    }
  }
}

function nullableScalarIdentity(value: unknown, label: string): void {
  if (value === null) return;
  const input = record(value, label);
  exactShape(input, ["type", "value"], label);
  if ((input.type === "string" && typeof input.value === "string")
    || (input.type === "boolean" && typeof input.value === "boolean")
    || (input.type === "number" && typeof input.value === "number" && Number.isFinite(input.value))) {
    return;
  }
  throw new TypeError(`${label} has an unsupported scalar identity.`);
}

function standardRotation(value: unknown): void {
  const rotation = record(value, "Standard draft rotation");
  if (rotation.type === "svd") {
    exactShape(rotation, ["type", "centerAlignToOrigin"], "SVD draft rotation");
    if (typeof rotation.centerAlignToOrigin !== "boolean") throw new TypeError("SVD draft alignment must be boolean.");
    return;
  }
  if (rotation.type === "means") {
    exactShape(rotation, ["type", "centerAlignToOrigin", "negativeLevel", "positiveLevel"], "Means draft rotation");
    if (typeof rotation.centerAlignToOrigin !== "boolean") throw new TypeError("Means draft alignment must be boolean.");
    nullableScalarIdentity(rotation.negativeLevel, "Means draft negative level");
    nullableScalarIdentity(rotation.positiveLevel, "Means draft positive level");
    return;
  }
  if (rotation.type === "reference") {
    exactShape(rotation, ["type", "referenceId", "expectedContentSha256"], "Reference draft rotation");
    nullableString(rotation.referenceId, "Reference draft ID");
    nullableString(rotation.expectedContentSha256, "Reference draft content SHA-256");
    return;
  }
  throw new TypeError("Standard draft rotation type is unsupported.");
}

function commonFields(value: DraftRecordV3): void {
  stringArray(value.unitColumns, "Draft Units");
  stringArray(value.horizonColumns, "Draft Horizons");
  stringArray(value.codes, "Draft Codes");
  nullableString(value.groupColumn, "Draft Group column");
}

function standardDraft(value: DraftRecordV3): void {
  exactShape(value, STANDARD_DRAFT_KEYS, "Standard draft");
  commonFields(value);
  if (value.weighting !== "binary" && value.weighting !== "frequency") throw new TypeError("Standard draft weighting is unsupported.");
  if (value.model !== "EndPoint" && value.model !== "SeparateTrajectory" && value.model !== "AccumulatedTrajectory") throw new TypeError("Standard draft model is unsupported.");
  if (value.windowType !== "Conversation" && value.windowType !== "MovingStanzaWindow") throw new TypeError("Standard draft window is unsupported.");
  const moving = record(value.movingStanza, "Standard Moving Stanza draft");
  exactShape(moving, ["backward", "forward", "rowOrder"], "Standard Moving Stanza draft");
  extent(moving.backward, "Standard draft backward extent");
  extent(moving.forward, "Standard draft forward extent");
  nullableOrder(moving.rowOrder, "Standard draft row order");
  nullableOrder(value.horizonOrder, "Standard draft Horizon order");
  standardRotation(value.rotation);
}

function directionalMask(value: unknown, codes: unknown): void {
  if (value === null) return;
  const mask = record(value, "ONA draft directional mask");
  exactShape(mask, ["schemaVersion", "codeOrder", "enabled"], "ONA draft directional mask");
  if (mask.schemaVersion !== 1) throw new TypeError("ONA draft directional mask schema is unsupported.");
  stringArray(mask.codeOrder, "ONA draft directional mask Code order");
  const codeOrder = mask.codeOrder as string[];
  if (!Array.isArray(mask.enabled)
    || mask.enabled.length !== codeOrder.length
    || mask.enabled.some((row) => !Array.isArray(row)
      || row.length !== codeOrder.length
      || row.some((entry) => typeof entry !== "boolean"))) {
    throw new TypeError("ONA draft directional mask must be a square Boolean matrix.");
  }
  if (JSON.stringify(codeOrder) !== JSON.stringify(codes)) {
    throw new TypeError("ONA draft directional mask must agree with the draft Codes.");
  }
}

function onaDraft(value: DraftRecordV3): void {
  exactShape(value, ONA_DRAFT_KEYS, "ONA draft");
  commonFields(value);
  extent(value.backward, "ONA draft backward extent");
  nullableOrder(value.rowOrder, "ONA draft row order");
  directionalMask(value.directionalMask, value.codes);
}

export function captureDraftArtifactV3(input: unknown): {
  readonly analysisFamily: DraftFamilyV3;
  readonly draft: StandardEnaDraftV3 | OrderedNetworkDraftV3;
} {
  const captured = captureBundleJsonV3(input);
  const draft = record(captured, "Open ENA draft");
  const keys = Object.keys(draft);
  const standardKeys = new Set<string>(STANDARD_DRAFT_KEYS);
  const onaKeys = new Set<string>(ONA_DRAFT_KEYS);
  const family = keys.length === STANDARD_DRAFT_KEYS.length && keys.every((key) => standardKeys.has(key))
    ? "standard"
    : keys.length === ONA_DRAFT_KEYS.length && keys.every((key) => onaKeys.has(key))
      ? "ona"
      : null;
  if (family === "standard") standardDraft(draft);
  else if (family === "ona") onaDraft(draft);
  else throw new TypeError("Open ENA draft has an incomplete, unsupported, or mixed-family shape.");
  return { analysisFamily: family, draft: draft as unknown as StandardEnaDraftV3 | OrderedNetworkDraftV3 };
}
