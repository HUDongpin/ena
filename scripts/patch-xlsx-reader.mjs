import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const xlsxReaderContract = Object.freeze(JSON.parse(readFileSync(new URL("./patches/read-excel-file-9.3.5.json", import.meta.url), "utf8")));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function patchXlsxReaderBytes(bytes, targetPath) {
  const target = xlsxReaderContract.targets.find(entry => entry.path === targetPath);
  assert.ok(target, "Unknown XLSX reader patch target");
  const before = sha256(bytes);
  if (before === target.patchedSha256) return { bytes, changed: false };
  const isPreviousCorrection = Boolean(target.followup && before === target.previousSha256);
  const isPreviousRevision = Boolean(target.revision && before === target.revision.previousSha256);
  assert.ok(before === target.upstreamSha256 || isPreviousCorrection || isPreviousRevision, "Unknown XLSX reader distribution: refusing to patch or accept it");
  let source = Buffer.from(bytes).toString("utf8");
  const replacements = [...(isPreviousRevision ? [] : isPreviousCorrection ? [target.followup] : [target, ...(target.followup ? [target.followup] : [])]), ...(target.revision?.replacements ?? [])];
  for (const replacement of replacements) {
    assert.equal(source.split(replacement.before).length - 1, 1, "XLSX reader target must have exactly one match");
    source = source.replace(replacement.before, replacement.after);
  }
  const patched = Buffer.from(source);
  assert.equal(sha256(patched), target.patchedSha256, "XLSX reader patch produced unexpected bytes");
  return { bytes: patched, changed: true };
}

export function verifyXlsxReader(root, { apply = false } = {}) {
  const contract = xlsxReaderContract;
  const directory = join(root, "node_modules", contract.package);
  const ownedDirectory = join(realpathSync(root), "node_modules", contract.package);
  assert.equal(realpathSync(directory), ownedDirectory, "XLSX reader install must belong to this checkout");
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages["node_modules/" + contract.package];
  for (const key of ["version", "resolved", "integrity", "license"]) assert.equal(lock[key], contract[key], "Pinned upstream XLSX reader " + key + " changed");
  assert.equal(sha256(readFileSync(join(directory, "package.json"))), contract.packageJsonSha256, "XLSX reader package metadata changed");
  assert.equal(sha256(readFileSync(join(directory, "LICENSE"))), contract.licenseSha256, "XLSX reader license changed");
  // Admit every target before writing any bytes, including the CommonJS entry
  // used by require() and the ESM entry used by the browser application.
  const targets = contract.targets.map(target => {
    const path = join(directory, target.path);
    assert.equal(realpathSync(path), join(ownedDirectory, target.path), "XLSX reader target must belong to this checkout");
    return { target, path, ...patchXlsxReaderBytes(readFileSync(path), target.path) };
  });
  assert.ok(apply || targets.every(target => !target.changed), "Required XLSX reader correction is not installed");
  const distributions = targets.map(({ target, path, bytes, changed }) => {
    if (changed) writeFileSync(path, bytes);
    const installedSha256 = sha256(readFileSync(path));
    assert.equal(installedSha256, target.patchedSha256);
    return { path: target.path, upstreamSha256: target.upstreamSha256, installedSha256, changed };
  });
  return { package: contract.package, version: contract.version, resolved: contract.resolved, integrity: contract.integrity, packageJsonSha256: contract.packageJsonSha256, licenseSha256: contract.licenseSha256, correction: "open-ena-xlsx-reader-v6", distributions };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert.ok(mode === "--apply" || mode === "--check", "Use --apply or --check");
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  process.stdout.write(JSON.stringify(verifyXlsxReader(root, { apply: mode === "--apply" })) + "\n");
}
