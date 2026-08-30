export type OpenEnaOperatorMode = "migration" | "proof" | "all";

export class OperatorError extends Error {
  readonly code: string;
}

export function deriveOpenEnaDisposableUsernameRef(
  username: string,
  sessionSecret: string,
): string;

export function verifyOperatorDisposableSessionToken(
  token: string,
  expectedPrincipalRef: string,
  sessionSecret: string,
  nowMilliseconds: number,
): { jti: string; expiresAtSeconds: number } | null;

export function runOpenEnaProductionAuthOperator(input: {
  mode: OpenEnaOperatorMode;
  environment?: Readonly<Record<string, string | undefined>>;
  migrationSql?: string;
  expectedFinalGitSha?: string;
  deploymentId?: string;
  dependencies?: Record<string, unknown>;
}): Promise<Record<string, any>>;

export function createSafeOperatorFailureReceipt(
  error: unknown,
  mode: unknown,
  nowMilliseconds?: number,
): {
  schemaVersion: "open-ena.production-auth-operator.v1";
  status: "FAIL";
  mode: "migration" | "proof" | "invalid";
  observedAt: string;
  failureCode: string;
};
