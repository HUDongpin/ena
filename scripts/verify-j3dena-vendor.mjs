import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const TREE_SERIALIZATION = "3dena.regular-file-tree.path-mode-length-bytes.v1";
const JENA_SOURCE_TREE_SERIALIZATION = TREE_SERIALIZATION;
const RECEIPT_SCHEMA = "3dena.public-package-artifact-receipt.v2";
const CUSTODY_SCHEMA = "3dena.public-package-ci-custody.v1";
const PROVENANCE_SCHEMA = "3dena.public-package-provenance.v1";
const PACKAGE_NAME = "j-3dena";
const PACKAGE_LICENSE = "GPL-3.0-only";
const PACKAGE_NODE_ENGINE = ">=20.9.0";
const PACKAGE_DESCRIPTION = "Public TypeScript analysis facade for the j-3dENA successor";
const PACKAGE_EXPORTS = Object.freeze({
  ".": Object.freeze({
    types: "./index.d.ts",
    import: "./index.js",
  }),
});
const PACKAGE_FILES = Object.freeze([
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
]);
const PACKAGE_REPOSITORY_URL = "git+https://github.com/HUDongpin/j-3dENA.git";
const JENA_SOURCE_FIXED_FILES = Object.freeze([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "PROVENANCE.md",
  "NUMERICS.md",
  "LICENSE",
  "ENA-SNAPSHOT.md",
]);
const TSUP_AUTO_CONFIG_FILES = Object.freeze([
  "tsup.config.ts",
  "tsup.config.cts",
  "tsup.config.mts",
  "tsup.config.js",
  "tsup.config.cjs",
  "tsup.config.mjs",
  "tsup.config.json",
]);
const SHEETJS_PROVENANCE = Object.freeze({
  package: "xlsx",
  version: "0.20.3",
  sha256: "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8",
  source: "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
  license: "Apache-2.0",
  packagingDisposition: "bundled-from-vendored-custody-archive",
});
const execFileAsync = promisify(execFile);

export const J3DENA_VENDOR_CONTRACT = Object.freeze({
  repository: "HUDongpin/j-3dENA",
  workflowPath: ".github/workflows/ci.yml",
  sourceHead: "9ce41017d3d17dd24beac7c7d08f74d7e92d2a1c",
  version: "0.2.0-implemented-unverified.11",
  buildId: "9ce41017d3d17dd24beac7c7d08f74d7e92d2a1c",
  filename: "j-3dena-0.2.0-implemented-unverified.11.tgz",
  tarballByteLength: 1_472_289,
  tarballSha256: "c70700a003261ac8a4e44458f13ec89bb7f337c2dd96fa8ccd772bb74b20a74c",
  tarballIntegrity: "sha512-RjTnX2ydPZ0wTaQcuGXMhShSHbHCIkugv+2Lh0XYyQ/PS9e/0xEweYZoeHs/RgPwgRDBJbtBHhrhQ3tSMmcdyw==",
  tarballShasum: "3304b3c45be96e814456c9d39570e37da2e246f1",
  receiptByteLength: 16_838,
  receiptSha256: "47d2fa8e0c80baccbfaf31a4fe0ffa6e8c223526c0b2a9cc03bb51e64ae3db7a",
  custodyByteLength: 524,
  custodySha256: "f3df77fdbd4ed62751c84da9ecf1e6b79f9b94e5e474b6ea8af7447a65665a8a",
  treeSha256: "a4ca53fa1c04173969dfdd8301712dbac16fe584c3ef323e5e29841e0db86fe4",
  treeFileCount: 138,
  treeByteLength: 7_327_105,
  producerRunId: 32_912_311_390,
  producerRunAttempt: 1,
  tarballArtifactId: 9_587_049_776,
  receiptArtifactId: 9_587_050_177,
  jenaVersion: "0.7.0-ona.0",
  jenaCommit: "90790856f00bdef63dbd27fc3a5b502e8cffe65f",
  jenaTarballSha256: "1e071eaa4085688bbbd5f9d7122513a4bf82a0eaf955d399ab21706204fc8afe",
  jenaTarballIntegrity: "sha512-gBhKP9d7C3akXTPlU03AJHBs+dBBDt1TUFGx96P/pB/s0GEGGX2aZFLJGWf9HLc+wuBJIjrJn7tIGicg1WQflQ==",
  jenaNumericsSha256: "3a4567fba2d89bc7c2dd8b3a849d16f578d6a426155b6fd5ed59aab49f6002f1",
  jenaProvenanceSha256: "f7d0a7c545036beb53f480bd33393d2a1ad20b7763e7863fcb8e115fe32a12dd",
  jenaSourceTreeSerialization: JENA_SOURCE_TREE_SERIALIZATION,
  jenaSourceTreeSha256: "b325c61e549392f7f80a504ba235b62d2fd74e9038f48ce768c483caf06bd671",
  jenaSourceTreeFileCount: 35,
  jenaSourceTreeByteLength: 431_196,
});

const DEFAULT_PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function verificationError(message) {
  return new Error(`j-3dENA vendor verification failed: ${message}`);
}

function describe(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[array length=${value.length}]`;
  return "[object]";
}

function expectEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw verificationError(`${label}: expected ${describe(expected)}, received ${describe(actual)}`);
  }
}

function expectPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError(`${label} must be a JSON object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw verificationError(`${label} must be a plain object`);
  }
  return value;
}

function expectExactKeys(value, expectedKeys, label) {
  const object = expectPlainObject(value, label);
  const actual = Object.keys(object).sort(compareCodePoints);
  const expected = [...expectedKeys].sort(compareCodePoints);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw verificationError(
      `${label} keys: expected ${expected.join(", ")}; received ${actual.join(", ")}`,
    );
  }
  return object;
}

function expectExactStringArray(value, expected, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw verificationError(`${label} must be an array of strings`);
  }
  if (
    value.length !== expected.length
    || value.some((item, index) => item !== expected[index])
  ) {
    throw verificationError(
      `${label}: expected ${expected.map(describe).join(", ")}; received ${value.map(describe).join(", ")}`,
    );
  }
  return value;
}

