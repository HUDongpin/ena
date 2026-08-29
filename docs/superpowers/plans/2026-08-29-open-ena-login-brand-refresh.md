# Open ENA Login Brand Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Open ENA login screen's dark left panel, legacy mark, and simplified network with the user-approved official Open ENA Baby Blue lockup and open-ring network while preserving authentication and localized research-flow behavior.

**Architecture:** Keep `OpenEnaLogin` as the single server-rendered login owner. Add two local, accessible SVG assets; wire them into the existing left brand subtree; restyle only the login presentation selectors with existing Baby Blue tokens; and add source-contract plus real Chromium regression coverage. No state, API, authentication, jENA, or workspace code changes are needed.

**Tech Stack:** Next.js App Router, React server components, TypeScript, CSS, local SVG assets, Node test runner with `tsx`, Playwright Chromium.

---

## Scope and File Map

- Create `public/logo-open-ena.svg`: official horizontal lockup used only by the Open ENA login refresh.
- Create `public/open-ena-network-hero.svg`: official open-ring epistemic network illustration used only by the login brand panel.
- Modify `components/open-ena/OpenEnaLogin.tsx`: replace the legacy mark/text and inline simplified network; preserve the form and localized flow.
- Modify `app/globals.css`: move the login canvas and left panel to Baby Blue surfaces; size both SVGs responsively; preserve form styles.
- Modify `tests/open-ena-auth.test.ts`: add asset and login-presenter regression contracts before product changes.
- Create `tests/open-ena-login-browser-smoke-contract.test.ts`: lock the bounded browser gate and prevent credential hardcoding.
- Create `tests/open-ena-login-browser-smoke.mjs`: verify desktop/mobile branding, overflow, invalid login, valid local login, screenshots, and browser errors.
- Modify `package.json`: expose `test:browser:open-ena-login` without changing existing scripts.

Do not stage `.superpowers/`; it contains the approved local visual-companion preview. Do not modify `lib/open-ena-auth.ts`, either login/logout route, localized login copy, the authenticated workspace, global ENA.HK identity assets, CI, or deployment configuration.

### Task 1: Add the two official local SVG assets with a failing asset contract

**Files:**

- Create: `public/logo-open-ena.svg`
- Create: `public/open-ena-network-hero.svg`
- Modify: `tests/open-ena-auth.test.ts:197-220`

- [ ] **Step 1: Write the failing asset contract**

Add this test immediately before `the login action and contact email use the site baby-blue accent` in `tests/open-ena-auth.test.ts`:

```ts
test("the login owns local official Open ENA lockup and open-ring network assets", () => {
  const lockupPath = join(projectRoot, "public", "logo-open-ena.svg");
  const networkPath = join(projectRoot, "public", "open-ena-network-hero.svg");

  assert.equal(existsSync(lockupPath), true, "the official horizontal Open ENA lockup must be local");
  assert.equal(existsSync(networkPath), true, "the official open-ring network must be local");

  const lockup = readFileSync(lockupPath, "utf8");
  assert.match(lockup, /viewBox="0 0 250 80"/u);
  assert.match(lockup, /<title[^>]*>Open ENA<\/title>/u);
  assert.match(lockup, /Epistemic Network Analysis/u);
  assert.match(lockup, /#89CFF0/iu);

  const network = readFileSync(networkPath, "utf8");
  assert.match(network, /viewBox="0 0 620 520"/u);
  for (const label of ["EVIDENCE", "IDEAS", "CONTEXT", "LINKS", "OPEN"]) {
    assert.match(network, new RegExp(`>${label}<`, "u"));
  }
  assert.match(network, /stroke-dasharray="12 12"/u);
  assert.match(network, /#89CFF0/iu);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
./node_modules/.bin/tsx --test tests/open-ena-auth.test.ts
```

Expected: FAIL in `the login owns local official Open ENA lockup and open-ring network assets` because `public/logo-open-ena.svg` does not exist.

- [ ] **Step 3: Create the horizontal lockup asset**

