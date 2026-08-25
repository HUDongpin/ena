import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { gzipSync } from "node:zlib";
// @ts-expect-error The verifier is deliberately a dependency-free Node ESM script.
import { J3DENA_VENDOR_CONTRACT, verifyJ3denaVendor } from "../scripts/verify-j3dena-vendor.mjs";

const TREE_SERIALIZATION = "3dena.regular-file-tree.path-mode-length-bytes.v1";
const JENA_SOURCE_TREE_SERIALIZATION = TREE_SERIALIZATION;

const EXPECTED_PACKAGE_EXPORTS = {
  ".": {
    types: "./index.d.ts",
    import: "./index.js",
  },
};

const EXPECTED_PACKAGE_FILES = [
  "index.js",
  "index.js.map",
  "index.d.ts",
  "types",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "THIRD_PARTY",
  "schemas",
  "PROVENANCE.json",
];

type TarEntry = {
  path: string;
  mode: number;
  body: Buffer;
};

type Fixture = {
  root: string;
  contract: Record<string, unknown>;
  tarballPath: string;
  receiptPath: string;
  custodyPath: string;
  installedRoot: string;
  installedIndexPath: string;
  jenaWorkspaceRoot: string;
  jenaInstalledPath: string;
};

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeOctal(target: Buffer, offset: number, width: number, value: number) {
  const encoded = value.toString(8).padStart(width - 1, "0") + "\0";
  target.write(encoded, offset, width, "ascii");
}

