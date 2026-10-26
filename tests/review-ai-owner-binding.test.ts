import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createOpenEnaAiInterpretationPostHandler} from '../lib/server/open-ena-ai-interpretation-route';
import {MemoryBillableStore} from '../lib/server/open-ena-billable';
import {parseOpenEnaAiInterpretationRequest, OPEN_ENA_AI_CONSENT_VALUE} from '../lib/open-ena/ai-interpretation';
import {interpretationRequest} from './helpers/ai-interpretation-request-v2';
const owner=(principal:string)=>createHash('sha256').update(`open-ena-ai-operation-owner-v1\0${principal}`,'utf8').digest('hex');
const id='aiop-11111111-1111-4111-8111-111111111111';
const limits={minuteRequests:20,dailyMicroUsd:10000,monthlyMicroUsd:10000,globalMonthlyMicroUsd:10000,providerMonthlyMicroUsd:10000,maxConcurrency:2,maxReservationMicroUsd:99,longitudinalMaxReservationMicroUsd:99,alertThresholds:[50,80,100]};
function fixture(){
 const calls={quota:0,store:0,parse:0,generate:0};const store=new MemoryBillableStore();
 const handler=createOpenEnaAiInterpretationPostHandler({verifyPrincipal:token=>token?{principalRef:token.startsWith('A-')?'A':'B'}:null,authConfigurationReady:()=>true,environment:{},providerDescriptor:()=>({provider:'deepseek',model:'deepseek-flash'}),billableStoreFactory:async()=>{calls.store++;return store;},limits,consumeQuota:()=>{calls.quota++;return true;},parseRequest:value=>{calls.parse++;return parseOpenEnaAiInterpretationRequest(value);},generate:async()=>{calls.generate++;throw Object.assign(new Error('synthetic unknown result'),{code:'upstream-network',providerDispatched:true});}});
 const request=(token='A-1',expectedOwner:string|null=owner('A'))=>{
  const headers=new Headers({'content-type':'application/json',origin:'http://localhost:32168',cookie:`open-ena-session=${token}`,'x-open-ena-ai-consent':OPEN_ENA_AI_CONSENT_VALUE,'x-open-ena-ai-operation-id':id});
  if(expectedOwner!==null)headers.set('x-open-ena-ai-owner',expectedOwner);
  return new Request('http://localhost:32168/api/open-ena/ai-interpretation',{method:'POST',headers,body:JSON.stringify(interpretationRequest())});
 };
 return {calls,handler,request};
}
for(const scope of [null,'malformed',owner('B')]) test(`missing or mismatched owner blocks before any side effect: ${scope}`,async()=>{
 const {calls,handler,request}=fixture();const response=await handler(request('A-1',scope));assert.equal(response.status,409);assert.equal(response.headers.get('x-open-ena-ai-retry'),null);assert.deepEqual(calls,{quota:0,store:0,parse:0,generate:0});assert.match((await response.json()).error,/refresh|reload/i);
});
test('same principal token rotation preserves owner binding and replay guard',async()=>{
 const {calls,handler,request}=fixture();assert.equal((await handler(request('A-1'))).status,502);assert.equal((await handler(request('A-rotated'))).status,409);assert.equal(calls.generate,1);
});
test('cookie changes before dispatch are blocked even with a previously valid owner hint',async()=>{
 const {calls,handler,request}=fixture();const response=await handler(request('B-1',owner('A')));assert.equal(response.status,409);assert.deepEqual(calls,{quota:0,store:0,parse:0,generate:0});
});
