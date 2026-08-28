import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { locales } from "../lib/i18n";

const projectRoot = process.cwd();

async function loadModule(relativePath: string) {
  try {
    return await import(relativePath);
  } catch {
    return null;
  }
}

test("Open ENA fails closed without explicit high-entropy authentication configuration", async () => {
  const auth = await loadModule("../lib/open-ena-auth");
  assert.ok(auth, "lib/open-ena-auth.ts must provide server-side credential verification");

  const environment = {};
  assert.equal(auth.openEnaAuthConfigurationReady(environment), false);
  assert.equal(auth.verifyOpenEnaCredentials("sandytu", "12345", environment), false);
  assert.equal(auth.verifyOpenEnaCredentials("", "", environment), false);
  assert.throws(
    () => auth.createOpenEnaSessionToken(1_800_000_000_000, environment),
    /authentication is not configured/i,
  );
  assert.equal(auth.verifyOpenEnaSessionToken("v1.1800000000.invalid", 1_800_000_001_000, environment), false);
});

test("explicit deployment values enable and rotate the Open ENA credentials", async () => {
  const auth = await loadModule("../lib/open-ena-auth");
  assert.ok(auth);

  const environment = {
    OPEN_ENA_USERNAME: "researcher",
    OPEN_ENA_PASSWORD: "a-different-strong-passphrase",
    OPEN_ENA_SESSION_SECRET: "s".repeat(32),
  };
  assert.equal(auth.openEnaAuthConfigurationReady(environment), true);
  assert.equal(auth.verifyOpenEnaCredentials("researcher", "a-different-strong-passphrase", environment), true);
  assert.equal(auth.verifyOpenEnaCredentials("sandytu", "12345", environment), false);
  assert.equal(auth.openEnaAuthConfigurationReady({
    ...environment,
    OPEN_ENA_PASSWORD: "too-short",
  }), false);
  assert.equal(auth.openEnaAuthConfigurationReady({
    ...environment,
    OPEN_ENA_SESSION_SECRET: "too-short",
  }), false);
});

test("Open ENA session tokens are signed, expire, and reject tampering", async () => {
  const auth = await loadModule("../lib/open-ena-auth");
  assert.ok(auth);

  const environment = {
    OPEN_ENA_USERNAME: "researcher",
    OPEN_ENA_PASSWORD: "strong-password-for-open-ena",
    OPEN_ENA_SESSION_SECRET: "test-session-secret-with-enough-entropy",
  };
  const issuedAt = 1_800_000_000_000;
  const token = auth.createOpenEnaSessionToken(issuedAt, environment);

  assert.equal(auth.verifyOpenEnaSessionToken(token, issuedAt + 1_000, environment), true);
  assert.equal(
    auth.verifyOpenEnaSessionToken(token, issuedAt + auth.OPEN_ENA_SESSION_MAX_AGE_SECONDS * 1_000 + 1, environment),
    false,
  );
  assert.equal(auth.verifyOpenEnaSessionToken(`${token.slice(0, -1)}x`, issuedAt + 1_000, environment), false);
  assert.equal(auth.verifyOpenEnaSessionToken("not-a-session", issuedAt + 1_000, environment), false);
});

test("the login copy is English, Traditional Chinese, and Simplified Chinese", async () => {
  const copyModule = await loadModule("../lib/open-ena-auth-copy");
  assert.ok(copyModule, "lib/open-ena-auth-copy.ts must provide locale-specific login copy");

  const en = copyModule.getOpenEnaAuthCopy("en");
  const zhHant = copyModule.getOpenEnaAuthCopy("zh-hant");
  const zhHans = copyModule.getOpenEnaAuthCopy("zh-hans");

  assert.equal(en.title, "Sign in to Open ENA");
  assert.match(en.unavailable, /secure authentication is not configured/i);
  assert.match(en.collaborationNotice, /Registration will be available in the future/);
  assert.match(en.collaborationNotice, /Professor Sandy TU Yun-Fang \(sandy0692@gmail\.com\)/);
  assert.equal(zhHant.title, "登入 Open ENA");
  assert.match(zhHant.unavailable, /安全驗證/);
  assert.match(zhHant.collaborationNotice, /未來會開放註冊/);
  assert.equal(zhHans.title, "登录 Open ENA");
  assert.match(zhHans.unavailable, /安全验证/);
  assert.equal(
    zhHans.collaborationNotice,
    "未来会开放注册。学术合作请联系Professor Sandy TU Yun-Fang(sandy0692@gmail.com)",
  );
  assert.equal(copyModule.getOpenEnaAuthCopy("fr").title, en.title);

  const visibleCopy = JSON.stringify({ en, zhHant, zhHans });
  assert.doesNotMatch(visibleCopy, /sandytu/);
  assert.doesNotMatch(visibleCopy, /12345/);
});

