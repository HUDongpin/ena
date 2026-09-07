import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { runOpenEnaTrajectoryPathInferenceV3 } from "../lib/open-ena/trajectory-path-inference-v3";
import { runOpenEnaTrajectoryInferenceV3 } from "../lib/open-ena/inference-v2";
async function fixture() {
  const f = await bindingFixtureV3(undefined, (draft, data) => { draft.model = "SeparateTrajectory"; draft.codes.push("D"); data.headers.push("D"); data.rows = Array.from({length:8}, (_,i) => [1,2,3].map(t=>({unit:`PRIVATE-person-${i}`,horizon:`h${t}`,time:t,group:i<4?"Control":"Treatment",A:i+t+1,B:(i*t)%4+1,C:(i+t*t)%5+1,D:(i*i+t)%7+1}))).flat(); });
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {processedRows:f.plan.rows.length,maximumBufferedRows:0,numericCellsAllocated:240,peakBytesObservedOrBounded:20480,observationMethod:"exact-counters-and-conservative-byte-bound"},f.compiled.diagnostics);
  const controls = {axes:result.executionProvenance.projection.estimableAxes.slice(0,3) as [string,string,string],identityConfirmed:true,independentGroupsConfirmed:true,primaryGroup:{type:"string" as const,value:"Control"},secondaryGroup:{type:"string" as const,value:"Treatment"},horizons:[1,2,3].map(t=>[{column:"horizon",value:{type:"string" as const,value:`h${t}`}}]),cohortPolicy:"all-period-complete" as const,repetitions:500,seed:2026};
  const path = await runOpenEnaTrajectoryPathInferenceV3(result,f.plan,controls);
  return {...f,result,controls,path};
}
async function api() { const path="../lib/open-ena/trajectory-export-v3"; const mod=await import(path).catch(()=>({})); assert.equal(typeof mod.buildOpenEnaTrajectoryExportV3,"function","native aggregate trajectory ZIP assembler must exist"); return mod as typeof import("../lib/open-ena/trajectory-export-v3"); }
const digest=(data:Uint8Array|string)=>createHash("sha256").update(data).digest("hex");
// Independent stored-ZIP reader checks local/central records and CRC32 using
// the bitwise algorithm (the writer uses a precomputed table).
function unzip(bytes:Uint8Array) {
  const b=Buffer.from(bytes), entries=new Map<string,Buffer>(); let offset=0;
  const crc=(data:Buffer)=>{let n=0xffffffff;for(const byte of data){n^=byte;for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
  while(b.readUInt32LE(offset)===0x04034b50){assert.equal(b.readUInt16LE(offset+8),0);const size=b.readUInt32LE(offset+18),nl=b.readUInt16LE(offset+26),el=b.readUInt16LE(offset+28),name=b.subarray(offset+30,offset+30+nl).toString();const data=b.subarray(offset+30+nl+el,offset+30+nl+el+size);assert.equal(crc(data),b.readUInt32LE(offset+14));entries.set(name,data);offset+=30+nl+el+size;}
  const central=offset;let count=0;while(b.readUInt32LE(offset)===0x02014b50){const nl=b.readUInt16LE(offset+28),el=b.readUInt16LE(offset+30),cl=b.readUInt16LE(offset+32),name=b.subarray(offset+46,offset+46+nl).toString();assert.ok(entries.has(name));count++;offset+=46+nl+el+cl;}
  assert.equal(b.readUInt32LE(offset),0x06054b50);assert.equal(b.readUInt16LE(offset+10),count);assert.equal(b.readUInt32LE(offset+16),central);assert.equal(offset+22,b.length);return entries;
}
test("aggregate default ZIP excludes participant facts and preserves exact standalone file hashes",async()=>{const a=await api(),f=await fixture();const options={path:{value:f.path,controls:f.controls}};const value=await a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,options);const entries=unzip(value.bytes);assert.equal(digest(value.bytes),value.sha256);assert.equal(entries.has("participants.json"),false);assert.equal(value.manifest.disclosure,"aggregate");for(const file of value.files){assert.equal(digest(file.contents),file.sha256);assert.equal(entries.get(file.filename)?.toString(),file.contents);assert.equal(Buffer.byteLength(file.contents),file.byteLength);assert.ok(!file.contents.includes("PRIVATE-person"));assert.ok(!file.contents.includes('"unitOrder"'));assert.ok(!file.contents.includes('"participantPeriods"'));}const analysis=JSON.parse(entries.get("analysis.json")!.toString());assert.equal(analysis.pathComparison.tests.length,23);assert.equal(analysis.pathComparison.repetitions,500);assert.deepEqual(value.manifest.requestFamilies,["path-comparison"]);assert.equal(await a.assertOpenEnaTrajectoryExportConsumerV3(value,f.result,f.plan,options),value);});

test("explicit participant opt-in adds separately marked observed data and leaves aggregates identical",async()=>{const a=await api(),f=await fixture(),base={path:{value:f.path,controls:f.controls}};const aggregate=await a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,base), opted=await a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,{...base,participantConsent:{includeParticipants:true}});const files=unzip(opted.bytes);assert.equal(opted.manifest.disclosure,"participant-opt-in");assert.ok(files.get("participants.json")!.toString().includes("PRIVATE-person-0"));for(const name of ["analysis.json","plot-specification.json","trajectory-inference.csv"])assert.equal(files.get(name)?.toString(),unzip(aggregate.bytes).get(name)?.toString());});

