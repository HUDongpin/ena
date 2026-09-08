# Open ENA Strict Standard Model Parameters Design

Date: 2026-09-02
Status: Design approved in conversation; pending written-spec review
Route: /[locale]/open-ena
Analysis families: Standard ENA and existing Ordered Network Analysis (ONA)
Explicitly out of scope: Transmodal Analysis (TMA) and advanced rotations

## 1. Purpose

Build a complete, fail-closed Standard ENA parameter system for the Models
workspace. The system must correctly model Units, Horizons, Windows, Codes,
weighting, trajectory order, and rotation; keep the existing ONA analysis
scientifically and operationally isolated; remove unavailable TMA controls; make
all visible bulk controls functional; and bind every result to the exact data,
configuration, ordering, runtime, and reference geometry that produced it.

This specification supersedes the narrower
2026-09-02-open-ena-model-bulk-controls-design.md. It extends, rather than
reverses, the approved official Models-tab visual direction.

## 2. Scope

### 2.1 Standard ENA in scope

- Units defined by one or more typed identity fields.
- Horizons, formerly called conversations, defined by one or more typed
  boundary fields.
- Codes selected from data columns; selected Codes become network Nodes.
- Binary and Frequency weighting.
- EndPoint, SeparateTrajectory, and AccumulatedTrajectory models.
- MovingStanzaWindow and Conversation/Horizon windows.
- All six Model by Window combinations.
- Finite and Infinity backward and forward Standard windows.
- Explicit within-Horizon row ordering for Moving Stanza windows.
- Explicit Horizon ordering for trajectory models.
- SVD, Means, and Reference rotations.
- Means fitted directly only for EndPoint.
- Endpoint references projected into all three Standard models.
- Strict diagnostics, resource preflight, immutable execution plans, result
  binding, provenance, import/export, methods reports, migration, and browser
  acceptance.

### 2.2 Existing ONA in scope

- Preserve its current EndPoint, directed, backward-only Moving Stanza, sum,
  SVD, explicit-order, directional-mask contract.
- Move it behind an ONA-specific canonical type and execution adapter.
- Preserve existing numerical behavior, exports, audits, 2D/3D output, and
  capability boundaries.
- Prove non-regression independently from Standard tests.

### 2.3 Out of scope

- Transmodal/TMA configuration or computation.
- Generalized, Regression, Regression2, HENA, Spherical, or custom-matrix
  rotations in the Models UI.
- Direct Means fitting for trajectory observations.
- Cross-dataset semantic mapping between differently named Unit, Horizon,
  Code, or order fields.
- Silent data cleaning, imputation, thresholding, automatic tie breaking, or
  automatic fallback between rotations.
- Horizon-level analytic filtering through the currently disabled eye/minus
  icons.
- Push, pull request, merge, deployment, or production change without separate
  authorization.

## 3. Approved methodological contracts

### 3.1 Units and Horizons

- Units determine which entity receives accumulated connection contributions
  and becomes an analytical observation.
- Horizons determine the boundary within which Codes may be connected.
- One Horizon may legitimately contain records from multiple Units.
- A shared Horizon is informative, not invalid.
- Group metadata must be stable within each Unit.
- The application must not silently add Group to the Unit identity to repair an
  unstable mapping.
- A suggested “Add Group to Unit identity” action may be offered only with an
  impact preview and explicit confirmation.
- Unit, Horizon, and Group identities must be typed. Number 1 and string "1"
  are not the same identity.
- Composite identities must use canonical tuples and hashes, not delimiter
  concatenation.

### 3.2 Codes and Nodes

- The UI tab remains named Codes because the selected data columns are Codes;
  the resulting graph elements are Nodes.
- The UI explains: “Selected codes become the nodes of the epistemic network.”
- At least three Codes are required to run Standard ENA.
- Exclude all produces a real empty Codes configuration and never restores
  defaults automatically.
- A Code cannot also serve as a Unit, Horizon, Group, row-order, or
  Horizon-order field.
- Missing, non-finite, negative, or incompatible values are never silently
  changed to zero.
- A selected all-zero Code blocks modeling.
- An isolated Code and an exactly duplicated Code profile produce strong
  warnings but remain selected.
- A configuration with no co-occurrence anywhere blocks modeling.
- Node color, visibility, drag position, and display order are presentation
  state, not scientific configuration.

### 3.3 Weighting

- Binary accepts a consistently numeric 0/1 column or a consistently Boolean
  false/true column.
- Binary rejects arbitrary positive values, fractions, strings, missing values,
  negative values, and mixed Boolean/numeric representation.
- Frequency accepts finite non-negative numbers, including decimals.
- Frequency rejects strings, Booleans, missing values, negative values, NaN,
  and Infinity.
- Boolean-to-0/1 materialization is an explicit runtime representation mapping
  recorded in provenance.
- The scientific configuration stores “frequency”; an internal adapter may map
  it to jENA “sum”, and both names are recorded.

### 3.4 Standard Models and Windows

All six combinations are valid:

| Model | Moving Stanza | Conversation/Horizon |
| --- | --- | --- |
| EndPoint | Valid; row order required | Valid; row order not applicable |
| SeparateTrajectory | Valid; row and Horizon order required | Valid; Horizon order required |
| AccumulatedTrajectory | Valid; row and Horizon order required | Valid; Horizon order required |

EndPoint produces one accumulated adjacency vector per Unit.

SeparateTrajectory produces an independent vector for each observed Unit by
Horizon step. Reordering steps changes the path and provenance but not the
individual step networks.

AccumulatedTrajectory produces a running accumulation in each Unit's actual
ordered Horizon sequence. Reordering Horizons changes the step vectors and
requires re-accumulation.

Missing Unit/Horizon steps are not imputed, interpolated, carried forward, or
represented as zero networks. A trajectory model requires at least one Unit
with two or more steps. Units with one step are retained with a warning.

### 3.5 Moving Stanza semantics

- Backward size includes the current row.
- Backward 1 means current row only.
- Backward 5 means current row plus at most four preceding rows.
- Forward size excludes the current row.
- Forward 2 means at most two following rows.
- The window never crosses a Horizon boundary.
- Backward accepts a positive safe integer or Infinity.
- Forward accepts a non-negative safe integer or Infinity.
- Conversation/Horizon window uses all records within the Horizon and has no
  active row-order or extent parameters.
- An engine may use Infinity internally for a Conversation window, but the
  scientific configuration and report must retain the selected Conversation
  type.

### 3.6 Ordering

Moving Stanza must either:

- provide one or more explicit row-order fields, comparators, and directions;
  or
- explicitly confirm the current dataset's source row order.

Trajectory models must independently either:

- provide one or more explicit Horizon-order fields, comparators, and
  directions; or
- explicitly confirm the order in which Horizons first appear in the current
  dataset.

Supported explicit comparator contracts are:

- finite number;
- date with an explicit format;
- datetime with an explicit format and time zone;
- ordered category with a complete ordered level list;
- text with explicit locale, sensitivity, numeric collation, and direction.

Missing values, parse failure, unknown ordered-category levels, and unresolved
ties block modeling. No source row number or Horizon name is used as an implicit
tie breaker.

Row sorting occurs only inside each typed Horizon. Horizon order must be stable
inside a Horizon and form a unique total order for the distinct Horizons
visited by each Unit. Different Units may share the same time value without
creating a tie.

Every source-order confirmation is bound to the normalized dataset hash, row
count, relevant fields, analysis family, and confirmation version. Any relevant
change expires the confirmation.

### 3.7 Rotation

| Model | SVD | Means | Reference |
| --- | --- | --- | --- |
| EndPoint | Valid | Valid | Valid |
| SeparateTrajectory | Valid | Invalid for direct fitting | Valid |
| AccumulatedTrajectory | Valid | Invalid for direct fitting | Valid |
| ONA EndPoint | Required and exclusive | Invalid | Invalid |

SVD is target-fitted. In trajectory models each observed Unit by Horizon step
participates once in the fitting population. The application reports uneven
step counts and does not silently apply equal-Unit weighting.

Means is target-fitted only on EndPoint so that each analytical Unit contributes
once. It requires a Group field and an explicit ordered contrast:

    MR1 direction = positive level mean - negative level mean

The two selected groups must be non-empty and contain a non-zero Unit. Identical
group means block the rotation. A group with only one Unit permits descriptive
rotation but blocks inference that requires within-group variance. Other Group
levels may be projected without contributing to MR1.

Reference rotation is exported only from a current, target-fitted Standard
EndPoint SVD or Means result. That fixed Endpoint center, full rotation matrix,
and node geometry may project EndPoint, SeparateTrajectory, and
AccumulatedTrajectory targets. The target does not refit axes or node
positions.

“Show endpoints only” is presentation state. It must never be represented as a
projection-fit population parameter.

## 4. Selected architecture

The selected architecture is:

    Editable Draft
        -> Structured Diagnostics
        -> Canonical Scientific Configuration
        -> Immutable Execution Plan
        -> Worker/jENA
        -> Bound Result

This was selected over:

- extending the current flat OpenEnaConfig with more nullable fields and
  conditionals; and
- maintaining two fully duplicated Standard and ONA workbenches.

The selected architecture provides strict family isolation without duplicating
the genuinely common dataset, UI shell, progress, and artifact infrastructure.

## 5. Workspace state

Schema v3 workspace state contains:

    {
      schemaVersion: 3,
      activeFamily: "standard" | "ona",
      drafts: {
        standard: StandardEnaDraftV3,
        ona: OrderedNetworkDraftV3
      },
      display: {
        standard: StandardDisplayDraft,
        ona: OrderedNetworkDisplayDraft
      },
      references: ReferenceRegistryState,
      activeResult: BoundOpenEnaResultV3 | null
    }

Rules:

- Drafts are independently preserved when the family changes.
- The application never converts or synchronizes scientific parameters merely
  because selected field names happen to match.
- An explicit “Copy field selections” action may copy Unit, Horizon, Code, and
  optional Group field candidates after an impact preview. It never copies a
  Window, order confirmation, Weighting, Model, Rotation, Reference, or ONA
  mask.