Create `public/logo-open-ena.svg` with exactly this vector source:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 80" role="img" aria-labelledby="title desc">
  <title id="title">Open ENA</title>
  <desc id="desc">Open ENA wordmark with ENA placed beneath Open and an open network-ring symbol. Epistemic Network Analysis.</desc>
  <g transform="translate(4 8)">
    <path d="M48.8 6.8A24 24 0 1 0 53 38.5" fill="none" stroke="#89CFF0" stroke-width="6" stroke-linecap="round"/>
    <g fill="none" stroke="#0F172A" stroke-width="2.35" stroke-linecap="round">
      <path d="M20.5 31.2 32.8 18.8 42.5 33.7 54.2 6.2"/>
      <path d="M20.5 31.2 42.5 33.7" opacity=".58"/>
    </g>
    <g fill="#F7FBFE" stroke="#0F172A" stroke-width="2.2">
      <circle cx="20.5" cy="31.2" r="4.3"/>
      <circle cx="32.8" cy="18.8" r="4.3"/>
      <circle cx="42.5" cy="33.7" r="4.3"/>
    </g>
    <circle cx="54.2" cy="6.2" r="5" fill="#89CFF0" stroke="#0F172A" stroke-width="2.2"/>
  </g>
  <text x="82" y="29" fill="#175F88" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="17" font-weight="750" letter-spacing="5">OPEN</text>
  <text x="80" y="61" fill="#0F172A" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="36" font-weight="850" letter-spacing="-.8">ENA</text>
  <path d="M184 21h48" stroke="#89CFF0" stroke-width="3" stroke-linecap="round"/>
  <text x="184" y="39" fill="#526477" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="8.8" font-weight="650" letter-spacing="1.2">EPISTEMIC</text>
  <text x="184" y="51" fill="#526477" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="8.8" font-weight="650" letter-spacing="1.2">NETWORK</text>
  <text x="184" y="63" fill="#526477" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="8.8" font-weight="650" letter-spacing="1.2">ANALYSIS</text>
</svg>
```

- [ ] **Step 4: Create the open-ring network asset**

Create `public/open-ena-network-hero.svg` with exactly this vector source:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 520" role="img" aria-labelledby="title desc">
  <title id="title">Open epistemic network</title>
  <desc id="desc">Connected evidence, ideas, context, and links extend through an open circular boundary.</desc>
  <defs>
    <linearGradient id="open-ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#B9E5F8"/>
      <stop offset="1" stop-color="#73C2E8"/>
    </linearGradient>
    <filter id="soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#175F88" flood-opacity=".12"/>
    </filter>
  </defs>
  <circle cx="290" cy="262" r="188" fill="#FFFFFF" stroke="#D9EEF7" stroke-width="1.5"/>
  <path d="M431 137A188 188 0 1 0 460 355" fill="none" stroke="url(#open-ring)" stroke-width="27" stroke-linecap="round"/>
  <g fill="none" stroke="#DDEBF1" stroke-width="1">
    <path d="M130 262h322M291 98v331"/>
    <circle cx="290" cy="262" r="105"/>
  </g>
  <g fill="none" stroke-linecap="round">
    <path d="M189 290 270 185" stroke="#1A2B3F" stroke-width="4"/>
    <path d="M270 185 377 222" stroke="#89CFF0" stroke-width="11"/>
    <path d="M189 290 333 340" stroke="#89CFF0" stroke-width="7"/>
    <path d="M333 340 377 222" stroke="#1A2B3F" stroke-width="3"/>
    <path d="M270 185 333 340" stroke="#1A2B3F" stroke-width="5"/>
    <path d="M377 222 493 112" stroke="#89CFF0" stroke-width="6" stroke-dasharray="12 12"/>
  </g>
  <g filter="url(#soft-shadow)">
    <g fill="#FFFFFF" stroke="#0F172A" stroke-width="4">
      <circle cx="189" cy="290" r="18"/>
      <circle cx="270" cy="185" r="18"/>
      <circle cx="333" cy="340" r="18"/>
    </g>
    <circle cx="377" cy="222" r="21" fill="#89CFF0" stroke="#0F172A" stroke-width="4"/>
    <circle cx="493" cy="112" r="22" fill="#89CFF0" stroke="#0F172A" stroke-width="4"/>
  </g>
  <g fill="#526477" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.1">
    <text x="156" y="326">EVIDENCE</text>
    <text x="240" y="154">IDEAS</text>
    <text x="300" y="382">CONTEXT</text>
    <text x="363" y="190">LINKS</text>
    <text x="470" y="75" fill="#175F88">OPEN</text>
  </g>
</svg>
```

