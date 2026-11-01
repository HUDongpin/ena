import test from 'node:test';
import assert from 'node:assert/strict';
import { callNovaProvider, NovaProviderError } from '../lib/nova/provider';
import type { NovaModel } from '../lib/nova/types';
const model: NovaModel={key:'deepseek-flash',provider:'deepseek',apiModel:'deepseek-flash',version:'1017',label:'DeepSeek',available:true};
const env={ENA_NOVA_ENABLED:'true',ENA_NOVA_DEEPSEEK_API_KEY:'secret-test-value'};
function sse(events:unknown[]){return new Response(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}
test('provider preserves reasoning and reconstructs streamed tool calls with wire effort',async()=>{
  let body: any;
  const result=await callNovaProvider({model,effort:'high',messages:[{role:'assistant',content:null,reasoning_content:'prior-private-reasoning',tool_calls:[{id:'a',type:'function',function:{name:'list_files',arguments:'{}'}}]},{role:'tool',tool_call_id:'a',content:'[]'}],signal:new AbortController().signal,env,fetch:async(_url,init)=>{body=JSON.parse(String(init?.body));return sse([{choices:[{delta:{reasoning_content:'new-private-reasoning'}}]},{choices:[{delta:{tool_calls:[{index:0,id:'b',type:'function',function:{name:'write_file',arguments:'{"path":"src/'}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{arguments:'plugin.ts","content":"export const a=1"}'}}]},finish_reason:'tool_calls'}]}]);}});
  assert.equal(body.messages[0].reasoning_content,'prior-private-reasoning'); assert.equal(body.reasoning_effort,'high'); assert.equal(body.stream,true); assert.equal(body.model,'deepseek-flash');
  assert.equal(result.reasoning_content,'new-private-reasoning'); assert.equal(result.tool_calls?.[0].function.name,'write_file'); assert.equal(JSON.parse(result.tool_calls![0].function.arguments).path,'src/plugin.ts');
});
test('provider does not leak upstream body, URL, or credentials on failure',async()=>{
  await assert.rejects(callNovaProvider({model,effort:'low',messages:[],signal:new AbortController().signal,env,fetch:async()=>new Response('secret-test-value and internal body',{status:401})}),error=>error instanceof NovaProviderError && error.code==='provider-auth' && !error.message.includes('secret-test-value'));
});
test('provider blocks unapproved hosts and redirects before secrets can leave',async()=>{
  let called=false;
  await assert.rejects(callNovaProvider({model,effort:'low',messages:[],signal:new AbortController().signal,env:{...env,ENA_NOVA_DEEPSEEK_BASE_URL:'https://evil.example'},fetch:async()=>{called=true;return sse([]);}}));
  assert.equal(called,false);
});
test('provider cancellation reaches in-flight fetch',async()=>{
  const controller=new AbortController();
  const promise=callNovaProvider({model,effort:'low',messages:[],signal:controller.signal,env,fetch:async(_url,init)=>new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));controller.abort();})});
  await assert.rejects(promise,error=>error instanceof NovaProviderError && error.code==='cancelled');
});
test('provider rejects truncated and oversized responses',async()=>{
  await assert.rejects(callNovaProvider({model,effort:'low',messages:[],signal:new AbortController().signal,env,fetch:async()=>sse([{choices:[{delta:{content:'partial'},finish_reason:'length'}]}])}), /truncated/);
  await assert.rejects(callNovaProvider({model,effort:'low',messages:[],signal:new AbortController().signal,env,fetch:async()=>new Response('x'.repeat(2_100_000))}), /limit/);
});
