import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { buildReferenceRotationPackage } from "../lib/open-ena/reference";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

test("long reference names cannot displace the visible reference token or variance caveat", () => {
  const dataset = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,first,1,1,0\nu2,c2,second,0,1,1\n",
    { name: "reference.csv", source: "upload" },
  );
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    window: "Conversation" as const,
  };
  const fitted = analyzeDataset(dataset, config);
  const reference = buildReferenceRotationPackage(dataset, config, fitted, "a".repeat(64));
  const { rotationSet: _rotationSet, ...projectionReference } = reference;
  const referenceId = `open-ena-ref:${"b".repeat(64)}:2026-08-13T12:34:56.789Z`;
  const longName = `Long fitted reference ${"N".repeat(300)}`;
  const result = {
    ...fitted,
    projectionReference: {
      ...projectionReference,
      referenceId,
      name: longName,
    },
  };

  const markup = renderToStaticMarkup(createElement(OpenEnaPlot, {
    result,
    groupColumn: "group",
    view: "2d",
    xDimension: result.dimensions[0],
    yDimension: result.dimensions[1],
    zDimension: result.dimensions[2],
    camera: "xy",
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    copy: getOpenEnaCopy("en"),
  }));
  const provenance = markup.match(/<g class="ena-reference-figure-provenance"[\s\S]*?<\/g>/)?.[0];

  assert.ok(provenance, "the standalone plot should render a visible provenance block");
  const referenceToken = `ID ${referenceId.slice(-28)} · declared analyzed-table SHA-256 ${"a".repeat(12)}…`;
  const visibleName = `Reference: ${longName.slice(0, 69)}…`;
  const caveat = "Variance shares describe current data in this fixed basis, not reference-fit explained variance.";
  assert.match(provenance, new RegExp(`<text[^>]*>${referenceToken}</text>`));
  assert.match(provenance, new RegExp(`<text[^>]*>${visibleName}</text>`));
  assert.match(provenance, new RegExp(`<text[^>]*>${caveat}</text>`));
  assert.ok(provenance.indexOf(referenceToken) < provenance.indexOf(visibleName));
  assert.ok(provenance.indexOf(visibleName) < provenance.indexOf(caveat));
  assert.equal(provenance.match(/<text\b/g)?.length, 3);
  assert.doesNotMatch(provenance, new RegExp(longName));
});
