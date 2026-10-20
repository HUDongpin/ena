import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const entry = `
import React, { useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenEnaOrderPolicyEditorV3 } from './components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3';
import { createWorkspaceStateV3, emptyWorkspaceDraftsV3, workspaceReducerV3, workspaceDraftExportableV3, workspaceRawBlockersV3 } from './components/open-ena/model-v3/workspace-controller';
import { exportDraftV3 } from './lib/open-ena/model-artifact-exports-v3';
import { importOpenEnaArtifactV3 } from './lib/open-ena/model-artifact-imports-v3';
import { getOpenEnaCopy } from './lib/open-ena-i18n';
const order = {kind:'columns',keys:[{column:'time',direction:'ascending',comparator:{type:'number'}}]};
const data = {name:'synthetic.xlsx',source:'upload',sizeBytes:1,headers:['unit','horizon','time','A','B','C'],rows:[{unit:'u1',horizon:'h1',time:1,A:1,B:1,C:0}]};
function App({field}) {
 const [state,dispatch] = useReducer(workspaceReducerV3, null, () => {
  const drafts = emptyWorkspaceDraftsV3();
  return createWorkspaceStateV3({dataset:data,datasetSha256:'a'.repeat(64),drafts:{...drafts,
   activeFamily:field==='ona'?'ona':'standard',
   standard:{...drafts.standard,model:field==='horizon'?'SeparateTrajectory':'EndPoint',movingStanza:{...drafts.standard.movingStanza,rowOrder:order},horizonOrder:order},
   ona:{...drafts.ona,rowOrder:order}}});
 });
 const family = state.model.drafts.activeFamily;
 const value = field==='horizon'?state.model.drafts.standard.horizonOrder:field==='ona'?state.model.drafts.ona.rowOrder:state.model.drafts.standard.movingStanza.rowOrder;
 const raw = field==='horizon'?state.raw.horizonOrder:state.raw.windows[family].rowOrder;
 const onRawStateChange = (rowOrder) => dispatch(field==='horizon'?{type:'horizon-raw',value:rowOrder}:{type:'windows-raw',value:{...state.raw.windows,[family]:{...state.raw.windows[family],rowOrder}}});
 const onChange = (rowOrder) => dispatch({type:'model',action:field==='ona'?{type:'replace-ona-draft',draft:{...state.model.drafts.ona,rowOrder}}:{type:'replace-standard-draft',draft:field==='horizon'?{...state.model.drafts.standard,horizonOrder:rowOrder}:{...state.model.drafts.standard,movingStanza:{...state.model.drafts.standard.movingStanza,rowOrder}}}});
 window.probe = {state,raw,value,exportable:workspaceDraftExportableV3(state),blockers:workspaceRawBlockersV3(state),roundtrip:async()=>{
  const file = await exportDraftV3(state.model.drafts[family]);
  const imported = await importOpenEnaArtifactV3(new TextDecoder().decode(file.bytes));
  let next = workspaceReducerV3(state,{type:'preview',value:imported});
  next = workspaceReducerV3(next,{type:'accept-draft-preview',preview:imported});
  return field==='horizon'?next.model.drafts.standard.horizonOrder:field==='ona'?next.model.drafts.ona.rowOrder:next.model.drafts.standard.movingStanza.rowOrder;
 }};
 return <OpenEnaOrderPolicyEditorV3 label="Order" fieldId="order" copy={getOpenEnaCopy('en').modelV3.order}
  value={value} rawState={raw} columnOptions={data.headers} confirmationContext={null}
  onChange={onChange} onRawStateChange={onRawStateChange} onBlockedChange={()=>{}}/>;
}
const root = createRoot(document.getElementById('root'));
window.mount = (field) => root.render(<App key={field} field={field}/>);
`;
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd(), sourcefile: "order-clear-regression.tsx" }, bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main id="root"></main></body></html>' }));
  await page.goto("http://localhost:31993/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const field of ["standard", "horizon", "ona"]) {
    await page.evaluate((field) => window.mount(field), field);
    await page.waitForFunction(() => window.probe?.raw.rows.length === 1);
    await page.locator('.ena-model-order-v3-key select').first().selectOption("");
    assert.equal(await page.evaluate(() => window.probe.value?.keys[0].column), "time", `${field}: partial invalid text retains the last typed policy`);
    assert.equal(await page.evaluate(() => window.probe.exportable), false, `${field}: partial invalid text cannot silently export that retained policy`);
    await page.locator('.ena-model-order-v3-key > button').last().click();
    await page.waitForFunction(() => window.probe.raw.rows.length === 0);
    const result = await page.evaluate(async () => ({
      value: window.probe.value,
      roundtrip: await window.probe.roundtrip(),
      exportable: window.probe.exportable,
      blocked: Object.values(window.probe.blockers).some(Boolean),
      autoRunIntent: window.probe.state.autoRunIntent,
    }));
    assert.equal(result.value, null, `${field}: deleting all keys clears the typed order`);
    assert.equal(result.roundtrip, null, `${field}: draft export/import must not resurrect the removed sort field`);
    assert.equal(result.exportable, true, `${field}: null order is a portable incomplete draft`);
    assert.equal(result.blocked, true, `${field}: incomplete order still blocks model execution`);
    assert.equal(result.autoRunIntent, null);
  }
  assert.deepEqual(errors, []);
  console.log("Order clearing preserves null across Standard, Horizon, and ONA draft round trips.");
} finally {
  await browser.close();
}
