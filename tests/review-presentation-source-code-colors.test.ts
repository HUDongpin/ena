import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {bindingFixtureV3} from './helpers/open-ena-model-v3-fixture';
import {runStandardPlanV3} from '../lib/open-ena/analyze';
import {bindResultV3} from '../lib/open-ena/model-v3/result-binding';
import {buildPresentationArtifactV3} from '../lib/open-ena/presentation-artifact-v3';
import {prepareWorkspacePresentationV3} from '../lib/open-ena/workspace-presentation-v3';
import {parseBundleJsonV3, BUNDLE_JSON_LIMITS_V3} from '../lib/open-ena/bundle-json-v3';
import {presentBoundResultV3} from '../lib/open-ena/bound-presentation-v3';
import {codeColorFor} from '../lib/open-ena/plot-style';

const ast=ts.createSourceFile('Workspace.tsx',readFileSync(new URL('../components/open-ena/OpenEnaWorkspace.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let exportSource='',colorSource='';
function visit(n:ts.Node){if(ts.isFunctionDeclaration(n)&&n.name?.text==='exportPresentation')exportSource=n.getText(ast);if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='codeColors'&&n.initializer)colorSource=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
assert.ok(exportSource&&colorSource);
const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function fixture(label:string){
 const f=await bindingFixtureV3(undefined,(draft,data)=>{draft.codes=draft.codes.map(c=>c==='A'?label:c);data.headers=data.headers.map(c=>c==='A'?label:c);data.rows=data.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k==='A'?label:k,v])));});
 const result=await bindResultV3(f.plan,runStandardPlanV3(f.plan),{processedRows:f.plan.rows.length,maximumBufferedRows:0,numericCellsAllocated:120,peakBytesObservedOrBounded:10240,observationMethod:'exact-counters-and-conservative-byte-bound'},f.compiled.diagnostics);
 assert.equal(result.executionProvenance.labels.codes.length,3);assert.ok(result.executionProvenance.projection.rank>=2);
 return result;
}
for(const label of ['normal','Code 1','__proto__','constructor','prototype','toString'])for(const explicit of [false,true])test(`actual Workspace ${explicit?'explicit':'default'} Code colors export and map back: ${label}`,async()=>{
 const result=await fixture(label),before=JSON.stringify(result),renderedSource=presentBoundResultV3(result).codeSourceByRenderedCode;
  const colors=explicit?Object.fromEntries([[label,'#ab12ef']]):{};
  const display={codeColors:colors,codeVisibility:{},groups:{}},downloaded:unknown[]=[];
  const context={result,renderedSource,display,groups:[],sourcePositions:new Map(),selectedAxes:result.executionProvenance.projection.estimableAxes.slice(0,2),camera:undefined,codeColorFor,buildPresentationArtifactV3,downloadJson:(_name:string,value:unknown)=>downloaded.push(value),showPoints:true,showNetworks:true,showTrajectories:true,showLabels:true,showGroupLabels:true,showUnitLabels:false,showVariance:true,endpointsOnly:false,flipX:false,flipY:false,edgeThreshold:0,edgeScale:1,pointScale:1,plotZoom:1};
  const run=Function(...Object.keys(context),compile(exportSource)+'\nreturn exportPresentation;')(...Object.values(context));run();
  assert.equal(downloaded.length,1);
  const decoded=parseBundleJsonV3(JSON.stringify(downloaded[0])) as ReturnType<typeof buildPresentationArtifactV3>;
  const applied=prepareWorkspacePresentationV3(result,decoded);assert.equal(applied.status,'applied');
  if(applied.status!=='applied')throw Error('Expected exact bound preset');
  assert.equal(applied.codeColors[label],explicit?'#ab12ef':'#000000');assert.equal(Object.hasOwn(applied.codeColors,label),true);
  const rendered=Function('renderedSource','display','codeColorFor','useMemo',compile('return '+colorSource+';'))(renderedSource,display,codeColorFor,(calculate:()=>unknown)=>calculate());
  assert.ok(Object.values(rendered).every(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/.test(v as string)));
 assert.equal(JSON.stringify(result),before);
});
test('presentation source-key admission preserves descriptor safety, budgets, cycles and public JSON rejection',async()=>{
 const result=await fixture('normal');let calls=0;
 const state=()=>({hiddenCodes:[],hiddenGroups:[],codeColors:Object.fromEntries([['normal','#123456']]),nodeOverrides:[],dimensions:result.executionProvenance.projection.estimableAxes.slice(0,2)});
 const accessor=state();Object.defineProperty(accessor.codeColors,'normal',{enumerable:true,get(){calls++;return '#000000';}});
 assert.throws(()=>buildPresentationArtifactV3(result,accessor),/accessor|data property/);assert.equal(calls,0);
 const outer=state();Object.defineProperty(outer,'codeColors',{enumerable:true,get(){calls++;return {};}});assert.throws(()=>buildPresentationArtifactV3(result,outer),/accessor|data property/);assert.equal(calls,0);
 const inherited=state();Object.setPrototypeOf(inherited.codeColors,{extra:'#123456'});assert.throws(()=>buildPresentationArtifactV3(result,inherited),/plain/);
 const cyclic=state() as unknown as Record<string,unknown>;cyclic.layerOptions=cyclic;assert.throws(()=>buildPresentationArtifactV3(result,cyclic as never));
 const large=state();large.codeColors['normal']='x'.repeat(BUNDLE_JSON_LIMITS_V3.bytes+1);assert.throws(()=>buildPresentationArtifactV3(result,large),/limit/);
 const hidden=state();Object.defineProperty(hidden.codeColors,'hidden',{value:'#111111',enumerable:false});assert.throws(()=>buildPresentationArtifactV3(result,hidden),/data property|hidden/);
 const symbol=state();Object.defineProperty(symbol.codeColors,Symbol('hidden'),{value:'#123456',enumerable:true});assert.throws(()=>buildPresentationArtifactV3(result,symbol),/string-named|unsafe key/);
 const unsafeTop=Object.assign(state(),JSON.parse('{"constructor":{"polluted":true}}'));assert.throws(()=>buildPresentationArtifactV3(result,unsafeTop),/unsafe key/);
 const colorCycle=state();const cycle:Record<string,unknown>={};cycle.self=cycle;(colorCycle.codeColors as Record<string,unknown>).normal=cycle;assert.throws(()=>buildPresentationArtifactV3(result,colorCycle),/acyclic/);
 const deep=state() as unknown as Record<string,unknown>;let nested:Record<string,unknown>={};deep.layerOptions=nested;for(let i=0;i<66;i++){const next={};nested.child=next;nested=next;}assert.throws(()=>buildPresentationArtifactV3(result,deep as never),/depth|limit/);
 const unknown=state();unknown.codeColors['not-a-source']='#123456';assert.throws(()=>buildPresentationArtifactV3(result,unknown),/source Code/);
 for(const key of ['__proto__','constructor','prototype'])assert.throws(()=>parseBundleJsonV3(JSON.stringify({[key]:{polluted:true}})),/unsafe key/);
});
