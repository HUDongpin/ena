# Open ENA Model V3 Parity and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the completed Models v3 system against pinned rENA references, frozen ONA behavior, real served-browser journeys, accessibility/i18n contracts, and the repository's complete verification gate.

**Architecture:** Keep existing rENA 0.3.1 goldens immutable, generate a separately pinned current official suite, run parity with mathematically appropriate invariants, create a deterministic browser evidence receipt, and record every pass/fail/skip in an acceptance ledger.

**Tech Stack:** R 4.4, rENA 0.3.1 baseline, official rENA package repository, jENA Vitest, Node test runner, Playwright/Chromium, Next.js production server, shell verification scripts.

---

### Task 1: Revalidate the pre-cutover baseline after the v3 cutover

**Files:**
- Test: `tests/fixtures/open-ena/model-v3/baseline-manifest.json`
- Test: `tests/open-ena-model-v3-baseline.test.ts`

- [ ] **Step 1: Verify the frozen files still match their recorded hashes**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-baseline.test.ts
shasum -a 256 packages/jena-js/fixtures/goldens/sena-configs.generated.json
```

Expected: PASS and hashes equal the immutable values recorded before Plan 1.

- [ ] **Step 2: Compare the post-cutover ONA adapter with the frozen public baseline**

Run:

```bash
node --import tsx --test tests/open-ena-ona-v3-adapter.test.ts
node --import tsx --test tests/open-ena-ona-analysis-plan.test.ts tests/open-ena-ona-worker.test.ts tests/open-ena-ona-bundle.test.ts tests/open-ena-ona-descriptive.test.ts tests/open-ena-ona-3d.test.ts
```

Expected: PASS.

- [ ] **Step 3: Confirm the baseline files are unmodified**

Run: `git diff --exit-code -- tests/fixtures/open-ena/model-v3/baseline-manifest.json packages/jena-js/fixtures/goldens/sena-configs.generated.json`
Expected: PASS with no diff.

### Task 2: Add a separately pinned current rENA golden generator

**Files:**
- Create: `packages/jena-js/scripts/regen-standard-v3-goldens.R`
- Create: `packages/jena-js/fixtures/goldens/rena-current-standard-v3.generated.json`
- Modify: `packages/jena-js/package.json`
- Test: `packages/jena-js/tests/standard-v3-golden-manifest.test.ts`

- [ ] **Step 1: Write the failing manifest-metadata test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current rENA Standard v3 golden manifest", () => {
  it("pins every generator and runtime identity", () => {
    const fixture = JSON.parse(readFileSync(
      new URL("../fixtures/goldens/rena-current-standard-v3.generated.json", import.meta.url),
      "utf8",
    ));
    expect(fixture.meta.rENAVersion).toMatch(/^0\.4\./u);
    expect(fixture.meta.packageSource).toBe("https://cran.qe-libs.org");
    expect(fixture.meta.packageArtifactSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(fixture.meta.generatorScriptSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(fixture.meta.rVersion).toMatch(/^R version/u);
    expect(fixture.configs).toHaveProperty("endpointMovingBinary");
    expect(fixture.configs).toHaveProperty("accumulatedConversationFrequency");
  });
});
```

- [ ] **Step 2: Run the manifest test**

Run: `npm test --workspace=jena-js -- tests/standard-v3-golden-manifest.test.ts`
Expected: FAIL because the generator and fixture are absent.

- [ ] **Step 3: Install the official package into a task-scoped R library**

Run:

```bash
rena_probe_lib=$(mktemp -d)
R_LIBS_USER="$rena_probe_lib" Rscript --vanilla -e 'install.packages("rENA", repos=c("https://cran.qe-libs.org","https://cran.rstudio.org")); stopifnot(startsWith(as.character(utils::packageVersion("rENA")), "0.4.")); cat(find.package("rENA"))'
```

