import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaGroupContrast, {
  type OpenEnaGroupContrastProps,
} from "../components/open-ena/OpenEnaGroupContrast";
import type {
  OpenEnaPairwiseContrast,
  OpenEnaPairwiseContrastSide,
} from "../lib/open-ena/contrasts";

const PRIMARY_COLOR = "#cc423a";
const SECONDARY_COLOR = "#218ebf";
const MAIN_WIDTH = 920;
const MAIN_HEIGHT = 723;
const MAIN_CENTER_OFFSET_X = -0.25;
const MAIN_CENTER_OFFSET_Y = -1;
const T_CRITICAL_975_DF_3 = 3.182446305284263;

function arithmeticMean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function side(
  name: string,
  unitPrefix: string,
  coordinates: Array<[number, number]>,
): OpenEnaPairwiseContrastSide {
  return {
    name,
    unitCount: coordinates.length,
    unitIds: coordinates.map((_, index) => `RAW-PRIVATE-${unitPrefix}-${index + 1}`),
    points: coordinates.map(([x, y], index) => ({
      unitId: `RAW-PRIVATE-${unitPrefix}-${index + 1}`,
      group: name,
      x,
      y,
    })),
    meanPoint: {
      SVD1: arithmeticMean(coordinates.map(([x]) => x)),
      SVD2: arithmeticMean(coordinates.map(([, y]) => y)),
    },
    meanWeights: {},
  };
}

function fixtureContrast(): OpenEnaPairwiseContrast {
  return {
    groupColumn: "condition",
    declaredGroups: [
      { name: "Studio", unitCount: 4, pointCount: 4 },
      { name: "Seminar", unitCount: 4, pointCount: 4 },
    ],
    groupOrder: ["Studio", "Seminar"],
    axes: ["SVD1", "SVD2"],
    coordinateExtent: { minX: -20, maxX: 20, minY: -20, maxY: 20 },
    configuration: {
      unitColumns: ["unit"],
      conversationColumns: ["conversation"],
      groupColumn: "condition",
      codes: ["Evidence"],
      model: "EndPoint",
      window: "Conversation",
      windowSizeBack: 1,
      windowSizeForward: 0,
      weightBy: "binary",
      rotation: "svd",
      referenceRotationId: null,
      centerAlignToOrigin: true,
    },
    resultProvenance: {
      analyzedAt: "2026-08-19T00:00:00.000Z",
      model: "EndPoint",
      dimensions: ["SVD1", "SVD2"],
      sourceDatasetNormalizedUtf8TextSha256: "a".repeat(64),
      sourceBindingStatus: "bound",
      projectionReference: null,
      rotationMethod: "svd",
      referenceId: null,
      fit: {
        method: "svd",
        unitColumns: ["unit"],
        conversationColumns: ["conversation"],
      },
    },
    geometry: {
      codes: ["Evidence"],
      dimensions: ["SVD1", "SVD2"],
      adjacencyKey: [],
      rotationColumns: ["SVD1", "SVD2"],
      rotationMatrix: [[1, 0], [0, 1]],
      eigenvalues: [1, 0.5],
      centerVector: [0, 0],
      variance: { SVD1: 0.6, SVD2: 0.3 },
      nodes: [{ code: "Evidence", coordinates: { SVD1: 0, SVD2: 0 } }],
    },
    primary: side("Studio", "PRIMARY", [
      [-2, 0],
      [0, 2],
      [2, 4],
      [4, 6],
    ]),
    secondary: side("Seminar", "SECONDARY", [
      [6, -6],
      [8, -4],
      [10, -2],
      [12, 0],
    ]),
    nodes: [{ code: "Evidence", x: 0, y: 0 }],
    edges: [],
    edgeScaleDenominators: {
      difference: 0,
      sharedMean: 0,
      differenceDefinition: "maximum absolute Primary-minus-Secondary edge difference",
      sharedMeanDefinition: "shared maximum absolute Primary or Secondary mean edge weight",
    },
    inference: {
      status: "available",
      provenance: "ENA.HK post-projection inference",
      method: "Mann-Whitney U for the first selected group; two-sided normal approximation with average ranks, tie-corrected variance, and a 0.5 continuity correction",
      effectDefinition: "r_rb(primary vs secondary) = 2 * U(primary) / (nPrimary * nSecondary) - 1; positive values indicate higher ranks in the primary selected group",
      multiplicityCorrection: "none",
      groupOrder: ["Studio", "Seminar"],
      rows: [],
    },
    createdAt: "2026-08-19T00:01:00.000Z",
    boundaries: [],
  };
}

