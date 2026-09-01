# Open ENA Draggable Code Nodes — Design

**Status:** Approved in conversation; written specification awaiting user review

**Date:** 2026-09-02

**Scope:** Standard ENA 2D and 3D, ONA 2D and 3D, including Comparison / Primary / Secondary plot triptychs

## 1. Goal

Researchers can drag any visible code node with the mouse in every supported ENA and ONA plot. The node label and every incident visual connection must follow the node in real time. Plots that represent the same fitted result share the same presentation layout, while fitted coordinates, statistical results, model downloads, and reproducibility claims remain unchanged.

The feature is a presentation-layer layout editor. It is not a refit, rotation, projection, or change to the underlying ENA/ONA model.

## 2. Reference evidence and product boundary

Authenticated observation of official webENA `v2.0.7` on 2026-09-02 at a `1280 × 720` viewport established the following:

- A code label can be dragged.
- The label offset is shared between the Comparison plot and an opened side plot.
- The code-node circle and incident edges do not move in the observed version.
- `Recenter Plot` does not clear the dragged label offset.

Open ENA therefore extends, rather than literally copies, the observed interaction: users drag the code-node circle itself and the whole visual network follows. Recenter and node-layout reset remain separate actions, matching the official separation between viewport state and manual label layout.

No authenticated reference screenshot, account state, sample identifier, or sample value is stored in this specification.

## 3. In scope

The implementation must cover all of these render paths:

1. Standard ENA 2D, including the generic 2D result plot.
2. Standard ENA 2D group comparison: Comparison, Primary, and Secondary plots.
3. Standard ENA 3D, including the linked Comparison / Primary / Secondary Plotly triptych.
4. ONA 2D, including overall and per-group plots.
5. ONA 3D, including directed off-diagonal edges, reciprocal lanes, arrowheads, and self-connections.

Within one completed result, 2D and 3D views share the same fitted-dimension presentation coordinates. Comparison, Primary, and Secondary plots also share the same code-node overrides. ENA and ONA results do not reuse one another's overrides because their fitted node-position methods and result identities may differ.

## 4. Explicitly out of scope

- Dragging analytic-unit points, group means, confidence guides, outlier guides, axes, legends, or labels independently of their code node.
- Writing presentation overrides into jENA/ONA fitted coordinates.
- Re-running rotation, projection, statistics, or inference after a drag.
- Persisting a layout across a browser reload or across a newly computed result.
- Including presentation overrides in analytical model downloads, statistical tables, or methods reports.
- Claiming that official webENA `v2.0.7` supports draggable node circles.

## 5. Core architecture

### 5.1 Shared presentation state

Add a renderer-independent module, `lib/open-ena/node-layout.ts`, with a state shaped conceptually as:

```ts
type OpenEnaNodeDimensionPosition = Readonly<Record<string, number>>;

interface OpenEnaNodeLayoutState {
  fingerprint: string;
  positions: Readonly<Record<string, OpenEnaNodeDimensionPosition>>;
}
```

Positions are keyed by code and then by fitted dimension name, rather than by `x`, `y`, and `z`. This permits a drag in `SVD1 × SVD2` to coexist with a later `SVD1 × SVD3` view without losing the untouched fitted dimension.

The module provides pure functions to:

- create a stable result-layout fingerprint;
- merge canonical fitted node coordinates with display overrides;
- update one code across one or more selected dimensions;
- reject missing or non-finite values;
- clear all overrides;
- remove overrides for codes or dimensions no longer present;
- prove that the source result object was not mutated.

The fingerprint includes the analysis kind (`ena` or `ona`), source/result identity, code order, fitted dimension names, node-position method, and relevant reference identity. It deliberately excludes the active 2D/3D view and selected axis pair so a layout survives view changes. A new or recomputed incompatible result receives a different fingerprint and therefore starts from canonical fitted positions.

### 5.2 State ownership

`OpenEnaWorkspace` owns the authoritative node-layout state for the current completed result. It passes:

- resolved display coordinates;
- a node-move callback;
- a reset callback; and
- the current override count

to standard 2D, standard 3D, ONA 2D, and ONA 3D presenters.

Triptych containers do not create independent layouts. Their Comparison / Primary / Secondary children receive the same state and callbacks. A drag in any child therefore updates the other mounted children on the next render frame.

### 5.3 Canonical versus display coordinates

Every renderer follows the same rule:

```text
canonical fitted node coordinates
              +
valid presentation overrides for the same result fingerprint
              =
display node coordinates used by the figure
```

Only figure construction consumes display coordinates. Statistical code, projection tables, result bundles, model downloads, and methods reports continue to consume canonical result data.

## 6. Two-dimensional interaction

### 6.1 Pointer behavior