Expected: a task-scoped package path and an installed official rENA 0.4.x
version. If the repository no longer serves 0.4.x, stop this task and record the
actual repository metadata; do not relabel another version as the approved
current suite.

- [ ] **Step 4: Implement the deterministic R generator**

The script defines one fixed dataset with stable row order and produces:

- all three models;
- both windows;
- Binary and sum/Frequency;
- back 1, finite back, finite forward, backward Infinity, forward Infinity,
  both Infinity, and Conversation;
- SVD and Endpoint Means;
- row counts, connection counts, trajectories, normalized weights, centered
  points, rotation matrix/columns, nodes, and variance.

It writes sorted JSON and a meta block containing exact package version,
package repository/artifact hash, R version/platform, dependency versions,
script hash, and generation time. It never overwrites the 0.3.1 fixture.

```r
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 1)
suppressPackageStartupMessages(library(rENA))
suppressPackageStartupMessages(library(jsonlite))

cases <- list(
  list(key = "endpointMovingBinary", model = "EndPoint", window = "MovingStanzaWindow", weighting = "binary", back = 1, forward = 0),
  list(key = "endpointMovingFrequency", model = "EndPoint", window = "MovingStanzaWindow", weighting = "frequency", back = 3, forward = 0),
  list(key = "separateMovingBinary", model = "SeparateTrajectory", window = "MovingStanzaWindow", weighting = "binary", back = 2, forward = 2),
  list(key = "separateMovingFrequency", model = "SeparateTrajectory", window = "MovingStanzaWindow", weighting = "frequency", back = Inf, forward = 0),
  list(key = "accumulatedMovingBinary", model = "AccumulatedTrajectory", window = "MovingStanzaWindow", weighting = "binary", back = 2, forward = Inf),
  list(key = "accumulatedMovingFrequency", model = "AccumulatedTrajectory", window = "MovingStanzaWindow", weighting = "frequency", back = Inf, forward = Inf),
  list(key = "endpointConversationBinary", model = "EndPoint", window = "Conversation", weighting = "binary"),
  list(key = "endpointConversationFrequency", model = "EndPoint", window = "Conversation", weighting = "frequency"),
  list(key = "separateConversationBinary", model = "SeparateTrajectory", window = "Conversation", weighting = "binary"),
  list(key = "separateConversationFrequency", model = "SeparateTrajectory", window = "Conversation", weighting = "frequency"),
  list(key = "accumulatedConversationBinary", model = "AccumulatedTrajectory", window = "Conversation", weighting = "binary"),
  list(key = "accumulatedConversationFrequency", model = "AccumulatedTrajectory", window = "Conversation", weighting = "frequency"),
  list(key = "endpointMovingMeans", model = "EndPoint", window = "MovingStanzaWindow", weighting = "binary", back = 2, forward = 1, rotation = "means"),
  list(key = "endpointConversationMeans", model = "EndPoint", window = "Conversation", weighting = "binary", rotation = "means")
)

configs <- list()
for (case in cases) {
  back <- if (case$window == "Conversation") Inf else case$back
  forward <- if (case$window == "Conversation") 0 else case$forward
  accum <- ena.accumulate.data(
    units = fixture[c("unit")],
    conversation = fixture[c("horizon")],
    codes = fixture[code_names],
    metadata = fixture[c("group")],
    model = case$model,
    weight.by = if (case$weighting == "binary") "binary" else sum,
    window = case$window,
    window.size.back = back,
    window.size.forward = forward,
    as.list = TRUE
  )
  set <- make_set_for_case(accum, case, dimensions = 3)
  configs[[case$key]] <- summarize_config(accum, set, case, back, forward)
}
write_json(list(meta = generator_meta(), input = fixture, configs = configs), args[[1]], auto_unbox = TRUE, pretty = TRUE, digits = NA)
```

- [ ] **Step 5: Generate the current fixture and verify the script hash**

Run:

```bash
rena_generation_lib=$(mktemp -d)
R_LIBS_USER="$rena_generation_lib" Rscript --vanilla -e 'install.packages("rENA", repos=c("https://cran.qe-libs.org","https://cran.rstudio.org")); stopifnot(startsWith(as.character(utils::packageVersion("rENA")), "0.4."))'
R_LIBS_USER="$rena_generation_lib" Rscript --vanilla packages/jena-js/scripts/regen-standard-v3-goldens.R packages/jena-js/fixtures/goldens/rena-current-standard-v3.generated.json
shasum -a 256 packages/jena-js/scripts/regen-standard-v3-goldens.R packages/jena-js/fixtures/goldens/rena-current-standard-v3.generated.json
```

Expected: a generated JSON fixture whose embedded script hash equals the
observed script hash and whose rENA version is the installed official 0.4.x.

- [ ] **Step 6: Add the package script**

```json
{
  "scripts": {
    "goldens:standard-v3": "Rscript --vanilla scripts/regen-standard-v3-goldens.R fixtures/goldens/rena-current-standard-v3.generated.json"
  }
}
```

- [ ] **Step 7: Run the manifest test**

Run: `npm test --workspace=jena-js -- tests/standard-v3-golden-manifest.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit the independent current fixture**

```bash
git add packages/jena-js/scripts/regen-standard-v3-goldens.R packages/jena-js/fixtures/goldens/rena-current-standard-v3.generated.json packages/jena-js/package.json packages/jena-js/tests/standard-v3-golden-manifest.test.ts
git commit -m "test: pin current rENA Standard goldens"
```

### Task 3: Prove rENA/jENA Standard parity

**Files:**
- Create: `packages/jena-js/tests/standard-v3-r-parity.test.ts`
- Modify: `packages/jena-js/tests/golden-helpers.ts`
- Modify: `packages/jena-js/NUMERICS.md`

- [ ] **Step 1: Write the failing parity matrix**

```ts
for (const [name, golden] of Object.entries(fixture.configs)) {
  it(`matches pinned rENA for ${name}`, () => {
    const actual = ena({
      rows: fixture.input,
      ...golden.options,
    });
    expectRowsClose(actual.connectionCounts, golden.connectionCounts, 1e-10);
    expectRowsClose(actual.lineWeights, golden.lineWeights, 1e-10);
    expectRotationEquivalent(actual, golden, {
      scalarTolerance: 1e-8,
      repeatedEigenvalueTolerance: 1e-8,
      fixedMeansDirection: golden.options.rotation?.method === "mean",
    });
  });
}
```

- [ ] **Step 2: Run the parity test**

Run: `npm test --workspace=jena-js -- tests/standard-v3-r-parity.test.ts`
Expected: FAIL on absent helper behavior or a concrete numerical mismatch;
retain the exact first mismatch.

- [ ] **Step 3: Implement mathematically appropriate comparison helpers**

For ordinary non-degenerate axes align SVD signs deterministically. For repeated
eigenvalues compare the orthogonal projector of the repeated subspace and
pairwise projected distances, not arbitrary individual basis columns. For
Means, require the approved positive-minus-negative MR1 direction without sign
forgiveness. Reference projections compare after exact edge permutation.

```ts
export function projector(columns: number[][]): number[][] {
  return columns.map((left) => columns.map((right) => (
    left.reduce((sum, value, index) => sum + value * right[index], 0)
  )));
}

