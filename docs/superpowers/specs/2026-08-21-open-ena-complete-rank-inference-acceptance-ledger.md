# Open ENA Complete Rank Inference Acceptance Ledger

**Branch:** `codex/open-ena-complete-rank-inference`

**Worktree:** `/Volumes/Starship/ENA-stats-inference-wt`

**Baseline:** `a2289765273a2ac092d0713d6d7a1572d1f93fea`

**Rule:** A row closes only after its acceptance condition has reproducible local evidence. `Open` is not completion.

## Phase 0 — Isolation, specification, and baseline

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P0-01 | Work occurs only in the named isolated worktree and branch; shared `/Volumes/Starship/ENA` is not modified. | Pending | Open |
| P0-02 | Recorded baseline matches the then-current `origin/codex/login`, without reset, stash, clean, or overwrite. | Pending | Open |
| P0-03 | Dependencies install and the complete pre-change test suite passes. | Pending | Open |
| P0-04 | Approved design has no unresolved alternatives or contradictory method branches. | Pending independent re-review | Open |
| P0-05 | This ledger covers every implementation, review, verification, and release-boundary criterion. | Pending independent re-review | Open |
| P0-06 | Commits stage only exact planned paths and never absorb unrelated changes. | Pending | Open |

## Phase 1 — Composite identity and comparison frame

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P1-01 | Longitudinal settings support ordered, unique, nonempty `repeatedEntityColumns`; every field belongs to successful `unitColumns`. | Pending | Open |
| P1-02 | The core v2 settings/default contract represents ordered `repeatedEntityColumns`, defaults `identityConfirmed=false`, and rejects inference unless confirmation is explicit; Phase 1 makes no production Workspace-prefill claim. | Pending | Open |
| P1-03 | A v1 singular repeated-entity setting migrates to one element and forces identity confirmation off. | Pending | Open |
| P1-04 | Canonical identity uses JSON field/value tuples; components use exact null/NFC/string/blank rules and map only to private opaque tokens, with no delimiter-concatenated identity. | Pending | Open |
| P1-05 | `Group + Name` pairs Yu-style entities correctly and same names in different groups do not merge. | Pending | Open |
| P1-06 | Selecting only the group field when additional unit fields exist is blocked; selecting a colliding name field fails closed. | Pending | Open |
| P1-07 | Identity collision, group instability, entity-period instability, and non-finite coordinates fail closed without value/token leakage. | Pending | Open |
| P1-08 | `buildLongitudinalDerivation()` returns a descriptive Plot view and a private all-period comparison frame; tokens/coordinates/differences required for calculation remain internal. | Pending | Open |
| P1-09 | Plot Available/Complete changes only the view; comparison-frame membership and later inference do not change. | Pending | Open |
| P1-10 | Duplicate entity-period fitted steps are averaged exactly once before any slice. | Pending | Open |
| P1-11 | Independent-period slice contains only one selected period, two disjoint groups, and one point per private entity token. | Pending | Open |
| P1-12 | Paired slice inner-joins only A/B by private token, counts earlier-only/later-only, and ignores missingness at unselected periods. | Pending | Open |
| P1-13 | Repeated slice retains one all-selected-period complete block and counts missing-any-selected-period. | Pending | Open |
| P1-14 | Analytical frame membership, slices, diagnostics, and resulting statistics are invariant to input-row permutations; private token spelling is non-contractual. | Pending | Open |
| P1-15 | Existing Plot geometry, longitudinal diagnostics, geometry CSV, and rendering behavior remain valid. | Pending | Open |
| P1-16 | Inference DOM, errors, logs, public inference result/JSON/CSV, Methods inference section, and AI payload contain no repeated-entity value/key/token, individual pair difference, or entity-period coordinate; private computational frame internals are out of this public-surface assertion. | Pending | Open |
| P1-17 | Identity goldens cover null and undefined rejection, whitespace-only rejection, NFC equivalence, preserved case/leading/trailing whitespace, and intentional numeric `1`/string `"1"` equivalence under `identity-component-empty`. | Pending | Open |

