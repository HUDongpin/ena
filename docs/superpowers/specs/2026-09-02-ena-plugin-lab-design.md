# ENA Plugin Lab v1 Design

## Purpose

ENA Plugin Lab turns ENA.HK into a public, evidence-bounded route from a
researcher's idea to a reviewed Open ENA capability co-developed with Dr. Peter
Hu. The public word `Plugin` describes the product unit. Every entry separately
states whether it is a method variant, visualization, workflow, diagnostic,
export, or external-service contribution.

## V1 boundaries

- Production executes only modules statically registered in the ENA.HK source
  tree and built with the site. There is no remote script, package, repository,
  iframe, or uploaded-code loader.
- Public catalog state, scientific evidence, and engineering assurance are
  separate. `Production` is never presented as universal scientific validity.
- 3D ENA is the first runtime reference plugin. It is presentation-only, uses
  the existing fitted result, and cannot refit analysis or change result
  identity.
- Proposals are text-only. They cannot contain attachments, participant data,
  raw research records, credentials, or restricted materials.
- A proposal can request public consideration or private review. Public content
  is a separate moderated summary; selecting public never publishes the private
  details automatically. Private review is not an NDA.
- Academic and commissioned inquiries share the same scientific, privacy,
  security, compatibility, and release gates. Payment affects scheduling and
  scope only.
- Professor Sandy remains the general academic-collaboration contact. Plugin
  proposals and software co-development route to Dr. Peter through Plugin Lab.

## Product model

Public routes are `/[locale]/plugins`, `/[locale]/plugins/[slug]`,
`/[locale]/plugins/propose`, and `/[locale]/plugins/status`. The operator route
is `/[locale]/plugins/operator`, is never indexed, and accepts only the existing
static-account Open ENA v2 session. Disposable v3 sessions are rejected.

Proposal and plugin lifecycles remain distinct:

- Proposal: received, under-review, needs-information, selected, not-selected,
  withdrawn.
- Plugin: incubating, experimental, research-preview, production, deprecated,
  revoked.

Every plugin page answers `Does this plugin change the analysis?`, then presents
category, exact version, product lifecycle, scientific evidence, engineering
assurance, compatibility, data/network permissions, limitations, source,
license, citation, team, changelog, and last review date.

## Architecture

A server-safe manifest catalog drives public pages. A separate compile-time
runtime registry maps approved IDs and exact versions to local modules. The
runtime host passes a deep-frozen, versioned presenter snapshot containing only
approved fitted values and display settings; it never exposes raw rows,
cookies, database objects, provider secrets, or a general network handle. The
host compares a canonical scientific-result snapshot before and after a
display-only adapter, while downloadable receipts bind both SHA-256 values.

Proposal storage uses a dedicated PostgreSQL role and connection. Email and
private details are encrypted with AES-256-GCM using a server key separate from
the database. AAD binds each envelope to its purpose and proposal ID. The
eligible public title/summary is stored in a separate encrypted column so public
routes never decrypt the private proposal payload. Access codes are random and
stored only as domain-separated HMACs.
Status access exchanges a proposal ID and access code for a short-lived,
path-scoped HttpOnly cookie. Proposal events are append-only.

The public-summary gate requires selected state, an operator-recorded verified
reply from the submitted email address, operator moderation, and renewed
consent to the exact title and summary. A read-only retention preview lists only
old terminal proposal IDs, states, and timestamps. Deletion is intentionally
outside the v1 web API.

Moderation, renewed consent, consent withdrawal, and proposal withdrawal append
a separate publication event in the same database statement as the state
change. Each event records prior/resulting states, actor kind, HMAC actor
reference, timestamp, and the SHA-256 of the exact eligible public projection.
Audit rows deny application updates/deletes and restrict parent-row deletion.

Production manifest approvals bind plugin ID/version, method-specification and
reviewed-manifest hashes, source revision, built artifact, fixture set, and the
individual review receipt. A Production entry also requires passed automated,
browser, and security/privacy assurance states.

## Scientific and release gates

Presentation-only contributions prove that the fitted result and scientific
hash are unchanged. Any change to adjacency, direction, order, window, weight,
normalization, rotation, projection, inclusion, inference, effect size, or
external processing is high-risk. High-risk work requires a reviewer who is not
the proposer or primary implementer. Approvals bind plugin ID/version plus
method, manifest, source/artifact, and fixture-set hashes.

Repository tests, browser acceptance, CI, exact deployment SHA, production
readback, and authenticated plugin execution are reported as separate evidence
layers. Legal approval, production migration, secret placement, and a real
external-researcher pilot remain explicit external gates.