Each visible code node receives:

- a minimum `24px` transparent pointer hit target;
- a `grab` cursor while idle and `grabbing` while active;
- `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` handling;
- pointer capture for a stable drag when the pointer leaves the circle; and
- a drag-state attribute for browser tests and styling.

Only the primary mouse button starts a drag. The node's accessible name continues to identify the code. Analytic-unit points and group markers keep their existing click, hover, and focus behavior.

### 6.2 Coordinate conversion

The 2D projection helpers must expose both forward and inverse transforms. Pointer coordinates are converted from client pixels into the SVG viewport using the current screen transformation matrix, then inverted through:

- plot zoom;
- axis flips;
- official plot frame scaling; and
- the selected fitted dimensions.

The reducer stores the resulting fitted-dimension display coordinates, not SVG pixels. Consequently the layout remains stable when the plot is resized, copied, zoomed, flipped, moved between center and side panels, or switched between 2D and 3D.

Pointer updates are coalesced through `requestAnimationFrame`. The final position is committed on pointer release. A cancelled drag retains the last valid committed position and releases pointer capture.

### 6.3 Standard ENA 2D rendering

`OpenEnaGroupContrast` and `OpenEnaPlot` resolve code-node coordinates before constructing nodes and edges. Every incident edge obtains its endpoints from the same resolved coordinate map. Labels remain attached to their node group and therefore move with the circle.

In the group-comparison triptych, the same fitted coordinate produces different SVG pixels because the main and compact plots have different projectors; sharing fitted-dimension overrides makes them visually consistent without sharing screen pixels.

### 6.4 ONA 2D rendering

`OpenEnaOrderedPlot` applies overrides before `screenPositions` and directed-glyph construction. A moved node must update:

- the code-node circle and attached label;
- broadcast-triangle geometry;
- the transparent edge hit target;
- direction chevrons;
- reciprocal-lane offsets; and
- the self-connection disc or loop.

The ONA edge weights, direction, response totals, node radii, thresholds, and scope colors do not change.

## 7. Three-dimensional interaction

### 7.1 Disambiguating node drag and camera orbit

Plotly keeps its existing camera behavior:

- pointer drag beginning on empty plot space rotates/orbits the camera;
- pointer drag beginning on a code node moves that code node; and
- unit points and group means do not become draggable.

`OpenEnaInteractive3DPlot` tracks Plotly hover/unhover events for the trace whose metadata role is `code-node`. A primary-button pointerdown while a code node is the active hit prevents the camera gesture, captures the pointer, and begins a node drag. Pointerdown elsewhere is left to Plotly.

The Plotly event-root type is expanded to include the necessary hover and unhover event contracts. Missing event support degrades safely: camera interaction remains available and the plot announces that node movement is unavailable instead of guessing a point identity.

### 7.2 Screen movement to fitted coordinates

Dragging operates in a plane through the selected node:

- `XY` or `YX`: update the selected X and Y fitted dimensions and retain Z.
- `XZ` or `ZX`: update X and Z and retain Y.
- `YZ` or `ZY`: update Y and Z and retain X.
- isometric perspective: update along the camera-right and camera-up basis vectors in a plane perpendicular to the current view direction, retaining the node's camera-space depth.

The conversion uses the current Plotly camera, scene axis ranges, aspect ratio, plot rectangle, and node-to-camera distance. Orthographic movement is linear. Perspective movement scales by depth so the node remains coupled to the cursor instead of accelerating toward or away from the camera.

The conversion is implemented as pure vector math with deterministic tests. It does not depend on undocumented Plotly mutation of result data.

### 7.3 Plotly updates

Standard and ONA 3D compilers accept the same dimension-keyed overrides used by 2D. They rebuild:

- the code-node trace coordinates;
- incident standard ENA edge traces;
- ONA directed paths;
- ONA reciprocal lanes and arrowheads; and
- ONA self-loop paths.

Shared layout updates are frame-coalesced. Plotly uses its stable `uirevision`, controlled camera, and aspect-ratio state so updating node geometry does not reset the camera. Comparison / Primary / Secondary panels receive the same override at the same logical frame.

## 8. Reset, lifecycle, and export behavior

### 8.1 Recenter remains unchanged

Existing Recenter actions continue to reset only the 2D viewport or 3D camera distance/aspect behavior. They never delete presentation overrides.

### 8.2 Reset node layout

Add a clearly named `Reset node layout` action to Plot Tools and the equivalent localized copy in English, Traditional Chinese, and Simplified Chinese. The action:

- is disabled when no overrides exist;
- clears all overrides for the current result fingerprint;
- immediately restores canonical node and edge geometry in every mounted plot;
- preserves camera orientation, plot zoom, axis selection, visibility settings, and thresholds; and
- announces completion through the existing live-status pattern.

