# Open ENA Model V3 Models UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Models form with the approved four-tab v3 editor, remove unavailable controls, implement every Units/Codes bulk action, and keep scientific, presentation, running, current, stale, and Undo state exact and accessible.

**Architecture:** A pure reducer owns Standard/ONA drafts and display state. Focused tab components receive draft slices, diagnostics, and typed actions; OpenEnaWorkspace remains the workflow/worker owner. Renderers receive explicit presentation props and never require mutation of fitted results.

**Tech Stack:** React, TypeScript, existing Open ENA components, CSS, locale catalog, Node component/contract tests, React static rendering.

---

### Task 1: Add the Models v3 reducer and exact Undo records

**Files:**
- Create: `components/open-ena/model-v3/model-state.ts`
- Test: `tests/open-ena-model-v3-state.test.ts`

- [ ] **Step 1: Write failing scientific/display separation tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createModelStateV3,
  modelStateReducerV3,
} from "../components/open-ena/model-v3/model-state";

test("Hide Codes changes display only while Exclude all changes the active draft", () => {
  const initial = createModelStateV3(fixtureDrafts);
  const hidden = modelStateReducerV3(initial, { type: "hide-all-codes" });
  assert.deepEqual(hidden.drafts, initial.drafts);
  assert.equal(hidden.display.standard.allCodesSuppressed, true);
  assert.equal(hidden.scientificRevision, initial.scientificRevision);

  const excluded = modelStateReducerV3(hidden, { type: "exclude-all-codes" });
  assert.deepEqual(excluded.drafts.standard.codes, []);
  assert.deepEqual(excluded.drafts.ona.codes, initial.drafts.ona.codes);
  assert.equal(excluded.scientificRevision, initial.scientificRevision + 1);
  assert.equal(excluded.resultStatus, "stale");
});

test("changing analysis family invalidates execution without copying either draft", () => {
  const initial = createModelStateV3(fixtureDrafts);
  const switched = modelStateReducerV3(initial, { type: "set-active-family", family: "ona" });
  assert.deepEqual(switched.drafts.standard, initial.drafts.standard);
  assert.deepEqual(switched.drafts.ona, initial.drafts.ona);
  assert.equal(switched.drafts.activeFamily, "ona");
  assert.equal(switched.scientificRevision, initial.scientificRevision + 1);
  assert.equal(switched.resultStatus, initial.result ? "stale" : "none");
  assert.equal(switched.undo, null);
  assert.deepEqual(
    modelStateReducerV3(switched, { type: "set-active-family", family: "ona" }),
    switched,
  );
});
```

- [ ] **Step 2: Run the reducer test**

Run: `node --import tsx --test tests/open-ena-model-v3-state.test.ts`
Expected: FAIL because `model-state.ts` is absent.

- [ ] **Step 3: Implement explicit scientific and presentation actions**

```ts
import type {
  OpenEnaGroupDisplayOptions,
  OpenEnaGroupDisplaySettingsByGroup,
} from "../../../lib/open-ena/group-display";

export type ModelStateActionV3 =
  | { type: "set-active-family"; family: "standard" | "ona" }
  | { type: "replace-standard-draft"; draft: StandardEnaDraftV3 }
  | { type: "replace-ona-draft"; draft: OrderedNetworkDraftV3 }
  | { type: "hide-all-codes" }
  | { type: "restore-code-visibility" }
  | { type: "set-code-visible"; code: string; visible: boolean }
  | { type: "set-code-color"; code: string; color: string }
  | { type: "set-code-order"; codes: string[] }
  | { type: "hide-all-groups" }
  | { type: "restore-group-visibility" }
  | {
      type: "set-group-display";
      groupToken: string;
      patch: Partial<OpenEnaGroupDisplayOptions>;
    }
  | { type: "exclude-all-codes" }
  | { type: "exclude-code"; code: string }
  | { type: "exclude-group-configuration" }
  | { type: "undo-model-edit" }
  | { type: "mark-running"; executionPlanSha256: string }
  | { type: "mark-obsolete" }
  | { type: "accept-result"; result: BoundOpenEnaResultV3 };

function scientificEdit(
  state: ModelStateV3,
  drafts: ModelWorkspaceDraftsV3,
  undo: ModelDraftUndoRecordV3 | null,
): ModelStateV3 {
  return {
    ...state,
    drafts,
    undo,
    scientificRevision: state.scientificRevision + 1,
    runStatus: state.runStatus === "running" ? "obsolete" : state.runStatus,
    resultStatus: state.result ? "stale" : "none",
  };
}
```

Implement family-specific Code and Group clearing, result-bound visibility
snapshots, and exact restore. Group exclusion clears Group and Means contrast
but keeps Means selected and invalid. Changing to a different active family is
a scientific-context change: preserve both drafts, increment the scientific
revision, obsolete any running plan, mark an unmatched result stale, clear
Undo, and compile only the newly active family. Selecting the already-active
family is a referential no-op.

Define the reducer state and Undo record in the same file:

```ts
export interface ModelDraftUndoRecordV3 {
  action: "exclude-all-codes" | "exclude-code" | "exclude-group-configuration";
  family: "standard" | "ona";
  datasetSha256: string;
  resultingDraftFingerprint: string;
  before: StandardEnaDraftV3 | OrderedNetworkDraftV3;
}

export interface ModelStateV3 {
  datasetSha256: string;
  drafts: ModelWorkspaceDraftsV3;
  display: ModelDisplayStateV3;
  scientificRevision: number;
  runStatus: "idle" | "running" | "obsolete" | "cancelled" | "error";
  resultStatus: "none" | "current" | "stale";
  runningPlanSha256: string | null;
  result: BoundOpenEnaResultV3 | null;
  undo: ModelDraftUndoRecordV3 | null;
}

