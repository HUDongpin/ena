# Open ENA Draggable Code Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add display-only mouse dragging for code nodes in standard ENA 2D/3D and ONA 2D/3D, synchronize plot triptychs, rebuild all incident geometry, and preserve canonical analytical results.

**Architecture:** `OpenEnaWorkspace` owns one dimension-keyed node-layout override state for the active result fingerprint. SVG and Plotly renderers merge those overrides with canonical fitted coordinates before building nodes and edges; pointer interaction updates only the override state. ONA 3D, whose compiler exists but is not currently reachable from the Workspace, is connected through the shared interactive Plotly presenter.

**Tech Stack:** React 19, TypeScript, SVG Pointer Events, Plotly GL3D, Node test runner with `tsx`, Next.js, repository `npm run verify` gate.

---

## File map

**Create**

- `lib/open-ena/node-layout.ts` — immutable result fingerprint, override reducer, canonical/display coordinate merge.
- `lib/open-ena/node-drag-3d.ts` — pure camera-plane pointer-delta conversion.
- `components/open-ena/OpenEnaSvgDraggableNode.tsx` — shared SVG pointer-capture and enlarged hit-target wrapper.
- `components/open-ena/OpenEna3DOrderedResultLayout.tsx` — reachable ONA 3D overall/Primary/Secondary Plotly workbench.
- `tests/open-ena-node-layout.test.ts` — state, fingerprint, invalidation, and immutability tests.
- `tests/open-ena-node-drag-3d.test.ts` — orthographic and isometric drag-math tests.
- `tests/open-ena-node-drag-browser-smoke.mjs` — served real-pointer acceptance for ENA 2D/3D and ONA 2D/3D.
- `tests/open-ena-node-drag-browser-smoke-contract.test.ts` — static contract ensuring the browser smoke remains wired into acceptance.

**Modify**

- `components/open-ena/OpenEnaWorkspace.tsx` — state ownership, fingerprint lifecycle, reset action, renderer props, ONA 3D routing.
- `components/open-ena/OpenEnaPersistentPlotTools.tsx` — explicit disabled/enabled Reset node layout control.
- `components/open-ena/OpenEnaPlot.tsx` — generic ENA 2D resolved positions and node drag.
- `components/open-ena/OpenEnaGroupContrast.tsx` — shared fitted-coordinate overrides across Comparison/Primary/Secondary.
- `components/open-ena/OpenEnaOrderedPlot.tsx` — ONA 2D inverse projection and complete directed-glyph movement.
- `components/open-ena/OpenEnaOrderedResultLayout.tsx` — pass one layout and callback to all ONA 2D plot roles.
- `components/open-ena/OpenEnaInteractive3DPlot.tsx` — Plotly node hit tracking, pointer capture, drag preview, ENA/ONA spec selection.
- `components/open-ena/OpenEna3DGroupContrast.tsx` — pass one layout and callback to all ENA 3D plot roles.
- `components/open-ena/plotly-gl3d-loader.ts` — expose `react`/event typing needed for geometry updates.
- `lib/open-ena/plot3d.ts` — standard ENA 3D compiler consumes display node positions for nodes and incident edges.
- `lib/open-ena/ordered-plot3d.ts` — ONA 3D compiler consumes display node positions before directed geometry construction.
- `lib/open-ena-i18n.ts` — English, Traditional Chinese, and Simplified Chinese node-drag/reset copy.
- `app/globals.css` — grab/grabbing cursor, drag ring, hit targets, reduced-motion rule.
- `tests/open-ena-group-contrast-plot.test.ts` — standard ENA 2D node/edge/triptych contracts.
- `tests/open-ena-plot-encoding.test.ts` — generic 2D override contract.
- `tests/open-ena-ona-ordered-plot.test.ts` — ONA 2D directed geometry and self-loop contract.
- `tests/open-ena-3d-view.test.ts` — standard 3D overrides, callbacks, camera preservation, ONA routing.
- `tests/open-ena-ona-3d.test.ts` — ONA 3D override geometry.
- `tests/open-ena-ona-workspace.test.ts` — ONA 2D/3D visible routing and shared controls.
- `package.json` — named browser-smoke command.

