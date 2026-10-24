import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle=await build({stdin:{loader:"tsx",resolveDir:process.cwd(),contents:`
import React from 'react'; import {createRoot} from 'react-dom/client';
import Login from './components/open-ena/OpenEnaLogin';
import {getOpenEnaCloudCopy} from './lib/open-ena/cloud-copy';
import {OPEN_ENA_CONTACT_EMAIL} from './lib/open-ena-auth-copy';
window.copy=getOpenEnaCloudCopy(window.fixture.locale); window.contact=OPEN_ENA_CONTACT_EMAIL;
createRoot(document.getElementById('root')).render(<Login {...window.fixture} notice={{kind:'none'}} configurationReady cloudEnabled />);
`},bundle:true,platform:"browser",format:"iife",jsx:"automatic",write:false,logLevel:"silent",
  define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"},
  alias:{"next/link":resolve("tests/helpers/a11y-next-link-stub.tsx"),"next/image":resolve("tests/helpers/a11y-next-image-stub.tsx")}});
const directory=resolve(process.env.ENA_FIRST_VISIT_OUTPUT??"output/ai-closeout-20261024/first-visit-browser");
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true}), cases=[];
try {
  for(const locale of ["en","zh-hans","zh-hant"]) for(const registrationAvailable of [true,false]) {
    const page=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(['/logo-open-ena.svg','/open-ena-network-hero.svg'].includes(path)) return route.fulfill({contentType:'image/svg+xml',body:await readFile(resolve('public','.'+path))});
      return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});
    });
    await page.goto(`http://localhost:31998/${locale}/open-ena`);
    await page.evaluate(fixture=>{window.fixture=fixture;},{locale,registrationAvailable});
    await page.addStyleTag({content:await readFile('app/globals.css','utf8')});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('heading',{level:1}).waitFor();
    const copy=await page.evaluate(()=>window.copy),contact=await page.evaluate(()=>window.contact);
    assert.equal(await page.locator(`[data-ena-first-visit="${registrationAvailable?'registration':'registration-unavailable'}"]`).count(),1);
    assert.equal(await page.getByRole('link',{name:copy.register,exact:true}).count(),registrationAvailable?1:0);
    if(registrationAvailable) assert.equal(await page.getByRole('link',{name:copy.register,exact:true}).getAttribute('href'),`/${locale}/open-ena/account`);
    else assert.equal(await page.locator(`a[href="mailto:${contact}"]`).count(),1);
    assert.equal(await page.getByRole('link',{name:copy.recover,exact:true}).getAttribute('href'),`/${locale}/open-ena/account?mode=reset`);
    assert.equal(await page.locator('.open-ena-login-form').getAttribute('action'),'/api/open-ena/login');
    const text=await page.locator('.open-ena-login-panel').innerText();
    assert.ok(text.includes('ena.hk')&&text.includes('open-ena.com')&&text.includes(copy.cloudPrivacy));
    assert.doesNotMatch(text,/Registration will be available in the future|未来会开放注册|未來會開放註冊/);
    await page.locator('#open-ena-username').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'open-ena-password');
    await page.screenshot({path:resolve(directory,`${locale}-${registrationAvailable?'open':'closed'}.png`),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'narrow entry must not overflow horizontally');
    if(locale==='zh-hans'&&registrationAvailable)await page.screenshot({path:resolve(directory,'zh-hans-narrow.png'),fullPage:true});
    assert.deepEqual(errors,[]); cases.push({locale,registrationAvailable,entry:true,links:true,keyboard:true,narrow:true});await page.close();
  }
  await writeFile(resolve(directory,'receipt.json'),JSON.stringify({passed:true,syntheticBrowser:true,cases,realRegistration:false},null,2)+'\n');
  console.log('First visit: all three locales, registration open/closed, account links, keyboard and narrow layout PASS');
} finally {await browser.close();}
