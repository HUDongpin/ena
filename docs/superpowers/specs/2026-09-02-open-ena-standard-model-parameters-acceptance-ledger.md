# Standard ENA Models v3 acceptance ledger

This Task40 local verification snapshot records fresh complete gates on clean
candidate `f1f735601c568fba2e2ac79cb6331653a7c95a8e` (tree `1e569e2fc36de9f946d93c4e6b83c6e3d2a3e3d5`), after Task39 was accepted at
`0b6f5db825d100332597ec9c77cd2a0d6e72e565`.
Every required broad gate has an actual receipt. The final evidence edit changes
only this ledger; broad gates belong to the tested candidate, with the content
bridge and local commit recorded separately.
**Task40 independent SPEC → QUALITY and final independent whole-goal
SPEC → QUALITY of all 41 requirements remain Pending.** No writer self-acceptance
or complete-goal claim is made.

All source/test work is confined to `/Volumes/Starship/ENA/.worktrees/standard-ena-model-v3`,
branch `codex/standard-ena-model-v3`, Gitdir
`/Volumes/Starship/ENA/.git/worktrees/standard-ena-model-v3`. The sibling root
checkout is a separate user branch/server. Shared Git reads use explicit
`--git-dir`, `--work-tree`, `-c core.worktree=<literal path>`,
`-c core.fsmonitor=false` and `--no-optional-locks`.

## Reading the evidence

Terminal outcome vocabulary: **Pass | Fail | Skip**. Additional statuses below
are **Historical coverage**, **Unverified**, **Pending** and **Not performed**.
A Pass belongs only to the stated command, tested SHA/content, time and actor.
A related combined suite can establish historical coverage; it does not prove
that each proposed standalone command was separately executed. Missing raw
invocation/exit/skip information is explicitly unavailable rather than zero.
Every original Plan 1–5 focused command appears below. Repeated RED/GREEN
occurrences of the same command within one task share one row, with the actual
failure history retained in the evidence notes. Package-workspace `tests/` paths
resolve under `packages/jena-js`, not the application's test directory.

The controller's 41 requirement hashes, 101 focused-command occurrences and
197 all-command navigation entries are discovery indexes, not execution proof.
The evidence groups below were reconciled to recovered actual reviewer messages,
per-task closure reports, original command receipts and raw logs where available.
All linked `/tmp/ena-41-task-controller-20260905` and `/tmp/ena-task*` files are
**local temporary artifacts, not committed or remotely durable evidence**.
The exact factual summaries and hashes here survive their disappearance; hashes
identify bytes but cannot recover missing files. This ledger copies no private
identifiers, source rows, screenshots, credentials or export bodies.

Historical reviews for Tasks1,3–6 remain qualified: Task1's recovered SPEC is for
a predecessor; Tasks3–4 lack the separately recovered final pair; Task5 reports
controller QUALITY; Task6 has final QUALITY but not the final raw SPEC pair.
Later green suites do not retroactively create those missing review receipts.
A recovered approval is not current execution. Task40 fresh command exits and skips are recorded below; final reviewers must
still inspect the full goal.

## Per-task evidence and exact historical scope

### E0: Plan 1, Task 0 (global 0)

Tested/reviewed historical revision: `85f0d976997b76968cc51b125a4a2f5cf11ca9bc`. Recovered final review messages at 2026-09-03T00:47:09.460Z / 00:49:04.375Z; baseline 2 tests reported. Original environment command exits/counts are not separately recovered here. Task33 supplies later exact baseline/ONA receipts. Freeze, pre-cutover and Task0 closure are distinct roles.

Evidence: [recovered-early-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-early-reviews.json); SHA256 `bb9f0ed44bcd9741a2fc2d7a92a3e8be12e1a3be4c30c25a3fb50b3d86e462e3`.

### E1: Plan 1, Task 1 (global 1)

Tested/reviewed historical revision: `e9beecf30b64ec804d52cfb63e24d4363610e801`. Final QUALITY message 2026-09-03T01:22:24.557Z reports types 2 pass / 0 fail / 0 skip and app typecheck pass. Raw SPEC is for predecessor 82cb84aff4cce87…; no recovered final same-SHA SPEC pair. Controller final approval narrative is historical evidence only.

Evidence: [recovered-early-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-early-reviews.json); SHA256 `bb9f0ed44bcd9741a2fc2d7a92a3e8be12e1a3be4c30c25a3fb50b3d86e462e3`.

### E2: Plan 1, Task 2 (global 2)

Tested/reviewed historical revision: `2f7b19afc1521a40f6c76355696989114726684a`. Final SPEC 2026-09-03T02:31:15.916Z and QUALITY 02:35:05.682Z report 43/43 schema tests, zero failures/skips, app typecheck pass. Canonical-array Proxy/TOCTOU failures preceded the final correction. Exact compound shell invocation is not reconstructed from the reports.

Evidence: [recovered-early-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-early-reviews.json); SHA256 `bb9f0ed44bcd9741a2fc2d7a92a3e8be12e1a3be4c30c25a3fb50b3d86e462e3`.

### E3: Plan 1, Task 3 (global 3)

Tested/reviewed historical revision: `48090be4b58949b4d9d173ab28eddef365c06af9`. Controller message 2026-09-03T05:52:41.793Z reports 31/31 focused and typecheck, final approval. The raw final reviewer pair, raw terminal exit/skip count and separate serial/nonserial command receipts are unavailable here; do not infer them.

Evidence: [recovered-early-controller-closures.json](/tmp/ena-41-task-controller-20260905/recovered-early-controller-closures.json); SHA256 `186aeb13084ce561bfce5f325a7cdf74be6445a262dfc0b646c5fdb4a1108fae`.

### E4: Plan 1, Task 4 (global 4)

Tested/reviewed historical revision: `224c404dd797da4819169dacbbf90833e8bbb061`. Controller message 2026-09-03T07:07:30.905Z reports 40/40 focused and approximately 250 ms for 30k Horizons. Raw final reviewer pair, terminal exit/skip count and exact standalone/combined invocations unavailable; not a universal performance bound.

Evidence: [recovered-early-controller-closures.json](/tmp/ena-41-task-controller-20260905/recovered-early-controller-closures.json); SHA256 `186aeb13084ce561bfce5f325a7cdf74be6445a262dfc0b646c5fdb4a1108fae`.

### E5: Plan 1, Task 5 (global 5)

Tested/reviewed historical revision: `138d3ba6a1c5ac9720e83dd8e43515b09f2a9f5b`. Controller message 2026-09-03T08:22:04.767Z reports 95/95 focused, independent SPEC with 80 generated datasets, and controller QUALITY. This is not a fresh separate QUALITY reviewer pair. Raw command exit/skip counts unavailable; 0.315 s double-Infinity observation is bounded.

Evidence: [recovered-early-controller-closures.json](/tmp/ena-41-task-controller-20260905/recovered-early-controller-closures.json); SHA256 `186aeb13084ce561bfce5f325a7cdf74be6445a262dfc0b646c5fdb4a1108fae`.

### E6: Plan 1, Task 6 (global 6)

Tested/reviewed historical revision: `7bd0693e4abb6e6c5bc8f1ff919edbf213779160`. Final QUALITY message 2026-09-03T10:51:31.857Z independently reports all model-v3 suite and typecheck passing with zero failures/skips/cancellations/todos and numerical-floor/replication probes. Final SPEC pair remains unavailable in recovered history; controller narrative at 10:51:37.547Z is not a replacement raw review.

Evidence: [recovered-early-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-early-reviews.json); SHA256 `bb9f0ed44bcd9741a2fc2d7a92a3e8be12e1a3be4c30c25a3fb50b3d86e462e3`.

### E7: Plan 1, Task 7 (global 7)

Tested/reviewed historical revision: `78709f0a7331103ba19e7584f292d386897af91b`. Final pin-only SPEC/QUALITY at 2026-09-04T04:45:26.692Z / 04:46:06.943Z ran 84/84 vendor tests, zero skips, verifier exit 0. Resource numerical work was reviewed on earlier append candidates including ee35c4e08d21a68ebf181be67520110626a14a34; a final pin-only check is not the original resource test invocation.

Evidence: [recovered-early-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-early-reviews.json); SHA256 `bb9f0ed44bcd9741a2fc2d7a92a3e8be12e1a3be4c30c25a3fb50b3d86e462e3`.

### E8: Plan 1, Task 8 (global 8)

Tested/reviewed historical revision: `aa7cad893b6da2360d6ec08c7180271dab1240c2`. Final SPEC/QUALITY 2026-09-04T07:02:42.587Z / 07:08:34.444Z: compiler+resource 78, migration 15, all model-v3 317, app 1628, jENA 466, pack 20, vendor 84; reported exit 0, zero skips explicitly for model/app/migration. Combined and full-suite coverage must not be relabeled standalone command execution.

Evidence: [recovered-tasks8-9-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-tasks8-9-reviews.json); SHA256 `790c2656b813bc6bdad7d7509c21c20398daa73093a08c80536fd93e8e573a34`.

### E9: Plan 2, Task 1 (global 9)

Tested/reviewed historical revision: `4290916d27bc61bc8fd53d04aa6f27f3baf066e2`. QUALITY 2026-09-04T07:28:10.935Z reports exit 0: Standard adapter 18/18, all model-v3 335, app 1646, typecheck. Skip count was not explicit in this recovered summary. Dictionary/prototype boundary probes were additional checks.

Evidence: [recovered-tasks8-9-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-tasks8-9-reviews.json); SHA256 `790c2656b813bc6bdad7d7509c21c20398daa73093a08c80536fd93e8e573a34`.

### E10: Plan 2, Task 2 (global 10)

Tested/reviewed historical revision: `0997cb3f2ab4bbbfe94907eae5adb4c7b3929077`. Final QUALITY 2026-09-05T01:11:05.086Z explicitly ran execution-plan test: 83 pass / 0 fail / 0 skip; repository-wide gates were not rerun. SPEC at 01:07:13.474Z separately verified the complete internal execution boundary.

Evidence: [recovered-phase2-earlier-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-phase2-earlier-reviews.json); SHA256 `9781abf66ebe123e479dfd91c477bacb374167304b43e0d6357993ead3b0cb11`.

### E11: Plan 2, Task 3 (global 11)

Tested/reviewed historical revision: `62ab3def2f750a255c75b3e123fc9ffa0562b3bc`. Final SPEC/QUALITY 2026-09-05T01:43:59.225Z / 01:46:42.119Z: application focused 70/70 and jENA window 10/10, zero failures/skips. Earlier real trajectory-order RED had 12 failures; corrected ordering preserves whole-Horizon and within-Horizon semantics.

Evidence: [recovered-phase2-earlier-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-phase2-earlier-reviews.json); SHA256 `9781abf66ebe123e479dfd91c477bacb374167304b43e0d6357993ead3b0cb11`.

### E12: Plan 2, Task 4 (global 12)

Tested/reviewed historical revision: `df3481a12f7db7e38174bc2bb92fe28e38b435c4`. Final SPEC 2026-09-05T02:17:14.940Z reran focused 35/35, 0 fail; QUALITY passed at 02:18:42.451Z. Broader supplied logs were v3 517/app 1828/typecheck, not reviewer fresh runs. The precise separate official-mean invocation and skip count are not established by that summary.

Evidence: [recovered-phase2-earlier-reviews.json](/tmp/ena-41-task-controller-20260905/recovered-phase2-earlier-reviews.json); SHA256 `9781abf66ebe123e479dfd91c477bacb374167304b43e0d6357993ead3b0cb11`.

### E13: Plan 2, Task 5 (global 13)

Tested/reviewed historical revision: `51365bd5677fcec1cebe8328224b35a047b0bc97`. Task13 reviewed SHA is recorded by controller; this recovered collection directly proves later Task14 Reference suites, not an original Task13 standalone execution at 51365bd. Historical Task13 raw logs exist under /tmp/ena-task13-*, but an exact final command/SHA/exit binding was not recovered here. Mark that original invocation unverified; later Reference coverage is E14/E32.

Evidence: [recovered-review-evidence.json](/tmp/ena-41-task-controller-20260905/recovered-review-evidence.json); SHA256 `1bc47a1acd52dd46533cc237e910a1cff68d591c02b2fe778f120bad1bc689ce`.

### E14: Plan 2, Task 6 (global 14)

Tested/reviewed historical revision: `50a40b5428076867fbf980f2e9a7a21d05c5ceb3`. Final SPEC/QUALITY 2026-09-05T04:07:16.819Z / 04:08:41.205Z: Reference v2 + projection + execution-plan 175/175; fixed-node 9/9; runtime vendor check pass. The final append has 4 paths and 66+/6−. Full verify is mentioned as earlier root-inspected /tmp/ena-task14-closure-verify.log, not freshly rerun by reviewers; no current verify claim.

Evidence: [recovered-review-evidence.json](/tmp/ena-41-task-controller-20260905/recovered-review-evidence.json); SHA256 `1bc47a1acd52dd46533cc237e910a1cff68d591c02b2fe778f120bad1bc689ce`.

### E15: Plan 2, Task 7 (global 15)

Tested/reviewed historical revision: `870d54c87a0bf8af8b25004e692917ea9e9fab52`. Task15 required later Standard scientific closure after initial worker acceptance. Final reviewed SHA 870d54c87a0bf8af8b25004e692917ea9e9fab52 is distinct from initial worker candidate and intermediate d1656a6. This retained SPEC report and companion standard-closure-quality-review.md cover that repair. Exact original two-file and functional invocations remain historical, not current final-gate evidence.

Evidence: [standard-closure-spec-review.md](/tmp/ena-41-task-controller-20260905/standard-closure-spec-review.md); SHA256 `6697d531318e75d0926cc887bac58dc32212b546a063c39344495c7801be59f7`.

### E16: Plan 2, Task 8 (global 16)

Tested/reviewed historical revision: `3334e46fb00b253db43f36419912b1ff1c39b2ab`. Final QUALITY 2026-09-05T09:14:21.584Z: 302/302 across adapter/worker/plan/binding/compiler + four public ONA suites, 180 seeded complete-run probes, 60 production-worker probes and nonincremental typecheck. Reviewer did not repeat full Next; first nonexistent tsconfig error is preserved. Full package/app original invocation not inferred from focused approval.

