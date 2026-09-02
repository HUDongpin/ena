# Open ENA Code Node Color Presets Design

**Status:** Approved in conversation on 2026-09-02

**Scope:** Replace the native code-node color input in the Open ENA Model → Codes panel with an official-webENA-inspired Color Presets dialog.

**Evidence boundary:** This specification governs presentation controls only. It does not claim or change computational, statistical, numerical, or scientific parity with official webENA.

## Problem

The current Codes panel renders one native browser `<input type="color">` after every selected code. The control changes the node color correctly, but its browser-owned popup is visually inconsistent with the dense Open ENA workbench and offers no reusable palette.

The approved target is the Color Presets interaction shown in the user-provided reference image and observed in official webENA v2.0.7 on 2026-09-02. The target has six paired presets, one selected-preset treatment, a custom saturation/value field, a hue rail, Primary and Complementary hex values, and transactional Cancel/OK actions.

## Authoritative Evidence

The design is based on:

1. the user-provided current-state image of the Open ENA code rows and native color popup;
2. the user-provided official Color Presets reference image;
3. a current authenticated, read-only observation of the official webENA v2.0.7 Model workbench at a 1280 × 720 viewport on 2026-09-02;
4. the public official webENA frontend behavior and source declarations for the preset values, draft selection, Cancel, OK, and `secondaryColor` fallback.

No account state, cookies, credentials, private set identifiers, group labels, unit identifiers, row-level data, sample statistics, or authenticated reference screenshots are stored in this document or in project artifacts.

The official implementation establishes an important semantic boundary: `secondaryColor` belongs to unit/group comparison presentation. It is used when two plotted units or groups have the same primary color so that the secondary plot and signed comparison edges remain distinguishable. A code node has no equivalent primary-versus-secondary group role. Therefore this design does not add a second rendered color channel to code nodes.

## Approved Approach

Implement the complete paired-preset and custom-color dialog, but commit only Primary as the code node's rendered color.

Complementary remains a workspace-local pairing reference. It is retained while the current Open ENA browser workspace is mounted so reopening a code's picker preserves the user's paired choice, but it does not enter:

- the ENA or ONA analysis configuration;
- node fill, node outline, node halo, labels, or edge colors;
- jENA inputs or result identity;
- inference, statistics, model freshness, or recomputation decisions;
- analysis bundle, participant bundle, model JSON, CSV, image metadata, or other research exports.

This preserves the existing scientific and export contract while adopting the requested official Color Presets interaction.

## Exact Preset Palette

The six pairs are frozen in the official row-major order:

| Index | Primary | Complementary |
|---:|---|---|
| 1 | `#cc423a` | `#56bd7c` |
| 2 | `#218ebf` | `#ef691b` |
| 3 | `#9d5dbb` | `#fbc848` |
| 4 | `#56bd7c` | `#d0386c` |
| 5 | `#f18e9f` | `#9a9eab` |
| 6 | `#ff8c39` | `#346b88` |

The values are presentation tokens, not positive/negative, treatment/control, or inferential meanings.

## Component Boundaries

### `lib/open-ena/code-color-presets.ts`

Own pure, reusable color behavior:

- the immutable six-pair preset tuple;
- six-digit hexadecimal normalization and validation;
- RGB ↔ HSV conversion with bounded finite inputs;
- conversion from pointer/keyboard saturation, value, and hue to a six-digit lowercase hex color;
- exact pair matching for selected-preset state;
- deterministic black-or-white complementary reference for a custom Primary that has no saved companion or exact preset match.

The black-or-white reference must choose whichever of `#000000` and `#ffffff` has the higher WCAG contrast ratio against Primary. It is a UI pairing reference only and must not be described as a scientific or official-webENA default.

### `components/open-ena/OpenEnaCodeColorPicker.tsx`

Own one modal editing transaction. Its public interface should remain small and controlled:

```ts
interface OpenEnaCodeColorPair {
  primary: string;
  complementary: string;
}

interface OpenEnaCodeColorPickerProps {
  code: string;
  value: OpenEnaCodeColorPair;
  copy: OpenEnaCodeColorPickerCopy;
  onCancel: () => void;
  onConfirm: (value: OpenEnaCodeColorPair) => void;
}
```

The component clones `value` into local draft state when it opens. It never invokes `onConfirm` while a user is selecting a preset, dragging in the custom field, moving the hue control, editing a hex value, switching the active custom target, pressing Escape, or cancelling.

### `components/open-ena/OpenEnaWorkspace.tsx`

Continue to own the existing `codeColors: Record<string, string>` map as the sole rendered and exported code palette. Add a separate workspace-local complementary map and one active-code key for the dialog.

Opening a code picker resolves its value in this order:

1. Primary is `codeColorFor(codeColors, code)`.
2. Complementary is the saved workspace-local value when valid.
3. Otherwise, if Primary exactly matches a preset Primary, use that pair's Complementary.
4. Otherwise, use the deterministic higher-contrast black-or-white reference.

