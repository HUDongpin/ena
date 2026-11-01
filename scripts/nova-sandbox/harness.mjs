// Trusted supervisor. Generated modules are evaluated only in restricted subprocess realms.
// This entire supervisor and every child run inside the mandatory gVisor/Kata container.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const reply = value => process.stdout.write(JSON.stringify(value));
const fail = (stage, detail) => { reply({status:'error',stage,detail:String(detail).slice(0,4000)}); process.exit(0); };
const sources=new Set(['/job/src/plugin.ts','/job/tests/plugin.test.ts']);
const restrict={name:'nova-import-boundary',setup(api){api.onResolve({filter:/.*/},args=>{
  if(args.kind==='entry-point' && sources.has(args.path))return {path:args.path};
  if(args.importer==='/job/tests/plugin.test.ts' && args.path==='node:assert/strict')return {path:args.path,external:true};
  if(args.importer==='/job/tests/plugin.test.ts' && args.path==='../fixtures/synthetic.json')return {path:'/job/fixtures/synthetic.json'};
  if(args.importer==='/job/tests/plugin.test.ts' && ['../src/plugin','../src/plugin.ts'].includes(args.path))return {path:'/job/src/plugin.ts'};
  return {errors:[{text:'Nova imports are restricted to the plugin, synthetic fixture and node:assert/strict in tests; no dependencies.'}]};
});}};
const bundles=[];
try{
  for(const entry of ['/job/src/plugin.ts','/job/tests/plugin.test.ts']){
    const built=await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',target:'node24',supported:{'dynamic-import':false},plugins:[restrict],logLevel:'silent',write:false});
    bundles.push(built.outputFiles[0].text);
  }
}catch(error){fail('compile',error.message);}
function execute(mode,code,stage){
  const nonce=randomBytes(32).toString('hex');
  const child=spawnSync(process.execPath,['--experimental-vm-modules','/opt/nova/execute.mjs'],{encoding:'utf8',timeout:8000,maxBuffer:400000,env:{PATH:'/usr/bin:/bin',NOVA_SYNTHETIC:'true',NODE_NO_WARNINGS:'1'},cwd:'/tmp',input:JSON.stringify({mode,code,nonce})});
  if(child.status!==0||child.error)fail(stage,child.stderr||child.error?.message||'Generated code failed');
  let response;try{response=JSON.parse(child.stdout);}catch{fail(stage,'Trusted execution completion receipt is missing');}
  if(response?.schemaVersion!=='open-ena.nova-execution/v1'||response.nonce!==nonce||response.mode!==mode)fail(stage,'Trusted execution completion receipt is invalid');
  return response.result;
}
const output=execute('plugin',bundles[0],'execute');
const tests=execute('tests',bundles[1],'tests');
if(!Number.isSafeInteger(tests?.assertions)||tests.assertions<1)fail('tests','No test assertions completed');
reply({status:'ok',output,generatedTests:true});
