import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import type { BoundStandardResultV3 } from "../lib/open-ena/model-v3/types";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { buildTrajectoryPresentationV3 } from "../lib/open-ena/trajectory-presentation-v3";
import { buildDataViewPresentationV3 } from "../lib/open-ena/data-view-presentation-v3";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";
import { runOpenEnaTrajectoryInferenceV3 } from "../lib/open-ena/inference-v2";
import { nativeStatisticsTablesV3, exportNativeStatisticsV3 } from "../lib/open-ena/native-statistics-export-v3";
import { canonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";

async function trajectoryFixture(diamond = true) {
  const fixture = await bindingFixtureV3(undefined, (draft, data) => {
    draft.model = "SeparateTrajectory";
    const sequence = diamond ? [[1, 2, 4], [1, 3, 4]] : [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]];
    data.rows = sequence.flatMap((periods, unit) => periods.map((period, index) => ({ unit: `u${unit + 1}`, horizon: `h${period}`, time: period, group: "G",
      A: 1 + (unit + period) % 3, B: 1 + (period + unit * 2) % 4, C: 1 + (index * 2 + unit) % 5 })));
  });
  const result = await bindResultV3(fixture.plan, runStandardPlanV3(fixture.plan), { processedRows: fixture.plan.rows.length, maximumBufferedRows: 0,
    numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, fixture.compiled.diagnostics) as BoundStandardResultV3;
  return { ...fixture, result };
}

test("native trajectory presentation preserves diamond precedence, observed populations and original ordinals", async () => {
  const { result } = await trajectoryFixture();
  const display = buildTrajectoryPresentationV3(result, { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null });
  const edges = display.centroidPaths.map((edge) => [edge.from.horizon, edge.to.horizon]);
  const identity = result.executionProvenance.identityDictionary.horizons;
  const name = (horizon: string) => identity.find((entry) => entry.fields[0].value.value === horizon)!.displayLabel;
  assert.deepEqual(new Set(edges.map(([a, b]) => `${a}->${b}`)), new Set([["h1", "h2"], ["h2", "h4"], ["h1", "h3"], ["h3", "h4"]].map(([a, b]) => `${name(a)}->${name(b)}`)));
  assert.equal(display.centroids.find((point) => point.horizon === name("h1"))?.n, 2);
  assert.equal(display.centroids.find((point) => point.horizon === name("h2"))?.n, 1);
  const keep = identity.filter((entry) => ["h1", "h4"].includes(String(entry.fields[0].value.value))).map((entry) => entry.canonicalJson);
  const filtered = buildTrajectoryPresentationV3(result, { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: keep });
  assert.equal(filtered.paths.length, 0, "hidden intermediate steps must not become an invented direct segment");
  assert.equal(filtered.centroidPaths.length, 0);
  assert.deepEqual(filtered.points.map((point) => point.ordinal), [0, 2, 0, 2]);
  const endpoints = buildTrajectoryPresentationV3(result, { showCentroidPaths: true, endpointsOnly: true, visibleHorizons: null });
  assert.equal(endpoints.paths.length, 0);
  assert.equal(endpoints.centroidPaths.length, 0);
  assert.deepEqual(endpoints.points.map((point) => point.ordinal), [2, 2]);
  assert.equal(endpoints.centroids.length, 1);
  assert.equal(endpoints.centroids[0].n, 2);
});

test("actual native 2D and 3D rendering shows paths without adding statistics or changing Code-suppressed frames", async () => {
  const { result } = await trajectoryFixture();
  const projected = presentBoundResultV3(result);
  assert.equal(Object.hasOwn(projected.result, "stats"), false);
  assert.equal(Object.hasOwn(projected.result, "provenanceBinding"), false);
  assert.equal(Object.hasOwn(projected.result, "executionProvenance"), false);
  const trajectoryPresentation = buildTrajectoryPresentationV3(result, { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null });
  const axes = result.executionProvenance.projection.estimableAxes;
  assert.ok(axes.length >= 3, "positive 3D fixture requires three actual supported axes");
  const props = { result: { ...projected.result, trajectoryPresentation }, groupColumn: "Group", view: "2d" as const,
    xDimension: axes[0], yDimension: axes[1], zDimension: axes[2], camera: "isometric" as const,
    showPoints: true, showNetworks: true, showLabels: true, showUnitLabels: false, showVariance: true, showTrajectories: true,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
    codeSourceByRenderedCode: projected.codeSourceByRenderedCode, codeLabelByRenderedCode: projected.codeLabelByRenderedCode, copy: getOpenEnaCopy("en") };
  const svg = renderToStaticMarkup(createElement(OpenEnaPlot, props));
  const hidden = renderToStaticMarkup(createElement(OpenEnaPlot, { ...props, showCodeGraph: false }));
  assert.ok((svg.match(/data-ena-trajectory-path="true"/gu) ?? []).length > 0);
  assert.equal((hidden.match(/data-ena-trajectory-path="true"/gu) ?? []).length, trajectoryPresentation.paths.length);
  assert.ok(hidden.includes('data-ena-trajectory-centroid="true"'));
  const spec = compileOpenEna3dPlotSpec(props), suppressed = compileOpenEna3dPlotSpec({ ...props, showCodeGraph: false });
  assert.equal(spec.data.filter(trace => trace.meta.role === "network-edge").length, 0, "native trajectories must not admit mean-network edges");
  assert.doesNotMatch(svg, /data-ena-edge=/, "2D trajectories must not admit mean-network edges");
  assert.ok(svg.includes('data-ena-trajectory-direction="true"'), "2D fitted connectors need direction arrows");
  const arrows = spec.data.filter(trace => trace.meta.role === "direction-arrow");
  assert.equal(arrows.length, trajectoryPresentation.centroidPaths.filter(path => axes.slice(0, 3).some(axis => path.from.point[axis] !== path.to.point[axis])).length);
  assert.ok(arrows.length > 0, "3D fitted connectors need direction arrows");
  for (const arrow of arrows) assert.ok(Math.hypot(arrow.u![0]!, arrow.v![0]!, arrow.w![0]!) > 0);
  assert.ok(spec.data.filter(trace => trace.name === "Observed Group centroid").every(trace => trace.marker?.size === 7 && trace.marker.symbol === "square"));
  assert.ok(spec.data.filter(trace => trace.meta.role === "trajectory-path").every(trace => trace.line?.color === "black" && trace.mode === "lines"));

  assert.ok(spec.data.some((trace) => trace.meta.role === "trajectory-path"));
  assert.equal(suppressed.data.filter((trace) => trace.meta.role === "trajectory-path").length, spec.data.filter((trace) => trace.meta.role === "trajectory-path").length);
  assert.deepEqual(suppressed.layout.scene, spec.layout.scene);
  assert.equal(suppressed.data.some((trace) => trace.meta.role === "code-node"), false);
});

test("native DataView includes exact normalized edge facts while missing source membership stays null", async () => {
  const { result } = await trajectoryFixture();
  const view = buildDataViewPresentationV3(result);
  assert.equal(view.rows.length, result.set.points.length);
  assert.equal(view.columns.filter((column) => column.kind === "code").length, result.set.adjacencyKey.length);
  assert.match(view.sourceIndexMeaning, /Per-point observed source membership is unavailable/u);
  assert.ok(view.rows.every((row) => row.values["Observed source row indices (0-based)"] === null));
});

test("native post-model export separates selected-request followup indexes from global-frame availability indexes", async () => {
  const { result, plan } = await trajectoryFixture(false);
  const horizons = result.executionProvenance.identityDictionary.horizons;
  const horizon = (name: string) => horizons.find((entry) => entry.fields[0].value.value === name)!.fields;
  const axes = result.executionProvenance.projection.estimableAxes;
  const controls = { axes: [axes[0], axes[1]] as const, identityConfirmed: true,
    request: { kind: "trajectory-repeated-periods" as const, group: { type: "string" as const, value: "G" }, periods: [horizon("h1"), horizon("h3"), horizon("h4")], cohortPolicy: "all-period-complete" as const, posthocContrasts: "all-period-pairs" as const } };
  const inferred = await runOpenEnaTrajectoryInferenceV3(result, plan, controls);
  const tables = nativeStatisticsTablesV3(inferred);
  assert.ok("followupRows" in tables);
  const followup = tables.followupRows!.find((row) => row.earlierPeriodIndex === 0 && row.laterPeriodIndex === 1);
  assert.equal(followup?.laterHorizon, canonicalJsonV3(horizon("h3")));
  assert.equal(followup?.periodIndexNamespace, "selected-request");
  const artifact = await exportNativeStatisticsV3(inferred, result, plan, controls);
  const payload = JSON.parse(artifact.contents);
  assert.equal(payload.context.scientificContextSha256, inferred.scientificContextSha256);
  assert.deepEqual(payload.context.frameIndexHorizons, inferred.context.frameIndexHorizons);
  assert.equal(Object.hasOwn(payload.context, "unitSequences"), false);
  assert.ok(inferred.context.unitSequences.length > 0, "full per-Unit context remains available locally");
  for (const sequence of inferred.context.unitSequences) assert.equal(artifact.contents.includes(sequence.unitToken), false, "direct aggregate export omits every opaque per-Unit sequence token");
  const available = payload.presentationTables.ledger.availableByPeriod.find((row: { periodIndex: number }) => row.periodIndex === 2);
  assert.equal(available.horizon, canonicalJsonV3(horizon("h3")));
  assert.equal(available.periodIndexNamespace, "global-frame");
  await assert.rejects(exportNativeStatisticsV3(structuredClone(inferred), result, plan, controls), /authority/u);
});

test("Workspace preset application uses exact result membership and maps public aliases to SOURCE controls", async () => {
  const { prepareWorkspacePresentationV3 } = await import("../lib/open-ena/workspace-presentation-v3");
  const { buildPresentationArtifactV3 } = await import("../lib/open-ena/presentation-artifact-v3");
  const { result } = await trajectoryFixture();
  const source = result.executionProvenance.labels.codes[0].sourceColumn;
  const artifact = buildPresentationArtifactV3(result, { hiddenCodes: [source], hiddenGroups: [], codeColors: { [source]: "#123456" }, nodeOverrides: [], dimensions: result.executionProvenance.projection.estimableAxes.slice(0, 2) });
  const prepared = prepareWorkspacePresentationV3(result, artifact);
  assert.equal(prepared.status, "applied");
  if (prepared.status !== "applied") throw new Error("Expected matching preset");
  assert.equal(prepared.codeVisibility[source], false);
  assert.equal(prepared.codeColors[source], "#123456");
  assert.equal(prepareWorkspacePresentationV3(result, { ...artifact, boundResultSha256: "f".repeat(64) }).status, "unapplied-preset");
  assert.throws(() => prepareWorkspacePresentationV3(result, { ...artifact, hiddenCodes: ["not-a-bound-code"] }), /reference/);
  assert.throws(() => prepareWorkspacePresentationV3(result, { ...artifact, layerOptions: { showMeans: false } }), /not represented/);
});
