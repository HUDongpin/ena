import { createPluginLabRotateAccessPostHandler } from "@/lib/server/plugin-lab-operator-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createPluginLabRotateAccessPostHandler();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(request, (await context.params).id);
}
