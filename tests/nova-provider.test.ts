import test from 'node:test';
import assert from 'node:assert/strict';
import { callNovaProvider, NovaProviderError } from '../lib/nova/provider';
import type { NovaProviderOptions } from '../lib/nova/provider';
import * as novaProvider from '../lib/nova/provider';
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

const qwenModel: NovaModel={key:'qwen-flash',provider:'qwen',apiModel:'qwen3.8-flash',version:'synthetic-test',label:'Qwen',available:true};
const qwenEnv={ENA_NOVA_ENABLED:'true',ENA_NOVA_QWEN_API_KEY:'synthetic-qwen-test-key',ENA_NOVA_QWEN_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1'};

// Synthetic values reproduce the observed Qwen SSE shapes, never upstream content.
for(const placeholder of [undefined,null,'']) {
  test(`Qwen tool call keeps its first ID through ${JSON.stringify(placeholder) ?? 'omitted'} continuation IDs`,async()=>{
    const result=await callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
      {choices:[{delta:{content:'',reasoning_content:'',tool_calls:[{index:0,id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:''}}]},finish_reason:null}]},
      {choices:[{delta:{content:'',tool_calls:[{index:0,id:placeholder,type:'function',function:{arguments:'{"question":"Synthetic'}}]},finish_reason:null}]},
      {choices:[{delta:{tool_calls:[{index:0,id:placeholder,type:'function',function:{arguments:' fixture?"}'}}]},finish_reason:'tool_calls'}]},
    ])});
    assert.deepEqual(result.tool_calls,[{id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:'{"question":"Synthetic fixture?"}'}}]);
  });
}

test('Qwen accepts the same tool ID repeated across continuation chunks',async()=>{
  const result=await callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
    {choices:[{delta:{tool_calls:[{index:0,id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:'{"question":"'}}]}}]},
    {choices:[{delta:{tool_calls:[{index:0,id:'synthetic-tool-id',function:{arguments:'Synthetic?"}'}}]},finish_reason:'tool_calls'}]},
  ])});
  assert.deepEqual(result.tool_calls,[{id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:'{"question":"Synthetic?"}'}}]);
});

test('provider rejects a conflicting tool ID in a continuation chunk',async()=>{
    await assert.rejects(callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
      {choices:[{delta:{tool_calls:[{index:0,id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:'{"question":"'}}]}}]},
      {choices:[{delta:{tool_calls:[{index:0,id:'different-synthetic-id',function:{arguments:'Synthetic?"}'}}]},finish_reason:'tool_calls'}]},
    ])}),error=>error instanceof NovaProviderError && error.code==='provider-protocol');
});

// Alibaba's streaming examples use optional metadata placeholders and repeated IDs:
// https://help.aliyun.com/en/model-studio/qwen-function-calling
for(const [name,continuation] of Object.entries({
  'null function name':{function:{name:null,arguments:'Synthetic?"}'}},
  'null function arguments':{function:{arguments:null}},
  'null function':{function:null},
  'null type':{type:null,function:{arguments:'Synthetic?"}'}},
  'repeated function name':{function:{name:'ask_user',arguments:'Synthetic?"}'}},
})) {
  test(`Qwen preserves assembled tool data through ${name}`,async()=>{
    const completeFirst=name==='null function arguments'||name==='null function';
    const result=await callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
      {choices:[{delta:{tool_calls:[{index:0,id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:completeFirst?'{"question":"Synthetic?"}':'{"question":"'}}]}}]},
      {choices:[{delta:{tool_calls:[{index:0,...continuation}]},finish_reason:'tool_calls'}]},
    ])});
    assert.deepEqual(result.tool_calls,[{id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:'{"question":"Synthetic?"}'}}]);
  });
}

test('provider accepts null tool calls when a text-only response completes',async()=>{
  const result=await callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
    {choices:[{delta:{content:'OK',tool_calls:null},finish_reason:'stop'}]},
  ])});
  assert.equal(result.content,'OK');assert.equal(result.tool_calls,undefined);
});

