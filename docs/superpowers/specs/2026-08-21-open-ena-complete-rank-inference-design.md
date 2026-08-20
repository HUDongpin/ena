# Open ENA Stats: Complete Rank-Inference Design

**Status:** Approved for local implementation

**Date:** 2026-08-21

**Baseline:** `a2289765273a2ac092d0713d6d7a1572d1f93fea`

**Implementation branch:** `codex/open-ena-complete-rank-inference`

**Release boundary:** Local implementation, commits, and verification only. Push, pull request, merge, Vercel, and live publication require separate authorization.

## 1. Outcome and non-negotiable invariants

The Stats surface keeps exactly three top-level tabs: **Comparison**, **Goodness of Fit**, and **Variance**. Comparison becomes an explicit research-design workflow. The researcher selects and confirms the sampling relationship; the application determines the statistical method. There is no arbitrary method picker.

| Research design | Analysis scope | Determined method |
| --- | --- | --- |
| Independent endpoint groups | Two independent groups in the current EndPoint result | Mann–Whitney U |
| Independent groups at one period | Two groups at one explicitly selected trajectory period | Mann–Whitney U |
| Same entities at two periods | One stable group, paired earlier and later periods | Wilcoxon signed-rank |
| Same entities at three or more periods | One stable group and a complete selected-period block | Friedman omnibus plus every period-pair Wilcoxon, Holm-adjusted |

Every successful ENA result starts with no inferential result. A researcher must select a design, confirm the composite repeated-entity identity when applicable, choose valid group/time/period inputs, inspect the inclusion ledger, and activate **Run inferential comparison**. No p-value is calculated or displayed before this action.

All tests are two-sided. Every family stores raw and Holm-adjusted p-values; the UI treats Holm p as the primary value and raw p as an audit value. A `.05` threshold never determines calculation, generation, visibility, styling, export, or AI inclusion.

Inference always uses unflipped model coordinates. Plot cohort selection (`available`/`complete`), axis flips, labels, zoom, scales, and visibility controls cannot change its frame, cohort, statistics, family, or result identity.

Stats, JSON/CSV export, Methods, and AI evidence consume the same frozen inference result. They never call low-level statistical functions independently.

## 2. Public request and fixed method contract

```ts
export type OpenEnaInferenceRequestV2 =
  | {
      kind: "endpoint-independent";
      primaryGroup: string;
      secondaryGroup: string;
      axes: [string, string];
    }
  | {
      kind: "trajectory-independent-period";
      repeatedEntityColumns: string[];
      timeColumn: string;
      period: string;
      primaryGroup: string;
      secondaryGroup: string;
      axes: [string, string];
    }
  | {
      kind: "trajectory-paired-periods";
      repeatedEntityColumns: string[];
      timeColumn: string;
      group: string | null;
      earlierPeriod: string;
      laterPeriod: string;
      axes: [string, string];
      cohortPolicy: "pairwise-complete";
    }
  | {
      kind: "trajectory-repeated-periods";
      repeatedEntityColumns: string[];
      timeColumn: string;
      group: string | null;
      periods: string[];
      axes: [string, string];
      cohortPolicy: "all-period-complete";
      posthocContrasts: "all-period-pairs";
    };
```

Every request serializes this fixed method configuration:

```ts
export const OPEN_ENA_RANK_INFERENCE_METHOD = {
  alternative: "two-sided",
  pValueMethod: "auto-exact-first",
  zeroMethod: "wilcox",
  multiplicityCorrection: "holm",
  rankPrecisionSignificantDigits: 12,
  exactMaxRankedN: 50,
  friedmanExactAssignmentLimit: 1_000_000,
  continuityCorrection: 0.5,
} as const;
```

The ordinary UI cannot change these values.

## 3. Unified immutable result

The coordinator returns one deeply frozen discriminated object. It contains:

- a binding to `analyzedAt`, dataset hash and hash kind, successful model type, successful configuration, and selected axes;
- the complete request/design, group and period scope, difference direction, and `unflipped-model-coordinates` declaration;
- `status: "available" | "not-estimable" | "disabled"` and a stable reason code;
- a design-specific inclusion ledger: candidates, available by period/group, matched, earlier-only, later-only, missing-any-selected-period, zero, ranked, and complete-block counts;
- test rows with statistic components, raw p, Holm p, effect, resolved p method, ties, zeros, continuity metadata, warnings, and family membership;
- `familyId`, `familySizePlanned`, and stable member IDs.

