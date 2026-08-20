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

All pairwise rank comparisons are two-sided. The non-directional Friedman omnibus uses its inclusive upper tail, as defined in Section 5.3. Every family stores raw and Holm-adjusted p-values; the UI treats Holm p as the primary value and raw p as an audit value. A `.05` threshold never determines calculation, generation, visibility, styling, export, or AI inclusion.

Inference always uses unflipped model coordinates. Plot cohort selection (`available`/`complete`), axis flips, labels, zoom, scales, and visibility controls cannot change its frame, cohort, statistics, family, or result identity.

Stats, JSON/CSV export, Methods, and AI evidence consume the same frozen inference result. They never call low-level statistical functions independently.

The privacy boundary for this project is exact. The internal longitudinal comparison frame and transient slice rows may contain opaque entity tokens, participant-period coordinates, and transient paired differences required for joins and numerical calculation, but never repeated-entity values or canonical identity keys. Those internals never reach the inference DOM, logs, errors, public inference result, JSON/CSV, Methods inference section, or external-AI provider payload; every such public inference surface contains no repeated-entity value/key/token, individual pair difference, or entity-period coordinate. Existing endpoint/general result tables and optional unit labels are separately governed legacy outputs; this project does not silently sanitize or change those surfaces. That legacy boundary does not permit private frame internals to enter a new public inference surface.

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

Every request serializes this fixed method configuration. `alternative: "two-sided"` governs Mann–Whitney and Wilcoxon rows; Friedman remains the non-directional upper-tail omnibus specified in Section 5.3:

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

export const OPEN_ENA_SMALL_SAMPLE_EFFECTIVE_N = 10 as const;
```

The ordinary UI cannot change these values. `small-sample` is an audit warning, never an estimability, display, export, Holm, or AI gate. It is emitted when either Mann–Whitney group has `n<10`, when a standalone paired Wilcoxon row has `nNonzero<10`, when a Friedman row has `nComplete<10`, or when a repeated-period Wilcoxon follow-up has `nNonzero<10`. The comparison is strictly `<10`, not `<=10`.

## 3. Unified immutable result

The coordinator returns one deeply frozen discriminated object. It contains:

- a binding to `analyzedAt`, dataset hash and hash kind, successful model type, successful configuration, and selected axes;
- the complete request/design, group and period scope, difference direction, and `unflipped-model-coordinates` declaration;
- `status: "available" | "not-estimable" | "disabled"` and a stable reason code;
- a design-specific inclusion ledger: candidates, available by period/group, matched, earlier-only, later-only, missing-any-selected-period, zero, ranked, and complete-block counts;
- test rows with statistic components, raw p, Holm p, effect, resolved p method, ties, zeros, continuity metadata, warnings, and family membership;
- `familyId`, `familySizePlanned`, and stable member IDs.

The result never contains entity tokens, entity values, participant-period coordinates, individual paired differences, raw source rows, or source text. Valid but insufficient samples return typed `disabled` or `not-estimable` results. Dataset/result/config drift, identity collision, unstable group mapping, mismatched provenance, or non-finite coordinates throw a typed integrity error and fail closed.

The complete stable v2 reason-code set is:

- `design-not-confirmed`, `identity-not-confirmed`, `identity-columns-invalid`, `identity-component-empty`, `time-column-invalid`, `axes-invalid`;
- `group-required`, `group-invalid`, `groups-must-differ`, `period-invalid`, `periods-must-differ`, `at-least-three-periods-required`;
- `empty-group`, `insufficient-ranked-observations`, `all-values-tied`, `all-zero-differences`, `no-complete-blocks`;
- integrity codes `binding-mismatch`, `identity-collision`, `group-instability`, `entity-period-instability`, and `nonfinite-coordinate`.

The complete stable v2 warning-code set is `small-sample`, `discrete-attainable-p`, `ties-present`, `zero-differences-present`, `missing-pairs`, `missing-complete-blocks`, `signed-rank-symmetry-assumption`, `independent-entity-assumption`, `cluster-independence-unverified`, `accumulated-trajectory-path-dependence`, `arbitrary-axis-sign`, and `mr1-circularity`. Adding or renaming a reason or warning code requires a design-and-ledger amendment before implementation.

The complete resolved p-method set is:

```ts
export type OpenEnaResolvedRankPMethod =
  | "exact-classic"
  | "exact-conditional-rank-permutation"
  | "normal-approximation-tie-corrected"
  | "exact-conditional-sign-flip"
  | "normal-approximation-actual-ranks"
  | "exact-conditional-period-permutation"
  | "chi-square-approximation-tie-corrected";
