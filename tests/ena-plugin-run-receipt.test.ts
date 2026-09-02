import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPEN_ENA_PLUGIN_CATALOG } from "@/lib/open-ena/plugins/catalog";
import { createOpenEnaPluginRunReceiptV1 } from "@/lib/open-ena/plugins/run-receipt";

test("a plugin run receipt binds exact manifest, parent result, output, and display settings without raw data", async () => {
  const manifest = OPEN_ENA_PLUGIN_CATALOG[0];
  const parentScientificResult = { schemaVersion: "ena.hk/scientific-result/v1", sourceDatasetSha256: "a".repeat(64), configuration: { window: "Conversation", weightBy: "binary" }, fitted: { points: [{ SVD1: 1 }] } };
  const receipt = await createOpenEnaPluginRunReceiptV1({
    manifest,
    parentScientificResult,
    currentScientificResult: structuredClone(parentScientificResult),
    output: { data: [{ x: [1, 2], meta: { role: "unit-points" } }], layout: { title: "3D" } },
    settings: { axes: ["SVD1", "SVD2", "SVD3"], camera: "isometric", flipX: false, flipY: true },
    now: "2026-09-02T00:00:00.000Z",
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert.equal(receipt.schemaVersion, "ena.hk/plugin-run-receipt/v1");
  assert.equal(receipt.pluginId, "ena-hk/3d-ena");
  assert.equal(receipt.pluginVersion, manifest.version);
  assert.equal(receipt.changesAnalysis, false);
  assert.equal(receipt.scientificResult, "unchanged-parent-result");
  for (const value of [receipt.manifestSha256, receipt.parentResultBindingSha256, receipt.postPluginResultBindingSha256, receipt.outputSha256]) assert.match(value, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.parentResultBindingSha256, receipt.postPluginResultBindingSha256);
  assert.notEqual(receipt.parentResultBindingSha256, receipt.outputSha256);
  assert.deepEqual(receipt.settings.axes, ["SVD1", "SVD2", "SVD3"]);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /unit-points|"x"|rawRows|participant/iu);
  assert.ok(Object.isFrozen(receipt));
});

test("an unchanged-result receipt rejects missing provenance and any post-adapter scientific change", async () => {
  const manifest = OPEN_ENA_PLUGIN_CATALOG[0];
  const parent = { schemaVersion: "ena.hk/scientific-result/v1", sourceDatasetSha256: "b".repeat(64), configuration: { window: "Conversation" }, fitted: { points: [{ SVD1: 1 }] } };
  const common = {
    manifest,
    output: { data: [] },
    settings: { axes: ["SVD1", "SVD2", "SVD3"], camera: "isometric", flipX: false, flipY: false },
    now: "2026-09-02T00:00:00.000Z",
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  await assert.rejects(() => createOpenEnaPluginRunReceiptV1({ ...common, parentScientificResult: parent, currentScientificResult: { ...parent, configuration: { window: "MovingStanza" } } }), /scientific result changed/iu);
  await assert.rejects(() => createOpenEnaPluginRunReceiptV1({ ...common, parentScientificResult: { ...parent, sourceDatasetSha256: null }, currentScientificResult: parent }), /provenance/iu);
});

test("the main standard 3D presenter offers the generated receipt outside the five-action plot toolbar", () => {
  const source = readFileSync(join(process.cwd(), "components", "open-ena", "OpenEnaInteractive3DPlot.tsx"), "utf8");
  assert.match(source, /createOpenEnaPluginRunReceiptV1/u);
  assert.match(source, /downloadPluginReceipt/u);
  assert.match(source, /Plugin receipt/u);
});