export interface ModelDisplayStateV3 {
  standard: {
    allCodesSuppressed: boolean;
    codeVisibility: Record<string, boolean>;
    codeColors: Record<string, string>;
    codeVisibilitySnapshot: Record<string, boolean> | null;
    allGroupsSuppressed: boolean;
    groups: OpenEnaGroupDisplaySettingsByGroup;
    groupVisibilitySnapshot: OpenEnaGroupDisplaySettingsByGroup | null;
    codeOrder: string[];
  };
  ona: {
    allCodesSuppressed: boolean;
    codeVisibility: Record<string, boolean>;
    codeColors: Record<string, string>;
    codeVisibilitySnapshot: Record<string, boolean> | null;
    allGroupsSuppressed: boolean;
    groups: OpenEnaGroupDisplaySettingsByGroup;
    groupVisibilitySnapshot: OpenEnaGroupDisplaySettingsByGroup | null;
    codeOrder: string[];
  };
}
```

- [ ] **Step 4: Add Undo binding tests**

Assert Undo succeeds only when dataset hash, active family, and resulting draft
fingerprint still match. A dataset change, family change, or subsequent
conflicting scientific edit invalidates Undo. Undo never marks an unmatched
result current.

```ts
const excluded = reduce(initial, { type: "exclude-all-codes" });
assert.notEqual(excluded.undo, null);
assert.deepEqual(reduce(excluded, { type: "undo-model-edit" }).drafts, initial.drafts);
assert.equal(reduce({ ...excluded, datasetSha256: "b".repeat(64) }, {
  type: "undo-model-edit",
}).undo, null);
```

- [ ] **Step 5: Add running/obsolete/late-result tests**

Scientific edit during Running sets Obsolete; display edit does not. Accept a
matching result as current; retain/reject a late result with a different plan
hash without replacing current state. Per-Code visibility/color/order and
per-Group display patches preserve the scientific revision and running plan;
Code reorder must be an exact permutation of the active selected Codes.

```ts
const running = reduce(initial, { type: "mark-running", executionPlanSha256: "a".repeat(64) });
assert.equal(reduce(running, { type: "hide-all-codes" }).runStatus, "running");
assert.equal(reduce(running, { type: "exclude-all-codes" }).runStatus, "obsolete");
assert.notEqual(reduce(running, { type: "accept-result", result: lateResult }).result, lateResult);
const reordered = reduce(running, { type: "set-code-order", codes: ["C", "A", "B"] });
assert.equal(reordered.scientificRevision, running.scientificRevision);
assert.equal(reordered.runningPlanSha256, running.runningPlanSha256);
assert.throws(() => reduce(running, { type: "set-code-order", codes: ["A", "A", "B"] }));
```

- [ ] **Step 6: Run reducer tests**

Run: `node --import tsx --test tests/open-ena-model-v3-state.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit the reducer**

```bash
git add components/open-ena/model-v3/model-state.ts tests/open-ena-model-v3-state.test.ts
git commit -m "feat: add Models v3 state transitions"
```

### Task 2: Build the accessible tab shell, status summary, help, and diagnostics

**Files:**
- Create: `components/open-ena/model-v3/OpenEnaModelTabsV3.tsx`
- Create: `components/open-ena/model-v3/OpenEnaModelDiagnosticsV3.tsx`
- Test: `tests/open-ena-model-v3-tabs.test.ts`

- [ ] **Step 1: Write the failing static-render test**

```ts
test("Models v3 renders four accessible tabs and scoped diagnostic counts", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, props));
  assert.equal((markup.match(/role="tab"/gu) ?? []).length, 4);
  assert.match(markup, /aria-label="Model configuration"/u);
  assert.match(markup, /Units, 1 error and 1 warning/u);
  assert.match(markup, /role="tabpanel"/u);
  assert.match(markup, /Configuration incomplete/u);
  assert.doesNotMatch(markup, /Transmodal/u);
});
```

- [ ] **Step 2: Run the tab test**

Run: `node --import tsx --test tests/open-ena-model-v3-tabs.test.ts`
Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement the tab shell**

Render exactly Units, Horizons, Windows, and Codes using the existing roving
tab pattern. Keep ArrowLeft/Right/Up/Down, Home, and End behavior. Render a
separate adjacent Help button rather than nesting a button inside a tab. The
help popover has heading/description IDs, Escape handling, and focus return.

```tsx
const MODEL_TABS = ["units", "horizons", "windows", "codes"] as const;
const tabId = (tab: typeof MODEL_TABS[number]) => `ena-model-tab-${tab}`;
const panelId = (tab: typeof MODEL_TABS[number]) => `ena-model-panel-${tab}`;
return (
  <div className="ena-model-tab-and-help">
    <div role="tablist" aria-label={copy.tabListLabel}>
      {MODEL_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          id={tabId(tab)}
          role="tab"
          aria-controls={panelId(tab)}
          aria-selected={activeTab === tab}
          tabIndex={activeTab === tab ? 0 : -1}
          onKeyDown={onTabKeyDown}
        >
          {copy.tabs[tab]}
        </button>
      ))}
    </div>
    <button
      type="button"
      aria-label={copy.helpLabel(activeTab)}
      onClick={() => setHelp(activeTab)}
    >
      ?
    </button>
    <section
      id={panelId(activeTab)}
      role="tabpanel"
      aria-labelledby={tabId(activeTab)}
    >
      {renderPanel(activeTab)}
    </section>
  </div>
);
```

- [ ] **Step 4: Implement scoped diagnostics**

Group diagnostics by scope, render error/warning counts with text and icons,
link each diagnostic to its field ID, expose bounded evidence, and require a
confirmation dialog before dispatching a suggested scientific patch.

