import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NOVA_SYNTHETIC_CONTEXT, validateNovaFiles, validateNovaManifest, validateNovaOutput } from './sdk';
import type { NovaCheck, NovaDraftManifest, NovaFile, NovaPluginOutput } from './types';

export class NovaSandboxError extends Error { constructor(public readonly code:string,message:string){super(message);this.name='NovaSandboxError';} }
type Environment=Record<string,string|undefined>;
export interface NovaSandboxResult { checks:NovaCheck[]; output?:NovaPluginOutput; manifest?:NovaDraftManifest; sourceHash:string; fixtureHash:string }
export type NovaSandboxExecutor=(args:string[],signal:AbortSignal)=>Promise<{code:number|null;stdout:string;stderr:string}>;
const IMAGE=/^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9][a-zA-Z0-9._/:\-]*@sha256:[a-f0-9]{64})$/;
export function novaSandboxConfigured(env:Environment=process.env):boolean {
  return IMAGE.test(env.ENA_NOVA_SANDBOX_IMAGE??'') && ['runsc','kata-runtime'].includes(env.ENA_NOVA_SANDBOX_RUNTIME??'runsc');
}
export function hashNovaFiles(files:NovaFile[]):string {
  return createHash('sha256').update(JSON.stringify([...files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))).digest('hex');
}
export const novaFixtureHash=()=>createHash('sha256').update(JSON.stringify(NOVA_SYNTHETIC_CONTEXT)).digest('hex');
export function buildNovaSandboxCommand(directory:string,name:string,env:Environment=process.env):string[] {
  if(!novaSandboxConfigured(env))throw new NovaSandboxError('sandbox-unconfigured','Nova requires an immutable sandbox image and a secure runtime');
  if(!/^nova-[a-z0-9-]+$/.test(name)||!directory.startsWith('/')||directory.includes(','))throw new NovaSandboxError('sandbox-config','Invalid sandbox workspace');
  return ['run','--rm',`--name=${name}`,'--pull=never',`--runtime=${env.ENA_NOVA_SANDBOX_RUNTIME??'runsc'}`,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65532:65532','--pids-limit=32','--cpus=1','--memory=256m','--memory-swap=256m','--ulimit=nofile=64:64','--ipc=none','--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777','--mount',`type=bind,source=${directory},target=/job,readonly`,env.ENA_NOVA_SANDBOX_IMAGE!,'/usr/bin/timeout','--signal=KILL','25','node','/opt/nova/harness.mjs'];
}
function executeDocker(args:string[],signal:AbortSignal):Promise<{code:number|null;stdout:string;stderr:string}> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new NovaSandboxError('cancelled','Sandbox cancelled'));return;}
    // The Docker CLI receives no application/provider/database credentials.
    const child=spawn('docker',args,{stdio:['ignore','pipe','pipe'],env:{NODE_ENV:'production',PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',HOME:process.env.HOME??'/tmp'},signal,killSignal:'SIGKILL'});
    let stdout='',stderr='',bytes=0,settled=false;
    const stop=()=>child.kill('SIGKILL');
    const timer=setTimeout(stop,35_000);
    const consume=(stream:'stdout'|'stderr',chunk:Buffer)=>{
      bytes+=chunk.length;
      if(bytes>1_000_000){stop();if(!settled){settled=true;reject(new NovaSandboxError('sandbox-output-limit','Sandbox output exceeded its limit'));}return;}
      if(stream==='stdout')stdout+=chunk.toString('utf8');else stderr+=chunk.toString('utf8');
    };
    child.stdout.on('data',(chunk:Buffer)=>consume('stdout',chunk));child.stderr.on('data',(chunk:Buffer)=>consume('stderr',chunk));
    child.once('error',()=>{clearTimeout(timer);if(!settled){settled=true;reject(new NovaSandboxError(signal.aborted?'cancelled':'sandbox-unavailable',signal.aborted?'Sandbox cancelled':'Docker with a secure runtime is unavailable'));}});
    child.once('close',code=>{clearTimeout(timer);if(!settled){settled=true;if(signal.aborted)reject(new NovaSandboxError('cancelled','Sandbox cancelled'));else resolve({code,stdout,stderr});}});
  });
}
async function removeContainer(name:string):Promise<void> {
  const timeout=AbortSignal.timeout(5000);
  await executeDocker(['rm','--force',name],timeout).catch(()=>undefined);
}
/** Only executes in the configured isolated container. There is deliberately no host eval/vm fallback. */
export async function runNovaSandbox(files:NovaFile[],options:{signal:AbortSignal;env?:Environment;execute?:NovaSandboxExecutor}):Promise<NovaSandboxResult> {
  if(typeof window!=='undefined')throw new NovaSandboxError('server-only','Sandbox is server only');
  if(options.signal.aborted)throw new NovaSandboxError('cancelled','Sandbox cancelled');
  const env=options.env??process.env;
  if(!novaSandboxConfigured(env))throw new NovaSandboxError('sandbox-unconfigured','Nova requires an immutable sandbox image and a secure runtime');
  const checkedFiles=validateNovaFiles(files),sourceHash=hashNovaFiles(checkedFiles),fixtureHash=novaFixtureHash();
  const checks:NovaCheck[]=[];
  let manifest:NovaDraftManifest;
  try {
    const manifestFile=checkedFiles.find(f=>f.path==='manifest.json');
    if(!manifestFile||!checkedFiles.some(f=>f.path==='src/plugin.ts')||!checkedFiles.some(f=>f.path==='tests/plugin.test.ts'))throw new Error('Required src/plugin.ts, manifest.json and tests/plugin.test.ts files are missing');
    manifest=validateNovaManifest(JSON.parse(manifestFile.content));
    checks.push({name:'manifest-and-paths',passed:true,detail:'Only allowed files; presentation/export manifest forbids analysis and network changes.'});
  }catch(error){checks.push({name:'manifest-and-paths',passed:false,detail:error instanceof Error?error.message:'Invalid manifest'});return {checks,sourceHash,fixtureHash};}
  const directory=await mkdtemp(join(tmpdir(),'nova-'));
  const name=`nova-${randomUUID()}`;
  try {
    await chmod(directory,0o755);
    for(const file of checkedFiles.filter(file=>file.path!=='fixtures/synthetic.json')){const target=join(directory,file.path);await mkdir(dirname(target),{recursive:true,mode:0o755});await writeFile(target,file.content,{mode:0o444});}
    // Always replace any supplied fixture with the trusted synthetic context.
    await mkdir(join(directory,'fixtures'),{recursive:true,mode:0o755});
    await writeFile(join(directory,'fixtures/synthetic.json'),JSON.stringify(NOVA_SYNTHETIC_CONTEXT,null,2),{mode:0o444});
    if(options.signal.aborted)throw new NovaSandboxError('cancelled','Sandbox cancelled');
    const execution=await (options.execute??executeDocker)(buildNovaSandboxCommand(directory,name,env),options.signal);
    if(options.signal.aborted)throw new NovaSandboxError('cancelled','Sandbox cancelled');
    if(execution.code!==0)throw new NovaSandboxError('sandbox-unavailable','Sandbox could not finish; verify the image, secure runtime and resource limits');
    let result:unknown;
    try{result=JSON.parse(execution.stdout);}catch{throw new NovaSandboxError('sandbox-protocol','Sandbox returned invalid output');}
    if(!result || typeof result!=='object')throw new NovaSandboxError('sandbox-protocol','Sandbox returned invalid output');
    const data=result as Record<string,unknown>;
    if(data.status==='error'){
      const stage=['compile','execute','tests'].includes(String(data.stage))?String(data.stage):'execute';
      checks.push({name:stage,passed:false,detail:typeof data.detail==='string'?data.detail.slice(0,4000):'Generated code failed in isolation.'});
      return {checks,manifest,sourceHash,fixtureHash};
    }
    if(data.status!=='ok'||data.generatedTests!==true)throw new NovaSandboxError('sandbox-protocol','Sandbox checks did not complete');
    checks.push({name:'typescript-and-generated-tests',passed:true,detail:options.execute?'Test-only injected synthetic container result; no real container execution.':'TypeScript compiled and generated tests completed inside the isolated container.'});
    try{
      const output=validateNovaOutput(data.output);
      checks.push({name:'trusted-output-and-analysis-invariance',passed:true,detail:'Host validation preserved synthetic node identity, topology, edge weights and table values; only declarative presentation data is accepted.'});
      return {checks,output,manifest,sourceHash,fixtureHash};
    }catch(error){checks.push({name:'trusted-output-and-analysis-invariance',passed:false,detail:error instanceof Error?error.message:'Output rejected'});return {checks,manifest,sourceHash,fixtureHash};}
  }finally{if(!options.execute)await removeContainer(name);await rm(directory,{recursive:true,force:true});}
}
