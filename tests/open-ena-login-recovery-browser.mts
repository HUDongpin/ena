import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServedBrowserV3 } from './helpers/open-ena-served-browser-v3.mjs';
import { runOpenEnaLoginBrowserSmoke, createSensitiveValueRedactor } from './open-ena-login-browser-smoke.mjs';
import { getOpenEnaAuthCopy } from '../lib/open-ena-auth-copy.ts';
import { openEnaLoginPairRef, openEnaLoginSourceRef } from '../lib/server/open-ena-trusted-client-ip.ts';

const root = process.cwd();
const directory = join(root, 'output/review-regressions/login-recovery');
const credentials = { username: 'synthetic-browser-91', password: 'synthetic-browser-passphrase-91', secret: 'synthetic-browser-session-secret-91-0123456789', account: 'synthetic-browser-account-91' };
const redact = createSensitiveValueRedactor(Object.values(credentials));
const environment = { OPEN_ENA_SESSION_SECRET: credentials.secret, OPEN_ENA_ACCOUNT_ID: credentials.account };
const { Pool } = createRequire(import.meta.url)('pg');
const results: any[] = [];
let runtime: any, pool: any, failure: unknown;

async function submit(page: any, locale: string, origin = runtime.baseUrl) {
  await page.goto(origin + '/' + locale + '/open-ena');
  await page.locator('input[name="username"]').fill(credentials.username);
  await page.locator('input[name="password"]').fill(credentials.password);
  const response = page.waitForResponse((r: any) => r.url().endsWith('/api/open-ena/login') && r.request().method() === 'POST');
  await page.locator('form.open-ena-login-form button[type="submit"]').click();
  return response;
}

