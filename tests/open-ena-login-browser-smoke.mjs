#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const viewportAudits = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "breakpoint", viewport: { width: 820, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

const unsafeBaseUrlMessage = "OPEN_ENA_BROWSER_BASE_URL must be an http loopback origin without credentials, path, query, or fragment";

export function validateOpenEnaLoopbackBaseUrl(rawValue) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawValue);
  } catch {
    throw new Error(unsafeBaseUrlMessage);
  }

  const isLoopbackHostname = parsedUrl.hostname === "127.0.0.1"
    || parsedUrl.hostname === "[::1]"
    || parsedUrl.hostname === "::1";
  if (
    parsedUrl.protocol !== "http:"
    || !isLoopbackHostname
    || parsedUrl.username !== ""
    || parsedUrl.password !== ""
    || parsedUrl.pathname !== "/"
    || parsedUrl.search !== ""
    || parsedUrl.hash !== ""
  ) {
    throw new Error(unsafeBaseUrlMessage);
  }

  return parsedUrl.origin;
}

export function createSensitiveValueRedactor(values) {
  const variants = new Set();
  for (const value of values ?? []) {
    if (typeof value !== "string" || value.length === 0) continue;
    variants.add(value);
    variants.add(encodeURIComponent(value));
    variants.add(new URLSearchParams({ value }).toString().slice("value=".length));
  }
  const orderedVariants = [...variants].sort((left, right) => right.length - left.length || left.localeCompare(right));

  return (input) => orderedVariants.reduce(
    (redacted, sensitiveValue) => redacted.replaceAll(sensitiveValue, "[redacted]"),
    String(input ?? ""),
  );
}

