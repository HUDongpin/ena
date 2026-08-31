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
ENA view selected by default. Its 2D and interactive 3D presenters use the same fitted
jENA result, while ENA and longitudinal trajectory marks remain on separate research
surfaces. Switching between 2D and 3D changes presentation only: it does not rerun or
refit the analysis, and the displayed geometry remains descriptive rather than
inferential evidence.

Generic 2D and 3D ENA presenters show codes, network edges, unit points, and group means without trajectory paths, arrows, or time-point labels.
The dedicated longitudinal trajectory presenter shows fitted code references, participant-period points, square centroids, black paths, and midpoint direction arrows without ENA mean-network edges.

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
- linked 2D and interactive WebGL 3D projections within each strict presenter boundary, with selectable axes, point scaling, zoom/fit, camera controls, axis flips, and optional labels;
- cohort-aware longitudinal group-centroid paths for separate and accumulated trajectory results, with an explicit repeated-entity field, a reviewable/reorderable period sequence, Available versus Complete cohort policies, equal-weight entity-period centroids, missing-period gaps, and per-period inclusion diagnostics;
- standalone SVG and 3x-resolution PNG figure export for the current 2D research view, plus PNG clipboard capture from each interactive 3D plot toolbar;
- jENA dimension summaries, correlations, Welch/ANOVA test statistics, and absolute Cohen's d for datasets within the automatic diagnostics limit;
- researcher-triggered, design-matched rank inference for independent endpoint groups, independent groups at one selected trajectory period, paired trajectory periods, and three-or-more-period repeated trajectories, with raw and Holm-adjusted p-values from one frozen inference result;
- a local source-evidence browser with text search and active-code filtering that keeps raw source rows out of model exports;
- an optional, researcher-triggered GPT-5.6 Luna interpretation of a reviewed, anonymized aggregate evidence request through a server-only OpenRouter connection;
- inspectable and downloadable coordinates, pre-normalization connection counts, line weights, centroids, node positions, adjacency keys, a derived analysis bundle with the full rotation set, a reusable reference-rotation package, and an analysis manifest.

Open ENA follows the pinned jENA 0.7.0-ona.0 plotting defaults for scientific data
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
target-fitted centroid exports are withheld because jENA 0.7.0-ona.0 retains target-fitted
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
The Primary and Secondary panels retain their displayed group-summary networks on one
shared mean denominator. By default, every selected group's analytic-unit projection is a
small group-colored circle in the Comparison panel; the side panels remain mean-network
views, and larger group-colored squares mark enabled group means. Model → Units can hide
one group or individual unit marks and independently show each group's mean and marginal
95% Student-t confidence guides. The optional rENA-compatible mean-centered 1.5 × IQR
outlier guide is available in 2D only and does not remove points. Hidden unit marks remain
hidden: Include Hidden Points only chooses whether display-derived means, intervals, and
group-summary networks include those units. These controls are display-only and do not
change the fitted jENA result, Stats, inference, rotation, or result identity. Plotting
retains the jENA coordinates and deterministically samples only when a group exceeds 2,000
valid points. The ranked evidence table and exports retain the ordered signed differences.
Dedicated contrast JSON records both denominators, the active figure and group-display
controls, the unflipped statistical coordinate system, the ordered pair, and the original
rotation-fit provenance. It excludes raw rows but retains analytic-unit and group identifiers.

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

Before opt-in, the workspace identifies the actual OpenRouter gateway and model,
the aggregate-only payload boundary, the endpoint-specific Zero Data Retention
(ZDR) caveat, downstream model-provider/subprocessor retention and training
policies, the non-fixed processing region, and the minimal hash-bound consent
receipt. Every generation sends the request-level routing constraints
`provider.zdr=true` and `provider.data_collection="deny"`; when no endpoint
satisfies both controls, the request fails closed rather than falling back to a
non-ZDR or data-collecting endpoint. These fields record the application's routing
requirements, not a downstream-provider attestation. OpenRouter and downstream
endpoint policies are external configuration facts; the interface deliberately
does not promise a region or retention period that the deployment cannot prove.

Vercel Web Analytics is an optional, aggregate-only service in the site shell.
It is disabled until the visitor explicitly enables it in the footer disclosure,
and the same control can disable future events. The disclosure names the Vercel
provider and documented page-view fields, notes the documented 24-hour disposal
of the visitor-session hash, and states that event retention, processing region,
and a provider-issued per-event audit receipt are not established by this
repository. The authenticated Open ENA workspace keeps analytics disabled even
when a public-site preference is granted. The local preference contains no
account or dataset identifier.