Evidence: [recovered-review-evidence.json](/tmp/ena-41-task-controller-20260905/recovered-review-evidence.json); SHA256 `1bc47a1acd52dd46533cc237e910a1cff68d591c02b2fe778f120bad1bc689ce`.

### E17: Plan 3, Task 1 (global 17)

Tested/reviewed historical revision: `10aa2be40da2791c14aac2fa1b2e776f3d43d899`. Final focused 291/291, typecheck pass; final serial app 2238/2238 exit 0. Initial concurrent full app 2237/2238 failed unchanged Worker duplicate-request fixed-50-ms assertion; isolated then serial retry passed with unchanged source. Load sensitivity is a hypothesis, not a proven fixed defect. Earlier Next build is predecessor-only.

Evidence: [task17-implementation.md](/tmp/ena-41-task-controller-20260905/task17-implementation.md); SHA256 `8a25dddad4a1592b9b01ce0c2b9c63c0ed574a9d983942c1469c7b937355a01a`.
Inspected raw output: [ena-task17-quality-repair-focused.log](/tmp/ena-task17-quality-repair-focused.log); SHA256 `463b4a638b8cffc77c1ad06691f42a3ac109cbcb88ba0b49ffe903d8dcd0aaf2`. Terminal summary: ℹ tests 291; ℹ pass 291; ℹ fail 0; ℹ skipped 0.

### E18: Plan 3, Task 2 (global 18)

Tested/reviewed historical revision: `4d51f0bbb35f4c066a155c9452421ec55d5e8dff`. Final append 4d51f0b: whole app 2248/2248; independent final focused raw logs 241/241 with 0 skips. Initial worker-graph failure was repaired; 3368-page builds belong earlier 0e17e23/3ad2de7 snapshots, not automatically final 4d51f0b. Original 58-test export/Reference result is earlier coverage.

Evidence: [task18-implementation.md](/tmp/ena-41-task-controller-20260905/task18-implementation.md); SHA256 `7db7bb2389bd0d09a1dd64aa9e1392c384b7582b333711073a17967152f817ca`.
Inspected raw output: [task18-quality-focused.log](/tmp/ena-41-task-controller-20260905/task18-quality-focused.log); SHA256 `f8879ae1710584cbebeb23be66111a8013c3918f05169ed56cc10bd4d2499981`. Terminal summary: ℹ tests 241; ℹ pass 241; ℹ fail 0; ℹ skipped 0.

### E19: Plan 3, Task 3 (global 19)

Tested/reviewed historical revision: `4efdeb9a0a67dc7dd5d1f49c964e55a6b3604598`. Final component-admission repair: focused 559/559, app 2345/2345, typecheck exit 0, zero skips. Original import+migration 34 and ONA 18, app 2267/build 3368 belong 190e9fa predecessor. Intermediate 532/2318 is also superseded. Separate SPEC/QUALITY rejected resource claims before final correction.

Evidence: [task19-implementation.md](/tmp/ena-41-task-controller-20260905/task19-implementation.md); SHA256 `9f50de7d0d2c5e1e1d8587e7ee43c66b82a9a8a9034a98cfae0e671014d1a93a`.
Inspected raw output: [task19-components-focused-final.log](/tmp/ena-41-task-controller-20260905/task19-components-focused-final.log); SHA256 `cc21912ec58f1a9ee87426b4990651fca0179f89b790476713d57bd711dd170b`. Terminal summary: ℹ tests 559; ℹ pass 559; ℹ fail 0; ℹ skipped 0.

### E20: Plan 3, Task 4 (global 20)

Tested/reviewed historical revision: `aec994cefaccec3276af1ae6a41915a1fd241248`. Writer Methods+legacy/pairwise 24/24, affected 318/318, serial app 2354/2354, typecheck and build 3368 passed. Exact command recorded in report; per-command start/end times and explicit skip count are not supplied there. No current build attribution.

Evidence: [task20-implementation.md](/tmp/ena-41-task-controller-20260905/task20-implementation.md); SHA256 `089aaf151346763ce34dbff852046a13db95ecd166a07594444c982125e070e5`.

### E21: Plan 3, Task 5 (global 21)

Tested/reviewed historical revision: `c48efab28ac5e1dc5a91cd27291d895ae614b1bd`. Final R1 focused 136/136, related 159/159, serial app 2389/2389, typecheck all exit 0 / zero skips. SPEC 143+probes and QUALITY 146+probes are separate runs. Build 3368 belongs d38eb0a558e3bd2310f68cf3c72fc308291cfa9c only.

Evidence: [task21-implementation.md](/tmp/ena-41-task-controller-20260905/task21-implementation.md); SHA256 `895d87fad36bdcef646b10ba401906ee55d4b5993e079dc8da7c8875bc53cb49`.
Inspected raw output: [task21-r1-focused.log](/tmp/ena-41-task-controller-20260905/task21-r1-focused.log); SHA256 `e0bd6ae03579184778646d00b75a9be8b7e4fdd43bc8644e347a23d350f63ac9`. Terminal summary: ℹ tests 136; ℹ pass 136; ℹ fail 0; ℹ skipped 0.

### E22: Plan 3, Task 6 (global 22)

Tested/reviewed historical revision: `05537cb82164734a1c9953c907cd286d451970a6`. Final focused 169/169, app 2405/2405, typecheck all exit 0 / zero skips; SPEC 169+8 probes and QUALITY 177+2 probes separate. Corrected 257-field typed Horizon control admission. No final Next run; do not relabel earlier build.

Evidence: [task22-implementation.md](/tmp/ena-41-task-controller-20260905/task22-implementation.md); SHA256 `9cbc34794a4b3cb521686d87139f9626306585cacaef98e84bf0d8bb4a085811`.
Inspected raw output: [task22-r1-focused-final.log](/tmp/ena-41-task-controller-20260905/task22-r1-focused-final.log); SHA256 `e5b0e81bf72994ee26ec540514c327e7e2de8cb169c74e4e16c3b075512e6291`. Terminal summary: ℹ tests 169; ℹ pass 169; ℹ fail 0; ℹ skipped 0.

### E23: Plan 3, Task 7 (global 23)

Tested/reviewed historical revision: `924a2f6e98d2cf1b77f88f990456a2a3a1bd59d5`. Final descriptor-admission repair: focused 265/265, app 2427/2427 and nonincremental typecheck exit 0 / zero skips. Earlier 146/51/159/2426 runs are predecessor evidence. An earlier command guessed three absent filenames; runner executed only 51 discovered tests. Corrected actual integrity 159 gate retained; never count absent files as covered.

Evidence: [task23-implementation.md](/tmp/ena-41-task-controller-20260905/task23-implementation.md); SHA256 `76e3149c36263be4ed3cf5459c1b6a9d5ff03034ba3ffa3310f5f38620373329`.
Inspected raw output: [task23-r1-focused-final.log](/tmp/ena-41-task-controller-20260905/task23-r1-focused-final.log); SHA256 `d33034b09ba3ba614eef8538b630412e29e28ee5393104221a3293eb8d347bb0`. Terminal summary: ℹ tests 265; ℹ pass 265; ℹ fail 0; ℹ skipped 0.

### E24: Plan 4, Task 1 (global 24)

Tested/reviewed historical revision: `425372bad61e8c046ad9c90371e9e7b547095412`. Final exact state command 28/28, 0 fail/skip/cancel/todo, exit 0; nonincremental typecheck exit 0. Actual old/new compile-generation probe rejects both stale replacements. Reducer scope does not establish Workspace/browser integration.

Evidence: [task24-implementation.md](/tmp/ena-41-task-controller-20260905/task24-implementation.md); SHA256 `d98bd946e62330f7d1597223d37bc463ed7b0a3cf9bdb3deb26da65d6c7568cf`.
Inspected raw output: [task24-focused-final.log](/tmp/ena-41-task-controller-20260905/task24-focused-final.log); SHA256 `9b8828e4edb0ed28a4a2516dd7274eb0606b7d296cd3e7651dcdcfb010c70dac`. Terminal summary: ℹ tests 28; ℹ pass 28; ℹ fail 0; ℹ skipped 0.

### E25: Plan 4, Task 2 (global 25)

Tested/reviewed historical revision: `b72f6012d0bf35c3252944eae3ba45966fc614ef`. Same final SPEC/QUALITY: 9 focused, actual component browser, typecheck and focus lifecycle probes passed. Writer 2465 app and reviewer 244 related are predecessor 56d75d7 only. Initial two SPEC and one QUALITY P2 failures preserved; no final full app/Next/served claim.

Evidence: [task25-root-closure.md](/tmp/ena-41-task-controller-20260905/task25-root-closure.md); SHA256 `9d0c9e18b2673bf73c104710662fb8f972755830d2e0770818cd72ef4c2aafaa`.
Inspected raw output: [task25-quality-r2-focused.log](/tmp/ena-41-task-controller-20260905/task25-quality-r2-focused.log); SHA256 `1c856f9f718ba17ffbf983356c9bbb2cc973181575ee2618c9acb6a1a0465f6c`. Terminal summary: ℹ tests 9; ℹ pass 9; ℹ fail 0; ℹ skipped 0.

### E26: Plan 4, Task 3 (global 26)

Tested/reviewed historical revision: `1b308682016a5535759743714a40d5bb5b1350de`. Final 69 affected, actual compiler/React Units browser and nonincremental typecheck passed. QUALITY initial wrong filename ran 66; corrected seven-file command ran 69. Original missing-reason probe still exits 1 on unrelated empty-diagnostics expectation; separately named adapted probe passed. Not all prior commands passed.

Evidence: [task26-root-closure.md](/tmp/ena-41-task-controller-20260905/task26-root-closure.md); SHA256 `5a94fb04baf1b7d0b9eab575fe32aa466df427579a82a425178a62556a8e8bf9`.
Inspected raw output: [task26-quality-focused-r2.log](/tmp/ena-41-task-controller-20260905/task26-quality-focused-r2.log); SHA256 `3628d3fa0955278eddd9a56ba2960ffa2271da8da96cfb5485ce1d8f965880d1`. Terminal summary: ℹ tests 69; ℹ pass 69; ℹ fail 0; ℹ skipped 0.

### E27: Plan 4, Task 4 (global 27)

Tested/reviewed historical revision: `c00a79df8c99cae36dec5ac5aa8d02a11aec3eb7`. Writer/QUALITY 258, SPEC separately 250+8 exact named files, real browser/typecheck and resolver/editor/modal probes passed. Original readonly-status/locator/context/idle-epoch test harness errors preserved. No served Workspace or full locale claim.

Evidence: [task27-root-closure.md](/tmp/ena-41-task-controller-20260905/task27-root-closure.md); SHA256 `3d8338f8b6998530b84cb4ef77534b7f648c5d80fa09160cc6e33d062a38a120`.
Inspected raw output: [task27-quality-focused.log](/tmp/ena-41-task-controller-20260905/task27-quality-focused.log); SHA256 `f70ceb6e2613ad1bc6cb21d10fe935c93c7d49b12b82ac3637d7e0c18e710f0c`. Terminal summary: ℹ tests 258; ℹ pass 258; ℹ fail 0; ℹ skipped 0.

### E28: Plan 4, Task 5 (global 28)

Tested/reviewed historical revision: `19428e4388fe51c52a67f50f3bdc6c67dbb0362d`. Original combined suites 95 plus affected 107; each reviewer 202, browser/typecheck pass. Four plain extent/weighting IDs do not themselves programmatically focus; actual compiler does not emit those paths. Original loading/locator failures preserved. No full app/Next claim.

Evidence: [task28-root-closure.md](/tmp/ena-41-task-controller-20260905/task28-root-closure.md); SHA256 `7c529674ca5f19b323e51b7c8880842b8a376bbf9d612d10f838f5448c00c87c`.
Inspected raw output: [task28-postcommit-original.log](/tmp/ena-41-task-controller-20260905/task28-postcommit-original.log); SHA256 `589ceea844916ac41062cec49e259f5306a4671a14ae44d19e19dbd9779e336d`. Terminal summary: ℹ tests 95; ℹ pass 95; ℹ fail 0; ℹ skipped 0.

### E29: Plan 4, Task 6 (global 29)

Tested/reviewed historical revision: `fe7e13a9d050b2d94dfe77902f91fd1de6353a0a`. Final writer/SPEC/QUALITY affected 277, actual browser/typecheck and bounded 20k-row probes passed. Earlier 275/276 and initial 19/20 belong prior candidates. An oversized 150k probe failed outside the admitted CSV/XLSX boundary; it is not a supported-input regression.

Evidence: [task29-root-closure.md](/tmp/ena-41-task-controller-20260905/task29-root-closure.md); SHA256 `fb54934a0b16889026419917b4a886feb424344e2e4d3796489358ca3af9519b`.
Inspected raw output: [task29-quality-focused.log](/tmp/ena-41-task-controller-20260905/task29-quality-focused.log); SHA256 `0d9dbfd181c2fa056970cd264c9479e0f00b0627e0c4a746de2e7718bc23fa00`. Terminal summary: ℹ tests 277; ℹ pass 277; ℹ fail 0; ℹ skipped 0.

### E30: Plan 4, Task 7 (global 30)

Tested/reviewed historical revision: `40b31b337e41f73bedec6df9ff89595c8e703517`. 11 new +142 affected =153 unique; both reviewers 153, typecheck and pointer/visibility probes pass. 3D component browser uses a deterministic Plotly API adapter, not real served WebGL. Original selector/readiness/probe assertion errors remain; Task37/38 supply actual library evidence.

Evidence: [task30-root-closure.md](/tmp/ena-41-task-controller-20260905/task30-root-closure.md); SHA256 `004bcc6a9200c1d61b885b35e9c6b2857755be78dd0e620849723dbba4fefdbc`.
Inspected raw output: [task30-visibility-final-r3.log](/tmp/ena-41-task-controller-20260905/task30-visibility-final-r3.log); SHA256 `887f5fe681ce770946b43a47674ed83be24969413bf0f0a7b7aab6abb24861fe`. Terminal summary: ℹ tests 11; ℹ pass 11; ℹ fail 0; ℹ skipped 0.

### E31: Plan 4, Task 8 (global 31)

Tested/reviewed historical revision: `0607fefba66dfe5caabe19f77cf93df0a753948b`. Closed 2026-09-06T09:17:32.421725+00:00. Writer final2: 60 focused, 5 browsers, app 2544 /171 actual files /0skip, nonincremental typecheck, build3368. Replacement independent SPEC 862/5 browsers; original QUALITY 649/4 browsers. Earlier 2535/2540 remain predecessor results. Actual routed worker evidence is not Task37 served acceptance.

