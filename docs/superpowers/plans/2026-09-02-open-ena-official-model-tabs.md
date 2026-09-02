# Open ENA Official Model Tabs Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Open ENA's Units, Horizons, Windows, and Codes Model panels with the compact webENA v2.0.7 interaction grammar while preserving Open ENA analysis semantics and Baby Blue identity.

**Architecture:** Keep `OpenEnaWorkspace` as the configuration/state owner and add one focused presentation module for field paths, two-ended switches, and compact icon controls. Replace the existing large fieldset markup tab-by-tab, restyle the existing group-display component into compact rows, and prove presentation and method behavior separately through source/component contracts and a served browser comparison.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Node test runner with `tsx`, existing jENA/Open ENA model contracts, Playwright/Chromium browser verification.

---

## Scope and File Map

- Create `components/open-ena/OpenEnaOfficialModelControls.tsx`: reusable field-path editor, two-ended switch, and icon button; no analysis logic.
- Modify `components/open-ena/OpenEnaWorkspace.tsx`: compose the four official-style panels and bind them to existing configuration callbacks.
- Modify `components/open-ena/OpenEnaGroupDisplayControls.tsx`: flatten headers/toolbars into official-style group rows while preserving all current switches and unit controls.
- Modify `app/globals.css`: replace the tall Model stage with compact white/gray geometry and Baby Blue state tokens.
- Create `tests/open-ena-official-model-tabs-parity.test.ts`: component/source/CSS contracts for the approved four-tab design.
- Modify `tests/open-ena-official-full-workbench-contract.test.ts`: remove the obsolete `380px/300px` tall-stage requirement and assert the compact stage.
- Modify `tests/open-ena-group-display-controls.test.ts`: assert the new compact group-row semantics without weakening existing behavior checks.
- Modify `tests/open-ena-code-colors.test.ts`: assert the color input remains in each selected official code row.
- Use `tests/open-ena-a11y-perf-browser-smoke.mjs` or a new bounded `tests/open-ena-model-tabs-browser-smoke.mjs` only if the existing script cannot prove all four rendered geometries.

No commit, push, deployment, provider change, or production claim is part of this plan.

### Task 1: Lock the approved compact/Baby Blue contract in RED tests

**Files:**

- Create: `tests/open-ena-official-model-tabs-parity.test.ts`
- Modify: `tests/open-ena-official-full-workbench-contract.test.ts`

- [ ] **Step 1: Write the failing parity source and CSS test**

Create a Node test that reads `OpenEnaWorkspace.tsx`, `OpenEnaOfficialModelControls.tsx`, and `app/globals.css`. The test must assert these exact contracts:

```ts
assert.match(workspace, /data-ena-official-model-tabs="true"/u);
assert.match(workspace, /<OpenEnaOfficialFieldPathEditor[\s\S]*?selectedFields=\{config\.unitColumns\}/u);
assert.match(workspace, /<OpenEnaOfficialFieldPathEditor[\s\S]*?selectedFields=\{config\.conversationColumns\}/u);
assert.match(workspace, /data-ena-official-panel="units"/u);
assert.match(workspace, /data-ena-official-panel="horizons"/u);
assert.match(workspace, /data-ena-official-panel="windows"/u);
assert.match(workspace, /data-ena-official-panel="codes"/u);
assert.match(workspace, /Ordered Network/u);
assert.match(workspace, /Standard Network/u);
assert.match(workspace, /Transmodal/u);
assert.match(workspace, /Standard/u);
assert.doesNotMatch(css, /--ena-model-tab-stage-height:\s*380px/u);
assert.match(css, /\.ena-model-tabs button\s*\{[^}]*min-height:\s*34px;/u);
assert.match(css, /\.ena-model-tabs button\[aria-selected="true"\]\s*\{[^}]*color:\s*var\(--ena-accent-strong\);/u);
assert.match(css, /\.ena-model-tabs button\[aria-selected="true"\]::before\s*\{[^}]*background:\s*var\(--ena-accent\);/u);
assert.match(css, /\.ena-official-field-path-add\s*\{[^}]*height:\s*30px;[^}]*background:\s*var\(--ena-accent\);/u);
assert.doesNotMatch(modelParityCss, /#56b09d|rgb\(86,\s*176,\s*157\)/iu);
```

The test must also import and server-render the shared field editor and two-ended switch to assert `aria-expanded`, `role="switch"`, `aria-checked`, and disabled boundary text.

- [ ] **Step 2: Replace the obsolete tall-stage test with the new compact-stage expectation**

In `tests/open-ena-official-full-workbench-contract.test.ts`, replace `all four Model tabs share a taller stable content stage before validation and rebuild` with `all four Model tabs use the compact official stage before validation and rebuild`. Assert natural content height, `34px` tabs, `30px` field paths, internal overflow, and absence of the `380px/300px` custom properties.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
node --test --import tsx \
  tests/open-ena-official-model-tabs-parity.test.ts \
  tests/open-ena-official-full-workbench-contract.test.ts