const defaultProps: Omit<OpenEnaGroupContrastProps, "contrast"> = {
  edgeThreshold: 0,
  showPoints: true,
  showNetworks: false,
  showLabels: true,
  showGroupLabels: true,
  showUnitLabels: false,
  showVariance: true,
  edgeScale: 1,
  pointScale: 1,
  textScale: 1,
  plotZoom: 1,
  flipX: false,
  flipY: false,
};

function render(
  contrast = fixtureContrast(),
  props: Partial<Omit<OpenEnaGroupContrastProps, "contrast">> = {},
) {
  return renderToStaticMarkup(createElement(OpenEnaGroupContrast, {
    ...defaultProps,
    ...props,
    contrast,
  }));
}

function plotSvg(markup: string, testId: string) {
  return markup.match(new RegExp(`<svg[^>]*data-testid="${testId}"[\\s\\S]*?<\\/svg>`))?.[0] ?? "";
}

function guideBlocks(svg: string) {
  return [...svg.matchAll(/<g\b(?=[^>]*data-ena-uncertainty-guide="marginal-student-t-95")[^>]*>[\s\S]*?<\/g>/g)]
    .map((match) => match[0]);
}

function guideForRole(svg: string, role: "primary" | "secondary") {
  return guideBlocks(svg).find((block) => block.match(new RegExp(`<g\\b[^>]*data-ena-group-role="${role}"`))) ?? "";
}

function openTag(block: string) {
  return block.match(/^<g\b[^>]*>/)?.[0] ?? "";
}

