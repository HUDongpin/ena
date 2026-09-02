export type OwnedPostgresCommandRunner = (
  command: string,
  args: readonly string[],
  options: Record<string, unknown>,
) => unknown;

export interface OwnedEphemeralPostgresCleanupInput {
  rootDirectory: string;
  dataDirectory: string;
  rootPrefix: string;
  startAttempted: boolean;
  runCommand?: OwnedPostgresCommandRunner;
  killProcess?: (pid: number, signal?: NodeJS.Signals | 0) => true;
  pollIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

export interface OwnedEphemeralPostgresCleanupResult {
  forcedTermination: boolean;
}

export function cleanupOwnedEphemeralPostgres(
  input: OwnedEphemeralPostgresCleanupInput,
): Promise<OwnedEphemeralPostgresCleanupResult>;
