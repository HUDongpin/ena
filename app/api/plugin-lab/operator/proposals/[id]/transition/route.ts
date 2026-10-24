import { createPluginLabWorkflowOperatorTransitionHandler } from "@/lib/server/plugin-lab-workflow-operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createPluginLabWorkflowOperatorTransitionHandler();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(request, (await context.params).id);
}
