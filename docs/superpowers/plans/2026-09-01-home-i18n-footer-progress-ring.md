# Home Internationalization, Footer Cleanup, and Progress Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize the Home initiator credit across all 14 current ENA.HK locales, remove only the Footer analytics-preference entry point, and replace the static back-to-top link with an accessible AIED.HK-style scroll progress ring using an ENA Baby Blue inner face.

**Architecture:** Keep all visible Home and accessibility copy in the existing typed dictionaries, so adding a locale cannot silently omit either new string. Keep analytics consent code unchanged while removing only its Footer integration. Implement scroll progress as a small client component with a pure exported calculation helper, requestAnimationFrame-throttled browser listeners, and a deterministic SVG/CSS visual contract.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.8, Node test runner with `tsx`, server-rendered React markup tests, CSS, and browser acceptance in the Codex in-app browser or connected Chrome.

---

## File Responsibility Map

- `lib/i18n.ts`: Locale registry, `Dictionary` contract, and English, Traditional Chinese, and Simplified Chinese strings.
- `lib/i18n-western.ts`: Spanish, French, Portuguese, and German strings.
- `lib/i18n-asian.ts`: Korean, Japanese, and Hindi strings.
- `lib/i18n-global.ts`: Arabic, Russian, Indonesian, and Bengali strings.
- `app/[locale]/page.tsx`: Home composition; reads the localized initiator credit without locale branching.
- `components/Footer.tsx`: Public Footer; no longer owns an analytics-preference entry point.
- `components/AnalyticsConsent.tsx`: Existing analytics consent enforcement; must remain unchanged.
- `components/AnalyticsConsentControl.tsx`: Existing consent state component; must remain unchanged even when no longer rendered by the Footer.
- `components/BackToTop.tsx`: Pure progress calculation, browser listeners, SVG progress ring, localized labels, and return-to-top behavior.
- `app/[locale]/layout.tsx`: Supplies the two localized BackToTop labels.
- `app/globals.css`: Footer-control style removal and progress-ring presentation, responsiveness, focus, and reduced-motion behavior.
- `tests/site-contract.test.ts`: All-locale dictionary and Home source contracts.
- `tests/open-ena-privacy-security.test.ts`: Footer-entry-point removal plus continued analytics privacy contracts.
- `tests/back-to-top.test.ts`: Pure progress math, initial SVG markup, exact visual constants, event lifecycle, and reduced-motion source contracts.
- `tests/open-ena-auth.test.ts`: Existing route exclusion contract for the public floating control.

The three user-visible changes belong to one public-shell plan, but Tasks 1 through 3 remain independently testable and commit separately.

### Task 0: Verify the isolated implementation lane

**Files:**
- Inspect only: repository and worktree metadata

- [ ] **Step 1: Confirm the exact worktree, branch, base, and unrelated-lane isolation**

Run:

```bash
pwd
git branch --show-current
git status --short --branch
git worktree list --porcelain
git log -3 --oneline --decorate
```

Expected:

- Working directory is `/Volumes/Starship/ENA/output/worktrees/home-sentence-multi-language-20260901`.
- Branch is `codex/home-sentence-multi-language`.
- The worktree is clean before functional edits.
- `/Volumes/Starship/ENA` remains a separate worktree on the 3D lane.
- The two approved design-document commits are present.

- [ ] **Step 2: Reuse installed dependencies without copying or reinstalling them**

Run:

```bash
if [ ! -e node_modules ]; then ln -s /Volumes/Starship/ENA/node_modules node_modules; fi
test -d /Volumes/Starship/ENA/node_modules
test -e node_modules
```

Expected: both dependency checks succeed. The ignored local symlink is not staged or committed.

### Task 1: Add typed Home and progress accessibility copy for all locales

**Files:**
- Modify: `tests/site-contract.test.ts`
- Modify: `lib/i18n.ts`
- Modify: `lib/i18n-western.ts`
- Modify: `lib/i18n-asian.ts`
- Modify: `lib/i18n-global.ts`
- Modify: `app/[locale]/page.tsx`

- [ ] **Step 1: Replace the old English-only Home contract with failing all-locale contracts**