```tsx
const localized = diagnostics.map((diagnostic) => ({
  diagnostic,
  message: localizeModelDiagnosticV3(copy, diagnostic),
}));
return (
  <ul className="ena-model-diagnostics" aria-label={copy.diagnosticsLabel}>
    {localized.map(({ diagnostic, message }) => (
      <li key={`${diagnostic.id}:${diagnostic.fieldPath ?? "global"}`} data-severity={diagnostic.severity}>
        <a href={diagnostic.fieldPath ? `#${fieldId(diagnostic.fieldPath)}` : undefined}>
          {message.summary}
        </a>
        <p>{message.detail}</p>
        {diagnostic.suggestedActions?.map((action) => (
          <button key={action.id} type="button" onClick={() => requestConfirmation(action)}>
            {copy.suggestedActions[action.id].label}
          </button>
        ))}
      </li>
    ))}
  </ul>
);
```

- [ ] **Step 5: Add keyboard and accessible-name tests**

Extend `tests/open-ena-model-tabs-keyboard.test.ts` with Help focus return,
diagnostic badge names, and no nested interactive elements. Assert the active
tab's visible question glyph is not a dead control.

```ts
assert.equal(container.querySelectorAll("button button").length, 0);
assert.equal(screen.getByRole("button", { name: "About Units settings" }).tabIndex, 0);
await user.keyboard("{Escape}");
assert.equal(document.activeElement, screen.getByRole("button", { name: "About Units settings" }));
```

- [ ] **Step 6: Run tab and existing keyboard tests**

Run: `node --import tsx --test tests/open-ena-model-v3-tabs.test.ts tests/open-ena-model-tabs-keyboard.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit the tab shell**

```bash
git add components/open-ena/model-v3/OpenEnaModelTabsV3.tsx components/open-ena/model-v3/OpenEnaModelDiagnosticsV3.tsx tests/open-ena-model-v3-tabs.test.ts tests/open-ena-model-tabs-keyboard.test.ts
git commit -m "feat: add accessible Models v3 tabs"
```

### Task 3: Implement Units and the four functional toolbar buttons

**Files:**
- Create: `components/open-ena/model-v3/OpenEnaUnitsPanelV3.tsx`
- Modify: `components/open-ena/OpenEnaOfficialModelControls.tsx`
- Modify: `components/open-ena/OpenEnaGroupDisplayControls.tsx`
- Test: `tests/open-ena-model-v3-units-panel.test.ts`
- Test: `tests/open-ena-group-display-controls.test.ts`

- [ ] **Step 1: Write failing toolbar semantics tests**

```ts
test("Units toolbar exposes four real actions with correct pressed state", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, props));
  assert.match(markup, /aria-label="Collapse all group option panels"/u);
  assert.match(markup, /aria-label="Open all group display options"/u);
  assert.match(markup, /aria-label="Hide all group layers"/u);
  assert.match(markup, /aria-label="Exclude group configuration"/u);
  assert.doesNotMatch(markup, /aria-label="Hide all group layers"[^>]*disabled/u);
});
```

- [ ] **Step 2: Run Units tests**

Run: `node --import tsx --test tests/open-ena-model-v3-units-panel.test.ts tests/open-ena-group-display-controls.test.ts`
Expected: FAIL because the panel and disclosure command are absent.

- [ ] **Step 3: Extend the icon-button contract**

Add an open-eye glyph, optional `ariaPressed`, optional described-by ID, and
dynamic title/label. Keep action icons unpressed. Render native disabled only
when a real action is inapplicable.

```tsx
export type OpenEnaOfficialIconName =
  | "add"
  | "collapse"
  | "mean"
  | "visibility"
  | "show"
  | "exclude"
  | "reset";

export function OpenEnaOfficialIconButton(props: {
  icon: OpenEnaOfficialIconName;
  ariaLabel: string;
  title: string;
  ariaPressed?: boolean;
  describedBy?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-pressed={props.ariaPressed}
      aria-describedby={props.describedBy}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">{iconGlyph(props.icon)}</svg>
    </button>
  );
}
```

- [ ] **Step 4: Add controlled disclosure commands**

```ts
export interface GroupDisclosureCommandV3 {
  revision: number;
  action: "collapse-all" | "open-all-options";
}
```

`OpenEnaGroupDisplayControls` reconciles current Group IDs, closes/opens only
top-level details, preserves every checkbox, and leaves nested Unit disclosures
unchanged.

- [ ] **Step 5: Implement the Units panel**

Render ordered Unit fields, Unit/Group counts, stable-Group diagnostics,
Create Sample/Group field, Means negative/positive levels and direction, Group
cards, and all four toolbar handlers. Hide/restore dispatches presentation
actions. Exclude dispatches the scientific action and shows Undo; it does not
change Means to SVD.

```tsx
<div role="toolbar" aria-label={copy.groupToolbar}>
  <OpenEnaOfficialIconButton icon="collapse" ariaLabel={copy.collapseGroups} onClick={collapseAll} />
  <OpenEnaOfficialIconButton icon="mean" ariaLabel={copy.openGroupOptions} onClick={openAll} />
  <OpenEnaOfficialIconButton
    icon={allGroupsSuppressed ? "show" : "visibility"}
    ariaLabel={allGroupsSuppressed ? copy.restoreGroups : copy.hideGroups}
    ariaPressed={allGroupsSuppressed}
    onClick={() => dispatch({ type: allGroupsSuppressed ? "restore-group-visibility" : "hide-all-groups" })}
  />
  <OpenEnaOfficialIconButton
    icon="exclude"
    ariaLabel={copy.excludeGroup}
    disabled={!draft.groupColumn}
    onClick={() => dispatch({ type: "exclude-group-configuration" })}
  />
</div>
```

- [ ] **Step 6: Add exact restore and invalid Means tests**

Start with different per-Group visibility settings, hide all, restore, and
assert exact settings return. Exclude Group while Means is selected and assert
the draft remains Means, Group/contrast is empty, status is invalid, and result
is stale.

```ts
const restored = reduce(reduce(stateWithMixedGroupVisibility, {
  type: "hide-all-groups",
}), { type: "restore-group-visibility" });
assert.deepEqual(restored.display.standard.groups, stateWithMixedGroupVisibility.display.standard.groups);
const excluded = reduce(meansState, { type: "exclude-group-configuration" });
assert.equal(excluded.drafts.standard.rotation.type, "means");
assert.equal(excluded.drafts.standard.groupColumn, null);
assert.equal(excluded.resultStatus, "stale");
```

