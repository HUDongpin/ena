"use client";

import { useEffect, useState } from "react";
import type { BoundResultV3 } from "@/lib/open-ena/model-v3/types";
import type { EndpointMeansFrame2D } from "@/lib/open-ena/endpoint-means-frame-2d-compute";
import { prepareEndpointMeansFrame2DV3, supportsEndpointMeansFrame2D } from "@/lib/open-ena/endpoint-means-frame-2d-v3";
import { requestEndpointMeansFrame2D } from "@/lib/open-ena/endpoint-means-frame-2d-client";

export function useEndpointMeansFrame2D(result: BoundResultV3 | null, plan: unknown, current: boolean, view: "2d" | "3d") {
  const eligible = view === "2d" && supportsEndpointMeansFrame2D(result);
  const key = result ? `${result.binding.scientificResultSha256}:${result.binding.executionPlanSha256}:${result.createdAt}` : "";
  const [completed, setCompleted] = useState<{ key: string; frame: EndpointMeansFrame2D | null; message?: string } | null>(null);
  useEffect(() => {
    if (!eligible || !current || !result || !plan || completed?.key === key) return;
    const controller = new AbortController();
    void prepareEndpointMeansFrame2DV3(result, plan).then(input => requestEndpointMeansFrame2D(input, controller.signal)).then(frame => {
      if (!controller.signal.aborted) setCompleted({ key, frame });
    }).catch(error => {
      if (!controller.signal.aborted) setCompleted({ key, frame: null, message: error instanceof Error ? error.message : "2D frame unavailable." });
    });
    return () => controller.abort();
  }, [eligible, current, result, plan, key, completed?.key]);
  const matching = eligible && completed?.key === key ? completed : null;
  return {
    status: !eligible ? "not-applicable" as const : matching ? matching.frame ? "ready" as const : "unavailable" as const : current ? "pending" as const : "unavailable" as const,
    // An admitted historical plot keeps its completed frame after draft edits.
    frame: matching?.frame ?? null,
    message: matching?.message,
  };
}