```

An available row receives `discrete-attainable-p` exactly when its resolved method is one of the four exact methods. Approximation rows do not receive it, and disabled/not-estimable rows have `resolvedPMethod=null` and do not receive it.

Local `familyId` hashes a canonical representation of binding, design, axes, role-based group/period scope, and method version. Local family and member IDs cannot contain or reversibly encode entity values, entity tokens, group/period labels, source text, or other clear-text private inputs. These canonical local IDs are never sent to the external AI provider; Section 7 defines separate request-local role-only AI identifiers.

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
function normalizeIdentityComponent(value: unknown): string {
  const normalized = value === null || value === undefined
    ? ""
    : String(value).normalize("NFC");
  if (normalized.trim().length === 0) throw reason("identity-component-empty");
  return normalized;
}

JSON.stringify(repeatedEntityColumns.map((column) => [
  column,
  normalizeIdentityComponent(row[column]),
]))
```

`null` and `undefined` therefore normalize to the empty string and are invalid. Every other value uses exactly `String(value).normalize("NFC")`: case and leading/trailing whitespace are preserved in the canonical key, but a value whose `.trim()` is empty is invalid. Numeric `1` and string `"1"` intentionally canonicalize alike. No string delimiter joins raw values. The key is mapped in first-encounter order to an opaque internal token for frame joins and validation. The canonical key is discarded before the comparison frame is returned; the opaque token stays inside the private frame/slice boundary and is removed before any public inference result, DOM, export, Methods section, error, log, or AI evidence is built. If the group field is the only selected identity field while additional unit fields exist, inference is disabled as `identity-columns-invalid`; this prevents the legacy one-pseudo-person-per-group failure. If a declared identity changes group, maps inconsistently, or collides, derivation fails closed without echoing values or tokens.

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

The Plot view retains current Available/Complete behavior. The private comparison frame always retains every compact entity-period point and never adopts the Plot cohort. If multiple fitted steps map to one entity-period, their projected coordinates are averaged exactly once; each resulting entity-period then has equal inferential weight. Input row reordering may relabel private encounter-order tokens, but it cannot change analytical membership, compact coordinates, pairs/blocks, diagnostics, or statistics.

The frame validates its binding and supports three typed slices:

1. `trajectory-independent-period`: exactly one period, two distinct groups, one compact point per token, finite coordinates, and disjoint token sets.
2. `trajectory-paired-periods`: exactly one stable group (or `All units` only when there is no group column), two explicit distinct period slots, an inner join by private token, and separate earlier-only/later-only counts. The public field names `earlierPeriod` and `laterPeriod` define subtraction direction rather than enforcing chronological order: either known period may occupy either slot, so reversing the slots reverses the signed result. Unknown or equal periods remain invalid.
3. `trajectory-repeated-periods`: exactly one stable group and at least three ordered periods, retaining only private entity blocks present at every selected period and counting missing-any-selected-period.

Pairwise A/B inference ignores missing values at unselected periods. Friedman and every follow-up share one all-selected-period complete cohort, and the repeated-period selector remains strictly ordered by `timeOrder`. Private slice ledgers establish membership and missingness; their provisional raw-coordinate zero counts, if present for descriptive compatibility, are not authoritative inference counts. The coordinator alone computes public zero/nonzero/ranked counts with the shared 12-significant-digit difference normalizer.

## 5. Numerical methods

Every finite ranking input is normalized exactly as follows:

```ts
const rounded = Number(value.toPrecision(12));
const normalized = Object.is(rounded, -0) ? 0 : rounded;
```

Non-finite inputs fail closed as `nonfinite-coordinate`. Equality, zero classification, tie groups, differences, and ranks use the resulting `Number`; this also makes values represented with exponential notation deterministic. Average ranks are multiplied by two before exact dynamic programming.

