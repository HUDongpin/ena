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

Open ENA is a browser-based research workspace powered by the pinned `jena-js`
runtime. The Models v3 Workspace uses separate Standard ENA and ONA drafts,
strict typed source admission, compiled execution plans, and bound results.
Data, Plot, Stats and AI consume native results; new inference and current exports
also require the independently compiled current plan. Scientific edits retain the
previous geometry as stale and require an explicit run. Display changes do not
refit, abort an otherwise current run, or change its scientific result.

CSV cells enter as literal text. Researchers review explicit Text, Number or
Boolean declarations before creating a genuine typed XLSX derivative. Numbers use
whole-token JSON decimal syntax; overflow, nonzero underflow and unsafe integers
reject, and ordinary IEEE 754 fraction rounding is disclosed. Text preserves
identifiers such as `001` and `9007199254740993`. Native XLSX cell types remain
unchanged. The downloadable derivative reuploads through the same worksheet
parser and normalized worksheet hash. The original CSV and a separate derivation
receipt remain downloadable; neither is claimed as authentication of the
transformation. Serialization uses pinned MIT-licensed `write-excel-file@4.1.1`.

The current native Workspace provides:

- Units, Horizons, Windows and Codes editors with durable unfinished input, typed
  identities, explicit order policies and independent family drafts;
- EndPoint, SeparateTrajectory and AccumulatedTrajectory Standard models with
  strict Binary or Frequency Codes; ONA has its own directional mask and order;
- explicit SVD, Means or compatible Reference rotation where supported, without
  silently replacing an invalid scientific choice;
- the complete declared Group inventory, with native endpoint contrasts requiring
  two selected Groups, two supported axes, and a total of two to six Groups;
- persistent 2D and WebGL 3D plots, display-only Code and Group choices, SOURCE
  labels mapped independently from public Code aliases, camera controls and node
  positions; ungrouped and rank-one models remain inspectable;
- native observed-point trajectory paths, original fitted ordinals and available
  Group-by-Horizon centroids with actual contributing counts. Connectors use
  observed adjacent fitted steps, not an invented global chronology. Individual
  paths default off. Display filtering never bridges a removed intermediate step;
- a native Data View with context selection, paging, export and return to the
  central plot while side plots remain mounted. Per-point source membership is
  unavailable and stays null; global runtime source traversal is separate;
- explicit native endpoint, independent-period, paired-period and repeated-period
  inference; ONA remains descriptive. Model bundles retain unavailable statistics,
  with post-model inference exported separately;
- bound Methods Copy/download, identity-confirmed model/Data View/plot exports,
  truthful source-owned Reference export or original-Reference re-export, and
  up to six local same-basis analysis sets;
- read-only artifact previews, explicit draft/configuration replacement and
  immutable Reference registration that neither selects rotation nor runs a model;
- separate result-bound presentation presets. Their supported fields are disclosed;
  the format does not encode the selected Group pair or a complete view state;
- optional AI interpretation only after review and explicit consent for the
  approved aggregate wire request. Full scientific identity stays local for
  request and response currentness; unsupported partial-order evidence is disclosed.

Legacy generic ENA renderer calls still ignore a trajectory flag alone. The native
Workspace supplies a validated fitted-sequence presentation layer to the 2D and
3D renderers. Retained legacy readers and standalone longitudinal presenters remain
compatibility surfaces and do not grant authority to imported artifacts.

### Models

Open ENA supports **all six Standard Model/Window combinations**:

| Standard model | Moving Stanza (`MovingStanzaWindow`) | Conversation/Horizon (`Conversation`) |
| --- | --- | --- |
| EndPoint | Supported | Supported |
| SeparateTrajectory (Separate Trajectory) | Supported | Supported |
| AccumulatedTrajectory (Accumulated Trajectory) | Supported | Supported |

Units identify the analytic entities; Horizons define their context partitions;
Codes define the network variables. Composite Unit, Horizon and Group identities
preserve declared Text, Number and Boolean types. Standard **Binary** accepts either a consistently
numeric 0/1 Code column or a consistently Boolean false/true Code column, with
explicit Boolean-to-0/1 runtime mapping and provenance. Mixed Boolean/numeric
representation within a Code is rejected. **Frequency** accepts finite nonnegative
numbers and rejects booleans. Strings, missing cells and invalid numeric values
are not silently converted into Codes.
Moving Stanza has explicit backward and forward finite extents or **Infinity**
(entire available extent within the Horizon). Conversation uses the whole Horizon.
Moving row order and trajectory Horizon order are separate scientific choices:
select explicit keys/comparators, or explicitly confirm source order where offered.
The application does not guess chronology from labels or bridge unobserved steps.

