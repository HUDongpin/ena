import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const snapshotRoot = join(projectRoot, "packages", "jena-js");
const expectedVersion = "0.7.0-ona.0";
const historicalSnapshotAnchor = "303a12f549ef9e1914cec10d6e9e1b842dad8908";
const expectedSourceSha = "90790856f00bdef63dbd27fc3a5b502e8cffe65f";
const expectedCanonicalMergeSha = "90790856f00bdef63dbd27fc3a5b502e8cffe65f";
const expectedSourceUrl = `https://github.com/HUDongpin/jENA/tree/${expectedSourceSha}`;
const expectedLicenseSha256 = "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986";
const trajectoryVersion = "0.2.0-implemented-unverified.7";
const trajectorySourceHead = "87b0e953129e1bacf00172c4abb6b31a5f8bb888";
const trajectoryPackagePath = `vendor/j-3dena/j-3dena-${trajectoryVersion}.tgz`;
const trajectoryReceiptPath = `${trajectoryPackagePath}.artifact-receipt.json`;
const trajectoryCustodyPath = `${trajectoryPackagePath}.ci-custody.json`;
const trajectoryPackageSha256 = "a29c772095dd33f092fad96a422e7f0033db1b9d7c68d2ce8144da86261e7033";
const trajectoryReceiptSha256 = "eb0e21622b471d67bca22b85fb87cf51ec3f2568f4c6491225e9f72cdc02e95e";
const trajectoryCustodySha256 = "9c82b0a3b833fc621b0c8edf840e47aa6700727159df1a3f33c5c11518fa97cb";
const trajectoryPackageIntegrity = "sha512-QaYcIu1/HlNtN2opMroeai2EAg+bqvQ6xJH0RnuKTEloxooJtdD/7O8FYR0HWqMPLMSjI5iS5+ezo0H8TqJcJg==";
const vendorVerifyCommand = "node scripts/verify-j3dena-vendor.mjs";
const installedVendorVerifyCommand = `${vendorVerifyCommand} --require-installed`;
const runtimeVendorVerifyCommand = `${vendorVerifyCommand} --require-runtime`;

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
    scripts?: Record<string, string>;
  };

  assert.deepEqual(rootPackage.workspaces, ["packages/jena-js"]);
  assert.equal(rootPackage.dependencies?.["jena-js"], expectedVersion);
  assert.equal(snapshotPackage.name, "jena-js");
  assert.equal(snapshotPackage.version, expectedVersion);
  assert.equal(snapshotPackage.private, true, "the vendored workspace must be non-publishable from Open ENA");
  assert.equal(snapshotPackage.license, "GPL-3.0-only");

  assert.equal(
    rootPackage.scripts?.["jena:build"],
    "npm run build --workspace=jena-js -- --no-config",
  );
  assert.match(rootPackage.scripts?.["jena:verify"] ?? "", /lint --workspace=jena-js/);
  assert.match(rootPackage.scripts?.["jena:verify"] ?? "", /test:pack-contract --workspace=jena-js/);
  assert.match(rootPackage.scripts?.["jena:verify"] ?? "", /pack:check --workspace=jena-js/);
  assert.match(rootPackage.scripts?.["jena:verify"] ?? "", /npm run jena:build/);
  assert.doesNotMatch(
    rootPackage.scripts?.["jena:verify"] ?? "",
    /npm run build --workspace=jena-js(?! -- --no-config)/,
  );
  assert.match(snapshotPackage.scripts?.build ?? "", /(?:^|\s)--no-config(?:\s|$)/);
  assert.equal(rootPackage.scripts?.["test:app"], "node --import tsx --test tests/*.test.ts");
  assert.equal(rootPackage.scripts?.["typecheck:app"], "tsc --noEmit");
  assert.equal(rootPackage.scripts?.["build:app"], "next build");
  assert.equal(rootPackage.scripts?.dev, "npm run jena:build && next dev");
  assert.equal(rootPackage.scripts?.test, "npm run jena:build && npm run test:app");
  assert.equal(rootPackage.scripts?.typecheck, "npm run jena:build && npm run typecheck:app");
  assert.equal(
    rootPackage.scripts?.build,
    `npm run jena:build && ${runtimeVendorVerifyCommand} && npm run build:app`,
  );
  assert.equal(
    rootPackage.scripts?.verify,
    `npm run verify:j3dena-vendor -- --require-installed && npm run jena:verify && ${runtimeVendorVerifyCommand} && npm run test:app && npm run typecheck:app && npm run build:app`,
  );
  assert.equal(rootPackage.scripts?.["verify:j3dena-vendor"], vendorVerifyCommand);
});

