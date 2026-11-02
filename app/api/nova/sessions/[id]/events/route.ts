import { createNovaApiHandler } from "@/lib/nova/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createNovaApiHandler("events");
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return handle(request, await context.params); }