In `tests/site-contract.test.ts`, replace the assertion that requires `typedLocale === "en"` and the hard-coded English sentence with these assertions inside the existing Home/source-credit test:

```ts
  const englishInitiatorCredit =
    "Dr. Peter Hu Dongpin is the Initiator of the open access ENA Hub of Knowledge.";

  assert.match(homeSource, /dictionary\.home\.initiatorCredit/u);
  assert.doesNotMatch(homeSource, /typedLocale === "en"/u);
  assert.doesNotMatch(
    homeSource,
    /Dr\. Peter Hu Dongpin is the Initiator of the open access ENA Hub of Knowledge\./u,
  );
  assert.equal(getDictionary("en").home.initiatorCredit, englishInitiatorCredit);

  for (const locale of locales) {
    const dictionary = getDictionary(locale);
    assert.ok(dictionary.home.originCredit.trim().length > 0);
    assert.ok(dictionary.home.initiatorCredit.trim().length > 0);
    assert.ok(dictionary.common.pageScrollProgress.trim().length > 0);
    assert.match(dictionary.home.initiatorCredit, /Dr\. Peter Hu Dongpin/u);
    assert.match(dictionary.home.initiatorCredit, /ENA/u);
    if (locale !== "en") {
      assert.notEqual(dictionary.home.initiatorCredit, englishInitiatorCredit);
    }
  }
```

Keep these existing assertions unchanged:

```ts
  assert.match(homeSource, /dictionary\.home\.originCredit/);
  assert.match(homeSource, /<strong><bdi>Wisconsin Center for Education Research\.<\/bdi><\/strong>/);
  assert.equal(
    getDictionary("en").home.originCredit,
    "ENA was proposed and developed by researchers and developers from",
  );
```

- [ ] **Step 2: Run the Home contract and confirm RED**

Run:

```bash
node --import tsx --test tests/site-contract.test.ts
```

Expected: TypeScript compilation or assertions fail because `home.initiatorCredit` and `common.pageScrollProgress` do not exist yet.

- [ ] **Step 3: Extend the typed dictionary contract**

In `lib/i18n.ts`, add the two required fields in the existing `Dictionary` interface:

```ts
  common: {
    skipToContent: string;
    backToTop: string;
    pageScrollProgress: string;
    exploreMethod: string;
    openWebtool: string;
    browseResources: string;
    learnAboutSite: string;
    externalLink: string;
  };
  home: {
    eyebrow: string;
    heroTitle: string;
    heroText: string;
    originCredit: string;
    initiatorCredit: string;
    graphTitle: string;
```

- [ ] **Step 4: Add the exact English and Chinese strings**

In the `en`, `zhHant`, and `zhHans` dictionaries in `lib/i18n.ts`, add the fields adjacent to `backToTop` and `originCredit`:

```ts
// en
pageScrollProgress: "Page scroll progress",
initiatorCredit: "Dr. Peter Hu Dongpin is the Initiator of the open access ENA Hub of Knowledge.",

// zhHant
pageScrollProgress: "頁面捲動進度",
initiatorCredit: "Dr. Peter Hu Dongpin 是開放取用 ENA 知識樞紐的發起人。",

// zhHans
pageScrollProgress: "页面滚动进度",
initiatorCredit: "Dr. Peter Hu Dongpin 是开放获取 ENA 知识枢纽的发起人。",
```

- [ ] **Step 5: Add the exact Western-language strings**

In `lib/i18n-western.ts`, add these locale-specific values adjacent to `backToTop` and `originCredit`:

```ts
// es
pageScrollProgress: "Progreso de desplazamiento de la página",
initiatorCredit: "Dr. Peter Hu Dongpin es el impulsor del Centro de Conocimiento ENA de acceso abierto.",

// fr
pageScrollProgress: "Progression du défilement de la page",
initiatorCredit: "Dr. Peter Hu Dongpin est l'initiateur du pôle de connaissances ENA en libre accès.",

// pt
pageScrollProgress: "Progresso de deslocamento da página",
initiatorCredit: "O Dr. Peter Hu Dongpin é o iniciador do Centro de Conhecimento ENA de acesso aberto.",

// de
pageScrollProgress: "Scrollfortschritt der Seite",
initiatorCredit: "Dr. Peter Hu Dongpin ist der Initiator des frei zugänglichen ENA-Wissenszentrums.",
```

