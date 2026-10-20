import { sha256HexUtf8 } from "./plugins/sha256";

export const OPEN_ENA_AI_OWNER_HEADER = "x-open-ena-ai-owner";
export const OPEN_ENA_AI_OWNER_KEY = /^[a-f0-9]{64}$/u;

/** Stable across session-token rotation, derived only from a verified principal.
 * This public scope is not a bearer credential; the route authenticates again. */
export function openEnaAiOperationOwnerKey(principalRef: string): string {
  return sha256HexUtf8(`open-ena-ai-operation-owner-v1\0${principalRef}`);
}
