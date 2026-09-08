import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