- [ ] **Step 5: Run the focused asset and theme tests and confirm GREEN**

Run:

```bash
./node_modules/.bin/tsx --test \
  tests/open-ena-auth.test.ts \
  tests/site-baby-blue-theme.test.ts
```

Expected: all tests PASS; no legacy mint/teal literal is introduced.

- [ ] **Step 6: Commit the asset slice**

Run:

```bash
git add \
  public/logo-open-ena.svg \
  public/open-ena-network-hero.svg \
  tests/open-ena-auth.test.ts
git diff --cached --check
git commit -m "feat(open-ena): add official login brand assets"
```

Expected: one commit containing only the two assets and their focused test.

### Task 2: Replace the login brand subtree and dark presentation with the approved layout

**Files:**

- Modify: `components/open-ena/OpenEnaLogin.tsx:39-78`
- Modify: `app/globals.css:2011-2170,2331-2376`
- Modify: `tests/open-ena-auth.test.ts:197-235`

- [ ] **Step 1: Write the failing presenter and CSS contract**

Add this test after the asset contract in `tests/open-ena-auth.test.ts`:

```ts
test("the login presents the official light Open ENA brand panel without changing its research flow", () => {
  const login = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaLogin.tsx"),
    "utf8",
  );
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.match(login, /src="\/logo-open-ena\.svg"/u);
  assert.match(login, /alt="Open ENA — Epistemic Network Analysis"/u);
  assert.match(login, /src="\/open-ena-network-hero\.svg"/u);
  assert.match(login, /className="open-ena-login-network-hero"[\s\S]*?alt=""/u);
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
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
./node_modules/.bin/tsx --test tests/open-ena-auth.test.ts
```

Expected: FAIL because `OpenEnaLogin.tsx` still references `/ena-mark.svg` and the CSS still uses `#1d2b3a`.

- [ ] **Step 3: Replace the brand and network JSX only**

Replace the contents of `.open-ena-login-context` before `.open-ena-login-context-copy` with:

```tsx
<div className="open-ena-login-brand" dir="ltr">
  <Image
    className="open-ena-login-brand-lockup"
    src="/logo-open-ena.svg"
    width={250}
    height={80}
    alt="Open ENA — Epistemic Network Analysis"
  />
</div>

<div className="open-ena-login-network" aria-hidden="true">
  <Image
    className="open-ena-login-network-hero"
    src="/open-ena-network-hero.svg"
    width={620}
    height={520}
    alt=""
  />
</div>
```

Delete the old visible `OPEN ENA / ENA.HK` text and the complete inline `viewBox="0 0 420 270"` SVG. Do not touch the context-copy block or anything in `.open-ena-login-panel`.

- [ ] **Step 4: Replace only the left-side login CSS**

Update the affected selectors to this implementation, leaving the right-form selectors unchanged:

```css
.open-ena-login-page {
  display: grid;
  min-height: calc(100dvh - 80px);
  place-items: center;
  padding: 52px 24px 68px;
  background:
    radial-gradient(circle at 8% 2%, rgba(137, 207, 240, 0.13), transparent 31rem),
    radial-gradient(circle at 92% 16%, rgba(137, 207, 240, 0.08), transparent 27rem),
    var(--page);
}

.open-ena-login-shell {
  display: grid;
  width: min(100%, 1040px);
  min-height: 610px;
  grid-template-columns: minmax(330px, 0.88fr) minmax(440px, 1.12fr);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-strong);
  box-shadow: var(--shadow);
}

.open-ena-login-context {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 38px 40px 34px;
  color: var(--ink);
  background:
    radial-gradient(circle at 8% 2%, rgba(137, 207, 240, 0.13), transparent 24rem),
    radial-gradient(circle at 92% 16%, rgba(137, 207, 240, 0.08), transparent 22rem),
    var(--surface);
}

.open-ena-login-brand {
  display: flex;
  align-items: flex-start;
}

.open-ena-login-brand-lockup {
  display: block;
  width: min(100%, 250px);
  height: auto;
}

.open-ena-login-network {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  place-items: center;
  padding-block: 12px 6px;
}

.open-ena-login-network-hero {
  display: block;
  width: min(100%, 410px);
  height: auto;
  filter: drop-shadow(0 14px 24px rgba(31, 111, 158, 0.06));
}

.open-ena-login-context-copy {
  display: grid;
  gap: 15px;
}

.open-ena-login-context-copy > p {
  margin: 0;
  border-top: 1px solid var(--line);
  padding-top: 18px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.55;
}

.open-ena-login-context-copy li {
  display: grid;
  gap: 5px;
  border-top: 1px solid var(--line-strong);
  padding-top: 9px;
  color: var(--ink);
  font-size: 0.7rem;
  font-weight: 660;
}

.open-ena-login-context-copy li span {
  color: var(--accent-strong);
  font-family: var(--font-geist-mono), monospace;
  font-size: 0.56rem;
  letter-spacing: 0.08em;
}
```

Delete these obsolete selector blocks entirely:

```css
.open-ena-login-brand img
.open-ena-login-brand div
.open-ena-login-brand strong
.open-ena-login-brand span
.open-ena-login-network svg
.open-ena-login-edges path
.open-ena-login-edges path:first-child
.open-ena-login-nodes circle
.open-ena-login-nodes circle:nth-child(4)
```

Replace the responsive left-panel rules with:

```css
@media (max-width: 820px) {
  .open-ena-login-page {
    padding: 28px 16px 44px;
  }

  .open-ena-login-shell {
    grid-template-columns: 1fr;
  }

  .open-ena-login-context {
    min-height: 560px;
    padding: 28px 30px 24px;
  }

  .open-ena-login-network {
    display: grid;
    padding-block: 8px 2px;
  }

  .open-ena-login-network-hero {
    width: min(100%, 440px);
  }

  .open-ena-login-context-copy {
    margin-top: 10px;
  }

  .open-ena-login-panel {
    padding: 42px 30px 38px;
  }
}

@media (max-width: 480px) {
  .open-ena-login-page {
    padding-inline: 10px;
  }

  .open-ena-login-context,
  .open-ena-login-panel {
    padding-inline: 22px;
  }

  .open-ena-login-context {
    min-height: 520px;
  }

  .open-ena-login-brand-lockup {
    width: min(100%, 220px);
  }

  .open-ena-login-network-hero {
    width: min(100%, 360px);
  }

  .open-ena-login-context-copy ol {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .open-ena-login-context-copy li + li {
    margin-inline-start: 0;
  }
}
```

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run:

```bash
./node_modules/.bin/tsx --test \
  tests/open-ena-auth.test.ts \
  tests/site-baby-blue-theme.test.ts \
  tests/open-ena-contract.test.ts
```

Expected: all tests PASS. The existing authentication, locale fallback, hidden-shell preload, form, and Baby Blue tests remain green.

- [ ] **Step 6: Run type checking and inspect the exact diff**

Run:

```bash
npm run typecheck:app
git diff --check
git diff -- \
  components/open-ena/OpenEnaLogin.tsx \
  app/globals.css \
  tests/open-ena-auth.test.ts
```

