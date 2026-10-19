import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useOpenEnaWorkspaceV3, emptyWorkspaceDraftsV3 } from './components/open-ena/model-v3/workspace-controller';
import { OpenEnaImportPreviewV3 } from './components/open-ena/model-v3/OpenEnaImportPreviewV3';
import { getOpenEnaCopy } from './lib/open-ena-i18n';
import { legacyZeroBackwardBundle, legacyZeroBackwardFixture } from './tests/helpers/open-ena-legacy-zero-backward';
let workerCalls = 0;
const worker = async () => { workerCalls++; throw new Error('Artifact adoption must not run a worker'); };
function App({version, windowType, locale}) {
 const fixture = React.useMemo(() => legacyZeroBackwardFixture(windowType), [windowType]);
 const bundle = React.useMemo(() => legacyZeroBackwardBundle(windowType,version), [windowType,version]);
 const controller = useOpenEnaWorkspaceV3({initial:{dataset:fixture.data,datasetSha256:'a'.repeat(64),drafts:emptyWorkspaceDraftsV3()},worker});
 const { state, dispatch } = controller;
 const initialModel = React.useRef(state.model);
 const copy = getOpenEnaCopy(locale).modelV3.importPreview;
 window.probe = {state,workerCalls,unchanged:state.model===initialModel.current,notice:copy.legacyZeroBackward,
  originalValue:bundle.manifest.configuration.windowSizeBack};
 return <main>
  <button onClick={() => controller.preview(JSON.stringify(bundle))}>Import synthetic history</button>
  {state.preview && <OpenEnaImportPreviewV3 preview={state.preview} drafts={state.model.drafts} copy={copy}
   onCancel={() => dispatch({type:'cancel-preview'})}
   onAcceptDraft={() => dispatch({type:'accept-draft-preview',preview:state.preview})}
   onKeepHistorical={() => dispatch({type:'keep-historical',preview:state.preview})}
   onAddReference={() => {throw new Error('Not a Reference');}} />}
  {state.historical.length>0 && <button onClick={() => dispatch({type:'preview',value:state.historical[0]})}>Review retained history</button>}
  <button onClick={() => dispatch({type:'model',action:{type:'set-active-family',family:'ona'}})}>Switch to ONA</button>
 </main>;
}
const root = createRoot(document.getElementById('root'));
window.mount = (options) => { workerCalls=0; root.render(<App key={JSON.stringify(options)} {...options}/>); };
`;
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd(), sourcefile: "legacy-zero-backward-browser.tsx" },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
  await page.goto("http://localhost:31996/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  let scenarios = 0;
  for (const version of [1, 2]) for (const windowType of ["Conversation", "MovingStanzaWindow"]) for (const locale of ["en", "zh-hans", "zh-hant"]) {
    await page.evaluate((options) => window.mount(options), { version, windowType, locale });
    await page.waitForFunction(() => window.probe?.unchanged && window.probe.state.historical.length === 0);
    await page.getByRole("button", { name: "Import synthetic history" }).click();
    const preview = page.getByTestId("ena-import-preview-v3");
    await preview.waitFor();
    assert.equal(await page.getByTestId("ena-import-zero-backward-notice").textContent(), await page.evaluate(() => window.probe.notice));
    assert.equal(await page.evaluate(() => window.probe.unchanged), true);
    // The production component renders Cancel as its first action for every locale.
    await preview.getByRole("button").nth(0).click();
    await preview.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => window.probe.unchanged), true);
    await page.getByRole("button", { name: "Import synthetic history" }).click();
    await preview.waitFor();
    await preview.getByRole("button").nth(1).click();
    await preview.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => window.probe.unchanged), true);
    assert.equal(await page.evaluate(() => window.probe.state.historical[0].artifact.manifest.configuration.windowSizeBack), 0);
    await page.getByRole("button", { name: "Review retained history" }).click();
    await preview.waitFor();
    await preview.getByRole("button").nth(2).click();
    await preview.waitFor({ state: "detached" });
    await page.waitForFunction(() => window.probe.state.raw.windows.standard.backward.finiteText === '1');
    assert.deepEqual(await page.evaluate(() => ({
      backward: window.probe.state.model.drafts.standard.movingStanza.backward,
      autoRunIntent: window.probe.state.autoRunIntent,
      runStatus: window.probe.state.model.runStatus,
      workerCalls: window.probe.workerCalls,
    })), { backward: { kind: "finite", value: 1 }, autoRunIntent: null, runStatus: "idle", workerCalls: 0 });
    await page.getByRole("button", { name: "Switch to ONA" }).click();
    await page.waitForFunction(() => window.probe.state.model.drafts.activeFamily === 'ona');
    assert.equal(await page.evaluate(() => window.probe.state.raw.windows.ona.backward.finiteText), "1");
    assert.deepEqual(await page.evaluate(() => window.probe.state.model.drafts.ona.unitColumns), ["unit"]);
    assert.equal(await page.evaluate(() => window.probe.workerCalls), 0);
    scenarios++;
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ scenarios, pageErrors: errors, checks: ["localized notice", "cancel preserves model", "history preserves original value", "explicit adoption synchronizes window", "no automatic worker run", "first ONA switch seeds adopted window"] }, null, 2));
} finally {
  await browser.close();
}
