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

Both `www.open-ena.com` and `www.ena.hk` are intended to serve the same ENA
production release, built from this repository's `main` branch. See
[Current production hosting](#current-production-hosting) for where it runs. Requests
to `/` use the existing `/en` Home route, and `/about` uses `/en/about`. Localized
navigation stays on the visited domain. Existing ENA feature routes remain local.
The canonical metadata origin remains `https://www.ena.hk`.

The exact-host redirect from `open-ena.com` to `www.open-ena.com` preserves paths
and query strings. Old `/team/` and `/publications/` image paths redirect to the
copies under `/open-ena-about/`; the former root logo and favicon URLs also resolve
to ENA-owned assets. Publication structured data uses the actual ENA image paths.

## Current production hosting

As of 2026-10-20, `www.ena.hk` no longer runs on Vercel. It runs on Alibaba Cloud
as the standalone Linux release (CI artifact `ena-linux-x64-<sha>`) behind nginx.
Build, install and environment steps are in
[self-hosted-release.md](self-hosted-release.md).

- The `x-ena-release` response header shows the deployed commit. It can lag
  `main`; a merge is live only after that release is installed on the server.
- `OPEN_ENA_*` settings (username, password of at least 12 characters, session
  secret of at least 32 characters, account ID, public and allowed origins, auth
  database URL) are set on the server. Changing them in Vercel has no effect on
  production. Restart the service after changing them.
- To verify: `open-ena.com` DNS still resolved to Vercel addresses on 2026-10-20.

The Vercel sections below record the 2026-10-19 handover and are historical.

## Production handover

Before the production handover, Vercel inspection on 2026-10-19 (Asia/Hong_Kong) confirmed:

| Hosting project | Git source | Current domains |
| --- | --- | --- |
| `ena` | `HUDongpin/ena`, `main` | `www.ena.hk`, `ena.hk` |
| `open-ena` | `HUDongpin/open-ena`, `main` | `www.open-ena.com`, `open-ena.com` |

The owner authorized the dependency fixes, publication and both domain moves on
2026-10-19. The release combines the reviewed Home/About/authentication work with
live main `4ab3979`, retaining its accessibility and security changes. The active
dirty checkout stays intact; publication uses an isolated, verified checkout.

The production procedure is:

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

## Dependency security and domain aliases

The production dependency fixes use Next.js 16.4.2, sharp 0.35.5 and
source-map-js 1.2.2. A fresh audit of the updated lockfile reports zero production
vulnerabilities. The complete dependency audit has no high or critical findings;
four existing low/moderate development-tool findings remain outside this release.

The Vercel production origin settings are write-only. To preserve their values,
`OPEN_ENA_ADDITIONAL_ORIGINS` adds `https://www.open-ena.com` and
`https://open-ena.com`. It uses the same exact-origin validation as the existing
settings; malformed aliases fail closed and forwarded headers grant no access.
The canonical origin remains `https://www.ena.hk`.

Release evidence, exact commits, deployment status and domain-move receipts are
retained locally under `output/production-cutover-20261019/`.

## Initial source-handover validation

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
independence and the tested page behavior. The subsequent production release is
verified separately using the release evidence described above.
