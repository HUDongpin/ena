# Open ENA Model Bulk Controls Design

Date: 2026-09-02  
Status: Approved behavior, pending written-spec review  
Route: `/[locale]/open-ena`  
Scope: Model tabs `Units`, `Horizons`, `Windows`, and `Codes`

## Goal

Remove two unavailable horizon-method selectors and make the six bulk icon controls shown in the Units and Codes panels perform real, testable work. Preserve the fitted ENA/ONA result for display-only actions, and make model-changing exclusion actions explicitly invalidate the current result until the configuration is repaired and rebuilt.

## Current Problem

- Horizons and Windows each render a disabled `Transmodal / Standard` switch even though Open ENA supports only the current Standard path. The controls occupy space without offering a choice.
- Units renders `Collapse all groups`, `Open mean options`, `Hide all groups`, and `Exclude all groups`. The first two have no click handlers; the last two are hard-disabled.
- Codes renders `Hide all codes` and `Exclude all codes`. Both are hard-disabled and have no click handlers.
- The product already has identity-keyed group display settings, hidden-unit state, stale-result detection, and configuration validation. The new behavior should extend those existing paths rather than introduce a second model or analysis state.

## Approved Interaction Semantics

### Remove unavailable method switches

- Remove the `Horizon method` switch from Horizons.
- Remove the `Window horizon method` switch from Windows.
- Keep the reusable two-ended switch component because Codes still uses it for the functional `Ordered Network / Standard Network` selection.
- Do not add substitute text or empty spacing. The next real control moves into the vacated space.
- Do not add Transmodal analysis support in this change.

### Units toolbar

#### Collapse all groups

- Close every expanded top-level group disclosure in the Units panel.
- Do not change any group display setting, hidden-unit selection, fitted result, inference, plot state, or model configuration.
- Keep keyboard focus on the toolbar button after the action.

#### Open mean options

- Open every top-level group disclosure so that `Show mean`, confidence-interval, outlier-interval, and related group settings are visible.
- Do not automatically change any checkbox value.
- Keep keyboard focus on the toolbar button after the action.

#### Hide all groups / Show all groups

- Implement this as a reversible display-only toggle.
- `Hide all groups` sets `showUnitPoints=false` and `showMean=false` for every currently available comparison group.
- Confidence-interval, outlier-interval, and `Include hidden points` preferences remain stored; they are suppressed while the mean is hidden and return with their previous values.
- This action hides group observations and group-summary overlays. It does not hide the code/network layer, alter individual hidden-unit membership, refit ENA/ONA, mutate canonical coordinates, or change inferential results.
- Before hiding, preserve each group's exact `showUnitPoints` and `showMean` values in a snapshot bound to the current group-display result key.
- When all groups are hidden, the same button becomes `Show all groups`, uses a visible-eye icon, and restores the exact snapshot. If the result key changed and the snapshot is no longer valid, restore the default visible state for the current groups instead of applying stale group names.
- Expose the toggle state with an accurate accessible name, title, and `aria-pressed` value; do not rely on icon color alone.

#### Exclude all groups

- Clear `config.groupColumn` through the existing `updateConfig` path.
- Reconcile rotation using the same helper used by the Create Sample group selector, so a comparison-dependent mean rotation is not left active after grouping is removed.
- Do not delete source rows, result bytes, or user data.
- If a completed result exists, the existing config/result comparison marks it stale and the rail reports `Rebuild`.
- Model execution remains unavailable until the user selects a valid group field through `Create Sample` and all existing validation requirements pass.
- The action disables when there is no group column to exclude or while source/model work is busy.

### Codes toolbar

#### Hide all codes / Show all codes

- Implement this as a reversible display-only toggle backed by one workspace-level `showCodeGraph` state.
- Hiding codes suppresses code nodes, code labels, and every edge whose endpoints are code nodes. It leaves unit points, group summaries, confidence/outlier guides, trajectories, axes, and Data View data intact.
- The toggle must apply consistently to all result presenters reachable from this workspace: standard ENA 2D, standard ENA 3D, endpoint group comparison, longitudinal ENA, ONA 2D, and ONA 3D.
- Preserve the existing `showNetworks` and `showLabels` preferences while codes are hidden. Showing codes again reveals the code graph according to those pre-existing preferences.
- The button becomes `Show all codes` with a visible-eye icon while hidden and exposes `aria-pressed=true` for the hidden state.
- This action must not alter `config.codes`, the fitted result, result hashes, node-layout overrides, inference, or export provenance.
- Disable the action when no completed current result exists, the result is stale, or model work is busy.

#### Exclude all codes

- Clear `config.codes` through the existing `updateConfig` path.
- For ONA, allow the existing configuration reconciliation to reduce the directional mask to the empty code set.
- Do not delete dataset columns or source values.
- The existing validator must prevent execution with an empty code set, and an existing completed result becomes stale with rail status `Rebuild`.
- The user restores codes through `Manage Codes`; after a valid set is restored, normal execution is available again.
- Disable the action when the selected code set is already empty or while source/model work is busy.

## Architecture

### Workspace state and handlers

`OpenEnaWorkspace` remains the owner of model configuration and cross-presenter display state.

- Add a monotonic group-disclosure command containing a revision and action (`collapse` or `open-mean-options`). Pass it into `OpenEnaGroupDisplayControls`.
- Add a result-keyed snapshot for bulk group visibility, stored outside the scientific result. Bulk handlers update `groupDisplaySettingsByGroup` using the existing `resolveOpenEnaGroupDisplayOptions` defaults.
- Add `showCodeGraph`, defaulting to `true`, as display-only workspace state and pass it to every active renderer.
- Exclusion handlers call `updateConfig`; they must not write directly to `result`, `resultConfig`, analysis outputs, or inference state.
- Reset any stale group-visibility snapshot when `groupDisplayResultKey` changes. The code-graph display preference may persist across tab changes but must never change result identity.