## Task 1: Immutable node-layout core

**Files:**

- Create: `lib/open-ena/node-layout.ts`
- Create: `tests/open-ena-node-layout.test.ts`

- [ ] **Step 1: Write failing reducer and fingerprint tests**

```ts
test("node layout merges finite dimension overrides without mutating canonical coordinates", () => {
  const canonical = { code: "Evidence", SVD1: -1, SVD2: 0.5, SVD3: 0.25 };
  const state = createOpenEnaNodeLayoutState("ena:fingerprint");
  const moved = moveOpenEnaNode(state, "ena:fingerprint", "Evidence", { SVD1: 2, SVD2: -3 });
  assert.deepEqual(resolveOpenEnaNodePosition(canonical, moved.positions.Evidence), {
    code: "Evidence", SVD1: 2, SVD2: -3, SVD3: 0.25,
  });
  assert.deepEqual(canonical, { code: "Evidence", SVD1: -1, SVD2: 0.5, SVD3: 0.25 });
});

test("stale and non-finite node moves are ignored", () => {
  const state = createOpenEnaNodeLayoutState("current");
  assert.equal(moveOpenEnaNode(state, "stale", "Evidence", { SVD1: 4 }), state);
  assert.equal(moveOpenEnaNode(state, "current", "Evidence", { SVD1: Number.NaN }), state);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --import tsx --test tests/open-ena-node-layout.test.ts`

Expected: FAIL because `lib/open-ena/node-layout.ts` does not exist.

- [ ] **Step 3: Implement the immutable core**

```ts
export type OpenEnaAnalysisKind = "ena" | "ona";
export type OpenEnaNodeDimensionPosition = Readonly<Record<string, number>>;
export type OpenEnaNodeLayoutPositions = Readonly<Record<string, OpenEnaNodeDimensionPosition>>;

export interface OpenEnaNodeLayoutState {
  fingerprint: string;
  positions: OpenEnaNodeLayoutPositions;
}

export function createOpenEnaNodeLayoutState(fingerprint: string): OpenEnaNodeLayoutState {
  return { fingerprint, positions: {} };
}

export function moveOpenEnaNode(
  state: OpenEnaNodeLayoutState,
  fingerprint: string,
  code: string,
  dimensions: OpenEnaNodeDimensionPosition,
): OpenEnaNodeLayoutState {
  if (fingerprint !== state.fingerprint || !code.trim()) return state;
  const entries = Object.entries(dimensions);
  if (entries.length === 0 || entries.some(([key, value]) => !key.trim() || !Number.isFinite(value))) return state;
  return {
    ...state,
    positions: { ...state.positions, [code]: { ...state.positions[code], ...dimensions } },
  };
}

export function resetOpenEnaNodeLayout(state: OpenEnaNodeLayoutState): OpenEnaNodeLayoutState {
  return Object.keys(state.positions).length === 0 ? state : createOpenEnaNodeLayoutState(state.fingerprint);
}

export function resolveOpenEnaNodePosition<T extends { code: string }>(
  canonical: T,
  override?: OpenEnaNodeDimensionPosition,
): T {
  return override ? { ...canonical, ...override } : canonical;
}
```