test('provider still rejects malformed metadata, duplicate IDs and missing or unknown tools',async()=>{
  const valid={index:0,id:'synthetic-tool-id',type:'function',function:{name:'ask_user',arguments:'{}'}};
  for(const toolCalls of [
    [{...valid,type:'not-function'}],
    [{...valid,function:{name:false,arguments:'{}'}}],
    [{...valid,function:{name:'ask_user',arguments:0}}],
    [{...valid,function:{name:null,arguments:'{}'}}],
    [{...valid,function:{name:'unknown_tool',arguments:'{}'}}],
    [valid,{...valid,index:1}],
    [{...valid,index:8}],
  ]) {
    await assert.rejects(callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
      {choices:[{delta:{tool_calls:toolCalls},finish_reason:'tool_calls'}]},
    ])}),error=>error instanceof NovaProviderError && error.code==='provider-protocol');
  }
});

test('provider rejects non-string tool IDs, including false and zero',async()=>{
  for(const id of [false,0,{},[]]) {
    await assert.rejects(callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
      {choices:[{delta:{tool_calls:[{index:0,id,type:'function',function:{name:'ask_user',arguments:'{"question":"Synthetic?"}'}}]},finish_reason:'tool_calls'}]},
    ])}),error=>error instanceof NovaProviderError && error.code==='provider-protocol');
  }
});

for(const missingId of [undefined,null,'']) {
  test(`provider rejects a completed tool call with only ${JSON.stringify(missingId) ?? 'omitted'} IDs`,async()=>{
    await assert.rejects(callNovaProvider({model:qwenModel,effort:'low',messages:[],signal:new AbortController().signal,env:qwenEnv,fetch:async()=>sse([
      {choices:[{delta:{tool_calls:[{index:0,id:missingId,type:'function',function:{name:'ask_user',arguments:'{"question":"Synthetic?"}'}}]},finish_reason:'tool_calls'}]},
    ])}),error=>error instanceof NovaProviderError && error.code==='provider-protocol');
  });
}

async function diagnosticFailure(response:Response,expected:{reason:string;stage:'request'|'stream'|'completion';code?:string;toolIndex?:number;eventCount:number;retryable:boolean}) {
  const responseBytes=Buffer.byteLength(await response.clone().text());
  await assert.rejects(callNovaProvider({model,effort:'low',messages:[],signal:new AbortController().signal,env,fetch:async()=>response}),error=>{
    assert.ok(error instanceof NovaProviderError);
    assert.equal(error.code,expected.code??'provider-protocol');
    assert.deepEqual(error.diagnostic,{reason:expected.reason,stage:expected.stage,responseBytes:Math.min(responseBytes,2_000_001),eventCount:expected.eventCount,...(expected.toolIndex===undefined?{}:{toolIndex:expected.toolIndex})});
    assert.equal(error.retryable,expected.retryable);
    assert.ok(!JSON.stringify({message:error.message,diagnostic:error.diagnostic}).includes('hostile-private-value'));
    return true;
  });
}

const diagnosticTool={index:0,id:'synthetic-id',type:'function',function:{name:'ask_user',arguments:'{}'}};
const malformedEvents:[string,unknown,number?][]=[
  ['invalid-envelope',{choices:'hostile-private-value'}],
  ['invalid-choice',{choices:[null]}],
  ['invalid-choice',{choices:[{delta:{},finish_reason:42}]}],
  ['invalid-delta',{choices:[{delta:'hostile-private-value'}]}],
  ['invalid-content',{choices:[{delta:{content:{secret:'hostile-private-value'}}}]}],
  ['invalid-reasoning',{choices:[{delta:{reasoning_content:['hostile-private-value']}}]}],
  ['invalid-tool-calls',{choices:[{delta:{tool_calls:'hostile-private-value'}}]}],
  ['invalid-tool-calls',{choices:[{delta:{tool_calls:[null]}}]}],
  ['invalid-tool-index',{choices:[{delta:{tool_calls:[{...diagnosticTool,index:8}]}}]}],
  ['invalid-tool-id',{choices:[{delta:{tool_calls:[{...diagnosticTool,id:{secret:'hostile-private-value'}}]}}]},0],
  ['invalid-tool-type',{choices:[{delta:{tool_calls:[{...diagnosticTool,type:'hostile-private-value'}]}}]},0],
  ['invalid-tool-function',{choices:[{delta:{tool_calls:[{...diagnosticTool,function:'hostile-private-value'}]}}]},0],
  ['invalid-tool-name',{choices:[{delta:{tool_calls:[{...diagnosticTool,function:{name:42,arguments:'hostile-private-value'}}]}}]},0],
  ['invalid-tool-arguments',{choices:[{delta:{tool_calls:[{...diagnosticTool,function:{name:'ask_user',arguments:{secret:'hostile-private-value'}}}]}}]},0],
];
for(const [reason,event,toolIndex] of malformedEvents) {
  test(`provider reports safe ${reason} details${toolIndex===undefined?'':` for tool ${toolIndex}`}`,async()=>{
    await diagnosticFailure(sse([event]),{reason,stage:'stream',eventCount:1,toolIndex,retryable:true});
  });
}

