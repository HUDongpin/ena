function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function resolveOpenEnaRequestOrigin(headers: Headers, fallbackOrigin: string) {
  const submittedOrigin = firstHeaderValue(headers.get("origin"));
  if (!submittedOrigin) return fallbackOrigin;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(submittedOrigin);
  } catch {
    return null;
  }

  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") return null;

  const publicHost = firstHeaderValue(headers.get("x-forwarded-host"))
    ?? firstHeaderValue(headers.get("host"));
  if (!publicHost) return parsedOrigin.origin === fallbackOrigin ? parsedOrigin.origin : null;

  return parsedOrigin.host.toLowerCase() === publicHost.toLowerCase()
    ? parsedOrigin.origin
    : null;
}
