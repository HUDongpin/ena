import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { locales } from "../lib/i18n";
import * as openEnaLoginModule from "../components/open-ena/OpenEnaLogin";

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

test("v2 sessions rotate their jti while preserving one account-derived principal", async () => {
  const auth = await loadModule("../lib/open-ena-auth");
  assert.ok(auth);
  const environment = {
    OPEN_ENA_USERNAME: "researcher",
    OPEN_ENA_PASSWORD: "a-different-strong-passphrase",
    OPEN_ENA_SESSION_SECRET: "s".repeat(32),
    OPEN_ENA_ACCOUNT_ID: "stable-deployment-account-id",
  };
  const first = auth.createOpenEnaSessionTokenV2(1_800_000_000_000, environment);
  const second = auth.createOpenEnaSessionTokenV2(1_800_000_001_000, environment);
  assert.notEqual(first, second);
  const firstPrincipal = auth.verifyOpenEnaSessionTokenV2(first, 1_800_000_002_000, environment);
  const secondPrincipal = auth.verifyOpenEnaSessionTokenV2(second, 1_800_000_002_000, environment);
  assert.ok(firstPrincipal);
  assert.ok(secondPrincipal);
  assert.equal(firstPrincipal.principalRef, secondPrincipal.principalRef);
  assert.notEqual(firstPrincipal.jti, secondPrincipal.jti);
  assert.equal(auth.verifyOpenEnaSessionTokenV2(first, 1_800_000_002_000, {
    ...environment,
    OPEN_ENA_ACCOUNT_ID: "another-account-id",
  }), null);
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
  assert.match(page, /verifyProductionOpenEnaSessionTokenV2/);
  assert.match(page, /openEnaAuthSecurityConfigurationReady/);
  assert.doesNotMatch(page, /verifyOpenEnaSessionToken\(sessionCookie\)/);
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

  const LoginFrame = Reflect.get(openEnaLoginModule, "OpenEnaLoginFrame");
  assert.equal(typeof LoginFrame, "function", "a hook-free Login root seam must be exported");
  const unsupportedLogin = renderToStaticMarkup(createElement(LoginFrame, {
    locale: "ar",
    children: "login",
  }));
  assert.match(
    unsupportedLogin,
    /<div class="open-ena-login-page"[^>]*lang="en"[^>]*dir="ltr"/,
    "the full English login interface must override unsupported route language and direction semantics",
  );
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

type OpenEnaAssetContract = {
  viewBox: string;
  title: string;
  description: string;
  visibleLabels: string[];
  edges?: Array<{ path: string; stroke: string; width: string; dash?: string }>;
};

function assertValidOpenEnaSvg(source: string, contract: OpenEnaAssetContract) {
  const rootMatch = source.match(/^<svg\b([^>]*)>/u);
  assert.ok(rootMatch, "SVG must have a root element");
  const rootAttributes = rootMatch[1];
  const readAttribute = (attributes: string, name: string) => {
    const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u"));
    return match?.[1];
  };
  assert.equal(readAttribute(rootAttributes, "role"), "img");
  assert.equal(readAttribute(rootAttributes, "aria-labelledby"), "title desc");
  assert.equal(readAttribute(rootAttributes, "viewBox"), contract.viewBox);

  const ids = [...source.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gu)].map((match) => match[2]);
  assert.equal(ids.filter((id) => id === "title").length, 1, "title ID must occur exactly once globally");
  assert.equal(ids.filter((id) => id === "desc").length, 1, "desc ID must occur exactly once globally");
  const titles = [...source.matchAll(/<title\b[^>]*\bid\s*=\s*(["'])title\1[^>]*>([\s\S]*?)<\/title>/gu)];
  const descriptions = [...source.matchAll(/<desc\b[^>]*\bid\s*=\s*(["'])desc\1[^>]*>([\s\S]*?)<\/desc>/gu)];
  assert.equal(titles.length, 1, "SVG must contain exactly one title with id=title");
  assert.equal(descriptions.length, 1, "SVG must contain exactly one desc with id=desc");
  assert.equal(titles[0][2], contract.title);
  assert.equal(descriptions[0][2], contract.description);
  assert.doesNotMatch(
    source,
    /#(?:72c7bd|66bfb5|56b09d|397e73|4db6ac|49a892|418476|72a69e|f4fbf9|eef9f7|d7eeea)\b|rgba\(\s*(?:114\s*,\s*199\s*,\s*189|86\s*,\s*176\s*,\s*157)/iu,
    "SVG must not contain the legacy palette",
  );
  for (const label of contract.visibleLabels) {
    assert.match(source, new RegExp(`<text\\b[^>]*>\\s*${label}\\s*<\\/text>`, "u"));
  }

  const pathElements = [...source.matchAll(/<path\b([^>]*)\/>/gu)].map((match) => match[1]);
  for (const edge of contract.edges ?? []) {
    const pathAttributes = pathElements.find((attributes) => readAttribute(attributes, "d") === edge.path);
    assert.ok(pathAttributes, `missing path ${edge.path}`);
    assert.equal(readAttribute(pathAttributes, "stroke"), edge.stroke);
    assert.equal(readAttribute(pathAttributes, "stroke-width"), edge.width);
    if (edge.dash) assert.equal(readAttribute(pathAttributes, "stroke-dasharray"), edge.dash);
  }

  for (const assetElement of ["script", "style", "foreignObject", "animate", "animateColor", "animateMotion", "animateTransform", "set", "discard", "audio", "video", "image", "use", "a"]) {
    assert.doesNotMatch(source, new RegExp(`<${assetElement}\\b`, "iu"), `SVG must not contain <${assetElement}>`);
  }
  assert.doesNotMatch(source, /(?:^|\s)on[a-z][a-z0-9_.:-]*\s*=/iu, "SVG must not contain event handlers");
  assert.doesNotMatch(source, /(?:^|\s)(?:xlink:)?href\s*=/iu, "SVG must not contain href attributes");
  assert.doesNotMatch(source, /(?:javascript:|data:|@import)/iu, "SVG must not contain active URLs");
  const withoutInternalPaintRefs = source.replace(/url\(#[a-z][\w.-]*\)/giu, "");
  assert.doesNotMatch(withoutInternalPaintRefs, /url\(/iu, "SVG may only use internal paint-server URLs");
  const withoutNamespace = source.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/giu, "");
  assert.doesNotMatch(withoutNamespace, /(?:https?:)?\/\//iu, "SVG must not contain external URLs");
  assert.match(source, /#89CFF0/iu, "SVG must retain Baby Blue");
}

const lockupContract: OpenEnaAssetContract = {
  viewBox: "0 0 250 80",
  title: "Open ENA",
  description: "Open ENA wordmark with ENA placed beneath Open and an open network-ring symbol. Epistemic Network Analysis.",
  visibleLabels: ["OPEN", "ENA", "EPISTEMIC", "NETWORK", "ANALYSIS"],
};
const networkContract: OpenEnaAssetContract = {
  viewBox: "0 0 620 520",
  title: "Open epistemic network",
  description: "Connected evidence, ideas, context, and links extend through an open circular boundary.",
  visibleLabels: ["EVIDENCE", "IDEAS", "CONTEXT", "LINKS", "OPEN"],
  edges: [
    { path: "M189 290 270 185", stroke: "#1A2B3F", width: "4" },
    { path: "M270 185 377 222", stroke: "#89CFF0", width: "11" },
    { path: "M189 290 333 340", stroke: "#89CFF0", width: "7" },
    { path: "M333 340 377 222", stroke: "#1A2B3F", width: "3" },
    { path: "M270 185 333 340", stroke: "#1A2B3F", width: "5" },
    { path: "M377 222 493 112", stroke: "#89CFF0", width: "6", dash: "12 12" },
  ],
};

test("the login owns local official Open ENA lockup and open-ring network assets", () => {
  const lockupPath = join(projectRoot, "public", "logo-open-ena.svg");
  const networkPath = join(projectRoot, "public", "open-ena-network-hero.svg");

  assert.equal(existsSync(lockupPath), true, "the official horizontal Open ENA lockup must be local");
  assert.equal(existsSync(networkPath), true, "the official open-ring network must be local");

  const lockup = readFileSync(lockupPath, "utf8");
  const network = readFileSync(networkPath, "utf8");
  assertValidOpenEnaSvg(lockup, lockupContract);
  assertValidOpenEnaSvg(network, networkContract);
  assert.match(network, /stroke-dasharray="12 12"/u);
  assert.match(lockup, /#89CFF0/iu);
  assert.match(network, /#89CFF0/iu);

  assert.throws(() => assertValidOpenEnaSvg(lockup.replace('id="title"', ""), lockupContract), /title ID|exactly one title/u);
  assert.throws(() => assertValidOpenEnaSvg(network.replace("</g>", '<animateMotion dur="1s"/></g>'), networkContract), /animateMotion/u);
  assert.throws(() => assertValidOpenEnaSvg(network.replace("</defs>", '<style>@import url(https://attacker.example/a.css);</style></defs>'), networkContract), /<style>|active URLs|paint-server/u);
  assert.throws(() => assertValidOpenEnaSvg(network.replace("#89CFF0", "#4DB6AC"), networkContract), /legacy palette/u);
  assert.throws(() => assertValidOpenEnaSvg(network.replace("</svg>", "<circle onload='alert(1)'/></svg>"), networkContract), /event handlers/u);
  assert.throws(() => assertValidOpenEnaSvg(lockup.replace("<title id=\"title\">", "<g id=\"title\"/><title id=\"title\">").replace("<desc id=\"desc\">", "<desc id=\"desc\">").replace("</svg>", "</svg>"), lockupContract), /title ID|exactly one title/u);
});

test("the login presents the official light Open ENA brand panel without changing its research flow", () => {
  const login = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaLogin.tsx"),
    "utf8",
  );
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.match(login, /<div className="open-ena-login-brand" dir="ltr" lang="en">/u);
  assert.match(login, /src="\/logo-open-ena\.svg"/u);
  assert.match(login, /alt="Open ENA — Epistemic Network Analysis"/u);
  assert.match(login, /src="\/open-ena-network-hero\.svg"/u);
  assert.match(login, /className="open-ena-login-network-hero"[\s\S]*?loading="lazy"[\s\S]*?alt=""/u);
  assert.doesNotMatch(login, /src="\/ena-mark\.svg"/u);
  assert.doesNotMatch(login, /<strong>OPEN ENA<\/strong>/u);
  assert.doesNotMatch(login, /<span>ENA\.HK<\/span>/u);
  assert.doesNotMatch(login, /viewBox="0 0 420 270"/u);
  assert.match(login, /<p>\{copy\.workspaceLabel\}<\/p>[\s\S]*?<ol aria-label=\{copy\.workspaceLabel\}>/u);
  assert.match(login, /copy\.researchFlow\.map/u);

  const pageRule = css.match(/\.open-ena-login-page\s*\{([^}]*)\}/u)?.[1] ?? "";
  const contextRule = css.match(/\.open-ena-login-context\s*\{([^}]*)\}/u)?.[1] ?? "";
  assert.match(pageRule, /background:[\s\S]*?var\(--page\);/u);
  assert.match(contextRule, /background:[\s\S]*?var\(--surface\);/u);
  assert.doesNotMatch(contextRule, /#1d2b3a/iu);
  assert.match(css, /\.open-ena-login-context-copy > p\s*\{[\s\S]*?color:\s*var\(--muted\);/u);
  assert.match(css, /\.open-ena-login-context-copy li\s*\{[\s\S]*?color:\s*var\(--ink\);/u);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.open-ena-login-network\s*\{[\s\S]*?display:\s*grid;/u);
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
    /\.open-ena-login-collaboration a\s*\{[\s\S]*?color:\s*var\(--accent-strong\);/,
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
  assert.match(loginRoute, /openEnaAuthSecurityConfigurationReady/);
  assert.match(loginRoute, /(?:status:\s*503|,\s*503\))/u);
  assert.match(loginRoute, /createOpenEnaSessionToken/);
  assert.match(loginRoute, /httpOnly:\s*true/);
  assert.match(loginRoute, /sameSite:\s*"lax"/);
  assert.match(loginRoute, /secure:\s*(?:process\.env|environment)\.NODE_ENV === "production"/);
  assert.match(logoutRoute, /maxAge:\s*0/);
  assert.match(logoutRoute, /OPEN_ENA_SESSION_COOKIE/);
});

test("same-origin form posts require an operator-owned origin list when Next uses an internal origin", async () => {
  const requestModule = await loadModule("../lib/open-ena-auth-request");
  assert.ok(requestModule, "the login routes need a proxy-safe public-origin validator");

  const localHeaders = new Headers({
    host: "localhost:3077",
    origin: "http://localhost:3077",
  });
  assert.equal(
    requestModule.resolveOpenEnaRequestOrigin(localHeaders, "http://localhost:3077", { NODE_ENV: "development" }),
    "http://localhost:3077",
  );

  const proxiedHeaders = new Headers({
    host: "internal-runtime:3000",
    "x-forwarded-host": "www.ena.hk",
    origin: "https://www.ena.hk",
  });
  assert.equal(
    requestModule.resolveOpenEnaRequestOrigin(
      proxiedHeaders,
      "http://internal-runtime:3000",
      { NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk" },
    ),
    "https://www.ena.hk",
  );
  assert.equal(
    requestModule.resolveOpenEnaRequestOrigin(
      proxiedHeaders,
      "http://internal-runtime:3000",
      { NODE_ENV: "production" },
    ),
    null,
    "production must not infer a public origin from a client-controlled Host or forwarded header",
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