- [ ] **Step 6: Add the exact Asian-language strings**

In `lib/i18n-asian.ts`, add these locale-specific values adjacent to `backToTop` and `originCredit`:

```ts
// ko
pageScrollProgress: "페이지 스크롤 진행률",
initiatorCredit: "Dr. Peter Hu Dongpin은 오픈 액세스 ENA 지식 허브의 발기인입니다.",

// ja
pageScrollProgress: "ページのスクロール進捗",
initiatorCredit: "Dr. Peter Hu Dongpinは、オープンアクセスのENAナレッジハブの発起人です。",

// hi
pageScrollProgress: "पृष्ठ स्क्रॉल प्रगति",
initiatorCredit: "Dr. Peter Hu Dongpin ओपन-एक्सेस ENA ज्ञान केंद्र के प्रवर्तक हैं।",
```

- [ ] **Step 7: Add the exact global-language strings**

In `lib/i18n-global.ts`, add these locale-specific values adjacent to `backToTop` and `originCredit`:

```ts
// ar
pageScrollProgress: "تقدم التمرير في الصفحة",
initiatorCredit: "Dr. Peter Hu Dongpin هو مبادر مركز ENA المعرفي مفتوح الوصول.",

// ru
pageScrollProgress: "Прогресс прокрутки страницы",
initiatorCredit: "Dr. Peter Hu Dongpin является инициатором центра знаний ENA с открытым доступом.",

// id
pageScrollProgress: "Progres gulir halaman",
initiatorCredit: "Dr. Peter Hu Dongpin adalah penggagas Pusat Pengetahuan ENA dengan akses terbuka.",

// bn
pageScrollProgress: "পৃষ্ঠা স্ক্রলের অগ্রগতি",
initiatorCredit: "Dr. Peter Hu Dongpin উন্মুক্ত প্রবেশাধিকারভিত্তিক ENA জ্ঞানকেন্দ্রের প্রবর্তক।",
```

- [ ] **Step 8: Replace the English-only branch with the dictionary value**

In `app/[locale]/page.tsx`, replace the conditional fragment after the Wisconsin source credit with:

```tsx
            <strong><bdi>Wisconsin Center for Education Research.</bdi></strong>{" "}
            <strong><bdi>{dictionary.home.initiatorCredit}</bdi></strong>
```

Do not change `typedLocale` uses for route construction elsewhere in the file.

- [ ] **Step 9: Run focused tests and type checking to confirm GREEN**

Run:

```bash
node --import tsx --test tests/site-contract.test.ts
npm run typecheck:app
```

Expected: both commands exit zero. The site contract reports all subtests passing, and TypeScript reports no missing dictionary fields.

- [ ] **Step 10: Commit only the Home and dictionary paths**

Run:

```bash
git add -- tests/site-contract.test.ts lib/i18n.ts lib/i18n-western.ts lib/i18n-asian.ts lib/i18n-global.ts 'app/[locale]/page.tsx'
git diff --cached --check
git commit -m "feat: localize the Home initiator credit"
```

Expected: the commit contains only the six listed implementation paths and the focused test.

### Task 2: Remove only the Footer analytics-preference entry point

**Files:**
- Modify: `tests/open-ena-privacy-security.test.ts`
- Modify: `components/Footer.tsx`
- Modify: `app/globals.css`
- Preserve unchanged: `components/AnalyticsConsent.tsx`
- Preserve unchanged: `components/AnalyticsConsentControl.tsx`
- Preserve unchanged: `lib/analytics-consent.ts`

- [ ] **Step 1: Change the privacy contract to require no Footer entry point**

At the top of `tests/open-ena-privacy-security.test.ts`, add:

```ts
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
```

Rename the existing Footer analytics test to `the footer omits the analytics preference entry point while consent protections remain` and replace its Footer/control assertions with:

