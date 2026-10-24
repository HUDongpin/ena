import { createHash, timingSafeEqual } from "node:crypto";
import { decryptPluginLabText } from "@/lib/plugin-lab/crypto";
import { sendPluginLabNotificationEmail } from "@/lib/plugin-lab/mail";
import { normalizePluginLabEmail } from "@/lib/plugin-lab/workflow-security";
import { workflowContext, workflowError, workflowJson, type WorkflowDependencies } from "./plugin-lab-workflow-context";

type Dependencies = WorkflowDependencies & { sendNotification?: (input: Parameters<typeof sendPluginLabNotificationEmail>[0]) => Promise<void> };

export function createPluginLabDeliveryHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request): Promise<Response> => {
    const expected = environment.ENA_PLUGIN_LAB_WORKER_TOKEN;
    const supplied = request.headers.get("authorization");
    if (!expected || expected.length < 32 || !supplied || supplied.length > 1024
      || !timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(`Bearer ${expected}`).digest())) return workflowError("worker-required", 401);
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    try {
      // Two absolute 15s sends plus bounded DB statements fit the scheduler's
      // 55s deadline. Unclaimed work remains available to the next run.
      const jobs = await context.store.claimNotifications(2, context.now);
      let sent = 0; let failed = 0;
      for (const job of jobs) {
        let success = false;
        try {
          const email = normalizePluginLabEmail(decryptPluginLabText(job.recipientCipher, { v1: context.configuration.encryptionKey }, `notification-recipient:${job.id}`));
          if (!email) throw new Error("Invalid delivery recipient.");
          const input = { id: job.id, email, proposalId: job.proposalId, kind: job.kind, locale: job.locale, target: job.target };
          await (dependencies.sendNotification ? dependencies.sendNotification(input) : sendPluginLabNotificationEmail(input, environment));
          success = true;
        } catch { /* Record a generic code, never SMTP diagnostics or message text. */ }
        const settled = await context.store.settleNotification({ id: job.id, claimToken: job.claimToken, success, now: dependencies.now?.() ?? new Date(), ...(success ? {} : { errorCode: "delivery-failed" }) });
        if (success && settled) sent++; else failed++;
      }
      return workflowJson({ claimed: jobs.length, sent, failed });
    } catch { return workflowError("service-unavailable", 503); }
  };
}
