# Independent review: j-3dENA instruction adaptation

Outcome: PASS for the reviewed documentation delta. No actionable regression found. This is an instruction review, not application, numerical-parity, or production verification.

## Reviewed evidence

- Baseline: `/private/tmp/ena-astra-instructions-20260907-ml_3c9uc/before/j3dena-AGENTS.md`; SHA-256 `ddd1cca1cdc9e9d39407bea29e1939949eff657119c4a7df2f88c10fad350597`.
- Revised file: `/Volumes/Starship/ENA/j-3dENA/AGENTS.md`; SHA-256 `4c377001ec2350a2ad736f44f328a453ee0b4a3fd53d60d88bd45e340aa67af3`.
- Accepted architecture: `/Volumes/Starship/ENA/j-3dENA/docs/architecture/persistent-compute-service-v1.md`; SHA-256 `f001f77e6ac8491a4ca6d38c932afcc50cb2c3de23f1160f4a43dadc423668eb`.
- Read the full revised AGENTS.md, compared its complete diff with the baseline, and read the architecture decision. Checked current design guidance, package scripts, scientific authority/divergence records, and bootstrap source/test identifiers for the scenario walk-through.
- No application tests executed. No live source edited during review. Historical recovered copies remain outside this review's mutation scope.

## Findings

1. AGENTS.md:6-25 replaces mandatory full historical-record loading with applicable in-context instructions and task-scoped references. Numerical/parity work explicitly routes to its versioned contract and fixtures; computation architecture/lifecycle work routes to the accepted service decision; UI work retains the design master and available page override; historical reasoning remains available when needed. Nested-instruction precedence and inspection of current worktree evidence remain explicit.
2. AGENTS.md:118-123 matches the decision in persistent-compute-service-v1.md:5-13: production scientific authority is the persistent Node.js/TypeScript service; browser Workers have preflight/hash/inspection/calibration/SDK roles. The short-lived Next.js/Vercel CPU-work prohibition is preserved. This states the accepted target architecture; it does not certify that implementation or deployment is complete. The architecture document's candidate checkpoint and remaining implementation gaps remain unchanged.
3. Runtime exclusions, baseline/provenance rules, scientific invariants, parity policy, typed identity, privacy/security, lifecycle acceptance, analytical visual meaning, working rules, completion-state evidence, schedule baseline, and licensing sections are byte-for-byte unchanged. Existing ownership, independent scientific acceptance, release gates, and user-authorization boundaries were not weakened.

## Scenario: a spelling-only UI label fix

Minimum context: inspect the current worktree and label source; apply the AGENTS instructions already in context; consult the applicable portions of the design master and matching page guidance if present. Inspect nearby accessibility labels or exact-label consumers if the edit reaches them. The complete August session record, bootstrap contracts, oracle material, and compute-service topology need not be loaded for an isolated spelling change.

Minimum verification: inspect the narrow diff and confirm the intended visible/accessibility label. Use an existing targeted UI or accessibility assertion if its behavior or selector is affected; a new regression test purely mirroring the corrected spelling is unnecessary. This edit does not itself establish or require a claim of numerical parity or production readiness. Existing release gates remain required if a separate release is undertaken.

## Scenario: change bootstrap participant-cluster sampling

Minimum context is substantially deeper because the estimand can change. Read AGENTS.md:137-179 and applicable typed-identity rules; the affected versioned contract and resample fixtures; `packages/parity-contracts/SCIENTIFIC_AUTHORITY_MATRIX.md:29-36`; the normative machine-readable bootstrap approval quantities; and `DIVERGENCE_LEDGER.md:12` (DIV-005). Inspect the implementation in `packages/analysis/src/trajectory-statistics.ts` and existing `packages/analysis/src/trajectory-bootstrap.test.ts`. The source fixes participant-complete-history resampling, a versioned explicit plan, seeded successor PRNG/sort/endpoint rules, type-7 quantiles, and `rngParityClaim: false`. Do not substitute row-wise resampling or discard a participant's history under the guise of refactoring.

Minimum verification for an implementation change: freeze the relevant source/fixture/spec/seed/schema; exercise the focused participant-history bootstrap tests and the affected package's type check; check deterministic seed/plan receipts, strata, typed cluster identity, complete-history retention, cohort gaps/exclusions, duplicate draws, quantile policy, and limits according to the actual change. A candidate command is `npm run test --workspace @3dena/analysis -- src/trajectory-bootstrap.test.ts`, with `npm run typecheck --workspace @3dena/analysis`; these commands were inspected, not executed. A changed sampling definition needs a versioned successor/disposition and independent scientific acceptance, with frozen cross-runtime resample indices when claiming estimator parity. Broader task-executor, export, service lifecycle, or UI checks follow when those contracts are affected; required release/integrated gates still apply before claiming their corresponding completion states.

Current authority records retain open bootstrap plan/quantile decisions and make no R RNG parity claim. The revised routing does not allow those blockers to be inferred away from passing local tests. Historical session material is loaded only if needed to resolve the origin of a sampling requirement; compute-service architecture is additionally relevant if the requested change reaches job ownership, cancellation, resources, or execution topology.
