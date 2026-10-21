import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactNode } from "react";
import OpenEnaLogin from "../components/open-ena/OpenEnaLogin";
import { createOpenEnaLoginPostHandler } from "../lib/server/open-ena-login-route";
import { createOpenEnaLogoutPostHandler } from "../lib/server/open-ena-logout-route";

const environment = {
  OPEN_ENA_USERNAME: "synthetic-owner",
  OPEN_ENA_PASSWORD: "synthetic-password-for-local-test-only",
  OPEN_ENA_SESSION_SECRET: "s".repeat(40),
  OPEN_ENA_ACCOUNT_ID: "local-recovery-test-account",
  OPEN_ENA_AUTH_DATABASE_URL: "postgresql://unused.invalid/auth",
  OPEN_ENA_ALLOWED_ORIGINS: "https://ena.invalid",
  OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-test-client-ip",
};
const windowStartedAt = "2026-10-21T00:00:00.123456Z";

function request(options: {
  source?: string;
  username?: string;
  correct?: boolean;
  locale?: string;
  document?: boolean;
  logout?: boolean;
  headers?: Record<string, string>;
} = {}) {
  return new Request(`https://ena.invalid/api/open-ena/${options.logout ? "logout" : "login"}`, {
    method: "POST",
    headers: {
      origin: "https://ena.invalid",
      "content-type": "application/x-www-form-urlencoded",
      "x-test-client-ip": options.source ?? "192.0.2.1",
      ...(options.document ? { accept: "text/html", "sec-fetch-mode": "navigate" } : {}),
      ...options.headers,
    },
    body: new URLSearchParams({
      locale: options.locale ?? "zh-hans",
      username: options.username ?? environment.OPEN_ENA_USERNAME,
      password: options.correct ? environment.OPEN_ENA_PASSWORD : "incorrect",
    }),
  });
}

// The legacy entry is retained in this test double only to exercise the
// pre-fix handler. The new reservation API models durable source admission;
// the separate PostgreSQL regression runner verifies the actual SQL.
function storeFixture() {
  const sources = new Map<string, number>();
  const accounts = new Map<string, number>();
  let refunds = 0;
  let credentialChecks = 0;
  const store = {
    async consumeLoginAttempt(input: { sourceRef: string; accountRef: string; sourceLimit: number; accountLimit: number }) {
      const sourceCount = (sources.get(input.sourceRef) ?? 0) + 1;
      const accountCount = (accounts.get(input.accountRef) ?? 0) + 1;
      sources.set(input.sourceRef, sourceCount);
      accounts.set(input.accountRef, accountCount);
      return sourceCount <= input.sourceLimit && accountCount <= input.accountLimit;
    },
    async reserveLoginAttempt(input: { sourceRef: string; limit: number }) {
      const count = sources.get(input.sourceRef) ?? 0;
      if (count >= input.limit) return { allowed: false as const, retryAfterSeconds: 60 };
      sources.set(input.sourceRef, count + 1);
      return { allowed: true as const, reservation: { sourceRef: input.sourceRef, windowStartedAt } };
    },
    async refundLoginAttempt(reservation: { sourceRef: string; windowStartedAt: string }) {
      assert.equal(reservation.windowStartedAt, windowStartedAt);
      refunds += 1;
      sources.set(reservation.sourceRef, Math.max(0, (sources.get(reservation.sourceRef) ?? 0) - 1));
    },
    async consumeDisposableCredential(): Promise<string | null> { return null; },
    async isSessionRevoked() { return false; },
    async revokeSession() {},
  };
  return {
    store,
    sources,
    refunds: () => refunds,
    credentialChecks: () => credentialChecks,
    handler: createOpenEnaLoginPostHandler({
      environment,
      securityStoreFactory: async () => store,
      verifyCredentials(username, password) {
        credentialChecks += 1;
        return username === environment.OPEN_ENA_USERNAME && password === environment.OPEN_ENA_PASSWORD;
      },
      createSessionToken: () => "synthetic-session",
    }),
  };
}

test("one source cannot exhaust another source's login allowance", async () => {
  const fixture = storeFixture();
  for (let index = 0; index < 15; index++) await fixture.handler(request());
  const fromOtherSource = await fixture.handler(request({ source: "192.0.2.2", correct: true }));
  assert.equal(fromOtherSource.status, 303);
  assert.match(fromOtherSource.headers.get("set-cookie") ?? "", /synthetic-session/);
  assert.equal(fixture.credentialChecks(), 6, "blocked attempts must not check a password");
});

test("sequential successful logins refund only their own reserved attempt", async () => {
  const fixture = storeFixture();
  for (let index = 0; index < 20; index++) {
    const response = await fixture.handler(request({ correct: true }));
    assert.equal(response.status, 303, `successful login ${index + 1}`);
  }
  assert.equal(fixture.refunds(), 20);
  assert.deepEqual([...fixture.sources.values()], [0]);
});