- [ ] **Step 7: Run Units and group suites**

Run: `node --import tsx --test tests/open-ena-model-v3-units-panel.test.ts tests/open-ena-group-display-controls.test.ts tests/open-ena-group-contrast-workspace.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit Units controls**

```bash
git add components/open-ena/model-v3/OpenEnaUnitsPanelV3.tsx components/open-ena/OpenEnaOfficialModelControls.tsx components/open-ena/OpenEnaGroupDisplayControls.tsx tests/open-ena-model-v3-units-panel.test.ts tests/open-ena-group-display-controls.test.ts
git commit -m "feat: implement Units model toolbar"
```

### Task 4: Implement Horizons and the trajectory-order editor

**Files:**
- Create: `components/open-ena/model-v3/OpenEnaHorizonsPanelV3.tsx`
- Create: `components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3.tsx`
- Test: `tests/open-ena-model-v3-horizons-panel.test.ts`

- [ ] **Step 1: Write failing Horizons surface tests**

```ts
test("Horizons removes unavailable controls and shows shared-Horizon structure", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaHorizonsPanelV3, trajectoryProps));
  assert.match(markup, /Horizon identity/u);
  assert.match(markup, /Trajectory step order/u);
  assert.match(markup, /shared Horizons/u);
  assert.doesNotMatch(markup, /Transmodal/u);
  assert.doesNotMatch(markup, /Hide .* horizons|Exclude .* horizons/u);
});
```

- [ ] **Step 2: Run Horizons tests**

Run: `node --import tsx --test tests/open-ena-model-v3-horizons-panel.test.ts`
Expected: FAIL because the panel/editor are absent.

- [ ] **Step 3: Implement the reusable order editor**

Support Sort by fields and Use source order. Each explicit key renders field,
number/date/datetime/ordered-category/text comparator controls, direction,
remove, and keyboard reorder. Source confirmation shows dataset short hash,
row count, relevant fields, and confirmation version. It dispatches no
confirmation until the user accepts the visible statement.

```tsx
<fieldset>
  <legend>{label}</legend>
  <label><input type="radio" checked={mode === "columns"} onChange={selectColumns} />{copy.sortByFields}</label>
  <label><input type="radio" checked={mode === "source"} onChange={selectSource} />{copy.useSourceOrder}</label>
  {mode === "columns" ? keys.map((key, index) => (
    <OrderKeyRowV3 key={key.id} value={key} index={index} onChange={changeKey} onRemove={removeKey} />
  )) : (
    <SourceOrderConfirmationV3
      datasetSha256={datasetSha256}
      rowCount={rowCount}
      relevantColumns={relevantColumns}
      onConfirm={confirmSourceOrder}
    />
  )}
</fieldset>
```

- [ ] **Step 4: Implement the Horizons panel**

Render the field-path editor, counts, Unit by Horizon table, shared-Horizon
information, single-row/extreme-Horizon observations, and trajectory order only
for Separate/Accumulated. Show per-Unit sequence previews and unresolved ties.
Endpoint renders Horizon order as not applicable and preserves inactive draft
memory.

```tsx
return (
  <>
    <OpenEnaOfficialFieldPathEditor
      label={copy.horizonIdentity}
      selectedFields={draft.horizonColumns}
      options={fieldOptions}
      onChange={setHorizonColumns}
    />
    <HorizonStructureTableV3 rows={structure.rows} summary={structure.summary} />
    {draft.model === "EndPoint"
      ? <p>{copy.horizonOrderNotApplicable}</p>
      : <OpenEnaOrderPolicyEditorV3 scope="horizon" value={draft.horizonOrder} onChange={setHorizonOrder} />}
  </>
);
```

- [ ] **Step 5: Add stale confirmation and same-time-different-Unit tests**

Assert dataset/field changes expire source confirmation. Assert Week 1 shared
by different Units remains valid; two Week 1 Horizons for the same Unit show a
blocking tie and Add tie-breaker action.

```ts
assert.equal(confirmationMatchesDatasetV3(confirmation, changedDatasetBinding), false);
assert.equal(validateSharedWeekAcrossUnits().some((entry) => entry.severity === "error"), false);
assert.equal(validateDuplicateWeekWithinUnit().some(
  (entry) => entry.id === "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE",
), true);
```

- [ ] **Step 6: Run Horizons and order tests**

Run: `node --import tsx --test tests/open-ena-model-v3-horizons-panel.test.ts tests/open-ena-model-v3-ordering.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Horizons**

```bash
git add components/open-ena/model-v3/OpenEnaHorizonsPanelV3.tsx components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3.tsx tests/open-ena-model-v3-horizons-panel.test.ts
git commit -m "feat: configure ENA Horizons and trajectories"
```

### Task 5: Implement Windows, finite/Infinity extents, weighting, and rotation

**Files:**
- Create: `components/open-ena/model-v3/OpenEnaWindowsPanelV3.tsx`
- Test: `tests/open-ena-model-v3-windows-panel.test.ts`

- [ ] **Step 1: Write failing Standard/ONA surface tests**

```ts
test("Standard Windows exposes the approved complete parameter set", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, standardProps));
  for (const label of [
    "EndPoint",
    "Separate Trajectory",
    "Accumulated Trajectory",
    "Moving Stanza Window",
    "Conversation / Horizon Window",
    "Binary",
    "Frequency",
    "SVD",
    "Means",
    "Reference",
  ]) assert.match(markup, new RegExp(label, "u"));
  assert.doesNotMatch(markup, /Transmodal/u);
});

test("ONA Windows shows only its fixed ordered contract", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, onaProps));
  assert.match(markup, /Backward context/u);
  assert.match(markup, /Finite|Entire Horizon/u);
  assert.match(markup, /Row order/u);
  assert.match(markup, /forward is fixed at 0/iu);
  assert.match(markup, /SVD.*fixed for Ordered Network Analysis/u);
  assert.doesNotMatch(markup, /Conversation \/ Horizon|Means|Reference|Forward context/u);
});
```