try {
  runtime = await createServedBrowserV3({ root, directory, credentials, redact });
  pool = new Pool({host:'127.0.0.1',port:runtime.receipt.database.port,user:'postgres',database:'postgres',max:2});
  await runOpenEnaLoginBrowserSmoke({
    OPEN_ENA_BROWSER_BASE_URL: runtime.baseUrl, OPEN_ENA_BROWSER_USERNAME: credentials.username,
    OPEN_ENA_BROWSER_PASSWORD: credentials.password, OPEN_ENA_LOGIN_BROWSER_ARTIFACTS: join(directory,'existing-smoke'),
  });
  results.push({check:'existing_login_smoke_three_viewports',passed:true});
  for (const [i, locale] of ['en','zh-hans','zh-hant'].entries()) {
    const copy=getOpenEnaAuthCopy(locale as any);
    const source='192.0.2.'+(80+i);
    const sourceRef=openEnaLoginSourceRef(source,environment)!;
    const pairRef=openEnaLoginPairRef(credentials.username,sourceRef,environment)!;
    await pool.query("INSERT INTO open_ena_login_failure_windows(scope_kind,scope_ref,window_start,failure_count) VALUES('pair',$1,clock_timestamp()-interval '14 minutes',10)",[pairRef]);
    const context=await runtime.browser.newContext({extraHTTPHeaders:{'x-ena-client-ip':source}});
    const page=await context.newPage();
    try {
      const throttle=await submit(page,locale);
      assert.equal(throttle.status(),303);
      const wait=Number(throttle.headers()['retry-after']); assert.ok(wait>0&&wait<=60);
      await page.locator('#open-ena-login-error').waitFor({state:'visible'});
      assert.equal(await page.locator('#open-ena-login-error').textContent(),copy.throttled.replace('{seconds}',String(wait)));
      assert.notEqual(await page.locator('input[name="password"]').getAttribute('aria-invalid'),'true');
      assert.ok(new URL(page.url()).searchParams.get('auth')==='throttled');
      await page.screenshot({path:join(directory,locale+'-throttled.png')});
      results.push({locale,check:'native_throttle_localized_remaining_window',status:throttle.status(),retryAfter:wait,passed:true});

      await pool.query('DELETE FROM open_ena_login_failure_windows WHERE scope_kind=$1 AND scope_ref=$2',['pair',pairRef]);
      await pool.query('ALTER FUNCTION open_ena_login_failure_guard(text,text,integer,integer,integer) RENAME TO open_ena_login_failure_guard_test_unavailable');
      try {
        const unavailable=await submit(page,locale);assert.equal(unavailable.status(),303);
        await page.locator('#open-ena-login-error').waitFor({state:'visible'});
        assert.equal(await page.locator('#open-ena-login-error').textContent(),copy.temporarilyUnavailable);
        assert.equal(await page.locator('.open-ena-login-form').count(),1);
        results.push({locale,check:'native_store_failure_localized',passed:true});
      } finally { await pool.query('ALTER FUNCTION open_ena_login_failure_guard_test_unavailable(text,text,integer,integer,integer) RENAME TO open_ena_login_failure_guard'); }

      for (const [kind, status] of [['origin',403],['invalid',400],['too-large',413]] as const) {
        if(kind!=='origin') await page.route('**/api/open-ena/login',async(route:any)=>{
          const headers={...route.request().headers()};
          if(kind==='invalid')headers['content-type']='text/plain';
          const options:any={headers};
          if(kind==='too-large')options.postData='username='+credentials.username+'&password='+('x'.repeat(17000));
          await route.continue(options);
        });
        const rejected=await submit(page,locale,kind==='origin'?runtime.baseUrl.replace('127.0.0.1','localhost'):runtime.baseUrl); assert.equal(rejected.status(),status);
        await page.getByRole('alert').waitFor({state:'visible'});
        const expected=kind==='origin'?copy.requestRejected:kind==='invalid'?copy.requestInvalid:copy.requestTooLarge;
        assert.equal(await page.getByRole('alert').textContent(),expected);
        assert.equal(await page.getByRole('link',{name:copy.returnToSignIn}).getAttribute('href'),'/'+locale+'/open-ena');
        assert.equal(rejected.headers()['cache-control'],'no-store');
        await page.unroute('**/api/open-ena/login');
        results.push({locale,check:'native_rejection_'+status,passed:true});
      }
      const success=await submit(page,locale);assert.equal(success.status(),303);
      await page.locator('.open-ena-workbench').waitFor({state:'visible'});
      await pool.query('ALTER FUNCTION open_ena_revoke_session(text,bigint) RENAME TO open_ena_revoke_session_test_unavailable');
      try {
        await page.getByRole('button',{name:copy.signOut,exact:true}).click();
        await page.locator('p.open-ena-login-error[role="alert"]').waitFor({state:'visible'});
        assert.equal(await page.locator('p.open-ena-login-error[role="alert"]').textContent(),copy.logoutUnavailable);
        assert.equal(new URL(page.url()).searchParams.get('auth'),'logout-unavailable');
        assert.equal(await page.locator('.open-ena-workbench').count(),1);
        results.push({locale,check:'native_logout_failure_has_distinct_notice',passed:true});
      } finally { await pool.query('ALTER FUNCTION open_ena_revoke_session_test_unavailable(text,bigint) RENAME TO open_ena_revoke_session'); }
      await page.getByRole('button',{name:copy.signOut,exact:true}).click();
      await page.locator('.open-ena-login-form').waitFor({state:'visible'});
      results.push({locale,check:'recovered_login_logout',passed:true});
    } finally { await context.close(); }
  }
} catch(error) { failure=error; console.error(redact(error instanceof Error?error.stack:String(error))); }
finally {
  if(pool)await pool.end();
  if(runtime)await runtime.close(failure);
  writeFileSync(join(directory,'independent-checks.json'),JSON.stringify({passed:!failure,checks:results,error:failure?redact(String(failure)):null},null,2)+'\n');
}
if(failure)process.exitCode=1;else console.log(JSON.stringify({passed:true,checks:results.length}));