```ts
  assert.doesNotMatch(
    footer,
    /AnalyticsConsentControl|analyticsConsentCopy|footer-analytics-preference/u,
  );
  assert.doesNotMatch(globalCss, /\.footer-analytics-(?:preference|consent)/u);
  assert.match(analyticsConsent, /beforeSend/u);
  assert.match(analyticsConsent, /localStorage/u);
  assert.match(analyticsConsent, /query strings and fragments|Query strings.*identifiers/iu);
  assert.match(analyticsConsent, /sanitizeOpenEnaAnalyticsUrl/u);
  assert.doesNotMatch(analyticsConsent, /url:\s*url\.pathname/u);
  assert.match(analyticsControl, /data-ena-analytics-consent="explicit"/u);
  assert.match(analyticsControl, /OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY/u);
  assert.match(analyticsControl, /OPEN_ENA_ANALYTICS_CONSENT_EVENT/u);
```

Keep the existing removed-disclosure-copy loop. Remove only the old assertions requiring `AnalyticsConsentControl` to appear in `Footer.tsx` and requiring its grant/deny buttons to be rendered by the Footer.

- [ ] **Step 2: Run the privacy contract and confirm RED**

Run:

```bash
node --import tsx --test tests/open-ena-privacy-security.test.ts
```

Expected: the named Footer test fails because `Footer.tsx` still renders `AnalyticsConsentControl` and the Footer-only CSS classes still exist.

- [ ] **Step 3: Remove only the Footer integration**

In `components/Footer.tsx`:

1. Remove this import:

```ts
import AnalyticsConsentControl from "./AnalyticsConsentControl";
```

2. Remove the entire `analyticsConsentCopy` constant.
3. Remove the `analyticsCopy` calculation from the start of `Footer`.
4. Remove this rendered region:

```tsx
      <div className="footer-analytics-preference">
        <AnalyticsConsentControl copy={analyticsCopy} />
      </div>
```

Keep `locale` because it still builds navigation and resource routes.

- [ ] **Step 4: Remove only the now-unused Footer control styles**

Delete these selectors and their declarations from `app/globals.css`:

```css
.footer-analytics-preference
.footer-analytics-consent
.footer-analytics-consent button
.footer-analytics-consent button:hover,
.footer-analytics-consent button:focus-visible
```

Do not change `.footer-grid`, `.footer-bottom`, analytics JavaScript, or Open ENA route styles.

- [ ] **Step 5: Run privacy, site, and type contracts to confirm GREEN**

Run:

```bash
node --import tsx --test tests/open-ena-privacy-security.test.ts tests/site-contract.test.ts
npm run typecheck:app
git diff -- components/AnalyticsConsent.tsx components/AnalyticsConsentControl.tsx lib/analytics-consent.ts
```

Expected:

- Both test files pass.
- Type checking exits zero.
- The final `git diff` command prints no output, proving the underlying analytics files are unchanged.

- [ ] **Step 6: Commit only the Footer entry-point removal**

Run:

```bash
git add -- tests/open-ena-privacy-security.test.ts components/Footer.tsx app/globals.css
git diff --cached --check
git commit -m "fix: remove the Footer analytics preference"
```

Expected: the commit contains exactly the three listed paths.

### Task 3: Implement the accessible scroll progress ring

