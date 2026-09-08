# Open ENA Strict Standard Model Parameters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved fail-closed Standard ENA Models system, preserve and isolate existing ONA, and prove the result with version-pinned scientific, browser, accessibility, and repository-wide verification.

**Architecture:** Execute five ordered, independently testable subplans. The first establishes Draft → Diagnostics → Canonical Configuration → Execution Plan contracts; the second connects those contracts to jENA, rotations, Reference v2, workers, and ONA; the third migrates artifacts and every scientific consumer to bound results; the fourth replaces the Models UI and implements all bulk controls; the fifth freezes scientific parity, runs real-browser acceptance, documents the release boundary, and executes the full gate.

**Tech Stack:** TypeScript 5.8, React 19.2, Next.js 16.3, Web Workers, Web Crypto SHA-256, jENA/jena-js, Node test runner, Vitest, Playwright, R 4.4, rENA, CSS, Open ENA locale catalog.

---

## Approved design

Read before executing any subplan:

- `docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-design.md`

The narrower bulk-controls spec is superseded and must not be implemented
independently.

## Execution order

1. `2026-09-02-open-ena-standard-model-parameters-01-contracts-compiler.md`
2. `2026-09-02-open-ena-standard-model-parameters-02-runtime-reference.md`
3. `2026-09-02-open-ena-standard-model-parameters-03-artifacts-consumers.md`
4. `2026-09-02-open-ena-standard-model-parameters-04-models-ui.md`
5. `2026-09-02-open-ena-standard-model-parameters-05-parity-acceptance.md`

Do not start a later plan until the previous plan's focused tests pass and its
checkpoint commit exists. Run `npm run test:app` after Plans 1–4 and the full
`npm run verify` only in Plan 5, unless an earlier change affects the build
boundary enough to warrant an additional full run.

## Locked file structure

### New scientific core

- `lib/open-ena/model-v3/types.ts` — all v3 Draft, canonical, diagnostic,
  execution-plan, result-binding, and capability types.
- `lib/open-ena/model-v3/schema.ts` — strict runtime decoders, exact-key
  validation, JSON-safe Infinity, and v3 serialization.
- `lib/open-ena/model-v3/canonical-json.ts` — locale-independent canonical
  JSON and browser/worker SHA-256 helpers.
- `lib/open-ena/model-v3/identity.ts` — typed scalar/composite identities and
  collision-free internal dictionaries.
- `lib/open-ena/model-v3/ordering.ts` — explicit comparator parsing,
  within-Horizon row ordering, trajectory Horizon ordering, and provenance
  mappings.
- `lib/open-ena/model-v3/diagnostics.ts` — stable diagnostic catalog and
  staged fail-closed validation.
- `lib/open-ena/model-v3/resource-budget.ts` — deterministic work and memory
  estimation with versioned hard limits.
- `lib/open-ena/model-v3/compiler.ts` — Standard/ONA draft compilation into
  canonical configs and immutable plan previews.
- `lib/open-ena/model-v3/migration.ts` — v1/v2 config-to-draft migration
  without invented confirmations.
- `lib/open-ena/model-v3/standard-adapter.ts` — strict Standard Code
  materialization and jENA options.
- `lib/open-ena/model-v3/ona-adapter.ts` — existing ONA contract adapter with
  no numerical change.
- `lib/open-ena/model-v3/execution-plan.ts` — final async plan hashing,
  Reference binding, and worker-plan validation.
- `lib/open-ena/model-v3/result-binding.ts` — immutable bound-result creation
  and current/stale equality.
- `lib/open-ena/model-v3/reference-v2.ts` — content-addressed Endpoint
  Reference creation, decoding, basis remapping, compatibility, and legacy
  acknowledgement.
- `lib/open-ena/model-v3/index.ts` — public v3 exports only.

Do not turn this folder into a second copy of jENA. It owns product contracts,
ordering, identity safety, provenance, and adapters; numerical accumulation,
normalization, rotation, and projection remain in jENA.

### New Models UI modules

- `components/open-ena/model-v3/OpenEnaModelTabsV3.tsx` — tab shell,
  diagnostics badges, help, and summary.
- `components/open-ena/model-v3/OpenEnaUnitsPanelV3.tsx` — Unit/Group/Means
  controls and Units toolbar.
- `components/open-ena/model-v3/OpenEnaHorizonsPanelV3.tsx` — Horizon fields,
  structure preview, and Horizon-order editor.
- `components/open-ena/model-v3/OpenEnaWindowsPanelV3.tsx` — Model, Window,
  extents, Weighting, Rotation, Reference, and resources.
- `components/open-ena/model-v3/OpenEnaCodesPanelV3.tsx` — family selector,
  Code diagnostics, per-Code controls, and bulk Hide/Exclude.
- `components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3.tsx` — reusable
  explicit/source-confirmed ordering editor.
- `components/open-ena/model-v3/OpenEnaModelDiagnosticsV3.tsx` — scoped
  diagnostics and capability blocks.
- `components/open-ena/model-v3/OpenEnaImportPreviewV3.tsx` — side-effect-free
  artifact diff/confirmation before any draft replacement.