- [ ] **Step 2: Run Windows tests**

Run: `node --import tsx --test tests/open-ena-model-v3-windows-panel.test.ts`
Expected: FAIL because the panel is absent.

- [ ] **Step 3: Implement model/window/extent controls**

Render all three Models and two Windows. Moving Stanza shows strict Backward and
Forward controls with Finite/Entire Horizon mode, integer text input, inline
parse diagnostics, exact natural-language interpretation, row-order editor, and
resource estimate. Conversation hides active extents and row order and explains
that all rows in the Horizon contribute. The ONA branch preserves its editable
finite/Entire-Horizon backward extent and explicit row-order editor, displays
forward `0` as a fixed contract, and exposes no forward input, Conversation,
trajectory, Standard weighting switch, Means, or Reference control.

```tsx
return (
  <>
    <select value={draft.model} onChange={setModel}>
      <option value="EndPoint">{copy.endpoint}</option>
      <option value="SeparateTrajectory">{copy.separateTrajectory}</option>
      <option value="AccumulatedTrajectory">{copy.accumulatedTrajectory}</option>
    </select>
    <select value={draft.windowType} onChange={setWindowType}>
      <option value="MovingStanzaWindow">{copy.movingStanza}</option>
      <option value="Conversation">{copy.conversationWindow}</option>
    </select>
    {draft.windowType === "MovingStanzaWindow"
      ? <WindowExtentsAndRowOrderV3 value={draft.movingStanza} onChange={setMovingStanza} />
      : <p>{copy.conversationExplanation}</p>}
  </>
);
```

- [ ] **Step 4: Implement Weighting and Projection/Rotation**

Render Binary/Frequency with value-domain help. Render SVD/Means/Reference.
Keep incompatible Means plus trajectory visible as an invalid selection with
buttons to choose SVD, choose Reference, or return to EndPoint; do not dispatch
automatically. Means links to Units contrast. Reference shows source fit, hash,
compatibility report, fixed centering, and target projection statement.

```tsx
return (
  <>
    <select value={draft.weighting} onChange={setWeighting}>
      <option value="binary">{copy.binary}</option>
      <option value="frequency">{copy.frequency}</option>
    </select>
    <select value={draft.rotation.type} onChange={setRotation}>
      <option value="svd">{copy.svd}</option>
      <option value="means">{copy.means}</option>
      <option value="reference">{copy.reference}</option>
    </select>
    {rotationConflict
      ? <RotationConflictV3 conflict={rotationConflict} onChoose={dispatchExplicitResolution} />
      : null}
  </>
);
```

- [ ] **Step 5: Add input and no-fallback tests**

Test blank, fraction, negative, finite, backward Infinity, forward Infinity,
both Infinity, and Conversation. Switch a Means Endpoint draft to trajectory
and assert Means remains selected and Run is blocked. Select an incompatible
Reference and assert it remains selected with no SVD fallback.

```ts
for (const value of ["", "-1", "1.5"]) {
  assert.equal(parseWindowExtentInputV3(value, "backward").status, "invalid");
}
assert.deepEqual(
  parseWindowExtentInputV3("Infinity", "forward"),
  { status: "valid", extent: { kind: "infinity" } },
);
assert.equal(trajectoryMeansDraft.rotation.type, "means");
assert.equal(compileResult.status, "invalid");
```

- [ ] **Step 6: Run Windows and compiler suites**

Run: `node --import tsx --test tests/open-ena-model-v3-windows-panel.test.ts tests/open-ena-model-v3-compiler.test.ts tests/open-ena-reference-v2-projection.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Windows**

```bash
git add components/open-ena/model-v3/OpenEnaWindowsPanelV3.tsx tests/open-ena-model-v3-windows-panel.test.ts
git commit -m "feat: configure Standard ENA model windows"
```

### Task 6: Implement Codes, true Exclude all, and family isolation

**Files:**
- Create: `components/open-ena/model-v3/OpenEnaCodesPanelV3.tsx`
- Test: `tests/open-ena-model-v3-codes-panel.test.ts`
- Modify: `tests/open-ena-analysis-family-control.test.ts`

- [ ] **Step 1: Write failing bulk-action and family tests**

```ts
test("Codes clearly separates Hide and Exclude all", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaCodesPanelV3, props));
  assert.match(markup, /Selected codes become the nodes/u);
  assert.match(markup, /aria-label="Hide all code nodes"/u);
  assert.match(markup, /aria-label="Exclude all selected Codes"/u);
});

