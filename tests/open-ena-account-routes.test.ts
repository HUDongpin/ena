import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import test from "node:test";

const environment = { NODE_ENV: "production", OPEN_ENA_CLOUD_PROJECTS_ENABLED: "true", OPEN_ENA_REGISTRATION_ENABLED: "true",
  OPEN_ENA_SESSION_SECRET: "synthetic-account-routes-secret-at-least-32-characters", OPEN_ENA_ACCOUNT_ID: "synthetic-owner",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk", OPEN_ENA_ADDITIONAL_ORIGINS: "https://www.open-ena.com",
  OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-ena-client-ip", RESEND_API_KEY: "re_synthetic_not_a_real_credential_12345",
  OPEN_ENA_ACCOUNT_MAIL_FROM: "Open ENA <accounts@mail.open-ena.com>" };
const request = (action: string, body: unknown, origin = "https://www.ena.hk") => new Request(`${origin}/api/open-ena/account/${action}`, {
  method: "POST", headers: { origin, "content-type": "application/json", "x-ena-client-ip": "203.0.113.34" }, body: JSON.stringify(body),
});

test("account emails use one-time fragment links and public responses do not reveal accounts or tokens", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-account-routes.ts", import.meta.url)), "account lifecycle routes must exist");
  const { createOpenEnaAccountPostHandler } = await import("../lib/server/open-ena-account-routes");
  const issued: Array<Record<string, unknown>> = [], sent: Array<Record<string, unknown>> = [];
  const users = {
    issueAction: async (input: Record<string, unknown>) => { issued.push(input); return { kind: input.purpose, email: input.email, actionId: "f332ad07-2ec7-4c19-a3b2-490a6435af8d" }; },
    completeAction: async () => ({ id: "unused", email: "unused@example.org", sessionVersion: 1 }),
  };
  for (const origin of ["https://www.ena.hk", "https://www.open-ena.com"]) {
    const handler = createOpenEnaAccountPostHandler("register", { environment, users: users as never,
      sendMail: async (value) => { sent.push(value as unknown as Record<string, unknown>); } });
    const response = await handler(request("register", { email: " User@Example.Org ", locale: "zh-hans" }, origin));
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const mail = sent.at(-1)!;
    assert.equal(mail.email, "user@example.org");
    const link = new URL(mail.link as string);
    assert.equal(link.origin, origin); assert.equal(link.pathname, "/zh-hans/open-ena/account"); assert.equal(link.search, "");
    const token = new URLSearchParams(link.hash.slice(1)).get("token")!;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
    assert.equal(issued.at(-1)!.tokenHash, createHash("sha256").update(token).digest("hex"));
    assert.equal(JSON.stringify(issued).includes(token), false, "the store receives only a token hash");
  }
});

test("account actions validate origin, content, feature state and password before doing work", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-account-routes.ts", import.meta.url)));
  const { createOpenEnaAccountPostHandler } = await import("../lib/server/open-ena-account-routes");
  let calls = 0;
  const dependencies = { environment, users: { issueAction: async () => { calls++; throw new Error("must not execute"); }, completeAction: async () => { calls++; throw new Error("must not execute"); } } as never,
    sendMail: async () => { calls++; } };
  assert.equal((await createOpenEnaAccountPostHandler("register", dependencies)(request("register", { email: "a@example.org" }, "https://evil.example"))).status, 403);
  assert.equal((await createOpenEnaAccountPostHandler("register", dependencies)(request("register", { email: "not-email" }))).status, 400);
  assert.equal((await createOpenEnaAccountPostHandler("register", dependencies)(request("register", { email: "a@example.org", ownerId: "forged" }))).status, 400);
  assert.equal((await createOpenEnaAccountPostHandler("verify", dependencies)(request("verify", { token: "a".repeat(43), password: "short" }))).status, 400);
  assert.equal((await createOpenEnaAccountPostHandler("register", { ...dependencies, environment: { ...environment, OPEN_ENA_REGISTRATION_ENABLED: "false" } })(request("register", { email: "a@example.org" }))).status, 503);
  assert.equal(calls, 0);
});

test("mail outages and provider responses cannot leak credentials into account responses", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-account-routes.ts", import.meta.url)));
  const { createOpenEnaAccountPostHandler } = await import("../lib/server/open-ena-account-routes");
  const handler = createOpenEnaAccountPostHandler("register", { environment,
    users: { issueAction: async () => ({ kind: "verify", email: "one@example.org", actionId: "synthetic-mail" }) } as never,
    sendMail: async () => { throw new Error(`credential ${environment.RESEND_API_KEY} must be private`); } });
  const response = await handler(request("register", { email: "one@example.org" }));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "unavailable" });
});

test("Resend delivery is restricted to the configured sender and uses an idempotency key", async () => {
  assert.ok(existsSync(new URL("../lib/server/open-ena-account-mail.ts", import.meta.url)));
  const { sendOpenEnaAccountMail } = await import("../lib/server/open-ena-account-mail");
  let calls = 0;
  await sendOpenEnaAccountMail({ kind: "verify", email: "one@example.org", actionId: "synthetic-id", locale: "en",
    link: `https://www.ena.hk/en/open-ena/account#action=verify&token=${"a".repeat(43)}` }, environment, async (url, options) => {
    calls++; assert.equal(String(url), "https://api.resend.com/emails");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("Idempotency-Key"), "open-ena-account-synthetic-id");
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.from, environment.OPEN_ENA_ACCOUNT_MAIL_FROM); assert.deepEqual(payload.to, ["one@example.org"]);
    assert.match(payload.text, /#action=verify&token=/u);
    return Response.json({ id: "synthetic-delivery" });
  });
  assert.equal(calls, 1);
});