Add `createOpenEnaNodeLayoutFingerprint` using analysis kind, source hash, analyzed time, reference identity, node-position method, ordered code list, and fitted dimensions. Serialize a normalized object with `JSON.stringify`; do not include active view, camera, selected axis pair, or display settings.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --import tsx --test tests/open-ena-node-layout.test.ts`

Expected: all node-layout tests pass.

- [ ] **Step 5: Commit the core**

```bash
git add lib/open-ena/node-layout.ts tests/open-ena-node-layout.test.ts
git commit -m "feat: add display-only ENA node layouts"
```

## Task 2: Workspace ownership, lifecycle, localized reset

**Files:**

- Modify: `components/open-ena/OpenEnaWorkspace.tsx`
- Modify: `components/open-ena/OpenEnaPersistentPlotTools.tsx`
- Modify: `lib/open-ena-i18n.ts`
- Modify: `tests/open-ena-functional.test.ts`
- Modify: `tests/open-ena-ona-workspace.test.ts`

- [ ] **Step 1: Write failing state and copy contracts**

Add assertions that Workspace creates the result fingerprint, owns `OpenEnaNodeLayoutState`, resets it only when the fingerprint changes, and passes one callback to every renderer. Assert exact copy:

```ts
assert.equal(en.plot.resetNodeLayout, "Reset node layout");
assert.equal(zhHant.plot.resetNodeLayout, "重設節點配置");
assert.equal(zhHans.plot.resetNodeLayout, "重置节点布局");
```

Render Plot Tools with `nodeLayoutOverrideCount={0}` and `nodeLayoutOverrideCount={1}`. Assert the Reset node layout button is respectively disabled and enabled.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/open-ena-functional.test.ts tests/open-ena-ona-workspace.test.ts`

Expected: FAIL on missing copy, state, and reset-control props.

- [ ] **Step 3: Add Workspace state and reset control**

In Workspace:

```ts
const nodeLayoutFingerprint = result
  ? createOpenEnaNodeLayoutFingerprint({
      analysisKind: completedResultKind === "ona" ? "ona" : "ena",
      result,
      nodePositionMethod: result.executionProvenance?.nodePositionMethod ?? "undirected",
    })
  : "empty";
const [nodeLayout, setNodeLayout] = useState(() => createOpenEnaNodeLayoutState("empty"));

useEffect(() => {
  setNodeLayout((current) => current.fingerprint === nodeLayoutFingerprint
    ? current
    : createOpenEnaNodeLayoutState(nodeLayoutFingerprint));
}, [nodeLayoutFingerprint]);

const moveNode = useCallback((code: string, dimensions: OpenEnaNodeDimensionPosition) => {
  setNodeLayout((current) => moveOpenEnaNode(current, nodeLayoutFingerprint, code, dimensions));
}, [nodeLayoutFingerprint]);
```

Pass `nodeLayout.positions`, `onNodeMove={moveNode}`, and `onResetNodeLayout` to the active renderer and Plot Tools. The reset control calls `setNodeLayout(resetOpenEnaNodeLayout)` and does not increment `plotResetRevision`.

- [ ] **Step 4: Verify focused GREEN**

Run: `node --import tsx --test tests/open-ena-functional.test.ts tests/open-ena-ona-workspace.test.ts tests/open-ena-node-layout.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit Workspace ownership**

```bash
git add components/open-ena/OpenEnaWorkspace.tsx components/open-ena/OpenEnaPersistentPlotTools.tsx lib/open-ena-i18n.ts tests/open-ena-functional.test.ts tests/open-ena-ona-workspace.test.ts
git commit -m "feat: own draggable node layout in workspace"
```

## Task 3: Shared SVG pointer interaction

**Files:**

- Create: `components/open-ena/OpenEnaSvgDraggableNode.tsx`
- Modify: `app/globals.css`
- Modify: `tests/open-ena-official-plot-contract.test.ts`

- [ ] **Step 1: Write a failing component contract**

Assert that the component renders a transparent minimum-24px hit target, `data-ena-node-draggable`, `data-ena-node-dragging`, and handlers for pointer down/move/up/cancel.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/open-ena-official-plot-contract.test.ts`

Expected: FAIL because the shared component is absent.

- [ ] **Step 3: Implement pointer capture and frame coalescing**

