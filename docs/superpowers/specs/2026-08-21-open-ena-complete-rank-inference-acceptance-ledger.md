# Open ENA Complete Rank Inference Acceptance Ledger

**Branch:** `codex/open-ena-complete-rank-inference`

**Worktree:** `/Volumes/Starship/ENA-stats-inference-wt`

**Baseline:** `a2289765273a2ac092d0713d6d7a1572d1f93fea`

**Rule:** A row closes only after its acceptance condition has reproducible local evidence. `Open` is not completion.

## Phase 0 — Isolation, specification, and baseline

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P0-01 | Work occurs only in the named isolated worktree and branch; shared `/Volumes/Starship/ENA` is not modified. | Final audit: feature work is on `codex/open-ena-complete-rank-inference` in `/Volumes/Starship/ENA-stats-inference-wt`; shared `/Volumes/Starship/ENA` remains clean at baseline `a228976`. | Closed |
| P0-02 | Recorded baseline matches the then-current `origin/codex/login`, without reset, stash, clean, or overwrite. | Baseline `a2289765273a2ac092d0713d6d7a1572d1f93fea` verified equal to `origin/codex/login` before worktree creation; no reset/stash/clean used. | Closed |
| P0-03 | Dependencies install and the complete pre-change test suite passes. | Existing dependencies loaded; pre-change `npm test` passed 379/379. | Closed |
| P0-04 | Approved design has no unresolved alternatives or contradictory method branches. | Independent design re-review PASS at `f4578b6`; exact Phase 2 amendment final-diff mathematical re-review PASS before commit. | Closed |
| P0-05 | This ledger covers every implementation, review, verification, and release-boundary criterion. | Independent ledger coverage review PASS at `f4578b6`; exact Phase 2 amendment review confirmed P2-26 through P2-28 and continuous P0/P5 boundaries. | Closed |
| P0-06 | Commits stage only exact planned paths and never absorb unrelated changes. | Every existing implementation and browser commit through final production HEAD `69f5366` used exact-path staging; the current uncommitted closeout diff is limited to the design and this ledger and is ready for exact-path staging. | Closed |

## Phase 1 — Composite identity and comparison frame

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P1-01 | Longitudinal settings support ordered, unique, nonempty `repeatedEntityColumns`; every field belongs to successful `unitColumns`. | `46ef5cb`; frame goldens; final Phase 1 spec review PASS. | Closed |
| P1-02 | The core v2 settings/default contract represents ordered `repeatedEntityColumns`, defaults `identityConfirmed=false`, and rejects inference unless confirmation is explicit; Phase 1 makes no production Workspace-prefill claim. | `46ef5cb`; confirmed/unconfirmed slice tests; Workspace prefill remains P3-22. | Closed |
| P1-03 | A v1 singular repeated-entity setting migrates to one element and forces identity confirmation off. | `46ef5cb`; v1 Plot compatibility golden. | Closed |
| P1-04 | Canonical identity uses JSON field/value tuples; components use exact null/NFC/string/blank rules and map only to private opaque tokens, with no delimiter-concatenated identity. | `46ef5cb` + `3fccad1`; privacy and identity normalization goldens. | Closed |
| P1-05 | `Group + Name` pairs Yu-style entities correctly and same names in different groups do not merge. | `46ef5cb`; Group+Name collision fixture. | Closed |
| P1-06 | Selecting only the group field when additional unit fields exist is blocked; selecting a colliding name field fails closed. | `46ef5cb`; pseudo-entity/cross-group collision goldens. | Closed |
| P1-07 | Identity collision, group instability, entity-period instability, and non-finite coordinates fail closed without value/token leakage. | `46ef5cb` + `3fccad1` + `4bee050`; safe typed-error tests. | Closed |
| P1-08 | `buildLongitudinalDerivation()` returns a descriptive Plot view and a private all-period comparison frame; tokens/coordinates/differences required for calculation remain internal. | `46ef5cb`; derivation/frame immutability and privacy tests. | Closed |
| P1-09 | Plot Available/Complete changes only the view; comparison-frame membership and later inference do not change. | `4bee050` frame/slice goldens plus browser smoke `e484760`: Complete/Available and presentation changes preserve the same eight-member repeated inference. | Closed |
| P1-10 | Duplicate entity-period fitted steps are averaged exactly once before any slice. | `46ef5cb`; duplicate compact-step golden. | Closed |
| P1-11 | Independent-period slice contains only one selected period, two disjoint groups, and one point per private entity token. | `46ef5cb` + `4bee050`; independent slice/empty Complete cohort goldens. | Closed |
| P1-12 | Paired slice inner-joins only A/B by private token, counts earlier-only/later-only, and ignores missingness at unselected periods. | `46ef5cb` + `4bee050`; pairwise completion and bidirectional-slot goldens. | Closed |
| P1-13 | Repeated slice retains one all-selected-period complete block and counts missing-any-selected-period. | `46ef5cb`; common complete-block golden. | Closed |
| P1-14 | Analytical frame membership, slices, diagnostics, and resulting statistics are invariant to input-row permutations; private token spelling is non-contractual. | `46ef5cb` frame invariance and `0af6797` coordinator row-order aggregate inference golden; final targeted suite 136/136. | Closed |
| P1-15 | Existing Plot geometry, longitudinal diagnostics, geometry CSV, and rendering behavior remain valid. | Focused longitudinal/frame/Plot/Workspace suite 52/52 at `4bee050`; typecheck PASS. | Closed |
| P1-16 | Inference DOM, errors, logs, public inference result/JSON/CSV, Methods inference section, and AI payload contain no participant-level identity value/canonical key/opaque token, individual pair difference, or entity-period coordinate; local identity-column names and aggregate comparison scope remain auditable. | `46ef5cb`, `1224746`, `2a7f55c`, and `6258b18` privacy/authority tests; browser smoke `e484760` scans inference DOM, downloads, AI evidence, and full server log. | Closed |
| P1-17 | Identity goldens cover null and undefined rejection, whitespace-only rejection, NFC equivalence, preserved case/leading/trailing whitespace, and intentional numeric `1`/string `"1"` equivalence under `identity-component-empty`. | `3fccad1` + `7cf6f10`; final Phase 1 spec review PASS. | Closed |