function collectBrowserMessages(page, redact) {
  const errors = [];
  const warnings = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${redact(error?.message ?? error)}`);
  });
  page.on("console", (message) => {
    const text = redact(message.text());
    if (message.type() === "error") errors.push(`console: ${text}`);
    if (message.type() === "warning") warnings.push("browser-warning");
  });

  return { errors, warnings };
}

function assertContained(inner, outer, label) {
  assert.ok(inner, `${label} inner bounding box is required`);
  assert.ok(outer, `${label} outer bounding box is required`);
  const tolerance = 1;
  assert.ok(inner.x >= outer.x - tolerance, `${label} exceeds the outer left edge`);
  assert.ok(inner.y >= outer.y - tolerance, `${label} exceeds the outer top edge`);
  assert.ok(
    inner.x + inner.width <= outer.x + outer.width + tolerance,
    `${label} exceeds the outer right edge`,
  );
  assert.ok(
    inner.y + inner.height <= outer.y + outer.height + tolerance,
    `${label} exceeds the outer bottom edge`,
  );
}

function assertApproximateRatio(box, expectedRatio, label) {
  assert.ok(box, `${label} bounding box is required`);
  assert.ok(box.width > 0 && box.height > 0, `${label} must have positive rendered dimensions`);
  const tolerance = 0.01;
  assert.ok(
    Math.abs(box.width / box.height - expectedRatio) <= tolerance,
    `${label} rendered aspect ratio must remain ${expectedRatio}`,
  );
}

function assertRectanglesDoNotOverlap(rectangles, label) {
  for (let firstIndex = 0; firstIndex < rectangles.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < rectangles.length; secondIndex += 1) {
      const first = rectangles[firstIndex];
      const second = rectangles[secondIndex];
      assert.ok(first, `${label} rectangle ${firstIndex + 1} is required`);
      assert.ok(second, `${label} rectangle ${secondIndex + 1} is required`);
      const overlaps = first.x < second.x + second.width
        && first.x + first.width > second.x
        && first.y < second.y + second.height
        && first.y + first.height > second.y;
      assert.equal(overlaps, false, `${label} rectangles ${firstIndex + 1} and ${secondIndex + 1} overlap`);
    }
  }
}

function assertNoBrowserErrors(messages, phase) {
  assert.deepEqual(messages.errors, [], `${phase} emitted page or console errors`);
}

async function preparePageForFullPageCapture(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  });
  await page.waitForFunction(() => window.scrollY === 0 && window.scrollX === 0);

  const captureState = await page.evaluate(() => {
    const skipLink = document.querySelector(".skip-link");
    const header = document.querySelector(".site-header");
    if (!(skipLink instanceof HTMLElement)) throw new Error("The skip link is required for capture preparation");
    if (!(header instanceof HTMLElement)) throw new Error("The site header is required for capture preparation");
    const skipLinkRect = skipLink.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return {
      skipLinkBottom: skipLinkRect.bottom,
      headerTop: headerRect.top,
      headerY: headerRect.y,
    };
  });

  assert.ok(captureState.skipLinkBottom <= 0, "the skip link must be hidden before full-page capture");
  assert.ok(Math.abs(captureState.headerTop) <= 1, "the site header must be at the top before full-page capture");
  assert.ok(Math.abs(captureState.headerY) <= 1, "the site header y position must be at the top before full-page capture");
}

async function waitForLoginBrand(page) {
  const brandPanel = page.locator(".open-ena-login-context");
  const formPanel = page.locator(".open-ena-login-panel");
  const logo = page.locator('img[src*="logo-open-ena.svg"]');
  const hero = page.locator('img[src*="open-ena-network-hero.svg"]');

  await Promise.all([
    brandPanel.waitFor({ state: "visible" }),
    formPanel.waitFor({ state: "visible" }),
    logo.waitFor({ state: "visible" }),
    hero.waitFor({ state: "visible" }),
    page.locator(".open-ena-login-form").waitFor({ state: "visible" }),
  ]);
  await page.waitForFunction(() => {
    const lockup = document.querySelector('img[src*="logo-open-ena.svg"]');
    const network = document.querySelector('img[src*="open-ena-network-hero.svg"]');
    return Boolean(
      lockup instanceof HTMLImageElement
        && network instanceof HTMLImageElement
        && lockup.complete
        && lockup.naturalWidth > 0
        && network.complete
        && network.naturalWidth > 0,
    );
  });

  return { brandPanel, formPanel, logo, hero };
}

async function auditBrandAtViewport(browser, name, viewport, { artifactDirectory, loginUrl, redact }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const messages = collectBrowserMessages(page, redact);

  try {
    await page.goto(loginUrl, { waitUntil: "networkidle" });
    const { brandPanel, formPanel, logo, hero } = await waitForLoginBrand(page);

    assert.equal(await logo.getAttribute("alt"), "Open ENA — Epistemic Network Analysis");
    assert.equal(await hero.getAttribute("alt"), "");
    assert.equal(
      await hero.evaluate((image) => image.closest(".open-ena-login-network")?.getAttribute("aria-hidden")),
      "true",
      "the network hero must remain decorative",
    );
    assert.equal(await page.locator(".open-ena-login-context-copy li").count(), 3);

    const brandAudit = await page.evaluate(() => {
      const lockup = document.querySelector('img[src*="logo-open-ena.svg"]');
      const network = document.querySelector('img[src*="open-ena-network-hero.svg"]');
      const panel = document.querySelector(".open-ena-login-context");
      const shell = document.querySelector(".open-ena-login-shell");
      if (!(lockup instanceof HTMLImageElement)) throw new Error("The Open ENA logo image is missing");
      if (!(network instanceof HTMLImageElement)) throw new Error("The Open ENA hero image is missing");
      if (!(panel instanceof HTMLElement)) throw new Error("The Open ENA brand panel is missing");
      if (!(shell instanceof HTMLElement)) throw new Error("The Open ENA login shell is missing");
      const logoCurrentSrc = new URL(lockup.currentSrc);
      const heroCurrentSrc = new URL(network.currentSrc);
      const heroResources = performance.getEntriesByType("resource")
        .filter((entry) => entry.name.includes("open-ena-network-hero.svg"));

      return {
        logoWidthAttribute: lockup.getAttribute("width"),
        logoHeightAttribute: lockup.getAttribute("height"),
        heroWidthAttribute: network.getAttribute("width"),
        heroHeightAttribute: network.getAttribute("height"),
        pageOrigin: window.location.origin,
        logoCurrentSrcOrigin: logoCurrentSrc.origin,
        logoCurrentSrcPathname: logoCurrentSrc.pathname,
        heroCurrentSrcOrigin: heroCurrentSrc.origin,
        heroCurrentSrcPathname: heroCurrentSrc.pathname,
        brandBackgroundColor: getComputedStyle(panel).backgroundColor,
        brandBackgroundImage: getComputedStyle(panel).backgroundImage,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        hasHeroPreload: Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'))
          .some((link) => link.getAttribute("href")?.includes("open-ena-network-hero.svg")),
        heroResourceInitiatorTypes: heroResources.map((entry) => entry.initiatorType),
        shellGridTemplateColumns: getComputedStyle(shell).gridTemplateColumns,
      };
    });

    assert.equal(brandAudit.logoWidthAttribute, "250");
    assert.equal(brandAudit.logoHeightAttribute, "80");
    assert.equal(brandAudit.heroWidthAttribute, "620");
    assert.equal(brandAudit.heroHeightAttribute, "520");
    assert.equal(brandAudit.logoCurrentSrcOrigin, brandAudit.pageOrigin);
    assert.equal(brandAudit.heroCurrentSrcOrigin, brandAudit.pageOrigin);
    assert.equal(brandAudit.logoCurrentSrcPathname, "/logo-open-ena.svg");
    assert.equal(brandAudit.heroCurrentSrcPathname, "/open-ena-network-hero.svg");
    assert.equal(brandAudit.brandBackgroundColor, "rgb(247, 251, 254)");
    assert.match(brandAudit.brandBackgroundImage, /radial-gradient/u);
    assert.ok(brandAudit.scrollWidth <= brandAudit.clientWidth + 1, "login page must not overflow horizontally");
    assert.equal(brandAudit.hasHeroPreload, false, "the decorative hero must not be image-preloaded");
    assert.ok(brandAudit.heroResourceInitiatorTypes.length > 0, "the hero image must create a resource timing entry");
    assert.ok(
      brandAudit.heroResourceInitiatorTypes.every((initiatorType) => initiatorType === "img"),
      "the hero image must load only as an img resource",
    );

    const [logoBox, heroBox, brandBox, formBox] = await Promise.all([
      logo.boundingBox(),
      hero.boundingBox(),
      brandPanel.boundingBox(),
      formPanel.boundingBox(),
    ]);
    assertContained(logoBox, brandBox, `${name} logo`);
    assertContained(heroBox, brandBox, `${name} decorative hero`);
    assertApproximateRatio(logoBox, 250 / 80, `${name} logo`);
    assertApproximateRatio(heroBox, 620 / 520, `${name} decorative hero`);

    assert.ok(brandBox, `${name} brand panel bounding box is required`);
    assert.ok(formBox, `${name} form panel bounding box is required`);
    if (viewport.width <= 820) {
      assert.ok(
        formBox.y >= brandBox.y + brandBox.height - 1,
        `${name} form panel must begin below the brand panel`,
      );
      assert.equal(
        brandAudit.shellGridTemplateColumns.trim().split(/\s+/u).length,
        1,
        `${name} shell must use one grid column`,
      );
    } else {
      assert.ok(
        brandBox.x + brandBox.width <= formBox.x + 1,
        `${name} brand panel must end before the form panel begins`,
      );
    }

    if (viewport.width === 390) {
      const researchFlowBoxes = await page.locator(".open-ena-login-context-copy li").evaluateAll(
        (items) => items.map((item) => {
          const { x, y, width, height } = item.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
      assertRectanglesDoNotOverlap(researchFlowBoxes, "mobile research-flow items");
    }

    await preparePageForFullPageCapture(page);
    await page.screenshot({
      path: resolve(artifactDirectory, `${name}-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
    assertNoBrowserErrors(messages, `${name} brand audit`);
    return { warningCount: messages.warnings.length };
  } finally {
    await context.close();
  }
}