- Presentation state is separate from scientific state.
- Only the active family's draft is compiled.
- The inactive draft cannot affect the current result hash or report.

## 6. Draft versus canonical configuration

Draft is an editable, recoverable state and may contain empty selections,
invalid combinations, stale confirmations, missing legacy fields, or inactive
memories.

Canonical configuration exists only after the complete validation contract
passes. It contains no inactive values and is the only configuration accepted
by execution, result binding, export, reference compatibility, or methods
report generation.

An invalid draft never receives a partial canonical configuration and never
falls back to the last valid configuration.

## 7. Standard canonical shape

The Standard canonical object contains:

- schema version and analysis family;
- one or more Unit fields and optional stable Group metadata;
- one or more Horizon fields;
- at least three distinct Code definitions;
- Binary or Frequency weighting;
- a Window discriminated union;
- a Model/Rotation discriminated union;
- runtime policy and validation-contract identity.

The Window union is:

    MovingStanzaWindow {
      backward: finite positive integer | Infinity,
      forward: finite non-negative integer | Infinity,
      rowOrder: canonical row-order policy
    }

    Conversation {}

Conversation cannot carry active window extents or row order.

The Model/Rotation union is:

    EndPoint {
      rotation: SVD | Means | Reference
    }

    SeparateTrajectory {
      horizonOrder: canonical Horizon-order policy,
      rotation: SVD | Reference
    }

    AccumulatedTrajectory {
      horizonOrder: canonical Horizon-order policy,
      rotation: SVD | Reference
    }

The type system must make direct trajectory Means impossible to construct.

Reference configuration contains both referenceId and expectedContentSha256.
Reference centering is fixed by the reference and cannot be overridden by the
target.

## 8. ONA canonical shape

ONA uses a separate canonical type whose only scientific model is:

    {
      analysisFamily: "ona",
      model: EndPoint,
      window: {
        type: MovingStanzaWindow,
        backward: finite positive integer | Infinity,
        forward: 0,
        rowOrder: explicit ONA order
      },
      weighting: frequency/sum,
      rotation: SVD,
      directionalMask: canonical directional mask
    }

It has no Conversation window, forward control, trajectory, Horizon order,
Means, Reference, Standard weighting switch, or TMA data.

## 9. Strict serialization

- New canonical configurations write schema v3 only.
- Infinity is represented by an explicit discriminated sentinel, never JSON
  null or a JavaScript non-finite number.
- Decoders do not coerce strings to numbers, dates, or Booleans.
- Unknown discriminators and schema versions cannot execute.
- Canonical JSON uses deterministic key and array ordering.
- A SHA-256 configuration hash is recomputed after decoding.
- Unknown legacy content may be retained for inspection but is excluded from
  the compiler.
- Invalid drafts can be saved only as artifacts explicitly marked
  non-executable.

## 10. Validation and diagnostics

Validation stages are:

1. Decode draft.
2. Bind dataset and expire stale confirmations.
3. Validate field roles.
4. Build typed identities.
5. Validate value domains.
6. Validate Unit/Horizon/Group relationships.
7. Resolve row and Horizon ordering.
8. Validate Model, Window, Weighting, and Rotation combinations.
9. Validate Reference.
10. Validate numerical identifiability.
11. Estimate resources.
12. Produce canonical configuration.

Later stages do not emit derivative noise when a prerequisite failed. For
example, a missing Code field is not also reported as an all-zero Code.

Each diagnostic contains:

- a stable language-independent ID;
- severity: error, warning, or information;
- scope: dataset, Units, Horizons, Windows, Codes, Rotation, Reference,
  Resources, or Migration;
- field path;
- summary and detail;
- bounded evidence such as counts and a few source row numbers;
- the capabilities it blocks;
- optional suggested actions that always require confirmation.

Errors block model construction. Warnings may allow the core model while
blocking a specific downstream capability. Information explains a legitimate
structure.

Examples:

- fewer than three Codes: error, block modeling;
- shared Horizon: information;
- isolated Code: warning;
- Means group with one Unit: warning, block group inference;
- rank-one SVD: warning, block claims about a second dimension;
- incompatible Reference: error, block modeling;
- resource budget exceeded: error, block modeling.

Suggested actions are previewable atomic draft patches. They cannot silently
threshold Codes, fill missing data, split Horizons, add tie breakers, change
rotation, reduce windows, or restore defaults.

## 11. Numerical preflight

- All-zero observations block target fitting.
- A centered matrix of rank zero blocks SVD and Means fitting.
- Rank one permits a one-dimensional result with a strong warning; the
  application cannot invent a meaningful ENA2 axis.
- A Reference may project a rank-zero target because the axes already exist,
  but it reports the degenerate target.
- Rotation, node, point, and variance outputs must be finite.
- A requested display dimension must exist in the fitted or imported full
  rotation.

## 12. Resource preflight

Resource estimation includes:

- rows, Units, Horizons, and Codes;
- undirected adjacency dimensions n(n-1)/2;
- ONA directed dimensions;
- Horizon size distribution;
- backward/forward and Infinity window visits;
- forward buffering;
- trajectory steps;
- full rotation matrix;
- Reference projection;
- worker materialization and export size.