## Phase 2 — Numerical engine and inference coordinator

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P2-01 | Rank, exact `Number(value.toPrecision(12))`/negative-zero normalization, R-type-7 median/q1/q3/scalar-IQR, normal CDF, exact tails, BigInt DP, chi-square tail, and Holm are pure tested helpers. | `ee237a9` and `tests/open-ena-rank-inference.test.ts`; final targeted suite 136/136. | Closed |
| P2-02 | Mann–Whitney uses average ranks and reports both U values, medians, signed rank-biserial, ties, and method metadata. | Exact-first engine goldens and V2 coordinator rows in `ee237a9`/`0af6797`; independent math review PASS. | Closed |
| P2-03 | Mann–Whitney `N<=50` uses fixed-size BigInt exact rank permutations and resolves classic versus conditional-tie methods correctly. | Exact and tied-DP goldens, plus 1,187 independent brute-force MW fixtures. | Closed |
| P2-04 | Mann–Whitney `N>50` uses tie-corrected normal variance and 0.5 continuity; all ties are not estimable. | `N=50/51`, ties, and all-tied goldens; R 4.4.2 approximation cross-check PASS. | Closed |
| P2-05 | Mann–Whitney group reversal swaps U/direction and preserves two-sided raw/Holm p. | Rank-engine and coordinator reversal goldens in `tests/open-ena-rank-inference.test.ts` and `tests/open-ena-inference-v2.test.ts`. | Closed |
| P2-06 | `n=4+4,U=0` resolves to exact p rather than the legacy normal-only result. | Legacy compatibility golden now resolves exact-first at `ee237a9`; final inference suite passes. | Closed |
| P2-07 | Wilcoxon uses normalized `later-earlier`, Wilcox zeros, average absolute ranks, and reports W+/W-/T. | Wilcoxon engine/coordinator goldens and browser A→B result rows. | Closed |
| P2-08 | Wilcoxon reports paired rank-biserial, difference median/IQR, sign/zero/missing/ranked counts, and minimum attainable p. | Rank/coordinator/strict-consumer tests and Methods/CSV parity in browser smoke. | Closed |
| P2-09 | Wilcoxon `nNonzero<=50` uses BigInt sign flips and resolves classic versus conditional ties/zeros correctly. | Exact sign-flip goldens and 1,173 independent exhaustive/brute-force Wilcoxon fixtures. | Closed |
| P2-10 | Wilcoxon `nNonzero>50` uses actual-rank variance and 0.5 continuity; all-zero differences are not estimable. | `50/51`, ties/zeros/all-zero goldens and R approximation cross-check PASS. | Closed |
| P2-11 | SciPy corn, all-positive, mixed, ties, zeros, floating ties, all-zero, `50/51`, direction, and exhaustive-small-n goldens pass. | `tests/open-ena-rank-inference.test.ts`; final independent math review PASS. | Closed |
| P2-12 | Friedman uses within-block average ranks, tie correction, Q, df, and Kendall W. | Friedman engine goldens, 115 independent exhaustive fixtures, and R tied-data cross-check PASS. | Closed |
| P2-13 | Friedman enumerates when `(k!)^n<=1,000,000` and uses tie-corrected chi-square above the limit. | Exact-assignment boundary goldens for both sides of the threshold. | Closed |
| P2-14 | All-period tied data is not estimable; exact/tie/threshold/R-aligned/Kendall boundary goldens pass. | Friedman all-tied, W=0/W=1, threshold and R-aligned tests PASS. | Closed |
| P2-15 | Repeated-period follow-ups include every selected period pair on every axis, independent of omnibus p. | Coordinator planned-family tests and browser proof of 2 omnibus + 6 all-pair follow-ups. | Closed |
| P2-16 | Friedman and every follow-up consume exactly the same all-period complete cohort. | V2 coordinator common-cohort golden; browser ledger/row parity complete=6, missing-any=3. | Closed |
| P2-17 | Holm matches `[.01,.04,.03,.20] -> [.04,.09,.09,.20]`, is order invariant and monotone. | Holm goldens plus 1,000 independently checked families and R `p.adjust` cross-check. | Closed |
| P2-18 | Planned unavailable members keep the planned family size using p=1 but retain null raw/Holm cells. | Coordinator zero-complete and strict-reader Holm reconstruction tests PASS. | Closed |
| P2-19 | Omnibus and post-hoc families are separate; all other design/axis family rules match the specification. | V2 family tests and browser planned sizes 2/6 PASS. | Closed |
| P2-20 | One frozen coordinator result binds request, successful result/config/hash/axes, ledgers, methods, warnings, and families. | `0af6797`, `afb14d7`, `cf8a1a4`, and producer-authority commit `6258b18`; same-reference consumer tests PASS. | Closed |
| P2-21 | Request/binding mismatch fails closed; legitimate insufficiency returns typed disabled/not-estimable. | Coordinator hostile-binding tests and strict consumer semantic matrix PASS. | Closed |
| P2-22 | Decimal and exponential-notation inputs share deterministic 12-significant-digit equality/ranking; `-0` becomes `0`; locked type-7 quartile/IQR goldens for n=1..4 pass. | Rank normalization/type-7 goldens PASS. | Closed |
| P2-23 | MW is estimable at finite n>=1 per group unless pooled ranks all tie; Wilcoxon at ranked nonzero n>=1 unless all zero; Friedman at complete n>=1 and k>=3 unless all within-block ranks tie. Tiny valid samples remain available with `small-sample` and, only when the resolved row is exact, `discrete-attainable-p`; both warnings remain independent of the AI gate. | Tiny-sample, all-tied/all-zero, warning and AI-gate separation tests PASS. | Closed |
| P2-24 | `insufficient-ranked-observations` appears only after design exclusions leave no rankable observation and no specific code applies; every reason and warning emitted belongs to the complete closed code sets in Design §3. | Closed reason/warning code tests plus strict parser semantic validation PASS. | Closed |
| P2-25 | Canonical local family/member IDs contain no clear-text or reversible private values, and AI-facing family/member IDs are separate request-local role-only values with no dataset linkage. | SHA-256 role/index ID tests and AI role-only payload/browser privacy checks PASS. | Closed |
| P2-26 | Warning triggers are fixed: effective rank `n<10` for `small-sample`; available exact rows only for `discrete-attainable-p`; neither warning changes estimability, display, Holm, export, or AI gating. | Warning threshold/literal goldens and cross-consumer parity PASS. | Closed |
| P2-27 | Wilcoxon minimum attainable p uses the locked formula/log2/numeric representation and emits `numeric=null`, never zero, on JavaScript underflow. | Rank-engine and strict-reader minimum-p audit tests PASS. | Closed |
| P2-28 | Every available row uses one of the seven closed resolved-method literals; approximation tails meet the locked approximately `1e-12` R/SciPy tolerance. | Seven-method closure tests and independent R/SciPy comparison PASS. | Closed |