function tarHeader(entry: TarEntry) {
  const header = Buffer.alloc(512);
  const pathBytes = Buffer.from(entry.path, "utf8");
  assert.ok(pathBytes.length <= 100, "test fixture paths must fit a ustar header");
  pathBytes.copy(header, 0);
  writeOctal(header, 100, 8, entry.mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, entry.body.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function refreshTarChecksum(header: Buffer) {
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
}

function buildTarball(
  entries: TarEntry[],
  options: {
    trailingGarbage?: boolean;
    nonCanonicalMode?: boolean;
    invalidUstar?: boolean;
    nonzeroPadding?: boolean;
  } = {},
) {
  const chunks: Buffer[] = [];
  for (const [index, entry] of entries.entries()) {
    const header = tarHeader(entry);
    if (index === 0 && options.nonCanonicalMode) {
      header.fill(0, 100, 108);
      header[100] = 0xb1;
      refreshTarChecksum(header);
    }
    if (index === 0 && options.invalidUstar) {
      header.write("broken", 257, 6, "ascii");
      refreshTarChecksum(header);
    }
    chunks.push(header, entry.body);
    const padding = (512 - (entry.body.length % 512)) % 512;
    if (padding > 0) {
      const paddingBytes = Buffer.alloc(padding);
      if (index === 0 && options.nonzeroPadding) paddingBytes[0] = 1;
      chunks.push(paddingBytes);
    }
  }
  chunks.push(Buffer.alloc(1024));
  if (options.trailingGarbage) {
    chunks.push(Buffer.concat([Buffer.from([1]), Buffer.alloc(511)]));
  }
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

function compareCodePoints(left: string, right: string) {
  const leftPoints = Array.from(left, (point) => point.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (point) => point.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function treeDetails(entries: TarEntry[]) {
  const files = entries
    .map((entry) => ({ ...entry, path: entry.path.slice("package/".length) }))
    .sort((left, right) => compareCodePoints(left.path, right.path));
  const hash = createHash("sha256");
  hash.update(`${TREE_SERIALIZATION}\0`);
  for (const file of files) {
    const pathBytes = Buffer.from(file.path, "utf8");
    const pathLength = Buffer.alloc(4);
    pathLength.writeUInt32BE(pathBytes.length);
    const mode = Buffer.alloc(4);
    mode.writeUInt32BE(file.mode);
    const byteLength = Buffer.alloc(8);
    byteLength.writeBigUInt64BE(BigInt(file.body.length));
    hash.update(pathLength);
    hash.update(pathBytes);
    hash.update(mode);
    hash.update(byteLength);
    hash.update(file.body);
  }
  return {
    sha256: hash.digest("hex"),
    byteLength: files.reduce((sum, file) => sum + file.body.length, 0),
    files: files.map((file) => ({
      path: file.path,
      size: file.body.length,
      mode: file.mode,
    })),
  };
}

function sourceTreeDetails(files: Array<{ path: string; mode: number; body: Buffer }>) {
  const sorted = [...files].sort((left, right) => compareCodePoints(left.path, right.path));
  const digest = createHash("sha256");
  digest.update(`${JENA_SOURCE_TREE_SERIALIZATION}\0`);
  for (const file of sorted) {
    const pathBytes = Buffer.from(file.path, "utf8");
    const pathLength = Buffer.alloc(4);
    pathLength.writeUInt32BE(pathBytes.length);
    const mode = Buffer.alloc(4);
    mode.writeUInt32BE(file.mode);
    const byteLength = Buffer.alloc(8);
    byteLength.writeBigUInt64BE(BigInt(file.body.length));
    digest.update(pathLength);
    digest.update(pathBytes);
    digest.update(mode);
    digest.update(byteLength);
    digest.update(file.body);
  }
  return {
    sha256: digest.digest("hex"),
    fileCount: sorted.length,
    byteLength: sorted.reduce((sum, file) => sum + file.body.length, 0),
  };
}

function jsonBytes(value: unknown) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFixtureFile(path: string, bytes: Uint8Array | string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function createFixture(
  context: TestContext,
  options: {
    unsafePath?: boolean;
    trailingGarbage?: boolean;
    pathCollision?: boolean;
    nonCanonicalMode?: boolean;
    invalidUstar?: boolean;
    nonzeroPadding?: boolean;
    runtimeIdentity?: Record<string, unknown>;
    runtimeSource?: string;
    mutatePackage?: (value: Record<string, any>) => void;
    mutateProvenance?: (value: Record<string, any>) => void;
    mutateLock?: (value: Record<string, any>) => void;
  } = {},
): Fixture {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "open-ena-j3dena-vendor-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const version = J3DENA_VENDOR_CONTRACT.version as string;
  const sourceHead = J3DENA_VENDOR_CONTRACT.sourceHead as string;
  const jenaVersion = J3DENA_VENDOR_CONTRACT.jenaVersion as string;
  const jenaCommit = J3DENA_VENDOR_CONTRACT.jenaCommit as string;
  const jenaTarballIntegrity = J3DENA_VENDOR_CONTRACT.jenaTarballIntegrity as string;
  const filename = J3DENA_VENDOR_CONTRACT.filename as string;
  const packageJson = {
    name: "j-3dena",
    version,
    description: "Public TypeScript analysis facade for the j-3dENA successor",
    type: "module",
    license: "GPL-3.0-only",
    sideEffects: false,
    peerDependencies: { "jena-js": jenaVersion },
    engines: { node: ">=20.9.0" },
    exports: structuredClone(EXPECTED_PACKAGE_EXPORTS),
    files: [...EXPECTED_PACKAGE_FILES],
    publishConfig: { access: "public", provenance: true },
    repository: {
      type: "git",
      url: "git+https://github.com/HUDongpin/j-3dENA.git",
    },
  };
  options.mutatePackage?.(packageJson);
  const provenance = {
    schemaVersion: "3dena.public-package-provenance.v1",
    productStatus: "IMPLEMENTED_UNVERIFIED",
    package: { name: "j-3dena", version, buildId: sourceHead },
    source: {
      repositoryHead: sourceHead,
      dirtyWorktree: false,
      generatedAt: "2026-08-25T05:20:20.000Z",
    },
    dependencies: {
      jenaJs: {
        version: jenaVersion,
        auditedCommit: jenaCommit,
        tarballSha256: "1e071eaa4085688bbbd5f9d7122513a4bf82a0eaf955d399ab21706204fc8afe",
        tarballIntegrity: jenaTarballIntegrity,
        numericsSha256: "3a4567fba2d89bc7c2dd8b3a849d16f578d6a426155b6fd5ed59aab49f6002f1",
        provenanceSha256: "f7d0a7c545036beb53f480bd33393d2a1ad20b7763e7863fcb8e115fe32a12dd",
        license: "GPL-3.0-only",
        packagingDisposition: "exact-single-instance-peer-from-reviewed-tarball",
      },
      sheetJs: {
        package: "xlsx",
        version: "0.20.3",
        sha256: "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8",
        source: "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
        license: "Apache-2.0",
        packagingDisposition: "bundled-from-vendored-custody-archive",
      },
    },
    runtimeBoundary: {
      r: false,
      rena: false,
      rWebFramework: false,
      runtimeNpmDependencies: 0,
      runtimeNpmPeers: 1,
    },
  };
  options.mutateProvenance?.(provenance);
  const identity = {
    jenaVersion,
    jenaCommit,
    jenaTarballIntegrity,
    sdkVersion: version,
    buildId: sourceHead,
    bound: true,
  };
  const indexSource = options.runtimeSource
    ?? `export function getAnalysisBuildIdentityV2() { return ${JSON.stringify(options.runtimeIdentity ?? identity)}; }\n`;
  const entries: TarEntry[] = [
    { path: "package/package.json", mode: 0o644, body: jsonBytes(packageJson) },
    { path: "package/PROVENANCE.json", mode: 0o644, body: jsonBytes(provenance) },
    { path: "package/index.js", mode: 0o644, body: Buffer.from(indexSource) },
    { path: "package/index.d.ts", mode: 0o644, body: Buffer.from("export * from './types/public.js';\n") },
    { path: "package/types/public.d.ts", mode: 0o644, body: Buffer.from("export type Public = true;\n") },
    { path: "package/schemas/index.json", mode: 0o644, body: jsonBytes({ schema: true }) },
    { path: "package/LICENSE", mode: 0o644, body: Buffer.from("GPL-3.0-only fixture\n") },
  ];
  if (options.unsafePath) {
    entries.push({ path: "package/../escape.js", mode: 0o644, body: Buffer.from("escape\n") });
  }
  if (options.pathCollision) {
    entries.push(
      { path: "package/collision", mode: 0o644, body: Buffer.from("file\n") },
      { path: "package/collision/child", mode: 0o644, body: Buffer.from("child\n") },
    );
  }
  if (options.nonCanonicalMode) entries[0].mode = 1;
  const tree = treeDetails(entries);
  const tarball = buildTarball(entries, {
    trailingGarbage: options.trailingGarbage,
    nonCanonicalMode: options.nonCanonicalMode,
    invalidUstar: options.invalidUstar,
    nonzeroPadding: options.nonzeroPadding,
  });
  const tarballSha256 = sha256(tarball);
  const tarballIntegrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  const tarballShasum = createHash("sha1").update(tarball).digest("hex");
  const receipt = {
    schemaVersion: "3dena.public-package-artifact-receipt.v2",
    source: { repositoryHead: sourceHead },
    package: { name: "j-3dena", version, buildId: sourceHead },
    tree: {
      serialization: TREE_SERIALIZATION,
      sha256: tree.sha256,
      fileCount: entries.length,
      byteLength: tree.byteLength,
    },
    tarball: {
      filename,
      byteLength: tarball.length,
      sha256: tarballSha256,
      integrity: tarballIntegrity,
    },
    npmPack: {
      id: `j-3dena@${version}`,
      name: "j-3dena",
      version,
      size: tarball.length,
      unpackedSize: tree.byteLength,
      shasum: tarballShasum,
      integrity: tarballIntegrity,
      filename,
      files: tree.files,
      entryCount: entries.length,
      bundled: [],
    },
  };
  const receiptBytes = jsonBytes(receipt);
  const receiptSha256 = sha256(receiptBytes);
  const custody = {
    schemaVersion: "3dena.public-package-ci-custody.v1",
    repository: J3DENA_VENDOR_CONTRACT.repository,
    workflowPath: J3DENA_VENDOR_CONTRACT.workflowPath,
    sourceHead,
    producerRunId: J3DENA_VENDOR_CONTRACT.producerRunId,
    producerRunAttempt: J3DENA_VENDOR_CONTRACT.producerRunAttempt,
    tarball: {
      artifactId: J3DENA_VENDOR_CONTRACT.tarballArtifactId,
      sha256: tarballSha256,
    },
    receipt: {
      artifactId: J3DENA_VENDOR_CONTRACT.receiptArtifactId,
      sha256: receiptSha256,
    },
  };
  const custodyBytes = jsonBytes(custody);
  const localDependency = `file:vendor/j-3dena/${filename}`;
  const rootPackage = {
    name: "fixture",
    private: true,
    type: "module",
    dependencies: { "j-3dena": localDependency, "jena-js": jenaVersion },
  };
  const lock = {
    name: "fixture",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { dependencies: rootPackage.dependencies },
      "node_modules/j-3dena": {
        version,
        resolved: localDependency,
        integrity: tarballIntegrity,
        license: "GPL-3.0-only",
        engines: { node: ">=20.9.0" },
        peerDependencies: { "jena-js": jenaVersion },
      },
    },
  };
  options.mutateLock?.(lock);
  const vendorRoot = join(root, "vendor", "j-3dena");
  const tarballPath = join(vendorRoot, filename);
  const receiptPath = `${tarballPath}.artifact-receipt.json`;
  const custodyPath = `${tarballPath}.ci-custody.json`;
  writeFixtureFile(tarballPath, tarball);
  writeFixtureFile(receiptPath, receiptBytes);
  writeFixtureFile(custodyPath, custodyBytes);
  writeFixtureFile(join(root, "package.json"), jsonBytes(rootPackage));
  writeFixtureFile(join(root, "package-lock.json"), jsonBytes(lock));

  const installedRoot = join(root, "node_modules", "j-3dena");
  for (const entry of entries) {
    if (!entry.path.startsWith("package/") || entry.path.includes("../")) continue;
    const relativePath = entry.path.slice("package/".length);
    if (options.pathCollision && relativePath.startsWith("collision")) continue;
    writeFixtureFile(join(installedRoot, relativePath), entry.body);
    chmodSync(join(installedRoot, relativePath), entry.mode);
  }
  const installedIndexPath = join(installedRoot, "index.js");

  const jenaWorkspaceRoot = join(root, "packages", "jena-js");
  const jenaSourceFiles = [
    { path: "package.json", mode: 0o644, body: jsonBytes({ name: "jena-js", version: jenaVersion, type: "module" }) },
    { path: "package-lock.json", mode: 0o644, body: jsonBytes({ lockfileVersion: 3 }) },
    { path: "tsconfig.json", mode: 0o644, body: jsonBytes({ compilerOptions: {} }) },
    { path: "PROVENANCE.md", mode: 0o644, body: Buffer.from("fixture provenance\n") },
    { path: "NUMERICS.md", mode: 0o644, body: Buffer.from("fixture numerics\n") },
    { path: "LICENSE", mode: 0o644, body: Buffer.from("fixture GPL\n") },
    { path: "ENA-SNAPSHOT.md", mode: 0o644, body: Buffer.from("fixture snapshot\n") },
    { path: "src/index.ts", mode: 0o644, body: Buffer.from("export const fixture = true;\n") },
  ];
  for (const file of jenaSourceFiles) {
    writeFixtureFile(join(jenaWorkspaceRoot, file.path), file.body);
    chmodSync(join(jenaWorkspaceRoot, file.path), file.mode);
  }
  const jenaSourceTree = sourceTreeDetails(jenaSourceFiles);
  const jenaInstalledPath = join(root, "node_modules", "jena-js");
  symlinkSync("../packages/jena-js", jenaInstalledPath, "dir");

  return {
    root,
    tarballPath,
    receiptPath,
    custodyPath,
    installedRoot,
    installedIndexPath,
    jenaWorkspaceRoot,
    jenaInstalledPath,
    contract: {
      ...J3DENA_VENDOR_CONTRACT,
      tarballByteLength: tarball.length,
      tarballSha256,
      tarballIntegrity,
      tarballShasum,
      receiptByteLength: receiptBytes.length,
      receiptSha256,
      custodyByteLength: custodyBytes.length,
      custodySha256: sha256(custodyBytes),
      treeSha256: tree.sha256,
      treeFileCount: entries.length,
      treeByteLength: tree.byteLength,
      jenaSourceTreeSha256: jenaSourceTree.sha256,
      jenaSourceTreeFileCount: jenaSourceTree.fileCount,
      jenaSourceTreeByteLength: jenaSourceTree.byteLength,
    },
  };
}

function rewriteCustody(fixture: Fixture, mutate: (value: Record<string, any>) => void) {
  const custody = JSON.parse(readFileSync(fixture.custodyPath, "utf8")) as Record<string, any>;
  mutate(custody);
  const bytes = jsonBytes(custody);
  writeFileSync(fixture.custodyPath, bytes);
  fixture.contract = {
    ...fixture.contract,
    custodyByteLength: bytes.length,
    custodySha256: sha256(bytes),
  };
}

function rewriteReceipt(fixture: Fixture, mutate: (value: Record<string, any>) => void) {
  const receipt = JSON.parse(readFileSync(fixture.receiptPath, "utf8")) as Record<string, any>;
  mutate(receipt);
  const receiptBytes = jsonBytes(receipt);
  writeFileSync(fixture.receiptPath, receiptBytes);
  const receiptSha256 = sha256(receiptBytes);
  fixture.contract = {
    ...fixture.contract,
    receiptByteLength: receiptBytes.length,
    receiptSha256,
  };
  rewriteCustody(fixture, (custody) => {
    custody.receipt.sha256 = receiptSha256;
  });
}

test("the verifier pins the CI-custodied j-3dENA .7 artifact", () => {
  assert.deepEqual(
    {
      version: J3DENA_VENDOR_CONTRACT.version,
      sourceHead: J3DENA_VENDOR_CONTRACT.sourceHead,
      tarballSha256: J3DENA_VENDOR_CONTRACT.tarballSha256,
      jenaSourceTreeSha256: J3DENA_VENDOR_CONTRACT.jenaSourceTreeSha256,
      jenaSourceTreeSerialization: J3DENA_VENDOR_CONTRACT.jenaSourceTreeSerialization,
      jenaSourceTreeFileCount: J3DENA_VENDOR_CONTRACT.jenaSourceTreeFileCount,
      jenaSourceTreeByteLength: J3DENA_VENDOR_CONTRACT.jenaSourceTreeByteLength,
    },
    {
      version: "0.2.0-implemented-unverified.7",
      sourceHead: "87b0e953129e1bacf00172c4abb6b31a5f8bb888",
      tarballSha256: "a29c772095dd33f092fad96a422e7f0033db1b9d7c68d2ce8144da86261e7033",
      jenaSourceTreeSha256: "b325c61e549392f7f80a504ba235b62d2fd74e9038f48ce768c483caf06bd671",
      jenaSourceTreeSerialization: TREE_SERIALIZATION,
      jenaSourceTreeFileCount: 35,
      jenaSourceTreeByteLength: 431_196,
    },
  );
});

test("default verification succeeds before npm ci without reading node_modules", async (context) => {
  const fixture = createFixture(context);
  rmSync(join(fixture.root, "node_modules"), { recursive: true, force: true });

  const result = await verifyJ3denaVendor({
    projectRoot: fixture.root,
    contract: fixture.contract,
  });

  assert.equal(Object.hasOwn(result, "installedIdentity"), false);
  assert.equal(Object.hasOwn(result, "installedTree"), false);
  assert.equal(result.treeFileCount, 7);
});

test("the CLI keeps installed-tree verification separate from runtime import", async (context) => {
  const fixture = createFixture(context);
  const verifierModule = await import(
    new URL("../scripts/verify-j3dena-vendor.mjs", import.meta.url).href
  );
  assert.equal(typeof verifierModule.parseJ3denaVendorArguments, "function");
  const cliOptions = verifierModule.parseJ3denaVendorArguments(["--require-installed"]);
  assert.deepEqual(cliOptions, { requireInstalled: true, requireRuntime: false });

  const result = await verifyJ3denaVendor({
    projectRoot: fixture.root,
    contract: fixture.contract,
    ...cliOptions,
  });

  assert.equal(result.installedTree.fileCount, 7);
  assert.equal(result.jenaWorkspace.sourceTreeSerialization, TREE_SERIALIZATION);
  assert.equal(Object.hasOwn(result, "installedIdentity"), false);

  assert.deepEqual(
    verifierModule.parseJ3denaVendorArguments(["--require-runtime"]),
    { requireInstalled: true, requireRuntime: true },
  );
});

test("pre-install verification rejects every tsup auto-discovery input", async (context) => {
  for (const relativePath of [
    "tsup.config.ts",
    "tsup.config.cts",
    "tsup.config.mts",
    "tsup.config.js",
    "tsup.config.cjs",
    "tsup.config.mjs",
    "tsup.config.json",
    "packages/jena-js/tsup.config.ts",
    "packages/jena-js/tsup.config.cts",
    "packages/jena-js/tsup.config.mts",
    "packages/jena-js/tsup.config.js",
    "packages/jena-js/tsup.config.cjs",
    "packages/jena-js/tsup.config.mjs",
    "packages/jena-js/tsup.config.json",
  ]) {
    await context.test(relativePath, async (subcontext) => {
      const fixture = createFixture(subcontext);
      writeFixtureFile(join(fixture.root, relativePath), "export default { minify: true };\n");
      await assert.rejects(
        verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
        /tsup.*config/i,
      );
    });
  }

  for (const packagePath of ["package.json", "packages/jena-js/package.json"]) {
    await context.test(`${packagePath}#tsup`, async (subcontext) => {
      const fixture = createFixture(subcontext);
      const absolutePath = join(fixture.root, packagePath);
      const packageJson = JSON.parse(readFileSync(absolutePath, "utf8")) as Record<string, unknown>;
      packageJson.tsup = { minify: true };
      writeFileSync(absolutePath, jsonBytes(packageJson));
      await assert.rejects(
        verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
        /tsup.*config/i,
      );
    });
  }
});

test("pre-install verification authenticates the jena workspace before npm lifecycle scripts", async (context) => {
  const fixture = createFixture(context);
  const packagePath = join(fixture.jenaWorkspaceRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as Record<string, unknown>;
  packageJson.scripts = { prepare: "node unreviewed-prepare.mjs" };
  writeFileSync(packagePath, jsonBytes(packageJson));

  await assert.rejects(
    verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
    /jena-js source.*sha256|source tree/i,
  );
});

test("a complete fixture, lockfile, installed tree, peer source, and runtime passes", async (context) => {
  const fixture = createFixture(context);

  const result = await verifyJ3denaVendor({
    projectRoot: fixture.root,
    contract: fixture.contract,
    requireInstalled: true,
    requireRuntime: true,
  });

  assert.deepEqual(result.installedIdentity, {
    jenaVersion: J3DENA_VENDOR_CONTRACT.jenaVersion,
    jenaCommit: J3DENA_VENDOR_CONTRACT.jenaCommit,
    jenaTarballIntegrity: J3DENA_VENDOR_CONTRACT.jenaTarballIntegrity,
    sdkVersion: J3DENA_VENDOR_CONTRACT.version,
    buildId: J3DENA_VENDOR_CONTRACT.sourceHead,
    bound: true,
  });
  assert.equal(result.installedTree.fileCount, 7);
  assert.equal(result.treeFileCount, 7);
});

test("installed verification does not import the runtime before jena-js is built", async (context) => {
  const fixture = createFixture(context, { runtimeSource: "this is not valid JavaScript\n" });

  const result = await verifyJ3denaVendor({
    projectRoot: fixture.root,
    contract: fixture.contract,
    requireInstalled: true,
  });

  assert.equal(result.installedTree.fileCount, 7);
  assert.equal(Object.hasOwn(result, "installedIdentity"), false);
  await assert.rejects(
    verifyJ3denaVendor({
      projectRoot: fixture.root,
      contract: fixture.contract,
      requireInstalled: true,
      requireRuntime: true,
    }),
    /runtime import/i,
  );
});

test("the entire installed package tree is byte-, mode-, and path-identical to the tar", async (context) => {
  for (const relativePath of [
    "index.d.ts",
    "types/public.d.ts",
    "schemas/index.json",
    "LICENSE",
  ]) {
    await context.test(`deleted ${relativePath}`, async (subcontext) => {
      const fixture = createFixture(subcontext);
      rmSync(join(fixture.installedRoot, relativePath));
      await assert.rejects(
        verifyJ3denaVendor({
          projectRoot: fixture.root,
          contract: fixture.contract,
          requireInstalled: true,
        }),
        /installed.*tree|missing/i,
      );
    });

    await context.test(`tampered ${relativePath}`, async (subcontext) => {
      const fixture = createFixture(subcontext);
      writeFileSync(join(fixture.installedRoot, relativePath), "tampered\n");
      await assert.rejects(
        verifyJ3denaVendor({
          projectRoot: fixture.root,
          contract: fixture.contract,
          requireInstalled: true,
        }),
        /installed.*tree|sha256|byte length/i,
      );
    });
  }

  await context.test("extra regular file", async (subcontext) => {
    const fixture = createFixture(subcontext);
    writeFixtureFile(join(fixture.installedRoot, "unreviewed.js"), "export {};\n");
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /installed.*tree|extra/i,
    );
  });

  await context.test("extra empty directory", async (subcontext) => {
    const fixture = createFixture(subcontext);
    mkdirSync(join(fixture.installedRoot, "unreviewed-directory"));
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /installed.*tree.*directories/i,
    );
  });

  await context.test("extra symbolic link", async (subcontext) => {
    const fixture = createFixture(subcontext);
    symlinkSync("index.js", join(fixture.installedRoot, "unreviewed-link.js"));
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /symbolic link|symlink/i,
    );
  });

  await context.test("reviewed path replaced by symbolic link", async (subcontext) => {
    const fixture = createFixture(subcontext);
    const licensePath = join(fixture.installedRoot, "LICENSE");
    rmSync(licensePath);
    symlinkSync("index.js", licensePath);
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /symbolic link|symlink/i,
    );
  });

  await context.test("mode drift", async (subcontext) => {
    const fixture = createFixture(subcontext);
    chmodSync(join(fixture.installedRoot, "index.d.ts"), 0o755);
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /installed.*mode|tree/i,
    );
  });
});

test("package exports, published files, and executable dependency surfaces are exact", async (context) => {
  const cases: Array<{
    name: string;
    mutate: (value: Record<string, any>) => void;
    expected: RegExp;
  }> = [
    {
      name: "exports entry",
      mutate: (value) => { value.exports["."].import = "./unreviewed.js"; },
      expected: /exports/i,
    },
    {
      name: "files inventory",
      mutate: (value) => { value.files.push("unreviewed.js"); },
      expected: /files/i,
    },
    {
      name: "optionalDependencies",
      mutate: (value) => { value.optionalDependencies = { unreviewed: "1.0.0" }; },
      expected: /optionalDependencies/i,
    },
    {
      name: "bundledDependencies",
      mutate: (value) => { value.bundledDependencies = ["unreviewed"]; },
      expected: /bundledDependencies/i,
    },
    {
      name: "bundleDependencies alias",
      mutate: (value) => { value.bundleDependencies = ["unreviewed"]; },
      expected: /bundleDependencies/i,
    },
    {
      name: "lifecycle script",
      mutate: (value) => { value.scripts = { install: "node unreviewed.js" }; },
      expected: /scripts|lifecycle/i,
    },
    {
      name: "extra engine contract",
      mutate: (value) => { value.engines.npm = ">=1"; },
      expected: /engines/i,
    },
  ];

  for (const item of cases) {
    await context.test(item.name, async (subcontext) => {
      const fixture = createFixture(subcontext, { mutatePackage: item.mutate });
      await assert.rejects(
        verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
        item.expected,
      );
    });
  }
});

test("the lockfile rejects optional or bundled dependency surfaces", async (context) => {
  for (const field of ["optionalDependencies", "bundledDependencies", "bundleDependencies"]) {
    await context.test(field, async (subcontext) => {
      const fixture = createFixture(subcontext, {
        mutateLock: (lock) => {
          lock.packages["node_modules/j-3dena"][field] =
            field === "optionalDependencies" ? { unreviewed: "1.0.0" } : ["unreviewed"];
        },
      });
      await assert.rejects(
        verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
        new RegExp(field, "i"),
      );
    });
  }

  await context.test("extra engine contract", async (subcontext) => {
    const fixture = createFixture(subcontext, {
      mutateLock: (lock) => {
        lock.packages["node_modules/j-3dena"].engines.npm = ">=1";
      },
    });
    await assert.rejects(
      verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
      /package-lock.*engines/i,
    );
  });
});

test("installed jena-js is the exact source-pinned workspace peer", async (context) => {
  for (const relativePath of ["src/index.ts", "package-lock.json", "tsconfig.json"]) {
    await context.test(`${relativePath} mutation`, async (subcontext) => {
      const fixture = createFixture(subcontext);
      writeFileSync(join(fixture.jenaWorkspaceRoot, relativePath), "tampered\n");
      await assert.rejects(
        verifyJ3denaVendor({
          projectRoot: fixture.root,
          contract: fixture.contract,
          requireInstalled: true,
        }),
        /jena-js source.*sha256|source tree/i,
      );
    });
  }

  await context.test("extra source file", async (subcontext) => {
    const fixture = createFixture(subcontext);
    writeFixtureFile(join(fixture.jenaWorkspaceRoot, "src", "unreviewed.ts"), "export {};\n");
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /jena-js source tree/i,
    );
  });

  await context.test("source symbolic link", async (subcontext) => {
    const fixture = createFixture(subcontext);
    symlinkSync("index.ts", join(fixture.jenaWorkspaceRoot, "src", "unreviewed-link.ts"));
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /symbolic link|symlink/i,
    );
  });

  await context.test("source mode drift", async (subcontext) => {
    const fixture = createFixture(subcontext);
    chmodSync(join(fixture.jenaWorkspaceRoot, "src", "index.ts"), 0o600);
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /mode.*0644.*0755/i,
    );
  });

  await context.test("wrong workspace version", async (subcontext) => {
    const fixture = createFixture(subcontext);
    writeFileSync(
      join(fixture.jenaWorkspaceRoot, "package.json"),
      jsonBytes({ name: "jena-js", version: "0.7.0-wrong", type: "module" }),
    );
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /jena-js.*version/i,
    );
  });

  await context.test("workspace replacement", async (subcontext) => {
    const fixture = createFixture(subcontext);
    rmSync(fixture.jenaInstalledPath);
    const replacement = join(fixture.root, "replacement-jena-js");
    mkdirSync(replacement, { recursive: true });
    writeFixtureFile(
      join(replacement, "package.json"),
      jsonBytes({ name: "jena-js", version: J3DENA_VENDOR_CONTRACT.jenaVersion }),
    );
    symlinkSync("../../replacement-jena-js", fixture.jenaInstalledPath, "dir");
    await assert.rejects(
      verifyJ3denaVendor({
        projectRoot: fixture.root,
        contract: fixture.contract,
        requireInstalled: true,
      }),
      /jena-js.*realpath|workspace/i,
    );
  });
});