test("Exclude all clears only the active family and never restores defaults", () => {
  const excluded = reduce(fixtureState, { type: "exclude-all-codes" });
  assert.deepEqual(excluded.drafts.standard.codes, []);
  assert.deepEqual(excluded.drafts.ona.codes, fixtureState.drafts.ona.codes);
  const reopened = createModelStateV3({
    datasetSha256: excluded.datasetSha256,
    drafts: excluded.drafts,
  });
  assert.deepEqual(reopened.drafts.standard.codes, []);
});
```

- [ ] **Step 2: Run Codes tests**

Run: `node --import tsx --test tests/open-ena-model-v3-codes-panel.test.ts tests/open-ena-analysis-family-control.test.ts`
Expected: FAIL because the panel and v3 family binding are absent.

- [ ] **Step 3: Implement the family selector and Code picker**

Switch only `activeFamily`, restore that family's independent draft, announce
the change, and never copy parameters. Render selected Code rows with type,
positive count, diagnostics, color, visibility, exclusion, drag handle, and
keyboard reorder. Manage Codes shows incompatible fields with reasons rather
than hiding them.

```tsx
return (
  <>
    <OpenEnaOfficialTwoEndedSwitch
      label={copy.analysisFamily}
      startLabel={copy.orderedNetwork}
      endLabel={copy.standardNetwork}
      endSelected={state.drafts.activeFamily === "standard"}
      onChange={(standard) => dispatch({
        type: "set-active-family",
        family: standard ? "standard" : "ona",
      })}
    />
    {selectedCodes.map((code) => <CodeRowV3 key={code.column} code={code} />)}
  </>
);
```

- [ ] **Step 4: Implement Hide/restore and Exclude all**

Hide stores/restores the exact visibility snapshot and changes no scientific
hash. Exclude all atomically sets the active family's Codes to an empty array,
marks the result stale/run obsolete, preserves other settings, reconciles only
the active ONA mask to the empty Code set, announces the action, and exposes
bounded Undo.

```tsx
return (
  <>
    <OpenEnaOfficialIconButton
      icon={allCodesSuppressed ? "show" : "visibility"}
      ariaLabel={allCodesSuppressed ? copy.restoreCodes : copy.hideCodes}
      ariaPressed={allCodesSuppressed}
      onClick={() => dispatch({ type: allCodesSuppressed ? "restore-code-visibility" : "hide-all-codes" })}
    />
    <OpenEnaOfficialIconButton
      icon="exclude"
      ariaLabel={copy.excludeAllCodes}
      disabled={activeCodes.length === 0}
      onClick={() => dispatch({ type: "exclude-all-codes" })}
    />
  </>
);
```

- [ ] **Step 5: Implement the true empty state**

Render “No codes selected,” the minimum-three requirement, preserved-settings
notice, Manage Codes, and Undo. Do not call sample/default Code inference from
render/effect code.

```tsx
{activeCodes.length === 0 ? (
  <section className="ena-model-empty" aria-labelledby="ena-codes-empty-title">
    <h3 id="ena-codes-empty-title">{copy.noCodesTitle}</h3>
    <p>{copy.minimumThreeCodes}</p>
    <p>{copy.otherSettingsPreserved}</p>
    <button type="button" onClick={openCodeManager}>{copy.manageCodes}</button>
    {undoAvailable ? <button type="button" onClick={undo}>{copy.undo}</button> : null}
  </section>
) : <CodeListV3 codes={activeCodes} />}
```

- [ ] **Step 6: Add per-Code and display-order tests**

Individual Hide changes display only; individual Exclude changes the active
draft and may block Run below three Codes. Drag and keyboard reorder change
display order only and do not change canonical/configuration hashes.

```ts
assert.equal(afterHide.scientificRevision, before.scientificRevision);
assert.equal(afterExclude.scientificRevision, before.scientificRevision + 1);
assert.equal(afterReorder.configurationSha256, before.configurationSha256);
assert.notDeepEqual(afterReorder.display.standard.codeOrder, before.display.standard.codeOrder);
```

- [ ] **Step 7: Run Codes and family suites**

Run: `node --import tsx --test tests/open-ena-model-v3-codes-panel.test.ts tests/open-ena-analysis-family-control.test.ts tests/open-ena-code-colors.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit Codes**

```bash
git add components/open-ena/model-v3/OpenEnaCodesPanelV3.tsx tests/open-ena-model-v3-codes-panel.test.ts tests/open-ena-analysis-family-control.test.ts
git commit -m "feat: implement Codes model controls"
```

### Task 7: Thread Code-graph visibility through every renderer

**Files:**
- Modify: `components/open-ena/OpenEnaPlot.tsx`
- Modify: `components/open-ena/OpenEnaInteractive3DPlot.tsx`
- Modify: `components/open-ena/OpenEna3DGroupContrast.tsx`
- Modify: `components/open-ena/OpenEnaGroupContrast.tsx`
- Modify: `components/open-ena/OpenEnaLongitudinalTrajectory.tsx`
- Modify: `components/open-ena/OpenEnaOrderedResultLayout.tsx`
- Modify: `components/open-ena/OpenEnaOrderedPlot.tsx`
- Modify: `components/open-ena/OpenEna3DOrderedResultLayout.tsx`
- Modify: `lib/open-ena/ordered-plot.ts`
- Modify: `lib/open-ena/plot3d.ts`
- Modify: `lib/open-ena/ordered-plot3d.ts`
- Test: `tests/open-ena-model-v3-code-visibility.test.ts`

- [ ] **Step 1: Write failing cross-renderer visibility tests**

```ts
for (const fixture of [
  standard2d,
  standard3d,
  groupContrast,
  longitudinal,
  ona2d,
  ona3d,
]) {
  test(`${fixture.name} hides only the Code graph`, () => {
    const hidden = fixture.render({ showCodeGraph: false });
    assert.equal(hidden.codeNodeCount, 0);
    assert.equal(hidden.codeEdgeCount, 0);
    assert.equal(hidden.unitOrTrajectoryLayerCount, fixture.visible.unitOrTrajectoryLayerCount);
    assert.deepEqual(hidden.frame, fixture.visible.frame);
  });
}
```

- [ ] **Step 2: Run renderer tests**

Run: `node --import tsx --test tests/open-ena-model-v3-code-visibility.test.ts`
Expected: FAIL because renderers lack `showCodeGraph`.

- [ ] **Step 3: Add the explicit presentation prop**

Add `showCodeGraph: boolean` to each renderer/compiler boundary. When false,
omit only Code-node, Code-label, undirected/directed edge, arrow, and self-loop
layers. Preserve units, means, intervals, trajectories, axes, frame, camera,
fitted coordinates, and node-layout overrides.

```tsx
export interface CodeGraphPresentationProps {
  showCodeGraph: boolean;
}

return (
  <svg>
    {showCodeGraph ? <CodeEdges edges={edges} /> : null}
    {showCodeGraph ? <CodeNodes nodes={nodes} /> : null}
    <UnitAndTrajectoryLayers {...unitLayerProps} />
    <Axes {...axisProps} />
  </svg>
);
```

- [ ] **Step 4: Add exact restoration tests**

Move a node, hide Codes, show Codes, and assert the moved coordinates return.
Preserve existing Show Networks and Show Labels preferences underneath the
global suppression snapshot.

