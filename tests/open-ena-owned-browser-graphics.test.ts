import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const runtime = await import(join(root, "tests/helpers/open-ena-served-browser-v3.mjs"));
const origin = "http://127.0.0.1:31987";

test("owned CI browser explicitly opts into software WebGL for its synthetic loopback server", () => {
  assert.equal(typeof runtime.ownedBrowserGraphicsV3, "function", "the owned launcher must resolve an explicit graphics mode");
  const graphics = runtime.ownedBrowserGraphicsV3({ mode: "swiftshader", baseUrl: origin });
  assert.deepEqual(graphics, {
    mode: "swiftshader",
    trustedOrigin: origin,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
});

test("software WebGL opt-in rejects external, credential-bearing, or non-origin destinations", () => {
  assert.equal(typeof runtime.ownedBrowserGraphicsV3, "function");
  for (const baseUrl of ["https://www.ena.hk", "http://127.0.0.1.attacker.test:31987", "http://user@127.0.0.1:31987", `${origin}/path`, `${origin}?remote=true`]) {
    assert.throws(() => runtime.ownedBrowserGraphicsV3({ mode: "swiftshader", baseUrl }), /owned loopback origin/u);
  }
});

test("ordinary local browser runs keep their default graphics settings and reject unknown modes", () => {
  assert.equal(typeof runtime.ownedBrowserGraphicsV3, "function");
  assert.deepEqual(runtime.ownedBrowserGraphicsV3({ baseUrl: origin }), { mode: "default", args: [] });
  assert.throws(() => runtime.ownedBrowserGraphicsV3({ mode: "ignore-warnings", baseUrl: origin }), /graphics mode/u);
});

test("CI selects the software profile while all unexpected console warnings remain failures", () => {
  const workflow = readFileSync(join(root, ".github/workflows/open-ena-ci.yml"), "utf8");
  assert.match(workflow, /OPEN_ENA_BROWSER_GRAPHICS:\s*swiftshader/u);
  const smoke = readFileSync(join(root, "tests/open-ena-3d-controls-browser-smoke.mjs"), "utf8");
  assert.match(smoke, /assert\.deepEqual\(browserErrors\.unknownWarnings, \[\], "browser console contains unclassified warnings"\)/u);
  assert.doesNotMatch(smoke, /Automatic fallback to software WebGL/u);
});