test("the localized Open ENA page renders a server-side login gate before the workspace", () => {
  const pagePath = join(projectRoot, "app", "[locale]", "open-ena", "page.tsx");
  const page = readFileSync(pagePath, "utf8");
  const loginPath = join(projectRoot, "components", "open-ena", "OpenEnaLogin.tsx");

  assert.equal(existsSync(loginPath), true, "the localized login interface must exist");
  assert.match(page, /await cookies\(\)/);
  assert.match(page, /verifyOpenEnaSessionToken/);
  assert.match(page, /openEnaAuthConfigurationReady/);
  assert.match(page, /isAuthenticated[\s\S]*?<OpenEnaWorkspace locale=\{typedLocale\}/);
  assert.match(page, /!isAuthenticated[\s\S]*?<OpenEnaLogin[\s\S]*configurationReady=\{authConfigurationReady\}/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("one semantic fallback notice remains visible before and after sign-in", async () => {
  const noticeModule = await loadModule("../components/open-ena/OpenEnaFallbackNotice");
  assert.ok(noticeModule, "the shared fallback notice component must exist");
  const FallbackNotice = noticeModule.default;

  for (const locale of locales) {
    const markup = renderToStaticMarkup(createElement(FallbackNotice, { locale }));
    if (["en", "zh-hant", "zh-hans"].includes(locale)) {
      assert.equal(markup, "");
    } else {
      assert.match(markup, /role="note"/);
      assert.match(markup, /lang="en"/);
      assert.match(markup, /dir="ltr"/);
      assert.match(markup, /English interface/i);
      assert.match(markup, new RegExp(`\\b${locale}\\b`, "i"));
    }
  }

  const login = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaLogin.tsx"), "utf8");
  const workspace = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");
  for (const surface of [login, workspace]) {
    assert.match(surface, /import OpenEnaFallbackNotice from "\.\/OpenEnaFallbackNotice"/);
    assert.match(surface, /<OpenEnaFallbackNotice locale=\{locale\} \/>/);
  }
  assert.match(login, /\{configurationReady \? \([\s\S]*?<form action="\/api\/open-ena\/login"/);
  assert.match(login, /name="locale" value=\{locale\}/, "the original route locale must be retained");
});

test("the login form is accessible and never exposes the default account or password", () => {
  const loginPath = join(projectRoot, "components", "open-ena", "OpenEnaLogin.tsx");
  assert.equal(existsSync(loginPath), true);
  const login = readFileSync(loginPath, "utf8");
  const copy = readFileSync(join(projectRoot, "lib", "open-ena-auth-copy.ts"), "utf8");
  const auth = readFileSync(join(projectRoot, "lib", "open-ena-auth.ts"), "utf8");

  assert.match(login, /configurationReady/);
  assert.match(login, /copy\.unavailable/);
  assert.match(login, /action="\/api\/open-ena\/login"/);
  assert.match(login, /method="post"/);
  assert.match(login, /name="username"/);
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /name="password"/);
  assert.match(login, /type="password"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(login, /aria-describedby=\{error \? "open-ena-login-error" : undefined\}/);
  assert.match(login, /href="mailto:sandy0692@gmail\.com"/);
  assert.doesNotMatch(login, /priority/u);
  assert.doesNotMatch(`${login}\n${copy}`, /sandytu/);
  assert.doesNotMatch(`${login}\n${copy}`, /12345/);
  assert.doesNotMatch(auth, /sandytu/);
  assert.doesNotMatch(auth, /12345/);
});

test("the hidden Open ENA shell never preloads the shared ENA mark", () => {
  const header = readFileSync(join(projectRoot, "components", "Header.tsx"), "utf8");
  const footer = readFileSync(join(projectRoot, "components", "Footer.tsx"), "utf8");
  const logo = readFileSync(join(projectRoot, "components", "Logo.tsx"), "utf8");

  assert.match(header, /isOpenEnaPath/u);
  assert.match(header, /priority=\{!isOpenEnaPath\}/u);
  assert.doesNotMatch(footer, /<Logo[^>]*priority=/u);
  assert.match(logo, /priority = false/u);
  assert.match(logo, /priority=\{priority\}/u);
});

test("the public back-to-top control cannot cover the login form", () => {
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");
  assert.match(
    css,
    /body:has\(\.open-ena-login-page\) \.back-to-top\s*\{[\s\S]*?display:\s*none;/,
  );
});

test("the login action and contact email use the site baby-blue accent", () => {
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.open-ena-login-submit\s*\{[\s\S]*?border:\s*1px solid var\(--accent\);[\s\S]*?background:\s*var\(--accent\);/,
  );
  assert.match(
    css,
    /\.open-ena-login-submit:hover\s*\{[\s\S]*?border-color:\s*var\(--accent-hover\);[\s\S]*?background:\s*var\(--accent-hover\);/,
  );
  assert.match(
    css,
    /\.open-ena-login-collaboration a\s*\{[\s\S]*?color:\s*var\(--accent\);/,
  );
});

test("login and logout handlers use a hardened HttpOnly session cookie", () => {
  const loginRoutePath = join(projectRoot, "app", "api", "open-ena", "login", "route.ts");
  const logoutRoutePath = join(projectRoot, "app", "api", "open-ena", "logout", "route.ts");
  assert.equal(existsSync(loginRoutePath), true);
  assert.equal(existsSync(logoutRoutePath), true);

  const loginRoute = readFileSync(loginRoutePath, "utf8");
  const logoutRoute = readFileSync(logoutRoutePath, "utf8");
  assert.match(loginRoute, /verifyOpenEnaCredentials/);
  assert.match(loginRoute, /openEnaAuthConfigurationReady/);
  assert.match(loginRoute, /status:\s*503/);
  assert.match(loginRoute, /createOpenEnaSessionToken/);
  assert.match(loginRoute, /httpOnly:\s*true/);
  assert.match(loginRoute, /sameSite:\s*"lax"/);
  assert.match(loginRoute, /secure:\s*process\.env\.NODE_ENV === "production"/);
  assert.match(logoutRoute, /maxAge:\s*0/);
  assert.match(logoutRoute, /OPEN_ENA_SESSION_COOKIE/);
});

test("same-origin form posts follow the public Host even when Next uses an internal origin", async () => {
  const requestModule = await loadModule("../lib/open-ena-auth-request");
  assert.ok(requestModule, "the login routes need a proxy-safe public-origin validator");

  const localHeaders = new Headers({
    host: "127.0.0.1:3077",
    origin: "http://127.0.0.1:3077",
  });
  assert.equal(
    requestModule.resolveOpenEnaRequestOrigin(localHeaders, "http://localhost:3077"),
    "http://127.0.0.1:3077",
  );

  const proxiedHeaders = new Headers({
    host: "internal-runtime:3000",
    "x-forwarded-host": "www.ena.hk",
    origin: "https://www.ena.hk",
  });
  assert.equal(
    requestModule.resolveOpenEnaRequestOrigin(proxiedHeaders, "http://internal-runtime:3000"),
    "https://www.ena.hk",
  );

  const crossSiteHeaders = new Headers({
    host: "www.ena.hk",
    origin: "https://attacker.example",
  });
  assert.equal(
    requestModule.resolveOpenEnaRequestOrigin(crossSiteHeaders, "https://www.ena.hk"),
    null,
  );
});

test("the authenticated workbench provides a localized POST logout control", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );

  assert.match(workspace, /action="\/api\/open-ena\/logout"/);
  assert.match(workspace, /method="post"/);
  assert.match(workspace, /name="locale" value=\{locale\}/);
  assert.match(workspace, /authCopy\.signOut/);
});