async function auditAuthentication(browser, { loginUrl, password, redact, username }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const messages = collectBrowserMessages(page, redact);

  try {
    await page.goto(loginUrl, { waitUntil: "networkidle" });
    await page.getByLabel("Account name").fill("invalid-local-account");
    await page.getByLabel("Password").fill("invalid-local-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("alert").waitFor({ state: "visible" });

    await page.getByLabel("Account name").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator(".open-ena-workbench").waitFor({ state: "visible", timeout: 30_000 });

    assertNoBrowserErrors(messages, "authentication audit");
    return { warningCount: messages.warnings.length };
  } finally {
    await context.close();
  }
}

export async function runOpenEnaLoginBrowserSmoke(environment = process.env) {
  const baseUrl = validateOpenEnaLoopbackBaseUrl(
    environment.OPEN_ENA_BROWSER_BASE_URL ?? "http://127.0.0.1:3000",
  );
  const loginUrl = new URL("/en/open-ena", `${baseUrl}/`).href;
  const username = environment.OPEN_ENA_BROWSER_USERNAME;
  const password = environment.OPEN_ENA_BROWSER_PASSWORD;
  assert.ok(username, "OPEN_ENA_BROWSER_USERNAME is required for the local login gate");
  assert.ok(password, "OPEN_ENA_BROWSER_PASSWORD is required for the local login gate");
  const redact = createSensitiveValueRedactor([username, password]);
  const artifactDirectory = resolve(
    environment.OPEN_ENA_LOGIN_BROWSER_ARTIFACTS
      ?? "output/browser/open-ena-login-brand-refresh",
  );
  await mkdir(artifactDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const warningCounts = [];
    const config = { artifactDirectory, loginUrl, password, redact, username };
    for (const { name, viewport } of viewportAudits) {
      const result = await auditBrandAtViewport(browser, name, viewport, config);
      warningCounts.push(result.warningCount);
    }
    const authenticationResult = await auditAuthentication(browser, config);
    warningCounts.push(authenticationResult.warningCount);
    const warningCount = warningCounts.reduce((total, count) => total + count, 0);
    const summary = {
      status: "PASS",
      URL: loginUrl,
      viewports: ["1440x1000", "820x1000", "390x844"],
      artifactDirectory,
      ...(warningCount > 0 ? { warnings: { categories: ["browser-warning"], count: warningCount } } : {}),
    };

    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return summary;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runOpenEnaLoginBrowserSmoke();
}
