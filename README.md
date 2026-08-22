# ENA.HK

The [Epistemic Network Analysis Hub of Knowledge](https://www.ena.hk).

## Structure

The site follows the public information architecture of AIEDHK while using an original ENA identity and content model:

- Home
- Mission
- Open ENA
- News
- Academy
- About

News is a reviewed collection of ENA research summaries. Academy is a progressive
tutorial collection with searchable track and level filters, localized index and detail
interfaces, an English reviewed-content fallback, and downloadable synthetic practice
data for learning the ENA workflow.

Open ENA is a browser-based research workspace powered by the pinned
`jena-js` runtime. It accepts coded CSV or XLSX data and keeps the standard two-dimensional
ENA view selected by default. The in-place interactive 3D ENA view displays the same
fitted jENA coordinates, nodes, networks, means, and trajectories. Switching between
2D and 3D changes presentation only: it does not rerun or refit the analysis, and the
displayed geometry remains descriptive rather than inferential evidence.

The researcher workspace currently provides:

- endpoint, separate-trajectory, and accumulated-trajectory ENA models with binary code columns;
- ordered, multi-column unit and conversation identities;
- optional comparison groups, including multi-group SVD and jENA one-way F summaries;
- an ordered Primary-versus-Secondary endpoint contrast for any selected pair within a two-to-six-group result, rendered as fixed-geometry Comparison, Primary, and Secondary panels with equal-unit mean networks and signed Primary-minus-Secondary edge differences;
- moving-stanza or whole-conversation windows, including backward and forward context;
- binary or summed-product edge weighting;
- SVD rotation or two-group means rotation, with optional pinning of zero-network units to the origin;
- reusable endpoint reference rotations for projecting independent datasets into the same fitted jENA geometry;
- an in-memory Sets workspace that retains up to six endpoint analyses in one exact reference geometry, assigns Primary and Secondary sets, and renders stable comparison/primary/secondary plots with signed Primary-minus-Secondary edge differences;
- linked 2D and interactive WebGL 3D unit, directed trajectory, group-mean, and network views in the same fitted jENA space, with selectable axes, relative edge filtering, point scaling, zoom/fit, camera controls, axis flips, and optional unit/variance labels;
- cohort-aware longitudinal group-centroid paths for separate and accumulated trajectory results, with an explicit repeated-entity field, a reviewable/reorderable period sequence, Available versus Complete cohort policies, equal-weight entity-period centroids, missing-period gaps, and per-period inclusion diagnostics;
- standalone SVG and 3x-resolution PNG figure export for the current 2D research view, plus PNG capture from the interactive 3D mode bar;
- jENA dimension summaries, correlations, Welch/ANOVA test statistics, and absolute Cohen's d for datasets within the automatic diagnostics limit;
- researcher-triggered, design-matched rank inference for independent endpoint groups, independent groups at one selected trajectory period, paired trajectory periods, and three-or-more-period repeated trajectories, with raw and Holm-adjusted p-values from one frozen inference result;
- a local source-evidence browser with text search and active-code filtering that keeps raw source rows out of model exports;
- an optional, researcher-triggered GPT-5.6 Luna interpretation of a reviewed, anonymized aggregate evidence request through a server-only OpenRouter connection;
- inspectable and downloadable coordinates, pre-normalization connection counts, line weights, centroids, node positions, adjacency keys, a derived analysis bundle with the full rotation set, a reusable reference-rotation package, and an analysis manifest.

Open ENA follows the pinned jENA 0.6.2 plotting defaults for scientific data
marks: the first/positive network is blue (`#3366cc`), the second/negative
network is red (`#dc3912`), and network edges and trajectory paths are solid.
Marker shapes, signed values, accessible labels, and tables provide redundant
group and direction cues. Dashed strokes are reserved for neutral coordinate
guides, not ENA connections or trajectories. This also preserves rENA's
standard Primary-blue, Secondary-red, solid-line subtraction convention.

Endpoint models expose jENA's descriptive, group-test, and point-centroid diagnostic
summaries. Trajectory models preserve ordered unit-conversation steps and directed
paths; endpoint group tests and correlations are not silently reused for repeated
trajectory observations. jENA's statistical helper reports test statistics and
degrees of freedom but does not calculate p-values.

### Inferential comparison contract

Open ENA does not run an inferential test automatically. In the Comparison workflow,
the researcher selects the study design, confirms the composite repeated-entity identity
for a trajectory design, reviews the candidate/included/missing/zero ledger, and then
clicks **Run inferential comparison**. The selected design determines the method; there
is no arbitrary statistical-method selector.

1. **Independent endpoint groups — Mann–Whitney U.** The selected Primary and Secondary
   groups are compared in the fitted endpoint coordinates. Because an endpoint result
   has no longitudinal time mapping, Open ENA does not claim that the endpoint groups
   were observed in the same period.
2. **Independent groups at one selected trajectory period — Mann–Whitney U.** Only the
   compact entity-period points from the selected period and two disjoint groups enter
   the comparison; other periods do not enter its inferential sample.
3. **Paired periods — Wilcoxon signed-rank.** Within one selected group, the composite
   identity pairs the same entity across two periods using a pairwise-complete cohort.
   Differences and effect direction are fixed as later minus earlier; complete zero
   differences remain in matched/zero diagnostics but are excluded from signed ranks.
4. **Repeated periods — Friedman plus all-pairs Wilcoxon signed-rank.** Within one
   selected group and at least three periods, Friedman and every period-pair follow-up
   use the same all-period-complete cohort; follow-ups are produced regardless of the
   omnibus p-value.

All Mann–Whitney and Wilcoxon pairwise comparisons are fixed to two-sided tests.
The non-directional Friedman omnibus uses its inclusive upper tail. All four paths
use an **auto exact-first** p-value policy and **Holm** multiplicity correction;
signed-rank rows use the **Wilcox zero** method.
Each estimable planned member retains raw p as an audit value and presents the
Holm-adjusted p as the primary p-value. Not-estimable planned members retain null
raw/Holm p values while remaining in the planned family size.
Stats, inference CSV/JSON, Methods, and AI review consume the same frozen inference
result instead of recomputing separate statistics.

### Longitudinal plot and inference independence

The longitudinal group-centroid overlay is a descriptive view derived from a
successful jENA trajectory model. Available and Complete control only the descriptive plot
cohort; they do not filter the all-period comparison frame. Axis flips, labels, zoom,
scaling, and display toggles do not change the inferential sample, statistics, effect
direction, or p-values. Changing the confirmed identity, time order, selected group,
periods, axes, model result, or provenance invalidates the prior inference and requires
an explicit rerun.

Separate trajectories permit a researcher-selected period order. Accumulated trajectories
are instead locked to a source encounter order that must agree with every analytic unit's
fitted jENA step sequence, because each accumulated point contains its preceding network
history. Duplicate entity-period projected steps are first averaged to one equal-weight
entity-period point before either descriptive aggregation or inferential slicing. Missing
group-period centroids and adjacent centroids with zero
shared repeated entities create visible discontinuities and are never bridged. Individual
plot marks are deterministically stratified by group and visibly disclosed when sampled;
the scientific group-centroid path is never sampled. Dedicated JSON and CSV exports preserve cohort counts, movement,
the complete fitted rotation geometry, source hash, model timestamp, configuration,
and reference-projection lineage while excluding raw source rows and repeated-entity
identifiers.

The rank procedures assume that independent groups, matched entities, or complete
repeated-entity blocks are independent of other analytic units at the corresponding
design level. Clustered observations and cluster-robust inference are out of scope,
and mixed-effects models are out of scope. The resulting associations do not establish
causality, learning gains, or practical importance. Accumulated-trajectory comparisons
are additionally path-dependent because a later point contains its preceding network
history; fitted-axis sign and MR1 group-separation geometry also constrain interpretation.

Reference projection is endpoint-only in this release. The imported reference must
match the code names and order, window method and effective spans, weighting,
normalization, and zero-network handling. The reference center, axes, and node
positions stay fixed. Variance reported for the projected result describes the new
dataset in that fixed basis and must not be interpreted as the fitted reference
sample's explained variance. Reference-projected point-centroid correlations and
target-fitted centroid exports are withheld because jENA 0.6.2 retains target-fitted
centroids while the displayed nodes are fixed from the imported reference. Reference
packages preserve whether the fitted axis was SVD or MR1 and, for MR1, the defining
comparison field and group order.

The current visual comparison workspace supports up to six groups. A derived
model-size budget also combines row count, unique units, and the number of code-pair
edges, preventing configurations whose intermediate jENA tables would exceed a safe
browser envelope even when the CSV itself is within the 20,000-row file limit. CSV
ingestion also stops at 256 total columns before constructing row objects, and initial
model inference selects at most the first 30 eligible binary code columns. Column
headers and imported reference code names are limited to 256 characters to prevent
quadratic edge-name expansion from oversized labels.

The retained Sets workspace is separately capped at six analysis sets. Each snapshot
keeps endpoint coordinates and one equal-unit mean per edge rather than duplicating
the full unit-by-edge table. Plots deterministically show at most 2,000 unit points
per set while comparison calculations and exports retain every captured endpoint
unit. Shared-comparison JSON carries one canonical fitted-reference provenance object
and exact geometry. It excludes raw rows but retains analytic-unit identifiers, so
researchers must pseudonymize identifiers before sharing when required.

The current-result group contrast keeps one coordinate domain from the full endpoint
result while the selected pair changes. The Comparison panel draws each nonzero
Primary-minus-Secondary edge difference once, using blue for Primary-stronger edges,
red for Secondary-stronger edges, and the maximum absolute difference as its denominator.
The Primary and Secondary panels retain their complete group-mean networks on one shared
mean denominator. Whenever Unit circles are enabled, every selected group's analytic-unit
projection is shown persistently as a small group-colored circle in the Comparison panel
and its matching side panel; larger group-colored squares mark the two group means. Plotting
retains the jENA coordinates and deterministically samples only when a group exceeds 2,000
valid points. The ranked evidence table and exports retain the ordered signed differences.
Dedicated contrast JSON records both denominators, the active figure controls, the
unflipped statistical coordinate system, the ordered pair, and the original rotation-fit
provenance. It excludes raw rows but retains analytic-unit and group identifiers.

The pairwise point-centroid correlation helper scales quadratically, so Open ENA runs
the complete jENA statistics helper automatically only through 500 units. Larger
models still return the ENA model and linear dimension/group summaries; the interface
labels the omitted diagnostics. Trajectory export tables include a stable point index
and conversation-step identity so standalone CSVs remain joinable. Result bundles
intentionally exclude raw source rows, row-level co-occurrence records, and unselected source columns, so researchers must
preserve the exact source CSV and codebook with the manifest and derived outputs.
Derived tables still retain selected analytic-unit and group identifiers and, for
trajectories, selected conversation identifiers. Pseudonymize those fields before
sharing when required; “raw-row-excluding” does not mean anonymous.
CSV exports prefix spreadsheet-active string cells with an apostrophe while leaving
numeric scalar values unchanged.

### Optional AI-assisted interpretation

AI interpretation is disabled unless the server is configured with
`OPEN_ENA_AI_ENABLED=true` and a server-only `OPENROUTER_API_KEY`. The default
provider URL is `https://openrouter.ai/api/v1` and the default model is
`openai/gpt-5.6-luna`. `OPEN_ENA_AI_MODEL` may select another OpenRouter model,
but the provider URL is intentionally restricted to the official HTTPS OpenRouter
API so a configuration mistake cannot send the bearer key to another host. Copy
`.env.example` to a local ignored environment file and never use a `NEXT_PUBLIC_*`
variable for the provider key. AI requests also require an explicit Open ENA
username, a password of at least 12 characters, and an independent session secret
of at least 32 characters; the source-code fallback login is not accepted by the AI
route.

The core ENA model and raw source rows remain in the browser. The AI request is not
automatic: Stats & Export first shows the exact versioned aggregate JSON, and the
researcher must review it, explicitly consent, and press Generate. The server route
accepts only the strict aggregate schema. It excludes raw rows, source filenames,
group names, analytic-unit identifiers, conversation identifiers, and per-unit
coordinates. AI output is descriptive, evidence-referenced, and must not be treated
as statistical inference or a substitute for the codebook, coded evidence, research
design, or researcher review. To prevent aggregate centroids from degenerating into
individual records, every exported AI group and non-missing trajectory group-period
must contain at least three entities. The route limits each session to six requests
per minute, caps provider output at 1,800 tokens, propagates browser cancellation,
and bounds both request and response bodies. Configure a provider-side OpenRouter
budget as the durable production cost ceiling; the in-process limiter is only a
local abuse-control layer and is not a distributed deployment quota.

## Open-source distribution gate

`jena-js` 0.6.2 is licensed `GPL-3.0-only` and is bundled into the browser-facing
Open ENA application. Before publishing this feature, the repository owner must
record and implement a GPL-3-compliant source-distribution and site-licensing plan,
or obtain qualified licensing advice and permissions covering every relevant
rightsholder, including any upstream-derived portions.
The in-product attribution and source link are necessary disclosures, but are not
by themselves a complete licensing decision.

The interface supports the same 14 languages as AIEDHK: English, Traditional Chinese,
Simplified Chinese, Spanish, French, Portuguese, German, Arabic, Korean, Japanese,
Hindi, Russian, Indonesian, and Bengali.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The root route redirects to `/en`.

## Validation

```bash
npm run verify
```

This runs the content and route contract tests, TypeScript validation, and the production Next.js build.

## Deployment

The canonical deployment target is the Vercel project `ena` under the owner's existing team. Both `www.ena.hk` and `ena.hk` are attached to production, while site metadata uses `https://www.ena.hk` as the canonical URL.
