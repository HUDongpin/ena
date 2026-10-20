import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupOwnedEphemeralPostgres } from './support/owned-ephemeral-postgres.mjs';
import { createOpenEnaLoginPostHandler } from '../lib/server/open-ena-login-route.ts';
import { openEnaDisposableUsernameRef } from '../lib/open-ena-auth.ts';
import { runOpenEnaProductionAuthOperator } from '../scripts/run-open-ena-production-auth-operator.mjs';
import { createPostgresOpenEnaAuthSecurityStore } from '../lib/server/open-ena-auth-security-store.ts';
const here=fileURLToPath(new URL('../',import.meta.url));
const evidenceArgument=process.argv.indexOf('--evidence-dir');
const evidenceDirectory=resolve(evidenceArgument>=0?process.argv[evidenceArgument+1]:join(here,'output/postgres/migration-008-evidence'));mkdirSync(evidenceDirectory,{recursive:true});
const {Pool}=createRequire(join(here,'package.json'))('pg');
const prefix='ena-r6-auth-'; const rootDirectory=mkdtempSync(join(tmpdir(),prefix)); const dataDirectory=join(rootDirectory,'data');
const receipt:any={batch:'round6-candidate',startedAt:new Date().toISOString(),inputs:{},checks:[]};
let pool:any,startAttempted=false,assertions=0;
function equal(a:any,b:any,message?:string){assert.deepEqual(a,b,message);assertions++;}
async function check(name:string,action:()=>Promise<any>){try{receipt.checks.push({name,status:'PASS',detail:await action()});console.log('PASS',name);}catch(error:any){receipt.checks.push({name,status:'FAIL',message:error.message,actual:error.actual,expected:error.expected});console.log('FAIL',name,error.message);}}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const password='synthetic-auth-property-password';const salt=Buffer.alloc(16,0x36);const hash=scryptSync(password,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});
function refs(name:string){const suffix=createHash('sha256').update(name).digest('base64url');return {usernameRef:suffix,principalRef:`d_${suffix}`};}
async function seed(name:string,lifetimeSeconds=30){const ref=refs(name);await pool.query('INSERT INTO open_ena_disposable_accounts(username_ref,password_salt,password_hash,principal_ref,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+make_interval(secs=>$5))',[ref.usernameRef,salt,hash,ref.principalRef,lifetimeSeconds]);return ref;}
async function blockedConsume(ref:any,action:(holder:any,backend:number)=>Promise<void>, consume?:(store:any)=>Promise<any>){
 const holder=await pool.connect(), waiter=await pool.connect();let pending:any;
 try{
  await holder.query('BEGIN');await holder.query('SELECT username_ref FROM open_ena_disposable_accounts WHERE username_ref=$1 FOR UPDATE',[ref.usernameRef]);
  const backend=(await waiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const store=createPostgresOpenEnaAuthSecurityStore((sql,params)=>waiter.query(sql,params));
  pending=consume?consume(store):store.consumeDisposableCredential({usernameRef:ref.usernameRef,password});
  let waiting=false;for(let i=0;i<100;i++){const row=(await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[backend])).rows[0];if(row?.wait_event_type==='Lock'){waiting=true;break;}await delay(10);}
  equal(waiting,true,'waiter reached the real SQL row lock before release');await action(holder,backend);await holder.query('COMMIT');return await pending;
 }finally{await holder.query('ROLLBACK').catch(()=>{});if(pending)await pending.catch(()=>{});holder.release();waiter.release();}
}
const signature = 'public.open_ena_consume_disposable_account(text,bytea)';
async function definition() { return (await pool.query('SELECT pg_get_functiondef($1::regprocedure) AS value',[signature])).rows[0].value; }
async function metadata() {
 return (await pool.query(`SELECT p.oid,p.proowner::regrole::text AS owner,p.proacl::text AS acl,p.prosecdef,p.proisstrict,p.provolatile,p.proparallel,p.procost,p.proconfig,
 pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result,
 has_function_privilege('consume_app',p.oid,'EXECUTE') AS app_execute,has_function_privilege('consume_outsider',p.oid,'EXECUTE') AS outsider_execute
 FROM pg_proc p WHERE p.oid=$1::regprocedure`,[signature])).rows[0];
}
async function accountRows() { return (await pool.query('SELECT to_jsonb(a) AS value FROM open_ena_disposable_accounts a ORDER BY username_ref')).rows; }
async function tableMetadata() { return (await pool.query(`SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'notnull',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.open_ena_disposable_accounts'::regclass AND attnum>0 AND NOT attisdropped),
 'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.open_ena_disposable_accounts'::regclass),
 'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='open_ena_disposable_accounts'),
 'owner',relowner::regrole::text,'acl',relacl::text) AS value FROM pg_class WHERE oid='public.open_ena_disposable_accounts'::regclass`)).rows[0].value; }
