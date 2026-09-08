# AGENTS.md - MAIS-MVP Parallel Agent Guide

This file is the coordination contract for AI agent roles (Codex, Claude, and other tools) and their work sessions in `/Volumes/Starship/MAIS-MVP`.

## Project Snapshot

- Project: `MAIS-MVP`, a bilingual math learning platform that began with Hong Kong P1-S6 and now also includes mainland China and US curriculum/RAG/question-bank expansion work.
- Stack: Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS, Framer Motion.
- Package manager: use `npm` scripts from `package.json`.
- Important scripts:
  - `npm run dev` starts the local Next.js dev server.
  - `npm run build` runs a production Next build.
  - `npm run type-check` runs `tsc --noEmit`.
  - `npm run test:analytics` compiles and runs `lib/learningAnalytics.test.ts` with Node test runner.
- Current checkout note: this folder is now a Git repository on `main` and may contain many owner/agent changes at once. Agents must inspect `git status --short` before editing, must not revert unrelated changes, and must not stage, commit, branch, merge, rebase, push, or delete files unless the owner explicitly assigns that Git operation.
- Do not edit generated or local-only outputs: `node_modules/`, `.next/`, `.tmp/`, `tsconfig.tsbuildinfo`, `.DS_Store`, `.env`, `.env.local`, or other real secret files, except for owner-assigned A19 API configuration tasks.

## Purpose

The goal is steady project progress without conflicting edits, lost work, or unreviewable changes, with many AI sessions able to work in parallel while the owner is offline or sleeping.

## Operating Model — Core Invariant

The unit of coordination is the session slice, not the agent identity:

- **One session = one worktree = one branch = one reviewable slice.** This invariant is the always-enforced contract — `CLAUDE.md` (auto-loaded into every Claude Code session) plus the hard git guardrails — and applies to every session regardless of which role label it carries.
- The `A01`-`A25` role IDs below are a **routing taxonomy, not a staffing plan**: they provide attribution (session logs, reports), routing vocabulary ("this belongs in A04's lane"), and default scope boundaries for assignments. Most days only a few lanes are active; an unstaffed lane is normal, not a gap.
- Roles come in two tiers:
  - **Gate-wired** (operational teeth — referenced by scripts, gates, and standing reports): `A10` coordination/reporting, `A11` QA/regression gates, `A22` release engineering, `A23` candidate-to-live promotion, `A25` git hygiene/release intake.
  - **Domain lanes** (routing vocabulary): the remaining roles. Sharpen an existing lane before inventing structure; never add `A26+` without owner approval.
- Ownership is enforced mechanically where it matters: `coordination/release-intake/owner-pathspecs.json` / `owner-package-manifest.json` for release intake, the A25 worktree-lifecycle gate, and the `CLAUDE.md` guardrails. The role table below is advisory routing, not access control.

Every agent/session must:

- Read `CLAUDE.md` (auto-loaded) and the relevant sections of this file before doing project work.
- Declare its agent ID (or the lane it is borrowing), such as `A01`, in its first note or session log.
- Work only inside its assigned write scope (its session slice).
- Keep changes small, reviewable, and aligned with the existing project style.
- Leave a handoff note before stopping.
- Never revert unrelated user or agent changes.

## Current Coordination Posture

- Do not add `A26+` roles for the current workload. The present bottleneck is coordination and release control, not missing headcount.
- When a new surface appears inside an existing workstream, sharpen the relevant `A01`-`A25` scope first instead of creating a new agent.
- Current priority pressure points are dirty-tree slicing, shared schema/build isolation, A11/A22 regression gates, and A18/A21/A23/A24 candidate-to-live gates.
- New parallel assignments should prefer smaller packages for existing owners, especially A25 release intake, A22 build/dev-server isolation, A11 targeted regression, and A08/A10 shared-schema cleanup.

## Root And Worktree Policy

- The always-loaded digest of this policy lives in `CLAUDE.md` (auto-injected into every Claude Code session) — when editing this section, keep `CLAUDE.md` in sync. Hard guardrails back it: `.claude/settings.json` denies broad `git add`, and `scripts/claude-root-git-guard.mjs` blocks `git switch`/`checkout`/`stash`/`rebase`/`reset --hard` in the primary root.
- Treat `/Volumes/Starship/MAIS-MVP` on `main` as a read-only integration inventory and release-intake area, not as the default feature-development workspace.
- A01-A25 feature, QA, content, release, or tooling work must happen in an isolated branch/worktree (naming in practice: `feat/*`, `fix/*`, `chore/*`, `docs/*`, session-generated `claude/*`, or legacy `codex/Axx-short-scope`) or an owner-approved clean clone unless the owner explicitly assigns a root-only inventory/reporting task.
- Before starting an isolated worktree, the agent must confirm the baseline branch/commit, dependency state, and relevant baseline check or documented pre-existing failure.
- At handoff, the agent must commit only its assigned slice from that worktree. Do not mix unrelated dirty-root inventory files into the slice.
- Never use `git add .`, `git add -A`, or an equivalent broad wildcard for release packages. Stage only the exact owner-approved pathspecs for the assigned slice.
- `coordination/release-intake/owner-pathspecs.json` and `owner-package-manifest.json` are the release-intake source of truth for owner routing, package boundaries, checks, and staging scope.
- Every release package must end in exactly one recorded final state: `reviewed commit`, `owner-approved discard`, `evidence archive`, or `blocker report`.
- The root may collect A25 dirty-tree maps, A10/A25 coordination reports, and A22 release-readiness evidence. It must not be used as the production deploy source while dirty.

## Daily Operational Gates

These gates are now part of the standing coordination rhythm until the owner explicitly relaxes them:

1. A25 daily git hygiene and release intake must run before any release planning, morning synthesis, branch/worktree slicing, or deploy preflight. A25 should run `npm run release:dirty-map -- --reason "<reason>"`, produce a non-destructive dirty-tree ownership map, identify conflicting shared files, and recommend PR/commit slices. A25 must not stage, commit, branch, push, reset, delete, revert, or clean files unless the owner explicitly assigns that exact Git operation.
2. A22 release engineering must build and publish only from a clean worktree, clean clone, reviewed clean release slice, or pruned staging directory. A22 must not publish from the current dirty repository root. The only exception is an explicit owner instruction that accepts dirty-root production risk for a named deployment scope; A22 must record that exception in a release report.
3. A11 QA must split a red student E2E gate into small regression packages and route each package to the owning agent sessions instead of treating the red gate as one large fix. Current student red-gate routing should use A01 for shell/auth entry, A02 for dashboard/progress/adaptive display, A03 for roadmap, A04 for Practice Arena, A05 for lessons/textbooks, A06 for Visualization Lab, A09 for copy/accessibility selectors, and A15 for adaptive semantics.
4. A08/A10-owned shared schema, type-check, build-drift, and coordination-contract cleanup must lead multi-agent drift fixes. A08-owned scope covers shared app types/state semantics; A10-owned scope covers docs/config/tooling/reporting coordination. A22 joins when build or release isolation is affected, and A11 joins when regression harness drift is affected.
5. A23 remains the candidate-to-live gatekeeper for A18/A21 content packages. Content generated by A21 must not go directly into live question, topic, lesson, asset, or route surfaces without A18 independent QA, A23 promotion planning, owning live-surface implementation, A11 regression evidence, and A22 release readiness.
6. A10/A25 must slice the current large dirty tree into small review packages before any merge or release decision: runtime app/API/data, tests/regression evidence, docs/coordination evidence, content/RAG backlog, release hygiene tooling/config, and local/generated quarantine. Each package should be reviewed, committed, and regression-checked independently.
7. A22 generated-artifact cleanup must start with `node scripts/cleanup-generated-artifacts.mjs --dry-run`. Only after confirming no Playwright traces, reports, logs, or generated evidence must be preserved may A22 run `node scripts/cleanup-generated-artifacts.mjs --apply`. Do not use broad destructive commands such as `git clean -fdx` for release hygiene.

