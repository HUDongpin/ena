import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = await readFile("tests/open-ena-model-v3-workspace-browser.mjs", "utf8");
const baseEntry = fixture.split("const entry = `")[1].split("`;\nconst bundle")[0]
  .replace("unit:'001'", "unit:'学生甲'").replace("group:'Control'", "group:'甲組'");
const browser = await chromium.launch({ headless: true });
const receipts = [];
try {
  for (const locale of ["en", "zh-hans", "zh-hant"]) {
    const entry = baseEntry.replace("locale='en'", `locale='${locale}'`)
      + `\nimport {getOpenEnaCopy} from './lib/open-ena-i18n';window.testCopy=getOpenEnaCopy('${locale}').modelV3.workspace;`;
    const bundle = await build({ stdin: {contents:entry,loader:"tsx",resolveDir:process.cwd()},
      bundle:true,format:"iife",platform:"browser",jsx:"automatic",write:false,logLevel:"silent" });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.route("**/*", route => route.fulfill({contentType:"text/html",body:'<!doctype html><div id="root"></div>'}));
    await page.goto("http://localhost:32156/");
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const copy = await page.evaluate(() => ({data:window.testCopy.data,stats:window.testCopy.stats}));
    await page.locator(".ena-rail-modes button").nth(1).click();
    await page.getByTestId("open-ena-run-model").click();
    await page.waitForFunction(() => window.jobs.length === 1);
    await page.evaluate(() => window.resolveRun(0));
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
    await page.locator(".ena-rail-modes button").nth(3).click();
    await page.locator("summary").filter({hasText:copy.stats.localDataView}).click();
    const generatedWait = page.waitForEvent("download");
    await page.getByRole("button", {name:copy.stats.exportDataView,exact:false}).first().click();
    const generated = await generatedWait;
    const generatedBytes = await readFile(await generated.path());
    assert.equal(generated.suggestedFilename(),"bound-data-view.csv");
    assert.deepEqual([...generatedBytes.subarray(0,3)],[0xef,0xbb,0xbf]);
    assert.notDeepEqual([...generatedBytes.subarray(3,6)],[0xef,0xbb,0xbf]);
    assert.ok(generatedBytes.toString("utf8").includes("学生甲"));
    assert.ok(generatedBytes.toString("utf8").includes("甲組"));

    await page.locator(".ena-rail-modes button").nth(0).click();
    const sourceText = '单元,A\r\n"学生甲,一",1\r\n学生乙,2\r\n';
    await page.locator('input[accept^=".csv,.xlsx"]').setInputFiles({name:"原始数据.csv",mimeType:"text/csv",buffer:Buffer.from(sourceText)});
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("combobox").nth(1).selectOption("number");
    await dialog.getByRole("button",{name:copy.data.confirmPreparation,exact:true}).click();
    await dialog.waitFor({state:"detached"});
    await page.locator(".ena-rail-modes button").nth(0).click();
    const originalWait = page.waitForEvent("download");
    await page.getByRole("button",{name:copy.data.downloadOriginal,exact:true}).click();
    const original = await originalWait;
    assert.equal(original.suggestedFilename(),"原始数据.csv");
    assert.deepEqual(await readFile(await original.path()),Buffer.from(sourceText),
      "original CSV text must retain its CRLF, quoting, and lack of BOM");
    assert.deepEqual(errors,[]);
    receipts.push({locale,generatedFilename:generated.suggestedFilename(),generatedBom:true,chineseLabelsPreserved:true,originalUnchanged:true,status:"pass"});
    await page.close();
  }
  await mkdir("output/review-regressions/csv-download",{recursive:true});
  await writeFile("output/review-regressions/csv-download/receipt.json",JSON.stringify({status:"pass",synthetic:true,cases:receipts},null,2));
  console.log("Three locale workspace downloads preserve Chinese CSV labels and original source text.");
} finally { await browser.close(); }