try{
 execFileSync('initdb',['--pgdata',dataDirectory,'--auth','trust','--username','postgres','--encoding','UTF8','--no-locale'],{stdio:'pipe',timeout:60000});
 const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=(server.address() as any).port;server.close((error)=>error?reject(error):resolve(port));});});
 startAttempted=true;execFileSync('pg_ctl',['--pgdata',dataDirectory,'--log',join(rootDirectory,'postgres.log'),'--options',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,'--wait','start'],{stdio:'pipe',timeout:60000});
 pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:8,statement_timeout:5000});
 receipt.postgresVersion=(await pool.query('SHOW server_version')).rows[0].server_version;
 for(const name of ['001_open_ena_billable.sql','002_open_ena_auth_security.sql','003_open_ena_ai_consent.sql','004_open_ena_disposable_accounts.sql']){const source=readFileSync(join(here,'migrations',name),'utf8');receipt.inputs[name]=createHash('sha256').update(source).digest('hex');await pool.query(source);}
 const migrationName='008_open_ena_disposable_expiry_after_lock.sql';
 const upgrade=readFileSync(join(here,'migrations',migrationName),'utf8');
 const legacy=readFileSync(join(here,'migrations/004_open_ena_disposable_accounts.sql'),'utf8');
 receipt.inputs[migrationName]=createHash('sha256').update(upgrade).digest('hex');
 await pool.query(`CREATE ROLE consume_owner NOLOGIN;CREATE ROLE consume_app NOLOGIN;CREATE ROLE consume_outsider NOLOGIN;
   GRANT USAGE,CREATE ON SCHEMA public TO consume_owner;GRANT USAGE ON SCHEMA public TO consume_app,consume_outsider;
   ALTER TABLE public.open_ena_disposable_accounts OWNER TO consume_owner;
   ALTER FUNCTION ${signature} OWNER TO consume_owner;
   REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;GRANT EXECUTE ON FUNCTION ${signature} TO consume_app;
   ALTER FUNCTION ${signature} STRICT SECURITY DEFINER VOLATILE PARALLEL RESTRICTED COST 175;
   ALTER FUNCTION ${signature} SET search_path TO public,pg_temp;
   ALTER FUNCTION ${signature} SET statement_timeout TO '2500ms';`);
 for(const state of ['valid','consumed','disabled','expired']){
   const ref=refs(`existing-${state}`);
   await pool.query(`INSERT INTO open_ena_disposable_accounts(username_ref,password_salt,password_hash,principal_ref,created_at,expires_at,consumed_at,disabled_at)
     VALUES($1,$2,$3,$4,clock_timestamp()-interval '20 seconds',clock_timestamp()+make_interval(secs=>$5),
       CASE WHEN $6='consumed' THEN clock_timestamp()-interval '10 seconds' ELSE NULL END,
       CASE WHEN $6='disabled' THEN clock_timestamp()-interval '10 seconds' ELSE NULL END)`,[ref.usernameRef,salt,hash,ref.principalRef,state==='expired'?-5:120,state]);
 }
 const originalDefinition=await definition();
 const originalMetadata=await metadata(), originalRows=await accountRows(), originalTable=await tableMetadata();
 await check('migration 008 is atomic and rollback preserves the complete legacy definition and rows',async()=>{
   const client=await pool.connect();try{await client.query('BEGIN');await client.query(upgrade);await client.query('ROLLBACK');}finally{await client.query('ROLLBACK');client.release();}
   equal(await definition(),originalDefinition);equal(await metadata(),originalMetadata);equal(await accountRows(),originalRows);
 });
 await check('old 004 upgrades without changing function identity attributes account data or schema',async()=>{
   execFileSync('psql',['--no-psqlrc','--host','127.0.0.1','--port',String(port),'--username','postgres','--dbname','postgres','--set','ON_ERROR_STOP=1','--file',join(here,'migrations',migrationName)],{stdio:'pipe',timeout:60000});
   equal(await metadata(),originalMetadata);equal(await accountRows(),originalRows);equal(await tableMetadata(),originalTable);
   equal((await pool.query('SELECT md5(prosrc) AS value FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows[0].value,'97c3f483614a4649fcdfd099ad3d7176');
   return {preserved:originalMetadata,existingStates:4};
 });
 const fixedDefinition=await definition();
 await check('repeated migration is an exact no-op',async()=>{await pool.query(upgrade);equal(await definition(),fixedDefinition);equal(await metadata(),originalMetadata);equal(await accountRows(),originalRows);});
 await check('unknown function bodies reject without replacement',async()=>{
   const client=await pool.connect();try{await client.query('BEGIN');const changed=fixedDefinition.replace('v_now := clock_timestamp();',"v_now := clock_timestamp() - interval '1 second';");await client.query(changed);
     await assert.rejects(client.query(upgrade),(error:any)=>{equal(error.code,'55000');return true;});
   }finally{await client.query('ROLLBACK');client.release();}
   equal(await definition(),fixedDefinition);equal(await accountRows(),originalRows);
 });
 await check('missing function rejects instead of creating an unintended contract',async()=>{
   const client=await pool.connect();try{await client.query('BEGIN');await client.query('CREATE SCHEMA missing_contract;SET LOCAL search_path TO missing_contract,pg_catalog');
     await assert.rejects(client.query(upgrade),(error:any)=>{equal(error.code,'55000');return true;});
   }finally{await client.query('ROLLBACK');client.release();}
   equal(await definition(),fixedDefinition);
 });
 await check('custom schema and CRLF legacy source upgrade and repeat without touching public definition',async()=>{
   const client=await pool.connect();try{await client.query('BEGIN');await client.query('CREATE SCHEMA custom_auth;SET LOCAL search_path TO custom_auth,pg_catalog');await client.query(legacy.replaceAll('\n','\r\n'));
     const customSignature='custom_auth.open_ena_consume_disposable_account(text,bytea)';
     const before=(await client.query('SELECT oid,proowner,proacl,proconfig FROM pg_proc WHERE oid=$1::regprocedure',[customSignature])).rows[0];
     await client.query(upgrade);await client.query(upgrade);
     equal((await client.query('SELECT oid,proowner,proacl,proconfig FROM pg_proc WHERE oid=$1::regprocedure',[customSignature])).rows[0],before);
     equal((await client.query("SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10))) AS value FROM pg_proc WHERE oid=$1::regprocedure",[customSignature])).rows[0].value,'97c3f483614a4649fcdfd099ad3d7176');
   }finally{await client.query('ROLLBACK');client.release();}
   equal(await definition(),fixedDefinition);
 });
 await check('function execution privileges remain granted only to the synthetic app role',async()=>{
   const client=await pool.connect();try{await client.query('SET ROLE consume_app');const ref=refs('existing-valid');equal((await client.query('SELECT public.open_ena_consume_disposable_account($1,$2) AS value',[ref.usernameRef,hash])).rows[0].value,ref.principalRef);
     await client.query('RESET ROLE');await client.query('SET ROLE consume_outsider');await assert.rejects(client.query('SELECT public.open_ena_consume_disposable_account($1,$2)',[ref.usernameRef,hash]),(error:any)=>{equal(error.code,'42501');return true;});
   }finally{await client.query('RESET ROLE');client.release();}
 });
 const operatorEnvironment={OPEN_ENA_AUTH_DATABASE_URL:'postgresql://synthetic.invalid/owned',OPEN_ENA_BILLABLE_DATABASE_URL:'postgresql://synthetic.invalid/owned'};
 const operatorOn=async(target:any)=>runOpenEnaProductionAuthOperator({mode:'migration',environment:operatorEnvironment,migrationSql:legacy,expiryMigrationSql:upgrade,dependencies:{databaseFactory:async()=>{const client=await target.connect();return {query:(sql:string,params?:unknown[])=>client.query(sql,params),close:async()=>client.release()};},fetch:async()=>{throw new Error('No HTTP in owned migration test');},randomBytes:()=>{throw new Error('No credentials in migration mode');}}});
 await check('real operator upgrades existing database without resetting fixed body owner grants or settings',async()=>{
   const before=await metadata(),rows=await accountRows();const result=await operatorOn(pool);equal(result.status,'PASS');equal(result.migration.files.map((f:any)=>f.applied),[false,true]);equal(result.migration.applied,false);equal(await definition(),fixedDefinition);equal(await metadata(),before);equal(await accountRows(),rows);return {appliedFiles:result.migration.files};
 });
 await check('real operator upgrades a legacy body while preserving operator-owned function attributes',async()=>{
   await pool.query(originalDefinition);const before=await metadata(),rows=await accountRows();
   const result=await operatorOn(pool);equal(result.migration.files.map((f:any)=>f.applied),[false,true]);equal(result.migration.applied,false);equal(await definition(),fixedDefinition);equal(await metadata(),before);equal(await accountRows(),rows);
 });
 await check('real operator refuses an unknown body and leaves its definition metadata and rows unchanged',async()=>{
   const changed=fixedDefinition.replace('v_now := clock_timestamp();',"v_now := clock_timestamp() - interval '1 second';");await pool.query(changed);
   const before=await definition(),meta=await metadata(),rows=await accountRows();
   try{await assert.rejects(operatorOn(pool),(error:any)=>{equal(error.code,'DATABASE_MIGRATION_FAILED');return true;});equal(await definition(),before);equal(await metadata(),meta);equal(await accountRows(),rows);}
   finally{await pool.query(fixedDefinition);}
 });
 await check('real proof mode refuses the old function before provisioning any synthetic account',async()=>{
   await pool.query(originalDefinition);const rows=await accountRows();let inserts=0;
   try{await assert.rejects(runOpenEnaProductionAuthOperator({mode:'proof',environment:{...operatorEnvironment,OPEN_ENA_PUBLIC_ORIGIN:'https://review.invalid',OPEN_ENA_SESSION_SECRET:'synthetic-proof-secret-xxxxxxxxxxxxxxxx',OPEN_ENA_USERNAME:'synthetic-static-user',OPEN_ENA_PASSWORD:'synthetic-static-password'},expectedFinalGitSha:'a'.repeat(40),deploymentId:'dpl_syntheticOwnedMigration',dependencies:{databaseFactory:async()=>{const client=await pool.connect();return {query:(sql:string,params?:unknown[])=>{if(/INSERT INTO open_ena_disposable_accounts/.test(sql))inserts++;return client.query(sql,params);},close:async()=>client.release()};},fetch:async()=>new Response('owned ready',{status:200})}}),(error:any)=>{equal(error.code,'MIGRATION_POSTCONDITION_FAILED');return true;});equal(inserts,0);equal(await accountRows(),rows);}
   finally{await pool.query(fixedDefinition);}
 });
 await check('real operator fresh installation applies 004 then 008 and verifies the fixed SQL body',async()=>{
   await pool.query('CREATE DATABASE auth_operator_fresh');const fresh=new Pool({host:'127.0.0.1',port,user:'postgres',database:'auth_operator_fresh',max:2,statement_timeout:5000});
   try{for(const name of ['001_open_ena_billable.sql','002_open_ena_auth_security.sql','003_open_ena_ai_consent.sql'])await fresh.query(readFileSync(join(here,'migrations',name),'utf8'));
     const result=await operatorOn(fresh);equal(result.status,'PASS');equal(result.migration.files.map((f:any)=>f.applied),[true,true]);equal(result.migration.postconditions.migration_008_function_contract,true);
     equal((await fresh.query('SELECT md5(prosrc) AS value FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows[0].value,'97c3f483614a4649fcdfd099ad3d7176');
     const repeat=await operatorOn(fresh);equal(repeat.migration.files.map((f:any)=>f.applied),[false,true]);
   }finally{await fresh.end();}
 });

 const store=createPostgresOpenEnaAuthSecurityStore((sql,params)=>pool.query(sql,params));
 await check('a disposable credential expiring while the real consume waits for its row lock is rejected',async()=>{
  const ref=await seed('lock-expiry',1.5);let stateAtRelease:any;
  const result=await blockedConsume(ref,async()=>{for(let i=0;i<200;i++){stateAtRelease=(await pool.query('SELECT expires_at < clock_timestamp() AS expired, extract(epoch from clock_timestamp()-expires_at)::double precision AS seconds_past_expiry FROM open_ena_disposable_accounts WHERE username_ref=$1',[ref.usernameRef])).rows[0];if(stateAtRelease.expired)break;await delay(10);}equal(stateAtRelease.expired,true);});
  const state=(await pool.query('SELECT consumed_at IS NOT NULL AS consumed, consumed_at > expires_at AS consumed_after_expiry, expires_at < clock_timestamp() AS expired FROM open_ena_disposable_accounts WHERE username_ref=$1',[ref.usernameRef])).rows[0];
  receipt.expiryRace={stateAtRelease,resultWasPrincipal:result===ref.principalRef,state};
  equal(result,null,'expired credential must not establish a principal after a lock wait');equal(state.consumed,false);return receipt.expiryRace;
 });
 await check('actual login waiting across disposable expiry emits no session cookie and leaves the account unused',async()=>{
   const environment={OPEN_ENA_PUBLIC_ORIGIN:'https://review.invalid',OPEN_ENA_USERNAME:'synthetic-static-user',OPEN_ENA_PASSWORD:'synthetic-static-password',OPEN_ENA_SESSION_SECRET:'synthetic-login-secret-xxxxxxxxxxxxxxxx',OPEN_ENA_ACCOUNT_ID:'synthetic-account',OPEN_ENA_AUTH_DATABASE_URL:'postgresql://synthetic.invalid/owned'};
   const username='synthetic-expiring-login-user';const ref={usernameRef:openEnaDisposableUsernameRef(username,environment)!,principalRef:refs('login-expiry').principalRef};
   await pool.query("INSERT INTO open_ena_disposable_accounts(username_ref,password_salt,password_hash,principal_ref,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '1.5 seconds')",[ref.usernameRef,salt,hash,ref.principalRef]);
   const result=await blockedConsume(ref,async()=>{let expired=false;for(let i=0;i<200;i++){expired=(await pool.query('SELECT expires_at < clock_timestamp() AS expired FROM open_ena_disposable_accounts WHERE username_ref=$1',[ref.usernameRef])).rows[0].expired;if(expired)break;await delay(10);}equal(expired,true);},async(store)=>createOpenEnaLoginPostHandler({environment,securityStoreFactory:async()=>store})(new Request('https://review.invalid/api/open-ena/login',{method:'POST',headers:{origin:'https://review.invalid','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({locale:'en',username,password})})));
   equal(result.status,303);equal(result.headers.get('set-cookie'),null);equal(new URL(result.headers.get('location')).searchParams.get('auth'),'invalid');equal((await pool.query('SELECT consumed_at IS NULL AS unused FROM open_ena_disposable_accounts WHERE username_ref=$1',[ref.usernameRef])).rows[0].unused,true);
 });
 await check('a still-valid locked credential is consumed exactly once',async()=>{const ref=await seed('lock-valid');equal(await blockedConsume(ref,async()=>{}),ref.principalRef);equal(await store.consumeDisposableCredential({usernameRef:ref.usernameRef,password}),null);return {accepted:1,replay:null};});
 await check('disabling a locked credential before release rejects the waiting consumer',async()=>{const ref=await seed('lock-disable');equal(await blockedConsume(ref,async(holder)=>{await holder.query('UPDATE open_ena_disposable_accounts SET disabled_at=clock_timestamp() WHERE username_ref=$1',[ref.usernameRef]);}),null);return {accepted:0};});
 await check('twelve concurrent correct passwords consume a disposable credential once',async()=>{const ref=await seed('concurrent');const results=await Promise.all(Array.from({length:12},()=>store.consumeDisposableCredential({usernameRef:ref.usernameRef,password})));equal(results.filter(x=>x===ref.principalRef).length,1);equal(results.filter(x=>x===null).length,11);return {attempts:12,accepted:1};});
 await check('wrong passwords do not consume valid or nonexistent credentials',async()=>{const ref=await seed('wrong-password');equal(await store.consumeDisposableCredential({usernameRef:ref.usernameRef,password:'synthetic-wrong'}),null);equal(await store.consumeDisposableCredential({usernameRef:refs('missing').usernameRef,password}),null);equal(await store.consumeDisposableCredential({usernameRef:ref.usernameRef,password}),ref.principalRef);return {wrongAccepted:0,eventualCorrect:1};});
 await check('shared durable login limits admit ten accounts attempts or five same-source attempts',async()=>{const run=async(account:string,distinct:boolean)=>Promise.all(Array.from({length:32},(_,i)=>store.consumeLoginAttempt({sourceRef:distinct?`source-${i}`:'single-source',accountRef:account,sourceLimit:5,accountLimit:10,windowSeconds:900})));equal((await run('multi-account',true)).filter(Boolean).length,10);equal((await run('single-account',false)).filter(Boolean).length,5);return {attemptsPerScenario:32,distinctAllowed:10,sameAllowed:5};});
 await check('concurrent session revocations preserve the longest expiry and stay effective',async()=>{const jti=randomUUID();const now=Math.floor(Date.now()/1000);equal(await store.isSessionRevoked(jti),false);await Promise.all(Array.from({length:20},(_,i)=>store.revokeSession(jti,now+100+i)));equal(await store.isSessionRevoked(jti),true);equal(Number((await pool.query('SELECT extract(epoch from expires_at)::bigint AS expiry FROM open_ena_revoked_sessions WHERE jti=$1',[jti])).rows[0].expiry),now+119);equal(await store.isSessionRevoked('invalid-jti'),true);return {revocations:20,longestExpiry:now+119};});
}catch(error:any){receipt.fatal={message:error.message,code:error.code};console.error(error);}finally{if(pool)await pool.end();try{receipt.cleanup={...await cleanupOwnedEphemeralPostgres({rootDirectory,dataDirectory,rootPrefix:prefix,startAttempted}),confirmed:true};}catch(error:any){receipt.cleanup={confirmed:false,message:error.message};}receipt.assertions=assertions;receipt.finishedAt=new Date().toISOString();receipt.exitCode=receipt.fatal||receipt.checks.some((x:any)=>x.status==='FAIL')||!receipt.cleanup.confirmed?1:0;writeFileSync(join(evidenceDirectory,'upgrade-evidence.json'),JSON.stringify(receipt,null,2)+'\n');console.log('RESULT',receipt.exitCode,'assertions',assertions,'checks',receipt.checks.length,'cleanup',receipt.cleanup.confirmed);process.exitCode=receipt.exitCode;}