test("SheetJS inlined-code provenance is exact and complete", async (context) => {
  for (const field of [
    "package",
    "version",
    "sha256",
    "source",
    "license",
    "packagingDisposition",
  ]) {
    await context.test(field, async (subcontext) => {
      const fixture = createFixture(subcontext, {
        mutateProvenance: (provenance) => {
          provenance.dependencies.sheetJs[field] = "unreviewed";
        },
      });
      await assert.rejects(
        verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
        new RegExp(`sheet.*${field}`, "i"),
      );
    });
  }
});

test("each of the three custody files is authenticated by exact bytes", async (context) => {
  for (const field of ["tarballPath", "receiptPath", "custodyPath"] as const) {
    await context.test(field, async (subcontext) => {
      const fixture = createFixture(subcontext);
      const original = readFileSync(fixture[field]);
      const corrupted = Buffer.from(original);
      corrupted[corrupted.length - 1] ^= 1;
      writeFileSync(fixture[field], corrupted);

      await assert.rejects(
        verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
        /(?:byte length|sha256|integrity|shasum)/i,
      );
    });
  }
});

test("custody semantics fail closed even when its outer byte pin is recomputed", async (context) => {
  const fixture = createFixture(context);
  rewriteCustody(fixture, (custody) => {
    custody.sourceHead = "0".repeat(40);
  });

  await assert.rejects(
    verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
    /custody\.sourceHead/i,
  );
});

