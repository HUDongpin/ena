import { getNovaProviderConfig, novaEffortPolicy } from './models';
import type { NovaEffort, NovaModel, NovaProviderMessage } from './types';
import { NOVA_PROVIDER_FAILURE_MESSAGES, sanitizeNovaProviderDiagnostic } from './provider-diagnostics';
import type { NovaProviderDiagnostic, NovaProviderFailureReason } from './provider-diagnostics';
export { sanitizeNovaProviderDiagnostic } from './provider-diagnostics';
export type { NovaProviderDiagnostic, NovaProviderFailureReason } from './provider-diagnostics';

const RETRYABLE_PROTOCOL_REASONS=new Set<NovaProviderFailureReason>([
  'missing-response-body','invalid-json','invalid-envelope','invalid-choice','invalid-delta',
  'invalid-content','invalid-reasoning','invalid-tool-calls','invalid-tool-index','invalid-tool-id',
  'conflicting-tool-id','invalid-tool-type','invalid-tool-function','invalid-tool-name',
  'invalid-tool-arguments','missing-tool-id','duplicate-tool-id','unknown-tool','empty-response',
]);
export class NovaProviderError extends Error {
  readonly diagnostic: NovaProviderDiagnostic|undefined;
  readonly retryable: boolean;
  constructor(public readonly code: string, message: string, diagnostic?:NovaProviderDiagnostic) {
    super(message); this.name='NovaProviderError';
    this.diagnostic=sanitizeNovaProviderDiagnostic(diagnostic);
    this.retryable=!!this.diagnostic&&(code==='provider-protocol'&&RETRYABLE_PROTOCOL_REASONS.has(this.diagnostic.reason)||code==='provider-truncated'&&this.diagnostic.reason==='stream-incomplete');
  }
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
/** Credentials remain in the dedicated worker. No provider errors/bodies are forwarded to clients. */
export async function callNovaProvider(options:NovaProviderOptions):Promise<NovaProviderMessage> {
  let bytes=0,eventCount=0,stage:NovaProviderDiagnostic['stage']='request';
  function fail(reason:NovaProviderFailureReason,code='provider-protocol',details:{toolIndex?:number;httpStatus?:number}={}):never {
    throw new NovaProviderError(code,NOVA_PROVIDER_FAILURE_MESSAGES[reason],{reason,stage,responseBytes:bytes,eventCount,...details});
  }
  if(typeof window!=='undefined') fail('server-only','server-only');
  if(options.signal.aborted) fail('cancelled','cancelled');
  const config=getNovaProviderConfig(options.model.provider,options.env);
  if(!config) fail('provider-unconfigured','provider-unconfigured');
  const base=new URL(config.baseUrl);
  const allowed=options.model.provider==='deepseek'
    ? base.hostname==='api.deepseek.com' && ['', '/', '/v1', '/v1/'].includes(base.pathname)
    : (['dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','dashscope-us.aliyuncs.com'].includes(base.hostname) || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:cn-beijing|cn-hongkong|ap-southeast-1|us-east-1|eu-central-1|ap-northeast-1)\.maas\.aliyuncs\.com$/.test(base.hostname)) && ['/compatible-mode/v1','/compatible-mode/v1/'].includes(base.pathname);
  if(base.protocol!=='https:' || base.username || base.password || base.search || base.hash || (base.port&&base.port!=='443') || !allowed) fail('provider-unconfigured','provider-unconfigured');
  const policy=novaEffortPolicy(options.effort);
  const timeout=AbortSignal.timeout(policy.timeoutMs);
  const signal=AbortSignal.any([options.signal,timeout]);
  const body=JSON.stringify({model:options.model.apiModel,messages:options.messages,tools:NOVA_TOOLS,tool_choice:'auto',parallel_tool_calls:false,stream:true,max_tokens:32768,...(options.model.provider==='qwen'?{enable_thinking:true,thinking_budget:policy.thinkingBudget}:{thinking:{type:'enabled'},reasoning_effort:policy.deepseekEffort})});
  if(Buffer.byteLength(body)>2_000_000) fail('context-limit','context-limit');
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const response=await (options.fetch??fetch)(`${config.baseUrl.replace(/\/$/,'')}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body,signal,redirect:'error'});
    if(!response.ok) { await response.body?.cancel().catch(()=>undefined); fail('http-error',response.status===401||response.status===403?'provider-auth':response.status===429?'provider-rate-limit':'provider-unavailable',{httpStatus:response.status}); }
    if(!response.body) fail('missing-response-body');
    reader=response.body.getReader();
    stage='stream';
    const decoder=new TextDecoder(); let buffer='', content='',reasoning='',finish='',done=false;
    const calls=new Map<number,{id:string;type:'function';function:{name:string;arguments:string}}>();
    const consume=(data:string)=>{
      eventCount++;
      if(data==='[DONE]'){done=true;return;}
      let parsed:unknown;try{parsed=JSON.parse(data);}catch{fail('invalid-json');}
      if(!object(parsed)||!Array.isArray(parsed.choices)) fail('invalid-envelope');
      if(parsed.choices.length===0)return;
      if(parsed.choices.length!==1||!object(parsed.choices[0])) fail('invalid-choice');
      const choice=parsed.choices[0];
      if(choice.finish_reason!==undefined&&choice.finish_reason!==null&&typeof choice.finish_reason!=='string')fail('invalid-choice');
      if(typeof choice.finish_reason==='string')finish=choice.finish_reason;
      const delta=choice.delta;
      if(!object(delta)) fail('invalid-delta');
      if(delta.refusal!==undefined&&delta.refusal!==null&&delta.refusal!=='')fail('refusal','provider-truncated');
      if(delta.content!==undefined&&delta.content!==null){if(typeof delta.content!=='string')fail('invalid-content');content+=delta.content;}
      if(delta.reasoning_content!==undefined&&delta.reasoning_content!==null){if(typeof delta.reasoning_content!=='string')fail('invalid-reasoning');reasoning+=delta.reasoning_content;}
      if(delta.tool_calls!==undefined&&delta.tool_calls!==null){
        if(!Array.isArray(delta.tool_calls))fail('invalid-tool-calls');
        for(const call of delta.tool_calls){
          if(!object(call))fail('invalid-tool-calls');
          if(!Number.isInteger(call.index)||Number(call.index)<0||Number(call.index)>7)fail('invalid-tool-index');
          const index=Number(call.index), prior=calls.get(index)??{id:'',type:'function' as const,function:{name:'',arguments:''}};
          // Streaming metadata may be omitted/null or repeated unchanged; arguments remain incremental.
          if(call.id!==undefined&&call.id!==null&&call.id!==''){
            if(typeof call.id!=='string')fail('invalid-tool-id','provider-protocol',{toolIndex:index});
            if(prior.id&&prior.id!==call.id)fail('conflicting-tool-id','provider-protocol',{toolIndex:index});
            prior.id=call.id;
          }
          if(call.type!==undefined&&call.type!==null&&call.type!=='function')fail('invalid-tool-type','provider-protocol',{toolIndex:index});
          if(call.function!==undefined&&call.function!==null){
            if(!object(call.function))fail('invalid-tool-function','provider-protocol',{toolIndex:index});
            for(const key of ['name','arguments'] as const){
              const value=call.function[key];
              if(value!==undefined&&value!==null){
                if(typeof value!=='string')fail(key==='name'?'invalid-tool-name':'invalid-tool-arguments','provider-protocol',{toolIndex:index});
                if(key!=='name'||value!==prior.function.name)prior.function[key]+=value;
              }
            }
          }
          if(prior.function.arguments.length>120_000)fail('tool-arguments-limit','provider-limit',{toolIndex:index});
          calls.set(index,prior);
        }
      }
    };
    while(true){
      const read=await reader.read();if(read.done)break;
      bytes+=read.value.byteLength;if(bytes>MAX_RESPONSE)fail('response-limit','provider-limit');
      buffer+=decoder.decode(read.value,{stream:true});
      let index:number;
      while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);if(line.startsWith('data:'))consume(line.slice(5).trim());}
    }
    stage='completion';
    if(finish==='length')fail('output-token-limit','provider-truncated');
    if(finish==='content_filter'||finish==='refusal')fail('refusal','provider-truncated');
    if(finish&&!['stop','tool_calls'].includes(finish))fail('unsupported-finish-reason','provider-truncated');
    if(!done||!finish)fail('stream-incomplete','provider-truncated');
    const ids=new Set<string>();
    for(const [index,call] of [...calls.entries()].sort(([a],[b])=>a-b)){
      if(!call.id)fail('missing-tool-id','provider-protocol',{toolIndex:index});
      if(call.id.length>200)fail('oversized-tool-id','provider-protocol',{toolIndex:index});
      if(ids.has(call.id))fail('duplicate-tool-id','provider-protocol',{toolIndex:index});
      ids.add(call.id);
      if(!NOVA_TOOLS.some(tool=>tool.function.name===call.function.name))fail('unknown-tool','provider-protocol',{toolIndex:index});
    }
    const toolCalls=[...calls.entries()].sort(([a],[b])=>a-b).map(([,call])=>call);
    if(!content&&!toolCalls.length)fail('empty-response');
    return {role:'assistant',content:content||null,...(reasoning?{reasoning_content:reasoning}:{}),...(toolCalls.length?{tool_calls:toolCalls}:{})};
  } catch(error) {
    if(error instanceof NovaProviderError)throw error;
    if(options.signal.aborted)fail('cancelled','cancelled');
    if(timeout.aborted)fail('timeout','provider-timeout');
    return fail('network','provider-unavailable');
  } finally { if(reader)await reader.cancel().catch(()=>undefined); }
}