```

Expected: FAIL because `OpenEnaOfficialModelControls.tsx`, parity data attributes, and compact CSS do not yet exist, and the old tall-stage custom properties are still present.

### Task 2: Implement the shared official-style controls

**Files:**

- Create: `components/open-ena/OpenEnaOfficialModelControls.tsx`
- Test: `tests/open-ena-official-model-tabs-parity.test.ts`

- [ ] **Step 1: Implement the field-path editor**

Add the typed API:

```ts
export interface OpenEnaOfficialFieldPathEditorProps {
  label: string;
  selectedFields: readonly string[];
  options: readonly string[];
  disabled?: boolean;
  onChange: (fields: string[]) => void;
}
```

Render a 30px field path, equal-width selected segments, remove buttons, a Baby Blue add button, and a locally owned picker disclosure. Toggling a field must preserve `options` order for selected values while leaving already selected relative order stable.

- [ ] **Step 2: Implement the two-ended switch**

Add the typed API:

```ts
export interface OpenEnaOfficialTwoEndedSwitchProps {
  label: string;
  startLabel: string;
  endLabel: string;
  endSelected: boolean;
  disabled?: boolean;
  boundary?: string;
  onChange?: (endSelected: boolean) => void;
}
```

Use a real button with `role="switch"`, `aria-checked`, and `disabled`; render the boundary as a visible/accessible note only when supplied.

- [ ] **Step 3: Implement the compact icon button**

Add an icon-name union for `add`, `collapse`, `mean`, `visibility`, `exclude`, and `reset`. Render inline SVG paths, never icon font characters, and require `ariaLabel` and `title` props.

- [ ] **Step 4: Run the shared-component test and confirm GREEN for Task 2**

Run:

```bash
node --test --import tsx tests/open-ena-official-model-tabs-parity.test.ts
```

Expected: shared-component render assertions PASS; workspace/CSS assertions remain RED until Tasks 3–5.

### Task 3: Recompose Units and Horizons

**Files:**

- Modify: `components/open-ena/OpenEnaWorkspace.tsx:1950-2150`
- Modify: `components/open-ena/OpenEnaGroupDisplayControls.tsx`
- Modify: `tests/open-ena-group-display-controls.test.ts`
- Test: `tests/open-ena-official-model-tabs-parity.test.ts`

- [ ] **Step 1: Add failing Units/Horizons behavior assertions**

Assert that Units renders the field-path editor, a `Create Sample` control owning the real comparison-group selector, and compact group toolbar identifiers. Assert Horizons renders its field path, disabled Standard switch, field columns, disabled visibility/exclusion controls, and a bounded value window.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test --import tsx \
  tests/open-ena-official-model-tabs-parity.test.ts \
  tests/open-ena-group-display-controls.test.ts
```

Expected: FAIL on missing official Units/Horizons composition and compact group-row identifiers.

- [ ] **Step 3: Replace the two identity fieldsets**

Use `OpenEnaOfficialFieldPathEditor` twice. Bind `onChange` to `updateConfig`, assigning `unitColumns` or `conversationColumns`. Keep `identityOptions` as the option source and preserve the existing stale-result invalidation path.

- [ ] **Step 4: Implement Create Sample as the real group selector**

Wrap the existing group `<select>` in a visually official Baby Blue control with an explicit `Choose comparison-group column` accessible name. Keep the current `officialComparisonRotation` reconciliation exactly intact.

- [ ] **Step 5: Add the honest Horizons surface**

Derive a bounded list of distinct non-empty values for every selected conversation column from `dataset.rows`, render eight values initially, and expose `Load More` for longer columns. Visibility/exclusion icon controls are disabled with the boundary `Horizon-level hiding and exclusion are not available in Open ENA.`

- [ ] **Step 6: Flatten group display summaries without changing callbacks**

Keep the current details/settings/unit subtree and callbacks. Change only the header/tool markup and CSS classes so group rows present arrow, square color swatch, group name, visible count, and mean/settings control in the official compact cadence.

- [ ] **Step 7: Run Units/Horizons tests and confirm GREEN**

Run the same command from Step 2. Expected: all Units/Horizons and group-display tests PASS.

### Task 4: Recompose Windows and Codes

**Files:**

- Modify: `components/open-ena/OpenEnaWorkspace.tsx:2149-2285`
- Modify: `components/open-ena/OpenEnaAnalysisFamilyControl.tsx`
- Modify: `tests/open-ena-code-colors.test.ts`
- Modify: `tests/open-ena-analysis-family-switch.test.ts` if its current card-only contract changes
- Test: `tests/open-ena-official-model-tabs-parity.test.ts`

- [ ] **Step 1: Add failing Windows/Codes behavior assertions**

Assert that Windows uses the disabled Standard switch and official light-gray setting rows while retaining both shared range fields. Assert Codes uses the functional network-family switch, selected code rows, native color inputs, Manage Codes picker, and directional-mask editor.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test --import tsx \
  tests/open-ena-official-model-tabs-parity.test.ts \
  tests/open-ena-code-colors.test.ts \
  tests/open-ena-analysis-family-switch.test.ts