## Project Conventions

- Use the `@/` path alias for project imports.
- Add `"use client";` only for components that need hooks, browser APIs, Framer Motion client behavior, or local storage.
- Keep shared types in `types/index.ts`.
- Keep reusable mock data in `data/`.
- Keep pure math, analytics, and utility logic in `lib/`.
- Keep bilingual UI copy as `{ en, zh }` localized text where the surrounding code already uses the dictionary or `LocalizedText`.
- Preserve the current design language: `page-container`, `glass-panel`, `soft-panel`, `gradient-text`, `focus-ring`, Tailwind utility classes, dark-mode support, and responsive layouts.
- Keep server-only LLM configuration in `.env.local`; never expose secrets through `NEXT_PUBLIC_` variables unless the owner explicitly approves. A19-owned API configuration work may configure real local and Vercel environment variables only when explicitly assigned by the owner, and must never write secret values into Git, session logs, reports, screenshots, or command output.

## Local API Key Source

- Owner-approved local credential source: `/Volumes/Starship/MAIS-MVP/All API Keys.docx`.
- When MAIS-MVP work needs an API key or provider credential, first check that local DOCX for the required provider before asking the owner. This includes DeepSeek API credentials, which the owner has authorized Codex to read and use for assigned MAIS-MVP tasks that require live DeepSeek access.
- Never copy, print, summarize, commit, stage, screenshot, or log real credential values from `All API Keys.docx`, `.env.local`, Vercel, or any other secret source. Only record variable names, provider names, target environments, and redacted status.
- If the needed credential is absent from the DOCX, such as an OpenAI API key the owner has not purchased or another provider key needed for a feature like video generation, stop and ask the owner to provide or acquire it.
- API environment placement, local/Vercel parity, and redacted credential inventories remain A19-owned. Provider behavior changes still require coordination with the owning API/provider session.

## Agent Role And Session System

Use agent IDs `A01` through `A25` for long-term stable roles. A session is one concrete work run or log entry performed by an agent. A workstream is the agent's responsibility domain. Per the Operating Model above, the table below is the routing registry: it defines default lane boundaries for assignments and attribution; the enforced write boundary of any session is its session slice (worktree/branch plus declared scope).

A session may read any project file needed for context, but it may write only within its declared slice, which defaults to its assigned agent's allowed files/modules unless the owner explicitly expands its scope. Do not create new permanent `A26+` roles unless the owner explicitly approves a new workstream after A10/A25 confirm that the need cannot be handled by refining an existing agent boundary.

Legacy `Sxx` references in older reports, logs, and filenames map one-to-one to the matching `Axx` agent role. Do not rewrite historical artifacts just to rename them; use `Axx` for all new coordination text.