Normalization order is part of the contract. Mann–Whitney normalizes each group coordinate before pooling and ranking. Friedman normalizes each entity-period coordinate before within-entity ranking. Wilcoxon first checks that both source coordinates are finite, computes the raw JavaScript difference `later - earlier`, and then normalizes that difference exactly once; it must not normalize the two coordinates separately before subtraction. The coordinator uses that same normalized difference for the inclusion ledger, zero/tie classification, descriptive difference summary, ranks, statistic, effect, and method resolution.

Median, quartiles, and IQR use R quantile type 7 on ascending normalized values. For probability `p`, `h=(n-1)*p`, `j=floor(h)`, and the quantile is `x[j] + (h-j) * (x[ceil(h)] - x[j])` with zero-based indexing. Reports store scalar `q1=Q(0.25)`, `q3=Q(0.75)`, and `iqr=q3-q1`; median is `Q(0.5)`. Locked small-sample goldens are `[5] -> q1=5,q3=5,iqr=0`, `[1,3] -> q1=1.5,q3=2.5,iqr=1`, `[1,2,9] -> q1=1.5,q3=5.5,iqr=4`, and `[1,2,3,4] -> q1=1.75,q3=3.25,iqr=1.5`.

Estimability is mathematical and separate from the AI privacy gate. Mann–Whitney is available with at least one finite observation in each group unless all pooled ranks are tied. Wilcoxon is available with at least one matched nonzero difference; an all-zero matched set is `all-zero-differences` and is not estimable. Friedman is available for `k>=3` with at least one complete block unless every within-block rank is tied. These tiny but valid samples remain available and carry `small-sample` and, when applicable, `discrete-attainable-p`; they are not disabled merely because `n<3`. `insufficient-ranked-observations` is used only when no rankable observation remains after design-specific exclusion and no more specific code in the closed set applies. Empty Mann–Whitney groups use `empty-group`, all-tied pooled ranks use `all-values-tied`, all-zero Wilcoxon data use `all-zero-differences`, and zero Friedman complete blocks use `no-complete-blocks`.

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

For `nNonzero <= 50`, a doubled-midrank BigInt sign-flip DP computes the inclusive conditional two-sided distribution. It resolves to `exact-classic` only with no absolute-rank ties and no original zero differences; otherwise it is `exact-conditional-sign-flip`. For `nNonzero > 50`, the normal variance is `sum(rank^2)/4`, derived directly from the actual average ranks, and uses a 0.5 continuity correction. All-zero differences are not estimable. Small/discrete samples retain their exact p-value and the fixed warnings above.

For every estimable Wilcoxon row, the minimum attainable inclusive two-sided sign-flip p-value is represented without underflow as:

```ts
minimumAttainableTwoSidedP: {
  formula: "2^(1-nNonzero)";
  log2: number; // 1 - nNonzero
  numeric: number | null;
}
```

For `1<=nNonzero<=1075`, `numeric=2 ** (1-nNonzero)`. For `nNonzero>=1076`, `numeric=null` and the formula/log2 representation remains authoritative; the UI and exports never display an underflowed zero. A not-estimable row with `nNonzero=0` stores the whole field as `null`. Absolute-rank ties and original zeros do not change this support property because `nNonzero` already reflects Wilcox zero removal.

### 5.3 Friedman and follow-ups

For each axis, every complete entity ranks its selected periods internally with average ranks and tie correction. If `R_j` is the rank sum for period `j`, `A=sum_j[R_j-n(k+1)/2]^2`, and `Ties` is the sum of `t^3-t` over every within-block tie group, the corrected statistic is:

```text
C = 1 - Ties / [n(k^3-k)]
Q = [12A / (n*k*(k+1))] / C
  = 12A / [n*k*(k+1) - Ties/(k-1)]
df = k - 1
Kendall's W = Q / [n*(k-1)]
```

The result reports this tie-corrected `Q`, `df`, raw/Holm p, tie-corrected Kendall's W, ties, complete `n`, and resolved method. A zero denominator means every complete block is tied across all selected periods and is not estimable.

