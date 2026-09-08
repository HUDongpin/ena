/** Only observed Next public-shell prefetches, started before login, may be cancelled by login. */
export function expectedLoginPrefetchCancellation(event, login) {
  return Number.isFinite(event.startedAt) && Number.isFinite(event.failedAt)
    && Number.isFinite(login.startedAt) && Number.isFinite(login.finishedAt)
    && event.startedAt <= login.startedAt
    && event.failedAt >= login.startedAt && event.failedAt <= login.finishedAt
    && event.text === "net::ERR_ABORTED" && event.method === "GET"
    && event.resourceType === "fetch" && event.navigation === false
    && event.rsc === "1" && event.prefetch === "1"
    && ["/en/open-ena", "/en/news", "/en/academy"].includes(event.path);
}
