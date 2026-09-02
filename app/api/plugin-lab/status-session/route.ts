import { createPluginLabStatusSessionPostHandler } from "@/lib/server/plugin-lab-status-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createPluginLabStatusSessionPostHandler();