## Phase 3 — Stats Comparison UI, state, a11y, and i18n

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P3-01 | Stats retains one tablist and exactly Comparison, Goodness of Fit, and Variance. | Phase 3 component/workspace contracts and real-browser single-tablist check PASS. | Closed |
| P3-02 | Comparison uses fieldset/legend/native radios for Independent, Paired, and Repeated designs; no method dropdown or nested tablist exists. | `d6b90c3`; SSR/a11y component tests and browser keyboard audit PASS. | Closed |
| P3-03 | A new successful result shows no p-value until design, identity, scope, ledger review, and explicit Run are complete. | Explicit-Run UI contracts and browser pre-Run no-p assertion PASS. | Closed |
| P3-04 | EndPoint enables only Independent and keeps Paired/Repeated visible with accessible disabled reasons. | Three-language endpoint browser runs and `aria-describedby` checks PASS. | Closed |
| P3-05 | Trajectory eligibility correctly gates one-period independent, two-period paired, and 3+ repeated designs. | One-period derivation/UI tests and four-path browser smoke PASS. | Closed |
| P3-06 | Grouped paired/repeated inference requires exactly one group; ungrouped inference shows All units and cannot invent pooling. | Coordinator/UI grouped and ungrouped contract tests PASS. | Closed |
| P3-07 | A/B periods cannot match; reversing them swaps signed outputs and preserves two-sided raw/Holm p. | Frame/coordinator bidirectional-slot goldens and disabled-same-period UI contract PASS. | Closed |
| P3-08 | Repeated selector fixes 3+ ordered periods and displays every axis/pair follow-up. | Browser explicitly selects three periods and observes 2 omnibus + 6 follow-up rows. | Closed |
| P3-09 | The inclusion ledger is visible before Run and the result tables contain every specified statistic/method field. | Panel SSR tests plus browser ledger/result/consumer parity PASS. | Closed |
| P3-10 | Holm p is primary, raw p is an audit value, and no significance color or `.05` visibility gate exists. | UI contract and browser table-header checks PASS. | Closed |
| P3-11 | Request kind/design or result/hash/config/identity/time/order/group/period/axes changes clear inference, inference export, AI consent, and interpretation. | Synchronous stale-key Workspace tests and browser Endpoint→trajectory reset PASS. | Closed |
| P3-12 | Plot cohort, flips, labels, scales, zoom, and display toggles do not clear or change inference. | Browser changes Complete cohort, Flip X, Zoom, and code labels; Stats/provenance and redownloaded bundle remain byte-equivalent at the inference boundary. | Closed |
| P3-13 | Goodness remains correlations-only and Variance remains selected-axis-variance-only. | Official Stats workflow contract PASS. | Closed |
| P3-14 | Disabled reasons use `aria-describedby`; eligibility is a polite live region; integrity errors are alerts. | Component SSR and real-browser accessibility assertions PASS. | Closed |
| P3-15 | Tables have captions/scopes/full symbol names; refresh preserves focus and results expose a focusable destination. | Component contracts and browser active-element/no-focus-steal/Jump-to-results checks PASS. | Closed |
| P3-16 | English, Traditional Chinese, and Simplified Chinese use complete method names with no hard-coded Stats-English leakage. | `32b9e01`; all three locales actually Run in browser and show complete localized names/captions. | Closed |
| P3-17 | 320, 375, and 1024 px have no page-level horizontal overflow; only table containers scroll locally. | Browser clientWidth equals scrollWidth at all three widths; wide table scrolls only inside `.ena-inference-table-wrap`. | Closed |
| P3-18 | Keyboard and screen-reader contract checks pass; color is never the sole signal. | Browser ArrowRight/End/Home, focus destination, ARIA and semantic table checks plus component non-color contracts PASS. | Closed |
| P3-19 | A same-four-person baseline/scaffolded configuration can only enter paired Wilcoxon, never 4+4 independent Mann–Whitney. | `32b9e01` real frame/coordinator fixture: matched=4 Wilcoxon; period-as-group request is `group-invalid` with no MW row. | Closed |
| P3-20 | EndPoint inference is titled exactly **Independent endpoint groups** and makes no claim that a common time period was verified. | `32b9e01`; exact en/zh-Hant/zh-Hans browser captions and temporal-boundary copy PASS. | Closed |
| P3-21 | Locale or AI prompt-version changes clear AI consent/interpretation only and preserve the statistical inference result and inference export. | Workspace/AI lifecycle tests distinguish inference key from locale/prompt interpretation key. | Closed |
| P3-22 | The production Workspace preselects every successful `unitColumn` for v2 identity controls while keeping `identityConfirmed=false`; the existing v1 descriptive Plot remains compatible until this Phase 3 integration. | Phase 3 Workspace tests and browser `Group + Name` identity confirmation flow PASS. | Closed |

