# Contributing to ENA.HK and ENA Plugin Lab

## Start with a research question

Plugin Lab proposals begin at the public proposal form. Do not submit source
code, participant or student data, raw research records, credentials,
restricted documents, or private file links through that form. Private review
means the proposal is not publicly displayed; it is not an NDA.

Selection is not scientific approval or a promise to develop the idea. Academic
and commissioned inquiries use the same scientific, privacy, security,
compatibility, and production gates. Payment cannot purchase approval, a
verification label, or paper authorship.

## Before code is accepted

Selected work needs a versioned method or feature specification, explicit
claims and non-claims, input and output contracts, fixtures, failure cases,
privacy boundaries, maintenance ownership, licenses, and contribution roles.
Changes to analysis semantics require an independent method reviewer.

Contributors retain copyright while licensing accepted contributions under the
repository license. Every commit must include a Developer Certificate of Origin
sign-off:

```text
Signed-off-by: Full Name <email@example.org>
```

By adding the sign-off, the contributor certifies the Developer Certificate of
Origin 1.1 at <https://developercertificate.org/>. Do not sign for code or data
you do not have the right to contribute.

## Engineering workflow

- Work from an issue or approved specification in an isolated branch/worktree.
- Add a failing test before production behavior.
- Keep standard ENA and directed ONA scientific models separate.
- Do not add remote plugin loaders, executable URLs, runtime package installs,
  or raw-data network access.
- Run the focused tests, full verification command, and browser gate required by
  the affected plugin.
- Record exact source, manifest, artifact, and fixture hashes for a release
  candidate.

See `GOVERNANCE.md`, `SECURITY.md`, and `LICENSING.md` before contributing.
