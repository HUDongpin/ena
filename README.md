# ENA Hong Kong

The public website for [www.ena.hk](https://www.ena.hk), focused on Epistemic Network Analysis.

## Structure

The site follows the public information architecture of AIEDHK while using an original ENA identity and content model:

- Home
- Mission
- News
- Academy
- About

News and Academy intentionally start with empty, publication-ready states.

## Local development

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

The canonical deployment target is the Vercel project `ena` under the owner's existing team. Production uses `www.ena.hk`, with `ena.hk` redirecting to the canonical `www` hostname.
