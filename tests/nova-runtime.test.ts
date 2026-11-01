import test from 'node:test';
import assert from 'node:assert/strict';
import { NOVA_SYNTHETIC_CONTEXT, validateNovaFile, validateNovaManifest, validateNovaOutput } from '../lib/nova/sdk';

test('Nova accepts presentation changes while preserving synthetic analysis values', () => {
  const output = {title:'Draft', network:{nodes:NOVA_SYNTHETIC_CONTEXT.network.nodes.map(n => ({...n,x:n.x+10,color:'#000000'})), edges:NOVA_SYNTHETIC_CONTEXT.network.edges.map(e=>({...e,color:'#ffffff'}))},exports:['svg','json']};
  assert.equal(validateNovaOutput(output).title, 'Draft');
  const altered = structuredClone(output); altered.network.edges[0].weight += 1;
  assert.throws(()=>validateNovaOutput(altered), /invariant/i);
  assert.throws(()=>validateNovaOutput({...output, html:'<script>alert(1)</script>'}), /field/i);
});
test('Nova rejects unsafe and unknown paths and oversized content', () => {
  for(const path of ['../src/plugin.ts','/src/plugin.ts','src/../src/plugin.ts','src\\plugin.ts','package.json','fixtures/private.csv']) assert.throws(()=>validateNovaFile({path,content:''}), /path/i);
  assert.throws(()=>validateNovaFile({path:'src/plugin.ts',content:'x'.repeat(100_001)}), /limit/i);
  assert.equal(validateNovaFile({path:'src/plugin.ts',content:'export const x = 1'}).path,'src/plugin.ts');
});
test('Nova manifest cannot opt into analysis or networking', () => {
  const manifest={schemaVersion:'open-ena.nova-draft/v1',name:'Draft',version:'0.1.0',kind:'presenter',entry:'src/plugin.ts',changesAnalysis:false,networkAccess:false};
  assert.equal(validateNovaManifest(manifest).changesAnalysis,false);
  assert.throws(()=>validateNovaManifest({...manifest,changesAnalysis:true}), /manifest/i);
  assert.throws(()=>validateNovaManifest({...manifest,dependencies:['evil']}), /manifest/i);
});
test('synthetic comparison preserves both group networks and legend identity',()=>{
  assert.deepEqual([...new Set(NOVA_SYNTHETIC_CONTEXT.network.edges.map(e=>e.group))],['Group A','Group B']);
  const output={title:'Group comparison',network:structuredClone(NOVA_SYNTHETIC_CONTEXT.network),exports:['svg']};
  assert.equal(validateNovaOutput(output).network?.edges.length,12);
  output.network.edges[6].group='Group A';
  assert.throws(()=>validateNovaOutput(output),/invariant/i);
});
