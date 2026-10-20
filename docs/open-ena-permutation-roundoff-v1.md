# Native trajectory permutation roundoff policy v1

The active application's `lib/open-ena/trajectory-path-statistics-v3.ts` uses
stable comparison arithmetic for inclusive permutation tails. Canonical fitted
results, cohort membership, whole-history allocation order, Mulberry32 /
Fisher–Yates resampling, seed, repetition count, the plus-one p-value formula,
and Holm adjustment are unchanged. Newly computed inference geometry can differ
from the pinned SDK by rounding; this is an intentional numerical revision.

The former strict floating-point `>=` excluded mathematically tied statistics.
An independent production-pipeline oracle fits a reference and projects six
one-hot edge histories, split three against three. Every balanced allocation
has full-space separation `sqrt(2/3)`. The old default 500/2026 run could report
p=0.2894 instead of 1. A blanket coordinate-scale epsilon fixed those ties but
also merged genuine tiny contrasts, so it is not the final comparison rule.

## Arithmetic and inclusive tails

Both groups and all periods share one per-coordinate midpoint translation.
This removes an irrelevant origin without removing between-period motion. The
midpoint uses `min/2 + max/2` to avoid overflow. Reported centroids restore that
origin; participant coordinates and the canonical fitted result stay unchanged.

A coordinate-scale forward-error budget identifies candidate comparisons that
need more accurate evaluation. It is a screening bound, not an equivalence
margin. The base budget is 32 binary64 epsilons per coordinate; weighted means
add twice the pooled participant count for their sequential weight denominator.
Norms add four operations per contributing dimension; step differences combine
both adjacent periods and groups; cumulative differences additionally include
the prefix length. There is no absolute floor. Non-finite bounds reject.
Subnormal bounds, including bounds rounded to zero, always select exact
arithmetic because a relative-error model cannot bound absolute underflow
rounding. This selection adds no statistical tie tolerance.

Observed statistics are resolved before the first permutation, independently
of allocation order. Ambiguous candidates use the same exact-arithmetic
representation of the original normalized participant-period coordinates:

- Every finite binary64 coordinate or weight is an integer times `2^-1074`.
  Weighted and equal-participant centroid contrasts are rational expressions
  in these integers. Coordinate tails compare their absolute rational values
  by cross multiplication, preserving even tiny residuals amid large scatter.
- Centroid separation uses exact rational squared norms, eliminating errors
  from centroid cancellation and floating-point norm accumulation. A relative
  squared-norm allowance of `(32 + 4D) * Number.EPSILON` remains to admit
  roundoff from a fitted rotation (`D` is the selected or full dimension).
  This allowance scales with the actual separation, not coordinate scatter or
  origin. It is a conservative numerical-resolution policy: separations within
  that relative band may count as tied. Zero and genuinely positive tiny
  separations remain distinct.
- Step differences use exact squared centroid-displacement norms. Equal
  rational squared norms contribute exactly zero, including irrational equal
  lengths. Other square roots receive integer lower/upper bounds on a grid of
  `2^-1202` (`2^-1074` with 128 extra fractional bits). Signed group-length
  intervals are subtracted; cumulative differences sum these signed intervals,
  avoiding subtraction of two rounded cumulative lengths. Absolute candidate
  intervals count inclusively when their upper bound reaches the observed
  lower bound. A step contributes at most two grid units of uncertainty;
  a prefix of `k` steps contributes at most `2k`. This is bounded interval
  arithmetic, not a claim of symbolic equality for arbitrary sums of radicals.

Returned test statistics and the corresponding period contrast fields use
these resolved observed values. Group centroid/distance descriptors remain
binary64 approximations, so a displayed difference can be more accurate than
subtracting the two displayed rounded operands. Null/missing-period admission
is preserved; a later valid adjacent step remains available after an earlier
missing period, while cumulative distance stays unavailable.

## Resources and compatibility

Full-coordinate exact means are shared by selected/full metric calculations;
step intervals and cumulative prefixes are cached once per allocation. Only
the original and current candidate caches are live. Extreme counts are streamed
instead of retaining a metric-by-replicate matrix. Exact zero observed scores
short-circuit candidate arithmetic after the existing finite/null check.

A conservative additional scratch estimate is
`points * (16 * (D + 3) + 128) + 4096 * periods * D + 8192 * tests` bytes.
It includes translated rows, time indexes, and both exact caches, allowing for
weighted finite-binary64 integer widths. The pure helper caps this estimate at
64 MiB. The native producer includes it in its existing combined 64 MiB gate
before coordinate projection; no ceiling is raised. Caching avoids an extra
period factor; the native work ceiling remains unchanged. BigInt operations
cost more than ordinary floating arithmetic on ambiguous nonzero tails.

Regression tests independently enumerate dyadic/rational allocations at
`Number.MIN_VALUE`, `2^-800`, 1 and `2^800`; cover origin shifts, cancelling scatter, weighted
means, irrational step lengths, reversed allocation order and missing periods;
and run the compiled/fitted/bound reference oracle with 500 permutations.
The ordinary SDK comparison retains exact identities, sample sizes, allocation
order, test definitions, permutation counts, raw p-values and Holm p-values.
Only derived numerical fields have operation-scaled rounding allowances.

The installed `j-3dena@0.2.0-implemented-unverified.12` bundle, vendored archive,
and separate nested `j-3dENA` checkout are unchanged. The SDK's legacy comparator
remains strict. The active root Workspace uses the corrected native trajectory
panel; the older SDK-backed Workbench is not mounted by an application route.
Its retained client/server APIs and historical bundles are not represented as
repaired by this native change.