Hard-budget failure blocks execution. The application never truncates rows,
reduces Codes, narrows a window, converts Infinity, or samples data while
claiming to have run the requested model.

Worker allocation is checked again at runtime. A runtime resource failure
produces no partial scientific result.

## 13. Fail-closed state machine

States:

    NO_DATA
      -> EDITING_INVALID
      -> READY_TO_RUN
      -> RUNNING
      -> CURRENT_RESULT

Additional terminal or side states:

- STALE_RESULT;
- OBSOLETE_RUN;
- CANCELLED;
- EXECUTION_ERROR.

Scientific draft or dataset changes:

- expire matching confirmations as appropriate;
- mark an existing result stale;
- mark a running request obsolete and request cancellation;
- prevent a late obsolete result from becoming current.

Presentation-only changes do not cancel a run or alter result identity.

Stale results remain inspectable but cannot be exported as current, used for a
new inference under the edited draft, or described as if produced by the new
configuration.

## 14. Models UI

The Models workspace retains:

    Units | Horizons | Windows | Codes

No fifth Rotation tab is added. Windows contains Projection & Rotation; Units
contains the Group and Means contrast controls.

Every tab shows scoped error/warning state with accessible text. A compact
summary reports family, Model, Window, Weighting, Rotation, counts, and
Incomplete/Ready/Running/Current/Stale/Error status.

### 14.1 Remove unavailable controls

- Delete the Transmodal/Standard switch from Horizons.
- Delete the Transmodal/Standard switch from Windows.
- Delete the currently disabled Horizon column Hide/Exclude icons.
- Do not leave empty containers or explanatory placeholders.
- Do not expose advanced rotations.
- Any visible control must have a real, testable function.

### 14.2 Tab geometry and help

- The active blue line is flush with the top of the active tab.
- No gray strip or padding gap appears above the tab.
- Focus does not change tab height.
- The help “?” is either a real adjacent accessible button or explicitly
  decorative with a real panel-level help button. It cannot look interactive
  while doing nothing.
- Existing tab semantics and Arrow/Home/End keyboard navigation remain.

### 14.3 Units toolbar

The four buttons are:

1. Collapse all Group option panels.
2. Open all Group display/mean option panels.
3. Hide/restore all Group-derived presentation layers.
4. Exclude the active family's Group scientific configuration.

Collapse/Open affect disclosure state only and do not change any checkbox,
rotation, model, or result.

Hide stores a result-bound visibility snapshot, suppresses Group points, means,
intervals, labels, and applicable overlays, and restores the exact prior
snapshot. It is presentation-only and uses dynamic accessible naming and
aria-pressed.

Exclude clears the active family's Group draft and Means contrast. It does not
delete Units or source rows. If Means remains selected, the draft becomes
invalid; it does not auto-switch to SVD. The action makes the result stale and
offers a bounded Undo.

### 14.4 Horizons

The panel contains:

- ordered Horizon identity fields;
- typed Horizon previews;
- Unit by Horizon structure and shared-Horizon information;
- for trajectories, an explicit Horizon-order editor and per-Unit sequence
  preview.

Source-Horizon-order confirmation displays its bound dataset short hash and
expires visibly when the binding changes.

### 14.5 Windows

Standard controls:

- Model: EndPoint, SeparateTrajectory, AccumulatedTrajectory;
- Window: Moving Stanza or Conversation/Horizon;
- finite or Entire Horizon backward/forward extents;
- within-Horizon row order;
- Binary or Frequency;
- SVD, Means, or Reference;
- center alignment for target-fitted SVD/Means;
- fixed centering notice for Reference;
- execution-resource preview.

Finite extent uses strict integer input rather than the current limited slider.
Natural-language text explains the exact effective rows.

Switching to an incompatible model/rotation preserves the user's selection and
shows an error with explicit alternatives. It never auto-falls back.

### 14.6 Codes toolbar

The family selector remains functional and restores the selected family's
independent draft.

The two buttons are:

1. Hide/restore all selected Code nodes and incident network rendering,
   presentation only.
2. Exclude all Codes from the active scientific draft.

Hide stores and restores the exact prior per-Code visibility without changing
the canonical hash.

Exclude performs codes = [], never restores defaults, marks the result stale,
blocks Run, preserves other model settings, and offers a bounded Undo.

Each Code row exposes distinct visibility and exclusion controls. Dragging only
changes presentation order, not the Code inclusion set or scientific hash.

The empty state says that at least three Codes are required and confirms that
Units, Horizons, Windows, Order, and Rotation drafts remain preserved.

### 14.7 Disabled state

Disabled means that a real feature is not applicable to the present state. It
never means “not implemented.” Every disabled state supplies an accessible
reason.

### 14.8 Accessibility and localization

- Correct tab/list/dialog/popover semantics.
- Roving focus and complete keyboard operation.
- aria-pressed for visibility toggles.
- Accurate dynamic icon labels.
- Focus return after popovers/dialogs.
- Polite live announcements for configuration status, Exclude, Undo, stale,
  obsolete, cancel, and completion.
- Errors are associated with fields.
- State is not communicated by color alone.
- Layout works at narrow width and 200 percent zoom.
- All new strings enter the existing Open ENA locale catalog.
- Research field names and values are not translated.

