import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const workspace = readFileSync(
  join(projectRoot, "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);
const styles = readFileSync(join(projectRoot, "app/globals.css"), "utf8");

function functionSegment(startMarker: string, endMarker: string) {
  const start = workspace.indexOf(startMarker);
  assert.notEqual(start, -1, `OpenEnaWorkspace must define ${startMarker}`);
  const end = workspace.indexOf(endMarker, start);
  assert.notEqual(end, -1, `OpenEnaWorkspace must keep ${endMarker} after ${startMarker}`);
  return workspace.slice(start, end);
}

const componentState = workspace.slice(0, workspace.indexOf("function renderSetsPanel()"));
const statsPanel = functionSegment("function renderStatsPanel()", "function renderSourceEvidence()");

function markerPosition(marker: string) {
  const position = statsPanel.indexOf(marker);
  assert.notEqual(position, -1, `Stats & Export must expose ${marker}`);
  return position;
}

function statsPanelSlice(startMarker: string, endMarker: string) {
  const start = markerPosition(startMarker);
  const end = markerPosition(endMarker);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return statsPanel.slice(start, end);
}

test("Stats exposes exactly Comparison, Goodness of Fit, and Variance tabs in that order", () => {
  const definitions = workspace.match(
    /const\s+(?:STATS_TABS|statsTabs)\s*=\s*\[([\s\S]*?)\]\s*(?:as const)?;/,
  )?.[1] ?? "";
  assert.ok(definitions, "Stats must declare one stable ordered tab collection");
  const tabs = [...definitions.matchAll(/id:\s*["']([^"']+)["'][\s\S]*?label:\s*["']([^"']+)["']/g)]
    .map((match) => ({ id: match[1], label: match[2] }));
  assert.deepEqual(tabs, [
    { id: "comparison", label: "Comparison" },
    { id: "goodness", label: "Goodness of Fit" },
    { id: "variance", label: "Variance" },
  ]);
  assert.match(statsPanel, /role="tablist"/, "Stats must expose one accessible tablist");
  assert.match(statsPanel, /role="tab"/);
  assert.match(statsPanel, /data-ena-stats-tab=\{tab\.id\}/);
  assert.doesNotMatch(definitions, /Theory\s*&\s*Methods/i, "Theory & Methods is not a Stats tab");
});

test("Stats tabs expose selected state and an owned tabpanel", () => {
  assert.ok(
    /const\s*\[\s*statsTab,\s*setStatsTab\s*\]\s*=\s*useState(?:<[^>]+>)?\(["']comparison["']\)/.test(componentState),
    "Comparison must be the initial selected Stats tab",
  );
  assert.match(statsPanel, /role="tab"/);
  assert.match(
    statsPanel,
    /aria-selected=\{statsTab\s*===\s*tab\.id\}/,
    "each tab must expose whether it is selected",
  );
  assert.match(statsPanel, /aria-controls=\{[^}]+\}/, "each Stats tab must own a panel");
  assert.match(statsPanel, /role="tabpanel"/, "the selected Stats view must be an accessible tabpanel");
  assert.match(
    statsPanel,
    /data-ena-stats-panel=\{statsTab\}/,
    "the active tabpanel must expose its stable Stats scope",
  );
});

test("Comparison explicitly separates selected-pair results from all-group jENA omnibus tests", () => {
  const selectedPair = markerPosition('data-ena-stats-scope="selected-pair"');
  const omnibus = markerPosition('data-ena-stats-scope="all-groups-omnibus"');
  assert.notEqual(selectedPair, omnibus);

  const selectedPairBlock = statsPanel.slice(selectedPair, omnibus);
  assert.match(selectedPairBlock, /groupContrast\.groupOrder/, "selected-pair results must name the current Primary and Secondary groups");
  assert.match(selectedPairBlock, /groupContrast\.axes/, "selected-pair results must follow the current X and Y axes");
  assert.match(selectedPairBlock, /mannWhitney|dimensionEffect/, "selected-pair inference must remain inside the selected-pair scope");
  assert.doesNotMatch(selectedPairBlock, /result\.stats\.tests/, "all-group jENA tests must not masquerade as selected-pair results");

  const omnibusEnd = markerPosition('data-ena-stats-panel="goodness"');
  assert.ok(omnibusEnd > omnibus, "the all-group omnibus scope must remain within Comparison");
  const omnibusBlock = statsPanel.slice(omnibus, omnibusEnd);
  const omnibusCondition = statsPanel.slice(Math.max(0, omnibus - 180), omnibus);
  assert.match(omnibusCondition, /result\.groups\.length\s*>\s*2/, "the omnibus scope applies only when more than two groups are present");
  assert.match(omnibusBlock, /renderJenaTestContent/, "the omnibus scope must own the jENA fitted-model test output");
  assert.match(omnibusBlock, /all-group omnibus/i, "the omnibus scope must be visibly named, not explained only in trailing prose");
});

test("Goodness of Fit contains only correlation diagnostics and Variance contains only selected-axis shares", () => {
  const goodness = statsPanelSlice(
    'data-ena-stats-panel="goodness"',
    'data-ena-stats-panel="variance"',
  );
  assert.match(goodness, /result\.stats\.correlations/, "Goodness of Fit must use the verified correlation diagnostics");
  assert.match(goodness, /Pearson/);
  assert.match(goodness, /Spearman/);
  assert.doesNotMatch(goodness, /result\.stats\.tests|mannWhitney|dimensionEffect|result\.set\.variance|downloadJson|methodsReport/);

  const variance = statsPanelSlice(
    'data-ena-stats-panel="variance"',
    'data-ena-stats-export="true"',
  );
  assert.match(
    variance,
    /(?:\[xDimension,\s*yDimension\]|groupContrastAxes|groupContrast\.axes)\.map/,
    "Variance must be limited to the researcher's selected X and Y axes",
  );
  assert.match(variance, /result\.set\.variance\[dimension\]/);
  assert.doesNotMatch(variance, /result\.dimensions\.map/, "Variance must not silently expand to every rotated dimension");
  assert.doesNotMatch(variance, /result\.stats\.correlations|result\.stats\.tests|mannWhitney|dimensionEffect|downloadJson|methodsReport/);
});

test("exports and reproducibility remain outside the three statistical tabpanels", () => {
  const comparisonPanel = markerPosition('data-ena-stats-panel="comparison"');
  const goodnessPanel = markerPosition('data-ena-stats-panel="goodness"');
  const variancePanel = markerPosition('data-ena-stats-panel="variance"');
  const exportPanel = markerPosition('data-ena-stats-export="true"');

  assert.ok(
    comparisonPanel < goodnessPanel && goodnessPanel < variancePanel && variancePanel < exportPanel,
    "the local export/reproducibility region must follow, not become, a current-official Stats tab",
  );
  const exportBlock = statsPanel.slice(exportPanel);
  assert.match(exportBlock, /buildAnalysisBundle|Export result bundle/);
  assert.match(exportBlock, /Methods &(?:amp;)? Reproducibility|methodsReport/);
  assert.doesNotMatch(exportBlock, /role="tabpanel"/, "exports and reproducibility must not be a hidden fourth statistical tabpanel");
});

test("Stats tabs remain compact and visibly keyboard focused", () => {
  assert.match(styles, /\.ena-stats-tabs\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.ena-stats-tabs button\[aria-selected="true"\][\s\S]*?border-bottom-color:\s*var\(--ena-teal\)/);
  assert.match(styles, /\.ena-stats-tabs button:focus-visible[\s\S]*?outline:/);
  assert.match(styles, /\.ena-stats-export-region[\s\S]*?border-top:/, "local export tools must be visually separated from the official Stats views");
});