## Phase 4 — Schema v2, export, Methods, AI, and privacy

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P4-01 | Analysis bundle writes schema v2 with one unified `inference`; its reader accepts v1 and v2. | `169d64e`, `66e08a8`, `1224746`; v1/v2 and producer-authority round-trip tests PASS. | Closed |
| P4-02 | Longitudinal export writes schema v2 with repeated identity column names, design, diagnostics, and the same inference. | Longitudinal v2 tests and browser JSON equality against the current inference PASS. | Closed |
| P4-03 | Longitudinal privacy flags explicitly state tokens, values, paired differences, and entity-period coordinates are absent from new inference surfaces. | Browser verifies all four flags plus `rawSourceRowsIncluded` are `false`. | Closed |
| P4-04 | Geometry period CSV stays descriptive and records `repeatedEntityColumnsJson`; a separate inference CSV emits aggregate test rows. | Longitudinal tests and browser eight-row inference CSV parity PASS. | Closed |
| P4-05 | Methods consumes the coordinator result and never calls low-level rank tests. | `169d64e`/`6258b18`; source-import audit and same-reference Methods tests PASS. | Closed |
| P4-06 | Methods records design/unit/identity-column names/time/order/scope/cohort/missingness/policies/direction/Holm/unflipped coordinates. | Four-design Methods tests and browser repeated-report table/family parity PASS. | Closed |
| P4-07 | Methods discloses accumulation, MR1, symmetry, clustering/independence, arbitrary-axis, and non-causal boundaries. | Methods disclosure tests and README contract PASS. | Closed |
| P4-08 | AI client emits strict v2 while server parser remains compatible with valid v1 requests. | `2ecaadb`/`2a7f55c`; v1 parser compatibility and v2-only provider-dispatch tests PASS. | Closed |
| P4-09 | AI v2 discriminates all four designs and contains aggregate request-local role/index/axis/count/statistic/raw-Holm/effect/method evidence only. | Four-design AI payload tests and browser repeated eight-member role projection PASS. | Closed |
| P4-10 | Provider payload excludes canonical family/member IDs, dataset-linked fingerprints, real group/period/axis/code labels, identity column names or values/keys/tokens, pair differences, participant coordinates, and raw rows/text; inference identifiers are request-local roles/indexes only. | Provider unit tests, source audit showing user content is exactly `request.evidence`, and browser scalar/key privacy scan PASS. | Closed |
| P4-11 | AI gate requires each MW group n>=3, Wilcoxon matched and ranked n>=3, and Friedman complete n>=3; repeated follow-ups inherit complete n. Below gate inference is omitted while eligible descriptive evidence remains. | Genuine low-ranked follow-up and strict forged-member rejection tests PASS. | Closed |
| P4-12 | AI prompt distinguishes the three rank-test pathways and forbids causal, gain, or practical-importance conclusions from p-values. | Prompt/provider contract tests PASS. | Closed |
| P4-13 | Strict parsers reject unknown fields, overlong text, identity-bearing fields, individual arrays, hostile labels, NaN, and Infinity. | `1224746`/`5557514`: semantic, prototype/getter, exact-audit and bounded-input adversarial matrix PASS. | Closed |
| P4-14 | Stats, Methods, JSON, CSV, and AI aggregate agree on n/statistic/raw-Holm/direction/method for the same request. | Unit same-reference tests plus browser member-by-member eight-row parity PASS. | Closed |
| P4-15 | v1 bundle/AI fixtures remain readable and v2 round-trips without loss. | Strict reader/reference/AI compatibility suites PASS. | Closed |
| P4-16 | Repository/output privacy searches find no participant-level identity value/canonical key/opaque token, individual difference, or entity-period coordinate in the new inference DOM/result/CSV, Methods inference section, or AI provider evidence; local aggregate scope remains auditable. | Privacy tests, authority review, browser recursive download/DOM/evidence checks, and full Next-log sentinel scan PASS. | Closed |
| P4-17 | Stats, JSON/CSV export, Methods, and AI evidence consume the same coordinator-owned inference object and none performs a runtime low-level rank-test, rank, quantile, or Holm call. | `6258b18` process-local authority plus `69f5366` all-status current-context binding; imported clones remain readable but every producer rejects them; independent authority/privacy review PASS. | Closed |
| P4-18 | Privacy verification explicitly preserves the boundary: existing endpoint/general result tables and optional unit labels remain separately governed legacy outputs and are not silently sanitized by this project. | Design §1/§7, README and browser audit explicitly scope privacy assertions to the new inference surfaces. | Closed |