| Agent | Owner/role | Workstream | Allowed files/modules | Forbidden files/modules | Status | Session log |
| --- | --- | --- | --- | --- | --- | --- |
| `A01` | App shell lead | Home, layout, navigation, theme surface | `app/layout.tsx`, `app/page.tsx`, `components/layout/`, `components/home/`, `components/background/`, `components/ui/ThemeToggle.tsx`, `components/ui/LanguageToggle.tsx` | API route, analytics logic, practice, visualizations, data files except with approval | Available | Log in `coordination/session-logs/YYYY-MM-DD-A01.md` |
| `A02` | Dashboard lead | Dashboard, progress page, progress cards, analytics display UI | `app/dashboard/page.tsx`, `app/progress/page.tsx`, `components/dashboard/`, `components/cards/`, `data/progress.ts`, `data/learningAnalytics.ts` | `lib/learningAnalytics.ts`, test files, AI route, global config | Available | Log in `coordination/session-logs/YYYY-MM-DD-A02.md` |
| `A03` | Curriculum roadmap lead | Learning path, secondary roadmap, grade/topic structure | `app/learning-path/`, `app/secondary-roadmap/`, `components/learning/`, `data/grades.ts`, `data/topics.ts` | Practice question bank, AI route, shared provider state, global config | Available | Log in `coordination/session-logs/YYYY-MM-DD-A03.md` |
| `A04` | Practice lead | Practice Arena, Mistake Book, question data | `app/practice/`, `app/mistake-book/`, `components/practice/`, `data/questions.ts` | Roadmap data, visualization modules, AI route, global config | Available | Log in `coordination/session-logs/YYYY-MM-DD-A04.md` |
| `A05` | Lesson lead | Lesson pages and lesson content modules | `app/lesson/`, `data/lessons.ts`, `components/lesson/` (now a large live tree including `components/lesson/ccss/lessons/` with 270+ CCSS lesson modules) | Dashboard, practice, visualization lab, AI route, global config | Available | Log in `coordination/session-logs/YYYY-MM-DD-A05.md` |
| `A06` | Visualization lead | Visualization Lab and interactive math modules | `app/visualization-lab/`, `app/student/tools/visualizations/`, visualization lab components in `components/visualizations/` including `VisualizationLabPage.tsx`, `ConfiguredVisualizationLab.tsx`, `CoordinatePlaneDemo.tsx`, `FunctionGraphExplorer.tsx`, `GeometryExplorer.tsx`, `ProbabilitySimulator.tsx`, `VisualizationCard.tsx`, `data/visualizationLabs.ts`, `lib/math.ts` | AI route, provider state, curriculum/content final signoff without A18 | Available | Log in `coordination/session-logs/YYYY-MM-DD-A06.md` |
| `A07` | AI tutor lead | Tutor panel, tutor API, LLM provider integration | `components/ai/`, `app/api/ai-tutor/route.ts`, `.env.local.example` | Real `.env*` secret files, visualization logic, analytics test logic, global config unless approved | Available | Log in `coordination/session-logs/YYYY-MM-DD-A07.md` |
| `A08` | State and analytics lead | Shared provider state, analytics logic, shared types/utilities | `components/providers/AppProviders.tsx`, `lib/learningAnalytics.ts`, `lib/learningAnalytics.test.ts`, `lib/utils.ts`, `types/index.ts` | UI page rewrites outside direct integration needs, AI route, package/config files | Available | Log in `coordination/session-logs/YYYY-MM-DD-A08.md` |
| `A09` | Copy, i18n, accessibility lead | Bilingual dictionary, copy consistency, accessible labels | `lib/i18n.ts`, copy-only or accessibility-only edits inside another session's owned files after coordination | Business logic, route rewrites, package/config files, real env files | Available | Log in `coordination/session-logs/YYYY-MM-DD-A09.md` |
| `A10` | Tooling, docs, report lead | Project docs, coordination, scripts, config, executive reporting | `README.md`, `AGENTS.md`, `.gitignore`, `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`, `coordination/` | Feature implementation inside other sessions' scopes unless assigned | Available | Log in `coordination/session-logs/YYYY-MM-DD-A10.md` |
| `A11` | QA and release quality lead | Regression quality, E2E ownership, QA matrices, release readiness | `tests/e2e/`, QA reports in `coordination/reports/`, release-readiness checklists, non-feature test helpers | Feature implementation in `app/`, `components/`, `lib/`, or `data/` unless explicitly assigned; real production write tests without approval | Available | Log in `coordination/session-logs/YYYY-MM-DD-A11.md` |
| `A12` | Backend/API platform lead | General API contracts, backend route stability, auth/session/storage platform | General `app/api/` routes except AI Tutor and adaptive routes, `lib/server/auth.ts`, `lib/server/sessionCookie.ts`, backend API tests, server storage architecture by coordination | `app/api/ai-tutor/`, `app/api/adaptive-learning/`, feature UI pages, real `.env*`, LLM prompt/provider behavior without A07/A15 coordination | Available | Log in `coordination/session-logs/YYYY-MM-DD-A12.md` |
| `A13` | Teacher console lead | Teacher Console UI, teacher workflows, teacher page-level product behavior | `app/teacher/`, `components/teacher/`, teacher handoff notes | General API implementation, parent/student UI, AI Tutor, adaptive engine, shared types/i18n except coordinated copy-only edits | Available | Log in `coordination/session-logs/YYYY-MM-DD-A13.md` |
| `A14` | Parent console lead | Parent Console UI, parent reports, messages, child-linking, guardian experience | `app/parent/`, `components/parent/`, parent handoff notes | Teacher/student UI, general API implementation, shared i18n terminology decisions without A09, auth/session internals | Available | Log in `coordination/session-logs/YYYY-MM-DD-A14.md` |
| `A15` | Adaptive engine lead | Adaptive Learning engine, BKT/LLM rerank guardrails, recommendation quality | `lib/adaptiveLearning.ts`, `lib/adaptiveLearning.test.ts`, `app/api/adaptive-learning/`, adaptive-specific tests, adaptive recommendation evaluation reports | AI Tutor chat API, global LLM provider changes without A07, dashboard/practice/lesson layout rewrites, shared types without A08 coordination | Available | Log in `coordination/session-logs/YYYY-MM-DD-A15.md` |
| `A16` | Research and learning science lead | Adaptive learning research, education theory, knowledge tracing literature, AI tutor pedagogy, evaluation design | `coordination/reports/`, future `coordination/research/`, literature reviews, research notes, algorithm recommendation reports, experiment plans, evaluation rubrics | Feature code unless explicitly assigned, `lib/adaptiveLearning.ts`, AI Tutor / LLM provider code, real student data analysis without approval, unverified latest-research claims without source/date | Available | Log in `coordination/session-logs/YYYY-MM-DD-A16.md` |
| `A17` | Gamification and motivation lead | Badges, streaks, levels, quests, class leaderboards, teacher reward campaigns, parent motivation reports, anti-abuse rules, reward economy balance | `lib/gamification.ts`, `lib/gamification.test.ts`, `data/gamification.ts`, reward/motivation components in `components/gamification/`, gamification-specific UI/API by coordination, reward economy reports | Actual game loops, level design, platformer/fishing gameplay, `components/gamification/FishingGame.tsx`, `components/gamification/QuadraticBonusGame.tsx`, game-specific routes without A20 coordination, adaptive engine behavior without A15 coordination, backend storage architecture without A12 coordination, A18-owned curriculum/content correctness decisions | Available | Log in `coordination/session-logs/YYYY-MM-DD-A17.md` |
| `A18` | Curriculum QA and content quality lead | Independent question quality, answer validation, lesson/content QA, curriculum alignment, expert review, and final content acceptance recommendations for HK, Chinese mainland 人教版/北师大版 math, and US math covering Common Core, AP Math, SAT/ACT Math, and US state standards. US scope excludes IB, A-Level, and other international curricula unless explicitly assigned later. | Content QA reports, curriculum alignment matrices, content review checklists, expert review reports, final QA decision artifacts, and issue reports for question/topic/lesson data under `coordination/content-qa/` | Content generation pipeline ownership now assigned to A21, large direct edits to question bank or lesson source files without assignment, adaptive engine implementation, practice/lesson UI rewrites, shared types/API/storage, unverified curriculum claims | Available | Log in `coordination/session-logs/YYYY-MM-DD-A18.md` |
| `A19` | API configuration and deployment env lead | Local API environment configuration, Vercel Environment Variables, LLM/SimpleTex/other API readiness and troubleshooting | Owner-assigned `.env.local` API configuration, `.env.local.example`, API/deployment environment variable inventories, Vercel project Environment Variables, redacted API configuration reports in `coordination/` | API/provider business logic, `app/api/`, `lib/server/llmProvider.ts`, LLM prompt/model/cost behavior without A07/A15 coordination, feature UI, package/config files except `.env.local.example`, writing real secrets to Git/logs/reports/screenshots/command output | Available | Log in `coordination/session-logs/YYYY-MM-DD-A19.md` |
| `A20` | Game design and game-based learning lead | Platformer-style math games, fishing games, matching/elimination games, game loops, level design, educational game mechanics, game-based learning pedagogy | `app/games/`, `app/student/practice/games/`, `components/games/`, `lib/gameBasedLearning.ts`, `lib/gameBasedLearning.test.ts`, `data/gameBasedLearning.ts`, game-specific reports, `components/gamification/FishingGame.tsx`, `components/gamification/AdventureIslandGame.tsx`, `components/gamification/QuadraticBonusGame.tsx`, `app/practice/fishing-game/`, `app/practice/quadratic-bonus/`, game-specific completion routes, game-specific E2E tests | Reward economy, badges, streaks, leaderboards, teacher reward campaigns, parent motivation reports, broad gamification storage/API without A17/A12 coordination, curriculum correctness without A18 coordination, question-bank edits without A04/A18 coordination, launching draft games into primary navigation without owner approval, copyrighted game assets/names/sprites/sounds/level designs without licensed owner-provided assets | Available | Log in `coordination/session-logs/YYYY-MM-DD-A20.md` |
| `A21` | Content pipeline and RAG operations lead | Content generation pipelines, candidate question-bank packages, RAG intake/build operations, local/private corpus handling, generated-content handoff packaging, and content asset production logistics | Package-local generation and QA-operation scripts under `coordination/content-qa/`, candidate packages under `coordination/content-qa/`, owner-assigned `data/generated-content/` candidate handoffs, owner-assigned `public/question-illustrations/` production assets, local-only `.local/rag/` outputs, content/RAG pipeline reports | A18-owned final curriculum quality signoff, live `data/questions.ts`/topic/lesson source edits without A04/A05/A18 assignment, app UI/routes, provider/API behavior, real `.env*`, package/config files, committing raw copyrighted corpus text, unapproved public exposure of local/private RAG chunks | Available | Log in `coordination/session-logs/YYYY-MM-DD-A21.md` |
| `A22` | Production reliability and release engineering lead | Build/dev-server isolation, Playwright harness stability, Vercel deployment hygiene, deployment-size controls, local/production parity checks, release-blocker root-cause analysis | `playwright.config.ts`, `.vercelignore`, release/deployment reports in `coordination/reports/`, release-readiness artifacts, non-feature test harness helpers by A11 coordination, owner-assigned build/deploy scripts and config changes by A10 coordination | Feature bug fixes in `app/`, `components/`, `lib/`, or `data/` unless explicitly assigned, test assertion ownership without A11 coordination, API/provider business logic without A07/A12/A15 coordination, real `.env*`, Vercel secret values, package upgrades without A10/owner approval | Available | Log in `coordination/session-logs/YYYY-MM-DD-A22.md` |
| `A23` | Integration and promotion lead | Candidate-to-live promotion planning, release intake, integration sequencing, and cross-session handoff from A18/A21 packages into A04/A05/A11/A22 gates | `coordination/integration/`, integration and promotion reports in `coordination/reports/`, candidate-to-live checklists, owner-assigned adapter/source integration files only when explicitly listed in the assignment | Direct live `data/questions.ts`, `data/topics.ts`, `data/grades.ts`, lesson source, app UI, API, shared type, or asset edits without explicit owner assignment and owning-session coordination; final curriculum QA signoff; regression ownership | Available | Log in `coordination/session-logs/YYYY-MM-DD-A23.md` |
| `A24` | Illustration exact-layer lead | Deterministic math overlays for textbook/practice illustrations, including SVG/Plotly/KaTeX/MathJax/MAIS frontend layers, coordinates, formulas, units, and answer labels | Exact-layer package scripts/artifacts under `coordination/content-qa/`, deterministic overlay manifests, owner-assigned exact SVG/metadata assets under `public/question-illustrations/`, exact-layer QA handoff reports | Bitmap image generation, final curriculum/source-distance approval, live lesson/question integration, unrelated UI routes/components, raw copyrighted source reconstruction, provider/API/env behavior | Available | Log in `coordination/session-logs/YYYY-MM-DD-A24.md` |
| `A25` | Git hygiene and release intake lead | Dirty-tree inventory, ownership mapping, PR/commit slicing recommendations, conflict detection, release-readiness intake, and non-destructive Git status reporting | `coordination/release-intake/`, git hygiene reports in `coordination/reports/`, release intake checklists, ownership/conflict maps, A25 session-log artifacts | Staging, committing, branching, merging, rebasing, pushing, deleting, resetting, or reverting files unless explicitly assigned by the owner; feature code edits; generated content or asset production; secret files | Available | Log in `coordination/session-logs/YYYY-MM-DD-A25.md` |