When `(k!)^n <= 1_000_000`, the engine enumerates every within-entity period-label assignment and uses the inclusive conditional upper-tail probability (`exact-conditional-period-permutation`). Tied-value duplicate permutations retain their period-label assignment multiplicity, the total assignment count remains `(k!)^n`, and the exact tail compares doubled-rank-sum integer scores rather than floating-point `Q` values. Above the limit it uses `regularizedGammaQ(df/2,Q/2)` and resolves to `chi-square-approximation-tie-corrected`. If every entity is tied across all selected periods, the row is not estimable.

The normal and chi-square tail implementations must match the locked R/SciPy fixtures to approximately `1e-12` absolute or relative tolerance; the legacy low-precision `erfc` approximation is not reused as the v2 numerical contract.

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

Changing request kind/design, result/analyzedAt, dataset hash, successful config, identity fields or confirmation, time field/order, group, period set/direction, or axes invalidates the old result and clears inference, inference export, AI consent, and AI interpretation. Swapping A/B swaps `W+` and `W-` and negates the effect while leaving two-sided raw and Holm p unchanged. Changing locale or AI prompt version clears AI consent and interpretation only; it does not clear or recompute statistical inference or its export.

Required tables are:

- Mann–Whitney: group, n, median, both U values, raw p, Holm p, rank-biserial, resolved method;
- Wilcoxon: direction, matched/missing/zero/nonzero, difference median/IQR, `W+`, `W-`, `T`, raw p, Holm p, paired rank-biserial, resolved method;
- Friedman: periods, complete n, `Q`, df, raw p, Holm p, Kendall's W, resolved method, followed by a separate all-axis/all-pair follow-up table.

There remains exactly one Stats tablist. Design choices are native radios, not nested tabs. Disabled explanations use `aria-describedby`; eligibility uses `role="status" aria-live="polite"`; integrity errors use `role="alert"`. Tables have captions and scoped row/column headers. Symbols have complete accessible names. Refresh does not steal focus; results expose a focusable heading or Jump-to-results control. At 320, 375, and 1024 pixels only table containers may scroll horizontally; the page cannot overflow. Color is never the sole result signal.

All Stats copy is structured in `en`, `zh-Hant`, and `zh-Hans`. Full names **Mann–Whitney U** and **Wilcoxon signed-rank** are used. Mann–Whitney is not described unconditionally as a median test.

Goodness of Fit continues to contain correlations only. Variance continues to contain the selected-axis variance only.

## 7. Export, Methods, and AI v2

The analysis bundle becomes schema v2 with one `inference` field containing the frozen aggregate result or `null`; its reader accepts v1 and v2. The longitudinal export becomes v2 and records identity column names, design, aggregate diagnostics, and the same inference object. Stats, JSON/CSV export, Methods, and AI evidence receive that coordinator-owned object; none may import or call the low-level Mann–Whitney, Wilcoxon, Friedman, rank, quantile, or Holm helpers. The longitudinal export declares:

```ts
privacy: {
  entityTokensIncluded: false;
  entityValuesIncluded: false;
  pairedDifferencesIncluded: false;
  entityPeriodCoordinatesIncluded: false;
}
```

The geometry period CSV stays descriptive and serializes identity column names in `repeatedEntityColumnsJson`, never identity values. A separate inference CSV emits one aggregate row per axis/test/period pair, including method, statistic, raw/Holm p, privacy-safe family/member metadata, and counts. It contains no identity value, key, token, individual difference, or entity-period coordinate. No inferential JSON blob is repeated in geometry rows.

Methods receives the already computed inference object. It never recomputes a test. It records design and analysis unit, composite identity column names but not values, time field/order, group/period scope, cohort and missingness, rounding/zero/tie/exact-or-approximation policy, direction/effect definition, Holm families, unflipped coordinates, accumulated path dependence, MR1 circularity, entity independence/clustering assumptions, and non-causal boundaries.

