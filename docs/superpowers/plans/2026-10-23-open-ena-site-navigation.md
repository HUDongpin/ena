# Open ENA website navigation implementation

Approved design: option 1, revised on 2026-10-23 to place the Website / 网站
control directly above Sign out, after the analysis-mode toolbar. The
six existing website destinations open in new tabs and retain the current
workspace. Initial implementation stays in the existing checkout; the authorized
release is integrated into an isolated worktree based on current main
`d1eb4e3e84671bdb9a4e931cf58fc4de6efa4e00`, preserving its later fixes.

## Implementation

- [x] Add a focused rendered-workspace regression for the six localized links,
  new-tab semantics, and separation from the analysis toolbar; observe failure.
- [x] Add `OpenEnaSiteNavigation.tsx`, using the existing site dictionaries and
  Plugin Lab label. Use a native automatic popover for top-layer placement,
  outside-click dismissal and Escape/focus behavior. Keep its state local.
- [x] Insert the control directly above Sign out. On layouts at or below 900px
  (including container-based zoom layouts), retain that order as a compact row.
- [x] Style the 48px rail entry and 224px white menu with existing colors. Bound
  its placement and scrolling to the viewport, including CSS zoom and RTL.
- [x] Verify pointer/keyboard operation, all six new tabs, locale paths, desktop,
  narrow and short windows, and zoom. With the public synthetic teaching sample,
  verify the original document and plot state survive opening another page.
- [x] Run relevant workspace/rail/accessibility tests and TypeScript checking;
  inspect screenshots and report the local verification boundary.

## Constraints

No API, analysis, authentication, storage or scientific-model changes are needed.
The navigation makes no autosave promise. No new package is required. This task
implements the approved navigation change. Publishing and deployment were
subsequently authorized; the release must pass the existing exact-commit CI gates
and real production browser checks before being reported as deployed.

## Verification boundary

The 40 focused Node tests pass, including all 14 locale paths and labels. The
existing `open-ena-a11y-landmarks-browser.mjs` regression passes at 1440×900,
768×1024, 390×844 and 320×568, including all five analysis modes.

Chrome component verification uses the real Workspace, CSS, public synthetic
teaching sample and jENA Web Worker, with local destination stubs. Each of the
six links opens a new tab, closes the menu and retains the original URL,
current-result status, model text and zoomed comparison-plot markup. Tab, Enter,
Escape/focus return, outside dismissal, viewport resizing, short-window scrolling
and 200% CSS zoom are checked. Screenshots are in `output/site-navigation/`.
The updated desktop menu aligns its bottom with the relocated trigger and opens
upward alongside the sidebar. Updated placement evidence uses `*-bottom.*` names.
The menu's new-tab marker uses a compact 16px SVG with a rounded window outline
and short arrow, replacing the thin font-dependent diagonal arrow. Its muted
blue-gray stroke follows the interface icon style and turns blue on hover/focus.

Default `npm run typecheck:app` is blocked by stale generated `.next` types that
reference a different worktree and unrelated untracked `work/` probes. A local
TypeScript configuration under `output/site-navigation/` includes application,
component, library, test, script and declaration sources while excluding those
generated/scratch files; it passes. No default configuration was changed.

This is local component and regression verification, not deployment acceptance
or physical-device testing. Native browser-menu zoom was not established; the
200% zoom check uses CSS zoom, matching the existing container-query layout.
