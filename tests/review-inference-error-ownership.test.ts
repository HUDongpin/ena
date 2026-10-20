import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {bindingFixtureV3} from './helpers/open-ena-model-v3-fixture';
import {runStandardPlanV3} from '../lib/open-ena/analyze';
import {bindResultV3} from '../lib/open-ena/model-v3/result-binding';
import {runOpenEnaInferenceV3} from '../lib/open-ena/inference-v2';
import {openEnaConsumerAuthorityKeyV3} from '../lib/open-ena/workspace-consumer-authority-v3';
const file=ts.createSourceFile('Workspace.tsx',readFileSync(new URL('../components/open-ena/OpenEnaWorkspace.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let source='';function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='runInference')source=node.getText(file);ts.forEachChild(node,visit);}visit(file);assert.ok(source);
const executable=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function fixture(blocked:boolean) {
 const f=await bindingFixtureV3(undefined,d=>{if(blocked)d.rotation={type:'means',centerAlignToOrigin:true,negativeLevel:{type:'string',value:'Control'},positiveLevel:{type:'string',value:'Other'}};});
 const result=await bindResultV3(f.plan,runStandardPlanV3(f.plan),{processedRows:f.plan.rows.length,maximumBufferedRows:0,numericCellsAllocated:120,peakBytesObservedOrBounded:10240,observationMethod:'exact-counters-and-conservative-byte-bound'},f.compiled.diagnostics);
 const groups=result.executionProvenance.identityDictionary.groups;
 const axes=result.executionProvenance.projection.estimableAxes.slice(0,2) as [string,string];
 const controls={primaryGroup:groups[0].fields[0].value,secondaryGroup:groups[1].fields[0].value,axes};
 const key=(value:typeof controls)=>openEnaConsumerAuthorityKeyV3({binding:result.binding,plan:f.plan.header.executionPlanSha256,current:true,controls:value});
 const oldKey=key(controls),newKey=key({...controls,secondaryGroup:groups[2].fields[0].value});assert.notEqual(newKey,oldKey);
 const busy:boolean[]=[],published:unknown[]=[],consumerKeyRef={current:oldKey};
 const context={result,currentPlan:f.plan,current:true,controls,isTrajectory:false,consumerKey:oldKey,consumerKeyRef,runOpenEnaInferenceV3,setInferenceBusy:(v:boolean)=>busy.push(v),setInference:(v:unknown)=>published.push(v)};
 return {...context,busy,published,newKey,invoke:runInNewContext(executable+'\nrunInference',context) as ()=>Promise<void>};
}
test('obsolete natural Means inference failure cannot escape to the current error UI',async()=>{
 const h=await fixture(true);assert.equal(h.result.capabilityStatus['group-inference'],'blocked');
 await assert.rejects(runOpenEnaInferenceV3(h.result,h.currentPlan,h.controls),/group-inference blocked:.*STANDARD_MEANS_LEVEL_EMPTY/);
 const pending=h.invoke();h.consumerKeyRef.current=h.newKey;await pending;
 assert.deepEqual(h.busy,[true,false]);assert.deepEqual(h.published,[]);
});
test('current and repeated same-key natural inference failures remain observable and release busy',async()=>{
 const h=await fixture(true);
 for(let i=0;i<2;i++)await assert.rejects(h.invoke(),/group-inference blocked:.*STANDARD_MEANS_LEVEL_EMPTY/);
 assert.deepEqual(h.busy,[true,false,true,false]);assert.deepEqual(h.published,[]);
});
test('obsolete successful real inference preserves the existing success guard and releases busy',async()=>{
 const h=await fixture(false);const pending=h.invoke();h.consumerKeyRef.current=h.newKey;await pending;
 assert.deepEqual(h.busy,[true,false]);assert.deepEqual(h.published,[]);
});
test('current successful real inference still publishes its actual native receipt',async()=>{
 const h=await fixture(false);await h.invoke();assert.deepEqual(h.busy,[true,false]);assert.equal(h.published.length,1);
 const value=h.published[0] as {key:string;value:{kind:string}};assert.equal(value.key,h.consumerKey);assert.equal(value.value.kind,'open-ena-endpoint-inference');
});