Evidence: [task31-closure.md](/tmp/ena-41-task-controller-20260905/task31-closure.md); SHA256 `ff3ddf03e4df8d28dd17c888b8d7c3962403e10163476a3fd166228274cbddf2`.
Inspected raw output: [task31-q1-final2-focused.log](/tmp/ena-41-task-controller-20260905/task31-q1-final2-focused.log); SHA256 `e223415e92014782e358e6c1bb984ca9cb4db91141b9dd9a2aba7ffaf5430b5e`. Terminal summary: ℹ tests 60; ℹ pass 60; ℹ fail 0; ℹ skipped 0.

### E32: Plan 4, Task 9 (global 32)

Tested/reviewed historical revision: `cae13c8418eb22f4dc7ddcb75849b6f18868804a`. Final Q3: 1036 Models,19 accessibility/source,443 affected,2563 whole app /172 files /0skip,13 local browsers, typecheck, offline prompt verifier, build3368. Same SPEC/QUALITY, no source changes after frozen manifest. Actual English/Traditional/Simplified Chinese routed Workspace coverage at this earlier SHA, not current Task38 served three-language proof.

Evidence: [task32-closure.md](/tmp/ena-41-task-controller-20260905/task32-closure.md); SHA256 `7ffd6ddde897b3de7d73d69154da60b64d8a079a6c7785675cc4970f8b25c953`.
Inspected raw output: [task32-q3-final1-models.log](/tmp/ena-41-task-controller-20260905/task32-q3-final1-models.log); SHA256 `a4caa34e845e04c0bda5c1288dc4c07f5804ee2b3c9b5881a119dc4e12edf979`. Terminal summary: ℹ tests 1036; ℹ pass 1036; ℹ fail 0; ℹ skipped 0.

### E33: Plan 5, Task 1 (global 33)

Tested/reviewed historical revision: `cae13c8418eb22f4dc7ddcb75849b6f18868804a`. Verification only at unchanged cae13c8: writer and each reviewer 2 baseline +43 ONA adapter +55 public ONA =100 tests, exit0/zero skips. Frozen physical/index/HEAD/original-freeze/pre-cutover objects match; no regenerated fixture or empty commit.

Evidence: [task33-closure.md](/tmp/ena-41-task-controller-20260905/task33-closure.md); SHA256 `c8bdfe1952462036138fce04393ede1bdfa3105f8af2a5cf69c5aaf3d59e1c75`.
Inspected raw output: [task33-baseline-test.stdout](/tmp/ena-41-task-controller-20260905/task33-baseline-test.stdout); SHA256 `1c5eb27b0a3e931acfc7330fa3eed8b2e02c42eea5531a8984197af7ee5dd8d8`. Terminal summary: ℹ tests 2; ℹ pass 2; ℹ fail 0; ℹ skipped 0.

### E34: Plan 5, Task 2 (global 34)

Tested/reviewed historical revision: `73a2c2902b38ec0c79181c6b64e5d7b2ad39fa83`. Same-SHA independent reviews: 14 actual official R cases repeat exactly; writer manifest17/package588/typecheck/lint pass. Separate direct-R review and independent arithmetic audit max residual1.7084e-15. Dependency/linker/orientation failures retained. Current R oracle generation accepted here; jENA current parity belongs Task35.

Evidence: [task34-closure.md](/tmp/ena-41-task-controller-20260905/task34-closure.md); SHA256 `0f845e7eef785d76629ff73f428d4120f52f731e20eb761b0398b16747516534`.

### E35: Plan 5, Task 3 (global 35)

Tested/reviewed historical revision: `885287181e4564c8615297b8667dd26bdd286d70`. Final accepted R2: baseline35/current98/pack20 exit0, zero skips; writer package686/app2564/lint/both typechecks. SPEC/QUALITY separately reran pinned geometry; analytical maximum error5.329070518200751e-15. Source digest a6d0a60fdd250043d29cb976f915822710cfe14aa1d8bf320f078cc1bf4b3f35. Earlier identity/prefix comparator false-acceptance REDs preserved. QUALITY npm11.16.0 versus writer/SPEC11.12.1 disclosed.

Evidence: [task35-closure.md](/tmp/ena-41-task-controller-20260905/task35-closure.md); SHA256 `ac42367dc59013c35e9c0bb3ce973d765260cdad6f00a3370842808a04aa45eb`.
Inspected raw output: [task35-r2-final-current.log](/tmp/ena-41-task-controller-20260905/task35-r2-final-current.log); SHA256 `121df265c656edb3757f723f1f2f3b1cb85038acaa116a031267929c31d77c90`. Terminal summary: See the stated suite summary; no separate count inferred.

### E36: Plan 5, Task 4 (global 36)

Tested/reviewed historical revision: `dd975b4f0471e1967da8db9463ee9eb239024d3a`. Writer and each reviewer: new9 already included in all18 ONA app181 =179 public +2 actual private, required ordered138, direct tma5; all exit0/zero skips. Writer build/typecheck historical inspected evidence. Signed zero strict direct runtime equality versus canonical JSON −0→0 is explicit; no tolerance change or private content copy.

Evidence: [task36-closure.md](/tmp/ena-41-task-controller-20260905/task36-closure.md); SHA256 `8e57980d29f9b14577ec0b6e19d7f2dc677f854aeb628cd58e0715699f3aa382`.
Inspected raw output: [task36-final-ona-app.log](/tmp/ena-41-task-controller-20260905/task36-final-ona-app.log); SHA256 `dccc870fa834e2e21fb49f425274eb44313055ae3e564d771cf8f25830da6cd0`. Terminal summary: ℹ tests 181; ℹ pass 181; ℹ fail 0; ℹ skipped 0.

### E37: Plan 5, Task 5 (global 37)

Tested/reviewed historical revision: `831b39c0bb3bceb18ad5483b724f850599bde9b6`. Final Q1 same-SHA reviews:155 focused incl8 lifecycle faults; full npm browser including npm build,15 real served journeys,172 control checks,153 responses/8 paths,14 public images actually viewed by each reviewer,0 errors/failed requests/classified cancellations/cleanup errors. Build3368 is local. SIGTERM/SIGINT/deadline and resistant descendant failures preserve receipts. Q1 fixed orphan/no-receipt defect.

Evidence: [task37-closure.md](/tmp/ena-41-task-controller-20260905/task37-closure.md); SHA256 `169f36fcc1a4324d29c56b42aa83d5b1ae8131ca27db4d6685f19c8809027d00`.

### E38: Plan 5, Task 6 (global 38)

Tested/reviewed historical revision: `7baab3ac5e7886465cea33a72e941261fe44d796`. Accepted 2026-09-07T13:02:34.683251+00:00. Writer and each reviewer all9 entries exit0:35 a11y/i18n,126 downstream,214 affected,zero skips plus5 original browsers and nonincremental tsc. Each sequence655 actual served responses/0 errors; writer39 public images viewed,SPEC7,QUALITY7. All50 changed paths reviewed; exact same candidate. See E38 current receipt table and limitations below.

Evidence: [task38-closure.md](/tmp/ena-41-task-controller-20260905/task38-closure.md); SHA256 `5d293fa70dc46f355b6b6fd3bd86282d293ce6e592d0ad51168ca22be4a39bb9`.

## Original focused-command register

Status in this register concerns the original task invocation. It never means
that Task39 reran the command on its documentation candidate. E-groups above
contain exact historical SHA, counts, raw/report hashes and limitations.