The reset is recoverable only by dragging again, so it is explicit and never coupled to Recenter.

### 8.3 Result lifecycle

Overrides remain while the user changes:

- 2D/3D view;
- selected fitted dimensions;
- camera preset or camera position;
- Plot View/Data View;
- Primary/Secondary ordering;
- label, point, network, threshold, scale, or axis-flip display settings; and
- panel visibility or fullscreen state.

Overrides are discarded when the completed result fingerprint changes, including a new analysis, incompatible reference/model change, code-set change, node-position-method change, or replacement result.

### 8.4 Exports

Visual exports use display coordinates:

- copied 2D images and copied SVG text;
- copied Plotly PNG images; and
- any figure-only SVG/PNG export sourced from the live plot.

Analytical artifacts use canonical coordinates:

- Download Model;
- result/data CSV exports;
- statistical tables and write-ups;
- methods and reproducibility reports; and
- analysis bundles.

This boundary must be covered by regression tests that compare source result objects and analytical serialization before and after display-only layout changes.

## 9. Error handling and safeguards

- Ignore a drag start when the code, selected dimensions, SVG inverse matrix, Plotly node identity, camera, or plot rectangle cannot be resolved safely.
- Reject `NaN`, infinities, empty dimension names, and positions for codes absent from the current result.
- Clamp only to finite renderer-safe limits derived from the current scene extent; do not silently modify canonical coordinates.
- Release pointer capture and clear transient drag state on `pointerup`, `pointercancel`, unmount, result replacement, or lost Plotly readiness.
- Preserve the last committed layout if a transient preview update fails.
- Do not allow a stale drag callback from an old fingerprint to write into a new result.
- Keep existing camera, fullscreen, resize, and Plotly error handling intact.

## 10. Accessibility and visual feedback

- Code nodes expose their existing code-node accessible names plus draggable-state metadata.
- Cursor changes and a subtle focus/drag ring supplement, but do not replace, textual state.
- A live region announces the selected code, successful move completion, reset completion, or unavailable interaction.
- Enlarged transparent hit targets do not change node-size encoding or intercept edge inspection outside the node area.
- Reduced-motion preference disables any optional easing; drag geometry itself remains immediate.
- Existing code-label visibility controls remain authoritative. A hidden label does not disable node dragging.

## 11. Test strategy

### 11.1 Pure unit tests

- fingerprint stability and invalidation;
- immutable merge/update/reset reducer behavior;
- dimension-keyed coordinate preservation across axis changes;
- 2D forward/inverse projection under zoom and flips;
- 3D orthographic plane movement for all six planar presets;
- 3D isometric camera-plane movement and depth preservation;
- rejection of stale fingerprints and non-finite coordinates; and
- proof that result, contrast, statistics, and canonical node tables are not mutated.

### 11.2 Renderer contract tests

- Standard ENA 2D node, label, and every incident edge use overrides.
- Comparison / Primary / Secondary receive one shared fitted-coordinate override.
- ONA 2D triangle, hit path, chevron, reciprocal lane, and self-connection use overrides.
- Standard ENA 3D code-node and incident-edge traces use overrides.
- ONA 3D code-node, directed edge, arrowhead, reciprocal lane, and self-loop traces use overrides.
- Reset control disabled/enabled state and three-language copy.
- Recenter does not clear node overrides.
- Visual export uses resolved display geometry while analytical export remains canonical.

### 11.3 Real-browser acceptance

At a served local Open ENA workbench, use actual pointer drags to prove:

1. Standard 2D ENA node, label, and incident edges move.
2. 2D Comparison / Primary / Secondary synchronize the same code.
3. ONA 2D direction glyphs and self-connections move correctly.
4. Standard 3D node and edges move while an empty-space drag still rotates the camera.
5. Linked 3D Comparison / Primary / Secondary synchronize the same code without resetting their camera.
6. ONA 3D directed paths and self-loops move with the code node.
7. Axis flips, zoom, camera presets, and fullscreen preserve dragging.
8. Recenter preserves the manual layout.
9. Reset node layout restores fitted geometry in all mounted plots.
10. Copied/figure export geometry reflects the layout and analytical data remains byte-equivalent.

Finish with targeted tests, production build, and the repository's authoritative `npm run verify`. Browser evidence proves interaction and visual behavior; structural and serialization tests separately prove the scientific-data boundary.

## 12. Completion criteria

The work is complete only when all four renderer families—standard 2D, standard 3D, ONA 2D, and ONA 3D—pass mouse-drag acceptance; all mounted plot roles synchronize; every incident visual edge form follows; reset and export boundaries are verified; canonical analytical state remains unchanged; and the full repository verification command succeeds.
