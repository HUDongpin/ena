import { createPluginLabSessionHandler } from "@/lib/server/plugin-lab-email-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createPluginLabSessionHandler();
export const GET = handler;
export const DELETE = handler;
