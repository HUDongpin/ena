# Home Initiator Credit, Footer Cleanup, and Scroll Progress Ring Design

**Date:** 2026-09-01

**Status:** Approved for specification review

**Scope:** ENA.HK public locale routes

## Objective

Make the Home-page initiator credit available in every language currently supported by ENA.HK, remove the analytics-preference entry point from the Footer without changing the analytics consent mechanism, and replace the static public back-to-top circle with an AIED.HK-style scroll progress ring whose inner face uses the ENA Baby Blue.

The work must remain narrow. It must not add locales, change unrelated Home or Footer content, alter the Open ENA analytics boundary, modify the Open ENA workspace, or touch unrelated 3D-plot and dataset changes already present in the working tree.

## Current State

ENA.HK currently registers these 14 locales:

- `en`
- `zh-hant`
- `zh-hans`
- `es`
- `fr`
- `pt`
- `de`
- `ar`
- `ko`
- `ja`
- `hi`
- `ru`
- `id`
- `bn`

The Home-page initiator sentence is hard-coded in `app/[locale]/page.tsx` and rendered only when the locale is English. The Footer renders an `AnalyticsConsentControl` entry point that alternates between an allow and a disable action. The public `BackToTop` component is a static anchor with a text arrow and no reading-progress calculation.

The AIED.HK reference observed on 2026-09-01 uses a 56 by 56 pixel SVG button. Its progress arc starts at the top and fills clockwise according to page scroll distance. The reference uses a radius of 22.5 pixels, a 2.6-pixel track and arc, a dark folded-line arrow, a localized-accessibility-compatible progress structure, reduced-motion-aware return-to-top behavior, and responsive fixed offsets. This design ports that structure and behavior while replacing the inner white face with ENA Baby Blue.

## Design Decisions

### 1. Localized Home initiator credit

Add a required `initiatorCredit: string` field to `Dictionary.home` and define it in every current locale dictionary.

Render the field after the existing Wisconsin Center for Education Research source credit on every locale route. Keep the existing strong emphasis and bidirectional isolation. Remove the `typedLocale === "en"` condition and remove the sentence literal from the page component.

Translation rules:

- Preserve `Dr. Peter Hu Dongpin` exactly as a personal name.
- Preserve `ENA` exactly as the method and brand abbreviation.
- Translate “Initiator,” “open access,” and “Hub of Knowledge” naturally for each locale.
- Translate the whole sentence rather than assembling grammatical fragments in the component.
- Preserve the English sentence exactly: `Dr. Peter Hu Dongpin is the Initiator of the open access ENA Hub of Knowledge.`
- Do not add or remove any locale.

Putting the whole sentence in each dictionary is preferred over interpolation because the 14 languages use different word order, articles, honorific conventions, and punctuation.

### 2. Footer analytics-preference entry point

Remove the `AnalyticsConsentControl` import, locale-specific control copy, derived `analyticsCopy`, and rendered `.footer-analytics-preference` region from `Footer.tsx`. Remove CSS that exists only for that Footer control.

Retain the underlying analytics implementation without behavioral changes:

- Keep `AnalyticsConsent.tsx` and `AnalyticsConsentControl.tsx` unchanged. Removing the Footer entry point does not authorize deleting either component.
- Keep the stored consent key and consent event.
- Keep Vercel Analytics conditional loading.
- Keep Open ENA workspace exclusion.
- Keep same-origin URL sanitization and removal of query strings and fragments.
- Preserve previously stored browser consent values. Do not rewrite or delete local storage.

The result intentionally removes the public Footer entry point only. It does not disable analytics and does not reinterpret existing consent.

### 3. Scroll progress and back-to-top control

Convert `BackToTop` into a client component that calculates reading progress as:

```text
progress = scrollTop / max(0, scrollHeight - clientHeight)
```

Clamp the displayed value to 0 through 100 and round it to an integer. A page with no scrollable distance reports zero.

Throttle scroll-driven state updates with one pending `requestAnimationFrame`. Update on:

- the initial mount;
- window scroll using a passive listener;
- window resize; and
- `visualViewport` resize when available.

Remove all listeners and cancel any pending animation frame during cleanup.

Add a required `pageScrollProgress: string` field to `Dictionary.common` and define it in all 14 locale dictionaries. Pass both `dictionary.common.backToTop` and `dictionary.common.pageScrollProgress` from the locale layout to the control.

The control becomes a semantic `button` with:

- the existing locale-specific back-to-top accessible label;
- an SVG with `role="progressbar"`;
- `dictionary.common.pageScrollProgress` as localized page-scroll-progress accessible text;
- `aria-valuemin="0"`;
- `aria-valuemax="100"`; and
- a live `aria-valuenow` matching the calculated integer percentage.

The progress arc uses circumference `2 * pi * 22.5`. Set `stroke-dasharray` to the circumference and calculate `stroke-dashoffset` from the current percentage. Rotate the progress circle by negative 90 degrees around the SVG center so progress starts at 12 o'clock and fills clockwise.

### 4. Visual contract

Use the AIED.HK reference geometry:

