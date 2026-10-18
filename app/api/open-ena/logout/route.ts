import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { createOpenEnaLogoutPostHandler } from "@/lib/server/open-ena-logout-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const productionPostHandler = createOpenEnaLogoutPostHandler({
  revalidateOpenEnaWorkspace(locale) {
    revalidatePath(`/${locale}/open-ena`);
  },
});

export async function POST(request: NextRequest) {
  return productionPostHandler(request);
}
