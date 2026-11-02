import type { NovaArtifactVersion, NovaEffort, NovaModelKey, NovaRunStatus, NovaSession } from "@/lib/nova/types";

export const NOVA_PREFERENCES_KEY = "open-ena.nova.preferences.v1";
export const NOVA_EFFORTS: NovaEffort[] = ["low", "medium", "high", "xhigh"];
export const NOVA_MODEL_KEYS: NovaModelKey[] = ["qwen-flash", "qwen-max", "deepseek-flash", "deepseek-pro"];
export function parseNovaPreferences(value: string | null): { modelKey: NovaModelKey; effort: NovaEffort } | null {
  try {
    const result = JSON.parse(value || "null");
    return result && NOVA_MODEL_KEYS.includes(result.modelKey) && NOVA_EFFORTS.includes(result.effort) ? { modelKey: result.modelKey, effort: result.effort } : null;
  } catch { return null; }
}
export function novaRunBusy(status: NovaRunStatus | undefined) { return !!status && ["queued", "planning", "building", "testing"].includes(status); }
export type NovaWrite = { path: string; body: string; key: string; ambiguous: boolean; owner: string };
/** Retry identity includes the route and owner. An uncertain write cannot be replaced. */
export function novaWrite(previous: NovaWrite | null, path: string, value: unknown, owner: string, makeKey: () => string): NovaWrite {
  const body = JSON.stringify(value);
  if (previous && previous.owner !== owner) throw new Error("identity-changed");
  if (previous?.path === path && previous.body === body) return previous;
  if (previous?.ambiguous) throw new Error("pending-write");
  return { path, body, key: makeKey(), ambiguous: false, owner };
}
export function novaWriteAmbiguous(status: number, code: unknown) {
  // These configuration rejections happen before the store mutation.
  if (["provider-not-configured", "runtime-not-configured", "nova-disabled", "model-configuration-incomplete"].includes(String(code))) return false;
  return status >= 500 || code === "idempotency-in-progress" || code === "write-in-progress" || code === "idempotency-conflict";
}
export function novaFileChanges(current: NovaArtifactVersion, previous?: NovaArtifactVersion) {
  const before = new Map(previous?.files.map((file) => [file.path, file.content]) ?? []);
  const after = new Map(current.files.map((file) => [file.path, file.content]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().map((path) => ({ path, before: before.get(path), after: after.get(path), status: !before.has(path) ? "added" as const : !after.has(path) ? "removed" as const : before.get(path) !== after.get(path) ? "changed" as const : "unchanged" as const }));
}

/** Context stays ordinary draft text; references are never fetched by this control. */
export function appendNovaContext(draft: string, context: string, label: string): string | null {
  const value = context.trim(); if (!value) return draft;
  const combined = `${draft.trimEnd()}${draft.trim() ? "\n\n" : ""}${label}:\n${value}`;
  return combined.length <= 12_000 ? combined : null;
}

export function novaSessionIdFromSearch(search: string): string | null {
  const values = new URLSearchParams(search).getAll("session");
  if (values.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(values[0])) return null;
  return values[0].toLowerCase();
}

export const NOVA_WORKING_DRAFT = "current-working-draft";
/** Select one evidence-bearing result; never combine a previous artifact with new run checks. */
export function novaDraftSelection(session: NovaSession | null, selectedId: string | null) {
  const latestRun = session?.runs.at(-1);
  const activeArtifact = session?.artifacts.find((item) => item.id === session.activeArtifactId);
  const reviewingCheckedArtifact = latestRun?.status === "waiting-expert" && !latestRun.draftChecks?.some((check) => !check.passed) && activeArtifact?.runId === latestRun.id && JSON.stringify(activeArtifact.files) === JSON.stringify(latestRun.draftFiles);
  const workingRun = latestRun && latestRun.status !== "ready" && !reviewingCheckedArtifact && Array.isArray(latestRun.draftFiles) ? latestRun : undefined;
  const chosen = session?.artifacts.find((item) => item.id === selectedId);
  const isWorking = !!workingRun && (!chosen || selectedId === NOVA_WORKING_DRAFT);
  const artifact = isWorking ? undefined : chosen ?? activeArtifact;
  return { workingRun, isWorking, artifact, selectedId: isWorking ? NOVA_WORKING_DRAFT : artifact?.id ?? null };
}