### Shared Files Requiring Explicit Coordination

These files affect many sessions and should be edited by only one assigned session at a time:

- `types/index.ts`
- `components/providers/AppProviders.tsx`
- `lib/i18n.ts`
- `app/globals.css`
- `package.json`
- `tailwind.config.ts`
- `tsconfig.json`
- `next.config.ts`
- `README.md`
- `AGENTS.md`
- `.env.local.example`
- `tests/e2e/`
- `playwright.config.ts`
- `.vercelignore`
- `lib/server/userStore.ts`
- `lib/server/llmProvider.ts`
- `lib/difficulty.ts`
- `lib/difficulty.test.ts`
- `app/api/` route families by domain
- `components/dashboard/AdaptiveLearningContent.tsx`
- `app/visualization-lab/`
- `app/student/tools/visualizations/`
- `components/visualizations/VisualizationLabPage.tsx`
- `components/visualizations/ConfiguredVisualizationLab.tsx`
- `data/visualizationLabs.ts`
- `lib/gamification.ts`
- `data/gamification.ts`
- `app/games/`
- `app/student/practice/games/`
- `components/games/`
- `lib/gameBasedLearning.ts`
- `lib/gameBasedLearning.test.ts`
- `data/gameBasedLearning.ts`
- `components/gamification/FishingGame.tsx`
- `components/gamification/AdventureIslandGame.tsx`
- `components/gamification/QuadraticBonusGame.tsx`
- `app/practice/fishing-game/`
- `app/practice/quadratic-bonus/`
- `app/api/gamification/fishing-game/`
- `app/api/gamification/bonus-games/quadratic/`
- `data/questions.ts`
- `data/topics.ts`
- `data/grades.ts`
- `data/lessons.ts`
- `components/lesson/`
- `data/generated-content/`
- `data/rag/`
- `lib/rag/`
- `coordination/content-qa/`
- `public/question-illustrations/`
- `.local/rag/`
- `coordination/integration/`
- `coordination/release-intake/`
- content/RAG pipeline scripts in `scripts/`

If a task needs one of these files and it is outside the session's allowed scope, the session must stop and write a blocker report unless the assignment explicitly grants ownership.

Default shared-area ownership:

- A11-owned `tests/e2e/` covers suite structure, release gates, broad regression matrices, and product assertions. A22 may edit non-feature harness helpers only with A11 coordination. Feature sessions may add focused tests only inside an explicit assignment and should coordinate broad test architecture with A11.
- A22-owned release reliability covers `playwright.config.ts`, `.vercelignore`, build/dev-server isolation, deployment-size hygiene, and production/local parity harnesses. A22 must coordinate config/package changes with A10, test assertions with A11, provider/env parity with A19, and route/API behavior with A12.
- A12-owned general backend contracts cover `app/api/`. AI Tutor routes remain A07-owned, and adaptive-learning routes remain A15-owned.
- A12-owned storage architecture covers the shared server persistence file `lib/server/userStore.ts`; A15 may edit adaptive-specific sections only with A12 coordination.
- A07-owned provider integration covers `lib/server/llmProvider.ts`. A15 may consume it for adaptive reranking only by coordinating provider/model/cost behavior with A07.
- A08-owned shared type semantics cover `types/index.ts`, `lib/difficulty.ts`, and app-wide difficulty schema changes, with A10/A22 coordination when schema drift blocks type-check/build. A18 may recommend content difficulty views or mappings, but must not migrate the app-wide schema alone.
- A19-owned API environment work covers variable inventory, owner-assigned local/Vercel secret placement, deployment environment parity, and redacted configuration runbooks. API/provider behavior is not A19-owned; AI Tutor and LLM provider behavior remains A07-owned, backend/API route contracts remain A12-owned, and adaptive LLM rerank semantics and guardrails remain A15-owned.
- A02/A15-owned dashboard adaptive surface covers `components/dashboard/AdaptiveLearningContent.tsx`; edits that alter recommendation behavior, engine status, or adaptive copy require A15 coordination.
- A06-owned Visualization Lab runtime covers configured visualization templates and `data/visualizationLabs.ts`. A06 may fix playability, template mapping, and math-state consistency, but curriculum/topic-fit signoff remains A18-owned and durable regression/release gates remain A11/A22-owned.
- A16-owned `coordination/research/` covers learning-science research notes, literature reviews, and experiment design. Research recommendations do not authorize feature-code changes unless the owner assigns implementation work.
- A17-owned gamification architecture covers XP, points, badges, levels, quests, streaks, leaderboards, anti-abuse rules, reward campaigns, parent motivation, and reward economy balance. Student dashboard, teacher campaign, parent motivation, and backend persistence edits must be coordinated with A02, A13, A14, and A12 respectively.
- A18-owned curriculum and content QA covers QA reports, expert review reports, final QA decisions, and alignment matrices by default for HK curriculum, Chinese mainland 人教版/北师大版 math, and US math curriculum covering Common Core, AP Math, SAT/ACT Math, and US state standards. A18's US scope does not include IB, A-Level, or other international curricula unless the owner explicitly assigns them later. Direct edits to question, topic, grade, or lesson source data require an explicit assignment and coordination with A03, A04, or A05.
- A21-owned content pipeline and RAG operations cover package-local generation scripts, candidate question-bank packages, RAG intake/build artifacts, local/private corpus manifests, and generated-content handoff artifacts inside assigned content-pipeline scopes. Final curriculum signoff is not A21-owned; A18 must independently review QA acceptance before A04/A05/A11 integrate content into live app surfaces. Raw local/private corpus text must remain in ignored local storage unless the owner documents rights and explicitly approves public exposure.
- A20-owned game-based learning covers actual educational games, including platformer-style math games, fishing games, matching/elimination games, game loops, input/physics, level design, game-embedded math challenges, and game pedagogy. Existing Fishing Game, Adventure Island, Quadratic Bonus Game, and internal draft game routes are A20-owned by coordination contract even if some surfaces remain in current `gamification` paths until a separately assigned migration.
- A23-owned candidate-to-live integration and promotion planning covers intake, readiness gates, promotion checklists, and owning agent session handoffs, but A23 cannot make live data/source edits unless the owner explicitly assigns those exact files and the owning agent sessions agree.
- A24-owned deterministic illustration exact layers cover exact overlay construction and validation handoffs after A21 bitmap/candidate production and before A18/human final approval. Source-distance, curriculum, and final approval gates remain A18-owned.
- A25-owned git hygiene and release intake covers dirty-tree inventory, ownership maps, and PR/commit slicing recommendations, but A25 must not stage, commit, branch, merge, rebase, push, delete, reset, or revert without explicit owner instruction.