export function expectRepeatedSubspaceClose(actual: number[][], expected: number[][], tolerance: number) {
  expectMatrixClose(projector(actual), projector(expected), tolerance);
}
```

- [ ] **Step 4: Fix product/runtime mismatches without changing goldens**

Use the independent oracle and official rENA source to correct jENA or the v3
adapter. Do not modify generated expected values manually. Regenerate only by
running the pinned R script and preserve both 0.3.1 and current fixtures.

- [ ] **Step 5: Document numerical tolerances and known version differences**

In `NUMERICS.md`, record exact/discrete fields, 1e-10 normalized/point
comparison, 1e-8 rotation/subspace comparison, Means direction, and any
0.3.1-to-current official difference with both fixture identifiers.

- [ ] **Step 6: Run baseline and current parity**

Run:

```bash
npm test --workspace=jena-js -- tests/r-goldens.test.ts
npm test --workspace=jena-js -- tests/standard-v3-r-parity.test.ts
npm run test:pack-contract --workspace=jena-js
```

Expected: PASS with neither suite skipped.

- [ ] **Step 7: Commit parity**

```bash
git add packages/jena-js/tests/standard-v3-r-parity.test.ts packages/jena-js/tests/golden-helpers.ts packages/jena-js/NUMERICS.md
git commit -m "test: verify Standard ENA parity with rENA"
```

### Task 4: Lock complete ONA non-regression

**Files:**
- Create: `tests/open-ena-ona-v3-nonregression.test.ts`
- Modify: `tests/open-ena-ona-yu-golden.test.ts`

- [ ] **Step 1: Write the public baseline equality test**

```ts
test("v3 ONA preserves the frozen public model and display geometry", async () => {
  const manifest = readBaselineManifest();
  assert.equal(sha256(readFileSync(manifest.ona.publicFixturePath)), manifest.ona.publicFixtureSha256);
  const legacy = buildLegacyOnaFixtureResult();
  const v3 = await buildV3OnaFixtureResult();
  assert.deepEqual(v3.set.connectionCounts, legacy.set.connectionCounts);
  assert.deepEqual(v3.set.lineWeights, legacy.set.lineWeights);
  assert.deepEqual(v3.set.points, legacy.set.points);
  assert.deepEqual(v3.set.rotation, legacy.set.rotation);
  assert.deepEqual(v3.orderedAudit, legacy.orderedAudit);
  assert.deepEqual(v3.orderedResponseNodeSummary, legacy.orderedResponseNodeSummary);
});
```

- [ ] **Step 2: Run the new ONA test**

Run: `node --import tsx --test tests/open-ena-ona-v3-nonregression.test.ts`
Expected: PASS only if the v3 adapter is numerically identical; otherwise FAIL
on the first exact field.

- [ ] **Step 3: Make private/external fixture status explicit**

Keep the Yu scientific test's current fixture-presence gate, but emit a named
skip reason that identifies the missing input. Do not count that skip as a
pass, add private input to Git, or weaken public ONA assertions.

```ts
if (!privateInputsPresent) {
  test.skip(
    "Yu ONA golden requires the private/local workbook and R-derived CSV; no scientific pass is claimed",
    () => undefined,
  );
}
```

- [ ] **Step 4: Run every ONA suite**

Run:

```bash
node --import tsx --test tests/open-ena-ona-*.test.ts
npm test --workspace=jena-js -- tests/ordered-network.test.ts tests/ordered-window-stability.test.ts tests/ordered-half-product-stability.test.ts tests/ordered-safety-budget.test.ts
```

Expected: all public suites PASS; any absent private fixture appears only as an
explicit SKIP.

- [ ] **Step 5: Commit ONA non-regression evidence**

```bash
git add tests/open-ena-ona-v3-nonregression.test.ts tests/open-ena-ona-yu-golden.test.ts
git commit -m "test: lock ONA behavior through Models v3"
```

### Task 5: Build the real served-browser Models v3 journey

**Files:**
- Create: `tests/open-ena-models-v3-browser-smoke.mjs`
- Create: `tests/open-ena-models-v3-browser-smoke-contract.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing browser-script contract**

```ts
test("package exposes a bounded Models v3 browser gate", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.scripts["test:browser:open-ena-models-v3"],
    "node tests/open-ena-models-v3-browser-smoke.mjs",
  );
  const source = readFileSync("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
  assert.match(source, /page\.on\("console"/u);
  assert.match(source, /page\.on\("pageerror"/u);
  assert.match(source, /Exclude all selected Codes/u);
  assert.match(source, /executionPlanSha256/u);
  assert.match(source, /screenshot/u);
});
```