- `components/open-ena/model-v3/model-state.ts` — pure reducer, Undo records,
  stale/obsolete transitions, and display/scientific action separation.

`OpenEnaWorkspace.tsx` remains the workflow owner but delegates Models
rendering and reducer actions to these files. Do not move unrelated Data, Plot,
Stats, or AI panels.

### Existing integration files

- `lib/open-ena/types.ts` — retain legacy public types and add narrow v3
  aliases during migration.
- `lib/open-ena/network-config.ts` — retain legacy reader; route new writes to
  v3.
- `lib/open-ena/csv.ts` — retain parsing; stop using generic Standard Code
  coercion in the v3 path.
- `lib/open-ena/analyze.ts` — compatibility facade and result-summary
  assembly.
- `lib/open-ena/client.ts`, `lib/open-ena/jena.worker.ts` — plan-only v3
  worker protocol while retaining tested legacy import paths until cutover.
- `lib/open-ena/reference.ts` — legacy Reference facade delegating to v2.
- `lib/open-ena/export.ts`, `lib/open-ena/methods.ts` — bundle v3 and
  bound-provenance methods.
- `lib/open-ena/inference-v2.ts`, `lib/open-ena/inference-consumers.ts`,
  `lib/open-ena/contrasts.ts`, `lib/open-ena/longitudinal.ts`,
  `lib/open-ena/ai-interpretation.ts`, `lib/open-ena/sets.ts` — bound-result
  consumer migration.
- `components/open-ena/OpenEnaWorkspace.tsx` — reducer integration, worker
  lifecycle, result binding, and new Models component.
- `components/open-ena/OpenEnaOfficialModelControls.tsx` — pressed-state icon
  API and visible-eye glyph.
- `components/open-ena/OpenEnaGroupDisplayControls.tsx` — controlled bulk
  disclosure commands.
- Standard/ONA 2D/3D, group, and trajectory renderers — explicit
  `showCodeGraph` presentation prop.
- `lib/open-ena-i18n.ts` and `app/globals.css` — complete localized copy and
  official visual/accessibility states.
- `package.json` — dedicated Models-v3 browser command.

## Cross-plan invariants

- No plan may silently coerce scientific data.
- No plan may auto-select source order, restore Codes, change Means to SVD, or
  fall back from Reference.
- Standard and ONA draft/canonical/plan types remain disjoint.
- TMA and advanced rotations never enter the v3 schema or Models UI.
- Every scientific change changes or invalidates the canonical plan; display
  changes do not.
- Every worker result is matched by dataset/configuration/plan/runtime/Reference
  hashes before becoming current.
- Existing ONA numerical output is frozen.
- Private or unavailable scientific fixtures are reported as skip, never pass.
- Use `apply_patch` for edits and stage only files named by the current task.
- Do not push, create a PR, merge, deploy, or write production state without
  explicit authorization.

## Spec coverage map

| Approved spec area | Executable plan tasks |
| --- | --- |
| Pre-cutover Git/rENA/ONA baseline | Plan 1 Task 0; Plan 5 Tasks 1 and 4 |
| Draft/canonical Standard and ONA types | Plan 1 Tasks 1–2 |
| Typed identities and collision-free tokens | Plan 1 Task 3; Plan 2 Task 1 |
| Row and Horizon order | Plan 1 Task 4; Plan 2 Tasks 2–3 |
| Diagnostics and fail-closed state | Plan 1 Tasks 5–8; Plan 4 Task 1 |
| Resource preflight | Plan 1 Task 7; Plan 2 Task 2 |
| Six Model/Window combinations | Plan 2 Task 3 |
| SVD and Endpoint-only Means | Plan 2 Task 4 |
| Reference v2 and three Standard targets | Plan 2 Tasks 5–6 |
| Plan-only worker and bound results | Plan 2 Task 7 |
| ONA isolation/non-regression | Plan 2 Task 8; Plan 5 Tasks 1 and 4 |
| Bundle/import/export/methods and import preview | Plan 3 Tasks 1–4; Plan 4 Task 8 |
| Inference, trajectory, AI, sets, Data View | Plan 3 Tasks 5–7 |
| Models tabs and all bulk controls | Plan 4 Tasks 1–9 |
| Renderer-wide display-only hiding | Plan 4 Task 7 |
| rENA baseline/current parity | Plan 5 Tasks 2–3 |
| Browser, accessibility, i18n | Plan 5 Tasks 5–6 |
| Documentation, full verify, evidence boundaries | Plan 5 Tasks 7–8 |

## Commit sequence

Use the commit messages specified by each subplan. Before every commit:

1. Run the focused command listed in the task.
2. Run `git diff --check`.
3. Inspect `git status --short`.
4. Stage only the task's files.

If pre-existing user changes overlap a planned file, stop that task, preserve
the changes, and report the overlap rather than resetting it.

## Final handoff

After Plan 5, report:

- focused, application, browser, jENA, and full-gate pass/fail/skip separately;
- exact local commit SHA;
- local worktree status;
- remote branch status without pushing;
- PR, deployment, production, and authenticated-production status separately.