test("a valid login does not erase earlier wrong-password attempts at its source", async () => {
  const fixture = storeFixture();
  for (let index = 0; index < 4; index++) assert.equal((await fixture.handler(request())).status, 303);
  assert.equal((await fixture.handler(request({ correct: true }))).status, 303);
  assert.deepEqual([...fixture.sources.values()], [4]);
  assert.equal((await fixture.handler(request())).status, 303);
  assert.equal((await fixture.handler(request({ correct: true }))).status, 429);
  assert.equal(fixture.credentialChecks(), 6);
});

test("API throttling reports the actual remaining window instead of a fixed 900 seconds", async () => {
  const fixture = storeFixture();
  for (let index = 0; index < 5; index++) await fixture.handler(request());
  const response = await fixture.handler(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("location"), null);
});

for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
  test(`${locale} document login returns to its form with the remaining throttle interval`, async () => {
    const fixture = storeFixture();
    for (let index = 0; index < 5; index++) await fixture.handler(request());
    const response = await fixture.handler(request({ locale, document: true }));
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!, "https://ena.invalid");
    assert.equal(location.origin, "https://ena.invalid");
    assert.equal(location.pathname, `/${locale}/open-ena`);
    assert.equal(location.searchParams.get("auth"), "throttled");
    assert.equal(location.searchParams.get("retry"), "60");
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(response.headers.get("set-cookie"), null);
  });

  test(`${locale} document login localizes authentication-store failure without leaking it`, async () => {
    const handler = createOpenEnaLoginPostHandler({
      environment,
      securityStoreFactory: async () => { throw new Error("synthetic-private-db-error"); },
    });
    const response = await handler(request({ locale, document: true }));
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!, "https://ena.invalid");
    assert.equal(location.pathname, `/${locale}/open-ena`);
    assert.equal(location.searchParams.get("auth"), "unavailable");
    assert.doesNotMatch(await response.text(), /synthetic-private-db-error/);
    assert.equal(response.headers.get("set-cookie"), null);
  });

  test(`${locale} document logout preserves its cookie when revocation storage is unavailable`, async () => {
    const handler = createOpenEnaLogoutPostHandler({ environment, securityStoreFactory: async () => null });
    const response = await handler(request({ locale, document: true, logout: true }));
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!, "https://ena.invalid");
    assert.equal(location.pathname, `/${locale}/open-ena`);
    assert.equal(location.searchParams.get("auth"), "logout-unavailable");
    assert.equal(response.headers.get("set-cookie"), null);
  });

  test(`${locale} login renders a localized throttle notice with a usable form`, () => {
    const props = { locale, error: false, configurationReady: true, failure: "throttled" as const, retryAfterSeconds: 60 };
    const inputs: string[] = [];
    const alerts: string[] = [];
    function visit(node: ReactNode): string {
      if (Array.isArray(node)) return node.map(visit).join("");
      if (typeof node === "string" || typeof node === "number") return String(node);
      if (!isValidElement<{ children?: ReactNode; role?: string; name?: string }>(node)) return "";
      const text = visit(node.props.children);
      if (node.type === "input" && node.props.name) inputs.push(node.props.name);
      if (node.props.role === "alert") alerts.push(text);
      return text;
    }
    visit(OpenEnaLogin(props));
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /60/);
    assert.ok(inputs.includes("username") && inputs.includes("password"));
    assert.match(alerts[0], locale === "en" ? /Too many sign-in attempts/ : locale === "zh-hans" ? /登录尝试过多/ : /登入嘗試過多/);
  });
}

test("a refund transport failure retains the charged slot without revoking valid authentication", async () => {
  const fixture = storeFixture();
  let calls = 0;
  fixture.store.refundLoginAttempt = async () => { calls += 1; throw new Error("synthetic refund failure"); };
  const response = await fixture.handler(request({ correct: true }));
  assert.equal(response.status, 303);
  assert.ok(response.headers.get("set-cookie"));
  assert.equal(calls, 1);
  assert.deepEqual([...fixture.sources.values()], [1]);
});

test("a refund failure cannot burn a successfully consumed one-time credential without issuing its session", async () => {
  const fixture = storeFixture();
  let consumed = false;
  let refunds = 0;
  fixture.store.consumeDisposableCredential = async () => {
    if (consumed) return null;
    consumed = true;
    return `d_${"d".repeat(43)}`;
  };
  fixture.store.refundLoginAttempt = async () => { refunds += 1; throw new Error("synthetic refund failure"); };
  const first = await fixture.handler(request({ username: "synthetic-disposable", correct: true }));
  assert.equal(first.status, 303);
  assert.ok(first.headers.get("set-cookie"));
  assert.equal(consumed, true);
  assert.equal(refunds, 1);
  const replay = await fixture.handler(request({ username: "synthetic-disposable", correct: true }));
  assert.equal(replay.status, 303);
  assert.equal(new URL(replay.headers.get("location")!).searchParams.get("auth"), "invalid");
  assert.equal(replay.headers.get("set-cookie"), null);
  assert.equal(refunds, 1);
});