function expectSafeInteger(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) {
    throw verificationError(`${label} must be a ${positive ? "positive " : ""}safe integer`);
  }
  return value;
}

function hash(bytes, algorithm, encoding = "hex") {
  return createHash(algorithm).update(bytes).digest(encoding);
}

function parseJson(bytes, label) {
  let source;
  try {
    source = UTF8_DECODER.decode(bytes);
  } catch {
    throw verificationError(`${label} must be valid UTF-8`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw verificationError(`${label} must be valid JSON: ${detail}`);
  }
}

async function readRegularFile(path, label) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
    throw verificationError(`${label} is unavailable (${code})`);
  }
  if (!stat.isFile()) {
    throw verificationError(`${label} must be a regular file (symlinks are rejected)`);
  }
  const bytes = await readFile(path);
  expectEqual(bytes.length, stat.size, `${label} stable byte length`);
  return bytes;
}

async function expectDirectory(path, label) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
    throw verificationError(`${label} is unavailable (${code})`);
  }
  if (!stat.isDirectory()) {
    throw verificationError(`${label} must be a real directory (symlinks are rejected)`);
  }
}

async function expectPathAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
    throw verificationError(`${label} could not be inspected (${code})`);
  }
  throw verificationError(`${label} must be absent`);
}

async function verifyNoTsupAutoDiscoveryInputs(projectRoot, rootPackageJson, jenaPackageJson) {
  const rootPackage = expectPlainObject(rootPackageJson, "root package.json");
  const jenaPackage = expectPlainObject(jenaPackageJson, "jena-js workspace package.json");
  for (const [label, packageJson] of [
    ["root package.json#tsup", rootPackage],
    ["jena-js workspace package.json#tsup", jenaPackage],
  ]) {
    if (Object.hasOwn(packageJson, "tsup")) {
      throw verificationError(`tsup auto-discovery config ${label} must be absent`);
    }
  }
  for (const directory of [projectRoot, join(projectRoot, "packages", "jena-js")]) {
    for (const filename of TSUP_AUTO_CONFIG_FILES) {
      await expectPathAbsent(
        join(directory, filename),
        `tsup auto-discovery config ${join(directory, filename)}`,
      );
    }
  }
}

function regularFileMode(stat, label) {
  const mode = stat.mode & 0o777;
  if (mode !== 0o644 && mode !== 0o755) {
    throw verificationError(
      `${label} mode must be canonical 0644 or 0755; received 0${mode.toString(8)}`,
    );
  }
  return mode;
}

async function readTreeRegularFile(path, relativePath, label) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
    throw verificationError(`${label} ${relativePath} is unavailable (${code})`);
  }
  if (stat.isSymbolicLink()) {
    throw verificationError(`${label} contains a symbolic link at ${relativePath}`);
  }
  if (!stat.isFile()) {
    throw verificationError(`${label} contains a non-regular entry at ${relativePath}`);
  }
  const body = await readFile(path);
  expectEqual(body.length, stat.size, `${label} ${relativePath} stable byte length`);
  return {
    path: relativePath,
    mode: regularFileMode(stat, `${label} ${relativePath}`),
    body,
  };
}

async function collectRegularFileTree(root, label) {
  const files = [];
  const directories = [];

  async function visit(directory, prefix) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
      throw verificationError(`${label} cannot be read (${code})`);
    }
    entries.sort((left, right) => compareCodePoints(left.name, right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      validateSafeRelativePath(relativePath, `${label} entry`);
      const absolutePath = join(directory, entry.name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) {
        throw verificationError(`${label} contains a symbolic link at ${relativePath}`);
      }
      if (stat.isDirectory()) {
        directories.push(relativePath);
        await visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        files.push(await readTreeRegularFile(absolutePath, relativePath, label));
      } else {
        throw verificationError(`${label} contains a non-regular entry at ${relativePath}`);
      }
    }
  }

  await visit(root, "");
  return {
    files: files.sort((left, right) => compareCodePoints(left.path, right.path)),
    directories: directories.sort(compareCodePoints),
  };
}

