import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { patchXlsxWriterBytes, verifyXlsxWriter, xlsxWriterContract as contract } from "../scripts/patch-xlsx-writer.mjs";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function reverseCorrections(source: string, target: typeof contract.targets[number]) {
  if (target.followup) source = source.replace(target.followup.after, target.followup.before);
  return source.replace(target.after, target.before);
}
const upstream = contract.targets.map(target => {
  const installed = readFileSync(new URL("../node_modules/write-excel-file/" + target.path, import.meta.url));
  const bytes = digest(installed) === target.upstreamSha256 ? installed : Buffer.from(reverseCorrections(installed.toString("utf8"), target));
  assert.equal(digest(bytes), target.upstreamSha256);
  return bytes;
});
const metadata = (name: string) => readFileSync(new URL("../node_modules/write-excel-file/" + name, import.meta.url));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "open-ena-xlsx-writer-patch-"));
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

test("pinned ESM and CommonJS writer patches are reproducible and idempotent", () => {
  contract.targets.forEach((target, index) => {
    const patched = patchXlsxWriterBytes(upstream[index], target.path);
    assert.equal(patched.changed, true); assert.equal(digest(patched.bytes), target.patchedSha256);
    assert.equal(patchXlsxWriterBytes(patched.bytes, target.path).changed, false);
    assert.equal(reverseCorrections(Buffer.from(patched.bytes).toString("utf8"), target), upstream[index].toString("utf8"));
  });
});

test("only the exact previous writer correction upgrades to the same fresh bytes", () => {
  contract.targets.forEach((target, index) => {
    if (!target.followup) return;
    const previous = Buffer.from(upstream[index].toString("utf8").replace(target.before, target.after));
    assert.equal(digest(previous), target.previousSha256);
    const upgraded = patchXlsxWriterBytes(previous, target.path);
    assert.deepEqual(upgraded.bytes, patchXlsxWriterBytes(upstream[index], target.path).bytes);
    assert.equal(patchXlsxWriterBytes(upgraded.bytes, target.path).changed, false);
    for (const bytes of [Buffer.concat([previous, Buffer.from("\n")]), Buffer.from(previous.toString().replace('"&#13;"', '"&#xD;"'))]) assert.throws(() => patchXlsxWriterBytes(bytes, target.path), /Unknown XLSX writer distribution/u);
  });
});

test("all-target validation preserves approved writer predecessor bytes when a later target is unknown", () => {
  const f = fixture();
  try {
    const target = contract.targets[0];
    const previous = Buffer.from(upstream[0].toString("utf8").replace(target.before, target.after));
    writeFileSync(f.targets[0], previous);
    writeFileSync(f.targets[1], "unknown");
    assert.throws(() => verifyXlsxWriter(f.root, { apply: true }), /Unknown XLSX writer distribution/u);
    assert.deepEqual(readFileSync(f.targets[0]), previous);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("unknown bytes and target paths fail closed", () => {
  contract.targets.forEach((target, index) => {
    for (const bytes of [Buffer.from("unknown"), Buffer.concat([upstream[index], Buffer.from("\n")])]) {
      assert.throws(() => patchXlsxWriterBytes(bytes, target.path), /Unknown XLSX writer distribution/);
    }
  });
  assert.throws(() => patchXlsxWriterBytes(upstream[0], "unknown"), /Unknown XLSX writer patch target/);
});

test("installer validates all distributions before any writes and preserves license and metadata", () => {
  const f = fixture();
  try {
    assert.throws(() => verifyXlsxWriter(f.root), /not installed/);
    writeFileSync(f.targets[1], "unknown");
    assert.throws(() => verifyXlsxWriter(f.root, { apply: true }), /Unknown XLSX writer distribution/);
    assert.equal(digest(readFileSync(f.targets[0])), contract.targets[0].upstreamSha256, "invalid later target cannot partially patch the first");
    writeFileSync(f.targets[1], upstream[1]);
    assert.equal(verifyXlsxWriter(f.root, { apply: true }).distributions.every(target => target.changed), true);
    assert.equal(verifyXlsxWriter(f.root, { apply: true }).distributions.every(target => !target.changed), true);
    assert.equal(verifyXlsxWriter(f.root).distributions.every(target => !target.changed), true);
    for (const name of ["package.json", "LICENSE"]) assert.deepEqual(readFileSync(join(f.directory, name)), metadata(name));
    const changedLock = JSON.parse(f.lock.toString());
    for (const key of ["version", "resolved", "integrity", "license"]) {
      const value = changedLock.packages["node_modules/" + contract.package][key];
      changedLock.packages["node_modules/" + contract.package][key] = "changed";
      writeFileSync(join(f.root, "package-lock.json"), JSON.stringify(changedLock));
      assert.throws(() => verifyXlsxWriter(f.root, { apply: true }), new RegExp(key + " changed", "u"));
      changedLock.packages["node_modules/" + contract.package][key] = value;
    }
    writeFileSync(join(f.root, "package-lock.json"), f.lock);
    for (const name of ["package.json", "LICENSE"]) {
      writeFileSync(join(f.directory, name), "changed");
      assert.throws(() => verifyXlsxWriter(f.root, { apply: true }), /metadata changed|license changed/);
      writeFileSync(join(f.directory, name), metadata(name));
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("installer refuses dependency or target symlinks into another checkout", () => {
  const f = fixture(), other = fixture();
  try {
    rmSync(f.targets[0]); symlinkSync(other.targets[0], f.targets[0]);
    assert.throws(() => verifyXlsxWriter(f.root, { apply: true }), /target must belong/);
    assert.equal(digest(readFileSync(other.targets[0])), contract.targets[0].upstreamSha256);
    rmSync(f.directory, { recursive: true, force: true }); symlinkSync(other.directory, f.directory);
    assert.throws(() => verifyXlsxWriter(f.root, { apply: true }), /install must belong/);
  } finally { rmSync(f.root, { recursive: true, force: true }); rmSync(other.root, { recursive: true, force: true }); }
});
