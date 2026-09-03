import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = new URL("./fixtures/open-ena/model-v3/baseline-manifest.json", import.meta.url);
const expected = {
  schemaVersion: 1,
  preCutoverHead: "3aea9a934787fe44ade1082980dc6293e00f3d87",
  rEnaBaseline: {
    version: "0.3.1",
    fixturePath: "packages/jena-js/fixtures/goldens/sena-configs.generated.json",
    fixtureSha256: "a13517172cc8c87d79278649363aec3aac79ee624d0b22ce3c724650c6204192",
  },
  ona: {
    publicFixturePath: "packages/jena-js/fixtures/goldens/ordered-window-tma.generated.json",
    publicFixtureSha256: "0f295ed72eb360e3792d441c5e034c858ed3c65ddbbc7e868a0abdcec6f70a0e",
  },
};

function parseManifest(value: unknown): typeof expected & { recordedAt: string } {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  const manifest = value as Record<string, unknown>;
  assert.deepEqual(Object.keys(manifest).sort(), [
    "ona",
    "preCutoverHead",
    "rEnaBaseline",
    "recordedAt",
    "schemaVersion",
  ]);
  assert.deepEqual(Object.keys(manifest.rEnaBaseline as object).sort(), ["fixturePath", "fixtureSha256", "version"]);
  assert.deepEqual(Object.keys(manifest.ona as object).sort(), ["publicFixturePath", "publicFixtureSha256"]);
  assert.equal(typeof manifest.recordedAt, "string");
  return manifest as typeof expected & { recordedAt: string };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitBlobSha256(revision: string, path: string): string {
  return createHash("sha256")
    .update(execFileSync("git", ["cat-file", "blob", `${revision}:${path}`], { cwd: repoRoot }))
    .digest("hex");
}

function assertTrackedAt(revision: string, path: string): void {
  assert.equal(
    execFileSync("git", ["ls-tree", "--name-only", revision, "--", path], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim(),
    path,
  );
}

test("Open ENA model-v3 baseline manifest is strict and matches tracked fixtures", () => {
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));

  assert.deepEqual({ ...manifest, recordedAt: undefined }, { ...expected, recordedAt: undefined });
  assert.match(manifest.preCutoverHead, /^[a-f0-9]{40}$/);
  assert.match(manifest.rEnaBaseline.fixtureSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.ona.publicFixtureSha256, /^[a-f0-9]{64}$/);
  const recorded = new Date(manifest.recordedAt);
  assert.equal(Number.isNaN(recorded.valueOf()), false);
  assert.equal(recorded.toISOString(), manifest.recordedAt);
  const resolvedPreCutoverHead = execFileSync(
    "git",
    ["rev-parse", "--verify", `${manifest.preCutoverHead}^{commit}`],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  assert.equal(resolvedPreCutoverHead, manifest.preCutoverHead);
  assert.doesNotThrow(() => {
    execFileSync("git", ["merge-base", "--is-ancestor", manifest.preCutoverHead, "HEAD"], { cwd: repoRoot });
  });

  for (const [path, declaredSha256] of [
    [manifest.rEnaBaseline.fixturePath, manifest.rEnaBaseline.fixtureSha256],
    [manifest.ona.publicFixturePath, manifest.ona.publicFixtureSha256],
  ] as const) {
    assertTrackedAt("HEAD", path);
    assertTrackedAt(manifest.preCutoverHead, path);
    assert.equal(gitBlobSha256("HEAD", path), declaredSha256);
    assert.equal(gitBlobSha256(manifest.preCutoverHead, path), declaredSha256);
    assert.equal(sha256(`${repoRoot}/${path}`), declaredSha256);
  }
});
