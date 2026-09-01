import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OpenEnaPairwiseContrast } from "../lib/open-ena/contrasts";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function expectMatch(value: string, pattern: RegExp, message: string) {
  assert.ok(pattern.test(value), message);
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const groupContrastSource = source("components/open-ena/OpenEnaGroupContrast.tsx");
const persistentToolsSource = source("components/open-ena/OpenEnaPersistentPlotTools.tsx");
const dataViewSource = source("components/open-ena/OpenEnaDataView.tsx");
const css = source("app/globals.css");

function functionSegment(start: string, end: string) {
  const startIndex = workspace.indexOf(start);
  assert.notEqual(startIndex, -1, `OpenEnaWorkspace must define ${start}`);
  const endIndex = workspace.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `OpenEnaWorkspace must keep ${end} after ${start}`);
  return workspace.slice(startIndex, endIndex);
}

function topLevelCssTracks(value: string) {
  const tracks: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of value.trim()) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (/\s/u.test(character) && depth === 0) {
      if (current) tracks.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current) tracks.push(current);
  return tracks;
}

const teachingContrast = {
  groupColumn: "condition",
  declaredGroups: [
    { name: "baseline", unitCount: 2, pointCount: 2 },
    { name: "scaffolded", unitCount: 2, pointCount: 2 },
  ],
  groupOrder: ["baseline", "scaffolded"],
  axes: ["SVD1", "SVD2"],
  coordinateExtent: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
  configuration: {
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "condition",
    codes: ["goal", "evidence", "revision"],
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
    analyzedAt: "2026-08-15T00:00:00.000Z",
    model: "EndPoint",
    dimensions: ["SVD1", "SVD2", "SVD3"],
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
    codes: ["goal", "evidence", "revision"],
    dimensions: ["SVD1", "SVD2", "SVD3"],
    adjacencyKey: [
      { source: "goal", target: "evidence", name: "goal & evidence", sourceIndex: 0, targetIndex: 1 },
      { source: "goal", target: "revision", name: "goal & revision", sourceIndex: 0, targetIndex: 2 },
      { source: "evidence", target: "revision", name: "evidence & revision", sourceIndex: 1, targetIndex: 2 },
    ],
    rotationColumns: ["SVD1", "SVD2", "SVD3"],
    rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    eigenvalues: [0.6, 0.3, 0.1],
    centerVector: [0, 0, 0],
    variance: { SVD1: 0.6, SVD2: 0.3, SVD3: 0.1 },
    nodes: [
      { code: "goal", coordinates: { SVD1: -1, SVD2: 0.7, SVD3: 0 } },
      { code: "evidence", coordinates: { SVD1: 0.8, SVD2: 0.8, SVD3: 0 } },
      { code: "revision", coordinates: { SVD1: 0.7, SVD2: -0.8, SVD3: 0 } },
    ],
  },
  primary: {
    name: "baseline",
    unitCount: 2,
    unitIds: ["baseline-1", "baseline-2"],
    points: [
      { unitId: "baseline-1", group: "baseline", x: -0.8, y: 0.2 },
      { unitId: "baseline-2", group: "baseline", x: -0.3, y: 0.4 },
    ],
    meanPoint: { SVD1: -0.55, SVD2: 0.3 },
    meanWeights: {
      "goal & evidence": 0.8,
      "goal & revision": 0.3,
      "evidence & revision": 0.2,
    },
  },
  secondary: {
    name: "scaffolded",
    unitCount: 2,
    unitIds: ["scaffolded-1", "scaffolded-2"],
    points: [
      { unitId: "scaffolded-1", group: "scaffolded", x: 0.4, y: -0.1 },
      { unitId: "scaffolded-2", group: "scaffolded", x: 0.9, y: -0.4 },
    ],
    meanPoint: { SVD1: 0.65, SVD2: -0.25 },
    meanWeights: {
      "goal & evidence": 0.4,
      "goal & revision": 0.7,
      "evidence & revision": 0.2,
    },
  },
  nodes: [
    { code: "goal", x: -1, y: 0.7 },
    { code: "evidence", x: 0.8, y: 0.8 },
    { code: "revision", x: 0.7, y: -0.8 },
  ],
  edges: [
    {
      source: "goal",
      target: "evidence",
      name: "goal & evidence",
      primaryWeight: 0.8,
      secondaryWeight: 0.4,
      signedDifference: 0.4,
      stronger: "primary",
    },
    {
      source: "goal",
      target: "revision",
      name: "goal & revision",
      primaryWeight: 0.3,
      secondaryWeight: 0.7,
      signedDifference: -0.4,
      stronger: "secondary",
    },
    {
      source: "evidence",
      target: "revision",
      name: "evidence & revision",
      primaryWeight: 0.2,
      secondaryWeight: 0.2,
      signedDifference: 0,
      stronger: "equal",
    },
  ],
  edgeScaleDenominators: {
    difference: 0.4,
    sharedMean: 0.8,
    differenceDefinition: "maximum absolute Primary-minus-Secondary edge difference",
    sharedMeanDefinition: "shared maximum absolute Primary or Secondary mean edge weight",
  },
  inference: {
    status: "available",
    provenance: "ENA.HK post-projection inference",
    method: "fixture",
    effectDefinition: "fixture",
    multiplicityCorrection: "none",
    groupOrder: ["baseline", "scaffolded"],
    rows: [],
  },
  createdAt: "2026-08-15T00:00:01.000Z",
  boundaries: [],
} as unknown as OpenEnaPairwiseContrast;