- [ ] **Step 2: Run the contract test**

Run: `node --import tsx --test tests/open-ena-models-v3-browser-smoke-contract.test.ts`
Expected: FAIL because script and package command are absent.

- [ ] **Step 3: Implement the browser smoke harness**

Follow existing Open ENA smoke safety: use a task-scoped temp directory and
cache, allocate a free loopback port, and always start an owned production
server from the just-built local checkout. Never attach to an already-running
server whose build identity is unknown. Authenticate through the existing local
test path, register console/pageerror/requestfailed collectors, use a fixed
desktop and narrow viewport, and write screenshots plus a JSON receipt with the
exact Git SHA, server child-process identity, base URL, and SHA-256 hashes.
Terminate only the owned child process and never print credentials.

```js
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push({ kind: "console", text: message.text() });
});
page.on("pageerror", (error) => browserErrors.push({ kind: "pageerror", text: error.message }));
page.on("requestfailed", (request) => browserErrors.push({
  kind: "requestfailed",
  text: request.failure()?.errorText ?? "unknown",
}));
await page.setViewportSize({ width: 1440, height: 960 });
```

- [ ] **Step 4: Implement the full user journey**

The script must:

1. Load the teaching sample.
2. Assert the active tab top has no gray gap.
3. Assert Horizons/Windows contain no Transmodal controls or vacated height.
4. Exercise all Units toolbar buttons and exact Group visibility restore.
5. Exclude Group under Means and prove no SVD fallback.
6. Exercise Codes Hide/restore and Exclude all/Undo.
7. Prove Codes remain empty across rerender before Undo.
8. Run Endpoint Moving/Conversation, Binary/Frequency boundaries.
9. Run Separate and Accumulated with explicit orders.
10. Exercise finite/backward Infinity/forward Infinity.
11. Fit Means Endpoint, export/import Reference, and project all three models.
12. Switch Standard/ONA twice and prove independent drafts/order/mask.
13. Exercise keyboard tabs, Help, dialogs, Undo, and live announcements.
14. Repeat key layout checks at narrow width and 200-percent zoom.
15. Assert no unexpected console/page errors or horizontal document overflow.

```js
await assertNoTransmodalControls(page);
await exerciseUnitsToolbar(page);
await exerciseCodesHideExcludeUndo(page);
await runSixStandardCombinations(page);
await exerciseMeansAndReferenceTargets(page);
await verifyFamilyIsolation(page);
await verifyKeyboardAndZoom(page);
assert.deepEqual(classifyExpectedBrowserWarnings(browserErrors), []);
```

- [ ] **Step 5: Add the exact package script**

```json
{
  "scripts": {
    "test:browser:open-ena-models-v3": "node tests/open-ena-models-v3-browser-smoke.mjs"
  }
}
```

- [ ] **Step 6: Run the contract and real browser smoke**

Run:

```bash
node --import tsx --test tests/open-ena-models-v3-browser-smoke-contract.test.ts
npm run build
npm run test:browser:open-ena-models-v3
```

Expected: PASS with a receipt path, screenshot paths, zero unexpected browser
errors, and no secret values in output.

- [ ] **Step 7: Inspect the desktop and narrow screenshots**

Open both screenshots and visually verify the tab indicator, no gray spacer,
removed controls, toolbar affordances, diagnostics, empty Codes state, focus,
and narrow reflow. Record human visual inspection in the receipt rather than
claiming it from DOM assertions alone.

- [ ] **Step 8: Commit the browser gate**

```bash
git add tests/open-ena-models-v3-browser-smoke.mjs tests/open-ena-models-v3-browser-smoke-contract.test.ts package.json
git commit -m "test: verify Models v3 in the browser"
```