```tsx
export default function OpenEnaSvgDraggableNode({
  code, radius, toDimensions, onNodeMove, children,
}: OpenEnaSvgDraggableNodeProps) {
  const [dragging, setDragging] = useState(false);
  const pointerId = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<OpenEnaNodeDimensionPosition | null>(null);

  const flush = () => {
    frame.current = null;
    if (pending.current) onNodeMove(code, pending.current);
    pending.current = null;
  };

  const move = (event: React.PointerEvent<SVGGElement>) => {
    if (pointerId.current !== event.pointerId) return;
    pending.current = toDimensions(event.clientX, event.clientY);
    if (pending.current && frame.current === null) frame.current = requestAnimationFrame(flush);
  };

  return (
    <g data-ena-node-draggable="true" data-ena-node-dragging={dragging} onPointerMove={move}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerUp={(event) => {
        if (pointerId.current !== event.pointerId) return;
        flush();
        event.currentTarget.releasePointerCapture(event.pointerId);
        pointerId.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => { pointerId.current = null; setDragging(false); }}>
      <circle r={Math.max(12, radius)} className="ena-node-drag-hit-target" aria-hidden="true" />
      {children}
    </g>
  );
}
```

Add `grab`/`grabbing`, drag-ring, `touch-action: none` on the hit target only, and a reduced-motion override.

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test tests/open-ena-official-plot-contract.test.ts`

Expected: the new component and CSS contract pass.

- [ ] **Step 5: Commit SVG interaction**

```bash
git add components/open-ena/OpenEnaSvgDraggableNode.tsx app/globals.css tests/open-ena-official-plot-contract.test.ts
git commit -m "feat: add shared SVG node dragging"
```

## Task 4: Standard ENA 2D and synchronized triptych

**Files:**

- Modify: `components/open-ena/OpenEnaPlot.tsx`
- Modify: `components/open-ena/OpenEnaGroupContrast.tsx`
- Modify: `tests/open-ena-plot-encoding.test.ts`
- Modify: `tests/open-ena-group-contrast-plot.test.ts`

- [ ] **Step 1: Write failing resolved-geometry tests**

Render with `nodeLayout={{ Evidence: { SVD1: 2, SVD2: -1 } }}`. Assert the Evidence node transform changes in generic 2D and in all three group plots. Assert every `data-ena-edge` incident to Evidence uses the moved endpoint, while an unrelated edge is unchanged. Deep-compare the original result and contrast after rendering.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/open-ena-plot-encoding.test.ts tests/open-ena-group-contrast-plot.test.ts`

Expected: FAIL on missing layout props and unchanged geometry.

- [ ] **Step 3: Add inverse projectors and shared dragging**

Extend both plot props with:

```ts
nodeLayout?: OpenEnaNodeLayoutPositions;
onNodeMove?: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
```

Build `nodePoints` from resolved fitted coordinates. Add an inverse projector that undoes viewBox transform, plot zoom, frame scale, and axis flips. Wrap each node circle/label group with `OpenEnaSvgDraggableNode`. All three `ContrastSvg` calls receive the same layout and callback from `OpenEnaGroupContrast`.

- [ ] **Step 4: Verify GREEN and legacy geometry**

Run: `node --import tsx --test tests/open-ena-plot-encoding.test.ts tests/open-ena-group-contrast-plot.test.ts tests/open-ena-official-full-workbench-contract.test.ts`

Expected: new drag contracts pass and all existing official geometry contracts remain green without overrides.

- [ ] **Step 5: Commit standard 2D**

```bash
git add components/open-ena/OpenEnaPlot.tsx components/open-ena/OpenEnaGroupContrast.tsx tests/open-ena-plot-encoding.test.ts tests/open-ena-group-contrast-plot.test.ts
git commit -m "feat: drag standard ENA nodes in 2D"
```

## Task 5: ONA 2D directed geometry

**Files:**

- Modify: `components/open-ena/OpenEnaOrderedPlot.tsx`
- Modify: `components/open-ena/OpenEnaOrderedResultLayout.tsx`
- Modify: `tests/open-ena-ona-ordered-plot.test.ts`

- [ ] **Step 1: Write failing ONA geometry tests**

