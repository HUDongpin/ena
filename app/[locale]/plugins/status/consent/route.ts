import { createPluginLabPublicConsentPostHandler } from "@/lib/server/plugin-lab-public-consent-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createPluginLabPublicConsentPostHandler();
