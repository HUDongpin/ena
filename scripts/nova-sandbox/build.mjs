#!/usr/bin/env node
// Build only trusted pinned dependencies in a minimal temporary context. No .env/research files enter Docker.
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const base=process.env.ENA_NOVA_NODE_IMAGE;
if(process.platform!=='linux'||process.arch!=='x64')throw new Error('Build the Nova sandbox on its dedicated Linux x64 worker after npm ci.');
if(!/^node:24\.15\.0-bookworm-slim@sha256:[a-f0-9]{64}$/.test(base??''))throw new Error('Set ENA_NOVA_NODE_IMAGE to the verified immutable official Node 24.15.0 Debian image.');
const pkg=JSON.parse(await readFile(join(root,'node_modules/esbuild/package.json'),'utf8'));
if(pkg.version!=='0.28.2')throw new Error('Nova sandbox build requires repository-pinned esbuild 0.28.2.');
const context=await mkdtemp(join(tmpdir(),'nova-image-'));
try{
  await mkdir(join(context,'esbuild'));
  await cp(join(root,'node_modules/esbuild/lib'),join(context,'esbuild/lib'),{recursive:true});
  await cp(join(root,'node_modules/esbuild/package.json'),join(context,'esbuild/package.json'));
  await cp(join(root,'node_modules/@esbuild/linux-x64/bin/esbuild'),join(context,'esbuild-bin'));
  for(const file of ['harness.mjs','execute.mjs','assertions.mjs','Dockerfile'])await cp(join(root,'scripts/nova-sandbox',file),join(context,file));
  await writeFile(join(context,'.dockerignore'),'image-id\n');
  const args=['build','--platform=linux/amd64','--build-arg',`NODE_IMAGE=${base}`,'--iidfile',join(context,'image-id'),context];
  const code=await new Promise((resolveCode,reject)=>{const child=spawn('docker',args,{stdio:'inherit',env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production'}});child.on('error',reject);child.on('close',resolveCode);});
  if(code!==0)throw new Error('Nova sandbox image build failed.');
  const image=(await readFile(join(context,'image-id'),'utf8')).trim();
  if(!/^sha256:[a-f0-9]{64}$/.test(image))throw new Error('Docker did not return an immutable image ID.');
  process.stdout.write(`ENA_NOVA_SANDBOX_IMAGE=${image}\n`);
}finally{await rm(context,{recursive:true,force:true});}
