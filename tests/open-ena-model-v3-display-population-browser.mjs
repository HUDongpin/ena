import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

// Actual Workspace, native plan client/Worker and Plotly. No injected result or
// mocked scientific producer: only local static-resource transport is routed.
const options = { bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', write: false, logLevel: 'silent' };
const main = await build({ ...options, stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace'; createRoot(document.getElementById('root')).render(<OpenEnaWorkspace locale="en"/>);`, loader: 'tsx', resolveDir: process.cwd(), sourcefile: 'task31-r1-display-app.tsx' } });
const worker = await build({ ...options, entryPoints: ['lib/open-ena/jena.worker.ts'] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.workerStarts = 0;
    window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.workerStarts++; } };
  });
  await page.route('http://localhost:31992/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/app.js') return route.fulfill({ contentType: 'application/javascript', body: main.outputFiles[0].text });
    if (path.endsWith('/jena.worker.ts')) return route.fulfill({ contentType: 'application/javascript', body: worker.outputFiles[0].text });
    if (path.endsWith('.csv')) return route.fulfill({ contentType: 'text/csv', body: await readFile('public' + path, 'utf8') });
    if (path === '/ena-mark.svg') return route.fulfill({ contentType: 'image/svg+xml', body: await readFile('public/ena-mark.svg', 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main id="root"></main><script type="module" src="/app.js"></script></body></html>' });
  });
  const button = name => page.getByRole('button', { name, exact: true });
  const downloadJson = async name => {
    const pending = page.waitForEvent('download');
    await button(name).click();
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  };
  const model = async () => { await button('Model').click(); await page.getByRole('tab', { name: /Units,/ }).click(); };
  const group = name => page.locator('.ena-group-display-group').filter({ has: page.locator('.ena-group-display-name', { hasText: `Group Group=${name}` }) });
  const openGroup = async name => {
    const target = group(name);
    if (await target.getAttribute('open') === null) await target.locator(':scope > summary').click();
    const units = target.locator('.ena-group-display-units');
    if (await units.getAttribute('open') === null) await units.locator('summary').click();
    return target;
  };
  const switchFor = (setting, name) => page.getByRole('switch', { name: `${setting} for Group Group=${name}`, exact: true });
  const assertCount = async (name, visible) => {
    assert.match(await group(name).locator(':scope > summary').getAttribute('aria-label'), new RegExp(`${visible} of 3 unit points visible`));
    assert.match(await group(name).locator('.ena-group-display-units > summary').innerText(), new RegExp(`${visible}/3`));
  };
  const centroid2d = () => page.locator('[data-ena-trajectory-centroid="true"]').evaluateAll(nodes => nodes.map(node => ({ title: node.querySelector('title').textContent, x: node.querySelector('rect').getAttribute('x'), y: node.querySelector('rect').getAttribute('y') })));
  const count2d = async (points, paths) => {
    assert.equal(await page.locator('[data-ena-unit-point="true"]').count(), points);
    assert.equal(await page.locator('[data-ena-trajectory-path="true"]').count(), paths);
  };
  const assertIntervals = async () => {
    for (const name of ['Show confidence intervals', 'Show outlier intervals']) {
      const control = switchFor(name, 'G2');
      assert.equal(await control.isDisabled(), true);
      const descriptions = (await control.getAttribute('aria-describedby')).split(' ');
      const texts = await page.evaluate(ids => ids.map(id => document.getElementById(id)?.textContent).join(' '), descriptions);
      assert.match(texts, /do not provide confidence or outlier intervals/i);
    }
  };
  await page.goto('http://localhost:31992/');
  await button('Load trajectory sample').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.dataset.resultStatus === 'current', null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.workerStarts), 1);
  await button('Plot Tools').click();
  await page.getByLabel('Trajectories', { exact: true }).check();
  await count2d(18, 12);
  const baselineCentroids = await centroid2d();
  await button('Stats & Export').click();
  await page.getByLabel('Horizon Period=TP1', { exact: true }).check();
  await button('Run confirmed inference').click();
  await button('Export native statistics').waitFor();
  const baselineStatistics = await downloadJson('Export native statistics');
  const baselineBundle = await downloadJson('Export current analysis');
  await model(); await openGroup('G2'); await assertIntervals();
  await button('Hide unit Unit Group=G2, Speaker=S05 in Group Group=G2').click();
  await count2d(15, 10); await assertCount('G2', 2);
  const excludedCentroids = await centroid2d();
  assert.ok(excludedCentroids.filter(value => value.title.includes('Group=G2')).every(value => value.title.includes('n = 2')));
  assert.notDeepEqual(excludedCentroids, baselineCentroids, 'hiding a Unit changes actual displayed summary position and n');
  await switchFor('Include hidden points', 'G2').check();
  await count2d(15, 10);
  assert.deepEqual(await centroid2d(), baselineCentroids, 'including hidden Units restores exact summary geometry only');
  await switchFor('Include hidden points', 'G2').uncheck();
  assert.deepEqual(await centroid2d(), excludedCentroids);

  await page.locator('.ena-visual-toolbar').getByRole('button', { name: '3D ENA', exact: true }).click();
  await page.locator('[data-ena-plot-ready="true"]').first().waitFor({ timeout: 60000 });
  const scene = () => page.locator('.js-plotly-plot').first().evaluate(node => JSON.parse(JSON.stringify({ camera: node._fullLayout.scene.camera, aspectratio: node._fullLayout.scene.aspectratio, x: node._fullLayout.scene.xaxis.range, y: node._fullLayout.scene.yaxis.range, z: node._fullLayout.scene.zaxis.range })));
  const traces = () => page.locator('.js-plotly-plot').first().evaluate(node => node.data.filter(trace => ['Observed fitted Unit path', 'Observed Group centroid', 'Observed Group centroid path'].includes(trace.name)).map(trace => ({ name: trace.name, x: trace.x, y: trace.y, z: trace.z, text: trace.text, hovertemplate: trace.hovertemplate })));
  const excluded3d = await traces(), frame = await scene();
  assert.equal(excluded3d.filter(trace => trace.name === 'Observed fitted Unit path').length, 10);
  assert.equal(excluded3d.filter(trace => trace.name === 'Observed Group centroid' && trace.text.some(text => text.includes('n=2'))).length, 3);
  await assertIntervals();
  await switchFor('Include hidden points', 'G2').check();
  await page.waitForFunction(() => document.querySelector('.js-plotly-plot')?.data.filter(trace => trace.name === 'Observed Group centroid').every(trace => trace.text.every(text => text.includes('n=3'))));
  assert.equal((await traces()).filter(trace => trace.name === 'Observed fitted Unit path').length, 10);
  assert.deepEqual(await scene(), frame, 'display population does not change the complete fitted 3D frame or camera');
  await switchFor('Include hidden points', 'G2').uncheck();
  await page.waitForFunction(() => document.querySelector('.js-plotly-plot')?.data.some(trace => trace.name === 'Observed Group centroid' && trace.text.some(text => text.includes('n=2'))));
  assert.deepEqual(await traces(), excluded3d);
  assert.deepEqual(await scene(), frame);
  await page.locator('.ena-visual-toolbar').getByRole('button', { name: '2D ENA', exact: true }).click();

  await openGroup('G1');
  await switchFor('Show unit points', 'G1').uncheck(); await assertCount('G1', 0);
  await switchFor('Show unit points', 'G1').check(); await assertCount('G1', 3);
  await switchFor('Show mean', 'G1').uncheck();
  await button('Stats & Export').click();
  const preset = await downloadJson('Export presentation preset');
  preset.hiddenGroups = [{ type: 'string', value: 'G1' }];
  await page.getByLabel('Review presentation preset').setInputFiles({ name: 'group-overlay.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(preset)) });
  await button('Apply matching presentation preset').click();
  await model(); await openGroup('G1'); await openGroup('G2');
  await assertCount('G1', 0); await assertCount('G2', 2);
  assert.equal(await switchFor('Show mean', 'G1').isChecked(), false, 'preset overlay preserves saved mean preference');
  assert.equal(await switchFor('Show unit points', 'G1').isChecked(), true);
  for (const control of await group('G1').getByRole('switch').all()) {
    assert.equal(await control.isDisabled(), true);
    assert.ok(await control.getAttribute('aria-describedby'));
  }
  assert.match(await group('G1').innerText(), /preset/i);
  assert.equal(await button('Show all hidden unit points').isDisabled(), true);
  await switchFor('Include hidden points', 'G2').check();
  await button('Hide all group layers').click();
  await assertCount('G1', 0); await assertCount('G2', 0);
  assert.equal(await switchFor('Include hidden points', 'G2').isDisabled(), true);
  await button('Restore all group layers').click();
  await assertCount('G1', 0); await assertCount('G2', 2);
  assert.equal(await switchFor('Show mean', 'G1').isChecked(), false);
  assert.equal(await switchFor('Include hidden points', 'G2').isChecked(), true);
  await button('Stats & Export').click(); await button('Clear preset Group hiding').click();
  await model(); await openGroup('G1'); await openGroup('G2');
  await assertCount('G1', 3); await assertCount('G2', 2);
  assert.equal(await switchFor('Show unit points', 'G1').isDisabled(), false);
  assert.equal(await switchFor('Show mean', 'G1').isChecked(), false);
  assert.equal(await switchFor('Include hidden points', 'G2').isChecked(), true);
  assert.equal(await button('Show all hidden unit points').isDisabled(), false);
  await button('Show all hidden unit points').click();
  await assertCount('G2', 3);
  await switchFor('Include hidden points', 'G2').uncheck();
  await switchFor('Show mean', 'G1').check();
  await count2d(18, 12);
  assert.deepEqual(await centroid2d(), baselineCentroids);
  await button('Stats & Export').click();
  assert.deepEqual(await downloadJson('Export native statistics'), baselineStatistics, 'display populations and overlay do not alter admitted inference');
  assert.deepEqual(await downloadJson('Export current analysis'), baselineBundle, 'bound model and all scientific hashes remain unchanged');
  assert.equal(await page.evaluate(() => window.workerStarts), 1, 'every display action preserves the single actual model run');
  assert.equal(await page.getByTestId('open-ena-workspace-v3').getAttribute('data-result-status'), 'current');
  assert.deepEqual(errors, []);
  console.log('Task31 R1 actual Workspace/Worker/Plotly PASS: hidden Unit marker/path and summary population; include-hidden roundtrip in 2D/3D with preserved frame; truthful interval applicability; preset apply/clear, individual/per-Group/global interleavings and saved preferences; identical scientific bundle/inference exports, one Worker, current result.');
} finally { await browser.close(); }
