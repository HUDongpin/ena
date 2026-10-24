import { createPluginLabReplyHandler } from "@/lib/server/plugin-lab-owned-proposal-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createPluginLabReplyHandler();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return handler(request, (await context.params).id); }
