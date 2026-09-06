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
