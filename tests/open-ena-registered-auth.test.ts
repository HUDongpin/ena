import assert from "node:assert/strict";
import test from "node:test";
import * as auth from "../lib/open-ena-auth";
import { classifyProductionOpenEnaSessionTokenAny } from "../lib/server/open-ena-auth-security-store";
import { createOpenEnaLoginPostHandler } from "../lib/server/open-ena-login-route";
import { hashOpenEnaUserPassword } from "../lib/server/open-ena-user-credentials";

const environment = {
  NODE_ENV: "production", OPEN_ENA_USERNAME: "synthetic-owner", OPEN_ENA_PASSWORD: "synthetic-owner-password",
  OPEN_ENA_SESSION_SECRET: "synthetic-registered-session-secret-at-least-32-characters",
  OPEN_ENA_ACCOUNT_ID: "synthetic-owner-account", OPEN_ENA_AUTH_DATABASE_URL: "postgresql://synthetic.invalid/owned",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk", OPEN_ENA_ADDITIONAL_ORIGINS: "https://www.open-ena.com",
};
const userId = "f332ad07-2ec7-4c19-a3b2-490a6435af8d";
const now = 1_800_000_000_000;

test("registered sessions bind one stable user and rotate session IDs", () => {
  assert.equal(typeof auth.createOpenEnaSessionTokenV4, "function", "registered-user session issuer must exist");
  const first = auth.createOpenEnaSessionTokenV4(userId, 3, now, environment);
  const second = auth.createOpenEnaSessionTokenV4(userId, 3, now, environment);
  const principal = auth.verifyOpenEnaSessionTokenAny(first, now, environment);
  assert.ok(principal && auth.isOpenEnaRegisteredPrincipal(principal));
  assert.equal(principal.userId, userId);
  assert.equal(principal.sessionVersion, 3);
  assert.equal(principal.principalRef, `u_${userId}`);
  assert.notEqual(first, second);
  assert.equal(auth.verifyOpenEnaSessionTokenV2(first, now, environment), null);
  assert.equal(auth.verifyOpenEnaSessionTokenV3(first, now, environment), null);
  assert.equal(auth.verifyOpenEnaSessionTokenV4(first.replace(userId, "f332ad07-2ec7-4c19-a3b2-490a6435af8e"), now, environment), null);
  assert.equal(auth.verifyOpenEnaSessionTokenV4(first, now + 12 * 60 * 60 * 1000, environment), null);
  assert.equal(auth.verifyOpenEnaSessionTokenV4(first, now - 61_000, environment), null);
  assert.equal(auth.verifyOpenEnaSessionTokenV4(first, now, { ...environment, OPEN_ENA_SESSION_SECRET: "another-synthetic-secret-at-least-32-characters" }), null);
  assert.throws(() => auth.createOpenEnaSessionTokenV4("not-a-user", 1, now, environment));
  assert.throws(() => auth.createOpenEnaSessionTokenV4(userId, 0, now, environment));
});

test("registered session acceptance requires durable account version and revocation checks", async () => {
  assert.equal(typeof auth.createOpenEnaSessionTokenV4, "function");
  const token = auth.createOpenEnaSessionTokenV4(userId, 3, now, environment);
  let version = 3, disabled = false, revoked = false;
  const query = async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes("open_ena_session_is_revoked")) return { rows: [{ revoked }] };
    assert.match(sql, /open_ena_users/u);
    assert.equal(params?.[0], userId);
    return { rows: [{ current: !disabled && params?.[1] === version }] };
  };
  assert.equal((await classifyProductionOpenEnaSessionTokenAny(token, now, environment, query)).outcome, "authenticated");
  version = 4;
  assert.equal((await classifyProductionOpenEnaSessionTokenAny(token, now, environment, query)).outcome, "unauthenticated");
  version = 3; disabled = true;
  assert.equal((await classifyProductionOpenEnaSessionTokenAny(token, now, environment, query)).outcome, "unauthenticated");
  disabled = false; revoked = true;
  assert.equal((await classifyProductionOpenEnaSessionTokenAny(token, now, environment, query)).outcome, "unauthenticated");
  const withoutUserLookup = { isSessionRevoked: async () => false };
  assert.equal(await auth.verifyOpenEnaSessionTokenAnyWithRevocation(token, withoutUserLookup, now, environment), null);
  assert.equal((await classifyProductionOpenEnaSessionTokenAny(token, now, environment, async () => { throw new Error("synthetic outage"); })).outcome, "store-error");
});

test("new registered sessions do not give legacy or disposable sessions cloud identities", () => {
  assert.equal(typeof auth.isOpenEnaRegisteredPrincipal, "function");
  for (const token of [auth.createOpenEnaSessionTokenV2(now, environment), auth.createOpenEnaSessionTokenV3(now, environment, `d_${"a".repeat(43)}`)]) {
    const principal = auth.verifyOpenEnaSessionTokenAny(token, now, environment);
    assert.ok(principal);
    assert.equal(auth.isOpenEnaRegisteredPrincipal(principal), false);
  }
});

test("one registered email logs in on both domains with the same identity and separate host cookies", async () => {
  const password = "synthetic registered password for two domains";
  const material = await hashOpenEnaUserPassword(password);
  const pairs: string[] = [];
  const login = createOpenEnaLoginPostHandler({
    environment: { ...environment, OPEN_ENA_CLOUD_PROJECTS_ENABLED: "true", OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-ena-client-ip" },
    securityStoreFactory: async () => ({
      consumeLoginAttempt: async () => true, consumeDisposableCredential: async () => null,
      isSessionRevoked: async () => false, revokeSession: async () => undefined,
      authenticateLogin: async (input) => {
        pairs.push(input.pairRef);
        return input.authenticate({ query: async (sql, params) => {
          assert.match(sql, /FROM open_ena_users/u);
          assert.deepEqual(params, ["researcher@example.org"]);
          return { rows: [{ id: userId, password_salt: material.salt, password_hash: material.hash, session_version: 2, disabled_at: null }] };
        } });
      },
    }),
  });
  const owners: string[] = [];
  for (const [origin, email] of [["https://www.ena.hk", "Researcher@Example.Org"], ["https://www.open-ena.com", "researcher@example.org"]]) {
    const response = await login(new Request(`${origin}/api/open-ena/login`, { method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded", "x-ena-client-ip": "203.0.113.77" },
      body: new URLSearchParams({ username: email, password, locale: "en" }) }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `${origin}/en/open-ena`);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/u); assert.match(cookie, /Secure/u); assert.doesNotMatch(cookie, /Domain=/iu);
    const token = cookie.match(/open-ena-session=([^;]+)/u)![1];
    const principal = auth.verifyOpenEnaSessionTokenV4(token, Date.now(), environment);
    assert.ok(principal); owners.push(principal.principalRef);
  }
  assert.equal(owners[0], owners[1]); assert.equal(pairs[0], pairs[1]);
});
