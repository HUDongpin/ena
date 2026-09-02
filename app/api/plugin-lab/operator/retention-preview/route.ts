import { createPluginLabRetentionPreviewPostHandler } from "@/lib/server/plugin-lab-operator-route";

export const dynamic = "force-dynamic";
const handler = createPluginLabRetentionPreviewPostHandler();

export async function POST(request: Request) {
  return handler(request);
}
