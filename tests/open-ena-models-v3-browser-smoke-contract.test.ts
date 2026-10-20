import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

test("package exposes a bounded Models v3 browser gate", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["test:browser:open-ena-models-v3"], "node tests/open-ena-models-v3-browser-smoke.mjs");
  const source = readFileSync("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
  assert.match(source, /page\.on\("console"/u);
  assert.match(source, /page\.on\("pageerror"/u);
  assert.match(source, /Exclude all selected Codes/u);
  assert.match(source, /executionPlanSha256/u);
  assert.match(source, /screenshot/u);
});

test("the maintained production browser gate follows current build and sample controls", () => {
  const source = readFileSync("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
  const workspace = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
  const copy = getOpenEnaCopy("en");
  assert.equal(copy.model.run, "Build ENA model");
  assert.equal(copy.model.rerun, "Rebuild model");
  assert.match(workspace, /data-testid="open-ena-run-model"/u);
  assert.match(source, /const modelRun = \(\) => page\.getByTestId\("open-ena-run-model"\)/u);
  assert.doesNotMatch(source, /button\("Run model"\)/u, "first build and rebuild share the stable control identity");
  assert.match(source, new RegExp(`button\\("${copy.modelV3.workspace.data.loadSample}"\\)\\.click\\(\\)`));
  assert.doesNotMatch(source, /button\("Load teaching sample"\)/u);
});

test("the maintained production gate explicitly opens moved artifact/import disclosures", () => {
  const source = readFileSync("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
  const workspace = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
  assert.match(workspace, /<details className="ena-panel-details ena-artifacts-disclosure"><summary>/u);
  assert.match(workspace, /<details className="ena-panel-details ena-data-import-details"><summary>/u);
  assert.match(source, /async function openDisclosure\(selector\)/u);
  assert.match(source, /if \(!await disclosure\.evaluate\(node => node\.open\)\) await disclosure\.locator\(":scope > summary"\)\.click\(\)/u);
  assert.match(source, /async function download\(name, filename\) \{ await openDisclosure\("\.ena-artifacts-disclosure"\)/u);
  assert.match(source, /if \(name === "Data"\) await openDisclosure\("\.ena-artifacts-disclosure"\)/u);
  assert.match(source, /await openDisclosure\("\.ena-data-import-details"\);\s*await page\.getByLabel\("Import configuration, result or Reference"/u);
  assert.doesNotMatch(source, /getByRole\("heading", \{ name: "Artifacts"/u);
});

test("login cancellation classifier rejects all near misses", async () => {
  // @ts-expect-error Dependency-free Node ESM harness helper.
  const { expectedLoginPrefetchCancellation } = await import("./helpers/open-ena-models-v3-browser-custody.mjs");
  const login = { startedAt: 100, finishedAt: 150 };
  const expected = { startedAt: 90, failedAt: 110, text: "net::ERR_ABORTED", method: "GET", resourceType: "fetch", navigation: false, rsc: "1", prefetch: "1", path: "/en/news" };
  assert.equal(expectedLoginPrefetchCancellation(expected, login), true);
  for (const patch of [{ startedAt: 101 }, { failedAt: 151 }, { failedAt: 99 }, { prefetch: null }, { rsc: null }, { navigation: true }, { resourceType: "script" }, { method: "POST" }, { path: "/api/open-ena/run" }, { text: "net::ERR_FAILED" }]) {
    assert.equal(expectedLoginPrefetchCancellation({ ...expected, ...patch }, login), false, JSON.stringify(patch));
  }
});

test("strict import sets its own visible scientific draft after source replacement", () => {
  const source = readFileSync("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
  const setup = source.slice(source.indexOf("async function strictSourceBoundaries()"), source.indexOf("async function journeys()"));
  assert.match(setup, /await tab\("Units"\)\.click\(\)/u);
  assert.ok(setup.includes('while (await unitFields.getByRole("button", { name: /^Remove /u }).count())'));
  assert.ok(setup.includes('while (await horizonFields.getByRole("button", { name: /^Remove /u }).count())'));
  assert.match(setup, /button\("Exclude all selected Codes"\)\.click\(\)/u);
  for (const value of ["EndPoint", "svd", "MovingStanzaWindow"]) assert.ok(setup.includes(`.selectOption("${value}")`));
  assert.ok(setup.indexOf('getByLabel("Binary", { exact: true }).check()') < setup.indexOf('button("Exclude all selected Codes").click()'), "Code admission is explicitly Binary before inspecting its eligibility");
  assert.match(setup, /assert\.deepEqual\(binary\.request\.plan\.configuration\.units\.columns, \["team_id"\]\)/u);
  assert.match(setup, /assert\.deepEqual\(binary\.request\.plan\.configuration\.horizons\.columns, \["conversation_id"\]\)/u);
  assert.match(setup, /ordinary upload cannot autorun/u);
  assert.match(setup, /Boolean Code cannot silently coerce to frequency/u);
  assert.match(setup, /fraction must not silently coerce to Binary/u);
});

test("every source-order confirmation opens the current Standard disclosure through its summary", () => {
  const source = readFileSync("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
  const helper = source.slice(source.indexOf("async function confirmSourceOrder()"), source.indexOf("async function mode("));
  assert.equal((source.match(/await confirmSourceOrder\(\)/gu) ?? []).length, 4, "strict import plus journeys 8, 9 and 12 share the visible workflow");
  assert.equal((source.match(/getByLabel\("Use source order"/gu) ?? []).length, 1, "no hidden-control bypass remains outside the shared workflow");
  assert.equal((helper.match(/await openDisclosure\("\.ena-row-order-disclosure"\)/gu) ?? []).length, 2, "open before source-mode selection and before its explicit review");
  assert.match(helper, /getByRole\("dialog", \{ name: "Review source-order statement", exact: true \}\)\.getByRole\("button", \{ name: "Accept statement", exact: true \}\)\.click\(\)/u);
  assert.doesNotMatch(helper, /force:|\.open\s*=|setAttribute/u, "the workflow must use the researcher's visible controls");
});
