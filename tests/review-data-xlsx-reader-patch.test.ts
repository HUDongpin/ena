import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { patchXlsxReaderBytes, verifyXlsxReader, xlsxReaderContract as contract } from "../scripts/patch-xlsx-reader.mjs";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function reverseCorrections(source: string, target: typeof contract.targets[number]) {
  for (const replacement of [...(target.revision?.replacements ?? [])].reverse()) source = source.replace(replacement.after, replacement.before);
  if (target.followup) source = source.replace(target.followup.after, target.followup.before);
  return source.replace(target.after, target.before);
}
const upstream = contract.targets.map(target => {
  const installed = readFileSync(new URL("../node_modules/read-excel-file/" + target.path, import.meta.url));
  const bytes = digest(installed) === target.upstreamSha256 ? installed : Buffer.from(reverseCorrections(installed.toString("utf8"), target));
  assert.equal(digest(bytes), target.upstreamSha256);
  return bytes;
});

test("the exact R6 predecessor converges with fresh and R5 installs, rejecting partial revisions", () => {
  contract.targets.forEach((target, index) => {
    if (!target.revision) return;
    let previous = upstream[index].toString("utf8").replace(target.before, target.after);
    if (target.followup) previous = previous.replace(target.followup.before, target.followup.after);
    assert.equal(digest(Buffer.from(previous)), target.revision.previousSha256);
    const fresh = patchXlsxReaderBytes(upstream[index], target.path);
    assert.deepEqual(patchXlsxReaderBytes(Buffer.from(previous), target.path).bytes, fresh.bytes);
    assert.equal(patchXlsxReaderBytes(fresh.bytes, target.path).changed, false);
    for (const replacement of target.revision.replacements) {
      const partial = previous.replace(replacement.before, replacement.after);
      assert.throws(() => patchXlsxReaderBytes(Buffer.from(partial), target.path), /Unknown XLSX reader distribution/u);
    }
    assert.throws(() => patchXlsxReaderBytes(Buffer.from(previous + "\n"), target.path), /Unknown XLSX reader distribution/u);
  });
});

test("an unknown later target cannot partially upgrade the R6 predecessor", () => {
  const f = fixture();
  try {
    const prior = contract.targets.flatMap((target, index) => {
      if (!target.revision) return [];
      let source = upstream[index].toString("utf8").replace(target.before, target.after);
      if (target.followup) source = source.replace(target.followup.before, target.followup.after);
      writeFileSync(f.targets[index], source);
      return [{ index, sha256: target.revision.previousSha256 }];
    });
    const last = f.targets.length - 1;
    writeFileSync(f.targets[last], "unknown");
    assert.throws(() => verifyXlsxReader(f.root, { apply: true }), /Unknown XLSX reader distribution/u);
    for (const entry of prior) assert.equal(digest(readFileSync(f.targets[entry.index])), entry.sha256);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
const metadata = (name: string) => readFileSync(new URL("../node_modules/read-excel-file/" + name, import.meta.url));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "open-ena-xlsx-reader-patch-"));
  const directory = join(root, "node_modules", contract.package);
  mkdirSync(directory, { recursive: true });
  const lock = readFileSync(new URL("../package-lock.json", import.meta.url));
  writeFileSync(join(root, "package-lock.json"), lock);
  for (const name of ["package.json", "LICENSE"]) writeFileSync(join(directory, name), metadata(name));
  const targets = contract.targets.map((target, index) => {
    const path = join(directory, target.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, upstream[index]); return path;
  });
  return { root, directory, targets, lock };
}

test("pinned ESM and CommonJS reader patches are reproducible and idempotent", () => {
  contract.targets.forEach((target, index) => {
    const patched = patchXlsxReaderBytes(upstream[index], target.path);
    assert.equal(patched.changed, true); assert.equal(digest(patched.bytes), target.patchedSha256);
    assert.equal(patchXlsxReaderBytes(patched.bytes, target.path).changed, false);
    assert.equal(reverseCorrections(Buffer.from(patched.bytes).toString("utf8"), target), upstream[index].toString("utf8"));
  });
});

test("unknown bytes and target paths fail closed", () => {
  contract.targets.forEach((target, index) => {
    for (const bytes of [Buffer.from("unknown"), Buffer.concat([upstream[index], Buffer.from("\n")])]) {
      assert.throws(() => patchXlsxReaderBytes(bytes, target.path), /Unknown XLSX reader distribution/);
    }
  });
  assert.throws(() => patchXlsxReaderBytes(upstream[0], "unknown"), /Unknown XLSX reader patch target/);
});