test('provider classifies malformed JSON without leaking the payload',async()=>{
  await diagnosticFailure(new Response('data: {hostile-private-value\n\n'),{reason:'invalid-json',stage:'stream',eventCount:1,retryable:true});
});

test('provider reports the conflicting tool index without recording its IDs or arguments',async()=>{
  await diagnosticFailure(sse([
    {choices:[{delta:{tool_calls:[diagnosticTool]}}]},
    {choices:[{delta:{tool_calls:[{...diagnosticTool,id:'hostile-private-value',function:{arguments:'hostile-private-value'}}]},finish_reason:'tool_calls'}]},
  ]),{reason:'conflicting-tool-id',stage:'stream',toolIndex:0,eventCount:2,retryable:true});
});

for(const [reason,calls,toolIndex] of [
  ['missing-tool-id',[{...diagnosticTool,id:null}],0],
  ['duplicate-tool-id',[diagnosticTool,{...diagnosticTool,index:1}],1],
  ['oversized-tool-id',[{...diagnosticTool,id:'hostile-private-value'.repeat(20)}],0],
  ['unknown-tool',[{...diagnosticTool,function:{name:'hostile-private-value',arguments:'{}'}}],0],
] as const) {
  test(`provider identifies ${reason} at completion`,async()=>{
    await diagnosticFailure(sse([{choices:[{delta:{tool_calls:calls},finish_reason:'tool_calls'}]}]),{reason,stage:'completion',eventCount:2,toolIndex,retryable:reason!=='oversized-tool-id'});
  });
}

test('provider distinguishes an empty completed response from an incomplete stream',async()=>{
  await diagnosticFailure(sse([{choices:[{delta:{},finish_reason:'stop'}]}]),{reason:'empty-response',stage:'completion',eventCount:2,retryable:true});
  await diagnosticFailure(new Response('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"stop"}]}\n\n'),{reason:'stream-incomplete',stage:'completion',code:'provider-truncated',eventCount:1,retryable:true});
});

for(const [finish,reason] of [['length','output-token-limit'],['content_filter','refusal'],['hostile-private-value','unsupported-finish-reason']]) {
  test(`provider does not retry ${reason}`,async()=>{
    await diagnosticFailure(sse([{choices:[{delta:{content:'hostile-private-value'},finish_reason:finish}]}]),{reason,stage:'completion',code:'provider-truncated',eventCount:2,retryable:false});
  });
}

test('provider does not retry a refusal delta',async()=>{
  await diagnosticFailure(sse([{choices:[{delta:{refusal:'hostile-private-value'},finish_reason:'stop'}]}]),{reason:'refusal',stage:'stream',code:'provider-truncated',eventCount:1,retryable:false});
});

test('provider reports bounded size diagnostics and never retries response limits',async()=>{
  await diagnosticFailure(new Response('x'.repeat(2_100_000)),{reason:'response-limit',stage:'stream',code:'provider-limit',eventCount:0,retryable:false});
  await diagnosticFailure(sse([{choices:[{delta:{tool_calls:[{...diagnosticTool,function:{name:'ask_user',arguments:'x'.repeat(120_001)}}]}}]}]),{reason:'tool-arguments-limit',stage:'stream',code:'provider-limit',eventCount:1,toolIndex:0,retryable:false});
});

