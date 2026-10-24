import { createPluginLabEmailRequestHandler } from "@/lib/server/plugin-lab-email-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createPluginLabEmailRequestHandler();