### Task 6: Run accessibility, i18n, downstream, and affected browser regressions

**Files:**
- Modify: `tests/open-ena-a11y-perf-browser-smoke.mjs`
- Modify: `tests/open-ena-a11y-perf-browser-smoke-contract.test.ts`
- Test: existing affected suites

- [ ] **Step 1: Add Models v3 accessibility assertions**

Extend the existing a11y/performance smoke to navigate all four tabs by
keyboard, activate Help, inspect accessible names/pressed states/disabled
reasons, execute Exclude and Undo, verify focus return and polite live
announcements, zoom to 200 percent, and emulate reduced motion.

```js
await page.keyboard.press("ArrowRight");
await expectActiveTab(page, "Horizons");
await page.getByRole("button", { name: "About Horizons settings" }).click();
await page.keyboard.press("Escape");
await assertFocused(page, "About Horizons settings");
await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
await assertNoDocumentOverflow(page);
```

- [ ] **Step 2: Run accessibility and i18n tests**

Run:

```bash
node --import tsx --test tests/open-ena-a11y-perf-browser-smoke-contract.test.ts tests/open-ena-accessibility-regressions.test.ts tests/open-ena-model-v3-i18n.test.ts
node tests/open-ena-a11y-perf-browser-smoke.mjs
```

Expected: PASS.

- [ ] **Step 3: Run affected existing browser smokes**

Run:

```bash
npm run test:browser:open-ena-3d-controls
npm run test:browser:open-ena-ona-3d
npm run test:browser:open-ena-node-drag
npm run test:browser:longitudinal-v3
```

Expected: PASS. If an authenticated/external prerequisite is missing, record
the exact skip/failure and do not report the smoke as passed.

- [ ] **Step 4: Run focused downstream suites**

Run:

```bash
node --import tsx --test tests/open-ena-inference-v2.test.ts tests/open-ena-inference-consumers-v2.test.ts tests/open-ena-contrasts.test.ts tests/open-ena-longitudinal-v3.test.ts tests/open-ena-ai-interpretation-payload.test.ts tests/open-ena-data-view-export.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit accessibility smoke extensions**

```bash
git add tests/open-ena-a11y-perf-browser-smoke.mjs tests/open-ena-a11y-perf-browser-smoke-contract.test.ts
git commit -m "test: verify Models v3 accessibility"
```

### Task 7: Update durable documentation and the acceptance ledger

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md`
- Create: `tests/open-ena-model-v3-documentation.test.ts`

- [ ] **Step 1: Write the failing README/ledger contract**

```ts
test("durable docs state the exact Models v3 support boundary", () => {
  const readme = readFileSync("README.md", "utf8");
  const ledger = readFileSync(
    "docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md",
    "utf8",
  );
  assert.match(readme, /all six Standard Model\/Window combinations/u);
  assert.match(readme, /SVD, Means, and Reference/u);
  assert.match(readme, /TMA.*not implemented/u);
  assert.match(ledger, /Pass\s*\|\s*Fail\s*\|\s*Skip/u);
  assert.match(ledger, /Local.*GitHub.*Deployment.*Production/su);
});
```

- [ ] **Step 2: Run the documentation contract**

Run: `node --import tsx --test tests/open-ena-model-v3-documentation.test.ts`
Expected: FAIL because the ledger and README section are absent. Create
`tests/open-ena-model-v3-documentation.test.ts` with the test above before
running.

- [ ] **Step 3: Update README**

Document Units/Horizons/Codes, Binary/Frequency, all six combinations,
finite/Infinity windows, explicit row/Horizon order, SVD/Means/Reference,
Endpoint-only direct Means, Endpoint Reference trajectory projection,
Standard/ONA isolation, artifact versions, fail-closed behavior, and the exact
TMA/advanced-rotation exclusions. Do not claim support beyond pinned parity.

