// Synthetic bound Group labels through actual native Plotly SVG legends.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {literalGroupFixture} from "./helpers/open-ena-literal-group-fixture.ts";
const require=createRequire(path.join(process.cwd(),"package.json"));
const engineName=process.argv[3]??"chromium";const engine=require("playwright")[engineName];
const directory=path.resolve(process.argv[2]??"../native-legend");await mkdir(directory,{recursive:true});
const browser=await engine.launch({headless:true,...(engineName==="chromium"?{args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]}:{})});
const page=await browser.newPage({viewport:{width:1000,height:800}});
const errors:string[]=[];const blocked:string[]=[];const reports:any[]=[];
page.on("pageerror",(error:Error)=>errors.push(error.message));
await page.route("**/*",async(route:any)=>{if(route.request().url()==="http://localhost:32556/")return route.fulfill({contentType:"text/html",body:'<div id="plot" style="width:960px;height:740px"></div>'});blocked.push(route.request().url());return route.abort();});
try{
  await page.goto("http://localhost:32556/");
  await page.addScriptTag({content:await readFile(require.resolve("plotly.js-gl3d-dist-min"),"utf8")});
  for(const groupLabel of ["<b>G</b>","A<br>B","A&amp;B","Plain 中文 &literal group"]){
    const {standardSpec,meanSpec,onaSpec}=await literalGroupFixture(groupLabel);
    for(const [kind,spec] of [["standard-units",standardSpec],["standard-mean",meanSpec],["ona-units",onaSpec]] as const){
      const trace=spec.data.find(row=>row.showlegend)!;assert.ok(trace);
      // Scientific grouping identity is the expected raw label; name is a rendered legend field.
      const expected=kind==="ona-units"?`1. ${trace.meta.groupName} units · ${trace.meta.pointStyle}`:kind==="standard-mean"?`${trace.meta.groupName} mean · square`:`${trace.meta.groupName} units · circle`;
      await page.evaluate(async({spec}:any)=>{await (window as any).Plotly.react("plot",spec.data,{...spec.layout,width:960,height:740,legend:{...spec.layout.legend,y:0.02}},{displayModeBar:false});},{spec});
      const legend=await page.locator(".legendtext").allTextContents();
      const rawIdentities=await page.evaluate(()=>(document.getElementById("plot") as any).data.filter((row:any)=>row.showlegend).map((row:any)=>({meta:row.meta,legendgroup:row.legendgroup,name:row.name})));
      const passed=legend.length===1 && legend[0]===expected;
      const png=`legend-${reports.length+1}.png`;await page.screenshot({path:path.join(directory,png)});
      // Actual legend pointer events retain stable grouping identity and toggle traces.
      const toggle=page.locator(".legendtoggle").first();await toggle.click();
      await page.waitForTimeout(360);
      const hidden=await page.evaluate(()=>(document.getElementById("plot") as any).data.filter((row:any)=>row.showlegend).every((row:any)=>row.visible==="legendonly"));
      await toggle.click();await page.waitForTimeout(360);
      const restored=await page.evaluate(()=>(document.getElementById("plot") as any).data.filter((row:any)=>row.showlegend).every((row:any)=>row.visible!=="legendonly"));
      assert.equal(hidden,true,"legend click should hide the intended raw group");assert.equal(restored,true,"second legend click should restore it");
      reports.push({groupLabel,kind,expected,compilerName:trace.name,legend,rawIdentities,passed,png,hidden,restored});
    }
  }
}finally{
  await browser.close();const source=await Promise.all(["lib/open-ena/plot3d.ts","lib/open-ena/ordered-plot3d.ts","tests/review-plot-legend-browser.mts","tests/helpers/open-ena-literal-group-fixture.ts"].map(async file=>({path:file,sha256:createHash("sha256").update(await readFile(file)).digest("hex")})));
  await writeFile(path.join(directory,"report.json"),JSON.stringify({engine:engineName,passed:reports.filter(row=>row.passed).length,failed:reports.filter(row=>!row.passed).length,reports,source,errors,blocked,browserClosed:true,syntheticOnly:true},null,2));
}
assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(reports.filter(row=>!row.passed).length,0,"Group legend must preserve literal source text");
console.log(`PASS ${reports.length} native Group legend labels`);
