import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchPlotlyDisposalBytes, plotlyDisposalContract as contract, verifyPlotlyDisposal } from "../scripts/patch-plotly-disposal.mjs";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const installed = readFileSync(new URL("../node_modules/plotly.js-gl3d-dist-min/plotly-gl3d.min.js", import.meta.url));
// Recover only the exact known upstream bytes, so tests work after postinstall
// without adding a second full vendor bundle to source control.
const original = digest(installed) === contract.upstreamSha256 ? installed : Buffer.from(contract.changes.reduceRight((source: string, change: { before: string; after: string }) => source.replace(change.after, change.before), installed.toString("utf8")));

test("exact upstream patch is reproducible and known-patched bytes are idempotent", () => {
  assert.equal(digest(original), contract.upstreamSha256);
  const patched = patchPlotlyDisposalBytes(original);
  assert.equal(patched.changed, true); assert.equal(digest(patched.bytes), contract.patchedSha256);
  assert.equal(patchPlotlyDisposalBytes(patched.bytes).changed, false);
  assert.equal(patched.bytes.subarray(0, 1000).toString(), original.subarray(0, 1000).toString(), "upstream license header is preserved");
});

test("unknown, partially patched and appended distribution bytes fail closed", () => {
  for (const bytes of [Buffer.from("unknown"), Buffer.concat([original, Buffer.from("\n")]), Buffer.from(original.toString().replace(contract.changes[0].before, contract.changes[0].after))]) {
    assert.throws(() => patchPlotlyDisposalBytes(bytes), /Unknown Plotly distribution/);
  }
});

test("fresh install applies once; checks reject unpatched, changed lock, metadata and unknown files without overwrite", () => {
  const root = mkdtempSync(join(tmpdir(), "open-ena-plotly-patch-test-"));
  try {
    const directory = join(root, "node_modules", contract.package); mkdirSync(directory, { recursive: true });
    const lock = readFileSync(new URL("../package-lock.json", import.meta.url)); writeFileSync(join(root, "package-lock.json"), lock);
    for (const name of ["package.json", "LICENSE"]) writeFileSync(join(directory, name), readFileSync(new URL("../node_modules/plotly.js-gl3d-dist-min/" + name, import.meta.url)));
    const target = join(directory, contract.distribution); writeFileSync(target, original);
    assert.throws(() => verifyPlotlyDisposal(root), /not installed/);
    assert.equal(verifyPlotlyDisposal(root, { apply: true }).installedSha256, contract.patchedSha256);
    assert.equal(verifyPlotlyDisposal(root).changed, false);
    const changedLock = JSON.parse(lock.toString()); changedLock.packages["node_modules/" + contract.package].integrity = "changed";
    writeFileSync(join(root, "package-lock.json"), JSON.stringify(changedLock));
    assert.throws(() => verifyPlotlyDisposal(root, { apply: true }), /integrity changed/);
    writeFileSync(join(root, "package-lock.json"), lock);
    writeFileSync(target, "unexpected"); assert.throws(() => verifyPlotlyDisposal(root, { apply: true }), /Unknown Plotly distribution/);
    assert.equal(readFileSync(target, "utf8"), "unexpected");
    writeFileSync(join(directory, "package.json"), "{}"); assert.throws(() => verifyPlotlyDisposal(root), /metadata changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
