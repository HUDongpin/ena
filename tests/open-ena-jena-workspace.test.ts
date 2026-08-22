import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const snapshotRoot = join(projectRoot, "packages", "jena-js");
const expectedVersion = "0.7.0-ona.0";
const expectedSourceSha = "303a12f549ef9e1914cec10d6e9e1b842dad8908";

function json(relativePath: string) {
  return JSON.parse(readFileSync(join(projectRoot, relativePath), "utf8")) as Record<string, unknown>;
}

test("Open ENA consumes the reviewed jENA source snapshot as an exact-version npm workspace", () => {
  const rootPackage = json("package.json") as {
    workspaces?: string[];
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const snapshotPackage = json("packages/jena-js/package.json") as {
    name?: string;
    version?: string;
    private?: boolean;
    license?: string;
  };

  assert.deepEqual(rootPackage.workspaces, ["packages/jena-js"]);
  assert.equal(rootPackage.dependencies?.["jena-js"], expectedVersion);
  assert.equal(snapshotPackage.name, "jena-js");
  assert.equal(snapshotPackage.version, expectedVersion);
  assert.equal(snapshotPackage.private, true, "the vendored workspace must be non-publishable from Open ENA");
  assert.equal(snapshotPackage.license, "GPL-3.0-only");

  assert.equal(rootPackage.scripts?.["jena:build"], "npm run build --workspace=jena-js");
  assert.match(rootPackage.scripts?.["jena:verify"] ?? "", /lint --workspace=jena-js/);
  assert.match(rootPackage.scripts?.["jena:verify"] ?? "", /test:pack-contract --workspace=jena-js/);
  assert.match(rootPackage.scripts?.["jena:verify"] ?? "", /pack:check --workspace=jena-js/);
  assert.equal(rootPackage.scripts?.["test:app"], "tsx --test tests/*.test.ts");
  assert.equal(rootPackage.scripts?.["typecheck:app"], "tsc --noEmit");
  assert.equal(rootPackage.scripts?.["build:app"], "next build");
  assert.equal(rootPackage.scripts?.dev, "npm run jena:build && next dev");
  assert.equal(rootPackage.scripts?.test, "npm run jena:build && npm run test:app");
  assert.equal(rootPackage.scripts?.typecheck, "npm run jena:build && npm run typecheck:app");
  assert.equal(rootPackage.scripts?.build, "npm run jena:build && npm run build:app");
  assert.equal(
    rootPackage.scripts?.verify,
    "npm run jena:verify && npm run test:app && npm run typecheck:app && npm run build:app",
  );
});

test("the snapshot records exact source provenance, exclusions, and the GPL release gate", () => {
  const provenance = readFileSync(join(snapshotRoot, "ENA-SNAPSHOT.md"), "utf8");

  assert.match(provenance, new RegExp(expectedSourceSha));
  assert.match(provenance, /https:\/\/github\.com\/HUDongpin\/jENA\.git/);
  assert.match(provenance, /0\.6\.3/);
  assert.match(provenance, new RegExp(expectedVersion.replaceAll(".", "\\.")));
  assert.match(provenance, /2026-08-22/);
  assert.match(provenance, /private/i);
  assert.match(provenance, /\.git[\s\S]*node_modules[\s\S]*dist[\s\S]*\.github/);
  assert.match(provenance, /refresh/i);
  assert.match(provenance, /not pushed|unpublished/i);
  assert.match(provenance, /GPL-3\.0-only[\s\S]*release gate/i);

  for (const required of [
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "PROVENANCE.md",
    "NUMERICS.md",
    "RELEASING.md",
    "src/index.ts",
    "tests/ordered-network.test.ts",
    "fixtures/goldens/README.md",
    "scripts/package-contract.test.mjs",
  ]) {
    assert.equal(existsSync(join(snapshotRoot, required)), true, `snapshot must include ${required}`);
  }
  for (const excluded of [".git", ".github", "reference", ".npm-cache"] ) {
    assert.equal(existsSync(join(snapshotRoot, excluded)), false, `snapshot source must exclude ${excluded}`);
  }
  for (const generatedOrLocal of ["node_modules", "dist"]) {
    const tracked = execFileSync(
      "git",
      ["ls-files", `packages/jena-js/${generatedOrLocal}`],
      { cwd: projectRoot, encoding: "utf8" },
    ).trim();
    assert.equal(tracked, "", `snapshot must not track generated ${generatedOrLocal}`);
  }
});

test("Next transpiles jENA source while the app typecheck excludes the nested package project", () => {
  const nextConfig = readFileSync(join(projectRoot, "next.config.ts"), "utf8");
  const tsconfig = json("tsconfig.json") as { exclude?: string[] };

  assert.match(nextConfig, /transpilePackages:\s*\["jena-js"\]/);
  assert.ok(tsconfig.exclude?.includes("packages/jena-js"));
});

test("the root lockfile and installed package resolve jENA only through the local workspace", () => {
  const lock = json("package-lock.json") as {
    packages?: Record<string, { version?: string; resolved?: string; link?: boolean; dependencies?: Record<string, string> }>;
  };
  const packages = lock.packages ?? {};

  assert.deepEqual(packages["packages/jena-js"]?.version, expectedVersion);
  assert.equal(packages["node_modules/jena-js"]?.resolved, "packages/jena-js");
  assert.equal(packages["node_modules/jena-js"]?.link, true);
  assert.equal(packages["node_modules/jena-js"]?.version, undefined);
  assert.equal(packages["packages/jena-js"]?.dependencies?.["jena-js"], undefined, "workspace must not depend on itself");
  assert.doesNotMatch(JSON.stringify(packages["node_modules/jena-js"]), /registry\.npmjs\.org/);

  const installedPath = join(projectRoot, "node_modules", "jena-js");
  assert.equal(existsSync(installedPath), true);
  assert.equal(lstatSync(installedPath).isSymbolicLink(), true);
  assert.equal(relative(snapshotRoot, realpathSync(installedPath)), "");
});

test("the built package entrypoint exposes the reviewed ordered-network helper", async () => {
  const runtime = await import("jena-js");

  assert.equal(typeof runtime.orderedAdjacencyKey, "function");
  assert.deepEqual(runtime.orderedAdjacencyKey(["A", "B"]), [
    { source: "A", target: "A", name: "A & A", sourceIndex: 0, targetIndex: 0 },
    { source: "B", target: "A", name: "B & A", sourceIndex: 1, targetIndex: 0 },
    { source: "A", target: "B", name: "A & B", sourceIndex: 0, targetIndex: 1 },
    { source: "B", target: "B", name: "B & B", sourceIndex: 1, targetIndex: 1 },
  ]);
});