test('provider diagnoses HTTP failures using only the numeric status',async()=>{
  for(const status of [401,403,429,500]) {
    await assert.rejects(callNovaProvider({model,effort:'low',messages:[],signal:new AbortController().signal,env,fetch:async()=>new Response('hostile-private-value',{status})}),error=>{
      assert.ok(error instanceof NovaProviderError);
      assert.deepEqual(error.diagnostic,{reason:'http-error',stage:'request',responseBytes:0,eventCount:0,httpStatus:status});
      assert.equal(error.retryable,false);
      assert.ok(!error.message.includes('hostile-private-value'));
      return true;
    });
  }
});

test('provider distinguishes safe request failures and never retries them',async()=>{
  const controller=new AbortController();controller.abort();
  const cases:[Partial<NovaProviderOptions>,string,string][]=[
    [{signal:controller.signal},'cancelled','cancelled'],
    [{env:{}},'provider-unconfigured','provider-unconfigured'],
    [{env:{...env,ENA_NOVA_DEEPSEEK_BASE_URL:'https://hostile-private-value.invalid'}},'provider-unconfigured','provider-unconfigured'],
    [{messages:[{role:'user' as const,content:'x'.repeat(2_000_000)}]},'context-limit','context-limit'],
    [{fetch:async()=>{throw new Error('hostile-private-value');}},'network','provider-unavailable'],
  ];
  for(const [options,reason,code] of cases) {
    await assert.rejects(callNovaProvider({model,effort:'low',messages:[],signal:new AbortController().signal,env,fetch:async()=>sse([]),...options}),error=>{
      assert.ok(error instanceof NovaProviderError);
      assert.equal(error.code,code);
      assert.deepEqual(error.diagnostic,{reason,stage:'request',responseBytes:0,eventCount:0});
      assert.equal(error.retryable,false);
      assert.ok(!error.message.includes('hostile-private-value'));
      return true;
    });
  }
});

test('provider diagnostics project only bounded enum and numeric metadata',()=>{
  const {sanitizeNovaProviderDiagnostic}=novaProvider;
  assert.deepEqual(sanitizeNovaProviderDiagnostic({reason:'invalid-json',stage:'stream',responseBytes:9_000_000,eventCount:9_000_000,toolIndex:7,httpStatus:599,body:'hostile-private-value'}),{reason:'invalid-json',stage:'stream',responseBytes:2_000_001,eventCount:2_000_001,toolIndex:7,httpStatus:599});
  assert.deepEqual(sanitizeNovaProviderDiagnostic({reason:'invalid-json',stage:'stream',responseBytes:0,eventCount:0,toolIndex:8,httpStatus:999}),{reason:'invalid-json',stage:'stream',responseBytes:0,eventCount:0});
  for(const override of [{reason:'hostile-private-value'},{stage:'hostile-private-value'},{responseBytes:NaN},{eventCount:Infinity},{responseBytes:-1},{eventCount:0.5}]) {
    assert.equal(sanitizeNovaProviderDiagnostic({reason:'invalid-json',stage:'stream',responseBytes:0,eventCount:0,...override}),undefined);
  }
});

test('retryability requires a valid diagnostic and a matching safe error category',()=>{
  const diagnostic={reason:'invalid-json',stage:'stream',responseBytes:1,eventCount:1} as const;
  assert.equal(new NovaProviderError('provider-protocol','safe',diagnostic).retryable,true);
  assert.equal(new NovaProviderError('provider-truncated','safe',{...diagnostic,reason:'stream-incomplete'}).retryable,true);
  assert.equal(new NovaProviderError('provider-protocol','safe').retryable,false);
  assert.equal(new NovaProviderError('provider-truncated','safe').retryable,false);
  for(const code of ['cancelled','provider-unavailable','provider-timeout','provider-auth','provider-rate-limit','provider-limit','provider-unconfigured','context-limit']) {
    assert.equal(new NovaProviderError(code,'safe',diagnostic).retryable,false);
  }
  for(const reason of ['output-token-limit','refusal','response-limit','tool-arguments-limit','context-limit','unsupported-finish-reason'] as const) {
    assert.equal(new NovaProviderError('provider-protocol','safe',{...diagnostic,reason}).retryable,false);
  }
  assert.equal(new NovaProviderError('provider-protocol','safe',{...diagnostic,reason:'hostile-private-value'} as any).retryable,false);
});