test("installer validates all distributions before any writes and preserves license and metadata", () => {
  const f = fixture();
  try {
    assert.throws(() => verifyXlsxReader(f.root), /not installed/);
    writeFileSync(f.targets[1], "unknown");
    assert.throws(() => verifyXlsxReader(f.root, { apply: true }), /Unknown XLSX reader distribution/);
    assert.equal(digest(readFileSync(f.targets[0])), contract.targets[0].upstreamSha256, "invalid later target cannot partially patch the first");
    writeFileSync(f.targets[1], upstream[1]);
    assert.equal(verifyXlsxReader(f.root, { apply: true }).distributions.every(target => target.changed), true);
    assert.equal(verifyXlsxReader(f.root, { apply: true }).distributions.every(target => !target.changed), true);
    assert.equal(verifyXlsxReader(f.root).distributions.every(target => !target.changed), true);
    for (const name of ["package.json", "LICENSE"]) assert.deepEqual(readFileSync(join(f.directory, name)), metadata(name));
    const changedLock = JSON.parse(f.lock.toString());
    for (const key of ["version", "resolved", "integrity", "license"]) {
      const value = changedLock.packages["node_modules/" + contract.package][key];
      changedLock.packages["node_modules/" + contract.package][key] = "changed";
      writeFileSync(join(f.root, "package-lock.json"), JSON.stringify(changedLock));
      assert.throws(() => verifyXlsxReader(f.root, { apply: true }), new RegExp(key + " changed", "u"));
      changedLock.packages["node_modules/" + contract.package][key] = value;
    }
    writeFileSync(join(f.root, "package-lock.json"), f.lock);
    for (const name of ["package.json", "LICENSE"]) {
      writeFileSync(join(f.directory, name), "changed");
      assert.throws(() => verifyXlsxReader(f.root, { apply: true }), /metadata changed|license changed/);
      writeFileSync(join(f.directory, name), metadata(name));
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("installer refuses dependency or target symlinks into another checkout", () => {
  const f = fixture(), other = fixture();
  try {
    rmSync(f.targets[0]); symlinkSync(other.targets[0], f.targets[0]);
    assert.throws(() => verifyXlsxReader(f.root, { apply: true }), /target must belong/);
    assert.equal(digest(readFileSync(other.targets[0])), contract.targets[0].upstreamSha256);
    rmSync(f.directory, { recursive: true, force: true }); symlinkSync(other.directory, f.directory);
    assert.throws(() => verifyXlsxReader(f.root, { apply: true }), /install must belong/);
  } finally { rmSync(f.root, { recursive: true, force: true }); rmSync(other.root, { recursive: true, force: true }); }
});

// An already approved installation can upgrade without accepting partial or unknown edits.
test("only the exact previous correction upgrades to the same fresh-install bytes", () => {
  contract.targets.forEach((target, index) => {
    if (!target.followup) return;
    const previous = Buffer.from(upstream[index].toString("utf8").replace(target.before, target.after));
    assert.equal(digest(previous), target.previousSha256);
    const upgraded = patchXlsxReaderBytes(previous, target.path);
    assert.equal(upgraded.changed, true);
    assert.deepEqual(upgraded.bytes, patchXlsxReaderBytes(upstream[index], target.path).bytes);
    assert.equal(patchXlsxReaderBytes(upgraded.bytes, target.path).changed, false);
    const followupOnly = Buffer.from(upstream[index].toString("utf8").replace(target.followup.before, target.followup.after));
    const partialPrevious = Buffer.from(upstream[index].toString("utf8").replace("state.vText = text;", "state.vText = (state.vText || '') + text;"));
    for (const unknown of [followupOnly, partialPrevious, Buffer.concat([previous, Buffer.from("\n")])]) {
      assert.throws(() => patchXlsxReaderBytes(unknown, target.path), /Unknown XLSX reader distribution/);
    }
  });
});

test("all-target validation protects approved predecessor installations from partial upgrades", () => {
  const f = fixture();
  try {
    const predecessorIndexes = contract.targets.flatMap((target, index) => target.followup ? [index] : []);
    for (const index of predecessorIndexes) {
      const target = contract.targets[index];
      writeFileSync(f.targets[index], upstream[index].toString("utf8").replace(target.before, target.after));
    }
    const last = f.targets.length - 1;
    writeFileSync(f.targets[last], "unknown");
    assert.throws(() => verifyXlsxReader(f.root, { apply: true }), /Unknown XLSX reader distribution/);
    for (const index of predecessorIndexes) assert.equal(digest(readFileSync(f.targets[index])), contract.targets[index].previousSha256);
    writeFileSync(f.targets[last], upstream[last]);
    const result = verifyXlsxReader(f.root, { apply: true });
    for (const target of result.distributions) assert.equal(target.installedSha256, contract.targets.find(entry => entry.path === target.path)!.patchedSha256);
    assert.equal(verifyXlsxReader(f.root, { apply: true }).distributions.every(target => !target.changed), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
