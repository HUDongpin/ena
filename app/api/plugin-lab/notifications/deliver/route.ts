import { createPluginLabDeliveryHandler } from "@/lib/server/plugin-lab-delivery-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createPluginLabDeliveryHandler();
