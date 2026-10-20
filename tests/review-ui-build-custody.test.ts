import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
// @ts-expect-error Dependency-free Node ESM browser harness helper.
import { immutableBuildManifestV3 } from "./helpers/open-ena-build-custody-v3.mjs";

const compiled = ["BUILD_ID", "static/chunks/app.js", "static/chunks/worker.js", "static/css/app.css",
  "server/app/en/page.js", "server/app/en/page.html", "server/app/en/page.rsc", "server/app/api/route.js",
  "server/chunks/runtime.js", "server/server-reference-manifest.json", "server/route-cache.js",
  "server/route-cache-neighbor/compiled.js", "server/app/route-cache/page.js", "static/cache/compiled.js"];
function fixture(run: (root: string, write: (path: string, value: string) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), "ena-build-custody-"));
  const write = (path: string, value: string) => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); };
  try { for (const path of compiled) write(path, `compiled:${path}`); run(root, write); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("Next scoped response cache additions and changes do not alter compiled custody", () => fixture((root, write) => {
  const before = immutableBuildManifestV3(root);
  for (const path of ["server/route-cache/APP_PAGE/hash/$/en.html", "server/route-cache/APP_PAGE/hash/$/en.meta",
    "server/route-cache/APP_PAGE/hash/$/en.rsc", "server/route-cache/APP_PAGE/hash/$/en.segments/_full.segment.rsc",
    "server/route-cache/APP_ROUTE/hash/$/icon.svg.body", "server/route-cache/APP_ROUTE/hash/$/icon.svg.meta"]) write(path, "runtime response");
  assert.deepEqual(immutableBuildManifestV3(root), before);
  write("server/route-cache/APP_PAGE/hash/$/en.html", "revalidated response");
  assert.deepEqual(immutableBuildManifestV3(root), before);
}));

test("all compiled server/client/worker/style files, nearby paths and BUILD_ID remain immutable", () => fixture((root, write) => {
  const before = immutableBuildManifestV3(root);
  assert.deepEqual(before.map((entry: { path: string }) => entry.path).sort(), [...compiled].sort());
  for (const path of compiled) {
    write(path, "changed compiled bytes");
    assert.throws(() => assert.deepEqual(immutableBuildManifestV3(root), before), assert.AssertionError, path);
    write(path, `compiled:${path}`);
  }
  write("server/new-compiled.js", "unexpected compiled file");
  assert.throws(() => assert.deepEqual(immutableBuildManifestV3(root), before), assert.AssertionError);
}));

test("existing runtime cache, diagnostics and traces stay outside compiled custody", () => fixture((root, write) => {
  const before = immutableBuildManifestV3(root);
  for (const path of ["cache/fetch-cache/key", "diagnostics/build-diagnostics.json", "trace", "trace-build"]) write(path, "runtime");
  assert.deepEqual(immutableBuildManifestV3(root), before);
}));

test("traced node_modules symlinks retain their deployed dependency bytes", () => fixture(root => {
  const dependency = mkdtempSync(join(tmpdir(), "ena-build-dependency-"));
  try {
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(dependency, "index.js"), "deployed dependency");
    symlinkSync(dependency, join(root, "node_modules/pg-fixture"), "dir");
    const before = immutableBuildManifestV3(root);
    assert.ok(before.some((entry: { path: string }) => entry.path === "node_modules/pg-fixture/index.js"));
    writeFileSync(join(dependency, "index.js"), "changed dependency");
    assert.throws(() => assert.deepEqual(immutableBuildManifestV3(root), before), assert.AssertionError);
  } finally { rmSync(dependency, { recursive: true, force: true }); }
}));

test("both served browser runtimes use the same complete before/after build manifest", () => {
  for (const path of ["tests/open-ena-models-v3-browser-smoke.mjs", "tests/helpers/open-ena-served-browser-v3.mjs"]) {
    const source = readFileSync(path, "utf8");
    assert.equal((source.match(/immutableBuildManifestV3\(join\(root, "\.next"\)\)/gu) ?? []).length, 2, `${path}: before and after`);
    assert.match(source, /assert\.deepEqual\(immutableBuildManifestV3\(join\(root, "\.next"\)\),/u);
    assert.doesNotMatch(source, /function treeManifest/u, "no stale parallel exclusion policy");
  }
});
