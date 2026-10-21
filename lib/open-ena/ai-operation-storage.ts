import { OPEN_ENA_AI_OPERATION_ID, parseOpenEnaAiInterpretationRequest, type OpenEnaAiInterpretationRequest } from "./ai-interpretation";
import { OPEN_ENA_AI_OWNER_KEY } from "./ai-operation-owner";
import { sha256HexUtf8 } from "./plugins/sha256";

// Keep the route's canonical key ordering after its shared strict parser.
function canonicalRequest(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRequest).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalRequest(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Retry identity follows the server-normalized wire, not display/native context
 * or the coarse evidence checksum. Store only its digest, never aggregate JSON. */
export function openEnaAiOperationStorageKey(request: OpenEnaAiInterpretationRequest): string {
  return `open-ena-ai-operation-v3:${sha256HexUtf8(canonicalRequest(parseOpenEnaAiInterpretationRequest(request)))}`;
}

export type OpenEnaAiOperationScope = {
  key: string;
  owner: string;
  legacyKeys: readonly string[];
};

export function openEnaAiOperationScope(request: OpenEnaAiInterpretationRequest, owner: string): OpenEnaAiOperationScope {
  if (!OPEN_ENA_AI_OWNER_KEY.test(owner)) throw new TypeError("A verified AI operation owner scope is required.");
  const legacyWireKey = openEnaAiOperationStorageKey(request);
  return {
    key: `open-ena-ai-operation-v4:${owner}:${legacyWireKey.slice("open-ena-ai-operation-v3:".length)}`,
    owner,
    legacyKeys: [legacyWireKey, `open-ena-ai-operation-v2:${request.binding.evidenceKey}`],
  };
}

type OperationStorage = Pick<Storage, "getItem" | "setItem">;
const CLOSED_OPERATION = "closed";
const SETTLED_RETRY_SUFFIX = ":settled-retry";

function settledRetryKey(scope: OpenEnaAiOperationScope) {
  return `${scope.key}${SETTLED_RETRY_SUFFIX}`;
}

/** Page-lifetime authority survives remounts when browser storage is restricted.
 * Constructing this store performs no storage access, including during SSR. */
export function createOpenEnaAiOperationStore(storage: () => OperationStorage) {
  const operations = new Map<string, string | null>();
  const settledRetries = new Map<string, string | null>();
  const legacyClaims = new Map<string, string>();
  const clearSettledRetry = (scope: OpenEnaAiOperationScope) => {
    settledRetries.set(scope.key, null);
    try { storage().setItem(settledRetryKey(scope), ""); } catch { /* Memory remains authoritative. */ }
  };
  const readSettledRetry = (scope: OpenEnaAiOperationScope): string | null => {
    if (settledRetries.has(scope.key)) return settledRetries.get(scope.key) ?? null;
    try {
      const saved = storage().getItem(settledRetryKey(scope));
      const operation = saved && OPEN_ENA_AI_OPERATION_ID.test(saved) ? saved : null;
      settledRetries.set(scope.key, operation);
      return operation;
    } catch {
      settledRetries.set(scope.key, null);
      return null;
    }
  };
  const read = (scope: OpenEnaAiOperationScope): string | null => {
    if (operations.has(scope.key)) return operations.get(scope.key) ?? null;
    try {
      const saved = storage().getItem(scope.key);
      if (saved === CLOSED_OPERATION || (saved && OPEN_ENA_AI_OPERATION_ID.test(saved))) {
        const operation = saved === CLOSED_OPERATION ? null : saved;
        operations.set(scope.key, operation);
        return operation;
      }
      for (const legacyKey of scope.legacyKeys) {
        const legacy = storage().getItem(legacyKey);
        if (!legacy || !OPEN_ENA_AI_OPERATION_ID.test(legacy)) continue;
        const claimKey = `open-ena-ai-legacy-claim-v4:${scope.owner}:${sha256HexUtf8(legacyKey)}`;
        const claim = legacyClaims.get(claimKey) ?? storage().getItem(claimKey);
        // A coarse v2 seed may belong to only one reviewed wire per owner.
        if (claim && claim !== scope.key) continue;
        legacyClaims.set(claimKey, scope.key);
        operations.set(scope.key, legacy);
        try {
          storage().setItem(claimKey, scope.key);
          storage().setItem(scope.key, legacy);
        } catch { /* Memory retains the claim and operation until page unload. */ }
        // Ownerless records may protect another account's unresolved request.
        // Keep them; this owner's tombstone prevents later resurrection.
        return legacy;
      }
    } catch { /* Storage restrictions cannot erase known in-memory ownership. */ }
    operations.set(scope.key, null);
    return null;
  };
  return {
    read,
    set(scope: OpenEnaAiOperationScope, operationId: string) {
      operations.set(scope.key, operationId);
      try { storage().setItem(scope.key, operationId); } catch { /* Memory protects retries. */ }
      if (readSettledRetry(scope) && readSettledRetry(scope) !== operationId) clearSettledRetry(scope);
    },
    close(scope: OpenEnaAiOperationScope, operationId: string) {
      if (operations.get(scope.key) !== operationId) return;
      operations.set(scope.key, null);
      if (readSettledRetry(scope) === operationId) clearSettledRetry(scope);
      try {
        const saved = storage().getItem(scope.key);
        if (!saved || saved === operationId) storage().setItem(scope.key, CLOSED_OPERATION);
      } catch { /* The page-lifetime tombstone remains authoritative on remount. */ }
    },
    markSettledRetry(scope: OpenEnaAiOperationScope, operationId: string) {
      if (!OPEN_ENA_AI_OPERATION_ID.test(operationId)) return;
      settledRetries.set(scope.key, operationId);
      try { storage().setItem(settledRetryKey(scope), operationId); } catch { /* Memory still lets this page's Retry replace it. */ }
    },
    consumeSettledRetry(scope: OpenEnaAiOperationScope, operationId: string) {
      if (readSettledRetry(scope) !== operationId) return false;
      clearSettledRetry(scope);
      return true;
    },
  };
}

export const openEnaAiOperationStore = createOpenEnaAiOperationStore(() => sessionStorage);