## Work Assignment Rules

When assigning work, give each agent session a clear package:

- Agent ID: one of `A01` to `A25`.
- Objective: the result expected by morning or by the end of the work period.
- Write scope: exact files/directories the session may edit.
- Forbidden scope: files/directories the session must not edit.
- Acceptance criteria: what must be true for the task to be complete.
- Checks: commands or manual checks expected before handoff.
- Stop conditions: decisions that require owner input.

Before editing, each session must:

1. Apply the applicable instructions already supplied in context, and read additional task-relevant sections of this `AGENTS.md` as needed.
2. Read the current assignment.
3. Inspect the relevant files.
4. Create or update its session log.
5. Write a short plan with intended files to change.
6. Confirm the plan stays inside the assigned write scope.

Codex visible progress updates:

- Every Codex progress/status message shown to the owner must name the responsible agent IDs and, when helpful, their role names. Do not describe ownership only as a generic layer such as "code layer", "QA", "release", or "content"; write entries like `A19-owned API configuration readiness`, `A22-owned release engineering`, or `A07-owned AI tutor behavior`.
- If an update involves multiple responsible agents, list each relevant agent ID with its responsibility in the same update, for example `A19-owned redacted provider readiness; A07-owned provider behavior; A22-owned release smoke evidence`.
- If a session is only consuming another agent session's output, state that relationship explicitly rather than implying shared ownership.
- This applies to short live updates, smoke-test narration, blocker descriptions, handoff notes, and report summaries. The owner should be able to tell from the visible Codex text which agent is accountable for each workstream without opening the logs.

After editing, each session must report:

- What changed.
- Files changed.
- Tests/checks run, with results.
- Tests/checks not run, with reasons.
- Assumptions made.
- Risks found.
- Blockers or follow-up work.
- Dirty state final action: reviewed commit | owner-approved discard | evidence archive | blocker.
- Worktree lifecycle action: retained clean | PR opened | archived | removed | blocker.

## Nightly AI Coordination Meeting

Use this workflow when the owner assigns work before sleeping. This is an asynchronous coordination meeting, not a free-form real-time chat. The meeting happens through session logs, blocker reports, handoff notes, and A10's morning synthesis.

Default reporting window:

- Previous day 08:00-current day 08:00 Asia/Hong_Kong: A10 or the reporting automation summarizes AI session work, risks, blockers, test status, and decisions needed.
- 08:00 Asia/Hong_Kong: reporting window closes for the daily president report.
- 07:45 Asia/Hong_Kong: assigned agents stop starting large new edits and complete handoff notes for inclusion when practical.
- 07:50-08:00 Asia/Hong_Kong: A10 reviews logs, blockers, changed files, and check results.
- 08:00 Asia/Hong_Kong: A10 or a Codex automation produces the DOCX president report for Dr. Peter Hu.

Participation rules:

1. Only sessions explicitly assigned by the owner for that night may write feature code.
2. Unassigned sessions may be referenced in logs or reports, but they do not write code or make decisions.
3. A10 is the meeting secretary, quality coordinator, and president-report owner.
4. A10 may read every session log and blocker report, but should not edit another session's log except as part of the morning report process.
5. A10's default write scope for nightly coordination is `coordination/`, docs, config, and reports; A10 must not implement feature work inside non-A10 session scopes unless the owner explicitly assigns that work.
6. If no work or assignment exists in the previous-day-08:00-to-current-day-08:00 reporting window, A10's report should state `No assigned work in this reporting window` and summarize only the latest available project status.

Nightly meeting rhythm:

1. 00:00 kickoff: A10 checks the owner's assignments, confirms each assigned session's write scope, and notes any obvious scope conflicts.
2. 02:30 checkpoint: assigned agents record current progress, risks, changed files so far, and any scope or dependency conflict.
3. 05:30 checkpoint: assigned agents prioritize blockers, test status, cross-role dependencies, and any work that must stop before morning.
4. 07:45 handoff: assigned agents finish their Agent Daily Work Report entries and avoid starting broad new changes.
5. 07:50-08:00 synthesis: A10 reads session logs and blockers from the reporting window, inspects project status, runs safe checks when practical, and writes the president report.

Nightly outputs:

- Agent daily work reports: `coordination/session-logs/YYYY-MM-DD-AXX.md`
- Blocker reports when needed: `coordination/blockers/YYYY-MM-DD-AXX.md`
- President report for Dr. Peter Hu: `coordination/reports/YYYY-MM-DD-president-report.docx`

Sessions must stop instead of guessing when they encounter:

- Risky architecture decisions that affect multiple workstreams.
- Destructive operations such as deleting large sections, resetting files, or replacing app structure.
- Secrets, production credentials, or requests to edit `.env.local`, except for owner-assigned A19-owned API configuration tasks. A19-owned API configuration work must keep real values out of Git, session logs, reports, screenshots, and command output, and may record only variable names, target environments, local/Preview/Production status, and redacted results.
- Unclear requirements that could send the project in two incompatible directions.
- Merge conflicts or simultaneous edits to the same file.
- Package upgrades or dependency changes not included in the assignment.
- Any need to revert unrelated user or session changes.

## Coordination Rules

