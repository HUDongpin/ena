# Open ENA jENA source snapshot

This directory is a source snapshot consumed by Open ENA as an npm workspace.
It is not a separately authored fork inside the ENA repository.

## Snapshot identity

- Upstream repository: https://github.com/HUDongpin/jENA.git
- Upstream base release: `0.6.3`
- Exact reviewed source commit: `d6456d715709e02919fc6156c79affebe725577f`
- Snapshot date: `2026-08-22`
- Package version: `0.7.0-ona.0`
- Publication status: not pushed and unpublished

Every tracked file from that exact commit was copied mechanically except the
explicit exclusions below. Open ENA adds only this note and `private: true` to
the snapshot package manifest. The `private` difference prevents an accidental
npm publication from the ENA workspace; it does not change jENA runtime
behavior or the upstream prerelease version.

## Exclusions

The snapshot excludes `.git`, `node_modules`, `dist`, `.github`, local
`reference` material, and local caches such as `.npm-cache`. Build output is
generated from the included TypeScript source and is never the source of truth.

## Refresh rule

To refresh this workspace, start from a separately reviewed exact jENA commit,
record its full SHA here, and mechanically replace the tracked snapshot files
using the same exclusions. Reapply only the ENA-owned `private: true` manifest
difference and this note. Then regenerate the root npm lockfile, prove that
`node_modules/jena-js` links to `packages/jena-js`, and rerun both the complete
jENA verification suite and every Open ENA application gate. Do not hand-copy
individual runtime source files or silently move the source SHA.

## GPL-3.0-only release gate

jENA and this source snapshot remain GPL-3.0-only, with the upstream license,
attribution, modification notice, and corresponding source retained here.
Before any public tag, npm publication, bundled product release, deployment, or
source distribution, the release owner must recheck corresponding-source
availability and the applicable legal/license posture. Local numerical and
application verification does not satisfy or waive that release gate.
