import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createOpenEnaAiOperationStore,openEnaAiOperationScope,openEnaAiOperationStorageKey} from '../lib/open-ena/ai-operation-storage';
import {openEnaAiOperationOwnerKey} from '../lib/open-ena/ai-operation-owner';
import {interpretationRequest} from './helpers/ai-interpretation-request-v2';
const X='aiop-11111111-1111-4111-8111-111111111111',Y='aiop-22222222-2222-4222-8222-222222222222';
const A=openEnaAiOperationOwnerKey('synthetic-A'),B=openEnaAiOperationOwnerKey('synthetic-B');
const request=interpretationRequest();const scopeA=openEnaAiOperationScope(request,A),scopeB=openEnaAiOperationScope(request,B);
function memory(){const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}
test('owner scope matches independent SHA oracle and emits only opaque owner/wire keys',()=>{
 assert.equal(A,createHash('sha256').update('open-ena-ai-operation-owner-v1\0synthetic-A').digest('hex'));
 assert.notEqual(scopeA.key,scopeB.key);assert.match(scopeA.key,/^open-ena-ai-operation-v4:[a-f0-9]{64}:[a-f0-9]{64}$/);
 assert.throws(()=>openEnaAiOperationScope(request,'private raw principal'),/owner/);
});
for(const legacyKey of scopeA.legacyKeys) test(`ownerless seed survives both owners' migration and scoped close: ${legacyKey.slice(0,25)}`,()=>{
 const storage=memory();storage.setItem(legacyKey,X);let store=createOpenEnaAiOperationStore(()=>storage);
 assert.equal(store.read(scopeA),X);assert.equal(store.read(scopeB),X);store.close(scopeB,X);
 assert.equal(storage.getItem(legacyKey),X);assert.equal(store.read(scopeA),X);assert.equal(store.read(scopeB),null);
 store=createOpenEnaAiOperationStore(()=>storage);assert.equal(store.read(scopeA),X);assert.equal(store.read(scopeB),null,'tombstone survives reload and does not resurrect legacy X');
 store.set(scopeB,Y);assert.equal(store.read(scopeB),Y);store.close(scopeB,X);assert.equal(store.read(scopeB),Y,'stale X cannot close Y');
});
test('coarse v2 seed is claimed once per owner wire, persists across reload, and remains available to another owner',()=>{
 const storage=memory();const old=`open-ena-ai-operation-v2:${request.binding.evidenceKey}`;storage.setItem(old,X);let store=createOpenEnaAiOperationStore(()=>storage);
 const otherWire=openEnaAiOperationScope(interpretationRequest('zh-hant'),A);
 assert.equal(store.read(scopeA),X);store.close(scopeA,X);store.set(scopeA,Y);
 store=createOpenEnaAiOperationStore(()=>storage);assert.equal(store.read(otherWire),null);assert.equal(store.read(scopeB),X);assert.equal(storage.getItem(old),X);
});
for(const mode of ['denied','quota','no-remove-capability'] as const) test(`page authority preserves pending IDs and closure across component remount when storage ${mode}`,()=>{
 const backing=memory();backing.setItem(openEnaAiOperationStorageKey(request),X);
 const storage={getItem:(key:string)=>{if(mode==='denied')throw new Error('denied');return backing.getItem(key);},setItem:(key:string,value:string)=>{if(mode==='quota'||mode==='denied')throw new Error('full');backing.setItem(key,value);}};
 const store=createOpenEnaAiOperationStore(()=>storage);assert.equal(store.read(scopeA),mode==='denied'?null:X);store.set(scopeA,X);
 assert.equal(store.read(scopeA),X,'same page store survives component remount');store.close(scopeA,X);assert.equal(store.read(scopeA),null,'known closed operation cannot resurrect from old backing storage');store.set(scopeA,Y);store.close(scopeA,X);assert.equal(store.read(scopeA),Y);
 assert.equal(store.read(scopeB),mode==='denied'?null:X,'another owner remains separately seeded');
});
test('memory authority and legacy claim survive failed writes while changing wire and owner',()=>{
 const backing=memory();backing.setItem(`open-ena-ai-operation-v2:${request.binding.evidenceKey}`,X);
 const store=createOpenEnaAiOperationStore(()=>({getItem:backing.getItem,setItem:()=>{throw new Error('quota');}}));
 assert.equal(store.read(scopeA),X);assert.equal(store.read(openEnaAiOperationScope(interpretationRequest('zh-hant'),A)),null);assert.equal(store.read(scopeB),X);store.close(scopeB,X);assert.equal(store.read(scopeA),X);assert.equal(store.read(scopeB),null);
});