Render an ONA fixture with code A moved. Assert A's node transform, the A→B broadcast triangle, its transparent hit path, chevron, reciprocal lane, and A self-connection change. Assert B→C remains byte-identical. Render the result layout and assert overall/Primary/Secondary receive the same override.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/open-ena-ona-ordered-plot.test.ts`

Expected: FAIL because ONA plot props ignore layout overrides.

- [ ] **Step 3: Resolve ONA coordinates before glyph construction**

Extend `OpenEnaOrderedPlotProps` and `OpenEnaOrderedResultLayoutProps` with the shared layout/callback types. Refactor `screenPositions` to return forward and inverse transforms. Resolve each model node's selected dimensions before calling `buildOrderedEdgeGlyph`; wrap the code node with the shared SVG drag component. Do not change weights, response totals, radii, thresholds, or scopes.

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test tests/open-ena-ona-ordered-plot.test.ts tests/open-ena-ona-workspace.test.ts`

Expected: directed geometry and triptych-sharing tests pass.

- [ ] **Step 5: Commit ONA 2D**

```bash
git add components/open-ena/OpenEnaOrderedPlot.tsx components/open-ena/OpenEnaOrderedResultLayout.tsx tests/open-ena-ona-ordered-plot.test.ts tests/open-ena-ona-workspace.test.ts
git commit -m "feat: drag ONA nodes with directed geometry"
```

## Task 6: Pure 3D camera-plane drag math

**Files:**

- Create: `lib/open-ena/node-drag-3d.ts`
- Create: `tests/open-ena-node-drag-3d.test.ts`

- [ ] **Step 1: Write failing orthographic and perspective tests**

```ts
test("XY drag changes X and Y but preserves Z", () => {
  const next = dragOpenEnaNodeIn3d({
    position: { x: 1, y: 2, z: 3 }, deltaPixels: { x: 100, y: -50 },
    viewport: { width: 1000, height: 500 }, ranges: { x: [-5, 5], y: [-5, 5], z: [-5, 5] },
    camera: cameraForPreset("xy"), preset: "xy", aspectRatio: { x: 1, y: 1, z: 1 },
  });
  assert.equal(next.z, 3);
  assert.ok(next.x > 1 && next.y > 2);
});

