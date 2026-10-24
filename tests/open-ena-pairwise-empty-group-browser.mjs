import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// Actual Workspace and Group controls with synthetic data. The Worker transport
// is controlled, but compilation, numerical fitting and result binding are real.
// 3D specs and accessible summaries use the production compiler/component; this
// test does not exercise WebGL or contact external services.
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { renderToStaticMarkup } from 'react-dom/server';
      import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace';
      import OpenEnaInteractive3DPlot from './components/open-ena/OpenEnaInteractive3DPlot';
      import { compileStandardDraftV3 } from './lib/open-ena/model-v3/compiler';
      import { workspaceDraftsFromArtifactV3, migrateCanonicalConfigurationToDraftV3 } from './lib/open-ena/model-v3/migration';
      import { parsedDatasetFromSourceProofV3 } from './lib/open-ena/model-v3/execution-plan';
      import { runStandardPlanV3 } from './lib/open-ena/analyze';
      import { bindResultV3 } from './lib/open-ena/model-v3/result-binding';
      import { presentBoundResultV3, presentRetainedEndpointContrastV3, presentBoundGroupDisplayV3 } from './lib/open-ena/bound-presentation-v3';
      import { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } from './lib/open-ena/group-display';
      import { compileOpenEna3dPlotSpec } from './lib/open-ena/plot3d';
      import { getOpenEnaCopy } from './lib/open-ena-i18n';
      const dataset = {name:'synthetic-pairwise.xlsx',source:'upload',sizeBytes:2048,
        headers:['unit','horizon','group','A','B','C'],rows:[
          {unit:'u1',horizon:'h1',group:'G',A:1,B:2,C:1},
          {unit:'u2',horizon:'h1',group:'G',A:2,B:1,C:3},
          {unit:'u3',horizon:'h2',group:'H',A:1,B:3,C:1},
          {unit:'u4',horizon:'h2',group:'H',A:3,B:1,C:2},
          {unit:'u5',horizon:'h3',group:'H',A:1,B:1,C:4},
        ]};
      const standard = {unitColumns:['unit'],horizonColumns:['horizon'],groupColumn:'group',codes:['A','B','C'],
        weighting:'frequency',model:'EndPoint',windowType:'Conversation',
        movingStanza:{backward:{kind:'finite',value:1},forward:{kind:'finite',value:0},rowOrder:null},
        horizonOrder:null,rotation:{type:'svd',centerAlignToOrigin:true}};
      const drafts = workspaceDraftsFromArtifactV3(standard);
      window.runs=[];
      const worker = async (plan) => {
        const compiled=await compileStandardDraftV3(parsedDatasetFromSourceProofV3(plan.sourceProof),plan.header.datasetSha256,migrateCanonicalConfigurationToDraftV3(plan.configuration).standard);
        const result=await bindResultV3(plan,runStandardPlanV3(plan),{
          processedRows:plan.rows.length,maximumBufferedRows:0,numericCellsAllocated:120,
          peakBytesObservedOrBounded:10240,observationMethod:'exact-counters-and-conservative-byte-bound'},compiled.diagnostics);
        window.runs.push({plan,result,snapshot:JSON.stringify(result)});
        return {result,sourceWitness:null};
      };
      window.threeD = (hiddenCount,includeHiddenPoints) => {
        const bound=window.runs.at(-1).result;
        const {result}=presentBoundResultV3(bound);
        const [primary,secondary]=bound.executionProvenance.identityDictionary.groups;
        const geometry=presentRetainedEndpointContrastV3(bound,primary.token,secondary.token,result.dimensions.slice(0,2));
        const hidden=bound.executionProvenance.unitGroups.filter(unit=>unit.groupToken===primary.token)
          .slice(0,hiddenCount).map(unit=>JSON.stringify([primary.token,unit.unitToken]));
        const display=presentBoundGroupDisplayV3(geometry,{
          [primary.token]:{...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,includeHiddenPoints}},hidden,false);
        const input={result,contrast:display.contrast,groupDisplay:display,groupColumn:'Group',
          xDimension:result.dimensions[0],yDimension:result.dimensions[1],zDimension:result.dimensions[2],
          camera:'isometric',showPoints:true,showNetworks:true,showLabels:true,showGroupLabels:true,
          showUnitLabels:false,showVariance:true,showTrajectories:false,edgeScale:1,edgeThreshold:0,
          pointScale:1,plotZoom:1,flipX:false,flipY:false,copy:getOpenEnaCopy('en')};
        return {summary:display.contrast.primary,secondary:display.contrast.secondary,edges:display.contrast.edges,
          roles:Object.fromEntries(['comparison','primary','secondary'].map(plotKind=>[plotKind,{
            spec:compileOpenEna3dPlotSpec({...input,plotKind}),
            accessible:renderToStaticMarkup(<OpenEnaInteractive3DPlot {...input} plotKind={plotKind}/>),
          }]))};
      };
      createRoot(document.getElementById('root')).render(<OpenEnaWorkspace locale="en"
        initialSource={{dataset,datasetSha256:'a'.repeat(64),drafts}} worker={worker}/>);
    `,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://localhost:32130") {
      externalRequests.push(url.href);
      return route.abort();
    }
    if (url.pathname === "/unified-home/logo-open-ena-mark.svg") {
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
  });
  await page.goto("http://localhost:32130/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const run = page.getByTestId("open-ena-run-model");
  const rebuild = async () => {
    const count = await page.evaluate(() => window.runs.length);
    await page.waitForFunction(() => !document.querySelector('[data-testid="open-ena-run-model"]')?.disabled);
    await run.click();
    await page.waitForFunction((previous) => {
      const status = document.querySelector('[data-testid="open-ena-workspace-v3"]')?.dataset;
      return window.runs.length > previous && status?.resultStatus === "current" && status?.runStatus === "idle";
    }, count);
  };
  await rebuild();
  await page.getByRole("tab", { name: /Units,/ }).click();
  const primary = page.locator(".ena-group-display-group").first();
  const openPrimary = async () => {
    if (await primary.getAttribute("open") === null) await primary.locator(":scope > summary").click();
    const units = primary.locator(".ena-group-display-units");
    if (await units.getAttribute("open") === null) await units.locator("summary").click();
  };
  await openPrimary();
  const include = primary.getByRole("switch", { name: /Include hidden points/ });
  const svg = (role) => page.locator(`svg[data-ena-plot-kind="${role}"]`);
  const edges = (role) => svg(role).locator("[data-ena-edge]");
  const points = () => svg("comparison").locator('[data-ena-unit-point="true"][data-ena-group-role="primary"]');
  const baseline = await page.evaluate(() => window.threeD(0, false));
  const baselineEdges = Object.fromEntries(await Promise.all(["comparison", "primary", "secondary"].map(async (role) => [role, await edges(role).count()])));
  assert.ok(Object.values(baselineEdges).every((count) => count > 0));

  // One excluded Unit changes accessible means as well as the rendered network.
  await primary.getByRole("button", { name: /^Hide unit / }).first().click();
  assert.equal(await points().count(), 1);
  const subset = await page.evaluate(() => window.threeD(1, false));
  assert.equal(subset.summary.unitCount, 1);
  assert.ok(subset.roles.primary.accessible.includes(`${subset.summary.name} (n = 1)</th>`));
  for (const value of Object.values(subset.summary.meanPoint)) assert.ok(subset.roles.primary.accessible.includes(`<td>${value}</td>`));
  await page.getByRole("button", { name: "Show all hidden unit points", exact: true }).click();

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await include.check();
    while (await primary.getByRole("button", { name: /^Hide unit / }).count()) {
      await primary.getByRole("button", { name: /^Hide unit / }).first().click();
    }
    assert.equal(await points().count(), 0);
    assert.equal(await edges("primary").count(), baselineEdges.primary, "Include Hidden retains summaries without revealing Unit marks");

    // Rebuilding identical science resets Group options while retaining hidden
    // Unit keys bound to the same scientific result hash. This is a reachable
    // empty-summary state even though the controls guard hiding the last Unit.
    const previousHash = await page.evaluate(() => window.runs.at(-1).result.binding.scientificResultSha256);
    await rebuild();
    assert.equal(await page.evaluate(() => window.runs.at(-1).result.binding.scientificResultSha256), previousHash);
    await openPrimary();
    assert.equal(await include.isChecked(), false);
    assert.equal(await points().count(), 0);
    assert.equal(await edges("primary").count(), 0, "an empty Group has no mean network");
    assert.equal(await edges("comparison").count(), 0, "differences require both summary populations");
    assert.equal(await edges("secondary").count(), baselineEdges.secondary);
    const empty = await page.evaluate(() => window.threeD(2, false));
    assert.equal(empty.summary.unitCount, 0);
    for (const role of ["primary", "comparison"]) {
      assert.equal(empty.roles[role].spec.data.some((trace) => trace.meta.role === "network-edge"), false);
      assert.equal(empty.roles[role].accessible.includes(`${empty.summary.name} (n = `), false);
    }
    for (const role of ["comparison", "primary", "secondary"]) {
      assert.deepEqual(empty.roles[role].spec.layout.scene, baseline.roles[role].spec.layout.scene, "empty display populations preserve the fitted frame");
    }
    await include.check();
    assert.equal(await points().count(), 0);
    for (const role of ["comparison", "primary", "secondary"]) assert.equal(await edges(role).count(), baselineEdges[role]);
    const restored = await page.evaluate(() => window.threeD(2, true));
    assert.deepEqual(restored.summary.meanPoint, baseline.summary.meanPoint);
    assert.deepEqual(restored.summary.meanWeights, baseline.summary.meanWeights);
    assert.deepEqual(restored.edges, baseline.edges);
    await page.getByRole("button", { name: "Show all hidden unit points", exact: true }).click();
    await include.uncheck();
    assert.equal(await points().count(), 2);
  }
  assert.equal(await page.evaluate(() => window.runs.every((run) => JSON.stringify(run.result) === run.snapshot)), true, "all fitted results remain untouched");
  assert.equal(await page.evaluate(() => window.runs.length), 3, "display-only toggles do not create fits");
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log("Pairwise empty display populations PASS: actual Workspace rebuild/Group controls, 2D SVG suppression, 3D specs/accessibility, repeated Include Hidden restoration, stable fitted frame and results.");
} finally {
  await browser.close();
}
