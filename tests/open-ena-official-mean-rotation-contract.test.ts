import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaGroupContrast, {
  type OpenEnaGroupContrastProps,
} from "../components/open-ena/OpenEnaGroupContrast";
import { analyzeDataset, effectiveRotation } from "../lib/open-ena/analyze";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import * as csvModule from "../lib/open-ena/csv";
import type { OpenEnaConfig, ParsedDataset } from "../lib/open-ena/types";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

type OfficialComparisonRotationOptions = {
  groupColumn: string | null;
  model: OpenEnaConfig["model"];
  currentRotation: OpenEnaConfig["rotation"];
};

type OfficialComparisonRotation = (
  dataset: ParsedDataset,
  options: OfficialComparisonRotationOptions,
) => OpenEnaConfig["rotation"];

function officialComparisonRotation(
  dataset: ParsedDataset,
  options: OfficialComparisonRotationOptions,
) {
  const candidate = (csvModule as unknown as {
    officialComparisonRotation?: OfficialComparisonRotation;
  }).officialComparisonRotation;
  assert.equal(
    typeof candidate,
    "function",
    "lib/open-ena/csv must export the pure officialComparisonRotation policy",
  );
  return candidate!(dataset, options);
}

function datasetWithGroups(groups: Array<string | null>) {
  return csvModule.parseCsv(
    [
      "unit,conversation,group,A,B,C",
      ...groups.map((group, index) => [
        `u${index + 1}`,
        `c${index + 1}`,
        group ?? "",
        "1",
        "1",
        "1",
      ].join(",")),
    ].join("\n") + "\n",
    { name: "official-comparison-rotation.csv", source: "upload" },
  );
}

test("the official comparison policy selects Means Rotation only for eligible two-group endpoint data", () => {
  const endpoint = {
    groupColumn: "group",
    model: "EndPoint",
    currentRotation: "svd",
  } as const;

  assert.equal(
    officialComparisonRotation(datasetWithGroups(["Experimental", "Control", "Experimental"]), endpoint),
    "mean",
  );
  assert.equal(
    officialComparisonRotation(datasetWithGroups(["Experimental", "Experimental"]), endpoint),
    "svd",
  );
  assert.equal(
    officialComparisonRotation(datasetWithGroups(["Experimental", "Control", "Third"]), endpoint),
    "svd",
  );
  assert.equal(
    officialComparisonRotation(datasetWithGroups(["Experimental", "Control", null]), endpoint),
    "svd",
    "a missing group value makes the automatic Means Rotation choice ineligible",
  );
  assert.equal(
    officialComparisonRotation(datasetWithGroups(["Experimental", "Control"]), {
      ...endpoint,
      groupColumn: null,
    }),
    "svd",
  );
  assert.equal(
    officialComparisonRotation(datasetWithGroups(["Experimental", "Control"]), {
      ...endpoint,
      model: "SeparateTrajectory",
    }),
    "svd",
  );
});

test("the official two-group comparison is fitted with jENA's verified generalized means rotation", () => {
  const dataset = datasetWithGroups(["Experimental", "Control", "Experimental"]);
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
    rotation: "mean",
  };

  assert.deepEqual(effectiveRotation(dataset, config), {
    method: "generalized",
    params: {
      xVar: "group",
      select2Groups: ["Experimental", "Control"],
    },
  });

  const result = analyzeDataset(dataset, config);
  assert.equal(result.dimensions[0], "MR1", "the exported reference/bundle axis remains backward-compatible");
  assert.ok(result.set.points.every((point) => !("RR1" in point)));
  assert.ok(result.set.rotation.nodes?.every((node) => !("RR1" in node)));
});

test("an endpoint reference rotation remains protected while official comparison defaults are reconciled", () => {
  const dataset = datasetWithGroups(["Experimental", "Control"]);

  assert.equal(officialComparisonRotation(dataset, {
    groupColumn: "group",
    model: "EndPoint",
    currentRotation: "reference",
  }), "reference");
  assert.equal(officialComparisonRotation(dataset, {
    groupColumn: "group",
    model: "SeparateTrajectory",
    currentRotation: "reference",
  }), "svd");
});

test("Workspace delegates group and model transitions to the shared official comparison policy", () => {
  const workspace = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  const calls = workspace.match(/officialComparisonRotation\s*\(/g) ?? [];

  assert.match(
    workspace,
    /import[\s\S]{0,400}officialComparisonRotation[\s\S]{0,400}from\s+["']@\/lib\/open-ena\/csv["']/,
    "the workbench must consume the same tested policy that CSV inference uses",
  );
  assert.ok(
    calls.length >= 2,
    "both comparison-group changes and endpoint/model changes must reconcile rotation through the pure policy",
  );
  assert.doesNotMatch(
    workspace,
    /rotation:\s*!event\.target\.value\s*&&\s*current\.rotation\s*===\s*["']mean["']/,
    "the former one-way inline fallback must not bypass the shared two-group policy",
  );
});

test("the browser worker canonicalizes generalized RR1 before building the visible and exported result", () => {
  const worker = readFileSync(
    join(process.cwd(), "lib", "open-ena", "jena.worker.ts"),
    "utf8",
  );
  assert.match(worker, /canonicalizeOfficialMeanRotation/);
  assert.match(
    worker,
    /buildOpenEnaAnalysisPlan\(run\.dataset, run\.config, run\.reference\)/,
  );
  assert.match(
    worker,
    /configuration\.rotation\s*===\s*["']mean["'][\s\S]{0,240}canonicalizeOfficialMeanRotation/,
  );
});

test("mean-rotation figures display official GMR1 while retaining MR1 analytical metadata", () => {
  const sampleText = readFileSync(
    join(process.cwd(), "public", "data", "academy", "ena-design-talk-sample.csv"),
    "utf8",
  );
  const dataset = csvModule.parseCsv(sampleText, {
    name: "ena-design-talk-sample.csv",
    source: "sample",
  });
  const config: OpenEnaConfig = { ...SAMPLE_CONFIG, rotation: "mean" };
  const result = analyzeDataset(dataset, config);
  const contrast = buildPairwiseGroupContrast(
    result,
    config,
    result.groups[0].name,
    result.groups[1].name,
    result.dimensions.slice(0, 2),
    "2026-08-19T00:00:00.000Z",
  );
  assert.equal(contrast.axes[0], "MR1", "jENA's analytical coordinate name remains MR1");

  const props: OpenEnaGroupContrastProps = {
    contrast,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showGroupLabels: true,
    showUnitLabels: false,
    showVariance: true,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaGroupContrast, props));
  const comparisonSvg = markup.match(
    /<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/,
  )?.[0] ?? "";

  assert.equal((markup.match(/data-ena-axis-x="MR1"/g) ?? []).length, 3);
  assert.match(comparisonSvg, /<tspan\b[^>]*>GMR1<\/tspan>/);
  assert.doesNotMatch(comparisonSvg, /<tspan\b[^>]*>MR1<\/tspan>/);
  assert.match(
    comparisonSvg,
    /<title>GMR1(?:\s*·[^<]*)?<\/title>/,
    "the visible axis tooltip follows the official GMR1 label too",
  );
});