```ts
const moved = moveNode(layout, "Evidence", { x: 0.4, y: -0.2 });
const hidden = renderWithPresentation(moved, { showCodeGraph: false });
const restored = renderWithPresentation(moved, { showCodeGraph: true });
assert.equal(hidden.codeNodes.length, 0);
assert.deepEqual(restored.codeNodes.find((node) => node.code === "Evidence"), {
  code: "Evidence",
  x: 0.4,
  y: -0.2,
});
```

- [ ] **Step 5: Run affected 2D/3D/ONA tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-code-visibility.test.ts
node --import tsx --test tests/open-ena-3d-view.test.ts tests/open-ena-group-contrast-plot.test.ts tests/open-ena-longitudinal-plot.test.ts tests/open-ena-ona-3d.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit renderer visibility**

```bash
git add components/open-ena/OpenEnaPlot.tsx components/open-ena/OpenEnaInteractive3DPlot.tsx components/open-ena/OpenEna3DGroupContrast.tsx components/open-ena/OpenEnaGroupContrast.tsx components/open-ena/OpenEnaLongitudinalTrajectory.tsx components/open-ena/OpenEnaOrderedResultLayout.tsx components/open-ena/OpenEnaOrderedPlot.tsx components/open-ena/OpenEna3DOrderedResultLayout.tsx lib/open-ena/ordered-plot.ts lib/open-ena/plot3d.ts lib/open-ena/ordered-plot3d.ts tests/open-ena-model-v3-code-visibility.test.ts
git commit -m "feat: hide Code graphs across ENA views"
```

### Task 8: Integrate the v3 Models editor with OpenEnaWorkspace

**Files:**
- Modify: `components/open-ena/OpenEnaWorkspace.tsx`
- Create: `components/open-ena/model-v3/OpenEnaImportPreviewV3.tsx`
- Modify: `lib/open-ena/client.ts`
- Test: `tests/open-ena-model-v3-workspace.test.ts`
- Modify: `tests/open-ena-official-model-tabs-parity.test.ts`

- [ ] **Step 1: Write failing workspace cutover tests**

```ts
test("the workspace delegates Models to v3 and contains no legacy unavailable controls", () => {
  const source = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
  assert.match(source, /<OpenEnaModelTabsV3/u);
  assert.doesNotMatch(source, /label="Horizon method"/u);
  assert.doesNotMatch(source, /label="Window horizon method"/u);
  assert.doesNotMatch(source, /title="Horizon-level hiding is not available/u);
});
```

- [ ] **Step 2: Run the intended red workspace tests**

Run: `node --import tsx --test tests/open-ena-model-v3-workspace.test.ts tests/open-ena-official-model-tabs-parity.test.ts`
Expected: FAIL because the workspace still owns the legacy panel markup.

- [ ] **Step 3: Replace only the Models render branch**

Initialize v3 state after dataset load/migration, compile on draft changes,
render `OpenEnaModelTabsV3`, build a plan only when ready, pass the plan to the
worker client, compare result hashes before accepting, abort obsolete runs, and
keep Data/Plot/Stats/AI panel ownership unchanged. Route side-effect-free v3
import results into `OpenEnaImportPreviewV3`: show a field-by-field diff before
replacing a draft, require an explicit Load configuration action for historical
results, and add References immutably without selecting them or changing
Rotation. Cancel and failed import leave drafts/results/registry byte-for-byte
unchanged and never start a worker.

```tsx
const [modelState, dispatchModel] = useReducer(modelStateReducerV3, initialModelState);
const compileResult = useStandardOrOnaCompileV3(dataset, datasetSha256, modelState.drafts);
const runModelV3 = async () => {
  if (!dataset || compileResult.status !== "ready") return;
  const plan = await buildExecutionPlanV3(dataset, datasetSha256, compileResult, selectedReference);
  dispatchModel({ type: "mark-running", executionPlanSha256: plan.header.executionPlanSha256 });
  const result = await analyzePlanInWorkerV3(plan, { signal: runAbortController.signal });
  dispatchModel({ type: "accept-result", result });
};
return mode === "model"
  ? <OpenEnaModelTabsV3 state={modelState} compileResult={compileResult} dispatch={dispatchModel} />
  : renderNonModelMode();
```

- [ ] **Step 4: Remove legacy auto-reconciliation**

Remove render/effect paths that auto-select Codes, automatically reconcile
Means to SVD, or pass flat config directly to the worker. Retain legacy
read/migration facades for imported artifacts.

```ts
// Delete calls to officialComparisonRotation from model-change handlers.
// The only valid run path is:
if (compileResult.status === "ready") {
  return buildExecutionPlanV3(dataset, datasetSha256, compileResult, selectedReference);
}
return null;
```

- [ ] **Step 5: Add stale, obsolete, late-result, and Undo integration tests**

Use an injected worker promise: start run A, scientifically edit to plan B,
resolve A, and assert it never becomes current. Perform display edit during run
B and assert it does not cancel. Exclude/Undo Codes and Group and verify exact
family-bound state. Preview a config import and cancel, then accept it and
assert no worker starts; import a Reference and assert the registry grows while
selection/Rotation do not change; fail a hostile import and assert all three
workspace stores remain unchanged.

```ts
worker.resolve(planAResult);
assert.notEqual(workspace.currentResult?.binding.executionPlanSha256, planAHash);
dispatch({ type: "hide-all-codes" });
assert.equal(abortCalls, 0);
dispatch({ type: "exclude-all-codes" });
assert.equal(abortCalls, 1);
```

- [ ] **Step 6: Run workspace and existing functional tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-workspace.test.ts tests/open-ena-official-model-tabs-parity.test.ts
node --import tsx --test tests/open-ena-model-v3-import.test.ts tests/open-ena-functional.test.ts tests/open-ena-trajectory-sample.test.ts tests/open-ena-ona-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the workspace cutover**