test("the snapshot records its historical anchor, exact canonical source, exclusions, and release gates", () => {
  const provenance = readFileSync(join(snapshotRoot, "ENA-SNAPSHOT.md"), "utf8");

  assert.match(provenance, new RegExp(historicalSnapshotAnchor));
  assert.match(provenance, new RegExp(expectedSourceSha));
  assert.match(provenance, new RegExp(expectedCanonicalMergeSha));
  assert.match(provenance, new RegExp(expectedSourceUrl.replaceAll("/", "\\/")));
  assert.match(provenance, /https:\/\/github\.com\/HUDongpin\/jENA\.git/);
  assert.match(provenance, /0\.6\.3/);
  assert.match(provenance, new RegExp(expectedVersion.replaceAll(".", "\\.")));
  assert.match(provenance, /2026-08-23/);
  assert.match(provenance, /private/i);
  assert.match(provenance, /--no-config/);
  assert.match(provenance, /deterministic build hardening/i);
  assert.match(provenance, /do(?:es)?\s+not change[\s\S]*scientific[^\n]*source[\s\S]*version/i);
  assert.match(
    provenance,
    /mechanically reapply[\s\S]*private: true[\s\S]*--no-config/i,
  );
  assert.doesNotMatch(provenance, /adds only this note and\s*`private: true`/i);
  assert.match(provenance, /\.git[\s\S]*node_modules[\s\S]*dist[\s\S]*\.github/);
  assert.match(provenance, /refresh/i);
  assert.match(provenance, /npm publication status:\s*unpublished/i);
  assert.match(provenance, /deployment status:\s*not authorized/i);
  assert.match(provenance, /GPL-3\.0-only[\s\S]*release gate/i);
  assert.match(provenance, /release tag[\s\S]*npm publication[\s\S]*bundled object-code distribution[\s\S]*release asset[\s\S]*deployment/i);
  assert.match(provenance, /source-only PR[\s\S]*does not satisfy or authorize/i);
  assert.doesNotMatch(provenance, /before any[\s\S]{0,240}source distribution/i);

  for (const required of [
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "PROVENANCE.md",
    "NUMERICS.md",
    "RELEASING.md",
    ".gitattributes",
    "src/index.ts",
    "src/core/orderedLimits.ts",
    "tests/ordered-network.test.ts",
    "tests/ordered-runtime-boundaries.test.ts",
    "tests/ordered-safety-budget.test.ts",
    "tests/ordered-tma-window-golden.test.ts",
    "fixtures/goldens/README.md",
    "fixtures/goldens/ordered-window-tma.generated.json",
    "scripts/generate-ordered-window-golden.R",
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

test("the snapshot retains the canonical GPLv3 text and immutable corresponding-source link", () => {
  assert.equal(
    existsSync(join(snapshotRoot, ".gitattributes")),
    true,
    "the canonical snapshot must retain the upstream LICENSE LF contract",
  );
  const license = readFileSync(join(snapshotRoot, "LICENSE"));
  const attributes = readFileSync(join(snapshotRoot, ".gitattributes"), "utf8");
  const typesSource = readFileSync(join(projectRoot, "lib", "open-ena", "types.ts"), "utf8");
  const workspaceSource = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const copySource = readFileSync(join(projectRoot, "lib", "open-ena-i18n.ts"), "utf8");
  const stylesSource = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.equal(createHash("sha256").update(license).digest("hex"), expectedLicenseSha256);
  assert.match(attributes, /^LICENSE text eol=lf\s*$/mu);
  assert.match(typesSource, new RegExp(expectedSourceSha));
  assert.match(typesSource, new RegExp(expectedSourceUrl.replaceAll("/", "\\/")));
  assert.match(workspaceSource, /JENA_SOURCE_URL/);
  assert.match(workspaceSource, /href=\{JENA_SOURCE_URL\}/);
  assert.match(workspaceSource, /copy\.workspace\.jenaSourceLabel/);
  assert.match(workspaceSource, /copy\.workspace\.jenaSourceAriaLabel/);
  assert.match(workspaceSource, /target="_blank"/);
  assert.match(workspaceSource, /rel="noopener noreferrer"/);
  assert.match(copySource, /jenaSourceLabel:\s*"source"/);
  assert.match(copySource, /jenaSourceLabel:\s*"原始碼"/);
  assert.match(copySource, /jenaSourceLabel:\s*"源代码"/);
  assert.match(copySource, /opens in a new tab/);
  assert.match(copySource, /在新分頁開啟/);
  assert.match(copySource, /在新标签页打开/);
  assert.match(stylesSource, /\.ena-rail-version\s*\{[\s\S]*?min-height:\s*24px/);
  assert.match(stylesSource, /\.ena-rail-version\s*\{[\s\S]*?min-width:\s*44px/);
});

test("the snapshot keeps the ordered product contract descriptive and SVD-only", () => {
  const provenance = readFileSync(join(snapshotRoot, "ENA-SNAPSHOT.md"), "utf8");

  assert.match(provenance, /descriptive SVD-only/i);
  assert.match(provenance, /does not add ONA GoF/i);
  assert.match(provenance, /custom rotation/i);
  assert.match(provenance, /larger multi-group non-color encoding/i);
  assert.match(provenance, /separately scoped and validated future phase/i);
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

test("Vercel performs a frozen install of the exact vendored trajectory package", () => {
  const rootPackage = json("package.json") as {
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const lock = json("package-lock.json") as {
    packages?: Record<string, { version?: string; resolved?: string; integrity?: string; dependencies?: Record<string, string> }>;
  };
  const vercel = json("vercel.json") as { installCommand?: string };
  const localDependency = `file:${trajectoryPackagePath}`;

  assert.equal(
    vercel.installCommand,
    `${vendorVerifyCommand} && npm ci && ${installedVendorVerifyCommand}`,
    "Vercel must verify custody before install and the installed package identity afterward",
  );
  assert.equal(rootPackage.scripts?.["verify:j3dena-vendor"], vendorVerifyCommand);
  assert.equal(rootPackage.dependencies?.["j-3dena"], localDependency);
  assert.equal(lock.packages?.[""]?.dependencies?.["j-3dena"], localDependency);
  assert.equal(lock.packages?.["node_modules/j-3dena"]?.resolved, localDependency);
  assert.equal(lock.packages?.["node_modules/j-3dena"]?.integrity, trajectoryPackageIntegrity);
  assert.equal(lock.packages?.["node_modules/j-3dena"]?.version, trajectoryVersion);
  assert.equal(
    createHash("sha256").update(readFileSync(join(projectRoot, trajectoryPackagePath))).digest("hex"),
    trajectoryPackageSha256,
  );

  const receiptBytes = readFileSync(join(projectRoot, trajectoryReceiptPath));
  const custodyBytes = readFileSync(join(projectRoot, trajectoryCustodyPath));
  assert.equal(createHash("sha256").update(receiptBytes).digest("hex"), trajectoryReceiptSha256);
  assert.equal(createHash("sha256").update(custodyBytes).digest("hex"), trajectoryCustodySha256);

  const receipt = JSON.parse(receiptBytes.toString("utf8")) as {
    source?: { repositoryHead?: string };
    package?: { name?: string; version?: string; buildId?: string };
    tarball?: { sha256?: string; integrity?: string };
  };
  const custody = JSON.parse(custodyBytes.toString("utf8")) as {
    repository?: string;
    workflowPath?: string;
    sourceHead?: string;
    producerRunAttempt?: number;
    tarball?: { sha256?: string };
    receipt?: { sha256?: string };
  };
  assert.deepEqual(receipt.package, {
    name: "j-3dena",
    version: trajectoryVersion,
    buildId: trajectorySourceHead,
  });
  assert.equal(receipt.source?.repositoryHead, trajectorySourceHead);
  assert.equal(receipt.tarball?.sha256, trajectoryPackageSha256);
  assert.equal(receipt.tarball?.integrity, trajectoryPackageIntegrity);
  assert.equal(custody.repository, "HUDongpin/j-3dENA");
  assert.equal(custody.workflowPath, ".github/workflows/ci.yml");
  assert.equal(custody.sourceHead, trajectorySourceHead);
  assert.equal(custody.producerRunAttempt, 1);
  assert.equal(custody.tarball?.sha256, trajectoryPackageSha256);
  assert.equal(custody.receipt?.sha256, trajectoryReceiptSha256);

  const attributes = readFileSync(join(projectRoot, ".gitattributes"), "utf8");
  assert.match(attributes, /^vendor\/j-3dena\/\*\.tgz -text$/mu);
  assert.match(attributes, /^vendor\/j-3dena\/\*\.tgz\.\*\.json -text$/mu);
  for (const canonicalTextPath of [
    "packages/jena-js/src/**",
    "packages/jena-js/package.json",
    "packages/jena-js/package-lock.json",
    "packages/jena-js/tsconfig.json",
    "packages/jena-js/PROVENANCE.md",
    "packages/jena-js/NUMERICS.md",
    "packages/jena-js/LICENSE",
    "packages/jena-js/ENA-SNAPSHOT.md",
  ]) {
    assert.match(
      attributes,
      new RegExp(`^${canonicalTextPath.replaceAll("/", "\\/").replace("**", "\\*\\*")} text eol=lf$`, "mu"),
      `${canonicalTextPath} must keep canonical LF bytes across checkouts`,
    );
  }

  const ci = readFileSync(join(projectRoot, ".github", "workflows", "open-ena-ci.yml"), "utf8");
  const verifyJob = ci.match(/\n  verify:\n([\s\S]*?)(?=\n  browser:\n)/u)?.[1] ?? "";
  const browserJob = ci.match(/\n  browser:\n([\s\S]*)$/u)?.[1] ?? "";
  for (const [jobName, job] of [["verify", verifyJob], ["browser", browserJob]] as const) {
    assert.notEqual(job, "", `${jobName} CI job must exist`);
    const preinstallIndex = job.indexOf(`run: ${vendorVerifyCommand}`);
    const installIndex = job.indexOf("run: npm ci", preinstallIndex);
    const postinstallIndex = job.indexOf(`run: ${installedVendorVerifyCommand}`, installIndex);
    assert.ok(preinstallIndex >= 0, `${jobName} CI must verify vendored bytes before npm ci`);
    assert.ok(installIndex > preinstallIndex, `${jobName} CI npm ci must follow custody gate`);
    assert.ok(
      postinstallIndex > installIndex,
      `${jobName} CI must verify the complete installed tree after npm ci`,
    );
  }
  const browserBuildIndex = browserJob.indexOf("run: npm run jena:build");
  const browserRuntimeIndex = browserJob.indexOf(
    `run: ${runtimeVendorVerifyCommand}`,
    browserBuildIndex,
  );
  assert.ok(browserBuildIndex >= 0, "browser CI must build the local jena-js workspace");
  assert.ok(
    browserRuntimeIndex > browserBuildIndex,
    "browser CI must verify the package-name runtime after jena-js build",
  );
});

test("the vendor boundary documents inlined SheetJS outside npm audit coverage", () => {
  const boundary = readFileSync(join(projectRoot, "vendor", "j-3dena", "README.md"), "utf8");
  assert.match(boundary, /SheetJS/i);
  assert.match(boundary, /0\.20\.3/);
  assert.match(boundary, /inlined|bundled/i);
  assert.match(boundary, /npm audit[^\n]*does not|not[^\n]*covered by[^\n]*npm audit/i);
  assert.match(boundary, /PROVENANCE\.json/);
  assert.match(boundary, /THIRD_PARTY\/SheetJS-LICENSE\.txt/);
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