### Plan 1

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Task0: `node --version` | Historical coverage | [E0](#e0-plan-1-task-0-global-0) | Recovered report; invocation/count limits: E0 | Only stated historical scope; no current-candidate pass |
| Task0: `npm --version` | Historical coverage | [E0](#e0-plan-1-task-0-global-0) | Recovered report; invocation/count limits: E0 | Only stated historical scope; no current-candidate pass |
| Task0: `Rscript --vanilla -e 'cat(R.version.string, "\n"); cat(as.character(utils::packageVersion("rENA")), "\n")'` | Historical coverage | [E0](#e0-plan-1-task-0-global-0) | Recovered report; invocation/count limits: E0 | Only stated historical scope; no current-candidate pass |
| Task0: `node --import tsx --test tests/open-ena-model-v3-baseline.test.ts` | Historical coverage | [E0](#e0-plan-1-task-0-global-0) | Recovered report; invocation/count limits: E0 | Only stated historical scope; no current-candidate pass |
| Task0: `node --import tsx --test tests/open-ena-ona-analysis-plan.test.ts tests/open-ena-ona-worker.test.ts tests/open-ena-ona-bundle.test.ts tests/open-ena-ona-descriptive.test.ts tests/open-ena-ona-3d.test.ts` | Historical coverage | [E0](#e0-plan-1-task-0-global-0) | Recovered report; invocation/count limits: E0 | Only stated historical scope; no current-candidate pass |
| Task1: `node --import tsx --test tests/open-ena-model-v3-types.test.ts` | Historical coverage | [E1](#e1-plan-1-task-1-global-1) | Recovered report; invocation/count limits: E1 | Only stated historical scope; no current-candidate pass |
| Task2: `node --import tsx --test tests/open-ena-model-v3-schema.test.ts` | Historical coverage | [E2](#e2-plan-1-task-2-global-2) | Recovered report; invocation/count limits: E2 | Only stated historical scope; no current-candidate pass |
| Task2: `node --import tsx --test tests/open-ena-model-v3-schema.test.ts && npm run typecheck:app` | Historical coverage | [E2](#e2-plan-1-task-2-global-2) | Recovered report; invocation/count limits: E2 | Only stated historical scope; no current-candidate pass |
| Task3: `node --import tsx --test --test-concurrency=1 tests/open-ena-model-v3-identity.test.ts` | Unverified | [E3](#e3-plan-1-task-3-global-3) | Exact original invocation/raw final receipt not recovered; historical evidence retained | Historical report only; no standalone Pass or zero-Skip claim |
| Task3: `node --import tsx --test tests/open-ena-model-v3-identity.test.ts` | Unverified | [E3](#e3-plan-1-task-3-global-3) | Exact original invocation/raw final receipt not recovered; historical evidence retained | Historical report only; no standalone Pass or zero-Skip claim |
| Task4: `node --import tsx --test tests/open-ena-model-v3-ordering.test.ts` | Unverified | [E4](#e4-plan-1-task-4-global-4) | Exact original invocation/raw final receipt not recovered; historical evidence retained | Historical report only; no standalone Pass or zero-Skip claim |
| Task4: `node --import tsx --test tests/open-ena-model-v3-ordering.test.ts tests/open-ena-model-v3-types.test.ts` | Unverified | [E4](#e4-plan-1-task-4-global-4) | Exact original invocation/raw final receipt not recovered; historical evidence retained | Historical report only; no standalone Pass or zero-Skip claim |
| Task5: `node --import tsx --test tests/open-ena-model-v3-diagnostics.test.ts` | Unverified | [E5](#e5-plan-1-task-5-global-5) | Exact original invocation/raw final receipt not recovered; historical evidence retained | Historical report only; no standalone Pass or zero-Skip claim |
| Task6: `node --import tsx --test tests/open-ena-model-v3-relations.test.ts` | Historical coverage | [E6](#e6-plan-1-task-6-global-6) | Recovered report; invocation/count limits: E6 | Only stated historical scope; no current-candidate pass |
| Task6: `node --import tsx --test --test-concurrency=1 tests/open-ena-model-v3-diagnostics.test.ts tests/open-ena-model-v3-relations.test.ts` | Historical coverage | [E6](#e6-plan-1-task-6-global-6) | Recovered report; invocation/count limits: E6 | Only stated historical scope; no current-candidate pass |
| Task7: `node --import tsx --test tests/open-ena-model-v3-resource-budget.test.ts` | Unverified | [E7](#e7-plan-1-task-7-global-7) | Exact original invocation/raw final receipt not recovered; historical evidence retained | Historical report only; no standalone Pass or zero-Skip claim |
| Task8: `node --import tsx --test tests/open-ena-model-v3-*.test.ts` | Historical coverage | [E8](#e8-plan-1-task-8-global-8) | Recovered report; invocation/count limits: E8 | Only stated historical scope; no current-candidate pass |
| Task8: `npm run typecheck:app` | Historical coverage | [E8](#e8-plan-1-task-8-global-8) | Recovered report; invocation/count limits: E8 | Only stated historical scope; no current-candidate pass |
| Task8: `npm run test:app` | Historical coverage | [E8](#e8-plan-1-task-8-global-8) | Recovered report; invocation/count limits: E8 | Only stated historical scope; no current-candidate pass |
| Task8: `node --import tsx --test tests/open-ena-model-v3-compiler.test.ts tests/open-ena-model-v3-migration.test.ts` | Historical coverage | [E8](#e8-plan-1-task-8-global-8) | Recovered report; invocation/count limits: E8 | Only stated historical scope; no current-candidate pass |

### Plan 2

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Task9: `node --import tsx --test tests/open-ena-model-v3-standard-adapter.test.ts` | Historical coverage | [E9](#e9-plan-2-task-1-global-9) | Recovered report; invocation/count limits: E9 | Only stated historical scope; no current-candidate pass |
| Task10: `node --import tsx --test tests/open-ena-model-v3-execution-plan.test.ts` | Historical coverage | [E10](#e10-plan-2-task-2-global-10) | Recovered report; invocation/count limits: E10 | Only stated historical scope; no current-candidate pass |
| Task10: `node --import tsx --test tests/open-ena-model-v3-execution-plan.test.ts tests/open-ena-model-v3-compiler.test.ts` | Historical coverage | [E10](#e10-plan-2-task-2-global-10) | Recovered report; invocation/count limits: E10 | Only stated historical scope; no current-candidate pass |
| Task11: `npm test --workspace=jena-js -- tests/standard-window-v3.test.ts` | Historical coverage | [E11](#e11-plan-2-task-3-global-11) | Recovered report; invocation/count limits: E11 | Only stated historical scope; no current-candidate pass |
| Task11: `node --import tsx --test tests/open-ena-model-v3-six-combinations.test.ts` | Historical coverage | [E11](#e11-plan-2-task-3-global-11) | Recovered report; invocation/count limits: E11 | Only stated historical scope; no current-candidate pass |
| Task12: `node --import tsx --test tests/open-ena-model-v3-rotations.test.ts` | Historical coverage | [E12](#e12-plan-2-task-4-global-12) | Recovered report; invocation/count limits: E12 | Only stated historical scope; no current-candidate pass |
| Task12: `node --import tsx --test tests/open-ena-official-mean-rotation-contract.test.ts` | Historical coverage | [E12](#e12-plan-2-task-4-global-12) | Recovered report; invocation/count limits: E12 | Only stated historical scope; no current-candidate pass |
| Task13: `node --import tsx --test tests/open-ena-reference-v2.test.ts` | Unverified | [E13](#e13-plan-2-task-5-global-13) | Exact original invocation/raw final receipt not recovered; historical evidence retained | Historical report only; no standalone Pass or zero-Skip claim |
| Task14: `node --import tsx --test tests/open-ena-reference-v2-projection.test.ts` | Historical coverage | [E14](#e14-plan-2-task-6-global-14) | Recovered report; invocation/count limits: E14 | Only stated historical scope; no current-candidate pass |
| Task14: `node --import tsx --test tests/open-ena-reference-v2*.test.ts` | Historical coverage | [E14](#e14-plan-2-task-6-global-14) | Recovered report; invocation/count limits: E14 | Only stated historical scope; no current-candidate pass |
| Task15: `node --import tsx --test tests/open-ena-model-v3-worker.test.ts tests/open-ena-model-v3-result-binding.test.ts` | Historical coverage | [E15](#e15-plan-2-task-7-global-15) | Recovered report; invocation/count limits: E15 | Only stated historical scope; no current-candidate pass |
| Task15: `node --import tsx --test tests/open-ena-functional.test.ts` | Historical coverage | [E15](#e15-plan-2-task-7-global-15) | Recovered report; invocation/count limits: E15 | Only stated historical scope; no current-candidate pass |
| Task16: `node --import tsx --test tests/open-ena-ona-analysis-plan.test.ts tests/open-ena-ona-worker.test.ts tests/open-ena-ona-bundle.test.ts tests/open-ena-ona-descriptive.test.ts` | Historical coverage | [E16](#e16-plan-2-task-8-global-16) | Recovered report; invocation/count limits: E16 | Only stated historical scope; no current-candidate pass |
| Task16: `node --import tsx --test tests/open-ena-ona-v3-adapter.test.ts` | Historical coverage | [E16](#e16-plan-2-task-8-global-16) | Recovered report; invocation/count limits: E16 | Only stated historical scope; no current-candidate pass |
| Task16: `npm test --workspace=jena-js` | Historical coverage | [E16](#e16-plan-2-task-8-global-16) | Recovered report; invocation/count limits: E16 | Only stated historical scope; no current-candidate pass |
| Task16: `npm run typecheck:app` | Historical coverage | [E16](#e16-plan-2-task-8-global-16) | Recovered report; invocation/count limits: E16 | Only stated historical scope; no current-candidate pass |
| Task16: `npm run test:app` | Historical coverage | [E16](#e16-plan-2-task-8-global-16) | Recovered report; invocation/count limits: E16 | Only stated historical scope; no current-candidate pass |

### Plan 3

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Task17: `node --import tsx --test tests/open-ena-analysis-bundle-v3.test.ts` | Historical coverage | [E17](#e17-plan-3-task-1-global-17) | Exact invocation/count limits: E17 | Only stated historical scope; no current-candidate pass |
| Task17: `node --import tsx --test tests/open-ena-ona-bundle.test.ts tests/open-ena-pairwise-export-methods.test.ts` | Historical coverage | [E17](#e17-plan-3-task-1-global-17) | Exact invocation/count limits: E17 | Only stated historical scope; no current-candidate pass |
| Task18: `node --import tsx --test tests/open-ena-model-v3-export-policy.test.ts` | Historical coverage | [E18](#e18-plan-3-task-2-global-18) | Exact invocation/count limits: E18 | Only stated historical scope; no current-candidate pass |
| Task18: `node --import tsx --test tests/open-ena-model-v3-export-policy.test.ts tests/open-ena-reference-v2.test.ts` | Historical coverage | [E18](#e18-plan-3-task-2-global-18) | Exact invocation/count limits: E18 | Only stated historical scope; no current-candidate pass |
| Task19: `node --import tsx --test tests/open-ena-model-v3-import.test.ts tests/open-ena-model-v3-migration.test.ts` | Historical coverage | [E19](#e19-plan-3-task-3-global-19) | Exact invocation/count limits: E19 | Only stated historical scope; no current-candidate pass |
| Task19: `node --import tsx --test tests/open-ena-ona-bundle.test.ts` | Historical coverage | [E19](#e19-plan-3-task-3-global-19) | Exact invocation/count limits: E19 | Only stated historical scope; no current-candidate pass |
| Task19: `node --import tsx --test tests/open-ena-model-v3-import.test.ts` | Historical coverage | [E19](#e19-plan-3-task-3-global-19) | Exact invocation/count limits: E19 | Only stated historical scope; no current-candidate pass |
| Task20: `node --import tsx --test tests/open-ena-methods-v3.test.ts` | Historical coverage | [E20](#e20-plan-3-task-4-global-20) | Exact invocation/count limits: E20 | Only stated historical scope; no current-candidate pass |
| Task20: `node --import tsx --test tests/open-ena-methods-v3.test.ts tests/open-ena-methods.test.ts tests/open-ena-pairwise-export-methods.test.ts` | Historical coverage | [E20](#e20-plan-3-task-4-global-20) | Exact invocation/count limits: E20 | Only stated historical scope; no current-candidate pass |
| Task21: `node --import tsx --test tests/open-ena-model-v3-inference-consumers.test.ts` | Historical coverage | [E21](#e21-plan-3-task-5-global-21) | Exact invocation/count limits: E21 | Only stated historical scope; no current-candidate pass |
| Task21: `node --import tsx --test tests/open-ena-inference-v2.test.ts tests/open-ena-inference-consumers-v2.test.ts tests/open-ena-contrasts.test.ts` | Historical coverage | [E21](#e21-plan-3-task-5-global-21) | Exact invocation/count limits: E21 | Only stated historical scope; no current-candidate pass |
| Task22: `node --import tsx --test tests/open-ena-model-v3-longitudinal.test.ts` | Historical coverage | [E22](#e22-plan-3-task-6-global-22) | Exact invocation/count limits: E22 | Only stated historical scope; no current-candidate pass |
| Task22: `node --import tsx --test tests/open-ena-longitudinal.test.ts tests/open-ena-longitudinal-v3.test.ts tests/open-ena-longitudinal-v3-scientific-revision.test.ts` | Historical coverage | [E22](#e22-plan-3-task-6-global-22) | Exact invocation/count limits: E22 | Only stated historical scope; no current-candidate pass |
| Task23: `node --import tsx --test tests/open-ena-model-v3-bound-consumers.test.ts` | Historical coverage | [E23](#e23-plan-3-task-7-global-23) | Exact invocation/count limits: E23 | Only stated historical scope; no current-candidate pass |
| Task23: `node --import tsx --test tests/open-ena-ai-interpretation-payload.test.ts tests/open-ena-sets.test.ts tests/open-ena-data-view-export.test.ts` | Historical coverage | [E23](#e23-plan-3-task-7-global-23) | Exact invocation/count limits: E23 | Only stated historical scope; no current-candidate pass |
| Task23: `npm run typecheck:app` | Historical coverage | [E23](#e23-plan-3-task-7-global-23) | Exact invocation/count limits: E23 | Only stated historical scope; no current-candidate pass |
| Task23: `npm run test:app` | Historical coverage | [E23](#e23-plan-3-task-7-global-23) | Exact invocation/count limits: E23 | Only stated historical scope; no current-candidate pass |

### Plan 4

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Task24: `node --import tsx --test tests/open-ena-model-v3-state.test.ts` | Historical coverage | [E24](#e24-plan-4-task-1-global-24) | Exact invocation/count limits: E24 | Only stated historical scope; no current-candidate pass |
| Task25: `node --import tsx --test tests/open-ena-model-v3-tabs.test.ts` | Historical coverage | [E25](#e25-plan-4-task-2-global-25) | Exact invocation/count limits: E25 | Only stated historical scope; no current-candidate pass |
| Task25: `node --import tsx --test tests/open-ena-model-v3-tabs.test.ts tests/open-ena-model-tabs-keyboard.test.ts` | Historical coverage | [E25](#e25-plan-4-task-2-global-25) | Exact invocation/count limits: E25 | Only stated historical scope; no current-candidate pass |
| Task26: `node --import tsx --test tests/open-ena-model-v3-units-panel.test.ts tests/open-ena-group-display-controls.test.ts` | Historical coverage | [E26](#e26-plan-4-task-3-global-26) | Exact invocation/count limits: E26 | Only stated historical scope; no current-candidate pass |
| Task26: `node --import tsx --test tests/open-ena-model-v3-units-panel.test.ts tests/open-ena-group-display-controls.test.ts tests/open-ena-group-contrast-workspace.test.ts` | Historical coverage | [E26](#e26-plan-4-task-3-global-26) | Exact invocation/count limits: E26 | Only stated historical scope; no current-candidate pass |
| Task27: `node --import tsx --test tests/open-ena-model-v3-horizons-panel.test.ts` | Historical coverage | [E27](#e27-plan-4-task-4-global-27) | Exact invocation/count limits: E27 | Only stated historical scope; no current-candidate pass |
| Task27: `node --import tsx --test tests/open-ena-model-v3-horizons-panel.test.ts tests/open-ena-model-v3-ordering.test.ts` | Historical coverage | [E27](#e27-plan-4-task-4-global-27) | Exact invocation/count limits: E27 | Only stated historical scope; no current-candidate pass |
| Task28: `node --import tsx --test tests/open-ena-model-v3-windows-panel.test.ts` | Historical coverage | [E28](#e28-plan-4-task-5-global-28) | Exact invocation/count limits: E28 | Only stated historical scope; no current-candidate pass |
| Task28: `node --import tsx --test tests/open-ena-model-v3-windows-panel.test.ts tests/open-ena-model-v3-compiler.test.ts tests/open-ena-reference-v2-projection.test.ts` | Historical coverage | [E28](#e28-plan-4-task-5-global-28) | Exact invocation/count limits: E28 | Only stated historical scope; no current-candidate pass |
| Task29: `node --import tsx --test tests/open-ena-model-v3-codes-panel.test.ts tests/open-ena-analysis-family-control.test.ts` | Historical coverage | [E29](#e29-plan-4-task-6-global-29) | Exact invocation/count limits: E29 | Only stated historical scope; no current-candidate pass |
| Task29: `node --import tsx --test tests/open-ena-model-v3-codes-panel.test.ts tests/open-ena-analysis-family-control.test.ts tests/open-ena-code-colors.test.ts` | Historical coverage | [E29](#e29-plan-4-task-6-global-29) | Exact invocation/count limits: E29 | Only stated historical scope; no current-candidate pass |
| Task30: `node --import tsx --test tests/open-ena-model-v3-code-visibility.test.ts` | Historical coverage | [E30](#e30-plan-4-task-7-global-30) | Exact invocation/count limits: E30 | Only stated historical scope; no current-candidate pass |
| Task30: `node --import tsx --test tests/open-ena-3d-view.test.ts tests/open-ena-group-contrast-plot.test.ts tests/open-ena-longitudinal-plot.test.ts tests/open-ena-ona-3d.test.ts` | Historical coverage | [E30](#e30-plan-4-task-7-global-30) | Exact invocation/count limits: E30 | Only stated historical scope; no current-candidate pass |
| Task31: `node --import tsx --test tests/open-ena-model-v3-workspace.test.ts tests/open-ena-official-model-tabs-parity.test.ts` | Historical coverage | [E31](#e31-plan-4-task-8-global-31) | Exact invocation/count limits: E31 | Only stated historical scope; no current-candidate pass |
| Task31: `node --import tsx --test tests/open-ena-model-v3-import.test.ts tests/open-ena-functional.test.ts tests/open-ena-trajectory-sample.test.ts tests/open-ena-ona-workspace.test.ts` | Historical coverage | [E31](#e31-plan-4-task-8-global-31) | Exact invocation/count limits: E31 | Only stated historical scope; no current-candidate pass |
| Task32: `node --import tsx --test tests/open-ena-model-v3-*.test.ts` | Historical coverage | [E32](#e32-plan-4-task-9-global-32) | Exact invocation/count limits: E32 | Only stated historical scope; no current-candidate pass |
| Task32: `node --import tsx --test tests/open-ena-accessibility-regressions.test.ts tests/open-ena-model-tabs-keyboard.test.ts tests/open-ena-official-model-tabs-parity.test.ts` | Historical coverage | [E32](#e32-plan-4-task-9-global-32) | Exact invocation/count limits: E32 | Only stated historical scope; no current-candidate pass |
| Task32: `npm run typecheck:app` | Historical coverage | [E32](#e32-plan-4-task-9-global-32) | Exact invocation/count limits: E32 | Only stated historical scope; no current-candidate pass |
| Task32: `npm run test:app` | Historical coverage | [E32](#e32-plan-4-task-9-global-32) | Exact invocation/count limits: E32 | Only stated historical scope; no current-candidate pass |
| Task32: `node --import tsx --test tests/open-ena-model-v3-i18n.test.ts tests/open-ena-accessibility-regressions.test.ts tests/open-ena-official-model-tabs-parity.test.ts` | Historical coverage | [E32](#e32-plan-4-task-9-global-32) | Exact invocation/count limits: E32 | Only stated historical scope; no current-candidate pass |

### Plan 5

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Task33: `node --import tsx --test tests/open-ena-model-v3-baseline.test.ts` | Pass (historical) | [E33](#e33-plan-5-task-1-global-33) | None for recorded gate; exit 0 / zero skips | Only unchanged cae13c8 baseline/ONA revalidation |
| Task33: `node --import tsx --test tests/open-ena-ona-v3-adapter.test.ts` | Pass (historical) | [E33](#e33-plan-5-task-1-global-33) | None for recorded gate; exit 0 / zero skips | Only unchanged cae13c8 baseline/ONA revalidation |
| Task33: `node --import tsx --test tests/open-ena-ona-analysis-plan.test.ts tests/open-ena-ona-worker.test.ts tests/open-ena-ona-bundle.test.ts tests/open-ena-ona-descriptive.test.ts tests/open-ena-ona-3d.test.ts` | Pass (historical) | [E33](#e33-plan-5-task-1-global-33) | None for recorded gate; exit 0 / zero skips | Only unchanged cae13c8 baseline/ONA revalidation |
| Task34: `npm test --workspace=jena-js -- tests/standard-v3-golden-manifest.test.ts` | Historical coverage | [E34](#e34-plan-5-task-2-global-34) | Exact invocation/count limits: E34 | Only stated historical scope; no current-candidate pass |
| Task35: `npm test --workspace=jena-js -- tests/r-goldens.test.ts` | Pass (historical) | [E35](#e35-plan-5-task-3-global-35) | Final R2 actual argv/exit 0; zero skips; earlier failures retained | Only pinned 88528718 baseline/current/pack scope |
| Task35: `npm test --workspace=jena-js -- tests/standard-v3-r-parity.test.ts` | Pass (historical) | [E35](#e35-plan-5-task-3-global-35) | Final R2 actual argv/exit 0; zero skips; earlier failures retained | Only pinned 88528718 baseline/current/pack scope |
| Task35: `npm run test:pack-contract --workspace=jena-js` | Pass (historical) | [E35](#e35-plan-5-task-3-global-35) | Final R2 actual argv/exit 0; zero skips; earlier failures retained | Only pinned 88528718 baseline/current/pack scope |
| Task36: `node --import tsx --test tests/open-ena-ona-*.test.ts` | Pass (historical) | [E36](#e36-plan-5-task-4-global-36) | Actual final argv/exit 0; all18 ONA expansion explicit; zero skips | Only dd975b4 public/private non-regression |
| Task36: `npm test --workspace=jena-js -- tests/ordered-network.test.ts tests/ordered-window-stability.test.ts tests/ordered-half-product-stability.test.ts tests/ordered-safety-budget.test.ts` | Pass (historical) | [E36](#e36-plan-5-task-4-global-36) | Actual final argv/exit 0; all18 ONA expansion explicit; zero skips | Only dd975b4 public/private non-regression |
| Task36: `node --import tsx --test tests/open-ena-ona-v3-nonregression.test.ts` | Pass (historical) | [E36](#e36-plan-5-task-4-global-36) | Actual final argv/exit 0; all18 ONA expansion explicit; zero skips | Only dd975b4 public/private non-regression |
| Task37: `node --import tsx --test tests/open-ena-models-v3-browser-smoke-contract.test.ts` | Historical coverage | [E37](#e37-plan-5-task-5-global-37) | Actual final served browser includes build and contract/affected suites; see exact runtime receipt | Only 831b39c local served journey and recorded build |
| Task37: `npm run build` | Historical coverage | [E37](#e37-plan-5-task-5-global-37) | Actual final served browser includes build and contract/affected suites; see exact runtime receipt | Only 831b39c local served journey and recorded build |
| Task37: `npm run test:browser:open-ena-models-v3` | Historical coverage | [E37](#e37-plan-5-task-5-global-37) | Actual final served browser includes build and contract/affected suites; see exact runtime receipt | Only 831b39c local served journey and recorded build |
| Task38: `node --import tsx --test tests/open-ena-a11y-perf-browser-smoke-contract.test.ts tests/open-ena-accessibility-regressions.test.ts tests/open-ena-model-v3-i18n.test.ts` | Pass (Task38 base) | [E38](#e38-plan-5-task-6-global-38) | Writer and each reviewer actual original argv exit 0; zero test skips; retained warnings/history | Only 7baab3a gate and measured scope |
| Task38: `node tests/open-ena-a11y-perf-browser-smoke.mjs` | Pass (Task38 base) | [E38](#e38-plan-5-task-6-global-38) | Writer and each reviewer actual original argv exit 0; zero test skips; retained warnings/history | Only 7baab3a gate and measured scope |
| Task38: `npm run test:browser:open-ena-3d-controls` | Pass (Task38 base) | [E38](#e38-plan-5-task-6-global-38) | Writer and each reviewer actual original argv exit 0; zero test skips; retained warnings/history | Only 7baab3a gate and measured scope |
| Task38: `npm run test:browser:open-ena-ona-3d` | Pass (Task38 base) | [E38](#e38-plan-5-task-6-global-38) | Writer and each reviewer actual original argv exit 0; zero test skips; retained warnings/history | Only 7baab3a gate and measured scope |
| Task38: `npm run test:browser:open-ena-node-drag` | Pass (Task38 base) | [E38](#e38-plan-5-task-6-global-38) | Writer and each reviewer actual original argv exit 0; zero test skips; retained warnings/history | Only 7baab3a gate and measured scope |
| Task38: `npm run test:browser:longitudinal-v3` | Pass (Task38 base) | [E38](#e38-plan-5-task-6-global-38) | Writer and each reviewer actual original argv exit 0; zero test skips; retained warnings/history | Only 7baab3a gate and measured scope |
| Task38: `node --import tsx --test tests/open-ena-inference-v2.test.ts tests/open-ena-inference-consumers-v2.test.ts tests/open-ena-contrasts.test.ts tests/open-ena-longitudinal-v3.test.ts tests/open-ena-ai-interpretation-payload.test.ts tests/open-ena-data-view-export.test.ts` | Pass (Task38 base) | [E38](#e38-plan-5-task-6-global-38) | Writer and each reviewer actual original argv exit 0; zero test skips; retained warnings/history | Only 7baab3a gate and measured scope |
| Task39: `node --import tsx --test tests/open-ena-model-v3-documentation.test.ts` | Pass (documentation) | [Task39 documentation receipt](#task39-documentation-receipt) | Original ENOENT and F1 documentation RED retained; final 3/3 GREEN, 0 skips | Documentation contract only; Task39 final SPEC and QUALITY accepted at0b6f5db |
| Task40: `npm run test:app` | Pass | [Task40 fresh complete gates](#task40-fresh-complete-gates); [08-frozen-test-app.log](/tmp/ena-41-task-controller-20260905/task40-writer/08-frozen-test-app.log) | Exit0; 2649/2649;0 fail/skip/cancel/todo; both private Yu safe gates passed; earlier failures retained below | Tested f1f7356 content; final ledger bridge below |
| Task40: `npm run typecheck:app` | Pass | [Task40 fresh complete gates](#task40-fresh-complete-gates); [09-frozen-typecheck.log](/tmp/ena-41-task-controller-20260905/task40-writer/09-frozen-typecheck.log) | Exit0; tsc --noEmit exit0 against ES2017; earlier failures retained below | Tested f1f7356 content; final ledger bridge below |
| Task40: `npm run build:app` | Pass | [Task40 fresh complete gates](#task40-fresh-complete-gates); [10-frozen-build-app.log](/tmp/ena-41-task-controller-20260905/task40-writer/10-frozen-build-app.log) | Exit0; Supported prebuild guard and Next build3368/3368; applied Plotly unchanged; earlier failures retained below | Tested f1f7356 content; final ledger bridge below |
| Task40: `npm run jena:verify` | Pass | [Task40 fresh complete gates](#task40-fresh-complete-gates); [07-frozen-jena-verify.log](/tmp/ena-41-task-controller-20260905/task40-writer/07-frozen-jena-verify.log) | Exit0; 686/686 in29 files; frozen baseline35/current rENA0.4.4 parity98; pack20/20; pack-check45 files;0 skips; earlier failures retained below | Tested f1f7356 content; final ledger bridge below |
| Task40: `npm run test:browser:open-ena-models-v3` | Pass | [Task40 fresh complete gates](#task40-fresh-complete-gates); [11-frozen-models-browser.log](/tmp/ena-41-task-controller-20260905/task40-writer/11-frozen-models-browser.log) | Exit0; Fresh owned build/server/Postgres/Chromium;15 journeys;172 reachability checks;153 responses;14 public image views; earlier failures retained below | Tested f1f7356 content; final ledger bridge below |
| Task40: `npm run verify` | Pass | [Task40 fresh complete gates](#task40-fresh-complete-gates); [12-frozen-full-verify.log](/tmp/ena-41-task-controller-20260905/task40-writer/12-frozen-full-verify.log) | Exit0; Actual complete chain: package686,pack20,receipt tests230,app2649,typecheck/build3368;0 skips; earlier failures retained below | Tested f1f7356 content; final ledger bridge below |

## R baseline, current oracle and supplemental commands

The frozen manifest SHA256 is
`b6db68f8101c510958101d19bdc10ca7a70781b814ad0a65247ce46fb31bfd4c`.
It records pre-cutover `3aea9a934787fe44ade1082980dc6293e00f3d87` and
2026-09-03T00:27:51.000Z. The actual freeze commit is
`b5f03f8c485c8e5a37ab5c78d9a6314f7165c73f`; Task0 closure
`85f0d976997b76968cc51b125a4a2f5cf11ca9bc` additionally made history CI-visible.
The retained rENA0.3.1 fixture SHA256 is
`a13517172cc8c87d79278649363aec3aac79ee624d0b22ce3c724650c6204192`;
public ordered-window/tma fixture SHA256 is
`0f295ed72eb360e3792d441c5e034c858ed3c65ddbbc7e868a0abdcec6f70a0e`.
Task33 proved physical/index/HEAD/freeze/pre-cutover equality at cae13c8.

Task34 installed stable **rENA0.4.4**, **tma0.3.3**, and disclosed development
**libqe0.1.2.9002** in the task-only R library using **R4.4.2 aarch64**.
Global rENA0.3.1 stayed unchanged. Repository PACKAGES advertised a development
version while the historical stable HTML table/artifact supplied0.4.4; the generic
install command below is not represented as a successful stable selection.
Old dependency/binary and missing `/opt/gfortran` linker failures required exact
source installs and task-only Makevars using existing R-bundled libraries.
This is bounded local-build evidence, not a hermetic installer or a current
cross-platform package recommendation.

Pinned rENA artifact SHA256
`2aae98760ea6e304a90fba8efa95f546b61e9aeaf021c5de506b730a5606dc2e`;
generator `b5b20083c74a87e6be455cdb72c02ecd552623b9e6f3b76e29eb21f6c7c211a0`;
current fixture `0f2f4fb5ec58a9a441ece805865ad86345c8b4ce4102a0406453c717bce9037d`;
repeated computational payload `9ec92ae8dce31be123a2e617738fdb11affeab184e9db92da16b9834a496c40f`.
All14 fixed configurations execute actual R, retain full six axes and separate
requested-three views. The separate R-only canonical Means frame is fixed
Positive-minus-Negative; raw R outputs remain unchanged. Task35 establishes exact
typed identities/counts/full-prefix equality, scalar1e-10 and basis/projector1e-8,
without full-variance renormalization. Rank-aware minimum-norm undirected nodes,
unchanged directed ridge and fixed Reference nodes are distinct. The added
scratch/work accounting makes operational admission stricter without changing
frozen hard ceilings. No universal conditioning/platform agreement follows.

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Task33: `shasum -a 256 packages/jena-js/fixtures/goldens/sena-configs.generated.json` | Pass (historical adapted command) | E33 and actual receipts below | Exact pinned paths/library and literal Git options recorded in actual receipt | Only E33/E34 observed preservation/generation |
| Task33: `git diff --exit-code -- tests/fixtures/open-ena/model-v3/baseline-manifest.json packages/jena-js/fixtures/goldens/sena-configs.generated.json` | Pass (historical adapted command) | E33 and actual receipts below | Exact pinned paths/library and literal Git options recorded in actual receipt | Only E33/E34 observed preservation/generation |
| Task34: `rena_probe_lib=$(mktemp -d)` | Unverified original / amended procedure | E34 and actual receipts below | Generic recipe superseded by explicit pinned source/dependency installation; failures retained | No successful verbatim generic-install claim |
| Task34: `R_LIBS_USER="$rena_probe_lib" Rscript --vanilla -e 'install.packages("rENA", repos=c("https://cran.qe-libs.org","https://cran.rstudio.org")); stopifnot(startsWith(as.character(utils::packageVersion("rENA")), "0.4.")); cat(find.package("rENA"))'` | Unverified original / amended procedure | E34 and actual receipts below | Generic recipe superseded by explicit pinned source/dependency installation; failures retained | No successful verbatim generic-install claim |
| Task34: `rena_generation_lib=$(mktemp -d)` | Unverified original / amended procedure | E34 and actual receipts below | Generic recipe superseded by explicit pinned source/dependency installation; failures retained | No successful verbatim generic-install claim |
| Task34: `R_LIBS_USER="$rena_generation_lib" Rscript --vanilla -e 'install.packages("rENA", repos=c("https://cran.qe-libs.org","https://cran.rstudio.org")); stopifnot(startsWith(as.character(utils::packageVersion("rENA")), "0.4."))'` | Unverified original / amended procedure | E34 and actual receipts below | Generic recipe superseded by explicit pinned source/dependency installation; failures retained | No successful verbatim generic-install claim |
| Task34: `R_LIBS_USER="$rena_generation_lib" Rscript --vanilla packages/jena-js/scripts/regen-standard-v3-goldens.R packages/jena-js/fixtures/goldens/rena-current-standard-v3.generated.json` | Pass (historical adapted command) | E34 and actual receipts below | Exact pinned paths/library and literal Git options recorded in actual receipt | Only E33/E34 observed preservation/generation |
| Task34: `shasum -a 256 packages/jena-js/scripts/regen-standard-v3-goldens.R packages/jena-js/fixtures/goldens/rena-current-standard-v3.generated.json` | Pass (historical adapted command) | E34 and actual receipts below | Exact pinned paths/library and literal Git options recorded in actual receipt | Only E33/E34 observed preservation/generation |

Actual pinned generator invocation was:

```sh
R_LIBS_USER=/tmp/ena-41-task-controller-20260905/task34-rlib RENA_STANDARD_V3_ARTIFACT=/tmp/ena-41-task-controller-20260905/task34-rENA_0.4.4.tar.gz /usr/local/bin/Rscript --vanilla packages/jena-js/scripts/regen-standard-v3-goldens.R packages/jena-js/fixtures/goldens/rena-current-standard-v3.generated.json
```

- [task34-generation-pinned.command.json](/tmp/ena-41-task-controller-20260905/task34-generation-pinned.command.json); SHA256 `e3230c09738c056b6d0c8791c5684808dbd10d215440e86b4baf88ee37347d3b`. Exit `0`; No run timestamp recorded in this receipt; elapsed `0.9351320266723633` seconds.
- [task34-install-local.command.json](/tmp/ena-41-task-controller-20260905/task34-install-local.command.json); SHA256 `3b512b9eb75d22a94c3c1ccfea83eb867ab1972d61acd807e08ba152640aa4ba`. Exit `0`; No run timestamp recorded in this receipt; elapsed `15.39620304107666` seconds.
- [task35-r2-final-baseline.command.json](/tmp/ena-41-task-controller-20260905/task35-r2-final-baseline.command.json); SHA256 `0f0a7c58d600546ce470f5e964e762947c2f4115e4547705a6cecd1147af48ef`. Exit `0`; No run timestamp recorded in this receipt; elapsed `0.6393411159515381` seconds.
- [task35-r2-final-current.command.json](/tmp/ena-41-task-controller-20260905/task35-r2-final-current.command.json); SHA256 `b65a0e16495a6a0ee97ea763d6252b170fd06a0b35465d9a4157696aae83ec79`. Exit `0`; No run timestamp recorded in this receipt; elapsed `3.9567501544952393` seconds.
- [task35-r2-final-pack.command.json](/tmp/ena-41-task-controller-20260905/task35-r2-final-pack.command.json); SHA256 `243cd27e0c1aa817fdf564e7fe3ceffc8869ac687b0dea8340ef21b408b074a4`. Exit `0`; No run timestamp recorded in this receipt; elapsed `0.14088678359985352` seconds.
- [task36-final-new-test-receipt.json](/tmp/ena-41-task-controller-20260905/task36-final-new-test-receipt.json); SHA256 `dec608481c81b0be9f87c5cec212b60945984fcd4e5f97573c1b209a65135561`. Exit `0`; 2026-09-07T01:36:38.771926+00:00; elapsed `0.32397007942199707` seconds.
- [task36-final-ona-app-receipt.json](/tmp/ena-41-task-controller-20260905/task36-final-ona-app-receipt.json); SHA256 `bce98842cec113d14b83f02bcaac77c381b21ed2618a2f38d48ad38850743737`. Exit `0`; 2026-09-07T01:36:39.096590+00:00; elapsed `1.1551461219787598` seconds.
- [task36-final-ordered-required-receipt.json](/tmp/ena-41-task-controller-20260905/task36-final-ordered-required-receipt.json); SHA256 `f472ecdd8152b85aeca7bc61560c7a47110e13c883c0f7c0866206a0c6374b15`. Exit `0`; 2026-09-07T01:36:40.252172+00:00; elapsed `0.672137975692749` seconds.

## E38 current receipt detail and served-browser limits

Task38 tested source digest is
`1496ce86b0564737bee43ae11eb67af97d0170d7baadfeeabb62d735b0395c7c`,
829 regular files plus unchanged j-3dENA gitlink
`47e05006ff5308b6cb857111c2114e47e7bdfc6d`. Task39 changes documentation/tests,
so these are predecessor receipts, not newly executed Task39 product gates.

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| `node tests/open-ena-a11y-perf-browser-smoke.mjs` | Pass, exit 0 | Writer `2026-09-07T12:24:17.901076+00:00` → `2026-09-07T12:25:21.970966+00:00`; [final-a11y.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-a11y.log); SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; browser/typecheck: no test-runner count inferred | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `node --import tsx --test tests/open-ena-a11y-perf-browser-smoke-contract.test.ts tests/open-ena-accessibility-regressions.test.ts tests/open-ena-model-v3-i18n.test.ts` | Pass, exit 0 | Writer `2026-09-07T12:25:21.999242+00:00` → `2026-09-07T12:25:22.558236+00:00`; [final-a11y-focused.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-a11y-focused.log); SHA256 `31a62c53e2e2537d9f477110b8ebe108ba5da1e11c4e2d653edeeddb6ba593a6`; ℹ tests 35; ℹ pass 35; ℹ fail 0; ℹ skipped 0 | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `npm run test:browser:open-ena-3d-controls` | Pass, exit 0 | Writer `2026-09-07T12:25:22.583675+00:00` → `2026-09-07T12:25:56.452959+00:00`; [final-controls.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-controls.log); SHA256 `c0eee6d8df384e903f8994b6b8f1c82463ebd68ecba348710f64d77333073540`; browser/typecheck: no test-runner count inferred | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `npm run test:browser:open-ena-ona-3d` | Pass, exit 0 | Writer `2026-09-07T12:25:56.480379+00:00` → `2026-09-07T12:26:46.229513+00:00`; [final-ona.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-ona.log); SHA256 `631f84a7e52069b3908cc2596044390c8cf0bf28f9dd608f27eb16e3e040e051`; browser/typecheck: no test-runner count inferred | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `npm run test:browser:open-ena-node-drag` | Pass, exit 0 | Writer `2026-09-07T12:26:46.256630+00:00` → `2026-09-07T12:27:19.102132+00:00`; [final-node.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-node.log); SHA256 `a2cac34ce3e981993e5af5aec713f714bdf18a3078bd622f62c2c31cc5763b47`; browser/typecheck: no test-runner count inferred | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `npm run test:browser:longitudinal-v3` | Pass, exit 0 | Writer `2026-09-07T12:27:19.130489+00:00` → `2026-09-07T12:28:05.263244+00:00`; [final-longitudinal.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-longitudinal.log); SHA256 `eb5f8f20a604fd7a0f9da2ae5aa8dd7f5cb83001137f580d9ddad12114b6cd13`; browser/typecheck: no test-runner count inferred | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `node --import tsx --test tests/open-ena-inference-v2.test.ts tests/open-ena-inference-consumers-v2.test.ts tests/open-ena-contrasts.test.ts tests/open-ena-longitudinal-v3.test.ts tests/open-ena-ai-interpretation-payload.test.ts tests/open-ena-data-view-export.test.ts` | Pass, exit 0 | Writer `2026-09-07T12:28:05.287837+00:00` → `2026-09-07T12:28:05.959814+00:00`; [final-downstream.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-downstream.log); SHA256 `bf0d6e0362f0648cc2f0c6fb9312971f98a2529310b1a99c2cbc055faf86f8e4`; ℹ tests 126; ℹ pass 126; ℹ fail 0; ℹ skipped 0 | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `node --import tsx --test tests/open-ena-native-path-inference-v3.test.ts tests/open-ena-native-trajectory-export-v3.test.ts tests/open-ena-native-trajectory-ui-v3.test.ts tests/open-ena-plot-image-export-v3.test.ts tests/open-ena-plot-view-sync-v3.test.ts tests/open-ena-model-v3-workspace-presentation.test.ts tests/open-ena-3d-view.test.ts tests/open-ena-longitudinal-v3-browser-smoke-contract.test.ts tests/open-ena-3d-controls-browser-smoke-contract.test.ts tests/open-ena-ona-3d-browser-smoke-contract.test.ts tests/open-ena-node-drag-browser-smoke-contract.test.ts tests/open-ena-browser-warning-classifier.test.ts tests/open-ena-code-color-presets-css.test.ts tests/open-ena-code-color-picker.test.ts tests/open-ena-group-display-controls.test.ts tests/open-ena-group-contrast-plot.test.ts tests/open-ena-models-v3-lifecycle.test.ts tests/open-ena-plotly-resource-owner-v3.test.ts tests/open-ena-plotly-disposal-patch.test.ts tests/open-ena-longitudinal-v3-display.test.ts` | Pass, exit 0 | Writer `2026-09-07T12:28:05.984270+00:00` → `2026-09-07T12:28:29.784126+00:00`; [final-affected-focused.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-affected-focused.log); SHA256 `ee7c9532f2ed642edb98acf1ecb285fac8f03d35eae5af77f4ce8156cd58c4f7`; ℹ tests 214; ℹ pass 214; ℹ fail 0; ℹ skipped 0 | See retained warnings and controlled-latency limits below | Exact 7baab3a only |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Pass, exit 0 | Writer `2026-09-07T12:28:29.814184+00:00` → `2026-09-07T12:28:36.429207+00:00`; [final-typecheck.log](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-typecheck.log); SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; browser/typecheck: no test-runner count inferred | See retained warnings and controlled-latency limits below | Exact 7baab3a only |

Independent reviews each reran all nine gates after freezing the same candidate:

- [final-command-exits.json](/tmp/ena-41-task-controller-20260905/task38-f2-final1/final-command-exits.json); SHA256 `9f340fe1d40e099e6da85732f4d28a4852c3a69d79a5e868b6ec8ff0fcb00e18`.
- [task38-spec-review.md](/tmp/ena-41-task-controller-20260905/task38-spec-f2/task38-spec-review.md); SHA256 `d5006bd89508dbf2e677f995134fd2891db7633372b6c7f469dc34b7715838bc`.
- [command-exits.json](/tmp/ena-41-task-controller-20260905/task38-spec-f2/command-exits.json); SHA256 `88135bd266e510dca5120eb38c56018c7f5c194aee696c13a1ef6a2cbc6491d0`.
- [task38-quality-review.md](/tmp/ena-41-task-controller-20260905/task38-quality-f2/task38-quality-review.md); SHA256 `ca1376b2a9d9d1a15c6304bbb916de90a0fab858ee68ae73acc5578f0cd1a671`.
- [command-exits.json](/tmp/ena-41-task-controller-20260905/task38-quality-f2/command-exits.json); SHA256 `671296c04c6bc6cc5561cbc07cb127011fffa413f35f174e45a69717bf4e8ac7`.
- [receipt.json](/tmp/ena-41-task-controller-20260905/task37-quality-q1-fresh/task37-models-v3-gkAYDS/receipt.json); SHA256 `2d16d227aa9e7710ce7417e52de68cdb881e4615b36ab4fc74198e1eac922320`.
- [task32-q3-final1-command-manifest.json](/tmp/ena-41-task-controller-20260905/task32-q3-final1-command-manifest.json); SHA256 `e6106c8d43b80bd52aea194076c264003dca220818f209406a2a195c2f754547`.

Task37 actual served Models journey at831b39c includes full local build, source,
served asset and cleanup custody. Its final QUALITY build ID was
`ZLJjU9Y0VPQnR5167UExY`, build digest
`8f5bbd28b421933546e71e6611b9c2412d5f2270b1dfaab0b7a248d7e68fe372`.
Both final reviewers actually viewed14 public screenshots; raw browser receipt
hash `2d16d227aa9e7710ce7417e52de68cdb881e4615b36ab4fc74198e1eac922320`.
This is local authenticated test infrastructure, not authenticated production.

Task38 writer/SPEC/QUALITY each observed655 individually hashed served responses
with0 body/asset errors and0 cleanup errors. Each checked15 owned ports as actual
ECONNREFUSED and removed its own profiles/database processes. Visual inspection
was by Task38 writer39 images, SPEC7 and QUALITY7 selected public/synthetic images;
Task39 documentation author read their reports rather than claiming new image views.
Current served scientific journeys were English. Task38 three-locale catalog/SSR
and Task32 actual routed English/Traditional/Simplified Workspace evidence atcae13c8
are different coverage. CSS200/enlarged text is not native browser zoom.

Private ONA was actually present and tested:87 Units,174 rows,7 Codes,
49 directed dimensions, **3 zero-network Units**,811 raw counts and74 self counts.
The original writer wording “3 zero edges” is a documented report typo corrected
by the root clarification and both reviewers; it is not the measured quantity.
The 181-test app summary is 179 public + 2 actual private cases in Task36.
No private identifiers, row bytes, screenshots or export bodies are included here.

Native whole-path inference uses independent complete histories, three genuine
axes, confirmed full Unit identity and cross-Group independence, at least2 complete
Units/group,500 permutations/seed2026, whole-history reassignment, raw/Holm p and
resource admission. Its23-metric independent pinned public-SDK oracle is one
fixture's coverage. Local GPL port/source-map provenance does not turn internal
helpers into public package APIs. Independent/paired/repeated **rank** designs
are separate; paired whole-path inference is not implemented.
Default trajectory ZIP/standalone output has three aggregate payload files:
`analysis.json`, `plot-specification.json`, and `trajectory-inference.csv`, plus
`manifest.json`. Their positive whitelist covers path results, optionally collected
rank results, and complete-cohort geometry. The bound model Methods report is
available separately in the Workspace; it is not included in the trajectory ZIP.
A rank result's method identifier is not a Methods report. Explicit participant
opt-in and confirmation precede materialization, and asynchronous currentness is
rechecked. The three aggregate payload files remain byte-identical after
participant opt-in. `participants.json` is added; `manifest.json` changes its
disclosure and file inventory, so the ZIP bytes and hash also change.
Imported/serialized artifacts cannot regain a live result/plan/control execution receipt.

Task38 Q1 is closed for measured resource scope:10 real projection transitions
settle3 current/3 attached/0 retired-unlost/0 current-loss;4 same-projection updates
add no contexts;23 snapshots plus repeated/cross-root PNG success/rejection/recovery
and unmount/remount preserve current scenes. The shared static export context
retains bounded nonzero Buffer1/Program5/Shader4–5, with Texture0/Framebuffer0 in
QUALITY's observations. These are live-handle observations, not GPU byte estimates
or a universal leak-free claim.

Plotly remains version3.7.0 with explicit local `open-ena-plotly-disposal-v1`,
four substitutions correcting two per-instance omissions. Upstream distribution
SHA256 `fa6ebaf365ea5ad46a9843ea98fb2635c998558b9d876578aa12f765f823cc3d`
is distinct from applied
`cc2f875652ac1fca82bd7e42594bcf309efc2e37019a9f5b542546e63576654c`.
The tracked exact-byte guard, lifecycle/build hooks, unchanged MIT license,
registry lock identity and before/after runtime digest remain part of custody.
See [the committed correction](../../maintenance/plotly-3.7.0-disposal-correction.md)
and [exact patch](../../../scripts/patches/plotly-gl3d-3.7.0-disposal.json).
No jENA scientific or frozen vendor-contract change is implied.

F1 keeps active fullscreen Exit available. F2 now returns focus after releasing
one genuinely loaded image callback and a real queued pointer-drag render, while
a separate real Model-navigation choice retains focus in the **same connected
current figure**, with one Worker/current science. This is controlled callback
latency, not a naturally measured long render or an unobserved native-busy-exit
browser sequence. Original12 pending Tab/ShiftTab pairs remain in the final gate.

Historical Q1 resource, F1 and F2 focus failures and setup/launcher errors remain
retained. The earlier Worker response-body capture race is **not claimed fixed**;
failed response bodies were never replaced by another read. Current zero capture
errors do not erase historical failures. Raw Canvas2D advisories remain8 in a11y
and1 in each other writer/QUALITY gate; zero unknown/asset errors is not zero raw
warnings. Existing strict performance budgets800000 transferred bytes,2200000
decoded bytes,1500ms largest long task and5000ms all-three-ready were preserved;
QUALITY observed516842/1642585 bytes and646.4–787.6ms ready in that bounded run.
Known scientific label overlaps remain. No universal performance, accessibility,
native zoom, official pixel-parity, hosted CI or production claim follows.

## Task39 documentation receipt

The exact original contract was written before README/ledger additions. On
`2026-09-07T13:05:02.433489+00:00`, `node --import tsx --test tests/open-ena-model-v3-documentation.test.ts`
returned **Fail, exit1:1 test /0 pass /1 fail /0 skip**. Actual cause was
`ENOENT` for this previously absent ledger; existing valid README content was
not removed to manufacture failure. Original test SHA256 `7a7b7941438ffda69b708d990431e296246392a2f11a016bcaee33c0212b7a64`.

RED evidence: [red.stdout](/tmp/ena-41-task-controller-20260905/task39-writer/red.stdout); SHA256 `fa56478b3635fa7402c54be18b498997005f35d53f8a1f26286fc34366ded876`;
[red-receipt.json](/tmp/ena-41-task-controller-20260905/task39-writer/red-receipt.json); SHA256 `12a4ccb2ab8c7cec1ee789fe78e84f8e83afa4895637ad14edc81a57eb8092c3`.

GREEN ran `2026-09-07T13:17:04.662333+00:00` → `2026-09-07T13:17:04.786954+00:00`: **Pass, exit0:
3 tests /3 pass /0 fail /0 skip**. This includes the unchanged original contract,
all five plans' focused-command inventory and strict input/authority/final-status
boundaries. Evidence: [green-before-receipt.json](/tmp/ena-41-task-controller-20260905/task39-writer/green-before-receipt.json); SHA256 `2d2defda6a2643bb5db2b1471b84b03f325274ac02cc633514ff1a0cb4737a1a`;
[green-before-receipt.stdout](/tmp/ena-41-task-controller-20260905/task39-writer/green-before-receipt.stdout); SHA256 `0089838406f49e12a71bc1df541bfb6422a55e583e903a6aa4a93fb7400a9524`.
README SHA256 `89aa1c7704d0fb3f9f57c712ea3b55f21efc04afe8c7b86e18f5043549486781`;
test SHA256 `647ccb21ffb871ea1eeeb702b03e57cd219f78053efcd7ba0ef4ce1395c88696`.
The tested ledger digest before this outcome annotation was
`1ee5d0346acdffa32fe3941473654e15a03ba8f2e8619c9f26031259065b5223`; the final annotation and final rerun are bound in the
frozen handoff, not misrepresented as that earlier digest. The documentation
contract is a textual boundary/coverage guard, not scientific or browser execution
evidence. Task39 independent reviews were pending at this historical snapshot;
the final accepted pair is recorded below.

### Task39 F1 correction after independent SPEC

The initial documentation candidate `76963844dc041a85e2975ac26b448c49838b2136`
failed independent SPEC on one P2: the README incorrectly included Methods in the
trajectory ZIP and overstated which output bytes remain unchanged after participant
opt-in. This failure is preserved in
[task39-spec-review.md](/tmp/ena-41-task-controller-20260905/task39-spec/task39-spec-review.md); SHA256 `e165ff07a1f98ca7439402c4545f4560253227e894128295283fac0a39a02672`.
The reviewer's actual synthetic paired export probe ran on that candidate at
2026-09-07T13:26:24.815476+00:00, exit 0. It found no Methods report in any default
member; the three payload members matched, while manifest disclosure/inventory and
ZIP hashes differed. The default probe had no collected rank requests; rank outputs
are optional. Its safe filename/key/hash/boolean evidence is
[export-boundary-probe.stdout](/tmp/ena-41-task-controller-20260905/task39-spec/export-boundary-probe.stdout); SHA256 `e76620ab16be7213fbf884e6ed3cbf9d2d7d71bbb9f00565223b59109e423fab`.

The documentation-only correction names the actual four default members, separates
bound model Methods, and limits byte invariance to the three aggregate payload
files. Participant consent/currentness and accepted Task38 export behavior are
unchanged. The strengthened existing documentation guard first failed at
`2026-09-07T13:31:56.620862+00:00` with exit 1, 3 tests / 2 pass / 1 fail / 0 skip;
actual failure was `Missing trajectory member: analysis.json`. Original Step1
ENOENT evidence remains intact. Initial GREEN receipts above describe pre-F1
contents; the final F1 content and focused rerun are bound by the separate repair
handoff. This correction awaited SPEC then QUALITY at that historical snapshot.
The final accepted Task39 pair is below; Task40 own review and final whole-goal
SPEC → QUALITY remain Pending.

### Task39 Q1 correction after independent QUALITY

The F1 candidate `f76fce7ac62b5322d7d109e84b625ee4fa0dfb78` failed independent
QUALITY on one P2 table-rendering defect. Blank lines between task groups ended
the Plan tables: markdown-it-py CommonMark with its table extension rendered only
12 of the 101 register rows as table rows, and Mistune rendered 35. In-memory
removal of those separators yielded 101 in both parsers. The sealed report is
[task39-quality-review.md](/tmp/ena-41-task-controller-20260905/task39-quality/task39-quality-review.md); SHA256 `639d098e43f06473dd6bf845bf3937a0f219d58454815853226eb58d26ed2b43`;
its actual parser comparison is
[register-render-proof.json](/tmp/ena-41-task-controller-20260905/task39-quality/register-render-proof.json); SHA256 `2d700a43ac71b3d639c8bdc121560891ad5e166ce1a14906b05d5d5158df9b44`.

This correction removes only the 36 blank separators within the five Plan tables,
preserving every original command/status/evidence/reason/claim row byte-for-byte.
The existing command-inventory guard now requires each Plan's rows to be contiguous
with its header/delimiter and to retain five columns. It first failed at
`2026-09-07T13:48:09.581449+00:00`: exit 1, 3 tests / 2 pass / 1 fail / 0 skip,
with `Plan 1 command rows must be contiguous with their table header`.
The final parser, row-continuity and focused-test receipts are bound to the
separate Q1 repair handoff. README and the F1 export correction are unchanged;
earlier RED/GREEN and rejected-candidate receipts remain historical. Same SPEC
then QUALITY re-review were pending at this historical snapshot. The final
accepted Task39 pair is below; Task40 own and final whole-goal reviews remain pending.

## Task39 accepted state and Task40 repair provenance

Task39 was accepted by the controller on 2026-09-07T14:02:53.475285+00:00 at
0b6f5db825d100332597ec9c77cd2a0d6e72e565, tree 7e1cdccf06609e9005fe809129e43691dcb0a776.
The final SPEC then QUALITY reports were freshly hash-verified by Task40:

- [Task39 SPEC](/tmp/ena-41-task-controller-20260905/task39-spec-q1/task39-spec-review.md); SHA256 b986c3d9d9f9b1cefd5975bf2d41784a737891034516263188db25226c78c1a0.
- [Task39 QUALITY](/tmp/ena-41-task-controller-20260905/task39-quality-q1/task39-quality-review.md); SHA256 995c786388ada823e181e3dd4a228c2f3555247d7141086fc8acfb31fc633ac9.

Tasks 0–39 are accepted 40/41 by task count. Task40 own and final whole-goal reviews
remain separate and pending. E0–E38 and early missing raw review pairs remain historical.

The first full Task40 app run exposed three stale contracts and eight sandbox
process/loopback failures. The controller authorized exactly four test repairs:
follow the shared origin helper's real invocation, returned URL and owned server
env; extract named color-preset audit functions by AST while retaining substantive
checks and current native labels/report fields; parse SSR class tokens and require
the actual toolbar, both toggles, ordering and one accessible Download Model button;
replace the documentation regex dotAll flag with equivalent cross-line matching
for the existing ES2017 target. No product/helper/workflow/target/dependency,
numerical assertion, timeout or fixture changed. The unchanged 50ms Worker fixture
was not patched or claimed repaired. The four-test append is
f1f735601c568fba2e2ac79cb6331653a7c95a8e; 36 focused tests and typecheck passed before
it was frozen clean. Task39's original literal RED/GREEN history remains above.

### Task40 preserved failures and repair checks

The first npm cache failure was resolved with an owned temporary npm_config_cache.
Eight sandbox failures were diagnosed as four spawnSync ps EPERM and four owned
listen EPERM failures, then rerun with tool-approved process permissions. All 16
recorded failed-fixture PIDs were independently confirmed absent. An intermediate
test repair also exposed the helper's comma declaration and adjacent AST node
boundary; those parser assumptions were corrected. The subsequent ES2017 failure
was corrected in the fourth test. No automatic approval review rejection occurred.

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| `npm run jena:verify` | Fail | `2026-09-07T14:05:53.079952+00:00` → `2026-09-07T14:06:04.782691+00:00`; exit1; [03-jena-verify.log](/tmp/ena-41-task-controller-20260905/task40-writer/03-jena-verify.log); SHA256 `c1c77c4d07a61e496479abfd4eb68c14cdf4d73eb09c70a5b4c1b717cc538114` | Exit1 at pack-check; npm cache ENOTDIR; prior numerical stages passed | Earlier outcome; exact cwd/env/status in [03-jena-verify.json](/tmp/ena-41-task-controller-20260905/task40-writer/03-jena-verify.json) |
| `npm run jena:verify` | Pass | `2026-09-07T14:06:42.808852+00:00` → `2026-09-07T14:06:52.727092+00:00`; exit0; [03b-jena-verify-owned-cache.log](/tmp/ena-41-task-controller-20260905/task40-writer/03b-jena-verify-owned-cache.log); SHA256 `cded04169a8d44087a41afd7280cb69cb25b5114cec768bb101e6748a5f3e899` | Full686+pack20 and pack-check;0skip at predecessor0b6f5db | Earlier outcome; exact cwd/env/status in [03b-jena-verify-owned-cache.json](/tmp/ena-41-task-controller-20260905/task40-writer/03b-jena-verify-owned-cache.json) |
| `npm run test:app` | Fail | `2026-09-07T14:06:58.432492+00:00` → `2026-09-07T14:08:00.271608+00:00`; exit1; [04-test-app.log](/tmp/ena-41-task-controller-20260905/task40-writer/04-test-app.log); SHA256 `0d584d8425f13907ef2e74fe8151f0ea117014bab33a0407768d23882045fb5b` | 2649 tests/2638pass/11fail/0skip;3 stale contracts and8 sandbox failures | Earlier outcome; exact cwd/env/status in [04-test-app.json](/tmp/ena-41-task-controller-20260905/task40-writer/04-test-app.json) |
| `node --import tsx --test tests/open-ena-ci-browser-contract.test.ts tests/open-ena-code-color-presets-browser-smoke-contract.test.ts tests/open-ena-official-v207-shell-regression.test.ts` | Fail | `2026-09-07T14:11:02.747071+00:00` → `2026-09-07T14:11:03.296398+00:00`; exit1; [04a-stale-contract-red.log](/tmp/ena-41-task-controller-20260905/task40-writer/04a-stale-contract-red.log); SHA256 `4b94781eeb47d17eaf061b9eed2a75bcda94fdd634ab2d246a4ea956b31c2320` | 33tests/30pass/3fail/0skip targeted original RED | Earlier outcome; exact cwd/env/status in [04a-stale-contract-red.json](/tmp/ena-41-task-controller-20260905/task40-writer/04a-stale-contract-red.json) |
| `node --import tsx --test tests/open-ena-ci-browser-contract.test.ts tests/open-ena-code-color-presets-browser-smoke-contract.test.ts tests/open-ena-official-v207-shell-regression.test.ts` | Fail | `2026-09-07T14:12:14.053565+00:00` → `2026-09-07T14:12:14.652762+00:00`; exit1; [04b-stale-contract-green.log](/tmp/ena-41-task-controller-20260905/task40-writer/04b-stale-contract-green.log); SHA256 `f6b9bfc2d49760c8751935e66dbcd82e0e8bbfc682f52a9f2d811905d3b94067` | 33tests/31pass/2fail/0skip; filename green does not change actual failure | Earlier outcome; exact cwd/env/status in [04b-stale-contract-green.json](/tmp/ena-41-task-controller-20260905/task40-writer/04b-stale-contract-green.json) |
| `node --import tsx --test tests/open-ena-ci-browser-contract.test.ts tests/open-ena-code-color-presets-browser-smoke-contract.test.ts tests/open-ena-official-v207-shell-regression.test.ts` | Pass | `2026-09-07T14:12:37.247325+00:00` → `2026-09-07T14:12:37.824802+00:00`; exit0; [04c-stale-contract-green.log](/tmp/ena-41-task-controller-20260905/task40-writer/04c-stale-contract-green.log); SHA256 `745e27456c117fb46374eabb8ccce56dac7bd72557317667cd196ac17aef389c` | 33/33,0skip on three dirty repaired tests | Earlier outcome; exact cwd/env/status in [04c-stale-contract-green.json](/tmp/ena-41-task-controller-20260905/task40-writer/04c-stale-contract-green.json) |
| `npm run typecheck:app` | Fail | `2026-09-07T14:12:55.055837+00:00` → `2026-09-07T14:13:00.653521+00:00`; exit2; [04d-repair-typecheck.log](/tmp/ena-41-task-controller-20260905/task40-writer/04d-repair-typecheck.log); SHA256 `4fd91d89178cdd6ec8f1e6aaa385460c149c3792b905fed65d9ae9178af06b86` | Exit2 TS1501: Task39 dotAll regex incompatible with ES2017 | Earlier outcome; exact cwd/env/status in [04d-repair-typecheck.json](/tmp/ena-41-task-controller-20260905/task40-writer/04d-repair-typecheck.json) |
| `node --import tsx --test tests/open-ena-ci-browser-contract.test.ts tests/open-ena-code-color-presets-browser-smoke-contract.test.ts tests/open-ena-official-v207-shell-regression.test.ts tests/open-ena-model-v3-documentation.test.ts` | Pass | `2026-09-07T14:15:02.634054+00:00` → `2026-09-07T14:15:03.215646+00:00`; exit0; [04e-four-contract-green.log](/tmp/ena-41-task-controller-20260905/task40-writer/04e-four-contract-green.log); SHA256 `fae8fda05742cf41cbc249793e3bcac28f1345daf1ee53893dfd922346b05aef` | 36/36,0skip on final four repaired tests | Earlier outcome; exact cwd/env/status in [04e-four-contract-green.json](/tmp/ena-41-task-controller-20260905/task40-writer/04e-four-contract-green.json) |
| `npm run typecheck:app` | Pass | `2026-09-07T14:15:03.422724+00:00` → `2026-09-07T14:15:04.693080+00:00`; exit0; [04f-four-repair-typecheck.log](/tmp/ena-41-task-controller-20260905/task40-writer/04f-four-repair-typecheck.log); SHA256 `65e7fccc29746dc099af1cfdfb80519c664218fee866932d7796dfe7057b123d` | Exit0 on final four repaired tests | Earlier outcome; exact cwd/env/status in [04f-four-repair-typecheck.json](/tmp/ena-41-task-controller-20260905/task40-writer/04f-four-repair-typecheck.json) |

## Task40 fresh complete gates

All six commands ran sequentially on clean `f1f735601c568fba2e2ac79cb6331653a7c95a8e`, tree `1e569e2fc36de9f946d93c4e6b83c6e3d2a3e3d5`.
Source 832 entries include unchanged j-3dENA gitlink 47e05006ff5308b6cb857111c2114e47e7bdfc6d.
The physical manifest pretty-JSON SHA256 is
7006cfa6272864590d4b381731a721fcc0ba861ce709a44a2e116648239895c0; the browser's compact-JSON
serialization of the same entries is 17087c1acf709d5631bb936ff9207fb3c30fb945cd6ced18ddb87af8a0ac579a.
Actual argv, literal cwd, PATH, timestamps, exits and source manifests are linked.
Explicit environment overrides: NEXT_TELEMETRY_DISABLED=1;
npm_config_cache=/tmp/ena-41-task-controller-20260905/task40-writer/npm-cache;
OPEN_ENA_MODELS_V3_ARTIFACT_ROOT=/tmp/ena-41-task-controller-20260905/task40-writer.
The browser internally creates its own cache/auth environment; credentials are
not recorded. Node v24.15.0; npm 11.16.0 at /Users/dongpinhu/.npm-global/bin/npm.

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| `npm run jena:verify` | Pass, exit0 | `2026-09-07T14:15:56.855949+00:00` → `2026-09-07T14:16:08.577825+00:00`; [07-frozen-jena-verify.log](/tmp/ena-41-task-controller-20260905/task40-writer/07-frozen-jena-verify.log); SHA256 `7c34c64b9583b68d6a1427176811f9678d90d2ea3e17172a918f206c1822abea`; [07-frozen-jena-verify.json](/tmp/ena-41-task-controller-20260905/task40-writer/07-frozen-jena-verify.json) | 686/686 in29 files; frozen baseline35/current rENA0.4.4 parity98; pack20/20; pack-check45 files;0 skips | Exact tested source above; no final-review or production claim |
| `npm run test:app` | Pass, exit0 | `2026-09-07T14:16:27.055308+00:00` → `2026-09-07T14:16:59.875965+00:00`; [08-frozen-test-app.log](/tmp/ena-41-task-controller-20260905/task40-writer/08-frozen-test-app.log); SHA256 `7698013db5bd1452a4c2fccfff86cd3f43db247ec2b619947787451c97654d44`; [08-frozen-test-app.json](/tmp/ena-41-task-controller-20260905/task40-writer/08-frozen-test-app.json) | 2649/2649;0 fail/skip/cancel/todo; both private Yu safe gates passed | Exact tested source above; no final-review or production claim |
| `npm run typecheck:app` | Pass, exit0 | `2026-09-07T14:17:08.980293+00:00` → `2026-09-07T14:17:10.219731+00:00`; [09-frozen-typecheck.log](/tmp/ena-41-task-controller-20260905/task40-writer/09-frozen-typecheck.log); SHA256 `65e7fccc29746dc099af1cfdfb80519c664218fee866932d7796dfe7057b123d`; [09-frozen-typecheck.json](/tmp/ena-41-task-controller-20260905/task40-writer/09-frozen-typecheck.json) | tsc --noEmit exit0 against ES2017 | Exact tested source above; no final-review or production claim |
| `npm run build:app` | Pass, exit0 | `2026-09-07T14:17:24.896910+00:00` → `2026-09-07T14:17:37.660244+00:00`; [10-frozen-build-app.log](/tmp/ena-41-task-controller-20260905/task40-writer/10-frozen-build-app.log); SHA256 `4d6da0c4979f0e1495d9c435ddb48f1a8f8e001d94bc53cf3f1a8a5188f5fce5`; [10-frozen-build-app.json](/tmp/ena-41-task-controller-20260905/task40-writer/10-frozen-build-app.json) | Supported prebuild guard and Next build3368/3368; applied Plotly unchanged | Exact tested source above; no final-review or production claim |
| `npm run test:browser:open-ena-models-v3` | Pass, exit0 | `2026-09-07T14:17:54.190656+00:00` → `2026-09-07T14:19:45.706078+00:00`; [11-frozen-models-browser.log](/tmp/ena-41-task-controller-20260905/task40-writer/11-frozen-models-browser.log); SHA256 `e4b1958d85e51418fe1202159fd256820f0706725cfd51fb595d40fde925126a`; [11-frozen-models-browser.json](/tmp/ena-41-task-controller-20260905/task40-writer/11-frozen-models-browser.json) | Fresh owned build/server/Postgres/Chromium;15 journeys;172 reachability checks;153 responses;14 public image views | Exact tested source above; no final-review or production claim |
| `npm run verify` | Pass, exit0 | `2026-09-07T14:21:21.646694+00:00` → `2026-09-07T14:23:49.212117+00:00`; [12-frozen-full-verify.log](/tmp/ena-41-task-controller-20260905/task40-writer/12-frozen-full-verify.log); SHA256 `5a015cf5263215d41a2ce75a8a17470b41262c43922ae9b53fb4b922b2f28fd2`; [12-frozen-full-verify.json](/tmp/ena-41-task-controller-20260905/task40-writer/12-frozen-full-verify.json) | Actual complete chain: package686,pack20,receipt tests230,app2649,typecheck/build3368;0 skips | Exact tested source above; no final-review or production claim |

Dedicated Models receipt: [receipt.json](/tmp/ena-41-task-controller-20260905/task40-writer/task37-models-v3-b77MSU/receipt.json); SHA256 `cf67ceb4e6ccf0eb0d1855ca40cc7665b6730d9dbb9396b54ffa58e415e1323f`.
Its task37-prefixed directory is the existing harness's actual fresh Task40 output,
not an old run or relocated receipt. Fresh owned build ID crJuJa-6TWFHZRRnWa9Sq,
build-content digest c0358dbb684671eaecd8ffe735888bc31f512072276aa80d57ad6598f423d072; Playwright 1.62.1 used actual
Chromium 151.0.7922.34 revision 1234. All 15 journeys passed with 172 actual control
reachability checks, 153 response bodies matching 8 built paths, 0 unexpected errors,
0 failed requests,0 classified cancellations and0 cleanup errors.
The receipt validator within npm run verify is syntax/unit coverage, not a real
browser journey; the separate required browser gate actually ran.

All 14 public screenshots were actually viewed by the implementation agent:
[visual-inspection.json](/tmp/ena-41-task-controller-20260905/task40-writer/visual-inspection.json); SHA256 `54557e091875ab51411ca899527221611c92b68f614289682abe4b632f566e7b`.
The original receipt's automatic visualInspection pending field is preserved;
this separate actor/timestamp record covers subsequent actual image views.
Long full-page images displayed resized; separate viewport images show focused
Plot/Windows controls. Dense scientific-label overlaps remain visible.
Served journeys are English; historical three-locale SSR/catalog and older Task32
Chinese browser claims remain distinct. CSS200 means CSS zoom2, not native browser
zoom. No human visual approval is implied.

Independent cleanup: [browser-physical-cleanup.json](/tmp/ena-41-task-controller-20260905/task40-writer/browser-physical-cleanup.json); SHA256 `9d1b081c450f38460570d0b831dced5fc186b3836e0deeeb840effbe5c1c4423`.
All 23 recorded owned PIDs were absent, ports 52915 / 52922 / 52918 each returned actual
ECONNREFUSED, and owned PostgreSQL/profile directories were removed.

Both private Yu safe gates actually passed in each fresh full app suite with 0
skips: 87 Units / 174 rows / 7 Codes / 49 dimensions / 3 zero-network Units / 811 raw connections and
0 mismatched cells. No private identifiers, source rows or images were recorded.
Task38's 74self-loop browser result remains historical, not an extra fresh Task40
private-browser claim. All public/core tests passed; no scientific skips occurred.

The jENA frozen/current vendor contract is unchanged. Separately, installed
Plotly 3.7.0 retains the approved four exact substitutions for two disposal omissions:
upstream fa6ebaf365ea5ad46a9843ea98fb2635c998558b9d876578aa12f765f823cc3d versus
applied cc2f875652ac1fca82bd7e42594bcf309efc2e37019a9f5b542546e63576654c.
Supported npm builds ran the prebuild guard with changed: false.
Task40 did not rerun Task38's five separate affected browser gates; their accepted
receipts remain historical while all application tests ran afresh.

### Tested content and final ledger commit bridge

Broad gates belong to the clean tested SHA above. The only later source edit is
this ledger. Its enclosing commit and postcommit handoff identify the exact final
SHA; no gate is attributed to an unknown future SHA. Final documentation tests,
both local Markdown renderers, whitespace/status and manifests are captured after
this evidence edit. The bridge requires all 831 other source entries and installed
Plotly bytes to match the tested manifest. All 101 original command strings and
five contiguous five-column register tables remain present. The final topology,
scoped commit and content bridge are sealed in
[task40-implementation-handoff.md](/tmp/ena-41-task-controller-20260905/task40-writer/task40-implementation-handoff.md).
These are local temporary artifacts, not committed or remotely durable evidence.
A hash identifies bytes; it cannot recover missing temporary files.

Both fresh full-app runs also passed all 16 owned lifecycle fault probes. Separate
physical checks confirmed their 48 recorded PIDs absent and 16 ports returning
actual ECONNREFUSED: [full-gates-lifecycle-cleanup.json](/tmp/ena-41-task-controller-20260905/task40-writer/full-gates-lifecycle-cleanup.json); SHA256
`6926d43d5ff23be434d9f11c1e825a631a058ade660ad33dac6c37c3ced3528b`.

## Local, remote and release boundaries

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Local files | Written; complete gates Pass | Four-test append `f1f735601c568fba2e2ac79cb6331653a7c95a8e`; final ledger-only evidence edit | Task40 independent review pending | Tested-content bridge above |
| Local commit | Tested candidate committed | `f1f735601c568fba2e2ac79cb6331653a7c95a8e`; ledger append identified by enclosing Git history and handoff | Broad gates bind tested candidate; ledger commit separate | Local only; no independent acceptance implied |
| GitHub branch | Pass | 3aea9a934787fe44ade1082980dc6293e00f3d87; [13-preledger-live-remote.log](/tmp/ena-41-task-controller-20260905/task40-writer/13-preledger-live-remote.log); SHA256 `eb142fa88fe7132f8291dd89839f4b578814aa1ba8fd926e38a3d25cca10dd49` | Live comparison ref codex/minor-UI-changes; exit0; `2026-09-07T14:26:21.509517+00:00` | No remote equality or mutation claim |
| PR | Not performed | No PR created by this task chain | Not authorized in this local scope | No PR/merge claim |
| Deployment | Not performed | No deployment receipt | Not authorized | No deployment claim |
| Production | Not performed | No deployed-production build/health receipt | Not authorized | No production claim |
| Authenticated production | Not performed | Local authenticated browser fixtures are separate | No authorized production session/receipt | No authenticated production claim |
| Final whole-goal independent SPEC → QUALITY | Pending | All41 original requirements need final current matrix | Per-task approval and navigation indexes are not final whole-goal review | No complete-goal claim |

Task40 actual full app, typecheck, build:app, jena:verify, served Models browser
and complete verify receipts are above, including failures/skips and tested
content custody. Postcommit final Git facts are separately sealed in the handoff.
The original remote-navigation command names `codex/minor-UI-changes`; that is a
specified comparison ref, not this worktree's branch and not proof of its remote
state. GitHub mutation, PR, merge, deployment and production remain outside scope.

| Command or boundary | Status | Evidence | Skip/Failure reason | Claim allowed |
| --- | --- | --- | --- | --- |
| Task40: `git diff --check` | Pass | [05-frozen-whitespace.log](/tmp/ena-41-task-controller-20260905/task40-writer/05-frozen-whitespace.log); exit0; `2026-09-07T14:15:56.302368+00:00` | Clean tested f1f7356; final ledger-byte checks and postcommit status in handoff | Literal local Git only |
| Task40: `git status --short --branch` | Pass | [06-frozen-status.log](/tmp/ena-41-task-controller-20260905/task40-writer/06-frozen-status.log); exit0; `2026-09-07T14:15:56.581721+00:00` | Clean tested f1f7356; final ledger-byte checks and postcommit status in handoff | Literal local Git only |
| Task40: `git rev-parse HEAD` | Pass | [14-preledger-topology.json](/tmp/ena-41-task-controller-20260905/task40-writer/14-preledger-topology.json) | Tested f1f7356 snapshot; postcommit final values separately sealed | Local topology only |
| Task40: `git log --oneline --decorate -12` | Pass | [14-preledger-topology.json](/tmp/ena-41-task-controller-20260905/task40-writer/14-preledger-topology.json) | Tested f1f7356 snapshot; postcommit final values separately sealed | Local topology only |
| Task40: `git ls-remote --heads origin codex/minor-UI-changes` | Pass | [13-preledger-live-remote.log](/tmp/ena-41-task-controller-20260905/task40-writer/13-preledger-live-remote.log); SHA256 `eb142fa88fe7132f8291dd89839f4b578814aa1ba8fd926e38a3d25cca10dd49` | Exit0; 3aea9a934787fe44ade1082980dc6293e00f3d87; postcommit query separately sealed | No cached-ref substitution; separate comparison branch |