- SVG view box: `0 0 56 56`
- control size: 56 by 56 pixels
- progress radius: 22.5 pixels
- track and progress stroke width: 2.6 pixels
- lower shadow circle: center `(28, 31.5)`, radius `21`, fill `#d8e0e9`, opacity `0.45`
- inner face circle: center `(28, 28)`, radius `21.3`
- track: `#dfe6ee`
- progress arc: `#48d5e8`
- progress outline: `var(--accent-strong)` (`#1f6f9e`), 5.2 pixels, with the same radius, dash geometry, top-start rotation, and rounded cap as the cyan progress arc; render this outline beneath the 2.6-pixel cyan arc so the approved cyan progress state remains visible while its deep-blue boundary has at least 3:1 contrast against the track, Baby Blue inner face, cyan arc, and white page
- arrow: `#172033`, 3.5-pixel rounded stroke
- arrow path: `M28 37.5V20.5M19.5 29 28 20.5 36.5 29`

The deliberate ENA adaptation is the inner face fill: use the existing ENA Baby Blue token, whose current exact value is `#89cff0`, instead of the AIED.HK white face.

Use the reference responsive placement while respecting device safe areas:

- narrow screens: right 16 pixels and bottom `calc(5.25rem + env(safe-area-inset-bottom))`;
- wider screens: right 20 pixels and bottom `calc(5.65rem + env(safe-area-inset-bottom))`.

Use the existing ENA focus-ring convention. Preserve visible keyboard focus. Show a localized tooltip on pointer hover and keyboard focus when the viewport has room. Keep the subtle upward hover movement and progress-arc transition. Honor `prefers-reduced-motion` by using immediate scrolling and suppressing unnecessary motion.

Continue to hide the control on the Open ENA workspace and Open ENA login route using the existing route-scoped CSS rules. Those pages have their own dense controls and the public floating button must not obscure them.

### 5. Return-to-top behavior

Clicking the button calls `window.scrollTo({ top: 0 })`. Use smooth behavior by default and automatic behavior when `prefers-reduced-motion: reduce` matches. Do not change the URL fragment or move focus away from the activated button.

## Files Expected to Change

- `app/[locale]/page.tsx`
- `components/BackToTop.tsx`
- `components/Footer.tsx`
- `app/globals.css`
- `lib/i18n.ts`
- `lib/i18n-asian.ts`
- `lib/i18n-global.ts`
- `lib/i18n-western.ts`
- `tests/back-to-top.test.ts`
- existing focused contract tests under `tests/`

## Verification Plan

### Dictionary and Home contracts

- Assert that every registered locale has a non-empty `home.initiatorCredit`.
- Assert that every registered locale has a non-empty `common.pageScrollProgress`.
- Assert that the English value is exact.
- Assert that each non-English value is not the unchanged English sentence.
- Assert that the Home page reads `dictionary.home.initiatorCredit`.
- Assert that the Home page no longer contains an English-only locale gate or the sentence literal.
- Keep the Wisconsin Center source credit contract intact.

### Footer and analytics contracts

- Assert that `Footer.tsx` no longer imports or renders `AnalyticsConsentControl`.
- Assert that the Footer-specific allow/disable copy and styles are absent.
- Retain tests for consent storage, URL sanitization, query and fragment removal, conditional Vercel Analytics rendering, and Open ENA workspace exclusion.
- Update any test whose old assertion required the Footer entry point.

### BackToTop unit and markup contracts

- Test scroll progress at zero, halfway, complete, above complete, below zero, and on a non-scrollable page.
- Assert the progressbar role, minimum, maximum, current value, circumference attributes, and top-start rotation.
- Assert exact radius, stroke widths, reference colors, ENA Baby Blue inner face, and arrow path.
- Assert that the component selects smooth or automatic `window.scrollTo` behavior from `prefers-reduced-motion`.
- Assert that the component uses one pending requestAnimationFrame, passive scroll listening, resize listening, visual-viewport resize listening, and symmetric cleanup.

### Browser acceptance

Run the site locally and verify at representative desktop and mobile viewports:

- the Home sentence in English, both Chinese locales, one long Western locale, Arabic RTL, and one South or East Asian locale;
- no Footer analytics-preference entry point;
- progress is zero at the top, approximately half in the middle, and 100 at the bottom;
- clicking the control returns to the top;
- the tooltip, hover, focus, and reduced-motion states remain usable;
- the control does not appear on the Open ENA workspace or login page;
- no material horizontal overflow occurs.

Run the focused tests first, followed by the repository's normal verification command. Report test, build, and browser evidence separately. Do not make deployment or production claims unless a separate release request authorizes and verifies them.

## Acceptance Criteria

The change is complete when:

1. All 14 current locales render a natural translation of the initiator credit.
2. The English sentence remains exact and the two protected names remain unchanged in every locale.
3. The Footer contains no analytics-preference entry point.
4. The analytics consent and privacy mechanism remains intact.
5. The public back-to-top control visually and behaviorally matches the specified AIED.HK progress-ring reference, with the ENA Baby Blue inner face.
6. Accessibility, RTL, reduced motion, route exclusions, responsive placement, and scroll progress are covered by focused tests and browser checks.
7. Unrelated existing working-tree changes remain untouched.

## Evidence Boundary

The supplied screenshots and the 2026-09-01 live AIED.HK observation are visual and interaction references. They do not authorize copying unrelated AIED.HK branding, content, analytics behavior, or private implementation details. Passing local tests and browser checks proves the local candidate only; it does not prove deployment or production behavior.