Expected: type checking and diff checks PASS; the diff contains no authentication route, credential, copy, or workspace changes.

- [ ] **Step 7: Commit the visual implementation slice**

Run:

```bash
git add \
  components/open-ena/OpenEnaLogin.tsx \
  app/globals.css \
  tests/open-ena-auth.test.ts
git diff --cached --check
git commit -m "fix(open-ena): refresh login brand panel"
```

Expected: one commit containing the presenter, scoped CSS, and its prewritten regression contract.

### Task 3: Add a bounded desktop/mobile Chromium login gate

**Files:**

- Create: `tests/open-ena-login-browser-smoke-contract.test.ts`
- Create: `tests/open-ena-login-browser-smoke.mjs`
- Modify: `package.json:20-23`

- [ ] **Step 1: Write the failing browser-gate contract**

Create `tests/open-ena-login-browser-smoke-contract.test.ts`:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

test("package scripts expose a bounded Open ENA login brand browser gate", () => {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["test:browser:open-ena-login"],
    "node tests/open-ena-login-browser-smoke.mjs",
  );
});

test("the login browser gate covers both viewports and authentication without embedded credentials", () => {
  const smokePath = join(projectRoot, "tests", "open-ena-login-browser-smoke.mjs");
  assert.equal(existsSync(smokePath), true);
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /width:\s*1440,\s*height:\s*1000/u);
  assert.match(source, /width:\s*390,\s*height:\s*844/u);
  assert.match(source, /logo-open-ena\.svg/u);
  assert.match(source, /open-ena-network-hero\.svg/u);
  assert.match(source, /open-ena-login-context-copy li/u);
  assert.match(source, /scrollWidth/u);
  assert.match(source, /invalid-local-account/u);
  assert.match(source, /open-ena-workbench/u);
  assert.match(source, /OPEN_ENA_BROWSER_USERNAME/u);
  assert.match(source, /OPEN_ENA_BROWSER_PASSWORD/u);
  assert.doesNotMatch(source, /sandytu|12345-openena/u);
});
```

- [ ] **Step 2: Run the contract and confirm RED**

Run:

```bash
./node_modules/.bin/tsx --test tests/open-ena-login-browser-smoke-contract.test.ts
```

Expected: FAIL because `test:browser:open-ena-login` and `tests/open-ena-login-browser-smoke.mjs` do not exist.

- [ ] **Step 3: Add the package script**

Add this script beside the existing Open ENA browser scripts in `package.json`:

```json
"test:browser:open-ena-login": "node tests/open-ena-login-browser-smoke.mjs"
```

- [ ] **Step 4: Create the complete browser smoke**

Create `tests/open-ena-login-browser-smoke.mjs`:

```js
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.OPEN_ENA_BROWSER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/u, "");
const username = process.env.OPEN_ENA_BROWSER_USERNAME;
const password = process.env.OPEN_ENA_BROWSER_PASSWORD;
const artifactDirectory = resolve(
  process.env.OPEN_ENA_LOGIN_BROWSER_ARTIFACTS
    ?? "output/browser/open-ena-login-brand-refresh",
);

assert.ok(username, "OPEN_ENA_BROWSER_USERNAME is required for the local login gate");
assert.ok(password, "OPEN_ENA_BROWSER_PASSWORD is required for the local login gate");

await mkdir(artifactDirectory, { recursive: true });

function collectBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

function assertContained(inner, outer, label) {
  assert.ok(inner, `${label} has no bounding box`);
  assert.ok(outer, `${label} container has no bounding box`);
  assert.ok(inner.x >= outer.x - 1, `${label} overflows the left edge`);
  assert.ok(inner.y >= outer.y - 1, `${label} overflows the top edge`);
  assert.ok(inner.x + inner.width <= outer.x + outer.width + 1, `${label} overflows the right edge`);
  assert.ok(inner.y + inner.height <= outer.y + outer.height + 1, `${label} overflows the bottom edge`);
}

