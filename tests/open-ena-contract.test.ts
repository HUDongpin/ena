import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset, buildManifest, dimensionEffect } from "../lib/open-ena/analyze";
import { inferConfig, parseCsv, validateConfig } from "../lib/open-ena/csv";
import { JENA_RUNTIME_VERSION, SAMPLE_CONFIG } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const samplePath = join(projectRoot, "public", "data", "academy", "ena-design-talk-sample.csv");

test("Open ENA uses the canonical internal route from every requested entry point", () => {
  const header = readFileSync(join(projectRoot, "components", "Header.tsx"), "utf8");
  const home = readFileSync(join(projectRoot, "app", "[locale]", "page.tsx"), "utf8");
  const mission = readFileSync(join(projectRoot, "app", "[locale]", "mission", "page.tsx"), "utf8");
  const footer = readFileSync(join(projectRoot, "components", "Footer.tsx"), "utf8");
  const redirects = readFileSync(join(projectRoot, "next.config.ts"), "utf8");

  assert.match(header, /mission[\s\S]*?open-ena[\s\S]*?news/);
  assert.match(home, /href=\{`\/\$\{typedLocale\}\/open-ena`\}/);
  assert.doesNotMatch(home, /officialWebtoolUrl[\s\S]*?common\.openWebtool/);
  assert.match(mission, /href=\{`\/\$\{typedLocale\}\/open-ena`\}/);
  assert.match(footer, /`\/\$\{locale\}\/open-ena`/);
  assert.match(redirects, /source: "\/open-ena", destination: "\/en\/open-ena"/);
  assert.equal(existsSync(join(projectRoot, "app", "[locale]", "open-ena", "page.tsx")), true);
});

test("the CSV parser handles quoted fields and infers a guarded ENA configuration", () => {
  const dataset = parseCsv(
    'unit,conversation,group,turn,A,B,C,note\n"u,1",c1,g1,1,1,0,1,"quoted, note"\nu2,c2,g2,2,0,1,1,plain\n',
    { name: "quoted.csv", source: "upload" },
  );
  assert.equal(dataset.rows[0].unit, "u,1");
  assert.equal(dataset.rows[0].note, "quoted, note");
  assert.deepEqual(inferConfig(dataset).codes, ["A", "B", "C"]);
  assert.deepEqual(validateConfig(dataset, inferConfig(dataset)), []);
  assert.throws(
    () => parseCsv("a,a\n1,2\n", { name: "duplicate.csv", source: "upload" }),
    /unique/,
  );

  const noCoOccurrence = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,0,0\nu2,c2,g2,0,1,0\nu3,c3,g2,0,0,1\n",
    { name: "disconnected.csv", source: "upload" },
  );
  assert.match(validateConfig(noCoOccurrence, inferConfig(noCoOccurrence)).join(" "), /do not co-occur/);

  const threeGroups = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g2,1,0,1\nu3,c3,g3,0,1,1\n",
    { name: "three-groups.csv", source: "upload" },
  );
  assert.deepEqual(validateConfig(threeGroups, inferConfig(threeGroups)), []);

  const unstableGroup = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,1,0\nu1,c1,g2,0,1,1\n",
    { name: "unstable-group.csv", source: "upload" },
  );
  assert.match(validateConfig(unstableGroup, inferConfig(unstableGroup)).join(" "), /stable within each unit/);

  const reservedCode = parseCsv(
    "unit,conversation,group,ENA_UNIT,B,C\nu1,c1,g1,1,1,0\nu2,c2,g2,0,1,1\n",
    { name: "reserved-code.csv", source: "upload" },
  );
  assert.match(validateConfig(reservedCode, inferConfig(reservedCode)).join(" "), /reserved by jENA/);

  const svdGroup = parseCsv(
    "unit,conversation,SVD1,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g2,0,1,1\n",
    { name: "svd-group.csv", source: "upload" },
  );
  assert.match(validateConfig(svdGroup, {
    ...inferConfig(svdGroup),
    groupColumn: "SVD1",
  }).join(" "), /rotation column/);

  const leadingZeroIds = parseCsv(
    "unit,conversation,group,A,B,C\n001,c1,g1,1,1,0\n1,c2,g2,0,1,1\n",
    { name: "leading-zero-ids.csv", source: "upload" },
  );
  assert.equal(leadingZeroIds.rows[0].unit, "001");
  assert.equal(leadingZeroIds.rows[1].unit, "1");
  assert.deepEqual(validateConfig(leadingZeroIds, inferConfig(leadingZeroIds)), []);
  assert.equal(analyzeDataset(leadingZeroIds, inferConfig(leadingZeroIds)).set.points.length, 2);

  const reusedConversation = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,1,0\nu2,c1,g2,0,1,1\n",
    { name: "reused-conversation.csv", source: "upload" },
  );
  assert.deepEqual(validateConfig(reusedConversation, inferConfig(reusedConversation)), []);
  assert.equal(analyzeDataset(reusedConversation, inferConfig(reusedConversation)).set.points.length, 2);

  const reservedSeparator = parseCsv(
    "unit,conversation,group,A,B,C\nu::1,c1,g1,1,1,0\nu2,c2,g2,0,1,1\n",
    { name: "reserved-separator.csv", source: "upload" },
  );
  assert.match(validateConfig(reservedSeparator, inferConfig(reservedSeparator)).join(" "), /cannot contain/);

  const singleGroup = parseCsv(
    "unit,conversation,group,A,B,C\nu1,c1,g1,1,1,0\nu2,c2,g1,0,1,1\n",
    { name: "single-group.csv", source: "upload" },
  );
  const singleGroupConfig = inferConfig(singleGroup);
  assert.deepEqual(validateConfig(singleGroup, singleGroupConfig), []);
  assert.deepEqual(analyzeDataset(singleGroup, singleGroupConfig).groups.map(({ name, count }) => ({ name, count })), [
    { name: "g1", count: 2 },
  ]);
});

