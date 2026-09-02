import { createPluginLabConfirmEmailPostHandler } from "@/lib/server/plugin-lab-operator-route";

export const dynamic = "force-dynamic";
const handler = createPluginLabConfirmEmailPostHandler();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handler(request, id);
}
