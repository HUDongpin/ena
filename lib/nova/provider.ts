import { getNovaProviderConfig, novaEffortPolicy } from './models';
import type { NovaEffort, NovaModel, NovaProviderMessage } from './types';

export class NovaProviderError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name='NovaProviderError'; }
}
const MAX_RESPONSE=2_000_000;
const object=(value:unknown): value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const tool=(name:string, description:string, properties:Record<string,unknown>, required:string[]=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
export const NOVA_TOOLS=[
  tool('list_files','List the draft files.',{}),
  tool('read_file','Read an allowed draft file.',{path:{type:'string'}},['path']),
  tool('write_file','Create or replace an allowed file. Never change the immutable synthetic fixture.',{path:{type:'string'},content:{type:'string'}},['path','content']),
  tool('check_plugin','Compile and run the TypeScript and generated tests inside the isolated sandbox. Mandatory before completion.',{}),
  tool('ask_user','Pause for a concrete missing requirement. Do not ask for routine implementation choices.',{question:{type:'string'}},['question']),
  tool('request_expert','Pause for method/statistical guidance. Required for requests that would change analysis, statistics, weights, topology or participant data.',{question:{type:'string'},context:{type:'string'}},['question','context']),
  tool('complete_draft','Publish a private draft artifact after the current files pass the trusted sandbox checks.',{summary:{type:'string'}},['summary']),
];
export interface NovaProviderOptions {
  model:NovaModel; effort:NovaEffort; messages:NovaProviderMessage[]; signal:AbortSignal;
  env?:NodeJS.ProcessEnv | Record<string,string | undefined>; fetch?:typeof fetch;
}
function fail(code='provider-protocol',message='Provider returned an invalid response'):never { throw new NovaProviderError(code,message); }
/** Credentials remain in the dedicated worker. No provider errors/bodies are forwarded to clients. */
export async function callNovaProvider(options:NovaProviderOptions):Promise<NovaProviderMessage> {
  if(typeof window!=='undefined') fail('server-only','Nova providers can only run on the server');
  if(options.signal.aborted) fail('cancelled','Run was cancelled');
  const config=getNovaProviderConfig(options.model.provider,options.env);
  if(!config) fail('provider-unconfigured','The selected provider is not configured');
  const base=new URL(config.baseUrl);
  const allowed=options.model.provider==='deepseek'
    ? base.hostname==='api.deepseek.com' && ['', '/', '/v1', '/v1/'].includes(base.pathname)
    : (['dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','dashscope-us.aliyuncs.com'].includes(base.hostname) || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:cn-beijing|cn-hongkong|ap-southeast-1|us-east-1|eu-central-1|ap-northeast-1)\.maas\.aliyuncs\.com$/.test(base.hostname)) && ['/compatible-mode/v1','/compatible-mode/v1/'].includes(base.pathname);
  if(base.protocol!=='https:' || base.username || base.password || base.search || base.hash || (base.port&&base.port!=='443') || !allowed) fail('provider-unconfigured','Provider base URL is not allowed');
  const policy=novaEffortPolicy(options.effort);
  const timeout=AbortSignal.timeout(policy.timeoutMs);
  const signal=AbortSignal.any([options.signal,timeout]);
  const body=JSON.stringify({model:options.model.apiModel,messages:options.messages,tools:NOVA_TOOLS,tool_choice:'auto',parallel_tool_calls:false,stream:true,max_tokens:32768,...(options.model.provider==='qwen'?{enable_thinking:true,thinking_budget:policy.thinkingBudget}:{thinking:{type:'enabled'},reasoning_effort:policy.deepseekEffort})});
  if(Buffer.byteLength(body)>2_000_000) fail('context-limit','Draft context limit exceeded');
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const response=await (options.fetch??fetch)(`${config.baseUrl.replace(/\/$/,'')}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body,signal,redirect:'error'});
    if(!response.ok) { await response.body?.cancel(); fail(response.status===401||response.status===403?'provider-auth':response.status===429?'provider-rate-limit':'provider-unavailable',`Provider request failed (HTTP ${response.status})`); }
    if(!response.body) fail();
    reader=response.body.getReader();
    const decoder=new TextDecoder(); let bytes=0, buffer='', content='',reasoning='',finish='',done=false;
    const calls=new Map<number,{id:string;type:'function';function:{name:string;arguments:string}}>();
    const consume=(data:string)=>{
      if(data==='[DONE]'){done=true;return;}
      let parsed:unknown;try{parsed=JSON.parse(data);}catch{fail();}
      if(!object(parsed)||!Array.isArray(parsed.choices)) fail();
      if(parsed.choices.length===0)return;
      if(parsed.choices.length!==1||!object(parsed.choices[0])) fail();
      const choice=parsed.choices[0];
      if(typeof choice.finish_reason==='string')finish=choice.finish_reason;
      const delta=choice.delta;
      if(!object(delta)) fail();
      if(delta.content!==undefined&&delta.content!==null){if(typeof delta.content!=='string')fail();content+=delta.content;}
      if(delta.reasoning_content!==undefined&&delta.reasoning_content!==null){if(typeof delta.reasoning_content!=='string')fail();reasoning+=delta.reasoning_content;}
      if(delta.tool_calls!==undefined){
        if(!Array.isArray(delta.tool_calls))fail();
        for(const call of delta.tool_calls){
          if(!object(call)||!Number.isInteger(call.index)||Number(call.index)<0||Number(call.index)>7)fail();
          const index=Number(call.index), prior=calls.get(index)??{id:'',type:'function' as const,function:{name:'',arguments:''}};
          if(call.id!==undefined){if(typeof call.id!=='string'||prior.id)fail();prior.id=call.id;}
          if(call.type!==undefined&&call.type!=='function')fail();
          if(call.function!==undefined){if(!object(call.function))fail();for(const key of ['name','arguments'] as const){const value=call.function[key];if(value!==undefined){if(typeof value!=='string')fail();prior.function[key]+=value;}}}
          if(prior.function.arguments.length>120_000)fail('provider-limit','Provider response limit exceeded');
          calls.set(index,prior);
        }
      }
    };
    while(true){
      const read=await reader.read();if(read.done)break;
      bytes+=read.value.byteLength;if(bytes>MAX_RESPONSE)fail('provider-limit','Provider response limit exceeded');
      buffer+=decoder.decode(read.value,{stream:true});
      let index:number;
      while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);if(line.startsWith('data:'))consume(line.slice(5).trim());}
    }
    if(!done || !['stop','tool_calls'].includes(finish))fail('provider-truncated','Provider response was truncated or incomplete');
    const toolCalls=[...calls.entries()].sort(([a],[b])=>a-b).map(([,call])=>call);
    if(new Set(toolCalls.map(c=>c.id)).size!==toolCalls.length || toolCalls.some(call=>!call.id||call.id.length>200||!NOVA_TOOLS.some(t=>t.function.name===call.function.name)))fail();
    if(!content&&!toolCalls.length)fail();
    return {role:'assistant',content:content||null,...(reasoning?{reasoning_content:reasoning}:{}),...(toolCalls.length?{tool_calls:toolCalls}:{})};
  } catch(error) {
    if(error instanceof NovaProviderError)throw error;
    if(options.signal.aborted)fail('cancelled','Run was cancelled or its lease ended');
    if(timeout.aborted)fail('provider-timeout','Provider request timed out');
    return fail('provider-unavailable','Provider request could not be completed');
  } finally { if(reader)await reader.cancel().catch(()=>undefined); }
}
