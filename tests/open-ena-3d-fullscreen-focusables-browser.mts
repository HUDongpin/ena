import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { fallbackFullscreenFocusables } from "../components/open-ena/OpenEnaInteractive3DPlot";
import { nextOpenEnaFallbackFullscreenFocusV3 } from "../lib/open-ena/longitudinal-v3-display";

const directory=resolve(process.argv[2]??"output/review-regressions/3d-fullscreen-focusables");
await mkdir(directory,{recursive:true});
const report:{status:string;checks:Record<string,unknown>;error?:string;browserClosed?:boolean}={status:"running",checks:{}};
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.route("**/*",route=>route.abort());
  await page.setContent(`<main id="shell">
    <div id="plot" tabindex="0">Plot</div><button id="zoom">Zoom</button><button id="exit">Exit fullscreen</button>
    <details id="labels"><summary id="label-summary">Full label details</summary>
      <button id="label-entry">TP1</button>
      <details open><summary id="nested-summary">Nested details</summary><button id="nested-entry">TP2</button></details>
    </details>
    <details open><summary id="open-summary">Other details</summary><button id="open-entry">Visible entry</button></details>
    <div hidden><button id="hidden-entry">Hidden ancestor</button></div>
    <div inert><button id="inert-entry">Inert ancestor</button></div>
    <div aria-hidden="true"><button id="aria-hidden-entry">Hidden from accessibility tree</button></div>
    <div style="visibility:hidden"><button id="invisible-entry">CSS hidden</button></div>
    <div style="opacity:0"><button id="transparent-entry">Transparent ancestor</button></div>
    <div style="content-visibility:hidden"><button id="content-hidden-entry">Hidden contents</button></div>
    <button id="negative-tabindex" tabindex="-1">Not in tab order</button>
    <fieldset disabled><button id="disabled-entry">Disabled by fieldset</button></fieldset>
  </main>`);
  await page.evaluate(({collector,advance})=>{
    const w=window as any;w.__name=(value:unknown)=>value;
    // Execute the exact exported application collector and navigation helper,
    // not a test copy of their DOM filtering or wraparound rules.
    w.collect=Function(`return (${collector})`)();
    w.advance=Function(`return (${advance})`)();
    document.addEventListener("keydown",event=>{
      if(event.key!=="Tab")return;
      const next=w.advance(w.collect(document.getElementById("shell")),document.activeElement,event.shiftKey);
      if(next){event.preventDefault();next.focus();}
    });
  },{collector:fallbackFullscreenFocusables.toString(),advance:nextOpenEnaFallbackFullscreenFocusV3.toString()});
  const collect=()=>page.evaluate(()=>((window as any).collect(document.getElementById("shell")) as HTMLElement[]).map(element=>element.id));
  const active=()=>page.evaluate(()=>document.activeElement?.id);
  const expected=["plot","zoom","exit","label-summary","open-summary","open-entry"];
  report.checks.nativeVisibility=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>("#shell button, #shell summary")).map(element=>({id:element.id,rects:element.getClientRects().length,visible:element.checkVisibility({visibilityProperty:true,opacityProperty:true})})));
  report.checks.closedDetails=await collect();
  assert.deepEqual(report.checks.closedDetails,expected,"only visible summary controls belong in the closed-details focus ring");
  await page.locator("#exit").focus();await page.keyboard.press("Tab");
  assert.equal(await active(),"label-summary","Tab must leave Exit and reach the visible details summary");
  await page.keyboard.press("Shift+Tab");assert.equal(await active(),"exit");
  await page.locator("#plot").focus();
  const cycle:string[]=[];
  for(let index=0;index<expected.length;index++){cycle.push((await active())!);await page.keyboard.press("Tab");}
  assert.deepEqual(cycle,expected);assert.equal(await active(),"plot");
  await page.keyboard.press("Shift+Tab");assert.equal(await active(),"open-entry");
  report.checks.keyboardCycle=cycle;
  await page.locator("#label-summary").focus();await page.keyboard.press("Enter");
  const openExpected=["plot","zoom","exit","label-summary","label-entry","nested-summary","nested-entry","open-summary","open-entry"];
  report.checks.openDetails=await collect();assert.deepEqual(report.checks.openDetails,openExpected);
  await page.keyboard.press("Tab");assert.equal(await active(),"label-entry","opened details entries become keyboard reachable");
  await page.locator("#label-summary").focus();await page.keyboard.press("Enter");
  report.checks.closedAgain=await collect();assert.deepEqual(report.checks.closedAgain,expected);
  report.checks.withoutCheckVisibility=await page.evaluate(()=>{
    const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,"checkVisibility");
    Object.defineProperty(Element.prototype,"checkVisibility",{configurable:true,value:undefined});
    try{return (window as any).collect(document.getElementById("shell")).map((element:HTMLElement)=>element.id);}
    finally{if(descriptor)Object.defineProperty(Element.prototype,"checkVisibility",descriptor);else delete (Element.prototype as any).checkVisibility;}
  });
  assert.deepEqual(report.checks.withoutCheckVisibility,expected,"the closed-details and hidden-ancestor fallback must work without checkVisibility");
  report.status="pass";
} catch(error) {
  report.status="fail";report.error=error instanceof Error?error.stack:String(error);throw error;
} finally {
  await browser.close();report.browserClosed=true;
  await writeFile(resolve(directory,"report.json"),JSON.stringify(report,null,2)+"\n");
}
console.log("PASS native fallback fullscreen focus ring: closed/open details, hidden ancestors, forward/backward Tab and visibility fallback");