The result never contains entity tokens, entity values, participant-period coordinates, individual paired differences, raw source rows, or source text. Valid but insufficient samples return typed `disabled` or `not-estimable` results. Dataset/result/config drift, identity collision, unstable group mapping, mismatched provenance, or non-finite coordinates throw a typed integrity error and fail closed.

Stable reason codes include at least:

- `design-not-confirmed`, `identity-not-confirmed`, `identity-columns-invalid`, `time-column-invalid`, `axes-invalid`;
- `group-required`, `group-invalid`, `groups-must-differ`, `period-invalid`, `periods-must-differ`, `at-least-three-periods-required`;
- `empty-group`, `insufficient-ranked-observations`, `all-values-tied`, `all-zero-differences`, `no-complete-blocks`;
- integrity codes `binding-mismatch`, `identity-collision`, `group-instability`, `entity-period-instability`, and `nonfinite-coordinate`.

Stable warning codes include small/discrete attainable p, ties, zeros, missing pairs, signed-rank symmetry, independent-entity/cluster assumptions, accumulated-trajectory path dependence, arbitrary axis sign, and MR1 circularity.

`familyId` hashes a canonical representation of binding, design, axes, role-based group/period scope, and method version. It cannot expose entity values or group labels in clear text.

## 4. Composite identity and longitudinal derivation

Longitudinal settings move from one field to an ordered array:

```ts
export interface OpenEnaLongitudinalSettingsV2 {
  repeatedEntityColumns: string[];
  identityConfirmed: boolean;
  timeColumn: string;
  timeOrder: string[];
  cohortPolicy: "available" | "complete";
  axes: [string, string];
  datasetNormalizedUtf8TextSha256?: string | null;
}
```

The array must be nonempty, ordered, unique, present in the dataset, and a subset of the successful model's `unitColumns`. The UI preselects all successful `unitColumns`, but initializes `identityConfirmed=false`. A v1 `repeatedEntityColumn` migrates to a one-element array and also forces `identityConfirmed=false`; migration never silently enables inference. Yu-style `Group + Name` is a recommended researcher confirmation for that dataset, not a hard-coded rule. A globally unique participant identifier remains preferable.

For each source row the browser creates a canonical private key:

```ts
JSON.stringify(repeatedEntityColumns.map((column) => [column, normalized(row[column])]))
```

The key is mapped in first-encounter order to an opaque internal token. No string delimiter joins raw values. Neither the canonical key nor token crosses the private comparison-frame boundary. If the group field is the only selected identity field while additional unit fields exist, inference is disabled as `identity-columns-invalid`; this prevents the legacy one-pseudo-person-per-group failure. If a declared identity changes group, maps inconsistently, or collides, derivation fails closed without echoing values or tokens.

The pure derivation boundary is:

```text
successful result + dataset + successful config + longitudinal settings
                               |
                               v
                 buildLongitudinalDerivation()
                               |
                   +-----------+-----------+
                   |                       |
                   v                       v
         descriptive Plot view    all-period comparison frame
```

The Plot view retains current Available/Complete behavior. The comparison frame always retains every compact entity-period point and never adopts the Plot cohort. If multiple fitted steps map to one entity-period, their projected coordinates are averaged exactly once; each resulting entity-period then has equal inferential weight. Input row reordering may relabel private encounter-order tokens, but it cannot change analytical membership, compact coordinates, pairs/blocks, diagnostics, or statistics.

The frame validates its binding and supports three typed slices:

1. `trajectory-independent-period`: exactly one period, two distinct groups, one compact point per token, finite coordinates, disjoint token sets.
2. `trajectory-paired-periods`: exactly one stable group (or `All units` only when there is no group column), explicit earlier/later periods, inner join by token, with separate earlier-only and later-only counts.
3. `trajectory-repeated-periods`: exactly one stable group and at least three ordered periods, retaining only entities present at every selected period and counting missing-any-selected-period.

Pairwise A/B inference ignores missing values at unselected periods. Friedman and every follow-up share one all-selected-period complete cohort.

## 5. Numerical methods

All ranking inputs are normalized to 12 significant digits where the method contract requires numeric equality; `-0` becomes `0`. Average ranks are used for ties and multiplied by two before exact dynamic programming.

### 5.1 Mann–Whitney U

The engine reports group sizes and medians, `Uprimary`, `Usecondary`, and signed rank-biserial effect

```text
2 * Uprimary / (nPrimary * nSecondary) - 1
```

Positive means higher ranks for Primary in the unflipped coordinate system. For total `N <= 50`, a BigInt dynamic program enumerates the conditional fixed-group-size rank-permutation distribution using doubled midranks. With no ties the method is `exact-classic`; with ties it is `exact-conditional-rank-permutation`. The two-sided p-value is the inclusive absolute tail around the null expectation and is not a mid-p. For `N > 50`, the engine uses tie-corrected normal variance and a 0.5 continuity correction. Zero pooled-rank variance is not estimable.

