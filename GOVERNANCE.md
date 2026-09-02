# ENA Plugin Lab governance

## Decision roles

- Researchers propose questions, method logic, evidence, limitations, and
  validation cases.
- Dr. Peter Hu leads product selection, co-design, software implementation,
  maintenance assignment, and final product release.
- A reviewer independent of the proposer and primary implementer must approve
  changes to adjacency, direction, ordering, windows, weights, normalization,
  rotation, projection, inclusion, inference, effect sizes, or external data
  processing.
- External-processing or D2/D3 data access also requires an independent privacy
  and security review.

Conflicts of interest are disclosed in review receipts. A reviewer cannot be
paid conditionally on approval. Peter may make the product release decision but
cannot be the sole method validator for a method he co-designed.

## Separate lifecycles

Proposal state is `received`, `under-review`, `needs-information`, `selected`,
`not-selected`, or `withdrawn`. Plugin state is `incubating`, `experimental`,
`research-preview`, `production`, `deprecated`, or `revoked`. Selection never
implies method validation or production availability.

Every public plugin separately reports product lifecycle, scientific evidence,
and engineering assurance. `Production` applies only to one exact reviewed
version. ENA.HK plugins are independent extensions and are not official webENA
features or endorsements unless explicit documentary evidence says otherwise.

## Publication authority

A Production registry entry binds plugin ID/version, method-specification hash,
manifest hash, source/artifact hash, fixture-set hash, licenses, compatibility,
permissions, and method/engineering/security/product receipts. A change to any
bound object invalidates the affected approval.

Only statically registered modules built with ENA.HK may run in v1. The public
catalog and proposal database cannot cause executable code to load. Community
interest is a demand signal, never scientific approval.

Public proposal summaries require four independent conditions: the proposal is
selected, an operator records a verified reply from the submitted email
address, the exact public summary passes moderation, and the proposer confirms
that exact projection through the private status session. Withdrawing consent
removes the summary from ENA.HK, but cannot erase third-party copies or caches.
Moderation and consent changes append an immutable, projection-hash-bound event
in the same transaction as the current-state mutation. Withdrawing a proposal
also atomically withdraws any pending or confirmed publication consent.

## Deprecation and revocation

Security or scientific concerns can disable new runs and trigger an emergency
deployment or rollback. Revoked versions remain archived with source, citation,
receipts, limitations, and an erratum so published research stays traceable.
