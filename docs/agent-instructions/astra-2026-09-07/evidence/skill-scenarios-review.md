# Independent dry-run skill scenario review — final

Outcome: PASS for the three bounded instruction-use scenarios. The four conflicts found in the initial pass are resolved in the latest staged bytes. This is static instruction review; it does not certify a working browser CLI, generated test pass, Phaser rendering, or deployed application behavior.

## Resources loaded and current hashes

- `revised/playwright-current/SKILL.md` — SHA-256 `3938d42ffa775c1430ed1c301d187daa9eae969966b27a43cbb2c07638b2266c`.
- `revised/playwright-current/references/playwright-tests.md` — SHA-256 `c5b0719fef2cfdff50bd744051b2f9afc119775db4b48e9b2882c1cf3886797c`.
- `revised/playwright-current/references/test-generation.md` — SHA-256 `bcee94a2ae74eda5ba5f569aa4688ec54b4f045d1b7adb80052bd4211c1476bf`.
- `revised/playwright-current/references/session-management.md` — SHA-256 `2d066070b18af4ced5b14d05c47d668e8e3c1ab212c38ee2b707d28a747b4b17`.
- `revised/playwright-legacy/references/session-management.md` — SHA-256 `7d52fa2d9fe13c539f09773eca4bb6bc14bdfd42f3bf75655505e70f87707a8f`.
- `revised/phaser/v4-new-features/SKILL.md` — SHA-256 `88e3a2252bee5e5cb0c41f1f8c812eda699e8faa3a3ef08f4e35fd5f023647ea`.
- `revised/phaser/v4-new-features/references/noise.md` — SHA-256 `01925f922f1f7adfff92cb01e1fdfd1d788f46f3ed9cfce6a28771305b5bb688`.

The current Playwright entrypoint, test/debug reference, test-generation reference, session-management reference, Phaser entrypoint, and Noise reference were read for the initial scenarios. The repaired clauses in the current generation and current/legacy session-management references were reread for final acceptance. The legacy session-management file was checked only for the repaired cleanup clauses. No Phaser overview, migration guide, filter API, RenderNodes document, or unrelated feature reference was required. No Playwright video, tracing, mocking, storage-state, command-reference, or CLI-examples document was required; storage-state would be loaded if actual saving/restoring authentication became necessary.

## Scenario 1: supplied login test failure after a label change

Request: “CI reports tests/login.spec.ts:42 failed after a label change; the current failure log is supplied. Help me repair that test.”

Decision trace: use Playwright SKILL -> test-generation section 3 (Heal), with playwright-tests for configured debug/attach mechanics when interactive diagnosis is needed. Under test-generation:372-378, start from the supplied current failure and target the named test. Do not first rediscover all suite failures, create a new scenario plan, or load unrelated workflows. In actual execution, inspect the test, intended label change, applicable specification, and fixture/auth/hook/feature-flag setup. Distinguish a stale locator from an application regression; preserve login outcome assertions. If page evidence is needed, run the selected test through its configured setup, use the printed session name, and inspect the relevant paused state. A possible targeted invocation is `PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/login.spec.ts:42 --debug=cli`; it was not executed here.

After an authorized narrow repair, rerun the affected configured test and broaden only when changed scope or project gates require it. Do not bypass authentication/hooks, insert arbitrary sleeps, redefine product expectations to match a regression, or suppress a failing test merely because the user confirms a bug. The final acceptance-contract and explicit-deferral clauses now enforce this distinction. Unresolved intended behavior requires a concrete clarification; independent technical investigation can still progress. No actual log/test/app was supplied to this dry-run reviewer, so no real failure diagnosis or test result is claimed.

## Scenario 2: two independently seeded scenarios

Request: “Generate two scenarios from distinct seeds with separate accounts, files and mutable datasets.”

Decision trace: use generation section 2 and named-session guidance. Sections 2.2 and 2.3 allow concurrent generation for distinct sessions and isolated mutable state. Give each seed its own background test process and printed attach-session identity; scope commands to that session and serialize operations within it. The repaired cleanup sentence requires finishing and cleaning up an owned scenario before reusing its resources; it no longer serializes independent scenarios globally. Close only task-created sessions/processes, detach externally attached browsers, and run each generated test through its assigned configured setup.

Still inspect shared profiles/storage-state files, inherited default CLI session variables, global fixtures/setup/teardown, tenant-wide or global feature flags, database resets, server caches, report/trace/download destinations, app ports/build output, and cleanup routines. Separate accounts/files/datasets do not isolate a global reset or process cleanup command. Read-only app code and immutable fixtures may remain shared. Isolate any remaining mutable dependency or serialize only conflicting operations. The repaired current and legacy session-management examples close site1/site2/site3 individually; `close-all`/`kill-all` are usable only when existing authorization covers every affected session. They do not require asking again for authority already granted.

## Scenario 3: minimum Phaser 4 Noise background

Request: “I want a Phaser 4 Noise background; explain the minimum setup.”

Decision trace: use v4-new-features -> references/noise.md only. The entrypoint identifies Phaser 4.1.0 and routes directly to Noise; this request does not require the Phaser-3 migration, filter, RenderNode, or other feature documents.

Minimum supported explanation: use a Phaser 4.1.0 Scene with WebGL because Noise extends Shader and is WebGL-only. Add `this.add.noise({ noiseOffset: [0, 0], noisePower: 1 }, x, y, width, height)` for white noise, using the desired background rectangle. `noiseSimplex2D` is an optional alternative for cloud/water-like patterns; cellular noise is another optional alternative. A custom rendering pipeline, lighting normal map, or 3D noise setup is not necessary for the stated request. The exact object factory/options and WebGL restriction remain available without loading unrelated API inventories. No package install, application implementation, or visual validation was performed.

## Reassessment of the four initial findings

- RESOLVED — current test-generation:303 now treats the specification and approved requirements as the acceptance contract, uses live behavior as evidence, and allows changed expectations only when task instructions or an accepted decision establish intent. Possible regressions retain their expectations.
- RESOLVED — current test-generation:425 retains confirmed application-bug coverage and permits `test.fixme(...)` only when existing user authorization explicitly allows deferral, with a decision/issue link. Bug confirmation alone is explicitly insufficient.
- RESOLVED — current test-generation:348 now closes each finished scenario's session/process before resource reuse, consistent with concurrent isolated scenarios at :293/:352.
- RESOLVED — current and legacy session-management concurrent examples close only the three sessions created by that task. Their cleanup guidance limits broad close/kill commands to already-authorized all-target scope and explicitly reuses existing authorization.

The router's configured-authentication, credential-confidentiality, fixture/hook, acceptance-criteria, and session-ownership requirements remain intact. No actionable blocker remains in these reviewed clauses for the three scenarios. The review is intentionally bounded; it is not a new audit of every unchanged reference instruction.

Change note: after the initial findings, root repaired the four subordinate-reference conflicts. This final report supersedes the initial report and records current hashes. No staged docs were edited by this reviewer. No browser/app/account/network/test actions were executed. The only write by this reviewer in the reassessment was this validation artifact; root owns separate official-validator evidence.
