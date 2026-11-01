import { createNovaApiHandler } from "@/lib/nova/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createNovaApiHandler("messages");
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handle(request, await context.params); }