- One file should have one writer at a time.
- Use separate session logs, not a shared live scratch file, to avoid log conflicts.
- Do not edit another session's log except for the morning report process.
- Do not update the agent table above during parallel work unless the owner assigned you to coordinate status.
- Put live status, decisions, and handoff notes in the session log.
- Mirror the same responsible agent IDs used in the session log in any Codex-visible progress text, especially when the update references a file, smoke test, provider, release gate, or blocker.
- If two tasks need the same shared file, split the work by time: one session finishes and hands off before the next starts.
- Dev/preview server isolation (A22-owned, applies to every session): parallel sessions must never run bare `npm run dev`/`next dev`/`next start` against the shared root `.next`. A stray dev server rewrites the shared `.next` into dev format (removes `BUILD_ID`), which breaks other sessions' `next start` with HTTP 400s on hashed chunks and can crash concurrent `tsc` gates with TS6053 while it regenerates `.next/types`. Instead run `npm run dev:isolated` (isolated `NEXT_DIST_DIR` under `.tmp/` + an owned port) or set `NEXT_DIST_DIR=.tmp/<label>` explicitly, and choose a session-owned port. Orphaned `next-server` children survive normal task termination, so clean them by port with `npm run kill-port -- <port>` (or `lsof -ti :<port> | xargs kill -9`), never by a broad process kill.
- Start non-inventory implementation work in an isolated branch/worktree (naming per the Root And Worktree Policy). If a task must be done from the dirty root for inventory reasons, state that it is root inventory/reporting work and keep writes inside A10/A25/A22-owned coordination/tooling scope.
- Prefer additive, local changes over large cross-project rewrites.
- Do not change public behavior outside the assignment unless needed to fix a bug introduced by the task.
- Do not touch generated runtime output directories. Candidate generated content under `data/generated-content/`, `coordination/content-qa/`, `public/question-illustrations/`, or local/private `.local/rag/` storage may be handled only inside an owner-assigned A21/content-pipeline scope.
- A11 may write tests, QA reports, and release-readiness matrices, but must not fix feature bugs outside an explicit owner assignment.
- A12-owned scope covers route contracts and backend architecture; feature UI owners keep persona workflow decisions and should coordinate API needs with A12.
- A15-owned scope covers adaptive logic and recommendation quality; provider/model changes require A07 coordination, and shared type changes require A08 coordination.
- A16-owned scope covers research evidence, literature reviews, theory assumptions, experiment design, and educational-validity memos; A16 must not implement feature code unless explicitly assigned.
- A17-owned scope covers gamification and motivation-system design across XP, points, badges, streaks, levels, quests, leaderboards, reward campaigns, parent motivation reports, anti-abuse rules, and reward economy balance.
- A18-owned scope covers independent curriculum/content QA evidence, answer validation, expert review, final QA decisions, alignment matrices, and content-quality reports for HK curriculum, 人教版 and 北师大版 math alignment, and US math curriculum alignment for Common Core, AP Math, SAT/ACT Math, and US state standards. IB, A-Level, and other international curricula remain out of scope unless explicitly assigned later.
- A19-owned scope covers API environment variable inventory, local website API configuration, Vercel Add Environment Variable execution, deployment environment parity, and redacted API configuration runbooks. A19 must coordinate code or behavior fixes with A07 for AI Tutor/LLM provider behavior, A12 for backend/API contracts, and A15 for adaptive LLM rerank semantics.
- A20-owned scope covers actual game-based learning design and implementation, including platformer-style math games, fishing games, matching/elimination games, game loops, level design, input/physics feel, and game-embedded math challenges. A20 must coordinate rewards with A17, game storage/API contracts with A12, math question quality with A04/A18, E2E coverage with A11, and package/config changes with A10.
- A21-owned scope covers content generation pipelines and RAG operations, including package-local generation scripts, candidate question-bank packages, generated-content handoff artifacts, question-illustration production logistics, and local/private corpus manifests. A21 must coordinate final quality decisions with A18, live practice integration with A04, lesson integration with A05, regression coverage with A11, provider/env readiness with A19, and release packaging with A22.
- A22-owned scope covers production reliability and release engineering, including build/dev-server isolation, nested workspace-copy exclusion such as `MAIS-MVP-*` folders, Playwright harness stability, Vercel deployment hygiene, deployment-size controls, local/production parity checks, and release-blocker root-cause reports. A22 must coordinate docs/config/package changes with A10, test assertions with A11, environment parity with A19, and product bug fixes with the owning feature/API sessions.
- A23-owned scope covers candidate-to-live promotion planning, integration readiness gates, and cross-session handoffs from A18/A21 outputs to A04/A05/A11/A22 implementation and regression owners. A23 must not bypass final content QA, live data ownership, or release gates.
- A24-owned scope covers deterministic illustration exact-layer construction and validation handoff for formulas, coordinates, graph values, dimensions, units, and answer labels. A24 must coordinate bitmap/candidate provenance with A21, final QA with A18, app rendering with A05/A06 when needed, and release checks with A11/A22.
- A25-owned scope covers non-destructive git hygiene, dirty-tree inventory, ownership maps, PR/commit slicing recommendations, and release intake triage. A25 must not perform Git state mutations unless explicitly assigned by the owner.
- When the root worktree is too dirty for direct release, the default path is A25 ownership mapping, A10/A25 release-slice packaging, A22 clean worktree or pruned staging, and A11 targeted regression. Do not add a new release agent for this situation.
- The content promotion chain is A21 candidate generation/RAG operations -> A18 independent QA decision -> A24 deterministic exact-layer work when needed -> A23 integration planning -> A04/A05/A11/A22 live-surface and release gates. Do not bypass this chain by creating another content agent.

Recommended coordination paths:

- Session logs: `coordination/session-logs/YYYY-MM-DD-AXX.md`
- Blockers: `coordination/blockers/YYYY-MM-DD-AXX.md`
- President reports: `coordination/reports/YYYY-MM-DD-president-report.docx`
- Other project reports: `coordination/reports/YYYY-MM-DD-report-name.md`

These folders may be created by the first session that needs them.

## Quality Bar

Every completed code task must run the relevant checks before handoff:

- Documentation-only changes: no code check required, but say "Not run: documentation-only change."
- Type or shared logic changes: run `npm run type-check`.
- Learning analytics changes: run `npm run test:analytics` and `npm run type-check`.
- Adaptive engine changes: run `npm run test:analytics` and `npm run type-check`; use mocked adaptive API/Playwright coverage when provider behavior changes. Do not call live LLM providers without owner approval.
- Research/learning-science changes: cite source, year, source type, and applicability; no code check is required for research-only reports, but say "Not run: research/documentation-only change."
- Gamification changes: coordinate with A17; run `npm run type-check`; run gamification-specific tests when present; run targeted UI/API checks for XP, points, badges, streaks, quests, leaderboards, reward campaigns, and anti-abuse behavior touched by the task.
- Game-based learning changes: coordinate with A20; run `npm run type-check`; run targeted game E2E checks such as `tests/e2e/fishing-game.spec.ts` or `tests/e2e/quadratic-bonus.spec.ts` when touched; inspect affected game routes in the browser when practical; document if live gameplay/manual browser verification is blocked. Do not introduce copyrighted game assets, names, sprites, sounds, or level designs unless the owner explicitly provides licensed assets.
- Curriculum/content QA changes: coordinate with A18; content-report-only work needs no code check; direct source-data edits should run `npm run type-check` and relevant practice/lesson/adaptive checks based on affected surfaces.
- Content pipeline/RAG operations changes: coordinate with A21 and A18. Candidate-package-only work should run package-local syntax/audit checks and document if no app checks are required; generated-content handoffs that touch production TypeScript data should run `npm run type-check`, relevant RAG/question-bank checks, and any A18-required acceptance gate. Raw local/private corpus text must stay out of Git, reports, screenshots, and provider uploads unless the owner explicitly approves the rights policy.
- Candidate-to-live integration changes: coordinate with A23 plus the owning live-surface sessions. Planning/report-only work needs no code check; live question or lesson source edits should run `npm run type-check`, relevant question-bank/lesson/adaptive checks, and A11 regression gates required by the affected surface.
- Illustration exact-layer changes: coordinate with A24 and A18. Package-local overlay work should run exact-layer validator/syntax checks; production asset or rendering changes should also run `npm run type-check` and targeted browser or visual checks when practical.
- Git hygiene/release intake changes: coordinate with A25. Inventory/report-only work needs no code check and must remain non-destructive; any owner-approved Git operation must be reported with exact scope and result.
- Route, provider, or app-wide changes: run `npm run type-check`; run `npm run build` when the change affects routing, config, imports, or server/client boundaries.
- Backend/API platform changes: coordinate with A12, then run `npm run type-check`; run `npm run test:backend` and usually `npm run build` for route/server changes.
- Visual UI changes: run `npm run type-check`; if a dev server is available, inspect the affected route in the browser.
- E2E/regression-matrix changes: coordinate broad suite structure with A11; run `npm run type-check` and the targeted Playwright command, or document why the local build/browser environment blocks it.
- Production reliability/release engineering changes: coordinate with A22; run the narrowest meaningful build/dev-server/deploy harness checks, usually `npm run type-check`, `npm run build`, targeted Playwright parity checks, or documented Vercel preview verification depending on the surface touched. A22 reports root causes and release blockers but does not fix feature behavior unless explicitly assigned.
- AI tutor/API changes: run `npm run type-check`; run `npm run build` if the API contract or server runtime changes. Do not call real LLM providers unless the owner explicitly asks.
- API environment configuration changes: coordinate with A19. For docs or environment-variable placement only, no code check is required; say "Not run: configuration/documentation-only change." For local or Vercel live-provider smoke tests, use owner-approved credentials only, redact all values, and document provider cost/rate-limit risk.
- Package/config changes: coordinate with `A10` and A22 when release/build behavior is affected, then run `npm install` only if dependency files require it, followed by `npm run type-check` and usually `npm run build`.

If a check cannot be run, the session must explain why and state the remaining risk.

A11-owned quality covers regression-matrix upkeep and release-quality gate reporting. A10-owned quality covers president-report synthesis and coordination reporting. A16-owned quality covers research evidence. A17-owned quality covers reward-economy behavior. A18-owned quality covers independent curriculum/content review. A19-owned quality covers API environment configuration and redacted local/Vercel deployment-env parity checks. A20-owned quality covers actual educational games and game-based learning design. A21-owned quality covers content pipeline/RAG operations. A22-owned quality covers production reliability and release engineering. A23-owned quality covers candidate-to-live integration and promotion. A24-owned quality covers deterministic illustration exact layers. A25-owned quality covers non-destructive git hygiene and release intake.

## 8 AM President Report

At 8:00 AM Asia/Hong_Kong time, A10 or the recurring reporting automation should create a concise, business-formatted bilingual DOCX president report for Dr. Peter Hu covering the reporting window from the previous calendar day at 08:00 to the report date at 08:00 Asia/Hong_Kong.

The report should be generated from:

- All session logs in `coordination/session-logs/`.
- Blocker reports in `coordination/blockers/`.
- Release-intake and ownership maps in `coordination/release-intake/`, especially the latest A25 daily release intake.
- Integration decisions in `coordination/integration/` and candidate-to-live reports from A23.
- Current project files changed during the reporting window.
- Available check outputs from each session.
- Fresh checks run by the report owner when practical.

The report should summarize:

- Chinese Executive Summary.
- English Executive Summary.
- Reporting-window summary.
- Overall project progress.
- Completed work by session.
- In-progress work.
- Blockers.
- Risks.
- Test/build status.
- Files changed.
- Tomorrow priorities.
- Owner decisions needed.

The final artifact should be `coordination/reports/YYYY-MM-DD-president-report.docx`, with simple business formatting: clear title metadata, concise bilingual executive summaries, readable tables, restrained typography, and no decorative layout. A temporary Markdown outline may be used only as an intermediate working artifact; the deliverable for Dr. Peter Hu is the DOCX file.

If the environment supports recurring Codex automations, ask Codex to create a daily 8:00 AM Asia/Hong_Kong automation for this project with a prompt like:

```text
Every day at 8:00 AM Asia/Hong_Kong, inspect /Volumes/Starship/MAIS-MVP. Read AGENTS.md, collect the latest session logs and blockers from coordination/, inspect the project status, run safe relevant checks when practical, and produce a concise bilingual DOCX president report for Dr. Peter Hu at coordination/reports/YYYY-MM-DD-president-report.docx. The reporting window is previous calendar day 08:00 through report date 08:00 Asia/Hong_Kong. The report must include a Chinese Executive Summary, English Executive Summary, reporting-window summary, project progress update, A01-A25 agent session status table, blockers, risks, test/build status, files changed, tomorrow priorities, and owner decisions needed. Use simple business formatting with readable tables and restrained typography. If no assignment or fresh work is found in the reporting window, state "No assigned work in this reporting window" and summarize the latest available project status. Do not edit feature code.
```

Do not ask the automation to edit feature code unless the owner explicitly assigns that work. The morning automation's default job is reporting and triage.

## Templates

### Agent Session Assignment Template

```markdown
# Agent Session Assignment

- Date:
- Agent ID:
- Workstream:
- Objective:
- Allowed write scope:
- Forbidden write scope:
- Acceptance criteria:
- Required checks:
- Stop conditions:
- Notes from owner:
```

### Nightly Assignment Template

Use this when the owner assigns night work before resting.

```markdown
# Nightly Assignment

- Date:
- Night work window: 00:00-08:00 Asia/Hong_Kong
- President-report window: Previous day 08:00-current day 08:00 Asia/Hong_Kong
- Assigned agent sessions:
- Meeting secretary: A10
- Reporting deadline: 8:00 AM Asia/Hong_Kong

## Agent Session Packages

| Agent | Workstream | Objective | Allowed write scope | Forbidden write scope | Acceptance criteria | Required checks | Stop conditions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AXX |  |  |  |  |  |  |  |

## Cross-Session Notes

- Shared files reserved tonight:
- Known dependencies:
- Owner priorities:
- Decisions already made:
```

### Session Handoff Template

```markdown
# Session Handoff

- Date:
- Agent ID:
- Workstream:
- Status: Completed | In progress | Blocked
- Summary:
- Files changed:
- Checks run:
- Checks not run:
- Assumptions:
- Blockers:
- Risks:
- Follow-up recommendations:
- Next suggested owner/agent:
```

### Agent Daily Work Report Template

Append this to the agent's own `coordination/session-logs/YYYY-MM-DD-AXX.md` before stopping.

```markdown
# Agent Daily Work Report

- Date:
- Agent ID:
- Workstream:
- Status: Completed | In progress | Blocked
- Objective:
- Summary of work completed:
- Files changed:
- Checks run:
- Checks not run:
- Blockers:
- Risks:
- Assumptions:
- Coordination notes for other agent sessions:
- Follow-up recommendations:
- Next suggested owner/agent:
```

### Blocker Report Template

```markdown
# Blocker Report

- Date:
- Agent ID:
- Task:
- Blocker type: Architecture | Scope conflict | Secret/credential | Missing requirement | Merge conflict | Dependency change | Other
- What happened:
- Files involved:
- Why the session stopped:
- Decision needed from owner:
- Safe next step:
```

