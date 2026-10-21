import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { OpenEnaAuthRecoveryNotice } from "../components/open-ena/OpenEnaLogin";
import {
  getOpenEnaAuthCopy,
  openEnaLoginNotice,
  openEnaLoginNoticeText,
} from "../lib/open-ena-auth-copy";
import { createOpenEnaLoginPostHandler } from "../lib/server/open-ena-login-route";
import { createOpenEnaLogoutPostHandler } from "../lib/server/open-ena-logout-route";
import { createOpenEnaSessionTokenV2 } from "../lib/open-ena-auth";

const environment = {
  OPEN_ENA_USERNAME: "researcher",
  OPEN_ENA_PASSWORD: "a-different-strong-passphrase",
  OPEN_ENA_SESSION_SECRET: "s".repeat(32),
  OPEN_ENA_ACCOUNT_ID: "stable-deployment-account-id",
  OPEN_ENA_AUTH_DATABASE_URL: "postgresql://synthetic.invalid/open_ena",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-ena-client-ip",
} as const;

const navigation = {
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
  "sec-fetch-site": "same-origin",
};

function loginRequest(locale: string, headers: Record<string, string>) {
  return new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.ena.hk",
      "x-ena-client-ip": "203.0.113.10",
      ...headers,
    },
    body: `locale=${locale}&username=researcher&password=wrong-password&next=https://evil.example/phish`,
  });
}

test("localized login recovery keeps the form and the actual wait", () => {
  const loginSource = readFileSync(new URL("../components/open-ena/OpenEnaLogin.tsx", import.meta.url), "utf8");
  assert.match(loginSource, /action="\/api\/open-ena\/login"/u);
  assert.match(loginSource, /openEnaLoginNoticeText/u);
  assert.match(loginSource, /aria-invalid=\{invalidCredentials\}/u);
  assert.match(loginSource, /configurationReady \? \(/u);
  assert.match(getOpenEnaAuthCopy("zh-hans").temporarilyUnavailable, /连接/u);
  assert.match(getOpenEnaAuthCopy("zh-hans").unattributed, /刷新/u);
  assert.doesNotMatch(getOpenEnaAuthCopy("zh-hans").logoutUnavailable, /仍保持登录/u);
  for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
    const copy = getOpenEnaAuthCopy(locale);
    const throttled = openEnaLoginNotice("throttled", "61");
    const text = openEnaLoginNoticeText(copy, throttled) ?? "";
    assert.match(text, /61/);
    assert.equal(text.includes("900"), false);
    assert.notEqual(text, copy.unavailable);
    const storeDown = openEnaLoginNoticeText(copy, openEnaLoginNotice("unavailable", undefined)) ?? "";
    assert.notEqual(storeDown, copy.unavailable);
    assert.doesNotMatch(storeDown, /not configured|尚未設定安全驗證|尚未配置安全验证/u);
    const unattributed = openEnaLoginNoticeText(copy, openEnaLoginNotice("unattributed", undefined)) ?? "";
    assert.notEqual(unattributed, "");
  }
  const traditional = getOpenEnaAuthCopy("zh-hant").throttled;
  const simplified = getOpenEnaAuthCopy("zh-hans").throttled;
  assert.notEqual(traditional, simplified);
  assert.notEqual(traditional, getOpenEnaAuthCopy("en").throttled);
  const hostile = openEnaLoginNotice("throttled", "https://evil.example");
  assert.equal(hostile.kind === "throttled" && hostile.retryAfterSeconds, null);
});