function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (point) => point.codePointAt(0));
  const rightPoints = Array.from(right, (point) => point.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function validateSafeRelativePath(path, label) {
  if (typeof path !== "string" || path.length === 0) {
    throw verificationError(`${label} is an unsafe tar path`);
  }
  if (
    path.includes("\0")
    || path.includes("\\")
    || path.startsWith("/")
    || /^[A-Za-z]:/.test(path)
  ) {
    throw verificationError(`${label} is an unsafe tar path: ${describe(path)}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw verificationError(`${label} is an unsafe tar path: ${describe(path)}`);
  }
}

function decodeTarString(header, offset, width, label) {
  const field = header.subarray(offset, offset + width);
  const nul = field.indexOf(0);
  const bytes = nul === -1 ? field : field.subarray(0, nul);
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    throw verificationError(`${label} is not valid UTF-8`);
  }
}

function parseTarOctal(header, offset, width, label) {
  const field = header.subarray(offset, offset + width);
  if (field.some((byte) => byte > 0x7f)) {
    throw verificationError(`${label} is not canonical octal`);
  }
  let cursor = 0;
  while (cursor < field.length && field[cursor] === 0x20) cursor += 1;
  const digits = [];
  while (cursor < field.length && field[cursor] >= 0x30 && field[cursor] <= 0x37) {
    digits.push(field[cursor]);
    cursor += 1;
  }
  if (digits.length === 0) throw verificationError(`${label} is not canonical octal`);
  while (cursor < field.length) {
    if (field[cursor] !== 0 && field[cursor] !== 0x20) {
      throw verificationError(`${label} is not canonical octal`);
    }
    cursor += 1;
  }
  const source = Buffer.from(digits).toString("ascii");
  const value = Number.parseInt(source, 8);
  return expectSafeInteger(value, label);
}

function tarHeaderIsZero(header) {
  return header.every((byte) => byte === 0);
}

function verifyTarChecksum(header, offset) {
  const expected = parseTarOctal(header, 148, 8, `tar header checksum at byte ${offset}`);
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  expectEqual(actual, expected, `tar header checksum at byte ${offset}`);
}

function verifyUstarHeader(header, offset) {
  const magic = Buffer.from(header.subarray(257, 263));
  const version = Buffer.from(header.subarray(263, 265));
  if (!magic.equals(Buffer.from("ustar\0", "ascii")) || !version.equals(Buffer.from("00", "ascii"))) {
    throw verificationError(`tar header at byte ${offset} must use canonical ustar magic and version`);
  }
}

function registerTarPath(seenPaths, path, kind) {
  if (seenPaths.has(path)) {
    throw verificationError(`duplicate tar path: ${describe(path)}`);
  }
  const segments = path.split("/");
  for (let index = 1; index < segments.length; index += 1) {
    const ancestor = segments.slice(0, index).join("/");
    if (seenPaths.get(ancestor) === "file") {
      throw verificationError(`tar path collision between ${describe(ancestor)} and ${describe(path)}`);
    }
  }
  if (kind === "file") {
    for (const existing of seenPaths.keys()) {
      if (existing.startsWith(`${path}/`)) {
        throw verificationError(`tar path collision between ${describe(path)} and ${describe(existing)}`);
      }
    }
  }
  seenPaths.set(path, kind);
}

function parseTarball(tarballBytes, contract) {
  const maximumOutput = Math.max(
    16 * 1024 * 1024,
    contract.treeByteLength + contract.treeFileCount * 4096 + 2 * 1024 * 1024,
  );
  let archive;
  try {
    archive = gunzipSync(tarballBytes, { maxOutputLength: maximumOutput });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw verificationError(`tarball gzip stream is invalid or oversized: ${detail}`);
  }
  if (archive.length % 512 !== 0) {
    throw verificationError("tar archive length must be a multiple of 512 bytes");
  }

  const files = [];
  const seenPaths = new Map();
  let offset = 0;
  let sawEndMarker = false;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (tarHeaderIsZero(header)) {
      if (offset + 1024 > archive.length) {
        throw verificationError("tar end marker must contain two zero blocks");
      }
      const secondBlock = archive.subarray(offset + 512, offset + 1024);
      if (!tarHeaderIsZero(secondBlock)) {
        throw verificationError("tar end marker must contain two zero blocks");
      }
      if (archive.subarray(offset + 1024).some((byte) => byte !== 0)) {
        throw verificationError("tar end marker is followed by nonzero data");
      }
      sawEndMarker = true;
      break;
    }

    verifyTarChecksum(header, offset);
    verifyUstarHeader(header, offset);
    const name = decodeTarString(header, 0, 100, `tar name at byte ${offset}`);
    const prefix = decodeTarString(header, 345, 155, `tar prefix at byte ${offset}`);
    const fullPath = prefix ? `${prefix}/${name}` : name;
    const type = header[156];
    const mode = parseTarOctal(header, 100, 8, `tar mode for ${fullPath}`);
    const size = parseTarOctal(header, 124, 12, `tar size for ${fullPath}`);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    const nextOffset = bodyStart + Math.ceil(size / 512) * 512;
    if (bodyEnd > archive.length || nextOffset > archive.length) {
      throw verificationError(`tar entry ${describe(fullPath)} is truncated`);
    }
    if (archive.subarray(bodyEnd, nextOffset).some((byte) => byte !== 0)) {
      throw verificationError(`tar entry ${describe(fullPath)} has nonzero body padding`);
    }
    if (!fullPath.startsWith("package/")) {
      throw verificationError(`tar entry is outside package/: ${describe(fullPath)}`);
    }
    const relativePath = fullPath.slice("package/".length);

    if (type === 0 || type === 0x30) {
      validateSafeRelativePath(relativePath, `tar entry ${fullPath}`);
      registerTarPath(seenPaths, relativePath, "file");
      if (mode !== 0o644 && mode !== 0o755) {
        throw verificationError(
          `tar regular file ${describe(relativePath)} mode must be canonical 0644 or 0755`,
        );
      }
      files.push({
        path: relativePath,
        mode,
        body: Buffer.from(archive.subarray(bodyStart, bodyEnd)),
      });
    } else if (type === 0x35) {
      expectEqual(size, 0, `tar directory ${fullPath} size`);
      const directoryPath = relativePath.endsWith("/")
        ? relativePath.slice(0, -1)
        : relativePath;
      if (directoryPath) {
        validateSafeRelativePath(directoryPath, `tar directory ${fullPath}`);
        registerTarPath(seenPaths, directoryPath, "directory");
      }
    } else {
      throw verificationError(
        `tar entry ${describe(fullPath)} has forbidden type ${describe(String.fromCharCode(type))}`,
      );
    }
    offset = nextOffset;
  }
  if (!sawEndMarker) {
    throw verificationError("tar end marker is missing");
  }
  return files;
}

function computeTree(files, serialization = TREE_SERIALIZATION) {
  const sorted = [...files].sort((left, right) => compareCodePoints(left.path, right.path));
  const digest = createHash("sha256");
  digest.update(`${serialization}\0`);
  let byteLength = 0;
  for (const file of sorted) {
    const pathBytes = Buffer.from(file.path, "utf8");
    const pathLength = Buffer.alloc(4);
    pathLength.writeUInt32BE(pathBytes.length);
    const mode = Buffer.alloc(4);
    mode.writeUInt32BE(file.mode);
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(file.body.length));
    digest.update(pathLength);
    digest.update(pathBytes);
    digest.update(mode);
    digest.update(length);
    digest.update(file.body);
    byteLength += file.body.length;
  }
  return {
    files: sorted,
    fileCount: sorted.length,
    byteLength,
    sha256: digest.digest("hex"),
  };
}

function validateContract(contract) {
  const object = expectPlainObject(contract, "verification contract");
  for (const field of [
    "repository",
    "workflowPath",
    "sourceHead",
    "version",
    "buildId",
    "filename",
    "tarballByteLength",
    "tarballSha256",
    "tarballIntegrity",
    "tarballShasum",
    "receiptByteLength",
    "receiptSha256",
    "custodyByteLength",
    "custodySha256",
    "treeSha256",
    "treeFileCount",
    "treeByteLength",
    "producerRunId",
    "producerRunAttempt",
    "tarballArtifactId",
    "receiptArtifactId",
    "jenaVersion",
    "jenaCommit",
    "jenaTarballSha256",
    "jenaTarballIntegrity",
    "jenaNumericsSha256",
    "jenaProvenanceSha256",
    "jenaSourceTreeSerialization",
    "jenaSourceTreeSha256",
    "jenaSourceTreeFileCount",
    "jenaSourceTreeByteLength",
  ]) {
    if (!Object.hasOwn(object, field)) {
      throw verificationError(`verification contract is missing ${field}`);
    }
  }
  for (const field of [
    "tarballByteLength",
    "receiptByteLength",
    "custodyByteLength",
    "treeFileCount",
    "treeByteLength",
    "producerRunId",
    "producerRunAttempt",
    "tarballArtifactId",
    "receiptArtifactId",
    "jenaSourceTreeFileCount",
    "jenaSourceTreeByteLength",
  ]) {
    expectSafeInteger(object[field], `verification contract.${field}`, { positive: true });
  }
  expectEqual(object.producerRunAttempt, 1, "verification contract.producerRunAttempt");
  expectEqual(
    object.jenaSourceTreeSerialization,
    JENA_SOURCE_TREE_SERIALIZATION,
    "verification contract.jenaSourceTreeSerialization",
  );
  if (object.tarballArtifactId === object.receiptArtifactId) {
    throw verificationError("verification contract artifact IDs must be distinct");
  }
  return object;
}

function verifyCustody(custody, contract, digests) {
  const object = expectExactKeys(
    custody,
    [
      "schemaVersion",
      "repository",
      "workflowPath",
      "sourceHead",
      "producerRunId",
      "producerRunAttempt",
      "tarball",
      "receipt",
    ],
    "custody",
  );
  expectEqual(object.schemaVersion, CUSTODY_SCHEMA, "custody.schemaVersion");
  expectEqual(object.repository, contract.repository, "custody.repository");
  expectEqual(object.workflowPath, contract.workflowPath, "custody.workflowPath");
  expectEqual(object.sourceHead, contract.sourceHead, "custody.sourceHead");
  expectSafeInteger(object.producerRunId, "custody.producerRunId", { positive: true });
  expectSafeInteger(object.producerRunAttempt, "custody.producerRunAttempt", { positive: true });
  expectEqual(object.producerRunId, contract.producerRunId, "custody.producerRunId");
  expectEqual(object.producerRunAttempt, 1, "custody.producerRunAttempt");

  const tarball = expectExactKeys(object.tarball, ["artifactId", "sha256"], "custody.tarball");
  const receipt = expectExactKeys(object.receipt, ["artifactId", "sha256"], "custody.receipt");
  expectSafeInteger(tarball.artifactId, "custody.tarball.artifactId", { positive: true });
  expectSafeInteger(receipt.artifactId, "custody.receipt.artifactId", { positive: true });
  if (tarball.artifactId === receipt.artifactId) {
    throw verificationError("custody artifact IDs must be distinct");
  }
  expectEqual(tarball.artifactId, contract.tarballArtifactId, "custody.tarball.artifactId");
  expectEqual(receipt.artifactId, contract.receiptArtifactId, "custody.receipt.artifactId");
  expectEqual(tarball.sha256, digests.tarballSha256, "custody.tarball.sha256");
  expectEqual(receipt.sha256, digests.receiptSha256, "custody.receipt.sha256");
}

function verifyReceipt(receipt, contract, digests) {
  const object = expectExactKeys(
    receipt,
    ["schemaVersion", "source", "package", "tree", "tarball", "npmPack"],
    "receipt",
  );
  expectEqual(object.schemaVersion, RECEIPT_SCHEMA, "receipt.schemaVersion");

  const source = expectExactKeys(object.source, ["repositoryHead"], "receipt.source");
  expectEqual(source.repositoryHead, contract.sourceHead, "receipt.source.repositoryHead");

  const packageIdentity = expectExactKeys(
    object.package,
    ["name", "version", "buildId"],
    "receipt.package",
  );
  expectEqual(packageIdentity.name, PACKAGE_NAME, "receipt.package.name");
  expectEqual(packageIdentity.version, contract.version, "receipt.package.version");
  expectEqual(packageIdentity.buildId, contract.buildId, "receipt.package.buildId");

  const tree = expectExactKeys(
    object.tree,
    ["serialization", "sha256", "fileCount", "byteLength"],
    "receipt.tree",
  );
  expectEqual(tree.serialization, TREE_SERIALIZATION, "receipt.tree.serialization");
  expectEqual(tree.sha256, contract.treeSha256, "receipt.tree.sha256");
  expectEqual(tree.fileCount, contract.treeFileCount, "receipt.tree.fileCount");
  expectEqual(tree.byteLength, contract.treeByteLength, "receipt.tree.byteLength");

  const tarball = expectExactKeys(
    object.tarball,
    ["filename", "byteLength", "sha256", "integrity"],
    "receipt.tarball",
  );
  expectEqual(tarball.filename, contract.filename, "receipt.tarball.filename");
  expectEqual(tarball.byteLength, digests.tarballByteLength, "receipt.tarball.byteLength");
  expectEqual(tarball.sha256, digests.tarballSha256, "receipt.tarball.sha256");
  expectEqual(tarball.integrity, digests.tarballIntegrity, "receipt.tarball.integrity");

  const npmPack = expectExactKeys(
    object.npmPack,
    [
      "id",
      "name",
      "version",
      "size",
      "unpackedSize",
      "shasum",
      "integrity",
      "filename",
      "files",
      "entryCount",
      "bundled",
    ],
    "receipt.npmPack",
  );
  expectEqual(npmPack.id, `${PACKAGE_NAME}@${contract.version}`, "receipt.npmPack.id");
  expectEqual(npmPack.name, PACKAGE_NAME, "receipt.npmPack.name");
  expectEqual(npmPack.version, contract.version, "receipt.npmPack.version");
  expectEqual(npmPack.size, digests.tarballByteLength, "receipt.npmPack.size");
  expectEqual(npmPack.unpackedSize, contract.treeByteLength, "receipt.npmPack.unpackedSize");
  expectEqual(npmPack.shasum, digests.tarballShasum, "receipt.npmPack.shasum");
  expectEqual(npmPack.integrity, digests.tarballIntegrity, "receipt.npmPack.integrity");
  expectEqual(npmPack.filename, contract.filename, "receipt.npmPack.filename");
  expectEqual(npmPack.entryCount, contract.treeFileCount, "receipt.npmPack.entryCount");
  if (!Array.isArray(npmPack.bundled) || npmPack.bundled.length !== 0) {
    throw verificationError("receipt.npmPack.bundled must be an empty array");
  }
  if (!Array.isArray(npmPack.files)) {
    throw verificationError("receipt.npmPack.files must be an array");
  }
  expectEqual(npmPack.files.length, contract.treeFileCount, "receipt.npmPack.files length");
  const files = npmPack.files.map((value, index) => {
    const file = expectExactKeys(
      value,
      ["path", "size", "mode"],
      `receipt.npmPack.files[${index}]`,
    );
    validateSafeRelativePath(file.path, `receipt.npmPack.files[${index}].path`);
    expectSafeInteger(file.size, `receipt.npmPack.files[${index}].size`);
    expectSafeInteger(file.mode, `receipt.npmPack.files[${index}].mode`);
    if (index > 0 && compareCodePoints(npmPack.files[index - 1].path, file.path) >= 0) {
      throw verificationError("receipt.npmPack.files must be unique and canonically ordered");
    }
    return file;
  });
  return files;
}

function verifyTree(tarFiles, receiptFiles, contract) {
  const tree = computeTree(tarFiles);
  expectEqual(tree.fileCount, contract.treeFileCount, "tar tree file count");
  expectEqual(tree.byteLength, contract.treeByteLength, "tar tree byte length");
  expectEqual(tree.sha256, contract.treeSha256, "tar tree sha256");
  expectEqual(receiptFiles.length, tree.files.length, "receipt npmPack.files length");
  for (let index = 0; index < tree.files.length; index += 1) {
    const actual = tree.files[index];
    const recorded = receiptFiles[index];
    if (
      recorded.path !== actual.path
      || recorded.size !== actual.body.length
      || recorded.mode !== actual.mode
    ) {
      throw verificationError(`receipt npmPack.files[${index}] does not match the tar tree`);
    }
  }
  return tree;
}

function findTarFile(tree, path) {
  const file = tree.files.find((candidate) => candidate.path === path);
  if (!file) throw verificationError(`tar tree is missing ${path}`);
  return file;
}

function verifyPackageMetadata(packageJson, provenance, contract, location) {
  const packageObject = expectExactKeys(
    packageJson,
    [
      "name",
      "version",
      "description",
      "type",
      "license",
      "sideEffects",
      "peerDependencies",
      "engines",
      "exports",
      "files",
      "publishConfig",
      "repository",
    ],
    `${location} package.json`,
  );
  expectEqual(packageObject.name, PACKAGE_NAME, `${location} package.json name`);
  expectEqual(packageObject.version, contract.version, `${location} package.json version`);
  expectEqual(
    packageObject.description,
    PACKAGE_DESCRIPTION,
    `${location} package.json description`,
  );
  expectEqual(packageObject.type, "module", `${location} package.json type`);
  expectEqual(packageObject.license, PACKAGE_LICENSE, `${location} package.json license`);
  expectEqual(packageObject.sideEffects, false, `${location} package.json sideEffects`);
  const peers = expectExactKeys(
    packageObject.peerDependencies,
    ["jena-js"],
    `${location} package.json peerDependencies`,
  );
  expectEqual(peers["jena-js"], contract.jenaVersion, `${location} jena-js peer version`);
  const engines = expectExactKeys(
    packageObject.engines,
    ["node"],
    `${location} package.json engines`,
  );
  expectEqual(engines.node, PACKAGE_NODE_ENGINE, `${location} package.json node engine`);

  const exportsObject = expectExactKeys(
    packageObject.exports,
    Object.keys(PACKAGE_EXPORTS),
    `${location} package.json exports`,
  );
  const rootExport = expectExactKeys(
    exportsObject["."],
    Object.keys(PACKAGE_EXPORTS["."]),
    `${location} package.json exports[.]`,
  );
  expectEqual(
    rootExport.types,
    PACKAGE_EXPORTS["."].types,
    `${location} package.json exports[.].types`,
  );
  expectEqual(
    rootExport.import,
    PACKAGE_EXPORTS["."].import,
    `${location} package.json exports[.].import`,
  );
  expectExactStringArray(packageObject.files, PACKAGE_FILES, `${location} package.json files`);
  const publishConfig = expectExactKeys(
    packageObject.publishConfig,
    ["access", "provenance"],
    `${location} package.json publishConfig`,
  );
  expectEqual(publishConfig.access, "public", `${location} package.json publishConfig.access`);
  expectEqual(
    publishConfig.provenance,
    true,
    `${location} package.json publishConfig.provenance`,
  );
  const repository = expectExactKeys(
    packageObject.repository,
    ["type", "url"],
    `${location} package.json repository`,
  );
  expectEqual(repository.type, "git", `${location} package.json repository.type`);
  expectEqual(repository.url, PACKAGE_REPOSITORY_URL, `${location} package.json repository.url`);

  const provenanceObject = expectPlainObject(provenance, `${location} PROVENANCE.json`);
  expectEqual(
    provenanceObject.schemaVersion,
    PROVENANCE_SCHEMA,
    `${location} provenance.schemaVersion`,
  );
  expectEqual(
    provenanceObject.productStatus,
    "IMPLEMENTED_UNVERIFIED",
    `${location} provenance.productStatus`,
  );
  const provenancePackage = expectExactKeys(
    provenanceObject.package,
    ["name", "version", "buildId"],
    `${location} provenance.package`,
  );
  expectEqual(provenancePackage.name, PACKAGE_NAME, `${location} provenance.package.name`);
  expectEqual(provenancePackage.version, contract.version, `${location} provenance.package.version`);
  expectEqual(provenancePackage.buildId, contract.buildId, `${location} provenance.package.buildId`);
  const source = expectPlainObject(provenanceObject.source, `${location} provenance.source`);
  expectEqual(source.repositoryHead, contract.sourceHead, `${location} provenance.source.repositoryHead`);
  expectEqual(source.dirtyWorktree, false, `${location} provenance.source.dirtyWorktree`);
  const dependencies = expectExactKeys(
    provenanceObject.dependencies,
    ["jenaJs", "sheetJs"],
    `${location} provenance.dependencies`,
  );
  const jena = expectExactKeys(
    dependencies.jenaJs,
    [
      "version",
      "auditedCommit",
      "tarballSha256",
      "tarballIntegrity",
      "numericsSha256",
      "provenanceSha256",
      "license",
      "packagingDisposition",
    ],
    `${location} provenance.dependencies.jenaJs`,
  );
  expectEqual(jena.version, contract.jenaVersion, `${location} provenance jena version`);
  expectEqual(jena.auditedCommit, contract.jenaCommit, `${location} provenance jena commit`);
  expectEqual(
    jena.tarballSha256,
    contract.jenaTarballSha256,
    `${location} provenance jena tarballSha256`,
  );
  expectEqual(
    jena.tarballIntegrity,
    contract.jenaTarballIntegrity,
    `${location} provenance jena integrity`,
  );
  expectEqual(
    jena.numericsSha256,
    contract.jenaNumericsSha256,
    `${location} provenance jena numericsSha256`,
  );
  expectEqual(
    jena.provenanceSha256,
    contract.jenaProvenanceSha256,
    `${location} provenance jena provenanceSha256`,
  );
  expectEqual(jena.license, PACKAGE_LICENSE, `${location} provenance jena license`);
  expectEqual(
    jena.packagingDisposition,
    "exact-single-instance-peer-from-reviewed-tarball",
    `${location} provenance jena packaging disposition`,
  );
  const sheetJs = expectExactKeys(
    dependencies.sheetJs,
    Object.keys(SHEETJS_PROVENANCE),
    `${location} provenance.dependencies.sheetJs`,
  );
  for (const [field, expected] of Object.entries(SHEETJS_PROVENANCE)) {
    expectEqual(
      sheetJs[field],
      expected,
      `${location} provenance sheetJs ${field}`,
    );
  }
  const boundary = expectExactKeys(
    provenanceObject.runtimeBoundary,
    ["r", "rena", "rWebFramework", "runtimeNpmDependencies", "runtimeNpmPeers"],
    `${location} provenance.runtimeBoundary`,
  );
  expectEqual(boundary.r, false, `${location} runtimeBoundary.r`);
  expectEqual(boundary.rena, false, `${location} runtimeBoundary.rena`);
  expectEqual(boundary.rWebFramework, false, `${location} runtimeBoundary.rWebFramework`);
  expectEqual(boundary.runtimeNpmDependencies, 0, `${location} runtime npm dependencies`);
  expectEqual(boundary.runtimeNpmPeers, 1, `${location} runtime npm peers`);
}

function verifyProjectDependency(packageJson, lock, contract) {
  const localDependency = `file:vendor/j-3dena/${contract.filename}`;
  const rootPackage = expectPlainObject(packageJson, "root package.json");
  const dependencies = expectPlainObject(rootPackage.dependencies, "root package.json dependencies");
  expectEqual(
    dependencies[PACKAGE_NAME],
    localDependency,
    "root package.json j-3dena dependency",
  );

  const lockObject = expectPlainObject(lock, "package-lock.json");
  expectEqual(lockObject.lockfileVersion, 3, "package-lock lockfileVersion");
  const packages = expectPlainObject(lockObject.packages, "package-lock packages");
  const lockRoot = expectPlainObject(packages[""], "package-lock root package");
  const lockRootDependencies = expectPlainObject(
    lockRoot.dependencies,
    "package-lock root dependencies",
  );
  expectEqual(
    lockRootDependencies[PACKAGE_NAME],
    localDependency,
    "package-lock root j-3dena dependency",
  );
  const installed = expectExactKeys(
    packages["node_modules/j-3dena"],
    ["version", "resolved", "integrity", "license", "engines", "peerDependencies"],
    "package-lock node_modules/j-3dena",
  );
  expectEqual(installed.version, contract.version, "package-lock j-3dena version");
  expectEqual(installed.resolved, localDependency, "package-lock j-3dena resolved");
  expectEqual(installed.integrity, contract.tarballIntegrity, "package-lock j-3dena integrity");
  expectEqual(installed.license, PACKAGE_LICENSE, "package-lock j-3dena license");
  const engines = expectExactKeys(
    installed.engines,
    ["node"],
    "package-lock j-3dena engines",
  );
  expectEqual(engines.node, PACKAGE_NODE_ENGINE, "package-lock j-3dena node engine");
  const peers = expectExactKeys(
    installed.peerDependencies,
    ["jena-js"],
    "package-lock j-3dena peerDependencies",
  );
  expectEqual(peers["jena-js"], contract.jenaVersion, "package-lock j-3dena jena-js peer");
}

function expectedInstalledIdentity(contract) {
  return {
    jenaVersion: contract.jenaVersion,
    jenaCommit: contract.jenaCommit,
    jenaTarballIntegrity: contract.jenaTarballIntegrity,
    sdkVersion: contract.version,
    buildId: contract.buildId,
    bound: true,
  };
}

function expectedTreeDirectories(files) {
  const directories = new Set();
  for (const file of files) {
    const segments = file.path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }
  return [...directories].sort(compareCodePoints);
}

function verifyExactFileTrees(expectedFiles, actualFiles, label) {
  if (actualFiles.length !== expectedFiles.length) {
    throw verificationError(
      `${label} file count: expected ${expectedFiles.length}, received ${actualFiles.length}`,
    );
  }
  for (let index = 0; index < expectedFiles.length; index += 1) {
    const expected = expectedFiles[index];
    const actual = actualFiles[index];
    if (actual.path !== expected.path) {
      throw verificationError(
        `${label} path at index ${index}: expected ${describe(expected.path)}, received ${describe(actual.path)}`,
      );
    }
    expectEqual(actual.mode, expected.mode, `${label} ${actual.path} mode`);
    expectEqual(actual.body.length, expected.body.length, `${label} ${actual.path} byte length`);
    expectEqual(
      hash(actual.body, "sha256"),
      hash(expected.body, "sha256"),
      `${label} ${actual.path} sha256`,
    );
  }
}

async function verifyInstalledPackageTree(projectRoot, tree) {
  const installedRoot = join(projectRoot, "node_modules", PACKAGE_NAME);
  await expectDirectory(installedRoot, "installed node_modules/j-3dena");
  const installed = await collectRegularFileTree(
    installedRoot,
    "installed node_modules/j-3dena tree",
  );
  const expectedDirectories = expectedTreeDirectories(tree.files);
  if (
    installed.directories.length !== expectedDirectories.length
    || installed.directories.some((path, index) => path !== expectedDirectories[index])
  ) {
    throw verificationError(
      `installed node_modules/j-3dena tree directories do not match the reviewed tar tree`,
    );
  }
  verifyExactFileTrees(tree.files, installed.files, "installed node_modules/j-3dena tree");
  const computed = computeTree(installed.files);
  expectEqual(computed.sha256, tree.sha256, "installed node_modules/j-3dena tree sha256");
  return Object.freeze({
    sha256: computed.sha256,
    fileCount: computed.fileCount,
    byteLength: computed.byteLength,
  });
}

async function verifyJenaWorkspaceSource(projectRoot, contract, parsedPackageJson) {
  const workspaceRoot = join(projectRoot, "packages", "jena-js");
  await expectDirectory(workspaceRoot, "packages/jena-js workspace");
  const packageJson = expectPlainObject(
    parsedPackageJson,
    "jena-js workspace package.json",
  );
  expectEqual(packageJson.name, "jena-js", "jena-js workspace package name");
  expectEqual(packageJson.version, contract.jenaVersion, "jena-js workspace package version");

  const sourceFiles = [];
  for (const relativePath of JENA_SOURCE_FIXED_FILES) {
    sourceFiles.push(await readTreeRegularFile(
      join(workspaceRoot, relativePath),
      relativePath,
      "jena-js source contract",
    ));
  }
  const srcRoot = join(workspaceRoot, "src");
  await expectDirectory(srcRoot, "jena-js source contract src directory");
  const srcTree = await collectRegularFileTree(srcRoot, "jena-js source contract src tree");
  sourceFiles.push(...srcTree.files.map((file) => ({
    ...file,
    path: `src/${file.path}`,
  })));
  const sourceTree = computeTree(sourceFiles, JENA_SOURCE_TREE_SERIALIZATION);
  expectEqual(
    sourceTree.fileCount,
    contract.jenaSourceTreeFileCount,
    "jena-js source tree file count",
  );
  expectEqual(
    sourceTree.byteLength,
    contract.jenaSourceTreeByteLength,
    "jena-js source tree byte length",
  );
  expectEqual(
    sourceTree.sha256,
    contract.jenaSourceTreeSha256,
    "jena-js source tree sha256",
  );
  return Object.freeze({
    version: contract.jenaVersion,
    sourceTreeSerialization: contract.jenaSourceTreeSerialization,
    sourceTreeSha256: sourceTree.sha256,
    sourceTreeFileCount: sourceTree.fileCount,
    sourceTreeByteLength: sourceTree.byteLength,
  });
}

async function verifyJenaWorkspacePeer(projectRoot, sourceEvidence) {
  const workspaceRoot = join(projectRoot, "packages", "jena-js");
  const installedPath = join(projectRoot, "node_modules", "jena-js");
  let workspaceRealPath;
  let installedRealPath;
  try {
    [workspaceRealPath, installedRealPath] = await Promise.all([
      realpath(workspaceRoot),
      realpath(installedPath),
    ]);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown";
    throw verificationError(`jena-js workspace realpath is unavailable (${code})`);
  }
  expectEqual(installedRealPath, workspaceRealPath, "installed jena-js workspace realpath");
  return Object.freeze({
    ...sourceEvidence,
    realpath: workspaceRealPath,
  });
}

async function verifyRuntimePackage(projectRoot, contract) {
  const childSource = [
    'const runtime = await import("j-3dena");',
    'if (typeof runtime.getAnalysisBuildIdentityV2 !== "function") {',
    '  throw new Error("installed runtime identity function is missing");',
    '}',
    'const identity = await runtime.getAnalysisBuildIdentityV2();',
    'process.stdout.write(JSON.stringify(identity));',
  ].join("\n");
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", childSource],
      {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    ));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw verificationError(`installed runtime import failed: ${detail}`);
  }
  let identity;
  try {
    identity = JSON.parse(stdout);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw verificationError(`installed runtime identity output is invalid JSON: ${detail}`);
  }
  const expected = expectedInstalledIdentity(contract);
  const actual = expectExactKeys(identity, Object.keys(expected), "installed runtime identity");
  for (const [key, value] of Object.entries(expected)) {
    expectEqual(actual[key], value, `installed runtime identity.${key}`);
  }
  return expected;
}

export async function verifyJ3denaVendor({
  projectRoot = DEFAULT_PROJECT_ROOT,
  contract = J3DENA_VENDOR_CONTRACT,
  requireInstalled = false,
  requireRuntime = false,
} = {}) {
  const checkedContract = validateContract(contract);
  if (typeof projectRoot !== "string" || projectRoot.length === 0) {
    throw verificationError("projectRoot must be a non-empty path string");
  }
  if (typeof requireInstalled !== "boolean") {
    throw verificationError("requireInstalled must be a boolean");
  }
  if (typeof requireRuntime !== "boolean") {
    throw verificationError("requireRuntime must be a boolean");
  }
  if (requireRuntime) requireInstalled = true;
  const root = resolve(projectRoot);
  const tarballPath = join(root, "vendor", PACKAGE_NAME, checkedContract.filename);
  const receiptPath = `${tarballPath}.artifact-receipt.json`;
  const custodyPath = `${tarballPath}.ci-custody.json`;
  const [
    tarballBytes,
    receiptBytes,
    custodyBytes,
    rootPackageBytes,
    lockBytes,
    jenaPackageBytes,
  ] =
    await Promise.all([
      readRegularFile(tarballPath, "vendored tarball"),
      readRegularFile(receiptPath, "artifact receipt"),
      readRegularFile(custodyPath, "CI custody record"),
      readRegularFile(join(root, "package.json"), "root package.json"),
      readRegularFile(join(root, "package-lock.json"), "package-lock.json"),
      readRegularFile(
        join(root, "packages", "jena-js", "package.json"),
        "jena-js workspace package.json",
      ),
    ]);

  const rootPackageJson = parseJson(rootPackageBytes, "root package.json");
  const jenaPackageJson = parseJson(jenaPackageBytes, "jena-js workspace package.json");
  await verifyNoTsupAutoDiscoveryInputs(root, rootPackageJson, jenaPackageJson);
  const jenaSourceEvidence = await verifyJenaWorkspaceSource(
    root,
    checkedContract,
    jenaPackageJson,
  );

  const digests = {
    tarballByteLength: tarballBytes.length,
    tarballSha256: hash(tarballBytes, "sha256"),
    tarballIntegrity: `sha512-${hash(tarballBytes, "sha512", "base64")}`,
    tarballShasum: hash(tarballBytes, "sha1"),
    receiptByteLength: receiptBytes.length,
    receiptSha256: hash(receiptBytes, "sha256"),
    custodyByteLength: custodyBytes.length,
    custodySha256: hash(custodyBytes, "sha256"),
  };
  for (const field of [
    "tarballByteLength",
    "tarballSha256",
    "tarballIntegrity",
    "tarballShasum",
    "receiptByteLength",
    "receiptSha256",
    "custodyByteLength",
    "custodySha256",
  ]) {
    expectEqual(digests[field], checkedContract[field], field.replace(/([A-Z])/gu, " $1").toLowerCase());
  }

  const custody = parseJson(custodyBytes, "CI custody record");
  const receipt = parseJson(receiptBytes, "artifact receipt");
  verifyCustody(custody, checkedContract, digests);
  const receiptFiles = verifyReceipt(receipt, checkedContract, digests);
  const tarFiles = parseTarball(tarballBytes, checkedContract);
  const tree = verifyTree(tarFiles, receiptFiles, checkedContract);

  const tarPackageBytes = findTarFile(tree, "package.json").body;
  const tarProvenanceBytes = findTarFile(tree, "PROVENANCE.json").body;
  verifyPackageMetadata(
    parseJson(tarPackageBytes, "tar package.json"),
    parseJson(tarProvenanceBytes, "tar PROVENANCE.json"),
    checkedContract,
    "tar",
  );
  verifyProjectDependency(
    rootPackageJson,
    parseJson(lockBytes, "package-lock.json"),
    checkedContract,
  );

  const result = {
    version: checkedContract.version,
    sourceHead: checkedContract.sourceHead,
    tarballSha256: digests.tarballSha256,
    receiptSha256: digests.receiptSha256,
    custodySha256: digests.custodySha256,
    treeSha256: tree.sha256,
    treeFileCount: tree.fileCount,
    treeByteLength: tree.byteLength,
  };
  if (requireInstalled) {
    result.installedTree = await verifyInstalledPackageTree(root, tree);
    result.jenaWorkspace = await verifyJenaWorkspacePeer(root, jenaSourceEvidence);
  }
  if (requireRuntime) {
    result.installedIdentity = Object.freeze(await verifyRuntimePackage(root, checkedContract));
  }
  return Object.freeze(result);
}

export function parseJ3denaVendorArguments(argumentsList) {
  if (!Array.isArray(argumentsList) || argumentsList.some((value) => typeof value !== "string")) {
    throw verificationError("CLI arguments must be an array of strings");
  }
  if (argumentsList.length === 0) {
    return { requireInstalled: false, requireRuntime: false };
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--require-installed") {
    return { requireInstalled: true, requireRuntime: false };
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--require-runtime") {
    return { requireInstalled: true, requireRuntime: true };
  }
  throw verificationError("unsupported CLI arguments");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  let cliOptions;
  try {
    cliOptions = parseJ3denaVendorArguments(process.argv.slice(2));
  } catch {
    console.error(
      "usage: node scripts/verify-j3dena-vendor.mjs [--require-installed|--require-runtime]",
    );
    process.exitCode = 2;
  }
  if (cliOptions) {
    verifyJ3denaVendor(cliOptions)
      .then((result) => {
        console.log(JSON.stringify({ ok: true, ...result }));
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(detail);
        process.exitCode = 1;
      });
  }
}
