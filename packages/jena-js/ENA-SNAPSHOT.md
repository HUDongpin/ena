# Open ENA jENA source snapshot

This directory is a source snapshot consumed by Open ENA as an npm workspace.
It is not a separately authored fork inside the ENA repository.

## Snapshot identity

- Upstream repository: https://github.com/HUDongpin/jENA.git
- Upstream base release: `0.6.3`
- Historical snapshot anchor: `303a12f549ef9e1914cec10d6e9e1b842dad8908`
- Exact reviewed source commit: `8a1306c9b1d8bd7a7c9203e4ab96055ba67d4e6d`
- Canonical merge commit: `90790856f00bdef63dbd27fc3a5b502e8cffe65f`
- Immutable corresponding-source URL: https://github.com/HUDongpin/jENA/tree/8a1306c9b1d8bd7a7c9203e4ab96055ba67d4e6d
- Snapshot date: `2026-08-23`
- Package version: `0.7.0-ona.0`
- npm publication status: unpublished
- Deployment status: not authorized

The exact source commit is a direct child of the unchanged historical anchor.
The canonical merge commit has parents `57b7794ec3873c251c33086454523e5a3949836f`
and `8a1306c9b1d8bd7a7c9203e4ab96055ba67d4e6d`; both the historical anchor and
the reviewed source commit are ancestors of canonical jENA `main`. This records
the merge-commit inclusion without rewriting, squashing, or replacing the
snapshot anchor.

Every tracked file from the exact reviewed source commit was copied mechanically
except the explicit exclusions below. Open ENA adds only this note and
`private: true` to the snapshot package manifest. The `private` difference
prevents an accidental npm publication from the ENA workspace; it does not
change jENA runtime behavior or the upstream prerelease version.

## Exclusions

The snapshot excludes `.git`, `node_modules`, `dist`, `.github`, local
`reference` material, and local caches such as `.npm-cache`. Build output is
generated from the included TypeScript source and is never the source of truth.

## Refresh rule

To refresh this workspace, start from a separately reviewed exact jENA commit,
record its full SHA and canonical inclusion proof here, and mechanically replace
the tracked snapshot files using the same exclusions. Reapply only the ENA-owned
`private: true` manifest difference and this note. Then regenerate the root npm
lockfile, prove that `node_modules/jena-js` links to `packages/jena-js`, and rerun
both the complete jENA verification suite and every Open ENA application gate.
Do not hand-copy individual runtime source files or silently move the source SHA.

## Ordered product boundary

The verified ordered product contract remains descriptive SVD-only. This refresh
does not add ONA GoF, enable custom rotation, or add larger multi-group non-color encoding.
Each remains a separately scoped and validated future phase and must not be
inferred from the availability of lower-level jENA helpers.

## GPL-3.0-only release gate

jENA and this source snapshot remain GPL-3.0-only, with the upstream license,
attribution, modification notice, and corresponding source retained here.
Before any public release tag, npm publication, bundled object-code distribution,
release asset, or deployment, the release owner and a qualified reviewer must
recheck corresponding-source availability and the applicable legal/license
posture. Pushing, reviewing, or merging this source-only PR records factual
repository provenance but does not satisfy or authorize that release gate. This
source refresh does not authorize staging or production deployment. Local
numerical and application verification does not satisfy or waive that release
gate.