test("ZIP includes individually validated genuine independent paired repeated rank families",async()=>{const a=await api(),f=await fixture();const axes=f.controls.axes.slice(0,2) as [string,string], group=f.controls.primaryGroup,h=f.controls.horizons;const controls:import("../lib/open-ena/longitudinal-bound-v3").OpenEnaTrajectoryControlsV3[]=[{axes,identityConfirmed:true,request:{kind:"trajectory-independent-period",period:h[0],primaryGroup:group,secondaryGroup:f.controls.secondaryGroup}},{axes,identityConfirmed:true,request:{kind:"trajectory-paired-periods",group,earlierPeriod:h[0],laterPeriod:h[2],cohortPolicy:"pairwise-complete"}},{axes,identityConfirmed:true,request:{kind:"trajectory-repeated-periods",group,periods:h,cohortPolicy:"all-period-complete",posthocContrasts:"all-period-pairs"}}];const ranks=[];for(const c of controls)ranks.push({value:await runOpenEnaTrajectoryInferenceV3(f.result,f.plan,c),controls:c});const zip=await a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,{path:{value:f.path,controls:f.controls},ranks});assert.deepEqual(zip.manifest.requestFamilies,["trajectory-independent-period","trajectory-paired-periods","trajectory-repeated-periods","path-comparison"]);const csv=unzip(zip.bytes).get("trajectory-inference.csv")!.toString();for(const kind of zip.manifest.requestFamilies)assert.ok(csv.includes(kind));await assert.rejects(a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,{path:{value:f.path,controls:f.controls},ranks:[{...ranks[0],value:structuredClone(ranks[0].value)}]}),/authority/);});

test("forged envelopes, changed controls, invalid consent and tampered ZIP reject check-only adoption",async()=>{const a=await api(),f=await fixture(),options={path:{value:f.path,controls:f.controls}};await assert.rejects(a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,{path:{value:structuredClone(f.path),controls:f.controls}}),/authority/);await assert.rejects(a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,{...options,participantConsent:{includeParticipants:false}} as never),/consent/);const value=await a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,options);await assert.rejects(a.assertOpenEnaTrajectoryExportConsumerV3(structuredClone(value),f.result,f.plan,options),/authority/);await assert.rejects(a.assertOpenEnaTrajectoryExportConsumerV3(value,f.result,f.plan,{path:{value:f.path,controls:{...f.controls,seed:9}}}),/context|controls/);value.bytes[40]^=1;await assert.rejects(a.assertOpenEnaTrajectoryExportConsumerV3(value,f.result,f.plan,options),/integrity/);});

test("async export captures consent and analyses, and stale bound science rejects",async()=>{
  const a=await api(),f=await fixture(),controls=structuredClone(f.controls),options:import("../lib/open-ena/trajectory-export-v3").OpenEnaTrajectoryExportOptionsV3={path:{value:f.path,controls}};
  const pending=a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,options);options.participantConsent={includeParticipants:true};controls.seed=9;const value=await pending;
  assert.equal(value.manifest.disclosure,"aggregate");assert.equal(unzip(value.bytes).has("participants.json"),false);
  await assert.rejects(a.assertOpenEnaTrajectoryExportConsumerV3(value,f.result,f.plan,options),/controls|context/);
  const changed=structuredClone(f.result);Object.assign(changed.binding,{datasetSha256:"0".repeat(64)});
  await assert.rejects(a.buildOpenEnaTrajectoryExportV3(changed,f.plan,{path:{value:f.path,controls:f.controls}}),/stale|binding/);
});

test("ZIP mutation during async adoption is rejected",async()=>{
  const a=await api(),f=await fixture(),options={path:{value:f.path,controls:f.controls}},value=await a.buildOpenEnaTrajectoryExportV3(f.result,f.plan,options);
  // Delay the digest after admission using an explicit barrier, then alter the
  // caller-visible bytes while the consumer's digest snapshot is in flight.
  const original=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);let release!:()=>void,entered!:()=>void;
  const barrier=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
  const targetLength=value.bytes.length;
  Object.defineProperty(globalThis.crypto.subtle,"digest",{configurable:true,value:async(algorithm:AlgorithmIdentifier,data:BufferSource)=>{if(data.byteLength===targetLength){entered();await barrier;}return original(algorithm,data);}});
  try{const pending=a.assertOpenEnaTrajectoryExportConsumerV3(value,f.result,f.plan,options);await started;value.bytes[50]^=1;release();await assert.rejects(pending,/integrity/);}finally{Object.defineProperty(globalThis.crypto.subtle,"digest",{configurable:true,value:original});release();}
});
