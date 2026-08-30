export type OpenEnaRequestEnvironment = Readonly<Record<string, string | undefined>>;

function exactHttpOrigin(value: string) {
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredAllowedOrigins(environment: OpenEnaRequestEnvironment) {
  const configured = [] as string[];
  if (environment.OPEN_ENA_PUBLIC_ORIGIN !== undefined) {
    configured.push(environment.OPEN_ENA_PUBLIC_ORIGIN);
  }
  if (environment.OPEN_ENA_ALLOWED_ORIGINS !== undefined) {
    configured.push(...environment.OPEN_ENA_ALLOWED_ORIGINS.split(","));
  }
  if (configured.length === 0) return null;
  const entries = configured.map((entry) => entry.trim());
  if (entries.some((entry) => !entry)) return false;
  const origins = entries.map(exactHttpOrigin);
  if (origins.some((origin) => origin === null)) return false;
  return new Set(origins as string[]);
}

/** Returns whether a deployment has an operator-owned origin anchor. */
export function openEnaRequestOriginConfigurationReady(
  environment: OpenEnaRequestEnvironment = process.env,
) {
  const configured = configuredAllowedOrigins(environment);
  if (configured === false) return false;
  if (environment.NODE_ENV !== "production") return true;
  return configured instanceof Set && configured.size > 0;
}

/**
 * Validates the browser-supplied Origin against an operator-owned public-origin
 * allowlist. Forwarded host/protocol headers are never an authorization source:
 * on a misconfigured proxy they can be client supplied. A missing allowlist is
 * tolerated only outside production so local development can use the request
 * URL; production therefore cannot accidentally turn an untrusted Host header
 * into an open redirect or Origin grant.
 */
export function resolveOpenEnaRequestOrigin(
  headers: Headers,
  fallbackOrigin: string,
  environment: OpenEnaRequestEnvironment = process.env,
) {
  const rawOrigin = headers.get("origin")?.trim();
  if (!rawOrigin || rawOrigin.includes(",")) return null;
  const submittedOrigin = exactHttpOrigin(rawOrigin);
  const normalizedFallback = exactHttpOrigin(fallbackOrigin);
  if (!submittedOrigin || !normalizedFallback) return null;

  const allowedOrigins = configuredAllowedOrigins(environment);
  if (allowedOrigins === false) return null;
  if (allowedOrigins) return allowedOrigins.has(submittedOrigin) ? submittedOrigin : null;
  if (environment.NODE_ENV === "production") return null;
  return submittedOrigin === normalizedFallback ? submittedOrigin : null;
}