async function auditBrandAtViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page);
  await page.goto(`${baseUrl}/en/open-ena`, { waitUntil: "networkidle" });

  const panel = page.locator(".open-ena-login-context");
  const lockup = page.locator('img[src*="logo-open-ena.svg"]');
  const network = page.locator('img[src*="open-ena-network-hero.svg"]');
  const form = page.locator(".open-ena-login-form");

  await panel.waitFor({ state: "visible" });
  await lockup.waitFor({ state: "visible" });
  await network.waitFor({ state: "visible" });
  await form.waitFor({ state: "visible" });

  assert.equal(await lockup.getAttribute("alt"), "Open ENA — Epistemic Network Analysis");
  assert.equal(await network.getAttribute("alt"), "");
  assert.equal(await page.locator(".open-ena-login-context-copy li").count(), 3);

  const imageMetrics = await page.evaluate(() => {
    const lockupImage = document.querySelector('img[src*="logo-open-ena.svg"]');
    const networkImage = document.querySelector('img[src*="open-ena-network-hero.svg"]');
    const brandPanel = document.querySelector(".open-ena-login-context");
    if (!(lockupImage instanceof HTMLImageElement)
      || !(networkImage instanceof HTMLImageElement)
      || !(brandPanel instanceof HTMLElement)) {
      throw new Error("login brand elements are unavailable");
    }
    const style = getComputedStyle(brandPanel);
    return {
      lockupWidth: lockupImage.naturalWidth,
      networkWidth: networkImage.naturalWidth,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  assert.equal(imageMetrics.lockupWidth, 250);
  assert.equal(imageMetrics.networkWidth, 620);
  assert.equal(imageMetrics.backgroundColor, "rgb(247, 251, 254)");
  assert.match(imageMetrics.backgroundImage, /radial-gradient/u);
  assert.ok(
    imageMetrics.scrollWidth <= imageMetrics.clientWidth + 1,
    `${name} login has horizontal overflow`,
  );

  const panelBox = await panel.boundingBox();
  assertContained(await lockup.boundingBox(), panelBox, `${name} lockup`);
  assertContained(await network.boundingBox(), panelBox, `${name} network`);

  await page.screenshot({
    path: resolve(artifactDirectory, `${name}-${viewport.width}x${viewport.height}.png`),
    fullPage: true,
  });
  assert.deepEqual(errors, [], `${name} login emitted browser errors`);
  await context.close();
}

async function auditAuthentication(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page);
  await page.goto(`${baseUrl}/en/open-ena`, { waitUntil: "networkidle" });

  await page.getByRole("textbox", { name: "Account name" }).fill("invalid-local-account");
  await page.getByLabel("Password").fill("invalid-local-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("alert").waitFor({ state: "visible" });

  await page.getByRole("textbox", { name: "Account name" }).fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".open-ena-workbench").waitFor({ state: "visible", timeout: 30_000 });

  assert.deepEqual(errors, [], "login authentication lifecycle emitted browser errors");
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await auditBrandAtViewport(browser, "desktop", { width: 1440, height: 1000 });
  await auditBrandAtViewport(browser, "mobile", { width: 390, height: 844 });
  await auditAuthentication(browser);
  process.stdout.write(JSON.stringify({
    status: "PASS",
    url: `${baseUrl}/en/open-ena`,
    viewports: ["1440x1000", "390x844"],
    artifacts: artifactDirectory,
  }, null, 2) + "\n");
} finally {
  await browser.close();
}
```

- [ ] **Step 5: Run the browser-gate contract and confirm GREEN**

Run:

```bash
./node_modules/.bin/tsx --test tests/open-ena-login-browser-smoke-contract.test.ts
```

Expected: both contract tests PASS, including the assertion that no local account/password literal is embedded in the smoke source.

- [ ] **Step 6: Confirm the local server uses synthetic credentials and is reachable**

If `curl -fsS http://127.0.0.1:3000/en/open-ena >/dev/null` already succeeds, reuse that server. Otherwise start a PTY server with:

```bash
OPEN_ENA_USERNAME=sandytu \
OPEN_ENA_PASSWORD=12345-openena \
OPEN_ENA_SESSION_SECRET=local-open-ena-login-brand-smoke-session-20260829 \
OPEN_ENA_AI_ENABLED=false \
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Expected: `GET /en/open-ena` returns HTTP 200 and the server remains running in its PTY session.

- [ ] **Step 7: Run the real Chromium gate**

Run:

```bash
OPEN_ENA_BROWSER_BASE_URL=http://127.0.0.1:3000 \
OPEN_ENA_BROWSER_USERNAME=sandytu \
OPEN_ENA_BROWSER_PASSWORD=12345-openena \
npm run test:browser:open-ena-login
```

Expected: JSON `status: PASS`; desktop and mobile screenshots exist under `output/browser/open-ena-login-brand-refresh`; invalid login shows the existing alert; valid synthetic login reaches `.open-ena-workbench`; no page or console errors are reported.

- [ ] **Step 8: Inspect both generated screenshots**

Open these files with the local image viewer:

```text
output/browser/open-ena-login-brand-refresh/desktop-1440x1000.png
output/browser/open-ena-login-brand-refresh/mobile-390x844.png
```

Expected visual findings: exact horizontal lockup; exact open-ring network with all five labels; pale left panel; retained lower flow; white, unchanged right form; no clipping or overlap.

- [ ] **Step 9: Commit the browser gate**

Run:

```bash
git add \
  package.json \
  tests/open-ena-login-browser-smoke-contract.test.ts \
  tests/open-ena-login-browser-smoke.mjs
git diff --cached --check
git commit -m "test(open-ena): gate login brand refresh in Chromium"
```

Expected: one commit containing only the package entry and bounded login browser gate. Do not add generated screenshots.

### Task 4: Run the complete local completion gate and hand off the running website

**Files:**

- Verify only; no product files should change.

- [ ] **Step 1: Run the focused test set once more from committed HEAD**

Run:

```bash
./node_modules/.bin/tsx --test \
  tests/open-ena-auth.test.ts \
  tests/site-baby-blue-theme.test.ts \
  tests/open-ena-contract.test.ts \
  tests/open-ena-login-browser-smoke-contract.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run type checking, the complete application test suite, and production build**

Run in order:

```bash
npm run typecheck:app
npm run test:app
npm run build:app
```

Expected: every command exits 0. Record exact test totals rather than predicting them.

- [ ] **Step 3: Run the repository verification aggregate**

Run:

```bash
npm run verify
```

Expected: prompt, vendor, jENA, production-browser-receipt, application tests, type checking, and build checks all exit 0. A failure in an unrelated external receipt must be reported separately and must not be rewritten as a login-design failure.

- [ ] **Step 4: Re-run the real Chromium login gate against the final committed build or running local server**

Run:

```bash
OPEN_ENA_BROWSER_BASE_URL=http://127.0.0.1:3000 \
OPEN_ENA_BROWSER_USERNAME=sandytu \
OPEN_ENA_BROWSER_PASSWORD=12345-openena \
npm run test:browser:open-ena-login
```

Expected: PASS with the same desktop/mobile, overflow, invalid-login, valid-login, and browser-error evidence.

- [ ] **Step 5: Verify diff hygiene and exact scope**

Run:

```bash
git diff --check
git status --short --branch
git log -4 --oneline --decorate
git show --stat --oneline HEAD~2..HEAD
```

Expected: product and test changes are committed; `.superpowers/` may remain as the explicitly untracked design-preview directory and must not be staged; no authentication, API, workspace, CI, or deployment file appears in the implementation commits.

- [ ] **Step 6: Leave the local website running and provide the verified URL**

Confirm:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/en/open-ena
```

Expected: `200`. Open or point the user to `http://127.0.0.1:3000/en/open-ena` and clearly state that the result is local-only: no push, pull request, CI execution, deployment, or production verification was authorized.