## 15. Immutable execution plan

Canonical configuration compiles into a family-specific plan containing:

- dataset hash, row count, and header hash;
- configuration hash;
- validation and execution contract versions;
- runtime and algorithm build identities;
- resource estimate;
- identity and Code dictionaries;
- materialized execution rows;
- requested and resolved ordering;
- optional validated Reference binding;
- jENA adapter parameters;
- an execution-plan SHA-256.

Standard and ONA have different plan types and adapter entry points.

## 16. Collision-free runtime materialization

The compiler gives each Unit, Horizon, Code, and edge a plan-local internal
token. jENA receives these tokens rather than ambiguous delimiter-joined source
values or edge labels.

The plan retains reversible dictionaries to restore source field/value labels
in results and reports. Internal tokens never appear in user-facing exports.

Standard Code values are materialized by a strict, weighting-specific adapter.
The current generic coercion path is not reused for Standard v3.

## 17. Resolved ordering provenance

For Moving Stanza, every source row receives:

- sourceRowIndex;
- typed Horizon token;
- resolved order tuple;
- within-Horizon ordinal.

The mapping must be a complete, duplicate-free permutation and must never move a
row across Horizons.

For trajectories, provenance stores:

- each Horizon's resolved tuple;
- every Unit's actual ordered Horizon sequence;
- its trajectory ordinal;
- the absence of imputed steps.

Where an implementation-only secondary order is required for disjoint Horizons
with equal scientific order, it is recorded as implementation order and never
reported as a scientific tie breaker.

Conversation window records row order as not applicable. Any physical iteration
order is explicitly implementation-only.

## 18. Worker contract

The worker accepts only a schema-v3 execution plan, not a UI draft or a boolean
“already validated” flag.

Before jENA it verifies:

- schema and family;
- dataset, configuration, plan, runtime, and Reference hashes;
- complete row permutation;
- identity dictionaries;
- ordering proofs;
- Standard/ONA field isolation;
- resource estimate;
- Reference remapping.

Stages are verify-plan, materialize, accumulate, normalize, center,
rotate-or-project, position-nodes, validate-result, and complete.

Cancellation is cooperative at bounded work intervals. A scientific edit makes
the run obsolete; a late result cannot replace the current draft or result.

After jENA, the worker verifies model shape, step count, Code/edge basis,
finite matrices, rotation dimensions, node positions, variance, Reference
immutability, and family-specific network shape. Failure publishes no partial
scientific result.

## 19. Bound result

A successful result is bound to:

- normalized dataset SHA-256;
- canonical configuration SHA-256;
- execution-plan SHA-256;
- jENA runtime version;
- algorithm build SHA;
- validation and execution contract versions;
- Reference ID and content hash, if any.

A result is current only when all corresponding values match the currently
compiled plan. Presentation state is not part of this equality.

## 20. Execution provenance

The result records:

- dataset hash kind, hash, row count, and header hash;
- typed Unit, Horizon, and Group dictionaries;
- selected Codes and canonical undirected edge basis;
- source and runtime Code representations;
- requested and resolved row and Horizon order;
- complete source-index and Unit-sequence mappings;
- Model, Window, extents, boundary, Weighting, and normalization;
- SVD/Means/Reference projection details;
- fit population, target population, center vector, rank, full axes, and
  variance;
- estimated and observed resource summaries;
- warnings and capability blocks;
- runtime and contract versions.

Raw source rows are not copied into diagnostic logs. Full research tables are
exported only in explicitly selected analysis artifacts.

## 21. Reference v2

The new Reference artifact is:

- schemaVersion 2;
- kind open-ena-standard-reference-rotation;
- family Standard;
- source model EndPoint;
- content-addressed referenceId;
- immutable content SHA-256;
- exact runtime/build provenance;
- source dataset, configuration, and execution hashes;
- SVD or ordered Means fit metadata;
- Standard compatibility contract;
- typed Code/edge basis;
- center vector, full orthonormal rotation, eigenvalues as applicable, and
  fixed node positions.

Reference identity excludes file name, download time, and local display alias.

Only a current target-fitted Standard EndPoint SVD/Means result can mint a new
Reference. A result that was itself projected from a Reference may download the
original artifact but cannot launder it as a new fit.

### 21.1 Compatibility

Required compatibility:

- Standard family and Endpoint source;
- identical Code identity set and undirected edge basis;
- same Binary/Frequency semantics;
- same Window and effective extents;
- sphere normalization;
- same Unit and Horizon field contracts;
- for Moving Stanza, same row-order policy structure, comparator semantics,
  directions, levels, locale, and time-zone rules.

Allowed differences:

- target dataset and observed identities;
- number of observations;
- target Group distribution;
- target model type among all three Standard models;
- target Horizon-order policy for trajectories;
- presentation.

Fields with different names are not guessed or semantically mapped in this
release.

### 21.2 Basis remapping

If the target presents the same Codes in a different display/array order, the
application creates a one-to-one Code identity map and edge permutation,
reorders the Reference basis, center rows, and nodes, validates the result, and
records the permutation. Missing, duplicate, or ambiguous Code identities block
use.

