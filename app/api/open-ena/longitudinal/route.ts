import { handleOpenEnaLongitudinalPostV3 } from "@/lib/server/open-ena-longitudinal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleOpenEnaLongitudinalPostV3(request);
}
