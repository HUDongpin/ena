import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {importOpenEnaArtifactV3} from "../lib/open-ena/model-artifact-imports-v3";
import {parseBundleJsonV3} from "../lib/open-ena/bundle-json-v3";
import {assertPresentationArtifactContractV3} from "../lib/open-ena/bundle-contract-v3";
import {SAMPLE_CONFIG} from "../lib/open-ena/types";
const source=readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx",import.meta.url),"utf8");
const syntax=ts.createSourceFile("Workspace.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations:string[]=[];let artifactCallback="";
function visit(node:ts.Node){
 if((ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node))&&node.name&&["OpenEnaKnownWorkspaceFailureV3","readWorkspaceUtf8File","previewPresentation"].includes(node.name.text))declarations.push(node.getText(syntax));
 if(ts.isArrowFunction(node)&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)&&node.getText(syntax).includes('"artifact-too-large"')&&node.getText(syntax).includes('controller.preview'))artifactCallback=node.getText(syntax);
 ts.forEachChild(node,visit);
}visit(syntax);assert.ok(artifactCallback);
const executable=ts.transpileModule([...declarations,`const artifactCallback=${artifactCallback};`].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const preset={boundResultSha256:"a".repeat(64),hiddenCodes:[],hiddenGroups:[{type:"string",value:"LABEL"}],codeColors:{},nodeOverrides:[],dimensions:["SVD1","SVD2"]};
function fixture(kind:"artifact"|"preset",label:Uint8Array|string){
 const text=JSON.stringify(kind==='artifact'?{...SAMPLE_CONFIG,unitColumns:['LABEL']}:preset),[a,b]=text.split('LABEL');
 return new File([a,label,b],`${kind}.json`);
}
function harness(){
 const previews:unknown[]=[];const context={id:1};const nonce={current:0};
 const vm={TextDecoder,Error,Object,file:undefined as File|undefined,presetSerial:nonce,context,result:null,latest:{current:{state:{model:{result:null}}}},modelScientificContextV3:()=>context,sameScientificContextV3:(a:unknown,b:unknown)=>a===b,parseBundleJsonV3,assertPresentationArtifactContractV3,setPresetPreview:(p:unknown)=>previews.push(p),controller:{preview:async(p:Promise<string>)=>{previews.push(await importOpenEnaArtifactV3(await p));}}};
 const api=runInNewContext(`${executable}\n({artifact:artifactCallback,preset:previewPresentation})`,vm) as {artifact():Promise<void>;preset(f:File):Promise<void>};
 return {previews,nonce,read:(kind:'artifact'|'preset',file:File)=>{vm.file=file;return kind==='artifact'?api.artifact():api.preset(file);}};
}
const malformed=[[0x80],[0xc0,0xaf],[0xc2],[0xc2,0x20],[0xe2,0x82],[0xe0,0x80,0xaf],[0xed,0xa0,0x80],[0xf0,0x9f,0x92],[0xf4,0x90,0x80,0x80],[0xff],[0xe9]];
for(const kind of ['artifact','preset'] as const){
 for(const [index,bytes] of malformed.entries())test(`${kind} rejects malformed UTF-8 case ${index} before preview`,async()=>{
  const h=harness();await assert.rejects(h.read(kind,fixture(kind,Uint8Array.from(bytes))),(e:{failure?:{id?:string}})=>e.failure?.id===`${kind}-invalid-utf8`);assert.deepEqual(h.previews,[]);
 });
 for(const label of ['café 中文 👩‍🔬','literal �','\ufeff interior'])test(`${kind} preserves valid Unicode ${label}`,async()=>{const h=harness();await h.read(kind,fixture(kind,label));assert.equal(h.previews.length,1);assert.ok(JSON.stringify(h.previews).includes(label));});
 test(`${kind} preserves actual read errors`,async()=>{const h=harness(),failure=new Error('synthetic read error');const file={size:100,text:async()=>{throw failure},arrayBuffer:async()=>{throw failure}} as unknown as File;await assert.rejects(h.read(kind,file),e=>e===failure);assert.deepEqual(h.previews,[]);});
}
for(const ownership of ['superseded','cancelled'] as const)for(const outcome of ['valid','malformed','read-error'] as const)test(`obsolete preset ${ownership} ${outcome} cannot publish preview or error`,async()=>{
 const h=harness();let release!:()=>void;const held=new Promise<void>(r=>{release=r});const native=fixture('preset',outcome==='malformed'?Uint8Array.of(0xe9):'old');const failure=new Error('synthetic old read error');
 const file={size:native.size,text:async()=>{await held;if(outcome==='read-error')throw failure;return native.text()},arrayBuffer:async()=>{await held;if(outcome==='read-error')throw failure;return native.arrayBuffer()}} as unknown as File;
 const pending=h.read('preset',file);if(ownership==='superseded')await h.read('preset',fixture('preset','current'));else h.nonce.current++;
 const prior=[...h.previews];release();await assert.doesNotReject(pending);assert.deepEqual(h.previews,prior);
});
for(const kind of ['artifact','preset'] as const){
 test(`${kind} retains the prior leading UTF-8 BOM behavior`,async()=>{const h=harness(),native=fixture(kind,'BOM');const file=new File([Uint8Array.of(0xef,0xbb,0xbf),await native.arrayBuffer()],native.name);await h.read(kind,file);assert.equal(h.previews.length,1);});
 test(`${kind} preserves admission limit before reading file bytes`,async()=>{const h=harness();let reads=0;const file={size:16*1024*1024+1,text:async()=>{reads++;return ''},arrayBuffer:async()=>{reads++;return new ArrayBuffer(0)}} as unknown as File;await assert.rejects(h.read(kind,file),(e:{failure?:{id?:string}})=>e.failure?.id===`${kind}-too-large`);assert.equal(reads,0);assert.deepEqual(h.previews,[]);});
}
test('JSON UTF-8 errors have distinct actionable text in all locales',async()=>{
 const {formatOpenEnaWorkspaceFailureV3,getOpenEnaCopy}=await import('../lib/open-ena-i18n');
 for(const locale of ['en','zh-hant','zh-hans'] as const)for(const id of ['artifact-invalid-utf8','preset-invalid-utf8'] as const){const message=formatOpenEnaWorkspaceFailureV3(getOpenEnaCopy(locale).modelV3.workspace,{id});assert.match(message,/UTF-8/u);assert.ok(locale==='en'?/Save.*again/u.test(message):/另存.*重新/u.test(message));}
});