## Phase 5 — Independent review and local closeout

| ID | Acceptance condition | Evidence | Status |
| --- | --- | --- | --- |
| P5-01 | Independent mathematical reviewer approves ranks, exact tails, ties/zeros, Friedman, effects, and Holm families. | Independent final math review PASS: 112 focused tests, 3,475 exhaustive/random fixtures, and R 4.4.2 cross-checks. | Closed |
| P5-02 | Independent data/privacy reviewer approves composite identity, private tokens, error handling, exports, and AI payload. | Final post-`69f5366` data/privacy review PASS: endpoint and trajectory old-authority drift probes closed and no P0-P3 findings; final reproducible privacy/authority/AI focused suite 194/194 PASS. | Closed |
| P5-03 | Independent UI reviewer approves discoverability, three languages, keyboard/screen reader, focus, and narrow screens. | Independent real-browser/UI review PASS at browser commit `e484760`, no P0-P3 findings. | Closed |
| P5-04 | Targeted mathematical and comparison-frame tests pass. | Final reproducible rank/frame/coordinator/strict-consumer/legacy-inference/longitudinal targeted run 136/136 PASS. | Closed |
| P5-05 | Existing inference, longitudinal, Stats, export, Methods, and AI tests pass. | Final full test suite includes all existing and new focused contracts: 543/543 PASS. | Closed |
| P5-06 | Full `npm test` passes. | `npm test`: 543 tests, 543 pass, 0 fail. | Closed |
| P5-07 | `npm run typecheck` passes. | Final typecheck after `69f5366`: PASS. | Closed |
| P5-08 | `npm run build` passes. | Final production `next build` after `69f5366`: PASS; 752 static pages generated. | Closed |
| P5-09 | Browser smoke passes EndPoint independent, trajectory-period independent, paired A/B, and repeated-period workflows. | Final post-fix browser run exits 0: endpoint MW, selected-period MW 7+7, paired Wilcoxon 7 matched/2 missing, Friedman 2 + follow-up 6. | Closed |
| P5-10 | Browser smoke passes three languages, 320/375/1024 layouts, keyboard/focus, JSON/CSV/Methods, and AI preview privacy. | Final browser run: en/zh-Hant/zh-Hans actual Run; widths 320/375/1024; keyboard/focus; eight-row parity; console 0/0; cleanup PASS. | Closed |
| P5-11 | Final worktree contains only planned files and all local commits use exact-path staging. | Inventory matches the baseline diff at 45/45 paths; all existing implementation/browser commits are exact-path, and the only current uncommitted changes are these two planned documentation paths. | Closed |
| P5-12 | Final report identifies local commit SHA(s), tests, build, browser evidence, review outcomes, and residual limitations. | This ledger records commits and evidence; final handoff reports the final documentation SHA, local-only boundary, tests/build/browser and three review verdicts. | Closed |
| P5-13 | Local commit is allowed; no push is performed. | Feature branch remains local with no upstream; no push command was executed. | Closed |
| P5-14 | PR creation, merge, and branch integration are explicitly out of scope. | No PR, merge, cherry-pick, or branch integration performed. | Closed |
| P5-15 | Vercel deployment/readiness and live-route proof are explicitly out of scope. | No deployment, Vercel mutation, alias change, or live-route completion claim performed. | Closed |

