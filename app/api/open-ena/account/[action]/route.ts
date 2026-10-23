import { createOpenEnaAccountPostHandler, type OpenEnaAccountAction } from "@/lib/server/open-ena-account-routes";
import { openEnaCloudJson } from "@/lib/server/open-ena-cloud-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!["register", "forgot-password", "verify", "reset-password"].includes(action)) return openEnaCloudJson({ error: "not-found" }, 404);
  return createOpenEnaAccountPostHandler(action as OpenEnaAccountAction)(request);
}