test("receipt schema and tree inventory fail closed behind a recomputed custody chain", async (context) => {
  await context.test("unknown receipt key", async (subcontext) => {
    const fixture = createFixture(subcontext);
    rewriteReceipt(fixture, (receipt) => {
      receipt.unreviewed = true;
    });
    await assert.rejects(
      verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
      /receipt keys/i,
    );
  });

  await context.test("forged npm file mode", async (subcontext) => {
    const fixture = createFixture(subcontext);
    rewriteReceipt(fixture, (receipt) => {
      receipt.npmPack.files[0].mode = 0o755;
    });
    await assert.rejects(
      verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
      /npmPack\.files/i,
    );
  });
});

test("the tar parser rejects unsafe names and nonzero data after the end marker", async (context) => {
  await context.test("path traversal", async (subcontext) => {
    const fixture = createFixture(subcontext, { unsafePath: true });
    await assert.rejects(
      verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
      /unsafe tar path/i,
    );
  });

  await context.test("trailing nonzero data", async (subcontext) => {
    const fixture = createFixture(subcontext, { trailingGarbage: true });
    await assert.rejects(
      verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
      /tar end marker/i,
    );
  });
});

test("the tar parser rejects noncanonical numeric fields, ustar drift, body padding, and path collisions", async (context) => {
  const cases: Array<{
    name: string;
    options: Parameters<typeof createFixture>[1];
    expected: RegExp;
  }> = [
    {
      name: "high-bit numeric field",
      options: { nonCanonicalMode: true },
      expected: /canonical octal/i,
    },
    {
      name: "invalid ustar signature",
      options: { invalidUstar: true },
      expected: /ustar/i,
    },
    {
      name: "nonzero body padding",
      options: { nonzeroPadding: true },
      expected: /padding/i,
    },
    {
      name: "file and descendant path collision",
      options: { pathCollision: true },
      expected: /path collision/i,
    },
  ];
  for (const item of cases) {
    await context.test(item.name, async (subcontext) => {
      const fixture = createFixture(subcontext, item.options);
      await assert.rejects(
        verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
        item.expected,
      );
    });
  }
});

test("package-lock identity must stay on the exact local .7 tarball", async (context) => {
  const fixture = createFixture(context);
  const lockPath = join(fixture.root, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  lock.packages["node_modules/j-3dena"].resolved =
    "file:vendor/j-3dena/j-3dena-0.2.0-implemented-unverified.6.tgz";
  writeFileSync(lockPath, jsonBytes(lock));

  await assert.rejects(
    verifyJ3denaVendor({ projectRoot: fixture.root, contract: fixture.contract }),
    /package-lock.*resolved/i,
  );
});

test("the installed runtime must report the same source-bound identity", async (context) => {
  const fixture = createFixture(context, { runtimeIdentity: { bound: false } });

  await assert.rejects(
    verifyJ3denaVendor({
      projectRoot: fixture.root,
      contract: fixture.contract,
      requireInstalled: true,
      requireRuntime: true,
    }),
    /installed runtime identity/i,
  );
});
