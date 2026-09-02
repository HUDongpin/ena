import { createPluginLabProposalPostHandler } from "@/lib/server/plugin-lab-proposal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createPluginLabProposalPostHandler();
