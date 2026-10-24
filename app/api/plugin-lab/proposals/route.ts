import { createPluginLabOwnedProposalPostHandler, createPluginLabOwnedProposalListHandler } from "@/lib/server/plugin-lab-owned-proposal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createPluginLabOwnedProposalPostHandler();
export const GET = createPluginLabOwnedProposalListHandler();
