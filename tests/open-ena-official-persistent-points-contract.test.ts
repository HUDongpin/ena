import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaGroupContrast from "../components/open-ena/OpenEnaGroupContrast";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import { parseCsv } from "../lib/open-ena/csv";
import { JENA_PRIMARY_COLOR, JENA_SECONDARY_COLOR } from "../lib/open-ena/plot-style";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const sampleText = readFileSync(
  join(projectRoot, "public", "data", "academy", "ena-design-talk-sample.csv"),
  "utf8",
);
const dataset = parseCsv(sampleText, {
  name: "ena-design-talk-sample.csv",
  source: "sample",
});
const result = analyzeDataset(dataset, SAMPLE_CONFIG);
const teachingContrast = buildPairwiseGroupContrast(
  result,
  SAMPLE_CONFIG,
  "baseline",
  "scaffolded",
  result.dimensions.slice(0, 2),
  "2026-08-19T00:00:00.000Z",
);

function renderTeachingContrast(showPoints = true) {
  const Renderable = OpenEnaGroupContrast as unknown as ComponentType<Record<string, unknown>>;
  return renderToStaticMarkup(createElement(Renderable, {
    contrast: teachingContrast,
    edgeThreshold: 0,
    showPoints,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  }));
}

function plotSvg(markup: string, testId: string) {
  return markup.match(new RegExp(`<svg[^>]*data-testid="${testId}"[\\s\\S]*?<\\/svg>`))?.[0] ?? "";
}

function groupsWithAttribute(svg: string, attribute: string) {
  return [...svg.matchAll(new RegExp(`<g\\b(?=[^>]*${attribute})[^>]*>[\\s\\S]*?<\\/g>`, "g"))]
    .map((match) => match[0]);
}

function openingTag(block: string) {
  return block.match(/^<g\b[^>]*>/)?.[0] ?? "";
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

test("official endpoint plots persistently render every enabled unit as a small group-colored circle", () => {
  const markup = renderTeachingContrast(true);
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");

  assert.equal(groupsWithAttribute(comparison, 'data-ena-unit-point="true"').length, 8);
  assert.equal(groupsWithAttribute(primary, 'data-ena-unit-point="true"').length, 4);
  assert.equal(groupsWithAttribute(secondary, 'data-ena-unit-point="true"').length, 4);

  for (const block of groupsWithAttribute(comparison, 'data-ena-unit-point="true"')) {
    const tag = openingTag(block);
    const role = attribute(tag, "data-ena-group-role");
    assert.equal(attribute(tag, "data-ena-point-shape"), "circle");
    assert.ok(Number(attribute(tag, "data-ena-marker-size")) <= 5);
    assert.match(
      block,
      new RegExp(`<circle\\b[^>]*fill="${role === "primary" ? JENA_PRIMARY_COLOR : JENA_SECONDARY_COLOR}"`),
    );
  }

  assert.doesNotMatch(markup, /point-reveal|revealed-unit|revealed-point|overlap-label/i);

  const hidden = renderTeachingContrast(false);
  assert.equal((hidden.match(/data-ena-unit-point="true"/g) ?? []).length, 0);
});

test("group summaries are larger colored squares and never reveal controls", () => {
  const markup = renderTeachingContrast(true);
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");

  const expectedPlots = [
    [comparison, ["primary", "secondary"]],
    [primary, ["primary"]],
    [secondary, ["secondary"]],
  ] as const;

  for (const [svg, expectedRoles] of expectedPlots) {
    const summaries = groupsWithAttribute(svg, 'data-ena-summary-marker="true"');
    assert.equal(summaries.length, expectedRoles.length);
    for (const [index, block] of summaries.entries()) {
      const tag = openingTag(block);
      const role = expectedRoles[index];
      assert.equal(attribute(tag, "data-ena-group-role"), role);
      assert.equal(attribute(tag, "data-ena-point-shape"), "square");
      assert.ok(Number(attribute(tag, "data-ena-marker-size")) > 5);
      assert.match(tag, /role="img"/);
      assert.doesNotMatch(tag, /role="button"|tabindex=|aria-pressed=|aria-controls=/);
      assert.match(
        block,
        new RegExp(`<rect\\b[^>]*fill="${role === "primary" ? JENA_PRIMARY_COLOR : JENA_SECONDARY_COLOR}"`),
      );
    }
  }

  const root = comparison.match(/^<svg\b[^>]*>/)?.[0] ?? "";
  assert.match(root, /role="img"/);
  assert.doesNotMatch(root, /aria-roledescription="interactive/);
  assert.doesNotMatch(markup, /Reveal [^<]* unit points|Show all unit points/i);
});

test("the workspace and group-contrast API contain no mean-click reveal state", () => {
  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const contrast = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaGroupContrast.tsx"),
    "utf8",
  );
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  for (const source of [workspace, contrast]) {
    assert.doesNotMatch(source, /revealedPointGroup|onRevealGroupPoints|nextRevealedPointGroup|revealGroupPoints/);
  }
  assert.doesNotMatch(contrast, /activateMeanMarker|ena-group-mean-button|data-ena-points-revealed/);
  assert.doesNotMatch(css, /ena-group-mean-button|ena-group-mean-focus-ring|ena-set-revealed-unit-points|ena-group-point-reveal-status/);
});
