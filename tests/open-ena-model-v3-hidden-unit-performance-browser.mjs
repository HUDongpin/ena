import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Test-only instrumentation leaves the expressions and their outputs intact.
// The legacy branch records a reproducible pre-repair RED on the same harness.
const source = await readFile('components/open-ena/OpenEnaWorkspace.tsx', 'utf8');
const legacyExpression = `new Set(result.executionProvenance.identityDictionary.units.filter((unit) => {
      const group = result.executionProvenance.unitGroups.find((entry) => entry.unitToken === unit.token)?.groupToken;
      return hiddenUnitKeys.includes(JSON.stringify([group, unit.token]));
    }).map((unit) => unit.displayLabel))`;
const legacy = source.includes(legacyExpression);
let instrumented = source.replace('  function exportPresentation() {', '  window.q1Observe(plotResult, result, hiddenUnitKeys);\n  function exportPresentation() {');
assert.notEqual(instrumented, source);
if (legacy) {
  const counted = legacyExpression.replace('const group =', 'window.q1Counters.units++; const group =').replace('(entry) => entry.unitToken === unit.token', '(entry) => (window.q1Counters.memberships++, entry.unitToken === unit.token)');
  instrumented = instrumented.replace(legacyExpression, `window.q1Measure('legacy-hidden', () => ${counted})`);
} else {
  for (const [expression, label] of [['buildUnitDisplayLabelIndexV3(result)', 'index'], ['hiddenUnitLabelsV3(hiddenUnitLabelIndex, hiddenUnitKeys)', 'hidden']]) {
    assert.equal(instrumented.split(expression).length, 2, expression);
    instrumented = instrumented.replace(expression, `window.q1Measure('${label}', () => ${expression})`);
  }
}
const options = { bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', write: false, logLevel: 'silent' };
const main = await build({ ...options, plugins: [{ name: 'q1-read-only-instrumentation', setup(builder) { builder.onLoad({ filter: /OpenEnaWorkspace\.tsx$/ }, () => ({ contents: instrumented, loader: 'tsx', resolveDir: process.cwd() + '/components/open-ena' })); } }], stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
import React from 'react'; import {createRoot} from 'react-dom/client'; import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace';
import {prepareTypedCsvSourceV3} from './lib/open-ena/source-preparation-v3'; import {parseCsv} from './lib/open-ena/csv'; import {workspaceDraftsFromArtifactV3} from './lib/open-ena/model-v3/migration';
${legacy ? '' : "import {buildUnitDisplayLabelIndexV3,hiddenUnitLabelsV3} from './lib/open-ena/hidden-unit-display-v3'; window.q1Indexed=(result,keys)=>hiddenUnitLabelsV3(buildUnitDisplayLabelIndexV3(result),keys);"}
window.q1Metrics=[];window.q1Counters={units:0,memberships:0};window.q1Changes=0;window.q1Result=null;
window.q1Measure=(label,f)=>{const t=performance.now();const value=f();window.q1Metrics.push({label,ms:performance.now()-t});return value;};
window.q1Observe=(plot,result,keys)=>{if(plot!==window.q1Plot)window.q1Changes++;window.q1Plot=plot;window.q1Result=result;window.q1Hidden=keys;};
const n=Number(new URL(location.href).searchParams.get('n'));
const text='unit,horizon,group,A,B,C\\n'+Array.from({length:n},(_,i)=>['u'+i,'h1',i%2?'G1':'G2',(i%3)+1,((i*7)%5)+1,((i*11)%7)+1].join(',')).join('\\n');
const parsed=parseCsv(text,{name:'q1-scale.csv',source:'upload',sizeBytes:new TextEncoder().encode(text).length});
const source=await prepareTypedCsvSourceV3(text,parsed,{unit:'text',horizon:'text',group:'text',A:'number',B:'number',C:'number'},new Date());
window.q1Source={rows:source.dataset.rows.length,bytes:source.bytes.byteLength,hash:source.datasetSha256};
const drafts=workspaceDraftsFromArtifactV3({unitColumns:['unit'],horizonColumns:['horizon'],groupColumn:'group',codes:['A','B','C'],weighting:'frequency',model:'EndPoint',windowType:'Conversation',movingStanza:{backward:{kind:'finite',value:1},forward:{kind:'finite',value:0},rowOrder:null},horizonOrder:null,rotation:{type:'svd',centerAlignToOrigin:true}});
createRoot(document.getElementById('root')).render(<OpenEnaWorkspace locale='en' initialSource={{...source,drafts}}/>);` } });
const worker = await build({ ...options, entryPoints: ['lib/open-ena/jena.worker.ts'] });
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  for (const n of [1000, 2500, 5000]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => { const NativeWorker = window.Worker; window.q1Workers = 0; window.Worker = class extends NativeWorker { constructor(...args) { super(...args); if (String(args[0]).endsWith("/jena.worker.ts")) window.q1Workers++; } }; });
    await page.route('http://localhost:31993/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/app.js') return route.fulfill({ contentType: 'application/javascript', body: main.outputFiles[0].text });
      if (path.endsWith('/jena.worker.ts')) return route.fulfill({ contentType: 'application/javascript', body: worker.outputFiles[0].text });
      if (path === '/ena-mark.svg') return route.fulfill({ contentType: 'image/svg+xml', body: await readFile('public/ena-mark.svg', 'utf8') });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main id="root"></main><script type="module" src="/app.js"></script></body></html>' });
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const reset = () => page.evaluate(() => { window.q1Metrics = []; window.q1Counters = { units: 0, memberships: 0 }; window.q1Changes = 0; });
    const snapshot = () => page.evaluate(() => ({ metrics: window.q1Metrics, counters: window.q1Counters, changes: window.q1Changes, hidden: [...window.q1Plot.groupPresentation.hiddenUnits], workers: window.q1Workers }));
    const compareAndMeasure = () => page.evaluate(() => {
      const result = window.q1Result, hiddenUnitKeys = window.q1Hidden;
      const slow = () => new Set(result.executionProvenance.identityDictionary.units.filter(unit => { const group = result.executionProvenance.unitGroups.find(entry => entry.unitToken === unit.token)?.groupToken; return hiddenUnitKeys.includes(JSON.stringify([group, unit.token])); }).map(unit => unit.displayLabel));
      const expected = [...slow()], actual = [...window.q1Plot.groupPresentation.hiddenUnits];
      const times = fn => Array.from({ length: 5 }, () => { const start = performance.now(); const output = fn(); if (JSON.stringify([...output]) !== JSON.stringify(expected)) throw Error('indexed output mismatch'); return performance.now() - start; });
      return { expected, actual, legacyMs: times(slow), indexedMs: window.q1Indexed ? times(() => window.q1Indexed(result, hiddenUnitKeys)) : null };
    });
    await page.goto('http://localhost:31993/?n=' + n);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Run model' && !button.disabled), null, { timeout: 60000 });
    await button('Run model').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.dataset.resultStatus === 'current', null, { timeout: 60000 });
    const initial = await snapshot();
    await page.evaluate(() => { window.q1BoundBefore = JSON.stringify(window.q1Result); });
    const emptyOutput = await compareAndMeasure();
    await reset();
    const clicks = [];
    for (const label of ['Plot Tools', 'Data', 'Model', 'Stats & Export']) { const start = Date.now(); await button(label).click(); clicks.push({ label, wallMs: Date.now() - start }); }
    const emptyNavigation = await snapshot();
    await button('Model').click(); await page.getByRole('tab', { name: /Units,/ }).click();
    const group = page.locator('.ena-group-display-group').first();
    await group.locator(':scope > summary').click(); await group.locator('.ena-group-display-units > summary').click();
    await reset();
    await group.getByRole('button', { name: /^Hide unit / }).first().click();
    const firstHide = await snapshot();
    const nonemptyOutput = await compareAndMeasure();
    await reset();
    for (const label of ['Plot Tools', 'Data', 'Model', 'Stats & Export']) await button(label).click();
    const hiddenNavigation = await snapshot();
    await button('Plot Tools').click(); await reset();
    await page.getByLabel('Unit labels', { exact: true }).check();
    const labelEdit = await snapshot();
    await page.getByLabel('Unit labels', { exact: true }).uncheck();
    await button('Model').click();
    if (await group.getAttribute('open') === null) await group.locator(':scope > summary').click();
    if (await group.locator('.ena-group-display-units').getAttribute('open') === null) await group.locator('.ena-group-display-units > summary').click();
    await reset();
    await group.getByRole('button', { name: /^Hide unit / }).first().click();
    const secondHide = await snapshot();
    await reset();
    await group.getByRole('switch', { name: /^Show mean for / }).uncheck();
    const groupEdit = await snapshot();
    await button('Show all hidden unit points').click();
    assert.deepEqual((await snapshot()).hidden, []);
    assert.equal(await page.evaluate(() => JSON.stringify(window.q1Result) === window.q1BoundBefore), true);
    assert.equal(await page.evaluate(() => window.q1Workers), 1);
    assert.equal(await page.getByTestId('open-ena-workspace-v3').getAttribute('data-result-status'), 'current');
    assert.deepEqual(errors, []);
    for (const value of [emptyOutput, nonemptyOutput]) assert.deepEqual(value.actual, value.expected);
    assert.equal(nonemptyOutput.actual.length, 1);
    const observation = { n, legacy, source: await page.evaluate(() => window.q1Source), initial, clicks, emptyNavigation, emptyOutput, firstHide, nonemptyOutput, hiddenNavigation, secondHide, groupEdit, labelEdit };
    if (!legacy && n === 1000) {
      // An explicit new model run must replace the derived result. This action
      // is separate from the display-only no-refit assertions above.
      await page.evaluate(() => { window.q1PriorResult = window.q1Result; });
      await reset(); await button('Run model').click();
      await page.waitForFunction(() => window.q1Result !== window.q1PriorResult && document.querySelector('[data-testid="open-ena-workspace-v3"]')?.dataset.resultStatus === 'current', null, { timeout: 60000 });
      assert.equal(await page.evaluate(() => window.q1Plot.boundPresentation === window.q1Result), true);
      observation.explicitRerun = await snapshot();
      assert.equal(observation.explicitRerun.workers, 2);
      assert.ok(observation.explicitRerun.changes > 0);
    }
    observations.push(observation); console.log(JSON.stringify(observation));
    await page.close();
  }
  // Deterministic cost/reuse oracles, not wall-clock acceptance thresholds.
  for (const observation of observations) {
    assert.equal(observation.initial.metrics.filter(metric => metric.label === 'index').length, 0, 'empty hidden state never builds the Unit index');
    assert.equal(observation.initial.counters.units, 0, 'empty hidden inventory must not traverse Units');
    assert.equal(observation.emptyNavigation.changes, 0, 'unrelated navigation must reuse the derived plot result');
    assert.equal(observation.emptyNavigation.metrics.length, 0);
    assert.equal(observation.hiddenNavigation.changes, 0, 'nonempty hidden inventory must also reuse the derived plot result');
    assert.equal(observation.hiddenNavigation.metrics.length, 0);
    assert.equal(observation.labelEdit.changes, 0);
    assert.equal(observation.labelEdit.metrics.length, 0, 'independent plot label settings do not rebuild hidden/display facts');
    assert.equal(observation.firstHide.metrics.filter(metric => metric.label === 'index').length, 1);
    assert.equal(observation.secondHide.metrics.filter(metric => metric.label === 'index').length, 0, 'same result reuses its exact-token index');
    assert.equal(observation.secondHide.hidden.length, 2);
    assert.ok(observation.secondHide.changes > 0, 'changed hidden preferences update the plot');
    assert.ok(observation.groupEdit.changes > 0, 'changed Group display updates the plot');
    assert.equal(observation.groupEdit.metrics.length, 0, 'Group display does not rescan Unit identities');
  }
  console.log('Task31 Q1 admitted 1000/2500/5000 actual Worker browser PASS: zero empty inventory traversal, indexed nonempty output equality, stable navigation identity and reused token index, real dependency updates, current immutable result and no refit.');
} finally { await browser.close(); }
