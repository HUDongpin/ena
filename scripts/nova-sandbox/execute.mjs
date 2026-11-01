// Defense in depth inside the mandatory OS sandbox, NEVER a host-execution fallback.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createContext, Script, SourceTextModule } from 'node:vm';
import { ASSERTION_MODULE } from './assertions.mjs';
const parseTrusted=JSON.parse,stringifyTrusted=JSON.stringify;
const emit=process.stdout.write.bind(process.stdout),reportFailure=process.stderr.write.bind(process.stderr);
async function main(){
  const request=parseTrusted(readFileSync(0,'utf8'));
  if(!request || !['plugin','tests'].includes(request.mode) || typeof request.code!=='string' || Buffer.byteLength(request.code)>300000 || !/^[a-f0-9]{64}$/.test(request.nonce))throw new Error('Invalid trusted execution request');
  // The nonce stays in this trusted module's lexical scope, never in realm globals/env/files.
  const realm=createContext(Object.create(null),{name:'nova-synthetic-plugin',codeGeneration:{strings:false,wasm:false}});
  const source=new SourceTextModule(request.code,{context:realm,identifier:'nova-generated.mjs'});
  let assertions;
  await source.link(async specifier=>{
    if(request.mode==='tests' && specifier==='node:assert/strict'){
      assertions??=new SourceTextModule(ASSERTION_MODULE,{context:realm,identifier:'nova-trusted-assertions.mjs'});
      return assertions;
    }
    throw new Error('Runtime imports are not allowed');
  });
  let result;
  if(request.mode==='plugin'){
    const fixture=readFileSync('/job/fixtures/synthetic.json','utf8');
    const wrapperBinding=`__novaSerialize_${randomBytes(16).toString('hex')}`;
    // Install/capture trusted realm intrinsics BEFORE generated code evaluates. No host object,
    // function, promise resolver or JSON serializer is passed into the generated realm.
    new Script(`(() => {
      const stringify=JSON.stringify;
      Object.defineProperty(globalThis,'__novaContext',{value:JSON.parse(${stringifyTrusted(fixture)}),writable:false,configurable:false});
      (function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}})(__novaContext);
      Object.defineProperty(globalThis,${stringifyTrusted(wrapperBinding)},{writable:false,configurable:false,value:function(buildPlugin){
        try {
          const output=buildPlugin(__novaContext);
          if(output!==null && (typeof output==='object'||typeof output==='function') && typeof output.then==='function')return '{"ok":false,"code":"sync-only"}';
          const serialized=stringify(output);
          if(typeof serialized!=='string')return '{"ok":false,"code":"invalid-output"}';
          return stringify({ok:true,serialized});
        } catch { return '{"ok":false,"code":"execution-failed"}'; }
      }});
    })();`).runInContext(realm,{timeout:1000});
    await source.evaluate({timeout:3000});
    if(typeof source.namespace.buildPlugin!=='function')throw new Error('Missing buildPlugin');
    const invocationBinding=`__novaInvoke_${randomBytes(16).toString('hex')}`;
    Object.defineProperty(realm,invocationBinding,{value:source.namespace.buildPlugin,writable:false,configurable:false});
    // Invocation, thenable rejection, getters, toJSON and serialization all occur under this
    // realm timeout. ONLY a primitive string crosses back; never await a realm-created value.
    const serializedReceipt=new Script(`${wrapperBinding}(${invocationBinding})`).runInContext(realm,{timeout:3000});
    if(typeof serializedReceipt!=='string'||Buffer.byteLength(serializedReceipt)>600000)throw new Error('Invalid realm receipt');
    const receipt=parseTrusted(serializedReceipt);
    if(receipt?.ok!==true||typeof receipt.serialized!=='string'||Buffer.byteLength(receipt.serialized)>300000)throw new Error('Synchronous plugin execution did not complete');
    result=parseTrusted(receipt.serialized);
  }else{
    await source.evaluate({timeout:5000});
    const count=assertions?.namespace.assertionCount();
    if(!Number.isSafeInteger(count)||count<1)throw new Error('No assertion completed');
    result={assertions:count};
  }
  emit(stringifyTrusted({schemaVersion:'open-ena.nova-execution/v1',nonce:request.nonce,mode:request.mode,result}));
}
// Never inspect/serialize an exception supplied by generated code in the host realm.
main().catch(()=>{reportFailure('Restricted synchronous plugin/test execution failed.\n');process.exitCode=1;});
