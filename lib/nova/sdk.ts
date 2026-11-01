import type { NovaDraftManifest, NovaFile, NovaPluginOutput } from './types';

/** This is the only data supplied to generated code. It is synthetic, fixed and has no user records. */
export interface NovaPluginContext { schemaVersion:'open-ena.nova-context/v1'; synthetic:true; network:NonNullable<NovaPluginOutput['network']>; table:NonNullable<NovaPluginOutput['table']> }
export const NOVA_SYNTHETIC_CONTEXT: NovaPluginContext = {
  schemaVersion: 'open-ena.nova-context/v1',
  synthetic: true,
  network: {
    nodes: [
      { id: 'question', label: 'Question', x: -0.7, y: 0.4, color: '#326c87' },
      { id: 'evidence', label: 'Evidence', x: 0.6, y: 0.6, color: '#658a44' },
      { id: 'explain', label: 'Explain', x: 0.7, y: -0.5, color: '#ad7149' },
      { id: 'reflect', label: 'Reflect', x: -0.5, y: -0.6, color: '#805f95' },
    ],
    edges: [
      { source: 'question', target: 'evidence', weight: 0.42, color: '#326c87', group: 'Group A' },
      { source: 'question', target: 'explain', weight: 0.18, color: '#326c87', group: 'Group A' },
      { source: 'question', target: 'reflect', weight: 0.12, color: '#326c87', group: 'Group A' },
      { source: 'evidence', target: 'explain', weight: 0.63, color: '#326c87', group: 'Group A' },
      { source: 'evidence', target: 'reflect', weight: 0.27, color: '#326c87', group: 'Group A' },
      { source: 'explain', target: 'reflect', weight: 0.36, color: '#326c87', group: 'Group A' },
      { source: 'question', target: 'evidence', weight: 0.25, color: '#c4873f', group: 'Group B' },
      { source: 'question', target: 'explain', weight: 0.33, color: '#c4873f', group: 'Group B' },
      { source: 'question', target: 'reflect', weight: 0.21, color: '#c4873f', group: 'Group B' },
      { source: 'evidence', target: 'explain', weight: 0.46, color: '#c4873f', group: 'Group B' },
      { source: 'evidence', target: 'reflect', weight: 0.39, color: '#c4873f', group: 'Group B' },
      { source: 'explain', target: 'reflect', weight: 0.15, color: '#c4873f', group: 'Group B' },
    ],
    legend: [{ label: 'Group A', color: '#326c87' }, { label: 'Group B', color: '#c4873f' }],
  },
  table: {
    columns: ['source', 'target', 'weight', 'group'],
    rows: [
      ['question', 'evidence', 0.42, 'Group A'], ['question', 'explain', 0.18, 'Group A'], ['question', 'reflect', 0.12, 'Group A'],
      ['evidence', 'explain', 0.63, 'Group A'], ['evidence', 'reflect', 0.27, 'Group A'], ['explain', 'reflect', 0.36, 'Group A'],
      ['question', 'evidence', 0.25, 'Group B'], ['question', 'explain', 0.33, 'Group B'], ['question', 'reflect', 0.21, 'Group B'],
      ['evidence', 'explain', 0.46, 'Group B'], ['evidence', 'reflect', 0.39, 'Group B'], ['explain', 'reflect', 0.15, 'Group B'],
    ] as (string | number | null)[][],
  },
};
function freezeContext(value:unknown):void { if(value && typeof value==='object'){ Object.freeze(value); for(const child of Object.values(value))freezeContext(child); } }
freezeContext(NOVA_SYNTHETIC_CONTEXT);
export const NOVA_ALLOWED_PATHS = ['src/plugin.ts', 'manifest.json', 'README.md', 'tests/plugin.test.ts', 'fixtures/synthetic.json'] as const;
export const NOVA_FILE_LIMIT = 100_000;
export const NOVA_TOTAL_FILE_LIMIT = 240_000;

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function fields(value: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label}: unknown field`);
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000; }
function color(value: unknown): value is string { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }

export function validateNovaFile(value: unknown): NovaFile {
  if (!object(value) || typeof value.path !== 'string' || !NOVA_ALLOWED_PATHS.includes(value.path as typeof NOVA_ALLOWED_PATHS[number])) throw new Error('File path is not allowed');
  fields(value, ['path', 'content'], 'File');
  if (typeof value.content !== 'string' || new TextEncoder().encode(value.content).byteLength > NOVA_FILE_LIMIT || value.content.includes('\0')) throw new Error('File content limit exceeded');
  if (value.path === 'fixtures/synthetic.json' && value.content !== JSON.stringify(NOVA_SYNTHETIC_CONTEXT, null, 2)) throw new Error('Synthetic fixture is immutable');
  return { path: value.path, content: value.content };
}
export function validateNovaFiles(files: NovaFile[]): NovaFile[] {
  if (!Array.isArray(files) || files.length > NOVA_ALLOWED_PATHS.length) throw new Error('File count limit exceeded');
  const result = files.map(validateNovaFile);
  if (new Set(result.map(f=>f.path)).size !== result.length) throw new Error('Duplicate file path');
  if (result.reduce((sum,f)=>sum+new TextEncoder().encode(f.content).byteLength,0)>NOVA_TOTAL_FILE_LIMIT) throw new Error('Total file content limit exceeded');
  return result;
}
export function validateNovaManifest(value: unknown): NovaDraftManifest {
  if (!object(value)) throw new Error('Invalid manifest');
  fields(value, ['schemaVersion','name','version','kind','entry','changesAnalysis','networkAccess'], 'Manifest');
  if (value.schemaVersion !== 'open-ena.nova-draft/v1' || !text(value.name,120) || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version) || !['presenter','exporter'].includes(String(value.kind)) || value.entry !== 'src/plugin.ts' || value.changesAnalysis !== false || value.networkAccess !== false) throw new Error('Invalid manifest: presentation/export only; analysis and network access are forbidden');
  return value as unknown as NovaDraftManifest;
}
/** Host-owned check. No result/check supplied by generated code is trusted. */
export function validateNovaOutput(value: unknown): NovaPluginOutput {
  if (!object(value)) throw new Error('Invalid plugin output');
  fields(value,['title','description','network','table','exports'],'Output');
  if (!text(value.title,160) || (value.description !== undefined && !text(value.description,2000)) || !Array.isArray(value.exports) || value.exports.length < 1 || value.exports.length>3 || new Set(value.exports).size!==value.exports.length || value.exports.some(e=>!['svg','csv','json'].includes(e))) throw new Error('Invalid output fields');
  if (value.network===undefined && value.table===undefined) throw new Error('Output requires a network or table');
  if (value.network!==undefined) {
    if (!object(value.network)) throw new Error('Invalid network');
    fields(value.network,['nodes','edges','legend'],'Network');
    const {nodes, edges} = value.network;
    if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length!==NOVA_SYNTHETIC_CONTEXT.network.nodes.length || edges.length!==NOVA_SYNTHETIC_CONTEXT.network.edges.length) throw new Error('Analysis invariant: topology changed');
    const seenNodes = new Set<string>();
    for (const node of nodes) {
      if(!object(node)) throw new Error('Invalid node');
      fields(node,['id','label','x','y','color'],'Node');
      if(typeof node.id!=='string' || !NOVA_SYNTHETIC_CONTEXT.network.nodes.some(n=>n.id===node.id) || seenNodes.has(node.id)) throw new Error('Analysis invariant: node identity changed');
      if(!text(node.label,160) || !finite(node.x) || !finite(node.y) || !color(node.color)) throw new Error('Invalid node presentation');
      seenNodes.add(node.id);
    }
    const seenEdges = new Set<string>();
    for (const edge of edges) {
      if(!object(edge)) throw new Error('Invalid edge');
      fields(edge,['source','target','weight','color','group'],'Edge');
      const original = NOVA_SYNTHETIC_CONTEXT.network.edges.find(e=>e.source===edge.source&&e.target===edge.target&&e.group===edge.group);
      const key = `${edge.group}:${edge.source}:${edge.target}`;
      if(!original || edge.weight!==original.weight || seenEdges.has(key)) throw new Error('Analysis invariant: edge/weight changed');
      if(!color(edge.color)) throw new Error('Invalid edge color');
      seenEdges.add(key);
    }
    if(value.network.legend!==undefined){
      const legend=value.network.legend;
      if(!Array.isArray(legend)||legend.length!==2)throw new Error('Analysis invariant: legend groups changed');
      const labels=new Set<string>();
      for(const item of legend){
        if(!object(item))throw new Error('Invalid legend');
        fields(item,['label','color'],'Legend');
        if(typeof item.label!=='string'||!['Group A','Group B'].includes(item.label)||labels.has(item.label))throw new Error('Analysis invariant: legend groups changed');
        if(!color(item.color))throw new Error('Invalid legend color');
        labels.add(item.label);
      }
    }
  }
  if(value.table!==undefined) {
    if(!object(value.table)) throw new Error('Invalid table');
    fields(value.table,['columns','rows'],'Table');
    const {columns,rows}=value.table;
    if(JSON.stringify(columns)!==JSON.stringify(NOVA_SYNTHETIC_CONTEXT.table.columns) || !Array.isArray(rows) || JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())!==JSON.stringify(NOVA_SYNTHETIC_CONTEXT.table.rows.map(r=>JSON.stringify(r)).sort())) throw new Error('Analysis invariant: table values changed');
  }
  if(value.exports.includes('svg') && value.network===undefined) throw new Error('SVG export requires network');
  if(value.exports.includes('csv') && value.table===undefined) throw new Error('CSV export requires table');
  return structuredClone(value) as unknown as NovaPluginOutput;
}
