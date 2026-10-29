import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaDataView, { type OpenEnaDataViewColumn } from "../components/open-ena/OpenEnaDataView";
import { buildDataViewPresentationV3 } from "../lib/open-ena/data-view-presentation-v3";
import { buildHistoricalDataViewV3 } from "../lib/open-ena/data-view-export";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { canonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";

const render = (columns: OpenEnaDataViewColumn[], values: Record<string, string | number | boolean | null>) => renderToStaticMarkup(createElement(OpenEnaDataView, {
  columns, rows: [{ id: "sample", values }], context: "comparison", onContextChange() {}, onReturnToComparison() {}, onExportCsv() {},
}));

test("Data View formats numeric measures but preserves identifiers, small values and exact-value inspection", () => {
  const columns: OpenEnaDataViewColumn[] = [
    { key: "id", label: "ID", kind: "metadata" },
    { key: "x", label: "SVD1", kind: "metadata", format: "decimal" },
    { key: "tiny", label: "A ↔ B", kind: "code", format: "decimal" },
  ];
  const values = { id: 1234567890123, x: 0.6538847946004562, tiny: 1.23456789e-12 };
  const before = structuredClone(values), html = render(columns, values);
  assert.match(html, />1234567890123<\/th>/u);
  assert.match(html, /title="0.6538847946004562"[^>]*>0.653885<\/td>/u);
  assert.match(html, />1.23457e-12<\/td>/u);
  assert.deepEqual(values, before, "Formatting cannot round the raw data used by CSV export");
});

test("Data View horizon labels retain scalar type distinctions without exposing JSON in visible cells", () => {
  const column: OpenEnaDataViewColumn = { key: "h", label: "Observed Horizons", kind: "metadata", format: "horizons" };
  const fields = [
    { column: "Period", value: { type: "string", value: "TP1" } },
    { column: "Code", value: { type: "string", value: "001" } },
    { column: "Round", value: { type: "number", value: 1 } },
    { column: "Included", value: { type: "boolean", value: true } },
  ];
  const raw = JSON.stringify([fields]);
  assert.match(render([column], { h: raw }), />Period=&quot;TP1&quot;, Code=&quot;001&quot;, Round=1, Included=true<\/th>/u);
  assert.match(render([column], { h: null }), />—<\/th>/u);
  assert.match(render([{ ...column, format: undefined }], { h: raw }), /\[\[\{&quot;column&quot;/u, "Unmarked user metadata is not interpreted as a Horizon");
});

test("native Data View opts only generated measures and Horizon metadata into formatting while retaining exported facts", async () => {
  const fixture = await bindingFixtureV3(undefined, (draft, data) => {
    draft.model = "SeparateTrajectory";
    data.rows = data.rows.flatMap(row => [
      { ...row, horizon: "h1", time: 1 },
      { ...row, horizon: "h2", time: 2, A: Number(row.A) + 1 },
    ]);
  });
  const result = await bindResultV3(fixture.plan, runStandardPlanV3(fixture.plan), { processedRows: fixture.plan.rows.length, maximumBufferedRows: 0,
    numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, fixture.compiled.diagnostics);
  const before = canonicalJsonV3(result), exported = buildHistoricalDataViewV3(result), view = buildDataViewPresentationV3(result);
  const horizonKey = exported.metadataColumns.observedHorizons;
  assert.equal(view.columns.find(column => column.key === horizonKey)?.format, "horizons");
  for (const key of Object.values(exported.coordinateColumns)) assert.equal(view.columns.find(column => column.key === key)?.format, "decimal");
  assert.equal(view.columns.find(column => column.key === "unit")?.format, undefined);
  for (let index = 0; index < view.rows.length; index++) {
    for (const [key, value] of Object.entries(exported.rows[index])) assert.equal(view.rows[index].values[key], value);
  }
  assert.equal(canonicalJsonV3(result), before);
});
