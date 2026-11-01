#!/usr/bin/env -S node --import tsx
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createProductionNovaStore } from '../lib/nova/store';
import { novaSandboxConfigured } from '../lib/nova/sandbox';
import { runNovaClaim } from '../lib/nova/runner';
import { deliverNovaNotifications } from '../lib/nova/notifications';

class NovaWorkerConfigurationError extends Error {}

/** Dedicated Linux worker entry point. It is intentionally separate from the web server. */
export async function startNovaWorker(options:{once?:boolean;signal?:AbortSignal}={}):Promise<void> {
  if(process.env.ENA_NOVA_ENABLED!=='true'||process.env.ENA_NOVA_WORKER_ENABLED!=='true')throw new NovaWorkerConfigurationError('Set ENA_NOVA_ENABLED and ENA_NOVA_WORKER_ENABLED to true on the dedicated worker.');
  if(!novaSandboxConfigured())throw new NovaWorkerConfigurationError('Configure an immutable ENA_NOVA_SANDBOX_IMAGE and secure ENA_NOVA_SANDBOX_RUNTIME before starting the worker.');
  const store=await createProductionNovaStore();
  if(!store)throw new NovaWorkerConfigurationError('Nova durable database/encryption configuration is unavailable.');
  let notificationWork:Promise<unknown>|undefined;
  const drain=()=>{
    if(notificationWork||options.signal?.aborted)return;
    notificationWork=deliverNovaNotifications(store).catch(()=>{process.stderr.write('[nova-worker] Expert notification delivery is unavailable; the outbox will retry.\n');}).finally(()=>{notificationWork=undefined;});
  };
  const timer=setInterval(drain,30_000);
  try {
    drain();
    do {
      if(options.signal?.aborted)break;
      try {
        const claim=await store.claimNextRun();
        if(claim)await runNovaClaim(claim,store,{signal:options.signal});
        else if(!options.once)await delay(2000,undefined,{signal:options.signal}).catch(()=>undefined);
      }catch{
        process.stderr.write('[nova-worker] Durable queue is unavailable; retrying.\n');
        if(!options.once)await delay(5000,undefined,{signal:options.signal}).catch(()=>undefined);
      }
    }while(!options.once&&!options.signal?.aborted);
  }finally{clearInterval(timer);await notificationWork;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const controller=new AbortController();
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>controller.abort());
  startNovaWorker({once:process.argv.includes('--once'),signal:controller.signal}).then(()=>process.exit(0)).catch(error=>{
    // Startup errors are fixed configuration messages, never provider responses or connection strings.
    process.stderr.write(`${error instanceof NovaWorkerConfigurationError?error.message:'Nova worker startup failed; verify the durable store and worker configuration.'}\n`);process.exit(1);
  });
}