## Phase 2 — Numerical engine and inference coordinator

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P2-01 | Rank, exact `Number(value.toPrecision(12))`/negative-zero normalization, R-type-7 median/q1/q3/scalar-IQR, normal CDF, exact tails, BigInt DP, chi-square tail, and Holm are pure tested helpers. | Pending | Open |
| P2-02 | Mann–Whitney uses average ranks and reports both U values, medians, signed rank-biserial, ties, and method metadata. | Pending | Open |
| P2-03 | Mann–Whitney `N<=50` uses fixed-size BigInt exact rank permutations and resolves classic versus conditional-tie methods correctly. | Pending | Open |
| P2-04 | Mann–Whitney `N>50` uses tie-corrected normal variance and 0.5 continuity; all ties are not estimable. | Pending | Open |
| P2-05 | Mann–Whitney group reversal swaps U/direction and preserves two-sided raw/Holm p. | Pending | Open |
| P2-06 | `n=4+4,U=0` resolves to exact p rather than the legacy normal-only result. | Pending | Open |
| P2-07 | Wilcoxon uses normalized `later-earlier`, Wilcox zeros, average absolute ranks, and reports W+/W-/T. | Pending | Open |
| P2-08 | Wilcoxon reports paired rank-biserial, difference median/IQR, sign/zero/missing/ranked counts, and minimum attainable p. | Pending | Open |
| P2-09 | Wilcoxon `nNonzero<=50` uses BigInt sign flips and resolves classic versus conditional ties/zeros correctly. | Pending | Open |
| P2-10 | Wilcoxon `nNonzero>50` uses actual-rank variance and 0.5 continuity; all-zero differences are not estimable. | Pending | Open |
| P2-11 | SciPy corn, all-positive, mixed, ties, zeros, floating ties, all-zero, `50/51`, direction, and exhaustive-small-n goldens pass. | Pending | Open |
| P2-12 | Friedman uses within-block average ranks, tie correction, Q, df, and Kendall W. | Pending | Open |
| P2-13 | Friedman enumerates when `(k!)^n<=1,000,000` and uses tie-corrected chi-square above the limit. | Pending | Open |
| P2-14 | All-period tied data is not estimable; exact/tie/threshold/R-aligned/Kendall boundary goldens pass. | Pending | Open |
| P2-15 | Repeated-period follow-ups include every selected period pair on every axis, independent of omnibus p. | Pending | Open |
| P2-16 | Friedman and every follow-up consume exactly the same all-period complete cohort. | Pending | Open |
| P2-17 | Holm matches `[.01,.04,.03,.20] -> [.04,.09,.09,.20]`, is order invariant and monotone. | Pending | Open |
| P2-18 | Planned unavailable members keep the planned family size using p=1 but retain null raw/Holm cells. | Pending | Open |
| P2-19 | Omnibus and post-hoc families are separate; all other design/axis family rules match the specification. | Pending | Open |
| P2-20 | One frozen coordinator result binds request, successful result/config/hash/axes, ledgers, methods, warnings, and families. | Pending | Open |
| P2-21 | Request/binding mismatch fails closed; legitimate insufficiency returns typed disabled/not-estimable. | Pending | Open |
| P2-22 | Decimal and exponential-notation inputs share deterministic 12-significant-digit equality/ranking; `-0` becomes `0`; locked type-7 quartile/IQR goldens for n=1..4 pass. | Pending | Open |
| P2-23 | MW is estimable at finite n>=1 per group unless pooled ranks all tie; Wilcoxon at ranked nonzero n>=1 unless all zero; Friedman at complete n>=1 and k>=3 unless all within-block ranks tie. Tiny valid samples remain available with small/discrete warnings independently of the AI gate. | Pending | Open |
| P2-24 | `insufficient-ranked-observations` appears only after design exclusions leave no rankable observation and no specific code applies; every reason and warning emitted belongs to the complete closed code sets in Design §3. | Pending | Open |
| P2-25 | Canonical local family/member IDs contain no clear-text or reversible private values, and AI-facing family/member IDs are separate request-local role-only values with no dataset linkage. | Pending | Open |