**Files:**
- Create: `tests/back-to-top.test.ts`
- Modify: `components/BackToTop.tsx`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/globals.css`
- Verify unchanged behavior: `tests/open-ena-auth.test.ts`

- [ ] **Step 1: Create the failing progress and markup tests**

Create `tests/back-to-top.test.ts` with:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BackToTop, { getScrollProgress } from "../components/BackToTop";

const source = readFileSync(new URL("../components/BackToTop.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");

test("scroll progress clamps page distance to an integer percentage", () => {
  assert.equal(getScrollProgress({ scrollTop: 0, scrollHeight: 1600, clientHeight: 800 }), 0);
  assert.equal(getScrollProgress({ scrollTop: 400, scrollHeight: 1600, clientHeight: 800 }), 50);
  assert.equal(getScrollProgress({ scrollTop: 800, scrollHeight: 1600, clientHeight: 800 }), 100);
  assert.equal(getScrollProgress({ scrollTop: 1200, scrollHeight: 1600, clientHeight: 800 }), 100);
  assert.equal(getScrollProgress({ scrollTop: -20, scrollHeight: 1600, clientHeight: 800 }), 0);
  assert.equal(getScrollProgress({ scrollTop: 40, scrollHeight: 700, clientHeight: 800 }), 0);
});

test("back-to-top renders the approved ENA progress-ring artwork", () => {
  const html = renderToStaticMarkup(
    React.createElement(BackToTop, {
      label: "Back to top",
      progressLabel: "Page scroll progress",
    }),
  );

  assert.match(html, /<button/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-label="Page scroll progress"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /r="22\.5"/);
  assert.match(html, /stroke-width="2\.6"/);
  assert.match(html, /fill="var\(--accent\)"/);
  assert.match(html, /stroke="#dfe6ee"/);
  assert.match(html, /stroke="#48d5e8"/);
  assert.match(html, /stroke="#172033"/);
  assert.match(html, /d="M28 37\.5V20\.5M19\.5 29 28 20\.5 36\.5 29"/);
  assert.match(html, /transform="rotate\(-90 28 28\)"/);
  assert.match(html, /data-track="page-progress-arc"/);
  assert.doesNotMatch(html, />↑</u);
});

test("back-to-top throttles progress updates and honors reduced motion", () => {
  assert.match(source, /requestAnimationFrame\(updateProgress\)/u);
  assert.match(source, /addEventListener\("scroll", requestProgressUpdate, \{ passive: true \}\)/u);
  assert.match(source, /addEventListener\("resize", requestProgressUpdate\)/u);
  assert.match(source, /visualViewport\?\.addEventListener\("resize", requestProgressUpdate\)/u);
  assert.match(source, /cancelAnimationFrame\(animationFrame\)/u);
  assert.match(source, /removeEventListener\("scroll", requestProgressUpdate\)/u);
  assert.match(source, /removeEventListener\("resize", requestProgressUpdate\)/u);
  assert.match(source, /prefers-reduced-motion: reduce/u);
  assert.match(source, /behavior: reduceMotion \? "auto" : "smooth"/u);
  assert.match(source, /window\.scrollTo\(\{[\s\S]*?top: 0/u);
  assert.match(layout, /progressLabel=\{dictionary\.common\.pageScrollProgress\}/u);
});
```

- [ ] **Step 2: Run the new test and confirm RED**

Run:

```bash
node --import tsx --test tests/back-to-top.test.ts
```

Expected: compilation fails because `getScrollProgress` and the `progressLabel` prop do not exist.

- [ ] **Step 3: Replace the static link with the exact client component**

Replace `components/BackToTop.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";

interface BackToTopProps {
  label: string;
  progressLabel: string;
}

interface ScrollProgressMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const progressCircleRadius = 22.5;
const progressCircleCircumference = 2 * Math.PI * progressCircleRadius;

export function getScrollProgress({
  scrollTop,
  scrollHeight,
  clientHeight,
}: ScrollProgressMetrics) {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  if (maxScroll === 0) return 0;

  const progress = (scrollTop / maxScroll) * 100;
  return Math.round(Math.min(100, Math.max(0, progress)));
}

export default function BackToTop({ label, progressLabel }: BackToTopProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const progressOffset = progressCircleCircumference * (1 - scrollProgress / 100);

  useEffect(() => {
    let animationFrame = 0;

    function updateProgress() {
      animationFrame = 0;
      const root = document.documentElement;
      const body = document.body;

      setScrollProgress(
        getScrollProgress({
          scrollTop: window.scrollY || root.scrollTop || body?.scrollTop || 0,
          scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight ?? 0),
          clientHeight: window.innerHeight || root.clientHeight,
        }),
      );
    }

    function requestProgressUpdate() {
      if (animationFrame !== 0) return;
      animationFrame = window.requestAnimationFrame(updateProgress);
    }

    requestProgressUpdate();
    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate);
    window.visualViewport?.addEventListener("resize", requestProgressUpdate);

    return () => {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", requestProgressUpdate);
      window.removeEventListener("resize", requestProgressUpdate);
      window.visualViewport?.removeEventListener("resize", requestProgressUpdate);
    };
  }, []);

  function handleClick() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  return (
    <button type="button" className="back-to-top focus-ring" aria-label={label} onClick={handleClick}>
      <svg
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scrollProgress}
        viewBox="0 0 56 56"
        className="back-to-top-progress"
      >
        <g data-artwork="back-to-top-base" aria-hidden="true">
          <circle cx="28" cy="31.5" r="21" fill="#d8e0e9" opacity="0.45" />
          <circle cx="28" cy="28" r="21.3" fill="var(--accent)" />
          <circle
            data-track="page-progress-track"
            cx="28"
            cy="28"
            r={progressCircleRadius}
            fill="none"
            stroke="#dfe6ee"
            strokeWidth="2.6"
          />
          <path
            d="M28 37.5V20.5M19.5 29 28 20.5 36.5 29"
            fill="none"
            stroke="#172033"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <circle
          cx="28"
          cy="28"
          r={progressCircleRadius}
          fill="none"
          stroke="#48d5e8"
          strokeWidth="2.6"
          strokeLinecap="round"
          data-track="page-progress-arc"
          strokeDasharray={progressCircleCircumference}
          strokeDashoffset={progressOffset}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <span className="back-to-top-tooltip" aria-hidden="true">{label}</span>
    </button>
  );
}
```