## Final local verification record

- Final production implementation before documentation closeout: `69f53665879be563824fa84bc44a744d2397efcc`.
- Reproducible browser suite: `e4847604f9cffaf79374102789fa27ef275a471a`; rerun after `69f5366` exited 0.
- Targeted math/frame/coordinator/consumer: 136/136 PASS from `./node_modules/.bin/tsx --test tests/open-ena-rank-inference.test.ts tests/open-ena-longitudinal-frame.test.ts tests/open-ena-inference-v2.test.ts tests/open-ena-inference-consumers-v2.test.ts tests/open-ena-inference.test.ts tests/open-ena-longitudinal.test.ts`.
- Privacy/authority/AI focused integration: 194/194 PASS from `./node_modules/.bin/tsx --test tests/open-ena-longitudinal-frame.test.ts tests/open-ena-inference-v2.test.ts tests/open-ena-inference-consumers-v2.test.ts tests/open-ena-ai-interpretation-payload.test.ts tests/open-ena-ai-interpretation-client.test.ts tests/open-ena-ai-interpretation-route.test.ts tests/open-ena-ai-interpretation-workspace.test.ts tests/open-ena-workspace-inference-consumers.test.ts`.
- Full `npm test`: 543/543 PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS; 752 static pages generated.
- Browser: four designs, 7+7 selected-period independent, 7 matched/2 missing paired, 6 complete/3 missing repeated, 2 Friedman + 6 follow-ups, eight-row consumer parity, three locales, three widths, keyboard/focus, console 0/0, no residual server/browser session.
- Mathematical review: PASS. Browser/UI review: PASS. Final data/privacy review: PASS with endpoint and trajectory old-authority adversarial probes.
- Release boundary: local commits only; no push, PR, merge, deployment, Vercel readiness check, or live proof.

