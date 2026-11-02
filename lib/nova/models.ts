import type { NovaEffort, NovaModel, NovaModelKey, NovaProvider } from "./types";

type Environment = Readonly<Record<string, string | undefined>>;
type ModelDefinition = Omit<NovaModel, "available" | "unavailableReason">;
export const DEFAULT_NOVA_MODEL: NovaModelKey = "qwen-max";
export const DEFAULT_NOVA_EFFORT: NovaEffort = "medium";
export const NOVA_MODELS: readonly ModelDefinition[] = Object.freeze([
  Object.freeze({ key: "qwen-flash", provider: "qwen", label: "Qwen3.8 Flash", apiModel: "qwen3.8-flash", version: "Qwen3.8-Flash" }),
  Object.freeze({ key: "qwen-max", provider: "qwen", label: "Qwen3.8 Max 0902", apiModel: "qwen3.8-max-0902", version: "Qwen3.8-Max-0902" }),
  Object.freeze({ key: "deepseek-flash", provider: "deepseek", label: "DeepSeek V4.1 Flash 1017", apiModel: "deepseek-flash", version: "DeepSeek-V4.1-Flash-1017" }),
  Object.freeze({ key: "deepseek-pro", provider: "deepseek", label: "DeepSeek V4 Pro 0813", apiModel: "deepseek-v4-pro", version: "DeepSeek-V4-Pro-0813" }),
]);

export function isNovaModelKey(value: unknown): value is NovaModelKey { return NOVA_MODELS.some(model => model.key === value); }
export function isNovaEffort(value: unknown): value is NovaEffort { return value === "low" || value === "medium" || value === "high" || value === "xhigh"; }

/** Configuration only; not evidence that a model has passed a live regional capability probe. */
export function getNovaProviderConfig(provider: NovaProvider, environment: Environment = process.env): { apiKey: string; baseUrl: string } | null {
  const rawKey = provider === "qwen"
    ? environment.ENA_NOVA_QWEN_API_KEY ?? environment.OPEN_ENA_QWEN_API_KEY
    : environment.ENA_NOVA_DEEPSEEK_API_KEY ?? environment.DEEPSEEK_API_KEY;
  const apiKey = rawKey?.trim();
  if (!apiKey || apiKey.length > 512 || /[\u0000-\u0020\u007f]/u.test(apiKey)) return null;
  const input = provider === "qwen"
    ? environment.ENA_NOVA_QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    : environment.ENA_NOVA_DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port) return null;
    const pathname = url.pathname.replace(/\/+$/u, "");
    if (provider === "deepseek") {
      if (url.hostname !== "api.deepseek.com" || (pathname !== "" && pathname !== "/v1")) return null;
    } else {
      const official = ["dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "dashscope-us.aliyuncs.com"].includes(url.hostname)
        || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:cn-beijing|cn-hongkong|ap-southeast-1|us-east-1|eu-central-1|ap-northeast-1)\.maas\.aliyuncs\.com$/u.test(url.hostname);
      if (!official || pathname !== "/compatible-mode/v1") return null;
    }
    return { apiKey, baseUrl: `${url.origin}${pathname}` };
  } catch { return null; }
}

export function resolveNovaModel(key: NovaModelKey, environment: Environment = process.env): NovaModel {
  const definition = NOVA_MODELS.find(model => model.key === key);
  if (!definition) throw new TypeError("Unknown Nova model.");
  const prefix = `ENA_NOVA_${key.toUpperCase().replaceAll("-", "_")}`;
  const overrides = [environment[`${prefix}_MODEL`], environment[`${prefix}_LABEL`], environment[`${prefix}_VERSION`]];
  const hasOverride = overrides.some(value => value !== undefined);
  const validOverride = overrides.every(value => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120 && !/[\u0000-\u001f\u007f]/u.test(value))
    && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/u.test(overrides[0] ?? "");
  const model = hasOverride && validOverride ? { ...definition, apiModel: overrides[0]!.trim(), label: overrides[1]!.trim(), version: overrides[2]!.trim() } : definition;
  const unavailableReason = environment.ENA_NOVA_ENABLED !== "true" ? "nova-disabled"
    : hasOverride && !validOverride ? "model-configuration-incomplete"
    : !getNovaProviderConfig(model.provider, environment) ? "provider-not-configured" : undefined;
  return { ...model, available: unavailableReason === undefined, ...(unavailableReason ? { unavailableReason } : {}) };
}

export function getNovaModels(environment: Environment = process.env): NovaModel[] { return NOVA_MODELS.map(model => resolveNovaModel(model.key, environment)); }

const EFFORT = Object.freeze({
  low: Object.freeze({ thinkingBudget: 4096, deepseekEffort: "low" as const, maxRepairs: 1, maxSteps: 8, timeoutMs: 180_000 }),
  medium: Object.freeze({ thinkingBudget: 16384, deepseekEffort: "high" as const, maxRepairs: 2, maxSteps: 16, timeoutMs: 300_000 }),
  high: Object.freeze({ thinkingBudget: 65536, deepseekEffort: "high" as const, maxRepairs: 3, maxSteps: 24, timeoutMs: 450_000 }),
  xhigh: Object.freeze({ thinkingBudget: 262144, deepseekEffort: "max" as const, maxRepairs: 4, maxSteps: 32, timeoutMs: 600_000 }),
});
export function novaEffortPolicy(effort: NovaEffort) {
  if (!isNovaEffort(effort)) throw new TypeError("Unknown Nova effort.");
  return EFFORT[effort];
}