- [ ] **Step 4: Pass the localized progress label from the locale layout**

In `app/[locale]/layout.tsx`, replace the existing BackToTop call with:

```tsx
      <BackToTop
        label={dictionary.common.backToTop}
        progressLabel={dictionary.common.pageScrollProgress}
      />
```

- [ ] **Step 5: Replace the static button CSS with the progress-ring CSS**

Replace the current base `.back-to-top` and `.back-to-top:hover` rules in `app/globals.css` with:

```css
.back-to-top {
  position: fixed;
  right: 20px;
  bottom: calc(5.65rem + env(safe-area-inset-bottom));
  z-index: 65;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  padding: 0;
  color: var(--nav-deep);
  background: transparent;
  cursor: pointer;
  font: inherit;
  transition: transform 300ms ease;
}

.back-to-top-progress {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  border-radius: 50%;
  filter: drop-shadow(0 16px 42px rgba(15, 23, 42, 0.14));
  transition: filter 300ms ease;
}

.back-to-top [data-track="page-progress-arc"] {
  transition: stroke-dashoffset 140ms linear;
}

.back-to-top:hover {
  transform: translateY(-2px);
}

.back-to-top:hover .back-to-top-progress,
.back-to-top:focus-visible .back-to-top-progress {
  filter: drop-shadow(0 22px 56px rgba(15, 23, 42, 0.16));
}

.back-to-top-tooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 12px);
  width: max-content;
  max-width: min(260px, calc(100vw - 32px));
  border: 1px solid rgba(203, 213, 225, 0.8);
  border-radius: 999px;
  padding: 6px 12px;
  color: #334155;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
  font-size: 0.75rem;
  font-weight: 800;
  line-height: 1.2;
  opacity: 0;
  pointer-events: none;
  transform: translateY(0);
  transition: opacity 160ms ease, transform 160ms ease;
}

.back-to-top:hover .back-to-top-tooltip,
.back-to-top:focus-visible .back-to-top-tooltip {
  opacity: 1;
  transform: translateY(-4px);
}
```

Replace the current mobile `.back-to-top` override inside the existing `@media (max-width: 640px)` public-page block with:

```css
  .back-to-top {
    right: 16px;
    bottom: calc(5.25rem + env(safe-area-inset-bottom));
    width: 56px;
    height: 56px;
  }

  .back-to-top-tooltip {
    display: none;
  }
```

Inside the existing `@media (prefers-reduced-motion: reduce)` block near the public-page styles, add:

```css
  .back-to-top,
  .back-to-top-progress,
  .back-to-top-tooltip,
  .back-to-top [data-track="page-progress-arc"] {
    transition: none;
  }
```

Keep the existing login and Open ENA rules that set `.back-to-top` to `display: none`.

- [ ] **Step 6: Run progress, route-exclusion, and site tests to confirm GREEN**

Run:

```bash
node --import tsx --test tests/back-to-top.test.ts tests/open-ena-auth.test.ts tests/site-contract.test.ts
npm run typecheck:app
```

Expected: all named tests pass and TypeScript exits zero.

