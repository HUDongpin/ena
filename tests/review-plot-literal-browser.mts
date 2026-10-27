// Native pinned Plotly renderer oracles: trajectory SVG annotations and ONA GL
// text. Compare actual characters/pixels, never an escaping implementation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { literalLabelCases,literalLabelFixture,literalOnaFixture,visibleGlLabelForTest } from "./helpers/open-ena-literal-label-fixture.ts";
import { compileOpenEna3dPlotSpec, type OpenEna3dSceneAnnotation, type OpenEna3dTrace } from "../lib/open-ena/plot3d.ts";
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
type LiteralExpectation =
  | {renderer:"annotation";role:string;annotation:OpenEna3dSceneAnnotation;expected:string;description:string}
  | {renderer:"gl";role:string;trace:OpenEna3dTrace;index:number;expected:string};
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
    const ona=await literalOnaFixture(label);const onaSpec=compileOpenEnaOrdered3dPlotSpec(ona.props);
    const onaCode=onaSpec.data.find(row=>row.meta.role==="code-label")!;
    const onaUnit=onaSpec.data.find(row=>row.meta.role==="unit-points")!;
    const annotationExpectation=(role:"code"|"unit"|"centroid",expected:string):LiteralExpectation=>{
      const metadata=spec.trajectoryLabelAnnotations?.find(item=>item.role===role && item.text===expected);
      assert.ok(metadata,"fixture must retain the requested native annotation identity");
      const annotation=spec.layout.scene.annotations?.[metadata.annotationIndex];
      assert.ok(annotation);
      assert.equal(annotation.name,metadata.id);
      return {renderer:"annotation",role,annotation,expected,description:metadata.description};
    };
    const expectations:LiteralExpectation[]=[
      annotationExpectation("code",label),
      annotationExpectation("unit",String(props.result.set.points[0].ENA_UNIT)),
      annotationExpectation("centroid",props.result.trajectoryPresentation.centroids[0].horizonShortLabel),
      {renderer:"gl",role:"ona-code-label",trace:onaCode,index:onaCode.ids!.findIndex(id=>ona.props.codeLabelByRenderedCode[id]===label),expected:label},
      {renderer:"gl",role:"ona-unit-points",trace:onaUnit,index:0,expected:String(ona.props.result.set.points[0].ENA_UNIT)},
    ];
    for(const expectation of expectations){
      await freshPlotlyPage();
      const {role,expected}=expectation;
      if(expectation.renderer==="annotation") {
        // Isolate the compiler's actual annotation at the centre. Only geometry,
        // font size and the measured-visible state change; text/hover/name stay exact.
        const one={...expectation.annotation,x:0,y:0,z:0,ax:0,ay:0,opacity:1,captureevents:true,font:{...expectation.annotation.font,size:20}};
        await page.evaluate(async({one,layout}:any)=>{
          const w=window as any;
          await w.Plotly.newPlot("plot",[{type:"scatter3d",mode:"markers",x:[0],y:[0],z:[0],marker:{size:1,opacity:0},hoverinfo:"skip"}],
            {...layout,width:960,height:700,scene:{...layout.scene,annotations:[one],xaxis:{range:[-1,1]},yaxis:{range:[-1,1]},zaxis:{range:[-1,1]}}},{displayModeBar:false});
        },{one,layout:spec.layout});
        const rendered=await page.evaluate(()=>{
          const text=document.querySelector<SVGTextElement>("#plot .annotation-scene .annotation-text")!;
          const styles=[text,...text.querySelectorAll("tspan")].map(node=>{const css=getComputedStyle(node);return {weight:css.fontWeight,style:css.fontStyle};});
          const box=text.getBoundingClientRect();
          return {text:text.textContent,styles,lineCount:text.querySelectorAll("tspan.line").length,width:box.width,height:box.height};
        });
        await page.locator("#plot .annotation-scene .annotation-text").hover();
        await page.waitForFunction(()=>Boolean(document.querySelector("#plot .hoverlayer")?.textContent));
        const hover=await page.locator("#plot .hoverlayer").textContent();
        const exported=await page.evaluate(async()=>{
          const dataUrl=await (window as any).Plotly.toImage("plot",{format:"svg",width:960,height:700,scale:1});
          const comma=dataUrl.indexOf(","),svg=decodeURIComponent(dataUrl.slice(comma+1));
          const document=new DOMParser().parseFromString(svg,"image/svg+xml");
          return {svg,text:Array.from(document.querySelectorAll(".annotation-scene .annotation-text")).map(node=>node.textContent),parserError:Boolean(document.querySelector("parsererror"))};
        });
        const passed=rendered.text===expected && rendered.width>0 && rendered.height>0 && rendered.lineCount<=1
          && rendered.styles.every((style:{weight:string;style:string})=>["normal","400"].includes(style.weight)&&style.style==="normal")
          && hover===expectation.description && !exported.parserError && exported.text.length===1 && exported.text[0]===expected;
        const png=`label-${reports.length+1}-${role}.png`;await page.screenshot({path:path.join(directory,png)});
        if(label===literalLabelCases[0] && (role==="code" || role==="centroid")) {
          const dataUrl=await page.evaluate(async()=>await (window as any).Plotly.toImage("plot",{format:"png",width:960,height:700,scale:1}));
          const bytes=Buffer.from(dataUrl.split(",")[1],"base64");
          assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(bytes.length>1000);
          const basename=role==="code"?"plotly-export":"plotly-horizon-export";
          await writeFile(path.join(directory,`${basename}.png`),bytes);
          await writeFile(path.join(directory,`${basename}.svg`),exported.svg);
        }
        reports.push({label,role,renderer:expectation.renderer,expected,compilerText:one.text,passed,rendered,hover,expectedHover:expectation.description,exportedText:exported.text,png});
        continue;
      }
      const {trace,index}=expectation;
      assert.ok(index>=0,"fixture must retain the requested source Code");
      // Isolate the compiler's real label at the centre, preserving its text/hover/identity.
      const one={...trace,x:[0],y:[0],z:[0],ids:trace.ids?.slice(index,index+1),text:trace.text?.slice(index,index+1),customdata:trace.customdata?.slice(index,index+1),textfont:{...trace.textfont,size:20}};
      await page.evaluate(async({one,layout}:any)=>{
        const w=window as any; w.__fills=[]; w.__hover=null;
        w.Plotly.purge("plot");
        await w.Plotly.newPlot("plot",[one],{...layout,width:960,height:700,scene:{...layout.scene,annotations:[],xaxis:{range:[-1,1]},yaxis:{range:[-1,1]},zaxis:{range:[-1,1]}}},{displayModeBar:false});
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
      reports.push({label,role,renderer:expectation.renderer,expected,compilerText:one.text,passed,raster,canvas,hover,png});
    }
  }
} finally {
  await browser.close();
  const files=["lib/open-ena/plot3d.ts","lib/open-ena/ordered-plot3d.ts","tests/helpers/open-ena-literal-label-fixture.ts","tests/review-plot-literal-browser.mts","node_modules/plotly.js-gl3d-dist-min/plotly-gl3d.min.js"];
  const source=await Promise.all(files.map(async file=>({path:file,sha256:createHash("sha256").update(await readFile(file)).digest("hex")})));
  await writeFile(path.join(directory,"report.json"),JSON.stringify({engine:engineName,passed:reports.filter(row=>row.passed).length,failed:reports.filter(row=>!row.passed).length,reports,errors,blocked,source,browserClosed:true,syntheticOnly:true},null,2));
}
assert.deepEqual(errors,[]); assert.deepEqual(blocked,[]);
assert.equal(reports.filter(row=>!row.passed).length,0,"native Plotly annotations, SVG exports and GL text must preserve all literal Code, Unit and Horizon label characters");
console.log(`PASS ${reports.length} native literal label renders (${reports.filter(row=>row.renderer==="annotation").length} SVG annotations, ${reports.filter(row=>row.renderer==="gl").length} GL text)`);
