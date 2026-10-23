import { createOpenEnaProjectHandler } from "@/lib/server/open-ena-project-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createOpenEnaProjectHandler();
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).projectId); }
export async function PUT(request: Request, context: Context) { return handle(request, (await context.params).projectId); }
export async function PATCH(request: Request, context: Context) { return handle(request, (await context.params).projectId); }
export async function DELETE(request: Request, context: Context) { return handle(request, (await context.params).projectId); }
