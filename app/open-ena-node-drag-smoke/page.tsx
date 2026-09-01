import { notFound } from "next/navigation";
import OpenEnaWorkspace from "@/components/open-ena/OpenEnaWorkspace";

export const dynamic = "force-dynamic";

export default function OpenEnaNodeDragSmokePage() {
  if (
    process.env.NODE_ENV !== "development"
    || process.env.OPEN_ENA_NODE_DRAG_SMOKE_ROUTE !== "1"
  ) {
    notFound();
  }

  return <OpenEnaWorkspace locale="en" />;
}
