# Home Page Background Grid Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only the page-wide horizontal and vertical background grid from the ENA.HK Home page while preserving every purposeful component, chart, section, and progress-ring line.

**Architecture:** Replace the two grid-producing linear-gradient layers on the route-scoped .premium-home rule with the existing var(--page) paper color. Protect the narrow visual boundary through one focused source contract, then verify the rendered page at desktop and mobile viewports before updating PR #30 and the already-integrated local main reference.

**Tech Stack:** CSS, Next.js 16, TypeScript/Node test runner, Playwright CLI, Git worktrees, GitHub CLI.

---

## File Responsibility Map

- app/premium-public.css: owns the route-scoped .premium-home page background and purposeful Home section decorations that must remain unchanged.
- tests/premium-public-ui.test.ts: owns static public-shell visual regression contracts.
- docs/superpowers/specs/2026-09-01-home-background-grid-removal-design.md: approved scope and evidence boundary; read-only during implementation.
- docs/superpowers/plans/2026-09-01-home-background-grid-removal.md: this execution record; read-only after its plan commit.

The functional change is deliberately limited to one CSS declaration and one focused test file.

### Task 0: Verify the implementation lane and baseline

**Files:**
- Inspect only: Git, worktree, and PR metadata

- [ ] **Step 1: Confirm exact branch, worktree, PR, and concurrent-lane isolation**

Run:

~~~
pwd
git branch --show-current
git status --short --branch
git rev-parse HEAD
git worktree list --porcelain
git -C /Volumes/Starship/ENA status --short --branch
git -C /Volumes/Starship/ENA/output/worktrees/open-ena-3d-ona-20260901 status --short --branch
gh pr view 30 --json number,state,url,baseRefName,headRefName,headRefOid,statusCheckRollup
~~~

Expected:

- Worktree is /Volumes/Starship/ENA/output/worktrees/home-sentence-multi-language-20260901.
- Branch is codex/home-sentence-multi-language.
- Worktree is clean and contains the approved design and plan commits.
- PR #30 is open from this feature branch to main.
- Root and Open ENA 3D worktrees remain separate lanes; their current state is recorded and never staged, reset, merged, or cleaned by this task.

- [ ] **Step 2: Run the focused baseline test before adding the new contract**

Run:

~~~
node --import tsx --test tests/premium-public-ui.test.ts
~~~

Expected: the pre-change premium-public suite exits zero. Record its passing count so the later RED can be attributed to the new background contract.

### Task 1: Remove the Home page-wide background grid with TDD

**Files:**
- Modify: tests/premium-public-ui.test.ts
- Modify: app/premium-public.css

- [ ] **Step 1: Add a focused CSS-rule helper to the test file**

Add this helper after fontSizesForSelector in tests/premium-public-ui.test.ts:

~~~ts
function ruleBodyForSelector(css: string, selector: string) {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;

  for (const match of css.matchAll(rulePattern)) {
    const selectors = match[1].split(",").map((entry) => entry.trim());
    if (selectors.includes(selector)) return match[2];
  }

  assert.fail("Missing CSS selector: " + selector);
}
~~~

- [ ] **Step 2: Write the failing Home-background preservation contract**

Add this test after the stylesheet-isolation test:

