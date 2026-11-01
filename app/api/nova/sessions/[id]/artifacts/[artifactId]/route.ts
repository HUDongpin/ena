import { createNovaApiHandler } from "@/lib/nova/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createNovaApiHandler("artifact");
export async function GET(request: Request, context: { params: Promise<{ id: string; artifactId: string }> }) { return handle(request, await context.params); }