function intervalLineTags(block: string) {
  return [...block.matchAll(/<line\b(?=[^>]*data-ena-interval-line="[^"]+")[^>]*>/g)]
    .map((match) => match[0]);
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

function numberAttribute(tag: string, name: string) {
  const value = Number(attribute(tag, name));
  assert.ok(Number.isFinite(value), `${name} must be finite on ${tag}`);
  return value;
}

function approximately(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("only Comparison overlays the two groups' marginal Student-t guides", () => {
  const markup = render();
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");

  assert.equal(guideBlocks(comparison).length, 2, "Comparison must overlay one uncertainty guide per selected group");
  assert.equal(guideBlocks(primary).length, 0, "The official Primary side plot does not render interval guides");
  assert.equal(guideBlocks(secondary).length, 0, "The official Secondary side plot does not render interval guides");
  assert.ok(guideForRole(comparison, "primary"));
  assert.ok(guideForRole(comparison, "secondary"));
  assert.equal(guideForRole(primary, "primary"), "");
  assert.equal(guideForRole(primary, "secondary"), "");
  assert.equal(guideForRole(secondary, "primary"), "");
  assert.equal(guideForRole(secondary, "secondary"), "");
});

test("each guide reports the arithmetic-mean marginal 95% Student-t calculation from endpoint units", () => {
  const comparison = plotSvg(render(), "open-ena-group-comparison-plot");
  const primary = guideForRole(comparison, "primary");
  assert.ok(primary, "Primary marginal interval guide is missing");
  const tag = openTag(primary);

  assert.equal(attribute(tag, "data-ena-uncertainty-status"), "estimable");
  assert.equal(attribute(tag, "data-ena-confidence-level"), "0.95");
  assert.equal(attribute(tag, "data-ena-estimand"), "arithmetic-group-mean");
  assert.equal(attribute(tag, "data-ena-observation-unit"), "endpoint-analytic-unit");
  assert.equal(attribute(tag, "data-ena-interval-interpretation"), "two-separate-marginal-confidence-intervals");
  assert.equal(attribute(tag, "data-ena-joint-region"), "false");
  assert.equal(attribute(tag, "data-ena-significance-test"), "false");
  assert.equal(attribute(tag, "data-ena-sample-size"), "4");
  assert.equal(attribute(tag, "data-ena-degrees-freedom"), "3");

  const sampleStandardError = Math.sqrt(20 / 3) / Math.sqrt(4);
  const halfWidth = T_CRITICAL_975_DF_3 * sampleStandardError;
  approximately(numberAttribute(tag, "data-ena-t-critical"), T_CRITICAL_975_DF_3);
  approximately(numberAttribute(tag, "data-ena-x-standard-error"), sampleStandardError);
  approximately(numberAttribute(tag, "data-ena-y-standard-error"), sampleStandardError);
  approximately(numberAttribute(tag, "data-ena-x-mean"), 1);
  approximately(numberAttribute(tag, "data-ena-y-mean"), 3);
  approximately(numberAttribute(tag, "data-ena-x-lower"), 1 - halfWidth);
  approximately(numberAttribute(tag, "data-ena-x-upper"), 1 + halfWidth);
  approximately(numberAttribute(tag, "data-ena-y-lower"), 3 - halfWidth);
  approximately(numberAttribute(tag, "data-ena-y-upper"), 3 + halfWidth);
});

test("each official-style guide uses six dashed lines and eight static square handles", () => {
  const comparison = plotSvg(render(), "open-ena-group-comparison-plot");
  const expectedLineRoles = [
    "top",
    "right",
    "bottom",
    "left",
    "mean-x",
    "mean-y",
  ];
  const expectedHandlePositions = [
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];

  for (const [role, color] of [["primary", PRIMARY_COLOR], ["secondary", SECONDARY_COLOR]] as const) {
    const block = guideForRole(comparison, role);
    assert.ok(block, `${role} interval guide is missing`);
    const tag = openTag(block);
    const lines = intervalLineTags(block);
    assert.deepEqual(
      lines.map((line) => attribute(line, "data-ena-interval-line")),
      expectedLineRoles,
      `${role} guide must have four axis-aligned boundaries plus two through-mean crosshairs`,
    );
    for (const line of lines) {
      assert.equal(attribute(line, "stroke"), color);
      assert.equal(attribute(line, "stroke-dasharray"), "10,10,5,10");
      assert.equal(attribute(line, "aria-hidden"), "true");
      assert.doesNotMatch(line, /transform="[^\"]*rotate/i);
    }
    assert.doesNotMatch(block, /data-ena-interval-outline=/, "the official guide is six lines, not one dashed rect element");
    const handles = [...block.matchAll(/<rect\b(?=[^>]*data-ena-interval-handle="[^"]+")[^>]*>/g)]
      .map((match) => match[0]);
    assert.deepEqual(
      handles.map((handle) => attribute(handle, "data-ena-interval-handle")),
      expectedHandlePositions,
      `${role} guide must reproduce the official eight static square handles`,
    );
    for (const handle of handles) {
      assert.equal(attribute(handle, "fill"), color);
      assert.equal(attribute(handle, "aria-hidden"), "true");
      assert.equal(numberAttribute(handle, "width"), 3.9);
      assert.equal(numberAttribute(handle, "height"), 3.9);
    }
    assert.equal(attribute(tag, "role"), "img");
    assert.match(attribute(tag, "aria-label"), /two separate marginal 95% Student-t confidence intervals/i);
    assert.match(attribute(tag, "aria-label"), /not a joint confidence region or significance test/i);
    assert.match(block, /<title>[^<]*two separate marginal 95% Student-t confidence intervals[^<]*<\/title>/i);
    assert.doesNotMatch(tag, /role="button"|tabindex=|aria-pressed=|aria-controls=/i);
  }
});

test("a non-estimable group has no visible guide and discloses why inside the SVG", () => {
  const contrast = fixtureContrast();
  contrast.primary = side("Studio", "PRIMARY-SINGLE", [[1, 3]]);
  contrast.secondary = side("Seminar", "SECONDARY-CONSTANT", [
    [6, -3],
    [8, -3],
    [10, -3],
    [12, -3],
  ]);
  const markup = render(contrast);
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");

  assert.equal(guideBlocks(comparison).length, 0);
  assert.equal(guideBlocks(primary).length, 0);
  assert.equal(guideBlocks(secondary).length, 0);
  assert.match(comparison, /<desc\b(?=[^>]*data-ena-uncertainty-status="not-estimable")(?=[^>]*data-ena-group-role="primary")(?=[^>]*data-ena-uncertainty-reason="insufficient-n")[^>]*>/);
  assert.match(comparison, /<desc\b(?=[^>]*data-ena-uncertainty-status="not-estimable")(?=[^>]*data-ena-group-role="secondary")(?=[^>]*data-ena-uncertainty-reason="zero-or-nonfinite-standard-error")[^>]*>/);
  assert.doesNotMatch(primary, /data-ena-uncertainty-status=|data-ena-uncertainty-reason=/);
  assert.doesNotMatch(secondary, /data-ena-uncertainty-status=|data-ena-uncertainty-reason=/);
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|-Infinity)\b/);
});

test("interval geometry flips with the shared projector while zoom keeps it inside the exported SVG", () => {
  const normalSvg = plotSvg(render(), "open-ena-group-comparison-plot");
  const flippedSvg = plotSvg(
    render(fixtureContrast(), { flipX: true, flipY: true, plotZoom: 2 }),
    "open-ena-group-comparison-plot",
  );
  const normalBlock = guideForRole(normalSvg, "primary");
  const flippedBlock = guideForRole(flippedSvg, "primary");
  assert.ok(normalBlock && flippedBlock, "Primary interval must remain inline across plot transforms");
  const screenBounds = (block: string) => {
    const boundaryLines = intervalLineTags(block).filter((line) => ["top", "right", "bottom", "left"]
      .includes(attribute(line, "data-ena-interval-line")));
    assert.equal(boundaryLines.length, 4);
    const xs = boundaryLines.flatMap((line) => [numberAttribute(line, "x1"), numberAttribute(line, "x2")]);
    const ys = boundaryLines.flatMap((line) => [numberAttribute(line, "y1"), numberAttribute(line, "y2")]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  const lineForRole = (block: string, lineRole: string) => {
    const line = intervalLineTags(block).find((candidate) => attribute(candidate, "data-ena-interval-line") === lineRole) ?? "";
    assert.ok(line, `${lineRole} interval line is missing`);
    return line;
  };
  const normalBounds = screenBounds(normalBlock);
  const flippedBounds = screenBounds(flippedBlock);
  const centerXTwice = MAIN_WIDTH + MAIN_CENTER_OFFSET_X * 2;
  const centerYTwice = MAIN_HEIGHT + MAIN_CENTER_OFFSET_Y * 2;
  approximately(flippedBounds.minX, centerXTwice - normalBounds.maxX);
  approximately(flippedBounds.maxX, centerXTwice - normalBounds.minX);
  approximately(flippedBounds.minY, centerYTwice - normalBounds.maxY);
  approximately(flippedBounds.maxY, centerYTwice - normalBounds.minY);

  const normalMeanX = lineForRole(normalBlock, "mean-x");
  const normalMeanY = lineForRole(normalBlock, "mean-y");
  const flippedMeanX = lineForRole(flippedBlock, "mean-x");
  const flippedMeanY = lineForRole(flippedBlock, "mean-y");
  approximately(numberAttribute(flippedMeanX, "x1"), centerXTwice - numberAttribute(normalMeanX, "x1"));
  approximately(numberAttribute(flippedMeanX, "x2"), centerXTwice - numberAttribute(normalMeanX, "x2"));
  approximately(numberAttribute(flippedMeanY, "y1"), centerYTwice - numberAttribute(normalMeanY, "y1"));
  approximately(numberAttribute(flippedMeanY, "y2"), centerYTwice - numberAttribute(normalMeanY, "y2"));
  assert.match(flippedSvg.match(/^<svg\b[^>]*>/)?.[0] ?? "", /style="[^"]*transform:scale\(2\)/);

  for (const modelAttribute of ["data-ena-x-lower", "data-ena-x-upper", "data-ena-y-lower", "data-ena-y-upper"]) {
    approximately(
      numberAttribute(openTag(flippedBlock), modelAttribute),
      numberAttribute(openTag(normalBlock), modelAttribute),
    );
  }
});

test("all interval graphics are descendants of inline plot SVGs and never expose endpoint unit IDs", () => {
  const markup = render();
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");
  const inlineGuideCount = [comparison, primary, secondary]
    .reduce((sum, svg) => sum + guideBlocks(svg).length, 0);

  assert.equal(inlineGuideCount, 2);
  assert.equal((markup.match(/data-ena-uncertainty-guide="marginal-student-t-95"/g) ?? []).length, inlineGuideCount);
  assert.doesNotMatch(markup, /<div\b[^>]*data-ena-uncertainty-guide=/);
  assert.doesNotMatch(markup, /RAW-PRIVATE-|data-ena-unit-id=/);
});
