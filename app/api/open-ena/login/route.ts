import { NextRequest } from "next/server";
import { createOpenEnaLoginPostHandler } from "@/lib/server/open-ena-login-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productionPostHandler = createOpenEnaLoginPostHandler();

export async function POST(request: NextRequest) {
  return productionPostHandler(request);
}