## Final source and test inventory

This reviewed inventory contains every path changed from baseline `a228976` through final production HEAD `69f5366`, including browser commit `e484760`, plus the final design/ledger closeout. There are 45 paths: 30 baseline files modified and 15 approved additions. No generated browser artifact, downloaded output, dependency lockfile, credential, or unrelated worktree file is included.

| Area | File | State | Final responsibility |
| --- | --- | --- | --- |
| Documentation | `README.md` | existing | Public four-design/exact-first/Holm and privacy boundaries |
| AI route | `app/api/open-ena/ai-interpretation/route.ts` | existing | Auth, size/rate limits, strict v1/v2 parsing, provider dispatch |
| Styles | `app/globals.css` | existing | Design cards, result tables, focus and responsive containment |
| AI UI | `components/open-ena/OpenEnaAiInterpretation.tsx` | existing | Consent, cancellation, ABA-safe lifecycle and v2 presentation |
| Inference UI | `components/open-ena/OpenEnaInferencePanel.tsx` | new | Explicit design/identity/scope/ledger/Run/results workflow |
| Workspace | `components/open-ena/OpenEnaWorkspace.tsx` | existing | Mapping, request/reset lifecycle, one authority to every consumer |
| Specification | `docs/superpowers/specs/2026-08-21-open-ena-complete-rank-inference-design.md` | new | Locked statistical, product, privacy and verification contract |
| Acceptance | `docs/superpowers/specs/2026-08-21-open-ena-complete-rank-inference-acceptance-ledger.md` | new | Evidence-bound implementation and closeout ledger |
| Localization | `lib/open-ena-i18n.ts` | existing | Structured en/zh-Hant/zh-Hans Stats copy |
| AI contract | `lib/open-ena/ai-interpretation.ts` | existing | Strict schemas, aggregate role/index evidence, per-cell privacy gates |
| Contrast | `lib/open-ena/contrasts.ts` | existing | Descriptive-only endpoint contrast without eager inference |
| Bundle | `lib/open-ena/export.ts` | existing | Bundle v2 and coordinator-authority/current-context guard |
| Authority | `lib/open-ena/inference-authority.ts` | new | Process-local same-object producer authority |
| Consumers | `lib/open-ena/inference-consumers.ts` | new | Strict readers, semantic audits, bindings, flattening, context guards |
| Coordinator | `lib/open-ena/inference-v2.ts` | new | Four requests, ledgers, families, frozen unified results |
| Legacy inference | `lib/open-ena/inference.ts` | existing | Exact-first endpoint compatibility wrapper |
| Longitudinal | `lib/open-ena/longitudinal.ts` | existing | Composite identity, private frame/slices, v2 JSON and CSV |
| Methods | `lib/open-ena/methods.ts` | existing | Render supplied authoritative inference without recomputation |
| Rank math | `lib/open-ena/rank-inference.ts` | new | Pure MW/Wilcoxon/Friedman/Holm numerical engine |
| Reference | `lib/open-ena/reference.ts` | existing | v1/v2 bundle/reference compatibility and provenance |
| Provider | `lib/server/luna-client.ts` | existing | v2 prompt and evidence-only provider body; safe v1 rejection |
| AI client tests | `tests/open-ena-ai-interpretation-client.test.ts` | existing | Consent/cancel/response/provider boundaries |
| AI payload tests | `tests/open-ena-ai-interpretation-payload.test.ts` | existing | Four designs, gates, authority, strict v1/v2 semantics/privacy |
| AI route tests | `tests/open-ena-ai-interpretation-route.test.ts` | existing | Auth/origin/size/rate/provider error contracts |
| AI Workspace tests | `tests/open-ena-ai-interpretation-workspace.test.ts` | existing | Current-result lifecycle and one-period evidence routing |
| Contrast tests | `tests/open-ena-contrasts.test.ts` | existing | Descriptive compatibility and no eager inference |
| Functional tests | `tests/open-ena-functional.test.ts` | existing | Localized Stats copy and workbench integration |
| Plot tests | `tests/open-ena-group-contrast-plot.test.ts` | existing | Presentation controls remain descriptive |
| Workspace tests | `tests/open-ena-group-contrast-workspace.test.ts` | existing | Explicit Run and same-four-person design separation |
| Browser smoke | `tests/open-ena-inference-browser-smoke.mjs` | new | Four designs, parity, privacy, locales, viewports, keyboard, cleanup |
| Consumer tests | `tests/open-ena-inference-consumers-v2.test.ts` | new | Strict schema/semantic/budget/authority/current-context adversarial tests |
| Panel tests | `tests/open-ena-inference-panel.test.ts` | new | SSR controls, a11y, localized results and aggregate-only boundary |
| Coordinator tests | `tests/open-ena-inference-v2.test.ts` | new | Four designs, bindings, families, warnings, invariance, hostile frames |
| Legacy inference tests | `tests/open-ena-inference.test.ts` | existing | Endpoint compatibility and explicit Workspace contract |
| Frame tests | `tests/open-ena-longitudinal-frame.test.ts` | new | Composite identity, private slices, cohorts, privacy, invariance |
| Longitudinal Workspace tests | `tests/open-ena-longitudinal-workspace.test.ts` | existing | Plural identity and Plot integration |
| Longitudinal tests | `tests/open-ena-longitudinal.test.ts` | existing | Plot geometry/diagnostics/export regression |
| Plot contract tests | `tests/open-ena-marginal-confidence-interval-guides-contract.test.ts` | existing | Inference/presentation separation regression |
| Methods tests | `tests/open-ena-methods.test.ts` | existing | Four-design report, escaping, disclosures and authority |
| Stats workflow tests | `tests/open-ena-official-stats-workflow-contract.test.ts` | existing | Three tabs and explicit Comparison semantics |
| Export/Methods tests | `tests/open-ena-pairwise-export-methods.test.ts` | existing | Descriptive contrast compatibility and no recomputation |
| Rank tests | `tests/open-ena-rank-inference.test.ts` | new | Numerical goldens and exact/approximation boundaries |
| README tests | `tests/open-ena-readme-inference-contract.test.ts` | new | Public methodological contract |
| Reference tests | `tests/open-ena-reference.test.ts` | existing | v1/v2 reference and strict reader compatibility |
| Unified-consumer tests | `tests/open-ena-workspace-inference-consumers.test.ts` | new | Stats/Methods/JSON/CSV current-authority parity |