- [ ] **Step 7: Commit only the progress-ring paths**

Run:

```bash
git add -- tests/back-to-top.test.ts components/BackToTop.tsx 'app/[locale]/layout.tsx' app/globals.css
git diff --cached --check
git commit -m "feat: add the public scroll progress ring"
```

Expected: the commit contains exactly the four listed paths.

### Task 4: Run integrated verification and browser acceptance

**Files:**
- Verify: all changed files
- Do not create production or deployment artifacts

- [ ] **Step 1: Run all focused tests together**

Run:

```bash
node --import tsx --test tests/back-to-top.test.ts tests/site-contract.test.ts tests/open-ena-privacy-security.test.ts tests/open-ena-auth.test.ts
```

Expected: all focused subtests pass with zero failures.

- [ ] **Step 2: Run the repository verification gate with a task-scoped temporary directory**

Run:

```bash
mkdir -p /Volumes/Starship/ENA/output/tmp/home-shell-verify-20260901
TMPDIR=/Volumes/Starship/ENA/output/tmp/home-shell-verify-20260901 npm run verify
```

Expected: prompt verification, vendor verification, jENA lint/typecheck/tests/build/pack checks, production receipt unit checks, application tests, application type checking, and the Next.js application build all exit zero. If a capacity error occurs, report it as an environment blocker rather than a product failure and preserve the exact candidate.

- [ ] **Step 3: Start the verified local candidate**

Run in a persistent terminal session:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3017
```

Expected: Next.js reports the site ready at `http://127.0.0.1:3017` with no startup error.

- [ ] **Step 4: Verify desktop rendering and interaction**

At a 1440 by 900 viewport, inspect `/en`, `/zh-hant`, `/zh-hans`, `/de`, and `/ar` and record these assertions:

```text
document.documentElement.scrollWidth === document.documentElement.clientWidth
Home initiator credit is visible and matches the selected locale
Footer contains neither "Disable analytics" nor "Allow aggregate analytics"
Back-to-top button is 56 by 56 pixels
Progress SVG has aria-valuemin=0, aria-valuemax=100, and a localized aria-label
Inner face computed fill resolves to rgb(137, 207, 240)
Progress arc stroke resolves to #48d5e8
Arabic route has dir="rtl" and the floating control remains at the physical right edge
```

At the top, middle, and bottom of `/en`, verify that `aria-valuenow` is respectively `0`, approximately `50` with a tolerance of 5 percentage points, and `100`. Activate the button and verify `window.scrollY === 0` after scrolling completes.

- [ ] **Step 5: Verify mobile, keyboard, reduced motion, and excluded routes**

At a 390 by 844 viewport:

```text
The button remains 56 by 56 pixels
Its right offset is 16 pixels
Its bottom position includes the 5.25rem safe-area offset
The tooltip is not displayed
No horizontal overflow occurs
```

Using keyboard navigation on desktop, verify that the button receives a visible focus ring and the localized tooltip appears. Emulate `prefers-reduced-motion: reduce`, activate the button, and verify that it returns to the top without smooth animation. Verify `.back-to-top` is not visible on `/en/open-ena` or `/en/open-ena/login`.

- [ ] **Step 6: Stop the local server and prove final Git hygiene**

Run:

```bash
git status --short --branch
git diff --check main...HEAD
git log --oneline --decorate main..HEAD
git diff --name-status main...HEAD
```

Expected:

- The implementation worktree is clean.
- No unrelated 3D files or datasets appear in the diff.
- The history contains two design-document commits, one implementation-plan commit, and three narrow functional commits.
- No deployment or production claim is made from this local evidence.

## Stop Conditions

Stop implementation and report the exact evidence if any of these occur:

- a required locale cannot be represented naturally without changing the approved protected names;
- removing the Footer entry point requires changing analytics consent state or analytics transport behavior;
- the root 3D lane or another registered worktree appears in the implementation diff;
- focused tests expose an existing unrelated failure that cannot be isolated from this change;
- full verification fails because of capacity, vendor runtime, or another external prerequisite;
- browser acceptance shows the progress control covering Open ENA or login controls despite the route exclusions.

Do not deploy, merge, push, delete branches, or alter the active root 3D worktree under this plan.