test("CSV ingestion rejects extremely wide files before model inference", () => {
  const binaryColumns = Array.from({ length: 1_000 }, (_, index) => `code_${String(index + 1).padStart(4, "0")}`);
  const headers = ["unit", "conversation", ...binaryColumns];
  const values = ["u1", "c1", ...binaryColumns.map(() => "1")];

  assert.throws(
    () => parseCsv(`${headers.join(",")}\n${values.join(",")}\n`, { name: "extremely-wide.csv", source: "upload" }),
    /up to 256 columns/,
  );
  assert.throws(
    () => parseCsv(`unit,conversation,A\n${Array.from({ length: 20_001 }, (_, index) => `u${index},c${index},1`).join("\n")}\n`, { name: "too-many-rows.csv", source: "upload" }),
    /up to 20,000 rows/,
  );
  assert.throws(
    () => parseCsv("unit,conversation,A\nu1,c1,1,unexpected\n", { name: "wide-data-row.csv", source: "upload" }),
    /more fields than the 3-column header/,
  );
  assert.throws(
    () => parseCsv(`unit,conversation,${"C".repeat(257)},B,C\nu1,c1,1,1,1\n`, { name: "long-header.csv", source: "upload" }),
    /headers must be 256 characters or fewer/,
  );
});

test("configuration inference and validation stop at the 30-code browser boundary", () => {
  const binaryColumns = Array.from({ length: 35 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);
  const edgeCollision = "C01 & C02";
  const headers = ["unit", "conversation", "group", edgeCollision, ...binaryColumns];
  const first = ["u1", "c1", "g1", "edge-unit-1", ...binaryColumns.map(() => "1")];
  const second = ["u2", "c2", "g2", "edge-unit-2", ...binaryColumns.map(() => "1")];
  const dataset = parseCsv(
    `${headers.join(",")}\n${first.join(",")}\n${second.join(",")}\n`,
    { name: "many-binary-columns.csv", source: "upload" },
  );

  const inferred = inferConfig(dataset);
  assert.deepEqual(inferred.codes, binaryColumns.slice(0, 30));
  assert.deepEqual(validateConfig(dataset, inferred), []);
  assert.deepEqual(
    validateConfig(dataset, {
      ...inferred,
      unitColumns: [edgeCollision],
      codes: binaryColumns.slice(0, 31),
    }),
    ["This browser release supports up to 30 code columns per run."],
  );
});

test("the documented Academy sample runs through real jENA 0.7.0-ona.0 deterministically", () => {
  const text = readFileSync(samplePath, "utf8");
  const dataset = parseCsv(text, { name: "ena-design-talk-sample.csv", source: "sample" });
  assert.deepEqual(validateConfig(dataset, SAMPLE_CONFIG), []);

  const result = analyzeDataset(dataset, SAMPLE_CONFIG);
  assert.equal(JENA_RUNTIME_VERSION, "0.7.0-ona.0");
  assert.equal(result.set.points.length, 8);
  assert.equal(result.set.codes.length, 5);
  assert.deepEqual(result.groups.map(({ name, count }) => ({ name, count })), [
    { name: "baseline", count: 4 },
    { name: "scaffolded", count: 4 },
  ]);
  assert.deepEqual(result.dimensions, ["SVD1", "SVD2", "SVD3"]);
  assert.ok(Math.abs((result.set.variance.SVD1 ?? 0) - 0.5013699933920419) < 1e-10);
  assert.ok(Math.abs(Number(result.set.points[0].SVD1) - -0.07156972011781548) < 1e-10);
  for (const group of result.groups) {
    const points = result.set.points.filter((row) => row.condition === group.name);
    const coordinates = new Set(points.map((row) => `${Number(row.SVD1).toPrecision(14)}:${Number(row.SVD2).toPrecision(14)}`));
    assert.equal(coordinates.size, 4, `${group.name} should expose four genuinely distinct endpoint projections`);
    assert.ok(points.every((row) => (
      Math.hypot(
        Number(row.SVD1) - group.meanPoint.SVD1,
        Number(row.SVD2) - group.meanPoint.SVD2,
      ) > 0.04
    )), `${group.name} unit points should remain visibly separate from the group mean`);
  }
  assert.notEqual(dimensionEffect(result, SAMPLE_CONFIG.groupColumn, "SVD1"), null);

  const manifest = buildManifest(dataset, SAMPLE_CONFIG, result);
  assert.equal(manifest.runtime, "jena-js");
  assert.equal(manifest.runtimeVersion, "0.7.0-ona.0");
  assert.equal(manifest.dataset.rows, 48);
  assert.equal(manifest.dataset.normalizedUtf8TextSha256, null);
  assert.deepEqual(manifest.effectiveJenaOptions, {
    units: ["team_id"],
    conversation: ["conversation_id"],
    codes: ["goal", "evidence", "strategy", "tradeoff", "revision"],
    metadata: ["condition"],
    includeMeta: true,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 5,
    windowSizeForward: 0,
    weightBy: "binary",
    dimensions: 3,
    rotation: { method: "svd" },
    centerAlignToOrigin: true,
    normalization: "sphere",
    nodePositionMethod: "undirected",
  });
  assert.equal(manifest.appVersion, "0.1.0");
  assert.equal(manifest.result.analyzedAt, result.analyzedAt);
  assert.ok(manifest.boundaries.length >= 9);
  assert.match(manifest.boundaries.join(" "), /source order/);
  assert.match(manifest.boundaries.join(" "), /signs are arbitrary/);
  assert.match(manifest.boundaries.join(" "), /source coded-data file and its codebook/);
  assert.match(manifest.boundaries.join(" "), /target-fitted centroid tables are withheld/);
  assert.match(manifest.boundaries.join(" "), /declared provenance/);
});

test("2D is the local default and 3D ENA switches the same fitted result in place", () => {
  const workspace = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");
  const plot = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaPlot.tsx"), "utf8");
  const worker = readFileSync(join(projectRoot, "lib", "open-ena", "jena.worker.ts"), "utf8");
  const client = readFileSync(join(projectRoot, "lib", "open-ena", "client.ts"), "utf8");
  const viewToggleStart = workspace.indexOf('<div className="ena-view-toggle"');
  const viewToggle = workspace.slice(viewToggleStart, workspace.indexOf("</div>", viewToggleStart));
  const switchHandlerStart = workspace.indexOf("function selectVisualizationView");
  const switchHandler = workspace.slice(switchHandlerStart, workspace.indexOf("function resetPlot", switchHandlerStart));

  assert.match(workspace, /useState<OpenEnaView>\("2d"\)/);
  assert.match(workspace, /aria-pressed=\{view === "2d"\}/);
  assert.match(workspace, /aria-pressed=\{view === "3d"\}/);
  assert.match(
    workspace,
    /<strong>\{completedResultKind === "ona" \? copy\.ona\.workspace\.twoD : copy\.views\.twoD\}<\/strong>/,
    "both the specialized ONA label and standard ENA label must resolve through locale copy",
  );
  assert.match(
    workspace,
    /const threeDViewLabel = completedResultKind === "ona"[\s\S]*?copy\.ona\.workspace\.threeD[\s\S]*?: copy\.views\.threeD/u,
    "ONA and standard ENA must expose their localized 3D labels",
  );
  assert.match(workspace, /<strong>\{threeDViewLabel\}<\/strong>/u);
  assert.doesNotMatch(workspace, /copy\.views\.(?:default|exploratory)/);
  assert.doesNotMatch(viewToggle, /<small|Default|Exploratory/);
  assert.match(viewToggle, /selectVisualizationView\("2d"\)/);
  assert.match(viewToggle, /selectVisualizationView\("3d"\)/);
  assert.doesNotMatch(viewToggle, /<a\b|href=|target=/);
  assert.match(workspace, /view === "3d" \? \([\s\S]*?<OpenEnaInteractive3DPlot/);
  assert.doesNotMatch(switchHandler, /analyzeDatasetInWorker|runAnalysis|setResult|updateConfig|new Worker/);
  assert.match(workspace, /view === "2d" && activeLongitudinalView/);
  assert.match(workspace, /view === "2d" && activeGroupContrast/);
  assert.match(plot, /result\.set\.points/);
  assert.match(worker, /createAccumulationStream/);
  assert.match(worker, /buildOpenEnaResult/);
  assert.match(worker, /compactOpenEnaSet/);
  assert.doesNotMatch(client, /result\.worker/);
  assert.match(client, /new URL\("\.\/jena\.worker\.ts", import\.meta\.url\)/);
  assert.match(client, /abortHandler = \(\) => \{[\s\S]*?worker\.postMessage\(\{ kind: "cancel"/);
  assert.match(client, /finish[\s\S]*?worker\.terminate\(\)/);
  assert.match(workspace, /if \(controller\.signal\.aborted\) return;/);
  assert.match(plot, /isComparison[\s\S]*?mean weight/);
  assert.match(plot, /strongestConnections/);
});

test("Open ENA exposes honest locale, SEO, and accessible-result contracts", () => {
  const workspace = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");
  const plot = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaPlot.tsx"), "utf8");
  const page = readFileSync(join(projectRoot, "app", "[locale]", "open-ena", "page.tsx"), "utf8");
  const sitemap = readFileSync(join(projectRoot, "app", "sitemap.ts"), "utf8");
  const copy = readFileSync(join(projectRoot, "lib", "open-ena-i18n.ts"), "utf8");

  assert.match(copy, /openEnaLocalizedLocales = \["en", "zh-hant", "zh-hans"\]/);
  assert.match(workspace, /lang=\{workspaceIsLocalized \? undefined : "en"\}/);
  assert.match(workspace, /dir=\{workspaceIsLocalized \? undefined : "ltr"\}/);
  assert.match(workspace, /role="status"[\s\S]*?aria-live="polite"/);
  assert.match(workspace, /aria-busy=\{loading \|\| sourceBusy\}/);
  assert.match(workspace, /tabIndex=\{-1\}[\s\S]*?aria-hidden="true"/);
  assert.match(plot, /Strongest edges:/);
  assert.match(plot, /GROUP_VISUAL_ENCODINGS/);
  assert.match(plot, /circle-solid[\s\S]*square-solid[\s\S]*triangle-solid[\s\S]*diamond-solid[\s\S]*cross-solid[\s\S]*hexagon-solid/);
  assert.match(page, /robots: isOpenEnaLocalizedLocale\(typedLocale\)/);
  assert.match(sitemap, /route === "\/open-ena" \? openEnaLocalizedLocales : locales/);
});

test("Open ENA publishes methodology, local-processing, and GPL boundaries", () => {
  const workspace = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");
  const copy = readFileSync(join(projectRoot, "lib", "open-ena-i18n.ts"), "utf8");
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as { dependencies: Record<string, string> };

  assert.equal(packageJson.dependencies["jena-js"], "0.7.0-ona.0");
  assert.match(workspace, /GPL-3\.0-only/);
  assert.match(workspace, /ENA computation powered by/);
  assert.match(workspace, /ENA\.HK provides the interface, plotting, and exports/);
  assert.doesNotMatch(workspace, /Powered[\s\S]{0,160}rENA/);
  assert.match(workspace, /Source data stays in this workspace’s browser memory/);
  assert.match(copy, /Visual separation alone is not significance or causality/);
  assert.doesNotMatch(copy, /3D ENA exploratory option opens the separate 3D ENA website/);
  assert.match(copy, /Interactive 3D displays the same fitted jENA coordinates as the 2D view/);
  assert.match(copy, /Switching views does not rerun or refit the analysis/);
});
