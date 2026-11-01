import { validateNovaOutput } from "./sdk";
import type { NovaPluginOutput } from "./types";

const PREVIEW_STYLE = `
*{box-sizing:border-box}body{margin:0;padding:20px;color:#172138;background:#fff;font:14px "Anthropic Sans",system-ui,sans-serif}header{display:flex;align-items:center;justify-content:space-between;gap:12px}h1{font-size:18px;line-height:1.3;margin:0}header span{font-size:11px;white-space:nowrap;padding:5px 8px;background:#edf8fd;border-radius:6px;color:#31536c}p{color:#526071;line-height:1.5}#network{border:1px solid #e5eaf0;border-radius:8px;overflow:hidden;margin-top:16px}svg{display:block;width:100%;height:auto;min-height:240px}.legend{display:flex;justify-content:center;flex-wrap:wrap;gap:18px;margin:12px 0}.legend span{display:flex;align-items:center;gap:6px}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%}.controls{display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin-top:18px;font-size:12px}.controls label{display:flex;align-items:center;gap:6px}input{accent-color:#1f6f9e}input[type=range]{width:90px}button{border:1px solid #acd9ee;border-radius:6px;background:#edf8fd;color:#172138;padding:8px 12px;font:inherit;cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #1f6f9e;outline-offset:3px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px}th,td{padding:8px;text-align:left;border-bottom:1px solid #e5eaf0}th{background:#edf8fd}.table-wrap{overflow:auto}footer{font-size:11px;color:#526071;margin-top:20px}#notice{min-height:1.5em;font-size:12px}@media(max-width:400px){body{padding:12px}header{align-items:flex-start;flex-direction:column}}`;