~~~ts
test("the Home page uses a plain paper background without removing purposeful lines", () => {
  const premiumCss = source("app", "premium-public.css");
  const globalCss = source("app", "globals.css");
  const homeBackground = ruleBodyForSelector(premiumCss, ".premium-home");
  const premiumRoot = ruleBodyForSelector(premiumCss, ".premium-public-page");
  const networkFigure = ruleBodyForSelector(premiumCss, ".premium-home .network-figure");
  const openEnaFrame = ruleBodyForSelector(premiumCss, ".premium-home .open-ena-home-section::after");
  const workflowConnector = ruleBodyForSelector(premiumCss, ".premium-home .workflow-grid::before");

  assert.equal(homeBackground.replace(/\s+/gu, " ").trim(), "background: var(--page);");
  assert.doesNotMatch(homeBackground, /linear-gradient|120px/u);
  assert.match(premiumRoot, /background:\s*var\(--page\);/u);
  assert.match(networkFigure, /border:\s*1px solid #b8c7cf;/u);
  assert.match(openEnaFrame, /border:\s*1px solid rgba\(137, 207, 240, 0\.16\);/u);
  assert.match(workflowConnector, /height:\s*1px;/u);
  assert.match(workflowConnector, /background:\s*#afc1ca;/u);
  assert.match(globalCss, /data-track="page-progress-outline"/u);
  assert.match(globalCss, /data-track="page-progress-arc"/u);
});
~~~

This test distinguishes the unwanted page grid from purposeful component and section lines.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

~~~
node --import tsx --test tests/premium-public-ui.test.ts
~~~

Expected: the new test fails because the normalized .premium-home rule still contains two linear-gradient layers and 120px repeat geometry instead of the exact background: var(--page); declaration. All pre-existing premium-public tests remain green.

- [ ] **Step 4: Apply the minimal CSS implementation**

Replace only the current .premium-home rule in app/premium-public.css:

~~~css
.premium-home {
  background:
    linear-gradient(90deg, rgba(10, 23, 40, 0.035) 1px, transparent 1px) 50% 0 / 120px 100%,
    linear-gradient(rgba(10, 23, 40, 0.025) 1px, transparent 1px) 0 0 / 100% 120px,
    var(--page);
}
~~~

with exactly:

~~~css
.premium-home {
  background: var(--page);
}
~~~

Do not edit any other selector or declaration.

- [ ] **Step 5: Run focused GREEN and source-scope checks**

Run:

~~~
node --import tsx --test tests/premium-public-ui.test.ts
git diff --check
git diff -- app/premium-public.css tests/premium-public-ui.test.ts
~~~

Expected:

- The premium-public suite exits zero with the new test included.
- The stylesheet diff removes only the two grid layers.
- The test diff adds only the helper and focused contract.
- git diff --check exits zero.

- [ ] **Step 6: Commit the functional change**

Run:

~~~
git add -- app/premium-public.css tests/premium-public-ui.test.ts
git diff --cached --check
git diff --cached --name-status
git commit -m "fix: remove the Home background grid"
~~~

Expected: the commit contains exactly the stylesheet and focused test paths.

### Task 2: Run full verification and visual acceptance

**Files:**
- Verify only: complete candidate at the exact functional HEAD
- Store ignored screenshots under output/playwright/home-background-grid-20260901/

- [ ] **Step 1: Run the focused contract again from committed HEAD**

Run:

~~~
node --import tsx --test tests/premium-public-ui.test.ts
git status --short --branch
git diff --check 45316aa..HEAD
~~~

Expected: focused suite passes, worktree is clean, and the complete extension to the previously reviewed candidate has no whitespace errors.

- [ ] **Step 2: Run the complete repository verification gate**

Use task-scoped cache and temporary paths:

~~~
mkdir -p /Volumes/Starship/ENA/output/tmp/home-background-grid-verify-20260901
mkdir -p /Volumes/Starship/ENA/output/cache/home-background-grid-verify-20260901
TMPDIR=/Volumes/Starship/ENA/output/tmp/home-background-grid-verify-20260901 NPM_CONFIG_CACHE=/Volumes/Starship/ENA/output/cache/home-background-grid-verify-20260901 npm run verify
~~~

Expected: prompt verification, installed/runtime vendor checks, jENA lint/typecheck/tests/pack/build, production-receipt checks, app tests, app typecheck, and Next production build all exit zero. Afterward, git status remains clean and git diff -- next-env.d.ts is empty.

- [ ] **Step 3: Start a separate browser-verification server**

Keep the user's existing 127.0.0.1:3017 preview untouched. Start a separate server at 127.0.0.1:3018:

~~~
TMPDIR=/Volumes/Starship/ENA/output/tmp/home-background-grid-browser-20260901 NPM_CONFIG_CACHE=/Volumes/Starship/ENA/output/cache/home-background-grid-browser-20260901 npm run dev -- --hostname 127.0.0.1 --port 3018
~~~

Expected: Next reports Ready at http://127.0.0.1:3018.

- [ ] **Step 4: Verify the Home page at desktop 1440 x 900**

Confirm npx exists and use the Playwright CLI wrapper:

~~~
command -v npx
PWCLI=/Users/dongpinhu/.codex/skills/playwright/scripts/playwright_cli.sh
~~~

Open http://127.0.0.1:3018/en in a named isolated session and use a 1440 x 900 viewport. At the top, middle, and bottom record:

~~~
getComputedStyle(document.querySelector(".premium-home")).backgroundImage === "none"
getComputedStyle(document.querySelector(".premium-home")).backgroundColor === "rgb(243, 246, 245)"
document.documentElement.scrollWidth === document.documentElement.clientWidth
~~~

Visually confirm no page-wide horizontal or vertical grid remains. Also verify:

~~~
.network-figure has a visible border
.open-ena-home-section::after retains a visible border
.workflow-grid::before retains a 1px connector
the back-to-top SVG still contains page-progress-outline and page-progress-arc
~~~

Capture one top and one lower-page screenshot in the ignored output directory and inspect both.

- [ ] **Step 5: Verify mobile and non-Home route isolation**

At 390 x 844, reopen /en and record the same background image, color, and overflow assertions at the top and middle. Confirm the progress ring and content borders remain visible. Capture one mobile screenshot.

Then open /en/mission and verify that route still renders normally and has no horizontal overflow. Do not require Mission to copy Home's background value; prove only that the Home-scoped rule did not alter its page identity.

- [ ] **Step 6: Stop only the verification server and prove hygiene**

Close the Playwright verification session. Send Ctrl-C to the 3018 server and verify no listener remains:

~~~
lsof -nP -iTCP:3018 -sTCP:LISTEN
~~~

Expected: no listener on port 3018. Confirm the user's preview remains available:

~~~
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3017/en
~~~

Expected: HTTP 200 on port 3017.

### Task 3: Update PR #30 and the local main integration

**Files:**
- No source changes
- Git and GitHub state only

- [ ] **Step 1: Freeze the exact verified feature identity**

Run:

~~~
git status --short --branch
git rev-parse HEAD
git diff --check 45316aa..HEAD
git log --oneline --decorate 45316aa..HEAD
git diff --name-status 45316aa..HEAD
~~~

Expected: clean feature worktree; range contains the design, plan, stylesheet, and focused-test changes only.

- [ ] **Step 2: Re-read remote truth and existing PR state**

Run:

~~~
git ls-remote --heads origin main codex/home-sentence-multi-language
gh pr view 30 --json number,state,url,baseRefName,headRefName,headRefOid,statusCheckRollup
~~~

Expected: PR #30 remains open from codex/home-sentence-multi-language to main. Stop if remote main has drifted in a way that prevents a safe local fast-forward or if PR #30 no longer targets this branch.

- [ ] **Step 3: Push the exact verified feature branch**

Run:

~~~
git push origin codex/home-sentence-multi-language
git ls-remote --heads origin codex/home-sentence-multi-language
gh pr view 30 --json number,state,url,headRefOid,statusCheckRollup
~~~

Expected: remote feature SHA and PR headRefOid equal the local verified HEAD. PR checks may be pending immediately after the push; report their current state without claiming success early.

- [ ] **Step 4: Fast-forward the verified commit into local main without touching concurrent root work**

Create a literal-path temporary main worktree because the root checkout belongs to another active branch:

~~~
test ! -e /Volumes/Starship/ENA/output/worktrees/home-grid-main-merge-20260901
git worktree add /Volumes/Starship/ENA/output/worktrees/home-grid-main-merge-20260901 main
~~~

In that temporary worktree:

~~~
git pull --ff-only origin main
git merge codex/home-sentence-multi-language
git status --short --branch
git rev-parse HEAD
~~~

Expected: merge succeeds without conflicts and local main reaches the exact verified feature HEAD. A normal fast-forward is preferred; do not invent a merge commit.

- [ ] **Step 5: Re-test the locally merged main result**

Install the lockfile closure with task-scoped cache and run the project test suite:

~~~
mkdir -p /Volumes/Starship/ENA/output/cache/home-grid-main-merge-20260901
mkdir -p /Volumes/Starship/ENA/output/tmp/home-grid-main-merge-20260901
NPM_CONFIG_CACHE=/Volumes/Starship/ENA/output/cache/home-grid-main-merge-20260901 TMPDIR=/Volumes/Starship/ENA/output/tmp/home-grid-main-merge-20260901 npm ci --ignore-scripts
TMPDIR=/Volumes/Starship/ENA/output/tmp/home-grid-main-merge-20260901 npm test
~~~

Expected: test suite exits zero with only documented skips.

- [ ] **Step 6: Remove only the temporary merge worktree and prove final identities**

From /Volumes/Starship/ENA, after confirming the temporary worktree is clean and no process holds it:

~~~
git worktree remove /Volumes/Starship/ENA/output/worktrees/home-grid-main-merge-20260901
git worktree prune
git rev-parse main
git rev-parse codex/home-sentence-multi-language
git merge-base --is-ancestor codex/home-sentence-multi-language main
git worktree list --porcelain
~~~

Expected:

- temporary merge worktree is gone;
- local main and feature branch point to the exact verified commit;
- feature worktree remains available for PR iteration;
- root and Open ENA 3D worktrees remain untouched;
- remote main is not pushed or changed;
- PR #30 is not merged;
- no production deployment is initiated.

## Stop Conditions

Stop and report exact evidence instead of expanding scope if:

- the new focused test fails for a pre-existing reason unrelated to .premium-home;
- the CSS diff touches a selector other than .premium-home;
- the browser still shows page-wide grid lines after the rule becomes background: var(--page);
- purposeful network, workflow, section, or progress-ring lines disappear;
- horizontal overflow appears at either viewport;
- full verification fails;
- remote main, PR identity, or concurrent-worktree state drifts unexpectedly;
- the local-main merge is not a clean fast-forward-compatible integration.

Do not push remote main, merge PR #30, deploy Vercel production, delete the feature branch/worktree, or modify concurrent 3D work under this plan.
