# Restore September 2 Workbench UI Implementation Plan

> **For agentic workers:** Implement the user-approved historical UI directly, with scoped changes and verification checkpoints. The September 8 user screenshot approves the design; do not restart design approval or replace it with another design.

**Goal:** Restore the September 2 left workbench appearance across Data, Model, Plot Tools, Stats & Export and AI, including all four Model tabs, while preserving native v3 computation, currentness, accessibility and functional actions.

**Architecture:** Reuse historical presentation classes and copy with current v3 handlers. Put newly added scientific summaries, previews and artifacts in accessible disclosures after primary controls. Keep all scientific state, result bindings, models, identities and worker code untouched.

**Tech Stack:** Existing React 19 / Next 16 / TypeScript / CSS; CUA browser verification and repository unit/build checks.

## Approved visual contract

- Historical reference: source `63c0389`, user-approved Model screenshot, and the two reproduced images delivered in this conversation.
- Preserve the later correction: the field-path add button has no gray side strips or gray gaps around it. Do not restore the gray wrapper in the older screenshot.
- Main panel headers use the old small numbered kicker, title and brief description. No shared Run/Cancel block at the top of every mode.
- Model order: header and trajectory shortcut; four tabs; active controls; valid/stale/error state; primary Run/Rebuild action; optional scientific details and artifacts.
- Units uses the compact field path, Create Sample and group toolbar on one row, and compact collapsible group rows. Raw draft counts/stability remain inspectable in a disclosure.
- Horizons keeps its field path and compact horizon preview. Larger Unit-by-Horizon tables and resolved sequence evidence are disclosures; applicable order editors remain directly usable.
- Windows uses compact labeled rows, finite/Infinity controls, weighting and rotation, retaining every validation and confirmation. Resource diagnostics remain available below controls.
- Codes uses compact selectable family options, a toolbar and code rows with functional color, hide/exclude and reorder controls. Scientific profiles remain in accessible per-row details.
- Data restores the prominent upload and two sample buttons. Typed import, raw source preview and artifact import remain reachable below primary actions.
- Plot Tools restores grouped selectors, switches and sliders. Stats retains Comparison/Goodness/Variance tabs and current inference behavior. AI keeps its mounted state and existing disclosure/consent flow.
- All languages continue using existing localized copy; new presentation-only labels receive English, Traditional Chinese and Simplified Chinese variants.

## Execution

- [x] Audit literal Git topology and preserve clean main; create `codex/restore-sep2-workbench-ui` in an isolated worktree.
- [x] Build current jENA and run the existing baseline Model/control tests: 28 passed.
- [x] Restore header/action placement, Model tabs, Units controls and add-button geometry.
- [x] Restore other Model tabs and all remaining left modes. Adapt only presentation markup, copy and CSS; do not change scientific handlers.
- [x] Add a regression contract for primary-before-details ordering and complete localized headers, and run affected existing tests.
- [x] Run nonincremental typecheck, whole application tests and production build. Update only assertions tied to the intentionally restored presentation; retain scientific assertions.
- [x] Compare real browser screenshots against the historical view for Data, Units, expanded groups, Horizons, Windows, Codes, Plot Tools, all Stats tabs and AI.
- [x] Browser checks: field add has no gray gaps; tabs/help keyboard behavior; group hide/restore versus exclude/stale/undo; code hide/color/reorder; window edit/rebuild; mode changes preserve a current result; file import and export disclosures remain reachable; Chinese and narrow viewport reflow.
- [x] Capture final screenshots and record the actual scope and limits of validation. Keep production source, scientific modules and historical evidence preserved.

## Key regression evidence

The browser must observe actual layout and behavior, not merely the existence of CSS text. In the teaching-sample Units state the group toolbar precedes group rows, the main rebuild action follows the active Model panel, and the nine-row scientific summary is initially closed. A disclosure click must leave the result binding/currentness unchanged. A group exclusion must still invalidate the result. Keyboard navigation and diagnostics must open a containing disclosure before focusing a hidden field.

Publish/merge actions require the concrete verified candidate and the user's applicable release authorization; they are distinct from implementing this restoration.