// This program is authored by the application. No generated source is interpolated here.
const PREVIEW_PROGRAM = `
"use strict";
const payload=JSON.parse(document.getElementById("nova-data").textContent);
const data=payload.output;
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node};
document.getElementById("title").textContent=data.title;
if(data.description)document.getElementById("description").textContent=data.description;
const svgNS="http://www.w3.org/2000/svg";
const makeSvg=(tag,attributes)=>{const node=document.createElementNS(svgNS,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));return node};
let plot=null;
let labels=true;
let scale=1;
function drawNetwork(){
 if(!data.network)return;
 const nodes=data.network.nodes;
 const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
 const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const point=n=>({x:xmax===xmin?280:65+(n.x-xmin)/(xmax-xmin)*430,y:ymax===ymin?190:55+(ymax-n.y)/(ymax-ymin)*270});
 const svg=makeSvg("svg",{xmlns:svgNS,viewBox:"0 0 560 380",role:"img","aria-label":data.title});
 const title=makeSvg("title",{});title.textContent=data.title;svg.append(title);
 const groups=[...new Set(data.network.edges.map(e=>e.group||""))];
 for(const edge of data.network.edges){
  const a=point(nodes.find(n=>n.id===edge.source)),b=point(nodes.find(n=>n.id===edge.target));
  const len=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const offset=(groups.indexOf(edge.group||"")-(groups.length-1)/2)*4;
  const dx=-(b.y-a.y)/len*offset,dy=(b.x-a.x)/len*offset;
  const line=makeSvg("line",{x1:a.x+dx,y1:a.y+dy,x2:b.x+dx,y2:b.y+dy,stroke:edge.color,"stroke-width":Math.max(.7,edge.weight*9*scale),"stroke-opacity":.72});
  const tip=makeSvg("title",{});tip.textContent=(edge.group?edge.group+": ":"")+edge.source+" → "+edge.target+" · "+edge.weight;line.append(tip);svg.append(line);
 }
 for(const node of nodes){const p=point(node);svg.append(makeSvg("circle",{cx:p.x,cy:p.y,r:10,fill:node.color,stroke:"#fff","stroke-width":2}));if(labels){const label=makeSvg("text",{x:p.x,y:p.y+(p.y<190?-20:25),"text-anchor":"middle",fill:"#172138","font-family":"system-ui,sans-serif","font-size":12});label.textContent=node.label;svg.append(label)}}
 plot=svg;document.getElementById("network").replaceChildren(svg);
}
if(data.network){
 drawNetwork();
 for(const item of data.network.legend||[]){const entry=el("span"),dot=el("i");dot.style.backgroundColor=item.color;entry.append(dot,document.createTextNode(item.label));document.getElementById("legend").append(entry)}
 const toggle=el("input");toggle.type="checkbox";toggle.checked=true;toggle.addEventListener("change",()=>{labels=toggle.checked;drawNetwork()});const toggleLabel=el("label");toggleLabel.append(toggle,document.createTextNode("Show labels"));document.getElementById("controls").append(toggleLabel);
 const slider=el("input");slider.type="range";slider.min="0.25";slider.max="2";slider.step="0.05";slider.value="1";slider.addEventListener("input",()=>{scale=Number(slider.value);drawNetwork()});const sliderLabel=el("label");sliderLabel.append(document.createTextNode("Edge width"),slider);document.getElementById("controls").append(sliderLabel);
}else document.getElementById("network").remove();
if(data.table){const table=el("table"),head=el("thead"),tr=el("tr");for(const column of data.table.columns){const th=el("th",column);th.scope="col";tr.append(th)}head.append(tr);table.append(head);const body=el("tbody");for(const values of data.table.rows){const row=el("tr");for(const value of values)row.append(el("td",value===null?"":String(value)));body.append(row)}table.append(body);document.getElementById("table").append(table)}
function csvCell(value){let text=value===null?"":String(value);if(/^[=+@\\-\\t\\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
for(const format of data.exports){const button=el("button","Export "+format.toUpperCase());button.type="button";button.addEventListener("click",()=>{let content;if(format==="svg")content=new XMLSerializer().serializeToString(plot);else if(format==="csv")content=[data.table.columns,...data.table.rows].map(row=>row.map(csvCell).join(",")).join("\\r\\n");else content=JSON.stringify(data,null,2);parent.postMessage({type:"nova:export",nonce:payload.nonce,format,filename:"nova-plugin."+format,content},"*");document.getElementById("notice").textContent="Export prepared."});document.getElementById("controls").append(button)}
`;

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function buildNovaPreviewDocument(output: NovaPluginOutput, nonce: string): string {
  if (!/^[A-Za-z0-9_-]{16,80}$/u.test(nonce)) throw new TypeError("Invalid preview nonce.");
  const validated = validateNovaOutput(output);
  const csp = `default-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; font-src 'none'; object-src 'none'; frame-src 'none'`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Nova sandbox preview</title><style nonce="${nonce}">${PREVIEW_STYLE}</style></head><body><header><h1 id="title"></h1><span>Synthetic sample</span></header><p id="description"></p><div id="network"></div><div id="legend" class="legend"></div><div id="table" class="table-wrap"></div><div id="controls" class="controls"></div><p id="notice" role="status"></p><footer>Private sandbox preview · Display only · Awaiting review</footer><script nonce="${nonce}" type="application/json" id="nova-data">${safeJson({ output: validated, nonce })}</script><script nonce="${nonce}">${PREVIEW_PROGRAM}</script></body></html>`;
}

/** Caller must additionally verify MessageEvent.source === iframe.contentWindow and origin === "null". */
export function parseNovaPreviewExport(value: unknown, expectedNonce: string): { filename: string; content: string; mime: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (Object.keys(message).some(key => !["type", "nonce", "format", "filename", "content"].includes(key))
    || message.type !== "nova:export" || message.nonce !== expectedNonce || !/^[A-Za-z0-9_-]{16,80}$/u.test(expectedNonce)
    || typeof message.content !== "string" || new TextEncoder().encode(message.content).byteLength > 2_000_000
    || !["svg", "csv", "json"].includes(String(message.format))
    || message.filename !== `nova-plugin.${message.format}`) return null;
  if (message.format === "svg" && (!/^<svg[\s>]/u.test(message.content) || /<(?:script|foreignObject|iframe|image|use|style|a|animate|set)\b|\son[a-z]+\s*=|(?:href|src)\s*=|url\s*\(/iu.test(message.content))) return null;
  if (message.format === "json") { try { validateNovaOutput(JSON.parse(message.content)); } catch { return null; } }
  return { filename: message.filename, content: message.content, mime: message.format === "svg" ? "image/svg+xml" : message.format === "csv" ? "text/csv;charset=utf-8" : "application/json" };
}