**SVD, Means, and Reference** are the Standard rotations. Means is fitted directly
only for **EndPoint**, with a declared Positive-minus-Negative direction. An
**Endpoint Reference can project all three Standard models**, using the validated
source center, full basis and fixed nodes after exact Code-identity remapping.
A target trajectory or projected Endpoint cannot mint a new source Reference.
Standard and ONA retain isolated drafts and execution contracts: ONA keeps its
fixed directional masking, ordering and descriptive outputs; Standard weighting,
Means and Reference controls do not alter that contract. **TMA and advanced rotations are not implemented in the Models tab**, even where the underlying package
has other research APIs.

Malformed, incompatible, stale, rank-ineligible or over-budget scientific choices
fail closed with diagnostics. They do not trigger a replacement rotation,
truncated dataset or automatic rerun. Hide/Show changes display only; Exclude
changes the model configuration and makes prior results stale. Core model
admission is broader than individual consumers: endpoint contrasts need two
supported axes and two selected Groups out of two to six declared Groups; local
analysis sets require compatible Endpoint results in the same basis. A valid
rank-one or ungrouped result remains inspectable without granting these actions.

Portable canonical configurations, drafts, analysis bundles and stale-result
audits use **schema version 3**; Standard Reference uses **schema version 2**.
Post-model rank statistics have a separate **schema version 1** artifact; native
trajectory analysis, plot specifications and export manifests use **schema version 3**.
Result-bound presentation presets describe only their declared display fields.
The validation, runtime-policy and execution contracts are respectively
`open-ena-validation-v3.1`, `open-ena-runtime-policy-v3.1` and
`open-ena-execution-v3.1`; resource admission also includes the documented
operational supplement. Version strings alone do not establish admission or
scientific compatibility. Imports check strict shapes, component hashes,
scientific consistency and resource limits. They open historical previews or
explicit configuration/Reference choices; **imported artifacts never restore live
execution authority**, even if serialized configuration metadata says executable.
They require a newly compiled current plan and explicit run for new results.
Legacy v1/v2 readers retain their disclosed missing-provenance limits.

Scientific parity is bounded by the fixed fixtures in
[jENA numerical acceptance](packages/jena-js/NUMERICS.md): the frozen rENA 0.3.1
baseline and 14 pinned rENA 0.4.4 Standard cases. The latter retains all six returned
axes and checks requested three-axis views as exact full-frame prefixes; scalar
geometry/full variance uses 1e-10 absolute bounds, and basis/projector comparisons
use 1e-8. Full variance is never renormalized. This does not establish universal
cross-platform or ill-conditioned-input agreement. Undirected fitted nodes use
a rank-aware minimum-norm solve; directed ONA retains its ridge solve and Reference
retains source nodes. See the [acceptance ledger](docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md)
for exact tested revisions, historical failures, unavailable evidence and pending
final gates. Local acceptance does not imply a deployed or production release.

### Whole-path trajectory analysis and export

The native trajectory panel separately compares **independent whole participant
histories**. Confirm that the full Unit identity represents the same entity over
time and that the two Groups contain independent histories. Select typed Groups
and ordered Horizons with **three genuinely supported axes** and at least **two
complete Units per group**. The analysis uses equal participant weights and only
histories complete across all selected Horizons. It defaults to **500 permutations
and seed 2026**, permutes whole histories between Groups, retains raw p-values and
reports Holm-adjusted p-values within the declared family. Resource checks bound
periods, repetitions, memory and work before admission. **Paired whole-path
comparison is not implemented.** The independent-period, paired-period and
repeated-period rank designs below remain separate analyses; a paired rank test
does not imply paired path inference.

The path calculations use a local GPL math port with pinned public SDK/source-map
provenance. Its independent public-SDK oracle covers **23 metrics in one fixed
fixture**; that is not a universal metric count or a claim that internal helpers
are public package exports. The fitted direction and Means separation limitations
remain visible when interpreting path results.

The default trajectory ZIP contains `analysis.json`, `plot-specification.json`,
and `trajectory-inference.csv` as its three aggregate payload files, accompanied
by `manifest.json`. All four are also available as standalone files. The three
aggregate payload files contain path results, any optionally collected rank
results, and the complete-cohort plot specification. That plot
describes the complete comparison cohorts, not whichever available points a
display filter shows. The bound model Methods report is available separately in
the Workspace; it is not included in the trajectory ZIP. A rank result's method
identifier names its statistical procedure, rather than supplying a Methods report.