Confirming performs one presentation-state update:

- write the normalized Primary through the existing `updateCodeColor` path;
- write the normalized Complementary only to the workspace-local complementary map;
- close the dialog and restore focus to the triggering code-color button.

Loading a different source dataset resets both the existing Primary map and the new complementary map. Changing a code color must not call `updateConfig`, rebuild the model, clear results, change result provenance, or mark a result stale.

## Codes Row Trigger

Replace the visible native color input with a real button while preserving the compact row cadence:

- `28 × 28px` minimum pointer and keyboard target;
- a compact `20 × 20px` current-Primary swatch inside the target;
- visible focus ring using existing Open ENA accent tokens;
- tooltip and accessible name `Choose color for {code}` in English, with localized equivalents;
- `aria-haspopup="dialog"` and `aria-expanded` bound to the active picker;
- one stable test attribute identifying the code without placing it in a global DOM id;
- disabled behavior follows the existing loading/source-busy boundary.

The trigger must remain visually subordinate to the code name and must not increase the existing row height merely to imitate a large palette control.

## Dialog Layout and Visual System

### Desktop

Use a native modal `<dialog>` promoted with `showModal()` so it owns the top layer, focus isolation, Escape behavior, and a real backdrop. The content target is approximately the observed official geometry:

- `348px` intended desktop width;
- about `329px` natural content height;
- white surface, `4px` corner radius, restrained shadow;
- centered in the viewport, not clipped by the left control panel;
- left preset region about `165px` wide;
- right custom-color region about `180px` wide;
- compact `Helvetica Neue`, Helvetica, Arial, sans-serif typography consistent with the Model workbench.

The dialog must use Open ENA Baby Blue for its primary `OK` action rather than importing the official site's teal brand into the local product.

### Narrow viewports

At or below `520px`, use one column:

1. Color Presets;
2. Custom Color;
3. value fields;
4. actions.

The dialog must fit within `calc(100vw - 24px)`, stay within the visible viewport through contained scrolling, and produce no document-level horizontal overflow at `390 × 844`.

## Preset Controls

Render the presets as a two-column, three-row grid on desktop. Each pair is one button:

- `75 × 45px` target matching the observed cadence;
- Primary circle: `40 × 40px`;
- Complementary circle: `34 × 34px`;
- circles overlap and each has a `3px` white boundary;
- the selected pair has a neutral gray rounded background approximately `#dbdbdb` with a pill-like radius;
- unselected pairs have a transparent background;
- `aria-pressed` exposes selected state;
- accessible names identify both values, for example `Preset 1: Primary #cc423a, Complementary #56bd7c`.

Clicking or keyboard-activating a preset updates both draft values and keeps the dialog open. A preset is selected only when both normalized draft values exactly match the pair.

## Custom Color Editing

The custom area has one shared editor and two editable targets: Primary and Complementary.

### Active target

- Primary is active when the dialog opens.
- Clicking the Primary or Complementary swatch/field makes that value the editor target.
- The active row has a non-color focus/state cue in addition to its swatch.

### Saturation/value field

- `150 × 150px` desktop target;
- the horizontal axis controls saturation from 0 to 100 percent;
- the vertical axis controls value from 100 to 0 percent;
- background combines the current hue with white and black overlays;
- a visible circular picker shows the current position;
- pointer down/move/up stays captured until the editing gesture ends;
- coordinates clamp to the field bounds;
- keyboard arrows adjust the active target in one-percent steps, with Shift using ten-percent steps;
- an accessible name and value text expose saturation and brightness.

### Hue control

- `20 × 150px` vertical desktop rail beside the saturation/value field;
- follows the observed red → magenta → blue → cyan → green → yellow → red spectrum;
- pointer and keyboard input clamp hue to the valid range;
- the slider position is visible independently of color;
- the control exposes slider semantics and a numeric hue value.

### Hex fields

- show separate `Primary` and `Complementary` labels;
- show a leading color swatch and a seven-character hex text input;
- accept case-insensitive `#rrggbb` input and normalize to lowercase on a valid commit;
- keep an invalid partial edit visible rather than silently replacing it;
- expose an inline error and disable `OK` while either draft is invalid;
- never send invalid values to `updateCodeColor`.

## Transaction and Dismissal Semantics

The dialog is a strict transaction:

- `OK` commits both normalized draft values to their respective presentation maps and closes.
- `Cancel` closes and discards the entire draft.
- Escape closes and discards the entire draft.
- Clicking the modal backdrop closes and discards the entire draft.
- Clicking inside the dialog never triggers backdrop cancellation.
- Closing restores focus to the exact code-color button that opened the dialog.
- Opening a second code is impossible while the first modal transaction is active.

There is no autosave, live plot mutation, model recomputation, toast, network request, or persistence outside the mounted browser workspace.

## Localization