### 21.3 Reference validation

Validate exact schema, kind, family, source model, content hash, dimensions,
finite values, Code and edge counts, unique axes, orthonormal matrix, valid
SVD eigenvalues or Means metadata, center-vector domain, node completeness, and
source hashes.

Reference failure never falls back to SVD or Means and never re-optimizes nodes.

### 21.4 Legacy references

Legacy Reference artifacts remain strictly readable as candidates. The
application computes the received artifact hash, lists missing provenance, and
requires explicit acknowledgement. It may use a legacy Reference only when
every required computational compatibility item can be proven. It cannot
invent missing hashes or reissue the artifact as a newly fitted v2 Reference.

## 22. Import and export

### 22.1 New artifact types

- Executable canonical config v3: only from a valid compiled draft.
- Non-executable draft v3: explicitly marked executable false.
- Analysis bundle v3: only from a current result.
- STALE audit bundle v3: explicitly named and records stale reasons.
- Standard Reference v2: only from a qualifying Endpoint fit.
- Methods Markdown: only from a bound result.
- Optional presentation artifact bound to an exact result hash.

### 22.2 Analysis bundle v3

The bundle contains:

- manifest;
- canonical configuration;
- execution provenance;
- model tables;
- full rotation;
- statistics and capability status;
- diagnostics;
- optional presentation;
- methods report;
- hashes for every component and the complete bundle.

Import verifies all component hashes and internal table/rotation contracts. A
tampered or inconsistent bundle can be inspected as raw data but cannot become
a verified result, drive inference, or mint a Reference.

### 22.3 Import behavior

- Config import becomes a draft and never auto-runs.
- Import previews changes before replacing the current draft.
- Dataset-bound confirmations never transfer to another dataset.
- Result import remains read-only unless the user explicitly loads its
  configuration as a draft.
- A result is current only if every binding matches; otherwise it is historical
  or stale.
- Reference import adds an immutable registry entry but does not select it or
  switch Rotation automatically.
- Failed import does not alter the current draft, result, or registry.

### 22.4 Import safety

Reject or bound oversized files, excessive depth, oversized matrices, long
strings, invalid finite values, duplicate or prototype-polluting fields,
unknown schema/kind, component substitution, and disguised Standard/ONA/model
types. Raw import payloads are not logged.

## 23. Methods report

Methods are generated only from the bound result and execution provenance, not
from the current UI draft.

The Standard report states:

- dataset hash, rows, runtime, and contract versions;
- Unit and Group fields, counts, and stability;
- Horizon fields, counts, shared Horizons;
- Codes and input representation;
- Binary/Frequency weighting;
- Window type, finite/Infinity extents, backward-includes-current and forward
  semantics;
- row-order and Horizon-order policies and actual resolved sequences;
- EndPoint/Separate/Accumulated semantics;
- missing steps not imputed;
- normalization and center policy;
- SVD rank/variance or Means contrast/direction;
- Reference source, fixed geometry, source fit, and target projection;
- warnings, capability blocks, and analyses not performed.

Means reports that MR1 separation is descriptive by construction, not
independent confirmation. Reference reports distinguish source fit population
from target projection population and label target variance accordingly.

ONA keeps its separate descriptive-only methods boundary.

## 24. Presentation artifact

Presentation may store hidden Codes/Groups, layer settings, colors, node
overrides, displayed axes, and 3D camera, all bound to the exact result hash.

It cannot change scientific tables. A mismatched presentation may be retained
as an unapplied preset but cannot be silently applied to another result.

## 25. Migration strategy

Use dual-read, single-v3-write, staged cutover:

1. Freeze Git, test, browser, Standard sample, trajectory sample, ONA, Reference,
   and bundle baselines.
2. Add v3 types, strict decoders, serialization, typed identities, and migration
   without changing execution.
3. Add diagnostics, compiler, ordering, and resource estimator as pure modules.
4. Add the Standard v3 adapter and all six combinations.
5. Add Reference v2.
6. Add the plan-only worker and bound results.
7. Upgrade exports and downstream consumers.
8. Switch the Models UI.
9. Wrap ONA in its canonical plan without changing the algorithm.
10. Remove the old flat-config write path only after all gates pass.

Legacy Standard Moving Stanza imports lack a v3 row-order contract and remain
invalid until the user chooses fields or confirms source order. Legacy
trajectory imports likewise require Horizon-order review. Legacy Means may
prefill an unconfirmed two-level candidate but cannot choose MR1 direction for
the researcher.

Old artifacts are never overwritten in place.

## 26. Test-first implementation

Every implementation task follows red, green, refactor:

1. Write the focused failing test.
2. Confirm it fails for the intended missing behavior.
3. Implement the minimum correct behavior.
4. Run focused and related suites.
5. Refactor while green.
6. Run the full gate before completion.

Expected values are not changed merely to accept unexplained numerical drift.

## 27. Test matrix

### 27.1 Schema and identity

- Empty and incomplete drafts.
- Strict canonical decoding and exact fields.
- Both Infinity sentinels.
- Stable JSON and hashes.
- Number/string and delimiter-collision identities.
- Locale-independent identities.
- Internal token uniqueness and reversibility.
- TMA and advanced-rotation rejection.