The core ENA model and raw source rows remain in the browser. The AI request is not
automatic: Stats & Export first shows the exact versioned aggregate JSON, and the
researcher must review it, explicitly consent, and press Generate. The server route
accepts only the strict aggregate schema. It excludes raw rows, source filenames,
group names, analytic-unit identifiers, conversation identifiers, and per-unit
coordinates. AI output is descriptive, evidence-referenced, and must not be treated
as statistical inference or a substitute for the codebook, coded evidence, research
design, or researcher review. To prevent aggregate centroids from degenerating into
individual records, every exported AI group and non-missing trajectory group-period
must contain at least three entities. The route uses the configured durable
per-account request limit, caps provider output at 1,800 tokens, propagates browser cancellation,
and bounds both request and response bodies. Configure a provider-side OpenRouter
monthly budget and the versioned billable policy, including
`OPEN_ENA_BILLABLE_REQUESTS_PER_MINUTE`,
`OPEN_ENA_AI_MAX_RESERVATION_MICRO_USD`, and
`OPEN_ENA_LONGITUDINAL_MAX_RESERVATION_MICRO_USD`, as durable production limits.
Before each provider request, the server verifies the key's monthly limit and
remaining allowance, reserves the configured maximum, and settles strictly
reported provider cost in micro-USD. Production quota and spend decisions come
only from the PostgreSQL-backed stable account principal; a new login token or a
different application instance does not create a fresh quota bucket.
Each explicit AI generation also carries a browser-created operation ID. A failed
transport retry reuses that ID (including after a login-token rotation), so an
already-accounted provider operation is rejected instead of dispatched twice;
a later deliberate generation receives a new operation ID.
Operators must set each maximum reservation to a conservative worst-case cost for
the configured model, bounded request, and output-token cap. Any provider-reported
cost above that reservation is still accounted, blocks later work above the local
ceiling, and emits a deduplicated `reservation-overrun` review alert.

## Open-source distribution gate

`jena-js` 0.7.0-ona.0 is licensed `GPL-3.0-only` and is bundled into the browser-facing
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

### SEC-01 operator and migration notes

The billable AI and longitudinal routes require a verified durable v2 or v3 session principal and a configured billing policy. They fail closed when the account ID, database/policy values, or provider hard-cap check is absent or malformed. Apply `migrations/001_open_ena_billable.sql` with a PostgreSQL operator before enabling a durable deployment; the migration uses server UTC time and idempotent reservation keys. Configure the OpenRouter `/key` monthly hard limit at or below both the provider and global ceilings. Security alerts are redacted and written to the outbox; an HTTPS webhook delivery worker may consume that outbox.

Open ENA authentication also requires the shared PostgreSQL security migration
(`migrations/002_open_ena_auth_security.sql`) and `OPEN_ENA_AUTH_DATABASE_URL`.
Every login attempt is bounded to 16 KiB before URL-encoded parsing and consumes
durable source/account attempt windows; a database outage fails closed. Login
uses a five-attempt per attributed source ceiling and a ten-attempt fallback
account ceiling within a 15-minute window.
Set `OPEN_ENA_TRUSTED_CLIENT_IP_HEADER` only to a header that an operator-owned
edge proxy forcibly rewrites or strips; an arbitrary client-supplied IP header is
not a trust boundary. If that guarantee is unavailable, leave it blank so every
request uses the shared account ceiling.
The static account issues a randomly identified v2 session. Logout records that
session's `jti` in the shared revocation table before clearing the cookie, and
page, AI, and longitudinal requests reject revoked tokens. Set
`OPEN_ENA_PUBLIC_ORIGIN` (and,
when needed, the comma-separated `OPEN_ENA_ALLOWED_ORIGINS`) to operator-owned
`http`/`https` origins in production. The request validator never trusts
`Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, or `Forwarded` as an origin or
redirect authority; a production deployment without an explicit origin list
fails closed.

Operator-created, one-time release test accounts additionally require
`migrations/004_open_ena_disposable_accounts.sql`. The application sends only a
domain-separated HMAC username reference to PostgreSQL and verifies a fixed-parameter
scrypt password derivation; raw usernames, raw passwords, cookies, and session tokens
are not stored. A successful conditional database update consumes the account exactly
once across serverless instances. The resulting disposable principal uses a separate
15-minute v3 session while the static account retains its existing 12-hour v2 semantics.
Provision these rows only through a controlled operator process; this migration does
not create a public registration or provisioning endpoint.

Run the operator in two phases so migration 004 is committed on the target database
before deploying the auth code that reads it. `vercel env run` injects Production
variables into the child process without creating a local environment file:

```bash
vercel env run --environment=production -- \
  node scripts/run-open-ena-production-auth-operator.mjs --mode=migration

# Run only after the exact Git SHA is deployed and Production is READY.
vercel env run --environment=production -- \
  node scripts/run-open-ena-production-auth-operator.mjs \
  --mode=proof \
  --expected-final-git-sha=<40-hex-git-sha> \
  --deployment-id=<dpl-id>
```

Each command emits one redacted JSON receipt. The proof receipt deliberately marks
its supplied SHA and deployment ID as `EXTERNAL_CROSS_CHECK_REQUIRED`; bind them to
independent Vercel control-plane, GitHub CI, remote Git, and public-source evidence
before treating the HTTP observation as an exact-release fact.

AI consent receipts additionally require
`migrations/003_open_ena_ai_consent.sql`. The durable receipt stores only a
hash-bound principal reference, operation ID, canonical request SHA-256,
consent-policy version, provider/model, timestamp, and terminal status; it does
not store prompts, completions, raw rows, or dataset labels. Apply all four
migrations with the same operator-controlled PostgreSQL deployment before
enabling production AI. These settings are examples only and are not deployed
by this repository.

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