Add structured, non-empty copy for every supported locale through the existing Open ENA locale composition. English, Traditional Chinese, and Simplified Chinese receive explicit native strings; the remaining locale dictionaries inherit the established English fallback unless that locale already owns a translated Model override. Required concepts include:

- Choose color for {code}
- Code color for {code}
- Color Presets
- Custom Color
- Primary
- Complementary
- Cancel
- OK
- saturation and brightness
- hue
- invalid six-digit hexadecimal color
- preset accessible names

Visible labels in `/en/open-ena` match the reference English. Chinese routes use native translated labels rather than exposing untranslated English controls.

## Preservation Boundary

The implementation must preserve:

- the approved Model tabs and compact Codes rows;
- selected code order and Manage Codes behavior;
- Standard ENA versus Ordered Network selection;
- `DEFAULT_CODE_COLOR === "#000000"`;
- `codeColorFor` and `updateCodeColor` validation behavior;
- the single Primary palette passed to every 2D, 3D, ENA, ONA, trajectory, comparison, and mini-network renderer;
- existing white node outlines and all edge/group color semantics;
- the current `presentation.codeColors` export schema of code-to-six-digit-hex strings;
- model freshness, result identity, selected dimensions, node positions, group-display state, and analysis-family drafts;
- the separate prior fix that makes the Model field-path add button fill its complete trailing surface.

Do not add a color-picker dependency, canvas library, browser-native color popup, new global design system, provider call, telemetry event, database write, deployment, or production claim.

## Error Handling

- Invalid external `value` props normalize through existing safe palette behavior before drafting.
- Non-finite HSV values and pointer coordinates clamp or fail closed in pure helpers; they never produce `NaN`, shorthand hex, alpha, CSS names, or functional color strings.
- Invalid typed hex remains local to the draft and blocks confirmation.
- If `showModal()` is unavailable or throws, render the same labelled dialog in an explicitly modal fixed-position fallback and preserve Escape, backdrop, focus return, and scroll lock.
- Unmounting while open discards the draft and restores any body state changed by the fallback.

## Test Strategy

Follow RED → GREEN → REFACTOR. Tests must fail for the missing preset implementation before production code is added.

### Pure behavior

Add focused tests for:

- the exact immutable six-pair order;
- six-digit normalization and invalid-value rejection;
- RGB ↔ HSV round trips at boundary and representative colors;
- pointer/keyboard clamping;
- exact pair matching;
- deterministic black/white complementary reference;
- draft confirmation returning normalized values without mutating the input object.

### Component and workspace contracts

Verify:

- each Codes row uses a dialog trigger rather than `type="color"`;
- all six preset buttons and both hex fields render with accessible names;
- selected state depends on both Primary and Complementary;
- Cancel/Escape/backdrop do not invoke confirmation;
- OK is disabled for invalid draft input;
- OK invokes one controlled confirmation with normalized values;
- focus returns to the trigger;
- Workspace updates `codeColors` only on confirmation;
- Complementary remains absent from config, renderer inputs, model identity, and export schemas;
- color confirmation does not run or invalidate analysis.

### Browser acceptance

At a real served `/en/open-ena` workspace with the teaching sample loaded:

1. open Model → Codes;
2. open the first node's color dialog;
3. verify the six exact preset pairs, selected state, field geometry, labels, modal semantics, and no horizontal overflow;
4. choose a different preset and Cancel; verify the row swatch and plotted code node remain unchanged;
5. reopen, choose the preset, and press OK; verify the row swatch and plotted code node both use the new Primary without model recomputation;
6. reopen and exercise custom Primary editing, Complementary editing, invalid hex blocking, Escape, and focus return;
7. repeat the geometry/overflow and essential interaction checks at `390 × 844`;
8. verify the browser console and page-error ledger remain clean.

### Repository verification

Run the focused code-color, official-model, plot-encoding, ENA/ONA 2D and 3D, export, functional, accessibility, browser-contract, and localization tests. Then run the repository-authoritative `npm run verify` gate with task-scoped Starship cache/temp paths and await the final exit code.

## Completion Criteria

The change is complete only when all of the following are true:

- the native code-node color popup is no longer the visible interaction;
- every selected code row opens the approved product-owned dialog;
- the six official preset pairs, order, sizes, overlap, and selected treatment are present;
- custom Primary and Complementary editing works through the shared saturation/value and hue controls;
- Cancel, Escape, backdrop, and OK have the approved transactional behavior;
- only Primary affects code-node rendering and existing exports;
- Complementary remains workspace-local and does not create a second node encoding;
- changing Primary propagates to all existing renderer families without analysis recomputation;
- desktop and 390px browser acceptance pass with accessible keyboard behavior and no overflow;
- focused tests, full verification, type checking, and production build pass;
- no unrelated user changes are staged, overwritten, or claimed as part of this feature;
- local implementation, commit, push, deployment, and production state are reported as separate evidence layers.