```

Expected: FAIL on the missing compact Windows/Codes composition while existing method tests remain green.

- [ ] **Step 3: Move analysis family into Codes**

Extend `OpenEnaAnalysisFamilyControl` with `variant="official-switch"`. In that variant, map ONA to `Ordered Network` and ENA to `Standard Network`, call the existing `onChange`, and keep the current card variant available to any unrelated consumer. Remove the card control above the Model tabs and render the switch at the top of Codes.

- [ ] **Step 4: Compact Windows without changing method values**

Keep `OpenEnaOrderPanel` unchanged for ONA. For ENA, wrap the real window, Back, Forward, Model type, Rotation, Weighting, and Center controls in `ena-official-setting-section` and `ena-official-setting-row` markup. Do not derive or display a fake recommended window value.

- [ ] **Step 5: Render selected codes as official rows**

Render every `config.codes` entry as a white compact row with its current native color input. Add a Manage Codes disclosure containing real checkboxes for `codeOptions`, bound to the existing header-order toggle. Keep `OpenEnaDirectionalMaskEditor` below the list for ONA.

- [ ] **Step 6: Run Windows/Codes tests and confirm GREEN**

Run the same command from Step 2. Expected: all focused parity, code-color, and family-switch tests PASS.

### Task 5: Replace the tall-stage CSS with compact Baby Blue parity styles

**Files:**

- Modify: `app/globals.css:8995-9090`
- Test: `tests/open-ena-official-model-tabs-parity.test.ts`

- [ ] **Step 1: Implement the shared tab and panel geometry**

Use `34px` tabs, white cells, neutral separators, a `4px` Baby Blue top rule, `12px` text, and natural-height panels. Remove `--ena-model-tab-stage-height`, `--ena-model-selection-stage-height`, and the forced tall fieldsets.

- [ ] **Step 2: Implement field, toolbar, switch, setting, horizon, and code-row styles**

Use `30px` field paths/inputs, `36px` Create Sample, `#f4f4f4` setting groups, approximately `42px` code-row cadence, and scoped internal overflow. Use only `var(--ena-accent)`, `var(--ena-accent-hover)`, `var(--ena-accent-strong)`, and neutral colors for new parity selectors.

- [ ] **Step 3: Add responsive and enlarged-text safeguards**

Allow field paths to scroll inline, keep the four tab labels from overlapping, preserve visible focus rings, and ensure the control panel—not the whole workbench—owns overflow.

- [ ] **Step 4: Run all focused contracts and confirm GREEN**

Run:

```bash
node --test --import tsx \
  tests/open-ena-official-model-tabs-parity.test.ts \
  tests/open-ena-official-full-workbench-contract.test.ts \
  tests/open-ena-group-display-controls.test.ts \
  tests/open-ena-code-colors.test.ts \
  tests/open-ena-a11y-perf-browser-smoke-contract.test.ts
```

Expected: all focused tests PASS, with zero webENA teal literals in the scoped parity rules.

### Task 6: Verify method behavior, application integrity, and rendered parity

**Files:**

- Modify only if RED evidence finds a regression: the smallest file owning that regression
- Browser artifacts: `output/playwright/` only

- [ ] **Step 1: Run relevant method/configuration tests**

Run the analysis-family, ONA order, inference-consumer, group-display, code-color, functional, accessibility, and official-workbench suites. Expected: all PASS with no result-contract change.

- [ ] **Step 2: Run type checking and production build**

Run:

```bash
npm run typecheck:app
npm run build:app
```

Expected: both exit `0`.

- [ ] **Step 3: Serve the local app and perform four-tab browser acceptance**

Use the repository's local Open ENA authentication/sample route. Load the teaching sample, enter Model, and capture/measure Units, Horizons, Windows, and Codes at a desktop viewport. Verify 34px tabs, 30px paths, Baby Blue active/add colors, compact rows, real interactions, disabled boundary text, focus states, and no page/console errors.

- [ ] **Step 4: Run enlarged-text and responsive checks**

Reuse the existing accessibility browser route to verify no tab overlap, no whole-workbench horizontal growth, and no clipped controls.

- [ ] **Step 5: Run the authoritative repository gate**

Run with task-owned cache/temp paths if required by the host:

```bash
env TMPDIR=/Volumes/Starship/ENA/.tmp/open-ena-model-parity \
  NPM_CONFIG_CACHE=/Volumes/Starship/ENA/.cache/npm-open-ena-model-parity \
  npm run verify
```

Expected: exit `0`. Do not claim production or deployed parity from this local gate.

- [ ] **Step 6: Audit the final scope**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff -- \
  components/open-ena/OpenEnaOfficialModelControls.tsx \
  components/open-ena/OpenEnaWorkspace.tsx \
  components/open-ena/OpenEnaGroupDisplayControls.tsx \
  components/open-ena/OpenEnaAnalysisFamilyControl.tsx \
  app/globals.css \
  tests/open-ena-official-model-tabs-parity.test.ts \
  tests/open-ena-official-full-workbench-contract.test.ts \
  tests/open-ena-group-display-controls.test.ts \
  tests/open-ena-code-colors.test.ts
```

Expected: only the approved Model parity implementation, tests, and design/plan documents are changed; no credentials, reference screenshots, unrelated user files, commits, pushes, or deployment changes.