```bash
git add components/open-ena/OpenEnaWorkspace.tsx components/open-ena/model-v3/OpenEnaImportPreviewV3.tsx lib/open-ena/client.ts tests/open-ena-model-v3-workspace.test.ts tests/open-ena-official-model-tabs-parity.test.ts
git commit -m "feat: switch Models workspace to v3"
```

### Task 9: Finish CSS, localization, and accessibility contracts

**Files:**
- Modify: `app/globals.css`
- Modify: `lib/open-ena-i18n.ts`
- Test: `tests/open-ena-model-v3-i18n.test.ts`
- Modify: `tests/open-ena-accessibility-regressions.test.ts`
- Modify: `tests/open-ena-official-model-tabs-parity.test.ts`

- [ ] **Step 1: Write failing locale-key and visual-contract tests**

```ts
test("every Open ENA locale exposes the Models v3 copy contract", () => {
  const baseline = Object.keys(openEnaCopy.en.modelV3).sort();
  for (const [locale, copy] of Object.entries(openEnaCopy)) {
    assert.deepEqual(Object.keys(copy.modelV3).sort(), baseline, locale);
    assert.equal(JSON.stringify(copy.modelV3).includes("undefined"), false);
  }
});

test("active tabs retain a flush top indicator without a gray spacer", () => {
  const tabsRule = cssRule(modelCss, ".ena-model-tabs");
  const indicatorRule = cssRule(modelCss, ".ena-model-tabs button::before");
  assert.match(tabsRule, /border-top:\s*0;/u);
  assert.match(indicatorRule, /top:\s*0;/u);
  assert.doesNotMatch(tabsRule, /padding-top:\s*[1-9]/u);
});
```

- [ ] **Step 2: Run i18n/accessibility/parity tests**

Run: `node --import tsx --test tests/open-ena-model-v3-i18n.test.ts tests/open-ena-accessibility-regressions.test.ts tests/open-ena-official-model-tabs-parity.test.ts`
Expected: FAIL because v3 copy and CSS states are incomplete.

- [ ] **Step 3: Add the complete locale shape**

Define one typed English `modelV3` contract containing tab help, diagnostics,
empty states, buttons, Undo, stale/obsolete/current statuses, Window
interpretations, order editors, Means direction, Reference compatibility, and
resources. Add complete values to every existing locale; do not use component
hard-coded English as fallback.

```ts
export interface OpenEnaModelV3Copy {
  tabs: Record<"units" | "horizons" | "windows" | "codes", string>;
  actions: {
    collapseGroups: string;
    openGroupOptions: string;
    hideGroups: string;
    restoreGroups: string;
    excludeGroup: string;
    hideCodes: string;
    restoreCodes: string;
    excludeCodes: string;
    undo: string;
  };
  status: Record<"invalid" | "ready" | "running" | "current" | "stale" | "error", string>;
  windows: Record<string, string>;
  ordering: Record<string, string>;
  rotation: Record<string, string>;
  diagnostics: Record<string, string>;
  diagnosticMessages: Record<ModelDiagnosticIdV3, { summary: string; detail: string }>;
  suggestedActions: Record<ModelSuggestedActionIdV3, { label: string; confirmation: string }>;
}
```

`localizeModelDiagnosticV3` must look up the exported diagnostic ID and format
only named, bounded message parameters. Missing IDs are a type/test failure;
the component must not render compiler English as a locale fallback. The same
rule applies to suggested-action labels and confirmation text.

- [ ] **Step 4: Add responsive and focus CSS**

Keep the active indicator at top zero, remove vacated switch spacing, style
diagnostic badges with icon/text, provide at least 32px icon targets, strong
focus-visible rings, wrapping toolbars, horizontally scrollable field paths and
tables, 200-percent zoom reflow, and reduced-motion behavior.

```css
.ena-model-tabs { border-top: 0; padding-top: 0; }
.ena-model-tabs button::before { top: 0; }
.ena-official-icon-button { min-width: 32px; min-height: 32px; }
.ena-official-icon-button:focus-visible { outline: 3px solid var(--ena-accent-strong); }
.ena-model-toolbar { display: flex; flex-wrap: wrap; }
@media (prefers-reduced-motion: reduce) {
  .ena-model-control-content * { scroll-behavior: auto; transition-duration: 0.01ms; }
}
```

- [ ] **Step 5: Complete accessibility assertions**

Test no nested buttons, pressed-state labels, disabled reasons,
`aria-describedby` for errors, polite live summaries, dialog focus return,
keyboard Code reorder, Help Escape, and non-color-only diagnostic text.

```ts
assert.equal(container.querySelectorAll("button button").length, 0);
assert.equal(
  screen.getByRole("button", { name: /Restore code-node visibility/u }).getAttribute("aria-pressed"),
  "true",
);
assert.match(screen.getByRole("status").textContent ?? "", /2 errors and 1 warning/u);
assert.notEqual(screen.getByText(/Error:/u), null);
```

- [ ] **Step 6: Run all Plan 4 tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-*.test.ts
node --import tsx --test tests/open-ena-accessibility-regressions.test.ts tests/open-ena-model-tabs-keyboard.test.ts tests/open-ena-official-model-tabs-parity.test.ts
npm run typecheck:app
npm run test:app
```

Expected: PASS.

- [ ] **Step 7: Commit UI completion**

```bash
git add app/globals.css lib/open-ena-i18n.ts tests/open-ena-model-v3-i18n.test.ts tests/open-ena-accessibility-regressions.test.ts tests/open-ena-official-model-tabs-parity.test.ts
git commit -m "feat: finish accessible Models v3 UI"
```

## Plan 4 completion checkpoint

- The real workspace uses the v3 reducer/compiler/plan worker.
- Horizons and Windows have no Transmodal controls or vacated space.
- Every visible bulk icon is functional.
- Exclude all really empties the active configuration.
- Hide/restore is presentation-only and exact across all renderers.
- Standard and ONA drafts remain independent.
- No automatic scientific fallback remains.
- All app tests and typecheck pass before browser acceptance.
