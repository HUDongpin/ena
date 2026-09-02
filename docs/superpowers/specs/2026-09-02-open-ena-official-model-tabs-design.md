# Open ENA Official Model Tabs Parity Design

**Date:** 2026-09-02

**Status:** User-approved design, including Baby Blue brand-color amendment

**Scope:** The Open ENA Model panel's `Units`, `Horizons`, `Windows`, and `Codes` tabs

## Objective

Replace the current spacious fieldset-based Model configuration UI with the compact interaction grammar observed in the authenticated webENA `v2.0.7` workbench, while preserving Open ENA's existing ENA/ONA configuration, jENA analysis, accessibility, localization, and result semantics.

The target is visual and workflow parity, not an unsupported claim of numerical or algorithmic parity. Open ENA must not pretend to implement webENA capabilities such as Transmodal horizons or webENA's recommended-window calculation when those capabilities are not present in the local model contract.

## Reference Evidence

The approved reference set consists of:

- the user's current Open ENA screenshot at `716 × 870`;
- the user's webENA reference screenshot at `760 × 798`;
- a direct authenticated observation of webENA `v2.0.7` on 2026-09-02 at a `1280 × 720` CSS-pixel viewport;
- direct DOM and computed-style measurements of all four Model tabs at that viewport.

The live observation established these implementation proportions:

- the Model panel is approximately `306px` wide at the observed viewport;
- the four tab cells are approximately `34px` high;
- field-path segments, compact inputs, selects, and the add button are approximately `30px` high;
- ordinary panel text is approximately `12px`;
- two-ended switch labels are approximately `9.6px`;
- the Create Sample control is approximately `36px` high;
- code rows use a `34px` card body on an approximately `42px` vertical cadence;
- unit/group rows use a compact approximately `22px` body.

These are proportional references, not immutable responsive breakpoints. The target product keeps its existing `380px` desktop control track and responsive behavior, but the content inside that track adopts the official density and rhythm.

No authenticated reference screenshot, account state, observed private identifier, or row-level sample value is stored in the repository.

## Brand Amendment

The user explicitly requires Open ENA's Baby Blue identity to remain in place. The official webENA teal is therefore not copied into the implementation.

- Active tab text: `var(--ena-accent-strong)` / `var(--accent-strong)`, currently `#1F6F9E`.
- Active tab top rule: `var(--ena-accent)` / `var(--accent)`, currently `#89CFF0`.
- Add and primary action backgrounds: `var(--ena-accent)`.
- Add and primary action hover: `var(--ena-accent-hover)`, currently `#73C2E8`.
- Focus rings: `var(--ena-accent-strong)`.
- Neutral field, list, border, and shadow colors remain gray/white.

The Model parity slice must not introduce `#56b09d`, `rgb(86, 176, 157)`, or an equivalent hard-coded webENA teal. Geometry and interaction are copied; product identity remains Open ENA.

## Shared Control Architecture

Create `components/open-ena/OpenEnaOfficialModelControls.tsx` as the focused owner of reusable presentation controls. It contains no analysis logic and receives typed values and callbacks from `OpenEnaWorkspace`.

### Field-path editor

`OpenEnaOfficialFieldPathEditor` renders selected unit or horizon metadata fields as white, equal-width path segments with a restrained left inset shadow between adjacent fields. Each segment includes a non-color drag-handle motif and an accessible remove action. A square Baby Blue `+` button opens a contained field-picker below the path.

The picker uses real checkboxes and preserves source-header order and the existing selection-order contract. It does not silently reorder fields. Empty selections retain a compact placeholder and the same 30px path height.

### Two-ended switch

`OpenEnaOfficialTwoEndedSwitch` renders the compact label/switch/label grammar seen in webENA. It uses a real `role="switch"`, exposes `aria-checked`, has a visible focus state, and supports a disabled state with an explanatory note.

It serves two different purposes:

- Codes: a functional `Ordered Network / Standard Network` switch backed by the existing ONA/ENA analysis-family transition.
- Horizons and Windows: a disabled `Transmodal / Standard` switch with Standard selected and a concise explanation that Open ENA currently supports the Standard horizon method. This provides honest visual parity without inventing Transmodal behavior.

### Compact icon button

`OpenEnaOfficialIconButton` provides one accessible owner for add, visibility, exclusion, collapse, mean/settings, and reset glyphs. Every icon-only button has an `aria-label`, title, disabled state, and visible keyboard focus. Disabled look-alike controls never mutate analysis state.

## Tab Design

### Shared tabs and stage

The tablist is a white four-column strip without the current padded card treatment. Each tab is 34px high, separated by neutral one-pixel rules. The active tab receives a Baby Blue top rule and strong-blue text. A small question-mark badge is present beside the active label with an accessible help label.

The previous `380px` artificial tab stage and `300px` identity fieldsets are removed. The panel remains internally scrollable, but validation and rebuild controls follow the natural height of each tab's compact content.

### Units

Units contains, in order:

1. the unit field-path editor bound to `config.unitColumns`;
2. an official-style toolbar with a Baby Blue `Create Sample` control and compact global group tools;
3. the current group display controls restyled as compact official rows when a comparison result exists;
4. the real comparison-group selector, exposed through the Create Sample control rather than a separate large form block.

Selecting Create Sample opens the native comparison-group selection route. It changes only `config.groupColumn` and preserves the existing official-comparison rotation reconciliation. It does not create or upload data.

Group rows keep the current color, point visibility, mean, confidence interval, outlier interval, include-hidden, and per-unit visibility behavior. The summary row is flattened to the official arrow + square swatch + group name + mean/settings grammar. Detailed settings remain inside the row's contained disclosure.