### 27.2 Diagnostics

Every stable diagnostic ID receives a direct test of severity, scope, blocked
capabilities, evidence bounds, and suggested-action confirmation. Prerequisite
failure must suppress derivative diagnostic noise.

### 27.3 Units and Horizons

- Single and composite Units/Horizons.
- Missing identities.
- Stable and unstable Group.
- Impact preview for adding Group to Unit.
- Shared Horizons with multiple Units.
- Unit by Horizon counts.
- Target-fit single-Unit failure and single-Unit Reference projection.

### 27.4 Codes and Weighting

- Every accepted and rejected Binary representation.
- Every accepted and rejected Frequency representation.
- Explicit Boolean materialization provenance.
- Fewer than three, exactly three, all-zero, isolated, duplicate, and no-global
  co-occurrence cases.
- Role collisions and removed fields.
- Individual and bulk exclude with Undo.
- Display reorder not changing the scientific hash.

### 27.5 Window oracle

An independent small direct oracle tests:

- back 1, finite back, finite forward;
- backward Infinity;
- forward Infinity;
- both Infinity;
- Conversation;
- Horizon boundary isolation.

The oracle must not call the production window implementation.

### 27.6 Order

- Every comparator type and direction.
- Composite keys.
- Missing, parse failure, unknown levels, and ties.
- Explicit tie breakers.
- Source confirmation and expiration.
- Row-order permutation invariance for explicit orders.
- Expected sensitivity for source-order-confirmed models.
- Horizon stability, per-Unit uniqueness, and shared time values across Units.

### 27.7 Trajectory

- Separate and Accumulated semantics.
- Missing steps without imputation.
- Single-step Unit warning and no-path error.
- Changing Separate order changes path/provenance but not step networks.
- Changing Accumulated order changes step vectors.
- Post-fit accumulated order lock.
- All observed steps included once in target SVD.
- Endpoints-only presentation not changing the result hash.

### 27.8 All six combinations

Every Model by Window combination has non-skipped Binary, Frequency, SVD,
configuration-round-trip, execution-plan, result-binding, and methods coverage.
Pairwise tests cover finite/Infinity and other interactions without creating an
unmaintainable full Cartesian suite.

### 27.9 Rotation

- SVD for all three models, rank zero, rank one, full matrix, variance, and sign
  handling.
- Means EndPoint, explicit direction, other projected Groups, empty/non-zero
  groups, identical means, small-group inference block, and direct trajectory
  rejection.
- SVD and Means Endpoint References projected into all three Standard targets.
- Reference content/basis/window/weight/order/mapping mismatch.
- Code order remapping.
- Matrix, center, node, hash, and legacy validation.
- No fallback.
- Advanced rotations absent from schema and UI.

### 27.10 Execution and concurrency

- Stable hashes.
- Display changes not affecting the plan.
- All scientific changes affecting the plan as appropriate.
- Complete source-row permutation.
- Plan-tampering rejection.
- Family-field isolation.
- Cancel, obsolete, late result, runtime error, resource abort, forward-Infinity
  cancellation, and cleanup.

### 27.11 Migration and artifact security

- Config, bundle, and Reference legacy fixtures.
- No invented confirmations.
- No auto-run.
- v3 single-write.
- Component-hash and structure validation.
- Size, depth, matrix, non-finite, prototype, unknown-kind, and disguised-family
  attacks.

### 27.12 Downstream consumers

Group inference, longitudinal analysis, contrasts, AI interpretation, Data View,
2D/3D plotting, and exports read the bound result, respect capability blocks,
distinguish stale state, preserve Reference provenance, and never leak internal
tokens.

## 28. rENA and jENA parity

Keep the existing rENA 0.3.1 golden suite as a versioned baseline. Do not
overwrite it or weaken it to shape-only comparisons.

Add an independent current, officially sourced, version-pinned rENA suite. Its
manifest records exact rENA package version and/or commit, R version, platform,
dependency versions, generator script hash, and generation time.

Compare:

- row and Unit/step connection counts;
- Binary and Frequency;
- finite/back/forward/Infinity/Conversation windows;
- all three models;
- sphere normalization and centering;
- SVD and Means;
- points, nodes, full rotation, and variance;
- Reference projection.

Discrete accumulation is exact where possible. Floating comparison uses a
strict documented tolerance. SVD signs are aligned deterministically. Repeated
eigenvalue subspaces compare invariant subspaces or distances rather than
arbitrary basis columns. Means MR1 direction is fixed and cannot be excused as
an arbitrary sign.

Required core Standard parity fixtures must exist and run. Their absence is a
skip and prevents a claim of complete scientific verification.

## 29. ONA non-regression

Run the complete existing ONA suites for family selection, order, masks,
finite/Infinity backward windows, forward zero, sum, directed adjacency,
response-node summaries, SVD, node geometry, 2D/3D, export, methods, and
capability gates.

Public baseline connection counts, line weights, points, rotations, nodes,
summaries, and provenance must remain equal under existing tolerances. Any
change is presumed to be a regression unless separately designed and approved.

