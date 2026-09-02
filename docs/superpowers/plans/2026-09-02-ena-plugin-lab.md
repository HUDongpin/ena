# ENA Plugin Lab v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `subagent-driven-development` or `executing-plans` task-by-task. Use TDD for
> behavior changes and preserve the existing Open ENA scientific boundaries.

**Goal:** Ship a public ENA Plugin Lab, a privacy-minimal proposal/status
workflow, and a statically allowlisted 3D ENA reference plugin without changing
the fitted ENA result.

**Architecture:** Public pages consume a strict server-safe plugin catalog. Open
ENA consumes a separate compile-time runtime registry. Proposal data is stored
through a dedicated PostgreSQL boundary with application-layer encryption,
hashed access codes, append-only events, and v2-only operator authorization.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner,
PostgreSQL, Web Crypto/Node crypto, jENA, Plotly.

---

## Task 1: Governance and manifest foundation

- Record the reviewed design and contribution/security/licensing boundaries.
- Test strict plugin manifest parsing, cross-field invariants, unique catalog
  identity, safe links, evidence states, and immutable output.
- Implement the four-entry initial catalog and public JSON-LD projection.

## Task 2: Public Plugin Lab

- Test all-locale navigation, public routes, non-official wording, status axes,
  analysis-change disclosure, and sitemap exclusions.
- Implement catalog, detail, propose, and status pages. Use reviewed English,
  Traditional Chinese, and Simplified Chinese content; mark English fallback in
  every other locale.
- Add Home, Mission, About, Open ENA, header, footer, metadata, sitemap, robots,
  and responsive/accessibility styling.

## Task 3: Proposal domain and persistence

- Test bounded parsing, explicit safety consent, proposal/plugin state-machine
  separation, encryption tamper detection, access-code hashing, status-session
  signing, and v2-only operator policy.
- Implement the PostgreSQL migration and a dependency-injected store using a
  dedicated connection variable.
- Implement submission, status-session, status read, transition, access-code
  rotation, moderation, and retention-preview operations with safe errors.

## Task 4: Proposal UI and operator workflow

- Test public/private copy, lack of file inputs, no-NDA/ethics boundaries,
  no-store/noindex behavior, session-cookie security, and operator denial for
  disposable accounts.
- Implement accessible forms, receipt display, status timeline, operator inbox,
  state transitions, moderated public-summary consent, and manual-email copy.

## Task 5: Trusted 3D ENA runtime slice

- Test unknown/disabled/incompatible plugin failure, immutable runtime context,
  and old-versus-adapter PlotSpec equivalence.
- Implement the compile-time registry, availability projection, host, 3D ENA
  adapter, and plugin run receipt.
- Route the existing 3D presenter through the registry without changing worker,
  analysis, statistics, or bundle schemas v1/v2.

## Task 6: Verification and handoff

- Run focused tests after each red/green cycle.
- Run the complete test suite, typecheck, build, and real browser paths.
- Audit security headers, routes, sitemap, manifest hashes, Git diff, and exact
  SHA. Commit only the isolated branch.
- Report legal approval, production database migration, production secrets,
  deployment, and external-researcher pilot as separate remaining gates unless
independently completed and evidenced.
