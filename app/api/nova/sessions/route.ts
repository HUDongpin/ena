import { createNovaApiHandler } from "@/lib/nova/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createNovaApiHandler("sessions");
export function GET(request: Request) { return handle(request); }
export function POST(request: Request) { return handle(request); }