async function renderInitialWorkspace() {
  const { default: OpenEnaWorkspace } = await import("../components/open-ena/OpenEnaWorkspace");
  return renderToStaticMarkup(createElement(OpenEnaWorkspace, { locale: "en" }));
}

async function renderTeachingContrast() {
  const { default: OpenEnaGroupContrast } = await import("../components/open-ena/OpenEnaGroupContrast");
  return renderToStaticMarkup(createElement(OpenEnaGroupContrast, {
    contrast: teachingContrast,
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
  }));
}

test("desktop shell preserves ENA.HK identity and exposes four stable workbench regions", async () => {
  const markup = await renderInitialWorkspace();

  expectMatch(markup, /data-ena-rail-brand="true"[^>]*aria-label="ENA\.HK Open ENA"/, "the compact rail must own the ENA.HK Open ENA identity");
  expectMatch(markup, /src="\/ena-mark\.svg"/, "the existing ENA mark must remain visible in the rail");
  expectMatch(markup, /data-ena-rail-version="true"/, "the compact rail must disclose its bound jENA runtime version");
  for (const label of ["Data", "Model", "Plot Tools", "Stats &amp; Export", "AI-assisted interpretation"]) {
    expectMatch(markup, new RegExp(`aria-label="${label}"`), `preserve the existing ${label} rail control`);
  }
  assert.doesNotMatch(markup, /aria-label="Sets"/);
  assert.equal((markup.match(/class="ena-rail-button"/g) ?? []).length, 5, "the four remaining analysis modes and downstream AI entry remain intact");

  for (const region of ["rail", "controls", "center", "right-stack"]) {
    expectMatch(
      markup,
      new RegExp(`data-ena-workbench-region="${region}"`),
      `the desktop workbench must expose a stable ${region} region`,
    );
  }

  const gridRule = css.match(/\.ena-workbench-grid\s*\{([^}]*)\}/)?.[1] ?? "";
  const desktopTracks = gridRule.match(/grid-template-columns:\s*([^;]+)/)?.[1] ?? "";
  assert.ok(desktopTracks, "the desktop workbench must declare its region tracks");
  assert.equal(
    topLevelCssTracks(desktopTracks).length,
    3,
    "the official-inspired shell uses rail, controls, and one research-surface track; center and right stack remain semantic regions inside that surface",
  );
});