### Group disclosure ownership

`OpenEnaGroupDisplayControls` will control the open state of its top-level group `<details>` elements.

- Ordinary user toggles update local open-group state.
- A new disclosure command closes all groups or opens all current groups.
- Reconcile local open-group names when the `groups` prop changes so removed groups cannot remain in state.
- Nested unit-visibility disclosures are not affected by the toolbar commands.

### Renderer contract

Add an explicit `showCodeGraph` presentation prop to the shared plotting boundaries rather than mutating result data.

- When false, SVG renderers omit the code-node group and the code-edge group.
- Plotly compilers omit code-node traces and code-edge traces while retaining non-code traces and the canonical frame.
- ONA directed-arrow and self-loop geometry is suppressed together with its code nodes.
- Node drag state and fitted coordinates remain stored so showing codes restores the same layout.
- Exported scientific/model data remains unchanged. Presentation exports may record the display flag where they already record other plot visibility settings, but it has no inference or approval effect.

### Icon-button contract

Extend `OpenEnaOfficialIconButton` only as needed for real state:

- Support `aria-pressed` for the two hide/show toggles.
- Add a visible-eye glyph for the show action; retain the current slashed-eye glyph for hide.
- Keep action buttons (`collapse`, `open mean options`, `exclude`) unpressed.
- All icon-only buttons retain accessible names and native disabled behavior.

## State and Safety Rules

- Display-only actions never call `updateConfig`, rebuild jENA, replace `result`, change inference, or alter provenance hashes.
- Exclusion actions always call `updateConfig`, which cancels an in-flight model run, resets the active view to 2D under the existing contract, and lets the current stale-result logic govern downstream AI/inference availability.
- Empty grouping or code selections are recoverable configuration states, not data deletion.
- Existing results may remain visible for comparison but must be labeled stale through the current `Rebuild` status and must not feed current inference or AI interpretation.
- No new backend API, persistence store, cookie, credential, or database change is required.

## Disabled and Empty States

- Group disclosure and group-hide controls require a current, non-stale endpoint group contrast with at least one group.
- Code-hide requires a current, non-stale result containing codes.
- Exclude-group depends on the draft configuration having a group column, not on a completed result.
- Exclude-codes depends on the draft configuration having at least one selected code, not on a completed result.
- Busy source/model states disable every affected model mutation.
- A stale visibility snapshot must never be applied to a new result identity.

## Testing Strategy

Implementation will follow red-green-refactor.

### Static and component contracts

- Prove the Horizons and Windows method switches are absent while the Codes network-type switch remains.
- Prove all six toolbar buttons have handlers and are no longer unconditionally disabled.
- Render group controls with disclosure commands and verify collapse/open behavior without changing settings.
- Verify icon-button `aria-pressed`, dynamic accessible names, titles, and visible/slashed eye glyphs.

### Pure state tests

- Hide and restore all groups while preserving exact per-group visibility preferences and dependent CI/outlier preferences.
- Reject or ignore a visibility snapshot whose result key does not match.
- Excluding groups clears only the grouping configuration and reconciles rotation.
- Excluding codes clears only the selected codes and reconciles an ONA directional mask.
- Display-only operations leave the frozen fitted result, result hash, inference, and node layout unchanged.

### Renderer tests

- For standard 2D, standard 3D, group comparison, longitudinal ENA, ONA 2D, and ONA 3D, assert that `showCodeGraph=false` removes code nodes and incident/code edges while keeping the appropriate unit, summary, trajectory, and axis layers.
- Re-enable the flag and verify the original code graph and moved-node layout return.

### Real browser acceptance

Using the repository-managed authenticated Open ENA browser smoke:

1. Load the teaching sample and build a current model.
2. Confirm Horizons and Windows no longer contain either unavailable method switch.
3. Expand group panels, use Collapse All, and verify every top-level group closes.
4. Use Open Mean Options and verify every top-level group opens without checkbox mutation.
5. Hide and show groups; verify plot layers change and the exact previous per-group visibility settings return without a model rerun.
6. Hide and show codes in 2D and 3D; verify code nodes/edges disappear and return while unit/group layers, result identity, and node positions remain stable.
7. Exclude all groups; verify the group draft is empty, the existing result becomes stale, `Rebuild` is announced, execution is disabled, and Create Sample can restore the configuration.
8. Exclude all codes; verify code rows empty, the result becomes stale, execution is disabled, and Manage Codes can restore a valid selection.
9. Repeat the code-visibility contract for ONA 2D/3D or bind equivalent repository renderer tests when the full ONA browser fixture is unavailable.
10. Confirm no console errors, page errors, horizontal overflow, or accessibility-name regressions.

### Completion gates

- Focused tests for Model tabs, group display, 2D/3D/ONA renderers, and browser-smoke contracts.
- The real browser smoke for the affected workflow.
- `npm run verify` with zero failures; pass, fail, and skip counts reported separately.

## Non-Goals

- Implementing Transmodal horizons.
- Adding individual per-row group or code exclusion controls.
- Reordering groups or codes.
- Refitting or changing ENA/ONA mathematics for display-only actions.
- Hiding or deleting source dataset columns.
- Committing, pushing, deploying, or changing production credentials as part of the later implementation unless separately requested.

## Acceptance Summary

The change is accepted when the unavailable Horizons/Windows switches are gone; all six toolbar icons provide the approved behavior; hide/show actions are reversible, display-only, and consistent across render families; exclude actions clear only their intended model configuration and trigger the existing stale/validation path; and focused, browser, and full repository verification succeed without conflating local evidence with GitHub or deployment state.
