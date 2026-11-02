import { serveNovaFont } from "@/lib/nova/fonts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ style: string }> }) {
  const { style } = await params;
  return serveNovaFont(style);
}
