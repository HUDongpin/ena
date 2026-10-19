// Native pinned Plotly canvas oracle, not an HTML escaping implementation test.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { literalLabelCases,literalLabelFixture,literalOnaFixture,visibleGlLabelForTest } from "./helpers/open-ena-literal-label-fixture.ts";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d.ts";
import { compileOpenEnaOrdered3dPlotSpec } from "../lib/open-ena/ordered-plot3d.ts";
const require=createRequire(path.join(process.cwd(),"package.json"));
const engineName=process.argv[3]??"chromium";
const engine=require("playwright")[engineName];
const directory=path.resolve(process.argv[2]??"../native-browser"); await mkdir(directory,{recursive:true});
const reports:any[]=[]; const errors:string[]=[]; const blocked:string[]=[];
const browser=await engine.launch({headless:true,...(engineName==="chromium"?{args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]}:{})});
const page=await browser.newPage({viewport:{width:1000,height:760}});
page.on("pageerror",(error:Error)=>errors.push(error.message));
await page.route("**/*",async(route:any)=>{
  if(route.request().url()==="http://localhost:32555/") return route.fulfill({contentType:"text/html",body:'<div id="plot" style="width:960px;height:700px"></div>'});
  blocked.push(route.request().url()); return route.abort();
});
const plotlySource=await readFile(require.resolve("plotly.js-gl3d-dist-min"),"utf8");
async function freshPlotlyPage() {
  // Reset the pinned vectorizer's text cache so every family/role produces
  // observable native raster calls rather than reusing another trace's glyphs.
  await page.goto("http://localhost:32555/");
  await page.evaluate(()=>{
    const w=window as any; w.__fills=[]; w.__name=(value:unknown)=>value;
    const fill=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){
      w.__fills.push({text:String(text),font:this.font});
      return fill.call(this,text,...args as [number,number]);
    };
  });
  await page.addScriptTag({content:plotlySource});
}
try {
  for(const label of literalLabelCases){
    const {props}=await literalLabelFixture(label);
    const before=JSON.stringify(props);
    const spec=compileOpenEna3dPlotSpec(props);
    assert.equal(JSON.stringify(props),before,"compiler must preserve bound source and presentation labels");
    const code=spec.data.find(row=>row.meta.role==="code-label")!;
    const unit=spec.data.find(row=>row.meta.role==="unit-points")!;
    const centroid=spec.data.find(row=>row.name==="Observed Group centroid")!;
    const ona=await literalOnaFixture(label);const onaSpec=compileOpenEnaOrdered3dPlotSpec(ona.props);
    const onaCode=onaSpec.data.find(row=>row.meta.role==="code-label")!;
    const onaUnit=onaSpec.data.find(row=>row.meta.role==="unit-points")!;
    const expectations=[
      {role:"code-label",trace:code,index:code.ids!.findIndex(id=>props.codeLabelByRenderedCode[id]===label),expected:label},
      {role:"unit-points",trace:unit,index:0,expected:String(props.result.set.points[0].ENA_UNIT)},
      {role:"centroid",trace:centroid,index:0,expected:`${props.result.trajectoryPresentation.centroids[0].horizon} · n=${props.result.trajectoryPresentation.centroids[0].n}`},
      {role:"ona-code-label",trace:onaCode,index:onaCode.ids!.findIndex(id=>ona.props.codeLabelByRenderedCode[id]===label),expected:label},
      {role:"ona-unit-points",trace:onaUnit,index:0,expected:String(ona.props.result.set.points[0].ENA_UNIT)},
    ];
    for(const {role,trace,index,expected} of expectations){
      await freshPlotlyPage();
      assert.ok(index>=0,"fixture must retain the requested source Code");
      // Isolate the compiler's real label at the centre, preserving its text/hover/identity.
      const one={...trace,x:[0],y:[0],z:[0],ids:trace.ids?.slice(index,index+1),text:trace.text?.slice(index,index+1),customdata:trace.customdata?.slice(index,index+1),textfont:{...trace.textfont,size:20}};
      await page.evaluate(async({one,layout}:any)=>{
        const w=window as any; w.__fills=[]; w.__hover=null;
        w.Plotly.purge("plot");
        await w.Plotly.newPlot("plot",[one],{...layout,width:960,height:700,scene:{...layout.scene,xaxis:{range:[-1,1]},yaxis:{range:[-1,1]},zaxis:{range:[-1,1]}}},{displayModeBar:false});
        (document.getElementById("plot") as any).on("plotly_hover",(event:any)=>{w.__hover={id:event.points[0].id,text:event.points[0].text,customdata:event.points[0].customdata};});
      },{one,layout:spec.layout});
      // Canvas hook forwards unchanged arguments to native drawing. The solely
      // display-local zero-width separator is ignored for visible character comparison.
      const raster:any[]=await page.evaluate(()=>(window as any).__fills);
      const matches=raster.filter(row=>visibleGlLabelForTest(row.text,`${expected}\n`)===`${expected}\n`);
      const fonts=matches.map(row=>row.font);
      const canvas=await page.evaluate(({expected,guarded}:{expected:string;guarded:string})=>{
        const draw=(text:string)=>{const canvas=document.createElement("canvas");canvas.width=4096;canvas.height=256;const ctx=canvas.getContext("2d")!;ctx.font='64px "Helvetica Neue", Helvetica, Arial, sans-serif';ctx.fillText(text,8,128);return {width:ctx.measureText(text).width,pixels:ctx.getImageData(0,0,4096,256).data};};
        const raw=draw(expected),safe=draw(guarded);let differentPixels=0;for(let i=0;i<raw.pixels.length;i++)if(raw.pixels[i]!==safe.pixels[i])differentPixels++;
        return {rawWidth:raw.width,guardedWidth:safe.width,differentPixels};
      },{expected,guarded:one.text![0]});
      // Chromium may round zero-width shaping by ~0.000061 px. Require less
      // than 1/1024 px width drift and exact pixel equality in every engine.
      const passed=matches.length>0 && fonts.every(font=>!/^bold |^italic /u.test(font)) && Math.abs(canvas.rawWidth-canvas.guardedWidth)<=1/1024 && canvas.differentPixels===0;
      let hover:any=null;
      for(let y=295;y<=365;y+=5) {
        await page.mouse.move(488,y);await page.waitForTimeout(35);
        const current=await page.evaluate(()=>({event:(window as any).__hover,dom:Array.from(document.querySelectorAll(".hoverlayer")).map(node=>node.textContent).join(""),html:Array.from(document.querySelectorAll(".hoverlayer")).map(node=>node.innerHTML).join("")}));
        if(current.event)hover=current;
        if(current.dom) {hover=current;break;}
      }
      const png=`label-${reports.length+1}-${role}.png`;
      await page.screenshot({path:path.join(directory,png)});
      if(role==="code-label" && label===literalLabelCases[0]) {
        const dataUrl=await page.evaluate(async()=>await (window as any).Plotly.toImage("plot",{format:"png",width:960,height:700}));
        await writeFile(path.join(directory,"plotly-export.png"),Buffer.from(dataUrl.split(",")[1],"base64"));
      }
      reports.push({label,role,expected,compilerText:one.text,passed,raster,canvas,hover,png});
    }
  }
} finally {
  await browser.close();
  const files=["lib/open-ena/plot3d.ts","lib/open-ena/ordered-plot3d.ts","tests/helpers/open-ena-literal-label-fixture.ts","tests/review-plot-literal-browser.mts","node_modules/plotly.js-gl3d-dist-min/plotly-gl3d.min.js"];
  const source=await Promise.all(files.map(async file=>({path:file,sha256:createHash("sha256").update(await readFile(file)).digest("hex")})));
  await writeFile(path.join(directory,"report.json"),JSON.stringify({engine:engineName,passed:reports.filter(row=>row.passed).length,failed:reports.filter(row=>!row.passed).length,reports,errors,blocked,source,browserClosed:true,syntheticOnly:true},null,2));
}
assert.deepEqual(errors,[]); assert.deepEqual(blocked,[]);
assert.equal(reports.filter(row=>!row.passed).length,0,"native Plotly canvas must preserve all literal Code, Unit and Horizon label characters");
console.log(`PASS ${reports.length} native GL literal label renders`);