AI introduces strict request/prompt/parser v2 while the server retains the v1 parser. V2 evidence discriminates all four designs. Inferential evidence is aggregate-only: request-local role, period index, axis role, counts, statistic, raw/Holm p, effect, request-local family/member role, and method. The external provider never receives the canonical local `familyId`, canonical member IDs, dataset hash, `analyzedAt`, filename, binding/config/result hash, reference ID, evidence key, or any other dataset-linked fingerprint. It receives only request-local role-only IDs such as `comparison-family`, `omnibus-family`, `posthoc-family`, `axis-1`, and `period-1-period-2`; those IDs contain no labels or stable dataset linkage. Provider content also excludes real group names, identity column values, canonical identity keys, tokens, participant differences, participant coordinates, raw rows, and source text. Existing binding and evidence-key protections may operate locally and at the application route but are stripped before provider request construction; cancellation, consent, request-size, strict validation, and rate-limit protections remain.

The AI `n>=3` rule is a separate disclosure/privacy gate, not a statistical estimability rule. Mann–Whitney evidence is eligible only when each group has at least three finite ranked observations. Paired Wilcoxon evidence is eligible only when both matched `n>=3` and ranked nonzero `n>=3`. Friedman evidence is eligible only when complete-block `n>=3`; every repeated-period Wilcoxon follow-up inherits that same complete-block `n>=3` gate. Below the applicable gate, or when the local result is unavailable, the inferential member is omitted from provider evidence while otherwise eligible aggregate descriptive evidence is preserved with an explicit boundary.

AI instructions distinguish independent-period Mann–Whitney, paired Wilcoxon signed-rank, and repeated-period Friedman/follow-ups. They forbid causal, learning-gain, and practical-importance claims from p-values and disclose multiplicity, missingness, zero handling, axis-sign, MR1, and accumulated-trajectory boundaries.

## 8. TDD sequence and local completion gates

Implementation proceeds in this order:

1. Failing tests for composite identity, null/undefined/blank component rejection, NFC equivalence, preserved case/outer whitespace, numeric/string identity equivalence, Yu same-name-across-group behavior, invalid single-field pseudo-entities, private all-period frame, three slices, collapse-once, row-order invariance, and Plot independence.
2. Derivation/frame implementation while preserving descriptive Plot output.
3. Failing mathematical golden tests, then pure rank/DP/normal/chi-square/Holm helpers and the coordinator.
4. Comparison UI and binding-reset behavior, then three-language/a11y/responsive checks.
5. Bundle/longitudinal v2, inference CSV, Methods consumption, and strict AI v2 compatibility/privacy tests.
6. Independent math, data/privacy, and UI reviews; repair loops continue until each reviewer approves.

Golden and boundary coverage includes:

- Mann–Whitney exact without ties, conditional exact with ties, `N=50/51`, all ties, group reversal, and `n=4+4,U=0` exact behavior;
- Wilcoxon SciPy corn vector, all-positive, mixed signs, absolute ties, Wilcox zeros, floating rounding ties, all-zero, `n=50/51`, direction reversal, R-type-7 quartile/IQR small-sample goldens, and DP-versus-full-enumeration;
- Friedman exact without ties, within-block ties, all tied, assignment-limit boundary, R-aligned chi-square, and Kendall W at 0/1;
- Holm `[.01,.04,.03,.20] -> [.04,.09,.09,.20]`, order invariance, monotonicity, planned-unavailable membership, and separate omnibus/post-hoc families;
- decimal/exponential 12-significant-digit normalization and `-0`, design-specific `n=1` estimability versus the separate AI `n>=3` gate, data/frame, stale-binding, hostile label, NaN/Infinity, scoped new-surface privacy, schema round-trip, same-coordinator-object Stats/Methods/JSON/CSV/AI equality, endpoint title/no-period-claim, request/locale/prompt invalidation, keyboard/focus/screen-reader, three-language, and 320/375/1024 responsive cases.

Final local gates run in this order: targeted math/frame tests; existing inference/longitudinal/Stats/export/AI tests; full `npm test`; `npm run typecheck`; `npm run build`; browser smoke for all four designs, three languages, narrow screens, keyboard, JSON/CSV/Methods, and AI preview privacy. Completion requires every acceptance-ledger item closed, three independent reviews approved, a plan-only worktree, and exact-path local commits. It does not imply push, PR, merge, deployment, Vercel readiness, or live availability.
