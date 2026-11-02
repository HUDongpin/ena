import { createHash, timingSafeEqual } from "node:crypto";
import { sendNovaExpertNotificationEmail } from "@/lib/plugin-lab/mail";
import { workflowError, workflowJson } from "@/lib/server/plugin-lab-workflow-context";
import { createProductionNovaStore, type NovaStore } from "./store";
import type { PluginLabEnvironment } from "@/lib/plugin-lab/config";
import type { NovaDependencies } from "./server";

type Dependencies = NovaDependencies & {sendNotification?: (input: Parameters<typeof sendNovaExpertNotificationEmail>[0]) => Promise<void>};
export function createNovaDeliveryHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return workflowError("method-not-allowed", 405);
    const expected = environment.ENA_PLUGIN_LAB_WORKER_TOKEN, supplied = request.headers.get("authorization");
    if (!expected || expected.length < 32 || !supplied || supplied.length > 1024 || !timingSafeEqual(createHash("sha256").update(supplied).digest(),createHash("sha256").update(`Bearer ${expected}`).digest())) return workflowError("worker-required",401);
    try {
      const store = dependencies.novaStoreFactory ? await dependencies.novaStoreFactory() : await createProductionNovaStore(environment);
      if (!store) return workflowError("service-unavailable",503);
      return workflowJson(await deliverNovaNotifications(store,environment,dependencies));
    } catch { return workflowError("service-unavailable",503); }
  };
}

/** The dedicated worker and HTTP scheduler share the same leased outbox. */
export async function deliverNovaNotifications(store: NovaStore, environment: PluginLabEnvironment = process.env, dependencies: Pick<Dependencies,"now"|"sendNotification"> = {}) {
  // Existing SMTP transport enforces 15 seconds per send. Two sends fit a 60-second route.
  const jobs = await store.claimNotifications(2, dependencies.now?.() ?? new Date()); let sent = 0, failed = 0;
  for (const job of jobs) {
    let success = false;
    try { const input = {id:job.id, requestId:job.requestId, sessionId:job.sessionId,locale:job.locale}; await (dependencies.sendNotification ? dependencies.sendNotification(input) : sendNovaExpertNotificationEmail(input,environment)); success = true; } catch { /* Never disclose SMTP diagnostics. */ }
    const settled = await store.settleNotification({id:job.id,claimToken:job.claimToken,success,now:dependencies.now?.() ?? new Date()});
    if (success && settled) sent++; else failed++;
  }
  return {claimed:jobs.length,sent,failed};
}
