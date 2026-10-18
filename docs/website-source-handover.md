# Website source handover to ENA.HK

## Source ownership

The Home/About content migration is complete. ENA (`HUDongpin/ena`) is the sole
maintained website source for the merged site. OPEN-ENA was the initial content
and design reference; no continuing copy, synchronization, cross-checkout import,
runtime fetch or proxy to its old website is required.

| Website surface | Maintained location in ENA |
| --- | --- |
| Home and preview | `app/[locale]/page.tsx`, `components/home-source/` |
| About, team and publications | `app/[locale]/about/page.tsx`, `components/about/open-ena/` |
| Home footer | `components/shared-home-footer/`, `lib/home-footer.ts` |
| Home and About images | `public/unified-home/`, `public/open-ena-about/` |
| Locale routes and other ENA features | Existing ENA application routes and components |

The existing directory names identify the migrated content, not a dependency on
another repository. Edit these files directly. The old Home and About
synchronization commands now stop with an explanation and cannot overwrite ENA.
The migration manifests retain historical source hashes only.

## Routing

Both `www.open-ena.com` and `www.ena.hk` are intended to serve the same Vercel
`ena` production deployment, built from this repository's `main` branch. Requests
to `/` use the existing `/en` Home route, and `/about` uses `/en/about`. Localized
navigation stays on the visited domain. Existing ENA feature routes remain local.
The canonical metadata origin remains `https://www.ena.hk`.

The exact-host redirect from `open-ena.com` to `www.open-ena.com` preserves paths
and query strings. Old `/team/` and `/publications/` image paths redirect to the
copies under `/open-ena-about/`; the former root logo and favicon URLs also resolve
to ENA-owned assets. Publication structured data uses the actual ENA image paths.

## Publication and domain move still pending

Read-only Vercel inspection on 2026-10-19 (Asia/Hong_Kong) confirmed:

| Hosting project | Git source | Current domains |
| --- | --- | --- |
| `ena` | `HUDongpin/ena`, `main` | `www.ena.hk`, `ena.hk` |
| `open-ena` | `HUDongpin/open-ena`, `main` | `www.open-ena.com`, `open-ena.com` |

These local changes do not publish the site or move either domain. The earlier
owner instruction to refrain from pushing and publishing remains in effect.

After publication is authorized:

1. Publish the reviewed ENA commits to the existing `ena` production project and
   verify the resulting deployment and its exact Git revision.
2. Move `www.open-ena.com` and `open-ena.com` from the old `open-ena` project to
   `ena`, within the existing `peter-dongpin-hu-s-projects` team. Serve the `www`
   domain directly, keeping the existing apex-to-www redirect in this app.
3. Verify both domains resolve to that ENA deployment, Home/About and legacy
   asset URLs load, and the old project no longer owns either custom domain.

Use Vercel's [move-project-domain operation](https://vercel.com/docs/rest-api/projects/move-a-project-domain)
for the move. Source project: `prj_Ykvrow1HUV7e0AAbwh0eHGf8Ifud`; destination:
`prj_epsHEOIQMExI70peRPF8L0mPfVjD`. Recheck these bindings before the live operation.
The old repository and deployment history can remain for recovery; future website
changes belong only in ENA.

## Dependency finding for the later release

A fresh install of the committed ENA lockfile reported three production-package
advisories through `npm audit --omit=dev` on 2026-10-19: Next.js 16.3.4 (critical),
sharp 0.35.4 (high), and source-map-js 1.2.1 (high). These versions predate this
source handover. The separately modified package files in the active checkout
were preserved and are not included in this change. Review and resolve the
production dependency findings before publishing the merged site.

## Local validation

Validated from an isolated export of ENA commit `64a3ff48` plus this handover,
with a fresh lockfile install and no sibling OPEN-ENA checkout:

- Full `npm run build`: passed, including TypeScript and 3,480 static pages.
- Related Home, site, theme and locale checks: 24 passed. One obsolete test was
  updated for the adopted shared Home while retaining preview/accessibility and
  internal-entry assertions.
- Actual HTTP routing: 42 recorded checks, including both `www` Host headers,
  apex redirects, 11 legacy asset redirects, and three local publication images.
- Chromium: Home/About round trips at 1440, 390 and 320 px; keyboard switching of
  all five preview modes; Traditional Chinese and Arabic locale routes; one
  banner/main/footer per page; no horizontal overflow or broken visible images.
- No browser page/console errors, analysis API requests or resource requests to
  the old OPEN-ENA site in the checked flows. Browser preload warnings were
  observed during page prefetching.
- Both retired synchronization commands refuse normal and `--check` invocations.

Evidence is retained locally under `output/website-source-handover-20261019/` and
`output/playwright/website-source-handover/`. These checks establish local source
independence and the tested page behavior; the production domain move remains
pending as described above.