Participant identities and traces require **explicit participant opt-in before
materialization** and local confirmation. These three aggregate payload files
remain byte-identical after participant opt-in. `participants.json` is added;
`manifest.json` changes its disclosure and file inventory, so the ZIP bytes and
hash also change. Full identity-bearing model exports are a different contract.
Every new analysis/export requires the current native result, plan and controls;
currentness is rechecked after asynchronous work, and stale or unmounted actions
produce no output. Imported JSON remains historical data.

Native trajectory plots use black paths, direction arrows and 7-pixel square
centroids; mean-network edges are suppressed for the trajectory presentation.
Individual paths default off. Native 2D supplies SVG projections, export and zoom;
3D additionally supplies native fullscreen and its accessible fallback. Image
actions wait for the figure to be ready and require identity confirmation before
creating output. If the clipboard API is absent, Copy downloads a real PNG; an
available clipboard that rejects a write reports an error. Fullscreen Exit stays
available while work is pending. Deferred focus returns when the figure is ready
unless the researcher has chosen another focus target or changed context.

The installed Plotly 3.7.0 includes an explicit local disposal correction. Its
upstream identity, applied digest, exact four substitutions for two disposal
omissions, license and build guard are documented in
[Plotly disposal maintenance](docs/maintenance/plotly-3.7.0-disposal-correction.md).
Measured projection and PNG cycles support bounded resource retention; they do
not prove universal GPU leak freedom. Known scientific label overlaps and raw
Canvas2D advisories remain. Browser evidence distinguishes CSS zoom from native
browser zoom, English served journeys from three-locale catalog/SSR and earlier
Chinese Workspace checks, and controlled callback latency from naturally measured
long renders. No official pixel-parity or universal accessibility/performance
claim is made.

### Inferential comparison contract

Open ENA does not run an inferential test automatically. In the Comparison workflow,
the researcher selects the study design, confirms the composite repeated-entity identity
for a trajectory design, selects the required periods, and then clicks **Run confirmed inference**. The
returned native result reports the candidate/included/missing/zero ledger. The selected design determines the method; there
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
Native Stats, the separate statistics artifact and AI review consume the same
current native inference result. Bound model Methods describe the fitted model;
computed inference is not inserted into its immutable model bundle.

### Longitudinal plot and inference independence

The native longitudinal overlay uses observed fitted points and per-Unit sequence
facts. Available-by-Horizon centroids may have different contributors, so their
movement is descriptive rather than a matched-cohort change. Every centroid shows
its actual contributing count. A connector requires observed adjacent fitted steps
and shared contributors; incomparable Horizons and hidden intermediate steps do
not acquire invented connections.

Paired inference uses its selected two-period complete cohort. Repeated inference
uses the selected all-period complete cohort; full-frame completeness and selected
complete-block counts remain distinct. Period follow-up indexes are interpreted in
the selected request, while the availability ledger uses the full fitted frame.
Changes to inference controls invalidate that inference and require explicit Run.
Display filters, camera, colors, visibility and node positions do not change
cohorts, fitted ordinals or p-values. Fitted scientific order is immutable for both
trajectory model types; changing it requires a new model run.

The rank procedures assume that independent groups, matched entities, or complete
repeated-entity blocks are independent of other analytic units at the corresponding
design level. Clustered observations and cluster-robust inference are out of scope,
and mixed-effects models are out of scope. The resulting associations do not establish
causality, learning gains, or practical importance. Accumulated-trajectory comparisons
are additionally path-dependent because a later point contains its preceding network
history; fitted-axis sign and Means group-separation geometry also constrain interpretation.

Reference projection uses the original validated source basis for compatible
Standard endpoint and trajectory targets. Target-fitted trajectory results cannot
mint a new Reference. Imported original References can be re-exported without
claiming target-fit source authority. Projected target variance describes the new
dataset in that fixed basis, independently of the source-fit variance.

Scientific exports can retain Unit, Group and selected Horizon identities. Raw-row
exclusion does not mean anonymity; preserve the exact source and codebook, and
pseudonymize identity fields before sharing when needed. Identity-bearing model,
Data View and plot exports require an explicit local confirmation. CSV exporters
prefix spreadsheet-active string cells with an apostrophe while preserving numeric
scalars. Format and compiler resource limits reject oversized input without
truncating the scientific dataset.

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