## Phase 3 — Stats Comparison UI, state, a11y, and i18n

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P3-01 | Stats retains one tablist and exactly Comparison, Goodness of Fit, and Variance. | Pending | Open |
| P3-02 | Comparison uses fieldset/legend/native radios for Independent, Paired, and Repeated designs; no method dropdown or nested tablist exists. | Pending | Open |
| P3-03 | A new successful result shows no p-value until design, identity, scope, ledger review, and explicit Run are complete. | Pending | Open |
| P3-04 | EndPoint enables only Independent and keeps Paired/Repeated visible with accessible disabled reasons. | Pending | Open |
| P3-05 | Trajectory eligibility correctly gates one-period independent, two-period paired, and 3+ repeated designs. | Pending | Open |
| P3-06 | Grouped paired/repeated inference requires exactly one group; ungrouped inference shows All units and cannot invent pooling. | Pending | Open |
| P3-07 | A/B periods cannot match; reversing them swaps signed outputs and preserves two-sided raw/Holm p. | Pending | Open |
| P3-08 | Repeated selector fixes 3+ ordered periods and displays every axis/pair follow-up. | Pending | Open |
| P3-09 | The inclusion ledger is visible before Run and the result tables contain every specified statistic/method field. | Pending | Open |
| P3-10 | Holm p is primary, raw p is an audit value, and no significance color or `.05` visibility gate exists. | Pending | Open |
| P3-11 | Request kind/design or result/hash/config/identity/time/order/group/period/axes changes clear inference, inference export, AI consent, and interpretation. | Pending | Open |
| P3-12 | Plot cohort, flips, labels, scales, zoom, and display toggles do not clear or change inference. | Pending | Open |
| P3-13 | Goodness remains correlations-only and Variance remains selected-axis-variance-only. | Pending | Open |
| P3-14 | Disabled reasons use `aria-describedby`; eligibility is a polite live region; integrity errors are alerts. | Pending | Open |
| P3-15 | Tables have captions/scopes/full symbol names; refresh preserves focus and results expose a focusable destination. | Pending | Open |
| P3-16 | English, Traditional Chinese, and Simplified Chinese use complete method names with no hard-coded Stats-English leakage. | Pending | Open |
| P3-17 | 320, 375, and 1024 px have no page-level horizontal overflow; only table containers scroll locally. | Pending | Open |
| P3-18 | Keyboard and screen-reader contract checks pass; color is never the sole signal. | Pending | Open |
| P3-19 | A same-four-person baseline/scaffolded configuration can only enter paired Wilcoxon, never 4+4 independent Mann–Whitney. | Pending | Open |
| P3-20 | EndPoint inference is titled exactly **Independent endpoint groups** and makes no claim that a common time period was verified. | Pending | Open |
| P3-21 | Locale or AI prompt-version changes clear AI consent/interpretation only and preserve the statistical inference result and inference export. | Pending | Open |
| P3-22 | The production Workspace preselects every successful `unitColumn` for v2 identity controls while keeping `identityConfirmed=false`; the existing v1 descriptive Plot remains compatible until this Phase 3 integration. | Pending | Open |

