# Open ENA Login Brand Refresh Design

**Date:** 2026-08-29

**Status:** User-approved visual design; implementation not yet started

**Scope:** Open ENA unauthenticated login presentation only

## Objective

Refresh the left side of the Open ENA login screen so it uses the visual identity already published at [www.open-ena.com](https://www.open-ena.com/), while leaving authentication, localization, form semantics, credentials, routing, and the authenticated workspace unchanged.

The approved result makes three visible changes:

1. Replace the current square ENA mark plus `OPEN ENA / ENA.HK` text with the horizontal Open ENA lockup containing the open-ring mark, `OPEN ENA`, and `EPISTEMIC NETWORK ANALYSIS`.
2. Replace the current simplified six-node illustration with the official open-ring epistemic network illustration containing `OPEN`, `IDEAS`, `LINKS`, `CONTEXT`, and `EVIDENCE` labels.
3. Replace the dark left-panel background with the official Open ENA pale background and Baby Blue atmosphere.

The user selected option A for the lower context area: retain `Epistemic Network Analysis Research Workspace` and the `01 Data / 02 Model / 03 Evidence` sequence, recolored for a light background.

## Approved Visual Direction

The approved desktop reference is the visual-companion mockup produced during design review. The production screen will not contain the mockup's `DESIGN PREVIEW` bar.

### Color system

Use the repository's existing Baby Blue brand tokens and the matching values currently published by the official Open ENA site:

- Outer login-page background: `var(--page)`, currently `#F1F9FD`.
- Left brand surface: `var(--surface)`, currently `#F7FBFE`.
- Brand blue: `var(--accent)`, currently `#89CFF0`.
- Brand blue hover/deeper ring endpoint: `var(--accent-hover)`, currently `#73C2E8`.
- Strong blue: `var(--accent-strong)`, currently `#1F6F9E` in this repository; the imported official SVG may retain its authored `#175F88` brand ink.
- Main navy ink: `#0F172A`.
- Secondary blue-gray ink: `#526477`.
- Light structural line: `var(--line)`, currently `#D5EBF6`.

The left surface also receives the official site's restrained radial Baby Blue atmosphere: low-opacity Baby Blue radial gradients over the pale solid surface. It must remain visibly light and must not resemble the former navy panel.

### Horizontal brand lockup

Add a dedicated local SVG asset derived from the official `logo-open-ena.svg` lockup. It must preserve:

- the 250:80 view-box proportion;
- the open Baby Blue ring and four connected nodes;
- the stacked `OPEN` and `ENA` wordmark;
- the horizontal Baby Blue rule;
- the three-line `EPISTEMIC / NETWORK / ANALYSIS` descriptor;
- accessible title and description metadata in the SVG.

The login component supplies a concise non-empty image alternative such as `Open ENA — Epistemic Network Analysis`. It must not emit a second visible `OPEN ENA` or `ENA.HK` text block next to the asset.

The asset is stored locally and never fetched from `www.open-ena.com` at runtime.

### Open-ring epistemic network illustration

Add a separate local SVG asset based on the official site's `620 × 520` network hero. It preserves:

- the open circular Baby Blue boundary;
- the faint internal axes and guide circle;
- the weighted dark and Baby Blue network edges;
- three white nodes and two Baby Blue nodes;
- the dashed connection to the external `OPEN` node;
- the exact five labels: `EVIDENCE`, `IDEAS`, `CONTEXT`, `LINKS`, and `OPEN`;
- the subtle node shadow.

The illustration is decorative in this login context because it does not describe a user result or supply information needed to authenticate. The component therefore exposes it with an empty alternative and hides it from assistive technology. The SVG itself may retain title/description metadata for direct-asset inspection.

The asset is local, responsive, and vector-based. The implementation must not ship either temporary screenshot PNG as the product asset.

### Retained lower research flow

Keep the existing localized workspace label and three localized research-flow values. On the new light surface:

- the workspace label uses readable deep blue-gray ink;
- dividers use the existing light/strong line tokens;
- `01`, `02`, and `03` use the strong blue accent;
- `Data`, `Model`, and `Evidence` use dark navy/blue-gray ink;
- the semantic ordered-list structure and localized copy remain intact.

## Component and Layout Design

### `OpenEnaLogin`

The existing component remains the owner of the complete login screen. Only the left brand subtree changes:

- replace the current `ena-mark.svg` plus two-text-line brand fragment with the new horizontal lockup asset;
- replace the current inline simplified network SVG with the new open-ring network asset;
- retain the context-copy paragraph and ordered research flow;
- retain the right panel exactly as the authentication UI owner.

No new client state, hook, request, API, or authentication abstraction is introduced.

### Desktop layout

Retain the two-column login shell and its current readable form width. The left column becomes a pale brand canvas with three vertical regions:

1. Horizontal lockup aligned at the top-left.
2. Open-ring network illustration centered in the flexible middle region.
3. Existing research-flow context anchored at the bottom.

The illustration scales to the available column without clipping its external `OPEN` node or text labels. The right panel stays white so the form remains the highest-contrast task area.

### Responsive layout

At the existing single-column breakpoint, stack the brand area above the form. Unlike the current design, do not hide the replacement network merely because the viewport is narrow. Scale it down within a bounded responsive container so the requested new visual remains represented.

At approximately 390 CSS pixels:

- the complete horizontal lockup remains legible without horizontal scrolling;
- the open-ring illustration and all five labels remain inside the viewport;
- the three research-flow steps remain reachable and readable;
- the form begins below the brand area and retains its existing focus order;
- the page may scroll vertically, but no content overlaps or becomes inaccessible.

The implementation may reduce whitespace and illustration size at mobile breakpoints, but it must not reintroduce a dark brand panel.

## Interaction, Accessibility, and Security

- Authentication form action, method, hidden locale, field names, autocomplete values, error relationship, submit behavior, and server-side gate remain unchanged.
- Login copy remains supplied by `getOpenEnaAuthCopy`; no English string is substituted into localized routes.
- Keyboard focus order remains username, password, submit, then any later interactive content.
- The logo has a meaningful alternative. The hero is decorative and ignored by assistive technology.
- Brand text and retained flow copy meet WCAG AA contrast on the pale surface.
- Reduced-motion behavior is unaffected because no animation is added.
- The implementation introduces no third-party image request, analytics request, credential disclosure, or runtime dependency on `www.open-ena.com`.
- The design does not alter which password is valid. Local, preview, and production credential configuration remain separate deployment concerns.

## Files in Scope

Expected implementation surface:

- `components/open-ena/OpenEnaLogin.tsx`
- `app/globals.css`
- one local horizontal lockup SVG under `public/`
- one local open-ring network SVG under `public/`
- focused Open ENA authentication/brand tests
- a bounded local browser regression or visual acceptance script if the existing login browser coverage cannot assert the required layout safely

Out of scope:

- `lib/open-ena-auth.ts` and credential rules
- login/logout API routes and cookies
- right-panel copy or form redesign
- authenticated workspace UI
- jENA analysis, results, exports, or research-data handling
- replacing global ENA.HK assets used by unrelated public pages
- push, pull request, CI, deployment, or production verification

## Test and Acceptance Contract

### Component and source contracts

Add failing tests before production edits that prove:

- the login uses the dedicated horizontal Open ENA lockup asset;
- the old `ena-mark.svg` plus visible `OPEN ENA / ENA.HK` fragment is absent from the login brand subtree;
- the login uses the dedicated open-ring network asset instead of the old simplified inline paths;
- both assets are local SVG files with stable view boxes and required brand labels/metadata;
- the left panel consumes light Baby Blue surface tokens and has no dark `#1D2B3A` background;
- the lower workspace label and ordered three-step flow remain in the component;
- right-panel authentication contract assertions continue to pass unchanged.

### Browser acceptance

Run the local app with synthetic/local authentication configuration only. At a desktop Chromium viewport, verify:

- the horizontal lockup is visible and not clipped;
- the open-ring network and all five labels are visible;
- the entire left panel is pale rather than navy;
- the lower workspace flow is present and readable;
- the right form remains usable with mouse and keyboard;
- invalid credentials still show the existing localized error;
- valid local credentials still enter the workspace;
- there are no product page errors or console errors.

At a 390-pixel Chromium viewport, verify the same brand identity remains reachable, no horizontal overflow occurs, the form is focusable, and no brand element covers a field or button.

Capture desktop and mobile screenshots for visual comparison with the approved mockup. Browser evidence is local only unless a later, separately authorized deployment is tested.

### Regression commands

The implementation plan will choose the narrowest existing scripts that cover this surface, then run at minimum:

- the focused Open ENA authentication/brand tests;
- application type checking;
- the relevant application test suite;
- a production build;
- desktop and mobile Chromium login acceptance;
- `git diff --check` and a final scoped status review.

## Error Handling and Fallbacks

The SVG assets are committed with the application, so ordinary rendering does not depend on a network request. If an asset path regresses, the logo's alternative still names the product, while automated asset-existence tests fail before release. The form remains usable because neither asset participates in authentication or layout state.

Unsupported locales retain the existing English fallback semantics and direction override. Configuration-not-ready and invalid-credential states retain their existing alerts.

## Completion Boundary

Completion means the approved login design is implemented locally, focused and relevant full tests pass, the app builds, and desktop/mobile Chromium evidence matches the acceptance contract. It does not mean the branch is pushed, a pull request is opened or merged, CI is green, a provider is configured, the change is deployed, or production behavior is verified.