### Horizons

Horizons contains:

1. the horizon field-path editor bound to `config.conversationColumns`;
2. the disabled `Transmodal / Standard` switch with Standard selected;
3. a compact column/list surface derived from selected horizon fields and the current dataset;
4. disabled visibility/exclusion icons accompanied by an accessible explanation that horizon-level hiding/exclusion is not implemented in Open ENA;
5. bounded rendering and a compact Load More disclosure when a field has more values than the initial visible window.

Changing selected horizon fields continues to use `toggleInSelectionOrder` and invalidates stale results through the existing `updateConfig` path.

### Windows

Windows contains:

1. the disabled Standard horizon-method switch;
2. an official light-gray window section containing the real window type and existing Back/Forward controls;
3. an honest summary of the current moving-window span rather than a fabricated recommended value;
4. compact rows for Model type, Rotation, Weighting, and Center alignment;
5. the existing typed ONA order panel when Ordered Network is active.

No existing window or trajectory option is removed. The two Open ENA window directions remain separately labelled because collapsing them into webENA's single `Window length` value would change method meaning.

### Codes

Codes contains:

1. the functional `Ordered Network / Standard Network` switch;
2. a compact global tools row;
3. one white official-style row for every selected code, with the existing native color input retained in the row;
4. a contained Manage Codes picker for adding or removing candidate code columns;
5. the existing directional-mask editor when Ordered Network is active.

Switching analysis family preserves the existing family-specific drafts. The switch stays visually scoped to Codes. An ONA configuration that still needs order policy remains honestly incomplete and is resolved through Windows; it is not silently made runnable.

## State and Data Boundaries

- `OpenEnaWorkspace` remains the owner of `config`, analysis-family drafts, model-tab state, validation, stale-result handling, and rebuild actions.
- The new shared component owns only local disclosure-open state.
- All configuration mutations continue through `updateConfig`, `selectAnalysisFamily`, or the existing group-display callbacks.
- No jENA model, projection, rotation, code coercion, inference, export, plot, or statistics implementation changes.
- Visual parity must not change selected field order, selected codes, family-specific drafts, code colors, group visibility, or hidden-unit keys.

## Accessibility and Responsive Behavior

- Preserve the existing ARIA tablist and arrow/Home/End keyboard behavior.
- Every `+`, visibility, exclusion, mean/settings, collapse, color, and reset control has a text alternative.
- Use at least a 30px visible compact control while maintaining an accessible pointer/focus route; critical configuration controls retain larger invisible/native hit ownership where appropriate.
- Use `role="switch"` and `aria-checked` for the two-ended switches.
- Disabled unsupported controls disclose why they are disabled.
- At the existing responsive breakpoints, the four labels remain non-overlapping and the field path scrolls or wraps inside the control panel without expanding the whole workbench horizontally.
- Model content scroll remains scoped to the left control panel.

## Files in Scope

- Create `components/open-ena/OpenEnaOfficialModelControls.tsx`.
- Modify `components/open-ena/OpenEnaWorkspace.tsx`.
- Modify `components/open-ena/OpenEnaGroupDisplayControls.tsx`.
- Modify `app/globals.css`.
- Create `tests/open-ena-official-model-tabs-parity.test.ts`.
- Modify focused existing Model, code-color, group-display, and accessibility contracts only where the approved UI changes their assertions.
- Add a bounded real-browser Model-tab parity gate if the current browser smoke does not prove all four tab geometries and interactions.

Out of scope:

- jENA numerical changes;
- Transmodal implementation;
- recommended-window algorithm implementation;
- new statistical methods;
- changes to center/right research surfaces;
- login, provider, database, export, deployment, production, or credential work;
- commit, push, pull request, or deployment unless separately requested.

## Test and Acceptance Contract

### TDD structural and component gates

Write failing tests before production edits that prove:

- the tablist and all four active panels use stable official-parity identifiers;
- the old tall-fieldset stage contract is absent;
- Units and Horizons use the shared field-path editor;
- Codes owns the functional network-family switch;
- Horizons and Windows expose an honest disabled Standard switch;
- Units owns the Create Sample route and compact group controls;
- Codes rows retain real code selection and color controls;
- all new parity CSS uses Baby Blue tokens and contains no webENA teal literal;
- icon-only controls and switches have accessible names and states.

### Method-behavior gates

Run the existing focused configuration, analysis-family, ONA order, code-color, group-display, accessibility, inference, and browser-contract tests. Confirm that changing presentation does not mutate analytical results or remove an existing route to any real setting.

### Browser acceptance

Use a local served Open ENA teaching sample with no private data. At desktop width:

- compare Units, Horizons, Windows, and Codes individually against the observed official geometry;
- verify the tab strip is 34px dense, active styling is Baby Blue, and no teal is rendered;
- verify field segments and add buttons are 30px high;
- verify Create Sample changes the comparison-group selector;
- verify field add/remove behavior updates the corresponding configuration;
- verify the network-family switch preserves family drafts and exposes ONA order requirements;
- verify code colors and Manage Codes remain functional;
- verify disabled Transmodal controls explain their boundary;
- verify no tab, icon, field name, or code row overlaps;
- inspect page and console errors.

At the repository's enlarged-text test setting and responsive Model panel width, verify no tab-label overlap, no unexpected horizontal workbench growth, and visible focus states.

## Verification Boundary

Completion requires focused RED/GREEN evidence, relevant full tests, type checking, a production build, `npm run verify`, and fresh real-browser proof for all four tabs. Local visual parity does not establish webENA numerical parity, a deployed release, or production behavior.
