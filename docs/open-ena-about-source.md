# About content owned by ENA

The initial migration used the former OPEN-ENA About page as its content and
design reference. That migration is complete. ENA now owns the page and all of
its assets; edit this repository directly for future changes.

- Route: `app/[locale]/about/page.tsx`.
- Content, cards, styles, team and publications: `components/about/open-ena/`.
- Images: `public/open-ena-about/`.
- `source-manifest.json` preserves the original migration hashes as historical
  provenance. It is not a generator or a live synchronization contract.

The locale layout owns the main landmark, header, footer, language switcher and
consent behavior. The English body retains `lang="en" dir="ltr"`, and its Home
link preserves the selected locale. Publication metadata uses the ENA site's
canonical origin and the same local image paths as the rendered cards.

`scripts/sync-open-ena-about.mjs` is retired and exits with an explanation without
reading or writing any source files. A sibling OPEN-ENA checkout is not required
for development, validation, building or serving this page.

The intended domain handover, current hosting status and all website source
locations are recorded in [Website source handover](./website-source-handover.md).
