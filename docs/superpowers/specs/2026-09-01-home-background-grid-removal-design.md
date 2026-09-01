# Home Page Background Grid Removal Design

**Date:** 2026-09-01

**Status:** Approved for specification review

**Scope:** ENA.HK Home page only

## Objective

Remove the page-wide horizontal and vertical background grid from the ENA.HK Home page, including every continuation of that grid outside the supplied screenshot. Preserve all purposeful lines and borders inside Home content, including network-figure lines, card borders, workflow connectors, section decoration, the Open ENA feature frame, and the back-to-top progress ring.

## Current State

The screenshot-visible lines come from two `linear-gradient` layers on `.premium-home` in `app/premium-public.css`:

```css
.premium-home {
  background:
    linear-gradient(90deg, rgba(10, 23, 40, 0.035) 1px, transparent 1px) 50% 0 / 120px 100%,
    linear-gradient(rgba(10, 23, 40, 0.025) 1px, transparent 1px) 0 0 / 100% 120px,
    var(--page);
}
```

The first layer creates the repeating vertical lines. The second creates the repeating horizontal lines. Because the declaration belongs to the `.premium-home` page root, the grid continues across the full Home-page background rather than only the screenshot region.

Other Home-only line treatments use separate selectors and serve different functions. They are outside this change.

## Approved Design

Replace the three-layer `.premium-home` background with the existing Home paper color only:

```css
.premium-home {
  background: var(--page);
}
```

This removes both grid-producing gradients and their `120px` repeat geometry while retaining the current page color token.

Do not use transparent grid colors, an overlay mask, `background-image: none`, or a new Home-specific color token. A direct `background: var(--page)` declaration is the smallest and clearest expression of the approved design.

## Preservation Boundary

The implementation must not change or remove:

- `.home-page` or non-premium page backgrounds;
- Home layout, spacing, typography, colors, buttons, copy, or locale behavior;
- `NetworkFigure` nodes, axes, grid paths, or network edges;
- the Open ENA Home feature illustration or its inset frame;
- the workflow section line, workflow connector, workflow nodes, or item rules;
- question-card or closing-panel borders and decoration;
- the back-to-top button, its progress track, deep-blue outline, cyan arc, or arrow;
- Mission, News, Academy, About, Open ENA, or any other route;
- Footer analytics behavior or the previously approved Home initiator translations.

The phrase “all lines outside the screenshot” refers to the full-page continuation of the same horizontal and vertical background grid, not to every line-shaped element on the Home page.

## Files Expected to Change

- `app/premium-public.css`
- `tests/premium-public-ui.test.ts`

No component, dictionary, route, analytics, 3D, dependency, or deployment file should change.

## Test Design

Update `tests/premium-public-ui.test.ts` before editing the stylesheet.

The focused contract must prove:

1. `.premium-home` has `background: var(--page)`.
2. The `.premium-home` rule contains no `linear-gradient`.
3. The `.premium-home` rule contains no `120px` grid repeat geometry.
4. Representative purposeful Home line selectors remain present, including the network figure, Open ENA feature frame, workflow connector, and back-to-top progress ring contract where applicable.
5. The change remains scoped to Home and does not alter the premium public root background.

The new assertion must be observed failing against the current grid declaration before the CSS is changed.

## Browser Acceptance

Run the verified local candidate and inspect at least:

- desktop `1440 × 900`;
- mobile `390 × 844`.

At each viewport:

- inspect the Home background at the top, middle, and bottom;
- confirm no page-wide horizontal or vertical grid lines remain;
- confirm network graphics, card borders, workflow structure, section frames, and progress ring remain visible;
- confirm the Home background resolves to the existing `--page` color;
- confirm `scrollWidth === clientWidth`.

Also inspect one non-Home premium route to confirm the change did not alter another page.

## Verification and Delivery

Run the focused premium-public UI test first, followed by the repository's normal verification gate and proportional browser acceptance. Report test, build, browser, Git, PR, and production evidence as separate layers.

After verification:

- commit the focused change to `codex/home-sentence-multi-language`;
- push the feature branch to update existing PR #30;
- fast-forward the same verified commit into local `main` and rerun the required merged-result test;
- do not push remote `main`, merge PR #30, or deploy production without separate authorization.

## Acceptance Criteria

The change is complete when:

1. The Home page has no page-wide horizontal or vertical background grid at any scroll position.
2. The Home background uses only `var(--page)` in the `.premium-home` rule.
3. Purposeful component and section lines remain unchanged.
4. Focused tests, full verification, and desktop/mobile browser checks pass.
5. The branch, PR, and local-main identities agree on the verified commit while remote `main` remains untouched.
6. No unrelated 3D, data, provider, deployment, or concurrent-worktree changes enter the diff.

## Evidence Boundary

The supplied screenshot establishes the unwanted page-background grid appearance. It does not authorize removing analytic network lines, interface boundaries, or decorative lines that communicate component structure. Local tests and browser inspection prove the local candidate only; PR checks and production deployment remain separate evidence layers.