## Phase 4 — Schema v2, export, Methods, AI, and privacy

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P4-01 | Analysis bundle writes schema v2 with one unified `inference`; its reader accepts v1 and v2. | Pending | Open |
| P4-02 | Longitudinal export writes schema v2 with repeated identity column names, design, diagnostics, and the same inference. | Pending | Open |
| P4-03 | Longitudinal privacy flags explicitly state tokens, values, paired differences, and entity-period coordinates are absent from new inference surfaces. | Pending | Open |
| P4-04 | Geometry period CSV stays descriptive and records `repeatedEntityColumnsJson`; a separate inference CSV emits aggregate test rows. | Pending | Open |
| P4-05 | Methods consumes the coordinator result and never calls low-level rank tests. | Pending | Open |
| P4-06 | Methods records design/unit/identity-column names/time/order/scope/cohort/missingness/policies/direction/Holm/unflipped coordinates. | Pending | Open |
| P4-07 | Methods discloses accumulation, MR1, symmetry, clustering/independence, arbitrary-axis, and non-causal boundaries. | Pending | Open |
| P4-08 | AI client emits strict v2 while server parser remains compatible with valid v1 requests. | Pending | Open |
| P4-09 | AI v2 discriminates all four designs and contains aggregate request-local role/index/axis/count/statistic/raw-Holm/effect/method evidence only. | Pending | Open |
| P4-10 | Provider payload excludes canonical family/member IDs, dataset-linked fingerprints, real group/period labels, identity column values/keys/tokens, pair differences, participant coordinates, and raw rows/text; descriptive code labels may remain, and inference identifiers are request-local roles only. | Pending | Open |
| P4-11 | AI gate requires each MW group n>=3, Wilcoxon matched and ranked n>=3, and Friedman complete n>=3; repeated follow-ups inherit complete n. Below gate inference is omitted while eligible descriptive evidence remains. | Pending | Open |
| P4-12 | AI prompt distinguishes the three rank-test pathways and forbids causal, gain, or practical-importance conclusions from p-values. | Pending | Open |
| P4-13 | Strict parsers reject unknown fields, overlong text, identity-bearing fields, individual arrays, hostile labels, NaN, and Infinity. | Pending | Open |
| P4-14 | Stats, Methods, JSON, CSV, and AI aggregate agree on n/statistic/raw-Holm/direction/method for the same request. | Pending | Open |
| P4-15 | v1 bundle/AI fixtures remain readable and v2 round-trips without loss. | Pending | Open |
| P4-16 | Repository/output privacy searches find no repeated-entity value/key/token, individual difference, or entity-period coordinate in the new inference DOM/result/CSV, Methods inference section, or AI provider payload. | Pending | Open |
| P4-17 | Stats, JSON/CSV export, Methods, and AI evidence consume the same coordinator-owned inference object and none imports or calls low-level rank-test, rank, quantile, or Holm helpers. | Pending | Open |
| P4-18 | Privacy verification explicitly preserves the boundary: existing endpoint/general result tables and optional unit labels remain separately governed legacy outputs and are not silently sanitized by this project. | Pending | Open |

## Phase 5 — Independent review and local closeout

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P5-01 | Independent mathematical reviewer approves ranks, exact tails, ties/zeros, Friedman, effects, and Holm families. | Pending | Open |
| P5-02 | Independent data/privacy reviewer approves composite identity, private tokens, error handling, exports, and AI payload. | Pending | Open |
| P5-03 | Independent UI reviewer approves discoverability, three languages, keyboard/screen reader, focus, and narrow screens. | Pending | Open |
| P5-04 | Targeted mathematical and comparison-frame tests pass. | Pending | Open |
| P5-05 | Existing inference, longitudinal, Stats, export, Methods, and AI tests pass. | Pending | Open |
| P5-06 | Full `npm test` passes. | Pending | Open |
| P5-07 | `npm run typecheck` passes. | Pending | Open |
| P5-08 | `npm run build` passes. | Pending | Open |
| P5-09 | Browser smoke passes EndPoint independent, trajectory-period independent, paired A/B, and repeated-period workflows. | Pending | Open |
| P5-10 | Browser smoke passes three languages, 320/375/1024 layouts, keyboard/focus, JSON/CSV/Methods, and AI preview privacy. | Pending | Open |
| P5-11 | Final worktree contains only planned files and all local commits use exact-path staging. | Pending | Open |
| P5-12 | Final report identifies local commit SHA(s), tests, build, browser evidence, review outcomes, and residual limitations. | Pending | Open |
| P5-13 | Local commit is allowed; no push is performed. | Pending | Open |
| P5-14 | PR creation, merge, and branch integration are explicitly out of scope. | Pending | Open |
| P5-15 | Vercel deployment/readiness and live-route proof are explicitly out of scope. | Pending | Open |

## Planned source and test inventory

This inventory is authoritative for the approved implementation plan at `46ef5cb`. Existing files are marked **existing** and approved additions are marked **new**. A path may not be added, removed, renamed, substituted, or edited outside this table until the ledger is updated and reviewed first; TDD does not permit silent inventory drift.

