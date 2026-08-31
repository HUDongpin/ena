# Home and Mission About-Scale Title Design

**Date:** 2026-08-31

**Status:** User-approved design; implementation not yet started

**Scope:** Public Home and Mission primary heading font size only

## Objective

Make the Home heading `See how ideas connect.` and the Mission heading
`Make relational thinking easier to learn, apply, and discuss.` use the same
responsive `font-size` scale as the About heading
`The Initiator of ENA.HK, The Company, & The Products`.

The approved design changes only `font-size`. Home and Mission retain their
current copy, font family, font weight, line height, letter spacing, maximum
width, color, alignment, surrounding spacing, backgrounds, and responsive
layout.

## Current Evidence

The About reference is owned by `.about-profile-hero h1` in
`app/globals.css`:

```css
font-size: clamp(2.65rem, 5.3vw, 4.7rem);
```

About has no breakpoint-specific heading-size override. Current local Chromium
measurements show the following mismatch:

| Viewport | About | Home | Mission |
| --- | ---: | ---: | ---: |
| 1440 × 900 | 75.2px | 109.44px | 109.44px |
| 820 × 900 | 43.46px | 80px | 80px |
| 390 × 844 | 42.4px | 58.5px | 58.5px |

The oversized Home and Mission values come from their desktop declarations in
`app/premium-public.css` plus shared overrides at `max-width: 820px` and
`max-width: 620px`.

## Approved Approach: Clean Responsive Refactor

Use the existing About `clamp(2.65rem, 5.3vw, 4.7rem)` as the single responsive
scale for both target headings.

Implementation will:

1. Replace the Home heading's desktop `font-size` with the About scale.
2. Replace the Mission heading's desktop `font-size` with the About scale.
3. Remove Home and Mission from the `max-width: 820px` heading-size selector
   group so that breakpoint cannot enlarge them.
4. Remove Home and Mission from the `max-width: 620px` heading-size selector
   group for the same reason.
5. Preserve the detail-page heading selectors and their existing responsive
   values.

This is preferred over a final cascade override because it removes obsolete
larger declarations instead of leaving dead values in the stylesheet. It is
preferred over a new global token because the request does not require changing
the already-correct About implementation or creating a broader type system.

No JSX or localized dictionary file changes are required.

## Responsive Acceptance

At equal viewport widths, Home, Mission, and About must have exactly the same
computed `font-size`. The expected representative values are:

- 1440px viewport: `75.2px`.
- 820px viewport: `43.46px`.
- 390px viewport: `42.4px`.

Equal font size does not mean equal heading-block height. Home and Mission keep
their distinct line height, letter spacing, weight, copy length, and maximum
width, so wrapping and vertical rhythm may still differ from About.

## Test Design

Add a failing premium-public UI contract before production CSS changes. The
test reads declarations for these selectors across ordinary and media-query
rules:

- `.about-profile-hero h1`
- `.premium-home .hero-copy h1`
- `.premium-mission .page-hero h1`

It must prove that About exposes one responsive font-size scale and that Home
and Mission each expose only that same scale, with no breakpoint-specific
font-size declarations.

After the CSS change, run:

- the focused premium-public UI test;
- the complete application test suite;
- TypeScript checking;
- a production build;
- `git diff --check`;
- local Chromium acceptance at 1440 × 900, 820 × 900, and 390 × 844.

Browser acceptance must also confirm no horizontal overflow and no console
errors on Home, Mission, and About.

## Files in Scope

- `app/premium-public.css`
- `tests/premium-public-ui.test.ts`

## Out of Scope

- About title styling beyond using it as the reference.
- Home or Mission copy, content structure, hero height, spacing, color, or
  typography properties other than `font-size`.
- News, Academy, detail-page, About, Open ENA, or footer layout changes.
- Committing the future CSS implementation, pushing, opening a pull request,
  deploying, or production verification. The design document itself is
  committed as required by the design-review workflow.

## Error Handling and Completion Boundary

There is no runtime error path because this is a static CSS change. Regression
protection is provided by the source contract, application build, and browser
computed-style checks.

Local completion means both requested headings use the About font-size scale at
all tested viewports, the relevant test and build gates pass, and the browser
shows no overflow or console errors. Local completion does not prove that the
change has been pushed or deployed to `ena.hk`.
