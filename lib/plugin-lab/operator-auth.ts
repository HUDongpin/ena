import {
  verifyOpenEnaSessionTokenV2,
  type OpenEnaAuthEnvironment,
} from "@/lib/open-ena-auth";

/** Static-account v2 only. Disposable v3 sessions are intentionally excluded. */
export function verifyPluginLabOperatorToken(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
) {
  return verifyOpenEnaSessionTokenV2(token, nowMilliseconds, environment);
}
