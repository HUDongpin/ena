import { createOpenEnaProjectHandler } from "@/lib/server/open-ena-project-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createOpenEnaProjectHandler();
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