test("Model mode is organized as accessible Units, Horizons, Windows, and Codes sections", () => {
  const modelPanel = functionSegment("function renderModelPanel()", "function renderLongitudinalPanel()");

  expectMatch(modelPanel, /role="tablist"[^>]*aria-label=[^>]*(?:model|configuration)/i,
    "Model mode needs an accessible configuration tablist");
  const sectionNames = ["units", "(?:horizons|conversations)", "windows", "codes"];
  for (const section of sectionNames) {
    expectMatch(
      modelPanel,
      new RegExp(`id:\\s*["']${section.replace("(?:horizons|conversations)", "horizons")}["']`, "i"),
      `Model mode needs a researcher-visible ${section} tab or honest local equivalent`,
    );
  }
  expectMatch(modelPanel, /data-ena-model-tab=\{tab\.id\}/, "each rendered model tab must expose its stable semantic identifier");
  assert.equal((modelPanel.match(/\{ id: "(?:units|horizons|windows|codes)"/g) ?? []).length, 4,
    "all four keyboard-addressable tabs must be declared in the rendered tab collection");
  expectMatch(modelPanel, /aria-selected=/, "the selected model tab must be exposed to assistive technology");
  expectMatch(modelPanel, /data-ena-model-panel=/, "the active tab must own a scoped model panel");
});

test("all four Model tabs share a taller stable content stage before validation and rebuild", () => {
  expectMatch(
    css,
    /\.ena-model-tabbed-form\s*\{[^}]*--ena-model-tab-stage-height:\s*380px;[^}]*--ena-model-selection-stage-height:\s*300px;/,
    "Model mode must define one deliberate vertical rhythm for every tab",
  );
  expectMatch(
    css,
    /\.ena-model-tab-panel\s*\{[^}]*min-height:\s*var\(--ena-model-tab-stage-height\);[^}]*align-content:\s*start;/,
    "the tabpanel stage keeps validation and Rebuild model aligned while switching Units, Horizons, Windows, and Codes",
  );
  expectMatch(
    css,
    /\.ena-model-tab-panel\[data-ena-model-panel="units"\]\s+\.ena-identity-fieldset,[\s\S]*?\.ena-model-tab-panel\[data-ena-model-panel="horizons"\]\s+\.ena-identity-fieldset\s*\{[^}]*height:\s*var\(--ena-model-selection-stage-height\);[^}]*min-height:\s*var\(--ena-model-selection-stage-height\);/,
    "Units and Horizons must expose the taller metadata-selection region requested by the researcher",
  );
  expectMatch(
    css,
    /\.ena-model-tab-panel\[data-ena-model-panel="codes"\]\s+\.ena-code-fieldset\s*\{[^}]*height:\s*var\(--ena-model-tab-stage-height\);[^}]*min-height:\s*var\(--ena-model-tab-stage-height\);/,
    "Codes must use the same tall selection-stage design",
  );
  expectMatch(
    css,
    /\.ena-model-tab-panel\[data-ena-model-panel="(?:units|horizons)"\][\s\S]*?\.ena-code-options[\s\S]*?max-height:\s*none;[^}]*flex:\s*1 1 auto;/,
    "the taller fieldset must expand its scrollable options rather than leave decorative empty space",
  );
});

test("loaded Teaching Sample keeps Comparison central and Primary, Secondary, then Plot Tools in the right stack", async () => {
  const markup = await renderTeachingContrast();

  expectMatch(markup, /data-testid="open-ena-group-comparison-plot"/, "the loaded result needs a central Comparison Plot");
  expectMatch(markup, /data-testid="open-ena-group-primary-plot"/, "the loaded result needs a Primary Plot");
  expectMatch(markup, /data-testid="open-ena-group-secondary-plot"/, "the loaded result needs a Secondary Plot");

  const combinedSurface = `${workspace}\n${groupContrastSource}\n${persistentToolsSource}`;
  expectMatch(
    combinedSurface,
    /data-testid="open-ena-persistent-plot-tools"/,
    "Plot Tools must be rendered as a persistent right-stack region, not only as a rail-selected left panel",
  );
  for (const tool of ["edge-scale", "text-size", "code-labels", "unit-points", "group-labels", "flip-x", "flip-y"]) {
    expectMatch(
      combinedSurface,
      new RegExp(`data-ena-plot-tool="${tool}"`),
      `persistent Plot Tools must expose ${tool}`,
    );
  }

  const primaryPosition = groupContrastSource.indexOf("Primary Plot");
  const secondaryPosition = groupContrastSource.indexOf("Secondary Plot", primaryPosition);
  const toolsPosition = groupContrastSource.indexOf("{rightTools}", secondaryPosition);
  assert.ok(primaryPosition >= 0 && secondaryPosition > primaryPosition && toolsPosition > secondaryPosition,
    "the right stack must read Primary Plot, Secondary Plot, then Plot Tools");
});

