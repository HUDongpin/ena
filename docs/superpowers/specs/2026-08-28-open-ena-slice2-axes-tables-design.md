# Open ENA Slice 2: Independent 3D Axes and Result-Table Availability

## Scope

This slice separates the generic endpoint 3D display axes from the existing
2D/inference axes and makes result-table applicability explicit. It does not
change the V3 trajectory workbench, scientific execution, AI lifecycle,
settings focus behavior, locale fallback, or responsive layout.

## Axis State Design

The existing `xDimension` and `yDimension` remain the sole 2D, group-contrast,
inference, statistics, group-network, ONA, methods-report, and AI-evidence axis
authority. A separate three-axis tuple supplies only the generic 3D heading,
3D controls, `OpenEna3DGroupContrast`, and generic
`OpenEnaInteractive3DPlot` instances.

A narrow pure `workspace-axes` helper owns immutable transitions:

- initialize both 2D and 3D tuples from one successful result dimension list;
- change one 3D axis while swapping a duplicate only inside the 3D tuple;
- reset only the requested surface tuple from the result dimensions;
- return new tuples without mutating prior state.

The Workspace keeps the established 2D state names to minimize inference and
AI churn, adds a separate 3D tuple/state, and applies the pure transition in the
3D selector. Successful analysis initializes both sets. Plot Reset resets only
the currently active surface axes; existing non-axis display reset behavior is
preserved. Generic 3D remains `showTrajectories={false}`.

## Result-Table Availability Design

The result-table key becomes a shared typed union. A pure availability
function returns one typed entry per visible table with `available` and an
optional not-applicable reason.

- `EndPoint`: `trajectories` is unavailable.
- `SeparateTrajectory` and `AccumulatedTrajectory`: `trajectories` is
  available.
- Any projection-reference result: `centroids` is unavailable.
- All other normal tables remain available.

Every tab remains rendered. An unavailable tab is disabled and displays
`N/A`; the result region presents an explicit not-applicable explanation if an
unavailable table is the current selection. CSV export is disabled and its
handler is guarded unless the selected table is both available and non-empty.

## Verification Design

Strict TDD starts with:

1. a pure immutable 3D-axis transition test proving the prior state and 2D
   inference-key inputs are unchanged;
2. a pure table-availability matrix covering endpoint, both trajectory models,
   and projection-reference results;
3. complementary Workspace contracts proving inference request/key/current
   blocks exclude all 3D state while every generic 3D consumer uses only the
   3D tuple;
4. tab/export contracts proving unavailable tabs remain visible with disabled,
   N/A, explicit-note, and guarded-export behavior.

After the expected RED, the smallest production changes will be implemented,
followed by the bounded Workspace, longitudinal, 3D, functional, typecheck,
and diff-check gates.
