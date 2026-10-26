import { OPEN_ENA_AI_OWNER_HEADER, openEnaAiOperationOwnerKey } from "../lib/open-ena/ai-operation-owner";
import assert from "node:assert/strict";
import test from "node:test";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route";
import { MemoryBillableStore, createPostgresBillableStore } from "../lib/server/open-ena-billable";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import { parseOpenEnaAiInterpretationRequest, OPEN_ENA_AI_CONSENT_VALUE } from "../lib/open-ena/ai-interpretation";
const id = "aiop-11111111-1111-4111-8111-111111111111";
const url="http://localhost:32167/api/open-ena/ai-interpretation";
const limits={minuteRequests:20,dailyMicroUsd:10000,monthlyMicroUsd:10000,globalMonthlyMicroUsd:10000,providerMonthlyMicroUsd:10000,maxConcurrency:2,maxReservationMicroUsd:99,longitudinalMaxReservationMicroUsd:99,alertThresholds:[50,80,100]};
const request=(principal="A")=>new Request(url,{method:"POST",headers:{[OPEN_ENA_AI_OWNER_HEADER]:openEnaAiOperationOwnerKey(principal),"content-type":"application/json",origin:new URL(url).origin,cookie:`open-ena-session=${principal}`,"x-open-ena-ai-consent":OPEN_ENA_AI_CONSENT_VALUE,"x-open-ena-ai-operation-id":id},body:JSON.stringify(interpretationRequest())});
for (const released of [true,false]) test(`current principal replay renews only explicitly released operation: ${released}`,async()=>{
 const store=new MemoryBillableStore();let generates=0;
 const handler=createOpenEnaAiInterpretationPostHandler({verifyPrincipal:token=>token?{principalRef:token}:null,authConfigurationReady:()=>true,environment:{},parseRequest:parseOpenEnaAiInterpretationRequest,providerDescriptor:()=>({provider:"deepseek",model:"deepseek-flash"}),billableStore:store,limits,generate:async()=>{generates++;throw Object.assign(new Error("synthetic"),{code:released&&generates===1?"invalid-configuration":"upstream-network",providerDispatched:!(released&&generates===1)});}});
 const first=await handler(request());assert.equal(first.status,released?503:502);
 const retry=await handler(request());assert.equal(retry.status,409);assert.equal(retry.headers.get("x-open-ena-ai-retry"),released?"new-operation":null);assert.equal(generates,1);
 const other=await handler(request("B"));assert.equal(other.status,502);assert.equal(other.headers.get("x-open-ena-ai-retry"),null);assert.equal(generates,2);
 const otherRetry=await handler(request("B"));assert.equal(otherRetry.status,409);assert.equal(otherRetry.headers.get("x-open-ena-ai-retry"),null);assert.equal(generates,2);
});

test("released lookup is exact across principal/resource/key and stays terminal after settlement",async()=>{
 const store=new MemoryBillableStore();const input={principalRef:"A",resource:"ai-interpretation",idempotencyKey:id};
 assert.equal(await store.isReleasedOperation(input),false);
 const reservation=await store.reserve({...input,microUsd:99,limits});assert.ok(reservation);
 assert.equal(await store.isReleasedOperation(input),false);
 await store.release(reservation);
 assert.equal(await store.isReleasedOperation(input),true);
 for (const other of [{...input,principalRef:"B"},{...input,resource:"longitudinal"},{...input,idempotencyKey:id.replace("1111-4111","2222-4222")}]) assert.equal(await store.isReleasedOperation(other),false);
 await store.settle(reservation,99,true);
 assert.equal(await store.isReleasedOperation(input),true,"settle cannot resurrect a released operation");
 const replay=await store.reserveDetailed({...input,microUsd:99,limits});assert.deepEqual(replay,{ok:false,reason:"idempotency-replayed"});
});

test("Postgres release lookup binds all values and rejects absent or nonboolean proof",async()=>{
 const queries:{sql:string;params:readonly unknown[]|undefined}[]=[];
 const input={principalRef:"synthetic-principal-A",resource:"ai-interpretation",idempotencyKey:id};
 for(const rows of [[],[{released:false}],[{released:"true"}],[{released:null}],[{released:true}]]) {
  const store=createPostgresBillableStore(async(sql,params)=>{queries.push({sql,params});return {rows};});
  assert.equal(await store.isReleasedOperation!(input),rows[0]?.released===true);
 }
 for(const query of queries){assert.match(query.sql,/status\s*=\s*'released'/);assert.match(query.sql,/dispatched\s*=\s*false/);assert.match(query.sql,/principal_ref\s*=\s*\$1/);assert.match(query.sql,/resource\s*=\s*\$2/);assert.match(query.sql,/idempotency_key\s*=\s*\$3/);assert.deepEqual(query.params,[input.principalRef,input.resource,input.idempotencyKey]);assert.ok(!query.sql.includes(id));}
});

for(const proof of ["missing","failure","unknown","reserved","settled"]) test(`replay without strict released proof stays protected: ${proof}`,async()=>{
 const store=new MemoryBillableStore();const input={principalRef:"A",resource:"ai-interpretation",idempotencyKey:id,microUsd:99,limits};
 const reservation=await store.reserve(input);assert.ok(reservation);
 if(proof==="settled")await store.settle(reservation,99,true);
 if(proof==="missing")Object.defineProperty(store,"isReleasedOperation",{value:undefined});
 if(proof==="failure")Object.defineProperty(store,"isReleasedOperation",{value:async()=>{throw new Error("synthetic lookup failure");}});
 if(proof==="unknown")Object.defineProperty(store,"isReleasedOperation",{value:async()=>"true"});
 const handler=createOpenEnaAiInterpretationPostHandler({verifyPrincipal:()=>({principalRef:"A"}),authConfigurationReady:()=>true,environment:{},parseRequest:parseOpenEnaAiInterpretationRequest,providerDescriptor:()=>({provider:"deepseek",model:"deepseek-flash"}),billableStore:store,limits,generate:async()=>{throw new Error("must never dispatch");}});
 const response=await handler(request());assert.equal(response.status,409);assert.equal(response.headers.get("x-open-ena-ai-retry"),null);
});
