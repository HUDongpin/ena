/** These fixtures execute ONLY through the mandatory secure container, never on the host. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNovaSandbox } from '../lib/nova/sandbox';
const enabled=process.env.ENA_NOVA_TEST_SECURE_SANDBOX==='true';
const manifest={schemaVersion:'open-ena.nova-draft/v1',name:'Synthetic security probe',version:'0.1.0',kind:'presenter',entry:'src/plugin.ts',changesAnalysis:false,networkAccess:false};
const validPlugin='export function buildPlugin(context:any){return {title:"Synthetic probe",network:context.network,exports:["svg"]};}';
const validTests='import assert from "node:assert/strict"; import {buildPlugin} from "../src/plugin.ts"; import context from "../fixtures/synthetic.json"; assert.equal(buildPlugin(context).network.edges.length,12);';
const files=(plugin=validPlugin,tests=validTests)=>[{path:'src/plugin.ts',content:plugin},{path:'tests/plugin.test.ts',content:tests},{path:'manifest.json',content:JSON.stringify(manifest)}];
test('secure-container live smoke invokes buildPlugin and runs assertion tests',{skip:!enabled},async()=>{
  const result=await runNovaSandbox(files(),{signal:new AbortController().signal});assert.ok(result.checks.every(c=>c.passed));assert.equal(result.output?.title,'Synthetic probe');
});
for(const [name,plugin,tests] of [
  ['stdout and process.exit cannot forge build completion','const c=JSON.parse(process.getBuiltinModule("fs").readFileSync("/job/fixtures/synthetic.json","utf8")); process.stdout.write(JSON.stringify({title:"Forged",network:c.network,exports:["svg"]})); process.exit(0); export function buildPlugin(){throw new Error("never invoked")}',validTests],
  ['global invocation spoof cannot replace the exported function','Object.defineProperty(globalThis,"__novaBuildPlugin",{get(){return ()=>({title:"Spoof",network:__novaContext.network,exports:["svg"]});},set(){}}); export function buildPlugin(){throw new Error("must be called")}',validTests],
  ['test process.exit cannot bypass assertions',validPlugin,'process.exit(0); throw new Error("tests bypassed");'],
  ['constructor escape cannot access process','const p=({}).constructor.constructor("return process")(); p.exit(0); export function buildPlugin(){return {};}',validTests],
  ['global constructor cannot access process','const p=globalThis.constructor.constructor("return process")(); p.exit(0); export function buildPlugin(){return {};}',validTests],
  ['dynamic imports cannot access host modules','const target="node:fs"; const fs=await import(target); export function buildPlugin(){return fs.readFileSync("/etc/passwd","utf8");}',validTests],
  ['replaced Promise.resolve cannot receive host callbacks or forge serialized output','let c; Promise.resolve=()=>({then(resolve){const host=resolve.constructor("return globalThis")();const stringify=host.JSON.stringify;host.JSON.stringify=value=>stringify(value?.schemaVersion==="open-ena.nova-execution/v1"?{...value,result:{title:"Forged",network:c.network,exports:["svg"]}}:value);resolve({});}}); export function buildPlugin(context){c=context;return {};}',validTests],
  ['returned thenable is rejected without host await','export function buildPlugin(){return {then(resolve){const p=resolve.constructor("return process")();p.exit(0);}}}',validTests],
  ['async buildPlugin is outside the synchronous SDK','export async function buildPlugin(c){return {title:"Async",network:c.network,exports:["svg"]}}',validTests],
  ['output getter executes under the realm deadline','export function buildPlugin(c){return {get title(){while(true){}},network:c.network,exports:["svg"]}}',validTests],
  ['assertion failure rejects draft' ,validPlugin,'import assert from "node:assert/strict"; assert.equal(1,2);'],
  ['empty generated test does not count as validation',validPlugin,'export const noAssertions=true;'],
] as const) test(`secure-container adversarial probe: ${name}`,{skip:!enabled},async()=>{
  const result=await runNovaSandbox(files(plugin,tests),{signal:new AbortController().signal});assert.ok(result.checks.some(c=>!c.passed));assert.equal(result.output,undefined);
});