test("isometric drag preserves camera-space depth", () => {
  const input = isometricFixture();
  const next = dragOpenEnaNodeIn3d(input);
  assert.ok(Math.abs(cameraDepth(next, input.camera) - cameraDepth(input.position, input.camera)) < 1e-9);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/open-ena-node-drag-3d.test.ts`

Expected: FAIL because the drag-math module is absent.

- [ ] **Step 3: Implement normalized camera-basis movement**

Implement vector `add`, `subtract`, `scale`, `dot`, `cross`, and `normalize`. For planar presets map pixel deltas directly into the two named axis ranges. For isometric mode calculate `view = normalize(center - eye)`, `right = normalize(cross(view, up))`, and `screenUp = normalize(cross(right, view))`; convert the pixel delta to scene units with aspect/range scaling and multiply perspective motion by node-to-camera distance divided by reference distance. Return only finite positions.

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test tests/open-ena-node-drag-3d.test.ts`

Expected: all six planar presets, isometric depth, flips, zero viewport, and non-finite guards pass.

- [ ] **Step 5: Commit 3D math**

```bash
git add lib/open-ena/node-drag-3d.ts tests/open-ena-node-drag-3d.test.ts
git commit -m "feat: map pointer drags into ENA 3D space"
```

## Task 7: Standard and ordered 3D compilers consume overrides

**Files:**

- Modify: `lib/open-ena/plot3d.ts`
- Modify: `lib/open-ena/ordered-plot3d.ts`
- Modify: `tests/open-ena-3d-view.test.ts`
- Modify: `tests/open-ena-ona-3d.test.ts`

- [ ] **Step 1: Write failing compiler tests**

Compile standard and ordered fixtures with one moved code. Assert the `code-node` trace coordinate changes, every incident edge/path endpoint changes, ONA reciprocal lane and self-loop geometry changes, and unrelated edges remain unchanged. Deep-compare the input result before and after each compile.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/open-ena-3d-view.test.ts tests/open-ena-ona-3d.test.ts`

Expected: FAIL because compiler inputs do not accept `nodeLayout`.

- [ ] **Step 3: Resolve fitted rows before all 3D geometry**

Add `nodeLayout?: OpenEnaNodeLayoutPositions` to both compiler input interfaces. Standard ENA resolves `nodeRows` before network traces and code-node trace creation. ONA resolves `fitted.nodeCoordinates` before `offDiagonalPosition`, `selfLoopPosition`, directed trace creation, and the code-node trace. Preserve canonical unit-point and group-mean coordinates.

- [ ] **Step 4: Verify GREEN**

Run: `node --import tsx --test tests/open-ena-3d-view.test.ts tests/open-ena-ona-3d.test.ts`

Expected: compiler override and all legacy 3D tests pass.

- [ ] **Step 5: Commit compiler support**

```bash
git add lib/open-ena/plot3d.ts lib/open-ena/ordered-plot3d.ts tests/open-ena-3d-view.test.ts tests/open-ena-ona-3d.test.ts
git commit -m "feat: rebuild 3D networks from moved nodes"
```

## Task 8: Interactive Plotly dragging and reachable ONA 3D UI

**Files:**

- Modify: `components/open-ena/OpenEnaInteractive3DPlot.tsx`
- Modify: `components/open-ena/OpenEna3DGroupContrast.tsx`
- Create: `components/open-ena/OpenEna3DOrderedResultLayout.tsx`
- Modify: `components/open-ena/OpenEnaWorkspace.tsx`
- Modify: `components/open-ena/plotly-gl3d-loader.ts`
- Modify: `tests/open-ena-3d-view.test.ts`
- Modify: `tests/open-ena-ona-workspace.test.ts`

- [ ] **Step 1: Write failing interaction and routing contracts**

Assert Plotly event typing includes `plotly_hover` and `plotly_unhover`; the interactive plot records only `meta.role === "code-node"`; pointerdown on that hit enters node dragging while empty-space pointerdown remains Plotly orbit. Assert three linked ENA plots receive one layout/callback. Assert `completedResultKind === "ona" && view === "3d"` renders `OpenEna3DOrderedResultLayout`, not the 2D ordered layout.

- [ ] **Step 2: Verify RED**

Run: `node --import tsx --test tests/open-ena-3d-view.test.ts tests/open-ena-ona-workspace.test.ts`

Expected: FAIL on missing events, props, and ONA 3D route.

- [ ] **Step 3: Add ENA/ONA Plotly spec selection**

Extend the interactive plot with:

```ts
analysisKind?: "ena" | "ona";
orderedConfig?: OpenEnaConfig;
orderedScope?: OpenEnaOrderedPlotScope;
orderedNodeTotals?: OpenEnaOrderedNodeTotals;
nodeLayout?: OpenEnaNodeLayoutPositions;
onNodeMove?: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
```

Its `useMemo` calls `compileOpenEnaOrdered3dPlotSpec` when `analysisKind === "ona"` and validates the ordered props; otherwise it calls `compileOpenEna3dPlotSpec`. Both receive `nodeLayout`.

- [ ] **Step 4: Implement Plotly hover hit tracking and pointer dragging**

Register hover/unhover listeners after `Plotly.react`. Store `{ code, pointNumber }` only for the code-node trace. On primary-button pointerdown with an active code hit, stop propagation, capture the pointer, record its start client position and resolved fitted node position, and call `dragOpenEnaNodeIn3d` on frame-coalesced moves. Clear drag state on up, cancel, unmount, result fingerprint change, or Plotly error. Keep `uirevision`, controlled camera, and aspect ratio unchanged while geometry updates.

- [ ] **Step 5: Build and route the ONA 3D triptych**

`OpenEna3DOrderedResultLayout` renders overall, Primary group scope, and Secondary group scope using `OpenEnaInteractive3DPlot analysisKind="ona"`. Pass one layout/callback and one shared camera/aspect ratio. Workspace chooses it only when an ONA result has three dimensions and `view === "3d"`; otherwise retain existing 2D ONA and unavailable states.

- [ ] **Step 6: Verify focused GREEN**

Run: `node --import tsx --test tests/open-ena-3d-view.test.ts tests/open-ena-ona-3d.test.ts tests/open-ena-ona-workspace.test.ts`

Expected: Plotly interaction, linked layouts, ONA 3D route, and existing camera tests pass.

- [ ] **Step 7: Commit interactive 3D and ONA routing**

```bash
git add components/open-ena/OpenEnaInteractive3DPlot.tsx components/open-ena/OpenEna3DGroupContrast.tsx components/open-ena/OpenEna3DOrderedResultLayout.tsx components/open-ena/OpenEnaWorkspace.tsx components/open-ena/plotly-gl3d-loader.ts tests/open-ena-3d-view.test.ts tests/open-ena-ona-workspace.test.ts
git commit -m "feat: drag ENA and ONA nodes in 3D"
```

## Task 9: Export boundary and real-browser acceptance

**Files:**

- Create: `tests/open-ena-node-drag-browser-smoke.mjs`
- Create: `tests/open-ena-node-drag-browser-smoke-contract.test.ts`
- Modify: `package.json`
- Modify: relevant renderer tests if browser evidence exposes a missing structural assertion.

- [ ] **Step 1: Write the browser-smoke contract test**

Assert the smoke selects all four visible plot families, performs actual mouse drags, captures before/after node and incident-edge geometry, checks triptych synchronization, rotates a 3D camera from empty space, presses Recenter, presses Reset node layout, and compares analytical serialization before/after.

- [ ] **Step 2: Verify the contract is RED**

Run: `node --import tsx --test tests/open-ena-node-drag-browser-smoke-contract.test.ts`

Expected: FAIL because the smoke and script entry do not exist.

- [ ] **Step 3: Implement deterministic browser acceptance**

Add `test:browser:open-ena-node-drag` to `package.json`. The smoke starts or reuses a served local app with task-scoped temp/cache settings, loads the deterministic Open ENA fixture, and verifies:

```js
assertBrowser(after.node.x !== before.node.x || after.node.y !== before.node.y, "node did not move");
assertBrowser(after.edgePath !== before.edgePath, "incident edge did not follow node");
assertBrowser(after.canonicalResult === before.canonicalResult, "drag mutated analytical result");
```

Repeat for standard 2D, standard 3D, ONA 2D, and ONA 3D. Verify side plots, Recenter preservation, explicit reset, and visual copy source geometry.

- [ ] **Step 4: Run focused interaction verification**

Run: `node --import tsx --test tests/open-ena-node-drag-browser-smoke-contract.test.ts`

Run: `npm run test:browser:open-ena-node-drag`

Expected: contract and live browser smoke pass, with a JSON receipt naming all four render families.

- [ ] **Step 5: Run full authoritative verification**

Run: `npm run verify`

Expected: prompt verification, vendor verification, jENA verification, all app tests, typecheck, and Next production build exit successfully.

- [ ] **Step 6: Audit the completion matrix**

Record evidence for standard 2D, standard 3D, ONA 2D, ONA 3D, triptych sync, all incident geometry, Recenter preservation, explicit reset, visual exports, analytical immutability, and full verification. Treat any missing row as incomplete.

- [ ] **Step 7: Commit acceptance coverage**

```bash
git add package.json tests/open-ena-node-drag-browser-smoke.mjs tests/open-ena-node-drag-browser-smoke-contract.test.ts
git commit -m "test: verify draggable ENA and ONA nodes"
```

## Execution mode

Execute inline in this task with `superpowers:executing-plans`. Subagent-driven execution is not selected because no explicit request to delegate or spawn subagents was made. Keep unrelated dirty files preserved and stage only task-owned paths at each commit.
