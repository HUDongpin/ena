# Shared About content

OPEN-ENA is the authoring source for the About body. Its `app/about/page.tsx`
renders `components/about/AboutContent.tsx`, the existing `TeamCard` and
`PublicationCard`, and the approved data in `lib/team.ts` and
`lib/publications.ts`. About styling is isolated in `AboutContent.module.css`.

ENA's `app/[locale]/about/page.tsx` renders the generated copy at
`components/about/open-ena/AboutContent.tsx`. This keeps both repositories
independently buildable and avoids runtime network requests, iframes, or
cross-checkout imports. The locale layout owns ENA's main landmark, header,
footer, language switcher, and consent behavior. The shared English body uses
`lang="en" dir="ltr"`; its home link retains the selected locale.

Edit the OPEN-ENA source only, then regenerate from the ENA checkout:

```sh
node scripts/sync-open-ena-about.mjs
node scripts/sync-open-ena-about.mjs --check
```

The default source is the sibling `../OPEN-ENA` checkout. Use
`--source /path/to/OPEN-ENA` when working elsewhere. The script copies the
component, its CSS, both card components, both data files, and only the eight
referenced images into an ENA-specific asset directory. It rewrites imports
and local asset paths without changing names, affiliations, biographies,
citations, publication status, image bytes, or external destinations.
`source-manifest.json` records SHA-256 hashes of the source files and assets.
The check exits unsuccessfully when the generated snapshot is missing or stale.

Generated files are checked into ENA with the route change. ENA builds use that
snapshot without requiring a sibling checkout. Regeneration and the drift check
must be run when the OPEN-ENA About source changes; they are not a scheduled
sync and do not publish either website.