test("native login navigation recovers in place while API clients keep status codes", async () => {
  let checks = 0;
  const handler = createOpenEnaLoginPostHandler({
    environment,
    verifyCredentials: () => {
      checks += 1;
      return false;
    },
    securityStoreFactory: async () => ({
      authenticateLogin: async () => ({
        outcome: "blocked" as const,
        retryAfterSeconds: 61,
        blockingScope: "source" as const,
      }),
      isSessionRevoked: async () => false,
      revokeSession: async () => undefined,
      consumeLoginAttempt: async () => true,
      consumeDisposableCredential: async () => null,
    }),
  });
  const browser = await handler(loginRequest("zh-hans", navigation));
  assert.equal(browser.status, 303);
  assert.equal(checks, 0);
  assert.equal(
    browser.headers.get("location"),
    "https://www.ena.hk/zh-hans/open-ena?auth=throttled&retry_after=61",
  );
  assert.equal(browser.headers.get("retry-after"), "61");
  assert.equal(browser.headers.get("cache-control"), "no-store");
  const api = await handler(loginRequest("zh-hant", { accept: "application/json" }));
  assert.equal(api.status, 429);
  assert.equal(api.headers.get("retry-after"), "61");
  assert.equal(api.headers.get("location"), null);
  assert.equal(checks, 0);
  const missing = await handler(loginRequest("en", {
    ...navigation,
    "x-ena-client-ip": "203.0.113.8, 198.51.100.1",
  }));
  assert.equal(missing.status, 303);
  assert.equal(
    missing.headers.get("location"),
    "https://www.ena.hk/en/open-ena?auth=unattributed",
  );
  assert.equal(checks, 0);
  const evilOrigin = await handler(new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/x-www-form-urlencoded",
      ...navigation,
    },
    body: "locale=en&username=researcher&password=secret",
  }));
  assert.equal(evilOrigin.status, 403);
  assert.equal(evilOrigin.headers.get("location"), null);
  assert.equal(checks, 0);
  const referer = "https://review.invalid/zh-hans/open-ena";
  const rejectedOrigin = await handler(new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/x-www-form-urlencoded",
      referer,
      ...navigation,
    },
    body: "locale=en&username=researcher&password=secret&next=https://evil.example",
  }));
  assert.equal(rejectedOrigin.status, 403);
  assert.equal(rejectedOrigin.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(rejectedOrigin.headers.get("location"), null);
  const rejectedHtml = await rejectedOrigin.text();
  assert.match(rejectedHtml, /这次登录请求已被拒绝/u);
  assert.match(rejectedHtml, /href="\/zh-hans\/open-ena"/u);
  assert.doesNotMatch(rejectedHtml, /evil\.example/u);
  assert.equal(checks, 0);
  const tooLarge = await handler(new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      origin: "https://www.ena.hk",
      "content-type": "application/x-www-form-urlencoded",
      "content-length": "20000",
      referer,
      ...navigation,
    },
    body: "locale=en",
  }));
  assert.equal(tooLarge.status, 413);
  assert.match(await tooLarge.text(), /登录请求过大/u);
  assert.equal(checks, 0);
  const wrongType = await handler(new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      origin: "https://www.ena.hk",
      "content-type": "text/plain",
      referer,
      ...navigation,
    },
    body: "locale=en&username=researcher&password=secret",
  }));
  assert.equal(wrongType.status, 400);
  assert.match(await wrongType.text(), /无法读取这次登录请求/u);
  assert.equal(checks, 0);
  const apiRejection = await handler(new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/x-www-form-urlencoded",
      referer,
    },
    body: "locale=zh-hans",
  }));
  assert.equal(apiRejection.status, 403);
  assert.equal(apiRejection.headers.get("content-type"), "text/plain;charset=UTF-8");
  assert.equal(await apiRejection.text(), "Invalid request origin");
});

test("native logout store failures recover without clearing a still-valid session", async () => {
  const token = createOpenEnaSessionTokenV2(1_800_000_000_000, environment);
  const handler = createOpenEnaLogoutPostHandler({
    environment,
    now: () => 1_800_000_001_000,
    securityStoreFactory: async () => ({
      authenticateLogin: async () => ({ outcome: "invalid" }),
      isSessionRevoked: async () => false,
      revokeSession: async () => {
        throw new Error("database unavailable");
      },
      consumeLoginAttempt: async () => true,
      consumeDisposableCredential: async () => null,
    }),
  });
  const browser = await handler(new Request("https://www.ena.hk/api/open-ena/logout", {
    method: "POST",
    headers: {
      origin: "https://www.ena.hk",
      "content-type": "application/x-www-form-urlencoded",
      cookie: `open-ena-session=${encodeURIComponent(token)}`,
      ...navigation,
    },
    body: "locale=zh-hant",
  }));
  assert.equal(browser.status, 303);
  assert.equal(
    browser.headers.get("location"),
    "https://www.ena.hk/zh-hant/open-ena?auth=logout-unavailable",
  );
  assert.equal(browser.headers.get("set-cookie"), null);
  const api = await handler(new Request("https://www.ena.hk/api/open-ena/logout", {
    method: "POST",
    headers: {
      origin: "https://www.ena.hk",
      "content-type": "application/x-www-form-urlencoded",
      cookie: `open-ena-session=${encodeURIComponent(token)}`,
    },
    body: "locale=zh-hans",
  }));
  assert.equal(api.status, 503);
  assert.equal(api.headers.get("location"), null);
  assert.equal(api.headers.get("set-cookie"), null);
  const signedIn = renderToStaticMarkup(createElement(OpenEnaAuthRecoveryNotice, {
    locale: "zh-hant",
    notice: openEnaLoginNotice("logout-unavailable", undefined),
  }));
  assert.match(signedIn, /登出未能完成/u);
  assert.doesNotMatch(signedIn, /仍保持登入/u);
  const signInFailure = renderToStaticMarkup(createElement(OpenEnaAuthRecoveryNotice, {
    locale: "zh-hans",
    notice: openEnaLoginNotice("unavailable", undefined),
  }));
  assert.equal(signInFailure, "");
});