A missing private/external fixture is reported as skip, never pass, and is not
added to Git.

## 30. Browser acceptance

Add a dedicated real served-browser Models-v3 journey and run affected existing
Open ENA smokes.

Acceptance covers:

- no gray gap above the selected Model tab;
- no Transmodal controls in Horizons or Windows;
- no empty space where those controls were;
- no disabled fake Horizon controls;
- all Units and Codes bulk controls;
- exact visibility restore;
- true Group/Code exclusion and Undo;
- Codes remaining empty after Exclude all;
- stale/current/obsolete behavior;
- finite and Infinity inputs;
- explicit row and Horizon order;
- Binary/Frequency incompatibility;
- all three Models;
- Means direction and trajectory rejection;
- Endpoint References projected into all three targets;
- Standard/ONA draft isolation;
- wide, narrow, keyboard, focus, accessible-name, live-region, and console/page
  error checks.

## 31. Accessibility and internationalization acceptance

- Correct WAI-ARIA tab behavior.
- Keyboard-complete icon, disclosure, picker, order, dialog, and Undo controls.
- Accurate dynamic labels and aria-pressed.
- Visible focus and focus return.
- Field-associated diagnostics and non-color-only state.
- Reflow at narrow width and 200 percent zoom.
- Reduced-motion compatibility.
- Identical Open ENA locale key sets.
- No hard-coded English on non-English routes.
- Research data values remain untranslated.

## 32. Verification commands

At minimum run:

    npm run jena:verify
    npm run test:app
    npm run typecheck:app
    npm run build:app
    npm run test:browser:open-ena-models-v3
    npm run verify

Also run every affected existing Open ENA browser smoke, including node drag,
Standard 3D, ONA 3D, longitudinal, accessibility/performance, and inference
when their consumers change.

Pass, fail, and skip are reported separately. Focused tests are not presented as
the full gate. Build success is not browser success.

## 33. Definition of done

Local development is complete only when:

- the complete approved Standard methodological contract is implemented;
- ONA remains isolated and non-regressed;
- every fail-closed behavior is enforced without fallback or coercion;
- schema v3, execution plan, hashes, provenance, Reference v2, artifacts, and
  methods reports are implemented;
- all visible Models controls are real and accessible;
- Exclude all truly clears its active scientific configuration;
- TMA and advanced rotations are absent;
- required parity fixtures actually run;
- the dedicated browser journey passes;
- npm run verify passes;
- any external/private skip is explicitly separated from pass.

Completion reporting distinguishes:

- local files;
- local commit and exact SHA;
- remote branch and remote SHA;
- pull request and merge;
- deployment;
- production verification.

No push, PR, merge, deployment, or production write occurs without explicit
authorization.

## 34. Source and implementation anchors

Primary method references:

- rENA accumulation documentation:
  https://rdrr.io/cran/rENA/man/ena.accumulate.data.html
- rENA set and projection documentation:
  https://rdrr.io/cran/rENA/man/ena.make.set.html
- rENA Means rotation documentation:
  https://rdrr.io/cran/rENA/man/ena.rotate.by.mean.html
- Official rENA repository:
  https://gitlab.com/epistemic-analytics/qe-packages/rENA
- Conversational grain-size article:
  https://learning-analytics.info/index.php/JLA/article/view/5416

Current local anchors to migrate:

- lib/open-ena/types.ts
- lib/open-ena/csv.ts
- lib/open-ena/network-config.ts
- lib/open-ena/analyze.ts
- lib/open-ena/jena.worker.ts
- lib/open-ena/reference.ts
- lib/open-ena/export.ts
- lib/open-ena/methods.ts
- lib/open-ena/longitudinal.ts
- components/open-ena/OpenEnaWorkspace.tsx
- components/open-ena/OpenEnaOfficialModelControls.tsx
- components/open-ena/OpenEnaGroupDisplayControls.tsx
- packages/jena-js/src/performance.ts
- packages/jena-js/src/model.ts
- packages/jena-js/src/core/validate.ts
- packages/jena-js/fixtures/goldens/sena-configs.generated.json
- packages/jena-js/scripts/regen-goldens-rstudio.R

## 35. Approval record

The user approved, in order:

1. Unit/Horizon sharing and fail-closed identity rules.
2. Binary/Frequency, all-zero/isolated/duplicate Code behavior, minimum three
   Codes, and true Exclude all.
3. All six Standard Model/Window combinations and finite/Infinity windows.
4. SVD, Means, and Reference scope, including Endpoint-only direct Means and
   Endpoint Reference projection into all three Standard models.
5. Architecture B: Draft -> Diagnostics -> Canonical Config -> Execution Plan.
6. Formal design Section 1: data model and schema.
7. Formal design Section 2: validation, diagnostics, and state machine.
8. Formal design Section 3: Models UI and bulk controls.
9. Formal design Section 4: execution, Reference, provenance, and artifacts.
10. Formal design Section 5: migration, testing, parity, browser acceptance,
    and completion boundaries.

The next gate is written-spec review. After the user reviews this file, create a
separate implementation plan using the writing-plans skill. Do not begin
business-code implementation before that review.
