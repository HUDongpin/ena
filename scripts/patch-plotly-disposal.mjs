import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const plotlyDisposalContract = Object.freeze(JSON.parse(readFileSync(new URL("./patches/plotly-gl3d-3.7.0-disposal.json", import.meta.url), "utf8")));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function patchPlotlyDisposalBytes(bytes) {
  const contract = plotlyDisposalContract, before = sha256(bytes);
  if (before === contract.patchedSha256) return { bytes, changed: false };
  assert.equal(before, contract.upstreamSha256, "Unknown Plotly distribution: refusing to patch or accept it");
  let source = Buffer.from(bytes).toString("utf8");
  for (const change of contract.changes) {
    assert.equal(source.split(change.before).length - 1, 1, "Plotly disposal target must have exactly one match");
    source = source.replace(change.before, change.after);
  }
  const patched = Buffer.from(source);
  assert.equal(sha256(patched), contract.patchedSha256, "Plotly disposal patch produced unexpected bytes");
  return { bytes: patched, changed: true };
}

export function verifyPlotlyDisposal(root, { apply = false } = {}) {
  const contract = plotlyDisposalContract;
  const directory = join(root, "node_modules", contract.package), target = join(directory, contract.distribution);
  // Do not follow an installed package symlink into another checkout.
  assert.ok(realpathSync(target).startsWith(realpathSync(root) + sep + "node_modules" + sep), "Plotly install must belong to this checkout");
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages["node_modules/" + contract.package];
  for (const key of ["version", "resolved", "integrity", "license"]) assert.equal(lock[key], contract[key], "Pinned upstream Plotly " + key + " changed");
  assert.equal(sha256(readFileSync(join(directory, "package.json"))), contract.packageJsonSha256, "Plotly package metadata changed");
  assert.equal(sha256(readFileSync(join(directory, "LICENSE"))), contract.licenseSha256, "Plotly license changed");
  const original = readFileSync(target), patched = patchPlotlyDisposalBytes(original);
  if (patched.changed) {
    assert.equal(apply, true, "Required Plotly disposal correction is not installed");
    writeFileSync(target, patched.bytes);
  }
  const installedSha256 = sha256(readFileSync(target));
  assert.equal(installedSha256, contract.patchedSha256);
  return { package: contract.package, version: contract.version, resolved: contract.resolved, integrity: contract.integrity, upstreamSha256: contract.upstreamSha256, installedSha256, packageJsonSha256: contract.packageJsonSha256, licenseSha256: contract.licenseSha256, correction: "open-ena-plotly-disposal-v1", changed: patched.changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert.ok(mode === "--apply" || mode === "--check", "Use --apply or --check");
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  process.stdout.write(JSON.stringify(verifyPlotlyDisposal(root, { apply: mode === "--apply" })) + "\n");
}