Endpoint output is titled **Independent endpoint groups** and never claims that the application verified a common time period. The trajectory variant is the only in-workspace Mann–Whitney path that explicitly fixes one period.

### 5.2 Wilcoxon signed-rank

Differences are `later - earlier`. After 12-significant-digit normalization, zero differences remain in matched and zero diagnostics but are omitted from ranks (`zeroMethod="wilcox"`). Nonzero absolute differences receive average ranks. The result stores:

- `W+`, `W-`, and `T=min(W+, W-)`;
- paired rank-biserial `(W+ - W-) / (W+ + W-)`, positive when later is higher;
- paired-difference median and IQR;
- positive, negative, zero, matched, missing, nonzero, and ranked counts;
- the minimum attainable inclusive two-sided p-value.

For `nNonzero <= 50`, a doubled-midrank BigInt sign-flip DP computes the inclusive conditional two-sided distribution. It resolves to `exact-classic` only with no absolute-rank ties and no original zero differences; otherwise it is `exact-conditional-sign-flip`. For `nNonzero > 50`, the normal variance is derived directly from the actual ranks and uses a 0.5 continuity correction. All-zero differences are not estimable. Small/discrete samples retain their exact p-value and a warning.

### 5.3 Friedman and follow-ups

For each axis, every complete entity ranks its selected periods internally with average ranks and tie correction. The result reports corrected Friedman `Q`, `df=k-1`, raw/Holm p, Kendall's W, ties, complete `n`, and resolved method.

When `(k!)^n <= 1_000_000`, the engine enumerates every within-entity period-label assignment and uses the inclusive conditional upper-tail probability (`exact-conditional-period-permutation`). Above the limit it uses a tie-corrected chi-square approximation. If every entity is tied across all selected periods, the row is not estimable.

Every one of the `k(k-1)/2` period pairs is generated on every axis, regardless of the omnibus p-value. Each follow-up uses the exact same all-period complete cohort as Friedman; it never silently switches to pairwise completion.

### 5.4 Holm families

Holm adjustment is deterministic and input-order invariant:

- endpoint Mann–Whitney axes: one family;
- one-period trajectory Mann–Whitney axes: one family;
- one A/B paired Wilcoxon axes: one family;
- repeated-period Friedman axes: one omnibus family;
- repeated-period `axes x all period pairs`: a separate post-hoc family.

A planned but unavailable member is treated as `p=1` while calculating the family and remains counted in `familySizePlanned`; its own `pRaw` and `pHolm` stay `null`. The two families in repeated-period inference never adjust each other.

## 6. Stats interaction, accessibility, and localization

Comparison begins with one native `<fieldset>`/`<legend>` and three radio cards:

1. **Independent groups · Mann–Whitney U**
2. **Paired periods · Wilcoxon signed-rank**
3. **Repeated periods · Friedman + Holm-adjusted Wilcoxon signed-rank**

The fixed sequence is design, identity confirmation, time/group/period scope, inclusion ledger, Run, result/provenance, then export or AI review. EndPoint enables only Independent and leaves the other cards visible but disabled with trajectory requirements. Trajectory enables Independent only with two valid groups and one period; Paired with one stable group and two periods; Repeated with one stable group and at least three selected periods. A grouped trajectory cannot pool groups; an ungrouped trajectory displays `All units`.

Changing result/analyzedAt, dataset hash, successful config, identity fields or confirmation, time field/order, group, period set/direction, or axes invalidates the old result, inference export, AI consent, and AI interpretation. Swapping A/B swaps `W+` and `W-` and negates the effect while leaving two-sided raw and Holm p unchanged.

Required tables are:

- Mann–Whitney: group, n, median, both U values, raw p, Holm p, rank-biserial, resolved method;
- Wilcoxon: direction, matched/missing/zero/nonzero, difference median/IQR, `W+`, `W-`, `T`, raw p, Holm p, paired rank-biserial, resolved method;
- Friedman: periods, complete n, `Q`, df, raw p, Holm p, Kendall's W, resolved method, followed by a separate all-axis/all-pair follow-up table.

There remains exactly one Stats tablist. Design choices are native radios, not nested tabs. Disabled explanations use `aria-describedby`; eligibility uses `role="status" aria-live="polite"`; integrity errors use `role="alert"`. Tables have captions and scoped row/column headers. Symbols have complete accessible names. Refresh does not steal focus; results expose a focusable heading or Jump-to-results control. At 320, 375, and 1024 pixels only table containers may scroll horizontally; the page cannot overflow. Color is never the sole result signal.