```markdown
### Models

Open ENA supports all six combinations of EndPoint, Separate Trajectory, and
Accumulated Trajectory with Moving Stanza or Conversation/Horizon windows.
Standard models support Binary and Frequency weighting, finite or entire-
Horizon extents, explicit row/trajectory order, and SVD, Means, or Reference
rotation. Means is fitted directly only for EndPoint; an Endpoint Reference can
project all three Standard models. TMA and advanced rotations are not
implemented in the Models tab.
```

- [ ] **Step 4: Create the acceptance ledger**

Include rows for every Plan 1–5 focused command, rENA baseline/current parity,
ONA public/private fixtures, real browser journeys, accessibility, i18n,
typecheck, build, and full verify. Columns are Command, Status, Evidence,
Skip/Failure reason, and Claim allowed. Add distinct Local files, Local commit,
GitHub branch, PR, Deployment, Production, and Authenticated production rows.

```markdown
| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| npm run verify | Pending | — | Not run | None |
| Public ONA non-regression | Pending | — | Not run | None |
| Private Yu ONA fixture | Pending | — | Fixture-dependent | None |
| Local files | Pending | — | Implementation incomplete | None |
| GitHub branch | Not performed | Remote SHA recorded separately | Not authorized | No remote-change claim |
| Deployment | Not performed | — | Not authorized | No deployment claim |
| Production | Not performed | — | Not authorized | No production claim |
```

- [ ] **Step 5: Run the documentation test**

Run: `node --import tsx --test tests/open-ena-model-v3-documentation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit durable docs**

```bash
git add README.md docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md tests/open-ena-model-v3-documentation.test.ts
git commit -m "docs: document strict Standard ENA models"
```

### Task 8: Execute the complete verification gate and finalize local evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md`

- [ ] **Step 1: Run whitespace and status checks**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors and only the acceptance-ledger evidence edit
before its final commit.

- [ ] **Step 2: Run jENA verification**

Run: `npm run jena:verify`
Expected: PASS, including baseline and current Standard parity with no core
fixture skip.

- [ ] **Step 3: Run application tests and typecheck**

Run:

```bash
npm run test:app
npm run typecheck:app
```

Expected: PASS.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build:app
```

Expected: PASS.

- [ ] **Step 5: Re-run the dedicated real-browser gate**

Run: `npm run test:browser:open-ena-models-v3`
Expected: PASS with a fresh receipt and reviewed screenshots.

- [ ] **Step 6: Run the full repository gate**

Run: `npm run verify`
Expected: PASS. Preserve the exact command output summary. Do not replace this
with focused-test evidence.

- [ ] **Step 7: Fill the ledger with exact Pass/Fail/Skip evidence**

For each command record timestamp, exit status, receipt/hash where available,
and any explicit skip. A private/external ONA fixture skip remains in Skip and
does not reduce the requirement that every public/core test pass.

- [ ] **Step 8: Commit the final local acceptance evidence**

```bash
git add docs/superpowers/specs/2026-09-02-open-ena-standard-model-parameters-acceptance-ledger.md
git commit -m "test: record Standard ENA acceptance evidence"
```

- [ ] **Step 9: Verify final local topology without pushing**

Run:

```bash
git rev-parse HEAD
git status --short --branch
git log --oneline --decorate -12
git ls-remote --heads origin codex/minor-UI-changes
```

Expected: a clean local branch with exact local HEAD and a separately reported
remote SHA. Do not push, create a PR, merge, deploy, or claim production
verification.

## Plan 5 completion checkpoint

The implementation is locally complete only if:

- required Standard baseline/current parity ran and passed;
- all public ONA non-regression tests passed;
- every private/external skip is explicit;
- dedicated real-browser and affected existing smokes passed or have separately
  reported external blockers;
- accessibility/i18n/downstream suites passed;
- `npm run verify` passed;
- the ledger distinguishes local, remote, PR, deployment, and production;
- the final worktree is clean;
- no unauthorized external mutation occurred.
