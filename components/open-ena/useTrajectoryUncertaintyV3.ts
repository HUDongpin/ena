"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoundStandardResultV3 } from "../../lib/open-ena/model-v3/types";
import { assertCurrentCapabilityV3 } from "../../lib/open-ena/inference-consumers-v3";
import { sha256TextV3 } from "../../lib/open-ena/model-v3/canonical-json";
import { buildTrajectoryUncertaintyPopulationV3, type TrajectoryDisplaySettingsV3, type TrajectoryUncertaintyDisplayV3 } from "../../lib/open-ena/trajectory-presentation-v3";
import { runTrajectoryUncertaintyV3 } from "../../lib/open-ena/trajectory-uncertainty-v3-client";
import type { TrajectoryUncertaintyResultV3 } from "../../lib/open-ena/trajectory-uncertainty-v3";

export function useTrajectoryUncertaintyV3(result: BoundStandardResultV3 | null, plan: unknown, current: boolean, settings: TrajectoryDisplaySettingsV3) {
  const population = useMemo(() => result ? buildTrajectoryUncertaintyPopulationV3(result, settings) : null,
    [result, settings.endpointsOnly, settings.hiddenUnitKeys, settings.groupSettingsByToken]);
  const populationKey = population?.populationKey ?? "";
  const enabled = settings.showConfidenceIntervals !== false && settings.showCentroidPaths;
  const latest = useRef({ result, plan, current, populationKey, enabled });
  latest.current = { result, plan, current, populationKey, enabled };
  const cache = useRef(new Map<string, { result: BoundStandardResultV3; plan: unknown; value: TrajectoryUncertaintyResultV3 }>());
  const [state, setState] = useState<TrajectoryUncertaintyDisplayV3>({ populationKey: "", status: "pending" });
  useEffect(() => {
    if (!result || !population || !enabled) return;
    if (!current || !plan) { setState({ populationKey, status: "unavailable" }); return; }
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && latest.current.result === result && latest.current.plan === plan
      && latest.current.current && latest.current.enabled && latest.current.populationKey === populationKey;
    const cached = cache.current.get(populationKey);
    if (cached?.result === result && cached.plan === plan) {
      setState({ populationKey, status: "ready", result: cached.value });
      return () => controller.abort();
    }
    setState({ populationKey, status: "pending" });
    void (async () => {
      try {
        const admitted = await assertCurrentCapabilityV3(result, plan, "trajectory-inference") as BoundStandardResultV3;
        if (!isCurrent()) return;
        const captured = buildTrajectoryUncertaintyPopulationV3(admitted, settings);
        if (captured.populationKey !== populationKey) throw new TypeError("Trajectory summary population changed during admission");
        const bindingKey = await sha256TextV3(populationKey);
        if (!isCurrent()) return;
        const value = await runTrajectoryUncertaintyV3({ bindingKey, axes: captured.axes, groups: captured.groups }, { signal: controller.signal, isCurrent });
        if (!isCurrent()) return;
        cache.current.set(populationKey, { result, plan, value });
        while (cache.current.size > 4) cache.current.delete(cache.current.keys().next().value!);
        setState({ populationKey, status: "ready", result: value });
      } catch {
        if (isCurrent()) setState({ populationKey, status: "unavailable" });
      }
    })();
    return () => controller.abort();
    // Display-only switches deliberately do not restart the resample plan.
    // populationKey includes every actual summary contributor and terminal-step policy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, plan, current, populationKey, enabled]);
  return !enabled ? { populationKey, status: "disabled" as const }
    : state.populationKey === populationKey && current ? state
      : { populationKey, status: current ? "pending" as const : "unavailable" as const };
}