### A25 Daily Release Intake Template

A25 should create or update `coordination/release-intake/YYYY-MM-DD-A25-daily-release-intake.md` before morning synthesis or release planning.

```markdown
# A25 Daily Release Intake

- Date:
- Agent ID: A25
- Scope: Non-destructive dirty-tree and release-intake inventory
- Commands run:
  - `npm run release:dirty-map -- --reason "..."`
- Git status counts:
  - Modified:
  - Deleted:
  - Untracked status entries:
  - Untracked files:
- Largest dirty top-level areas:
- Shared files currently dirty:
- Ownership map:
  - A01:
  - A02:
  - A03:
  - A04:
  - A05:
  - A06:
  - A07:
  - A08:
  - A09:
  - A10:
  - A11:
  - A12:
  - A13:
  - A14:
  - A15:
  - A16:
  - A17:
  - A18:
  - A19:
  - A20:
  - A21:
  - A22:
  - A23:
  - A24:
  - A25:
- Conflict risks:
- Recommended PR/commit slices:
  - Runtime app/API/data:
  - Tests/regression evidence:
  - Docs/coordination evidence:
  - Content/RAG backlog:
  - Release hygiene tooling/config:
  - Local/generated quarantine:
- Release-safe clean-slice candidates:
- Files or directories that must not be staged:
- A22 clean release path:
- A22 generated cleanup status:
  - Dry run command:
  - Apply command, if owner-approved:
  - Playwright traces/reports preserved:
- Owner decisions needed:
```

### A11 Student Regression Split Template

When the student E2E gate is red, A11 should create `coordination/reports/YYYY-MM-DD-A11-student-regression-split.md` and assign each failure cluster to an owning agent session.

```markdown
# A11 Student Regression Split

- Date:
- Agent ID: A11
- Source run/artifacts:
- Overall gate status: Red | Yellow | Green
- Summary:

| Package | Owning agent | Failure cluster | Evidence | Suggested targeted command | Stop condition |
| --- | --- | --- | --- | --- | --- |
| A01 shell/auth | A01 + A09 when labels/selectors are involved |  |  |  |  |
| A02 dashboard/progress/adaptive display | A02 + A15 when semantics are involved |  |  |  |  |
| A03 roadmap | A03 + A09 when i18n/demo labels are involved |  |  |  |  |
| A04 Practice Arena | A04 + A15 when adaptive lock/free-selection semantics are involved |  |  |  |  |
| A05 lessons/textbooks | A05 + A18/A21/A23 when content packages are involved |  |  |  |  |
| A06 Visualization Lab | A06 |  |  |  |  |
| A09 copy/accessibility selectors | A09 with the owning feature session |  |  |  |  |
| A15 adaptive semantics | A15 + A02/A04 when UI surfaces consume adaptive state |  |  |  |  |

- Cross-package blockers:
- Checks to rerun after fixes:
- Owner decisions needed:
```

### A08/A10 Shared Drift Template

A08/A10 should use this when type-check, build, shared schema, or coordination-contract drift blocks other sessions.

```markdown
# A08/A10 Shared Drift Report

- Date:
- Primary owner: A08 shared state/types | A10 docs/config/tooling
- Consuming sessions:
- Drift type: Type schema | App provider state | Config/build | Coordination contract | Test harness
- Evidence:
- Dirty files involved:
- Ownership:
- Minimal cleanup slice:
- Required checks:
- A08-owned scope:
- A10-owned scope:
- A22-owned scope, if build/release isolation is affected:
- A11-owned scope, if regression harness assertions are affected:
- Stop conditions:
```

### A23 Candidate-To-Live Gate Template

A23 should use this before any A18/A21 content package is promoted into live app surfaces.

```markdown
# A23 Candidate-To-Live Gate

- Date:
- Agent ID: A23
- Candidate package:
- Upstream owner: A21
- Independent QA owner: A18
- Exact-layer owner, if needed: A24
- Live-surface owner: A04 practice | A05 lesson | A03 roadmap | other
- Regression owner: A11
- Release owner: A22
- Current decision: Candidate-only | Approved for integration review | Integrated, hold production | Promoted to production

## Required Evidence

- A21 candidate artifacts complete:
- A18 QA decision:
- A24 exact-layer decision, if needed:
- Owning live-surface integration plan:
- A11 targeted regression:
- A22 clean release slice or release blocker:
- Owner production approval, if needed:

## Promotion Decision

- Decision:
- Files allowed into live integration:
- Files explicitly excluded:
- Release path:
- Rollback/downlist path:
- Owner decisions needed:
```

### President Report DOCX Content Template

Use this content order for the DOCX president report. The DOCX should be concise, bilingual, and business-formatted with clear headings, readable tables, and restrained typography.

```text
President Report

Report date:
Report time: 8:00 AM Asia/Hong_Kong
Project: MAIS-MVP
Reporting agent: A10
Audience: Dr. Peter Hu
Reporting window: Previous day 08:00-current day 08:00 Asia/Hong_Kong

中文 Executive Summary

用中文简要说明项目健康度、报告窗口内是否推进、最重要成果、最大风险，以及今天最需要 Dr. Peter Hu 决策的事项。

English Executive Summary

Briefly summarize project health, whether work in the reporting window moved the project forward, the most important outcomes, the largest risks, and decisions needed from Dr. Peter Hu.

Reporting Window Summary

Assigned agent sessions:
Active sessions:
No assigned work in this reporting window: Yes | No
Coordination highlights:
Cross-session dependencies:

Project Progress

Short summary of current product progress, quality status, and whether the work improved speed, quality, or readiness.

Agent Session Results

Create a table with columns:
Agent | Status | Completed | In progress | Blockers | Files changed | Checks

Include rows for A01 through A25.

Completed Work

- 

In-Progress Work

- 

Blockers

- 

Risks

- 

Test and Build Status

`npm run type-check`:
`npm run test:analytics`:
`npm run build`:
Other checks:

Files Changed

- 

Recommended Priorities

1. 
2. 
3. 

Owner Decisions Needed

- 
```

## Quick Start For Tonight

1. Start with A25 daily release intake when the tree is dirty, especially before any release, deploy, or PR/commit slicing decision.
2. Pick only the sessions you want to run, for example `A02`, `A04`, `A06`, `A08`, and `A11`.
3. Give each selected session one package using the Nightly Assignment Template.
4. Keep write scopes separate. Example: do not assign both `A04` and `A08` to edit `types/index.ts` overnight.
5. Tell A11 to split any red student E2E gate into owner-routed regression packages instead of one broad bug bucket.
6. Tell A22 to use clean worktrees, pruned staging, or build/dev-server isolation for release work; dirty-root deploys require explicit owner risk acceptance.
7. Use A08/A10-owned shared schema/type-check/build-drift cleanup when multiple sessions are blocked by shared files or config.
8. Tell A23 to hold A18/A21 content packages at the candidate-to-live gate until QA, integration, regression, and release evidence are recorded.
9. Tell each selected session to create or update its own log in `coordination/session-logs/`.
10. Tell A10 to act as meeting secretary and prepare `coordination/reports/YYYY-MM-DD-president-report.docx`.
11. If no assignment is given, the 8:00 AM report should say `No assigned work in this reporting window`.