test("Data View is an explicit center-surface state that replaces the Comparison plot", () => {
  expectMatch(
    workspace,
    /data-testid="open-ena-center-surface"/,
    "the replaceable center research surface needs one stable semantic owner",
  );
  expectMatch(workspace, /data-testid="open-ena-data-view-toggle"/, "Data View needs an explicit toggle");
  expectMatch(workspace, /data-testid="open-ena-center-data-view"/, "Data View needs a center-surface table state");
  expectMatch(dataViewSource, /data-testid="open-ena-data-view"/, "the center branch must use the dedicated semantic Data View surface");

  const resultData = functionSegment("function renderResultData()", "const analysisPanel =");
  assert.doesNotMatch(
    resultData,
    /return\s*\(\s*<details\b/,
    "Data View must not remain a collapsible details table appended below the plots",
  );
  assert.equal(
    (workspace.match(/aiPanel=\{renderAiPanel\(\)\}/g) ?? []).length,
    1,
    "one persistent AI child must remain mounted beside the mode-selected analysis panel",
  );
  expectMatch(
    workspace,
    /data-testid="open-ena-persistent-ai-lifecycle"[\s\S]{0,160}hidden=\{mode !== "ai"\}/,
    "the persistent AI child must switch visibility by mode without conditional unmounting",
  );
});

test("loaded plot markup discloses observations, group summaries, shared scale, axes, variance, unit, and horizon", async () => {
  const markup = await renderTeachingContrast();
  const comparison = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.equal((comparison.match(/data-ena-unit-point="true"/g) ?? []).length, 4, "the fixture Comparison Plot needs all four persistent unit observations");
  expectMatch(comparison, /data-ena-mean-marker="primary-square"/, "the Comparison Plot needs a Primary square group summary marker");
  expectMatch(comparison, /data-ena-mean-marker="secondary-square"/, "the Comparison Plot needs a Secondary square group summary marker");
  expectMatch(comparison, /data-ena-edge-scale-kind="signed-difference"/, "the Comparison Plot must identify its signed-difference scale contract");
  expectMatch(comparison, /data-ena-edge-scale-max="0\.4"/, "the rendered difference denominator must be disclosed");

  expectMatch(comparison, /data-ena-axis-x="SVD1"/, "the rendered Comparison Plot must expose its X axis metadata");
  expectMatch(comparison, /data-ena-axis-y="SVD2"/, "the rendered Comparison Plot must expose its Y axis metadata");
  expectMatch(comparison, /data-ena-axis-(?:variance-x|x-variance)="(?:0\.6|60(?:\.0)?)"/, "the rendered Comparison Plot must expose X variance metadata");
  expectMatch(comparison, /data-ena-axis-(?:variance-y|y-variance)="(?:0\.3|30(?:\.0)?)"/, "the rendered Comparison Plot must expose Y variance metadata");
  expectMatch(comparison, /data-ena-unit-definition="unit"/, "the plot must expose the fitted unit definition");
  expectMatch(comparison, /data-ena-horizon-definition="conversation"/, "the plot must expose the fitted horizon definition");
  expectMatch(
    markup,
    /(?:Unit|Units)[^<]*(?:unit)[\s\S]*?(?:Horizon|Horizons)[^<]*(?:conversation)/i,
    "the main plot must visibly disclose the fitted unit and horizon definitions",
  );
});

test("the empty-state inline SVG is a connected graph, not disconnected CSS decoration", async () => {
  const markup = await renderInitialWorkspace();
  const svg = markup.match(/<svg[^>]*data-testid="open-ena-empty-network"[\s\S]*?<\/svg>/)?.[0] ?? "";
  assert.ok(svg, "the empty state must render one inline SVG network");

  const nodes = [...svg.matchAll(/<circle\b[^>]*cx="([\d.-]+)"[^>]*cy="([\d.-]+)"[^>]*r="([\d.-]+)"[^>]*>/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]), r: Number(match[3]) }));
  const edges = [...svg.matchAll(/<line\b[^>]*x1="([\d.-]+)"[^>]*y1="([\d.-]+)"[^>]*x2="([\d.-]+)"[^>]*y2="([\d.-]+)"[^>]*>/g)]
    .map((match) => ({ x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]) }));

  assert.ok(nodes.length >= 3, "the empty network needs at least three declared nodes");
  assert.ok(edges.length >= nodes.length - 1, "the empty network needs enough edges to connect every node");

  const nodeAt = (x: number, y: number) => nodes.findIndex((node) => Math.hypot(node.x - x, node.y - y) <= node.r);
  const adjacency = nodes.map(() => new Set<number>());
  for (const edge of edges) {
    const start = nodeAt(edge.x1, edge.y1);
    const end = nodeAt(edge.x2, edge.y2);
    assert.notEqual(start, -1, `edge start (${edge.x1}, ${edge.y1}) must meet a declared node`);
    assert.notEqual(end, -1, `edge end (${edge.x2}, ${edge.y2}) must meet a declared node`);
    adjacency[start].add(end);
    adjacency[end].add(start);
  }

  const reached = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbor of adjacency[current]) {
      if (!reached.has(neighbor)) {
        reached.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  assert.equal(reached.size, nodes.length, "every empty-state node must be connected into one graph");
  assert.ok(svg.lastIndexOf("<line") < svg.indexOf("<circle"), "edges render beneath nodes so joins remain visually clean");
  assert.doesNotMatch(workspace, /<(?:span|i)\s+className="[ne]\d+"/, "do not revive the disconnected positioned-element motif");
});
