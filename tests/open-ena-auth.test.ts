import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

async function loadModule(relativePath: string) {
  try {
    return await import(relativePath);
  } catch {
    return null;
  }
}

test("Open ENA accepts only the configured default credentials", async () => {
  const auth = await loadModule("../lib/open-ena-auth");
  assert.ok(auth, "lib/open-ena-auth.ts must provide server-side credential verification");

  const environment = {};
  assert.equal(auth.verifyOpenEnaCredentials("sandytu", "12345", environment), true);
  assert.equal(auth.verifyOpenEnaCredentials("sandytu", "12346", environment), false);
  assert.equal(auth.verifyOpenEnaCredentials("other", "12345", environment), false);
  assert.equal(auth.verifyOpenEnaCredentials("", "", environment), false);
});

test("deployment environment values can rotate the Open ENA credentials", async () => {
  const auth = await loadModule("../lib/open-ena-auth");
  assert.ok(auth);

  const environment = {
    OPEN_ENA_USERNAME: "researcher",
    OPEN_ENA_PASSWORD: "a-different-passphrase",
  };
  assert.equal(auth.verifyOpenEnaCredentials("researcher", "a-different-passphrase", environment), true);
  assert.equal(auth.verifyOpenEnaCredentials("sandytu", "12345", environment), false);
});

test("Open ENA session tokens are signed, expire, and reject tampering", async () => {
  const auth = await loadModule("../lib/open-ena-auth");
  assert.ok(auth);

  const environment = { OPEN_ENA_SESSION_SECRET: "test-session-secret-with-enough-entropy" };
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
  assert.match(en.collaborationNotice, /Registration will be available in the future/);
  assert.match(en.collaborationNotice, /Professor Sandy TU Yun-Fang \(sandy0692@gmail\.com\)/);
  assert.equal(zhHant.title, "登入 Open ENA");
  assert.match(zhHant.collaborationNotice, /未來會開放註冊/);
  assert.equal(zhHans.title, "登录 Open ENA");
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
  assert.match(page, /isAuthenticated[\s\S]*?<OpenEnaWorkspace locale=\{typedLocale\}/);
  assert.match(page, /!isAuthenticated[\s\S]*?<OpenEnaLogin/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("the login form is accessible and never exposes the default account or password", () => {
  const loginPath = join(projectRoot, "components", "open-ena", "OpenEnaLogin.tsx");
  assert.equal(existsSync(loginPath), true);
  const login = readFileSync(loginPath, "utf8");
  const copy = readFileSync(join(projectRoot, "lib", "open-ena-auth-copy.ts"), "utf8");

  assert.match(login, /action="\/api\/open-ena\/login"/);
  assert.match(login, /method="post"/);
  assert.match(login, /name="username"/);
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /name="password"/);
  assert.match(login, /type="password"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(login, /aria-describedby=\{error \? "open-ena-login-error" : undefined\}/);
  assert.match(login, /href="mailto:sandy0692@gmail\.com"/);
  assert.doesNotMatch(`${login}\n${copy}`, /sandytu/);
  assert.doesNotMatch(`${login}\n${copy}`, /12345/);
});

test("the public back-to-top control cannot cover the login form", () => {
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");
  assert.match(
    css,
    /body:has\(\.open-ena-login-page\) \.back-to-top\s*\{[\s\S]*?display:\s*none;/,
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