All Stats copy is structured in `en`, `zh-Hant`, and `zh-Hans`. Full names **Mann–Whitney U** and **Wilcoxon signed-rank** are used. Mann–Whitney is not described unconditionally as a median test.

Goodness of Fit continues to contain correlations only. Variance continues to contain the selected-axis variance only.

## 7. Export, Methods, and AI v2

The analysis bundle becomes schema v2 with one `inference` field containing the frozen aggregate result or `null`; its reader accepts v1 and v2. The longitudinal export becomes v2 and records identity column names, design, aggregate diagnostics, and the same inference object. It declares:

```ts
privacy: {
  entityTokensIncluded: false;
  entityValuesIncluded: false;
  pairedDifferencesIncluded: false;
  entityPeriodCoordinatesIncluded: false;
}
```

The geometry period CSV stays descriptive and serializes `repeatedEntityColumnsJson`. A separate inference CSV emits one aggregate row per axis/test/period pair, including method, statistic, raw/Holm p, family metadata, and counts. No inferential JSON blob is repeated in geometry rows.

Methods receives the already computed inference object. It never recomputes a test. It records design and analysis unit, composite identity column names but not values, time field/order, group/period scope, cohort and missingness, rounding/zero/tie/exact-or-approximation policy, direction/effect definition, Holm families, unflipped coordinates, accumulated path dependence, MR1 circularity, entity independence/clustering assumptions, and non-causal boundaries.

AI introduces strict request/prompt/parser v2 while the server retains the v1 parser. V2 evidence discriminates all four designs. Inferential evidence is aggregate-only: role, period index, axis, counts, statistic, raw/Holm p, effect, family, and method. Provider content excludes real group names, identity column values, tokens, participant differences, participant coordinates, raw rows, source text, and dataset hash. The existing minimum aggregate `n=3` applies to every inference cell; below it, descriptive trajectory evidence may remain but inference is omitted with an explicit boundary. Existing binding, evidence-key, cancellation, consent, request-size, strict validation, and rate-limit protections remain.

AI instructions distinguish independent-period Mann–Whitney, paired Wilcoxon signed-rank, and repeated-period Friedman/follow-ups. They forbid causal, learning-gain, and practical-importance claims from p-values and disclose multiplicity, missingness, zero handling, axis-sign, MR1, and accumulated-trajectory boundaries.

## 8. TDD sequence and local completion gates

Implementation proceeds in this order:

1. Failing tests for composite identity, Yu same-name-across-group behavior, invalid single-field pseudo-entities, private all-period frame, three slices, collapse-once, row-order invariance, and Plot independence.
2. Derivation/frame implementation while preserving descriptive Plot output.
3. Failing mathematical golden tests, then pure rank/DP/normal/chi-square/Holm helpers and the coordinator.
4. Comparison UI and binding-reset behavior, then three-language/a11y/responsive checks.
5. Bundle/longitudinal v2, inference CSV, Methods consumption, and strict AI v2 compatibility/privacy tests.
6. Independent math, data/privacy, and UI reviews; repair loops continue until each reviewer approves.

Golden and boundary coverage includes:

- Mann–Whitney exact without ties, conditional exact with ties, `N=50/51`, all ties, group reversal, and `n=4+4,U=0` exact behavior;
- Wilcoxon SciPy corn vector, all-positive, mixed signs, absolute ties, Wilcox zeros, floating rounding ties, all-zero, `n=50/51`, direction reversal, and DP-versus-full-enumeration;
- Friedman exact without ties, within-block ties, all tied, assignment-limit boundary, R-aligned chi-square, and Kendall W at 0/1;
- Holm `[.01,.04,.03,.20] -> [.04,.09,.09,.20]`, order invariance, monotonicity, planned-unavailable membership, and separate omnibus/post-hoc families;
- data/frame, stale-binding, hostile label, NaN/Infinity, privacy, schema round-trip, Stats/Methods/JSON/CSV/AI equality, keyboard/focus/screen-reader, three-language, and 320/375/1024 responsive cases.

Final local gates run in this order: targeted math/frame tests; existing inference/longitudinal/Stats/export/AI tests; full `npm test`; `npm run typecheck`; `npm run build`; browser smoke for all four designs, three languages, narrow screens, keyboard, JSON/CSV/Methods, and AI preview privacy. Completion requires every acceptance-ledger item closed, three independent reviews approved, a plan-only worktree, and exact-path local commits. It does not imply push, PR, merge, deployment, Vercel readiness, or live availability.