| Area | File | State | Intended responsibility |
| --- | --- | --- | --- |
| Longitudinal | `lib/open-ena/longitudinal.ts` | existing | Composite identity migration, derivation, comparison frame, export v2 |
| Rank math | `lib/open-ena/rank-inference.ts` | new | Pure ranks, exact DPs, normal/chi-square tails, Holm |
| Coordinator | `lib/open-ena/inference-v2.ts` | new | Requests, bindings, slices, frozen unified result, inference CSV rows |
| Legacy compatibility | `lib/open-ena/inference.ts` | existing | Mann–Whitney compatibility wrapper backed by exact-first engine |
| Endpoint contrast | `lib/open-ena/contrasts.ts` | existing | Remove divergent auto-inference and consume unified result where exported |
| Bundle | `lib/open-ena/export.ts` | existing | Schema v2 and unified inference |
| Methods | `lib/open-ena/methods.ts` | existing | Render supplied inference without recomputation |
| AI contract | `lib/open-ena/ai-interpretation.ts` | existing | Strict v1/v2 request parsing and aggregate v2 evidence |
| AI provider/prompt | `lib/server/luna-client.ts` | existing | Versioned provider prompt/schema, fingerprint stripping, and v1/v2 provider compatibility |
| AI route | `app/api/open-ena/ai-interpretation/route.ts` | existing | Auth, request limits, parsing, cancellation, rate limit, and provider dispatch |
| UI | `components/open-ena/OpenEnaWorkspace.tsx` | existing | State/binding lifecycle and Comparison integration |
| AI UI | `components/open-ena/OpenEnaAiInterpretation.tsx` | existing | Evaluate and update consent/reset lifecycle, v2 request submission, cancellation, and response presentation |
| UI | `components/open-ena/OpenEnaInferencePanel.tsx` | new | Design fieldset, ledger, Run, results, accessible tables |
| Localization | `lib/open-ena-i18n.ts` | existing | Structured Stats copy for en/zh-Hant/zh-Hans |
| Styles | `app/globals.css` | existing | Radio cards, responsive table/layout behavior |
| Reference projection | `lib/open-ena/reference.ts` | existing | Preserve fixed-reference provenance and compatibility in inference bindings |
| Math tests | `tests/open-ena-rank-inference.test.ts` | new | Mann–Whitney, Wilcoxon, Friedman, Holm goldens |
| Frame tests | `tests/open-ena-longitudinal-frame.test.ts` | existing | Composite identity, slices, cohorts, privacy, invariance |
| Coordinator tests | `tests/open-ena-inference-v2.test.ts` | new | Requests, binding, families, warnings, freeze |
| Existing inference tests | `tests/open-ena-inference.test.ts`, `tests/open-ena-contrasts.test.ts` | existing | Compatibility and endpoint behavior |
| Existing longitudinal tests | `tests/open-ena-longitudinal.test.ts`, `tests/open-ena-longitudinal-workspace.test.ts` | existing | Plot/export regression and workspace mapping |
| UI contract tests | `tests/open-ena-official-stats-workflow-contract.test.ts` | existing | Three tabs and Comparison semantics |
| UI component tests | `tests/open-ena-inference-panel.test.tsx` | new | Controls, a11y, state, results |
| Export/Methods tests | `tests/open-ena-pairwise-export-methods.test.ts`, `tests/open-ena-methods.test.ts` | existing | V2 equality and no recomputation |
| AI tests | `tests/open-ena-ai-interpretation-client.test.ts`, `tests/open-ena-ai-interpretation-payload.test.ts`, `tests/open-ena-ai-interpretation-route.test.ts`, `tests/open-ena-ai-interpretation-workspace.test.ts` | existing | Client lifecycle, v1 compatibility, v2 strictness, privacy, and provider fingerprint stripping |
| Reference tests | `tests/open-ena-reference.test.ts` | existing | Reference provenance, compatibility, and binding regressions |
| Browser verification | `tests/open-ena-inference-browser-smoke.mjs` | new | Four designs, locales, viewports, keyboard, downloads, AI preview |
